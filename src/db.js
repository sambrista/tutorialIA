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
      updated_at  TEXT    NOT NULL
    )
  `);

  const toTask = (row) =>
    row && {
      id: row.id,
      title: row.title,
      description: row.description,
      completed: row.completed === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

  const stmts = {
    all: db.prepare('SELECT * FROM tasks ORDER BY completed ASC, id DESC'),
    get: db.prepare('SELECT * FROM tasks WHERE id = ?'),
    insert: db.prepare(
      'INSERT INTO tasks (title, description, completed, created_at, updated_at) VALUES (?, ?, 0, ?, ?)'
    ),
    update: db.prepare(
      'UPDATE tasks SET title = ?, description = ?, completed = ?, updated_at = ? WHERE id = ?'
    ),
    remove: db.prepare('DELETE FROM tasks WHERE id = ?'),
  };

  return {
    list() {
      return stmts.all.all().map(toTask);
    },

    get(id) {
      return toTask(stmts.get.get(id));
    },

    create({ title, description = '' }) {
      const now = new Date().toISOString();
      const { lastInsertRowid } = stmts.insert.run(title, description, now, now);
      return this.get(Number(lastInsertRowid));
    },

    update(id, changes) {
      const current = this.get(id);
      if (!current) return undefined;
      const next = { ...current, ...changes };
      stmts.update.run(
        next.title,
        next.description,
        next.completed ? 1 : 0,
        new Date().toISOString(),
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
