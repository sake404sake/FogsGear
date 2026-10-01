// js/main.js - Steampunk Explorer Game Logic
import { MapGenerator, BIOME_COLORS, loadMapSnapshot, saveMapSnapshot } from './mapGenerator.js?v=89';
import { SkinRenderer } from './skinRenderer.js?v=2';
import { CELL_DEFINITIONS, canEnterCell, getCellEntryRule, getMosaicColor } from './cellRules.js';
import { drawCellIcon, loadCellIconAtlas } from './cellIconRenderer.js?v=3';
import { ACTIVE_SCROLL_TARGETS_KEY, CELL_MATERIALS, TERRAIN_TRANSFORM_RECIPES, WORLD_CELL_TYPES, applyCellChanges, chooseEraCellType, getCellCollectionPowerCost, getCellDrops, readCellChanges, saveCellChange } from './worldCells.js?v=3';
import { CRAFTING_ITEMS, CRAFTING_ITEM_BY_ID, CRAFTING_RATE_MULTIPLIER, CRAFTING_RECIPES } from './craftingData.js?v=1';
import { buildTerritoryBorderSegments } from './territoryBorders.js?v=35';
import { GameState as EngineGameState } from '../../GearSystem/js/GameState.js?v=runtime-24';
import { GearManager as EngineGearManager } from '../../GearSystem/js/GearManager.js?v=runtime-5';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let cellIconAtlas = null;
const INVENTORY_ITEMS_KEY = 'steampunk_explorer_inventory_items';

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
    territoryBorderSegments: [],
    tileSize: 32,
    cols: 2000,
    rows: 1000,
    worldSeed: '',
    generator: null,
    skin: new SkinRenderer(),
    inventoryItems: new Set(),
    cellChanges: {},
    activeScrollTargets: {},
    cellEntryRules: { types: {}, cells: {} }
};
try {
    const savedItems = JSON.parse(localStorage.getItem(INVENTORY_ITEMS_KEY) || '[]');
    if (Array.isArray(savedItems)) state.inventoryItems = new Set(savedItems.filter(item => typeof item === 'string'));
} catch (error) {}

const activePointers = new Map();
const MAP_UNLOCK_KEY = 'fogsgear_world_unlocks';
const COASTAL_MAP_SIZE = { width: 640, height: 360 };
const FULL_MAP_SIZE = { width: 2000, height: 1000 };
const SAVE_BACKUP_FORMAT = 'fogsgear-save';
const SAVE_BACKUP_VERSION = 2;
const CELL_CHANGES_PREFIX = 'fogsgear_world_cell_changes:';
const LEGACY_SAVE_BACKUP_KEYS = [
    'fog_thermo_save',
    'steampunk_explorer_settings',
    'steampunk_explorer_player_pos',
    'fogsgear_scroll_library',
    'fogsgear_scroll_draft_paper',
    'fogsgear_scroll_draft_cloth',
    'fogsgear_world_unlocks',
    'fogsgear_cell_entry_rules',
    'fogsgear_scroll_effect_log',
    'steampunk_explorer_skin_url',
    'steampunk_explorer_skin_source',
    'steampunk_explorer_skin_name'
];
const SAVE_BACKUP_KEYS = [
    ...LEGACY_SAVE_BACKUP_KEYS,
    INVENTORY_ITEMS_KEY,
    'fogsgear_active_scroll_id',
    'fogsgear_active_scroll_running',
    ACTIVE_SCROLL_TARGETS_KEY,
    'fogsgear_active_scroll_sync_state'
];
let pendingSaveBackup = null;

function isGameSaveStorageKey(key) {
    return key === 'fog_thermo_save'
        || key?.startsWith('fogsgear_') && !key.startsWith(CELL_CHANGES_PREFIX)
        || key?.startsWith('steampunk_explorer_');
}

function getSaveBackupKeys() {
    const keys = new Set(SAVE_BACKUP_KEYS);
    for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (isGameSaveStorageKey(key)) keys.add(key);
    }
    return [...keys];
}

function isMainlandUnlocked() {
    try {
        const unlocks = JSON.parse(localStorage.getItem(MAP_UNLOCK_KEY) || '{}');
        return unlocks.mainland === true;
    } catch (error) {
        return false;
    }
}
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let cameraStart = { x: 0, y: 0 };
let initialPinchDist = null;
let initialZoom = 1.0;
let selectedSavedScrollId = null;
let inventoryRenderSignature = '';
let craftingRenderSignature = '';

const INVENTORY_ITEM_DEFINITIONS = {
    paper_scroll: { name: 'スクロール（紙）', description: '新しいギア設計を記録する紙の巻物。ギア編集画面で設計を作成できます。', icon: '📜', image: null, meta: '未使用・新規設計用' },
    cloth_scroll: { name: 'スクロール（布）', description: '新しいギア設計を記録する布の巻物。ギア編集画面で設計を作成できます。', icon: '🧵', image: null, meta: '未使用・新規設計用' },
    scroll_book: { name: 'スクロールブック', description: '保存済みスクロールを一覧で確認し、使用やギア編集を行える記録帳です。', icon: '📖', image: null, meta: '保存済み設計図' }
};

function openInventoryItem(itemKey, scroll = null) {
    const craftingItem = CRAFTING_ITEM_BY_ID.get(itemKey);
    const definition = craftingItem
        ? { name: craftingItem[1], description: craftingItem[4], meta: `${craftingItem[2]} / ${craftingItem[3]}`, icon: CELL_MATERIALS[itemKey]?.icon || '◈' }
        : INVENTORY_ITEM_DEFINITIONS[itemKey] || INVENTORY_ITEM_DEFINITIONS.paper_scroll;
    const modal = document.getElementById('inventory-item-modal');
    const icon = document.getElementById('inventory-modal-icon');
    const useButton = document.getElementById('inventory-modal-use');
    const editButton = document.getElementById('inventory-modal-edit');
    if (!modal || !icon) return;
    icon.replaceChildren();
    if (craftingItem) {
        icon.appendChild(createCraftingIcon(itemKey));
    } else {
        icon.textContent = definition.icon;
    }
    if (definition.image) {
        const image = document.createElement('img');
        image.src = definition.image;
        image.alt = '';
        image.onerror = () => image.remove();
        icon.appendChild(image);
    }
    document.getElementById('inventory-modal-title').textContent = scroll?.name || definition.name;
    document.getElementById('inventory-modal-description').textContent = scroll
        ? `${definition.description} この保存データの効果は「${scroll.effect?.label || '未設定'}」です。`
        : definition.description;
    document.getElementById('inventory-modal-meta').textContent = definition.meta;
    useButton.hidden = !scroll;
    useButton.dataset.scrollId = scroll?.id || '';
    if (editButton) {
        editButton.hidden = !['paper_scroll', 'cloth_scroll'].includes(itemKey);
        editButton.dataset.material = itemKey === 'cloth_scroll' ? 'cloth' : 'paper';
    }
    modal.hidden = false;
}

function createCraftingIcon(itemId) {
    const svgNamespace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNamespace, 'svg');
    const use = document.createElementNS(svgNamespace, 'use');
    svg.setAttribute('viewBox', '0 0 64 64');
    svg.setAttribute('aria-hidden', 'true');
    use.setAttribute('href', `../MainSystem/icons/items/crafting-icons.svg?v=1#i-${itemId}`);
    svg.appendChild(use);
    return svg;
}

function closeInventoryItem() {
    const modal = document.getElementById('inventory-item-modal');
    if (modal) modal.hidden = true;
}

function getStoredSavedScrolls() {
    try {
        const saved = JSON.parse(localStorage.getItem('fogsgear_scroll_library') || '[]');
        return Array.isArray(saved) ? saved : [];
    } catch (error) {
        return [];
    }
}

let appNoticeTimer = null;

function showAppNotice(message) {
    const notice = document.getElementById('app-notice');
    if (!notice) return;
    notice.textContent = message;
    notice.hidden = false;
    clearTimeout(appNoticeTimer);
    appNoticeTimer = setTimeout(() => { notice.hidden = true; }, 3200);
}

function collectSaveBackup() {
    const data = Object.fromEntries(getSaveBackupKeys().map(key => [key, localStorage.getItem(key)]));
    data[INVENTORY_ITEMS_KEY] = JSON.stringify([...state.inventoryItems].filter(item => typeof item === 'string'));
    const cellChanges = {};
    for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key?.startsWith(CELL_CHANGES_PREFIX)) cellChanges[key] = localStorage.getItem(key);
    }
    return {
        format: SAVE_BACKUP_FORMAT,
        version: SAVE_BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        data,
        cellChanges
    };
}

function exportSaveBackup() {
    const backup = collectSaveBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fogsgear-save-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showAppNotice('セーブデータをJSONへ書き出しました。');
}

