const pool = require('../db');

const SORTS = {
    date: 'eventDate ASC',
    popularity: 'ticketsSold DESC',
    price: 'minPrice ASC',
    recent: 'eventCreateAt DESC',
};

async function createUser({ name, lastName, email, passwordHash }) {
    const [r] = await pool.query(
        'INSERT INTO users (name, lastName, email, password) VALUES (?, ?, ?, ?)',
        [name, lastName, email, passwordHash]
    );
    return { id: r.insertId, name, lastName, email, role: 'user' };
}

async function findUserByEmail(email) {
    const [rows] = await pool.query(
        'SELECT id, name, lastName, email, password, role FROM users WHERE email = ? AND isDeleted = FALSE',
        [email]
    );
    return rows[0] || null;
}

async function getUser(id) {
    const [rows] = await pool.query(
        'SELECT id, name, lastName, email, role, createAt FROM users WHERE id = ? AND isDeleted = FALSE',
        [id]
    );
    return rows[0] || null;
}

async function updateUser(id, { name, lastName }) {
    const [r] = await pool.query(
        'UPDATE users SET name = COALESCE(?, name), lastName = COALESCE(?, lastName) WHERE id = ? AND isDeleted = FALSE',
        [name ?? null, lastName ?? null, id]
    );
    return r.affectedRows > 0;
}

async function softDeleteUser(id) {
    const [r] = await pool.query('UPDATE users SET isDeleted = TRUE WHERE id = ? AND isDeleted = FALSE', [id]);
    return r.affectedRows > 0;
}

async function getUserNames(ids) {
    if (!ids.length) return new Map();
    const [rows] = await pool.query('SELECT id, name, lastName FROM users WHERE id IN (?)', [ids]);
    return new Map(rows.map((u) => [u.id, `${u.name} ${u.lastName.charAt(0)}.`]));
}

async function listLocations() {
    const [rows] = await pool.query(
        'SELECT id, name, adress, city, nbQuantity FROM location WHERE isDeleted = FALSE ORDER BY city, name'
    );
    return rows;
}

async function createLocation({ name, adress, city, nbQuantity }) {
    const [r] = await pool.query(
        'INSERT INTO location (name, adress, city, nbQuantity) VALUES (?, ?, ?, ?)',
        [name, adress, city, nbQuantity]
    );
    return { id: r.insertId, name, adress, city, nbQuantity };
}

async function listEvents({ q, city, upcoming, sort, page = 1, limit = 20 }) {
    const where = [];
    const params = [];
    if (q) { where.push('artist LIKE ?'); params.push(`%${q}%`); }
    if (city) { where.push('locationCity = ?'); params.push(city); }
    if (upcoming) where.push('eventDate > NOW()');
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const order = SORTS[sort] || SORTS.date;

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM v_show_event ${clause}`, params);
    const [rows] = await pool.query(
        `SELECT * FROM v_show_event ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit]
    );
    return { total, page, limit, items: rows };
}

async function getEvent(id) {
    const [rows] = await pool.query('SELECT * FROM v_show_event WHERE eventId = ?', [id]);
    return rows[0] || null;
}

async function getEventsByIds(ids) {
    if (!ids.length) return [];
    const [rows] = await pool.query('SELECT * FROM v_show_event WHERE eventId IN (?)', [ids]);
    return rows;
}

async function getCategories(eventId) {
    const [rows] = await pool.query(
        'SELECT categoryId, categoryName, price, totalQuantity, soldCount, availableCount FROM v_category_sold WHERE eventId = ? ORDER BY price',
        [eventId]
    );
    return rows;
}

async function createEvent({ artist, idLocation, eventDate, categories }) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [r] = await conn.query(
            'INSERT INTO event (artist, idLocation, eventDate) VALUES (?, ?, ?)',
            [artist, idLocation, eventDate]
        );
        for (const c of categories) {
            await conn.query(
                'INSERT INTO category (idEvent, name, price, nbQuantity) VALUES (?, ?, ?, ?)',
                [r.insertId, c.name, c.price, c.nbQuantity]
            );
        }
        await conn.commit();
        return r.insertId;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

async function updateEvent(id, { artist, idLocation, eventDate }) {
    const [r] = await pool.query(
        `UPDATE event SET artist = COALESCE(?, artist), idLocation = COALESCE(?, idLocation),
                          eventDate = COALESCE(?, eventDate)
         WHERE id = ? AND isDeleted = FALSE`,
        [artist ?? null, idLocation ?? null, eventDate ?? null, id]
    );
    return r.affectedRows > 0;
}

// Suppression logique ; le trigger trg_event_after_update annule les billets.
async function softDeleteEvent(id) {
    const [r] = await pool.query('UPDATE event SET isDeleted = TRUE WHERE id = ? AND isDeleted = FALSE', [id]);
    return r.affectedRows > 0;
}

