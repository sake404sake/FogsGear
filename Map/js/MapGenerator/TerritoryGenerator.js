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

    generate(grid) {
        const rows = grid.length;
        const cols = grid[0].length;
        const regions = [
            { id: 0, key: 'north', name: '北部山岳地帯', x: cols * 0.23, y: rows * 0.18 },
            { id: 1, key: 'west', name: '西部穀倉地帯', x: cols * 0.18, y: rows * 0.48 },
            { id: 2, key: 'central', name: '中央交易都市', x: cols * 0.34, y: rows * 0.54 },
            { id: 3, key: 'east', name: '東部工業圏', x: cols * 0.40, y: rows * 0.72 },
            { id: 4, key: 'south', name: '南部香辛料地', x: cols * 0.30, y: rows * 0.82 }
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

                for (const region of regions) {
                    const warpX = x + this.fbm((x + 17) * 0.018 + 40, (y + 51) * 0.018 + 90, this.seed + region.id * 77, 5, 1.0) * 14;
                    const warpY = y + this.fbm((x + 39) * 0.016 + 130, (y + 11) * 0.016 + 220, this.seed + region.id * 91, 5, 1.0) * 14;
                    const dx = warpX - region.x;
                    const dy = warpY - region.y;
                    const dist = dx * dx + dy * dy;
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

        const territories = regions.map((region, index) => {
            const count = regionCounts[index] || 0;
            const preferred = count > 0 ? {
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
