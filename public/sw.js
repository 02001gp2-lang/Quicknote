// Quicknote — service worker
// Incremente CACHE a cada mudança nos arquivos do shell para forçar a atualização.
const CACHE = 'quicknote-v5';
const CDN_CACHE = 'quicknote-cdn-v1';
const KEEP = [CACHE, CDN_CACHE];
const SHELL = [
  '/', '/app.js',
  '/manifest.webmanifest', '/manifest-claro.webmanifest', '/manifest-escuro.webmanifest',
  '/favicon.ico', '/icons/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png',
];
// Fontes e ícones externos: guardados para o app abrir bonito offline.
const CDN_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const cacheable = (res) => res && (res.ok || res.type === 'opaque');

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // CDN: usa o cache e atualiza em segundo plano
  if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open(CDN_CACHE).then(async (c) => {
      const hit = await c.match(request);
      const net = fetch(request).then((res) => { if (cacheable(res)) c.put(request, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  // API e outras origens: sempre direto na rede
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  // Arquivos do app: rede primeiro, cache como reserva offline
  e.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(request, copy)); }
        return res;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }).then((hit) =>
        hit || (request.mode === 'navigate' ? caches.match('/') : Response.error())))
  );
});