async function buyTicket(userId, categoryId) {
    const conn = await pool.getConnection();
    try {
        await conn.query('CALL sp_buy_ticket(?, ?, @ticket_id)', [userId, categoryId]);
        const [[{ id }]] = await conn.query('SELECT @ticket_id AS id');
        return id;
    } finally {
        conn.release();
    }
}

async function cancelTicket(ticketId, userId) {
    await pool.query('CALL sp_cancel_ticket(?, ?)', [ticketId, userId]);
}

async function getUserTickets(userId) {
    const [rows] = await pool.query(
        `SELECT ticketId, ticketCreateAt, pricePaid, eventId, eventArtist, eventDate,
                locationName, locationCity, categoryName
         FROM v_ticket_details WHERE userId = ? ORDER BY ticketCreateAt DESC`,
        [userId]
    );
    return rows;
}

async function userHasTicketForEvent(userId, eventId) {
    const [[row]] = await pool.query(
        `SELECT EXISTS (
            SELECT 1 FROM ticket t JOIN category c ON c.id = t.idCategory
            WHERE t.idUser = ? AND c.idEvent = ? AND t.isDeleted = FALSE
         ) AS has`,
        [userId, eventId]
    );
    return Boolean(row.has);
}

async function revenueByCity(minRevenue = 0) {
    const [rows] = await pool.query(
        `SELECT l.city,
                COUNT(DISTINCT e.id)  AS events,
                COUNT(t.id)           AS ticketsSold,
                SUM(t.pricePaid)      AS revenue,
                ROUND(AVG(t.pricePaid), 2) AS avgTicketPrice
         FROM location l
         JOIN event e    ON e.idLocation = l.id AND e.isDeleted = FALSE
         JOIN category c ON c.idEvent = e.id
         JOIN ticket t   ON t.idCategory = c.id AND t.isDeleted = FALSE
         GROUP BY l.city
         HAVING SUM(t.pricePaid) >= ?
         ORDER BY revenue DESC`,
        [minRevenue]
    );
    return rows;
}

async function topBuyers(limit = 10) {
    const [rows] = await pool.query(
        `WITH spend AS (
            SELECT idUser, COUNT(*) AS tickets, SUM(pricePaid) AS total
            FROM ticket WHERE isDeleted = FALSE GROUP BY idUser
         )
         SELECT RANK() OVER (ORDER BY s.total DESC) AS \`rank\`,
                u.id AS userId, CONCAT(u.name, ' ', u.lastName) AS fullName, s.tickets, s.total
         FROM spend s JOIN users u ON u.id = s.idUser
         ORDER BY s.total DESC LIMIT ?`,
        [limit]
    );
    return rows;
}

async function eventsWithoutSales() {
    const [rows] = await pool.query(
        `SELECT e.id AS eventId, e.artist, e.eventDate, l.name AS locationName
         FROM event e JOIN location l ON l.id = e.idLocation
         WHERE e.isDeleted = FALSE AND e.eventDate > NOW()
           AND NOT EXISTS (
               SELECT 1 FROM ticket t JOIN category c ON c.id = t.idCategory
               WHERE c.idEvent = e.id AND t.isDeleted = FALSE)
         ORDER BY e.eventDate`
    );
    return rows;
}

async function premiumCategories(limit = 20) {
    const [rows] = await pool.query(
        `SELECT c.id AS categoryId, e.artist, c.name, c.price
         FROM category c JOIN event e ON e.id = c.idEvent
         WHERE c.isDeleted = FALSE AND e.isDeleted = FALSE
           AND c.price > (SELECT AVG(c2.price) FROM category c2 WHERE c2.idEvent = c.idEvent)
         ORDER BY c.price DESC LIMIT ?`,
        [limit]
    );
    return rows;
}

async function salesPerDay(days = 30) {
    const [rows] = await pool.query(
        `SELECT DATE(createAt) AS day, COUNT(*) AS tickets, SUM(pricePaid) AS revenue
         FROM ticket
         WHERE createAt >= NOW() - INTERVAL ? DAY AND isDeleted = FALSE
         GROUP BY DATE(createAt) ORDER BY day`,
        [days]
    );
    return rows;
}

module.exports = {
    createUser, findUserByEmail, getUser, updateUser, softDeleteUser, getUserNames,
    listLocations, createLocation,
    listEvents, getEvent, getEventsByIds, getCategories, createEvent, updateEvent, softDeleteEvent,
    buyTicket, cancelTicket, getUserTickets, userHasTicketForEvent,
    revenueByCity, topBuyers, eventsWithoutSales, premiumCategories, salesPerDay,
};
