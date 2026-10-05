// Requetes significatives (MongoDB). Execution :
//   docker compose exec -T mongo mongosh -u mongo_root -p demo_mongo_root_pwd --authenticationDatabase admin ticketmaster < docs/nosql_queries.js
// (adapter les identifiants si vous avez un fichier .env)

// M1. Filtres sur champs imbriques + operateurs : concerts metal accessibles aux moins de 12 ans, bien notes
printjson(db.event_content.find(
  { genre: 'metal', 'venueInfo.ageLimit': { $lte: 12 }, 'rating.avg': { $gte: 3.5 } },
  { artist: 1, 'rating.avg': 1, 'venueInfo.ageLimit': 1 }
).sort({ 'rating.avg': -1 }).limit(3).toArray());

// M2. Tableau imbrique : concerts ou une premiere partie donnee joue ($elemMatch)
print(db.event_content.countDocuments({ lineup: { $elemMatch: { name: 'Fakear', startTime: '19:00' } } }));

// M3. Recherche plein texte (index texte, tri par pertinence)
printjson(db.event_content.find({ $text: { $search: 'electro tournee' } },
  { artist: 1, score: { $meta: 'textScore' } }).sort({ score: { $meta: 'textScore' } }).limit(3).toArray());

// M4. Pipeline : note moyenne par genre
printjson(db.event_content.aggregate([
  { $match: { 'rating.count': { $gte: 5 } } },
  { $group: { _id: '$genre', events: { $sum: 1 }, reviews: { $sum: '$rating.count' }, avg: { $avg: '$rating.avg' } } },
  { $project: { genre: '$_id', _id: 0, events: 1, reviews: 1, avg: { $round: ['$avg', 2] } } },
  { $sort: { avg: -1 } },
]).toArray());

// M5. Pipeline avec $lookup : evenements les mieux notes + 2 derniers avis (jointure entre collections)
printjson(db.event_content.aggregate([
  { $match: { 'rating.count': { $gte: 20 } } },
  { $sort: { 'rating.avg': -1 } }, { $limit: 2 },
  { $lookup: { from: 'reviews', localField: '_id', foreignField: 'eventId', as: 'avis',
               pipeline: [{ $sort: { createdAt: -1 } }, { $limit: 2 }, { $project: { _id: 0, rating: 1, comment: 1 } }] } },
  { $project: { artist: 1, rating: 1, avis: 1 } },
]).toArray());

// M6. Tendances sur le journal d'activite (TTL) : evenements les plus consultes sur 7 jours
printjson(db.activity_log.aggregate([
  { $match: { type: 'view', at: { $gte: new Date(Date.now() - 7 * 864e5) } } },
  { $group: { _id: '$eventId', views: { $sum: 1 }, visitors: { $addToSet: '$userId' } } },
  { $project: { views: 1, uniqueVisitors: { $size: '$visitors' } } },
  { $sort: { views: -1 } }, { $limit: 3 },
]).toArray());

// M7. Plan d'execution : la requete utilise l'index unique (eventId, userId)
printjson(db.reviews.find({ eventId: 1, userId: 927 }).explain('executionStats').executionStats.totalDocsExamined);
