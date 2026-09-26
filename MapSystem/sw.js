const CACHE_NAME = 'steampunk-explorer-v3';
const APP_SHELL = [
    './',
    './index.html',
    './manifest.webmanifest',
    './css/style.css?v=511',
    './js/main.js?v=511',
    './js/mapGenerator.js?v=88',
    './js/skinRenderer.js?v=2',
    './js/cellRules.js',
    './js/territoryBorders.js?v=35',
    './js/MapGenerator/index.js?v=79',
    './js/MapGenerator/BiomeGenerator.js',
    './js/MapGenerator/HeightmapGenerator.js',
    './js/MapGenerator/MapRenderer.js',
    './js/MapGenerator/TerritoryGenerator.js',
    './js/mapWorker.js?v=88',
    '../MainSystem/icons/app-icon.jpg'
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
    event.respondWith(
        caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
            if (!response || response.status !== 200 || response.type === 'opaque') return response;
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
            return response;
        }))
    );
});
