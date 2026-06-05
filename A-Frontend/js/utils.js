/** Shared utilities */
export function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"'`]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;',
  }[c]));
}

export function toast(msg, timeout = 3000) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.remove('hidden');
  if (timeout > 0) setTimeout(() => t.classList.add('hidden'), timeout);
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function haversineKm(a, b) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const aVal = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(aVal));
}

/** Normalize route coordinates to [[lat, lng], ...] — never mutate source */
export function normalizeCoordinates(coords) {
  if (!Array.isArray(coords)) return [];
  return coords
    .map((c) => {
      if (!c || c.length < 2) return null;
      const lat = Number(c[0]);
      const lng = Number(c[1]);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
      return [lat, lng];
    })
    .filter(Boolean);
}

export function normalizeStatus(status) {
  const s = String(status || 'offline').trim().toLowerCase();
  if (s === 'running') return 'active';
  if (s === 'reached') return 'completed';
  if (['offline', 'ready', 'active', 'completed'].includes(s)) return s;
  return 'offline';
}

export function statusBadge(status) {
  const key = normalizeStatus(status);
  const meta = {
    offline: { label: 'Offline', class: 'badge-offline' },
    ready: { label: 'Ready', class: 'badge-ready' },
    active: { label: 'Active', class: 'badge-active' },
    completed: { label: 'Completed', class: 'badge-completed' },
  }[key] || { label: key, class: 'badge-offline' };
  return `<span class="badge ${meta.class}">${meta.label}</span>`;
}

export function remainingKmAlongRoute(routeCoords, pos) {
  const coords = normalizeCoordinates(routeCoords);
  if (!coords.length) return null;
  let nearestIdx = 0;
  let nearestDist = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = haversineKm(coords[i], pos);
    if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
  }
  let sum = nearestDist;
  for (let j = nearestIdx; j < coords.length - 1; j++) {
    sum += haversineKm(coords[j], coords[j + 1]);
  }
  return sum;
}

export function computeETAString(b, routes) {
  if (!b) return '—';
  const st = normalizeStatus(b.status);
  if (st === 'completed') return 'Arrived';
  const rt = routes[String(b.route_id)];
  const speed = Number(b.speed) || 20;
  if (rt?.coordinates?.length >= 2) {
    const pos = [Number(b.lat), Number(b.lng)];
    if (!Number.isNaN(pos[0]) && !Number.isNaN(pos[1])) {
      const km = remainingKmAlongRoute(rt.coordinates, pos);
      if (km !== null) {
        if (km <= 0.05) return 'Arrived';
        const min = Math.max(0, Math.round((km / speed) * 60));
        return min === 0 ? '< 1 min' : `${min} min`;
      }
    }
  }
  if (b.eta_seconds != null) {
    const m = Math.floor(b.eta_seconds / 60);
    const s = b.eta_seconds % 60;
    return `${m}m ${s}s`;
  }
  if (b.eta != null) return `${b.eta} min`;
  return '—';
}
