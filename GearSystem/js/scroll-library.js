import { CanvasRenderer } from './CanvasRenderer.js?v=render-19';
import { GEAR_CONFIG, hexToPixel } from './GearManager.js?v=runtime-11';
import { CORE_ROTATION_SPEED_VERSION, GearNetwork, normalizeCoreRotationSpeedLevel } from './GearSystem.js?v=network-11';
import { SCROLL_MATERIALS, SCROLL_MATERIAL_BY_TYPE } from '../../MapSystem/js/craftingData.js?v=19';

const LIBRARY_KEY = 'fogsgear_scroll_library';
const BUILDINGS_KEY = 'fogsgear_world_buildings';
const ACTIVE_SCROLL_KEY = 'fogsgear_active_scroll_id';
const ACTIVE_SCROLL_RUNNING_KEY = 'fogsgear_active_scroll_running';
const ACTIVE_SCROLL_TARGETS_KEY = 'fogsgear_active_scroll_targets';
const ACTIVE_SCROLL_SYNC_STATE_KEY = 'fogsgear_active_scroll_sync_state';
const GAME_SAVE_KEY = 'fog_thermo_save';
const GAME_PROGRESS_EPOCH_KEY = 'fogsgear_game_progress_epoch';
const gameProgressEpoch = localStorage.getItem(GAME_PROGRESS_EPOCH_KEY) || '';
const canvas = document.getElementById('previewCanvas');
const ctx = canvas.getContext('2d');
const scrollTabs = document.querySelector('.scroll-tabs');
const exhaustedTab = scrollTabs?.querySelector('[data-material="exhausted"]');
const materialFamilies = new Map();
SCROLL_MATERIALS.forEach(material => {
    if (!materialFamilies.has(material.family)) materialFamilies.set(material.family, material.label);
});
materialFamilies.forEach((label, family) => {
    const button = document.createElement('button');
    button.className = 'scroll-tab';
    button.type = 'button';
    button.dataset.material = family;
    button.setAttribute('aria-selected', 'false');
    button.textContent = label;
    scrollTabs?.insertBefore(button, exhaustedTab || null);
});
const tabs = [...document.querySelectorAll('.scroll-tab[data-material]')];
const listElement = document.getElementById('scroll-list');
const countElement = document.getElementById('scroll-count');
const emptyElement = document.getElementById('scroll-empty');
const detailElement = document.getElementById('scroll-detail');
const nameElement = document.getElementById('scroll-name');
const materialElement = document.getElementById('scroll-material-label');
const metaElement = document.getElementById('scroll-meta');
const statusElement = document.getElementById('scroll-status');
const toggleButton = document.getElementById('scroll-toggle');
const durabilityElement = document.getElementById('scroll-durability-display');
const copyButton = document.getElementById('scroll-copy');
const deleteButton = document.getElementById('scroll-delete');
const copyModal = document.getElementById('scroll-copy-modal');
const copyForm = document.getElementById('scroll-copy-form');
const copySourceElement = document.getElementById('scroll-copy-source');
const copyMaterialSelect = document.getElementById('scroll-copy-material');
if (copyMaterialSelect) {
    copyMaterialSelect.replaceChildren(...SCROLL_MATERIALS.map(material => new Option(
        `${material.label}スクロール（耐久度${material.durability}回転）`, material.type
    )));
}
const copyNameInput = document.getElementById('scroll-copy-name');
const copyCostElement = document.getElementById('scroll-copy-cost');
const copyStatusElement = document.getElementById('scroll-copy-status');
const copySubmitButton = document.getElementById('scroll-copy-submit');
const previewFrame = document.querySelector('.scroll-preview-frame');
const choiceModal = document.getElementById('scroll-choice-modal');
const choiceTitle = document.getElementById('scroll-choice-title');
const choiceDescription = document.getElementById('scroll-choice-description');
const choiceEditButton = document.getElementById('scroll-choice-edit');
const shareButton = document.getElementById('scroll-share');
const shareModal = document.getElementById('scroll-share-modal');
const shareStatus = document.getElementById('scroll-share-status');
const shareQr = document.getElementById('scroll-share-qr');
const shareSaveButton = document.getElementById('scroll-share-save');
const shareFileInput = document.getElementById('scroll-share-file');
const sharePages = document.getElementById('scroll-share-pages');
const sharePageLabel = document.getElementById('scroll-share-page-label');
const sharePreviousButton = document.getElementById('scroll-share-page-previous');
const shareNextButton = document.getElementById('scroll-share-page-next');
const shareCameraPreview = document.getElementById('scroll-share-camera-preview');
const shareCameraVideo = document.getElementById('scroll-share-camera');
const shareCameraStartButton = document.getElementById('scroll-share-camera-start');
const shareCameraStopButton = document.getElementById('scroll-share-camera-stop');
const shareCameraCanvas = document.createElement('canvas');
let shareCameraStream = null;
let shareCameraAnimationFrame = 0;
let lastShareCameraScanAt = 0;
let lastShareCameraQrData = '';
let shareQrImages = [];
let shareQrPage = 0;
const sharedScrollParts = new Map();
const SHARE_QR_PART_LENGTH = 1050;
const SHARE_QR_MAX_PARTS = 32;
const SHARE_QR_MAX_COMPRESSED_BYTES = Math.floor((SHARE_QR_PART_LENGTH * SHARE_QR_MAX_PARTS - 2) / 4) * 3;
const pageParams = new URLSearchParams(window.location.search);
const isEmbedded = pageParams.get('embed') === '1';
const isScrollBook = pageParams.get('source') === 'scroll-book';
const isPreviewOnly = pageParams.get('previewOnly') === '1';
const followRunningState = isPreviewOnly && pageParams.get('followRunning') === '1';
const hideMapBack = pageParams.get('hideMapBack') === '1';
const hasExternalDashboard = pageParams.get('dashboard') === 'external';
if (isEmbedded) document.body.classList.add('embedded-library');
if (isPreviewOnly) document.body.classList.add('scroll-preview-only');
if (isEmbedded && hideMapBack) document.body.classList.add('hide-embedded-map-back');
if (isScrollBook) document.body.classList.add('scroll-book-view');
if (isEmbedded && hasExternalDashboard) document.body.classList.add('external-engine-dashboard');
if (isEmbedded && !hasExternalDashboard && window.matchMedia('(max-width: 700px) and (max-height: 520px)').matches) {
    const dashboard = document.querySelector('.embedded-engine-dashboard');
    if (dashboard) dashboard.open = true;
}
window.addEventListener('message', event => {
    if (!isEmbedded || event.source !== window.parent || event.data?.type !== 'fogsgear:engine-dashboard') return;
    const { values, rates, generationRates, consumptionRates = {}, creativeMode } = event.data;
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
        const resource = row.dataset.generatedResource;
        row.hidden = !(Number(generationRates[resource]) > 0 || Number(consumptionRates[resource]) > 0);
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
const PREVIEW_SIMULATION_INTERVAL = 1 / 30;
let previewAccumulator = 0;
let lastPreviewFrame = null;
let previewFrameId = null;
function animatePreview(now) {
    previewFrameId = null;
    if (!previewState.running || previewState.invalid) {
        previewState.tick(0);
        renderer.render();
        previewAccumulator = 0;
        lastPreviewFrame = null;
        return;
    }
    previewFrameId = requestAnimationFrame(animatePreview);
    if (lastPreviewFrame === null) {
        previewState.tick(0);
        renderer.previousGearAngles = new Map(previewState.placedGears.map(gear => [gear.id, gear.angle]));
        lastPreviewFrame = now;
        renderer.render(0);
        return;
    }
    const elapsed = Math.min(0.1, Math.max(0, (now - lastPreviewFrame) / 1000));
    lastPreviewFrame = now;
    previewAccumulator += elapsed;
    while (previewAccumulator >= PREVIEW_SIMULATION_INTERVAL) {
        renderer.previousGearAngles = new Map(previewState.placedGears.map(gear => [gear.id, gear.angle]));
        previewState.tick(PREVIEW_SIMULATION_INTERVAL);
        previewAccumulator -= PREVIEW_SIMULATION_INTERVAL;
    }
    renderer.render(previewAccumulator / PREVIEW_SIMULATION_INTERVAL);
}
function startPreviewAnimation() {
    if (previewFrameId !== null) return;
    previewAccumulator = 0;
    lastPreviewFrame = null;
    previewFrameId = requestAnimationFrame(animatePreview);
}
function stopPreviewAnimation() {
    if (previewFrameId !== null) cancelAnimationFrame(previewFrameId);
    previewFrameId = null;
    previewAccumulator = 0;
    lastPreviewFrame = null;
    previewState.tick(0);
    renderer.render();
}
let currentMaterial = 'all';
let selectedScrollId = null;
let library = [];
let renderedScrollId = null;
let renderedScrollBlueprint = null;
let runtimePreviewScrollId = null;
let pendingCopyRequestId = null;

function readLibrary() {
    try {
        const value = JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]');
        return Array.isArray(value) ? value : [];
    } catch (error) {
        return [];
    }
}

function getAvailableScrolls() {
    if (isPreviewOnly) return library;
    try {
        const buildings = JSON.parse(localStorage.getItem(BUILDINGS_KEY) || '[]');
        if (!Array.isArray(buildings)) return library;
        const installedIds = new Set(buildings
            .flatMap(building => [
                building?.craftingScrollId,
                building?.vehicle?.movementScrollId,
                building?.automaton?.movementScrollId,
                building?.stationControl?.movementScrollId
            ])
            .filter(scrollId => typeof scrollId === 'string' && scrollId));
        return library.filter(scroll => !installedIds.has(scroll.id));
    } catch (error) {
        console.error('Could not read installed building scrolls.', error);
        return library;
    }
}

function getScrollMaterialType(scroll) {
    const value = String(scroll?.material || scroll?.scrollType || '').toLowerCase();
    if (SCROLL_MATERIAL_BY_TYPE.has(value)) return value;
    return value === 'fabric' ? 'cloth' : 'paper';
}

function getMaterial(scroll) {
    return SCROLL_MATERIAL_BY_TYPE.get(getScrollMaterialType(scroll))?.family || 'paper';
}

function getMaterialLabel(scroll) {
    const material = SCROLL_MATERIAL_BY_TYPE.get(getScrollMaterialType(scroll)) || SCROLL_MATERIALS[0];
    return `${material.label}スクロール`;
}

function getDurabilityLimit(scroll) {
    return SCROLL_MATERIAL_BY_TYPE.get(getScrollMaterialType(scroll))?.durability
        || SCROLL_MATERIALS[0].durability;
}

function getCopyMaterialCost(scroll) {
    const gears = Array.isArray(scroll?.blueprint?.gears) ? scroll.blueprint.gears : [];
    return gears.reduce((total, gear) => {
        if (gear?.isCore) return total;
        const size = String(gear?.size || '');
        const teeth = { XXS: 4, SS: 6, S: 10, M: 14, L: 18, LL: 24, '3L': 32, '4L': 40, MAX: 48 }[size];
        if (!teeth) throw new Error('設計図に不明なギアサイズがあります。');
        return total + teeth;
    }, 0);
}

function getUsedRotations(scroll) {
    const value = Number(scroll?.usedRotations);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function isExhausted(scroll) {
    return getUsedRotations(scroll) >= getDurabilityLimit(scroll);
}

function getFilteredScrolls() {
    return getAvailableScrolls().filter(scroll => {
        if (currentMaterial === 'exhausted') return isExhausted(scroll);
        if (isExhausted(scroll)) return false;
        return currentMaterial === 'all' || getMaterial(scroll) === currentMaterial;
    });
}

function getSelectedScroll() {
    return library.find(scroll => scroll.id === selectedScrollId) || null;
}

function getUniqueCopyName(sourceName) {
    const base = `${String(sourceName || '名前なしスクロール').trim()}（写し）`;
    const existingNames = new Set(library.map(scroll => String(scroll.name || '').toLocaleLowerCase()));
    if (!existingNames.has(base.toLocaleLowerCase())) return base.slice(0, 80);
    for (let suffix = 2; suffix < 10000; suffix++) {
        const suffixText = `（${suffix}）`;
        const candidate = `${base.slice(0, 80 - suffixText.length)}${suffixText}`;
        if (!existingNames.has(candidate.toLocaleLowerCase())) return candidate;
    }
    throw new Error('重複しないスクロール名を作成できませんでした。');
}

function requestCopy(scrollId, name, material) {
    if (pendingCopyRequestId) return;
    if (!isEmbedded || window.parent === window) {
        copyStatusElement.textContent = 'マップ画面からスクロールブックを開いてください。';
        return;
    }
    pendingCopyRequestId = `copy-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    copySubmitButton.disabled = true;
    copyStatusElement.textContent = '写本しています...';
    window.parent.postMessage({
        type: 'fogsgear:copy-scroll',
        requestId: pendingCopyRequestId,
        scrollId,
        name,
        material
    }, window.location.origin === 'null' ? '*' : window.location.origin);
}

function openCopyModal(scroll) {
    if (!scroll || !isScrollBook || getInstalledScrollIds().has(scroll.id)) return;
    try {
        const cost = getCopyMaterialCost(scroll);
        if (cost <= 0) throw new Error('メインギア以外のギアがないため写本できません。');
        copySourceElement.textContent = `${scroll.name || '名前なしスクロール'} / 材料: 真鍮 ${cost}`;
        copyMaterialSelect.value = getScrollMaterialType(scroll);
        copyNameInput.value = getUniqueCopyName(scroll.name);
        copyCostElement.textContent = `消費: 真鍮 ${cost}（メインギア以外のギアの設置コスト合計）`;
        copyStatusElement.textContent = '';
        copySubmitButton.disabled = false;
        copyModal.hidden = false;
        copyNameInput.focus();
        copyNameInput.select();
    } catch (error) {
        window.alert(error instanceof Error ? error.message : String(error));
    }
}

function closeCopyModal() {
    copyModal.hidden = true;
    pendingCopyRequestId = null;
    copySubmitButton.disabled = false;
}

function deleteSelectedScroll(scroll) {
    if (!scroll || !isScrollBook) return;
    if (getInstalledScrollIds().has(scroll.id)) {
        window.alert('設置中のスクロールは削除できません。先に建物から回収してください。');
        return;
    }
    if (!window.confirm(`「${scroll.name || '名前なしスクロール'}」をスクロールブックから削除しますか？この操作は取り消せません。`)) return;
    try {
        const activeIds = getActiveScrollIds().filter(id => id !== scroll.id);
        const targets = getActiveScrollTargets();
        delete targets[scroll.id];
        localStorage.setItem(ACTIVE_SCROLL_KEY, JSON.stringify(activeIds));
        localStorage.setItem(ACTIVE_SCROLL_TARGETS_KEY, JSON.stringify(targets));
        library = library.filter(item => item.id !== scroll.id);
        localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
        selectedScrollId = getFilteredScrolls()[0]?.id || null;
        renderedScrollId = null;
        renderList();
        renderDetail();
        resizePreview();
    } catch (error) {
        console.error('スクロールを削除できませんでした。', error);
        window.alert('スクロールを削除できませんでした。保存容量やブラウザー設定を確認してください。');
    }
}

function bytesToBase64Url(bytes) {
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4));
    return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function transformShareBytes(bytes, StreamType, maxOutputBytes = 128 * 1024) {
    const stream = new Blob([bytes]).stream().pipeThrough(new StreamType('deflate'));
    const reader = stream.getReader();
    const chunks = [];
    let totalBytes = 0;
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        totalBytes += value.length;
        if (totalBytes > maxOutputBytes) {
            await reader.cancel();
            throw new Error('共有データが大きすぎます。');
        }
        chunks.push(value);
    }
    const output = new Uint8Array(totalBytes);
    let offset = 0;
    chunks.forEach(chunk => {
        output.set(chunk, offset);
        offset += chunk.length;
    });
    return output;
}

async function encodeSharedScroll(scroll) {
    const payload = {
        version: 1,
        name: scroll.name || '共有スクロール',
        material: getScrollMaterialType(scroll),
        effect: scroll.effect || { type: 'custom', label: '未設定', config: {} },
        blueprint: scroll.blueprint
    };
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    if ('CompressionStream' in window) {
        const compressed = await transformShareBytes(bytes, CompressionStream, SHARE_QR_MAX_COMPRESSED_BYTES);
        return `z.${bytesToBase64Url(compressed)}`;
    }
    if (bytes.length > SHARE_QR_MAX_COMPRESSED_BYTES) {
        throw new Error('この端末では大きな設計図を共有できません。別のブラウザーをお試しください。');
    }
    return `j.${bytesToBase64Url(bytes)}`;
}

function safeSharedText(value, fallback, maxLength = 80) {
    return typeof value === 'string' && value.length > 0 && value.length <= maxLength
        ? value
        : fallback;
}

function validateSharedScroll(payload) {
    if (!payload || payload.version !== 1 || !payload.blueprint || typeof payload.blueprint !== 'object') {
        throw new Error('共有データの形式が正しくありません。');
    }
    const sourceGears = payload.blueprint.gears;
    if (!Array.isArray(sourceGears) || sourceGears.length < 1 || sourceGears.length > 200) {
        throw new Error('共有データのギア数が正しくありません。');
    }
    const sizes = new Set(['XXS', 'SS', 'S', 'M', 'L', 'LL', '3L', '4L', 'MAX']);
    const designTypes = new Set(['INDUSTRIAL', 'ALCHEMICAL', 'LOGISTICS', 'CLOCKWORK', 'PRODUCTION']);
    const processModes = new Set([
        'NONE', 'POWER_STORAGE', 'FOG_COLLECTION', 'RESOURCE_COLLECTION', 'TRANSFORM',
        'FOG_TO_WATER', 'TERRAIN_TRANSFORM', 'ERA_SHIFT', 'TARGET_SHIFT_UP',
        'TARGET_SHIFT_DOWN', 'TARGET_SHIFT_LEFT', 'TARGET_SHIFT_RIGHT', 'CONDITIONAL_CONTROL'
    ]);
    const gearIds = new Set(sourceGears.map((gear, index) => safeSharedText(gear?.id, `shared-${index}`, 100)));
    const seenGearIds = new Set();
    const gears = sourceGears.map((gear, index) => {
        if (!gear || typeof gear !== 'object' || Array.isArray(gear)
            || !Number.isInteger(gear.q) || !Number.isInteger(gear.r)
            || Math.abs(gear.q) > 10000 || Math.abs(gear.r) > 10000
            || !sizes.has(gear.size)
            || !Number.isInteger(gear.layer) || gear.layer < 0 || gear.layer > 2) {
            throw new Error('共有データに不正なギア設定があります。');
        }
        const id = safeSharedText(gear.id, `shared-${index}`, 100);
        if (seenGearIds.has(id)) throw new Error('共有データのギアIDが重複しています。');
        seenGearIds.add(id);
        const designType = designTypes.has(gear.designType) ? gear.designType : ['INDUSTRIAL', 'ALCHEMICAL', 'CLOCKWORK'][gear.layer];
        return {
            id,
            q: gear.q,
            r: gear.r,
            size: gear.size,
            layer: gear.layer,
            isCore: Boolean(gear.isCore),
            angle: Number.isFinite(gear.angle) ? Math.max(-1000000, Math.min(1000000, gear.angle)) : 0,
            rotationSpeedLevel: normalizeCoreRotationSpeedLevel(
                gear.rotationSpeedLevel ?? 4,
                gear.rotationSpeedVersion ?? (gear.rotationSpeedLevel == null ? CORE_ROTATION_SPEED_VERSION : 1)
            ),
            rotationSpeedVersion: CORE_ROTATION_SPEED_VERSION,
            isLocked: Boolean(gear.isLocked),
            designType,
            processMode: processModes.has(gear.processMode) ? gear.processMode : 'NONE',
            terrainTargetType: safeSharedText(gear.terrainTargetType, 'IRON_VEIN', 80),
            controlAction: safeSharedText(gear.controlAction, 'STOP_MAIN_GEAR', 80),
            controlCondition: safeSharedText(gear.controlCondition, 'ROTATIONS', 80),
            controlRotationCount: Number.isFinite(gear.controlRotationCount) ? Math.max(1, Math.min(100000, gear.controlRotationCount)) : 1,
            controlItemType: safeSharedText(gear.controlItemType, 'wood', 80),
            controlItemCount: Number.isFinite(gear.controlItemCount) ? Math.max(1, Math.min(100000, gear.controlItemCount)) : 1,
            controlTargetGearIds: Array.isArray(gear.controlTargetGearIds)
                ? gear.controlTargetGearIds.filter(targetId => typeof targetId === 'string' && gearIds.has(targetId))
                : []
        };
    });
    if (gears.filter(gear => gear.isCore).length !== 1) {
        throw new Error('共有データにはメインギアが1つ必要です。');
    }
    const sourceBelts = payload.blueprint.belts || [];
    if (!Array.isArray(sourceBelts) || sourceBelts.length > 300) {
        throw new Error('共有データのベルト設定が正しくありません。');
    }
    const belts = sourceBelts.map((belt, index) => {
        if (!belt || typeof belt !== 'object' || !Array.isArray(belt.gearIds)
            || belt.gearIds.length < 2 || belt.gearIds.length > 200
            || belt.gearIds.some(id => typeof id !== 'string' || !gearIds.has(id))) {
            throw new Error('共有データに不正なベルト設定があります。');
        }
        const beltGearIds = [...new Set(belt.gearIds)];
        if (beltGearIds.length < 2) throw new Error('共有データに不正なベルト設定があります。');
        return {
            id: safeSharedText(belt.id, `shared-belt-${index}`, 100),
            gearIds: beltGearIds
        };
    });
    const effectTypes = new Set(['custom', 'steam_boost', 'fog_stabilize', 'gear_sync']);
    const effectType = effectTypes.has(payload.effect?.type) ? payload.effect.type : 'custom';
    const effectLabels = {
        custom: '未設定',
        steam_boost: '蒸気増幅',
        fog_stabilize: '霧安定化',
        gear_sync: 'ギア同期'
    };
    return {
        name: safeSharedText(payload.name, '共有スクロール', 80),
        material: SCROLL_MATERIAL_BY_TYPE.has(payload.material) ? payload.material : 'paper',
        effect: {
            type: effectType,
            label: effectLabels[effectType],
            config: effectType === 'steam_boost'
                ? { boost: Number.isFinite(payload.effect?.config?.boost) ? Math.max(0, Math.min(100000, payload.effect.config.boost)) : 20 }
                : effectType === 'fog_stabilize' ? { density: 1 }
                : effectType === 'gear_sync' ? { sync: true }
                : {}
        },
        blueprint: { gears, belts }
    };
}

function closeShareModal() {
    stopQrCamera();
    lastShareCameraQrData = '';
    if (shareModal) shareModal.hidden = true;
}

function renderShareQrPage() {
    const total = shareQrImages.length;
    if (!total) return;
    shareQrPage = Math.max(0, Math.min(total - 1, shareQrPage));
    shareQr.src = shareQrImages[shareQrPage];
    shareQr.hidden = false;
    sharePages.hidden = total < 2;
    sharePageLabel.textContent = `${shareQrPage + 1} / ${total}`;
    sharePreviousButton.disabled = shareQrPage === 0;
    shareNextButton.disabled = shareQrPage === total - 1;
}

function renderQrPng(qrCode) {
    const moduleCount = qrCode.getModuleCount();
    const quietZone = 4;
    const pixelsPerModule = 8;
    const canvasElement = document.createElement('canvas');
    canvasElement.width = canvasElement.height = (moduleCount + quietZone * 2) * pixelsPerModule;
    const context = canvasElement.getContext('2d');
    if (!context) throw new Error('QR画像を作成できませんでした。');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvasElement.width, canvasElement.height);
    context.fillStyle = '#000';
    for (let row = 0; row < moduleCount; row++) {
        for (let column = 0; column < moduleCount; column++) {
            if (!qrCode.isDark(row, column)) continue;
            context.fillRect(
                (column + quietZone) * pixelsPerModule,
                (row + quietZone) * pixelsPerModule,
                pixelsPerModule,
                pixelsPerModule
            );
        }
    }
    return canvasElement.toDataURL('image/png');
}

async function openShareModal(scroll) {
    if (!scroll || !shareModal) return;
    stopQrCamera();
    shareModal.hidden = false;
    shareCameraPreview.hidden = true;
    shareQr.hidden = true;
    sharePages.hidden = true;
    shareQrImages = [];
    shareQrPage = 0;
    shareSaveButton.disabled = true;
    shareStatus.textContent = '設計図を圧縮しています...';
    try {
        const encoded = await encodeSharedScroll(scroll);
        const singleData = `FOGSGEAR-SCROLL:1:${encoded}`;
        const qrValues = new TextEncoder().encode(singleData).length <= 1800
            ? [singleData]
            : (() => {
                const transferId = Array.from(crypto.getRandomValues(new Uint8Array(8)), byte =>
                    byte.toString(16).padStart(2, '0')).join('');
                const chunks = encoded.match(new RegExp(`.{1,${SHARE_QR_PART_LENGTH}}`, 'g')) || [];
                if (chunks.length > SHARE_QR_MAX_PARTS) {
                    throw new Error(`設計図が大きすぎて共有できません。ギアやベルトを減らしてください（上限 ${SHARE_QR_MAX_PARTS}枚）。`);
                }
                return chunks.map((chunk, index) =>
                    `FOGSGEAR-SCROLL-PART:1:${transferId}:${index + 1}:${chunks.length}:${chunk}`);
            })();
        for (let index = 0; index < qrValues.length; index++) {
            shareStatus.textContent = qrValues.length > 1
                ? `共有画像を作成しています... ${index + 1}/${qrValues.length}`
                : '共有画像を作成しています...';
            await new Promise(resolve => requestAnimationFrame(() => resolve()));
            const qrCode = window.qrcode(0, 'M');
            qrCode.addData(qrValues[index], 'Byte');
            try {
                qrCode.make();
            } catch (error) {
                if (typeof error === 'string' && error.includes('code length overflow')) {
                    throw new Error('共有画像1枚の容量を超えました。設計図を分割して再度お試しください。');
                }
                throw error;
            }
            shareQrImages.push(renderQrPng(qrCode));
        }
        renderShareQrPage();
        shareSaveButton.disabled = false;
        shareStatus.textContent = qrValues.length > 1
            ? `${scroll.name || 'スクロール'} の共有画像です。すべての画像を相手に渡してください。`
            : `${scroll.name || 'スクロール'} の共有画像を保存できます。`;
    } catch (error) {
        shareStatus.textContent = error instanceof Error ? error.message : String(error) || '共有画像を作成できませんでした。';
        sharePages.hidden = true;
        console.error('Scroll QR image creation failed.', error);
    }
}

function saveQrImage() {
    if (shareQr.hidden || !shareQr.src) return;
    const scroll = getSelectedScroll();
    const safeName = String(scroll?.name || 'scroll')
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
        .slice(0, 60);
    const download = document.createElement('a');
    download.href = shareQrImages[shareQrPage];
    download.download = shareQrImages.length > 1
        ? `FogsGear-${safeName}-${String(shareQrPage + 1).padStart(2, '0')}-of-${String(shareQrImages.length).padStart(2, '0')}.png`
        : `FogsGear-${safeName}.png`;
    download.click();
    shareStatus.textContent = shareQrImages.length > 1
        ? `共有画像 ${shareQrPage + 1}/${shareQrImages.length} を保存しました。すべての画像を相手に渡してください。`
        : '共有画像を保存しました。ファイルとして相手に渡してください。';
}

async function decodeSharedScroll(value) {
    const match = /^FOGSGEAR-SCROLL:1:([zj])\.([A-Za-z0-9_-]+)$/.exec(value);
    if (!match) throw new Error('Fogs Gearの共有QR画像ではありません。');
    let bytes = base64UrlToBytes(match[2]);
    if (bytes.length > SHARE_QR_MAX_COMPRESSED_BYTES) throw new Error('共有データが大きすぎます。');
    if (match[1] === 'z') {
        if (!('DecompressionStream' in window)) throw new Error('このブラウザーは共有データの展開に対応していません。');
        bytes = await transformShareBytes(bytes, DecompressionStream, 2 * 1024 * 1024);
    }
    return validateSharedScroll(JSON.parse(new TextDecoder().decode(bytes)));
}

async function importSharedScrollData(value) {
    try {
        const partMatch = /^FOGSGEAR-SCROLL-PART:1:([A-Za-z0-9_-]{8,24}):(\d{1,2}):(\d{1,2}):([A-Za-z0-9_.-]+)$/.exec(value);
        if (partMatch) {
            const [, transferId, indexText, totalText, chunk] = partMatch;
            const index = Number(indexText);
            const total = Number(totalText);
            if (total < 2 || total > SHARE_QR_MAX_PARTS || index < 1 || index > total) {
                throw new Error('共有画像の分割情報が正しくありません。');
            }
            if (!chunk || chunk.length > SHARE_QR_PART_LENGTH) {
                throw new Error('共有画像の内容が正しくありません。');
            }
            const now = Date.now();
            sharedScrollParts.forEach((entry, id) => {
                if (now - entry.updatedAt > 15 * 60 * 1000) sharedScrollParts.delete(id);
            });
            if (!sharedScrollParts.has(transferId) && sharedScrollParts.size >= 5) {
                const oldest = [...sharedScrollParts.entries()]
                    .sort((first, second) => first[1].updatedAt - second[1].updatedAt)[0];
                if (oldest) sharedScrollParts.delete(oldest[0]);
            }
            let transfer = sharedScrollParts.get(transferId);
            if (!transfer) {
                transfer = { total, chunks: new Map(), updatedAt: now };
                sharedScrollParts.set(transferId, transfer);
            }
            if (transfer.total !== total) throw new Error('異なる共有画像が混在しています。最初から読み込み直してください。');
            if (transfer.chunks.has(index) && transfer.chunks.get(index) !== chunk) {
                throw new Error('同じ番号の共有画像に異なる内容があります。');
            }
            const duplicate = transfer.chunks.has(index);
            transfer.chunks.set(index, chunk);
            transfer.updatedAt = now;
            const received = transfer.chunks.size;
            if (received < total) {
                shareStatus.textContent = `共有QR ${index}/${total}枚目を${duplicate ? '再読込しました' : '読み込みました'}（受信 ${received}/${total}枚）。順不同で続けて読み込めます。`;
                return false;
            }
            value = `FOGSGEAR-SCROLL:1:${[...Array(total)].map((_, partIndex) => transfer.chunks.get(partIndex + 1)).join('')}`;
            sharedScrollParts.delete(transferId);
        }
        const shared = await decodeSharedScroll(value);
        if (!window.confirm(`「${shared.name}」をスクロール書庫に取り込みますか？`)) {
            shareStatus.textContent = 'スクロールの取り込みをキャンセルしました。';
            return false;
        }
        if ((localStorage.getItem(GAME_PROGRESS_EPOCH_KEY) || '') !== gameProgressEpoch) {
            throw new Error('ゲームデータがリセットされました。この画面を再読み込みしてから取り込んでください。');
        }
        const existingNames = new Set(library.map(scroll => String(scroll.name || '').toLocaleLowerCase()));
        let name = shared.name;
        if (existingNames.has(name.toLocaleLowerCase())) {
            const baseName = `${name}（共有）`;
            name = baseName;
            let suffix = 2;
            while (existingNames.has(name.toLocaleLowerCase())) name = `${baseName} ${suffix++}`;
        }
        const imported = {
            id: `scroll-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            name,
            createdAt: Date.now(),
            effect: shared.effect,
            blueprint: shared.blueprint,
            material: shared.material,
            metadata: { source: 'qr-share', version: 1 }
        };
        const updatedLibrary = [imported, ...library];
        localStorage.setItem(LIBRARY_KEY, JSON.stringify(updatedLibrary));
        library = updatedLibrary;
        selectedScrollId = imported.id;
        renderedScrollId = null;
        renderList();
        renderDetail();
        resizePreview();
        window.alert(`「${name}」をスクロール書庫に取り込みました。`);
        return true;
    } catch (error) {
        console.error('Shared scroll import failed.', error);
        const message = error.message || '共有スクロールを取り込めませんでした。';
        shareStatus.textContent = message;
        return false;
    }
}

