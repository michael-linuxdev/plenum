// Service Worker: hält die App-Dateien vor, damit Plenum sofort und auch ohne Netz startet.
// Bei JEDER Änderung an index.html, daten.mjs, Manifest oder Icons CACHE hochzählen, sonst sehen Geräte die neue Version nicht.
// Eine neue Version wartet, bis der Nutzer „Jetzt aktualisieren“ tippt.
const CACHE = 'plenum-v1';
const DATEN = 'plenum-daten';
const ASSETS = ['./', 'index.html', 'daten.mjs', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];

async function install() {
  const c = await caches.open(CACHE);
  await Promise.all(ASSETS.map(async u => {
    const r = await fetch(new Request(u, { cache: 'reload' }));
    if (!r.ok) throw new Error(u + ' ' + r.status);
    await c.put(u, r);
  }));
}
self.addEventListener('install', e => {
  e.waitUntil(install());
  if (!self.registration.active) self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== DATEN).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Abstimmungsdaten: erst Netz (neuester Stand), ohne Netz die letzte Kopie
  if (url.pathname.endsWith('/data/bundestag.json')) {
    e.respondWith((async () => {
      const c = await caches.open(DATEN);
      try {
        const r = await fetch(e.request);
        if (r.ok) await c.put('data/bundestag.json', r.clone());
        return r;
      } catch {
        return (await c.match('data/bundestag.json')) || Response.error();
      }
    })());
    return;
  }
  // Eigene Dateien: erst Cache, sonst Netz
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(e.request, { ignoreSearch: true });
    return hit || fetch(e.request);
  })().catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || Response.error())));
});
