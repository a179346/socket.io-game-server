const redis = require('../utils/redis');

const getRedisKey = (roomId)=> `createRoomRace:${roomId}`;

exports.createRoomRace = async(roomId)=>{
  const redisKey = getRedisKey(roomId);
  const result = await redis.multi()
    .setnx(redisKey, '1')
    .expire(redisKey, 10)
    .execAsync();
  return result[0] === 1;
};