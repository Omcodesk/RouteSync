/** Admin route management */
import { state } from './state.js';
import { fetchRoutes, saveRoute, updateRoute, deleteRoute } from './api.js';
import { initAdminMap, redrawAllRoutes, invalidateMap, maps, defaultColor } from './maps.js';
import { escapeHtml, toast, normalizeCoordinates } from './utils.js';

let pendingDrawCoords = null;

export async function initAdminPanel() {
  await initAdminMap((coords) => openRouteModal(coords));
  bindAdminEvents();
  refreshAdminRoutes(true);
  invalidateMap(maps.admin);
}

function bindAdminEvents() {
  document.getElementById('reload-routes')?.addEventListener('click', () => refreshAdminRoutes(true));
  document.getElementById('admin-route-search')?.addEventListener('input', (e) => {
    state.admin.search = e.target.value.trim().toLowerCase();
    renderAdminRouteList();
  });
  document.getElementById('route-modal-close')?.addEventListener('click', closeRouteModal);
  document.getElementById('route-modal-cancel')?.addEventListener('click', closeRouteModal);
  document.getElementById('route-modal-save')?.addEventListener('click', saveRouteFromModal);
}

export async function refreshAdminRoutes(force = false) {
  const list = document.getElementById('admin-route-list');
  if (list && force) list.innerHTML = '<li class="skeleton-line"></li><li class="skeleton-line"></li>';
  try {
    await fetchRoutes(force);
    redrawAllRoutes();
    renderAdminRouteList();
    updateAdminStats();
  } catch (e) {
    if (list) list.innerHTML = '<li class="empty-state compact">Failed to load routes</li>';
  }
}

function updateAdminStats() {
  const el = document.getElementById('admin-stats');
  if (!el) return;
  const routes = Object.values(state.routes);
  const totalStops = routes.reduce((s, r) => s + (r.coordinates?.length || 0), 0);
  el.innerHTML = `
    <div class="stat"><span class="stat-val">${routes.length}</span><span class="stat-label">Routes</span></div>
    <div class="stat"><span class="stat-val">${totalStops}</span><span class="stat-label">Stops</span></div>`;
}

function filteredRoutes() {
  const q = state.admin.search;
  return Object.entries(state.routes).filter(([, r]) => {
    if (!q) return true;
    return String(r.name || '').toLowerCase().includes(q) || String(r.id).includes(q);
  });
}

function renderAdminRouteList() {
  const list = document.getElementById('admin-route-list');
  if (!list) return;
  const entries = filteredRoutes();
  if (!entries.length) {
    list.innerHTML = '<li class="empty-state compact"><p>No routes match</p></li>';
    return;
  }
  list.innerHTML = '';
  entries.forEach(([id, r]) => {
    const li = document.createElement('li');
    li.className = 'admin-route-item';
    li.innerHTML = `
      <div class="admin-route-head">
        <span class="route-dot" style="background:${r.color || defaultColor(id)}"></span>
        <div><strong>${escapeHtml(r.name || 'Route ' + id)}</strong><div class="muted small">${r.coordinates?.length || 0} stops</div></div>
      </div>
      <div class="admin-route-actions">
        <button type="button" class="btn btn-ghost btn-sm preview" data-id="${id}">Preview</button>
        <button type="button" class="btn btn-ghost btn-sm edit" data-id="${id}">Edit</button>
        <button type="button" class="btn btn-danger btn-sm delete" data-id="${id}">Delete</button>
      </div>`;
    list.appendChild(li);
  });

  list.querySelectorAll('.preview').forEach((btn) => {
    btn.onclick = () => previewRoute(btn.dataset.id);
  });
  list.querySelectorAll('.edit').forEach((btn) => {
    btn.onclick = () => openEditModal(btn.dataset.id);
  });
  list.querySelectorAll('.delete').forEach((btn) => {
    btn.onclick = () => confirmDeleteRoute(btn.dataset.id);
  });
}

function previewRoute(id) {
  const rt = state.routes[id];
  if (!rt?.coordinates?.length || !maps.admin) return;
  const coords = normalizeCoordinates(rt.coordinates);
  const poly = L.polyline(coords, { color: rt.color || defaultColor(id), weight: 5 });
  maps.admin.fitBounds(poly.getBounds(), { padding: [40, 40] });
  toast(`Previewing ${rt.name}`, 2000);
}

function openRouteModal(coords) {
  pendingDrawCoords = coords;
  document.getElementById('route-modal-title').textContent = 'Save new route';
  document.getElementById('route-name').value = '';
  document.getElementById('route-color').value = '#2563EB';
  document.getElementById('route-modal').classList.remove('hidden');
  document.getElementById('route-modal').dataset.editId = '';
  document.getElementById('route-preview-stops').textContent = `${coords.length} stops drawn`;
}

function openEditModal(id) {
  const rt = state.routes[id];
  if (!rt) return;
  document.getElementById('route-modal-title').textContent = 'Edit route';
  document.getElementById('route-name').value = rt.name || '';
  document.getElementById('route-color').value = rt.color || '#2563EB';
  document.getElementById('route-modal').classList.remove('hidden');
  document.getElementById('route-modal').dataset.editId = id;
  document.getElementById('route-preview-stops').textContent = `${rt.coordinates?.length || 0} stops`;
  pendingDrawCoords = null;
}

function closeRouteModal() {
  document.getElementById('route-modal')?.classList.add('hidden');
  pendingDrawCoords = null;
}

async function saveRouteFromModal() {
  const token = localStorage.getItem('tt_token');
  if (!token) return toast('Login as admin first');
  const name = document.getElementById('route-name')?.value.trim();
  const color = document.getElementById('route-color')?.value || '#2563EB';
  const editId = document.getElementById('route-modal')?.dataset.editId;

  if (!name) return toast('Route name is required');

  try {
    if (editId) {
      await updateRoute(token, editId, { name, color });
      toast('Route updated');
    } else {
      const coords = normalizeCoordinates(pendingDrawCoords);
      if (coords.length < 2) return toast('Draw at least 2 points on the map');
      await saveRoute(token, { name, color, coordinates: coords });
      toast('Route saved');
    }
    closeRouteModal();
    await refreshAdminRoutes(true);
  } catch (e) {
    toast(e.message || 'Save failed');
  }
}

async function confirmDeleteRoute(id) {
  const rt = state.routes[id];
  const ok = confirm(`Delete route "${rt?.name || id}"? This cannot be undone.`);
  if (!ok) return;
  const token = localStorage.getItem('tt_token');
  if (!token) return toast('Login as admin first');
  try {
    await deleteRoute(token, id);
    toast('Route deleted');
    await refreshAdminRoutes(true);
  } catch (e) {
    toast(e.message || 'Delete failed');
  }
}
