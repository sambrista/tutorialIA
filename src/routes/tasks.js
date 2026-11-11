'use strict';

const express = require('express');

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 2000;

/** Comprueba que `s` es una fecha real con formato AAAA-MM-DD. */
function isCalendarDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1) return false;
  const date = new Date(Date.UTC(y, mo - 1, d));
  date.setUTCFullYear(y); // Date.UTC trata los años 0-99 como 1900-1999
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/**
 * Valida el cuerpo de una petición. Con `partial` los campos son opcionales.
 * Devuelve { errors, data } con los campos normalizados.
 */
function validate(body, { partial = false } = {}) {
  const errors = [];
  const data = {};
  body = body && typeof body === 'object' ? body : {};

  if (body.title !== undefined || !partial) {
    if (typeof body.title !== 'string' || body.title.trim() === '') {
      errors.push('El título es obligatorio.');
    } else if (body.title.trim().length > MAX_TITLE) {
      errors.push(`El título no puede superar ${MAX_TITLE} caracteres.`);
    } else {
      data.title = body.title.trim();
    }
  }

  if (body.description !== undefined) {
    if (typeof body.description !== 'string') {
      errors.push('La descripción debe ser texto.');
    } else if (body.description.length > MAX_DESCRIPTION) {
      errors.push(`La descripción no puede superar ${MAX_DESCRIPTION} caracteres.`);
    } else {
      data.description = body.description.trim();
    }
  }

  if (body.completed !== undefined) {
    if (typeof body.completed !== 'boolean') {
      errors.push('El campo completed debe ser booleano.');
    } else {
      data.completed = body.completed;
    }
  }

  if (body.dueDate !== undefined) {
    if (body.dueDate === null) {
      data.dueDate = null;
    } else if (typeof body.dueDate !== 'string' || !isCalendarDate(body.dueDate)) {
      errors.push('La fecha límite debe ser una fecha válida con formato AAAA-MM-DD o null.');
    } else {
      data.dueDate = body.dueDate;
    }
  }

  if (partial && errors.length === 0 && Object.keys(data).length === 0) {
    errors.push('No se ha indicado ningún campo a modificar.');
  }

  return { errors, data };
}

const STATUSES = ['all', 'pending', 'completed'];
const SORTS = ['created_desc', 'created_asc', 'due_asc'];

/** Valida los parámetros de consulta de GET /. Devuelve { errors, options }. */
function validateQuery(query) {
  const errors = [];
  const options = {};
  const { status, q, sort } = query;

  if (status !== undefined) {
    if (!STATUSES.includes(status)) errors.push(`status debe ser uno de: ${STATUSES.join(', ')}.`);
    else options.status = status;
  }
  if (q !== undefined) {
    if (typeof q !== 'string') errors.push('q debe ser texto.');
    else if (q.trim().length > MAX_TITLE) errors.push(`q no puede superar ${MAX_TITLE} caracteres.`);
    else options.q = q.trim();
  }
  if (sort !== undefined) {
    if (!SORTS.includes(sort)) errors.push(`sort debe ser uno de: ${SORTS.join(', ')}.`);
    else options.sort = sort;
  }
  return { errors, options };
}

function createTasksRouter(store) {
  const router = express.Router();

  // Convierte :id en número y responde 404 si no es válido.
  router.param('id', (req, res, next, raw) => {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(404).json({ error: 'Tarea no encontrada.' });
    }
    req.taskId = id;
    next();
  });

  router.get('/', (req, res) => {
    const { errors, options } = validateQuery(req.query);
    if (errors.length) return res.status(400).json({ errors });
    res.json(store.list(options));
  });

  router.get('/:id', (req, res) => {
    const task = store.get(req.taskId);
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada.' });
    res.json(task);
  });

  router.post('/', (req, res) => {
    const { errors, data } = validate(req.body);
    if (errors.length) return res.status(400).json({ errors });
    res.status(201).json(store.create(data));
  });

  router.put('/:id', (req, res) => {
    const { errors, data } = validate(req.body, { partial: true });
    if (errors.length) return res.status(400).json({ errors });
    const task = store.update(req.taskId, data);
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada.' });
    res.json(task);
  });

  router.patch('/:id/toggle', (req, res) => {
    const current = store.get(req.taskId);
    if (!current) return res.status(404).json({ error: 'Tarea no encontrada.' });
    res.json(store.update(req.taskId, { completed: !current.completed }));
  });

  router.delete('/:id', (req, res) => {
    if (!store.remove(req.taskId)) {
      return res.status(404).json({ error: 'Tarea no encontrada.' });
    }
    res.status(204).end();
  });

  return router;
}

module.exports = { createTasksRouter, validate };
