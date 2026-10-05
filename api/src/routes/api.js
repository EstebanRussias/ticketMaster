const express = require('express');
const bcrypt = require('bcryptjs');
const sql = require('../services/sql');
const content = require('../services/content');
const cross = require('../services/cross');
const v = require('../validate');
const { wrap, parseId, HttpError } = require('../middleware/errors');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const sessionUser = (u) => ({ id: u.id, name: u.name, lastName: u.lastName, role: u.role });
const paging = (q) => ({
    page: v.int(q.page ?? 1, 'page', { min: 1 }),
    limit: v.int(q.limit ?? 20, 'limit', { min: 1, max: 100 }),
});

router.post('/auth/register', wrap(async (req, res) => {
    const name = v.str(req.body.name, 'name', { max: 100 });
    const lastName = v.str(req.body.lastName, 'lastName', { max: 100 });
    const email = v.email(req.body.email);
    const password = v.str(req.body.password, 'password', { min: 8, max: 100 });
    const user = await sql.createUser({ name, lastName, email, passwordHash: await bcrypt.hash(password, 10) });
    req.session.user = sessionUser(user);
    res.status(201).json(req.session.user);
}));

router.post('/auth/login', wrap(async (req, res) => {
    const email = v.email(req.body.email);
    const user = await sql.findUserByEmail(email);
    if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password))) {
        throw new HttpError(401, 'Identifiants invalides');
    }
    req.session.user = sessionUser(user);
    res.json(req.session.user);
}));

router.post('/auth/logout', (req, res) => req.session.destroy(() => res.status(204).end()));

router.get('/me', requireAuth, wrap(async (req, res) => {
    const user = await sql.getUser(req.session.user.id);
    if (!user) throw new HttpError(404, 'Utilisateur introuvable');
    res.json(user);
}));

router.put('/me', requireAuth, wrap(async (req, res) => {
    const data = {
        name: v.optional(v.str, req.body.name, 'name', { max: 100 }),
        lastName: v.optional(v.str, req.body.lastName, 'lastName', { max: 100 }),
    };
    if (!(await sql.updateUser(req.session.user.id, data))) throw new HttpError(404, 'Utilisateur introuvable');
    res.json(await sql.getUser(req.session.user.id));
}));

router.delete('/me', requireAuth, wrap(async (req, res) => {
    await sql.softDeleteUser(req.session.user.id);
    req.session.destroy(() => res.status(204).end());
}));

router.get('/locations', wrap(async (req, res) => res.json(await sql.listLocations())));

router.post('/locations', requireAdmin, wrap(async (req, res) => {
    const loc = await sql.createLocation({
        name: v.str(req.body.name, 'name', { max: 150 }),
        adress: v.str(req.body.adress, 'adress'),
        city: v.str(req.body.city, 'city', { max: 100 }),
        nbQuantity: v.int(req.body.nbQuantity, 'nbQuantity'),
    });
    res.status(201).json(loc);
}));

router.get('/events', wrap(async (req, res) => {
    res.json(await sql.listEvents({
        q: req.query.q,
        city: req.query.city,
        upcoming: req.query.upcoming === 'true',
        sort: req.query.sort,
        ...paging(req.query),
    }));
}));

router.get('/events/:id', wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const event = await sql.getEvent(id);
    if (!event) throw new HttpError(404, 'Evenement introuvable');
    res.json({ ...event, categories: await sql.getCategories(id) });
}));

const parseCategories = (list) => {
    if (list === undefined) return [];
    if (!Array.isArray(list) || list.length > 10) throw v.bad('categories doit etre un tableau (10 max)');
    return list.map((c) => ({
        name: v.str(c.name, 'category.name', { max: 100 }),
        price: v.num(c.price, 'category.price'),
        nbQuantity: v.int(c.nbQuantity, 'category.nbQuantity'),
    }));
};