function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateSaveBackupValue(key, value) {
    if (value === null) return;
    if (typeof value !== 'string' || value.length > 8_000_000) throw new Error('保存データの形式が正しくありません。');
    if (key.startsWith('steampunk_explorer_skin_')) return;
    if (key === 'fogsgear_active_scroll_id') {
        let parsed;
        try { parsed = JSON.parse(value); }
        catch (error) { if (value.trim()) return; throw new Error('起動スクロールの状態が不正です。'); }
        if (typeof parsed !== 'string' && (!Array.isArray(parsed) || parsed.some(id => typeof id !== 'string'))) throw new Error('起動スクロールの状態が不正です。');
        return;
    }
    if (key === 'fogsgear_active_scroll_running') {
        if (value !== 'true' && value !== 'false') throw new Error('起動スクロールの状態が不正です。');
        return;
    }
    let parsed;
    try { parsed = JSON.parse(value); }
    catch (error) {
        if (!LEGACY_SAVE_BACKUP_KEYS.includes(key) && !SAVE_BACKUP_KEYS.includes(key)) return;
        throw new Error('JSON内の保存データを解析できません。');
    }
    if (key === 'fog_thermo_save') {
        const invalidCraftingJobs = parsed?.craftingJobs !== undefined && (!Array.isArray(parsed.craftingJobs)
            || parsed.craftingJobs.some(job => !isRecord(job) || typeof job.recipeKey !== 'string'
                || typeof job.outputItem !== 'string' || !Number.isFinite(Number(job.outputAmount))
                || !Number.isFinite(Number(job.completesAt))));
        if (!isRecord(parsed) || (parsed.gears !== undefined && !Array.isArray(parsed.gears))
            || (parsed.placedGears !== undefined && !Array.isArray(parsed.placedGears))
            || (parsed.materialInventory !== undefined && !isRecord(parsed.materialInventory))
            || invalidCraftingJobs) throw new Error('ギアのセーブデータが不正です。');
    } else if (key === 'steampunk_explorer_settings') {
        if (!isRecord(parsed) || (parsed.seed !== undefined && typeof parsed.seed !== 'string')) throw new Error('ワールド設定が不正です。');
    } else if (key === 'steampunk_explorer_player_pos') {
        if (!isRecord(parsed) || !Number.isInteger(parsed.x) || !Number.isInteger(parsed.y)) throw new Error('プレイヤー位置が不正です。');
    } else if (key === 'fogsgear_scroll_library') {
        if (!Array.isArray(parsed) || parsed.some(scroll => !isRecord(scroll) || (scroll.id !== undefined && typeof scroll.id !== 'string'))) throw new Error('保存ギア一覧が不正です。');
    } else if (key.startsWith('fogsgear_scroll_draft_')) {
        if (!isRecord(parsed) || !Array.isArray(parsed.gears)) throw new Error('編集中ギアのデータが不正です。');
    } else if (key === 'fogsgear_scroll_effect_log') {
        if (!Array.isArray(parsed)) throw new Error('スクロール履歴が不正です。');
    } else if (key === INVENTORY_ITEMS_KEY) {
        if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string')) throw new Error('所持アイテムのデータが不正です。');
    } else if (key === ACTIVE_SCROLL_TARGETS_KEY) {
        if (!isRecord(parsed) || Object.values(parsed).some(target => !isRecord(target) || !Number.isInteger(target.x) || !Number.isInteger(target.y))) throw new Error('スクロール対象位置が不正です。');
    } else if (key === 'fogsgear_active_scroll_sync_state') {
        if (!isRecord(parsed) || Object.values(parsed).some(locks => !isRecord(locks) || Object.values(locks).some(locked => typeof locked !== 'boolean'))) throw new Error('スクロール同期状態が不正です。');
    } else if (['fogsgear_world_unlocks', 'fogsgear_cell_entry_rules'].includes(key) && !isRecord(parsed)) {
        throw new Error('設定データの形式が正しくありません。');
    }
}

function validateSaveBackup(backup) {
    if (!isRecord(backup) || backup.format !== SAVE_BACKUP_FORMAT || ![1, SAVE_BACKUP_VERSION].includes(backup.version)) {
        throw new Error('FogsGearの対応セーブJSONではありません。');
    }
    if (!isRecord(backup.data) || !isRecord(backup.cellChanges)) throw new Error('セーブJSONの構造が不正です。');
    const requiredKeys = backup.version === 1 ? LEGACY_SAVE_BACKUP_KEYS : SAVE_BACKUP_KEYS;
    for (const key of requiredKeys) {
        if (!Object.hasOwn(backup.data, key)) throw new Error('セーブJSONに必要な項目がありません。');
        validateSaveBackupValue(key, backup.data[key]);
    }
    const hasUnsupportedKey = Object.keys(backup.data).some(key => backup.version === 1
        ? !LEGACY_SAVE_BACKUP_KEYS.includes(key)
        : !isGameSaveStorageKey(key));
    if (hasUnsupportedKey) throw new Error('未対応の保存項目が含まれています。');
    Object.entries(backup.data).forEach(([key, value]) => validateSaveBackupValue(key, value));
    Object.entries(backup.cellChanges).forEach(([key, value]) => {
        if (!key.startsWith(CELL_CHANGES_PREFIX) || key.length <= CELL_CHANGES_PREFIX.length || typeof value !== 'string') throw new Error('地形変更データが不正です。');
        let changes;
        try { changes = JSON.parse(value); }
        catch (error) { throw new Error('地形変更データを解析できません。'); }
        if (!isRecord(changes)) throw new Error('地形変更データの形式が正しくありません。');
    });
    return backup;
}

function openSaveImportConfirmation(backup) {
    pendingSaveBackup = backup;
    const changedCells = Object.values(backup.cellChanges).reduce((sum, value) => sum + Object.keys(JSON.parse(value)).length, 0);
    const scrolls = JSON.parse(backup.data.fogsgear_scroll_library || '[]');
    let activeScrollIds = [];
    try {
        const active = JSON.parse(backup.data.fogsgear_active_scroll_id || '[]');
        activeScrollIds = Array.isArray(active) ? active : typeof active === 'string' ? [active] : [];
    } catch (error) {
        if (backup.data.fogsgear_active_scroll_running === 'true') activeScrollIds = [backup.data.fogsgear_active_scroll_id];
    }
    const itemCount = Object.values(JSON.parse(backup.data.fog_thermo_save || '{}').materialInventory || {}).filter(count => Number(count) > 0).length
        + JSON.parse(backup.data[INVENTORY_ITEMS_KEY] || '[]').length;
    document.getElementById('save-transfer-meta').textContent = `${backup.exportedAt ? `書き出し日時: ${backup.exportedAt} / ` : ''}保存ギア ${Array.isArray(scrolls) ? scrolls.length : 0}件 / 起動スクロール ${activeScrollIds.filter(Boolean).length}件 / 所持品 ${itemCount}種 / 地形変更 ${changedCells}件`;
    document.getElementById('save-transfer-modal').hidden = false;
}

