const sql = require('./sql');
const content = require('./content');
const { HttpError } = require('../middleware/errors');

async function getFullEvent(eventId, viewerId = null) {
    const [event, categories, doc] = await Promise.all([
        sql.getEvent(eventId),
        sql.getCategories(eventId),
        content.getContent(eventId),
    ]);
    if (!event) throw new HttpError(404, 'Evenement introuvable');
    content.logActivity({ type: 'view', userId: viewerId, eventId });
    return { ...event, categories, content: doc };
}

async function listEventsWithRatings(params) {
    const result = await sql.listEvents(params);
    const ratings = await content.getRatings(result.items.map((e) => e.eventId));
    result.items = result.items.map((e) => ({ ...e, genre: ratings.get(e.eventId)?.genre, rating: ratings.get(e.eventId)?.rating }));
    return result;
}

async function getReviewsWithAuthors(eventId, paging) {
    const result = await content.listReviews(eventId, paging);
    const names = await sql.getUserNames([...new Set(result.items.map((r) => r.userId))]);
    result.items = result.items.map((r) => ({ ...r, author: names.get(r.userId) || 'Utilisateur supprime' }));
    return result;
}

async function getUserReviewsWithEvents(userId) {
    const reviews = await content.listUserReviews(userId);
    const rows = await sql.getEventsByIds([...new Set(reviews.map((r) => r.eventId))]);
    const byId = new Map(rows.map((e) => [e.eventId, e]));
    return reviews.map((r) => ({ ...r, artist: byId.get(r.eventId)?.artist || 'Evenement supprime', eventDate: byId.get(r.eventId)?.eventDate }));
}

async function postReview(eventId, userId, { rating, comment }) {
    if (!(await sql.getEvent(eventId))) throw new HttpError(404, 'Evenement introuvable');
    if (!(await sql.userHasTicketForEvent(userId, eventId))) {
        throw new HttpError(403, 'Il faut posseder un billet pour laisser un avis');
    }
    return content.addReview(eventId, userId, { rating, comment });
}

async function topEvents({ genre, minReviews, limit }) {
    const rated = await content.topRated({ genre, minReviews, limit });
    const rows = await sql.getEventsByIds(rated.map((r) => r.eventId));
    const byId = new Map(rows.map((e) => [e.eventId, e]));
    return rated
        .filter((r) => byId.has(r.eventId))
        .map((r) => {
            const e = byId.get(r.eventId);
            return { ...r, city: e.locationCity, eventDate: e.eventDate, ticketsSold: e.ticketsSold, revenue: e.revenue };
        });
}

async function trendingEvents(params) {
    const hot = await content.trending(params);
    const rows = await sql.getEventsByIds(hot.map((h) => h.eventId));
    const byId = new Map(rows.map((e) => [e.eventId, e]));
    return hot.filter((h) => byId.has(h.eventId)).map((h) => {
        const e = byId.get(h.eventId);
        return { ...h, artist: e.artist, city: e.locationCity, ticketsSold: e.ticketsSold };
    });
}

async function deleteEventEverywhere(eventId) {
    if (!(await sql.softDeleteEvent(eventId))) throw new HttpError(404, 'Evenement introuvable');
    return content.deleteContent(eventId);
}

module.exports = { listEventsWithRatings, getFullEvent, getReviewsWithAuthors, getUserReviewsWithEvents, postReview, topEvents, trendingEvents, deleteEventEverywhere };