async function importQrImage(file, position, total) {
    const prefix = total > 1 ? `選択画像 ${position}/${total}: ` : '';
    if (!file) return false;
    if (!file.type.startsWith('image/')) {
        shareStatus.textContent = `${prefix}画像ファイルを選択してください。`;
        return false;
    }

    if (file.size > 12 * 1024 * 1024) {
        shareStatus.textContent = `${prefix}画像が大きすぎます。12MB以下のQR画像を選んでください。`;
        return false;
    }
    shareStatus.textContent = `${prefix}QR画像を読み取っています...`;
    let bitmap;
    try {
        if (typeof window.jsQR !== 'function') throw new Error('QR画像読み取り機能を読み込めませんでした。');
        bitmap = typeof window.createImageBitmap === 'function'
            ? await window.createImageBitmap(file)
            : await loadQrImageElement(file);
        if (bitmap.width > 4096 || bitmap.height > 4096) throw new Error('画像の解像度が大きすぎます。');
        if (bitmap.width * bitmap.height > 12 * 1024 * 1024) throw new Error('画像の画素数が大きすぎます。');
        const imageCanvas = document.createElement('canvas');
        imageCanvas.width = bitmap.width;
        imageCanvas.height = bitmap.height;
        const imageContext = imageCanvas.getContext('2d', { willReadFrequently: true });
        if (!imageContext) throw new Error('画像を読み込めませんでした。');
        imageContext.drawImage(bitmap, 0, 0);
        const imageData = imageContext.getImageData(0, 0, bitmap.width, bitmap.height);
        const result = window.jsQR(imageData.data, bitmap.width, bitmap.height, { inversionAttempts: 'attemptBoth' });
        if (!result?.data) throw new Error('画像からQRコードを読み取れませんでした。');
        const partMatch = /^FOGSGEAR-SCROLL-PART:1:[A-Za-z0-9_-]{8,24}:(\d{1,2}):(\d{1,2}):/.exec(result.data);
        const partLabel = partMatch ? `共有QR ${Number(partMatch[1])}/${Number(partMatch[2])}枚目: ` : '';
        if (await importSharedScrollData(result.data)) {
            shareStatus.textContent = `${prefix}${partLabel}設計図を取り込みました。`;
            return true;
        }
        return false;
    } catch (error) {
        shareStatus.textContent = `${prefix}${error instanceof Error ? error.message : String(error) || 'QR画像を読み込めませんでした。'}`;
        console.error('QR image import failed.', error);
        return false;
    } finally {
        bitmap?.close?.();
    }
}

