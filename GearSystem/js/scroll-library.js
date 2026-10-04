import { CanvasRenderer } from './CanvasRenderer.js?v=render-2';
import { GEAR_CONFIG, hexToPixel } from './GearManager.js?v=runtime-8';
import { GearNetwork } from './GearSystem.js?v=network-8';

const LIBRARY_KEY = 'fogsgear_scroll_library';
const ACTIVE_SCROLL_KEY = 'fogsgear_active_scroll_id';
const ACTIVE_SCROLL_RUNNING_KEY = 'fogsgear_active_scroll_running';
const ACTIVE_SCROLL_TARGETS_KEY = 'fogsgear_active_scroll_targets';
const ACTIVE_SCROLL_SYNC_STATE_KEY = 'fogsgear_active_scroll_sync_state';
const GAME_SAVE_KEY = 'fog_thermo_save';
const canvas = document.getElementById('previewCanvas');
const ctx = canvas.getContext('2d');
const tabs = [...document.querySelectorAll('.scroll-tab')];
const listElement = document.getElementById('scroll-list');
const countElement = document.getElementById('scroll-count');
const emptyElement = document.getElementById('scroll-empty');
const detailElement = document.getElementById('scroll-detail');
const nameElement = document.getElementById('scroll-name');
const materialElement = document.getElementById('scroll-material-label');
const metaElement = document.getElementById('scroll-meta');
const statusElement = document.getElementById('scroll-status');
const toggleButton = document.getElementById('scroll-toggle');
const previewFrame = document.querySelector('.scroll-preview-frame');
const choiceModal = document.getElementById('scroll-choice-modal');
const choiceTitle = document.getElementById('scroll-choice-title');
const choiceDescription = document.getElementById('scroll-choice-description');
const choiceEditButton = document.getElementById('scroll-choice-edit');
const isEmbedded = new URLSearchParams(window.location.search).get('embed') === '1';
const hideMapBack = new URLSearchParams(window.location.search).get('hideMapBack') === '1';
if (isEmbedded) document.body.classList.add('embedded-library');
if (isEmbedded && hideMapBack) document.body.classList.add('hide-embedded-map-back');
window.addEventListener('message', event => {
    if (!isEmbedded || event.source !== window.parent || event.data?.type !== 'fogsgear:engine-dashboard') return;
    const { values, rates, generationRates, creativeMode } = event.data;
    if (!values || !rates || !generationRates) return;
    Object.entries(values).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = String(value);
    });
    Object.entries(rates).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = String(value);
    });
    document.querySelectorAll('[data-generated-resource]').forEach(row => {
        row.hidden = !(Number(generationRates[row.dataset.generatedResource]) > 0);
    });
    const resourceTable = document.querySelector('.dashboard-resource-table');
    if (resourceTable && Array.isArray(event.data.collectedMaterials)) {
        resourceTable.querySelectorAll('[data-collected-material]').forEach(row => row.remove());
        event.data.collectedMaterials.forEach(material => {
            if (typeof material?.itemId !== 'string' || typeof material?.name !== 'string') return;
            const row = document.createElement('div');
            row.className = 'dashboard-resource-row';
            row.dataset.collectedMaterial = material.itemId;
            const name = document.createElement('span');
            name.textContent = material.name;
            const amount = document.createElement('strong');
            amount.textContent = String(material.amount);
            const rate = document.createElement('span');
            rate.textContent = `${material.rate} /秒`;
            const consumption = document.createElement('span');
            consumption.textContent = '—';
            row.append(name, amount, rate, consumption);
            resourceTable.appendChild(row);
        });
    }
    const creativeIndicator = document.getElementById('main-creative-mode-indicator');
    if (creativeIndicator) creativeIndicator.hidden = !creativeMode;
});
document.querySelectorAll('.back-to-map').forEach(link => {
    link.addEventListener('click', event => {
        if (!isEmbedded) return;
        event.preventDefault();
        window.parent.postMessage({ type: 'fogsgear:close-page' }, window.location.origin);
    });
});
function setListVisibility(visible) {
    if (!isEmbedded) return;
    document.body.classList.toggle('scroll-list-hidden', !visible);
    if (!visible) {
        tabs.forEach(tab => {
            tab.classList.remove('active');
            tab.setAttribute('aria-selected', 'false');
        });
    }
}

