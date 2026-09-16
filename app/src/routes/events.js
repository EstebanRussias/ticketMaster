const express = require('express');
const pool = require('../db');

const router = express.Router();

function requireLogin(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
}

router.get('/', async (req, res) => {
    const [events] = await pool.query(
        `SELECT e.id AS eventId, e.artist, l.name AS locationName, l.adress AS locationAdress,
                e.createAt AS eventCreateAt, COUNT(t.id) AS ticketsSold
         FROM event e
         JOIN location l ON l.id = e.idLocation
         LEFT JOIN ticket t ON t.idEvent = e.id AND t.isDeleted = FALSE
         WHERE e.isDeleted = FALSE
         GROUP BY e.id, e.artist, l.name, l.adress, e.createAt
         ORDER BY e.createAt DESC`
    );
    res.render('events', { events, user: req.session.user });
});

router.get('/events/:id', async (req, res) => {
    const eventId = req.params.id;

    const [[event]] = await pool.query(
        `SELECT e.id, e.artist, l.name AS locationName, l.adress AS locationAdress
         FROM event e JOIN location l ON l.id = e.idLocation
         WHERE e.id = ? AND e.isDeleted = FALSE`,
        [eventId]
    );

    if (!event) return res.status(404).send('Event introuvable');

    const [categories] = await pool.query(
        `SELECT c.id AS categoryId, c.name AS categoryName, c.price,
                c.nbQuantity AS totalQuantity,
                c.nbQuantity - COALESCE(sold.soldCount, 0) AS availableCount
         FROM category c
         LEFT JOIN (
             SELECT idCategory, COUNT(*) AS soldCount
             FROM ticket
             WHERE isDeleted = FALSE
             GROUP BY idCategory
         ) sold ON sold.idCategory = c.id
         WHERE c.isDeleted = FALSE`
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
        `SELECT t.id AS ticketId, t.createAt AS ticketCreateAt,
                e.artist AS eventArtist, l.name AS locationName,
                c.name AS categoryName, c.price AS categoryPrice
         FROM ticket t
         JOIN event e    ON e.id = t.idEvent
         JOIN location l ON l.id = e.idLocation
         JOIN category c ON c.id = t.idCategory
         WHERE t.idUser = ? AND t.isDeleted = FALSE
         ORDER BY t.createAt DESC`,
        [req.session.user.id]
    );
    res.render('my_tickets', { tickets, user: req.session.user });
});

module.exports = router;
