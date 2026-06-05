/** Trip lifecycle: Offline → Ready → Active → Completed */
import { TRIP_STATUS } from './config.js';
import { state } from './state.js';
import { postDriverUpdate } from './api.js';
import { highlightRouteOnDriver, setDriverPosition } from './maps.js';
import { normalizeCoordinates, toast } from './utils.js';

let onTripUIChange = () => {};
export function setTripUIHandler(fn) { onTripUIChange = fn; }

export function syncDriverDuty(onDuty) {
  state.driver.onDuty = onDuty;
  if (!onDuty) {
    stopAutoTrack();
    state.driver.tripStatus = TRIP_STATUS.OFFLINE;
  } else if (state.driver.tripStatus === TRIP_STATUS.OFFLINE) {
    state.driver.tripStatus = state.driver.routeId ? TRIP_STATUS.READY : TRIP_STATUS.OFFLINE;
  }
  onTripUIChange();
}

export function selectDriverRoute(routeId) {
  state.driver.routeId = String(routeId || '');
  if (state.driver.onDuty && state.driver.tripStatus === TRIP_STATUS.OFFLINE) {
    state.driver.tripStatus = routeId ? TRIP_STATUS.READY : TRIP_STATUS.OFFLINE;
  }
  if (routeId) highlightRouteOnDriver(routeId);
  else highlightRouteOnDriver(null);
  onTripUIChange();
}

function buildPayload(status) {
  const d = state.driver;
  const pos = d.position;
  if (!pos || Number.isNaN(pos.lat)) throw new Error('Set position on map or select a route');
  return {
    busId: d.busId || 'D1',
    route_id: Number(d.routeId) || null,
    lat: pos.lat,
    lng: pos.lng,
    speed: Number(document.getElementById('speed')?.value) || 20,
    occupancy: document.getElementById('occupancy')?.value || 'Low',
    capacity: 50,
    status,
    driverEmail: JSON.parse(localStorage.getItem('tt_user') || '{}')?.email || null,
  };
}

export async function startTrip() {
  if (!state.driver.onDuty) throw new Error('Go on duty first');
  if (!state.driver.routeId) throw new Error('Select a route first');

  const coords = normalizeCoordinates(state.routes[state.driver.routeId]?.coordinates);
  if (coords.length < 2) throw new Error('Route has invalid coordinates');

  setDriverPosition(coords[0][0], coords[0][1], true);
  state.driver.trackIndex = 0;
  state.driver.tripStatus = TRIP_STATUS.ACTIVE;

  await postDriverUpdate(buildPayload('Active'));
  startAutoTrack();
  onTripUIChange();
  toast('Trip started — visible to passengers', 2500);
}

export async function sendUpdate() {
  if (!state.driver.onDuty) throw new Error('Go on duty first');
  if (state.driver.tripStatus !== TRIP_STATUS.ACTIVE) {
    state.driver.tripStatus = TRIP_STATUS.ACTIVE;
  }
  const res = await postDriverUpdate(buildPayload('Active'));
  if (res.bus) state.buses[state.driver.busId] = res.bus;
  onTripUIChange();
  toast('Location updated', 1800);
}

export async function endTrip() {
  stopAutoTrack();
  if (state.driver.onDuty && state.driver.position) {
    try {
      await postDriverUpdate(buildPayload('Completed'));
    } catch (_) {}
  }
  state.driver.tripStatus = state.driver.onDuty ? TRIP_STATUS.READY : TRIP_STATUS.OFFLINE;
  state.driver.trackIndex = 0;
  onTripUIChange();
  toast('Trip completed', 2500);
}

function startAutoTrack() {
  stopAutoTrack();
  state.driver.autoTrackTimer = setInterval(async () => {
    if (state.driver.tripStatus !== TRIP_STATUS.ACTIVE) return;
    const coords = normalizeCoordinates(state.routes[state.driver.routeId]?.coordinates);
    if (coords.length < 2) return;

    state.driver.trackIndex = Math.min(state.driver.trackIndex + 1, coords.length - 1);
    const pt = coords[state.driver.trackIndex];
    setDriverPosition(pt[0], pt[1], false);

    if (state.driver.trackIndex >= coords.length - 1) {
      await endTrip();
      return;
    }
    try {
      const res = await postDriverUpdate(buildPayload('Active'));
      if (res.bus) state.buses[state.driver.busId] = res.bus;
    } catch (e) { console.warn('auto track', e); }
  }, 4000);
}

function stopAutoTrack() {
  if (state.driver.autoTrackTimer) {
    clearInterval(state.driver.autoTrackTimer);
    state.driver.autoTrackTimer = null;
  }
}

export function getDriverPositionFromRoute() {
  const coords = normalizeCoordinates(state.routes[state.driver.routeId]?.coordinates);
  if (!coords.length) return null;
  const idx = Math.min(state.driver.trackIndex, coords.length - 1);
  return { lat: coords[idx][0], lng: coords[idx][1] };
}
