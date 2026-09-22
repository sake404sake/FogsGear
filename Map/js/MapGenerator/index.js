import { HeightmapGenerator } from './HeightmapGenerator.js';
import { BiomeGenerator } from './BiomeGenerator.js';
import { TerritoryGenerator } from './TerritoryGenerator.js';
import { MapRenderer, BIOME_COLORS } from './MapRenderer.js';

export { BIOME_COLORS };
export { HeightmapGenerator, BiomeGenerator, TerritoryGenerator, MapRenderer };

export class MapManager {
    constructor(widthOrOptions, height = 1000, seed = 'SteampunkIsland_01') {
        if (typeof widthOrOptions === 'object' && widthOrOptions !== null) {
            this.width = Number(widthOrOptions.width) || 1000;
            this.height = Number(widthOrOptions.height) || 1000;
            this.seed = widthOrOptions.seed || seed;
            this.canvas = widthOrOptions.canvas || null;
            this.legendSelector = widthOrOptions.legendSelector || null;
        } else {
            this.width = Number(widthOrOptions) || 1000;
            this.height = Number(height) || 1000;
            this.seed = seed;
            this.canvas = null;
            this.legendSelector = null;
        }

        this.heightmapGenerator = new HeightmapGenerator(this.width, this.height, this.seed);
        this.biomeGenerator = new BiomeGenerator(this.seed);
        this.territoryGenerator = new TerritoryGenerator(this.seed);
        this.renderer = this.canvas ? new MapRenderer({ canvas: this.canvas, width: this.width, height: this.height }) : null;
        this.grid = [];
        this.territories = [];
        this.ruins = [];
        this.playerPos = { x: 0, y: 0 };
        this.labels = [];
    }

    hashString(value) {
        let hash = 2166136261;
        for (let i = 0; i < value.length; i++) {
            hash ^= value.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    findIslandSpawn(grid) {
        const candidates = [];
        const cols = grid[0].length;
        const rows = grid.length;

        for (let y = 1; y < rows - 1; y++) {
            for (let x = 1; x < cols - 1; x++) {
                const tile = grid[y][x];
                if (!tile || tile.isSea || tile.isLake) continue;
                if (tile.isIsland && (tile.type === 'PLAINS' || tile.type === 'FOREST')) {
                    candidates.push({ x, y });
                }
            }
        }

        if (candidates.length === 0) {
            for (let y = 1; y < rows - 1; y++) {
                for (let x = 1; x < cols - 1; x++) {
                    const tile = grid[y][x];
                    if (!tile || tile.isSea || tile.isLake) continue;
                    if (tile.type === 'PLAINS' || tile.type === 'FOREST') {
                        candidates.push({ x, y });
                    }
                }
            }
        }

        const target = candidates[Math.floor(candidates.length * 0.65)] || { x: Math.floor(cols * 0.82), y: Math.floor(rows * 0.58) };
        return { x: target.x, y: target.y };
    }

    normalizeGridMetadata() {
        const palette = {
            SEA: '#1e4d6b',
            PLAINS: '#8db87c',
            FOREST: '#3e6b48',
            MOUNTAIN: '#a8947d',
            LAKE: '#3b82f6'
        };

        for (let y = 0; y < this.grid.length; y++) {
            for (let x = 0; x < this.grid[y].length; x++) {
                const tile = this.grid[y][x];
                if (!tile) continue;
                const type = tile.type || (tile.isLake ? 'LAKE' : tile.isOcean || tile.isSea ? 'SEA' : 'PLAINS');
                tile.type = type;
                tile.isOcean = type === 'SEA';
                tile.isSea = tile.isOcean;
                tile.isLake = type === 'LAKE';
                tile.isLand = !tile.isOcean && !tile.isLake;
                tile.hasIsland = Boolean(tile.hasIsland) || tile.isLand;
                tile.hasMainland = Boolean(tile.hasMainland) || tile.isLand;
                tile.color = tile.color || palette[type] || palette.PLAINS;
            }
        }
    }

    findNearestMainlandLabelPosition(preferredX, preferredY) {
        const cols = this.grid[0]?.length || 0;
        const rows = this.grid.length || 0;
        if (!cols || !rows) return { x: preferredX, y: preferredY };

        const maxRadius = Math.max(8, Math.min(rows, cols) * 0.08);
        let best = null;
        let bestDistance = Infinity;

        for (let radius = 0; radius <= maxRadius; radius++) {
            const startX = Math.max(0, Math.floor(preferredX - radius));
            const endX = Math.min(cols - 1, Math.ceil(preferredX + radius));
            const startY = Math.max(0, Math.floor(preferredY - radius));
            const endY = Math.min(rows - 1, Math.ceil(preferredY + radius));

            for (let y = startY; y <= endY; y++) {
                for (let x = startX; x <= endX; x++) {
                    const tile = this.grid[y]?.[x];
                    if (!tile || tile.isSea || tile.isLake || !tile.isLand || !tile.isMainland) continue;
                    const dist = (x - preferredX) ** 2 + (y - preferredY) ** 2;
                    if (dist < bestDistance) {
                        bestDistance = dist;
                        best = { x, y };
                    }
                }
            }
            if (best) return best;
        }

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const tile = this.grid[y]?.[x];
                if (!tile || tile.isSea || tile.isLake || !tile.isLand || !tile.isMainland) continue;
                const dist = (x - preferredX) ** 2 + (y - preferredY) ** 2;
                if (dist < bestDistance) {
                    bestDistance = dist;
                    best = { x, y };
                }
            }
        }

        return best || { x: preferredX, y: preferredY };
    }

