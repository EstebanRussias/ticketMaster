// =====================================================================
// 01_init.js : creation des collections, validateurs, index et de
// l'utilisateur applicatif MongoDB (droits readWrite sur une seule base).
// Execute automatiquement au 1er demarrage (docker-entrypoint-initdb.d).
// Les identifiants viennent des variables d'environnement (.env).
// =====================================================================
const dbName = process.env.MONGO_DB || 'ticketmaster';
const appDb = db.getSiblingDB(dbName);

appDb.createUser({
  user: process.env.MONGO_APP_USER,
  pwd: process.env.MONGO_APP_PASSWORD,
  roles: [{ role: 'readWrite', db: dbName }],
});

// --- event_content : contenu editorial d'un evenement (modele EMBARQUE) ---
// _id = id de l'evenement dans MySQL (identifiant partage entre les 2 bases)
appDb.createCollection('event_content', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['_id', 'artist', 'genre', 'description'],
      properties: {
        _id: { bsonType: ['int', 'long'] },
        artist: { bsonType: 'string' },
        genre: { bsonType: 'string' },
        description: { bsonType: 'string', minLength: 10 },
        tags: { bsonType: 'array', items: { bsonType: 'string' } },
        lineup: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            required: ['name', 'startTime'],
            properties: { name: { bsonType: 'string' }, startTime: { bsonType: 'string' } },
          },
        },
        rating: {
          bsonType: 'object',
          required: ['avg', 'count'],
          properties: { avg: { bsonType: 'number' }, count: { bsonType: ['int', 'long'] } },
        },
      },
    },
  },
});
appDb.event_content.createIndex({ genre: 1, 'rating.avg': -1 });
appDb.event_content.createIndex(
  { artist: 'text', description: 'text', tags: 'text' },
  { name: 'ix_text_search', default_language: 'french' }
);

// --- reviews : avis (modele REFERENCE : croissance non bornee) ---
appDb.createCollection('reviews', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['eventId', 'userId', 'rating', 'createdAt'],
      properties: {
        eventId: { bsonType: ['int', 'long'] },
        userId: { bsonType: ['int', 'long'] },
        rating: { bsonType: ['int', 'long'], minimum: 1, maximum: 5 },
        comment: { bsonType: 'string', maxLength: 2000 },
        createdAt: { bsonType: 'date' },
      },
    },
  },
});
// Un utilisateur ne peut laisser qu'un avis par evenement
appDb.reviews.createIndex({ eventId: 1, userId: 1 }, { unique: true });
appDb.reviews.createIndex({ eventId: 1, createdAt: -1 });

// --- activity_log : journal d'activite, expire automatiquement (TTL 30 j) ---
appDb.createCollection('activity_log');
appDb.activity_log.createIndex({ at: 1 }, { expireAfterSeconds: 30 * 24 * 3600, name: 'ttl_at_30d' });
appDb.activity_log.createIndex({ type: 1, eventId: 1, at: -1 });
