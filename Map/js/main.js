// js/main.js - Steampunk Explorer Game Logic
import { MapGenerator, BIOME_COLORS, saveMapSnapshot } from './mapGenerator.js?v=4';
import { SkinRenderer } from './skinRenderer.js?v=2';
import { CELL_DEFINITIONS, canEnterCell, getCellEntryRule, getMosaicColor } from './cellRules.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const state = {
    player: {
        x: 500,
        y: 500,
        hp: 100,
        steam: 100,
        size: 28
    },
    camera: { x: 0, y: 0 },
    zoom: 0.8,
    minZoom: 0.5,
    maxZoom: 2.5,
    map: [],
    territories: [],
    labels: [],
    rivers: [],
    ruins: [],
    routes: [],
    tileSize: 32,
    cols: 1000,
    rows: 1000,
    worldSeed: 'SteampunkIsland_01',
    generator: new MapGenerator(1000, 1000),
    skin: new SkinRenderer(),
    inventoryItems: new Set(),
    cellEntryRules: { types: {}, cells: {} }
};

const activePointers = new Map();
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let cameraStart = { x: 0, y: 0 };
let initialPinchDist = null;
let initialZoom = 1.0;
let selectedSavedScrollId = null;

function getStoredSavedScrolls() {
    try {
        const saved = JSON.parse(localStorage.getItem('fogsgear_scroll_library') || '[]');
        return Array.isArray(saved) ? saved : [];
    } catch (error) {
        return [];
    }
}

function applySavedScrollEffect(scroll) {
    const effect = scroll?.effect || { type: 'custom', label: '未設定', config: {} };
    const history = (() => {
        try {
            return JSON.parse(localStorage.getItem('fogsgear_scroll_effect_log') || '[]');
        } catch (error) {
            return [];
        }
    })();
    const entry = { id: scroll?.id || 'scroll', name: scroll?.name || '未設定', type: effect.type || 'custom', label: effect.label || '未設定', config: effect.config || {}, usedAt: Date.now() };
    history.unshift(entry);
    localStorage.setItem('fogsgear_scroll_effect_log', JSON.stringify(history.slice(0, 20)));

    let message = 'この効果はまだ未設定です。今後、効果の設定値を追加できます。';
    if (effect.type === 'steam_boost') {
        const boost = Number(effect.config?.boost || 20);
        message = `スチーム増幅効果を発動: +${boost}`;
    } else if (effect.type === 'fog_stabilize') {
        message = '霧の均一化効果を発動しました。';
    } else if (effect.type === 'gear_sync') {
        message = 'ギア同期効果を発動しました。';
    }
    window.alert(`${scroll?.name || 'スクロール'} を使用しました。\n${message}`);
}

function renderSavedScrolls() {
    const list = document.getElementById('saved-scroll-list');
    if (!list) return;
    const scrolls = getStoredSavedScrolls();
    list.innerHTML = '';
    if (scrolls.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'saved-scroll-empty';
        empty.textContent = '保存済みのスクロールはありません';
        list.appendChild(empty);
        return;
    }
    scrolls.forEach((scroll) => {
        const item = document.createElement('div');
        item.className = `saved-scroll-item${selectedSavedScrollId === scroll.id ? ' is-selected' : ''}`;

        const nameButton = document.createElement('button');
        nameButton.type = 'button';
        nameButton.className = 'saved-scroll-name';
        nameButton.textContent = scroll.name;
        nameButton.dataset.action = 'select-scroll';
        nameButton.dataset.scrollId = scroll.id;

        const useButton = document.createElement('button');
        useButton.type = 'button';
        useButton.className = 'saved-scroll-use';
        useButton.textContent = '使用';
        useButton.dataset.action = 'use-scroll';
        useButton.dataset.scrollId = scroll.id;
        useButton.hidden = selectedSavedScrollId !== scroll.id;

        item.appendChild(nameButton);
        item.appendChild(useButton);
        list.appendChild(item);
    });
}

