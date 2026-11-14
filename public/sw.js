const CACHE_PREFIX = 'royversemoviez'
const SHELL_CACHE = `${CACHE_PREFIX}-shell-v2`
const TMDB_IMAGE_CACHE = `${CACHE_PREFIX}-tmdb-images-v1`
const APP_SCOPE = self.registration.scope
const APP_ENTRY = new URL('index.html', APP_SCOPE).href
const APP_ROOT = APP_SCOPE

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll([
      APP_ROOT,
      APP_ENTRY,
      new URL('favicon.svg', APP_SCOPE).href,
      new URL('manifest.webmanifest', APP_SCOPE).href,
      new URL('icons/icon-192.png', APP_SCOPE).href,
      new URL('icons/icon-512.png', APP_SCOPE).href,
      new URL('apple-touch-icon.png', APP_SCOPE).href,
    ]))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith(CACHE_PREFIX) && ![SHELL_CACHE, TMDB_IMAGE_CACHE].includes(key))
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  )
})

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  // Never intercept video embeds, stream URLs, or third-party player APIs.
  if (url.origin === self.location.origin) {
    if (request.mode === 'navigate') {
      event.respondWith(
        fetch(request).then(async (response) => {
          if (response.status === 404) {
            const cachedApp = await caches.match(APP_ENTRY)
            if (cachedApp) return cachedApp
            const appResponse = await fetch(APP_ENTRY)
            if (appResponse.ok) return appResponse
          }
          if (response.ok) {
            const cache = await caches.open(SHELL_CACHE)
            cache.put(APP_ENTRY, response.clone())
          }
          return response
        }).catch(async () => (await caches.match(APP_ENTRY)) || (await caches.match(APP_ROOT)))
      )
      return
    }

    if (['script', 'style', 'font', 'image'].includes(request.destination)) {
      event.respondWith(cacheFirst(request, SHELL_CACHE))
      return
    }
  }

  // Cache TMDB artwork only. API responses and all video streams stay network-only.
  if (url.origin === 'https://image.tmdb.org' && request.destination === 'image') {
    event.respondWith(cacheFirst(request, TMDB_IMAGE_CACHE))
  }
})
