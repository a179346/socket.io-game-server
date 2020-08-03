const redis = require('../utils/redis');
const createRoomRace = require('./createRoomRace');

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

const getRedisKey = (roomId)=>`roomStatus:${roomId}`;

exports.isRoomExist = async(roomId)=>{
  const redisKey = getRedisKey(roomId);
  const result = await redis.existsAsync(redisKey);
  return result;
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


exports.createRoom = async(roomId, userId, username)=>{
  // const roomStatus = await exports.getRoomStatus(roomId);
  // if (roomStatus) throw new Error('The room has been created.');
  const roomRaceResult = await createRoomRace.createRoomRace(roomId);
  if (!roomRaceResult)  throw new Error('The room has been created.');

  await exports.setRoomStatus(roomId, {
    player1: JSON.stringify({ userId, username, status:exports.PLAYER_STATUS.NOT_READY }),
    roomStatus: exports.ROOM_STATUS.WAITING,
  });
};

exports.joinRoom = async(roomId, userId, username, retryCount = 0)=>{
  if (retryCount >= 5) throw new Error('join room fail');
  let roomStatusResult = await exports.getRoomStatus(roomId);

  if (!roomStatusResult) {
    try {
      await exports.createRoom(roomId, userId, username);
    } catch (error) {
      retryCount += 1;
      return (await exports.joinRoom(roomId, userId, username, retryCount));
    }
  } else {
    const redisKey = getRedisKey(roomId);
    let playerStatus = roomStatusResult.roomStatus === exports.ROOM_STATUS.WAITING ?
      exports.PLAYER_STATUS.NOT_READY : exports.PLAYER_STATUS.WAITING;
    let setPlayerResult = 0;
    for (let playerRoomNumber = 1; playerRoomNumber<=exports.MAX_ROOM_USERS_COUNT;playerRoomNumber+=1) {
      setPlayerResult = await redis.hsetnxAsync(redisKey, `player${playerRoomNumber}`, JSON.stringify({ userId, username, status: playerStatus }));
      if (setPlayerResult) break;
    }
    if (!setPlayerResult) throw new Error('The room is full');
  }

  roomStatusResult = await exports.getRoomStatus(roomId);
  return roomStatusResult;
};