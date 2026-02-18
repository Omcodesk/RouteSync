/* app.js - Frontend (visual-sim + ETA countdown + arrival)
   Replace your existing frontend app.js with this file.
*/

const API_BASE = (window.__API_BASE__ || 'http://localhost:3000') + '/api';
const SOCKET_IO_URL = (window.__SOCKET_URL__ || 'http://localhost:3000');
// If true, the local simulator will also POST /driver/update each step (may be heavy).
const SIM_POST_UPDATES = false;

let routes = {};            // { id: routeObj }
let routeLayers = {};       // { id: polyline }
let buses = {};             // { busId: busObj }
let socket = null;
let pollingInterval = null;
let simHandles = {};        // per-bus local simulation handles
let mapPassenger = null, mapDriver = null, mapAdmin = null;
let busMarkers = {};        // { busId: { marker, animFrame } }
let selectedRouteId = null;

/* ---------- Utilities ---------- */
function toast(msg, timeout = 3000) {
  const t = document.getElementById('toast');
  if (!t) { console.log('toast:', msg); return; }
  t.textContent = msg;
  t.classList.remove('hidden');
  if (timeout > 0) setTimeout(() => t.classList.add('hidden'), timeout);
}
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"'`]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;' }[c]));
}

/* ---------- Review panel (unchanged) ---------- */
function ensureReviewPanel() {
  let panel = document.getElementById('panel-reviews');
  const sidebar = document.getElementById('bus-list');
  if (!sidebar) return null;

  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'panel-reviews';
    panel.className = 'reviews-panel hidden';
    panel.style.marginBottom = '12px';
    panel.style.background = 'transparent';
    panel.style.zIndex = '10';
    panel.style.boxSizing = 'border-box';
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong>Bus Reviews</strong>
        <button id="panel-close-reviews" class="btn small">Close</button>
      </div>
      <div id="panel-reviews-list" style="margin-top:10px;max-height:360px;overflow:auto"></div>
      <div id="panel-reviews-form" style="margin-top:12px;">
        <textarea id="panel-review-text" placeholder="Write your review..." rows="3" style="width:100%;box-sizing:border-box"></textarea>
        <div style="display:flex;gap:8px;margin-top:8px;justify-content:flex-end">
          <select id="panel-review-rating"><option value="5">5 ★</option><option value="4">4 ★</option><option value="3">3 ★</option><option value="2">2 ★</option><option value="1">1 ★</option></select>
          <button id="panel-submit-review" class="btn primary">Submit</button>
        </div>
        <p id="panel-review-msg" class="muted small" style="margin-top:6px"></p>
      </div>
    `;

    const parent = sidebar.parentNode;
    if (parent) parent.insertBefore(panel, sidebar); else sidebar.prepend(panel);

    panel.querySelector('#panel-close-reviews').addEventListener('click', (ev) => {
      ev.stopPropagation(); panel.classList.add('hidden');
    });

    panel.querySelector('#panel-submit-review').addEventListener('click', async (e) => {
      e.stopPropagation();
      const txt = panel.querySelector('#panel-review-text').value.trim();
      const rating = panel.querySelector('#panel-review-rating').value;
      const msgEl = panel.querySelector('#panel-review-msg');
      msgEl.textContent = '';
      if (!txt) { msgEl.textContent = 'Please enter a review.'; return; }
      try {
        const busId = panel.dataset.busId;
        if (!busId) { msgEl.textContent = 'No bus selected'; return; }
        const payload = { comment: txt, rating: Number(rating), author: (localStorage.getItem('tt_user') ? JSON.parse(localStorage.getItem('tt_user')).email : undefined) };
        const res = await fetch(API_BASE + `/buses/${encodeURIComponent(busId)}/reviews`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const t = await res.text().catch(()=>null);
          console.error('post review failed', res.status, t);
          throw new Error('Failed to post review');
        }
        panel.querySelector('#panel-review-text').value = '';
        msgEl.textContent = 'Review posted';
        await panelLoadReviewsForBus(busId);
      } catch (err) {
        console.error(err);
        panel.querySelector('#panel-review-msg').textContent = 'Failed to post review';
      }
    });
  }
  return panel;
}

async function openReviewsForBus(busId) {
  const panel = ensureReviewPanel(); if (!panel) return;
  panel.dataset.busId = String(busId); panel.classList.remove('hidden');
  await panelLoadReviewsForBus(busId);
}
async function panelLoadReviewsForBus(busId) {
  const panel = ensureReviewPanel(); if (!panel) return;
  const listEl = panel.querySelector('#panel-reviews-list'); if (!listEl) return;
  listEl.innerHTML = '<div class="muted small">Loading…</div>';
  try {
    const res = await fetch(API_BASE + `/buses/${encodeURIComponent(busId)}/reviews`);
    if (!res.ok) { listEl.innerHTML = '<div class="muted small">No reviews</div>'; return; }
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) { listEl.innerHTML = '<div class="muted small">No reviews yet</div>'; return; }
    listEl.innerHTML = arr.map(r => `
      <div style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.04)">
        <div style="display:flex;justify-content:space-between"><strong>${escapeHtml(r.author || 'Anonymous')}</strong><small class="muted">${new Date(r.createdAt || r.ts || Date.now()).toLocaleString()}</small></div>
        <div style="margin-top:6px">${Array((r.rating || 0)).fill('★').join('')}</div>
        <div style="margin-top:8px" class="muted small">${escapeHtml(r.comment || r.text || '')}</div>
      </div>
    `).join('');
  } catch (err) {
    console.error('panel load reviews err', err);
    listEl.innerHTML = '<div class="muted small">Failed to load reviews</div>';
  }
}

/* ---------- Socket & routes ---------- */
function initSocket() {
  if (typeof io === 'undefined') { console.warn('socket.io client not present'); return; }
  if (socket && socket.connected) return;
  socket = io(SOCKET_IO_URL, { transports: ['websocket', 'polling'] });

  socket.on('connect', () => { console.log('socket connected', socket.id); });
  socket.on('bus_update', (payload) => { handleBusUpdate(payload); });
  socket.on('routes:updated', () => { loadRoutesAndDraw(); });
  socket.on('routes:removed', () => { loadRoutesAndDraw(); });
  socket.on('buses_snapshot', (arr) => {
    try {
      buses = {};
      if (Array.isArray(arr)) {
        arr.forEach(b => { const id = String(b.busId || b.bus_id); buses[id] = b; });
      }
    } catch (e) { console.warn('buses_snapshot processing error', e); }
    // update UI
    if (selectedRouteId) {
      const running = getRunningBusesForRoute(selectedRouteId);
      renderBusMarkers(running);
      renderBusList(running);
      // start local visuals for running buses (non-destructive)
      demoAutoSimulateRunningBuses();
    } else {
      renderBusMarkers(Object.values(buses));
      if (document.getElementById('passenger')?.classList.contains('active')) renderBusList(Object.values(buses));
    }
  });
  socket.on('disconnect', () => { console.log('socket disconnected'); });
}

async function loadRoutesAndDraw() {
  try {
    const res = await fetch(API_BASE + '/routes');
    if (!res.ok) throw new Error('Failed to load routes');
    const data = await res.json();
    if (Array.isArray(data)) {
      routes = {};
      data.forEach(r => { routes[String(r.id)] = r; });
    } else { routes = data || {}; }
  } catch (err) {
    console.error('load routes failed', err);
    routes = {};
  }
  drawRoutesOnMaps();
  populateDriverRouteSelect();
  populateAdminList();
  renderRoutesGrid();
}

function drawRoutesOnMaps() {
  for (const id in routeLayers) {
    try { if (mapPassenger && mapPassenger.hasLayer(routeLayers[id])) mapPassenger.removeLayer(routeLayers[id]); } catch (_) {}
    try { if (mapDriver && mapDriver.hasLayer(routeLayers[id])) mapDriver.removeLayer(routeLayers[id]); } catch (_) {}
    try { if (mapAdmin && mapAdmin.hasLayer(routeLayers[id])) mapAdmin.removeLayer(routeLayers[id]); } catch (_) {}
  }
  routeLayers = {};
  Object.keys(routes).forEach(id => {
    const rt = routes[id];
    const coords = (rt.coordinates || []).map(c => [Number(c[0]), Number(c[1])]);
    if (!coords.length) return;
    const poly = L.polyline(coords, { color: rt.color || defaultColor(id), weight: 4, opacity: 0.9 });
    routeLayers[id] = poly;
    if (mapPassenger) poly.addTo(mapPassenger);
    if (mapDriver) poly.addTo(mapDriver);
    if (mapAdmin) poly.addTo(mapAdmin);
  });
}

function defaultColor(id) {
  const p = ['#00c2ff', '#ff7bd3', '#7a5fff', '#ffb86b', '#00ffd5', '#7effa1', '#ff6b6b'];
  const idx = (Number(id) - 1);
  return p[(isNaN(idx) ? 0 : (idx % p.length + p.length) % p.length)];
}

/* ---------- Icons ---------- */
function makeBusIcon(color = '#00c2ff', size = 28) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="0.8">
      <rect x="2" y="4" width="20" height="12" rx="2" ry="2" fill="${color}" stroke="#111"/>
      <rect x="4.2" y="6.2" width="4" height="3" rx="0.4" fill="#fff" opacity="0.95"/>
      <rect x="9.8" y="6.2" width="10" height="3" rx="0.4" fill="#fff" opacity="0.95"/>
      <circle cx="7" cy="18" r="1.6" fill="#111"/>
      <circle cx="17" cy="18" r="1.6" fill="#111"/>
    </svg>
  `;
  return L.divIcon({ className: 'bus-div-icon', html: svg, iconSize: [size,size], iconAnchor: [size/2,size/2] });
}
function makeReachedIcon(size = 28) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="0.6">
      <rect x="2" y="4" width="20" height="12" rx="2" ry="2" fill="#48e875" stroke="#111"/>
      <circle cx="7" cy="18" r="1.6" fill="#111"/>
      <circle cx="17" cy="18" r="1.6" fill="#111"/>
    </svg>
  `;
  return L.divIcon({ className: 'bus-div-icon reached', html: svg, iconSize: [size,size], iconAnchor: [size/2,size/2] });
}

/* ---------- Passenger UI ---------- */
function renderRoutesGrid() {
  const container = document.getElementById('routes-grid'); if (!container) return;
  container.innerHTML = '';
  const keys = Object.keys(routes);
  if (keys.length === 0) { container.innerHTML = `<div class="muted">No routes yet. Admin can create routes from the Admin panel.</div>`; return; }
  keys.forEach(id => {
    const r = routes[id];
    const card = document.createElement('div');
    card.className = 'route-card';
    card.innerHTML = `
      <h4>${r.name || 'Route ' + id}</h4>
      <p>${(r.coordinates && r.coordinates.length) ? r.coordinates.length + ' stops' : 'No coordinates'}</p>
      <div class="route-meta">
        <div style="display:flex;align-items:center;gap:8px"><div style="width:12px;height:12px;border-radius:6px;background:${r.color || defaultColor(id)}"></div><small>${r.color || ''}</small></div>
        <button class="btn" data-route="${id}">View</button>
      </div>
    `;
    card.querySelector('button')?.addEventListener('click', () => openPassengerRoute(id));
    container.appendChild(card);
  });
}

function getRunningBusesForRoute(routeId) {
  const rid = String(routeId);
  return Object.values(buses).filter(b => {
    try {
      const sameRoute = String(b.route_id) === rid;
      const status = String(b.status || '').trim().toLowerCase();
      return sameRoute && status === 'running';
    } catch (e) {
      return false;
    }
  });
}

function openPassengerRoute(id) {
  const rt = routes[String(id)]; if (!rt) return toast('Route not found');
  selectedRouteId = String(id);
  if (!mapPassenger) initPassengerMap();
  document.getElementById('passenger-map-page')?.classList.remove('hidden');

  try {
    Object.entries(routeLayers).forEach(([rid, poly]) => {
      const isSelected = (rid === selectedRouteId);
      poly.setStyle({ opacity: isSelected ? 1 : 0.12, weight: isSelected ? 6 : 3, color: (routes[rid] && routes[rid].color) || defaultColor(rid) });
      if (isSelected) try { mapPassenger.fitBounds(poly.getBounds(), { padding: [60,60] }); } catch(e){}
    });
  } catch (e) { console.error('routeLayers handling failed', e); }

  const runningBuses = getRunningBusesForRoute(id);
  renderBusList(runningBuses);
  renderBusMarkers(runningBuses);
  if (runningBuses.length > 0) { const first = runningBuses[0]; try { mapPassenger.panTo([Number(first.lat), Number(first.lng)]); } catch(e) {} }
  else { const el = document.getElementById('bus-list'); if (el) el.innerHTML = '<div class="muted small">No active buses on this route</div>'; toast('No active buses on this route',1800); }

  // Start demo visual simulation for running buses (visual-only) so movement and ETA are visible even if server doesn't stream frequent updates.
  demoAutoSimulateRunningBuses();

  setTimeout(() => { try { mapPassenger && mapPassenger.invalidateSize && mapPassenger.invalidateSize(true); } catch (err) { console.error('map redraw err', err); } }, 220);
}

function clearSelectedRoute() {
  selectedRouteId = null;
  Object.entries(routeLayers).forEach(([rid, poly]) => {
    try { poly.setStyle({ opacity:0.9, weight:4, color: (routes[rid] && routes[rid].color) || defaultColor(rid) }); } catch(e){}
  });
  renderBusMarkers(Object.values(buses));
  const el = document.getElementById('bus-list'); if (el) el.innerHTML = '<div class="muted small">Select a route to view active buses</div>';
}

/* ---------- ETA helpers ---------- */
function haversineKm(a, b) {
  const toRad = v => v * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const aVal = Math.sin(dLat/2)**2 + Math.cos(toRad(a[0]))*Math.cos(toRad(b[0]))*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(aVal));
}

function remainingKmAlongRoute(routeCoords, pos) {
  if (!Array.isArray(routeCoords) || routeCoords.length === 0) return null;
  let nearestIdx = 0; let nearestDist = Infinity;
  for (let i=0;i<routeCoords.length;i++) {
    const d = haversineKm([routeCoords[i][0], routeCoords[i][1]], pos);
    if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
  }
  let sum = nearestDist;
  for (let j = nearestIdx; j < routeCoords.length - 1; j++) {
    sum += haversineKm([routeCoords[j][0], routeCoords[j][1]], [routeCoords[j+1][0], routeCoords[j+1][1]]);
  }
  return sum;
}

function computeETAString(b) {
  try {
    if (!b) return '';
    if (String(b.status).toLowerCase() === 'arrived') return 'Arrived';
    const routeId = String(b.route_id || '');
    const rt = routes[routeId];
    const speedKmh = Number(b.speed) || 20;
    if (!rt || !Array.isArray(rt.coordinates) || rt.coordinates.length < 2) {
      if (b.eta !== undefined && b.eta !== null) return (b.eta + ' min');
      return '';
    }
    const pos = [Number(b.lat), Number(b.lng)];
    if (Number.isNaN(pos[0]) || Number.isNaN(pos[1])) { if (b.eta) return (b.eta + ' min'); return ''; }
    const remainingKm = remainingKmAlongRoute(rt.coordinates, pos);
    if (remainingKm === null) return (b.eta ? b.eta + ' min' : '');
    const etaMin = speedKmh > 0 ? Math.max(0, Math.round((remainingKm / speedKmh) * 60)) : (b.eta || '');
    return etaMin === 0 ? 'Arrived' : (etaMin + ' min');
  } catch (e) { return (b.eta ? b.eta + ' min' : ''); }
}

/* ---------- Per-second ETA countdown & arrival ---------- */
function setMarkerReached(id) {
  const rec = busMarkers[id]; if (!rec) return;
  if (rec.animFrame) { cancelAnimationFrame(rec.animFrame); rec.animFrame = null; }
  const b = buses[id];
  if (b && b.lat && b.lng) {
    try { rec.marker.setLatLng([Number(b.lat), Number(b.lng)]); } catch (e) {}
  }
  try { rec.marker.setIcon(makeReachedIcon(28)); } catch (e) {}
}
function updateEtaDisplays() {
  const now = Date.now();
  document.querySelectorAll('.eta[data-bus]').forEach(el => {
    const busId = el.dataset.bus; if (!busId) return;
    const bus = buses[String(busId)]; if (!bus) return;
    if (String(bus.status || '').toLowerCase() === 'arrived' || Number(bus.eta) === 0) {
      el.textContent = 'Arrived'; setMarkerReached(busId); bus.eta = 0; return;
    }
    const routeId = String(bus.route_id || '');
    if (routes[routeId] && Array.isArray(routes[routeId].coordinates) && routes[routeId].coordinates.length >= 2) {
      const remainingKm = remainingKmAlongRoute(routes[routeId].coordinates, [Number(bus.lat), Number(bus.lng)]);
      if (remainingKm !== null) {
        if (remainingKm <= 0.05) { el.textContent = 'Arrived'; bus.eta = 0; bus.status = 'arrived'; setMarkerReached(busId); return; }
        const speed = Number(bus.speed) || 20;
        const etaMinFloat = (remainingKm / (speed || 1)) * 60; // minutes
        const minutes = Math.floor(etaMinFloat);
        const seconds = Math.round((etaMinFloat - minutes) * 60);
        el.textContent = `${minutes}m ${seconds}s`;
        bus.eta = Math.max(0, Math.round(etaMinFloat));
        return;
      }
    }
    if (bus.updatedAt && bus.eta !== undefined && bus.eta !== null) {
      const updatedMs = new Date(bus.updatedAt).getTime();
      const targetMs = updatedMs + Number(bus.eta) * 60000;
      let remainingMs = Math.max(0, targetMs - now);
      const minutes = Math.floor(remainingMs / 60000);
      const seconds = Math.floor((remainingMs % 60000) / 1000);
      if (remainingMs <= 0) { el.textContent = 'Arrived'; bus.eta = 0; setMarkerReached(busId); }
      else el.textContent = `${minutes}m ${seconds}s`;
      return;
    }
    el.textContent = computeETAString(bus);
  });
}

/* ---------- Markers & animation ---------- */
async function pollBuses() {
  try {
    const res = await fetch(API_BASE + '/buses');
    if (!res.ok) throw new Error('buses failed');
    const data = await res.json();
    const arr = Array.isArray(data) ? data : Object.values(data || {});
    arr.forEach(b => buses[String(b.busId || b.bus_id)] = b);

    if (selectedRouteId) {
      const running = getRunningBusesForRoute(selectedRouteId);
      renderBusMarkers(running);
      renderBusList(running);
      demoAutoSimulateRunningBuses();
    } else {
      renderBusMarkers(Object.values(buses));
      if (document.getElementById('passenger')?.classList.contains('active')) renderBusList(Object.values(buses));
    }
  } catch (e) { console.error('poll error', e); }
}
function startPolling() { if (pollingInterval) clearInterval(pollingInterval); pollBuses(); pollingInterval = setInterval(pollBuses, 1000); }

function handleBusUpdate(b) {
  const id = String(b.busId || b.bus_id);
  if (!id) return;
  const prior = buses[id];
  buses[id] = b;

  // If a client visual simulator is running for this bus, stop it if server data is newer
  if (simHandles[id]) {
    const sim = simHandles[id];
    // if server updatedAt is present and later than sim start, stop sim and adopt server state
    if (b.updatedAt) {
      const serverMs = new Date(b.updatedAt).getTime();
      if (serverMs >= (sim.serverObservedAt || 0)) {
        stopClientSimulation(id);
      }
    } else {
      // If server explicit coordinates differ significantly from sim, stop sim
      if (prior && (Number(prior.lat) !== Number(b.lat) || Number(prior.lng) !== Number(b.lng))) {
        stopClientSimulation(id);
      }
    }
  }

  if (selectedRouteId) {
    const running = getRunningBusesForRoute(selectedRouteId);
    renderBusMarkers(running);
    renderBusList(running);
  } else {
    renderBusMarkers([b]);
    if (document.getElementById('passenger')?.classList.contains('active')) renderBusList(Object.values(buses));
  }
}

function renderBusMarkers(list) {
  if (!mapPassenger) initPassengerMap();
  const arr = Array.isArray(list) ? list : (list ? Object.values(list) : []);
  const seen = new Set();

  if (!arr || arr.length === 0) {
    Object.keys(busMarkers).forEach(bid => {
      try { if (busMarkers[bid].marker) mapPassenger.removeLayer(busMarkers[bid].marker); } catch (e) {}
      if (busMarkers[bid] && busMarkers[bid].animFrame) cancelAnimationFrame(busMarkers[bid].animFrame);
      delete busMarkers[bid];
    });
    return;
  }

  arr.forEach(b => {
    const id = String(b.busId || b.bus_id || '');
    if (!id) return;
    seen.add(id);
    const lat = Number(b.lat), lng = Number(b.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;
    const pos = [lat, lng];

    if (!busMarkers[id]) {
      try {
        const color = (routes[b.route_id] && routes[b.route_id].color) || defaultColor(b.route_id);
        const marker = L.marker(pos, { icon: makeBusIcon(color, 28) });
        marker.addTo(mapPassenger).bindTooltip(`Bus ${id}`, { permanent: false });
        busMarkers[id] = { marker, animFrame: null };
      } catch (e) { console.error('create marker failed', e); return; }
    }

    const rec = busMarkers[id];
    const status = String(b.status || '').toLowerCase();
    if (status === 'running') {
      try { animateMarkerTo(id, pos); } catch (e) { try { rec.marker.setLatLng(pos); } catch(_){} }
    } else if (status === 'arrived' || b.eta === 0) {
      try { rec.marker.setLatLng(pos); } catch(e){}
      setMarkerReached(id);
    } else {
      try { rec.marker.setLatLng(pos); } catch(e){}
    }
  });

  // cleanup
  Object.keys(busMarkers).forEach(bid => {
    if (!seen.has(bid)) {
      try { mapPassenger.removeLayer(busMarkers[bid].marker); } catch (e) {}
      if (busMarkers[bid] && busMarkers[bid].animFrame) cancelAnimationFrame(busMarkers[bid].animFrame);
      delete busMarkers[bid];
    }
  });
}

function animateMarkerTo(id, toPos) {
  const rec = busMarkers[id]; if (!rec) return;
  const marker = rec.marker;
  const from = (typeof marker.getLatLng === 'function') ? marker.getLatLng() : L.latLng(toPos[0], toPos[1]);
  const to = L.latLng(toPos[0], toPos[1]);
  const duration = 900;
  const start = performance.now();
  if (rec.animFrame) cancelAnimationFrame(rec.animFrame);
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t;
    const lat = from.lat + (to.lat - from.lat) * eased;
    const lng = from.lng + (to.lng - from.lng) * eased;
    try { marker.setLatLng([lat, lng]); } catch (e) {}
    if (t < 1) rec.animFrame = requestAnimationFrame(step); else rec.animFrame = null;
  }
  rec.animFrame = requestAnimationFrame(step);
}

/* ---------- Local client simulator ---------- */
/* startClientSimulation:
   - starts from current bus position (if present) and finds the nearest segment on route
   - animates along route segments using bus speed
   - updates buses[busId] lat/lng/status/eta in-memory for UI
   - stops when reached end (or server update arrives)
*/
function startClientSimulation(busId, routeId, opts = {}) {
  try {
    const rt = routes[String(routeId)];
    if (!rt || !Array.isArray(rt.coordinates) || rt.coordinates.length < 2) { console.warn('Route missing for simulation', routeId); return; }
    // stop existing sim for bus
    stopClientSimulation(busId);

    // normalized coords
    const coords = rt.coordinates.map(c => [Number(c[0]), Number(c[1])]);

    // starting position: prefer current buses[busId] lat/lng, else nearest route start
    const current = buses[String(busId)];
    const startPos = (current && current.lat && current.lng) ? [Number(current.lat), Number(current.lng)] : coords[0];

    const speed = Number(opts.speed) || (current && Number(current.speed)) || 20; // km/h
    const loop = !!opts.loop;

    // build segments
    const segments = [];
    for (let i=0;i<coords.length-1;i++) {
      const a = coords[i]; const b = coords[i+1];
      const dkm = haversineKm(a,b);
      // duration proportionate to distance and speed
      const durationMs = Math.max(300, Math.round((dkm / (speed || 20)) * 3600 * 1000));
      segments.push({ from: a, to: b, km: dkm, dur: durationMs });
    }
    if (segments.length === 0) return;

    // find nearest segment and fraction along it from startPos
    let segIdx = 0; let bestDist = Infinity; let bestFrac = 0;
    for (let i=0;i<segments.length;i++) {
      const a = segments[i].from, b = segments[i].to;
      // project point onto segment (approx using lat/lng linear interpolation — good enough for short segments)
      const vx = b[0] - a[0], vy = b[1] - a[1];
      const wx = startPos[0] - a[0], wy = startPos[1] - a[1];
      const segLen2 = vx*vx + vy*vy;
      const frac = segLen2 === 0 ? 0 : Math.max(0, Math.min(1, (wx*vx + wy*vy) / segLen2));
      const projLat = a[0] + vx*frac, projLng = a[1] + vy*frac;
      const dist = haversineKm([projLat, projLng], startPos);
      if (dist < bestDist) { bestDist = dist; segIdx = i; bestFrac = frac; }
    }

    // create marker if missing
    if (!busMarkers[busId]) {
      const color = (rt.color) || defaultColor(routeId);
      try { const mk = L.marker(startPos, { icon: makeBusIcon(color,28) }).addTo(mapPassenger).bindTooltip(`Bus ${busId}`, { permanent:false }); busMarkers[busId] = { marker: mk, animFrame: null }; } catch(e){ console.error('create sim marker failed', e); }
    } else {
      try { busMarkers[busId].marker.setLatLng(startPos); } catch(e){}
    }

    // set initial bus state
    buses[busId] = Object.assign({}, buses[busId] || {}, { busId, route_id: routeId, lat: startPos[0], lng: startPos[1], speed, status: 'running', eta: null, updatedAt: new Date().toISOString() });

    const handle = {
      busId, routeId, coords, segments, speed, loop,
      segIdx, segStartTs: performance.now() - Math.round(bestFrac * segments[segIdx].dur),
      raf: null, running: true, serverObservedAt: (current && current.updatedAt) ? new Date(current.updatedAt).getTime() : 0
    };
    simHandles[busId] = handle;

    function step(now) {
      const h = simHandles[busId]; if (!h || !h.running) return;
      const seg = h.segments[h.segIdx];
      const t = Math.min(1, Math.max(0, (now - h.segStartTs) / seg.dur));
      const eased = t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t;
      const lat = seg.from[0] + (seg.to[0] - seg.from[0]) * eased;
      const lng = seg.from[1] + (seg.to[1] - seg.from[1]) * eased;

      // update marker and buses state
      try { busMarkers[busId] && busMarkers[busId].marker.setLatLng([lat,lng]); } catch(e){}
      const remainingKm = remainingKmAlongRoute(h.coords, [lat,lng]);
      const etaMinFloat = remainingKm === null ? null : (remainingKm / (h.speed || 20)) * 60;
      buses[busId] = Object.assign({}, buses[busId], {
        lat, lng, speed: h.speed, status: (etaMinFloat !== null && etaMinFloat <= 0.05 ? 'arrived' : 'running'),
        eta: etaMinFloat === null ? null : Math.max(0, Math.round(etaMinFloat)), updatedAt: new Date().toISOString()
      });

      // optionally push to backend
      if (SIM_POST_UPDATES) {
        (async ()=> {
          try {
            await fetch(API_BASE + '/driver/update', {
              method: 'POST',
              headers: {'Content-Type':'application/json'},
              body: JSON.stringify({ busId, lat, lng, route_id: Number(h.routeId), speed: h.speed, status: (etaMinFloat<=0.05 ? 'Arrived' : 'Running') })
            });
          } catch(_) {}
        })();
      }

      // arrival detection
      if (remainingKm !== null && remainingKm <= 0.05) {
        buses[busId].eta = 0; buses[busId].status = 'arrived';
        setMarkerReached(busId);
        h.running = false;
        if (h.raf) cancelAnimationFrame(h.raf);
        delete simHandles[busId];
        updateEtaDisplays();
        renderBusList(getRunningBusesForRoute(h.routeId));
        return;
      }

      // move to next segment when completed
      if (t >= 1 - 1e-6) {
        h.segIdx++;
        if (h.segIdx >= h.segments.length) {
          if (h.loop) { h.segIdx = 0; h.segStartTs = now; }
          else {
            // stop at end
            const last = h.coords[h.coords.length -1];
            buses[busId] = Object.assign({}, buses[busId], { lat:last[0], lng:last[1], status:'arrived', eta:0, updatedAt: new Date().toISOString()});
            setMarkerReached(busId);
            h.running = false;
            delete simHandles[busId];
            updateEtaDisplays();
            renderBusList(getRunningBusesForRoute(h.routeId));
            return;
          }
        } else {
          h.segStartTs = now;
        }
      }
      h.raf = requestAnimationFrame(step);
    }
    handle.raf = requestAnimationFrame(step);
    console.log('Client simulation started for', busId, 'on route', routeId);
  } catch (err) { console.error('startClientSimulation err', err); }
}

function stopClientSimulation(busId) {
  const h = simHandles[busId];
  if (!h) return;
  h.running = false;
  if (h.raf) cancelAnimationFrame(h.raf);
  delete simHandles[busId];
  console.log('Client simulation stopped for', busId);
}

/* Start visual-only local sims for running buses on currently selected route (demo-only visual) */
function demoAutoSimulateRunningBuses() {
  if (!selectedRouteId) return;
  const running = getRunningBusesForRoute(selectedRouteId);
  running.forEach(b => {
    const id = String(b.busId || b.bus_id);
    if (simHandles[id]) return;
    // start sim using current bus position and speed, visual-only
    startClientSimulation(id, selectedRouteId, { speed: Number(b.speed) || 20, loop: false });
  });
}

/* ---------- Driver simulator toggles (uses local simulator) ---------- */
const simToggle = document.getElementById('sim-toggle');
if (simToggle) simToggle.addEventListener('change', (e) => {
  if (e.target.checked) {
    if (!document.getElementById('duty-switch')?.checked) { showDrvMsg('Switch On Duty before simulator'); e.target.checked = false; return; }
    startSimulatorLocal();
  } else stopSimulatorLocal();
});

function startSimulatorLocal() {
  const routeId = String(document.getElementById('driver-route-select')?.value || '');
  if (!routeId) { showDrvMsg('Select route first'); simToggle.checked = false; return; }
  const busId = (document.getElementById('bus-id')?.value || '1').toString();
  const speed = Number(document.getElementById('speed')?.value) || 20;
  startClientSimulation(busId, routeId, { speed, loop: false });
  showDrvMsg('Simulator started (local) for bus ' + busId);
}
function stopSimulatorLocal() {
  const busId = (document.getElementById('bus-id')?.value || '1').toString();
  stopClientSimulation(busId);
  showDrvMsg('Simulator stopped');
}

/* ---------- Driver controls ---------- */
function initDriver() { initDriverMap(); loadRoutesAndDraw(); startPolling(); if (!socket) initSocket(); }
function initAdmin() { initAdminMap(); loadRoutesAndDraw(); if (!socket) initSocket(); }
function startPassengerFlow() { initPassengerMap(); loadRoutesAndDraw(); startPolling(); if (!socket) initSocket(); }

function initPassengerMap() {
  if (mapPassenger) return;
  try {
    mapPassenger = L.map('passenger-map', { preferCanvas:false }).setView([30.268,77.995],13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapPassenger);
    drawRoutesOnMaps();
  } catch(e){ console.error('initPassengerMap error', e); }
}
function initDriverMap() {
  if (mapDriver) return;
  mapDriver = L.map('driver-map').setView([30.268,77.995],13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapDriver);
  mapDriver.on('click', e => {
    const lat = e.latlng.lat, lng = e.latlng.lng;
    if (window._driverTempMarker) mapDriver.removeLayer(window._driverTempMarker);
    window._driverTempMarker = L.marker([lat,lng]).addTo(mapDriver).bindPopup('Selected').openPopup();
  });
  drawRoutesOnMaps();
}
function initAdminMap() {
  if (mapAdmin) return;
  mapAdmin = L.map('admin-map').setView([30.268,77.995],13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapAdmin);
  const drawnItems = new L.FeatureGroup(); mapAdmin.addLayer(drawnItems);
  const drawControl = new L.Control.Draw({ draw: { polyline:true, polygon:false, rectangle:false, circle:false, marker:false }, edit: { featureGroup: drawnItems } });
  mapAdmin.addControl(drawControl);
  mapAdmin.on(L.Draw.Event.CREATED, async (e) => {
    const layer = e.layer; drawnItems.addLayer(layer);
    const latlngs = layer.getLatLngs().map(p => [p.lat, p.lng]);
    const name = prompt('Route name (required):'); if (!name) { alert('Route not saved'); drawnItems.clearLayers(); return; }
    const color = prompt('Color (hex or name):', '#00c2ff'); const image = prompt('Image URL (optional):','');
    try {
      const token = localStorage.getItem('tt_token') || '';
      if (!token) { alert('Please login as admin before saving routes'); drawnItems.clearLayers(); return; }
      const res = await fetch(API_BASE + '/routes', { method:'POST', headers: {'Content-Type':'application/json','Authorization':'Bearer '+token}, body: JSON.stringify({ name, color, image, coordinates: latlngs })});
      if (!res.ok) { const txt = await res.text(); console.error('save response failed', res.status, txt); throw new Error('Save failed ('+res.status+')'); }
      const j = await res.json().catch(()=>null);
      if (j && j.ok) { toast('Saved route '+j.id,2500); await loadRoutesAndDraw(); drawnItems.clearLayers(); }
      else { alert('Save failed'); drawnItems.clearLayers(); }
    } catch (err) { console.error('save failed', err); alert('Save failed: ' + (err.message || 'unknown')); drawnItems.clearLayers(); }
  });
}

/* ---------- Render list & admin population ---------- */
function renderBusList(list) {
  const el = document.getElementById('bus-list'); if (!el) return;
  el.innerHTML = '';
  const arr = Array.isArray(list) ? list : (list ? Object.values(list) : []);
  if (!arr || arr.length === 0) { el.innerHTML = '<div class="muted small">No active buses on this route</div>'; return; }
  arr.sort((a,b) => (Number(a.eta) || 9999) - (Number(b.eta) || 9999));
  arr.forEach(b => {
    const div = document.createElement('div'); div.className = 'bus-card';
    const etaComputed = computeETAString(b);
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <strong>Bus ${escapeHtml(b.busId || b.bus_id || '')}</strong>
          <div class="small muted">${escapeHtml(b.status || '')} • ${escapeHtml(b.occupancy || '')}</div>
        </div>
        <div style="text-align:right">
          <div class="small muted">${b.speed ? (escapeHtml(String(b.speed)) + ' km/h') : ''}</div>
          <div style="font-weight:700"><span class="eta" data-bus="${escapeHtml(b.busId || b.bus_id || '')}">${escapeHtml(String(etaComputed))}</span></div>
          <div style="margin-top:8px;display:flex;gap:8px;justify-content:flex-end">
            <button class="btn small btn-open-panel" data-bus="${escapeHtml(b.busId || b.bus_id || '')}">Reviews</button>
          </div>
        </div>
      </div>
    `;
    el.appendChild(div);
    div.addEventListener('click', ()=> { if (mapPassenger) try { mapPassenger.panTo([Number(b.lat), Number(b.lng)]); } catch(e){} });
    div.querySelector('.btn-open-panel')?.addEventListener('click', (ev) => { ev.stopPropagation(); openReviewsForBus(ev.currentTarget.dataset.bus); });
  });
}