function renderCellLegend() {
    const legend = document.getElementById('cell-legend');
    if (!legend) return;
    legend.innerHTML = '';
    Object.entries(CELL_DEFINITIONS).forEach(([typeKey, definition]) => {
        const item = document.createElement('div');
        item.className = 'cell-legend-item';
        item.title = getCellEntryRule({ type: typeKey }, state.cellEntryRules).requiredItems.length
            ? '侵入に必要なアイテムがあります'
            : '侵入条件なし';
        const color = document.createElement('span');
        color.className = 'cell-legend-color';
        color.style.backgroundColor = definition.color;
        const label = document.createElement('span');
        label.textContent = definition.label;
        item.append(color, label);
        legend.appendChild(item);
    });
}

function loadCellEntryRules() {
    try {
        const stored = JSON.parse(localStorage.getItem('fogsgear_cell_entry_rules') || '{}');
        return {
            types: stored.types && typeof stored.types === 'object' ? stored.types : {},
            cells: stored.cells && typeof stored.cells === 'object' ? stored.cells : {}
        };
    } catch (error) {
        return { types: {}, cells: {} };
    }
}

function buildLabelEntries() {
    const labels = [];
    const seen = new Set();

    for (const territory of state.territories) {
        if (!territory || !territory.name || !territory.labelPos) continue;
        const x = Number(territory.labelPos.x);
        const y = Number(territory.labelPos.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const tile = state.map?.[Math.floor(y)]?.[Math.floor(x)];
        if (!tile || !tile.isLand || tile.isSea || tile.isLake || !tile.isMainland) continue;
        const key = `territory:${territory.id}:${territory.name}`;
        if (!seen.has(key)) {
            seen.add(key);
            labels.push({ x, y, text: territory.name, kind: 'territory', color: '#ffffff' });
        }
    }

    return labels;
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
        reader.readAsDataURL(file);
    });
}

function getSkinNameFromSource(source) {
    if (source.startsWith('data:')) return 'ローカル画像';
    const sourcePath = source.split(/[?#]/)[0];
    const fileName = sourcePath.substring(sourcePath.lastIndexOf('/') + 1);
    return fileName || '既定スキン';
}

function updateSkinName(name) {
    const skinName = document.getElementById('skinName');
    if (skinName) skinName.textContent = `選択中: ${name || '未選択'}`;
}

async function loadAndApplySkin(url, name = '') {
    if (!url) {
        state.skin.isLoaded = false;
        return;
    }
    await state.skin.loadSkin(url);
    try {
        localStorage.setItem('steampunk_explorer_skin_url', url);
        localStorage.setItem('steampunk_explorer_skin_name', name || getSkinNameFromSource(url));
    } catch(e) {}
    updateSkinName(name || getSkinNameFromSource(url));
}

async function applySelectedSkinSource(source, sourceType = 'url', name = '') {
    const value = typeof source === 'string' ? source.trim() : '';
    if (!value) return;
    const skinInput = document.getElementById('skinUrl');
    if (skinInput) skinInput.value = value;
    const skinName = name || getSkinNameFromSource(value);
    await loadAndApplySkin(value, skinName);
    try {
        localStorage.setItem('steampunk_explorer_skin_source', sourceType);
        localStorage.setItem('steampunk_explorer_skin_name', skinName);
    } catch (error) {
    }
    updateSkinName(skinName);
}

async function init() {
    let settings = { seed: 'SteampunkIsland_01', zoom: 0.8, minZoom: 0.25 };
    try {
        settings = { ...settings, ...JSON.parse(localStorage.getItem('steampunk_explorer_settings') || '{}') };
    } catch (error) {}
    state.minZoom = Number(settings.minZoom);
    state.cellEntryRules = loadCellEntryRules();
    state.zoom = Math.max(state.minZoom, Number(settings.zoom));
    state.worldSeed = String(settings.seed || 'SteampunkIsland_01');
    const generated = state.generator.generate(state.worldSeed);
    state.map = generated.grid;
    state.territories = generated.territories || [];
    state.rivers = generated.rivers || [];
    state.ruins = generated.ruins || [];
    state.routes = generated.routes || [];
    state.labels = buildLabelEntries();
    saveMapSnapshot(generated, state.worldSeed).catch(() => {});

    findSafeSpawn();

    let savedSkin = './5504543579.png';
    let savedSkinName = '5504543579.png';
    try {
        const stored = localStorage.getItem('steampunk_explorer_skin_url');
        if (stored && stored !== 'https://mineskin.org/download/639735497') savedSkin = stored;
        const storedName = localStorage.getItem('steampunk_explorer_skin_name');
        if (storedName && savedSkin !== './5504543579.png') savedSkinName = storedName;
    } catch(e) {}

    try {
        await loadAndApplySkin(savedSkin, savedSkinName);
    } catch(e) {
        console.warn('Skin load failed, using fallback');
    }

    resize();
    centerCameraOnPlayer();
    updateUI();
    setupControls();
    renderSavedScrolls();
    renderCellLegend();
    gameLoop();
}

function findSafeSpawn() {
    let savedPlayer = null;
    try {
        savedPlayer = JSON.parse(localStorage.getItem('steampunk_explorer_player_pos'));
    } catch(e) {}

    const hasSavedPosition = savedPlayer && savedPlayer.seed === state.worldSeed && typeof savedPlayer.x === 'number' && typeof savedPlayer.y === 'number';
    if (hasSavedPosition) {
        const tx = savedPlayer.x;
        const ty = savedPlayer.y;
        if (tx >= 0 && tx < state.cols && ty >= 0 && ty < state.rows) {
            const tile = state.map[ty][tx];
            if (tile && tile.isIsland && !tile.isOcean && !tile.isLake) {
                state.player.x = tx;
                state.player.y = ty;
                savePlayerPos();
                return;
            }
        }
    }

    const islandCenterX = Math.floor(state.cols * 0.83);
    const islandCenterY = Math.floor(state.rows * 0.58);
    let best = null;
    let bestScore = -Infinity;

    for (let y = 1; y < state.rows - 1; y++) {
        for (let x = 1; x < state.cols - 1; x++) {
            const tile = state.map[y][x];
            if (!tile || tile.isOcean || tile.isLake || !tile.isIsland) continue;
            if (tile.height < 0.25 || tile.height > 0.75) continue;
            const dist = Math.hypot(x - islandCenterX, y - islandCenterY);
            const score = (1 / (dist + 1)) + tile.height;
            if (score > bestScore) {
                bestScore = score;
                best = { x, y };
            }
        }
    }

    if (best) {
        state.player.x = best.x;
        state.player.y = best.y;
    } else {
        for (let radius = 0; radius < Math.max(state.cols, state.rows); radius++) {
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    const x = islandCenterX + dx;
                    const y = islandCenterY + dy;
                    if (x >= 0 && x < state.cols && y >= 0 && y < state.rows) {
                        const tile = state.map[y][x];
                        if (tile && !tile.isOcean && !tile.isLake && tile.isIsland) {
                            state.player.x = x;
                            state.player.y = y;
                            dx = radius + 999;
                            dy = radius + 999;
                            break;
                        }
                    }
                }
            }
        }
    }

    savePlayerPos();
}

