const { createApp, ensureReady } = require('../backend/createApp');

const appPromise = ensureReady().then(() => createApp({ io: null }));

module.exports = async (req, res) => {
  const app = await appPromise;
  app(req, res);
};
