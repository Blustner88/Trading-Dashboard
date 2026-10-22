// Service Worker: eigene Dateien immer zuerst frisch vom Server (kein 10-Minuten-
// Cache von GitHub Pages mehr), bei fehlendem Netz aus dem Zwischenspeicher.
// Daten (Supabase), Schriften und Bibliotheken laufen am Service Worker vorbei.
// Außerdem: Push-Benachrichtigungen anzeigen und beim Antippen die Seite öffnen.
const CACHE = 'td-shell-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    } catch {
      const hit = await caches.match(req, { ignoreSearch: true });
      return hit || Response.error();
    }
  })());
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Trading Journal', {
    body: d.body || '',
    tag: d.tag,
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    data: { url: d.url || 'cockpit.html' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || 'cockpit.html', self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(self.registration.scope) && 'focus' in w) { await w.navigate(target); return w.focus(); }
    }
    return self.clients.openWindow(target);
  })());
});
