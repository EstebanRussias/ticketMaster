require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const authRoutes = require('./src/routes/auth');
const eventRoutes = require('./src/routes/events');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
}));

app.use((req, res, next) => {
    res.locals.currentUser = req.session.user || null;
    next();
});

app.use(authRoutes);
app.use(eventRoutes);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`ticketMaster app listening on port ${port}`));