const previewState = {
    placedGears: [],
    belts: [],
    visibleLayers: [true, true, true],
    selectedItem: 'NONE',
    beltSelection: [],
    showBelts: true,
    showLoops: false,
    hoveredGearIds: [],
    zoomScale: 1,
    offsetX: 0,
    offsetY: 0,
    running: false,
    invalid: false,
    rotationActive: false,
    network: new GearNetwork(),
    tick(elapsed) {
        if (!this.running || this.invalid) {
            if (this.rotationActive || this.placedGears.some(gear => gear.powered || gear.rotationDir || gear.angularVelocity)) {
                this.placedGears.forEach(gear => {
                    gear.powered = false;
                    gear.rotationDir = 0;
                    gear.angularVelocity = 0;
                });
            }
            this.rotationActive = false;
            return;
        }
        if (!this.rotationActive) {
            this.network.updateRotation({ rebuildConnections: false });
            this.network.synchronizeLockedAxes();
            this.rotationActive = true;
        }
        this.placedGears.forEach(gear => {
            if (!gear.powered || gear.isDeadlocked) return;
            gear.angle += 0.012 * 60 * elapsed * (gear.angularVelocity || 1) * (gear.rotationDir || 1);
        });
    }
};
const renderer = new CanvasRenderer('previewCanvas', previewState, false);
let lastPreviewFrame = 0;
let previewFrameId = null;
function animatePreview(now) {
    previewFrameId = null;
    if (!previewState.running || previewState.invalid) {
        previewState.tick(0);
        renderer.render();
        lastPreviewFrame = 0;
        return;
    }
    previewFrameId = requestAnimationFrame(animatePreview);
    const elapsed = lastPreviewFrame ? Math.min(0.1, Math.max(0, (now - lastPreviewFrame) / 1000)) : 1 / 60;
    lastPreviewFrame = now;
    previewState.tick(elapsed);
    renderer.render();
}
function startPreviewAnimation() {
    if (previewFrameId !== null) return;
    lastPreviewFrame = 0;
    previewFrameId = requestAnimationFrame(animatePreview);
}
function stopPreviewAnimation() {
    if (previewFrameId !== null) cancelAnimationFrame(previewFrameId);
    previewFrameId = null;
    lastPreviewFrame = 0;
    previewState.tick(0);
    renderer.render();
}
let currentMaterial = 'all';
let selectedScrollId = null;
let library = [];
let renderedScrollId = null;
let runtimePreviewScrollId = null;

function readLibrary() {
    try {
        const value = JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]');
        return Array.isArray(value) ? value : [];
    } catch (error) {
        return [];
    }
}

function getMaterial(scroll) {
    const value = String(scroll?.material || scroll?.scrollType || '').toLowerCase();
    return value === 'cloth' || value === 'fabric' ? 'cloth' : 'paper';
}

function getMaterialLabel(scroll) {
    return getMaterial(scroll) === 'cloth' ? '布のスクロール' : '紙のスクロール';
}

function getSelectedScroll() {
    return library.find(scroll => scroll.id === selectedScrollId) || null;
}

function getActiveScrollIds() {
    const stored = localStorage.getItem(ACTIVE_SCROLL_KEY);
    try {
        const ids = JSON.parse(stored || '[]');
        if (Array.isArray(ids)) return [...new Set(ids.filter(Boolean))];
    } catch (error) {}
    const legacyId = stored;
    return legacyId && localStorage.getItem(ACTIVE_SCROLL_RUNNING_KEY) === 'true' ? [legacyId] : [];
}

function getActiveScrollTargets() {
    try {
        const targets = JSON.parse(localStorage.getItem(ACTIVE_SCROLL_TARGETS_KEY) || '{}');
        return targets && typeof targets === 'object' ? targets : {};
    } catch (error) {
        return {};
    }
}

function setScrollRunning(scrollId, running) {
    const ids = new Set(getActiveScrollIds());
    const targets = getActiveScrollTargets();
    if (running) {
        let playerPosition = { x: 0, y: 0 };
        try {
            const savedPlayer = JSON.parse(localStorage.getItem('steampunk_explorer_player_pos') || 'null');
            if (Number.isInteger(savedPlayer?.x) && Number.isInteger(savedPlayer?.y)) playerPosition = { x: savedPlayer.x, y: savedPlayer.y };
        } catch (error) {}
        targets[scrollId] = playerPosition;
        ids.add(scrollId);
        localStorage.setItem(ACTIVE_SCROLL_TARGETS_KEY, JSON.stringify(targets));
        localStorage.setItem(ACTIVE_SCROLL_KEY, JSON.stringify([...ids]));
    } else {
        ids.delete(scrollId);
        localStorage.setItem(ACTIVE_SCROLL_KEY, JSON.stringify([...ids]));
        delete targets[scrollId];
        localStorage.setItem(ACTIVE_SCROLL_TARGETS_KEY, JSON.stringify(targets));
    }
    localStorage.removeItem(ACTIVE_SCROLL_RUNNING_KEY);
    renderList();
}

