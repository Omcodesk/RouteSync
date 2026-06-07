/** API layer with caching */
import { API_BASE, ROUTES_CACHE_MS } from './config.js';
import { state } from './state.js';
import { normalizeCoordinates } from './utils.js';

export async function fetchRoutes(force = false) {
  const now = Date.now();
  if (!force && state.routesLoadedAt && now - state.routesLoadedAt < ROUTES_CACHE_MS && Object.keys(state.routes).length) {
    return state.routes;
  }
  if (state.routesFetchPromise && !force) return state.routesFetchPromise;

  state.routesFetchPromise = (async () => {
    const res = await fetch(`${API_BASE}/routes?t=${Date.now()}`);
    if (!res.ok) throw new Error('Failed to load routes');
    const data = await res.json();
    state.routes = {};
    const routeArray = Array.isArray(data) ? data : (data ? Object.values(data) : []);
    routeArray.forEach((r) => {
      if (r && r.id != null) {
        state.routes[String(r.id)] = {
          ...r,
          coordinates: normalizeCoordinates(r.coordinates),
        };
      }
    });
    state.routesLoadedAt = Date.now();
    state.routesFetchPromise = null;
    return state.routes;
  })();

  try {
    return await state.routesFetchPromise;
  } catch (e) {
    state.routesFetchPromise = null;
    throw e;
  }
}

export async function fetchBuses() {
  const res = await fetch(`${API_BASE}/buses?t=${Date.now()}`);
  if (!res.ok) throw new Error('Failed to load buses');
  const data = await res.json();
  const arr = Array.isArray(data) ? data : (data ? Object.values(data) : []);
  arr.forEach((b) => {
    if (b && (b.busId || b.bus_id)) {
      state.buses[String(b.busId || b.bus_id)] = b;
    }
  });
  return arr;
}

export async function postDriverUpdate(payload) {
  const token = localStorage.getItem('tt_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/driver/update`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.msg || 'Update failed');
  return json;
}

export async function saveRoute(token, body) {
  const res = await fetch(`${API_BASE}/routes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.msg || 'Save failed');
  return json;
}

export async function updateRoute(token, id, body) {
  const res = await fetch(`${API_BASE}/routes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.msg || 'Update failed');
  return json;
}

export async function deleteRoute(token, id) {
  const res = await fetch(`${API_BASE}/routes/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.msg || 'Delete failed');
  return json;
}

export async function login(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.msg || 'Login failed');
  return json;
}

export async function fetchReviews(busId) {
  const res = await fetch(`${API_BASE}/buses/${encodeURIComponent(busId)}/reviews`);
  if (!res.ok) return [];
  return res.json();
}

export async function postReview(busId, payload) {
  const res = await fetch(`${API_BASE}/buses/${encodeURIComponent(busId)}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Review failed');
  return res.json();
}
