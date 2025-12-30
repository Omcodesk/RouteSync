/**
 * emulator.js - improved emulator for Transport Tracker
 *
 * Usage (example):
 *   EMULATOR_SECRET=yourSecret API_URL=http://localhost:3000/api/driver/update ROUTES_FILE=../backend/routes.json BUSES=5 INTERVAL_MS=2000 node emulator.js
 *
 * Environment variables:
 *   API_URL           default: http://localhost:3000/api/driver/update
 *   ROUTES_FILE       default: ./routes.json
 *   BUSES             number of simulated buses (default 5)
 *   INTERVAL_MS       update interval (default 2000)
 *   EMULATOR_SECRET   optional header x-emulator-secret to pass for backend
 *   DEBUG             if set to "true" will print verbose logs
 */

const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3000/api/driver/update';
const ROUTES_FILE = process.env.ROUTES_FILE || path.join(__dirname, 'routes.json');
const BUSES = Math.max(1, Number(process.env.BUSES || 5));
const INTERVAL_MS = Math.max(500, Number(process.env.INTERVAL_MS || 2000));
const EMULATOR_SECRET = process.env.EMULATOR_SECRET || '';
const DEBUG = (process.env.DEBUG || '').toLowerCase() === 'true';

function log(...args){ console.log('[emulator]', ...args); }
function debug(...args){ if(DEBUG) console.log('[emulator:debug]', ...args); }

log('Starting emulator');
log('API_URL      ->', API_URL);
log('ROUTES_FILE  ->', ROUTES_FILE);
log('BUSES        ->', BUSES);
log('INTERVAL_MS  ->', INTERVAL_MS);
if (EMULATOR_SECRET) log('EMULATOR_SECRET -> (set)');

function loadRoutes() {
  try {
    if (!fs.existsSync(ROUTES_FILE)) {
      debug('routes file not found:', ROUTES_FILE);
      return {};
    }
    const raw = fs.readFileSync(ROUTES_FILE, 'utf8');
    if (!raw || raw.trim().length === 0) return {};
    const data = JSON.parse(raw);
    // Normalize to object of string-id -> route
    if (Array.isArray(data)) {
      const obj = {};
      data.forEach(r => { if (r && r.id !== undefined) obj[String(r.id)] = r; });
      return obj;
    }
    // If object, ensure keys are strings
    const normalized = {};
    Object.entries(data || {}).forEach(([k, v]) => normalized[String(k)] = v);
    return normalized;
  } catch (e) {
    console.error('[emulator] Failed to load routes:', e.message);
    return {};
  }
}

let routes = loadRoutes();
let routeIds = Object.keys(routes);

if (routeIds.length === 0) {
  log('No routes found. Emulator will wait until routes.json has routes.');
} else {
  log('Found routes:', routeIds.join(', '));
}

// create buses array and give each bus a small random start offset (so they are not identical)
const buses = [];
for (let i = 0; i < BUSES; i++) {
  const initialRoute = routeIds.length ? routeIds[i % routeIds.length] : null;
  buses.push({
    busId: `E${i + 1}`,
    route_id: initialRoute,   // string or null
    idx: 0,
    offset: Math.floor(Math.random() * 5) // small offset steps to desync
  });
}

async function postUpdate(payload) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (EMULATOR_SECRET) headers['x-emulator-secret'] = EMULATOR_SECRET;
    const r = await axios.post(API_URL, payload, { headers, timeout: 7000 });
    return r.data;
  } catch (err) {
    if (err.response) {
      console.error('[emulator] POST error', err.response.status, JSON.stringify(err.response.data));
    } else {
      console.error('[emulator] POST error', err.message);
    }
    return null;
  }
}

async function tick() {
  try {
    routes = loadRoutes();
    routeIds = Object.keys(routes);
    if (routeIds.length === 0) {
      // nothing to simulate yet
      debug('tick: no routes, skipping');
      return;
    }

    for (const b of buses) {
      // ensure route exists and normalize to string key
      if (!b.route_id || !routes[String(b.route_id)]) {
        b.route_id = routeIds[Math.floor(Math.random() * routeIds.length)];
        b.idx = Math.floor(Math.random() * 3); // random start index
      }
      const rt = routes[String(b.route_id)];
      if (!rt || !Array.isArray(rt.coordinates) || rt.coordinates.length === 0) {
        b.idx++;
        continue;
      }

      // step index with offset so buses are not in sync
      const stepIndex = (b.idx + (b.offset || 0)) % rt.coordinates.length;
      const pt = rt.coordinates[stepIndex];
      // validation
      if (!pt || pt.length < 2) { b.idx++; continue; }
      const lat = Number(pt[0]);
      const lng = Number(pt[1]);
      if (Number.isNaN(lat) || Number.isNaN(lng)) { b.idx++; continue; }

      const speed = Math.floor(15 + Math.random() * 35); // 15-50 km/h
      const occupancy = ['Low', 'Half', 'Full'][Math.floor(Math.random() * 3)];
      const payload = {
        busId: String(b.busId),
        route_id: Number(b.route_id),
        lat,
        lng,
        speed,
        occupancy,
        status: 'Running'
      };

      debug('posting payload', payload);
      const res = await postUpdate(payload);
      if (res !== null) {
        log(`Bus ${b.busId} -> ${lat.toFixed(5)},${lng.toFixed(5)} [route ${b.route_id}] ok`);
      } else {
        log(`Bus ${b.busId} -> post failed`);
      }

      b.idx++;
    }
  } catch (err) {
    console.error('[emulator] tick error', err.message || err);
  }
}

log('Emulator started, posting every', INTERVAL_MS, 'ms');
setInterval(tick, INTERVAL_MS);
// initial immediate tick after short wait to allow backend start
setTimeout(tick, 200);
