# Gestor de tareas

Pequeña aplicación web para crear, editar, completar y eliminar tareas.

## Tecnologías

- **Backend:** Node.js (>= 22.13) + Express
- **Persistencia:** SQLite mediante el módulo nativo `node:sqlite`
- **Frontend:** HTML, CSS y JavaScript sin frameworks
- **Tests:** `node:test` + `supertest`

## Uso

```bash
npm install
npm start          # http://localhost:3000
npm test
```

Variables de entorno opcionales:

| Variable  | Por defecto      | Descripción                       |
|-----------|------------------|-----------------------------------|
| `PORT`    | `3000`           | Puerto HTTP                       |
| `DB_FILE` | `data/tasks.db`  | Ruta del fichero de base de datos |

## API REST

| Método | Ruta                        | Descripción                              |
|--------|-----------------------------|------------------------------------------|
| GET    | `/api/tasks`                | Lista las tareas (ver parámetros abajo)  |
| GET    | `/api/tasks/:id`            | Obtiene una tarea                        |
| POST   | `/api/tasks`                | Crea una tarea `{ title, description?, dueDate? }` |
| PUT    | `/api/tasks/:id`            | Edita `title`, `description`, `completed`, `dueDate` |
| PATCH  | `/api/tasks/:id/toggle`     | Alterna el estado de completada          |
| DELETE | `/api/tasks/:id`            | Elimina una tarea                        |

Parámetros opcionales de `GET /api/tasks` (combinables):

- `status`: `all` (por defecto), `pending` o `completed`.
- `q`: texto a buscar en título y descripción (sin distinguir mayúsculas, máx. 200).
- `sort`: `created_desc` o `created_asc`, por fecha de creación, o `due_asc`, por
  fecha límite ascendente (las tareas sin fecha van al final). Sin `sort` las
  pendientes van primero y luego por `id DESC`.

`dueDate` (fecha límite) es una cadena `AAAA-MM-DD` (fecha real de calendario) o
`null`. En `POST` es opcional; en `PUT`, si se omite se conserva el valor actual y
`null` la borra.

Los errores de validación devuelven `400 { errors: [...] }` y los recursos
inexistentes `404 { error }`.

## Estructura

```
src/
  server.js         Arranque del servidor
  app.js            Configuración de Express
  db.js             Capa de datos (SQLite)
  routes/tasks.js   Rutas y validación de la API
public/             Interfaz web
tests/              Tests de la capa de datos y de la API
```
