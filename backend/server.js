/**
 * server.js - Transport Tracker backend (patched)
 *
 * Changes applied:
 * - Compute precise ETA in seconds (eta_seconds) from remaining route distance and posted speed.
 * - Also keep a legacy eta (minutes) for compatibility: eta = Math.ceil(eta_seconds / 60)
 * - If remaining distance <= ARRIVED_KM_THRESHOLD (50m) -> eta_seconds = 0 and bus status set to "Reached"
 * - Keep updatedAt ISO timestamp and emit full bus object including eta_seconds on each driver update
 * - Preserves original endpoints and file-backed persistence
 *
 * Replace your existing backend/server.js with this file (backup first).
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const http = require('http');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, { cors: { origin: '*' } });

// ---------- ENV ----------
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'change_me';
const DEMO_AUTO_VERIFY = (process.env.DEMO_AUTO_VERIFY || 'true') === 'true';
const AI_URL = process.env.AI_URL || '';
const DEFAULT_SPEED_KMH = Number(process.env.DEFAULT_SPEED_KMH || 20);
const ALLOW_PUBLIC_ROUTES = (process.env.ALLOW_PUBLIC_ROUTES || 'false') === 'true';

// ---------- FILE PATHS ----------
const ROUTES_FILE = path.join(__dirname, 'routes.json');
const USERS_FILE = path.join(__dirname, 'users.json');
const REVIEWS_FILE = path.join(__dirname, 'reviews.json');

console.log("Using routes:", ROUTES_FILE);
console.log("Using users:", USERS_FILE);
console.log("Using reviews:", REVIEWS_FILE);

// ---------- ENSURE FILES ----------
async function ensureFiles() {
  await fs.ensureFile(ROUTES_FILE);
  await fs.ensureFile(USERS_FILE);
  await fs.ensureFile(REVIEWS_FILE);

  try { await fs.readJson(ROUTES_FILE); } catch { await fs.writeJson(ROUTES_FILE, {}, { spaces: 2 }); }
  try { await fs.readJson(USERS_FILE); } catch { await fs.writeJson(USERS_FILE, {}, { spaces: 2 }); }
  try { await fs.readJson(REVIEWS_FILE); } catch { await fs.writeJson(REVIEWS_FILE, {}, { spaces: 2 }); }
}

// ---------- HELPER JSON FUNCTIONS ----------
async function readRoutesObj() {
  try { return await fs.readJson(ROUTES_FILE); }
  catch { return {}; }
}
async function writeRoutesObj(obj) {
  return fs.writeJson(ROUTES_FILE, obj, { spaces: 2 });
}

async function readUsersObj() {
  try { return await fs.readJson(USERS_FILE); }
  catch { return {}; }
}
async function writeUsersObj(obj) {
  return fs.writeJson(USERS_FILE, obj, { spaces: 2 });
}

async function readReviewsObj() {
  try { return await fs.readJson(REVIEWS_FILE); }
  catch { return {}; }
}
async function writeReviewsObj(obj) {
  return fs.writeJson(REVIEWS_FILE, obj, { spaces: 2 });
}

// ---------- JWT ----------
function signJwt(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}
function verifyJwt(token) {
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

// ---------- AUTH ----------
app.post("/api/auth/register", async (req, res) => {
  const { email, password, role = "driver" } = req.body;

  if (!email || !password) return res.status(400).json({ msg: "email & password required" });

  const users = await readUsersObj();
  if (users[email]) return res.status(400).json({ msg: "user exists" });

  const hash = await bcrypt.hash(password, 10);
  users[email] = {
    id: uuidv4(),
    email,
    passwordHash: hash,
    role,
    verified: DEMO_AUTO_VERIFY
  };

  await writeUsersObj(users);
  res.json({ msg: "registered", verified: users[email].verified });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;

  const users = await readUsersObj();
  const user = users[email];

  if (!user) return res.status(401).json({ msg: "invalid credentials" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ msg: "invalid credentials" });

  const token = signJwt({ id: user.id, email: user.email, role: user.role });

  res.json({
    msg: "ok",
    token,
    user: { email: user.email, role: user.role, id: user.id }
  });
});

// ---------- ROUTES CRUD ----------
async function ensureAdmin(req, res) {
  if (ALLOW_PUBLIC_ROUTES) return { ok: true };

  const h = req.headers.authorization;
  if (!h) return { ok: false, status: 401, msg: "missing authorization" };

  const token = h.split(" ")[1];
  const user = verifyJwt(token);

  if (!user) return { ok: false, status: 401, msg: "invalid token" };
  if (user.role !== "admin") return { ok: false, status: 403, msg: "forbidden" };

  return { ok: true, user };
}

app.get("/api/routes", async (req, res) => {
  const data = await readRoutesObj();
  res.json(Object.values(data));
});

app.post("/api/routes", async (req, res) => {
  const check = await ensureAdmin(req, res);
  if (!check.ok) return res.status(check.status).json({ msg: check.msg });

  const { name, color, image, coordinates } = req.body;

  if (!name || !coordinates || coordinates.length < 2)
    return res.status(400).json({ msg: "name and coordinates required" });

  const routes = await readRoutesObj();
  const nextId = Object.keys(routes).length + 1;

  routes[nextId] = {
    id: nextId,
    name,
    color: color || "#00c2ff",
    image: image || "",
    coordinates
  };

  await writeRoutesObj(routes);

  io.emit("routes:updated");
  res.json({ ok: true, id: nextId });
});

// ---------- REVIEWS ----------
app.get("/api/buses/:id/reviews", async (req, res) => {
  const busId = String(req.params.id);

  const all = await readReviewsObj();
  const list = all[busId] || [];

  res.json(list);
});

app.post("/api/buses/:id/reviews", async (req, res) => {
  const busId = String(req.params.id);
  const { rating, comment, author } = req.body;

  if (!rating || !comment)
    return res.status(400).json({ error: "rating and comment required" });

  const all = await readReviewsObj();

  if (!Array.isArray(all[busId])) all[busId] = [];

  const review = {
    rating,
    comment,
    author: author || "Anonymous",
    createdAt: new Date().toISOString()
  };

  all[busId].unshift(review);
  await writeReviewsObj(all);

  res.status(201).json(review);
});

// ---------- DRIVER LOCATION ----------
// in-memory map of buses
const buses = new Map();

// Haversine formula in km
function haversineKm(aLat, aLng, bLat, bLng) {
  const toRad = v => (v * Math.PI) / 180;
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

// compute remaining km along the route from the closest route point to the route end
function remainingKmAlongRoute(routeCoords, posLat, posLng) {
  if (!Array.isArray(routeCoords) || routeCoords.length === 0) return null;

  // find nearest index on polyline
  let nearestIdx = 0;
  let nearestDist = Infinity;
  for (let i = 0; i < routeCoords.length; i++) {
    const r = routeCoords[i];
    const rl = [Number(r[0]), Number(r[1])];
    const d = haversineKm(rl[0], rl[1], posLat, posLng);
    if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
  }

  // sum remaining distances from nearestIdx to end
  let sum = nearestDist;
  for (let j = nearestIdx; j < routeCoords.length - 1; j++) {
    const a = routeCoords[j], b = routeCoords[j + 1];
    sum += haversineKm(Number(a[0]), Number(a[1]), Number(b[0]), Number(b[1]));
  }
  return sum;
}

// compute ETA in seconds using route_id and speed km/h
async function computeETASeconds(route_id, lat, lng, speedKmh) {
  try {
    const routesObj = await readRoutesObj();
    const route = routesObj[String(route_id)];
    const speed = (speedKmh && speedKmh > 0) ? Number(speedKmh) : DEFAULT_SPEED_KMH;
    if (!route || !Array.isArray(route.coordinates) || route.coordinates.length === 0) {
      // fallback: 60s for minimal ETA
      return 60;
    }
    const remainingKm = remainingKmAlongRoute(route.coordinates, Number(lat), Number(lng));
    if (remainingKm === null || remainingKm === undefined) return 60;
    const ARRIVED_KM_THRESHOLD = 0.05; // 50 meters
    if (remainingKm <= ARRIVED_KM_THRESHOLD) return 0;
    const seconds = speed > 0 ? Math.round((remainingKm / speed) * 3600) : 60;
    return Math.max(0, seconds);
  } catch (err) {
    console.warn('computeETASeconds failed', err && err.message);
    return 60;
  }
}

app.post("/api/driver/update", async (req, res) => {
  const p = req.body || {};
  const busId = p.busId ? String(p.busId) : (p.bus_id ? String(p.bus_id) : null);
  const lat = Number(p.lat);
  const lng = Number(p.lng);

  if (!busId || Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ msg: "busId, lat, lng required" });
  }

  const speed = Number(p.speed) || DEFAULT_SPEED_KMH;
  const route_id = p.route_id ?? null;
  const occupancy = p.occupancy ?? null;
  const capacity = p.capacity ?? null;
  let status = (p.status || 'running');

  // compute precise ETA seconds
  const eta_seconds = await computeETASeconds(route_id, lat, lng, speed);
  const eta_minutes = Math.ceil(eta_seconds / 60);

  if (eta_seconds === 0) {
    // mark arrived
    status = 'Reached';
  }

  const busObj = {
    busId,
    driverEmail: p.driverEmail || p.driver_email || null,
    route_id,
    lat,
    lng,
    speed,
    occupancy,
    capacity,
    status,
    eta: eta_minutes,        // legacy minutes value for UI that expects minutes
    eta_seconds,             // precise seconds countdown (integer)
    updatedAt: new Date().toISOString()
  };

  buses.set(busId, busObj);

  // emit update to connected clients
  io.emit("bus_update", busObj);

  return res.json({ msg: "updated", bus: busObj });
});

app.get("/api/buses", (req, res) => {
  res.json([...buses.values()]);
});

// ---------- SOCKET ----------
io.on("connection", (sock) => {
  console.log("socket connected:", sock.id);
  try {
    sock.emit("buses_snapshot", [...buses.values()]);
  } catch (e) {
    console.warn("failed to emit buses_snapshot:", e && e.message);
  }
});

// ---------- START ----------
ensureFiles().then(() => {
  server.listen(PORT, () => {
    console.log("Server running on port", PORT);
  });
});