async function importQrImages(files) {
    const selectedFiles = [...files];
    let importedCount = 0;
    for (let index = 0; index < selectedFiles.length; index++) {
        const imported = await importQrImage(selectedFiles[index], index + 1, selectedFiles.length);
        if (imported) importedCount++;
    }
    if (selectedFiles.length > 1 && importedCount) {
        shareStatus.textContent = `${selectedFiles.length}枚中${importedCount}件の設計図を取り込みました。`;
    }
}

function stopQrCamera() {
    if (shareCameraAnimationFrame) cancelAnimationFrame(shareCameraAnimationFrame);
    shareCameraAnimationFrame = 0;
    shareCameraStream?.getTracks().forEach(track => track.stop());
    shareCameraStream = null;
    if (shareCameraVideo) shareCameraVideo.srcObject = null;
    if (shareCameraPreview) shareCameraPreview.hidden = true;
    if (shareCameraStartButton) shareCameraStartButton.disabled = false;
}

function scanQrCameraFrame(timestamp) {
    if (!shareCameraStream || !shareCameraVideo) return;
    shareCameraAnimationFrame = requestAnimationFrame(scanQrCameraFrame);
    if (timestamp - lastShareCameraScanAt < 180 || shareCameraVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    lastShareCameraScanAt = timestamp;
    const videoWidth = shareCameraVideo.videoWidth;
    const videoHeight = shareCameraVideo.videoHeight;
    if (!videoWidth || !videoHeight) return;
    const scale = Math.min(1, 960 / videoWidth);
    const width = Math.round(videoWidth * scale);
    const height = Math.round(videoHeight * scale);
    shareCameraCanvas.width = width;
    shareCameraCanvas.height = height;
    const context = shareCameraCanvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
        stopQrCamera();
        shareStatus.textContent = 'カメラ映像を読み取れません。画像ファイルから読み込んでください。';
        return;
    }
    context.drawImage(shareCameraVideo, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    const result = window.jsQR?.(imageData.data, width, height, { inversionAttempts: 'attemptBoth' });
    if (result?.data?.startsWith('FOGSGEAR-SCROLL:') || result?.data?.startsWith('FOGSGEAR-SCROLL-PART:')) {
        const sharedData = result.data;
        if (sharedData === lastShareCameraQrData) return;
        lastShareCameraQrData = sharedData;
        importSharedScrollData(sharedData).then(imported => {
            if (imported) {
                stopQrCamera();
                lastShareCameraQrData = '';
                shareStatus.textContent = 'カメラで共有画像を読み込みました。';
            }
        });
        return;
    }
    if (result?.data) shareStatus.textContent = 'Fogs Gearの共有QRコードをカメラに映してください。';
}

async function startQrCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
        shareStatus.textContent = isSecureContext
            ? 'このブラウザーではカメラを利用できません。QR画像から読み込んでください。'
            : 'カメラ読み取りにはHTTPS接続が必要です。QR画像から読み込んでください。';
        return;
    }
    if (typeof window.jsQR !== 'function') {
        shareStatus.textContent = 'QR読み取り機能を読み込めませんでした。ページを再読み込みしてください。';
        return;
    }
    stopQrCamera();
    lastShareCameraQrData = '';
    shareCameraPreview.hidden = false;
    shareCameraStartButton.disabled = true;
    shareStatus.textContent = 'カメラを起動しています...';
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: 'environment' } }
        });
        if (shareModal.hidden || !shareCameraStartButton.disabled) {
            stream.getTracks().forEach(track => track.stop());
            return;
        }
        shareCameraStream = stream;
        shareCameraVideo.srcObject = shareCameraStream;
        await shareCameraVideo.play();
        lastShareCameraScanAt = 0;
        shareStatus.textContent = '共有QRコードをカメラに映してください。';
        shareCameraAnimationFrame = requestAnimationFrame(scanQrCameraFrame);
    } catch (error) {
        stopQrCamera();
        const message = error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError'
            ? 'カメラの使用が許可されていません。ブラウザーのカメラ設定を確認してください。'
            : error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError'
                ? '利用できるカメラが見つかりません。QR画像から読み込んでください。'
                : error.name === 'NotReadableError'
                    ? 'カメラを起動できません。他のアプリでカメラを使用していないか確認してください。'
                    : error.message || 'カメラを起動できませんでした。';
        shareStatus.textContent = message;
        console.error('QR camera startup failed.', error);
    }
}