function applySaveBackup(backup) {
    const affectedKeys = new Set([...SAVE_BACKUP_KEYS, ...getSaveBackupKeys()]);
    for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key?.startsWith(CELL_CHANGES_PREFIX) || isGameSaveStorageKey(key)) affectedKeys.add(key);
    }
    Object.keys(backup.cellChanges).forEach(key => affectedKeys.add(key));
    const previousValues = new Map([...affectedKeys].map(key => [key, localStorage.getItem(key)]));
    try {
        [...affectedKeys].filter(isGameSaveStorageKey).forEach(key => localStorage.removeItem(key));
        Object.entries(backup.data).forEach(([key, value]) => {
            if (value !== null) localStorage.setItem(key, value);
        });
        [...affectedKeys].filter(key => key.startsWith(CELL_CHANGES_PREFIX)).forEach(key => localStorage.removeItem(key));
        Object.entries(backup.cellChanges).forEach(([key, value]) => localStorage.setItem(key, value));
    } catch (error) {
        affectedKeys.forEach(key => {
            try { localStorage.removeItem(key); }
            catch (rollbackError) {}
        });
        previousValues.forEach((value, key) => {
            try {
                if (value === null) localStorage.removeItem(key);
                else localStorage.setItem(key, value);
            } catch (rollbackError) {}
        });
        throw new Error('保存領域が不足しているため、読み込みを取り消しました。');
    }
    document.getElementById('save-transfer-modal').hidden = true;
    pendingSaveBackup = null;
    const loadingMessage = document.getElementById('loadingMessage');
    if (loadingMessage) loadingMessage.textContent = 'セーブデータを反映しています...';
    document.getElementById('loadingOverlay')?.removeAttribute('hidden');
    if (typeof engineRuntimeState !== 'undefined') engineRuntimeState.lastStorageSaveAt = performance.now();
    setTimeout(() => window.location.reload(), 120);
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
    showAppNotice(`${scroll?.name || 'スクロール'} を使用しました。 ${message}`);
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
        nameButton.dataset.action = 'inspect-scroll';
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
    Object.entries(WORLD_CELL_TYPES).forEach(([typeKey, definition]) => {
        const item = document.createElement('div');
        item.className = 'cell-legend-item';
        item.title = getCellEntryRule({ type: typeKey }, state.cellEntryRules).requiredItems.length
            ? '侵入に必要なアイテムがあります'
            : '侵入条件なし';
        const color = document.createElement('canvas');
        color.className = 'cell-legend-color';
        color.width = 22;
        color.height = 22;
        color.setAttribute('aria-hidden', 'true');
        color.style.backgroundColor = definition.color;
        const iconContext = color.getContext('2d');
        if (cellIconAtlas && iconContext) {
            iconContext.globalAlpha = 0.72;
            drawCellIcon(iconContext, cellIconAtlas, { type: typeKey }, 1, 1, 20);
        }
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

function generateMapInWorker(seed) {
    return new Promise((resolve, reject) => {
        const worker = new Worker('./js/mapWorker.js?v=89', { type: 'module' });
        worker.onmessage = (event) => {
            if (event.data?.type === 'complete') {
                worker.terminate();
                resolve(event.data.generated);
            } else if (event.data?.type === 'error') {
                worker.terminate();
                reject(new Error(event.data.message));
            }
        };
        worker.onerror = (error) => {
            worker.terminate();
            reject(error);
        };
        worker.postMessage({ seed, width: state.cols, height: state.rows, coastalOnly: !isMainlandUnlocked() });
    });
}

async function init() {
    const createRandomSeed = () => {
        const values = new Uint32Array(4);
        crypto.getRandomValues(values);
        return `Island_${Array.from(values, (value) => value.toString(36).padStart(7, '0')).join('')}`;
    };
    let settings = { seed: '', zoom: 0.8, minZoom: 0.25 };
    try {
        settings = { ...settings, ...JSON.parse(localStorage.getItem('steampunk_explorer_settings') || '{}') };
    } catch (error) {}
    if (!settings.seed || settings.seed === 'SteampunkIsland_01') {
        settings.seed = createRandomSeed();
        localStorage.setItem('steampunk_explorer_settings', JSON.stringify(settings));
    }
    state.minZoom = Number(settings.minZoom);
    state.cellEntryRules = loadCellEntryRules();
    state.zoom = Math.max(state.minZoom, Number(settings.zoom));
    state.worldSeed = String(settings.seed || 'SteampunkIsland_01');
    try {
        cellIconAtlas = await loadCellIconAtlas();
    } catch (error) {
        console.warn('Cell icon atlas failed to load; rendering the map without terrain icons.');
    }
    const mainlandUnlocked = isMainlandUnlocked();
    const mapSize = mainlandUnlocked ? FULL_MAP_SIZE : COASTAL_MAP_SIZE;
    state.cols = mapSize.width;
    state.rows = mapSize.height;
    state.generator = new MapGenerator({ ...mapSize, seed: state.worldSeed, coastalOnly: !mainlandUnlocked });
    const loadingMessage = document.getElementById('loadingMessage');
    if (loadingMessage) loadingMessage.textContent = '保存済みのマップを読み込んでいます...';
    let generated = await loadMapSnapshot(state.worldSeed, mapSize.width, mapSize.height);
    if (!generated) {
        if (loadingMessage) loadingMessage.textContent = 'マップを生成しています...';
        generated = await generateMapInWorker(state.worldSeed).catch(() => state.generator.generate(state.worldSeed));
        saveMapSnapshot(generated, state.worldSeed, mapSize.width, mapSize.height).catch(() => {});
    }
    state.map = generated.grid;
    state.map.forEach(row => row.forEach(tile => { tile.initialType = tile.type; }));
    state.cellChanges = applyCellChanges(state.map, state.worldSeed);
    try {
        const targets = JSON.parse(localStorage.getItem(ACTIVE_SCROLL_TARGETS_KEY) || '{}');
        state.activeScrollTargets = targets && typeof targets === 'object' ? targets : {};
    } catch (error) {
        state.activeScrollTargets = {};
    }
    state.territories = generated.territories || [];
    state.rivers = generated.rivers || [];
    state.ruins = generated.ruins || [];
    state.routes = generated.routes || [];
    state.territoryBorderSegments = buildTerritoryBorderSegments(state.map);
    state.labels = buildLabelEntries();

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
    document.getElementById('loadingOverlay')?.setAttribute('hidden', '');
}

function findSafeSpawn() {
    let savedPlayer = null;
    try {
        savedPlayer = JSON.parse(localStorage.getItem('steampunk_explorer_player_pos'));
    } catch(e) {}

    const visited = new Set();
    const islandComponents = [];
    const isIslandLand = (x, y) => {
        const tile = state.map[y]?.[x];
        return Boolean(tile?.isIsland && tile.isLand && !tile.isOcean && !tile.isLake);
    };
    for (let y = 0; y < state.rows; y++) {
        for (let x = 0; x < state.cols; x++) {
            const startKey = `${x},${y}`;
            if (visited.has(startKey) || !isIslandLand(x, y)) continue;
            const component = [];
            const queue = [[x, y]];
            visited.add(startKey);
            while (queue.length) {
                const [currentX, currentY] = queue.pop();
                component.push({ x: currentX, y: currentY });
                for (const [offsetX, offsetY] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const nextX = currentX + offsetX;
                    const nextY = currentY + offsetY;
                    const nextKey = `${nextX},${nextY}`;
                    if (visited.has(nextKey) || !isIslandLand(nextX, nextY)) continue;
                    visited.add(nextKey);
                    queue.push([nextX, nextY]);
                }
            }
            islandComponents.push(component);
        }
    }
    const largestIsland = islandComponents.reduce(
        (largest, component) => component.length > largest.length ? component : largest,
        []
    );
    const largestIslandSet = new Set(largestIsland.map(({ x, y }) => `${x},${y}`));

    const isWestCoastLand = (x, y) => {
        const tile = state.map[y]?.[x];
        if (!tile || !largestIslandSet.has(`${x},${y}`) || tile.type === 'MOUNTAIN') return false;
        return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([offsetX, offsetY]) => {
            const neighbor = state.map[y + offsetY]?.[x + offsetX];
            return neighbor?.isSea || neighbor?.isOcean;
        });
    };

    const hasSavedPosition = savedPlayer && savedPlayer.spawnVersion === 4 && savedPlayer.seed === state.worldSeed && Number.isInteger(savedPlayer.x) && Number.isInteger(savedPlayer.y);
    if (hasSavedPosition) {
        const tx = savedPlayer.x;
        const ty = savedPlayer.y;
        if (tx >= 0 && tx < state.cols && ty >= 0 && ty < state.rows && largestIslandSet.has(`${tx},${ty}`)) {
            state.player.x = tx;
            state.player.y = ty;
            savePlayerPos();
            return;
        }
    }

    const islandCenterX = Math.floor(state.cols * (state.generator.coastalOnly ? 0.5 : 0.86));
    const islandCenterY = Math.floor(state.rows * (state.generator.coastalOnly ? 0.5 : 0.56));
    let best = null;
    let bestScore = -Infinity;

    for (let y = 1; y < state.rows - 1; y++) {
        for (let x = 1; x < state.cols - 1; x++) {
            const tile = state.map[y][x];
            if (!isWestCoastLand(x, y)) continue;
            const distFromPreferredLatitude = Math.abs(y - islandCenterY);
            const score = (state.cols - x) * 1000 - distFromPreferredLatitude;
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
                        if (tile && tile.type !== 'MOUNTAIN' && largestIslandSet.has(`${x},${y}`)) {
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
            y: state.player.y,
            spawnVersion: 4
        }));
    } catch(e) {}
}

function setWorldCellType(tile, type) {
    const definition = WORLD_CELL_TYPES[type];
    if (!tile || !definition) return false;
    tile.type = type;
    tile.color = definition.color;
    tile.isSea = type === 'SEA';
    tile.isOcean = tile.isSea;
    tile.isLake = type === 'LAKE';
    tile.isLand = !tile.isSea && !tile.isLake;
    tile.isRuin = type === 'RUIN';
    return true;
}

function handleWorldCellOperation(operation) {
    const { x, y } = operation.target || {};
    if (!Number.isInteger(x) || !Number.isInteger(y)) return { success: false };
    const directions = {
        TARGET_SHIFT_UP: [0, -1],
        TARGET_SHIFT_DOWN: [0, 1],
        TARGET_SHIFT_LEFT: [-1, 0],
        TARGET_SHIFT_RIGHT: [1, 0]
    };
    const direction = directions[operation.mode];
    if (direction) {
        const target = { x: x + direction[0], y: y + direction[1] };
        return target.x >= 0 && target.x < state.cols && target.y >= 0 && target.y < state.rows
            ? { success: true, target }
            : { success: false };
    }

    const tile = state.map[y]?.[x];
    if (!tile) return { success: false };
    const initialType = tile.initialType || tile.type;
    const currentType = tile.type;
    const collectionCount = Number(tile.collectionCount) || 0;
    const transformCount = Number(state.cellChanges[`${x},${y}`]?.transformCount) || 0;
    const persistChange = (nextType, nextTransformCount = transformCount, nextCollectionCount = collectionCount) => {
        const typeChanged = tile.type !== nextType;
        tile.initialType = initialType;
        tile.collectionCount = nextCollectionCount;
        tile.transformCount = nextTransformCount;
        if (typeChanged) setWorldCellType(tile, nextType);
        state.cellChanges = saveCellChange(state.worldSeed, x, y, {
            type: nextType,
            initialType,
            transformCount: nextTransformCount,
            collectionCount: nextCollectionCount
        });
        if (typeChanged) state.territoryBorderSegments = buildTerritoryBorderSegments(state.map);
        updateUI();
        scheduleDraw();
    };

    if (operation.mode === 'TERRAIN_TRANSFORM') {
        const nextType = operation.terrainTargetType;
        const definition = WORLD_CELL_TYPES[nextType];
        if (!definition || !['direct', 'item'].includes(definition.category) || tile.isSea || tile.isLake) return { success: false };
        const recipe = TERRAIN_TRANSFORM_RECIPES[nextType] || {};
        const hasMaterials = Object.entries(recipe).every(([item, count]) => (Number(operation.materials?.[item]) || 0) >= count);
        if (!hasMaterials || nextType === currentType) return { success: false };
        persistChange(nextType, transformCount + 1);
        return { success: true, consumedItems: recipe };
    }

    if (operation.mode === 'ERA_SHIFT') {
        const nextType = chooseEraCellType(state.worldSeed, x, y, transformCount + 1, initialType, currentType);
        if (!nextType || nextType === currentType) return { success: false };
        persistChange(nextType, transformCount + 1);
        return { success: true };
    }

    if (operation.mode === 'RESOURCE_COLLECTION') {
        const drops = getCellDrops(currentType, collectionCount);
        if (!drops.length) return { success: false };
        const consumedPower = getCellCollectionPowerCost(currentType, collectionCount);
        if ((Number(operation.power) || 0) < consumedPower) return { success: false };
        persistChange(currentType, transformCount, collectionCount + 1);
        return { success: true, consumedPower, producedItems: Object.fromEntries(drops.map(item => [item, 1])) };
    }

    return { success: false };
}

