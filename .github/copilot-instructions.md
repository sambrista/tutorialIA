# Instrucciones para GitHub Copilot

> Este fichero refleja `CLAUDE.md`. Si cambias uno, actualiza también el otro.

## Rol y metodología

Actúa como un desarrollador senior:

1. Analiza el proyecto antes de modificarlo.
2. Propón un plan antes de programar y divide las tareas complejas en subtareas.
3. Implementa soluciones sencillas y mantenibles.
4. Ejecuta los tests después de modificar código y corrige los errores que encuentres.

## Git y GitHub

- Nunca trabajes directamente sobre `main`; crea una rama por funcionalidad:
  `feature/nombre-funcionalidad` o `fix/nombre-error`.
- Commits descriptivos. Publica la rama y crea un Pull Request hacia `main`.
- Nunca fusiones un Pull Request sin autorización.

## Calidad

- No elimines funcionalidades existentes.
- No introduzcas secretos ni contraseñas.
- No des por terminada una tarea sin verificarla y explica los cambios realizados.

## Proyecto: gestor de tareas

Node.js + Express (CommonJS), SQLite con el módulo nativo `node:sqlite`
(requiere Node >= 22.13) y frontend en HTML/CSS/JS sin frameworks ni paso de
build. No hay linter configurado.

### Comandos

```bash
npm install
npm start                                   # http://localhost:3000 (PORT, DB_FILE configurables)
npm test                                    # todos los tests
node --test tests/api.test.js               # un solo fichero
node --test --test-name-pattern="alterna" "tests/**/*.test.js"   # tests por nombre
```

`node --test tests/` no funciona (trata el directorio como fichero); usa el glob.

### Arquitectura y convenciones

- `createTaskStore(filename)` (`src/db.js`) devuelve `{ list, get, create, update, remove, close }`
  y se inyecta en `createApp(store)` y `createTasksRouter(store)`. Solo `src/server.js`
  abre el fichero real (`data/tasks.db`, ignorado por git). En los tests usa un store
  `':memory:'` por test y `supertest` sobre `createApp`, sin levantar el servidor.
- La tabla usa `snake_case` y `completed` como 0/1; `toTask()` lo convierte a JSON
  `camelCase` con `completed` booleano. Una columna nueva requiere tocar el
  `CREATE TABLE`, `toTask()` y los `prepare()`. No hay migraciones.
- `store.update(id, changes)` fusiona cambios parciales; lo usan `PUT /:id` y
  `PATCH /:id/toggle`.
- Sin `sort`, la lista se ordena con pendientes primero y luego `id DESC`; los tests dependen
  de ello. `store.list({ status, q, sort })` filtra por estado, busca en título y descripción
  y ordena por fecha de creación; `validateQuery()` en `src/routes/tasks.js` valida los
  parámetros (400 si son inválidos). El frontend los envía a la API en cada `load()`.
- La validación está en `validate(body, { partial })` de `src/routes/tasks.js`. Los
  límites (título 200, descripción 2000) se repiten en los `maxlength` de
  `public/index.html` y `public/app.js`: mantenlos sincronizados.
- Errores: 400 → `{ errors: [...] }`; 404/500 → `{ error }`.
- Frontend: tras cada operación recarga la lista completa (`load()`). Accede a los
  campos con `form.elements.<campo>`, no con `form.title`.
