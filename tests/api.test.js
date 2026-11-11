'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { createTaskStore } = require('../src/db');

describe('API /api/tasks', () => {
  let store;
  let app;

  beforeEach(() => {
    store = createTaskStore(':memory:');
    app = createApp(store);
  });

  afterEach(() => {
    store.close();
  });

  const create = (body) => request(app).post('/api/tasks').send(body);

  describe('POST /api/tasks', () => {
    test('crea una tarea y devuelve 201', async () => {
      const res = await create({ title: '  Estudiar  ', description: 'Node.js' });
      assert.equal(res.status, 201);
      assert.equal(res.body.title, 'Estudiar');
      assert.equal(res.body.description, 'Node.js');
      assert.equal(res.body.completed, false);
    });

    test('rechaza un título vacío o ausente', async () => {
      for (const body of [{}, { title: '' }, { title: '   ' }, { title: 123 }]) {
        const res = await create(body);
        assert.equal(res.status, 400, JSON.stringify(body));
        assert.ok(res.body.errors.length > 0);
      }
    });

    test('rechaza un título demasiado largo', async () => {
      const res = await create({ title: 'x'.repeat(201) });
      assert.equal(res.status, 400);
    });

    test('rechaza JSON mal formado', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Content-Type', 'application/json')
        .send('{"title":');
      assert.equal(res.status, 400);
    });
  });

  describe('GET /api/tasks', () => {
    test('lista las tareas creadas', async () => {
      await create({ title: 'Una' });
      await create({ title: 'Dos' });
      const res = await request(app).get('/api/tasks');
      assert.equal(res.status, 200);
      assert.deepEqual(
        res.body.map((t) => t.title),
        ['Dos', 'Una']
      );
    });

    test('obtiene una tarea por id o devuelve 404', async () => {
      const { body } = await create({ title: 'Una' });
      assert.equal((await request(app).get(`/api/tasks/${body.id}`)).status, 200);
      assert.equal((await request(app).get('/api/tasks/999')).status, 404);
      assert.equal((await request(app).get('/api/tasks/abc')).status, 404);
    });
  });

  describe('PUT /api/tasks/:id', () => {
    test('edita título y descripción', async () => {
      const { body } = await create({ title: 'Original' });
      const res = await request(app)
        .put(`/api/tasks/${body.id}`)
        .send({ title: 'Editada', description: 'nueva' });
      assert.equal(res.status, 200);
      assert.equal(res.body.title, 'Editada');
      assert.equal(res.body.description, 'nueva');
    });

    test('permite marcar como completada', async () => {
      const { body } = await create({ title: 'A' });
      const res = await request(app).put(`/api/tasks/${body.id}`).send({ completed: true });
      assert.equal(res.status, 200);
      assert.equal(res.body.completed, true);
      assert.equal(res.body.title, 'A');
    });

    test('valida los datos', async () => {
      const { body } = await create({ title: 'A' });
      const cases = [{}, { title: '' }, { completed: 'yes' }, { description: 5 }];
      for (const payload of cases) {
        const res = await request(app).put(`/api/tasks/${body.id}`).send(payload);
        assert.equal(res.status, 400, JSON.stringify(payload));
      }
    });

    test('devuelve 404 si la tarea no existe', async () => {
      const res = await request(app).put('/api/tasks/999').send({ title: 'x' });
      assert.equal(res.status, 404);
    });
  });

  describe('PATCH /api/tasks/:id/toggle', () => {
    test('alterna el estado de completada', async () => {
      const { body } = await create({ title: 'A' });
      const first = await request(app).patch(`/api/tasks/${body.id}/toggle`);
      assert.equal(first.body.completed, true);
      const second = await request(app).patch(`/api/tasks/${body.id}/toggle`);
      assert.equal(second.body.completed, false);
    });

    test('devuelve 404 si la tarea no existe', async () => {
      const res = await request(app).patch('/api/tasks/999/toggle');
      assert.equal(res.status, 404);
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    test('elimina la tarea y devuelve 204', async () => {
      const { body } = await create({ title: 'A' });
      const res = await request(app).delete(`/api/tasks/${body.id}`);
      assert.equal(res.status, 204);
      assert.equal((await request(app).get(`/api/tasks/${body.id}`)).status, 404);
    });

    test('devuelve 404 si la tarea no existe', async () => {
      const res = await request(app).delete('/api/tasks/999');
      assert.equal(res.status, 404);
    });
  });

  test('sirve la interfaz web en /', async () => {
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    assert.match(res.text, /Gestor de tareas/);
  });

  test('devuelve 404 JSON para rutas de API desconocidas', async () => {
    const res = await request(app).get('/api/desconocida');
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });

  describe('GET /api/tasks con parámetros', () => {
    beforeEach(async () => {
      await create({ title: 'Comprar pan', description: 'Panadería' });
      await create({ title: 'Estudiar Node' });
      await create({ title: 'Llamar al banco' });
      await request(app).patch('/api/tasks/1/toggle');
    });

    const get = (qs) => request(app).get(`/api/tasks${qs}`);
    const titles = (res) => res.body.map((t) => t.title);

    test('filtra por estado', async () => {
      assert.deepEqual(titles(await get('?status=completed')), ['Comprar pan']);
      assert.deepEqual(titles(await get('?status=pending')), ['Llamar al banco', 'Estudiar Node']);
    });

    test('busca por texto', async () => {
      assert.deepEqual(titles(await get('?q=pan')), ['Comprar pan']);
      assert.deepEqual(titles(await get('?q=%25')), []);
    });

    test('ordena por fecha de creación', async () => {
      assert.deepEqual(titles(await get('?sort=created_asc')), ['Comprar pan', 'Estudiar Node', 'Llamar al banco']);
      assert.deepEqual(titles(await get('?sort=created_desc')), ['Llamar al banco', 'Estudiar Node', 'Comprar pan']);
    });

    test('combina parámetros', async () => {
      assert.deepEqual(titles(await get('?status=pending&q=node&sort=created_asc')), ['Estudiar Node']);
    });

    test('rechaza parámetros inválidos con 400', async () => {
      for (const qs of ['?status=x', '?sort=x', `?q=${'x'.repeat(201)}`, '?q=a&q=b']) {
        const res = await get(qs);
        assert.equal(res.status, 400, qs);
        assert.ok(res.body.errors.length > 0);
      }
    });
  });
});