    ensureRegionAndRuinData() {
        const fallbackRegions = [
            { id: 0, name: '北部山岳地帯', x: this.width * 0.23, y: this.height * 0.18 },
            { id: 1, name: '西部穀倉地帯', x: this.width * 0.18, y: this.height * 0.48 },
            { id: 2, name: '中央交易都市', x: this.width * 0.34, y: this.height * 0.54 },
            { id: 3, name: '東部工業圏', x: this.width * 0.40, y: this.height * 0.72 },
            { id: 4, name: '南部香辛料地', x: this.width * 0.30, y: this.height * 0.82 }
        ];

        if (!this.territories || this.territories.length === 0) {
            this.territories = fallbackRegions.map((region) => ({
                ...region,
                territoryId: region.id,
                labelPos: { x: region.x, y: region.y },
                kind: 'fallback'
            }));
        }

        const validatedTerritories = [];
        for (const territory of this.territories) {
            let labelPos = territory.labelPos ? { x: Number(territory.labelPos.x), y: Number(territory.labelPos.y) } : null;
            if (!labelPos || !Number.isFinite(labelPos.x) || !Number.isFinite(labelPos.y)) {
                labelPos = { x: this.width * 0.5, y: this.height * 0.5 };
            }
            const tile = this.grid[Math.floor(labelPos.y)]?.[Math.floor(labelPos.x)];
            if (tile && tile.isLand && !tile.isSea && !tile.isLake && tile.isMainland) {
                territory.labelPos = labelPos;
                validatedTerritories.push(territory);
                continue;
            }
            const fallback = this.findNearestMainlandLabelPosition(labelPos.x, labelPos.y);
            territory.labelPos = fallback;
            if (fallback && Number.isFinite(fallback.x) && Number.isFinite(fallback.y)) {
                validatedTerritories.push(territory);
            }
            if (!territory.name) {
                territory.name = fallbackRegions[territory.id % fallbackRegions.length]?.name || '不明な領域';
            }
        }
        this.territories = validatedTerritories.filter(Boolean);

        for (const territory of this.territories) {
            if (!territory.name) {
                territory.name = fallbackRegions[territory.id % fallbackRegions.length]?.name || '不明な領域';
            }
        }

        if (!this.ruins || this.ruins.length === 0) {
            const candidateTiles = [];
            for (let y = 1; y < this.grid.length - 1; y++) {
                for (let x = 1; x < this.grid[0].length - 1; x++) {
                    const tile = this.grid[y][x];
                    if (!tile || !tile.isLand || tile.type === 'SEA' || tile.type === 'LAKE') continue;
                    if (x > this.width * 0.18 && x < this.width * 0.92 && y > this.height * 0.14 && y < this.height * 0.86) {
                        candidateTiles.push({ x, y });
                    }
                }
            }
            this.ruins = [];
            const selected = candidateTiles.filter((_, index) => index % Math.max(1, Math.floor(candidateTiles.length / 10)) === 0).slice(0, 10);
            if (selected.length) {
                this.ruins = selected.map((pos, index) => ({ x: pos.x, y: pos.y, name: '廃錬成遺址', type: 'ruin', id: index }));
            }
        }

        this.labels = this.territories.map((territory) => ({
            x: Number(territory.labelPos?.x ?? this.width * 0.5),
            y: Number(territory.labelPos?.y ?? this.height * 0.5),
            text: territory.name,
            kind: 'territory',
            id: territory.id
        }));
    }