function loadQrImageElement(file) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        const objectUrl = URL.createObjectURL(file);
        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('選択した画像を開けませんでした。'));
        };
        image.src = objectUrl;
    });
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
        targets[scrollId] = { ...playerPosition, startedAt: Date.now() };
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
    previewState.zoomScale = Math.min(4.5, Math.min((renderer.width - 54) / width, (renderer.height - 54) / height));
    previewState.offsetX = -((bounds.minX + bounds.maxX) / 2);
    previewState.offsetY = -((bounds.minY + bounds.maxY) / 2);
}

function renderPreview(scroll) {
    const blueprintSignature = JSON.stringify(scroll.blueprint || {});
    if (renderedScrollId === scroll.id && renderedScrollBlueprint === blueprintSignature) return;
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
    renderedScrollBlueprint = blueprintSignature;
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
    const filtered = getFilteredScrolls();
    const activeScrollIds = new Set(getActiveScrollIds());
    countElement.textContent = String(filtered.length);
    listElement.replaceChildren();
    if (!filtered.length) {
        const empty = document.createElement('p');
        empty.className = 'scroll-list-empty';
        empty.textContent = currentMaterial === 'exhausted'
            ? 'レガシー設計はありません。'
            : currentMaterial !== 'all'
                ? 'この種類のスクロールはありません。'
                : library.length ? 'すべて設備にセット中です。取り外すと手元に戻ります。' : '保存済みスクロールはありません。';
        listElement.appendChild(empty);
        return;
    }
    filtered.forEach(scroll => {
        const isRunning = activeScrollIds.has(scroll.id);
        const item = document.createElement('div');
        item.className = `scroll-list-item${scroll.id === selectedScrollId ? ' active' : ''}${isRunning ? ' running' : ''}`;
        item.dataset.scrollId = scroll.id;
        const selectButton = document.createElement('button');
        selectButton.className = 'scroll-list-select';
        selectButton.type = 'button';
        const typeLabel = document.createElement('span');
        typeLabel.className = 'scroll-list-type';
        typeLabel.textContent = SCROLL_MATERIAL_BY_TYPE.get(getScrollMaterialType(scroll))?.label || '紙';
        const nameLabel = document.createElement('span');
        nameLabel.className = 'scroll-list-name';
        nameLabel.textContent = scroll.name || '名前なしスクロール';
        selectButton.append(typeLabel, nameLabel);
        const editButton = document.createElement('button');
        editButton.className = 'scroll-list-edit';
        editButton.type = 'button';
        editButton.setAttribute('aria-label', 'スクロールを編集');
        editButton.title = 'スクロールを編集';
        editButton.textContent = '⚙︎';
        item.append(selectButton, editButton);
        selectButton.dataset.scrollId = scroll.id;
        selectButton.setAttribute('aria-label', `${getMaterialLabel(scroll)}: ${scroll.name || '名前なしスクロール'}、${isRunning ? '起動中' : '停止中'}`);
        editButton.dataset.scrollId = scroll.id;
        listElement.appendChild(item);
    });
}