function refreshActiveScrollTargets(targets = null) {
    if (targets) {
        state.activeScrollTargets = targets;
    } else {
        try {
            const stored = JSON.parse(localStorage.getItem(ACTIVE_SCROLL_TARGETS_KEY) || '{}');
            state.activeScrollTargets = stored && typeof stored === 'object' ? stored : {};
        } catch (error) {
            state.activeScrollTargets = {};
        }
    }
    updateCellInspection();
    scheduleDraw();
}

function updateCellInspection() {
    const details = document.getElementById('cell-inspection');
    if (!details || !state.map.length) return;
    const cellName = type => WORLD_CELL_TYPES[type]?.label || '不明な地形';
    const current = state.map[state.player.y]?.[state.player.x];
    const lines = current
        ? [`現在地 (${state.player.x}, ${state.player.y}): ${cellName(current.type)}`, `初期地形: ${cellName(current.initialType || current.type)}`]
        : [];
    Object.entries(state.activeScrollTargets).forEach(([scrollId, target]) => {
        const tile = state.map[target?.y]?.[target?.x];
        if (tile) lines.push(`${scrollId}: (${target.x}, ${target.y}) ${cellName(tile.type)} / 初期 ${cellName(tile.initialType || tile.type)}`);
    });
    details.replaceChildren(...lines.map(text => {
        const line = document.createElement('div');
        line.textContent = text;
        return line;
    }));
}

function getCraftingItemCount(itemId) {
    if (itemId === 'brass-stock') return Math.max(0, Number(engineRuntimeState?.brass) || 0);
    const resourceKey = { water: 'water', fog: 'fog', power: 'power', steam_power: 'steamPower' }[itemId];
    if (resourceKey) return Math.max(0, Number(engineRuntimeState?.[resourceKey]) || 0);
    return Math.max(0, Number(engineRuntimeState?.materialInventory?.[itemId]) || 0);
}

function getCraftingItemName(itemId) {
    return CRAFTING_ITEM_BY_ID.get(itemId)?.[1] || CELL_MATERIALS[itemId]?.label || INVENTORY_ITEM_DEFINITIONS[itemId]?.name
        || ({ fog: '霧', power: '動力', steam_power: 'スチーム' }[itemId]) || itemId;
}

function formatInventoryCount(itemId, count) {
    const amount = Number(count) || 0;
    if (!['water', 'fog', 'power', 'steam_power'].includes(itemId)) return String(Math.floor(amount));
    return amount.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function createInventoryIcon(itemId) {
    if (CRAFTING_ITEM_BY_ID.has(itemId)) return createCraftingIcon(itemId);
    const icon = document.createElement('span');
    icon.className = 'inventory-item-icon-fallback';
    icon.textContent = CELL_MATERIALS[itemId]?.icon || INVENTORY_ITEM_DEFINITIONS[itemId]?.icon
        || ({ fog: '≋', power: '⚙', steam_power: '♨' }[itemId]) || '◈';
    return icon;
}

function renderCellMaterials() {
    if (!engineRuntimeState) return;
    const inventoryList = document.getElementById('inventory-item-list');
    const inventoryIds = new Set(Object.entries(engineRuntimeState.materialInventory || {})
        .filter(([, count]) => Number(count) > 0)
        .map(([item]) => item));
    if (engineRuntimeState.brass > 0) inventoryIds.add('brass-stock');
    ['water', 'fog', 'power', 'steam_power'].forEach(itemId => {
        if (getCraftingItemCount(itemId) > 0) inventoryIds.add(itemId);
    });
    const orderedIds = [
        ...CRAFTING_ITEMS.map(([id]) => id).filter(id => inventoryIds.has(id)),
        ...[...inventoryIds].filter(id => !CRAFTING_ITEM_BY_ID.has(id))
    ];
    const inventorySignature = JSON.stringify(orderedIds.map(id => [id, getCraftingItemCount(id)]));
    if (inventoryList && inventorySignature !== inventoryRenderSignature) {
        inventoryRenderSignature = inventorySignature;
        inventoryList.replaceChildren();
        if (!orderedIds.length) {
            const empty = document.createElement('span');
            empty.className = 'inventory-empty';
            empty.textContent = '所持品はありません';
            inventoryList.appendChild(empty);
        }
        orderedIds.forEach(itemId => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'inventory-item-card';
            button.dataset.action = 'inspect-inventory-item';
            button.dataset.itemKey = itemId;
            const icon = document.createElement('span');
            icon.className = 'inventory-item-icon';
            icon.appendChild(createInventoryIcon(itemId));
            const name = document.createElement('span');
            name.className = 'inventory-item-name';
            name.textContent = getCraftingItemName(itemId);
            const count = document.createElement('strong');
            count.className = 'inventory-item-count';
            count.textContent = formatInventoryCount(itemId, getCraftingItemCount(itemId));
            button.append(icon, name, count);
            inventoryList.appendChild(button);
        });
    }

    const recipeList = document.getElementById('crafting-recipe-list');
    if (!recipeList) return;
    const selectedFamily = document.getElementById('crafting-family-filter')?.value || 'all';
    const visibleRecipes = CRAFTING_RECIPES.map((recipe, index) => ({ recipe, index }))
        .filter(({ recipe }) => selectedFamily === 'all' || recipe[0] === selectedFamily);
    const now = Date.now();
    const jobSignature = JSON.stringify((engineRuntimeState.craftingJobs || []).map(job => [job.recipeKey, Math.max(0, Math.ceil((Number(job.completesAt) - now) / 1000))]));
    const craftingSignature = `${selectedFamily}:${JSON.stringify(orderedIds.map(id => [id, getCraftingItemCount(id)]))}:${jobSignature}`;
    if (craftingSignature === craftingRenderSignature) return;
    craftingRenderSignature = craftingSignature;
    recipeList.replaceChildren();
    visibleRecipes.forEach(({ recipe, index }) => {
        const [family, title, inputs, output, station, note, batch = 1, duration = 0] = recipe;
        const recipeKey = `${family}:${title}`;
        const activeJob = (engineRuntimeState.craftingJobs || []).find(job => job.recipeKey === recipeKey);
        const card = document.createElement('article');
        card.className = 'crafting-recipe-card';
        const heading = document.createElement('div');
        heading.className = 'crafting-recipe-title';
        const titleText = document.createElement('strong');
        titleText.textContent = title;
        const groupText = document.createElement('small');
        groupText.textContent = family;
        heading.append(titleText, groupText);
        const flow = document.createElement('div');
        flow.className = 'crafting-recipe-flow';
        inputs.forEach(([itemId, amount], inputIndex) => {
            if (inputIndex > 0) {
                const plus = document.createElement('span');
                plus.className = 'crafting-recipe-plus';
                plus.textContent = '+';
                flow.appendChild(plus);
            }
            flow.appendChild(createCraftingChip(itemId, amount));
        });
        const arrow = document.createElement('span');
        arrow.className = 'crafting-recipe-arrow';
        arrow.textContent = '→';
        flow.append(arrow, createCraftingChip(output, batch));
        const footer = document.createElement('div');
        footer.className = 'crafting-recipe-footer';
        const stationLabel = document.createElement('span');
        stationLabel.textContent = activeJob
            ? `${station} / 残り${Math.max(0, Math.ceil((Number(activeJob.completesAt) - now) / 1000))}秒`
            : `${station} / ${Math.max(1, Math.round(duration / CRAFTING_RATE_MULTIPLIER))}秒`;
        const craftButton = document.createElement('button');
        craftButton.type = 'button';
        craftButton.dataset.action = 'craft-recipe';
        craftButton.dataset.recipeIndex = String(index);
        craftButton.textContent = activeJob ? '製作中' : `製作 ×${batch}`;
        craftButton.disabled = Boolean(activeJob) || inputs.some(([itemId, amount]) => getCraftingItemCount(itemId) < amount);
        footer.append(stationLabel, craftButton);
        const noteElement = document.createElement('p');
        noteElement.className = 'crafting-recipe-note';
        noteElement.textContent = note;
        card.append(heading, flow, footer, noteElement);
        recipeList.appendChild(card);
    });
}

