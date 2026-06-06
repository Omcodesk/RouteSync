/** Passenger panel */
import { state, getRunningBusesForRoute } from './state.js';
import { fetchRoutes, fetchBuses } from './api.js';
import {
  ensurePassengerMap,
  drawPassengerRoute,
  fitPassengerRoute,
  updatePassengerMarkers,
  invalidateMap,
  maps,
  defaultColor,
  getRouteLayer,
} from './maps.js';
import { escapeHtml, computeETAString, statusBadge } from './utils.js';

export function initPassengerPanel() {
  renderRoutesGrid(true);
}

export async function refreshPassengerData() {
  try {
    await Promise.all([fetchRoutes(), fetchBuses()]);
    renderRoutesGrid(false);
    if (state.selectedRouteId) refreshPassengerRouteView();
  } catch (e) {
    console.error('passenger refresh', e);
  }
}

function renderRoutesGrid(showSkeleton) {
  const grid = document.getElementById('routes-grid');
  if (!grid) return;

  if (showSkeleton && !Object.keys(state.routes).length) {
    grid.innerHTML = Array(3).fill('<div class="skeleton-card"></div>').join('');
    Promise.all([fetchRoutes(), fetchBuses()])
      .then(() => renderRoutesGrid(false))
      .catch(() => {
        grid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-route"></i><p>Could not load routes</p></div>';
      });
    return;
  }

  const keys = Object.keys(state.routes);
  if (!keys.length) {
    grid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-route"></i><p>No routes yet</p><span class="muted">An admin can create routes from the Admin panel.</span></div>';
    return;
  }

  grid.innerHTML = '';
  keys.forEach((id) => {
    const r = state.routes[id];
    const active = getRunningBusesForRoute(id).length;
    const card = document.createElement('article');
    card.className = 'route-card';
    card.innerHTML = `
      <div class="route-card-accent" style="background:${r.color || defaultColor(id)}"></div>
      <div class="route-card-body">
        <h4>${escapeHtml(r.name || 'Route ' + id)}</h4>
        <p class="muted">${r.coordinates?.length || 0} stops · ${active} active bus${active !== 1 ? 'es' : ''}</p>
        <button class="btn btn-primary btn-sm" data-route="${id}">Track route</button>
      </div>`;
    card.querySelector('button').addEventListener('click', () => openPassengerRoute(id));
    grid.appendChild(card);
  });
}

export async function openPassengerRoute(id) {
  const routeId = String(id);
  state.selectedRouteId = routeId;

  document.getElementById('passenger-list-view')?.classList.add('hidden');
  document.getElementById('passenger-map-page')?.classList.remove('hidden');

  const loading = document.getElementById('passenger-map-loading');
  loading?.classList.remove('hidden');

  ensurePassengerMap();
  invalidateMap(maps.passenger);

  const hasRoute = !!state.routes[routeId]?.coordinates?.length;
  const dataPromise = hasRoute
    ? Promise.all([fetchBuses(), fetchRoutes()])
    : Promise.all([fetchRoutes(true), fetchBuses()]);

  if (hasRoute) {
    drawPassengerRoute(routeId);
    loading?.classList.add('hidden');
    invalidateMap(maps.passenger, () => fitPassengerRoute(routeId));
  }

  try {
    await dataPromise;
  } catch (e) {
    console.error('passenger route load', e);
    loading?.classList.add('hidden');
    return;
  }

  const rt = state.routes[routeId];
  if (!rt) {
    loading?.classList.add('hidden');
    return;
  }

  if (!hasRoute) {
    drawPassengerRoute(routeId);
    loading?.classList.add('hidden');
  }

  const running = getRunningBusesForRoute(routeId);
  renderBusList(running);
  updatePassengerMarkers(running);

  if (!hasRoute) {
    invalidateMap(maps.passenger, () => fitPassengerRoute(routeId));
  }
}

export function closePassengerRoute() {
  state.selectedRouteId = null;
  document.getElementById('passenger-map-page')?.classList.add('hidden');
  document.getElementById('passenger-list-view')?.classList.remove('hidden');
  updatePassengerMarkers([]);
}

function refreshPassengerRouteView() {
  if (!state.selectedRouteId || !maps.passenger) return;
  const id = state.selectedRouteId;

  if (!getRouteLayer('passenger', id)) drawPassengerRoute(id);

  const running = getRunningBusesForRoute(id);
  renderBusList(running);
  updatePassengerMarkers(running);
}

export function renderBusList(list) {
  const el = document.getElementById('bus-list');
  if (!el) return;
  const arr = Array.isArray(list) ? list : [];

  if (!arr.length) {
    el.innerHTML = '<div class="empty-state compact"><i class="fa-solid fa-bus"></i><p>No active buses on this route</p></div>';
    return;
  }

  arr.sort((a, b) => (Number(a.eta_seconds ?? a.eta) || 9999) - (Number(b.eta_seconds ?? b.eta) || 9999));
  el.innerHTML = arr.map((b) => {
    const bid = escapeHtml(b.busId || b.bus_id);
    return `<article class="bus-card" data-bus="${bid}">
      <div class="bus-card-top">
        <strong>Bus ${bid}</strong>
        ${statusBadge(b.status)}
      </div>
      <div class="bus-card-meta muted">${escapeHtml(b.occupancy || '—')} · ${escapeHtml(String(b.speed || '—'))} km/h</div>
      <div class="bus-card-eta"><span class="eta" data-bus="${bid}">${escapeHtml(computeETAString(b, state.routes))}</span></div>
      <button type="button" class="btn btn-ghost btn-sm btn-reviews" data-bus="${bid}">Reviews</button>
    </article>`;
  }).join('');

  el.querySelectorAll('.bus-card').forEach((card) => {
    card.addEventListener('click', () => {
      const b = arr.find((x) => String(x.busId || x.bus_id) === card.dataset.bus);
      if (b && maps.passenger) maps.passenger.panTo([Number(b.lat), Number(b.lng)]);
    });
  });
  el.querySelectorAll('.btn-reviews').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      window.__openReviews?.(btn.dataset.bus);
    });
  });
}

export function tickPassengerEtas() {
  document.querySelectorAll('.eta[data-bus]').forEach((el) => {
    const bus = state.buses[el.dataset.bus];
    if (bus) el.textContent = computeETAString(bus, state.routes);
  });
}