function renderDetail() {
    const scroll = getSelectedScroll();
    const hasScroll = Boolean(scroll);
    emptyElement.hidden = hasScroll;
    detailElement.hidden = !hasScroll;
    if (!scroll) {
        stopPreviewAnimation();
        previewState.running = false;
        return;
    }
    const gearCount = Array.isArray(scroll.blueprint?.gears) ? scroll.blueprint.gears.length : 0;
    const durabilityLimit = getDurabilityLimit(scroll);
    const usedRotations = Math.min(durabilityLimit, getUsedRotations(scroll));
    const exhausted = isExhausted(scroll);
    const installed = getInstalledScrollIds().has(scroll.id);
    const requestedRunning = getActiveScrollIds().includes(scroll.id);
    const target = getActiveScrollTargets()[scroll.id];
    const enginePowered = isPreviewOnly && !followRunningState || hasEnginePower();
    const isRunning = (isPreviewOnly && !followRunningState || requestedRunning && enginePowered) && !exhausted;
    previewState.running = isRunning;
    renderPreview(scroll);
    if (!isPreviewOnly) syncPreviewLocks(scroll);
    const effectiveRunning = isRunning && !previewState.invalid;
    if (!isPreviewOnly && requestedRunning && (exhausted || !enginePowered)) setScrollRunning(scroll.id, false);
    else if (!isPreviewOnly && requestedRunning && previewState.invalid) setScrollRunning(scroll.id, false);
    previewState.running = effectiveRunning;
    if (effectiveRunning) startPreviewAnimation();
    else stopPreviewAnimation();
    if (isEmbedded) document.body.classList.toggle('scroll-is-running', effectiveRunning);
    nameElement.textContent = scroll.name || '名前なしスクロール';
    materialElement.textContent = getMaterialLabel(scroll);
    metaElement.textContent = `${gearCount}個のギア / 効果: ${scroll.effect?.label || '未設定'}`;
    durabilityElement.textContent = `${Math.floor(usedRotations + 0.000001)} / ${durabilityLimit}回転`;
    durabilityElement.classList.toggle('is-exhausted', exhausted);
    statusElement.textContent = isPreviewOnly
        ? previewState.invalid ? 'ギア接続に矛盾があるため動作できません。' : '動作プレビュー中（ゲーム内の起動状態には影響しません）。'
        : exhausted
        ? `スクロール耐久度を使い切りました（${durabilityLimit}/${durabilityLimit}回転）。写本するか、不要なら削除できます。`
        : previewState.invalid
        ? 'ギア接続に矛盾があるため起動できません。'
        : !enginePowered ? '動力が停止しているため起動できません。'
        : effectiveRunning ? 'このスクロールは起動中です。' : 'このスクロールは停止中です。';
    if (effectiveRunning && Number.isInteger(target?.x) && Number.isInteger(target?.y)) {
        statusElement.textContent += ` / 対象セル (${target.x}, ${target.y})`;
    }
    toggleButton.textContent = effectiveRunning ? 'スクロールを停止' : 'スクロールを起動';
    toggleButton.hidden = isPreviewOnly;
    toggleButton.classList.toggle('btn-reset', effectiveRunning);
    toggleButton.classList.toggle('btn-visibility', !effectiveRunning);
    toggleButton.disabled = previewState.invalid || exhausted;
    copyButton.hidden = !isScrollBook || !hasScroll || installed;
    deleteButton.hidden = !isScrollBook || !hasScroll || installed;
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

function getInstalledScrollIds() {
    try {
        const buildings = JSON.parse(localStorage.getItem(BUILDINGS_KEY) || '[]');
        return new Set(Array.isArray(buildings)
            ? buildings.flatMap(building => [
                building?.craftingScrollId,
                building?.vehicle?.movementScrollId,
                building?.automaton?.movementScrollId,
                building?.stationControl?.movementScrollId
            ]).filter(id => typeof id === 'string' && id)
            : []);
    } catch (error) {
        console.error('設置中スクロールを確認できませんでした。', error);
        return new Set(library.map(scroll => scroll.id));
    }
}

function selectScroll(scrollId) {
    selectedScrollId = scrollId;
    renderedScrollId = null;
    renderList();
    renderDetail();
    resizePreview();
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
    const wasActive = tab.classList.contains('active');
    if (isEmbedded && wasActive) {
        tabs.forEach(item => {
            item.classList.remove('active');
            item.setAttribute('aria-selected', 'false');
        });
        setListVisibility(false);
        return;
    }
    setListVisibility(true);
    const deselect = wasActive;
    currentMaterial = deselect ? 'all' : tab.dataset.material;
    tabs.forEach(item => {
        const active = !deselect && item === tab;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', String(active));
    });
    const visible = getFilteredScrolls();
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
    if (!scroll || previewState.invalid || isExhausted(scroll)) return;
    const isRunning = getActiveScrollIds().includes(scroll.id);
    if (!isRunning) requestEngineResume();
    setScrollRunning(scroll.id, !isRunning);
    previewState.running = !isRunning;
    renderDetail();
});