function createCraftingChip(itemId, amount) {
    const chip = document.createElement('span');
    chip.className = 'crafting-item-chip';
    const icon = document.createElement('span');
    icon.className = 'crafting-item-icon';
    icon.appendChild(createInventoryIcon(itemId));
    const label = document.createElement('span');
    label.textContent = `${getCraftingItemName(itemId)} ×${amount}`;
    chip.append(icon, label);
    return chip;
}

function craftRecipe(recipeIndex) {
    const recipe = CRAFTING_RECIPES[recipeIndex];
    const creative = Boolean(engineRuntimeState?.creativeMode);
    if (!recipe || (!creative && recipe[2].some(([itemId, amount]) => getCraftingItemCount(itemId) < amount))) {
        showAppNotice('合成に必要な素材が足りません。');
        return;
    }
    const recipeKey = `${recipe[0]}:${recipe[1]}`;
    if (engineRuntimeState.craftingJobs.some(job => job.recipeKey === recipeKey)) return;
    engineRuntimeState.saveState();
    if (!creative) recipe[2].forEach(([itemId, amount]) => {
        if (itemId === 'brass-stock') engineRuntimeState.brass -= amount;
        else if (['water', 'fog', 'power', 'steam_power'].includes(itemId)) {
            const resourceKey = { water: 'water', fog: 'fog', power: 'power', steam_power: 'steamPower' }[itemId];
            engineRuntimeState[resourceKey] = Math.max(0, Number(engineRuntimeState[resourceKey]) - amount);
        }
        else engineRuntimeState.materialInventory[itemId] = Math.max(0, getCraftingItemCount(itemId) - amount);
    });
    const outputAmount = Number(recipe[6]) || 1;
    const duration = Math.max(1000, Math.round((Number(recipe[7]) || 90) / CRAFTING_RATE_MULTIPLIER * 1000));
    const startedAt = Date.now();
    engineRuntimeState.craftingJobs.push({
        jobId: `${recipeKey}:${startedAt}:${Math.random().toString(36).slice(2)}`,
        recipeKey,
        outputItem: recipe[3],
        outputAmount,
        startedAt,
        completesAt: startedAt + duration
    });
    engineRuntimeState.saveGameData();
    engineRuntimeState.notify();
    updateEngineDashboard();
    showAppNotice(`${getCraftingItemName(recipe[3])}の製作を開始しました。`);
}

function syncLandscapePanelHeights() {
    const isWideLandscape = window.matchMedia('(min-aspect-ratio: 1/1)').matches;
    const mainFrame = document.querySelector('.landscape-main-frame');
    const controlsPanel = document.querySelector('body > .panel:last-of-type');

    if (!isWideLandscape) {
        document.documentElement.style.setProperty('--landscape-map-height', '');
        document.documentElement.style.setProperty('--landscape-controls-height', '');
        if (controlsPanel) {
            controlsPanel.style.height = '';
            controlsPanel.style.minHeight = '';
            controlsPanel.style.maxHeight = '';
        }
        return;
    }

    const targetHeight = mainFrame ? mainFrame.getBoundingClientRect().height : Math.min(660, Math.max(220, window.innerHeight - 160));
    document.documentElement.style.setProperty('--landscape-map-height', `${targetHeight}px`);
    document.documentElement.style.setProperty('--landscape-controls-height', `${targetHeight}px`);

    if (controlsPanel) {
        controlsPanel.style.height = `${targetHeight}px`;
        controlsPanel.style.minHeight = `${targetHeight}px`;
        controlsPanel.style.maxHeight = `${targetHeight}px`;
    }
}

