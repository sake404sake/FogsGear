export class TerritoryGenerator {
    constructor(seed = 'SteampunkIsland_01') {
        this.seed = typeof seed === 'number' ? seed : this.hashString(String(seed));
    }

    hashString(value) {
        let hash = 2166136261;
        for (let i = 0; i < value.length; i++) {
            hash ^= value.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    hash2D(x, y, seed) {
        let h = Math.imul(x | 0, 374761393);
        h = Math.imul(h + (y | 0), 668265263);
        h = Math.imul(h ^ (h >>> 13) ^ seed, 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }

    valueNoise(x, y, scale, seed) {
        const sampleX = x * scale;
        const sampleY = y * scale;
        const x0 = Math.floor(sampleX);
        const y0 = Math.floor(sampleY);
        const tx = sampleX - x0;
        const ty = sampleY - y0;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);

        const tl = this.hash2D(x0, y0, seed);
        const tr = this.hash2D(x0 + 1, y0, seed);
        const bl = this.hash2D(x0, y0 + 1, seed);
        const br = this.hash2D(x0 + 1, y0 + 1, seed);

        const top = tl + (tr - tl) * sx;
        const bottom = bl + (br - bl) * sx;
        return top + (bottom - top) * sy - 0.5;
    }

    fbm(x, y, seed, octaves = 5, frequencyBase = 1) {
        let result = 0;
        let amp = 0.55;
        let freq = frequencyBase;
        let ampTotal = 0;
        for (let i = 0; i < octaves; i++) {
            result += this.valueNoise(x, y, freq, seed + i * 1013) * amp;
            ampTotal += amp;
            freq *= 2;
            amp *= 0.52;
        }

        return result / Math.max(1e-6, ampTotal);
    }

    removeSmallEnclaves(grid, regions = [], minimumSize = 80) {
        const rows = grid.length;
        const cols = grid[0]?.length || 0;
        const visited = new Set();
        const isTerritoryLand = (x, y) => {
            const tile = grid[y]?.[x];
            return Boolean(tile?.isLand && tile.isMainland && !tile.isSea && !tile.isLake && tile.territoryId >= 0);
        };

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const start = grid[y][x];
                const startKey = `${x},${y}`;
                if (visited.has(startKey) || !isTerritoryLand(x, y)) continue;
                const component = [];
                const adjacentTerritories = new Map();
                const queue = [[x, y]];
                const territoryId = start.territoryId;
                visited.add(startKey);

                while (queue.length) {
                    const [currentX, currentY] = queue.pop();
                    component.push([currentX, currentY]);
                    for (const [offsetX, offsetY] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        const nextX = currentX + offsetX;
                        const nextY = currentY + offsetY;
                        const nextTile = grid[nextY]?.[nextX];
                        const nextKey = `${nextX},${nextY}`;
                        if (isTerritoryLand(nextX, nextY) && nextTile.territoryId === territoryId) {
                            if (!visited.has(nextKey)) {
                                visited.add(nextKey);
                                queue.push([nextX, nextY]);
                            }
                        } else if (isTerritoryLand(nextX, nextY) && nextTile.territoryId !== territoryId) {
                            adjacentTerritories.set(nextTile.territoryId, (adjacentTerritories.get(nextTile.territoryId) || 0) + 1);
                        }
                    }
                }

                if (component.length >= minimumSize || adjacentTerritories.size === 0) continue;
                const replacement = [...adjacentTerritories.entries()]
                    .sort((first, second) => second[1] - first[1])[0]?.[0];
                const boundaryTotal = [...adjacentTerritories.values()].reduce((sum, count) => sum + count, 0);
                const replacementBoundary = adjacentTerritories.get(replacement) || 0;
                if (replacementBoundary < boundaryTotal * (2 / 3)) continue;
                if (!Number.isInteger(replacement)) continue;
                for (const [componentX, componentY] of component) {
                    const tile = grid[componentY][componentX];
                    tile.territoryId = replacement;
                    tile.regionName = regions[replacement]?.name || `territory-${replacement}`;
                }
            }
        }
    }

    removeDisconnectedComponents(grid, regions = []) {
        const rows = grid.length;
        const cols = grid[0]?.length || 0;
        const visited = new Set();
        const componentsByTerritory = new Map();
        const isLand = (x, y) => {
            const tile = grid[y]?.[x];
            return Boolean(tile?.isLand && tile.isMainland && !tile.isSea && !tile.isLake && tile.territoryId >= 0);
        };

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const startKey = `${x},${y}`;
                if (visited.has(startKey) || !isLand(x, y)) continue;
                const territoryId = grid[y][x].territoryId;
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
                        if (visited.has(nextKey) || !isLand(nextX, nextY)) continue;
                        if (grid[nextY][nextX].territoryId !== territoryId) continue;
                        visited.add(nextKey);
                        queue.push([nextX, nextY]);
                    }
                }
                if (!componentsByTerritory.has(territoryId)) componentsByTerritory.set(territoryId, []);
                componentsByTerritory.get(territoryId).push(component);
            }
        }

        for (const components of componentsByTerritory.values()) {
            if (components.length < 2) continue;
            components.sort((first, second) => second.length - first.length);
            for (const component of components.slice(1)) {
                const adjacent = new Map();
                for (const [x, y] of component) {
                    for (const [offsetX, offsetY] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        const neighbor = grid[y + offsetY]?.[x + offsetX];
                        if (!isLand(x + offsetX, y + offsetY) || neighbor.territoryId === grid[y][x].territoryId) continue;
                        adjacent.set(neighbor.territoryId, (adjacent.get(neighbor.territoryId) || 0) + 1);
                    }
                }
                const replacement = [...adjacent.entries()].sort((first, second) => second[1] - first[1])[0]?.[0];
                const boundaryTotal = [...adjacent.values()].reduce((sum, count) => sum + count, 0);
                const replacementBoundary = adjacent.get(replacement) || 0;
                if (replacementBoundary < boundaryTotal * (2 / 3)) continue;
                if (!Number.isInteger(replacement)) continue;
                for (const [x, y] of component) {
                    grid[y][x].territoryId = replacement;
                    grid[y][x].regionName = regions[replacement]?.name || `territory-${replacement}`;
                }
            }
        }
    }

    mergeDisconnectedTerritories(grid, regions = []) {
        const rows = grid.length;
        const cols = grid[0]?.length || 0;
        const visited = new Set();
        const componentsByTerritory = new Map();
        const isLand = (x, y) => {
            const tile = grid[y]?.[x];
            return Boolean(tile?.isLand && tile.isMainland && !tile.isSea && !tile.isLake && tile.territoryId >= 0);
        };

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const key = `${x},${y}`;
                if (visited.has(key) || !isLand(x, y)) continue;
                const territoryId = grid[y][x].territoryId;
                const component = [];
                const queue = [[x, y]];
                visited.add(key);
                while (queue.length) {
                    const [currentX, currentY] = queue.pop();
                    component.push([currentX, currentY]);
                    for (const [offsetX, offsetY] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        const nextX = currentX + offsetX;
                        const nextY = currentY + offsetY;
                        const nextKey = `${nextX},${nextY}`;
                        if (!visited.has(nextKey) && isLand(nextX, nextY) && grid[nextY][nextX].territoryId === territoryId) {
                            visited.add(nextKey);
                            queue.push([nextX, nextY]);
                        }
                    }
                }
                if (!componentsByTerritory.has(territoryId)) componentsByTerritory.set(territoryId, []);
                componentsByTerritory.get(territoryId).push(component);
            }
        }

        const connectComponent = (component, territoryId) => {
            const componentKeys = new Set(component.map(([x, y]) => `${x},${y}`));
            const queue = [...component];
            const previous = new Map();
            for (const [x, y] of component) previous.set(`${x},${y}`, null);
            let target = null;

            while (queue.length && !target) {
                const [x, y] = queue.shift();
                for (const [offsetX, offsetY] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const nextX = x + offsetX;
                    const nextY = y + offsetY;
                    const nextTile = grid[nextY]?.[nextX];
                    const nextKey = `${nextX},${nextY}`;
                    if (previous.has(nextKey) || !isLand(nextX, nextY)) continue;
                    previous.set(nextKey, [x, y]);
                    if (nextTile.territoryId === territoryId && !componentKeys.has(nextKey)) {
                        target = [nextX, nextY];
                        break;
                    }
                    queue.push([nextX, nextY]);
                }
            }

            if (!target) return;
            let current = target;
            while (current) {
                const [x, y] = current;
                const tile = grid[y][x];
                tile.territoryId = territoryId;
                tile.regionName = regions[territoryId]?.name || `territory-${territoryId}`;
                current = previous.get(`${x},${y}`);
            }
        };

        for (const [territoryId, components] of componentsByTerritory.entries()) {
            if (components.length < 2) continue;
            components.sort((first, second) => second.length - first.length);
            for (const component of components.slice(1)) {
                connectComponent(component, territoryId);
            }
        }
    }

    smoothTerritoryEdges(grid, regions = []) {
        const rows = grid.length;
        const cols = grid[0]?.length || 0;
        const updates = [];
        for (let y = 1; y < rows - 1; y++) {
            for (let x = 1; x < cols - 1; x++) {
                const tile = grid[y][x];
                if (!tile?.isLand || tile.isLake || !tile.isMainland || tile.territoryId < 0) continue;
                const counts = new Map();
                for (const [offsetX, offsetY] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
                    const neighbor = grid[y + offsetY]?.[x + offsetX];
                    if (!neighbor?.isLand || neighbor.isLake || !neighbor.isMainland || neighbor.territoryId < 0) continue;
                    counts.set(neighbor.territoryId, (counts.get(neighbor.territoryId) || 0) + 1);
                }
                const strongest = [...counts.entries()].sort((first, second) => second[1] - first[1])[0];
                const boundaryTotal = [...counts.values()].reduce((sum, count) => sum + count, 0);
                if (strongest && strongest[0] !== tile.territoryId && strongest[1] >= boundaryTotal * (2 / 3)) {
                    updates.push({ tile, territoryId: strongest[0] });
                }
            }
        }
        for (const update of updates) {
            update.tile.territoryId = update.territoryId;
            update.tile.regionName = regions[update.territoryId]?.name || `territory-${update.territoryId}`;
        }
    }

    generate(grid) {
        const rows = grid.length;
        const cols = grid[0].length;
        const regions = [
            { id: 0, key: 'north', name: '北部山岳地帯', x: cols * 0.28, y: rows * 0.20 },
            { id: 1, key: 'west', name: '西部穀倉地帯', x: cols * 0.14, y: rows * 0.56 },
            { id: 2, key: 'central', name: '中央交易都市', x: cols * 0.34, y: rows * 0.52 },
            { id: 3, key: 'east', name: '東部工業圏', x: cols * 0.52, y: rows * 0.52 },
            { id: 4, key: 'south', name: '南部香辛料地', x: cols * 0.34, y: rows * 0.80 }
        ];

        const regionCounts = new Array(regions.length).fill(0);
        const regionX = new Array(regions.length).fill(0);
        const regionY = new Array(regions.length).fill(0);

        const findNearestMainlandLabel = (preferredX, preferredY) => {
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
                        const tile = grid[y][x];
                        if (!tile || tile.isSea || tile.isLake || !tile.isMainland) continue;
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
                    const tile = grid[y][x];
                    if (!tile || tile.isSea || tile.isLake || !tile.isMainland) continue;
                    const dist = (x - preferredX) ** 2 + (y - preferredY) ** 2;
                    if (dist < bestDistance) {
                        bestDistance = dist;
                        best = { x, y };
                    }
                }
            }

            return best || { x: preferredX, y: preferredY };
        };

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const tile = grid[y][x];
                if (!tile || tile.isSea || tile.isLake || !tile.isMainland) continue;

                let bestId = 0;
                let bestDistance = Infinity;

                const sharedWarpX = this.fbm(x * 0.003 + 40, y * 0.003 + 90, this.seed + 401, 5, 0.72) * 150
                    + Math.sin(y * 0.010 + this.seed * 0.00001) * 42
                    + Math.sin(y * 0.024 + this.seed * 0.00003) * 16;
                const sharedWarpY = this.fbm(x * 0.003 + 130, y * 0.003 + 220, this.seed + 907, 5, 0.72) * 110
                    + Math.sin(x * 0.010 + this.seed * 0.00002) * 34
                    + Math.sin(x * 0.024 + this.seed * 0.00004) * 14;
                for (const region of regions) {
                    const centralRegion = region.key === 'central';
                    const regionalWarpX = this.fbm(
                        x * 0.005 + region.id * 23,
                        y * 0.005 + region.id * 41,
                        this.seed + 7101 + region.id * 137,
                        4,
                        0.72
                    ) * (centralRegion ? 0 : 260);
                    const regionalWarpY = this.fbm(
                        x * 0.005 + region.id * 31,
                        y * 0.005 + region.id * 19,
                        this.seed + 7201 + region.id * 149,
                        4,
                        0.72
                    ) * (centralRegion ? 0 : 170);
                    const warpX = x + sharedWarpX + regionalWarpX;
                    const warpY = y + sharedWarpY + regionalWarpY;
                    const dx = warpX - region.x;
                    const dy = warpY - region.y;
                    const broadBoundaryWarp = this.fbm(
                        x * 0.004 + region.id * 17,
                        y * 0.004 + region.id * 29,
                        this.seed + 5101 + region.id * 113,
                        4,
                        0.72
                    ) * (centralRegion ? 0 : 18000);
                    const detailBoundaryWarp = this.fbm(
                        x * 0.035 + region.id * 23,
                        y * 0.035 + region.id * 31,
                        this.seed + 6201 + region.id * 127,
                        2,
                        0.72
                    ) * (centralRegion ? 0 : 3500);
                    const centralInfluence = centralRegion ? -18000 : 0;
                    const northernMountainInfluence = region.key === 'north'
                        && tile.type === 'MOUNTAIN'
                        && y < rows * 0.50
                        ? -22000
                        : 0;
                    const dist = dx * dx + dy * dy + broadBoundaryWarp + detailBoundaryWarp + centralInfluence + northernMountainInfluence;
                    if (dist < bestDistance) {
                        bestDistance = dist;
                        bestId = region.id;
                    }
                }

                tile.territoryId = bestId;
                tile.regionName = regions[bestId].name;
                regionCounts[bestId] += 1;
                regionX[bestId] += x;
                regionY[bestId] += y;
            }
        }

        const mountainVisited = new Set();
        const mountainMinimumSize = Math.max(48, Math.round(rows * cols * 0.00005));
        for (let y = 1; y < rows - 1; y++) {
            for (let x = 1; x < cols - 1; x++) {
                const start = grid[y][x];
                const startKey = `${x},${y}`;
                if (mountainVisited.has(startKey) || start?.type !== 'MOUNTAIN' || !start.isMainland) continue;

                const component = [];
                const adjacentTerritories = new Map();
                const queue = [[x, y]];
                mountainVisited.add(startKey);
                while (queue.length) {
                    const [currentX, currentY] = queue.pop();
                    component.push([currentX, currentY]);
                    for (const [offsetX, offsetY] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        const nextX = currentX + offsetX;
                        const nextY = currentY + offsetY;
                        const nextTile = grid[nextY]?.[nextX];
                        if (nextTile?.type === 'MOUNTAIN' && nextTile.isMainland) {
                            const nextKey = `${nextX},${nextY}`;
                            if (!mountainVisited.has(nextKey)) {
                                mountainVisited.add(nextKey);
                                queue.push([nextX, nextY]);
                            }
                        } else if (nextTile?.territoryId >= 0) {
                            adjacentTerritories.set(nextTile.territoryId, (adjacentTerritories.get(nextTile.territoryId) || 0) + 1);
                        }
                    }
                }

                const centerY = component.reduce((sum, [, componentY]) => sum + componentY, 0) / component.length;
                const boundaryTotal = [...adjacentTerritories.values()].reduce((sum, count) => sum + count, 0);
                const northBoundary = adjacentTerritories.get(0) || 0;
                const touchesCentralProtection = component.some(([componentX, componentY]) =>
                    Math.hypot(
                        (componentX - cols * 0.34) / (cols * 0.16),
                        (componentY - rows * 0.52) / (rows * 0.18)
                    ) < 1.0
                );
                if (component.length < mountainMinimumSize
                    || centerY >= rows * 0.55
                    || northBoundary < boundaryTotal * (1 / 3)
                    || touchesCentralProtection) continue;
                for (const [componentX, componentY] of component) {
                    const tile = grid[componentY][componentX];
                    tile.territoryId = 0;
                    tile.regionName = regions[0].name;
                }
            }
        }

        const obstacleVisited = new Set();
        const isTerrainComponent = (type) => type === 'MOUNTAIN' || type === 'FOREST';
        for (let y = 1; y < rows - 1; y++) {
            for (let x = 1; x < cols - 1; x++) {
                const start = grid[y][x];
                const startKey = `${x},${y}`;
            if (!start || !isTerrainComponent(start.type) || start.isSea || start.isLake || !start.isMainland || obstacleVisited.has(startKey)) continue;
            const componentType = start.type;
                const component = [];
                const queue = [[x, y]];
                const adjacentTerritories = new Map();
                obstacleVisited.add(startKey);
                while (queue.length) {
                    const [currentX, currentY] = queue.shift();
                    component.push([currentX, currentY]);
                    for (const [offsetX, offsetY] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        const nextX = currentX + offsetX;
                        const nextY = currentY + offsetY;
                        const nextTile = grid[nextY]?.[nextX];
                        if (!nextTile || nextTile.isSea || nextTile.isLake || !nextTile.isMainland) continue;
                        if (isTerrainComponent(nextTile.type) && nextTile.type === componentType) {
                            const nextKey = `${nextX},${nextY}`;
                            if (!obstacleVisited.has(nextKey)) {
                                obstacleVisited.add(nextKey);
                                queue.push([nextX, nextY]);
                            }
                            continue;
                        }
                        if (nextTile.territoryId >= 0) {
                            adjacentTerritories.set(nextTile.territoryId, (adjacentTerritories.get(nextTile.territoryId) || 0) + 1);
                        }
                    }
                }
                let selectedTerritory = start.territoryId;
                let selectedWeight = -1;
                for (const [territoryId, weight] of adjacentTerritories) {
                    if (weight > selectedWeight) {
                        selectedTerritory = territoryId;
                        selectedWeight = weight;
                    }
                }
                if (componentType === 'FOREST' && component.length < 160) continue;
                const boundaryTotal = [...adjacentTerritories.values()].reduce((sum, weight) => sum + weight, 0);
                const terrainBoundaryThreshold = componentType === 'FOREST' ? 0.75 : 2 / 3;
                if (selectedWeight < boundaryTotal * terrainBoundaryThreshold) selectedTerritory = start.territoryId;
                for (const [componentX, componentY] of component) {
                    const tile = grid[componentY][componentX];
                    tile.territoryId = selectedTerritory;
                    tile.regionName = regions[selectedTerritory].name;
                }
            }
        }


        const territoryAreas = new Map();
        for (const row of grid) {
            for (const tile of row) {
                if (!tile?.isLand || tile.isLake || tile.territoryId < 0) continue;
                territoryAreas.set(tile.territoryId, (territoryAreas.get(tile.territoryId) || 0) + 1);
            }
        }

        const lakeVisited = new Set();
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const start = grid[y][x];
                const startKey = `${x},${y}`;
                if (!start?.isLake || lakeVisited.has(startKey)) continue;
                const component = [];
                const adjacentTerritories = new Map();
                const queue = [[x, y]];
                lakeVisited.add(startKey);
                while (queue.length) {
                    const [currentX, currentY] = queue.shift();
                    component.push([currentX, currentY]);
                    for (const [offsetX, offsetY] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        const nextX = currentX + offsetX;
                        const nextY = currentY + offsetY;
                        const nextTile = grid[nextY]?.[nextX];
                        if (nextTile?.isLake) {
                            const nextKey = `${nextX},${nextY}`;
                            if (!lakeVisited.has(nextKey)) {
                                lakeVisited.add(nextKey);
                                queue.push([nextX, nextY]);
                            }
                        } else if (nextTile?.isLand && nextTile.territoryId >= 0) {
                            adjacentTerritories.set(nextTile.territoryId, (adjacentTerritories.get(nextTile.territoryId) || 0) + 1);
                        }
                    }
                }
                const smallestAdjacentTerritory = [...adjacentTerritories.entries()]
                    .sort((first, second) => (territoryAreas.get(first[0]) || 0) - (territoryAreas.get(second[0]) || 0)
                        || second[1] - first[1])[0]?.[0] ?? 0;
                const boundaryTotal = [...adjacentTerritories.values()].reduce((sum, weight) => sum + weight, 0);
                const strongestAdjacentTerritory = [...adjacentTerritories.entries()]
                    .sort((first, second) => second[1] - first[1])[0];
                const selectedTerritory = strongestAdjacentTerritory && strongestAdjacentTerritory[1] >= boundaryTotal * (2 / 3)
                    ? strongestAdjacentTerritory[0]
                    : smallestAdjacentTerritory;
                for (const [lakeX, lakeY] of component) {
                    grid[lakeY][lakeX].territoryId = selectedTerritory;
                    grid[lakeY][lakeX].regionName = regions[selectedTerritory].name;
                }
            }
        }
        for (let pass = 0; pass < 2; pass++) this.smoothTerritoryEdges(grid, regions);
        this.smoothTerritoryEdges(grid, regions);
        this.removeDisconnectedComponents(grid, regions);
        this.smoothTerritoryEdges(grid, regions);
        this.removeDisconnectedComponents(grid, regions);

        regionCounts.fill(0);
        regionX.fill(0);
        regionY.fill(0);
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const tile = grid[y][x];
                if (!tile || tile.isSea || tile.isLake || !tile.isMainland || tile.territoryId < 0) continue;
                regionCounts[tile.territoryId] += 1;
                regionX[tile.territoryId] += x;
                regionY[tile.territoryId] += y;
            }
        }

        const territories = regions.map((region, index) => {
            const count = regionCounts[index] || 0;
            const preferred = region.key === 'central' ? {
                x: region.x,
                y: region.y
            } : count > 0 ? {
                x: regionX[index] / count,
                y: regionY[index] / count
            } : { x: region.x, y: region.y };
            const labelPos = findNearestMainlandLabel(preferred.x, preferred.y);

            return {
                ...region,
                territoryId: region.id,
                color: region.color || '#d9d3c4',
                labelPos,
                kind: 'mainland'
            };
        });

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const tile = grid[y][x];
                if (!tile || tile.isSea || tile.isLake || !tile.isMainland) continue;
                const region = territories.find(item => item.territoryId === tile.territoryId);
                if (region && region.labelPos) {
                    tile.labelPos = { x: region.labelPos.x, y: region.labelPos.y };
                }
            }
        }

        return { grid, territories };
    }
}
