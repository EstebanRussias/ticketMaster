const { HttpError } = require('./errors');

function requireAuth(req, res, next) {
    if (!req.session.user) {
        if (req.originalUrl.startsWith('/api')) return next(new HttpError(401, 'Authentification requise'));
        return res.redirect('/login');
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.user) return next(new HttpError(401, 'Authentification requise'));
    if (req.session.user.role !== 'admin') return next(new HttpError(403, 'Reserve aux administrateurs'));
    next();
}

module.exports = { requireAuth, requireAdmin };
