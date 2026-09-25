import { buildTerritoryBorderSegments } from '../territoryBorders.js?v=35';

export const BIOME_COLORS = Object.freeze({
    PLAINS: '#8db87c',
    FOREST: '#3e6b48',
    MOUNTAIN: '#746b60',
    SAND: '#d5bd8a',
    SEA: '#123a5a',
    LAKE: '#3b82f6',
    RUINS: '#ef4444',
    PLAYER: '#ff0000',
    TERRITORY: 'rgba(210, 45, 45, 0.78)',
    LABEL_BG: 'rgba(10, 10, 10, 0.78)',
    LABEL_TEXT: '#ffffff',
    grid: 'rgba(146, 122, 92, 0.16)',
    waterLine: '#5db7d8',
    grassland: '#8db87c',
    territoryBorder: 'rgba(210, 45, 45, 0.86)',
    labelBg: 'rgba(10, 10, 10, 0.78)'
});

export class MapRenderer {
    constructor({ canvas, width = 1000, height = 1000, zoom = 1.0 } = {}) {
        this.canvas = canvas || document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.width = width;
        this.height = height;
        this.zoom = zoom;
        this.camera = { x: 0, y: 0 };
        this.grid = [];
        this.territories = [];
        this.ruins = [];
        this.playerPos = { x: 0, y: 0 };
        this.tileSize = 32;
        this.pointerState = { dragging: false, startX: 0, startY: 0, camStartX: 0, camStartY: 0 };
        this.boundLegendSelector = null;
    }

    bindLegend(selector) {
        this.boundLegendSelector = selector;
        const legend = document.querySelector(selector);
        if (!legend) return;

        const entries = [
            { label: '草原・平地', color: BIOME_COLORS.PLAINS },
            { label: '森林・丘陵', color: BIOME_COLORS.FOREST },
            { label: '山地・崖', color: BIOME_COLORS.MOUNTAIN },
            { label: '砂地', color: BIOME_COLORS.SAND },
            { label: '海', color: BIOME_COLORS.SEA },
            { label: '湖沼', color: BIOME_COLORS.LAKE },
            { label: '古代遺跡', color: BIOME_COLORS.RUINS },
            { label: '現在地', color: BIOME_COLORS.PLAYER }
        ];

        legend.innerHTML = entries.map(entry => `
            <div class="legend-item">
                <span class="legend-color" style="background-color:${entry.color};"></span>
                <span>${entry.label}</span>
            </div>
        `).join('');

        this.syncLegendColors();
    }

    syncLegendColors() {
        const legend = this.boundLegendSelector ? document.querySelector(this.boundLegendSelector) : null;
        const nodes = legend ? legend.querySelectorAll('.legend-color') : document.querySelectorAll('.legend-color');
        const palette = {
            '草原・平地': BIOME_COLORS.PLAINS,
            '森林・丘陵': BIOME_COLORS.FOREST,
            '山地・崖': BIOME_COLORS.MOUNTAIN,
            '砂地': BIOME_COLORS.SAND,
            '海': BIOME_COLORS.SEA,
            '湖沼': BIOME_COLORS.LAKE,
            '古代遺跡': BIOME_COLORS.RUINS,
            '現在地': BIOME_COLORS.PLAYER
        };

        nodes.forEach((node, index) => {
            const text = node.parentElement?.textContent?.trim();
            const match = Object.entries(palette).find(([label]) => text && text.startsWith(label));
            if (match) {
                node.style.backgroundColor = match[1];
            }
        });
    }

    setMapData(grid, territories = [], ruins = []) {
        this.grid = grid;
        this.territories = territories;
        this.ruins = ruins;
        this.territoryBorderSegments = buildTerritoryBorderSegments(this.grid);
        if (this.grid.length && this.grid[0].length) {
            const centerX = (this.grid[0].length * this.tileSize) / 2;
            const centerY = (this.grid.length * this.tileSize) / 2;
            this.camera.x = centerX;
            this.camera.y = centerY;
        }
    }