copyButton?.addEventListener('click', () => openCopyModal(getSelectedScroll()));
deleteButton?.addEventListener('click', () => deleteSelectedScroll(getSelectedScroll()));
copyForm?.addEventListener('submit', event => {
    event.preventDefault();
    const scroll = getSelectedScroll();
    const name = copyNameInput.value.trim();
    if (!scroll || !name || pendingCopyRequestId) return;
    requestCopy(scroll.id, name, copyMaterialSelect.value);
});
document.getElementById('scroll-copy-close')?.addEventListener('click', closeCopyModal);
document.getElementById('scroll-copy-cancel')?.addEventListener('click', closeCopyModal);
copyModal?.addEventListener('click', event => {
    if (event.target === copyModal) closeCopyModal();
});
copyMaterialSelect?.addEventListener('change', () => {
    const scroll = getSelectedScroll();
    if (scroll) copyCostElement.textContent = `消費: 真鍮 ${getCopyMaterialCost(scroll)}（メインギア以外のギアの設置コスト合計）`;
});
window.addEventListener('message', event => {
    if ((event.origin !== window.location.origin && event.origin !== 'null') || event.source !== window.parent
        || event.data?.type !== 'fogsgear:copy-scroll-result'
        || event.data.requestId !== pendingCopyRequestId) return;
    pendingCopyRequestId = null;
    copySubmitButton.disabled = false;
    if (event.data.success) {
        library = readLibrary();
        selectedScrollId = event.data.scrollId;
        currentMaterial = 'all';
        tabs.forEach(tab => {
            const active = tab.dataset.material === 'all';
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-selected', String(active));
        });
        renderedScrollId = null;
        copyModal.hidden = true;
        renderList();
        renderDetail();
        resizePreview();
        window.alert(`「${event.data.name}」を作成しました。消費した真鍮: ${event.data.cost}`);
    } else {
        copyStatusElement.textContent = event.data.message || '写本に失敗しました。';
    }
});
window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !copyModal.hidden) closeCopyModal();
});

