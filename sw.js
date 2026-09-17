/* Mission Hills Skins — offline cache. Serve from cache instantly, refresh in the background;
   the next open picks up any update. Bump V on every deploy. */
var V = 'mhs-2026-09-18b';
var ASSETS = ['./', './index.html', './engine.js', './courses.js', './qrcode.min.js', './jsqr.min.js', './manifest.webmanifest', './icon.svg'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(V).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== V; }).map(function (k) { return caches.delete(k); })); })
    .then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return;
  e.respondWith(caches.open(V).then(function (c) {
    return c.match(e.request, { ignoreSearch: true }).then(function (cached) {
      var fresh = fetch(e.request).then(function (res) { if (res && res.ok) c.put(e.request, res.clone()); return res; }).catch(function () { return null; });
      return cached || fresh.then(function (r) { return r || c.match('./index.html'); });
    });
  }));
});