    setPlayerPosition(x, y) {
        this.playerPos = { x, y };
    }

    setZoom(zoom) {
        this.zoom = Math.min(4, Math.max(0.4, zoom));
    }

    getVisibleWindow() {
        const viewW = this.canvas.width / this.zoom;
        const viewH = this.canvas.height / this.zoom;
        const left = this.camera.x - viewW / 2;
        const top = this.camera.y - viewH / 2;
        return { left, top, viewW, viewH };
    }

    drawTile(x, y, color) {
        const px = x * this.tileSize;
        const py = y * this.tileSize;
        const sx = (px - this.camera.x + this.canvas.width / 2) * this.zoom;
        const sy = (py - this.camera.y + this.canvas.height / 2) * this.zoom;
        const size = this.tileSize * this.zoom;
        this.ctx.fillStyle = color;
        this.ctx.fillRect(sx, sy, size, size);
    }

    drawGrid() {
        if (this.zoom < 1.5) return;
        const { left, top, viewW, viewH } = this.getVisibleWindow();
        const startCol = Math.max(0, Math.floor(left / this.tileSize));
        const endCol = Math.min(this.grid[0].length, Math.ceil((left + viewW) / this.tileSize));
        const startRow = Math.max(0, Math.floor(top / this.tileSize));
        const endRow = Math.min(this.grid.length, Math.ceil((top + viewH) / this.tileSize));

        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(146, 122, 92, 0.16)';
        this.ctx.lineWidth = 1;
        for (let y = startRow; y <= endRow; y++) {
            const py = (y * this.tileSize - this.camera.y + this.canvas.height / 2) * this.zoom;
            this.ctx.beginPath();
            this.ctx.moveTo(0, py);
            this.ctx.lineTo(this.canvas.width, py);
            this.ctx.stroke();
        }
        for (let x = startCol; x <= endCol; x++) {
            const px = (x * this.tileSize - this.camera.x + this.canvas.width / 2) * this.zoom;
            this.ctx.beginPath();
            this.ctx.moveTo(px, 0);
            this.ctx.lineTo(px, this.canvas.height);
            this.ctx.stroke();
        }
        this.ctx.restore();
    }

    drawTerritoryBorders() {
        if (!this.grid.length || !this.territories.length) return;
        const { left, top, viewW, viewH } = this.getVisibleWindow();
        const startCol = Math.max(0, Math.floor(left / this.tileSize));
        const endCol = Math.min(this.grid[0].length, Math.ceil((left + viewW) / this.tileSize));
        const startRow = Math.max(0, Math.floor(top / this.tileSize));
        const endRow = Math.min(this.grid.length, Math.ceil((top + viewH) / this.tileSize));

        this.ctx.save();
        this.ctx.strokeStyle = BIOME_COLORS.TERRITORY;
        this.ctx.lineWidth = 1.2;
        this.ctx.setLineDash([6, 6]);
        const drawLine = (x1, y1, x2, y2) => {
            const sx1 = (x1 * this.tileSize - this.camera.x + this.canvas.width / 2) * this.zoom;
            const sy1 = (y1 * this.tileSize - this.camera.y + this.canvas.height / 2) * this.zoom;
            const sx2 = (x2 * this.tileSize - this.camera.x + this.canvas.width / 2) * this.zoom;
            const sy2 = (y2 * this.tileSize - this.camera.y + this.canvas.height / 2) * this.zoom;
            this.ctx.beginPath();
            this.ctx.moveTo(sx1, sy1);
            this.ctx.lineTo(sx2, sy2);
            this.ctx.stroke();
        };
        for (const segment of this.territoryBorderSegments) {
            if (Math.max(segment.x1, segment.x2) < startCol || Math.min(segment.x1, segment.x2) > endCol || Math.max(segment.y1, segment.y2) < startRow || Math.min(segment.y1, segment.y2) > endRow) continue;
            drawLine(segment.x1, segment.y1, segment.x2, segment.y2);
        }

        this.ctx.restore();
    }

