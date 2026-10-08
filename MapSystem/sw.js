const CACHE_NAME = 'steampunk-explorer-v141';
const APP_SHELL = [
    './',
    './index.html',
    './settings.html',
    './manifest.webmanifest',
    './css/style.css?v=648',
    './js/main.js?v=730',
    './js/mapGenerator.js?v=89',
    './js/skinRenderer.js?v=2',
    './js/cellRules.js',
    './js/cellIconRenderer.js?v=5',
    './js/worldCells.js?v=13',
    './cell-icons.svg?v=5',
    './js/territoryBorders.js?v=35',
    './js/MapGenerator/index.js?v=80',
    './js/MapGenerator/BiomeGenerator.js',
    './js/MapGenerator/HeightmapGenerator.js',
    './js/MapGenerator/MapRenderer.js',
    './js/MapGenerator/TerritoryGenerator.js',
    './js/mapWorker.js?v=89',
    './assets/app-icon-192.png',
    './assets/app-icon-512.png'
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
