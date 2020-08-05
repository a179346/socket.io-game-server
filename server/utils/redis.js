const redis = require('redis');
const bluebird = require('bluebird');
const config = require('../config').redis;

bluebird.promisifyAll(redis);
const client = redis.createClient(config.main);

if (process.env.NODE_ENV === 'local') client.flushall();

const pubsub_client = redis.createClient(config.pubsub);
pubsub_client.config('set', 'notify-keyspace-events', 'KEhs');
pubsub_client.subscribe('__keyevent@0__:hset');
pubsub_client.subscribe('__keyevent@0__:hdel');
pubsub_client.subscribe('__keyevent@0__:hincrby');
pubsub_client.subscribe('__keyevent@0__:sadd');

const watchKeyArray = [];
pubsub_client.on('message', function (event, key) {
  watchKeyArray.forEach(watchKey =>{
    if (watchKey.pattern.test(key))
      return watchKey.func(key, event);
  });
});

exports.client = client;

exports.quit = function (callback) {
  client.quit(() => {
    pubsub_client.quit(callback);
  });
};

exports.watchKey = function (pattern, func) {
  watchKeyArray.push({ pattern, func });
};