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

const redisAdapter = require('socket.io-redis');
const redisConfig = require('./config').redis;
io.adapter(redisAdapter(redisConfig.pubsub));

const serverStatus = { status: 'running', sockets: [], server };
gracefulShutDown.createCleanUpFunction(serverStatus);

roomStatus.initValueChangeEvent(io);
roomBet.initValueChangeEvent(io);

app.get('/roomIds', async(req, res) => {
  const roomIds = await roomStatus.getRoomIds();
  res.send(roomIds);
});

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
    serverStatus.sockets.push(socket);
    socket.join(roomId);

    const number = await roomStatus.joinRoom(roomId, userId, username);
    socket.payload = { userId, username, number, roomId };

    io.to(roomId).emit('sysMessage', username + ' join the room.');
    socket.emit('userId', userId);
  });

  socket.onHandel('ready', async () => {
    const { userId, username, roomId, number } = socket.payload;
    const setPlayerData = {};
    setPlayerData[`player${number}`] = JSON.stringify({ userId, username, status: roomStatus.PLAYER_STATUS.READY });

    await roomStatus.setRoomStatus(roomId, setPlayerData);
  });

  socket.onHandel('bet', async (betIndex)=>{
    const { roomId, number } = socket.payload;
    await roomBet.bet(roomId, number, betIndex);
  });

  socket.onHandel('disconnect', async () => {
    serverStatus.sockets = serverStatus.sockets.filter(s=> s!==socket);
    if (socket.payload) {
      const { roomId, number } = socket.payload;
      await roomBet.leaveRoom(roomId, number);
      await roomStatus.leaveRoom(roomId, number);
    }
  });
});

server.listen(process.env.PORT, function() {
  console.log('server listening on port '+ process.env.PORT);
});