function resize() {
    const container = canvas.parentElement;
    let width = container.clientWidth || 640;
    const isCompactViewport = window.matchMedia('(max-width: 620px)').matches;
    const isWideLandscape = window.matchMedia('(min-aspect-ratio: 1/1)').matches;
    let height = 480;

    if (isWideLandscape) {
        const mainFrame = document.querySelector('.landscape-main-frame');
        const leftPanel = mainFrame?.querySelector(':scope > .panel');
        if (mainFrame && leftPanel && container) {
            const frameWidth = mainFrame.clientWidth || container.clientWidth || width;
            const frameGap = parseFloat(getComputedStyle(mainFrame).gap || '12');
            const minMapHeight = window.matchMedia('(max-height: 320px)').matches ? 140 : 180;
            const availableMapHeight = Math.max(minMapHeight, mainFrame.clientHeight - leftPanel.offsetHeight - frameGap);
            leftPanel.style.width = `${frameWidth}px`;
            leftPanel.style.maxWidth = 'none';
            leftPanel.style.minWidth = '0';
            leftPanel.style.margin = '0';
            container.style.width = `${frameWidth}px`;
            container.style.maxWidth = 'none';
            container.style.minWidth = '0';
            container.style.height = `${availableMapHeight}px`;
            container.style.minHeight = `${availableMapHeight}px`;
            container.style.maxHeight = `${availableMapHeight}px`;
            applyMapFrameRadius();
            height = availableMapHeight;
        }
    } else {
        const mainFrame = document.querySelector('.landscape-main-frame');
        const leftPanel = mainFrame?.querySelector(':scope > .panel');
        if (leftPanel) {
            leftPanel.style.width = '';
            leftPanel.style.maxWidth = '';
            leftPanel.style.minWidth = '';
            leftPanel.style.margin = '';
        }
        if (container) {
            container.style.width = '';
            container.style.maxWidth = '';
            container.style.minWidth = '';
            container.style.height = '';
            container.style.minHeight = '';
            container.style.maxHeight = '';
        }
    }

    if (isCompactViewport) {
        const panels = document.querySelectorAll('.panel');
        const topPanelHeight = panels[0]?.getBoundingClientRect().height || 0;
        const movementHeight = document.querySelector('.movement-control-group')?.getBoundingClientRect().height || 0;
        const viewportHeight = window.visualViewport?.height || window.innerHeight;
        const availableHeight = viewportHeight - topPanelHeight - movementHeight - 88;
        height = Math.max(150, Math.min(290, Math.floor(availableHeight * 0.52)));
    }

    if (!isWideLandscape) height = container.clientHeight || height;
    syncLandscapePanelHeights();
    width = container.clientWidth || 640;
    canvas.width = width;
    canvas.height = height;
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

function drawTargetCellHighlights(left, top, viewW, viewH) {
    Object.entries(state.activeScrollTargets).forEach(([scrollId, target]) => {
        if (!Number.isInteger(target?.x) || !Number.isInteger(target?.y)) return;

        const x = target.x * state.tileSize;
        const y = target.y * state.tileSize;
        const right = x + state.tileSize;
        const bottom = y + state.tileSize;
        const isVisible = right >= left && x <= left + viewW && bottom >= top && y <= top + viewH;
        if (!isVisible) return;

        ctx.save();
        ctx.fillStyle = 'rgba(255, 90, 90, 0.14)';
        ctx.strokeStyle = '#ff5a5a';
        ctx.lineWidth = Math.max(2, 2.2 / state.zoom);
        ctx.shadowColor = 'rgba(255, 90, 90, 0.75)';
        ctx.shadowBlur = 12 / state.zoom;
        ctx.fillRect(x, y, state.tileSize, state.tileSize);
        ctx.strokeRect(x + 1, y + 1, state.tileSize - 2, state.tileSize - 2);
        ctx.restore();
    });
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#071317';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

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

    if (cellIconAtlas && state.tileSize * state.zoom >= 14) {
        const iconSize = state.tileSize * 0.58;
        const iconOffset = (state.tileSize - iconSize) / 2;
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.imageSmoothingEnabled = true;
        for (let y = startRow; y < endRow; y++) {
            for (let x = startCol; x < endCol; x++) {
                drawCellIcon(ctx, cellIconAtlas, state.map[y][x], x * state.tileSize + iconOffset, y * state.tileSize + iconOffset, iconSize);
            }
        }
        ctx.restore();
    }

    drawGridOverlay(startCol, endCol, startRow, endRow);
    drawTerritoryOverlay(startCol, endCol, startRow, endRow);
    drawTargetCellHighlights(left, top, viewW, viewH);

    state.skin.draw(
        ctx,
        state.player.x * state.tileSize + (state.tileSize - state.player.size) / 2,
        state.player.y * state.tileSize + (state.tileSize - state.player.size) / 2,
        state.player.size
    );

    Object.entries(state.activeScrollTargets).forEach(([scrollId, target], index) => {
        if (!Number.isInteger(target?.x) || !Number.isInteger(target?.y)) return;
        const centerX = (target.x + 0.5) * state.tileSize;
        const centerY = (target.y + 0.5) * state.tileSize;
        ctx.save();
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = ['#f3c653', '#72d1ba', '#d88f67', '#a7b7df'][index % 4];
        ctx.lineWidth = 2 / state.zoom;
        ctx.setLineDash([4 / state.zoom, 2 / state.zoom]);
        ctx.beginPath();
        ctx.arc(centerX, centerY, state.tileSize * 0.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    });

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
    const pointCount = 9;
    for (let i = 0; i < pointCount; i++) {
        const angle = (i / pointCount) * Math.PI * 2;
        const lowFrequencyWarp = Math.sin(angle * 1.2 + seed * 0.7) * 0.42
            + Math.cos(angle * 2.0 + seed * 1.4) * 0.28
            + Math.sin(angle * 3.0 + seed * 0.3) * 0.16;
        const x = centerX + Math.cos(angle) * size * (0.92 + lowFrequencyWarp);
        const y = centerY + Math.sin(angle) * size * (0.92 + lowFrequencyWarp);
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
    const drawBorderSegment = (x1, y1, x2, y2) => {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    };
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const segments = state.territoryBorderSegments;
    ctx.strokeStyle = 'rgba(90, 12, 18, 0.72)';
    ctx.lineWidth = 3.2 / state.zoom;
    ctx.setLineDash([5 / state.zoom, 7 / state.zoom]);
    for (const segment of segments) {
        if (Math.max(segment.x1, segment.x2) < startCol || Math.min(segment.x1, segment.x2) > endCol || Math.max(segment.y1, segment.y2) < startRow || Math.min(segment.y1, segment.y2) > endRow) continue;
        drawBorderSegment(segment.x1 * state.tileSize, segment.y1 * state.tileSize, segment.x2 * state.tileSize, segment.y2 * state.tileSize);
    }
    ctx.strokeStyle = '#e34242';
    ctx.lineWidth = 1.4 / state.zoom;
    ctx.setLineDash([5 / state.zoom, 5 / state.zoom]);
    for (const segment of segments) {
        if (Math.max(segment.x1, segment.x2) < startCol || Math.min(segment.x1, segment.x2) > endCol || Math.max(segment.y1, segment.y2) < startRow || Math.min(segment.y1, segment.y2) > endRow) continue;
        drawBorderSegment(segment.x1 * state.tileSize, segment.y1 * state.tileSize, segment.x2 * state.tileSize, segment.y2 * state.tileSize);
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
        const ownedItems = new Set(state.inventoryItems);
        Object.entries(engineRuntimeState.materialInventory || {}).forEach(([item, count]) => {
            if (Number(count) > 0) ownedItems.add(item);
        });
        if (engineRuntimeState.brass > 0) ownedItems.add('brass-stock');
        if (canEnterCell(targetTile, { rules: state.cellEntryRules, items: ownedItems })) {
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
    updateEngineDashboard();
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
    const cellType = WORLD_CELL_TYPES[tile.type]?.label || (tile.type === 1 ? '山岳' : tile.type === 2 ? '森林' : tile.type === 0 ? '草原' : '地形');
    territoryElement.textContent = territory;
    cellTypeElement.textContent = cellType;
    updateCellInspection();
}

function updateEngineDashboard() {
    const save = engineRuntimeState;
    const formatCompact = value => {
        const number = Number(value) || 0;
        const absolute = Math.abs(number);
        const units = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
        const unit = units.find(([threshold]) => absolute >= threshold);
        if (!unit) return number.toFixed(2);
        const [threshold, suffix] = unit;
        return `${(number / threshold).toFixed(2).replace(/\.00$/, '').replace(/(\.[0-9])0$/, '$1')}${suffix}`;
    };
    const integerValues = new Set(['main-engine-brass', 'main-engine-steam']);
    const values = {
        'main-engine-steam': save.steamPower,
        'main-engine-water': save.water,
        'main-engine-fog': save.fog,
        'main-engine-power': save.power
    };
    Object.entries(values).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = integerValues.has(id) ? String(Math.floor(Number(value) || 0)) : formatCompact(value);
    });
    const creativeIndicator = document.getElementById('main-creative-mode-indicator');
    if (creativeIndicator) creativeIndicator.hidden = !save.creativeMode;
    const rates = {
        'main-water-generation': save.waterGenerationRate,
        'main-water-consumption': save.waterConsumptionRate,
        'main-fog-generation': save.fogRecoveryRate,
        'main-fog-consumption': save.fogConsumptionRate,
        'main-power-generation': save.powerGenerationRate,
        'main-power-consumption': save.powerConsumptionRate,
        'main-steam-generation': save.steamGenerationRate,
        'main-steam-consumption': save.steamConsumptionRate
    };
    Object.entries(rates).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (!element) return;
        element.textContent = `${formatCompact(value)} /秒`;
    });
    const generationRates = {
        water: save.waterGenerationRate,
        fog: save.fogRecoveryRate,
        power: save.powerGenerationRate,
        steam: save.steamGenerationRate
    };
    document.querySelectorAll('[data-generated-resource]').forEach(row => {
        row.hidden = !(Number(generationRates[row.dataset.generatedResource]) > 0);
    });
    renderCellMaterials();
}

function updateFullscreenButton() {
    const button = document.querySelector('[data-action="toggle-fullscreen"]');
    if (!button) return;
    const isFullscreen = Boolean(document.fullscreenElement);
    button.textContent = isFullscreen ? '全画面を解除' : '全画面表示';
    button.setAttribute('aria-pressed', String(isFullscreen));
}

let lockedOrientationType = null;

function updateOrientationLockButton() {
    const button = document.querySelector('[data-action="toggle-orientation-lock"]');
    if (!button) return;
    const isLocked = Boolean(lockedOrientationType);
    button.textContent = isLocked ? '固定を解除' : '向きを固定';
    button.setAttribute('aria-pressed', String(isLocked));
    button.title = isLocked ? '画面方向の固定を解除' : '現在の画面方向を固定';
}

async function toggleOrientationLock() {
    const orientation = window.screen?.orientation;
    if (typeof orientation?.lock !== 'function') {
        showAppNotice('このブラウザーは画面方向の固定に対応していません。');
        return;
    }
    if (lockedOrientationType) {
        orientation.unlock?.();
        lockedOrientationType = null;
        updateOrientationLockButton();
        return;
    }
    const currentType = orientation.type;
    try {
        await orientation.lock(currentType);
        lockedOrientationType = currentType;
        updateOrientationLockButton();
    } catch (error) {
        showAppNotice(document.fullscreenElement
            ? 'この端末では画面方向を固定できません。'
            : '画面方向の固定には全画面表示が必要です。先に全画面表示にしてください。');
    }
}

updateOrientationLockButton();

let appPageFrame = null;
let gearEditorFrame = null;

function openAppPage(path, title) {
    appPageFrame?.parentElement.remove();
    const overlay = document.createElement('div');
    overlay.className = 'app-page-overlay';
    const frame = document.createElement('iframe');
    frame.title = title;
    frame.src = new URL(path, window.location.href).href;
    overlay.appendChild(frame);
    document.body.appendChild(overlay);
    appPageFrame = frame;
}

function openGearEditor(material, scrollId = null) {
    if (gearEditorFrame) gearEditorFrame.parentElement.remove();
    const overlay = document.createElement('div');
    overlay.className = 'gear-editor-overlay';
    const frame = document.createElement('iframe');
    frame.title = 'ギア編集画面';
    const editorUrl = new URL('../GearSystem/index.html', window.location.href);
    if (scrollId) editorUrl.searchParams.set('editScroll', scrollId);
    else editorUrl.searchParams.set('newScroll', material || 'paper');
    editorUrl.searchParams.set('hosted', '1');
    editorUrl.searchParams.set('ui', 'fullscreen-dialog-1');
    frame.src = editorUrl.href;
    overlay.appendChild(frame);
    document.body.appendChild(overlay);
    gearEditorFrame = frame;
    closeInventoryItem();
}

async function toggleFullscreen() {
    if (!document.fullscreenEnabled) return;
    if (document.fullscreenElement) {
        await document.exitFullscreen();
    } else {
        await document.documentElement.requestFullscreen();
    }
}

function closeGuideModal() {
    document.querySelectorAll('.guide-modal').forEach((modal) => modal.remove());
}

function openGuideModal() {
    closeGuideModal();
    const modal = document.createElement('div');
    modal.className = 'inventory-modal guide-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'ガイド');

    const panel = document.createElement('div');
    panel.className = 'inventory-modal-panel guide-modal-panel';

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'inventory-modal-close';
    closeButton.setAttribute('aria-label', 'ガイドを閉じる');
    closeButton.textContent = '×';
    closeButton.addEventListener('click', closeGuideModal);

    const frame = document.createElement('iframe');
    frame.title = 'ガイド';
    frame.src = 'cell-atlas.html?modal=1&guide=2';
    frame.loading = 'lazy';
    frame.setAttribute('allowfullscreen', 'false');

    panel.append(closeButton, frame);
    modal.appendChild(panel);
    document.body.appendChild(modal);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) closeGuideModal();
    });
}

