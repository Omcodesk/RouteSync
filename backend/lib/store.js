/**
 * Dual-mode persistence: JSON files + in-memory buses locally,
 * Upstash Redis on Vercel serverless.
 */
const fs = require('fs-extra');
const path = require('path');

const USE_REDIS = !!(
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
);

const DATA_DIR = path.join(__dirname, '..');
const ROUTES_FILE = path.join(DATA_DIR, 'routes.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const REVIEWS_FILE = path.join(DATA_DIR, 'reviews.json');
const SEED_ROUTES_FILE = ROUTES_FILE;

const localBuses = new Map();
let redis = null;

if (USE_REDIS) {
  const { Redis } = require('@upstash/redis');
  redis = Redis.fromEnv();
}

async function ensureFiles() {
  if (USE_REDIS) return;
  await fs.ensureFile(ROUTES_FILE);
  await fs.ensureFile(USERS_FILE);
  await fs.ensureFile(REVIEWS_FILE);
  try { await fs.readJson(ROUTES_FILE); } catch { await fs.writeJson(ROUTES_FILE, {}, { spaces: 2 }); }
  try { await fs.readJson(USERS_FILE); } catch { await fs.writeJson(USERS_FILE, {}, { spaces: 2 }); }
  try { await fs.readJson(REVIEWS_FILE); } catch { await fs.writeJson(REVIEWS_FILE, {}, { spaces: 2 }); }
}

async function readRoutesObj() {
  if (USE_REDIS) {
    let data = await redis.get('routes');
    if (data && typeof data === 'object') return data;
    const seed = await fs.readJson(SEED_ROUTES_FILE).catch(() => ({}));
    if (Object.keys(seed).length) await redis.set('routes', seed);
    return seed;
  }
  try { return await fs.readJson(ROUTES_FILE); }
  catch { return {}; }
}

async function writeRoutesObj(obj) {
  if (USE_REDIS) {
    await redis.set('routes', obj);
    return;
  }
  return fs.writeJson(ROUTES_FILE, obj, { spaces: 2 });
}

async function readUsersObj() {
  if (USE_REDIS) {
    let data = await redis.get('users');
    if (data && typeof data === 'object' && Object.keys(data).length) return data;
    const seed = await fs.readJson(USERS_FILE).catch(() => ({}));
    if (Object.keys(seed).length) await redis.set('users', seed);
    return seed;
  }
  try { return await fs.readJson(USERS_FILE); }
  catch { return {}; }
}

async function writeUsersObj(obj) {
  if (USE_REDIS) {
    await redis.set('users', obj);
    return;
  }
  return fs.writeJson(USERS_FILE, obj, { spaces: 2 });
}

async function readReviewsObj() {
  if (USE_REDIS) {
    const data = await redis.get('reviews');
    return (data && typeof data === 'object') ? data : {};
  }
  try { return await fs.readJson(REVIEWS_FILE); }
  catch { return {}; }
}

async function writeReviewsObj(obj) {
  if (USE_REDIS) {
    await redis.set('reviews', obj);
    return;
  }
  return fs.writeJson(REVIEWS_FILE, obj, { spaces: 2 });
}

async function getAllBuses() {
  if (USE_REDIS) {
    const data = await redis.hgetall('buses');
    if (!data) return [];
    return Object.values(data).map((b) => (typeof b === 'string' ? JSON.parse(b) : b));
  }
  return [...localBuses.values()];
}

async function setBus(busId, busObj) {
  if (USE_REDIS) {
    await redis.hset('buses', String(busId), busObj);
    return;
  }
  localBuses.set(String(busId), busObj);
}

async function getDemoState() {
  if (USE_REDIS) {
    const data = await redis.get('demo:state');
    return data || null;
  }
  return global.__demoState || null;
}

async function setDemoState(state) {
  if (USE_REDIS) {
    await redis.set('demo:state', state);
    return;
  }
  global.__demoState = state;
}

function usingRedis() {
  return USE_REDIS;
}

module.exports = {
  ensureFiles,
  readRoutesObj,
  writeRoutesObj,
  readUsersObj,
  writeUsersObj,
  readReviewsObj,
  writeReviewsObj,
  getAllBuses,
  setBus,
  getDemoState,
  setDemoState,
  usingRedis,
};
