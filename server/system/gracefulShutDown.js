const { quit:quitNode } = require('./createdRoomsByThisNode');
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

  // wait all sockets disconnected
  setTimeout(() => {
    quitNode(() => {
      console.log('[graceful shutdown] Closing http server ...');
      serverStatus.server.close(() => {
        const redis = require('../utils/redis');
        console.log('[graceful shutdown] disconnecting redis ...');
        redis.quit(() => {
          console.log('[graceful shutdown end]');
          process.exit(0);
        });
      });
    });
  }, 2000);
};

process.on('SIGTERM', function () {
  cleanUp('SIGTERM');
});

process.on('SIGINT', function () {
  cleanUp('SIGINT');
});