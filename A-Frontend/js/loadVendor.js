/** Lazy-load scripts and stylesheets */
const loadedScripts = new Set();
const loadedStyles = new Set();

export function loadScript(src) {
  if (loadedScripts.has(src)) return Promise.resolve();
  if (document.querySelector(`script[src="${src}"]`)) {
    loadedScripts.add(src);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.defer = true;
    el.onload = () => { loadedScripts.add(src); resolve(); };
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(el);
  });
}

export function loadStylesheet(href) {
  if (loadedStyles.has(href)) return Promise.resolve();
  if (document.querySelector(`link[href="${href}"]`)) {
    loadedStyles.add(href);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const el = document.createElement('link');
    el.rel = 'stylesheet';
    el.href = href;
    el.onload = () => { loadedStyles.add(href); resolve(); };
    el.onerror = () => reject(new Error(`Failed to load ${href}`));
    document.head.appendChild(el);
  });
}

let leafletDrawReady = null;

export function ensureLeafletDraw() {
  if (leafletDrawReady) return leafletDrawReady;
  leafletDrawReady = loadStylesheet('/vendor/leaflet-draw/leaflet.draw.css')
    .then(() => loadScript('/vendor/leaflet-draw/leaflet.draw.js'));
  return leafletDrawReady;
}

let socketReady = null;

export function ensureSocketIO() {
  if (typeof io !== 'undefined') return Promise.resolve();
  if (socketReady) return socketReady;
  socketReady = loadScript('/socket.io/socket.io.js');
  return socketReady;
}
