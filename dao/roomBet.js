const redis = require('../utils/redis');

const getRedisKey = (roomId)=> `roomBet:${roomId}`;

exports.BET_COUNT = 9;

exports.reset = async(roomId)=>{
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
    if (idx === `${betIndex}`) continue;
    if (allBets[idx] == playerNumber) {
      await redis.hdelAsync(redisKey, idx);
      return false;
    }
    result[idx] = allBets[idx];
  }
  return result;
};