const CACHE_NAME = 'tools-pwa-v3';
const DYNAMIC_CACHE = 'tools-dynamic-image-cache-v1';
const ASSETS = [
    './fx_converter.html',
    './clock.html',
    './home.html',
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
    './exchange2.png',
    './clock.png',
    './clock2.png',
    './house-favicon.svg',
    './glass.jpg'
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
            keys.filter(key => key !== CACHE_NAME && key !== DYNAMIC_CACHE).map(key => caches.delete(key))
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);

    // Skip caching for Firebase APIs and Auth to ensure logic doesn't break
    if (url.hostname.includes('firebaseio.com') || url.hostname.includes('googleapis.com') || url.hostname.includes('identitytoolkit')) {
        return;
    }

    if (url.hostname === 'open.er-api.com') {
        // Network first for FX API
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

    // Dynamic Image Caching (Cache First for ANY external or internal images used in home.html)
    const isImage = event.request.destination === 'image' || url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i);

    // External images and user icons
    if (isImage || url.hostname === 'flagcdn.com' || url.hostname === 'cdn-icons-png.flaticon.com' || url.hostname.includes('ibb.co')) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                return cached || fetch(event.request).then(response => {
                    const resClone = response.clone();
                    caches.open(DYNAMIC_CACHE).then(cache => cache.put(event.request, resClone));
                    return response;
                }).catch(() => new Response('')); // Ignore gracefully offline
            })
        );
        return;
    }

    // Cache first for main assets with ignoreSearch true to handle ?fx= or ?tz= params
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
                // Fallback for navigation requests
                if (event.request.mode === 'navigate') {
                    if (url.pathname.includes('clock.html')) {
                        return caches.match('./clock.html', { ignoreSearch: true });
                    }
                    if (url.pathname.includes('home.html')) {
                        return caches.match('./home.html', { ignoreSearch: true });
                    }
                    return caches.match('./fx_converter.html', { ignoreSearch: true });
                }
            })
    );
});
