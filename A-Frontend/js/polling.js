/** Smart polling & socket */
import { USE_POLLING_ONLY, SOCKET_IO_URL, POLL_INTERVAL_MS, ETA_TICK_MS } from './config.js';
import { state, getRunningBusesForRoute } from './state.js';
import { fetchBuses } from './api.js';
import { refreshPassengerData, renderBusList, tickPassengerEtas } from './passenger.js';
import { updatePassengerMarkers } from './maps.js';

export function startSmartPolling() {
  stopSmartPolling();
  pollOnce();
  state.pollingTimer = setInterval(pollOnce, POLL_INTERVAL_MS);
  state.etaTimer = setInterval(tickPassengerEtas, ETA_TICK_MS);
}

export function stopSmartPolling() {
  if (state.pollingTimer) clearInterval(state.pollingTimer);
  if (state.etaTimer) clearInterval(state.etaTimer);
  state.pollingTimer = null;
  state.etaTimer = null;
}

async function pollOnce() {
  if (!['passenger', 'driver', 'admin'].includes(state.activePage)) return;
  try {
    await fetchBuses();
    if (state.activePage === 'passenger') {
      if (state.selectedRouteId) {
        const running = getRunningBusesForRoute(state.selectedRouteId);
        renderBusList(running);
        updatePassengerMarkers(running);
      } else {
        await refreshPassengerData();
      }
    }
  } catch (e) {
    console.warn('poll', e);
  }
}

export function initSocket(onBusUpdate) {
  if (USE_POLLING_ONLY || typeof io === 'undefined') return;
  if (state.socket?.connected) return;
  state.socket = io(SOCKET_IO_URL, { transports: ['websocket', 'polling'] });
  state.socket.on('bus_update', onBusUpdate);
  state.socket.on('routes:updated', () => window.__refreshRoutes?.());
  state.socket.on('routes:removed', () => window.__refreshRoutes?.());
}