function populateDriverRouteSelect() {
  const sel = document.getElementById('driver-route-select'); if (!sel) return;
  sel.innerHTML = '<option value="">-- select route --</option>';
  Object.keys(routes).forEach(id => { const opt = document.createElement('option'); opt.value = id; opt.textContent = `${id}: ${routes[id].name || 'Route ' + id}`; sel.appendChild(opt); });
  const existing = sel._changeHandler; if (existing) sel.removeEventListener('change', existing);
  const handler = (e) => { const chosen = e.target.value; if (chosen) highlightRouteOnDriver(chosen); else highlightRouteOnDriver(null); };
  sel._changeHandler = handler; sel.addEventListener('change', handler);
}
function populateAdminList() {
  const list = document.getElementById('admin-route-list'); if (!list) return;
  list.innerHTML = '';
  Object.keys(routes).forEach(id => {
    const r = routes[id];
    const li = document.createElement('li'); li.className='admin-route-item';
    li.innerHTML = `<div><strong>${id}: ${r.name || ''}</strong></div>
      <div style="margin-top:6px;color:${r.color || defaultColor(id)}">● ${r.coordinates ? r.coordinates.length + ' pts' : ''}</div>
      <div style="margin-top:6px"><button class="edit" data-id="${id}">Edit</button><button class="delete" data-id="${id}">Delete</button></div>`;
    list.appendChild(li);
  });
  document.querySelectorAll('.admin-route-item .delete').forEach(btn => {
    btn.onclick = async (e)=> {
      const id = e.target.dataset.id; if (!confirm('Delete route ' + id + '?')) return;
      try {
        const token = localStorage.getItem('tt_token') || '';
        if (!token) { alert('Please login as admin before deleting routes'); return; }
        const res = await fetch(API_BASE + '/routes/' + id, { method:'DELETE', headers:{ 'Authorization':'Bearer ' + token }});
        if (!res.ok) throw new Error('Delete failed'); const j = await res.json().catch(()=>null);
        if (j && j.ok) { toast('Deleted ' + id); await loadRoutesAndDraw(); }
      } catch (err) { console.error('delete err', err); alert('Delete failed'); }
    };
  });
  document.querySelectorAll('.admin-route-item .edit').forEach(btn => {
    btn.onclick = async (e) => {
      const id = e.target.dataset.id; const rt = routes[id]; if (!rt) return alert('Route missing');
      const name = prompt('Route name:', rt.name || ''); if (name === null) return;
      const color = prompt('Color (hex):', rt.color || '#00c2ff'); if (color === null) return;
      const image = prompt('Image URL (optional):', rt.image || ''); if (image === null) return;
      try {
        const token = localStorage.getItem('tt_token') || ''; if (!token) { alert('Please login as admin before updating routes'); return; }
        const res = await fetch(API_BASE + '/routes/' + id, { method:'PUT', headers:{ 'Content-Type':'application/json','Authorization':'Bearer '+token }, body: JSON.stringify({ name, color, image }) });
        if (!res.ok) throw new Error('Update failed'); const j = await res.json().catch(()=>null);
        if (j && j.ok) { toast('Updated'); await loadRoutesAndDraw(); }
      } catch (err) { console.error('update err', err); alert('Update failed'); }
    };
  });
}

