'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

/**
 * Crea un repositorio de tareas respaldado por SQLite.
 * @param {string} filename Ruta del fichero de base de datos o ':memory:'.
 */
function createTaskStore(filename = ':memory:') {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }

  const db = new DatabaseSync(filename);
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT    NOT NULL,
      description TEXT    NOT NULL DEFAULT '',
      completed   INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL,
      updated_at  TEXT    NOT NULL,
      due_date    TEXT
    )
  `);

  // Migración idempotente para bases de datos creadas antes de due_date.
  const columns = db.prepare('PRAGMA table_info(tasks)').all();
  if (!columns.some((c) => c.name === 'due_date')) {
    db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
  }

  // LIKE de SQLite solo ignora mayúsculas en ASCII: se pliega a minúsculas Unicode.
  db.function('fold', { deterministic: true }, (text) => String(text).toLowerCase());

  const toTask = (row) =>
    row && {
      id: row.id,
      title: row.title,
      description: row.description,
      completed: row.completed === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      dueDate: row.due_date ?? null,
    };

  const stmts = {
    get: db.prepare('SELECT * FROM tasks WHERE id = ?'),
    insert: db.prepare(
      'INSERT INTO tasks (title, description, completed, created_at, updated_at, due_date) VALUES (?, ?, 0, ?, ?, ?)'
    ),
    update: db.prepare(
      'UPDATE tasks SET title = ?, description = ?, completed = ?, updated_at = ?, due_date = ? WHERE id = ?'
    ),
    remove: db.prepare('DELETE FROM tasks WHERE id = ?'),
  };

  const ORDERS = {
    default: 'completed ASC, id DESC',
    created_desc: 'created_at DESC, id DESC',
    created_asc: 'created_at ASC, id ASC',
    due_asc: 'due_date IS NULL, due_date ASC, completed ASC, id DESC',
  };
  const escapeLike = (text) => text.replace(/[\\%_]/g, '\\$&');

  return {
    /**
     * Lista tareas. Sin opciones: pendientes primero y luego `id DESC`.
     * @param {{status?: 'all'|'pending'|'completed', q?: string, sort?: 'created_desc'|'created_asc'|'due_asc'}} opts
     *   `due_asc`: por fecha límite ascendente, tareas sin fecha al final.
     */
    list({ status = 'all', q = '', sort = 'default' } = {}) {
      const where = [];
      const params = [];
      if (status === 'pending') where.push('completed = 0');
      if (status === 'completed') where.push('completed = 1');
      if (q) {
        where.push("(fold(title) LIKE ? ESCAPE '\\' OR fold(description) LIKE ? ESCAPE '\\')");
        const like = `%${escapeLike(q.toLowerCase())}%`;
        params.push(like, like);
      }
      const order = Object.hasOwn(ORDERS, sort) ? ORDERS[sort] : ORDERS.default;
      const sql = `SELECT * FROM tasks${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order}`;
      return db.prepare(sql).all(...params).map(toTask);
    },

    get(id) {
      return toTask(stmts.get.get(id));
    },

    create({ title, description = '', dueDate = null }) {
      const now = new Date().toISOString();
      const { lastInsertRowid } = stmts.insert.run(title, description, now, now, dueDate ?? null);
      return this.get(Number(lastInsertRowid));
    },

    update(id, changes) {
      const current = this.get(id);
      if (!current) return undefined;
      const defined = Object.fromEntries(
        Object.entries(changes).filter(([, v]) => v !== undefined)
      );
      const next = { ...current, ...defined };
      stmts.update.run(
        next.title,
        next.description,
        next.completed ? 1 : 0,
        new Date().toISOString(),
        next.dueDate ?? null,
        id
      );
      return this.get(id);
    },

    remove(id) {
      return stmts.remove.run(id).changes > 0;
    },

    close() {
      db.close();
    },
  };
}

module.exports = { createTaskStore };