function savePlayerPos() {
    try {
        localStorage.setItem('steampunk_explorer_player_pos', JSON.stringify({
            seed: state.worldSeed,
            x: state.player.x,
            y: state.player.y
        }));
    } catch(e) {}
}

function resize() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth || 640;
    canvas.height = 480;
}

function centerCameraOnPlayer() {
    state.camera.x = (state.player.x + 0.5) * state.tileSize;
    state.camera.y = (state.player.y + 0.5) * state.tileSize;
}

function gameLoop() {
    scheduleDraw();
}

let drawQueued = false;

function scheduleDraw() {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(() => {
        drawQueued = false;
        draw();
    });
}

function drawGridOverlay(startCol, endCol, startRow, endRow) {
    if (state.zoom < 0.5) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(24, 65, 43, 0.38)';
    ctx.lineWidth = 1 / state.zoom;
    const gridStartCol = Math.max(0, startCol - 1);
    const gridEndCol = Math.min(state.cols, endCol + 1);
    const gridStartRow = Math.max(0, startRow - 1);
    const gridEndRow = Math.min(state.rows, endRow + 1);
    for (let y = gridStartRow; y <= gridEndRow; y++) {
        const py = y * state.tileSize;
        ctx.beginPath();
        ctx.moveTo(gridStartCol * state.tileSize, py);
        ctx.lineTo(gridEndCol * state.tileSize, py);
        ctx.stroke();
    }
    for (let x = gridStartCol; x <= gridEndCol; x++) {
        const px = x * state.tileSize;
        ctx.beginPath();
        ctx.moveTo(px, gridStartRow * state.tileSize);
        ctx.lineTo(px, gridEndRow * state.tileSize);
        ctx.stroke();
    }
    ctx.restore();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const viewW = canvas.width / state.zoom;
    const viewH = canvas.height / state.zoom;
    const left = state.camera.x - viewW / 2;
    const top = state.camera.y - viewH / 2;

    ctx.save();
    ctx.scale(state.zoom, state.zoom);
    ctx.translate(-left, -top);

    const startCol = Math.max(0, Math.floor(left / state.tileSize));
    const endCol = Math.min(state.cols, Math.ceil((left + viewW) / state.tileSize));
    const startRow = Math.max(0, Math.floor(top / state.tileSize));
    const endRow = Math.min(state.rows, Math.ceil((top + viewH) / state.tileSize));

    for (let y = startRow; y < endRow; y++) {
        for (let x = startCol; x < endCol; x++) {
            const tile = state.map[y][x];
            ctx.fillStyle = getMosaicColor(tile.color || '#526f4e', x, y);
            const px = Math.floor(x * state.tileSize);
            const py = Math.floor(y * state.tileSize);
            const pSize = Math.ceil(state.tileSize);
            ctx.fillRect(px, py, pSize, pSize);
        }
    }

    drawGridOverlay(startCol, endCol, startRow, endRow);
    drawTerritoryOverlay(startCol, endCol, startRow, endRow);

    state.skin.draw(
        ctx,
        state.player.x * state.tileSize + (state.tileSize - state.player.size) / 2,
        state.player.y * state.tileSize + (state.tileSize - state.player.size) / 2,
        state.player.size
    );

    ctx.restore();
}

