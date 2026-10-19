const CACHE_NAME = 'steampunk-explorer-v332';
const APP_SHELL = [
    './',
    './MainSystem/index.html',
    './MainSystem/icons/app-icon.svg',
    './MainSystem/icons/app-icon.jpg',
    './MainSystem/icons/items/crafting-icons.svg',
    './MapSystem/index.html',
    './MapSystem/settings.html',
    './MapSystem/worldmap.html',
    './MapSystem/cell-atlas.html',
    './MapSystem/manifest.webmanifest',
    './MapSystem/css/style.css',
    './MapSystem/cell-icons.svg',
    './MapSystem/js/main.js?v=851',
    './MapSystem/js/gameAudio.js?v=6',
    './design/game-audio-sfx-reference-player.js?v=4',
    './design/audio-sources/pdsounds/manifest.json',
    './MapSystem/js/mapGenerator.js',
    './MapSystem/js/skinRenderer.js',
    './MapSystem/js/skinPreview.js',
    './MapSystem/js/buildingData.js',
    './MapSystem/js/buildingUtilityNetworks.js',
    './MapSystem/js/cellRules.js',
    './MapSystem/js/cellIconRenderer.js',
    './MapSystem/js/worldCells.js',
    './MapSystem/js/craftingData.js?v=19',
    './MapSystem/js/territoryBorders.js',
    './MapSystem/js/railwayRuntime.js',
    './MapSystem/js/MapGenerator/index.js',
    './MapSystem/js/MapGenerator/BiomeGenerator.js',
    './MapSystem/js/MapGenerator/HeightmapGenerator.js',
    './MapSystem/js/MapGenerator/MapRenderer.js',
    './MapSystem/js/MapGenerator/TerritoryGenerator.js',
    './MapSystem/js/mapWorker.js',
    './MapSystem/assets/app-icon-192.png',
    './MapSystem/assets/app-icon-512.png',
    './MapSystem/assets/building-icons.svg',
    './MapSystem/assets/field-automaton-icon.svg',
    './MapSystem/assets/vehicle-side-icons.svg',
    './MapSystem/assets/guide-screenshots/01-exploration-landscape.png',
    './MapSystem/assets/guide-screenshots/01b-movement-pad.png',
    './MapSystem/assets/guide-screenshots/02-status.png',
    './MapSystem/assets/guide-screenshots/03-inventory.png',
    './MapSystem/assets/guide-screenshots/03b-crafting.png',
    './MapSystem/assets/guide-screenshots/03b-scroll-book-button.png',
    './MapSystem/assets/guide-screenshots/03b-scroll-item.png',
    './MapSystem/assets/guide-screenshots/04-building-list.png',
    './MapSystem/assets/guide-screenshots/04-scroll-book.png',
    './MapSystem/assets/guide-screenshots/05-gear-editor.png',
    './MapSystem/assets/guide-screenshots/06-control-preview.png',
    './MapSystem/assets/guide-screenshots/07-dashboard.png',
    './MapSystem/assets/guide-screenshots/08-navigation.png',
    './MapSystem/assets/guide-screenshots/09-world-map.png',
    './MapSystem/assets/guide-screenshots/10-guide.png',
    './MapSystem/assets/guide-screenshots/10b-cell-catalog.png',
    './MapSystem/assets/guide-screenshots/11-settings.png',
    './GearSystem/index.html',
    './GearSystem/scroll-library.html?v=69',
    './GearSystem/css/style.css',
    './GearSystem/js/main.js?v=gear-art-20',
    './GearSystem/js/scroll-library.js?v=75',
    './GearSystem/js/GearSystem.js',
    './GearSystem/js/GearManager.js',
    './GearSystem/js/GameState.js',
    './GearSystem/js/CanvasRenderer.js',
    './GearSystem/js/UIController.js',
    './GearSystem/js/vendor/qrcode-generator.min.js',
    './GearSystem/js/vendor/jsQR.js',
    './GearSystem/assets/gear-production.svg',
    './GearSystem/assets/gear-logistics.svg',
    './GearSystem/assets/gear-industrial.svg',
    './GearSystem/assets/gear-core.png',
    './GearSystem/assets/gear-clockwork.svg',
    './GearSystem/assets/gear-alchemical.svg'
];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(APP_SHELL.map(path => new URL(path, self.registration.scope).href));
        const manifestUrl = new URL('./design/audio-sources/pdsounds/manifest.json', self.registration.scope);
        const manifestResponse = await cache.match(manifestUrl);
        if (!manifestResponse) throw new Error('ゲーム効果音の音源台帳がアプリキャッシュにありません。');
        const manifest = await manifestResponse.json();
        if (!Array.isArray(manifest.assets) || manifest.assets.some(asset => typeof asset.file !== 'string')) {
            throw new Error('ゲーム効果音の音源台帳が不正です。');
        }
        const recordingUrls = manifest.assets.map(asset =>
            new URL(`./design/audio-sources/pdsounds/${asset.file}`, self.registration.scope).href
        );
        await cache.addAll(recordingUrls);
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames
            .filter(name => name.startsWith('steampunk-explorer-') && name !== CACHE_NAME)
            .map(name => caches.delete(name)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;

    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(event.request)
            || await cache.match(event.request, { ignoreSearch: true });
        if (cached) return cached;

        try {
            const response = await fetch(event.request);
            if (response.ok && response.type === 'basic') {
                event.waitUntil(cache.put(event.request, response.clone()));
            }
            return response;
        } catch (error) {
            if (event.request.mode === 'navigate') {
                const offlinePage = await cache.match(new URL('./MapSystem/index.html', self.registration.scope).href);
                if (offlinePage) return offlinePage;
            }
            throw error;
        }
    })());
});