    generate(seedInput = this.seed) {
        const seedValue = typeof seedInput === 'number' ? seedInput : this.hashString(String(seedInput));
        this.seed = seedValue;

        const heightmap = new HeightmapGenerator(this.width, this.height, seedValue).generate();
        this.grid = this.biomeGenerator.generate(heightmap);

        for (let y = 0; y < this.grid.length; y++) {
            for (let x = 0; x < this.grid[y].length; x++) {
                const tile = this.grid[y][x];
                const nx = x / Math.max(1, this.width - 1);
                const ny = y / Math.max(1, this.height - 1);
                const islandCenterX = 0.80;
                const islandCenterY = 0.52;
                const islandField = Math.exp(-(((nx - islandCenterX) / 0.20) ** 2 + ((ny - islandCenterY) / 0.18) ** 2));
                const isIsland = islandField > 0.12 && tile.height > 0.15;
                const isMainland = tile.isLand && !isIsland && nx < 0.78;
                tile.hasIsland = isIsland;
                tile.hasMainland = isMainland;
                tile.isIsland = isIsland;
                tile.isMainland = isMainland;
                tile.isOcean = tile.type === 'SEA';
                tile.isSea = tile.isOcean;
                tile.isLake = tile.type === 'LAKE';
                tile.isLand = !tile.isOcean && !tile.isLake;
                tile.color = tile.color || {
                    SEA: '#1e4d6b',
                    PLAINS: '#8db87c',
                    FOREST: '#3e6b48',
                    MOUNTAIN: '#a8947d',
                    LAKE: '#3b82f6'
                }[tile.type] || '#8db87c';
            }
        }

        const regionData = this.territoryGenerator.generate(this.grid);
        this.grid = regionData.grid;
        this.territories = regionData.territories;
        this.normalizeGridMetadata();
        this.ensureRegionAndRuinData();

        const ruins = [];
        const occupied = new Set();
        const buildRuinRegion = (seedX, seedY, maxTiles = 220) => {
            const radiusBase = 9 + ((seedX + seedY) % 5);
            const shapeNoise = (x, y) => this.biomeGenerator.fbm(
                (x + seedX * 0.7) * 0.035 + 310,
                (y + seedY * 0.7) * 0.035 + 470,
                this.seed + seedX * 17 + seedY * 31,
                4,
                1.0
            );
            const boundaryRadius = (x, y) => radiusBase
                + shapeNoise(x, y) * 8
                + Math.sin((x + y) * 0.11 + seedX) * 2.4
                + Math.cos((x - y) * 0.08 + seedY) * 1.8;

            const candidates = [];
            const searchRadius = radiusBase + 12;
            for (let y = Math.max(2, seedY - searchRadius); y <= Math.min(this.height - 3, seedY + searchRadius); y++) {
                for (let x = Math.max(2, seedX - searchRadius); x <= Math.min(this.width - 3, seedX + searchRadius); x++) {
                    const tile = this.grid[y]?.[x];
                    if (!tile || !tile.isLand || tile.isSea || tile.isLake || tile.type === 'SEA' || tile.type === 'LAKE') continue;
                    const key = `${x},${y}`;
                    if (occupied.has(key)) continue;
                    const dx = x - seedX;
                    const dy = y - seedY;
                    const dist = Math.hypot(dx, dy);
                    if (dist > boundaryRadius(x, y) + 2.5) continue;
                    candidates.push({ x, y, dist, score: dist - shapeNoise(x, y) * 4 + Math.sin((x * 13 + y * 7 + seedX) * 0.19) * 0.35 });
                }
            }

            candidates.sort((first, second) => first.score - second.score);
            const cells = candidates.slice(0, maxTiles).map(({ x, y }) => ({ x, y }));
            for (const current of cells) {
                const tile = this.grid[current.y]?.[current.x];
                if (!tile) continue;
                tile.type = 'RUIN';
                tile.isRuin = true;
                tile.isLand = true;
                tile.isSea = false;
                tile.isOcean = false;
                tile.isLake = false;
                tile.color = '#6f2c2c';
                occupied.add(`${current.x},${current.y}`);
            }

            if (cells.length < 12) return cells;
            return cells;
        };

        const targetRuins = 3 + (this.hashString(String(this.seed || 'SteampunkIsland_01')) % 13);
        const candidateSeeds = [];
        for (let y = 2; y < this.grid.length - 2; y++) {
            for (let x = 2; x < this.grid[0].length - 2; x++) {
                const tile = this.grid[y][x];
                if (!tile || !tile.isLand || tile.type === 'SEA' || tile.type === 'LAKE' || tile.isLake) continue;
                const noise = this.biomeGenerator.fbm((x + 11) * 0.045 + 80, (y + 19) * 0.045 + 140, this.seed + 320, 5, 1.2);
                const ridgeBias = Math.abs(tile.height - 0.48) * 1.4;
                const mainlandBias = tile.isMainland ? 0.12 : 0.06;
                const score = noise + ridgeBias + mainlandBias + (tile.type === 'MOUNTAIN' ? 0.18 : 0.0);
                candidateSeeds.push({ x, y, score });
            }
        }

        candidateSeeds.sort((a, b) => b.score - a.score);
        const chosenSeeds = [];
        for (const candidate of candidateSeeds) {
            if (chosenSeeds.length >= targetRuins) break;
            if (chosenSeeds.some((seed) => Math.hypot(seed.x - candidate.x, seed.y - candidate.y) < 90)) continue;
            chosenSeeds.push(candidate);
        }

        for (let i = 0; i < chosenSeeds.length; i++) {
            const candidate = chosenSeeds[i];
            const cells = buildRuinRegion(candidate.x, candidate.y, 200);
            if (cells.length >= 18) {
                const center = cells.reduce((acc, cell) => ({ x: acc.x + cell.x, y: acc.y + cell.y }), { x: 0, y: 0 });
                const avgX = cells.length ? center.x / cells.length : candidate.x;
                const avgY = cells.length ? center.y / cells.length : candidate.y;
                ruins.push({
                    x: Math.round(avgX),
                    y: Math.round(avgY),
                    cells,
                    width: Math.max(4, Math.ceil(Math.sqrt(cells.length))),
                    height: Math.max(4, Math.ceil(Math.sqrt(cells.length))),
                    name: '廃錬成遺址',
                    type: 'ruin',
                    id: i
                });
            }
        }

        this.ruins = ruins.slice(0, targetRuins).filter((ruin) => Array.isArray(ruin.cells) ? ruin.cells.length >= 12 : false);
        if (this.ruins.length === 0 && this.grid.length > 0) {
            for (let i = 0; i < 10; i++) {
                const x = Math.max(3, Math.min(this.width - 4, Math.floor(this.width * 0.64) + ((i % 3) - 1) * 18));
                const y = Math.max(3, Math.min(this.height - 4, Math.floor(this.height * 0.52) + Math.floor(i / 3) * 14));
                const tile = this.grid[y]?.[x];
                if (tile && tile.isLand && tile.type !== 'SEA' && tile.type !== 'LAKE') {
                    const cells = buildRuinRegion(x, y, 90);
                    if (cells.length >= 12) {
                        this.ruins.push({ x, y, cells, name: '廃錬成遺址', type: 'ruin', id: i });
                    }
                }
            }
        }

        this.playerPos = this.findIslandSpawn(this.grid);
        if (this.ruins.length > 0) {
            const nearPlayer = this.ruins.some((ruin) => Math.hypot(ruin.x - this.playerPos.x, ruin.y - this.playerPos.y) < 15);
            if (!nearPlayer) {
                const px = Math.max(2, Math.min(this.width - 3, this.playerPos.x + 6));
                const py = Math.max(2, Math.min(this.height - 3, this.playerPos.y + 9));
                const tile = this.grid[py]?.[px];
                if (tile && tile.isLand && tile.type !== 'SEA' && tile.type !== 'LAKE') {
                    const fallbackCells = buildRuinRegion(px, py, 80);
                    if (fallbackCells.length >= 12) {
                        const center = fallbackCells.reduce((acc, cell) => ({ x: acc.x + cell.x, y: acc.y + cell.y }), { x: 0, y: 0 });
                        this.ruins = [{ x: Math.round(center.x / fallbackCells.length), y: Math.round(center.y / fallbackCells.length), cells: fallbackCells, name: '廃錬成遺址', type: 'ruin', id: 'player' }, ...this.ruins].slice(0, 10);
                    }
                }
            }
        }
        this.ruins = this.ruins.filter((ruin) => {
            if (!ruin || typeof ruin !== 'object') return false;
            if (!Array.isArray(ruin.cells)) return false;
            return ruin.cells.length >= 12;
        }).slice(0, 10);
        if (this.ruins.length === 0 && this.grid.length > 0) {
            for (let i = 0; i < 10; i++) {
                const x = Math.max(3, Math.min(this.width - 4, Math.floor(this.width * 0.64) + ((i % 3) - 1) * 18));
                const y = Math.max(3, Math.min(this.height - 4, Math.floor(this.height * 0.52) + Math.floor(i / 3) * 14));
                const tile = this.grid[y]?.[x];
                if (!tile || !tile.isLand || tile.type === 'SEA' || tile.type === 'LAKE') continue;
                const cells = buildRuinRegion(x, y, 90);
                if (cells.length >= 12) {
                    this.ruins.push({ x, y, cells, name: '廃錬成遺址', type: 'ruin', id: i });
                    break;
                }
            }
        }
        this.labels = this.territories
            .filter((territory) => territory && territory.name && territory.labelPos && territory.labelPos.x != null && territory.labelPos.y != null)
            .map((territory) => ({
                x: territory.labelPos.x,
                y: territory.labelPos.y,
                text: territory.name,
                kind: 'territory'
            }))
            .filter((label) => {
                const tile = this.grid[Math.floor(label.y)]?.[Math.floor(label.x)];
                return Boolean(tile && tile.isLand && !tile.isSea && !tile.isLake && tile.isMainland);
            });

        if (this.labels.length === 0) {
            this.labels = [{ x: this.width * 0.30, y: this.height * 0.18, text: '北部山岳地帯', kind: 'territory' }];
        }

        if (this.renderer) {
            this.renderer.setMapData(this.grid, this.territories, this.ruins);
            this.renderer.setPlayerPosition(this.playerPos.x, this.playerPos.y);
            this.renderer.render();
        }

        return {
            grid: this.grid,
            worldMap: this.grid,
            territories: this.territories,
            ruins: this.ruins,
            labels: this.labels,
            playerPos: this.playerPos,
            width: this.width,
            height: this.height,
            rivers: [],
            routes: [],
            spawn: this.playerPos,
            landingSites: [{ x: this.playerPos.x, y: this.playerPos.y, kind: 'outer-island' }]
        };
    }

    updatePlayerPosition(x, y) {
        this.playerPos = { x, y };
        if (this.renderer) {
            this.renderer.setPlayerPosition(x, y);
            this.renderer.render();
        }
    }
}

export default MapManager;
