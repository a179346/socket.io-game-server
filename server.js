require('./system/initEnv.js');
const http = require('http');
const express = require('express');
const socketio = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

io.on('connection', socket=>{

  socket.on('disconnect', ()=>{

  });
});


server.listen(process.env.PORT, function() {
  console.log('server listening on port '+ process.env.PORT);
});
