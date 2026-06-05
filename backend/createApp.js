/**
 * createApp.js - Express app factory for local server and Vercel serverless.
 */
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const store = require('./lib/store');

const JWT_SECRET = process.env.JWT_SECRET || 'change_me';
const DEMO_AUTO_VERIFY = (process.env.DEMO_AUTO_VERIFY || 'true') === 'true';
const DEFAULT_SPEED_KMH = Number(process.env.DEFAULT_SPEED_KMH || 20);
const ALLOW_PUBLIC_ROUTES = (process.env.ALLOW_PUBLIC_ROUTES || 'false') === 'true';
const CRON_SECRET = process.env.CRON_SECRET || '';

function normalizeTripStatus(status, etaSeconds) {
  if (etaSeconds === 0) return 'completed';
  const s = String(status || 'ready').trim().toLowerCase();
  if (s === 'running') return 'active';
  if (s === 'reached') return 'completed';
  if (['offline', 'ready', 'active', 'completed'].includes(s)) return s;
  if (s === 'active') return 'active';
  return 'ready';
}

function validateCoordinates(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return { ok: false, msg: 'At least 2 coordinate points required' };
  }
  for (const c of coordinates) {
    if (!Array.isArray(c) || c.length < 2) return { ok: false, msg: 'Invalid coordinate format' };
    const lat = Number(c[0]);
    const lng = Number(c[1]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return { ok: false, msg: 'Coordinates must be numbers' };
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { ok: false, msg: 'Coordinates out of range' };
  }
  return { ok: true, coordinates: coordinates.map((c) => [Number(c[0]), Number(c[1])]) };
}

