/** Canvas rendering, animation, and world-to-screen presentation. */
export class CanvasRenderer {
    constructor(canvasId, state) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.state = state;
        this.layerColors = [
            { fill: '#d4af37', dark: '#7b5c18', stroke: '#ffea9f' },
            { fill: '#b5b8b1', dark: '#5c6260', stroke: '#e6eae3' },
            { fill: '#b87333', dark: '#6d3518', stroke: '#f3b06c' }
        ];
        this.gridCanvas = document.createElement('canvas');
        this.gridKey = '';
        this.sortedGears = [];
        this.sortedGearKey = '';
        this.gearImages = {};
        this.tintedImages = {};
        this.loadGearImages();
        requestAnimationFrame(() => this.loop());
    }

    loadGearImages() {
        const designs = ['industrial', 'alchemical', 'logistics', 'clockwork', 'production'];
        const names = designs.concat('core');
        names.forEach(name => {
            const image = new Image();
            image.onload = () => {
                this.gearImages[name] = image;
                this.tintedImages = {};
            };
            image.src = `assets/gear-${name}.png`;
        });
    }

    loop() {
        this.state.tick();
        this.render();
        requestAnimationFrame(() => this.loop());
    }

    worldPoint(clientX, clientY) {
        const point = this.canvasPoint(clientX, clientY);
        return {
            x: (point.x - this.canvas.width / 2) / this.state.zoomScale - this.state.offsetX,
            y: (point.y - this.canvas.height / 2) / this.state.zoomScale - this.state.offsetY
        };
    }

    canvasPoint(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (clientX - rect.left) * this.canvas.width / rect.width,
            y: (clientY - rect.top) * this.canvas.height / rect.height
        };
    }

    render() {
        const { width, height } = this.canvas;
        this.ctx.clearRect(0, 0, width, height);
        this.ctx.fillStyle = '#120e0c';
        this.ctx.fillRect(0, 0, width, height);
        this.ctx.save();
        this.ctx.translate(width / 2, height / 2);
        this.ctx.scale(this.state.zoomScale, this.state.zoomScale);
        this.ctx.translate(this.state.offsetX, this.state.offsetY);
        const sortedKey = this.state.placedGears.map(gear => `${gear.id}:${gear.layer}`).join('|');
        if (sortedKey !== this.sortedGearKey) {
            this.sortedGears = [...this.state.placedGears].sort((a, b) => a.layer - b.layer);
            this.sortedGearKey = sortedKey;
        }
        this.sortedGears.forEach(gear => this.drawGear(gear));
        if (this.state.showLoops) this.drawLoops();
        if (this.state.ghostGear && this.state.selectedSize) this.drawGear(this.state.ghostGear, true);
        if (this.state.ghostGear) this.drawGhostConnections(this.state.ghostGear);
        this.ctx.restore();
    }

    drawLoops() {
        const loopIds = this.state.network?.loopGearIds || new Set();
        if (loopIds.size < 2) return;
        const drawn = new Set();
        this.ctx.save();
        this.ctx.lineWidth = 4 / this.state.zoomScale;
        this.ctx.strokeStyle = 'rgba(116, 240, 194, 0.92)';
        this.ctx.shadowColor = '#62c2aa';
        this.ctx.shadowBlur = 10 / this.state.zoomScale;
        for (const id of loopIds) {
            const gear = this.state.placedGears.find(item => item.id === id);
            if (!gear) continue;
            for (const otherId of this.state.network.connections.get(id) || []) {
                if (!loopIds.has(otherId)) continue;
                const edge = [id, otherId].sort().join(':');
                if (drawn.has(edge)) continue;
                drawn.add(edge);
                const other = this.state.placedGears.find(item => item.id === otherId);
                if (!other) continue;
                this.ctx.beginPath();
                this.ctx.moveTo(gear.x, gear.y);
                this.ctx.lineTo(other.x, other.y);
                this.ctx.stroke();
            }
        }
        this.ctx.shadowBlur = 0;
        this.ctx.setLineDash([6 / this.state.zoomScale, 4 / this.state.zoomScale]);
        this.ctx.lineWidth = 3 / this.state.zoomScale;
        for (const id of loopIds) {
            const gear = this.state.placedGears.find(item => item.id === id);
            if (!gear) continue;
            this.ctx.beginPath();
            this.ctx.arc(gear.x, gear.y, gear.radius + 7 / this.state.zoomScale, 0, Math.PI * 2);
            this.ctx.stroke();
        }
        this.ctx.restore();
    }

    drawGhostConnections(ghost) {
        const connected = new Set(ghost.connectionIds || []);
        const blocked = new Set(ghost.blockedIds || []);
        const count = connected.size;
        const outlineColor = count >= 2 ? '#74f0c2' : count === 1 ? '#f2c96d' : '#e88b7d';
        this.ctx.save();
        this.ctx.translate(ghost.x, ghost.y);
        this.ctx.strokeStyle = outlineColor;
        this.ctx.lineWidth = 4 / this.state.zoomScale;
        this.ctx.setLineDash([9 / this.state.zoomScale, 5 / this.state.zoomScale]);
        this.ctx.globalAlpha = 0.98;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, ghost.radius + 7 / this.state.zoomScale, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.restore();
        if (!count) return;
        this.state.placedGears.forEach(gear => {
            if (!connected.has(gear.id) && !blocked.has(gear.id)) return;
            this.ctx.save();
            this.ctx.translate(gear.x, gear.y);
            this.ctx.strokeStyle = blocked.has(gear.id) ? '#ff4d4d' : outlineColor;
            this.ctx.lineWidth = 3 / this.state.zoomScale;
            this.ctx.setLineDash([7 / this.state.zoomScale, 4 / this.state.zoomScale]);
            this.ctx.globalAlpha = 0.95;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, gear.radius + 8 / this.state.zoomScale, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.restore();
        });
    }

    drawHexGrid() {
        const { width, height } = this.canvas;
        const gearKey = this.state.placedGears.map(gear => `${gear.q},${gear.r}`).join('|');
        const key = `${width}x${height}:${this.state.zoomScale}:${this.state.offsetX}:${this.state.offsetY}:${gearKey}`;
        if (key === this.gridKey) {
            this.ctx.drawImage(this.gridCanvas, 0, 0);
            return;
        }

        this.gridCanvas.width = width;
        this.gridCanvas.height = height;
        const gridContext = this.gridCanvas.getContext('2d');
        gridContext.clearRect(0, 0, width, height);
        gridContext.strokeStyle = 'rgba(139, 115, 85, 0.16)';
        gridContext.fillStyle = 'rgba(212, 175, 55, 0.04)';
        gridContext.lineWidth = 0.6;

        const worldWidth = width / this.state.zoomScale;
        const worldHeight = height / this.state.zoomScale;
        const gridStep = this.state.zoomScale < 0.6 ? 2 : 1;
        const qRange = Math.ceil(Math.max(worldWidth / (2 * Math.sqrt(3)), worldHeight / 3)) + 4;
        const activeAxes = new Set(this.state.placedGears.map(gear => `${gear.q},${gear.r}`));
        for (let q = -qRange; q <= qRange; q += gridStep) {
            for (let r = -qRange; r <= qRange; r += gridStep) {
                if (Math.abs(q + r) > qRange) continue;
                const center = this.hexToPixel(q, r);
                const screenX = width / 2 + (center.x + this.state.offsetX) * this.state.zoomScale;
                const screenY = height / 2 + (center.y + this.state.offsetY) * this.state.zoomScale;
                const radius = 2 * Math.sqrt(3) * 0.95 * this.state.zoomScale;
                if (screenX + radius < 0 || screenX - radius > width || screenY + radius < 0 || screenY - radius > height) continue;
                gridContext.beginPath();
                for (let i = 0; i < 6; i++) {
                    const angle = i * Math.PI / 3 + Math.PI / 6;
                    const x = screenX + radius * Math.cos(angle);
                    const y = screenY + radius * Math.sin(angle);
                    if (i === 0) gridContext.moveTo(x, y); else gridContext.lineTo(x, y);
                }
                gridContext.closePath();
                if (activeAxes.has(`${q},${r}`)) gridContext.fill();
                gridContext.stroke();
            }
        }
        this.gridKey = key;
        this.ctx.drawImage(this.gridCanvas, 0, 0);
    }

    hexToPixel(q, r) {
        return { x: 2 * Math.sqrt(3) * (q + r / 2), y: 3 * r };
    }

    metalGradient(radius, palette, isCore) {
        const gradient = this.ctx.createRadialGradient(-radius * 0.35, -radius * 0.4, radius * 0.08, 0, 0, radius * 1.15);
        gradient.addColorStop(0, isCore ? '#fff4a8' : palette.stroke);
        gradient.addColorStop(0.28, palette.fill);
        gradient.addColorStop(0.72, palette.fill);
        gradient.addColorStop(1, palette.dark);
        return gradient;
    }

    getTintedImage(name, color) {
        const key = `${name}:${color}`;
        if (this.tintedImages[key]) return this.tintedImages[key];
        const source = this.gearImages[name];
        if (!source) return null;
        const canvas = document.createElement('canvas');
        canvas.width = source.naturalWidth || source.width;
        canvas.height = source.naturalHeight || source.height;
        const context = canvas.getContext('2d');
        context.drawImage(source, 0, 0);
        context.globalCompositeOperation = 'source-in';
        context.fillStyle = color;
        context.fillRect(0, 0, canvas.width, canvas.height);
        this.tintedImages[key] = canvas;
        return canvas;
    }

    drawGearImage(name, radius, color, alpha) {
        const image = this.getTintedImage(name, color);
        if (!image) return false;
        this.ctx.globalAlpha = alpha;
        const toothLength = Math.max(6, Math.min(10, radius * 0.1));
        const bodyRadius = radius - toothLength;
        const imageRadius = bodyRadius * (160 / 142);
        this.ctx.drawImage(image, -imageRadius, -imageRadius, imageRadius * 2, imageRadius * 2);
        this.ctx.globalAlpha = 1;
        return true;
    }

    drawTeeth(gear, radius, color, isGhost) {
        const toothLength = Math.max(6, Math.min(10, radius * 0.1));
        const bodyRadius = radius - toothLength;
        const toothWidth = Math.max(3, Math.min(12, (Math.PI * 2 * radius / gear.teeth) * 0.48));
        const toothStart = bodyRadius - Math.max(5, toothLength * 0.55);
        const toothDepth = toothLength + Math.max(5, toothLength * 0.55);
        this.ctx.fillStyle = color;
        this.ctx.strokeStyle = isGhost ? 'rgba(255,255,255,0.7)' : color;
        this.ctx.lineWidth = isGhost ? 1 : Math.max(1, toothWidth * 0.12);
        for (let i = 0; i < gear.teeth; i++) {
            this.ctx.save();
            this.ctx.rotate(i * Math.PI * 2 / gear.teeth);
            this.ctx.fillRect(toothStart, -toothWidth / 2, toothDepth, toothWidth);
            this.ctx.strokeRect(toothStart, -toothWidth / 2, toothDepth, toothWidth);
            this.ctx.restore();
        }
    }

    drawGear(gear, isGhost = false) {
        const ctx = this.ctx;
        const radius = gear.radius;
        const palette = this.layerColors[gear.layer % 3];
        let fill = palette.fill;
        let stroke = palette.stroke;
        if (isGhost) {
            fill = gear.valid ? '#858b8f' : 'rgba(170, 58, 58, 0.7)';
            stroke = gear.valid ? palette.stroke : 'rgba(255, 100, 100, 1.0)';
        } else if (gear.isDeadlocked) {
            fill = '#8b0000';
            stroke = '#ff4d4d';
        } else if (gear.isCore) {
            fill = '#f5c942';
            stroke = '#fff3b0';
        } else if (!gear.powered) {
            fill = '#3d322c';
            stroke = '#201a17';
        }
        ctx.save();
        ctx.translate(gear.x, gear.y);
        if (gear.isCore && !isGhost) { ctx.shadowColor = '#ffe066'; ctx.shadowBlur = 20; }
        ctx.rotate(gear.angle);
        const assetName = gear.isCore ? 'core' : String(gear.designType || 'INDUSTRIAL').toLowerCase();
        const assetColor = isGhost
            ? gear.valid ? '#858b8f' : '#d85c4a'
            : gear.isDeadlocked
                ? '#b52a2a'
            : gear.isCore
                ? '#f5c942'
                : gear.powered && !gear.isDeadlocked
                    ? palette.fill
                    : '#2f231e';
        if (this.drawGearImage(assetName, radius, assetColor, isGhost ? 0.72 : 1)) {
            this.drawTeeth(gear, radius, assetColor, isGhost);
            this.drawProcessIndicator(gear, radius, isGhost);
            ctx.shadowBlur = 0;
            ctx.restore();
            if (!isGhost && gear.layer > 0) {
                ctx.fillStyle = '#f0c674'; ctx.font = 'bold 10px sans-serif';
                ctx.fillText(`L${gear.layer + 1}`, gear.x - 10, gear.y - radius + 10);
            }
            return;
        }
        ctx.fillStyle = isGhost ? fill : this.metalGradient(radius, palette, gear.isCore);
        ctx.strokeStyle = stroke;
        ctx.lineWidth = isGhost ? 2.5 : gear.isCore ? 3 : 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, radius - 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = isGhost ? 'rgba(20,15,10,0.18)' : '#17120f';
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.78, 0, Math.PI * 2);
        ctx.fill();
        const toothWidth = radius > 100 ? 5 : radius > 60 ? 6 : 7;
        const toothHeight = radius > 100 ? 7 : radius > 60 ? 8 : 6;
        for (let i = 0; i < gear.teeth; i++) {
            ctx.save();
            ctx.rotate(i * Math.PI * 2 / gear.teeth);
            ctx.beginPath();
            ctx.rect(radius - 3 - toothHeight / 2, -toothWidth / 2, toothHeight, toothWidth);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
        ctx.strokeStyle = isGhost ? stroke : palette.dark;
        ctx.lineWidth = isGhost ? 1 : Math.max(1.2, radius * 0.025);
        ctx.beginPath();
        ctx.arc(0, 0, radius - 6, 0, Math.PI * 2);
        ctx.stroke();
        if (gear.isCore && !isGhost) {
            this.drawCoreDetails(radius);
        } else {
            this.drawPattern(radius, gear.pattern, isGhost, gear.sizeKey);
        }
        ctx.shadowBlur = 0;
        ctx.fillStyle = isGhost ? 'rgba(255,255,255,0.7)' : '#d1c7bd';
        if (gear.isCore && !isGhost) {
            ctx.fillStyle = '#9e2a2b';
            ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(-3, -3, 3, 0, Math.PI * 2); ctx.fill();
        } else {
            ctx.beginPath(); ctx.arc(0, 0, radius < 20 ? 2.5 : 4.5, 0, Math.PI * 2); ctx.fill();
        }
        this.drawProcessIndicator(gear, radius, isGhost);
        ctx.restore();
        if (!isGhost && gear.layer > 0) {
            ctx.fillStyle = '#f0c674'; ctx.font = 'bold 10px sans-serif';
            ctx.fillText(`L${gear.layer + 1}`, gear.x - 10, gear.y - radius + 10);
        }
    }

    drawProcessIndicator(gear, radius, isGhost) {
        if (isGhost || gear.processMode === 'NONE' || gear.processMode === 'POWER' || gear.isCore) return;
        const color = gear.processMode === 'FOG_COLLECTION' ? '#8eeaff' : '#78b9ff';
        this.ctx.save();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = Math.max(2, radius * 0.025);
        this.ctx.globalAlpha = gear.powered && !gear.isDeadlocked ? 0.95 : 0.5;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius - Math.max(8, radius * 0.12), -Math.PI * 0.78, -Math.PI * 0.2);
        this.ctx.stroke();
        this.ctx.restore();
    }

    drawCoreDetails(radius) {
        const ctx = this.ctx;
        ctx.strokeStyle = '#d2a43b';
        ctx.lineWidth = Math.max(1.5, radius * 0.018);
        [0.78, 0.56, 0.3].forEach(scale => {
            ctx.beginPath();
            ctx.arc(0, 0, radius * scale, 0, Math.PI * 2);
            ctx.stroke();
        });
        for (let i = 0; i < 8; i++) {
            ctx.save();
            ctx.rotate(i * Math.PI / 4);
            ctx.strokeStyle = '#d2a43b';
            ctx.lineWidth = Math.max(2, radius * 0.035);
            ctx.beginPath();
            ctx.moveTo(0, -radius * 0.29);
            ctx.lineTo(0, -radius * 0.7);
            ctx.stroke();
            ctx.restore();
        }
        this.drawBoltRing(radius, 8, 0.62, false);
    }

    drawPattern(radius, pattern, isGhost, sizeKey) {
        const ctx = this.ctx;
        const dark = isGhost ? 'rgba(0,0,0,0.18)' : '#1a1614';
        ctx.fillStyle = dark;
        ctx.strokeStyle = isGhost ? 'rgba(255,255,255,0.55)' : '#332922';
        ctx.lineWidth = isGhost ? 1.5 : Math.max(1, radius * 0.022);
        if (pattern === 'ring') {
            this.drawRing(radius * 0.48, isGhost);
            this.drawSpokeLines(radius, 4, 0.16, 0.72, isGhost);
            this.drawBoltRing(radius, 4, 0.68, isGhost);
            return;
        }
        if (pattern === 'sunburst') {
            this.drawSpokeLines(radius, 6, 0.18, 0.7, isGhost);
            this.drawRing(radius * 0.3, isGhost);
            return;
        }
        if (pattern === 'holes') {
            for (let i = 0; i < 8; i++) {
                const angle = i * Math.PI / 4;
                this.drawHole(radius * 0.53 * Math.cos(angle), radius * 0.53 * Math.sin(angle), radius * 0.14, isGhost);
            }
            this.drawSpokeLines(radius, 4, 0.18, 0.42, isGhost);
            this.drawRing(radius * 0.26, isGhost);
            return;
        }
        if (pattern === 'triangular') {
            this.drawSpokeLines(radius, 4, 0.18, 0.72, isGhost);
            this.drawBoltRing(radius, 4, 0.5, isGhost);
            return;
        }
        if (pattern === 'cross') {
            this.drawSpokeLines(radius, 5, 0.18, 0.76, isGhost);
            this.drawBoltRing(radius, 5, 0.56, isGhost);
            return;
        }
        if (pattern === 'wave') {
            for (let i = 0; i < 6; i++) {
                ctx.save();
                ctx.rotate(i * Math.PI / 3);
                ctx.beginPath();
                ctx.moveTo(-radius * 0.1, -radius * 0.25);
                ctx.quadraticCurveTo(radius * 0.28, -radius * 0.5, radius * 0.66, -radius * 0.17);
                ctx.quadraticCurveTo(radius * 0.42, radius * 0.03, radius * 0.18, radius * 0.27);
                ctx.quadraticCurveTo(radius * 0.02, radius * 0.05, -radius * 0.1, -radius * 0.25);
                ctx.strokeStyle = isGhost ? 'rgba(255,255,255,0.55)' : '#5e4217';
                ctx.lineWidth = Math.max(1.5, radius * 0.028);
                ctx.stroke();
                ctx.restore();
            }
            this.drawRing(radius * 0.32, isGhost);
            this.drawBoltRing(radius, 6, 0.58, isGhost);
            return;
        }
        if (pattern === 'crown') {
            this.drawSpokeLines(radius, 6, 0.18, 0.8, isGhost);
            this.drawRing(radius * 0.48, isGhost);
            this.drawBoltRing(radius, 6, 0.61, isGhost);
            return;
        }
        if (pattern === 'lattice') {
            this.drawSpokeLines(radius, 8, 0.18, 0.84, isGhost);
            for (let i = 0; i < 8; i++) {
                const angle = i * Math.PI / 4 + Math.PI / 8;
                this.drawHole(radius * 0.54 * Math.cos(angle), radius * 0.54 * Math.sin(angle), radius * 0.08, isGhost);
            }
            return;
        }
        if (pattern === 'radial') {
            for (let i = 0; i < 12; i++) {
                const angle = i * Math.PI / 6;
                ctx.save();
                ctx.rotate(angle);
                ctx.fillStyle = dark;
                ctx.fillRect(-radius * 0.035, -radius * 0.72, radius * 0.07, radius * 0.48);
                ctx.restore();
            }
            this.drawRing(radius * 0.33, isGhost);
            this.drawBoltRing(radius, 12, 0.62, isGhost);
            return;
        }
        if (pattern === 'industrial') {
            this.drawSpokeLines(radius, 6, 0.18, 0.88, isGhost, true);
            this.drawRing(radius * 0.52, isGhost);
            this.drawBoltRing(radius, 10, 0.67, isGhost);
            return;
        }
        if (pattern === 'solid') return;
        const spokePattern = (count, outer, inner, gap) => {
            for (let i = 0; i < count; i++) {
                const start = i * Math.PI * 2 / count + gap;
                const end = (i + 1) * Math.PI * 2 / count - gap;
                ctx.beginPath();
                ctx.arc(0, 0, radius * outer, start, end);
                ctx.arc(0, 0, radius * inner, end, start, true);
                ctx.fill();
                if (!isGhost) ctx.stroke();
            }
        };
        if (pattern === 'cross_holes') {
            for (let i = 0; i < 4; i++) {
                const angle = i * Math.PI / 2;
                ctx.beginPath();
                ctx.arc(radius * 0.42 * Math.cos(angle), radius * 0.42 * Math.sin(angle), radius * 0.22, 0, Math.PI * 2);
                ctx.fill();
                if (!isGhost) ctx.stroke();
            }
        } else if (pattern === 'tri_spoke') spokePattern(3, 0.65, 0.28, 0.15);
        else if (pattern === 'quad_spoke') {
            spokePattern(4, 0.72, 0.24, 0.1);
            this.drawBoltRing(radius, 4, 0.52, isGhost);
        } else if (pattern === 'penta_spoke') {
            spokePattern(5, 0.74, 0.25, 0.08);
            this.drawBoltRing(radius, 5, 0.57, isGhost);
        }
        else if (pattern === 'hexa_holes') {
            for (let i = 0; i < 6; i++) {
                const angle = i * Math.PI / 3;
                ctx.beginPath();
                ctx.arc(radius * 0.52 * Math.cos(angle), radius * 0.52 * Math.sin(angle), radius * 0.18, 0, Math.PI * 2);
                ctx.fill();
                if (!isGhost) ctx.stroke();
            }
            ctx.beginPath(); ctx.arc(0, 0, radius * 0.3, 0, Math.PI * 2);
            if (!isGhost) ctx.stroke();
        } else if (pattern === 'spiral') {
            for (let i = 0; i < 6; i++) {
                const start = i * Math.PI / 3;
                ctx.beginPath();
                ctx.arc(0, 0, radius * 0.75, start, start + 0.8);
                ctx.arc(0, 0, radius * 0.35, start + 0.8, start, true);
                ctx.fill();
                if (!isGhost) ctx.stroke();
            }
        } else if (pattern === 'heavy_spoke') {
            spokePattern(8, 0.82, 0.28, 0.045);
            this.drawBoltRing(radius, 8, 0.58, isGhost);
        }
        else if (pattern === 'wheel') {
            spokePattern(10, 0.86, 0.32, 0.04);
            this.drawBoltRing(radius, 10, 0.63, isGhost);
            ctx.beginPath(); ctx.arc(0, 0, radius * 0.46, 0, Math.PI * 2);
            if (!isGhost) ctx.stroke();
        }
        if (sizeKey === 'XXS') this.drawBoltRing(radius, 4, 0.45, isGhost);
    }

    drawBoltRing(radius, count, scale, isGhost) {
        const ctx = this.ctx;
        for (let i = 0; i < count; i++) {
            const angle = i * Math.PI * 2 / count + Math.PI / count;
            ctx.fillStyle = isGhost ? 'rgba(255,255,255,0.55)' : '#c89d3a';
            ctx.beginPath();
            ctx.arc(radius * scale * Math.cos(angle), radius * scale * Math.sin(angle), Math.max(1.5, radius * 0.035), 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = isGhost ? 'rgba(255,255,255,0.65)' : '#5f4214';
            ctx.stroke();
        }
    }

    drawRing(radius, isGhost) {
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.strokeStyle = isGhost ? 'rgba(255,255,255,0.65)' : '#6e4b16';
        ctx.lineWidth = Math.max(1, radius * 0.08);
        ctx.stroke();
    }

    drawSpokeLines(radius, count, inner, outer, isGhost, heavy = false) {
        const ctx = this.ctx;
        ctx.strokeStyle = isGhost ? 'rgba(255,255,255,0.6)' : '#c19332';
        ctx.lineWidth = Math.max(1.5, radius * (heavy ? 0.055 : 0.03));
        for (let i = 0; i < count; i++) {
            const angle = i * Math.PI * 2 / count;
            ctx.beginPath();
            ctx.moveTo(radius * inner * Math.cos(angle), radius * inner * Math.sin(angle));
            ctx.lineTo(radius * outer * Math.cos(angle), radius * outer * Math.sin(angle));
            ctx.stroke();
        }
    }

    drawHole(x, y, radius, isGhost) {
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isGhost ? 'rgba(0,0,0,0.2)' : '#1a1614';
        ctx.fill();
        ctx.strokeStyle = isGhost ? 'rgba(255,255,255,0.6)' : '#4f3615';
        ctx.lineWidth = Math.max(1, radius * 0.18);
        ctx.stroke();
    }

    drawWedgeSpokes(radius, count, gap, outer, inner, isGhost, chunky = false) {
        const ctx = this.ctx;
        for (let i = 0; i < count; i++) {
            const start = i * Math.PI * 2 / count + gap;
            const end = (i + 1) * Math.PI * 2 / count - gap;
            ctx.beginPath();
            ctx.arc(0, 0, radius * outer, start, end);
            ctx.arc(0, 0, radius * inner, end, start, true);
            ctx.fillStyle = isGhost ? 'rgba(0,0,0,0.15)' : chunky ? '#251a0d' : '#1a1614';
            ctx.fill();
            ctx.strokeStyle = isGhost ? 'rgba(255,255,255,0.55)' : '#5e4217';
            ctx.lineWidth = Math.max(1, radius * 0.02);
            ctx.stroke();
        }
    }
}
