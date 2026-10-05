const { collection } = require('../mongo');

const round2 = (n) => Math.round(n * 100) / 100;

async function getContent(eventId) {
    return (await collection('event_content')).findOne({ _id: eventId });
}

async function getRatings(eventIds) {
    if (!eventIds.length) return new Map();
    const docs = await (await collection('event_content'))
        .find({ _id: { $in: eventIds } }).project({ genre: 1, rating: 1 }).toArray();
    return new Map(docs.map((d) => [d._id, d]));
}

async function upsertContent(eventId, data) {
    const fields = ['artist', 'genre', 'description', 'tags', 'lineup', 'venueInfo', 'media'];
    const set = { updatedAt: new Date() };
    for (const f of fields) if (data[f] !== undefined) set[f] = data[f];
    const res = await (await collection('event_content')).updateOne(
        { _id: eventId },
        { $set: set, $setOnInsert: { rating: { avg: 0, count: 0 }, createdAt: new Date() } },
        { upsert: true }
    );
    return { created: res.upsertedCount > 0 };
}

async function deleteContent(eventId) {
    const del = await (await collection('event_content')).deleteOne({ _id: eventId });
    const reviews = await (await collection('reviews')).deleteMany({ eventId });
    return { content: del.deletedCount, reviews: reviews.deletedCount };
}

async function searchContent({ q, genre, tag, performer, minRating, maxAge, limit = 20 }) {
    const filter = {};
    if (q) filter.$text = { $search: q };
    if (genre) filter.genre = genre;
    if (tag) filter.tags = tag;
    if (performer) filter.lineup = { $elemMatch: { name: new RegExp(performer, 'i') } };
    if (minRating !== undefined) filter['rating.avg'] = { $gte: minRating };
    if (maxAge !== undefined) filter['venueInfo.ageLimit'] = { $lte: maxAge };

    const projection = { artist: 1, genre: 1, tags: 1, rating: 1, 'venueInfo.ageLimit': 1 };
    const cursor = (await collection('event_content')).find(filter);
    if (q) {
        projection.score = { $meta: 'textScore' };
        cursor.sort({ score: { $meta: 'textScore' } });
    } else {
        cursor.sort({ 'rating.avg': -1 });
    }
    return cursor.project(projection).limit(limit).toArray();
}

async function listReviews(eventId, { page = 1, limit = 10 }) {
    const col = await collection('reviews');
    const [items, total] = await Promise.all([
        col.find({ eventId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
        col.countDocuments({ eventId }),
    ]);
    return { total, page, limit, items };
}

async function recomputeRating(eventId) {
    const [agg] = await (await collection('reviews')).aggregate([
        { $match: { eventId } },
        { $group: { _id: '$eventId', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]).toArray();
    const rating = agg ? { avg: round2(agg.avg), count: agg.count } : { avg: 0, count: 0 };
    await (await collection('event_content')).updateOne({ _id: eventId }, { $set: { rating } });
    return rating;
}

async function addReview(eventId, userId, { rating, comment }) {
    const doc = { eventId, userId, rating, comment: comment || '', createdAt: new Date() };
    const res = await (await collection('reviews')).insertOne(doc);
    await recomputeRating(eventId);
    return { ...doc, _id: res.insertedId };
}

async function updateReview(eventId, userId, { rating, comment }) {
    const set = { updatedAt: new Date() };
    if (rating !== undefined) set.rating = rating;
    if (comment !== undefined) set.comment = comment;
    const res = await (await collection('reviews')).updateOne({ eventId, userId }, { $set: set });
    if (res.matchedCount) await recomputeRating(eventId);
    return res.matchedCount > 0;
}

async function deleteReview(eventId, userId) {
    const res = await (await collection('reviews')).deleteOne({ eventId, userId });
    if (res.deletedCount) await recomputeRating(eventId);
    return res.deletedCount > 0;
}

async function ratingDistribution(eventId) {
    const rows = await (await collection('reviews')).aggregate([
        { $match: { eventId } },
        { $group: { _id: '$rating', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
    ]).toArray();
    const byStar = Object.fromEntries(rows.map((r) => [r._id, r.count]));
    return [1, 2, 3, 4, 5].map((stars) => ({ stars, count: byStar[stars] || 0 }));
}

async function genreStats(minReviews = 5) {
    return (await collection('event_content')).aggregate([
        { $match: { 'rating.count': { $gte: minReviews } } },
        { $group: {
            _id: '$genre',
            events: { $sum: 1 },
            reviews: { $sum: '$rating.count' },
            avgRating: { $avg: '$rating.avg' },
            bestRating: { $max: '$rating.avg' },
        } },
        { $project: { _id: 0, genre: '$_id', events: 1, reviews: 1, bestRating: 1,
                      avgRating: { $round: ['$avgRating', 2] } } },
        { $sort: { avgRating: -1 } },
    ]).toArray();
}

async function topRated({ genre, minReviews = 10, limit = 10 }) {
    const match = { 'rating.count': { $gte: minReviews } };
    if (genre) match.genre = genre;
    return (await collection('event_content')).aggregate([
        { $match: match },
        { $sort: { 'rating.avg': -1, 'rating.count': -1 } },
        { $limit: limit },
        { $project: { eventId: '$_id', _id: 0, artist: 1, genre: 1, rating: 1 } },
    ]).toArray();
}

async function trending({ days = 7, limit = 10 }) {
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    return (await collection('activity_log')).aggregate([
        { $match: { type: 'view', at: { $gte: since } } },
        { $group: { _id: '$eventId', views: { $sum: 1 }, visitors: { $addToSet: '$userId' } } },
        { $project: { _id: 0, eventId: '$_id', views: 1, uniqueVisitors: { $size: '$visitors' } } },
        { $sort: { views: -1 } },
        { $limit: limit },
    ]).toArray();
}

function logActivity({ type, userId = null, eventId = null, meta = {} }) {
    collection('activity_log')
        .then((c) => c.insertOne({ type, userId, eventId, meta, at: new Date() }))
        .catch((err) => console.error('activity_log:', err.message));
}

module.exports = {
    getContent, getRatings, upsertContent, deleteContent, searchContent,
    listReviews, addReview, updateReview, deleteReview, recomputeRating,
    ratingDistribution, genreStats, topRated, trending, logActivity,
};
