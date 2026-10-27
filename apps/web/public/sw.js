// Caches the app shell only: static build files and icons. Pages and data always come from the network,
// so a signed-in screen is never served from the cache. Offline, a page load falls back to /sign-in
// (the sign-in page, cached on install).
const CACHE = 'jemma-shell-v1'
const SHELL = ['/sign-in', '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const isShellAsset = (url) => url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (isShellAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((cache) => cache.put(request, copy))
            }
            return res
          }),
      ),
    )
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/sign-in')))
  }
})
