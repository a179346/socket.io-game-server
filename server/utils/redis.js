const redis = require('redis');
const bluebird = require('bluebird');
const config = require('../config').redis;

bluebird.promisifyAll(redis);
const client = redis.createClient(config);

if (process.env.NODE_ENV === 'local') client.flushall();

module.exports = client;