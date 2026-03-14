const CACHE_NAME = 'fx-converter-v1';
const ASSETS = [
    './fx_converter.html',
    './theme.css',
    './theme-loader.js',
    './footer.css',
    './footer.html',
    './auth-widget.css',
    './nav-widget.js',
    './auth-widget.js',
    './header.js',
    './header.html',
    './exchange.png',
    './exchange2.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);

    if (url.hostname === 'open.er-api.com') {
        // Network first for API
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const resClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Cache first for CDN icons and flags
    if (url.hostname === 'flagcdn.com' || url.hostname === 'cdn-icons-png.flaticon.com') {
        event.respondWith(
            caches.match(event.request).then(cached => {
                return cached || fetch(event.request).then(response => {
                    const resClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
                    return response;
                });
            }).catch(() => new Response('')) // Ignore errors gracefully if offline
        );
        return;
    }

    // Cache first for main assets with ignoreSearch true to handle ?fx= params
    event.respondWith(
        caches.match(event.request, { ignoreSearch: true })
            .then(cachedResponse => {
                return cachedResponse || fetch(event.request).then(response => {
                    const resClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
                    return response;
                });
            })
            .catch(() => {
                if (event.request.mode === 'navigate') {
                    return caches.match('./fx_converter.html', { ignoreSearch: true });
                }
            })
    );
});
