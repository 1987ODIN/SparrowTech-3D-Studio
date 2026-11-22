const cacheName = 'crowmakes-tags-v1';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.add('/tags/')));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.mode !== 'navigate' || new URL(request.url).pathname !== '/tags/') return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put('/tags/', response.clone());
      return response;
    } catch (error) {
      return await cache.match('/tags/') || Response.error();
    }
  })());
});
