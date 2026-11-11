'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
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

    test('ignora mayúsculas también en caracteres no ASCII', () => {
      store.create({ title: 'Árbol Ñandú' });
      assert.deepEqual(titles({ q: 'árbol' }), ['Árbol Ñandú']);
      assert.deepEqual(titles({ q: 'ÑANDÚ' }), ['Árbol Ñandú']);
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

describe('fecha límite (dueDate)', () => {
  let store;

  beforeEach(() => {
    store = createTaskStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  const titles = (opts) => store.list(opts).map((t) => t.title);

  test('create sin dueDate devuelve null y con dueDate la conserva', () => {
    assert.equal(store.create({ title: 'A' }).dueDate, null);
    const b = store.create({ title: 'B', dueDate: '2026-05-01' });
    assert.equal(b.dueDate, '2026-05-01');
    assert.equal(store.get(b.id).dueDate, '2026-05-01');
  });

  test('update cambia, conserva y borra la fecha', () => {
    const { id } = store.create({ title: 'A', dueDate: '2026-05-01' });
    assert.equal(store.update(id, { dueDate: '2026-06-15' }).dueDate, '2026-06-15');
    assert.equal(store.update(id, { completed: true }).dueDate, '2026-06-15');
    const renamed = store.update(id, { title: 'Renombrada' });
    assert.equal(renamed.dueDate, '2026-06-15');
    const cleared = store.update(id, { dueDate: null });
    assert.equal(cleared.dueDate, null);
    assert.equal(cleared.title, 'Renombrada');
    assert.equal(store.get(id).dueDate, null);
  });

  test('update con dueDate undefined conserva la fecha', () => {
    const { id } = store.create({ title: 'A', dueDate: '2026-05-01' });
    assert.equal(store.update(id, { dueDate: undefined, title: 'B' }).dueDate, '2026-05-01');
  });

  test('due_asc ordena por fecha con las tareas sin fecha al final', () => {
    store.create({ title: 'A', dueDate: '2026-03-01' });
    store.create({ title: 'B' });
    store.create({ title: 'C', dueDate: '2026-01-01' });
    store.create({ title: 'D', dueDate: '2026-03-01' });
    assert.deepEqual(titles({ sort: 'due_asc' }), ['C', 'D', 'A', 'B']);
  });

  test('due_asc no agrupa por estado en el primer nivel', () => {
    const first = store.create({ title: 'Completada temprana', dueDate: '2026-01-01' });
    store.create({ title: 'Pendiente tardía', dueDate: '2026-02-01' });
    store.update(first.id, { completed: true });
    assert.deepEqual(titles({ sort: 'due_asc' }), ['Completada temprana', 'Pendiente tardía']);
  });

  test('due_asc con la misma fecha pone antes las pendientes', () => {
    const first = store.create({ title: 'Completada', dueDate: '2026-01-01' });
    store.create({ title: 'Pendiente', dueDate: '2026-01-01' });
    store.update(first.id, { completed: true });
    assert.deepEqual(titles({ sort: 'due_asc' }), ['Pendiente', 'Completada']);
  });

  test('el orden por defecto no se ve afectado por las fechas', () => {
    const first = store.create({ title: 'A', dueDate: '2026-01-01' });
    store.create({ title: 'B', dueDate: '2026-12-01' });
    store.create({ title: 'C' });
    store.update(first.id, { completed: true });
    assert.deepEqual(titles(), ['C', 'B', 'A']);
  });

  test('due_asc se combina con status y q', () => {
    store.create({ title: 'Pan tarde', dueDate: '2026-05-01' });
    store.create({ title: 'Pan pronto', dueDate: '2026-02-01' });
    store.create({ title: 'Pan sin fecha' });
    store.create({ title: 'Leche', dueDate: '2026-01-01' });
    const hecho = store.create({ title: 'Pan hecho', dueDate: '2026-01-15' });
    store.update(hecho.id, { completed: true });
    assert.deepEqual(titles({ sort: 'due_asc', q: 'pan' }), ['Pan hecho', 'Pan pronto', 'Pan tarde', 'Pan sin fecha']);
    assert.deepEqual(titles({ sort: 'due_asc', q: 'pan', status: 'pending' }), ['Pan pronto', 'Pan tarde', 'Pan sin fecha']);
    assert.deepEqual(titles({ sort: 'due_asc', status: 'completed' }), ['Pan hecho']);
  });

  describe('migración de bases de datos antiguas', () => {
    test('añade due_date a un esquema antiguo, persiste y es idempotente', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tasks-mig-'));
      const file = path.join(dir, 'old.db');
      try {
        const old = new DatabaseSync(file);
        old.exec(`
          CREATE TABLE tasks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT    NOT NULL,
            description TEXT    NOT NULL DEFAULT '',
            completed   INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT    NOT NULL,
            updated_at  TEXT    NOT NULL
          )
        `);
        const legacyId = Number(old.prepare('INSERT INTO tasks (title, created_at, updated_at) VALUES (?, ?, ?)').run(
          'Antigua',
          '2025-01-01T00:00:00.000Z',
          '2025-01-01T00:00:00.000Z'
        ).lastInsertRowid);
        old.close();

        const first = createTaskStore(file);
        const legacy = first.get(legacyId);
        assert.equal(legacy.title, 'Antigua');
        assert.equal(legacy.dueDate, null);
        assert.equal(first.update(legacyId, { dueDate: '2026-07-07' }).dueDate, '2026-07-07');
        first.close();

        const second = createTaskStore(file);
        assert.equal(second.get(legacyId).dueDate, '2026-07-07');
        second.close();

        const check = new DatabaseSync(file);
        const cols = check.prepare('PRAGMA table_info(tasks)').all().filter((c) => c.name === 'due_date');
        check.close();
        assert.equal(cols.length, 1);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
