'use strict';

const path = require('node:path');
const { createApp } = require('./app');
const { createTaskStore } = require('./db');

const PORT = Number(process.env.PORT) || 3000;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'tasks.db');

const store = createTaskStore(DB_FILE);
const server = createApp(store).listen(PORT, () => {
  console.log(`Gestor de tareas disponible en http://localhost:${PORT}`);
});

function shutdown() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
