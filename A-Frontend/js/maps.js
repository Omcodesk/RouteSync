/** Leaflet map management — coordinates always [lat, lng] */
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, PALETTE } from './config.js';
import { state } from './state.js';
import { normalizeCoordinates } from './utils.js';
import { ensureLeafletDraw } from './loadVendor.js';

export const maps = {
  passenger: null,
  driver: null,
  admin: null,
};

/** Per-map route polylines — Leaflet layers cannot be shared across maps */
const routeLayersByMap = {
  passenger: {},
  driver: {},
  admin: {},
};

export const busMarkers = {};
export const driverMarker = { marker: null };

const TILE = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

export function defaultColor(id) {
  const idx = Number(id);
  return PALETTE[(isNaN(idx) ? 0 : Math.abs(idx - 1)) % PALETTE.length];
}

function tileLayer() {
  return L.tileLayer(TILE, {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap',
    updateWhenIdle: true,
    updateWhenZooming: false,
    keepBuffer: 1,
  });
}

function baseMap(elId, center = DEFAULT_MAP_CENTER) {
  const el = document.getElementById(elId);
  if (!el) throw new Error(`Map element #${elId} not found`);
  const map = L.map(el, {
    preferCanvas: true,
    zoomControl: true,
    fadeAnimation: false,
    zoomAnimation: true,
  }).setView(center, DEFAULT_MAP_ZOOM);
  tileLayer().addTo(map);
  return map;
}

function makeRoutePolyline(id, rt, style = {}) {
  const coords = normalizeCoordinates(rt.coordinates);
  if (coords.length < 2) return null;
  return L.polyline(coords, {
    color: rt.color || defaultColor(id),
    weight: 5,
    opacity: 0.9,
    lineCap: 'round',
    lineJoin: 'round',
    ...style,
  });
}

function clearMapRouteLayers(mapKey) {
  const map = maps[mapKey];
  const layers = routeLayersByMap[mapKey];
  if (!map || !layers) return;
  Object.values(layers).forEach((poly) => {
    try { if (map.hasLayer(poly)) map.removeLayer(poly); } catch (_) {}
  });
  Object.keys(layers).forEach((k) => delete layers[k]);
}

export function getRouteLayer(mapKey, routeId) {
  return routeLayersByMap[mapKey]?.[String(routeId)] || null;
}

/** Init passenger map only when the map panel is visible */
export function ensurePassengerMap() {
  if (maps.passenger) return maps.passenger;
  maps.passenger = baseMap('passenger-map');
  return maps.passenger;
}

export function initDriverMap() {
  if (maps.driver) return maps.driver;
  maps.driver = baseMap('driver-map');
  maps.driver.on('click', (e) => {
    setDriverPosition(e.latlng.lat, e.latlng.lng, true);
  });
  syncRoutesToMaps();
  return maps.driver;
}

export async function initAdminMap(onRouteDrawn) {
  if (maps.admin) return maps.admin;
  await ensureLeafletDraw();
  maps.admin = baseMap('admin-map');
  const drawnItems = new L.FeatureGroup();
  maps.admin.addLayer(drawnItems);
  maps.admin.addControl(new L.Control.Draw({
    draw: { polyline: true, polygon: false, rectangle: false, circle: false, marker: false },
    edit: { featureGroup: drawnItems },
  }));
  maps.admin.on(L.Draw.Event.CREATED, (e) => {
    const latlngs = e.layer.getLatLngs().map((p) => [p.lat, p.lng]);
    drawnItems.clearLayers();
    onRouteDrawn(normalizeCoordinates(latlngs));
  });
  syncRoutesToMaps();
  return maps.admin;
}

/** Draw only the selected route on the passenger map (fast path) */
export function drawPassengerRoute(routeId) {
  const map = maps.passenger;
  if (!map) return null;

  clearMapRouteLayers('passenger');
  const id = String(routeId);
  const rt = state.routes[id];
  if (!rt) return null;

  const poly = makeRoutePolyline(id, rt, { weight: 6, opacity: 1 });
  if (!poly) return null;

  poly.addTo(map);
  routeLayersByMap.passenger[id] = poly;
  return poly;
}

