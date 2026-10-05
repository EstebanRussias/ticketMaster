require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const apiRoutes = require('./src/routes/api');
const webRoutes = require('./src/routes/web');
const pool = require('./src/db');
const { getDb } = require('./src/mongo');
const { errorHandler } = require('./src/middleware/errors');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 24 * 3600 * 1000 },
}));

app.use((req, res, next) => {
    res.locals.currentUser = req.session.user || null;
    next();
});

app.get('/api/health', async (req, res) => {
    const status = { mysql: 'down', mongo: 'down' };
    try { await pool.query('SELECT 1'); status.mysql = 'up'; } catch (e) { /* down */ }
    try { await (await getDb()).command({ ping: 1 }); status.mongo = 'up'; } catch (e) { /* down */ }
    res.status(status.mysql === 'up' && status.mongo === 'up' ? 200 : 503).json(status);
});

app.use('/api', apiRoutes);
app.use(webRoutes);
app.use((req, res, next) => next(Object.assign(new Error('Page introuvable'), { status: 404 })));
app.use(errorHandler);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`ticketMaster listening on port ${port}`));
