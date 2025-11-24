// sw.js v4.4.0
const CACHE_NAME = "mp3-player-v4.4.0";
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/main.js",
  "./js/modules/settings.js",
  "./js/modules/visualizer.js",
  "./js/modules/playlist.js",
  "./js/modules/playerCore.js",
  "./js/modules/audioFx.js",
  "./js/modules/utils.js",
  "./js/modules/playlistPersist.js",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => k !== CACHE_NAME && caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Rangeリクエストはキャッシュしない（audio対策）
  if (req.headers.get("range")) {
    event.respondWith(fetch(req));
    return;
  }

  const url = new URL(req.url);
  if (url.origin !== location.origin) {
    event.respondWith(fetch(req));
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
        return res;
      });
    })
  );
});