function drawWaterCoastline(startCol, endCol, startRow, endRow) {
    return;
}

function drawSmoothWaterEdges(startCol, endCol, startRow, endRow) {
    return;
}

function drawTerrainDetails(startCol, endCol, startRow, endRow) {
    if (state.zoom < 0.35) return;
    ctx.save();
    ctx.lineWidth = Math.max(0.7, 1.1 / state.zoom);
    for (let y = startRow; y < endRow; y += 5) {
        for (let x = startCol; x < endCol; x += 5) {
            const tile = state.map[y][x];
            const px = (x + 0.5) * state.tileSize;
            const py = (y + 0.5) * state.tileSize;
            if (tile.type === 1 && tile.slope > 0.025) {
                ctx.strokeStyle = 'rgba(40, 36, 35, 0.45)';
                ctx.beginPath();
                ctx.moveTo(px - state.tileSize * 0.35, py + state.tileSize * 0.22);
                ctx.lineTo(px + state.tileSize * 0.30, py - state.tileSize * 0.22);
                ctx.stroke();
            } else if (tile.type === 2) {
                ctx.strokeStyle = 'rgba(28, 67, 42, 0.42)';
                ctx.beginPath();
                ctx.moveTo(px, py - state.tileSize * 0.28);
                ctx.lineTo(px - state.tileSize * 0.18, py + state.tileSize * 0.20);
                ctx.lineTo(px + state.tileSize * 0.18, py + state.tileSize * 0.20);
                ctx.closePath();
                ctx.stroke();
            }
        }
    }
    ctx.restore();
}

function buildJaggedRuinPath(centerX, centerY, size, seed) {
    const points = [];
    const pointCount = 4;
    for (let i = 0; i < pointCount; i++) {
        const angle = (i / pointCount) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * size * (0.75 + Math.sin(seed + i) * 0.22);
        const y = centerY + Math.sin(angle) * size * (0.75 + Math.cos(seed * 0.8 + i) * 0.22);
        points.push({ x, y });
    }
    return points;
}

