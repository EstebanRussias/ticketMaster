const { ObjectId } = require('mongodb');
const { HttpError } = require('./middleware/errors');

const bad = (msg) => new HttpError(400, msg);

const str = (v, label, { min = 1, max = 255 } = {}) => {
    if (typeof v !== 'string' || v.trim().length < min || v.length > max) {
        throw bad(`${label} invalide (texte de ${min} a ${max} caracteres)`);
    }
    return v.trim();
};

const int = (v, label, { min = 1, max = 1e9 } = {}) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) throw bad(`${label} invalide (entier entre ${min} et ${max})`);
    return n;
};

const num = (v, label, { min = 0, max = 1e6 } = {}) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) throw bad(`${label} invalide`);
    return n;
};

const email = (v) => {
    const s = str(v, 'email', { max: 190 });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) throw bad('email invalide');
    return s.toLowerCase();
};

const date = (v, label) => {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) throw bad(`${label} invalide (format ISO attendu)`);
    return d;
};

const optional = (fn, v, ...args) => (v === undefined || v === null ? undefined : fn(v, ...args));

const stringArray = (v, label, max = 20) => {
    if (!Array.isArray(v) || v.length > max) throw bad(`${label} doit etre un tableau de ${max} elements maximum`);
    return v.map((x) => str(x, label, { max: 80 }));
};

const objectId = (v, label = 'id') => {
    if (typeof v !== 'string' || !/^[0-9a-f]{24}$/i.test(v)) throw bad(`${label} invalide (ObjectId attendu)`);
    return new ObjectId(v);
};

module.exports = { str, int, num, email, date, optional, stringArray, objectId, bad };
