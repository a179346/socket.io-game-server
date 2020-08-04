const createdRoomsByThisNode = require('./createdRoomsByThisNode').createdRoomsByThisNode;
const { serverStatus } = require('./serverStatus');

const cleanUp = function (type) {
  console.log('[graceful shutdown start] receive: ' + type);

  serverStatus.status = 'shutdown';
  console.log('[graceful shutdown] disconnecting sockets ...');
  const sockets = Array.from(serverStatus.sockets);
  for (let socket of sockets) {
    socket.emit('customError', 'server shut down');
    socket.disconnect();
  }

  const redis = require('../utils/redis');
  redis.client.sadd('createdRoomsByThisNode', Array.from(createdRoomsByThisNode), () => {
    setTimeout(() => {
      console.log('[graceful shutdown] Closing http server ...');
      serverStatus.server.close(() => {
        console.log('[graceful shutdown] disconnecting redis ...');
        redis.quit();
        setTimeout(() => {
          console.log('[graceful shutdown end]');
          process.exit(0);
        }, 1000);
      });
    }, 2000);
  });
};

process.on('SIGTERM', function () {
  cleanUp('SIGTERM');
});

process.on('SIGINT', function () {
  cleanUp('SIGINT');
});