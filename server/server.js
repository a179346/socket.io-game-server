require('./system/initEnv.js');
const http = require('http');
const express = require('express');
const cors = require('cors');
const gracefulShutDown = require('./system/gracefulShutDown');
const socketio = require('socket.io');
const roomStatus = require('./dao/roomStatus');
const roomBet = require('./dao/roomBet');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = socketio(server);
const serverStatus = { status: 'running', sockets: [], server };
gracefulShutDown.createCleanUpFunction(serverStatus);

io.on('connection', socket => {
  socket.onHandel = function (event, callBack) {
    socket.on(event, async (...data) => {
      try {
        if (serverStatus.status !== 'running' && event !== 'disconnect') throw new Error('server is shutting down');
        await callBack(...data);
      } catch (error) {
        console.error(error);
        socket.emit('customError', error.message);
      }
    });
  };

  socket.onHandel('joinRoom', async ({ username, roomId }) => {
    const userId = socket.id;
    const roomStatusResult = await roomStatus.joinRoom(roomId, userId, username);

    socket.join(roomId);
    serverStatus.sockets.push(socket);

    const roomUsers = formatRoomUsers(roomStatusResult);
    const number = (roomUsers.findIndex(u => (u && u.userId === userId) ) + 1);
    socket.payload = { userId, username, number, roomId };

    io.to(roomId).emit('sysMessage', username + ' join the room.');
    io.to(roomId).emit('roomUsers', roomUsers);

    socket.emit('userId', userId);
  });

  socket.onHandel('ready', async () => {
    const { userId, username, roomId, number } = socket.payload;
    const setPlayerData = {};
    setPlayerData[`player${number}`] = JSON.stringify({ userId, username, status: roomStatus.PLAYER_STATUS.READY });

    await roomStatus.setRoomStatus(roomId, setPlayerData);

    let roomStatusResult = await roomStatus.getRoomStatus(roomId);
    const roomUsers = formatRoomUsers(roomStatusResult);

    if (!isAllReady(roomUsers)) {
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
    io.to(roomId).emit('resetGameBet', '');
    io.to(roomId).emit('roomUsers', formatRoomUsers(roomStatusResult));
  });

  socket.onHandel('bet', async (betIndex)=>{
    const { roomId, number } = socket.payload;
    const betResult = await roomBet.bet(roomId, number, betIndex);
    await gameEndCheck(betResult, roomId);
  });

  socket.onHandel('disconnect', async () => {
    serverStatus.sockets = serverStatus.sockets.filter(s=> s!==socket);
    if (socket.payload) {
      const { roomId, number } = socket.payload;
      const roomStatusResult = await roomStatus.leaveRoom(roomId, number);

      if (!roomStatusResult) {
        // nobody in the room
        await roomBet.deleteRoom(roomId);
        return;
      }

      // someone still in the room
      io.to(roomId).emit('roomUsers', formatRoomUsers(roomStatusResult));
      if (roomStatusResult.roomStatus === roomStatus.ROOM_STATUS.PLAYING) {
        // delete bet by this user
        let betResult = await roomBet.leaveRoom(roomId, number);
        if (!betResult) betResult = await roomBet.getGameBet(roomId);
        await gameEndCheck(betResult, roomId);
      }
    }
  });
});

async function gameEndCheck(betResult, roomId) {
  if (!betResult) return;

  let totalBetPlayer = 0;
  for (let num of betResult) {
    if (num) totalBetPlayer+=1;
  }
  let roomStatusResult = await roomStatus.getRoomStatus(roomId);
  const roomUsers = formatRoomUsers(roomStatusResult);
  const playings = playingPlayerCount(roomUsers);

  let gameBet = formatGameResult(betResult, totalBetPlayer >= playings);
  io.to(roomId).emit('gameBet', gameBet);
  if (totalBetPlayer < playings) return;

  // Everyone has bet => game end
  const winNumber = gameBet.find(b => b.isWin).betUserNum;
  if (!winNumber) io.to(roomId).emit('sysMessage', 'No body win :(');
  else io.to(roomId).emit('sysMessage', roomUsers[winNumber - 1].username + ' win !');

  const gameEndStatus = formatGameEndStatus(roomUsers);
  await roomStatus.setRoomStatus(roomId, gameEndStatus);
  roomStatusResult = await roomStatus.getRoomStatus(roomId);
  io.to(roomId).emit('roomUsers', formatRoomUsers(roomStatusResult));
}

function formatGameResult(betResult, getWin) {
  let winIdx = -1;
  if (getWin) winIdx = Math.floor(Math.random() * roomBet.BET_COUNT);
  return betResult.map((betUserNum, idx) => ({ betUserNum, isWin: idx === winIdx }));
}

function formatRoomUsers(roomStatusResult) {
  const roomUsers = [];
  for (let i = 1; i <= roomStatus.MAX_ROOM_USERS_COUNT; i++) {
    const json = roomStatusResult[`player${i}`];
    const user = json ? JSON.parse(json) : null;
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

function formatGameEndStatus(roomUsers) {
  const gameStartStatus = {
    roomStatus: roomStatus.ROOM_STATUS.WAITING,
  };
  for (let i=0;i<roomStatus.MAX_ROOM_USERS_COUNT;i++) {
    const user = roomUsers[i];
    if (user) {
      user.status = roomStatus.PLAYER_STATUS.NOT_READY;
      gameStartStatus[`player${i+1}`] = JSON.stringify(user);
    }
  }
  return gameStartStatus;
}

server.listen(process.env.PORT, function() {
  console.log('server listening on port '+ process.env.PORT);
});
