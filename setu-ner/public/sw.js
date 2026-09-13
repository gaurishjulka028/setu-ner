// SETU-NER service worker — offline app shell + map tile caching
const CACHE = 'setu-ner-v1'
const SHELL = ['/', '/index.html', '/favicon.svg']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  // cache-first for map tiles (Stadia Maps). Client-side caching like this is
  // explicitly permitted by Stadia's ToS ("standard client-side caching ...
  // for performance reasons"); the offline-cache exemption also caps mobile
  // offline caching at 100MB/device, which a demo's worth of tiles won't
  // approach, but keep that ceiling in mind before caching a whole region.
  if (url.hostname.includes('tiles.stadiamaps.com') || url.hostname.endsWith('tile.openstreetmap.org')) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(e.request)
        if (hit) return hit
        try {
          const res = await fetch(e.request)
          if (res.ok) cache.put(e.request, res.clone())
          return res
        } catch {
          return hit || new Response('', { status: 504 })
        }
      })
    )
    return
  }
  // network-first for app shell & APIs, fallback to cache when offline
  if (e.request.method === 'GET') {
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone()
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {})
        return res
      }).catch(async () => (await caches.match(e.request)) || (await caches.match('/index.html')))
    )
  }
})