router.post('/events', requireAdmin, wrap(async (req, res) => {
    const id = await sql.createEvent({
        artist: v.str(req.body.artist, 'artist', { max: 150 }),
        idLocation: v.int(req.body.idLocation, 'idLocation'),
        eventDate: v.date(req.body.eventDate, 'eventDate'),
        categories: parseCategories(req.body.categories),
    });
    if (req.body.content) {
        await content.upsertContent(id, parseContent(req.body.content, req.body.artist));
    }
    res.status(201).json(await sql.getEvent(id));
}));

router.put('/events/:id', requireAdmin, wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const ok = await sql.updateEvent(id, {
        artist: v.optional(v.str, req.body.artist, 'artist', { max: 150 }),
        idLocation: v.optional(v.int, req.body.idLocation, 'idLocation'),
        eventDate: v.optional(v.date, req.body.eventDate, 'eventDate'),
    });
    if (!ok) throw new HttpError(404, 'Evenement introuvable');
    res.json(await sql.getEvent(id));
}));

router.delete('/events/:id', requireAdmin, wrap(async (req, res) => {
    await cross.deleteEventEverywhere(parseId(req.params.id));
    res.status(204).end();
}));

router.get('/me/tickets', requireAuth, wrap(async (req, res) => {
    res.json(await sql.getUserTickets(req.session.user.id));
}));

router.post('/events/:id/tickets', requireAuth, wrap(async (req, res) => {
    const eventId = parseId(req.params.id);
    const categoryId = v.int(req.body.categoryId, 'categoryId');
    const categories = await sql.getCategories(eventId);
    if (!categories.some((c) => c.categoryId === categoryId)) {
        throw new HttpError(404, 'Categorie introuvable pour cet evenement');
    }
    const ticketId = await sql.buyTicket(req.session.user.id, categoryId);
    content.logActivity({ type: 'purchase', userId: req.session.user.id, eventId, meta: { categoryId } });
    res.status(201).json({ ticketId, eventId, categoryId });
}));

router.delete('/tickets/:id', requireAuth, wrap(async (req, res) => {
    await sql.cancelTicket(parseId(req.params.id), req.session.user.id);
    res.status(204).end();
}));

function parseContent(body, fallbackArtist) {
    if (typeof body !== 'object' || body === null) throw v.bad('corps invalide');
    const out = {};
    out.artist = v.str(body.artist ?? fallbackArtist, 'artist', { max: 150 });
    if (body.genre !== undefined) out.genre = v.str(body.genre, 'genre', { max: 50 });
    if (body.description !== undefined) out.description = v.str(body.description, 'description', { min: 10, max: 4000 });
    if (body.tags !== undefined) out.tags = v.stringArray(body.tags, 'tags');
    if (body.lineup !== undefined) {
        if (!Array.isArray(body.lineup) || body.lineup.length > 20) throw v.bad('lineup invalide');
        out.lineup = body.lineup.map((l) => ({
            name: v.str(l.name, 'lineup.name', { max: 100 }),
            startTime: v.str(l.startTime, 'lineup.startTime', { max: 5 }),
        }));
    }
    if (body.venueInfo !== undefined) {
        const vi = body.venueInfo;
        out.venueInfo = {
            doorsOpen: v.optional(v.str, vi.doorsOpen, 'venueInfo.doorsOpen', { max: 5 }),
            ageLimit: v.optional(v.int, vi.ageLimit, 'venueInfo.ageLimit', { min: 0, max: 99 }),
            access: v.optional(v.stringArray, vi.access, 'venueInfo.access'),
        };
    }
    return out;
}

router.get('/events/:id/content', wrap(async (req, res) => {
    const doc = await content.getContent(parseId(req.params.id));
    if (!doc) throw new HttpError(404, 'Contenu introuvable');
    res.json(doc);
}));

router.put('/events/:id/content', requireAdmin, wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const event = await sql.getEvent(id);
    if (!event) throw new HttpError(404, 'Evenement introuvable');
    const { created } = await content.upsertContent(id, parseContent(req.body, event.artist));
    res.status(created ? 201 : 200).json(await content.getContent(id));
}));

router.delete('/events/:id/content', requireAdmin, wrap(async (req, res) => {
    const r = await content.deleteContent(parseId(req.params.id));
    if (!r.content) throw new HttpError(404, 'Contenu introuvable');
    res.status(204).end();
}));

