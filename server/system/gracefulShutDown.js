const redis = require('../utils/redis');
exports.createCleanUpFunction = function (serverStatus) {
  const cleanUp = function (type) {
    console.log('[graceful shutdown start] receive: ' + type);

    serverStatus.status = 'shutdown';
    console.log('[graceful shutdown] disconnecting sockets ...');
    for (let socket of serverStatus.sockets) {
      socket.emit('customError', 'server shut down');
      socket.disconnect();
    }

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
  };

  process.on('SIGTERM', function () {
    cleanUp('SIGTERM');
  });

  process.on('SIGINT', function () {
    cleanUp('SIGINT');
  });
};