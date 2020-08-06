const { client: redis, watchKey } = require('../utils/redis');
const roomStatus = require('./roomStatus');
const createdRoomsByThisNode = require('../system/createdRoomsByThisNode').createdRoomsByThisNode;

const getRedisKey = (roomId) => `roomBet:${roomId}`;

exports.BET_COUNT = 9;

exports.BET_STATUS = {
  'PLAYING': 'playing',
  'END': 'end',
};

exports.initValueChangeEvent = function (io) {
  watchKey(/^roomBet:/, async (key) => {
    const roomId = key.replace(getRedisKey(''), '');
    if (!createdRoomsByThisNode.has(roomId)) return;

    const gameBetResult = await exports.getGameBet(roomId);
    if (!gameBetResult) return;
    const keys = Object.keys(gameBetResult);
    const betPlayers = keys.length - 1;
    const playingPlayers = gameBetResult.playingPlayers;

    let winIdx = -1;
    if (betPlayers >= playingPlayers) {
      winIdx = Math.floor(Math.random() * exports.BET_COUNT);
    }

    const result = new Array(exports.BET_COUNT);
    let winUserNum;

    for (let i = 0; i < exports.BET_COUNT; i += 1) {
      result[i] = { betUserNum: gameBetResult[i], isWin: i === winIdx };
      if (result[i].isWin) winUserNum = result[i].betUserNum;
    }

    io.to(roomId).emit('gameBet', result);

    // game still playing
    if (betPlayers < playingPlayers) return;

    // game end
    if (!winUserNum) io.to(roomId).emit('sysMessage', 'No body win :(');
    else {
      let winPlayer = await roomStatus.getPlayer(roomId, winUserNum);
      winPlayer = winPlayer ? JSON.parse(winPlayer) : null;
      if (winPlayer)
        io.to(roomId).emit('sysMessage', winPlayer.username + ' win !');
    }

    await roomStatus.toWaiting(roomId);
  });
};

exports.reset = async (roomId, playingPlayers) => {
  const redisKey = getRedisKey(roomId);
  await redis.multi()
    .del(redisKey)
    .hset(redisKey, 'playingPlayers', playingPlayers)
    .execAsync();
};

exports.deleteRoom = async (roomId) => {
  const redisKey = getRedisKey(roomId);
  await redis.delAsync(redisKey);
};

exports.bet = async (roomId, playerNumber, betIndex) => {
  if (betIndex >= exports.BET_COUNT) return false;
  const redisKey = getRedisKey(roomId);
  const setBetResult = await redis.multi()
    .hsetnx(redisKey, `${betIndex}`, playerNumber)
    .hgetall(redisKey)
    .execAsync();
  if (setBetResult[0] !== 1) return false;
  const allBets = setBetResult[1];

  for (const key in allBets) {
    if (key == betIndex || key === 'playingPlayers') continue;
    if (allBets[key] == playerNumber) {
      await redis.hdelAsync(redisKey, betIndex);
    }
  }
};

exports.leaveRoom = async (roomId, playerNumber) => {
  const redisKey = getRedisKey(roomId);
  const gameBet = await exports.getGameBet(roomId);

  const multi = redis.multi();
  multi.hincrby(redisKey, 'playingPlayers', -1);

  for (let i = 0; i < exports.BET_COUNT; i += 1) {
    if (gameBet[i] == playerNumber)
      multi.hdel(redisKey, i);
  }

  await multi.execAsync();
};

exports.getGameBet = async (roomId) => {
  const redisKey = getRedisKey(roomId);
  const result = await redis.hgetallAsync(redisKey);

  return result;
};