function signJwt(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function verifyJwt(token) {
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

function haversineKm(aLat, aLng, bLat, bLng) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const a = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function remainingKmAlongRoute(routeCoords, posLat, posLng) {
  if (!Array.isArray(routeCoords) || routeCoords.length === 0) return null;
  let nearestIdx = 0;
  let nearestDist = Infinity;
  for (let i = 0; i < routeCoords.length; i++) {
    const r = routeCoords[i];
    const rl = [Number(r[0]), Number(r[1])];
    const d = haversineKm(rl[0], rl[1], posLat, posLng);
    if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
  }
  let sum = nearestDist;
  for (let j = nearestIdx; j < routeCoords.length - 1; j++) {
    const a = routeCoords[j];
    const b = routeCoords[j + 1];
    sum += haversineKm(Number(a[0]), Number(a[1]), Number(b[0]), Number(b[1]));
  }
  return sum;
}

async function computeETASeconds(route_id, lat, lng, speedKmh) {
  try {
    const routesObj = await store.readRoutesObj();
    const route = routesObj[String(route_id)];
    const speed = (speedKmh && speedKmh > 0) ? Number(speedKmh) : DEFAULT_SPEED_KMH;
    if (!route || !Array.isArray(route.coordinates) || route.coordinates.length === 0) return 60;
    const remainingKm = remainingKmAlongRoute(route.coordinates, Number(lat), Number(lng));
    if (remainingKm === null || remainingKm === undefined) return 60;
    const ARRIVED_KM_THRESHOLD = 0.05;
    if (remainingKm <= ARRIVED_KM_THRESHOLD) return 0;
    const seconds = speed > 0 ? Math.round((remainingKm / speed) * 3600) : 60;
    return Math.max(0, seconds);
  } catch (err) {
    console.warn('computeETASeconds failed', err && err.message);
    return 60;
  }
}

async function buildBusUpdate(p) {
  const busId = p.busId ? String(p.busId) : (p.bus_id ? String(p.bus_id) : null);
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  if (!busId || Number.isNaN(lat) || Number.isNaN(lng)) return null;

  const speed = Number(p.speed) || DEFAULT_SPEED_KMH;
  const route_id = p.route_id ?? null;
  const occupancy = p.occupancy ?? null;
  const capacity = p.capacity ?? null;

  const eta_seconds = await computeETASeconds(route_id, lat, lng, speed);
  const eta_minutes = Math.ceil(eta_seconds / 60);
  const status = normalizeTripStatus(p.status, eta_seconds);

  return {
    busId,
    driverEmail: p.driverEmail || p.driver_email || null,
    route_id,
    lat,
    lng,
    speed,
    occupancy,
    capacity,
    status,
    eta: eta_minutes,
    eta_seconds,
    updatedAt: new Date().toISOString(),
  };
}

async function runDemoTick() {
  const routes = await store.readRoutesObj();
  const routeIds = Object.keys(routes);
  if (!routeIds.length) return { ok: false, msg: 'no routes' };

  let state = await store.getDemoState();
  if (!state || !Array.isArray(state.buses)) {
    state = {
      buses: Array.from({ length: 5 }, (_, i) => ({
        busId: `E${i + 1}`,
        route_id: routeIds[i % routeIds.length],
        idx: 0,
        offset: Math.floor(Math.random() * 5),
      })),
    };
  }

  const updated = [];
  for (const b of state.buses) {
    if (!b.route_id || !routes[String(b.route_id)]) {
      b.route_id = routeIds[Math.floor(Math.random() * routeIds.length)];
      b.idx = 0;
    }
    const rt = routes[String(b.route_id)];
    if (!rt || !Array.isArray(rt.coordinates) || !rt.coordinates.length) {
      b.idx++;
      continue;
    }
    const stepIndex = (b.idx + (b.offset || 0)) % rt.coordinates.length;
    const pt = rt.coordinates[stepIndex];
    if (!pt || pt.length < 2) { b.idx++; continue; }
    const lat = Number(pt[0]);
    const lng = Number(pt[1]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) { b.idx++; continue; }

    const busObj = await buildBusUpdate({
      busId: String(b.busId),
      route_id: Number(b.route_id),
      lat,
      lng,
      speed: Math.floor(15 + Math.random() * 35),
      occupancy: ['Low', 'Half', 'Full'][Math.floor(Math.random() * 3)],
      status: 'Running',
    });
    if (busObj) {
      await store.setBus(busObj.busId, busObj);
      updated.push(busObj.busId);
    }
    b.idx++;
  }

  await store.setDemoState(state);
  return { ok: true, updated };
}

function createApp(options = {}) {
  const { io = null } = options;
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  function emit(event, payload) {
    if (io) io.emit(event, payload);
  }

  async function ensureAdmin(req) {
    if (ALLOW_PUBLIC_ROUTES) return { ok: true };
    const h = req.headers.authorization;
    if (!h) return { ok: false, status: 401, msg: 'missing authorization' };
    const token = h.split(' ')[1];
    const user = verifyJwt(token);
    if (!user) return { ok: false, status: 401, msg: 'invalid token' };
    if (user.role !== 'admin') return { ok: false, status: 403, msg: 'forbidden' };
    return { ok: true, user };
  }

  app.post('/api/auth/register', async (req, res) => {
    const { email, password, role = 'driver' } = req.body;
    if (!email || !password) return res.status(400).json({ msg: 'email & password required' });
    const users = await store.readUsersObj();
    if (users[email]) return res.status(400).json({ msg: 'user exists' });
    const hash = await bcrypt.hash(password, 10);
    users[email] = { id: uuidv4(), email, passwordHash: hash, role, verified: DEMO_AUTO_VERIFY };
    await store.writeUsersObj(users);
    res.json({ msg: 'registered', verified: users[email].verified });
  });

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const users = await store.readUsersObj();
    const user = users[email];
    if (!user) return res.status(401).json({ msg: 'invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ msg: 'invalid credentials' });
    const token = signJwt({ id: user.id, email: user.email, role: user.role });
    res.json({ msg: 'ok', token, user: { email: user.email, role: user.role, id: user.id } });
  });

  app.get('/api/routes', async (req, res) => {
    const data = await store.readRoutesObj();
    res.json(Object.values(data));
  });

  app.post('/api/routes', async (req, res) => {
    const check = await ensureAdmin(req);
    if (!check.ok) return res.status(check.status).json({ msg: check.msg });
    const { name, color, image, coordinates } = req.body;
    const checkCoords = validateCoordinates(coordinates);
    if (!checkCoords.ok) return res.status(400).json({ msg: checkCoords.msg });
    if (!name) return res.status(400).json({ msg: 'name required' });
    const routes = await store.readRoutesObj();
    const nextId = Object.keys(routes).length + 1;
    routes[nextId] = { id: nextId, name, color: color || '#2563EB', image: image || '', coordinates: checkCoords.coordinates };
    await store.writeRoutesObj(routes);
    emit('routes:updated');
    res.json({ ok: true, id: nextId });
  });

  app.put('/api/routes/:id', async (req, res) => {
    const check = await ensureAdmin(req);
    if (!check.ok) return res.status(check.status).json({ msg: check.msg });
    const id = String(req.params.id);
    const routes = await store.readRoutesObj();
    if (!routes[id]) return res.status(404).json({ msg: 'route not found' });
    const { name, color, image } = req.body;
    if (name !== undefined) routes[id].name = name;
    if (color !== undefined) routes[id].color = color;
    if (image !== undefined) routes[id].image = image;
    await store.writeRoutesObj(routes);
    emit('routes:updated');
    res.json({ ok: true });
  });

  app.delete('/api/routes/:id', async (req, res) => {
    const check = await ensureAdmin(req);
    if (!check.ok) return res.status(check.status).json({ msg: check.msg });
    const id = String(req.params.id);
    const routes = await store.readRoutesObj();
    if (!routes[id]) return res.status(404).json({ msg: 'route not found' });
    delete routes[id];
    await store.writeRoutesObj(routes);
    emit('routes:removed');
    res.json({ ok: true });
  });

  app.get('/api/buses/:id/reviews', async (req, res) => {
    const busId = String(req.params.id);
    const all = await store.readReviewsObj();
    res.json(all[busId] || []);
  });

  app.post('/api/buses/:id/reviews', async (req, res) => {
    const busId = String(req.params.id);
    const { rating, comment, author } = req.body;
    if (!rating || !comment) return res.status(400).json({ error: 'rating and comment required' });
    const all = await store.readReviewsObj();
    if (!Array.isArray(all[busId])) all[busId] = [];
    const review = {
      rating,
      comment,
      author: author || 'Anonymous',
      createdAt: new Date().toISOString(),
    };
    all[busId].unshift(review);
    await store.writeReviewsObj(all);
    res.status(201).json(review);
  });

  app.post('/api/driver/update', async (req, res) => {
    const busObj = await buildBusUpdate(req.body || {});
    if (!busObj) return res.status(400).json({ msg: 'busId, lat, lng required' });
    await store.setBus(busObj.busId, busObj);
    emit('bus_update', busObj);
    return res.json({ msg: 'updated', bus: busObj });
  });

  app.get('/api/buses', async (req, res) => {
    res.json(await store.getAllBuses());
  });

  app.get('/api/demo/tick', async (req, res) => {
    if (CRON_SECRET) {
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : req.headers['x-cron-secret'];
      if (token !== CRON_SECRET) return res.status(401).json({ msg: 'unauthorized' });
    }
    const result = await runDemoTick();
    res.json(result);
  });

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, storage: store.usingRedis() ? 'redis' : 'local' });
  });

  return app;
}

async function ensureReady() {
  await store.ensureFiles();
}

module.exports = { createApp, ensureReady, runDemoTick };
