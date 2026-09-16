const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');

const router = express.Router();

router.get('/login', (req, res) => {
    res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
    const { name, password } = req.body;

    const [rows] = await pool.query(
        'SELECT id, name, lastName, password FROM users WHERE name = ? AND isDeleted = FALSE',
        [name]
    );

    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.render('login', { error: 'Identifiants invalides' });
    }

    req.session.user = { id: user.id, name: user.name, lastName: user.lastName };
    res.redirect('/');
});

router.get('/register', (req, res) => {
    res.render('register', { error: null });
});

router.post('/register', async (req, res) => {
    const { name, lastName, password } = req.body;

    if (!name || !lastName || !password) {
        return res.render('register', { error: 'Tous les champs sont requis' });
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
        'INSERT INTO users (name, lastName, password) VALUES (?, ?, ?)',
        [name, lastName, hash]
    );

    req.session.user = { id: result.insertId, name, lastName };
    res.redirect('/');
});

router.post('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
