'use strict';

const API = '/api/tasks';

const form = document.getElementById('task-form');
const list = document.getElementById('task-list');
const template = document.getElementById('task-template');
const errorBox = document.getElementById('error');
const emptyMsg = document.getElementById('empty');
const counter = document.getElementById('counter');
const searchInput = document.getElementById('search');
const sortSelect = document.getElementById('sort');
const filterButtons = document.querySelectorAll('[data-filter]');

let tasks = [];
let filter = 'all';
let search = '';
let sort = '';
let searchTimer;

async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body.errors && body.errors.join(' ')) || body.error || 'Error inesperado.');
  }
  return body;
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = !message;
}

async function run(action) {
  try {
    showError('');
    await action();
  } catch (err) {
    showError(err.message);
  }
}

let loadSeq = 0;

async function load() {
  const seq = ++loadSeq;
  const params = new URLSearchParams({ status: filter });
  if (search.trim()) params.set('q', search.trim());
  if (sort) params.set('sort', sort);
  const result = await request(`${API}?${params}`);
  if (seq !== loadSeq) return; // respuesta obsoleta: ya hay una consulta más reciente
  tasks = result;
  render();
}

function render() {
  // El servidor ya aplica filtro, búsqueda y orden.
  list.replaceChildren(...tasks.map(renderTask));
  const filtered = filter !== 'all' || search.trim() !== '';
  emptyMsg.textContent = filtered ? 'Ninguna tarea coincide con el filtro o la búsqueda.' : 'No hay tareas.';
  emptyMsg.hidden = tasks.length > 0;

  const pending = tasks.filter((t) => !t.completed).length;
  counter.textContent =
    filter === 'all' && !search.trim()
      ? `${pending} pendiente(s) de ${tasks.length}`
      : `${tasks.length} resultado(s)`;
}

function todayLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  // new Date(y, ...) trata los años 0-99 como 1900-1999; setFullYear usa el año real.
  const date = new Date(2000, 0, 1);
  date.setFullYear(y, m - 1, d);
  return date.toLocaleDateString('es-ES');
}

function renderTask(task) {
  const li = template.content.firstElementChild.cloneNode(true);
  li.dataset.id = task.id;
  li.classList.toggle('completed', task.completed);
  li.querySelector('.title').textContent = task.title;
  li.querySelector('.description').textContent = task.description;

  const due = li.querySelector('.due');
  if (task.dueDate) {
    const overdue = !task.completed && task.dueDate < todayLocal();
    due.textContent = `Vence: ${formatDate(task.dueDate)}${overdue ? ' (vencida)' : ''}`;
    due.hidden = false;
    li.classList.toggle('overdue', overdue);
  } else {
    due.hidden = true;
  }

  const toggle = li.querySelector('.toggle');
  toggle.checked = task.completed;
  toggle.addEventListener('change', () =>
    run(async () => {
      await request(`${API}/${task.id}/toggle`, { method: 'PATCH' });
      await load();
    })
  );

  li.querySelector('.edit').addEventListener('click', () => startEdit(li, task));

  const del = li.querySelector('.delete');
  del.addEventListener('click', () => {
    // Confirmación en dos pasos sin usar confirm().
    if (del.dataset.confirm !== 'true') {
      del.dataset.confirm = 'true';
      del.textContent = '¿Seguro?';
      setTimeout(() => {
        del.dataset.confirm = '';
        del.textContent = 'Eliminar';
      }, 3000);
      return;
    }
    run(async () => {
      await request(`${API}/${task.id}`, { method: 'DELETE' });
      await load();
    });
  });

  return li;
}

function startEdit(li, task) {
  const content = li.querySelector('.content');
  const actions = li.querySelector('.actions');

  const editForm = document.createElement('form');
  editForm.className = 'edit-form';
  editForm.innerHTML = `
    <input type="text" name="title" maxlength="200" required>
    <textarea name="description" maxlength="2000" rows="2"></textarea>
    <label class="due-field">Fecha límite (opcional)
      <input type="date" name="dueDate">
    </label>
    <div class="actions">
      <button type="submit">Guardar</button>
      <button type="button" class="secondary cancel">Cancelar</button>
    </div>`;
  editForm.elements.title.value = task.title;
  editForm.elements.description.value = task.description;
  editForm.elements.dueDate.value = task.dueDate || '';

  editForm.querySelector('.cancel').addEventListener('click', render);
  editForm.addEventListener('submit', (e) => {
    e.preventDefault();
    run(async () => {
      await request(`${API}/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: editForm.elements.title.value,
          description: editForm.elements.description.value,
          dueDate: editForm.elements.dueDate.value || null,
        }),
      });
      await load();
    });
  });

  content.replaceWith(editForm);
  actions.hidden = true;
  editForm.elements.title.focus();
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  run(async () => {
    await request(API, {
      method: 'POST',
      body: JSON.stringify({
        title: form.elements.title.value,
        description: form.elements.description.value,
        dueDate: form.elements.dueDate.value || null,
      }),
    });
    form.reset();
    form.elements.title.focus();
    await load();
  });
});

filterButtons.forEach((btn) =>
  btn.addEventListener('click', () => {
    filter = btn.dataset.filter;
    filterButtons.forEach((b) => b.classList.toggle('active', b === btn));
    run(load);
  })
);

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    search = searchInput.value;
    run(load);
  }, 250);
});

sortSelect.addEventListener('change', () => {
  sort = sortSelect.value;
  run(load);
});

run(load);
