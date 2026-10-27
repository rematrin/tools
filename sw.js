const CACHE_NAME = 'tools-pwa-v28';
const DYNAMIC_CACHE = 'tools-dynamic-image-cache-v1';
const ASSETS = [
    './fx_converter.html',
    './clock.html',
    './home.html',
    './todo.html',
    './todo.js',
    './todo.css',
    './todo_manifest.json',
    './creatorhub.html',
    './creatorhub.js',
    './creatorhub.css',
    './teleprompter.html',
    './teleprompter.css',
    './teleprompter.js',
    './teleprompter_manifest.json',
    './img/teleprompter128.png',
    './img/teleprompter256.png',
    './theme.css',
    './theme-loader.js',
    './footer.css',
    './footer.html',
    './auth-widget.css',
    './nav-widget.js',
    './auth-widget.js',
    './header.js',
    './header.html',
    './sidebar.css',
    './sidebar.html',
    './left-sidebar.js',
    './gcalendar-service.js',
    './completed.mp3',
    './img/exchange.png',
    './img/exchange2.png',
    './img/clock.png',
    './img/clock2.png',
    './img/todo128.png',
    './img/todo256.png',
    './img/hub128.png',
    './img/hub256.png',
    './img/hub256t.png',
    './img/music256.png',
    './img/house-favicon.svg',
    './img/glass.jpg',
    // External CDN scripts & styles for full offline PWA boot
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js',
    'https://cdn.jsdelivr.net/npm/mobile-drag-drop@2.3.0-rc.2/default.css',
    'https://cdn.jsdelivr.net/npm/mobile-drag-drop@2.3.0-rc.2/index.min.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap',
    'https://unpkg.com/@lottiefiles/dotlottie-wc@0.9.14/dist/dotlottie-wc.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async cache => {
            // Robust caching using allSettled so one external CDN failure never halts SW installation
            await Promise.allSettled(
                ASSETS.map(async url => {
                    try {
                        const response = await fetch(url);
                        if (response && (response.ok || response.type === 'opaque')) {
                            await cache.put(url, response);
                        }
                    } catch (e) {
                        console.warn('SW pre-cache item warning for', url, e);
                    }
                })
            );
        }).then(() => self.skipWaiting())
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

    // Skip non-http/https requests (like chrome-extension://)
    if (!url.protocol.startsWith('http')) return;

    // Skip caching only for Firebase streaming / live backend APIs so Firestore & Auth manage network cleanly
    const isFirebaseBackend = (
        url.hostname === 'firestore.googleapis.com' ||
        url.hostname.endsWith('.firestore.googleapis.com') ||
        url.hostname.includes('identitytoolkit') ||
        url.hostname.includes('securetoken.googleapis.com') ||
        url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('firebasestorage.googleapis.com')
    );
    if (isFirebaseBackend) {
        return;
    }

    if (url.hostname === 'open.er-api.com' || url.hostname === 'is.gd') {
        // Bypass ServiceWorker totally so fetch() fails natively when offline
        return;
    }

    // Dynamic Image Caching (Cache First for ANY external or internal images)
    const isImage = event.request.destination === 'image' || url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/i);
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

    // CDN Dependencies & Fonts (Cache-First strategy for ultra-fast offline startup)
    const isCdnAsset = (
        url.hostname === 'www.gstatic.com' ||
        url.hostname === 'fonts.gstatic.com' ||
        url.hostname === 'fonts.googleapis.com' ||
        url.hostname === 'cdn.jsdelivr.net' ||
        url.hostname === 'unpkg.com'
    );
    if (isCdnAsset) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) {
                    return cached;
                }
                return fetch(event.request).then(response => {
                    if (response && (response.ok || response.type === 'opaque')) {
                        const resClone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
                    }
                    return response;
                }).catch(() => new Response('', { status: 408, statusText: 'Offline' }));
            })
        );
        return;
    }

    // Navigation and local assets: Network First strategy with Cache Fallback
    event.respondWith(
        fetch(event.request).then(response => {
            // Copy the response to cache for later offline use
            if (response && response.ok) {
                const resClone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
            }
            return response;
        }).catch(() => {
            // If offline, check the cache
            return caches.match(event.request, { ignoreSearch: true })
                .then(cachedResponse => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // If navigation request and we don't have it in cache, fallback to todo.html
                    if (event.request.mode === 'navigate' || event.request.destination === 'document') {
                        return caches.match('./todo.html');
                    }
                    return null;
                });
        })
    );
});
