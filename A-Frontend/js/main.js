/** Application bootstrap */
import { API_BASE, USE_POLLING_ONLY } from './config.js';
import { state } from './state.js';
import { fetchRoutes } from './api.js';
import { bindAuthUI } from './auth.js';
import { initPassengerPanel, closePassengerRoute, refreshPassengerData } from './passenger.js';
import { initDriverPanel } from './driver.js';
import { initAdminPanel, refreshAdminRoutes } from './admin.js';
import { startSmartPolling, stopSmartPolling, initSocket } from './polling.js';
import { bindReviews } from './reviews.js';
import { redrawAllRoutes } from './maps.js';

const pages = () => Array.from(document.querySelectorAll('.page'));

export function switchTo(pageId) {
  state.activePage = pageId;
  pages().forEach((p) => p.classList.toggle('active', p.id === pageId));

  if (pageId === 'passenger') {
    initPassengerPanel();
    startSmartPolling();
  } else if (pageId === 'driver') {
    initDriverPanel();
    startSmartPolling();
  } else if (pageId === 'admin') {
    initAdminPanel().catch((e) => console.error('admin init', e));
    startSmartPolling();
  } else {
    stopSmartPolling();
  }
}

function bindNavigation() {
  document.getElementById('nav-home')?.addEventListener('click', () => switchTo('home'));
  document.getElementById('nav-home-brand')?.addEventListener('click', (e) => {
    e.preventDefault();
    switchTo('home');
  });
  document.querySelectorAll('.back[data-to="home"]').forEach((b) => {
    b.addEventListener('click', () => switchTo('home'));
  });
  document.querySelectorAll('.back[data-to="passenger-list"]').forEach((b) => {
    b.addEventListener('click', () => {
      closePassengerRoute();
      switchTo('passenger');
    });
  });
}

window.__refreshRoutes = async () => {
  await fetchRoutes(true);
  redrawAllRoutes();
  if (state.activePage === 'admin') refreshAdminRoutes(false);
  if (state.activePage === 'passenger') refreshPassengerData();
};

function startVercelDemoMotion() {
  if (!USE_POLLING_ONLY) return;
  const tick = () => fetch(`${API_BASE}/demo/tick`).catch(() => {});
  tick();
  setInterval(tick, 120000);
}

window.addEventListener('load', () => {
  bindNavigation();
  bindReviews();
  startVercelDemoMotion();
  bindAuthUI((role) => {
    if (role === 'passenger') switchTo('passenger');
    else if (role === 'driver') switchTo('driver');
    else if (role === 'admin') switchTo('admin');
  });
  initSocket((payload) => {
    const id = String(payload.busId || payload.bus_id);
    if (id) state.buses[id] = payload;
  });
  switchTo('home');
});
