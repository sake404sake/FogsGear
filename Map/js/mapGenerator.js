import { MapManager as MapManagerClass, BIOME_COLORS as SharedBiomeColors } from './MapGenerator/index.js';

export { SharedBiomeColors as BIOME_COLORS };
export const MapManager = MapManagerClass;

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
                MOUNTAIN: '#6b7280',
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
