exports.createdRoomsByThisNode = new Set();

const redis = require('../utils/redis');
const { serverStatus } = require('./serverStatus');

redis.watchKey(/^createdRoomsByThisNode/, async () => {
  if (serverStatus.status !== 'running') return;
  const result = await redis.client.multi().smembers('createdRoomsByThisNode').del('createdRoomsByThisNode').execAsync();
  if (result[0] && result[1] == 1) {
    for (const roomId of result[0])
      exports.createdRoomsByThisNode.add(roomId);
  }
});