function isLand(tile) {
    return Boolean(tile && tile.isLand && !tile.isSea && !tile.isLake && !tile.isOcean && tile.type !== 'SEA' && tile.type !== 'LAKE');
}

function edgeKey(x1, y1, x2, y2) {
    const first = `${x1},${y1}`;
    const second = `${x2},${y2}`;
    return first < second ? `${first},${second}` : `${second},${first}`;
}

function hash2D(x, y, seed) {
    let hash = Math.imul(x | 0, 374761393);
    hash = Math.imul(hash + (y | 0), 668265263);
    hash = Math.imul(hash ^ (hash >>> 13) ^ seed, 1274126177);
    return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, y, seed) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = x - x0;
    const ty = y - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const topLeft = hash2D(x0, y0, seed);
    const topRight = hash2D(x0 + 1, y0, seed);
    const bottomLeft = hash2D(x0, y0 + 1, seed);
    const bottomRight = hash2D(x0 + 1, y0 + 1, seed);
    const top = topLeft + (topRight - topLeft) * sx;
    const bottom = bottomLeft + (bottomRight - bottomLeft) * sx;
    return top + (bottom - top) * sy - 0.5;
}

function fbm(x, y, seed) {
    let value = 0;
    let amplitude = 0.55;
    let frequency = 0.72;
    let total = 0;
    for (let octave = 0; octave < 5; octave++) {
        value += valueNoise(x * frequency, y * frequency, seed + octave * 1013) * amplitude;
        total += amplitude;
        frequency *= 2;
        amplitude *= 0.52;
    }
    return value / total;
}

function pairSeed(pair) {
    let seed = 2166136261;
    const value = String(pair || '');
    for (let index = 0; index < value.length; index++) {
        seed ^= value.charCodeAt(index);
        seed = Math.imul(seed, 16777619);
    }
    return seed >>> 0;
}

export function getTerritoryBorderControlPoint(x1, y1, x2, y2, pair = '') {
    const centerX = (x1 + x2) * 0.5;
    const centerY = (y1 + y2) * 0.5;
    const seed = pairSeed(pair);
    const amount = fbm(centerX * 0.006 + 37, centerY * 0.006 + 71, seed + 271, 4, 1) * 2.4
        + fbm(centerX * 0.018 + 113, centerY * 0.018 + 29, seed + 911, 4, 1) * 0.8
        + (String(pair).endsWith(':coast') ? 0 : fbm(centerX * 0.24 + 17, centerY * 0.24 + 61, seed + 1771, 4, 1) * 0.08);
    return y1 === y2
        ? { x: centerX, y: centerY + amount }
        : { x: centerX + amount, y: centerY };
}

export function getTerritoryBorderPoint(x, y, pair = '') {
    const seed = pairSeed(pair);
    const lowFrequencyX = String(pair).endsWith(':coast') ? 0 : fbm(x * 0.006 + 31, y * 0.006 + 47, seed + 1881, 4, 1) * 1.8;
    const lowFrequencyY = String(pair).endsWith(':coast') ? 0 : fbm(x * 0.006 + 73, y * 0.006 + 19, seed + 1993, 4, 1) * 1.8;
    const highFrequencyX = String(pair).endsWith(':coast') ? 0 : fbm(x * 0.24 + 31, y * 0.24 + 47, seed + 2881, 4, 1) * 0.12;
    const highFrequencyY = String(pair).endsWith(':coast') ? 0 : fbm(x * 0.24 + 73, y * 0.24 + 19, seed + 2993, 4, 1) * 0.12;
    return {
        x: x + lowFrequencyX + highFrequencyX,
        y: y + lowFrequencyY + highFrequencyY
    };
}

export function buildTerritoryBorderSegments(grid) {
    if (!grid?.length || !grid[0]?.length) return [];
    const segments = [];
    const addLandBorder = (x1, y1, x2, y2, first, second) => {
        if (!isLand(first) || !isLand(second)) return;
        if (first.territoryId < 0 || second.territoryId < 0 || first.territoryId === second.territoryId) return;
        segments.push({ x1, y1, x2, y2, pair: [first.territoryId, second.territoryId].sort((a, b) => a - b).join(':') });
    };
    const addCoast = (x1, y1, x2, y2, landTile, waterTile) => {
        if (!isLand(landTile) || !waterTile?.isSea || landTile.territoryId < 0) return;
        segments.push({ x1, y1, x2, y2, pair: `${landTile.territoryId}:coast` });
    };
    const addLakeBorder = (x1, y1, x2, y2, landTile, lakeTile) => {
        if (!isLand(landTile) || !lakeTile?.isLake) return;
        if (landTile.territoryId < 0 || lakeTile.territoryId < 0 || landTile.territoryId === lakeTile.territoryId) return;
        segments.push({ x1, y1, x2, y2, pair: [landTile.territoryId, lakeTile.territoryId].sort((a, b) => a - b).join(':') });
    };
    for (let y = 0; y < grid.length; y++) {
        for (let x = 0; x < grid[0].length; x++) {
            const tile = grid[y][x];
            addLandBorder(x + 1, y, x + 1, y + 1, tile, grid[y]?.[x + 1]);
            addLandBorder(x, y + 1, x + 1, y + 1, tile, grid[y + 1]?.[x]);
            addCoast(x + 1, y, x + 1, y + 1, tile, grid[y]?.[x + 1]);
            addCoast(x, y + 1, x + 1, y + 1, tile, grid[y + 1]?.[x]);
            addCoast(x + 1, y, x + 1, y + 1, grid[y]?.[x + 1], tile);
            addCoast(x, y + 1, x + 1, y + 1, grid[y + 1]?.[x], tile);
            addLakeBorder(x + 1, y, x + 1, y + 1, tile, grid[y]?.[x + 1]);
            addLakeBorder(x, y + 1, x + 1, y + 1, tile, grid[y + 1]?.[x]);
            addLakeBorder(x + 1, y, x + 1, y + 1, grid[y]?.[x + 1], tile);
            addLakeBorder(x, y + 1, x + 1, y + 1, grid[y + 1]?.[x], tile);
        }
    }
    const unique = new Map();
    for (const segment of segments) unique.set(edgeKey(segment.x1, segment.y1, segment.x2, segment.y2), segment);
    return [...unique.values()];
}