/** Sync all routes to driver/admin maps; passenger uses drawPassengerRoute */
export function syncRoutesToMaps() {
  ['driver', 'admin'].forEach((mapKey) => {
    if (!maps[mapKey]) return;
    clearMapRouteLayers(mapKey);
    Object.entries(state.routes).forEach(([id, rt]) => {
      const poly = makeRoutePolyline(id, rt);
      if (!poly) return;
      poly.addTo(maps[mapKey]);
      routeLayersByMap[mapKey][id] = poly;
    });
  });

  if (maps.passenger && state.selectedRouteId) {
    drawPassengerRoute(state.selectedRouteId);
  }
}

export function redrawAllRoutes() {
  syncRoutesToMaps();
}

export function fitPassengerRoute(routeId) {
  const map = maps.passenger;
  const poly = getRouteLayer('passenger', routeId);
  if (!map || !poly) return;
  try {
    map.fitBounds(poly.getBounds(), { padding: [48, 48], maxZoom: 15, animate: false });
  } catch (_) {}
}

export function highlightRouteOnDriver(routeId) {
  const map = maps.driver;
  if (!map) return;

  Object.entries(routeLayersByMap.driver).forEach(([id, poly]) => {
    const selected = routeId && String(id) === String(routeId);
    poly.setStyle({
      opacity: routeId ? (selected ? 1 : 0.2) : 0.9,
      weight: selected ? 6 : 4,
      color: state.routes[id]?.color || defaultColor(id),
    });
  });

  if (!routeId) return;
  const coords = normalizeCoordinates(state.routes[String(routeId)]?.coordinates);
  if (!coords.length) return;

  const poly = getRouteLayer('driver', routeId);
  if (poly) {
    try { map.fitBounds(poly.getBounds(), { padding: [40, 40], maxZoom: 15, animate: false }); } catch (_) {}
  }
  setDriverPosition(coords[0][0], coords[0][1], false);
  state.driver.routeId = String(routeId);
  state.driver.trackIndex = 0;
}

export function setDriverPosition(lat, lng, pan = false) {
  state.driver.position = { lat: Number(lat), lng: Number(lng) };
  const map = maps.driver;
  if (!map) return;
  const pos = [state.driver.position.lat, state.driver.position.lng];
  if (!driverMarker.marker) {
    driverMarker.marker = L.marker(pos, {
      icon: L.divIcon({
        className: 'driver-pos-icon',
        html: '<div class="driver-pin"><i class="fa-solid fa-bus"></i></div>',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      }),
    }).addTo(map);
  } else {
    driverMarker.marker.setLatLng(pos);
  }
  if (pan) map.panTo(pos);
}

export function makeBusIcon(color = '#2563EB', size = 32) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="12" rx="2" fill="${color}" stroke="#0F172A" stroke-width="0.8"/><circle cx="7" cy="18" r="1.6" fill="#0F172A"/><circle cx="17" cy="18" r="1.6" fill="#0F172A"/></svg>`;
  return L.divIcon({ className: 'bus-div-icon', html: svg, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

export function updatePassengerMarkers(list) {
  const map = maps.passenger;
  if (!map) return;
  const arr = Array.isArray(list) ? list : [];
  const seen = new Set();

  arr.forEach((b) => {
    const id = String(b.busId || b.bus_id);
    if (!id) return;
    const lat = Number(b.lat);
    const lng = Number(b.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;
    seen.add(id);
    const color = state.routes[b.route_id]?.color || defaultColor(b.route_id);
    if (!busMarkers[id]) {
      busMarkers[id] = L.marker([lat, lng], { icon: makeBusIcon(color) })
        .addTo(map)
        .bindTooltip(`Bus ${id}`, { className: 'bus-tooltip' });
    } else {
      busMarkers[id].setLatLng([lat, lng]);
    }
  });

  Object.keys(busMarkers).forEach((id) => {
    if (!seen.has(id)) {
      try { map.removeLayer(busMarkers[id]); } catch (_) {}
      delete busMarkers[id];
    }
  });
}

/** Resize map after container becomes visible */
export function invalidateMap(map, then) {
  if (!map) return;
  requestAnimationFrame(() => {
    try { map.invalidateSize({ animate: false }); } catch (_) {}
    if (then) requestAnimationFrame(then);
  });
}

/** @deprecated use ensurePassengerMap */
export function initPassengerMap() {
  return ensurePassengerMap();
}
