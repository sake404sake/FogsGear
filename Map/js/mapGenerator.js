import { MapManager as MapManagerClass, BIOME_COLORS as SharedBiomeColors } from './MapGenerator/index.js?v=77';

export { SharedBiomeColors as BIOME_COLORS };
export const MapManager = MapManagerClass;

const MAP_CACHE_DB = 'fogsgear-map-cache-v21';
const MAP_CACHE_STORE = 'snapshots';
const MAP_CACHE_VERSION = 'coastal-landing-v86';

function openMapCache() {
    return new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) {
            reject(new Error('IndexedDB is unavailable'));
            return;
        }
        const request = indexedDB.open(MAP_CACHE_DB, 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore(MAP_CACHE_STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Map cache could not be opened'));
    });
}

function tileTypeCode(tile) {
    if (tile?.type === 'LAKE' || tile?.isLake) return 4;
    if (tile?.type === 'RUIN' || tile?.isRuin) return 5;
    if (tile?.type === 'MOUNTAIN') return 3;
    if (tile?.type === 'FOREST') return 2;
    if (tile?.type === 'SAND') return 6;
    if (tile?.type === 'PLAINS') return 1;
    return 0;
}

function colorForType(typeCode) {
    return {
        1: '#8db87c',
        2: '#3e6b48',
        3: '#746b60',
        6: '#d5bd8a',
        4: '#3b82f6',
        5: '#6f2c2c'
    }[typeCode] || '#1e4d6b';
}

export async function saveMapSnapshot(generated, seed, width = 2000, height = 1000) {
    if (!generated?.grid?.length) return;
    try {
        const rows = generated.grid.length;
        const cols = generated.grid[0].length;
        const types = new Uint8Array(rows * cols);
        const territories = new Int16Array(rows * cols);
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const index = y * cols + x;
                const tile = generated.grid[y][x];
                let flags = tileTypeCode(tile) << 4;
                if (tile?.isMainland) flags |= 1;
                if (tile?.isIsland) flags |= 2;
                types[index] = flags;
                territories[index] = Number.isInteger(tile?.territoryId) ? tile.territoryId : -1;
            }
        }
        const database = await openMapCache();
        await new Promise((resolve, reject) => {
            const transaction = database.transaction(MAP_CACHE_STORE, 'readwrite');
            transaction.objectStore(MAP_CACHE_STORE).put({
                seed: String(seed),
                width: cols,
                height: rows,
                types,
                territories,
                territoryList: generated.territories || [],
                playerPos: generated.playerPos || generated.spawn || null
            }, `${MAP_CACHE_VERSION}:${String(seed)}:${width}:${height}`);
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
        });
        database.close();
    } catch (error) {
        // The cache is an optional performance enhancement.
    }
}

export async function loadMapSnapshot(seed, width = 2000, height = 1000) {
    try {
        const database = await openMapCache();
        const snapshot = await new Promise((resolve, reject) => {
            const request = database.transaction(MAP_CACHE_STORE).objectStore(MAP_CACHE_STORE).get(`${MAP_CACHE_VERSION}:${String(seed)}:${width}:${height}`);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        database.close();
        if (!snapshot?.types || snapshot.width !== width || snapshot.height !== height) return null;

        const grid = Array.from({ length: height }, (_, y) => {
            const row = new Array(width);
            for (let x = 0; x < width; x++) {
                const index = y * width + x;
                const packedType = snapshot.types[index];
                const typeCode = packedType >> 4;
                const isMainland = Boolean(packedType & 1);
                const isIsland = Boolean(packedType & 2);
                const isLake = typeCode === 4;
                const isSea = typeCode === 0;
                row[x] = {
                    x,
                    y,
                    type: ['SEA', 'PLAINS', 'FOREST', 'MOUNTAIN', 'LAKE', 'RUIN', 'SAND'][typeCode] || 'SEA',
                    typeCode: isSea || isLake ? 3 : typeCode === 3 ? 1 : typeCode === 2 ? 2 : 0,
                    isSea,
                    isOcean: isSea,
                    isLake,
                    isLand: !isSea && !isLake,
                    isMainland,
                    isIsland,
                    territoryId: snapshot.territories[index],
                    color: colorForType(typeCode)
                };
            }
            return row;
        });
        return { grid, worldMap: grid, territories: snapshot.territoryList || [], ruins: [], playerPos: snapshot.playerPos || null };
    } catch (error) {
        return null;
    }
}

export class MapGenerator extends MapManagerClass {
    constructor(widthOrCanvasId, height = 1000, seed = 'SteampunkIsland_01') {
        if (typeof widthOrCanvasId === 'string') {
            super({ width: 120, height: 80, seed, canvas: null });
            this.canvas = document.getElementById(widthOrCanvasId);
            this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
            this.cols = 120;
            this.rows = 80;
            this.tileSize = 8;
            this.zoom = 1;
            this.COLORS = {
                SEA: '#123a5a',
                PLAINS: '#8db87c',
                MOUNTAIN: '#746b60',
                SAND: '#d5bd8a',
                FOREST: '#3e6b48',
                LAKE: '#3b82f6',
                RUINS: '#ef4444',
                PLAYER: '#ff0000'
            };
            this.territories = [];
            this.grid = [];
            this.playerPos = { x: 0, y: 0 };
            this.ruinsPos = [];
            this.init();
            return;
        }

        super(widthOrCanvasId, height, seed);
    }

    init() {
        if (!this.canvas) return;
        this.canvas.width = this.cols * this.tileSize;
        this.canvas.height = this.rows * this.tileSize;
        this.syncLegendUI();
        this.generateMap();
        this.draw();
    }

    generateMap() {
        return this.generate(this.seed);
    }

    draw() {
        if (!this.canvas || !this.ctx) return;
        if (this.renderer) {
            this.renderer.render();
        }
        return this.grid;
    }

    syncLegendUI() {
        if (!document) return;
        const mapping = {
            '草原・平地': SharedBiomeColors.PLAINS,
            '山地・崖': SharedBiomeColors.MOUNTAIN,
            '森林・丘陵': SharedBiomeColors.FOREST,
            '湖沼・蒸気湖': SharedBiomeColors.LAKE,
            '古代遺跡': SharedBiomeColors.RUINS,
            '現在地': SharedBiomeColors.PLAYER
        };
        document.querySelectorAll('.legend-color').forEach((el) => {
            const text = el.parentElement?.textContent?.trim() || '';
            const match = Object.entries(mapping).find(([label]) => text.startsWith(label) || text.includes(label));
            if (match) {
                el.style.backgroundColor = match[1];
            }
        });
    }

    updatePlayerPosition(tileX, tileY) {
        super.updatePlayerPosition(tileX, tileY);
    }
}

export default MapGenerator;
