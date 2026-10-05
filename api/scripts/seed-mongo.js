const mysql = require('mysql2/promise');
const { MongoClient } = require('mongodb');

// Meme ordre que la liste ELT de docker/init-sql/02_seed.sql (index = id evenement - 1 modulo 40)
const ARTISTS = [
    ['Daft Punk', 'electro'], ['Phoenix', 'pop'], ['Justice', 'electro'], ['Air', 'electro'], ['M83', 'electro'],
    ['Stromae', 'pop'], ['Angele', 'pop'], ['Christine and the Queens', 'pop'], ['Indochine', 'rock'], ['Jain', 'pop'],
    ['Orelsan', 'rap'], ['Nekfeu', 'rap'], ['PNL', 'rap'], ['Aya Nakamura', 'pop'], ['Maitre Gims', 'rap'],
    ['Zaz', 'chanson'], ['Louane', 'chanson'], ['Vianney', 'chanson'], ['Julien Dore', 'chanson'], ['Cats on Trees', 'pop'],
    ['Coldplay', 'rock'], ['Muse', 'rock'], ['Arctic Monkeys', 'rock'], ['Imagine Dragons', 'rock'], ['The Weeknd', 'pop'],
    ['Dua Lipa', 'pop'], ['Billie Eilish', 'pop'], ['Harry Styles', 'pop'], ['Ed Sheeran', 'pop'], ['Adele', 'chanson'],
    ['David Guetta', 'electro'], ['Martin Garrix', 'electro'], ['Calvin Harris', 'electro'], ['Kavinsky', 'electro'], ['Carpenter Brut', 'metal'],
    ['Gojira', 'metal'], ['Mass Hysteria', 'metal'], ['Shaka Ponk', 'rock'], ['Tryo', 'chanson'], ['Ben Mazue', 'chanson'],
];
const OPENERS = ['Lomepal', 'Fakear', 'Therapie Taxi', 'Clara Luciani', 'Pomme', 'Last Train', 'Mezerg', 'Joanna', 'M.I.L.K', 'Videoclub'];
const EXTRA_TAGS = ['live', 'festival', 'tournee-2026', 'show-visuel', 'acoustique', 'complet-rapidement', 'famille'];
const ACCESS = ['metro', 'rer', 'bus', 'parking', 'tramway', 'navette'];
const COMMENTS = {
    1: ['Decevant, le son etait mauvais.', 'Beaucoup trop d\'attente, organisation catastrophique.'],
    2: ['Moyen, je m\'attendais a mieux.', 'Concert correct sans plus.'],
    3: ['Bonne soiree, quelques longueurs.', 'Sympa mais la salle etait bondee.'],
    4: ['Tres bon concert, belle mise en scene !', 'Super ambiance, je recommande.'],
    5: ['Un concert exceptionnel, a voir absolument !', 'Inoubliable, meilleure soiree de l\'annee.'],
};

function rng(seed) {
    let a = seed;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

async function main() {
    const mongo = new MongoClient(process.env.MONGO_URL);
    await mongo.connect();
    const db = mongo.db(process.env.MONGO_DB || 'ticketmaster');

    if (await db.collection('event_content').estimatedDocumentCount() > 0) {
        console.log('[seed-mongo] event_content deja peuple : rien a faire.');
        return mongo.close();
    }

    const sql = await mysql.createConnection({
        host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER,
        password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    });
    const rand = rng(42);
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];

    const [events] = await sql.query(
        `SELECT e.id, e.artist, l.name AS venue, l.city FROM event e JOIN location l ON l.id = e.idLocation ORDER BY e.id`
    );

    const contents = events.map((e) => {
        const [, genre] = ARTISTS[(e.id - 1) % ARTISTS.length];
        const openers = [pick(OPENERS), pick(OPENERS)].filter((n, i, a) => a.indexOf(n) === i);
        return {
            _id: e.id,
            artist: e.artist,
            genre,
            description: `${e.artist} en concert a ${e.venue} (${e.city}) : un show ${genre} de deux heures avec les titres incontournables et des morceaux inedits.`,
            tags: [genre, pick(EXTRA_TAGS), pick(EXTRA_TAGS)].filter((t, i, a) => a.indexOf(t) === i),
            lineup: [
                ...openers.map((name, i) => ({ name, startTime: `${19 + i}:00` })),
                { name: e.artist, startTime: '21:00' },
            ],
            venueInfo: {
                doorsOpen: '18:30',
                ageLimit: pick([0, 0, 6, 12, 16]),
                access: [pick(ACCESS), pick(ACCESS)].filter((t, i, a) => a.indexOf(t) === i),
            },
            media: { poster: `/img/posters/${e.id}.jpg` },
            rating: { avg: 0, count: 0 },
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    });
    await db.collection('event_content').insertMany(contents);

    const [tickets] = await sql.query(
        `SELECT c.idEvent AS eventId, t.idUser AS userId, t.createAt
         FROM ticket t JOIN category c ON c.id = t.idCategory WHERE t.isDeleted = FALSE`
    );
    const seen = new Set();
    const reviews = [];
    for (const t of tickets) {
        const key = `${t.eventId}:${t.userId}`;
        if (seen.has(key) || rand() > 0.3) continue;
        seen.add(key);
        const quality = 2.6 + ((t.eventId * 37) % 25) / 11;
        const rating = Math.max(1, Math.min(5, Math.round(quality + (rand() - 0.5) * 2.4)));
        const createdAt = new Date(Math.min(Date.now(), new Date(t.createAt).getTime() + (1 + rand() * 13) * 86400000));
        reviews.push({ eventId: t.eventId, userId: t.userId, rating, comment: pick(COMMENTS[rating]), createdAt });
    }
    for (let i = 0; i < reviews.length; i += 1000) {
        await db.collection('reviews').insertMany(reviews.slice(i, i + 1000), { ordered: false });
    }

    const stats = await db.collection('reviews').aggregate([
        { $group: { _id: '$eventId', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]).toArray();
    await db.collection('event_content').bulkWrite(stats.map((s) => ({
        updateOne: { filter: { _id: s._id }, update: { $set: { rating: { avg: Math.round(s.avg * 100) / 100, count: s.count } } } },
    })));

    const now = Date.now();
    const logs = Array.from({ length: 8000 }, () => {
        const r = rand();
        const type = r < 0.7 ? 'view' : r < 0.85 ? 'search' : 'purchase';
        const eventId = 1 + Math.floor(events.length * rand() ** 2);
        return {
            type,
            userId: rand() < 0.6 ? 1 + Math.floor(rand() * 1503) : null,
            eventId: type === 'search' ? null : eventId,
            meta: type === 'search' ? { q: pick(ARTISTS)[0] } : {},
            at: new Date(now - rand() * 25 * 86400000),
        };
    });
    await db.collection('activity_log').insertMany(logs);

    console.log(`[seed-mongo] ${contents.length} contenus, ${reviews.length} avis, ${logs.length} activites inseres.`);
    await sql.end();
    await mongo.close();
}

main().catch((err) => { console.error('[seed-mongo] echec :', err); process.exit(1); });
