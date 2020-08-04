exports.serverStatus = { status: 'running', sockets: new Set() };

exports.initServerStatus = function (server) {
  exports.serverStatus.server = server;
};