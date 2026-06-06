/**
 * Copy Leaflet assets into A-Frontend/vendor for Vercel static hosting.
 * Also used locally via postinstall so /vendor/* paths work everywhere.
 */
const fs = require('fs-extra');
const path = require('path');

const root = path.join(__dirname, '..');
const vendorDir = path.join(root, 'A-Frontend', 'vendor');

async function copy() {
  const leafletSrc = path.join(root, 'node_modules', 'leaflet', 'dist');
  const drawSrc = path.join(root, 'node_modules', 'leaflet-draw', 'dist');

  if (!(await fs.pathExists(leafletSrc))) {
    console.warn('copy-vendor: leaflet not installed, skipping');
    return;
  }

  await fs.ensureDir(vendorDir);
  await fs.copy(leafletSrc, path.join(vendorDir, 'leaflet'), { overwrite: true });

  if (await fs.pathExists(drawSrc)) {
    await fs.copy(drawSrc, path.join(vendorDir, 'leaflet-draw'), { overwrite: true });
  }

  console.log('Vendor assets copied to A-Frontend/vendor/');
}

copy().catch((err) => {
  console.error('copy-vendor failed:', err);
  process.exit(1);
});
