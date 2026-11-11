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
    assert.match(res.text, /type="date"/);
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

    test('busca sin distinguir mayúsculas con acentos', async () => {
      await create({ title: 'Árbol Ñandú' });
      assert.deepEqual(titles(await get('?q=%C3%A1rbol')), ['Árbol Ñandú']);
      assert.deepEqual(titles(await get('?q=%C3%B1and%C3%BA')), ['Árbol Ñandú']);
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

  describe('fecha límite (dueDate)', () => {
    const get = (qs = '') => request(app).get(`/api/tasks${qs}`);
    const titles = (res) => res.body.map((t) => t.title);

    test('POST acepta una fecha válida, su ausencia o null', async () => {
      const withDate = await create({ title: 'A', dueDate: '2026-05-01' });
      assert.equal(withDate.status, 201);
      assert.equal(withDate.body.dueDate, '2026-05-01');
      const without = await create({ title: 'B' });
      assert.equal(without.status, 201);
      assert.equal(without.body.dueDate, null);
      const nul = await create({ title: 'C', dueDate: null });
      assert.equal(nul.status, 201);
      assert.equal(nul.body.dueDate, null);
    });

    test('POST rechaza fechas inválidas con 400 y errors', async () => {
      const invalid = [
        '2026-02-30', '2026-13-01', '2026-5-1', '01/05/2026', '',
        '2026-05-01T10:00:00Z', ' 2026-05-01', 20260501, true, {}, [], '0000-01-01', '2026-02-29',
      ];
      for (const dueDate of invalid) {
        const res = await create({ title: 'X', dueDate });
        assert.equal(res.status, 400, JSON.stringify(dueDate));
        assert.ok(res.body.errors.length > 0, JSON.stringify(dueDate));
      }
      assert.deepEqual((await get()).body, []);
    });

    test('POST acepta el 29 de febrero de un año bisiesto', async () => {
      const res = await create({ title: 'Bisiesto', dueDate: '2024-02-29' });
      assert.equal(res.status, 201);
      assert.equal(res.body.dueDate, '2024-02-29');
    });

    test('POST y PUT gestionan fechas de los años 0001-0099', async () => {
      const leap = await create({ title: 'Bisiesto 4', dueDate: '0004-02-29' });
      assert.equal(leap.status, 201);
      assert.equal(leap.body.dueDate, '0004-02-29');
      const first = await create({ title: 'Año 1', dueDate: '0001-01-01' });
      assert.equal(first.status, 201);
      assert.equal(first.body.dueDate, '0001-01-01');

      for (const dueDate of ['0050-02-29', '0000-01-01']) {
        const res = await create({ title: 'X', dueDate });
        assert.equal(res.status, 400, dueDate);
        assert.ok(res.body.errors.length > 0, dueDate);
      }

      const { body } = await create({ title: 'Para PUT' });
      const ok = await request(app).put(`/api/tasks/${body.id}`).send({ dueDate: '0004-02-29' });
      assert.equal(ok.status, 200);
      assert.equal(ok.body.dueDate, '0004-02-29');
      for (const dueDate of ['0050-02-29', '0000-01-01']) {
        const res = await request(app).put(`/api/tasks/${body.id}`).send({ dueDate });
        assert.equal(res.status, 400, dueDate);
        assert.ok(res.body.errors.length > 0, dueDate);
      }
      assert.equal((await request(app).get(`/api/tasks/${body.id}`)).body.dueDate, '0004-02-29');
    });

    test('PUT cambia la fecha conservando el resto de campos', async () => {
      const { body } = await create({ title: 'A', description: 'd' });
      const res = await request(app).put(`/api/tasks/${body.id}`).send({ dueDate: '2026-06-01' });
      assert.equal(res.status, 200);
      assert.equal(res.body.dueDate, '2026-06-01');
      assert.equal(res.body.title, 'A');
      assert.equal(res.body.description, 'd');
    });

    test('PUT con null borra la fecha', async () => {
      const { body } = await create({ title: 'A', dueDate: '2026-05-01' });
      const res = await request(app).put(`/api/tasks/${body.id}`).send({ dueDate: null });
      assert.equal(res.status, 200);
      assert.equal(res.body.dueDate, null);
      assert.equal(res.body.title, 'A');
    });

    test('PUT sin dueDate conserva la fecha', async () => {
      const { body } = await create({ title: 'A', dueDate: '2026-05-01' });
      const res = await request(app).put(`/api/tasks/${body.id}`).send({ title: 'B' });
      assert.equal(res.status, 200);
      assert.equal(res.body.title, 'B');
      assert.equal(res.body.dueDate, '2026-05-01');
    });

    test('PUT rechaza una fecha inválida y mantiene la anterior; {} sigue siendo 400', async () => {
      const { body } = await create({ title: 'A', dueDate: '2026-05-01' });
      for (const dueDate of ['2026-02-30', '', 20260501, '2026-05-01T10:00:00Z']) {
        const res = await request(app).put(`/api/tasks/${body.id}`).send({ dueDate });
        assert.equal(res.status, 400, JSON.stringify(dueDate));
        assert.ok(res.body.errors.length > 0);
      }
      assert.equal((await request(app).put(`/api/tasks/${body.id}`).send({})).status, 400);
      assert.equal((await request(app).get(`/api/tasks/${body.id}`)).body.dueDate, '2026-05-01');
    });

    test('PATCH toggle conserva la fecha', async () => {
      const { body } = await create({ title: 'A', dueDate: '2026-05-01' });
      const first = await request(app).patch(`/api/tasks/${body.id}/toggle`);
      assert.equal(first.body.completed, true);
      assert.equal(first.body.dueDate, '2026-05-01');
      const second = await request(app).patch(`/api/tasks/${body.id}/toggle`);
      assert.equal(second.body.dueDate, '2026-05-01');
    });

    test('GET sort=due_asc ordena por fecha con las tareas sin fecha al final', async () => {
      await create({ title: 'A', dueDate: '2026-03-01' });
      await create({ title: 'B' });
      await create({ title: 'C', dueDate: '2026-01-01' });
      await create({ title: 'D', dueDate: '2026-03-01' });
      const res = await get('?sort=due_asc');
      assert.equal(res.status, 200);
      assert.deepEqual(titles(res), ['C', 'D', 'A', 'B']);
    });

    test('GET sort=due_desc es inválido (400)', async () => {
      const res = await get('?sort=due_desc');
      assert.equal(res.status, 400);
      assert.ok(res.body.errors.length > 0);
    });

    test('GET sort=due_asc se combina con status y q', async () => {
      await create({ title: 'Pan tarde', dueDate: '2026-05-01' });
      await create({ title: 'Pan pronto', dueDate: '2026-02-01' });
      await create({ title: 'Leche', dueDate: '2026-01-01' });
      const hecho = await create({ title: 'Pan hecho', dueDate: '2026-01-15' });
      await request(app).patch(`/api/tasks/${hecho.body.id}/toggle`);
      assert.deepEqual(titles(await get('?sort=due_asc&status=pending')), ['Leche', 'Pan pronto', 'Pan tarde']);
      assert.deepEqual(titles(await get('?sort=due_asc&status=pending&q=pan')), ['Pan pronto', 'Pan tarde']);
      assert.deepEqual(titles(await get('?sort=due_asc&q=pan')), ['Pan hecho', 'Pan pronto', 'Pan tarde']);
    });
  });
});
