const redis = require('redis');
const bluebird = require('bluebird');
const config = require('../config').redis;

bluebird.promisifyAll(redis);
const client = redis.createClient(config);

client.flushall();

module.exports = client;