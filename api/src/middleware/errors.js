class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function parseId(value, label = 'id') {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `${label} invalide`);
    return n;
}

function toHttpError(err) {
    if (err instanceof HttpError) return err;
    if (err.status >= 400 && err.status < 500) return new HttpError(err.status, err.message);
    if (err.errno === 1644) return new HttpError(409, err.sqlMessage);
    if (err.errno === 1062) return new HttpError(409, 'Valeur deja existante (doublon)');
    if (err.errno === 3819) return new HttpError(400, 'Contrainte CHECK violee : donnees invalides');
    if (err.errno === 1452) return new HttpError(400, 'Reference inexistante (cle etrangere)');
    if (err.code === 11000) return new HttpError(409, 'Document deja existant (doublon)');
    if (err.code === 121) return new HttpError(400, 'Document refuse par le schema de validation MongoDB');
    return null;
}

function errorHandler(err, req, res, next) {
    const known = toHttpError(err);
    const wantsJson = req.originalUrl.startsWith('/api') || req.is('json');
    if (!known) console.error(err);
    const status = known ? known.status : 500;
    const message = known ? known.message : 'Erreur interne';
    if (wantsJson) return res.status(status).json({ error: message });
    res.status(status).render('error', { status, message });
}

module.exports = { HttpError, wrap, parseId, errorHandler };
