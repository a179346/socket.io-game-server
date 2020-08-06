module.exports = function (server) {
  const socketio = require('socket.io');
  const redisAdapter = require('socket.io-redis');
  const redisConfig = require('./config').redis;
  const roomStatus = require('./dao/roomStatus');
  const roomBet = require('./dao/roomBet');
  const { serverStatus } = require('./system/serverStatus');

  const io = socketio(server);
  io.adapter(redisAdapter(redisConfig.pubsub));
  roomStatus.initValueChangeEvent(io);
  roomBet.initValueChangeEvent(io);

  io.on('connection', (socket) => {
    onHandle(socket, 'joinRoom', async ({ username, roomId }) => {
      const userId = socket.id;
      serverStatus.sockets.add(socket);
      socket.join(roomId);

      const number = await roomStatus.joinRoom(roomId, userId, username);
      socket.payload = { userId, username, number, roomId };

      io.to(roomId).emit('sysMessage', username + ' join the room.');
      socket.emit('userId', userId);
    });

    onHandle(socket, 'ready', async () => {
      const { userId, username, roomId, number } = socket.payload;
      const setPlayerData = {};
      setPlayerData[`player${number}`] = JSON.stringify({ userId, username, status: roomStatus.PLAYER_STATUS.READY });

      await roomStatus.setRoomStatus(roomId, setPlayerData);
    });

    onHandle(socket, 'bet', async (betIndex) => {
      const { roomId, number } = socket.payload;
      await roomBet.bet(roomId, number, betIndex);
    });

    onHandle(socket, 'disconnect', async () => {
      serverStatus.sockets.delete(socket);
      if (socket.payload) {
        const { roomId, number } = socket.payload;
        await roomBet.leaveRoom(roomId, number);
        await roomStatus.leaveRoom(roomId, number);
      }
    });
  });

  function onHandle (socket, event, callBack) {
    socket.on(event, async (...data) => {
      try {
        if (serverStatus.status !== 'running' && event !== 'disconnect') throw new Error('server is shutting down');
        await callBack(...data);
      } catch (error) {
        console.error(error);
        socket.emit('customError', error.message);
      }
    });
  }
};