document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.inventoryView) {
        const view = button.dataset.inventoryView;
        document.querySelectorAll('.inventory-view-tab').forEach(tab => {
            const active = tab === button;
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-selected', String(active));
        });
        document.getElementById('inventory-items-view').hidden = view !== 'items';
        document.getElementById('inventory-crafting-view').hidden = view !== 'crafting';
        return;
    }
    if (button.dataset.action === 'craft-recipe') {
        craftRecipe(Number(button.dataset.recipeIndex));
        return;
    }
    if (button.dataset.action === 'export-save') {
        try { exportSaveBackup(); }
        catch (error) { showAppNotice('セーブデータを書き出せませんでした。'); }
        return;
    }
    if (button.dataset.action === 'choose-save-import') {
        document.getElementById('save-import-file')?.click();
        return;
    }
    if (button.dataset.action === 'cancel-save-import') {
        pendingSaveBackup = null;
        document.getElementById('save-transfer-modal').hidden = true;
        return;
    }
    if (button.dataset.action === 'confirm-save-import') {
        if (!pendingSaveBackup) return;
        try { applySaveBackup(pendingSaveBackup); }
        catch (error) { showAppNotice(error.message || 'セーブデータを読み込めませんでした。'); }
        return;
    }
    if (button.dataset.action === 'open-world-map') {
        openAppPage('worldmap.html?ui=legend-1', '全体マップ');
        return;
    }
    if (button.dataset.action === 'open-guide') {
        openGuideModal();
        return;
    }
    if (button.dataset.action === 'open-settings') {
        openAppPage('settings.html', '設定');
        return;
    }
    if (button.dataset.action === 'inspect-inventory-item') {
        if (button.dataset.itemKey === 'scroll_book') {
            openAppPage('../GearSystem/scroll-library.html?embed=1&v=8', 'スクロール書庫');
            return;
        }
        openInventoryItem(button.dataset.itemKey);
        return;
    }
    if (button.dataset.action === 'inspect-scroll') {
        const scroll = getStoredSavedScrolls().find(item => item.id === button.dataset.scrollId);
        if (scroll) openInventoryItem(scroll.material === 'cloth' ? 'cloth_scroll' : 'paper_scroll', scroll);
        return;
    }
    if (button.dataset.action === 'close-inventory-modal') {
        closeInventoryItem();
        return;
    }
    if (button.dataset.action === 'use-scroll-from-modal') {
        const scroll = getStoredSavedScrolls().find(item => item.id === button.dataset.scrollId);
        if (scroll) {
            closeInventoryItem();
            applySavedScrollEffect(scroll);
        }
        return;
    }
    if (button.dataset.action === 'open-gear-editor') {
        openGearEditor(button.dataset.material || 'paper');
        return;
    }
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
    if (button.dataset.action === 'toggle-fullscreen') {
        toggleFullscreen().catch(() => {});
        return;
    }
    if (button.dataset.action === 'toggle-orientation-lock') {
        toggleOrientationLock().catch(() => showAppNotice('画面方向を固定できませんでした。'));
    }
});

document.getElementById('save-import-file')?.addEventListener('change', async event => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 15_000_000) {
        showAppNotice('ファイルが大きすぎます。');
        return;
    }
    try {
        const backup = validateSaveBackup(JSON.parse(await file.text()));
        openSaveImportConfirmation(backup);
    } catch (error) {
        const message = error instanceof SyntaxError
            ? 'JSONファイルの形式が正しくありません。'
            : error.message || 'FogsGearのセーブJSONを読み込めませんでした。';
        showAppNotice(message);
    }
});

document.getElementById('crafting-family-filter')?.addEventListener('change', () => {
    craftingRenderSignature = '';
    renderCellMaterials();
});

document.getElementById('save-transfer-modal')?.addEventListener('click', event => {
    if (event.target.id !== 'save-transfer-modal') return;
    pendingSaveBackup = null;
    event.currentTarget.hidden = true;
});

window.addEventListener('message', event => {
    if (event.origin !== window.location.origin && event.origin !== 'null') return;
    const scrollLibraryFrame = [
        appPageFrame,
        document.querySelector('iframe[title="保存スクロールのギアプレビュー"]')
    ].find(frame => frame && event.source === frame.contentWindow);
    if (appPageFrame && event.source === appPageFrame.contentWindow) {
        if (event.data?.type === 'fogsgear:close-page') {
            appPageFrame.parentElement.remove();
            appPageFrame = null;
            return;
        }
    }
    if (scrollLibraryFrame && event.data?.type === 'fogsgear:edit-scroll') {
        const scrollId = String(event.data.scrollId || '');
        if (!getStoredSavedScrolls().some(scroll => scroll.id === scrollId)) return;
        if (scrollLibraryFrame === appPageFrame) {
            appPageFrame.parentElement.remove();
            appPageFrame = null;
        }
        openGearEditor(null, scrollId);
        return;
    }
    if (!gearEditorFrame
        || event.source !== gearEditorFrame.contentWindow
        || event.data?.type !== 'fogsgear:close-editor') return;
    gearEditorFrame.parentElement.remove();
    gearEditorFrame = null;
});

document.getElementById('inventory-item-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'inventory-item-modal') closeInventoryItem();
});

document.addEventListener('pointerup', (event) => {
    const target = event.target;
    const itemModal = document.getElementById('inventory-item-modal');
    if (itemModal && !itemModal.hidden) {
        if (target === itemModal) closeInventoryItem();
        return;
    }

    for (const [panelId, toggleAction] of [['status-panel', 'toggle-status'], ['inventory-panel', 'toggle-inventory']]) {
        const panel = document.getElementById(panelId);
        if (!panel || panel.hidden || panel.contains(target) || target.closest(`[data-action="${toggleAction}"]`)) continue;
        panel.hidden = true;
        document.querySelectorAll(`[data-action="${toggleAction}"]`).forEach(toggle => {
            toggle.setAttribute('aria-expanded', 'false');
            const span = toggle.querySelector('span');
            if (span) span.textContent = '+';
        });
    }
});

window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeInventoryItem();
    pendingSaveBackup = null;
    const transferModal = document.getElementById('save-transfer-modal');
    if (transferModal) transferModal.hidden = true;
});

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && lockedOrientationType) {
        window.screen?.orientation?.unlock?.();
        lockedOrientationType = null;
    }
    updateFullscreenButton();
    updateOrientationLockButton();
    resize();
    scheduleDraw();
});

window.addEventListener('storage', (event) => {
    renderSavedScrolls();
    updateEngineDashboard();
    if (event.key === ACTIVE_SCROLL_TARGETS_KEY) refreshActiveScrollTargets();
});

window.addEventListener('fogsgear:scroll-targets-changed', event => refreshActiveScrollTargets(event.detail));

window.setInterval(updateEngineDashboard, 250);

const engineRuntimeState = new EngineGameState();
new EngineGearManager(engineRuntimeState);
engineRuntimeState.worldCellHandler = handleWorldCellOperation;
window.setInterval(() => engineRuntimeState.tick(), 16);

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

function triggerMovementHaptic(duration = 8) {
    if (typeof navigator.vibrate === 'function') navigator.vibrate(duration);
}

const moveByButton = (x, y) => {
    triggerMovementHaptic();
    movePlayer(x, y);
};

document.getElementById('move-up').onclick = () => moveByButton(0, -1);
document.getElementById('move-down').onclick = () => moveByButton(0, 1);
document.getElementById('move-left').onclick = () => moveByButton(-1, 0);
document.getElementById('move-right').onclick = () => moveByButton(1, 0);

const joystick = document.getElementById('move-joystick');
const joystickKnob = joystick?.querySelector('.movement-joystick-knob');
let joystickDirection = '';
let joystickSuppressClicksUntil = 0;
let joystickMoveTimer = null;

function moveJoystickInDirection() {
    const movement = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[joystickDirection];
    if (movement) movePlayer(movement[0], movement[1]);
}

function startJoystickMovement() {
    if (joystickMoveTimer || !joystickDirection) return;
    joystickMoveTimer = window.setInterval(moveJoystickInDirection, 180);
}

function resetJoystick() {
    joystickDirection = '';
    if (joystickMoveTimer) {
        window.clearInterval(joystickMoveTimer);
        joystickMoveTimer = null;
    }
    if (joystickKnob) joystickKnob.style.transform = 'translate(-50%, -50%)';
    joystick?.setAttribute('aria-valuenow', '0');
}

function updateJoystick(event) {
    if (!joystick || !joystickKnob) return;
    const rect = joystick.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maxDistance = Math.max(8, rect.width * 0.28);
    const deltaX = event.clientX - centerX;
    const deltaY = event.clientY - centerY;
    const distance = Math.hypot(deltaX, deltaY);
    const scale = distance > maxDistance ? maxDistance / distance : 1;
    const knobX = deltaX * scale;
    const knobY = deltaY * scale;
    joystickKnob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;

    const threshold = Math.max(10, rect.width * 0.2);
    if (distance < threshold) {
        joystickDirection = '';
        if (joystickMoveTimer) {
            window.clearInterval(joystickMoveTimer);
            joystickMoveTimer = null;
        }
        joystick.setAttribute('aria-valuenow', '0');
        return;
    }

    const nextDirection = Math.abs(deltaX) > Math.abs(deltaY)
        ? (deltaX > 0 ? 'right' : 'left')
        : (deltaY > 0 ? 'down' : 'up');
    if (nextDirection === joystickDirection) return;
    joystickDirection = nextDirection;
    triggerMovementHaptic();
    joystick.setAttribute('aria-valuenow', nextDirection === 'right' || nextDirection === 'down' ? '1' : '-1');
    moveJoystickInDirection();
    startJoystickMovement();
}