shareButton?.addEventListener('click', () => openShareModal(getSelectedScroll()));
shareSaveButton?.addEventListener('click', saveQrImage);
sharePreviousButton?.addEventListener('click', () => {
    shareQrPage--;
    renderShareQrPage();
});
shareNextButton?.addEventListener('click', () => {
    shareQrPage++;
    renderShareQrPage();
});
shareFileInput?.addEventListener('change', event => {
    const input = event.currentTarget;
    importQrImages(input.files || []).finally(() => {
        input.value = '';
    });
});
shareCameraStartButton?.addEventListener('click', startQrCamera);
shareCameraStopButton?.addEventListener('click', () => {
    stopQrCamera();
    shareStatus.textContent = 'カメラを停止しました。';
});
shareModal?.addEventListener('click', event => {
    if (event.target === shareModal || event.target.closest('#scroll-share-close')) closeShareModal();
});
window.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeShareModal();
});
document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopQrCamera();
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

window.addEventListener('storage', event => {
    if (event.key === GAME_SAVE_KEY) {
        // Power changes update the status, but must not refit and redraw the running canvas.
        renderDetail();
        return;
    }
    if (event.key === LIBRARY_KEY || event.key === BUILDINGS_KEY || event.key === ACTIVE_SCROLL_KEY || event.key === ACTIVE_SCROLL_RUNNING_KEY || event.key === ACTIVE_SCROLL_TARGETS_KEY || event.key === ACTIVE_SCROLL_SYNC_STATE_KEY) {
        library = readLibrary();
        const availableScrolls = getAvailableScrolls();
        if (!availableScrolls.some(scroll => scroll.id === selectedScrollId)) {
            selectedScrollId = availableScrolls[0]?.id || null;
            renderedScrollId = null;
        }
        const previousRenderedScrollId = renderedScrollId;
        const previousRenderedScrollBlueprint = renderedScrollBlueprint;
        renderList();
        renderDetail();
        if (event.key !== LIBRARY_KEY
            || renderedScrollId !== previousRenderedScrollId
            || renderedScrollBlueprint !== previousRenderedScrollBlueprint) resizePreview();
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
const previewScrollId = pageParams.get('scrollId');
const initialScrolls = getAvailableScrolls();
selectedScrollId = initialScrolls.some(scroll => scroll.id === previewScrollId)
    ? previewScrollId
    : initialScrolls[0]?.id || null;
renderList();
renderDetail();
resizePreview();
