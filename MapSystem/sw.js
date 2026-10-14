const CACHE_NAME = 'steampunk-explorer-v238';
const APP_SHELL = [
    './',
    './index.html',
    './settings.html',
    './worldmap.html',
    './manifest.webmanifest',
    './css/style.css?v=701',
    './js/main.js?v=806',
    './js/craftingData.js?v=17',
    './js/mapGenerator.js?v=92',
    './js/skinRenderer.js?v=5',
    './js/skinPreview.js?v=4',
    './js/buildingData.js?v=35',
    './js/cellRules.js',
    './js/cellIconRenderer.js?v=5',
    './js/worldCells.js?v=13',
    './cell-icons.svg?v=5',
    './js/territoryBorders.js?v=36',
    './js/MapGenerator/index.js?v=81',
    './js/MapGenerator/BiomeGenerator.js',
    './js/MapGenerator/HeightmapGenerator.js',
    './js/MapGenerator/MapRenderer.js',
    './js/MapGenerator/TerritoryGenerator.js',
    './js/mapWorker.js?v=90',
    './assets/app-icon-192.png',
    './assets/app-icon-512.png',
    './assets/field-automaton-icon.svg?v=3'
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    if (new URL(event.request.url).pathname.endsWith('/manifest.webmanifest')) {
        event.respondWith(
            fetch(event.request, { cache: 'no-cache' }).then((response) => {
                if (response.ok && response.type !== 'opaque') {
                    const copy = response.clone();
                    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)));
                }
                return response;
            }).catch((error) => caches.match(event.request).then((cached) => {
                if (cached) return cached;
                throw error;
            }))
        );
        return;
    }
    event.respondWith(
        caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
            if (!response || response.status !== 200 || response.type === 'opaque') return response;
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
            return response;
        }))
    );
});
