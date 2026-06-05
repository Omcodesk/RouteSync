/** App configuration and design tokens */
export const ORIGIN = window.__API_BASE__ || window.location.origin;
export const API_BASE = ORIGIN + '/api';
export const SOCKET_IO_URL = window.__SOCKET_URL__ || window.location.origin;
export const USE_POLLING_ONLY = window.__USE_POLLING_ONLY__ || /vercel\.app$/i.test(window.location.hostname);

export const DEMO_CREDENTIALS = {
  driver: { email: 'demo-driver@routesync.app', password: 'demo1234' },
  admin: { email: 'demo-admin@routesync.app', password: 'demo1234' },
};

export const TRIP_STATUS = {
  OFFLINE: 'offline',
  READY: 'ready',
  ACTIVE: 'active',
  COMPLETED: 'completed',
};

export const POLL_INTERVAL_MS = 3000;
export const ETA_TICK_MS = 1000;
export const ROUTES_CACHE_MS = 15000;
export const DEFAULT_MAP_CENTER = [30.268, 77.995];
export const DEFAULT_MAP_ZOOM = 13;

export const STATUS_LABELS = {
  offline: { label: 'Offline', class: 'badge-offline' },
  ready: { label: 'Ready', class: 'badge-ready' },
  active: { label: 'Active', class: 'badge-active' },
  running: { label: 'Active', class: 'badge-active' },
  completed: { label: 'Completed', class: 'badge-completed' },
  reached: { label: 'Completed', class: 'badge-completed' },
};

export const PALETTE = ['#2563EB', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899'];
