/** Driver panel UI and controls */
import { TRIP_STATUS } from './config.js';
import { state } from './state.js';
import { fetchRoutes } from './api.js';
import { initDriverMap, highlightRouteOnDriver, invalidateMap, maps } from './maps.js';
import { syncDriverDuty, selectDriverRoute, startTrip, sendUpdate, endTrip, setTripUIHandler } from './trips.js';
import { escapeHtml, statusBadge, computeETAString, toast } from './utils.js';

export function initDriverPanel() {
  setTripUIHandler(updateDriverUI);
  initDriverMap();
  loadDriverRoutes();
  bindDriverEvents();
  updateDriverUI();
  invalidateMap(maps.driver);
}

async function loadDriverRoutes() {
  const sel = document.getElementById('driver-route-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">Loading routes…</option>';
  try {
    await fetchRoutes();
    sel.innerHTML = '<option value="">— Select route —</option>';
    Object.entries(state.routes).forEach(([id, r]) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = `${r.name || 'Route ' + id} (${r.coordinates?.length || 0} stops)`;
      sel.appendChild(opt);
    });
    if (state.driver.routeId) sel.value = state.driver.routeId;
  } catch (e) {
    sel.innerHTML = '<option value="">Failed to load</option>';
  }
}

function bindDriverEvents() {
  document.getElementById('duty-switch')?.addEventListener('change', (e) => {
    syncDriverDuty(e.target.checked);
    toast(e.target.checked ? 'On duty — select a route' : 'Off duty', 2000);
  });

  document.getElementById('driver-route-select')?.addEventListener('change', (e) => {
    selectDriverRoute(e.target.value);
  });

  document.getElementById('bus-id')?.addEventListener('input', (e) => {
    state.driver.busId = e.target.value.trim() || 'D1';
  });

  document.getElementById('start-trip')?.addEventListener('click', async () => {
    try { await startTrip(); } catch (e) { toast(e.message, 3000); }
  });

  document.getElementById('send-update')?.addEventListener('click', async () => {
    try { await sendUpdate(); } catch (e) { toast(e.message, 3000); }
  });

  document.getElementById('end-trip')?.addEventListener('click', async () => {
    try { await endTrip(); } catch (e) { toast(e.message, 3000); }
  });

  document.getElementById('sim-toggle')?.addEventListener('change', (e) => {
    if (e.target.checked) {
      if (!state.driver.onDuty) { e.target.checked = false; return toast('Go on duty first'); }
      startTrip().catch((err) => { e.target.checked = false; toast(err.message); });
    } else {
      endTrip().catch(() => {});
    }
  });
}

export function updateDriverUI() {
  const d = state.driver;
  const badge = document.getElementById('driver-status-badge');
  const tripCard = document.getElementById('trip-status-text');
  const posEl = document.getElementById('driver-position-text');
  const etaEl = document.getElementById('driver-eta-text');

  if (badge) badge.innerHTML = statusBadge(d.tripStatus);

  const labels = {
    [TRIP_STATUS.OFFLINE]: 'Off duty — toggle On Duty to begin',
    [TRIP_STATUS.READY]: 'Ready — select route and press Start Trip',
    [TRIP_STATUS.ACTIVE]: 'Trip active — passengers can track you',
    [TRIP_STATUS.COMPLETED]: 'Last trip completed',
  };
  if (tripCard) tripCard.textContent = labels[d.tripStatus] || '';

  if (posEl) {
    posEl.textContent = d.position
      ? `${d.position.lat.toFixed(5)}, ${d.position.lng.toFixed(5)}`
      : 'Click map or select route';
  }

  const bus = state.buses[d.busId];
  if (etaEl) etaEl.textContent = bus ? computeETAString(bus, state.routes) : '—';

  const route = state.routes[d.routeId];
  const detail = document.getElementById('driver-route-detail');
  if (detail) {
    detail.innerHTML = route
      ? `<strong>${escapeHtml(route.name)}</strong><span class="muted">${route.coordinates?.length || 0} stops</span>`
      : '<span class="muted">No route selected</span>';
  }

  document.getElementById('start-trip')?.toggleAttribute('disabled', d.tripStatus === TRIP_STATUS.ACTIVE || !d.onDuty);
  document.getElementById('send-update')?.toggleAttribute('disabled', !d.onDuty);
  document.getElementById('end-trip')?.toggleAttribute('disabled', d.tripStatus !== TRIP_STATUS.ACTIVE);
}
