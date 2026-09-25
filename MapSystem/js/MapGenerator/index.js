import { HeightmapGenerator } from './HeightmapGenerator.js';
import { BiomeGenerator } from './BiomeGenerator.js';
import { TerritoryGenerator } from './TerritoryGenerator.js';
import { MapRenderer, BIOME_COLORS } from './MapRenderer.js';

export { BIOME_COLORS };
export { HeightmapGenerator, BiomeGenerator, TerritoryGenerator, MapRenderer };

export class MapManager {
    constructor(widthOrOptions, height = 1000, seed = 'SteampunkIsland_01') {
        if (typeof widthOrOptions === 'object' && widthOrOptions !== null) {
            this.width = Number(widthOrOptions.width) || 2000;
            this.height = Number(widthOrOptions.height) || 1000;
            this.seed = widthOrOptions.seed || seed;
            this.coastalOnly = Boolean(widthOrOptions.coastalOnly);
            this.canvas = widthOrOptions.canvas || null;
            this.legendSelector = widthOrOptions.legendSelector || null;
        } else {
            this.width = Number(widthOrOptions) || 2000;
            this.height = Number(height) || 1000;
            this.seed = seed;
            this.coastalOnly = false;
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

    applyIslandLayout(grid) {
        const rows = grid.length;
        const cols = grid[0]?.length || 0;
        if (!rows || !cols) return;

        const islandCenter = this.coastalOnly
            ? { x: cols * 0.75, y: rows * 0.5 }
            : { x: cols * 0.86, y: rows * 0.56 };
        const islandRadius = this.coastalOnly
            ? { x: 150, y: 160 }
            : { x: cols * 0.075, y: rows * 0.16 };
        const colorByType = {
            SEA: '#1e4d6b',
            LAKE: '#3b82f6',
            PLAINS: '#8db87c',
            FOREST: '#3e6b48',
            MOUNTAIN: '#746b60',
            SAND: '#d5bd8a'
        };

        const mainlandTypeCounts = new Map();
        const mainlandTypeColors = new Map();
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const tile = grid[y][x];
                if (!tile?.isLand || tile.isIsland) continue;
                const type = tile.type || 'PLAINS';
                mainlandTypeCounts.set(type, (mainlandTypeCounts.get(type) || 0) + 1);
                if (!mainlandTypeColors.has(type) && tile.color) mainlandTypeColors.set(type, tile.color);
            }
        }

        const mainlandTypes = [...mainlandTypeCounts.entries()]
            .filter(([type, count]) => type !== 'SEA' && type !== 'LAKE' && count > 0)
            .map(([type, count]) => ({ type, count }));
        if (mainlandTypes.length === 0) mainlandTypes.push({ type: 'PLAINS', count: 1 });
        const mainlandTypeWeights = mainlandTypes.map((entry) => ({
            type: entry.type,
            weight: entry.count / mainlandTypes.reduce((sum, current) => sum + current.count, 0)
        }));
        let cumulativeWeight = 0;
        mainlandTypeWeights.forEach((entry) => {
            cumulativeWeight += entry.weight;
            entry.limit = cumulativeWeight;
        });
        const islandTypeCells = new Map();
        const getIslandTerrainSignal = (x, y) => {
            const broadNoise = this.biomeGenerator.fbm(x * 0.010 + 480, y * 0.010 + 810, this.seed + 1511, 5, 0.72);
            const detailNoise = this.biomeGenerator.fbm(x * 0.032 + 920, y * 0.032 + 240, this.seed + 1513, 3, 0.8);
            return 0.5 + (broadNoise + detailNoise * 0.22) * 3.8;
        };
        const chooseIslandType = (x, y) => {
            const terrainSignal = Math.min(0.999, Math.max(0, getIslandTerrainSignal(x, y)));
            return mainlandTypeWeights.find((entry) => terrainSignal <= entry.limit)?.type || mainlandTypeWeights[mainlandTypeWeights.length - 1].type;
        };

        const isIslandCell = (x, y) => {
            const warpX = this.biomeGenerator.fbm(x * 0.022 + 480, y * 0.022 + 810, this.seed + 711, 5, 0.72);
            const warpY = this.biomeGenerator.fbm(x * 0.022 + 920, y * 0.022 + 240, this.seed + 947, 5, 0.72);
            const warpedX = (x - islandCenter.x) / islandRadius.x - warpX * 0.42;
            const warpedY = (y - islandCenter.y) / islandRadius.y - warpY * 0.42;
            const edgeNoise = this.biomeGenerator.fbm(x * 0.038 + 130, y * 0.038 + 370, this.seed + 1201, 6, 0.78);
            const coastDetail = this.biomeGenerator.fbm(x * 0.085 + 610, y * 0.085 + 190, this.seed + 1337, 4, 1.0);
            const radialDistance = Math.hypot(warpedX, warpedY);
            return radialDistance < 1.0 + edgeNoise * 0.46 + coastDetail * 0.16;
        };
        const isIslandWaterBufferCell = (x, y) => {
            const warpX = this.biomeGenerator.fbm(x * 0.022 + 480, y * 0.022 + 810, this.seed + 711, 5, 0.72);
            const warpY = this.biomeGenerator.fbm(x * 0.022 + 920, y * 0.022 + 240, this.seed + 947, 5, 0.72);
            const warpedX = (x - islandCenter.x) / islandRadius.x - warpX * 0.42;
            const warpedY = (y - islandCenter.y) / islandRadius.y - warpY * 0.42;
            const edgeNoise = this.biomeGenerator.fbm(x * 0.038 + 130, y * 0.038 + 370, this.seed + 1201, 6, 0.78);
            const coastDetail = this.biomeGenerator.fbm(x * 0.085 + 610, y * 0.085 + 190, this.seed + 1337, 4, 1.0);
            return Math.hypot(warpedX, warpedY) < 1.0 + edgeNoise * 0.46 + coastDetail * 0.16 + 0.12;
        };
        const mainlandEdgeX = (y) => {
            const broadCoastNoise = this.biomeGenerator.fbm(y * 0.018 + 240, 4.2, this.seed + 1711, 4, 0.8);
            const detailCoastNoise = this.biomeGenerator.fbm(y * 0.052 + 510, 8.6, this.seed + 1713, 3, 0.75);
            const coastlineWave = Math.sin(y * 0.009 + this.seed * 0.0007) * 0.025
                + Math.sin(y * 0.021 - this.seed * 0.0003) * 0.018;
            return cols * (0.55 + broadCoastNoise * 0.065 + detailCoastNoise * 0.024 + coastlineWave);
        };

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const tile = grid[y][x];
                if (!tile) continue;
                const island = isIslandCell(x, y);

                if (island) {
                    const islandType = chooseIslandType(x, y);
                    if (!islandTypeCells.has(islandType)) islandTypeCells.set(islandType, []);
                    islandTypeCells.get(islandType).push({ x, y });
                    tile.type = islandType;
                    tile.isLand = true;
                    tile.isSea = false;
                    tile.isOcean = false;
                    tile.isLake = false;
                    tile.isIsland = true;
                    tile.isMainland = false;
                    tile.hasIsland = true;
                    tile.hasMainland = false;
                    tile.color = mainlandTypeColors.get(islandType) || colorByType[islandType] || tile.color || '#8db87c';
                    continue;
                }

                const mustBeSea = isIslandWaterBufferCell(x, y) || x > mainlandEdgeX(y);
                if (mustBeSea) {
                    tile.type = 'SEA';
                    tile.isLand = false;
                    tile.isSea = true;
                    tile.isOcean = true;
                    tile.isLake = false;
                    tile.isIsland = false;
                    tile.isMainland = false;
                    tile.hasIsland = false;
                    tile.hasMainland = false;
                    tile.color = colorByType.SEA;
                    continue;
                }

                tile.isIsland = false;
                tile.hasIsland = false;
                tile.isMainland = tile.isLand;
                tile.hasMainland = tile.isLand;
            }
        }

        if (this.coastalOnly) {
            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    const tile = grid[y][x];
                    if (!tile || tile.isIsland) continue;
                    tile.type = 'SEA';
                    tile.isLand = false;
                    tile.isSea = true;
                    tile.isOcean = true;
                    tile.isLake = false;
                    tile.isMainland = false;
                    tile.hasMainland = false;
                    tile.color = colorByType.SEA;
                }
            }
        }

        const lakeCount = 2 + (this.hashString(`island-lakes:${this.seed}`) % 3);
        const lakeSpecs = Array.from({ length: lakeCount }, (_, index) => {
            const phase = this.biomeGenerator.fbm(this.seed * 0.0007 + 6.2, 4.1, this.seed + 1401, 4, 0.75) * 0.35;
            const angle = phase + (index / lakeCount) * Math.PI * 2;
            const distance = 0.30 + Math.abs(this.biomeGenerator.fbm(index * 1.7 + 3.1, 6.2, this.seed + 1403 + index * 19, 4, 0.75)) * 0.16;
            const offsetX = Math.cos(angle) * islandRadius.x * distance;
            const offsetY = Math.sin(angle) * islandRadius.y * distance;
            return {
                centerX: islandCenter.x + offsetX,
                centerY: islandCenter.y + offsetY,
                radiusX: 8 + Math.abs(this.biomeGenerator.fbm(index * 1.3 + 2.2, 7.1, this.seed + 1411 + index * 23, 3, 0.8)) * 13,
                radiusY: 7 + Math.abs(this.biomeGenerator.fbm(9.8, index * 1.5 + 5.4, this.seed + 1413 + index * 29, 3, 0.8)) * 11
            };
        });
        for (const lake of lakeSpecs) {
            const minX = Math.max(1, Math.floor(lake.centerX - lake.radiusX * 1.8));
            const maxX = Math.min(cols - 2, Math.ceil(lake.centerX + lake.radiusX * 1.8));
            const minY = Math.max(1, Math.floor(lake.centerY - lake.radiusY * 1.8));
            const maxY = Math.min(rows - 2, Math.ceil(lake.centerY + lake.radiusY * 1.8));
            for (let y = minY; y <= maxY; y++) {
                for (let x = minX; x <= maxX; x++) {
                    const tile = grid[y][x];
                    if (!tile?.isIsland) continue;
                    const warpX = this.biomeGenerator.fbm(x * 0.055 + 170, y * 0.055 + 520, this.seed + 1405, 4, 0.8);
                    const warpY = this.biomeGenerator.fbm(x * 0.055 + 710, y * 0.055 + 150, this.seed + 1407, 4, 0.8);
                    const dx = (x - lake.centerX) / lake.radiusX - warpX * 0.28;
                    const dy = (y - lake.centerY) / lake.radiusY - warpY * 0.28;
                    const basinNoise = this.biomeGenerator.fbm(x * 0.075 + 390, y * 0.075 + 260, this.seed + 1409, 4, 0.8);
                    const angle = Math.atan2(dy, dx);
                    const shoreVariation = Math.sin(angle * 3 + this.seed * 0.001 + lake.centerX) * 0.16
                        + Math.cos(angle * 5 - this.seed * 0.0007 + lake.centerY) * 0.10
                        + basinNoise * 0.32;
                    if (Math.hypot(dx, dy) < 1.0 + shoreVariation) {
                        tile.type = 'LAKE';
                        tile.isLake = true;
                        tile.isLand = false;
                        tile.isSea = false;
                        tile.isOcean = false;
                        tile.isIsland = true;
                        tile.isMainland = false;
                        tile.color = colorByType.LAKE;
                    }
                }
            }
        }

        const islandLandCells = [];
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const tile = grid[y][x];
                if (!tile?.isIsland || !tile.isLand || tile.type === 'LAKE') continue;
                islandLandCells.push({ x, y, signal: getIslandTerrainSignal(x, y) });
            }
        }

        const totalMainlandTerrain = mainlandTypes.reduce((sum, entry) => sum + entry.count, 0);
        const islandTypeQuotas = mainlandTypes.map((entry) => {
            const exactQuota = islandLandCells.length * entry.count / totalMainlandTerrain;
            return { type: entry.type, quota: Math.floor(exactQuota), remainder: exactQuota % 1 };
        });
        if (islandLandCells.length >= islandTypeQuotas.length) {
            for (const entry of islandTypeQuotas) {
                if (entry.quota === 0) entry.quota = 1;
            }
        }
        let assignedCells = islandTypeQuotas.reduce((sum, entry) => sum + entry.quota, 0);
        islandTypeQuotas.sort((first, second) => second.remainder - first.remainder);
        for (let index = 0; assignedCells < islandLandCells.length; index++, assignedCells++) {
            islandTypeQuotas[index % islandTypeQuotas.length].quota++;
        }
        islandTypeQuotas.sort((first, second) => mainlandTypes.findIndex((entry) => entry.type === first.type) - mainlandTypes.findIndex((entry) => entry.type === second.type));
        islandLandCells.sort((first, second) => first.signal - second.signal);
        let islandCellIndex = 0;
        for (const entry of islandTypeQuotas) {
            for (let count = 0; count < entry.quota && islandCellIndex < islandLandCells.length; count++, islandCellIndex++) {
                const cell = islandLandCells[islandCellIndex];
                const tile = grid[cell.y][cell.x];
                tile.type = entry.type;
                tile.color = mainlandTypeColors.get(entry.type) || colorByType[entry.type] || tile.color || '#8db87c';
            }
        }
    }

    protectCentralTradeCity(grid) {
        const rows = grid.length;
        const cols = grid[0]?.length || 0;
        const centerX = cols * 0.34;
        const centerY = rows * 0.52;
        let seedX = Math.floor(centerX);
        let seedY = Math.floor(centerY);
        const isMainlandLand = (x, y) => {
            const tile = grid[y]?.[x];
            return Boolean(tile && !tile.isIsland && !tile.isLake && tile.isLand && tile.isMainland);
        };
        const makeMainlandPlains = (x, y) => {
            const tile = grid[y]?.[x];
            if (!tile || tile.isIsland) return;
            tile.type = 'PLAINS';
            tile.isLand = true;
            tile.isSea = false;
            tile.isOcean = false;
            tile.isLake = false;
            tile.isIsland = false;
            tile.isMainland = true;
            tile.hasIsland = false;
            tile.hasMainland = true;
            tile.color = '#8db87c';
        };
        let nearestDistance = Infinity;
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                if (!isMainlandLand(x, y)) continue;
                const distance = (x - seedX) ** 2 + (y - seedY) ** 2;
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    seedX = x;
                    seedY = y;
                }
            }
        }
        const distanceToCenter = (x, y) => Math.hypot(x - seedX, y - seedY);
        const cityRadius = Math.max(12, Math.round(Math.min(rows, cols) * 0.035));
        const cityRadiusX = cityRadius * 1.7;
        const cityRadiusY = cityRadius * 1.25;
        for (let y = Math.max(1, seedY - Math.ceil(cityRadiusY * 1.5)); y <= Math.min(rows - 2, seedY + Math.ceil(cityRadiusY * 1.5)); y++) {
            for (let x = Math.max(1, seedX - Math.ceil(cityRadiusX * 1.2)); x <= Math.min(cols - 2, seedX + Math.ceil(cityRadiusX * 1.2)); x++) {
                const warpX = this.biomeGenerator.fbm(x * 0.010 + 90, y * 0.010 + 140, this.seed + 1607, 4, 0.75) * 18;
                const warpY = this.biomeGenerator.fbm(x * 0.010 + 190, y * 0.010 + 240, this.seed + 1611, 4, 0.75) * 14;
                const normalizedX = (x + warpX - seedX) / cityRadiusX;
                const normalizedY = (y + warpY - seedY) / cityRadiusY;
                const lowFrequencyWarp = this.biomeGenerator.fbm(x * 0.010 + 290, y * 0.010 + 340, this.seed + 1607, 4, 0.75) * 1.35;
                const lobe = Math.sin(y * 0.045 + this.seed * 0.00001) * 0.32 + Math.cos(x * 0.037 + this.seed * 0.00002) * 0.28;
                if (normalizedX ** 2 + normalizedY ** 2 <= 1 + lowFrequencyWarp + lobe) makeMainlandPlains(x, y);
            }
        }
        const cityBeltHalfWidth = Math.max(20, Math.round(Math.min(rows, cols) * 0.046));

        const queue = [[seedX, seedY]];
        const previous = new Map([[`${seedX},${seedY}`, null]]);
        let connection = null;
        while (queue.length && !connection) {
            const [x, y] = queue.shift();
            if (distanceToCenter(x, y) > cityBeltHalfWidth + 12 && isMainlandLand(x, y)) {
                connection = [x, y];
                break;
            }
            const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]
                .filter(([nextX, nextY]) => nextX > 0 && nextY > 0 && nextX < cols - 1 && nextY < rows - 1)
                .sort(([firstX, firstY], [secondX, secondY]) => {
                    const firstTile = grid[firstY][firstX];
                    const secondTile = grid[secondY][secondX];
                    return Number(isMainlandLand(secondX, secondY)) - Number(isMainlandLand(firstX, firstY))
                        || distanceToCenter(firstX, firstY) - distanceToCenter(secondX, secondY)
                        || Number(firstTile?.isSea || firstTile?.isLake) - Number(secondTile?.isSea || secondTile?.isLake);
                });
            for (const [nextX, nextY] of neighbors) {
                const key = `${nextX},${nextY}`;
                if (!previous.has(key)) {
                    previous.set(key, [x, y]);
                    queue.push([nextX, nextY]);
                }
            }
        }
        const connectionPath = [];
        while (connection) {
            connectionPath.push(connection);
            const parent = previous.get(`${connection[0]},${connection[1]}`);
            connection = parent;
        }
        for (const [pathX, pathY] of connectionPath) {
            const corridorWarp = this.biomeGenerator.fbm(
                pathX * 0.010 + 620,
                pathY * 0.010 + 780,
                this.seed + 1621,
                4,
                0.72
            );
            const corridorHalfWidth = 5 + corridorWarp * 3;
            for (let offsetY = -6; offsetY <= 6; offsetY++) {
                for (let offsetX = -6; offsetX <= 6; offsetX++) {
                    if (offsetX ** 2 + offsetY ** 2 > corridorHalfWidth ** 2) continue;
                    makeMainlandPlains(pathX + offsetX, pathY + offsetY);
                }
            }
        }

        const frontier = [];
        const visited = new Set();
        const addCandidate = (x, y) => {
            if (x < 2 || y < 2 || x >= cols - 2 || y >= rows - 2) return;
            const key = `${x},${y}`;
            if (visited.has(key)) return;
            visited.add(key);
            const tile = grid[y][x];
            if (!tile || tile.isIsland || tile.type === 'LAKE') return;
            const broad = this.biomeGenerator.fbm(x * 0.018 + 70, y * 0.018 + 410, this.seed + 1601, 5, 0.72);
            const detail = this.biomeGenerator.fbm(x * 0.055 + 530, y * 0.055 + 120, this.seed + 1603, 4, 0.82);
            const distance = Math.hypot(x - seedX, y - seedY);
            frontier.push({ x, y, score: broad * 0.75 + detail * 0.25 - distance * 0.0012 });
        };

        addCandidate(seedX, seedY);
        for (let step = 0; step < 24 && frontier.length; step++) {
            frontier.sort((first, second) => second.score - first.score);
            const batch = frontier.splice(0, Math.min(frontier.length, 18 + step));
            for (const cell of batch) {
                const tile = grid[cell.y][cell.x];
                if (!tile || tile.isIsland || tile.type === 'LAKE') continue;
                if (step < 3 || cell.score > -0.18) {
                    if (tile.type !== 'FOREST' && tile.type !== 'MOUNTAIN' && tile.type !== 'SAND') tile.type = 'PLAINS';
                    tile.isLand = true;
                    tile.isSea = false;
                    tile.isOcean = false;
                    tile.isLake = false;
                    tile.isIsland = false;
                    tile.isMainland = true;
                    tile.hasIsland = false;
                    tile.hasMainland = true;
                    tile.color = tile.type === 'FOREST' ? '#3e6b48' : tile.type === 'MOUNTAIN' ? '#746b60' : tile.type === 'SAND' ? '#d5bd8a' : '#8db87c';
                    for (const [offsetX, offsetY] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        addCandidate(cell.x + offsetX, cell.y + offsetY);
                    }
                }
            }
        }

        makeMainlandPlains(seedX, seedY);
    }

    normalizeInlandWater(grid) {
        const rows = grid.length;
        const cols = grid[0]?.length || 0;
        const visited = new Set();
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const start = grid[y][x];
                const startKey = `${x},${y}`;
                if (visited.has(startKey) || !start || !start.isSea) continue;
                const queue = [[x, y]];
                const group = [];
                let touchesEdge = false;
                visited.add(startKey);
                while (queue.length) {
                    const [currentX, currentY] = queue.pop();
                    group.push([currentX, currentY]);
                    if (currentX === 0 || currentY === 0 || currentX === cols - 1 || currentY === rows - 1) touchesEdge = true;
                    for (const [offsetX, offsetY] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        const nextX = currentX + offsetX;
                        const nextY = currentY + offsetY;
                        const nextKey = `${nextX},${nextY}`;
                        if (visited.has(nextKey) || !grid[nextY]?.[nextX]?.isSea) continue;
                        visited.add(nextKey);
                        queue.push([nextX, nextY]);
                    }
                }
                if (!touchesEdge) {
                    for (const [waterX, waterY] of group) {
                        const tile = grid[waterY][waterX];
                        tile.type = 'LAKE';
                        tile.isLake = true;
                        tile.isSea = false;
                        tile.isOcean = false;
                        tile.isLand = false;
                        tile.color = '#3b82f6';
                    }
                }
            }
        }
    }

    removeCoastalLakes(grid) {
        const rows = grid.length;
        const cols = grid[0]?.length || 0;
        const visited = new Set();
        const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const start = grid[y][x];
                const startKey = `${x},${y}`;
                if (visited.has(startKey) || !start?.isLake) continue;
                const component = [];
                const queue = [[x, y]];
                let touchesSea = false;
                visited.add(startKey);
                while (queue.length) {
                    const [currentX, currentY] = queue.pop();
                    component.push([currentX, currentY]);
                    for (const [offsetX, offsetY] of neighbors) {
                        const nextX = currentX + offsetX;
                        const nextY = currentY + offsetY;
                        const nextTile = grid[nextY]?.[nextX];
                        if (nextTile?.isSea) touchesSea = true;
                        if (!nextTile?.isLake) continue;
                        const nextKey = `${nextX},${nextY}`;
                        if (!visited.has(nextKey)) {
                            visited.add(nextKey);
                            queue.push([nextX, nextY]);
                        }
                    }
                }
                if (!touchesSea) continue;
                for (const [lakeX, lakeY] of component) {
                    const tile = grid[lakeY][lakeX];
                    tile.type = 'SEA';
                    tile.isLake = false;
                    tile.isSea = true;
                    tile.isOcean = true;
                    tile.isLand = false;
                    tile.isIsland = false;
                    tile.isMainland = false;
                    tile.hasIsland = false;
                    tile.hasMainland = false;
                    tile.color = '#1e4d6b';
                }
            }
        }
    }

    retainLargestMainland(grid) {
        const rows = grid.length;
        const cols = grid[0]?.length || 0;
        const visited = new Set();
        const components = [];
        const isMainlandLand = (x, y) => {
            const tile = grid[y]?.[x];
            return Boolean(tile?.isLand && tile.isMainland && !tile.isIsland && !tile.isLake && !tile.isSea);
        };

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const startKey = `${x},${y}`;
                if (visited.has(startKey) || !isMainlandLand(x, y)) continue;
                const component = [];
                const queue = [[x, y]];
                visited.add(startKey);
                while (queue.length) {
                    const [currentX, currentY] = queue.pop();
                    component.push([currentX, currentY]);
                    for (const [offsetX, offsetY] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        const nextX = currentX + offsetX;
                        const nextY = currentY + offsetY;
                        const nextKey = `${nextX},${nextY}`;
                        if (visited.has(nextKey) || !isMainlandLand(nextX, nextY)) continue;
                        visited.add(nextKey);
                        queue.push([nextX, nextY]);
                    }
                }
                components.push(component);
            }
        }

        const largest = components.reduce((best, component) => component.length > best.length ? component : best, []);
        const largestSet = new Set(largest.map(([x, y]) => `${x},${y}`));
        for (const component of components) {
            for (const [x, y] of component) {
                if (largestSet.has(`${x},${y}`)) continue;
                const tile = grid[y][x];
                tile.type = 'SEA';
                tile.isLand = false;
                tile.isSea = true;
                tile.isOcean = true;
                tile.isLake = false;
                tile.isIsland = false;
                tile.isMainland = false;
                tile.hasIsland = false;
                tile.hasMainland = false;
                tile.color = '#1e4d6b';
            }
        }
    }

    findIslandSpawn(grid) {
        const candidates = [];
        const cols = grid[0].length;
        const rows = grid.length;
        const visited = new Set();
        const islandComponents = [];
        const isIslandLand = (x, y) => {
            const tile = grid[y]?.[x];
            return Boolean(tile?.isIsland && tile.isLand && !tile.isSea && !tile.isLake);
        };

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const startKey = `${x},${y}`;
                if (visited.has(startKey) || !isIslandLand(x, y)) continue;
                const component = [];
                const queue = [[x, y]];
                visited.add(startKey);
                while (queue.length) {
                    const [currentX, currentY] = queue.pop();
                    component.push({ x: currentX, y: currentY });
                    for (const [offsetX, offsetY] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        const nextX = currentX + offsetX;
                        const nextY = currentY + offsetY;
                        const nextKey = `${nextX},${nextY}`;
                        if (visited.has(nextKey) || !isIslandLand(nextX, nextY)) continue;
                        visited.add(nextKey);
                        queue.push([nextX, nextY]);
                    }
                }
                islandComponents.push(component);
            }
        }

        const largestIsland = islandComponents.reduce(
            (largest, component) => component.length > largest.length ? component : largest,
            []
        );
        const largestIslandSet = new Set(largestIsland.map(({ x, y }) => `${x},${y}`));

        for (let y = 1; y < rows - 1; y++) {
            for (let x = 1; x < cols - 1; x++) {
                const tile = grid[y][x];
                if (!tile || !largestIslandSet.has(`${x},${y}`)) continue;
                if (tile.type === 'PLAINS' || tile.type === 'FOREST' || tile.type === 'SAND') {
                    candidates.push({ x, y });
                }
            }
        }

        if (candidates.length === 0) {
            for (let y = 1; y < rows - 1; y++) {
                for (let x = 1; x < cols - 1; x++) {
                    const tile = grid[y][x];
                    if (!tile || !largestIslandSet.has(`${x},${y}`)) continue;
                    if (tile.type === 'PLAINS' || tile.type === 'FOREST' || tile.type === 'SAND') {
                        candidates.push({ x, y });
                    }
                }
            }
        }

        const islandMinX = Math.min(...largestIsland.map(({ x }) => x));
        const islandMaxX = Math.max(...largestIsland.map(({ x }) => x));
        const islandMinY = Math.min(...largestIsland.map(({ y }) => y));
        const islandMaxY = Math.max(...largestIsland.map(({ y }) => y));
        const mainlandFacingCoastX = islandMinX + Math.max(6, Math.round((islandMaxX - islandMinX) * 0.12));
        const mainlandFacingCoastY = (islandMinY + islandMaxY) * 0.5;
        const target = candidates.reduce((best, candidate) => {
            if (!best) return candidate;
            const candidateDistance = Math.hypot(candidate.x - mainlandFacingCoastX, candidate.y - mainlandFacingCoastY);
            const bestDistance = Math.hypot(best.x - mainlandFacingCoastX, best.y - mainlandFacingCoastY);
            return candidateDistance < bestDistance ? candidate : best;
        }, null) || { x: Math.floor(mainlandFacingCoastX), y: Math.floor(mainlandFacingCoastY) };
        return { x: target.x, y: target.y };
    }

    normalizeGridMetadata() {
        const palette = {
            SEA: '#1e4d6b',
            PLAINS: '#8db87c',
            FOREST: '#3e6b48',
            MOUNTAIN: '#746b60',
            SAND: '#d5bd8a',
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
            { id: 0, name: '北部山岳地帯', x: this.width * 0.28, y: this.height * 0.20 },
            { id: 1, name: '西部穀倉地帯', x: this.width * 0.14, y: this.height * 0.56 },
            { id: 2, name: '中央交易都市', x: this.width * 0.34, y: this.height * 0.52 },
            { id: 3, name: '東部工業圏', x: this.width * 0.52, y: this.height * 0.52 },
            { id: 4, name: '南部香辛料地', x: this.width * 0.34, y: this.height * 0.80 }
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
        this.applyIslandLayout(this.grid);
        if (!this.coastalOnly) {
            this.retainLargestMainland(this.grid);
            this.protectCentralTradeCity(this.grid);
            this.normalizeInlandWater(this.grid);
            this.removeCoastalLakes(this.grid);
        }

        for (let y = 0; y < this.grid.length; y++) {
            for (let x = 0; x < this.grid[y].length; x++) {
                const tile = this.grid[y][x];
                const isIsland = Boolean(tile.isIsland);
                const isMainland = Boolean(tile.isMainland);
                tile.hasIsland = isIsland;
                tile.hasMainland = isMainland;
                tile.isOcean = tile.type === 'SEA';
                tile.isSea = tile.isOcean;
                tile.isLake = tile.type === 'LAKE';
                tile.isLand = !tile.isOcean && !tile.isLake;
                tile.color = tile.color || {
                    SEA: '#1e4d6b',
                    PLAINS: '#8db87c',
                    FOREST: '#3e6b48',
                    MOUNTAIN: '#746b60',
                    SAND: '#d5bd8a',
                    LAKE: '#3b82f6'
                }[tile.type] || '#8db87c';
            }
        }

        const regionData = this.coastalOnly
            ? { grid: this.grid, territories: [] }
            : this.territoryGenerator.generate(this.grid);
        this.grid = regionData.grid;
        this.territories = regionData.territories;
        this.normalizeGridMetadata();
        this.ensureRegionAndRuinData();

        const ruins = [];
        const occupied = new Set();
        const buildRuinRegion = (seedX, seedY, maxTiles = 220) => {
            const radiusBase = 9 + ((seedX + seedY) % 5);
            const shapeNoise = (x, y) => this.biomeGenerator.fbm(
                (x + seedX * 0.7) * 0.012 + 310,
                (y + seedY * 0.7) * 0.012 + 470,
                this.seed + seedX * 17 + seedY * 31,
                4,
                0.72
            );
            const warpX = (x, y) => this.biomeGenerator.fbm(
                x * 0.010 + 610,
                y * 0.010 + 870,
                this.seed + seedX * 19 + seedY * 23,
                4,
                0.72
            ) * 9;
            const warpY = (x, y) => this.biomeGenerator.fbm(
                x * 0.010 + 930,
                y * 0.010 + 520,
                this.seed + seedX * 29 + seedY * 11,
                4,
                0.72
            ) * 9;
            const boundaryRadius = (x, y) => radiusBase
                + shapeNoise(x, y) * 8
                + Math.sin(Math.atan2(y - seedY, x - seedX) * 2.0 + seedX * 0.07) * 5.5
                + Math.cos(Math.atan2(y - seedY, x - seedX) * 3.0 + seedY * 0.05) * 3.5;

            const candidates = [];
            const searchRadius = radiusBase + 12;
            for (let y = Math.max(2, seedY - searchRadius); y <= Math.min(this.height - 3, seedY + searchRadius); y++) {
                for (let x = Math.max(2, seedX - searchRadius); x <= Math.min(this.width - 3, seedX + searchRadius); x++) {
                    const tile = this.grid[y]?.[x];
                    if (!tile || !tile.isLand || tile.isSea || tile.isLake || tile.type === 'SEA' || tile.type === 'LAKE') continue;
                    const key = `${x},${y}`;
                    if (occupied.has(key)) continue;
                    const dx = x + warpX(x, y) - seedX;
                    const dy = y + warpY(x, y) - seedY;
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
        for (let y = 2; y < this.grid.length - 2; y += 4) {
            for (let x = 2; x < this.grid[0].length - 2; x += 4) {
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
            this.labels = [{ x: this.width * 0.34, y: this.height * 0.20, text: '北部山岳地帯', kind: 'territory' }];
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