if (joystick) {
    joystick.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        joystickSuppressClicksUntil = Date.now() + 500;
        joystick.setPointerCapture(event.pointerId);
        updateJoystick(event);
    });
    joystick.addEventListener('pointermove', (event) => {
        if (joystick.hasPointerCapture(event.pointerId)) updateJoystick(event);
    });
    joystick.addEventListener('pointerup', (event) => {
        if (joystick.hasPointerCapture(event.pointerId)) joystick.releasePointerCapture(event.pointerId);
        joystickSuppressClicksUntil = Date.now() + 300;
        resetJoystick();
    });
    joystick.addEventListener('pointercancel', () => {
        joystickSuppressClicksUntil = Date.now() + 300;
        resetJoystick();
    });
}

document.addEventListener('click', (event) => {
    if (Date.now() >= joystickSuppressClicksUntil) return;
    const button = event.target.closest('#move-up, #move-down, #move-left, #move-right');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
}, true);

document.addEventListener('click', (event) => {
    const link = event.target.closest('a, button[onclick]');
    if (link && /location\.(href|replace)|window\.location/.test(link.getAttribute('onclick') || '')) {
        document.getElementById('loadingOverlay')?.removeAttribute('hidden');
    }
});

const mainPageViewport = document.getElementById('main-page-viewport');
const mainPageTrack = document.getElementById('main-page-track');
const mainPageDots = [...document.querySelectorAll('.main-page-dot')];
const mainPageArrows = [...document.querySelectorAll('.main-page-arrow')];
const gearPreviewIframe = document.querySelector('.gear-preview-page iframe');
const canvasContainer = document.getElementById('canvas-container');
let currentMainPage = 0;
let mainPagePointerStart = null;
let mainPageTouchStart = null;

function applyMapFrameRadius() {
    if (!canvasContainer) return;
    canvasContainer.style.borderRadius = '8px';
    canvasContainer.style.borderTopLeftRadius = '8px';
    canvasContainer.style.borderTopRightRadius = '8px';
    canvasContainer.style.borderBottomLeftRadius = '8px';
    canvasContainer.style.borderBottomRightRadius = '8px';
}

function isWideMainLayout() {
    return window.matchMedia('(min-aspect-ratio: 1/1)').matches;
}

function syncMainPageViewportHeight() {
    if (!mainPageViewport || !mainPageTrack) return;
    if (isWideMainLayout()) {
        mainPageViewport.style.height = '100%';
        mainPageViewport.style.minHeight = '0';
        mainPageTrack.style.height = '100%';
        mainPageTrack.style.minHeight = '0';
        mainPageTrack.querySelectorAll('.main-page').forEach((page) => {
            page.style.height = '100%';
            page.style.minHeight = '0';
        });
        return;
    }

    mainPageViewport.style.height = '100%';
    mainPageViewport.style.minHeight = '0';
    mainPageTrack.style.height = '100%';
    mainPageTrack.style.minHeight = '0';
    mainPageTrack.querySelectorAll('.main-page').forEach((page) => {
        page.style.height = '100%';
        page.style.minHeight = '0';
    });
}

function setMainPage(page) {
    currentMainPage = Math.max(0, Math.min(2, page));
    if (mainPageTrack) mainPageTrack.style.transform = `translateX(-${currentMainPage * 33.3333}%)`;
    mainPageDots.forEach((dot, index) => {
        const active = index === currentMainPage;
        dot.classList.toggle('active', active);
        if (active) dot.setAttribute('aria-current', 'page');
        else dot.removeAttribute('aria-current');
    });
    syncMainPageViewportHeight();
}

mainPageDots.forEach(dot => dot.addEventListener('click', () => setMainPage(Number(dot.dataset.mainPage))));
mainPageArrows.forEach(arrow => arrow.addEventListener('click', () => {
    setMainPage(currentMainPage + (arrow.dataset.mainPage === 'next' ? 1 : -1));
}));
const captureMainPageSwipe = (event, allowInteractiveTarget = false) => {
    if (event.pointerType === 'touch') return;
    if (!allowInteractiveTarget && event.target && event.target.closest('button, input, select, .movement-joystick')) return;
    mainPagePointerStart = { x: event.clientX, y: event.clientY };
};
const releaseMainPageSwipe = (point, start = mainPagePointerStart) => {
    if (!start) return;
    const deltaX = point.x - start.x;
    const deltaY = point.y - start.y;
    if (start === mainPagePointerStart) mainPagePointerStart = null;
    if (start === mainPageTouchStart) mainPageTouchStart = null;
    if (Math.abs(deltaX) < 42 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
    setMainPage(currentMainPage + (deltaX < 0 ? 1 : -1));
};
const captureMainPageTouch = event => {
    const touch = event.changedTouches[0];
    if (touch) mainPageTouchStart = { x: touch.clientX, y: touch.clientY };
};
const releaseMainPageTouch = event => {
    const touch = event.changedTouches[0];
    if (touch) releaseMainPageSwipe({ x: touch.clientX, y: touch.clientY }, mainPageTouchStart);
};

mainPageViewport?.addEventListener('pointerdown', captureMainPageSwipe);
mainPageViewport?.addEventListener('pointerup', event => releaseMainPageSwipe({ x: event.clientX, y: event.clientY }));
mainPageViewport?.addEventListener('pointercancel', () => { mainPagePointerStart = null; });
mainPageViewport?.addEventListener('touchstart', captureMainPageTouch, { passive: true });
mainPageViewport?.addEventListener('touchend', releaseMainPageTouch, { passive: true });
mainPageViewport?.addEventListener('touchcancel', () => { mainPageTouchStart = null; }, { passive: true });

const bindGearPreviewSwipe = () => {
    if (!gearPreviewIframe || !gearPreviewIframe.contentWindow || !gearPreviewIframe.contentWindow.document) return;
    const frameDocument = gearPreviewIframe.contentWindow.document;
    const capturePreviewSwipe = event => captureMainPageSwipe(event, true);
    frameDocument.addEventListener('pointerdown', capturePreviewSwipe, { passive: true, capture: true });
    frameDocument.addEventListener('pointerup', event => releaseMainPageSwipe({ x: event.clientX, y: event.clientY }), { passive: true, capture: true });
    frameDocument.addEventListener('pointercancel', () => { mainPagePointerStart = null; }, { passive: true });
    frameDocument.addEventListener('touchstart', captureMainPageTouch, { passive: true, capture: true });
    frameDocument.addEventListener('touchend', releaseMainPageTouch, { passive: true, capture: true });
    frameDocument.addEventListener('touchcancel', () => { mainPageTouchStart = null; }, { passive: true, capture: true });
};

gearPreviewIframe?.addEventListener('load', bindGearPreviewSwipe);
bindGearPreviewSwipe();
mainPageViewport?.addEventListener('wheel', event => {
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY) && Math.abs(event.deltaX) > 20) {
        setMainPage(currentMainPage + (event.deltaX < 0 ? 1 : -1));
    }
}, { passive: true });
window.addEventListener('resize', syncMainPageViewportHeight);
setMainPage(isWideMainLayout() ? 1 : 0);

// インベントリトグルボタンのイベントリスナー設定
const inventoryToggleBtn = document.querySelector('[data-action="toggle-inventory"]');
const inventoryPanel = document.getElementById('inventory-panel');
const cellLegendToggleBtn = document.querySelector('[data-action="toggle-cell-legend"]');
const cellLegendPanel = document.getElementById('cell-legend-panel');
const statusToggleBtn = document.querySelector('[data-action="toggle-status"]');
const statusPanel = document.getElementById('status-panel');
const navigationToggleBtn = document.querySelector('[data-action="toggle-navigation"]');
const navigationPanel = document.getElementById('navigation-panel');

function setupDashboardToggle(toggleButton, panel) {
    if (!toggleButton || !panel) return;
    const toggleButtons = [...document.querySelectorAll(`[data-action="${toggleButton.dataset.action}"]`)];
    toggleButtons.forEach(button => button.addEventListener('click', () => {
        const isOpen = panel.hidden;
        panel.hidden = !isOpen;
        toggleButtons.forEach(toggle => {
            toggle.setAttribute('aria-expanded', String(isOpen));
            const span = toggle.querySelector('span');
            if (span) span.textContent = isOpen ? '-' : '+';
        });
    }));
}

setupDashboardToggle(statusToggleBtn, statusPanel);
setupDashboardToggle(cellLegendToggleBtn, cellLegendPanel);
setupDashboardToggle(navigationToggleBtn, navigationPanel);

setupDashboardToggle(inventoryToggleBtn, inventoryPanel);

const minZoomSelect = document.getElementById('minZoomSelect');
if (minZoomSelect) {
    minZoomSelect.addEventListener('change', (e) => {
        state.minZoom = parseFloat(e.target.value);
        if (state.zoom < state.minZoom) {
            state.zoom = state.minZoom;
        }
    });
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
            return Promise.all(registrations.map((registration) => registration.unregister()));
        }).catch(() => {});
    });
}

init();
