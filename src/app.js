'use strict';

const path = require('node:path');
const express = require('express');
const { createTasksRouter } = require('./routes/tasks');

function createApp(store) {
  const app = express();

  app.use(express.json({ limit: '10kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/api/tasks', createTasksRouter(store));

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada.' });
  });

  // Manejo centralizado de errores (JSON mal formado, etc.).
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ errors: ['El cuerpo de la petición no es JSON válido.'] });
    }
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  });

  return app;
}

module.exports = { createApp };
