require('./system/initEnv.js');
const http = require('http');
const express = require('express');
const cors = require('cors');
require('./system/gracefulShutDown');
const roomStatus = require('./dao/roomStatus');
const wsServer = require('./wsServer');

const app = express();
app.use(cors());
const server = http.createServer(app);
const { initServerStatus } = require('./system/serverStatus');
initServerStatus(server);
wsServer(server);

app.get('/roomIds', async (req, res) => {
  const roomIds = await roomStatus.getRoomIds();
  res.send(roomIds);
});

server.listen(process.env.PORT, function () {
  console.log('server listening on port ' + process.env.PORT);
});