    drawLabels() {
        const labels = this.territories.filter(item => item.labelPos).map(item => ({
            text: item.name,
            x: item.labelPos.x,
            y: item.labelPos.y,
            kind: 'territory'
        })).filter((label) => {
            const tile = this.grid[Math.floor(label.y)]?.[Math.floor(label.x)];
            return Boolean(tile && tile.isLand && !tile.isSea && !tile.isLake && tile.isMainland);
        });

        this.ctx.save();
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.font = `${Math.max(12, 14 / this.zoom)}px sans-serif`;

        for (const label of labels) {
            if (!label || !label.text || !String(label.text).trim()) continue;
            const x = Number(label.x);
            const y = Number(label.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            const px = x * this.tileSize;
            const py = y * this.tileSize;
            const sx = (px - this.camera.x + this.canvas.width / 2) * this.zoom;
            const sy = (py - this.camera.y + this.canvas.height / 2) * this.zoom;
            if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;
            const width = this.ctx.measureText(String(label.text)).width + 18;
            const height = 18;
            this.ctx.fillStyle = BIOME_COLORS.LABEL_BG;
            this.ctx.fillRect(sx - width / 2, sy - height / 2, width, height);
            this.ctx.fillStyle = BIOME_COLORS.LABEL_TEXT;
            this.ctx.fillText(String(label.text), sx, sy + 1);
        }

        this.ctx.restore();
    }

    drawRuins() {
        if (!this.ruins || !this.ruins.length) return;
        this.ctx.save();
        for (const ruin of this.ruins) {
            const cells = Array.isArray(ruin.cells) && ruin.cells.length ? ruin.cells : [{ x: ruin.x, y: ruin.y }];
            const cx = cells.reduce((sum, cell) => sum + Number(cell.x || 0), 0) / cells.length;
            const cy = cells.reduce((sum, cell) => sum + Number(cell.y || 0), 0) / cells.length;
            const minX = Math.min(...cells.map((cell) => Number(cell.x || 0)));
            const maxX = Math.max(...cells.map((cell) => Number(cell.x || 0)));
            const minY = Math.min(...cells.map((cell) => Number(cell.y || 0)));
            const maxY = Math.max(...cells.map((cell) => Number(cell.y || 0)));
            const radiusX = Math.max(10, ((maxX - minX) + 1) * this.tileSize * 0.28);
            const radiusY = Math.max(10, ((maxY - minY) + 1) * this.tileSize * 0.28);
            const seed = Number(ruin.id ?? 0);
            const points = [];
            const pointCount = 9;
            for (let i = 0; i < pointCount; i++) {
                const angle = (i / pointCount) * Math.PI * 2;
                const lowFrequencyWarp = Math.sin(angle * 1.2 + seed * 0.7) * 0.42
                    + Math.cos(angle * 2.0 + seed * 1.4) * 0.28
                    + Math.sin(angle * 3.0 + seed * 0.3) * 0.16;
                const distort = 1 + lowFrequencyWarp;
                const worldX = (cx + 0.5) * this.tileSize + Math.cos(angle) * radiusX * distort;
                const worldY = (cy + 0.5) * this.tileSize + Math.sin(angle) * radiusY * distort;
                const sx = (worldX - this.camera.x + this.canvas.width / 2) * this.zoom;
                const sy = (worldY - this.camera.y + this.canvas.height / 2) * this.zoom;
                points.push({ x: sx, y: sy });
            }
            this.ctx.beginPath();
            points.forEach((point, index) => {
                if (index === 0) this.ctx.moveTo(point.x, point.y);
                else this.ctx.lineTo(point.x, point.y);
            });
            this.ctx.closePath();
            this.ctx.fillStyle = BIOME_COLORS.RUINS;
            this.ctx.fill();
            this.ctx.strokeStyle = '#fff5d1';
            this.ctx.lineWidth = 1.2;
            this.ctx.stroke();
        }
        this.ctx.restore();
    }

    drawPlayer() {
        const px = (this.playerPos.x + 0.5) * this.tileSize;
        const py = (this.playerPos.y + 0.5) * this.tileSize;
        const sx = (px - this.camera.x + this.canvas.width / 2) * this.zoom;
        const sy = (py - this.camera.y + this.canvas.height / 2) * this.zoom;

        this.ctx.save();
        this.ctx.fillStyle = BIOME_COLORS.PLAYER;
        this.ctx.beginPath();
        this.ctx.arc(sx, sy, 6, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        this.ctx.restore();
    }

    render() {
        if (!this.grid.length) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const { left, top, viewW, viewH } = this.getVisibleWindow();
        const startCol = Math.max(0, Math.floor(left / this.tileSize));
        const endCol = Math.min(this.grid[0].length, Math.ceil((left + viewW) / this.tileSize));
        const startRow = Math.max(0, Math.floor(top / this.tileSize));
        const endRow = Math.min(this.grid.length, Math.ceil((top + viewH) / this.tileSize));

        for (let y = startRow; y < endRow; y++) {
            for (let x = startCol; x < endCol; x++) {
                const tile = this.grid[y][x];
                const color = tile && tile.type ? {
                    SEA: BIOME_COLORS.SEA,
                    PLAINS: BIOME_COLORS.PLAINS,
                    FOREST: BIOME_COLORS.FOREST,
                    MOUNTAIN: BIOME_COLORS.MOUNTAIN,
                    SAND: BIOME_COLORS.SAND,
                    LAKE: BIOME_COLORS.LAKE
                }[tile.type] || BIOME_COLORS.PLAINS : BIOME_COLORS.SEA;
                const px = x * this.tileSize;
                const py = y * this.tileSize;
                const sx = (px - this.camera.x + this.canvas.width / 2) * this.zoom;
                const sy = (py - this.camera.y + this.canvas.height / 2) * this.zoom;
                this.ctx.fillStyle = color;
                this.ctx.fillRect(sx, sy, this.tileSize * this.zoom, this.tileSize * this.zoom);
            }
        }

        this.drawTerritoryBorders();
        this.drawGrid();
        this.drawLabels();
        this.drawPlayer();
    }

    attachInteractions() {
        this.canvas.addEventListener('wheel', (event) => {
            event.preventDefault();
            const delta = event.deltaY < 0 ? 1.12 : 0.88;
            const rect = this.canvas.getBoundingClientRect();
            const px = (event.clientX - rect.left) * (this.canvas.width / rect.width);
            const py = (event.clientY - rect.top) * (this.canvas.height / rect.height);

            const prevZoom = this.zoom;
            const nextZoom = Math.min(4, Math.max(0.4, this.zoom * delta));
            const worldX = this.camera.x - this.canvas.width / (2 * prevZoom) + px / prevZoom;
            const worldY = this.camera.y - this.canvas.height / (2 * prevZoom) + py / prevZoom;

            this.zoom = nextZoom;
            this.camera.x = worldX - px / nextZoom + this.canvas.width / (2 * nextZoom);
            this.camera.y = worldY - py / nextZoom + this.canvas.height / (2 * nextZoom);
            this.render();
        }, { passive: false });

        this.canvas.addEventListener('pointerdown', (event) => {
            this.pointerState.dragging = true;
            this.pointerState.startX = event.clientX;
            this.pointerState.startY = event.clientY;
            this.pointerState.camStartX = this.camera.x;
            this.pointerState.camStartY = this.camera.y;
            this.canvas.setPointerCapture(event.pointerId);
        });

        this.canvas.addEventListener('pointermove', (event) => {
            if (!this.pointerState.dragging) return;
            const dx = (event.clientX - this.pointerState.startX) / this.zoom;
            const dy = (event.clientY - this.pointerState.startY) / this.zoom;
            this.camera.x = this.pointerState.camStartX - dx;
            this.camera.y = this.pointerState.camStartY - dy;
            this.render();
        });

        this.canvas.addEventListener('pointerup', () => {
            this.pointerState.dragging = false;
        });
        this.canvas.addEventListener('pointerleave', () => {
            this.pointerState.dragging = false;
        });
    }
}
