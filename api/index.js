const serverless = require('serverless-http');
const { createApp, ensureReady } = require('../backend/createApp');

const app = createApp({ io: null });

let ready = ensureReady();

app.use(async (req, res, next) => {
  try {
    await ready;
    next();
  } catch (err) {
    console.error('ensureReady failed:', err);
    res.status(503).json({ msg: 'Service initializing, retry shortly' });
  }
});

module.exports = serverless(app);
