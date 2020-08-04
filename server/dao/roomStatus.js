const { client: redis, watchKey } = require('../utils/redis');
const roomBet =require('./roomBet');
const createdRoomsByThisNode = require('../system/createdRoomsByThisNode').createdRoomsByThisNode;

exports.MAX_ROOM_USERS_COUNT = 5;

/**
 * roomStatus
 * {
 *   "roomStatus": "playing",
 *   "player1": {
 *     "userId": "userAId",
 *     "username": "userAName",
 *     "status": "playing"
 *   },
 *   "player2": {
 *     "userId": "userBId",
 *     "username": "userBName",
 *     "status": "playing"
 *   },
 *   "player3": {
 *     "userId": "userCId",
 *     "username": "userCName",
 *     "status": "waiting"
 *   }
 * }
 */

exports.ROOM_STATUS = {
  'WAITING': 'waiting',
  // 'READY': 'ready',
  'PLAYING': 'playing'
};

exports.PLAYER_STATUS = {
  'WAITING': 'waiting',
  'NOT_READY': 'not_ready',
  'READY': 'ready',
  'PLAYING': 'playing',
};

const getRedisKey = (roomId) => `roomStatus:${roomId}`;

exports.initValueChangeEvent = function (io) {
  watchKey(/^roomStatus:/, async (key) => {
    const roomId = key.replace(getRedisKey(''), '');
    if (!createdRoomsByThisNode.has(roomId)) return;

    const roomStatusResult = await exports.getRoomStatus(roomId);
    if (!roomStatusResult) return;

    let isAllReady = true;
    let isAllUserLeft = true;
    const roomUsers = [];
    for (let i = 1; i <= exports.MAX_ROOM_USERS_COUNT; i++) {
      const json = roomStatusResult[`player${i}`];
      const user = json ? JSON.parse(json) : null;
      if (user) {
        isAllUserLeft = false;
        if (roomStatusResult.roomStatus === exports.ROOM_STATUS.PLAYING && user.status !== exports.PLAYER_STATUS.PLAYING)
          user.status = exports.PLAYER_STATUS.WAITING;
        if (user.status !== exports.PLAYER_STATUS.READY)
          isAllReady = false;
      }
      roomUsers.push(user);
    }

    if (isAllUserLeft) {
      // all user left the room.
      await exports.deleteRoom(roomId);
      await roomBet.deleteRoom(roomId);
      createdRoomsByThisNode.delete(roomId);
      return;
    }

    if (!isAllReady) {
      // update room users
      io.to(roomId).emit('roomUsers', roomUsers);
      return;
    }

    // start game
    const gameStartStatus = {
      roomStatus: exports.ROOM_STATUS.PLAYING,
    };

    for (let i=0;i<exports.MAX_ROOM_USERS_COUNT;i++) {
      const user = roomUsers[i];
      if (user) {
        user.status = exports.PLAYER_STATUS.PLAYING;
        gameStartStatus[`player${i+1}`] = JSON.stringify(user);
      }
    }
    await exports.setRoomStatus(roomId, gameStartStatus);

    const playingPlayers = roomUsers.reduce((acc, user) => acc + (user ? 1 : 0), 0);
    await roomBet.reset(roomId, playingPlayers);
    io.to(roomId).emit('sysMessage', 'Game start.');
    io.to(roomId).emit('resetGameBet', '');
  });
};

exports.getRoomStatus = async (roomId)=>{
  const redisKey = getRedisKey(roomId);
  const result = await redis.hgetallAsync(redisKey);
  return result;
};

exports.setRoomStatus = async(roomId, setData)=>{
  const redisKey = getRedisKey(roomId);
  await redis.hmsetAsync(redisKey, setData);
};

exports.joinRoom = async (roomId, userId, username) => {
  const redisKey = getRedisKey(roomId);

  const isCreated = await redis.hsetnxAsync(redisKey, 'roomStatus', exports.ROOM_STATUS.WAITING);
  if (isCreated) createdRoomsByThisNode.add(roomId);

  const roomStatusResult = await redis.hgetAsync(redisKey, 'roomStatus');

  let playerStatus = roomStatusResult === exports.ROOM_STATUS.WAITING ?
    exports.PLAYER_STATUS.NOT_READY : exports.PLAYER_STATUS.WAITING;

  let setPlayerResult = 0, playerRoomNumber = 1;
  for (;playerRoomNumber<=exports.MAX_ROOM_USERS_COUNT;playerRoomNumber+=1) {
    setPlayerResult = await redis.hsetnxAsync(redisKey, `player${playerRoomNumber}`, JSON.stringify({ userId, username, status: playerStatus }));
    if (setPlayerResult) break;
  }
  if (!setPlayerResult) throw new Error('The room is full');

  return playerRoomNumber;
};


exports.leaveRoom = async(roomId, playerNumber)=>{
  const redisKey = getRedisKey(roomId);

  await redis.hdelAsync(redisKey, `player${playerNumber}`);
};

exports.deleteRoom = async (roomId) => {
  const redisKey = getRedisKey(roomId);
  await redis.delAsync(redisKey);
};

exports.getRoomIds = async () => {
  const prefix = getRedisKey('');
  const keys = await redis.keysAsync(prefix+'*');
  return keys.map(key =>key.replace(prefix, ''));
};

exports.getPlayer = async (roomId, num) => {
  const redisKey = getRedisKey(roomId);
  const result = await redis.hgetAsync(redisKey, `player${num}`);
  return result;
};

exports.toWaiting = async (roomId) => {
  const roomStatusResult = await exports.getRoomStatus(roomId);

  const roomUsers = [];
  for (let i = 1; i <= exports.MAX_ROOM_USERS_COUNT; i++) {
    const json = roomStatusResult[`player${i}`];
    const user = json ? JSON.parse(json) : null;
    roomUsers.push(user);
  }

  const gameEndStatus = {
    roomStatus: exports.ROOM_STATUS.WAITING,
  };
  for (let i=0;i<exports.MAX_ROOM_USERS_COUNT;i++) {
    const user = roomUsers[i];
    if (user) {
      user.status = exports.PLAYER_STATUS.NOT_READY;
      gameEndStatus[`player${i+1}`] = JSON.stringify(user);
    }
  }

  await exports.setRoomStatus(roomId, gameEndStatus);
};