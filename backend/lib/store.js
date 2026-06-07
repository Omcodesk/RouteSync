/**
 * Dual-mode persistence: JSON files + in-memory buses locally,
 * Upstash Redis on Vercel serverless.
 */
const fs = require('fs-extra');
const path = require('path');

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const USE_REDIS = !!(UPSTASH_URL && UPSTASH_TOKEN);

const DATA_DIR = path.join(__dirname, '..');
const ROUTES_FILE = path.join(DATA_DIR, 'routes.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const REVIEWS_FILE = path.join(DATA_DIR, 'reviews.json');
const SEED_ROUTES_FILE = ROUTES_FILE;

const localBuses = new Map();
let redis = null;

if (USE_REDIS) {
  const { Redis } = require('@upstash/redis');
  redis = new Redis({
    url: UPSTASH_URL,
    token: UPSTASH_TOKEN,
  });
}

const withTimeout = (promise, ms = 1500) => {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Upstash Redis Timeout')), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
};

async function ensureFiles() {
  // Vercel serverless FS is read-only; seed files are bundled, Redis handles writes in prod.
  if (USE_REDIS || process.env.VERCEL) return;
  await fs.ensureFile(ROUTES_FILE);
  await fs.ensureFile(USERS_FILE);
  await fs.ensureFile(REVIEWS_FILE);
  try { await fs.readJson(ROUTES_FILE); } catch { await fs.writeJson(ROUTES_FILE, {}, { spaces: 2 }); }
  try { await fs.readJson(USERS_FILE); } catch { await fs.writeJson(USERS_FILE, {}, { spaces: 2 }); }
  try { await fs.readJson(REVIEWS_FILE); } catch { await fs.writeJson(REVIEWS_FILE, {}, { spaces: 2 }); }
}

async function readRoutesObj() {
  if (USE_REDIS) {
    try {
      let data = await redis.get('routes');
      if (data && typeof data === 'object') return data;
    } catch (e) {
      console.error('Redis get routes failed:', e.message);
    }
    const seed = await fs.readJson(SEED_ROUTES_FILE).catch(() => ({}));
    if (Object.keys(seed).length) {
      try { await redis.set('routes', seed); } catch(e) {}
    }
    return seed;
  }
  try { return await fs.readJson(ROUTES_FILE); }
  catch { return {}; }
}

async function writeRoutesObj(obj) {
  if (USE_REDIS) {
    try { await redis.set('routes', obj); } catch(e) {}
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
    try {
      const data = await redis.hgetall('buses');
      if (!data) return [];
      return Object.values(data).map((b) => {
        try { return typeof b === 'string' ? JSON.parse(b) : b; } catch (e) { return null; }
      }).filter(Boolean);
    } catch (e) {
      console.error('Redis hgetall buses failed:', e.message);
      return [];
    }
  }
  return [...localBuses.values()];
}

async function setBus(busId, busObj) {
  if (USE_REDIS) {
    try { await redis.hset('buses', { [String(busId)]: busObj }); } catch(e) {}
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