router.get('/content/search', wrap(async (req, res) => {
    const q = req.query;
    content.logActivity({ type: 'search', userId: req.session.user?.id, meta: { q: q.q, genre: q.genre } });
    res.json(await content.searchContent({
        q: q.q, genre: q.genre, tag: q.tag, performer: q.performer,
        minRating: v.optional(v.num, q.minRating, 'minRating', { min: 0, max: 5 }),
        maxAge: v.optional(v.int, q.maxAge, 'maxAge', { min: 0, max: 99 }),
        limit: v.int(q.limit ?? 20, 'limit', { min: 1, max: 100 }),
    }));
}));

router.get('/events/:id/reviews', wrap(async (req, res) => {
    res.json(await cross.getReviewsWithAuthors(parseId(req.params.id), paging(req.query)));
}));

router.post('/events/:id/reviews', requireAuth, wrap(async (req, res) => {
    const review = await cross.postReview(parseId(req.params.id), req.session.user.id, {
        rating: v.int(req.body.rating, 'rating', { min: 1, max: 5 }),
        comment: v.optional(v.str, req.body.comment, 'comment', { min: 0, max: 2000 }),
    });
    res.status(201).json(review);
}));

router.put('/events/:id/reviews/me', requireAuth, wrap(async (req, res) => {
    const ok = await content.updateReview(parseId(req.params.id), req.session.user.id, {
        rating: v.optional(v.int, req.body.rating, 'rating', { min: 1, max: 5 }),
        comment: v.optional(v.str, req.body.comment, 'comment', { min: 0, max: 2000 }),
    });
    if (!ok) throw new HttpError(404, 'Avis introuvable');
    res.status(204).end();
}));

router.delete('/events/:id/reviews/me', requireAuth, wrap(async (req, res) => {
    if (!(await content.deleteReview(parseId(req.params.id), req.session.user.id))) {
        throw new HttpError(404, 'Avis introuvable');
    }
    res.status(204).end();
}));

router.get('/events/:id/rating-distribution', wrap(async (req, res) => {
    res.json(await content.ratingDistribution(parseId(req.params.id)));
}));

router.get('/events/:id/full', wrap(async (req, res) => {
    res.json(await cross.getFullEvent(parseId(req.params.id), req.session.user?.id));
}));

router.get('/stats/top-events', wrap(async (req, res) => {
    res.json(await cross.topEvents({
        genre: req.query.genre,
        minReviews: v.int(req.query.minReviews ?? 10, 'minReviews', { min: 1 }),
        limit: v.int(req.query.limit ?? 10, 'limit', { min: 1, max: 50 }),
    }));
}));

router.get('/stats/trending', wrap(async (req, res) => {
    res.json(await cross.trendingEvents({
        days: v.int(req.query.days ?? 7, 'days', { min: 1, max: 30 }),
        limit: v.int(req.query.limit ?? 10, 'limit', { min: 1, max: 50 }),
    }));
}));

router.get('/stats/sql/revenue-by-city', wrap(async (req, res) => {
    res.json(await sql.revenueByCity(v.num(req.query.minRevenue ?? 0, 'minRevenue')));
}));
router.get('/stats/sql/top-buyers', wrap(async (req, res) => {
    res.json(await sql.topBuyers(v.int(req.query.limit ?? 10, 'limit', { min: 1, max: 100 })));
}));
router.get('/stats/sql/unsold-events', wrap(async (req, res) => res.json(await sql.eventsWithoutSales())));
router.get('/stats/sql/premium-categories', wrap(async (req, res) => res.json(await sql.premiumCategories())));
router.get('/stats/sql/sales-per-day', wrap(async (req, res) => {
    res.json(await sql.salesPerDay(v.int(req.query.days ?? 30, 'days', { min: 1, max: 365 })));
}));
router.get('/stats/mongo/genres', wrap(async (req, res) => res.json(await content.genreStats())));

router.use((req, res, next) => next(new HttpError(404, 'Route inconnue')));

module.exports = router;
