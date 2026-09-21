export class BiomeGenerator {
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

    clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    isLakeDepression(heightmap, x, y, height, moisture) {
        const width = heightmap[0].length;
        const heightLen = heightmap.length;
        const n = 2;
        let sum = 0;
        let count = 0;
        for (let oy = -n; oy <= n; oy++) {
            for (let ox = -n; ox <= n; ox++) {
                const tx = x + ox;
                const ty = y + oy;
                if (tx <= 0 || ty <= 0 || tx >= width - 1 || ty >= heightLen - 1) continue;
                sum += heightmap[ty][tx];
                count += 1;
            }
        }
        const avg = count ? sum / count : height;
        const lakeChance = this.fbm(x * 0.018 + 500, y * 0.018 + 700, this.seed + 44, 5, 1.0);
        return height < 0.58 && avg < 0.58 && moisture > 0.22 && lakeChance > 0.42;
    }

    generate(heightmap) {
        const rows = heightmap.length;
        const cols = heightmap[0].length;
        const grid = Array.from({ length: rows }, () => Array(cols));

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                let height = Number(heightmap[y][x]);
                height = Math.min(1.0, Math.max(0.0, height));
                const nx = x / Math.max(1, cols - 1);
                const ny = y / Math.max(1, rows - 1);
                const moisture = 0.5 + this.fbm((x + 18) * 0.012 + 70, (y + 44) * 0.012 + 140, this.seed + 94, 5, 1.1) * 0.55;
                const temperature = 0.5 + this.fbm((x + 52) * 0.008 + 240, (y + 92) * 0.008 + 420, this.seed + 201, 5, 0.9) * 0.5;
                const ridge = this.fbm((x + 12) * 0.024 + 400, (y + 80) * 0.024 + 700, this.seed + 144, 5, 1.0);
                const lowFreq = this.fbm(x * 0.024 + 100, y * 0.024 + 200, this.seed + 330, 5, 0.8);
                const highFreq = this.fbm(x * 0.085 + 900, y * 0.085 + 1300, this.seed + 520, 4, 1.2);
                const lakeNoise = lowFreq * 0.7 + highFreq * 0.3;

                const islandCenterX = 0.80;
                const islandCenterY = 0.52;
                const islandness = Math.exp(-(((nx - islandCenterX) / 0.20) ** 2 + ((ny - islandCenterY) / 0.18) ** 2) * 1.0);

                const lakeCenterX = 0.68;
                const lakeCenterY = 0.58;
                const lakeField = Math.exp(-(((nx - lakeCenterX) / 0.15) ** 2 + ((ny - lakeCenterY) / 0.12) ** 2));
                const basinField = Math.exp(-(((nx - 0.71) / 0.17) ** 2 + ((ny - 0.63) / 0.14) ** 2));

                let type = 'SEA';
                let isLake = false;

                const lakeDepression = height < 0.40 && lakeField > 0.25 && basinField > 0.05;
                const northMountainBoost = ny < 0.35 && height >= 0.52 && (0.35 - ny) * 2.0 + ridge > 0.5;

                if (lakeDepression) {
                    type = 'LAKE';
                    isLake = true;
                } else if (height <= 0.12) {
                    type = 'SEA';
                } else if (height >= 0.75 || northMountainBoost) {
                    type = 'MOUNTAIN';
                } else if (moisture > 0.56 && height > 0.34) {
                    type = 'FOREST';
                } else {
                    type = 'PLAINS';
                }

                const isSea = type === 'SEA';
                const isLand = !isSea && !isLake;
                const isIsland = islandness > 0.12 && height > 0.15;
                const isMainland = !isIsland && height > 0.18 && nx < 0.72;
                const colorMap = {
                    SEA: '#1e4d6b',
                    PLAINS: '#8db87c',
                    FOREST: '#3e6b48',
                    MOUNTAIN: '#6b7280',
                    LAKE: '#3b82f6'
                };

                const tile = {
                    x,
                    y,
                    height,
                    moisture,
                    temperature,
                    type,
                    typeCode: isSea ? 3 : isLake ? 3 : type === 'MOUNTAIN' ? 1 : type === 'FOREST' ? 2 : 0,
                    isSea,
                    isOcean: isSea,
                    isLake,
                    isLand,
                    hasIsland: isIsland,
                    hasMainland: isMainland,
                    territoryId: -1,
                    regionName: '',
                    labelPos: null,
                    isIsland,
                    isMainland,
                    color: colorMap[type] || colorMap.SEA,
                    slope: Math.abs(ridge - 0.5) * 0.8
                };

                if (tile.type === 'SEA' || tile.type === 'LAKE') {
                    tile.typeCode = 3;
                }

                grid[y][x] = tile;
            }
        }

        const visited = new Set();
        const waterGroups = [];
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                if (visited.has(`${x},${y}`) || (!grid[y][x].isSea && !grid[y][x].isLake)) continue;
                const queue = [[x, y]];
                visited.add(`${x},${y}`);
                const group = [];
                while (queue.length) {
                    const [cx, cy] = queue.shift();
                    group.push({ x: cx, y: cy });
                    const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];
                    for (const [dx, dy] of neighbors) {
                        const nx2 = cx + dx;
                        const ny2 = cy + dy;
                        if (nx2 < 0 || nx2 >= cols || ny2 < 0 || ny2 >= rows) continue;
                        const key = `${nx2},${ny2}`;
                        if (visited.has(key)) continue;
                        const tile = grid[ny2][nx2];
                        if (!tile || (!tile.isSea && !tile.isLake)) continue;
                        visited.add(key);
                        queue.push([nx2, ny2]);
                    }
                }
                waterGroups.push(group);
            }
        }

        if (waterGroups.length > 0) {
            const largestWater = waterGroups.reduce((largest, group) => group.length > largest.length ? group : largest, waterGroups[0]);
            const largestSet = new Set(largestWater.map(({ x, y }) => `${x},${y}`));
            for (const group of waterGroups) {
                const isLargest = group === largestWater;
                for (const cell of group) {
                    const tile = grid[cell.y][cell.x];
                    if (!isLargest) {
                        tile.type = 'LAKE';
                        tile.isLake = true;
                        tile.isSea = false;
                        tile.isOcean = false;
                        tile.isLand = false;
                        tile.color = '#3b82f6';
                    } else {
                        tile.type = 'SEA';
                        tile.isSea = true;
                        tile.isOcean = true;
                        tile.isLake = false;
                        tile.isLand = false;
                        tile.color = '#1e4d6b';
                    }
                }
            }
        }

        return grid;
    }
}
