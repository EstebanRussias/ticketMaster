// Tests d'integration : la pile doit tourner (docker compose up -d).
const test = require('node:test');
const assert = require('node:assert/strict');

const BASE = process.env.BASE_URL || 'http://localhost:3000';

function client() {
    let cookie = '';
    return async (method, path, body) => {
        const res = await fetch(BASE + path, {
            method,
            headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) },
            body: body && JSON.stringify(body),
        });
        const set = res.headers.get('set-cookie');
        if (set) cookie = set.split(';')[0];
        const text = await res.text();
        return { status: res.status, body: text ? JSON.parse(text) : null };
    };
}

const login = async (email) => {
    const c = client();
    const r = await c('POST', '/api/auth/login', { email, password: 'password123' });
    assert.equal(r.status, 200);
    return c;
};

test('sante : MySQL et MongoDB sont joignables', async () => {
    const r = await client()('GET', '/api/health');
    assert.deepEqual(r.body, { mysql: 'up', mongo: 'up' });
});

test('jeu de donnees volumineux et pagination', async () => {
    const r = await client()('GET', '/api/events?limit=5&page=2');
    assert.equal(r.status, 200);
    assert.ok(r.body.total >= 300);
    assert.equal(r.body.items.length, 5);
});

test('cas limites : id invalide, ressource absente, route inconnue', async () => {
    const c = client();
    assert.equal((await c('GET', '/api/events/abc')).status, 400);
    assert.equal((await c('GET', '/api/events/999999')).status, 404);
    assert.equal((await c('GET', '/api/nimporte')).status, 404);
    assert.equal((await c('POST', '/api/events/1/tickets', { categoryId: 1 })).status, 401);
});

test('inscription : donnees invalides rejetees, doublon refuse', async () => {
    const c = client();
    assert.equal((await c('POST', '/api/auth/register', { name: 'A', lastName: 'B', email: 'pas-un-mail', password: 'longpassword' })).status, 400);
    assert.equal((await c('POST', '/api/auth/register', { name: 'A', lastName: 'B', email: 'jean@example.com', password: 'longpassword' })).status, 409);
});

test('MySQL : achat (procedure stockee) puis relecture puis annulation', async () => {
    const c = await login('alice@example.com');
    const before = (await c('GET', '/api/events/2')).body;
    const cat = before.categories.find((x) => x.availableCount > 0);

    const buy = await c('POST', '/api/events/2/tickets', { categoryId: cat.categoryId });
    assert.equal(buy.status, 201);

    const mine = (await c('GET', '/api/me/tickets')).body;
    assert.ok(mine.some((t) => t.ticketId === buy.body.ticketId));
    const after = (await c('GET', '/api/events/2')).body;
    assert.equal(after.categories.find((x) => x.categoryId === cat.categoryId).availableCount, cat.availableCount - 1);

    assert.equal((await c('DELETE', `/api/tickets/${buy.body.ticketId}`)).status, 204);
    assert.equal((await c('DELETE', `/api/tickets/${buy.body.ticketId}`)).status, 409);
});

test('stock : la categorie epuisee refuse la vente (409)', async () => {
    const c = await login('jean@example.com');
    const ev = (await c('GET', '/api/events/1')).body;
    const soldOut = ev.categories.find((x) => x.availableCount === 0);
    assert.ok(soldOut, 'la categorie Carre Or de l\'evenement 1 doit etre epuisee');
    const r = await c('POST', '/api/events/1/tickets', { categoryId: soldOut.categoryId });
    assert.equal(r.status, 409);
});

test('MongoDB : contenu, recherche texte et filtres imbriques', async () => {
    const c = client();
    const doc = await c('GET', '/api/events/1/content');
    assert.equal(doc.status, 200);
    assert.ok(Array.isArray(doc.body.lineup));
    const search = await c('GET', '/api/content/search?q=concert&genre=rock&minRating=1');
    assert.equal(search.status, 200);
    assert.ok(search.body.every((d) => d.genre === 'rock'));
});

test('croisement : fiche complete MySQL + MongoDB', async () => {
    const r = await client()('GET', '/api/events/10/full');
    assert.equal(r.status, 200);
    assert.ok(r.body.categories.length > 0);
    assert.ok(r.body.content.description);
});

test('croisement : un avis exige un billet (EXISTS MySQL) puis ecriture MongoDB', async () => {
    const c = await login('alice@example.com');
    const denied = await c('POST', '/api/events/3/reviews', { rating: 5, comment: 'Test' });
    assert.ok([403, 409].includes(denied.status));
    assert.equal((await c('POST', '/api/events/3/reviews', { rating: 9 })).status, 400);
});

test('administration : creation, lecture, suppression logique d\'un evenement', async () => {
    const user = await login('jean@example.com');
    assert.equal((await user('POST', '/api/events', {})).status, 403);

    const admin = await login('admin@ticketmaster.local');
    const created = await admin('POST', '/api/events', {
        artist: 'Test Band', idLocation: 1, eventDate: new Date(Date.now() + 864e5).toISOString(),
        categories: [{ name: 'Standard', price: 25, nbQuantity: 10 }],
        content: { genre: 'rock', description: 'Concert de test automatise.' },
    });
    assert.equal(created.status, 201);
    const id = created.body.eventId;
    assert.equal((await admin('GET', `/api/events/${id}/content`)).status, 200);
    assert.equal((await admin('DELETE', `/api/events/${id}`)).status, 204);
    assert.equal((await admin('GET', `/api/events/${id}`)).status, 404);
    assert.equal((await admin('GET', `/api/events/${id}/content`)).status, 404);
});

test('requetes avancees : agregats SQL et pipelines MongoDB', async () => {
    const c = client();
    const city = (await c('GET', '/api/stats/sql/revenue-by-city')).body;
    assert.ok(city.length > 0 && city[0].revenue >= city[city.length - 1].revenue);
    assert.ok((await c('GET', '/api/stats/sql/top-buyers?limit=3')).body.length === 3);
    assert.ok((await c('GET', '/api/stats/mongo/genres')).body.length > 0);
    assert.ok((await c('GET', '/api/stats/top-events?limit=5')).body[0].revenue !== undefined);
    assert.ok((await c('GET', '/api/stats/trending')).body.length > 0);
});
