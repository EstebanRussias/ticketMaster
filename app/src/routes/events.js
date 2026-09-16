const express = require('express');
const pool = require('../db');

const router = express.Router();

function requireLogin(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
}

router.get('/', async (req, res) => {
    const [events] = await pool.query(
        `SELECT * FROM v_show_event ORDER BY eventCreateAt DESC`
    );
    res.render('events', { events, user: req.session.user });
});

router.get('/events/:id', async (req, res) => {
    const eventId = req.params.id;

    const [[event]] = await pool.query(
        `SELECT * FROM v_show_event WHERE eventId = ?`,
        [eventId]
    );

    if (!event) return res.status(404).send('Event introuvable');

    const [categories] = await pool.query(
        `SELECT categoryId, categoryName, price, totalQuantity, availableCount
         FROM v_category_sold`
    );

    res.render('event_detail', { event, categories, user: req.session.user, error: req.query.error });
});

router.post('/events/:id/buy', requireLogin, async (req, res) => {
    const eventId = req.params.id;
    const { categoryId } = req.body;
    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();

        const [[category]] = await conn.query(
            'SELECT nbQuantity FROM category WHERE id = ? FOR UPDATE',
            [categoryId]
        );
        const [[{ soldCount }]] = await conn.query(
            'SELECT COUNT(*) AS soldCount FROM ticket WHERE idCategory = ? AND isDeleted = FALSE',
            [categoryId]
        );

        if (!category || soldCount >= category.nbQuantity) {
            await conn.rollback();
            return res.redirect(`/events/${eventId}?error=${encodeURIComponent('Plus de places disponibles pour cette categorie')}`);
        }

        await conn.query(
            'INSERT INTO ticket (idEvent, idUser, idCategory) VALUES (?, ?, ?)',
            [eventId, req.session.user.id, categoryId]
        );
        await conn.commit();
        res.redirect('/mytickets');
    } catch (err) {
        await conn.rollback();
        res.redirect(`/events/${eventId}?error=${encodeURIComponent('Achat impossible')}`);
    } finally {
        conn.release();
    }
});

router.get('/mytickets', requireLogin, async (req, res) => {
    const [tickets] = await pool.query(
        `SELECT ticketId, ticketCreateAt, eventArtist, locationName, categoryName, categoryPrice
         FROM v_ticket_details
         WHERE userId = ?
         ORDER BY ticketCreateAt DESC`,
        [req.session.user.id]
    );
    res.render('my_tickets', { tickets, user: req.session.user });
});

module.exports = router;
