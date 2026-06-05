/** Central application state */
import { TRIP_STATUS } from './config.js';

export const state = {
  routes: {},
  buses: {},
  selectedRouteId: null,
  routesLoadedAt: 0,
  routesFetchPromise: null,
  pollingTimer: null,
  etaTimer: null,
  socket: null,
  activePage: 'home',
  driver: {
    onDuty: false,
    tripStatus: TRIP_STATUS.OFFLINE,
    busId: 'D1',
    routeId: '',
    position: null,
    trackIndex: 0,
    autoTrackTimer: null,
  },
  admin: { search: '', filter: 'all' },
};

export function getRunningBusesForRoute(routeId) {
  const rid = String(routeId);
  return Object.values(state.buses).filter((b) => {
    return String(b.route_id) === rid && normalizeActive(b.status);
  });
}

function normalizeActive(status) {
  const s = String(status || '').toLowerCase();
  return s === 'active' || s === 'running';
}

export function isActiveBus(b) {
  return normalizeActive(b?.status);
}
