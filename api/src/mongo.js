const { MongoClient } = require('mongodb');

const client = new MongoClient(process.env.MONGO_URL || 'mongodb://localhost:27017/ticketmaster', {
    ignoreUndefined: true,
});
let connecting = null;

async function getDb() {
    if (!connecting) connecting = client.connect().then(() => client.db(process.env.MONGO_DB || 'ticketmaster'));
    return connecting;
}

async function collection(name) {
    return (await getDb()).collection(name);
}

module.exports = { getDb, collection, client };
