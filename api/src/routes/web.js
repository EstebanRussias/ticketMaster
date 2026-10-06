const express = require('express');
const bcrypt = require('bcryptjs');
const sql = require('../services/sql');
const cross = require('../services/cross');
const content = require('../services/content');
const v = require('../validate');
const { wrap, parseId, HttpError } = require('../middleware/errors');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const sessionUser = (u) => ({ id: u.id, name: u.name, lastName: u.lastName, role: u.role });

router.get('/', wrap(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const filters = { q: req.query.q || '', city: req.query.city || '', upcoming: true, sort: req.query.sort || 'date' };
    const [result, locations] = await Promise.all([
        cross.listEventsWithRatings({ ...filters, page, limit: 12 }),
        sql.listLocations(),
    ]);
    const cities = [...new Set(locations.map((l) => l.city))];
    res.render('events', { result, filters, cities });
}));

router.get('/events/:id', wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const event = await cross.getFullEvent(id, req.session.user?.id);
    const reviews = await cross.getReviewsWithAuthors(id, { page: 1, limit: 10 });
    const distribution = await content.ratingDistribution(id);
    const myReview = req.session.user ? await content.getUserReview(id, req.session.user.id) : null;
    res.render('event_detail', { event, reviews, distribution, myReview, error: req.query.error || null });
}));

router.post('/events/:id/buy', requireAuth, wrap(async (req, res) => {
    const eventId = parseId(req.params.id);
    try {
        await sql.buyTicket(req.session.user.id, v.int(req.body.categoryId, 'categoryId'));
        content.logActivity({ type: 'purchase', userId: req.session.user.id, eventId });
        res.redirect('/mytickets');
    } catch (err) {
        const msg = err.errno === 1644 ? err.sqlMessage : 'Achat impossible';
        res.redirect(`/events/${eventId}?error=${encodeURIComponent(msg)}`);
    }
}));

router.get('/mytickets', requireAuth, wrap(async (req, res) => {
    res.render('my_tickets', { tickets: await sql.getUserTickets(req.session.user.id) });
}));

router.post('/tickets/:id/cancel', requireAuth, wrap(async (req, res) => {
    await sql.cancelTicket(parseId(req.params.id), req.session.user.id);
    res.redirect('/mytickets');
}));

router.get('/myreviews', requireAuth, wrap(async (req, res) => {
    res.render('my_reviews', { reviews: await cross.getUserReviewsWithEvents(req.session.user.id) });
}));

// --- Administration du contenu MongoDB (event_content) ---
router.get('/admin/content', requireAdmin, wrap(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const genre = req.query.genre || '';
    const [result, genres] = await Promise.all([
        content.listContent({ genre: genre || undefined, page, limit: 20 }),
        content.genreStats(0),
    ]);
    res.render('admin_content', { result, genre, genres: genres.map((g) => g.genre).sort() });
}));

router.get('/admin/content/:id', requireAdmin, wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const [event, doc] = await Promise.all([sql.getEvent(id), content.getContent(id)]);
    if (!event) throw new HttpError(404, 'Evenement introuvable');
    res.render('admin_content_edit', { event, doc });
}));

router.get('/login', (req, res) => res.render('login', { error: null }));

router.post('/login', wrap(async (req, res) => {
    const user = await sql.findUserByEmail(String(req.body.email || '').toLowerCase());
    if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password))) {
        return res.status(401).render('login', { error: 'Identifiants invalides' });
    }
    req.session.user = sessionUser(user);
    res.redirect('/');
}));

router.get('/register', (req, res) => res.render('register', { error: null }));

router.post('/register', wrap(async (req, res) => {
    try {
        const user = await sql.createUser({
            name: v.str(req.body.name, 'Prenom', { max: 100 }),
            lastName: v.str(req.body.lastName, 'Nom', { max: 100 }),
            email: v.email(req.body.email),
            passwordHash: await bcrypt.hash(v.str(req.body.password, 'Mot de passe', { min: 8, max: 100 }), 10),
        });
        req.session.user = sessionUser(user);
        res.redirect('/');
    } catch (err) {
        const msg = err.errno === 1062 ? 'Cet email est deja utilise' : (err.status === 400 ? err.message : null);
        if (!msg) throw err;
        res.status(400).render('register', { error: msg });
    }
}));

router.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

module.exports = router;
