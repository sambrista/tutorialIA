'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createTaskStore } = require('../src/db');

describe('createTaskStore', () => {
  let store;

  beforeEach(() => {
    store = createTaskStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  describe('list con filtros', () => {
    beforeEach(() => {
      store.create({ title: 'Comprar pan', description: 'Panadería' });
      store.create({ title: 'Estudiar Node', description: 'Capítulo 100%' });
      store.create({ title: 'Llamar al banco', description: 'sobre el pan_' });
      store.update(1, { completed: true });
    });

    const titles = (opts) => store.list(opts).map((t) => t.title);

    test('sin opciones mantiene el orden por defecto', () => {
      assert.deepEqual(titles(), ['Llamar al banco', 'Estudiar Node', 'Comprar pan']);
    });

    test('filtra por estado', () => {
      assert.deepEqual(titles({ status: 'completed' }), ['Comprar pan']);
      assert.deepEqual(titles({ status: 'pending' }), ['Llamar al banco', 'Estudiar Node']);
      assert.equal(titles({ status: 'all' }).length, 3);
    });

    test('busca en título y descripción sin distinguir mayúsculas', () => {
      assert.deepEqual(titles({ q: 'PAN' }), ['Llamar al banco', 'Comprar pan']);
      assert.deepEqual(titles({ q: 'node' }), ['Estudiar Node']);
      assert.deepEqual(titles({ q: 'inexistente' }), []);
    });

    test('escapa los comodines % y _ de la búsqueda', () => {
      assert.deepEqual(titles({ q: '100%' }), ['Estudiar Node']);
      assert.deepEqual(titles({ q: 'pan_' }), ['Llamar al banco']);
      assert.deepEqual(titles({ q: '%' }), ['Estudiar Node']);
    });

    test('ordena por fecha de creación sin agrupar por estado', () => {
      assert.deepEqual(titles({ sort: 'created_asc' }), ['Comprar pan', 'Estudiar Node', 'Llamar al banco']);
      assert.deepEqual(titles({ sort: 'created_desc' }), ['Llamar al banco', 'Estudiar Node', 'Comprar pan']);
    });

    test('combina estado, búsqueda y orden', () => {
      assert.deepEqual(titles({ status: 'pending', q: 'pan', sort: 'created_asc' }), ['Llamar al banco']);
    });
  });

  test('empieza sin tareas', () => {
    assert.deepEqual(store.list(), []);
  });

  test('crea una tarea con valores por defecto', () => {
    const task = store.create({ title: 'Comprar pan' });
    assert.equal(task.id, 1);
    assert.equal(task.title, 'Comprar pan');
    assert.equal(task.description, '');
    assert.equal(task.completed, false);
    assert.ok(task.createdAt);
    assert.ok(task.updatedAt);
  });

  test('obtiene una tarea por id y devuelve undefined si no existe', () => {
    const { id } = store.create({ title: 'A' });
    assert.equal(store.get(id).title, 'A');
    assert.equal(store.get(999), undefined);
  });

  test('actualiza solo los campos indicados', () => {
    const { id } = store.create({ title: 'A', description: 'desc' });
    const updated = store.update(id, { completed: true });
    assert.equal(updated.title, 'A');
    assert.equal(updated.description, 'desc');
    assert.equal(updated.completed, true);
  });

  test('update devuelve undefined si la tarea no existe', () => {
    assert.equal(store.update(42, { title: 'x' }), undefined);
  });

  test('elimina una tarea', () => {
    const { id } = store.create({ title: 'A' });
    assert.equal(store.remove(id), true);
    assert.equal(store.remove(id), false);
    assert.deepEqual(store.list(), []);
  });

  test('lista las pendientes primero y las más recientes antes', () => {
    const a = store.create({ title: 'A' });
    store.create({ title: 'B' });
    store.create({ title: 'C' });
    store.update(a.id, { completed: true });
    assert.deepEqual(
      store.list().map((t) => t.title),
      ['C', 'B', 'A']
    );
  });
});

describe('persistencia en fichero', () => {
  test('los datos sobreviven al cerrar y reabrir la base de datos', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tasks-'));
    const file = path.join(dir, 'nested', 'tasks.db');
    try {
      const first = createTaskStore(file);
      first.create({ title: 'Persistente' });
      first.close();

      const second = createTaskStore(file);
      assert.deepEqual(
        second.list().map((t) => t.title),
        ['Persistente']
      );
      second.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
