# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> `.github/copilot-instructions.md` refleja este fichero. Si cambias uno, actualiza también el otro.

# Instrucciones del proyecto

## Rol
Eres un desarrollador senior autónomo.

## Metodología
1. Analiza el proyecto antes de modificarlo.
2. Propón un plan antes de programar.
3. Divide las tareas complejas en subtareas.
4. Implementa soluciones sencillas y mantenibles.
5. Ejecuta los tests después de modificar código.
6. Corrige los errores que encuentres.

## Git y GitHub
1. Nunca trabajes directamente sobre main.
2. Crea una rama por funcionalidad.
3. Utiliza nombres descriptivos:
   feature/nombre-funcionalidad
   fix/nombre-error
4. Realiza commits descriptivos.
5. Publica los cambios en GitHub.
6. Crea un Pull Request (con `gh pr create --base main`).
7. Nunca fusiones el Pull Request sin autorización.

## Calidad
- No elimines funcionalidades existentes.
- No introduzcas secretos ni contraseñas.
- No des por terminada una tarea sin verificarla.
- Explica los cambios realizados.

# Proyecto: gestor de tareas

Aplicación web de tareas: Node.js + Express (CommonJS), SQLite con el módulo
nativo `node:sqlite` (requiere Node >= 22.13) y frontend en HTML/CSS/JS sin
frameworks ni paso de build. No hay linter configurado.

## Comandos

```bash
npm install
npm start                                   # http://localhost:3000 (PORT, DB_FILE configurables)
npm test                                    # todos los tests
node --test tests/api.test.js               # un solo fichero
node --test --test-name-pattern="alterna" "tests/**/*.test.js"   # tests por nombre
```

`node --test tests/` no funciona (trata el directorio como fichero); usa el glob.

## Arquitectura

- **Inyección del store:** `src/db.js` exporta `createTaskStore(filename)`, que
  devuelve un objeto `{ list, get, create, update, remove, close }`.
  `createApp(store)` (`src/app.js`) y `createTasksRouter(store)` lo reciben como
  parámetro. Solo `src/server.js` abre el fichero real (`data/tasks.db`, ignorado
  por git); los tests crean un store `':memory:'` por test y usan `supertest`
  sobre `createApp` sin levantar el servidor.
- **Modelo de datos:** la tabla usa `snake_case` y `completed` como 0/1; `toTask()`
  en `db.js` lo convierte a JSON `camelCase` con `completed` booleano. Cualquier
  columna nueva debe añadirse en el `CREATE TABLE`, en `toTask()` y en los
  `prepare()`. No hay sistema de migraciones (`CREATE TABLE IF NOT EXISTS`).
- **`store.update(id, changes)`** fusiona cambios parciales sobre la tarea actual;
  lo usan tanto `PUT /:id` como `PATCH /:id/toggle`.
- **Orden de la lista:** pendientes primero y luego por `id DESC`. Los tests
  dependen de este orden.
- **Validación:** `validate(body, { partial })` en `src/routes/tasks.js` (modo
  `partial` para `PUT`). Recorta espacios y aplica límites de 200 (título) y
  2000 (descripción) caracteres, replicados en los `maxlength` de
  `public/index.html` y `public/app.js`: si cambias uno, cambia ambos.
- **Formato de errores:** 400 → `{ errors: [...] }`; 404/500 → `{ error }`. El
  helper `request()` de `public/app.js` entiende ambas formas.
- **Frontend:** tras cada operación recarga la lista completa (`load()`) y
  vuelve a renderizar; el estado local (`tasks`, `filter`) solo se usa para pintar.
  Usa `form.elements.<campo>` (no `form.title`, que choca con la propiedad nativa).
