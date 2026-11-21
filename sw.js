// The service worker that makes Undead End installable (and playable offline).
// Network first: online, every request goes to the network, so a new version shows up straight away — the copy kept
// in the cache is only for when the network isn't there. (index.html's ?v= stamps keep the files themselves fresh.)
const CACHE = 'undead-end';
const CORE = ['./', 'index.html', 'style.css', 'locations.js', 'data.js', 'engine.js', 'game.js', 'manifest.json',
  'assets/icon-192.png', 'assets/icon-512.png', 'assets/chainsaw.png', 'assets/shotgun.png', 'assets/pistol.png', 'assets/barn.png',
  'assets/axe.mp3', 'assets/chainsaw.mp3', 'assets/groan.mp3', 'assets/pistol.mp3', 'assets/shotgun.mp3',
  'assets/carstart.mp3', 'assets/carDriving.mp3', 'assets/carNoGas.mp3',
  'assets/helicopter.mp3', 'assets/horse.mp3'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}));   // (a miss here mustn't block installing)
  self.skipWaiting();
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok && res.type === 'basic' && !req.headers.has('range')) {   // (audio range requests come back partial: not cached)
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })   // offline: the cached copy, whatever its ?v= stamp
    .then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
