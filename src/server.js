import http from 'http';
import { Server } from 'socket.io';
import app from './app.js';
import connectDB from './config/db.js';
import config from './config/index.js';
import initSocket from './socket/index.js';

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: config.clientUrl,
    credentials: true,
  },
});

app.set('io', io);
initSocket(io);

const start = async () => {
  await connectDB();
  server.listen(config.port, () => {
    console.log(`Server running on http://localhost:${config.port}`);
  });
};

start();
