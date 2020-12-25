const { MongoClient } = require("mongodb");
const config = require("../config");
const uri = `mongodb://${config.mongo.user}:${config.mongo.password}@${config.mongo.host}:${config.mongo.port}?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {useNewUrlParser: true, useUnifiedTopology: true});

const connect = async () => {
    try {
        await client.connect();
    } catch (error) {
        console.error(error);
    }
}

module.exports = {
    connect,
    client
}