function drawRuins(startCol, endCol, startRow, endRow) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const ruin of state.ruins) {
        const cellList = Array.isArray(ruin.cells) && ruin.cells.length ? ruin.cells : [{ x: ruin.x, y: ruin.y }];
        const avgX = cellList.reduce((sum, cell) => sum + Number(cell.x || 0), 0) / cellList.length;
        const avgY = cellList.reduce((sum, cell) => sum + Number(cell.y || 0), 0) / cellList.length;
        const worldCenterX = (avgX + 0.5) * state.tileSize;
        const worldCenterY = (avgY + 0.5) * state.tileSize;
        const minX = Math.min(...cellList.map((cell) => Number(cell.x || 0)));
        const maxX = Math.max(...cellList.map((cell) => Number(cell.x || 0)));
        const minY = Math.min(...cellList.map((cell) => Number(cell.y || 0)));
        const maxY = Math.max(...cellList.map((cell) => Number(cell.y || 0)));
        const radius = Math.max(10, Math.max(maxX - minX, maxY - minY) * 1.4 * state.tileSize * 0.28);
        if (worldCenterX < startCol * state.tileSize - radius || worldCenterX > endCol * state.tileSize + radius || worldCenterY < startRow * state.tileSize - radius || worldCenterY > endRow * state.tileSize + radius) continue;

        const screenX = (worldCenterX - state.camera.x + canvas.width / 2) * state.zoom;
        const screenY = (worldCenterY - state.camera.y + canvas.height / 2) * state.zoom;
        const displayRadius = Math.max(7, Math.min(18, 16 / Math.max(state.zoom, 0.85)));
        const points = buildJaggedRuinPath(screenX, screenY, displayRadius, ruin.id || (ruin.x + ruin.y) * 0.73);
        ctx.beginPath();
        points.forEach((point, index) => {
            if (index === 0) ctx.moveTo(point.x, point.y);
            else ctx.lineTo(point.x, point.y);
        });
        ctx.closePath();
        ctx.fillStyle = '#ef4444';
        ctx.fill();
        ctx.strokeStyle = '#fff5d1';
        ctx.lineWidth = 1.6;
        ctx.stroke();
    }
    ctx.restore();
}

