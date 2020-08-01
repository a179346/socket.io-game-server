const redis = require('redis');
const bluebird = require('bluebird');
const config = require('../config').redis;

const client = redis.createClient(config);
bluebird.promisifyAll(client);

module.exports = client;