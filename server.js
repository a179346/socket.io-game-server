require('./system/initEnv.js');
const http = require('http');
const express = require('express');
const socketio = require('socket.io');
const roomStatus = require('./dao/roomStatus');
const roomBet = require('./dao/roomBet');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

io.on('connection', socket=>{
  socket.on('joinRoom', async ({ username, roomId })=>{
    const userId = socket.id;
    const roomStatusResult = await roomStatus.joinRoom(roomId, userId, username);

    socket.join(roomId);

    const roomUsers = formatRoomUsers(roomStatusResult);
    const number = (roomUsers.findIndex(u=>(u && u.userId === userId) + 1));
    socket.payload = { userId, username, number, roomId };

    io.to(roomId).emit('sysMessage', username + ' join the room.');
    io.to(roomId).emit('roomUsers', roomUsers);

    socket.emit('playerStatus', roomUsers[number-1].status);
  });

  socket.on('ready', async ()=>{
    const { userId, username, roomId, number } = socket.payload;
    const setPlayerData = {};
    setPlayerData[`player${number}`] = JSON.stringify({ userId, username, status: roomStatus.PLAYER_STATUS.READY });
    await roomStatus.setRoomStatus(roomId, setPlayerData);

    let roomStatusResult = await roomStatus.getRoomStatus(roomId);
    const roomUsers = formatRoomUsers(roomStatusResult);

    if (!isAllReady(roomUsers)) {
      socket.emit('playerStatus', roomUsers[number-1].status);
      // update room users
      io.to(roomId).emit('roomUsers', roomUsers);
      return;
    }
    // Everyone is ready then start the game
    const gameStartStatus = formatGameStartStatus(roomUsers);
    await roomStatus.setRoomStatus(roomId, gameStartStatus);
    roomStatusResult = await roomStatus.getRoomStatus(roomId);
    await roomBet.reset(roomId);
    io.to(roomId).emit('sysMessage', 'Game start.');
    io.to(roomId).emit('roomUsers', formatRoomUsers(roomStatusResult));
    io.to(roomId).emit('playerStatus', roomStatus.PLAYER_STATUS.PLAYING);
  });

  socket.on('bet', async (betIndex)=>{
    const { userId, username, roomId, number } = socket.payload;
    const betResult = await roomBet.bet(roomId, number, betIndex);
    if (!betResult) return;
    let totalBetPlayer = 0;
    for (let num of betResult) {
      if (num) totalBetPlayer+=1;
    }
    let roomStatusResult = await roomStatus.getRoomStatus(roomId);
    const roomUsers = formatRoomUsers(roomStatusResult);
    const playings = playingPlayerCount(roomUsers);
    if (totalBetPlayer <= playings) {
      io.to(roomId).emit('gameBet', { betResult });
      return;
    }
  });

  socket.on('disconnect', ()=>{

  });
});

function formatRoomUsers(roomStatusResult) {
  const roomUsers = [];
  for (let i=1;i<=roomStatus.MAX_ROOM_USERS_COUNT;i++) {
    const user = JSON.parse(roomStatusResult[`player${i}`]);
    roomUsers.push(user);
  }
  return roomUsers;
}

function isAllReady(roomUsers) {
  for (let user of roomUsers) {
    if (user && user.status !== roomStatus.PLAYER_STATUS.READY)
      return false;
  }
  return true;
}

function playingPlayerCount(roomUsers) {
  let count = 0;
  for (let user of roomUsers) {
    if (user && user.status === roomStatus.PLAYER_STATUS.PLAYING)
      count += 1;
  }
  return count;
}

function formatGameStartStatus(roomUsers) {
  const gameStartStatus = {
    roomStatus: roomStatus.ROOM_STATUS.PLAYING,
  };
  for (let i=0;i<roomStatus.MAX_ROOM_USERS_COUNT;i++) {
    const user = roomUsers[i];
    if (user) {
      user.status = roomStatus.PLAYER_STATUS.PLAYING;
      gameStartStatus[`player${i+1}`] = JSON.stringify(user);
    }
  }
  return gameStartStatus;
}

server.listen(process.env.PORT, function() {
  console.log('server listening on port '+ process.env.PORT);
});