function stopAllScrolls() {
    localStorage.setItem(ACTIVE_SCROLL_KEY, '[]');
    localStorage.setItem(ACTIVE_SCROLL_TARGETS_KEY, '{}');
    localStorage.removeItem(ACTIVE_SCROLL_RUNNING_KEY);
    renderList();
}

function hasEnginePower() {
    try {
        const save = JSON.parse(localStorage.getItem(GAME_SAVE_KEY) || '{}');
        return Number(save.steamPower ?? 100) > 0;
    } catch (error) {
        return true;
    }
}

function requestEngineResume() {
    try {
        const save = JSON.parse(localStorage.getItem(GAME_SAVE_KEY) || '{}');
        if (Number(save.steamPower ?? 0) <= 0 || save.mainGearRunning !== false) return;
        save.mainGearRunning = true;
        save.userStoppedMainGear = false;
        save.autoStoppedBySteam = false;
        save.updatedAt = Date.now();
        localStorage.setItem(GAME_SAVE_KEY, JSON.stringify(save));
    } catch (error) {}
}

function getGearData(scroll) {
    const gears = Array.isArray(scroll?.blueprint?.gears) ? scroll.blueprint.gears : [];
    return gears.map((data, index) => {
        const sizeKey = data.sizeKey || data.size || 'M';
        const config = GEAR_CONFIG[sizeKey] || GEAR_CONFIG.M;
        const q = Number.isFinite(Number(data.q)) ? Number(data.q) : 0;
        const r = Number.isFinite(Number(data.r)) ? Number(data.r) : 0;
        const position = hexToPixel(q, r);
        return {
            id: data.id || `preview-${index}`,
            q,
            r,
            x: position.x,
            y: position.y,
            sizeKey,
            size: config.teeth,
            teeth: config.teeth,
            radius: config.radius,
            cost: config.cost,
            pattern: config.pattern,
            layer: Number.isFinite(Number(data.layer)) ? Number(data.layer) : 0,
            angle: Number(data.angle) || 0,
            isCore: Boolean(data.isCore),
            isLocked: data.isLocked ?? Boolean(data.isCore),
            designType: data.designType || 'INDUSTRIAL',
            processMode: data.processMode || 'NONE',
            powered: true,
            isDeadlocked: false,
            angleError: false,
            rotationDir: 1,
            angularVelocity: 1
        };
    });
}

