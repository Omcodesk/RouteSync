const serverless = require('serverless-http');
const { createApp, ensureReady } = require('../backend/createApp');

let handler;
let ready;

module.exports = async (req, res) => {
  if (!ready) {
    await ensureReady();
    const app = createApp({ io: null });
    handler = serverless(app);
    ready = true;
  }
  return handler(req, res);
};
