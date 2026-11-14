/* Offline shell for check-in only. Never cache HTML/JS so homepage rocket updates stay fresh. */
const CACHE = 'astra-med-shell-v2'

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api')) return

  const dest = request.destination
  const isDoc = request.mode === 'navigate' || dest === 'document' || dest === 'script' || dest === 'style' || url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css')
  if (isDoc || url.pathname === '/' || url.pathname.endsWith('/')) {
    event.respondWith(fetch(request))
    return
  }

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request)
      if (cached) return cached
      try {
        const response = await fetch(request)
        if (response.ok) void cache.put(request, response.clone())
        return response
      } catch {
        return cached || Response.error()
      }
    }),
  )
})