/* ---------- Driver controls ---------- */
let driverOnDuty = false;
const dutySwitch = document.getElementById('duty-switch');
if (dutySwitch) dutySwitch.addEventListener('change', (e)=> { driverOnDuty = !!e.target.checked; showDrvMsg(driverOnDuty ? 'On Duty' : 'Off Duty'); });

document.getElementById('send-update')?.addEventListener('click', sendDriverUpdate);
document.getElementById('start-trip')?.addEventListener('click', ()=> { if (!driverOnDuty) return showDrvMsg('Switch On Duty'); sendDriverUpdate(); });
document.getElementById('end-trip')?.addEventListener('click', ()=> { sendDriverUpdate(); });

async function sendDriverUpdate() {
  if (!driverOnDuty) return showDrvMsg('Turn On Duty to send running update');
  const busId = (document.getElementById('bus-id')?.value || '1').toString();
  const routeId = Number(document.getElementById('driver-route-select')?.value || 0);
  const occupancy = document.getElementById('occupancy')?.value;
  const speed = Number(document.getElementById('speed')?.value) || 20;
  const pos = mapDriver ? mapDriver.getCenter() : { lat: 30.268, lng: 77.995 };
  const payload = { busId, driverEmail: null, route_id: routeId, lat: pos.lat, lng: pos.lng, speed, occupancy, capacity: 50, status: 'Running' };
  try {
    const res = await fetch(API_BASE + '/driver/update', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
    const j = await res.json().catch(()=>null);
    if (j && j.msg) showDrvMsg('Updated: ' + j.msg); else showDrvMsg('Update sent');
  } catch (e) { showDrvMsg('Update failed'); console.error(e); }
}
function showDrvMsg(t) { const el = document.getElementById('drv-msg'); if (el) el.innerText = t; }

/* ---------- Navigation & login ---------- */
const pages = Array.from(document.querySelectorAll('.page'));
function switchTo(pageId) {
  pages.forEach(p => p.id === pageId ? p.classList.add('active') : p.classList.remove('active'));
  if (pageId === 'passenger') { startPassengerFlow(); setTimeout(()=>{ try{ mapPassenger && mapPassenger.invalidateSize(); }catch(e){} }, 250); }
  if (pageId === 'driver') { initDriver(); setTimeout(()=>{ try{ mapDriver && mapDriver.invalidateSize(); }catch(e){} }, 200); }
  if (pageId === 'admin') { initAdmin(); setTimeout(()=>{ try{ mapAdmin && mapAdmin.invalidateSize(); }catch(e){} }, 200); }
}
document.getElementById('nav-home')?.addEventListener('click', ()=> switchTo('home'));
document.getElementById('nav-passenger')?.addEventListener('click', ()=> switchTo('passenger'));
document.getElementById('nav-driver')?.addEventListener('click', ()=> switchTo('driver'));
document.getElementById('nav-admin')?.addEventListener('click', ()=> switchTo('admin'));
document.querySelectorAll('.back').forEach(b => {
  b.addEventListener('click', e => {
    const to = e.currentTarget.dataset.to || 'home';
    if (to === 'home') return switchTo('home');
    if (to === 'passenger-list') {
      document.getElementById('passenger-map-page')?.classList.add('hidden');
      clearSelectedRoute();
      switchTo('passenger');
    }
  });
});

/* ---------- Login ---------- */
const loginModal = document.getElementById('login-modal');
function openLoginModal(role = 'passenger') {
  if (!loginModal) return;
  loginModal.classList.remove('hidden');
  document.getElementById('login-role-badge').innerHTML = role === 'driver' ? '<i class="fa-solid fa-tachograph-digital"></i>' : role === 'admin' ? '<i class="fa-solid fa-map-location"></i>' : '<i class="fa-solid fa-people-roof"></i>';
  document.getElementById('login-title').innerText = role.charAt(0).toUpperCase() + role.slice(1) + ' Login';
  loginModal.dataset.role = role;
}
function closeLoginModal() { if (loginModal) loginModal.classList.add('hidden'); }
document.getElementById('login-close')?.addEventListener('click', closeLoginModal);
loginModal?.addEventListener('click', (e) => { if (e.target === loginModal) closeLoginModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLoginModal(); });

document.querySelectorAll('.role-cta').forEach(b => {
  b.addEventListener('click', (e) => {
    const role = e.currentTarget.dataset.role;
    if (role === 'passenger') { switchTo('passenger'); } else { openLoginModal(role); }
  });
});

document.getElementById('login-submit')?.addEventListener('click', async () => {
  const role = loginModal?.dataset?.role || 'passenger';
  const email = (document.getElementById('login-email')?.value || '').trim();
  const password = (document.getElementById('login-password')?.value || '').trim();
  if (!email || !password) return document.getElementById('login-msg').innerText = 'Email & password required';
  try {
    const res = await fetch(API_BASE + '/auth/login', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ email, password })});
    const j = await res.json().catch(()=>null);
    if (!res.ok) { document.getElementById('login-msg').innerText = j?.error || j?.msg || 'Login failed'; return; }
    document.getElementById('login-msg').innerText = 'Logged in';
    if (j?.token) localStorage.setItem('tt_token', j.token);
    if (j?.user) localStorage.setItem('tt_user', JSON.stringify(j.user));
    closeLoginModal();
    toast('Welcome ' + (j.user?.email || email), 1400);
    if (role === 'passenger') { switchTo('passenger'); }
    else if (role === 'driver') { switchTo('driver'); initDriver(); }
    else if (role === 'admin') { switchTo('admin'); initAdmin(); }
  } catch (err) { document.getElementById('login-msg').innerText = 'Login failed'; console.error(err); }
});

/* ---------- Startup ---------- */
window.addEventListener('load', () => {
  switchTo('home');
  try { initPassengerMap(); loadRoutesAndDraw(); startPolling(); } catch(e){ console.warn('startup map init failed', e); }
  initSocket();
  setInterval(updateEtaDisplays, 1000);
});

/* ---------- Debug helpers ---------- */
window.__tt = {
  loadRoutesAndDraw,
  startPolling,
  buses,
  routes,
  initSocket,
  openPassengerRoute,
  clearSelectedRoute,
  openReviewsForBus,
  startClientSimulation,
  stopClientSimulation
};
