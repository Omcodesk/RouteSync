/**
 * server.js - Local development server (no XAMPP required).
 * Serves A-Frontend + API + Socket.IO on one port.
 */
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { createApp, ensureReady } = require('./createApp');
const store = require('./lib/store');

const PORT = Number(process.env.PORT || 3000);
const FRONTEND_DIR = path.join(__dirname, '..', 'A-Frontend');

const server = http.createServer();
const io = new Server(server, { cors: { origin: '*' } });
const app = createApp({ io });

app.use(express.static(FRONTEND_DIR));
app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

server.on('request', app);

io.on('connection', async (sock) => {
  console.log('socket connected:', sock.id);
  try {
    sock.emit('buses_snapshot', await store.getAllBuses());
  } catch (e) {
    console.warn('failed to emit buses_snapshot:', e && e.message);
  }
});

ensureReady().then(() => {
  server.listen(PORT, () => {
    console.log('RouteSync running at http://localhost:' + PORT);
    console.log('Storage:', store.usingRedis() ? 'Upstash Redis' : 'local JSON + memory');
  });
});
