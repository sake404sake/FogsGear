export class HeightmapGenerator {
    constructor(width, height, seed = 'SteampunkIsland_01') {
        this.width = Number(width) || 1000;
        this.height = Number(height) || 1000;
        this.seed = typeof seed === 'number' ? seed : this.hashString(String(seed));
    }

    clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    smoothstep(edge0, edge1, x) {
        const t = this.clamp((x - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
        return t * t * (3 - 2 * t);
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

    domainWarp(x, y, seed) {
        const nx = x / this.width;
        const ny = y / this.height;
        const wx = nx * 18.0 + 8.2;
        const wy = ny * 18.0 + 4.6;
        const dx = this.fbm(wx + 30.2, wy + 15.7, seed + 11, 5, 0.55);
        const dy = this.fbm(wx + 72.8, wy + 41.3, seed + 23, 5, 0.55);
        return {
            x: x + dx * 28,
            y: y + dy * 28
        };
    }

    generate() {
        const heightmap = Array.from({ length: this.height }, () => Array(this.width));

        for (let y = 0; y < this.height; y++) {
            const ny = y / Math.max(1, this.height - 1);
            for (let x = 0; x < this.width; x++) {
                const nx = x / Math.max(1, this.width - 1);
                const warped = this.domainWarp(x, y, this.seed + 9);
                const warpedNX = warped.x / Math.max(1, this.width - 1);
                const warpedNY = warped.y / Math.max(1, this.height - 1);

                const mainlandNoise = this.fbm(warped.x * 0.013 + 90, warped.y * 0.013 + 30, this.seed + 100, 6, 1.0);
                const mainlandRidge = this.fbm(warped.x * 0.020 + 160, warped.y * 0.020 + 90, this.seed + 41, 5, 1.1);
                const northernRidge = this.fbm(warped.x * 0.016 + 220, warped.y * 0.023 + 140, this.seed + 201, 6, 1.1);
                const northernMountainMask = Math.max(0, 1.0 - ny / 0.35) * (0.65 + northernRidge * 0.55) * (0.7 + mainlandNoise * 0.9);

                const mainlandCenter = 0.38 + 0.08 * Math.sin((warped.y * 0.014) + this.seed * 0.0008);
                const mainlandDistance = Math.hypot((warpedNX - mainlandCenter) / 0.42, (warpedNY - 0.52) / 0.48);
                const mainlandMask = Math.exp(-Math.pow(mainlandDistance, 2) * 2.2);

                const islandCenterX = 0.80 + 0.06 * Math.sin(warped.y * 0.016 + this.seed * 0.0012);
                const islandCenterY = 0.52 + 0.06 * Math.cos(warped.x * 0.014 + this.seed * 0.0016);
                const islandDistance = Math.hypot((warpedNX - islandCenterX) / 0.22, (warpedNY - islandCenterY) / 0.18);
                const islandMask = Math.exp(-Math.pow(islandDistance, 2) * 4.0);

                const straitCenter = 0.62 + 0.08 * Math.sin((ny * 16.0) + this.seed * 0.0009) + 0.04 * Math.cos((nx * 22.0) - this.seed * 0.0007);
                const straitDistance = Math.abs(nx - straitCenter) + Math.abs(ny - 0.52) * 0.72;
                const straitMask = 1.0 - this.smoothstep(0.06, 0.90, straitDistance + (1.0 - islandMask) * 0.24);

                const coastNoise = Math.sin((warped.x * 0.025) + this.seed * 0.003) * 0.12 + Math.cos((warped.y * 0.028) - this.seed * 0.002) * 0.10;
                const mainlandBase = 0.18 + mainlandNoise * 0.52 + mainlandRidge * 0.24 + mainlandMask * 0.28 + northernMountainMask * 0.52 + coastNoise;
                const islandBase = islandMask * 1.12;
                const lakeCenterX = 0.68 + 0.07 * Math.sin((ny * 12.0) + this.seed * 0.0015);
                const lakeCenterY = 0.52 + 0.08 * Math.cos((nx * 16.0) - this.seed * 0.0021);
                const lakeDistance = Math.hypot((warpedNX - lakeCenterX) / 0.18, (warpedNY - lakeCenterY) / 0.16);
                const lakeMask = Math.exp(-Math.pow(lakeDistance, 2) * 7.0) * (0.8 + this.fbm(warped.x * 0.024 + 70, warped.y * 0.024 + 340, this.seed + 650, 5, 0.9));

                let height = 0.06 + mainlandBase * (0.65 + ((1.0 - nx) * 0.65)) + islandBase;
                height += this.fbm(warped.x * 0.020 + 40, warped.y * 0.020 + 120, this.seed + 12, 5, 1.1) * 0.14;
                height -= straitMask * 0.88 * (1.0 - islandMask);
                height -= lakeMask * 0.30;
                height += (1.0 - Math.abs(nx - 0.68)) * 0.10 * Math.sin((ny * 18.0) + this.seed * 0.0015);

                height = this.clamp(height, 0, 1);
                heightmap[y][x] = height;
            }
        }

        return heightmap;
    }
}