function drawTerritoryOverlay(startCol, endCol, startRow, endRow) {
    ctx.save();
    const passableLand = (tile) => Boolean(tile && tile.isLand && !tile.isSea && !tile.isLake && !tile.isOcean && tile.type !== 'SEA' && tile.type !== 'LAKE');
    const drawBorderSegment = (x1, y1, x2, y2) => {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    };
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (let y = startRow; y < endRow; y++) {
        for (let x = startCol; x < endCol; x++) {
            const tile = state.map[y][x];
            if (!tile || tile.territoryId < 0 || !passableLand(tile)) continue;
            const left = x > 0 ? state.map[y][x - 1] : null;
            const right = x < state.cols - 1 ? state.map[y][x + 1] : null;
            const up = y > 0 ? state.map[y - 1][x] : null;
            const down = y < state.rows - 1 ? state.map[y + 1][x] : null;
            const px = x * state.tileSize;
            const py = y * state.tileSize;
                const shouldDraw = (dir) => passableLand(dir) && dir.territoryId >= 0 && dir.territoryId !== tile.territoryId;
                ctx.strokeStyle = 'rgba(20,20,20,0.42)';
                ctx.lineWidth = 3.2 / state.zoom;
                ctx.setLineDash([5 / state.zoom, 7 / state.zoom]);
                if (shouldDraw(right)) drawBorderSegment(px + state.tileSize, py, px + state.tileSize, py + state.tileSize);
                if (shouldDraw(down)) drawBorderSegment(px, py + state.tileSize, px + state.tileSize, py + state.tileSize);
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.4 / state.zoom;
                ctx.setLineDash([5 / state.zoom, 5 / state.zoom]);
                if (shouldDraw(right)) drawBorderSegment(px + state.tileSize, py, px + state.tileSize, py + state.tileSize);
                if (shouldDraw(down)) drawBorderSegment(px, py + state.tileSize, px + state.tileSize, py + state.tileSize);
        }
    }

    ctx.setLineDash([]);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.max(10, 15 / state.zoom)}px sans-serif`;

    for (const label of state.labels) {
        if (!label || !label.text || !String(label.text).trim()) continue;
        const x = Number(label.x);
        const y = Number(label.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const px = (x + 0.5) * state.tileSize;
        const py = (y + 0.5) * state.tileSize;
        if (px < startCol * state.tileSize || px > endCol * state.tileSize || py < startRow * state.tileSize || py > endRow * state.tileSize) continue;
        const text = String(label.text);
        ctx.fillStyle = BIOME_COLORS.labelBg;
        const labelWidth = ctx.measureText(text).width + 14 / state.zoom;
        const labelHeight = 20 / state.zoom;
        ctx.fillRect(px - labelWidth / 2, py - labelHeight / 2, labelWidth, labelHeight);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, px, py);
    }
    ctx.restore();
}

function setZoom(newZoom, pivotCanvasX, pivotCanvasY) {
    const targetZoom = Math.min(state.maxZoom, Math.max(state.minZoom, newZoom));
    if (targetZoom === state.zoom) return;

    const viewW = canvas.width / state.zoom;
    const viewH = canvas.height / state.zoom;
    const currentLeft = state.camera.x - viewW / 2;
    const currentTop = state.camera.y - viewH / 2;

    const worldPivotX = currentLeft + pivotCanvasX / state.zoom;
    const worldPivotY = currentTop + pivotCanvasY / state.zoom;

    state.zoom = targetZoom;

    const newViewW = canvas.width / state.zoom;
    const newViewH = canvas.height / state.zoom;
    state.camera.x = worldPivotX - pivotCanvasX / state.zoom + newViewW / 2;
    state.camera.y = worldPivotY - pivotCanvasY / state.zoom + newViewH / 2;
    scheduleDraw();
}

function setupControls() {
    window.addEventListener('resize', () => {
        resize();
        scheduleDraw();
    });

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const pivotX = (e.clientX - rect.left) * (canvas.width / rect.width);
        const pivotY = (e.clientY - rect.top) * (canvas.height / rect.height);

        const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
        setZoom(state.zoom * zoomFactor, pivotX, pivotY);
    }, { passive: false });

    // ドラッグ＆ピンチ操作（Pointer Events）
    canvas.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        canvas.setPointerCapture(e.pointerId);

        if (activePointers.size === 1) {
            isDragging = true;
            dragStart = { x: e.clientX, y: e.clientY };
            cameraStart = { x: state.camera.x, y: state.camera.y };
        } else if (activePointers.size === 2) {
            isDragging = false;
            const pts = Array.from(activePointers.values());
            initialPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            initialZoom = state.zoom;
        }
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!activePointers.has(e.pointerId)) return;
        e.preventDefault();
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (activePointers.size === 2 && initialPinchDist) {
            const pts = Array.from(activePointers.values());
            const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            const factor = dist / initialPinchDist;

            const rect = canvas.getBoundingClientRect();
            const midX = ((pts[0].x + pts[1].x) / 2 - rect.left) * (canvas.width / rect.width);
            const midY = ((pts[0].y + pts[1].y) / 2 - rect.top) * (canvas.height / rect.height);

            setZoom(initialZoom * factor, midX, midY);
        } else if (activePointers.size === 1 && isDragging) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;

            const dx = (e.clientX - dragStart.x) * scaleX / state.zoom;
            const dy = (e.clientY - dragStart.y) * scaleY / state.zoom;

            state.camera.x = cameraStart.x - dx;
            state.camera.y = cameraStart.y - dy;
            scheduleDraw();
        }
    });

    const handlePointerUp = (e) => {
        if (canvas.hasPointerCapture(e.pointerId)) {
            try { canvas.releasePointerCapture(e.pointerId); } catch(err) {}
        }
        activePointers.delete(e.pointerId);

        if (activePointers.size === 1) {
            const pt = Array.from(activePointers.values())[0];
            isDragging = true;
            dragStart = { x: pt.x, y: pt.y };
            cameraStart = { x: state.camera.x, y: state.camera.y };
        } else {
            isDragging = false;
            initialPinchDist = null;
        }
    };

    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);
}

function movePlayer(dx, dy) {
    const newX = state.player.x + dx;
    const newY = state.player.y + dy;

    if (newX >= 0 && newX < state.cols && newY >= 0 && newY < state.rows) {
        const targetTile = state.map[newY][newX];
        if (canEnterCell(targetTile, { rules: state.cellEntryRules, items: state.inventoryItems })) {
            state.player.x = newX;
            state.player.y = newY;
            savePlayerPos();
            state.skin.setDirection(dx, dy);
            centerCameraOnPlayer();
            updateUI();
            scheduleDraw();
        }
    }
}

function updateUI() {
    document.getElementById('playerHP').textContent = state.player.hp;
    document.getElementById('playerSteam').textContent = state.player.steam;
    document.getElementById('playerCoord').textContent = `(${state.player.x}, ${state.player.y})`;
    const tile = state.map[state.player.y]?.[state.player.x];
    const territoryElement = document.getElementById('currentTerritory');
    const cellTypeElement = document.getElementById('currentCellType');
    if (!tile) {
        territoryElement.textContent = '-';
        cellTypeElement.textContent = '-';
        return;
    }

    const isWater = tile.isSea || tile.isOcean || tile.isLake || tile.type === 'SEA' || tile.type === 'LAKE' || tile.type === 3;
    const territory = isWater
        ? '海'
        : tile.isMainland && tile.territoryId >= 0
            ? (tile.regionName || state.territories.find((item) => item.territoryId === tile.territoryId || item.id === tile.territoryId)?.name || '不明な領域')
            : '孤島';
    const cellTypes = {
        SEA: '海',
        LAKE: '湖沼',
        PLAINS: '草原',
        FOREST: '森林',
        MOUNTAIN: '山岳',
        RUIN: '古代遺跡'
    };
    const cellType = cellTypes[tile.type] || (tile.type === 1 ? '山岳' : tile.type === 2 ? '森林' : tile.type === 0 ? '草原' : '地形');
    territoryElement.textContent = territory;
    cellTypeElement.textContent = cellType;
}

document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.action === 'select-scroll') {
        const nextId = button.dataset.scrollId;
        selectedSavedScrollId = selectedSavedScrollId === nextId ? null : nextId;
        renderSavedScrolls();
        return;
    }
    if (button.dataset.action === 'use-scroll') {
        const scrollId = button.dataset.scrollId;
        const scroll = getStoredSavedScrolls().find(item => item.id === scrollId);
        if (scroll) applySavedScrollEffect(scroll);
    }
});

window.addEventListener('storage', () => {
    renderSavedScrolls();
});

window.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

    let handled = true;
    switch(e.key.toLowerCase()) {
        case 'w': case 'arrowup': movePlayer(0, -1); break;
        case 's': case 'arrowdown': movePlayer(0, 1); break;
        case 'a': case 'arrowleft': movePlayer(-1, 0); break;
        case 'd': case 'arrowright': movePlayer(1, 0); break;
        default: handled = false;
    }
    if (handled && e.key.toLowerCase().startsWith('arrow')) e.preventDefault();
});

document.getElementById('move-up').onclick = () => movePlayer(0, -1);
document.getElementById('move-down').onclick = () => movePlayer(0, 1);
document.getElementById('move-left').onclick = () => movePlayer(-1, 0);
document.getElementById('move-right').onclick = () => movePlayer(1, 0);

// インベントリトグルボタンのイベントリスナー設定
const inventoryToggleBtn = document.querySelector('[data-action="toggle-inventory"]');
const inventoryPanel = document.getElementById('inventory-panel');
const cellLegendToggleBtn = document.querySelector('[data-action="toggle-cell-legend"]');
const cellLegendPanel = document.getElementById('cell-legend-panel');
const statusToggleBtn = document.querySelector('[data-action="toggle-status"]');
const statusPanel = document.getElementById('status-panel');

function setupDashboardToggle(toggleButton, panel) {
    if (!toggleButton || !panel) return;
    toggleButton.addEventListener('click', () => {
        const isHidden = panel.hidden;
        panel.hidden = !isHidden;
        toggleButton.setAttribute('aria-expanded', String(isHidden));
        const span = toggleButton.querySelector('span');
        if (span) span.textContent = isHidden ? '-' : '+';
    });
}

setupDashboardToggle(statusToggleBtn, statusPanel);
setupDashboardToggle(cellLegendToggleBtn, cellLegendPanel);

if (inventoryToggleBtn && inventoryPanel) {
    inventoryToggleBtn.addEventListener('click', () => {
        const isHidden = inventoryPanel.hidden;
        inventoryPanel.hidden = !isHidden;
        inventoryToggleBtn.setAttribute('aria-expanded', String(isHidden));
        const span = inventoryToggleBtn.querySelector('span');
        if (span) {
            span.textContent = isHidden ? '-' : '+';
        }
    });
}

const minZoomSelect = document.getElementById('minZoomSelect');
if (minZoomSelect) {
    minZoomSelect.addEventListener('change', (e) => {
        state.minZoom = parseFloat(e.target.value);
        if (state.zoom < state.minZoom) {
            state.zoom = state.minZoom;
        }
    });
}

init();
