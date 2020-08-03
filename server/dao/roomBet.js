const redis = require('../utils/redis');

const getRedisKey = (roomId)=> `roomBet:${roomId}`;

exports.BET_COUNT = 9;

exports.reset = async(roomId)=>{
  const redisKey = getRedisKey(roomId);
  await redis.delAsync(redisKey);
};

exports.deleteRoom = async (roomId) => {
  const redisKey = getRedisKey(roomId);
  await redis.delAsync(redisKey);
};

exports.bet = async(roomId, playerNumber, betIndex)=>{
  if (betIndex >= exports.BET_COUNT) return false;
  const redisKey = getRedisKey(roomId);
  const setBetResult = await redis.multi()
    .hsetnx(redisKey, `${betIndex}`, playerNumber)
    .hgetall(redisKey)
    .execAsync();
  if (setBetResult[0] !== 1) return false;
  const allBets = setBetResult[1];
  const idxs = Object.keys(allBets);
  const result = new Array(exports.BET_COUNT).fill(0);
  for (let idx of idxs) {
    result[idx] = allBets[idx];
    if (idx === `${betIndex}`) continue;
    if (allBets[idx] == playerNumber) {
      await redis.hdelAsync(redisKey, idx);
      return false;
    }
  }
  return result;
};

exports.leaveRoom = async (roomId, playerNumber) => {
  const redisKey = getRedisKey(roomId);
  const allBets = await redis.hgetallAsync(redisKey);
  if (!allBets) return false;

  for (let idx in allBets) {
    if (allBets[idx] == playerNumber) {
      const betResult = await redis.multi()
        .hdel(redisKey, idx)
        .hgetall(redisKey)
        .execAsync();
      const allBets = betResult[1];
      const result = new Array(exports.BET_COUNT).fill(0);
      for (let idx in allBets) {
        result[idx] = allBets[idx];
      }
      return result;
    }
  }
  return false;
};

exports.getGameBet = async(roomId)=>{
  const redisKey = getRedisKey(roomId);
  const allBets = await redis.hgetallAsync(redisKey);
  if (!allBets) return;
  const result = new Array(exports.BET_COUNT).fill(0);
  for (let idx in allBets) {
    result[idx] = allBets[idx];
  }
  return result;
};