function fitPreview() {
    const gears = previewState.placedGears;
    if (!gears.length) {
        previewState.zoomScale = 1;
        previewState.offsetX = 0;
        previewState.offsetY = 0;
        return;
    }
    const bounds = gears.reduce((result, gear) => ({
        minX: Math.min(result.minX, gear.x - gear.radius),
        maxX: Math.max(result.maxX, gear.x + gear.radius),
        minY: Math.min(result.minY, gear.y - gear.radius),
        maxY: Math.max(result.maxY, gear.y + gear.radius)
    }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    previewState.zoomScale = Math.min(4.5, Math.max(0.22, Math.min((canvas.width - 54) / width, (canvas.height - 54) / height)));
    previewState.offsetX = -((bounds.minX + bounds.maxX) / 2);
    previewState.offsetY = -((bounds.minY + bounds.maxY) / 2);
}

function renderPreview(scroll) {
    if (renderedScrollId === scroll.id) return;
    previewState.placedGears = getGearData(scroll);
    previewState.belts = Array.isArray(scroll?.blueprint?.belts) ? scroll.blueprint.belts : [];
    previewState.network = new GearNetwork(previewState.placedGears, previewState.belts);
    previewState.network.updateRotation();
    previewState.invalid = !previewState.placedGears.some(gear => gear.isCore)
        || previewState.placedGears.some(gear => gear.isDeadlocked || gear.angleError);
    if (previewState.invalid) previewState.running = false;
    fitPreview();
    renderer.render();
    renderedScrollId = scroll.id;
}

function syncPreviewLocks(scroll) {
    if (!getActiveScrollIds().includes(scroll.id)) {
        if (runtimePreviewScrollId === scroll.id) {
            runtimePreviewScrollId = null;
            renderedScrollId = null;
            renderPreview(scroll);
        }
        return;
    }
    let syncState = {};
    try {
        syncState = JSON.parse(localStorage.getItem(ACTIVE_SCROLL_SYNC_STATE_KEY) || '{}');
    } catch (error) {}
    const locks = syncState[scroll.id];
    if (!locks || typeof locks !== 'object') return;
    runtimePreviewScrollId = scroll.id;
    let changed = false;
    previewState.placedGears.forEach(gear => {
        const isLocked = locks[gear.id];
        if (typeof isLocked !== 'boolean' || gear.isLocked === isLocked) return;
        gear.isLocked = isLocked;
        changed = true;
    });
    if (!changed) return;
    previewState.network.rebuild(previewState.placedGears, previewState.belts).updateRotation();
    previewState.network.synchronizeLockedAxes();
    previewState.invalid = previewState.placedGears.some(gear => gear.isDeadlocked || gear.angleError);
    if (previewState.invalid) previewState.running = false;
    renderer.render();
}

function renderList() {
    const filtered = library.filter(scroll => currentMaterial === 'all' || getMaterial(scroll) === currentMaterial);
    const activeScrollIds = new Set(getActiveScrollIds());
    countElement.textContent = String(filtered.length);
    listElement.replaceChildren();
    if (!filtered.length) {
        const empty = document.createElement('p');
        empty.className = 'scroll-list-empty';
        empty.textContent = currentMaterial === 'all' ? '保存済みスクロールはありません。' : 'この種類のスクロールはありません。';
        listElement.appendChild(empty);
        return;
    }
    filtered.forEach(scroll => {
        const isRunning = activeScrollIds.has(scroll.id);
        const item = document.createElement('div');
        item.className = `scroll-list-item${scroll.id === selectedScrollId ? ' active' : ''}${isRunning ? ' running' : ''}`;
        item.dataset.scrollId = scroll.id;
        item.innerHTML = `<button class="scroll-list-select" type="button"><span class="scroll-list-type">${getMaterial(scroll) === 'cloth' ? '布' : '紙'}</span><span class="scroll-list-name"></span></button><button class="scroll-list-edit" type="button" aria-label="スクロールを編集" title="スクロールを編集"><span aria-hidden="true">⚙︎</span></button>`;
        item.querySelector('.scroll-list-name').textContent = scroll.name || '名前なしスクロール';
        const selectButton = item.querySelector('.scroll-list-select');
        selectButton.dataset.scrollId = scroll.id;
        selectButton.setAttribute('aria-label', `${getMaterialLabel(scroll)}: ${scroll.name || '名前なしスクロール'}、${isRunning ? '起動中' : '停止中'}`);
        item.querySelector('.scroll-list-edit').dataset.scrollId = scroll.id;
        listElement.appendChild(item);
    });
}

function renderDetail() {
    const scroll = getSelectedScroll();
    const hasScroll = Boolean(scroll);
    emptyElement.hidden = hasScroll;
    detailElement.hidden = !hasScroll;
    if (!scroll) return;
    const gearCount = Array.isArray(scroll.blueprint?.gears) ? scroll.blueprint.gears.length : 0;
    const requestedRunning = getActiveScrollIds().includes(scroll.id);
    const target = getActiveScrollTargets()[scroll.id];
    const enginePowered = hasEnginePower();
    const isRunning = requestedRunning && enginePowered;
    previewState.running = isRunning;
    renderPreview(scroll);
    syncPreviewLocks(scroll);
    const effectiveRunning = isRunning && !previewState.invalid;
    if (requestedRunning && !enginePowered) stopAllScrolls();
    else if (requestedRunning && previewState.invalid) setScrollRunning(scroll.id, false);
    previewState.running = effectiveRunning;
    if (effectiveRunning) startPreviewAnimation();
    else stopPreviewAnimation();
    if (isEmbedded) document.body.classList.toggle('scroll-is-running', effectiveRunning);
    nameElement.textContent = scroll.name || '名前なしスクロール';
    materialElement.textContent = getMaterialLabel(scroll);
    metaElement.textContent = `${gearCount}個のギア / 効果: ${scroll.effect?.label || '未設定'}`;
    statusElement.textContent = previewState.invalid
        ? 'ギア接続に矛盾があるため起動できません。'
        : !enginePowered ? '動力が停止しているため起動できません。'
        : effectiveRunning ? 'このスクロールは起動中です。' : 'このスクロールは停止中です。';
    if (effectiveRunning && Number.isInteger(target?.x) && Number.isInteger(target?.y)) {
        statusElement.textContent += ` / 対象セル (${target.x}, ${target.y})`;
    }
    toggleButton.textContent = effectiveRunning ? 'スクロールを停止' : 'スクロールを起動';
    toggleButton.classList.toggle('btn-reset', effectiveRunning);
    toggleButton.classList.toggle('btn-visibility', !effectiveRunning);
    toggleButton.disabled = previewState.invalid;
}

function openChoiceModal(scroll) {
    if (!scroll || !choiceModal) return;
    choiceTitle.textContent = scroll.name || '名前なしスクロール';
    choiceDescription.textContent = `${getMaterialLabel(scroll)} / 効果: ${scroll.effect?.label || '未設定'}`;
    choiceModal.hidden = false;
}

function closeChoiceModal() {
    if (choiceModal) choiceModal.hidden = true;
}

function selectScroll(scrollId) {
    selectedScrollId = scrollId;
    renderedScrollId = null;
    renderList();
    renderDetail();
    resizePreview();
    setListVisibility(false);
}

function resizePreview() {
    if (!previewFrame.clientWidth || !previewFrame.clientHeight) return;
    renderer.resizeCanvas();
    fitPreview();
    renderer.render();
}

if ('ResizeObserver' in window) {
    const previewResizeObserver = new ResizeObserver(() => {
        renderer.resizeCanvas();
        fitPreview();
        renderer.render();
    });
    previewResizeObserver.observe(previewFrame);
}

tabs.forEach(tab => tab.addEventListener('click', () => {
    setListVisibility(true);
    currentMaterial = tab.dataset.material;
    tabs.forEach(item => {
        const active = item === tab;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', String(active));
    });
    const visible = library.filter(scroll => currentMaterial === 'all' || getMaterial(scroll) === currentMaterial);
    if (!visible.some(scroll => scroll.id === selectedScrollId)) selectedScrollId = visible[0]?.id || null;
    renderList();
    renderDetail();
    resizePreview();
}));

listElement.addEventListener('click', event => {
    const editButton = event.target.closest('.scroll-list-edit');
    if (editButton) {
        selectScroll(editButton.dataset.scrollId);
        if (isEmbedded) {
            window.parent.postMessage({ type: 'fogsgear:edit-scroll', scrollId: editButton.dataset.scrollId }, window.location.origin);
        } else {
            openChoiceModal(getSelectedScroll());
        }
        return;
    }
    const selectButton = event.target.closest('.scroll-list-select');
    if (selectButton) {
        selectScroll(selectButton.dataset.scrollId);
    }
});

toggleButton.addEventListener('click', () => {
    const scroll = getSelectedScroll();
    if (!scroll || previewState.invalid) return;
    const isRunning = getActiveScrollIds().includes(scroll.id);
    if (!isRunning) requestEngineResume();
    setScrollRunning(scroll.id, !isRunning);
    previewState.running = !isRunning;
    renderDetail();
});

choiceEditButton?.addEventListener('click', () => {
    const scroll = getSelectedScroll();
    if (!scroll) return;
    const editorUrl = new URL('index.html', window.location.href);
    editorUrl.searchParams.set('editScroll', scroll.id);
    editorUrl.searchParams.set('ui', 'fullscreen-dialog-1');
    window.top.location.href = editorUrl.href;
});

choiceModal?.addEventListener('click', event => {
    if (event.target === choiceModal || event.target.closest('#scroll-choice-close')) closeChoiceModal();
});

previewFrame?.addEventListener('pointerup', () => setListVisibility(false));

window.addEventListener('storage', event => {
    if (event.key === LIBRARY_KEY || event.key === ACTIVE_SCROLL_KEY || event.key === ACTIVE_SCROLL_RUNNING_KEY || event.key === ACTIVE_SCROLL_TARGETS_KEY || event.key === ACTIVE_SCROLL_SYNC_STATE_KEY || event.key === GAME_SAVE_KEY) {
        library = readLibrary();
        if (!library.some(scroll => scroll.id === selectedScrollId)) selectedScrollId = library[0]?.id || null;
        if (event.key === LIBRARY_KEY) renderedScrollId = null;
        renderList();
        renderDetail();
        resizePreview();
    }
});

if ('ResizeObserver' in window) {
    new ResizeObserver(resizePreview).observe(previewFrame);
}
window.addEventListener('resize', resizePreview);

setInterval(() => {
    if (selectedScrollId) renderDetail();
}, 500);

library = readLibrary();
selectedScrollId = library[0]?.id || null;
renderList();
renderDetail();
resizePreview();
