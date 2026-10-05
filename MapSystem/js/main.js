// js/main.js - Steampunk Explorer Game Logic
import { MapGenerator, BIOME_COLORS, loadMapSnapshot, saveMapSnapshot } from './mapGenerator.js?v=89';
import { SkinRenderer } from './skinRenderer.js?v=3';
import { CELL_DEFINITIONS, canEnterCell, getCellEntryRule, getMosaicColor } from './cellRules.js';
import { drawCellIcon, loadCellIconAtlas } from './cellIconRenderer.js?v=5';
import { ACTIVE_SCROLL_TARGETS_KEY, CELL_MATERIALS, TERRAIN_TRANSFORM_RECIPES, WORLD_CELL_TYPES, applyCellChanges, chooseEraCellType, getCellCollectionPowerCost, getCellDrops, readCellChanges, saveCellChange } from './worldCells.js?v=8';
import { CRAFTING_ITEMS, CRAFTING_ITEM_BY_ID, CRAFTING_RATE_MULTIPLIER, CRAFTING_RECIPES, CRAFTING_STATION_BUILDING_IDS, DEFERRED_CRAFTING_ITEM_IDS, HANDCRAFT_STATION } from './craftingData.js?v=13';
import { BUILDING_BY_ID, BUILDING_DEFINITIONS, canPlaceBuildingOnTerrainCell, drawBuilding, getRailAutoRotation, getRailConnections, getTileEffectsUnderFootprint, getVehicleRailRotation, loadBuildingIconImages, normalizeBuildingUtilityState } from './buildingData.js?v=30';
import { getBuildingUtilityStatus, simulateBuildingUtilityNetworks } from './buildingUtilityNetworks.js?v=4';
import { buildTerritoryBorderSegments } from './territoryBorders.js?v=35';
import { directionToVehicleRotation, findNextRailStep, getTrackDirection, getVehicleRenderState, STATION_CONTROL_DEFAULTS, VEHICLE_DEFAULTS } from './railwayRuntime.js?v=8';
import { GameState as EngineGameState } from '../../GearSystem/js/GameState.js?v=runtime-33';
import { GearManager as EngineGearManager } from '../../GearSystem/js/GearManager.js?v=runtime-5';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const vehicleAnimationLayer = document.getElementById('vehicleAnimationLayer');
const vehicleMotionSprites = new Map();
let cellIconAtlas = null;
const INVENTORY_ITEMS_KEY = 'steampunk_explorer_inventory_items';
const BUILDINGS_STORAGE_KEY = 'fogsgear_world_buildings';
const BUILDING_CONSTRUCTION_STATION_GROUPS = new Set(['production', 'automation', 'mega', 'final']);
const BUILDING_CONSTRUCTION_STARTER_STATIONS = new Set(['craft-bench', 'gear-forge']);

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
    buildings: [],
    cellChanges: {},
    activeScrollTargets: {},
    cellEntryRules: { types: {}, cells: {} }
};
let activeBuildingPlacement = null;
let buildingPlacementMode = 'single';
let selectedBuildingInstanceId = null;
let activeCraftingBuildingInstanceId = null;
let buildingPressCandidate = null;
let buildingPressTimer = null;
const buildingUndoHistory = [];
const buildingRedoHistory = [];
const BUILDING_HISTORY_LIMIT = 100;
try {
    const savedItems = JSON.parse(localStorage.getItem(INVENTORY_ITEMS_KEY) || '[]');
    if (Array.isArray(savedItems)) state.inventoryItems = new Set(savedItems.filter(item => typeof item === 'string'));
} catch (error) {}

const activePointers = new Map();
const MAP_UNLOCK_KEY = 'fogsgear_world_unlocks';
const COASTAL_MAP_SIZE = { width: 640, height: 360 };
const FULL_MAP_SIZE = { width: 2000, height: 1000 };
const SAVE_BACKUP_FORMAT = 'fogsgear-save';
const SAVE_BACKUP_VERSION = 3;
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
    BUILDINGS_STORAGE_KEY,
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
let buildingRenderSignature = '';
let buildingCraftingRenderSignature = '';
const craftingNotificationCards = new Map();

const INVENTORY_ITEM_DEFINITIONS = {
    paper_scroll: { name: 'スクロール（紙）', description: '新しいギア設計を記録する紙の巻物。ギア編集画面で設計を作成できます。', iconId: 'paper_scroll', image: null, meta: '未使用・新規設計用' },
    cloth_scroll: { name: 'スクロール（布）', description: '新しいギア設計を記録する布の巻物。ギア編集画面で設計を作成できます。', iconId: 'cloth_scroll', image: null, meta: '未使用・新規設計用' },
    scroll_book: { name: 'スクロールブック', description: '保存済みスクロールを一覧で確認し、使用やギア編集を行える記録帳です。', iconId: 'scroll_book', image: null, meta: '保存済み設計図' },
    steam_power: { name: 'スチーム', description: 'ギアの作動負荷を支える蒸気資源です。', iconId: 'steam_power', image: null, meta: '保有資源' }
};

const CRAFTING_ICON_IDS = Object.freeze({
    stone: 'i-stone',
    sand: 'i-sand',
    relic_fragment: 'i-relic',
    iron_ore: 'i-iron',
    copper_ore: 'i-copper',
    tar: 'i-oil',
    'crystal-shard': 'i-crystal',
    fiber: 'i-fiber',
    reed: 'i-reed',
    ash: 'i-ash',
    magnetite: 'i-magnetite',
    mica: 'i-mica',
    obsidian: 'i-obsidian',
    pumice: 'i-pumice',
    seaweed: 'i-seaweed',
    tin_ore: 'i-tin',
    zinc_ore: 'i-zinc',
    crystal_shard: 'i-crystal',
    mining_sample: 'i-mining-sample',
    vein_mold: 'i-vein-mold',
    navigation_crystal: 'i-device',
    'preserved-spores': 'i-spore-vial',
    preserved_spores: 'i-spore-vial',
    compost: 'i-compost',
    forest_seed: 'i-forest-seed',
    ancient_seed: 'i-seedcase',
    'climate-control-core': 'i-crystal',
    'closed-loop-unit': 'i-filter-cartridge',
    'ecosystem-starter': 'i-compost',
    paper_scroll: 'i-paper_scroll',
    cloth_scroll: 'i-cloth_scroll',
    scroll_book: 'i-scroll_book',
    steam_power: 'i-steam_power'
});
const recipeDetailHistory = [];

function openInventoryItem(itemKey, scroll = null) {
    const craftingItem = CRAFTING_ITEM_BY_ID.get(itemKey);
    const building = BUILDING_BY_ID.get(itemKey);
    const cellMaterial = CELL_MATERIALS[itemKey];
    const definition = craftingItem
        ? { name: craftingItem[1], description: craftingItem[4], meta: `${craftingItem[2]} / ${craftingItem[3]}`, iconId: itemKey }
        : building
            ? { name: building.name, description: building.description || '作成済みの建築キットです。設置位置を選んでマップに配置できます。', meta: `建築キット / ${building.width}×${building.height}`, iconId: itemKey }
            : INVENTORY_ITEM_DEFINITIONS[itemKey] || (cellMaterial
                ? { name: cellMaterial.label, description: 'セルから採取できる資材です。', meta: 'セル資源', iconId: itemKey }
                : { name: itemKey, description: '詳細情報が登録されていないアイテムです。', meta: '未登録アイテム', iconId: itemKey });
    const modal = document.getElementById('inventory-item-modal');
    const icon = document.getElementById('inventory-modal-icon');
    const useButton = document.getElementById('inventory-modal-use');
    const placementModes = document.getElementById('inventory-modal-placement-modes');
    const editButton = document.getElementById('inventory-modal-edit');
    if (!modal || !icon) return;
    icon.replaceChildren();
    icon.appendChild(building ? createBuildingSvgIcon(building.id) : createCraftingIcon(definition.iconId || itemKey));
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
    if (placementModes) {
        placementModes.hidden = !building || getCraftingItemCount(itemKey) <= 0;
        placementModes.querySelectorAll('[data-action="place-building-from-inventory"]').forEach(button => {
            button.dataset.buildingId = building?.id || '';
        });
    }
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
    const iconId = CRAFTING_ICON_IDS[itemId] || `i-${itemId.replaceAll('_', '-')}`;
    use.setAttribute('href', `../MainSystem/icons/items/crafting-icons.svg?v=9#${iconId}`);
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
    } else if (key === BUILDINGS_STORAGE_KEY) {
        if (!Array.isArray(parsed) || parsed.some(building => !isRecord(building)
            || typeof building.id !== 'string' || !BUILDING_BY_ID.has(building.id)
            || !Number.isInteger(building.x) || !Number.isInteger(building.y)
            || typeof building.instanceId !== 'string')) throw new Error('建築物の配置データが不正です。');
    } else if (key === ACTIVE_SCROLL_TARGETS_KEY) {
        if (!isRecord(parsed) || Object.values(parsed).some(target => !isRecord(target) || !Number.isInteger(target.x) || !Number.isInteger(target.y))) throw new Error('スクロール対象位置が不正です。');
    } else if (key === 'fogsgear_active_scroll_sync_state') {
        if (!isRecord(parsed) || Object.values(parsed).some(locks => !isRecord(locks) || Object.values(locks).some(locked => typeof locked !== 'boolean'))) throw new Error('スクロール同期状態が不正です。');
    } else if (['fogsgear_world_unlocks', 'fogsgear_cell_entry_rules'].includes(key) && !isRecord(parsed)) {
        throw new Error('設定データの形式が正しくありません。');
    }
}

function validateSaveBackup(backup) {
    if (!isRecord(backup) || backup.format !== SAVE_BACKUP_FORMAT || ![1, 2, SAVE_BACKUP_VERSION].includes(backup.version)) {
        throw new Error('FogsGearの対応セーブJSONではありません。');
    }
    if (!isRecord(backup.data) || !isRecord(backup.cellChanges)) throw new Error('セーブJSONの構造が不正です。');
    const requiredKeys = backup.version === 1 ? LEGACY_SAVE_BACKUP_KEYS
        : backup.version === 2 ? SAVE_BACKUP_KEYS.filter(key => key !== BUILDINGS_STORAGE_KEY)
            : SAVE_BACKUP_KEYS;
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
    const cellIconPromise = loadCellIconAtlas().catch(error => {
        console.warn('Cell icon atlas failed to load; rendering the map without terrain icons.');
        return null;
    });
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
    loadBuildings();
    state.cellChanges = applyCellChanges(state.map, state.worldSeed);
    try {
        const targets = JSON.parse(localStorage.getItem(ACTIVE_SCROLL_TARGETS_KEY) || '{}');
        state.activeScrollTargets = targets && typeof targets === 'object' ? targets : {};
    } catch (error) {
        state.activeScrollTargets = {};
    }
    state.territories = state.generator.coastalOnly ? [] : generated.territories || [];
    state.rivers = generated.rivers || [];
    state.ruins = generated.ruins || [];
    state.routes = generated.routes || [];
    state.territoryBorderSegments = state.generator.coastalOnly ? [] : buildTerritoryBorderSegments(state.map);
    state.labels = buildLabelEntries();

    findSafeSpawn(generated.playerPos);

    let savedSkin = './5504543579.png';
    let savedSkinName = '5504543579.png';
    try {
        const stored = localStorage.getItem('steampunk_explorer_skin_url');
        if (stored && stored !== 'https://mineskin.org/download/639735497') savedSkin = stored;
        const storedName = localStorage.getItem('steampunk_explorer_skin_name');
        if (storedName && savedSkin !== './5504543579.png') savedSkinName = storedName;
    } catch(e) {}

    resize();
    centerCameraOnPlayer();
    updateUI();
    setupControls();
    renderSavedScrolls();
    renderCellLegend();
    gameLoop();
    document.getElementById('loadingOverlay')?.setAttribute('hidden', '');
    cellIconPromise.then(atlas => {
        if (!atlas) return;
        cellIconAtlas = atlas;
        renderCellLegend();
        scheduleDraw();
    });
    const placedBuildingIds = [...new Set(state.buildings.map(placed => placed.id))];
    const loadDeferredAssets = () => {
        loadAndApplySkin(savedSkin, savedSkinName).then(scheduleDraw).catch(error => {
            console.warn('Skin load failed, using fallback');
        });
        if (!placedBuildingIds.length) return;
        loadBuildingIconImages(placedBuildingIds).then(() => {
            buildingRenderSignature = '';
            if (!document.getElementById('inventory-building-view')?.hidden) renderBuildingInventory();
            scheduleDraw();
        }).catch(error => {
            console.warn('Building SVG atlas failed to load; rendering fallback building icons.');
        });
    };
    requestAnimationFrame(() => requestAnimationFrame(() => {
        if (window.requestIdleCallback) window.requestIdleCallback(loadDeferredAssets, { timeout: 1500 });
        else window.setTimeout(loadDeferredAssets, 0);
    }));
}

function findSafeSpawn(preferredPosition = null) {
    let savedPlayer = null;
    try {
        savedPlayer = JSON.parse(localStorage.getItem('steampunk_explorer_player_pos'));
    } catch(e) {}

    const isSafePosition = position => {
        if (!Number.isInteger(position?.x) || !Number.isInteger(position?.y)
            || position.x < 0 || position.x >= state.cols || position.y < 0 || position.y >= state.rows) return false;
        const tile = state.map[position.y]?.[position.x];
        return Boolean(tile?.isIsland && tile.isLand && !tile.isSea && !tile.isOcean && !tile.isLake);
    };
    const hasSavedPosition = savedPlayer && savedPlayer.spawnVersion === 4 && savedPlayer.seed === state.worldSeed;
    if (hasSavedPosition && isSafePosition(savedPlayer)) {
        state.player.x = savedPlayer.x;
        state.player.y = savedPlayer.y;
        savePlayerPos();
        return;
    }
    if (isSafePosition(preferredPosition)) {
        state.player.x = preferredPosition.x;
        state.player.y = preferredPosition.y;
        savePlayerPos();
        return;
    }

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
        if (typeChanged) state.territoryBorderSegments = state.generator.coastalOnly ? [] : buildTerritoryBorderSegments(state.map);
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

function migrateLegacyMaterialIds() {
    const legacyIds = {
        relic_fragment: 'relic-fragment',
        iron_ore: 'iron-ore',
        copper_ore: 'copper-ore',
        tin_ore: 'tin-ore',
        zinc_ore: 'zinc-ore',
        crystal_shard: 'crystal-shard',
        preserved_spores: 'preserved-spores',
        navigation_crystal: 'navigation-crystal',
        mycelium_compost: 'compost'
    };
    const inventory = engineRuntimeState.materialInventory;
    Object.entries(legacyIds).forEach(([legacyId, itemId]) => {
        const count = Number(inventory[legacyId]);
        if (!(count > 0)) return;
        inventory[itemId] = (Number(inventory[itemId]) || 0) + count;
        delete inventory[legacyId];
    });
}

function getMaximumCraftCount(inputs, creative = Boolean(engineRuntimeState?.creativeMode)) {
    if (creative) return 99;
    if (!inputs.length) return 0;
    return Math.max(0, Math.min(...inputs.map(([itemId, amount]) =>
        Math.floor(getCraftingItemCount(itemId) / Math.max(1, Number(amount) || 1)))));
}

function getBuildingMaterialCosts(building) {
    return building.materialCosts || [];
}

function sortCraftingRecipesByAvailability(recipes) {
    return [...recipes].sort((first, second) =>
        Number(getMaximumCraftCount(second.recipe[2]) > 0) - Number(getMaximumCraftCount(first.recipe[2]) > 0));
}

function getCraftingItemName(itemId) {
    return CRAFTING_ITEM_BY_ID.get(itemId)?.[1] || CELL_MATERIALS[itemId]?.label || INVENTORY_ITEM_DEFINITIONS[itemId]?.name
        || BUILDING_BY_ID.get(itemId)?.name
        || ({ fog: '霧', power: '動力', steam_power: 'スチーム' }[itemId]) || itemId;
}

function isLargeBuilding(building) {
    return Boolean(building && building.width >= 2 && building.height >= 2);
}

function isBuildingConstructionStation(buildingId) {
    const building = BUILDING_BY_ID.get(buildingId);
    return Boolean(building && (BUILDING_CONSTRUCTION_STARTER_STATIONS.has(buildingId)
        || BUILDING_CONSTRUCTION_STATION_GROUPS.has(building.group)));
}

function hasBuildingConstructionStation() {
    return state.buildings.some(building => isBuildingConstructionStation(building.id));
}

function getMissingBuildingRequirements(building) {
    if (engineRuntimeState?.creativeMode) return [];
    const existingBuildingIds = new Set(state.buildings.map(placed => placed.id));
    return (building.requiredBuildings || []).filter(requiredId => !existingBuildingIds.has(requiredId));
}

function getStorageMaterialCount(storage, itemId) {
    return Math.max(0, Number(storage.storedMaterials?.[itemId]) || 0);
}

function getStorageUsedCapacity(storage) {
    return Object.values(storage.storedMaterials || {}).reduce((total, amount) => total + Math.max(0, Number(amount) || 0), 0);
}

function renderBuildingStorage(placed, definition) {
    const section = document.getElementById('building-storage-controls');
    const itemSelect = document.getElementById('building-storage-item');
    if (!section || !itemSelect) return;
    const capacity = Number(definition.storageCapacity) || 0;
    section.hidden = capacity <= 0;
    if (capacity <= 0) return;
    if (!isRecord(placed.storedMaterials)) placed.storedMaterials = {};
    const currentItem = itemSelect.value;
    itemSelect.replaceChildren(...CRAFTING_ITEMS.map(([id, name]) => new Option(name, id)));
    if (CRAFTING_ITEMS.some(([id]) => id === currentItem)) itemSelect.value = currentItem;
    const used = getStorageUsedCapacity(placed);
    document.getElementById('building-storage-status').textContent = `保管量 ${used} / ${capacity}　選択中: ${getStorageMaterialCount(placed, itemSelect.value)}`;
}

function transferBuildingStorage(direction) {
    const placed = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
    const definition = BUILDING_BY_ID.get(placed?.id);
    const itemId = document.getElementById('building-storage-item')?.value;
    const amount = Math.floor(Number(document.getElementById('building-storage-amount')?.value));
    if (!placed || !definition?.storageCapacity || !CRAFTING_ITEM_BY_ID.has(itemId) || !Number.isFinite(amount) || amount < 1) {
        showAppNotice('資材と数量を正しく指定してください。');
        return;
    }
    if (!isRecord(placed.storedMaterials)) placed.storedMaterials = {};
    const inventoryCount = itemId === 'brass-stock' ? Number(engineRuntimeState.brass) || 0 : getCraftingItemCount(itemId);
    const storedCount = getStorageMaterialCount(placed, itemId);
    const before = captureBuildingHistoryState();
    if (direction === 'deposit') {
        const capacityLeft = Math.floor(definition.storageCapacity - getStorageUsedCapacity(placed));
        const moved = Math.min(amount, capacityLeft, inventoryCount);
        if (moved < 1) {
            showAppNotice(capacityLeft < 1 ? 'ストレージに空きがありません。' : '所持資材がありません。');
            return;
        }
        placed.storedMaterials[itemId] = storedCount + moved;
        if (itemId === 'brass-stock') engineRuntimeState.brass -= moved;
        else engineRuntimeState.materialInventory[itemId] = inventoryCount - moved;
    } else {
        const moved = Math.min(amount, storedCount);
        if (moved < 1) {
            showAppNotice('ストレージに選択した資材がありません。');
            return;
        }
        placed.storedMaterials[itemId] = storedCount - moved;
        if (itemId === 'brass-stock') engineRuntimeState.brass += moved;
        else engineRuntimeState.materialInventory[itemId] = inventoryCount + moved;
    }
    recordBuildingHistory(before);
    saveBuildings();
    engineRuntimeState.saveGameData();
    engineRuntimeState.notify();
    renderBuildingStorage(placed, definition);
    showAppNotice(direction === 'deposit' ? '資材をストレージに預けました。' : '資材をストレージから取り出しました。');
}

function formatInventoryCount(itemId, count) {
    const amount = Number(count) || 0;
    if (!['water', 'fog', 'power', 'steam_power'].includes(itemId)) return String(Math.floor(amount));
    return amount.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function normalizeInventorySearch(value) {
    return String(value || '').normalize('NFKC').toLocaleLowerCase('ja');
}

function getCraftingRecipesForBuilding(buildingId) {
    return CRAFTING_RECIPES.map((recipe, index) => ({ recipe, index }))
        .filter(({ recipe }) => (CRAFTING_STATION_BUILDING_IDS[recipe[4]] || []).includes(buildingId));
}

function createBuildingSvgIcon(buildingId) {
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(namespace, 'svg');
    const use = document.createElementNS(namespace, 'use');
    svg.classList.add('building-item-icon-svg');
    svg.setAttribute('viewBox', '0 0 96 96');
    svg.setAttribute('aria-hidden', 'true');
    use.setAttribute('href', `assets/building-icons.svg?v=1#building-${buildingId}`);
    use.setAttribute('x', '0');
    use.setAttribute('y', '0');
    use.setAttribute('width', '96');
    use.setAttribute('height', '96');
    svg.appendChild(use);
    return svg;
}

function renderBuildingInventory() {
    if (document.getElementById('inventory-building-view')?.hidden) return;
    const list = document.getElementById('building-item-list');
    if (!list || !engineRuntimeState) return;
    const brass = Math.max(0, Number(engineRuntimeState.brass) || 0);
    const creative = Boolean(engineRuntimeState.creativeMode);
    const hasConstructionStation = hasBuildingConstructionStation();
    const search = normalizeInventorySearch(document.getElementById('building-item-search')?.value);
    const buildingKitCounts = BUILDING_DEFINITIONS.map(building => [building.id, getCraftingItemCount(building.id)]);
    const constructionJobs = (engineRuntimeState.craftingJobs || [])
        .filter(job => BUILDING_BY_ID.has(job.outputItem))
        .map(job => [job.jobId, job.recipeKey, Number(job.startedAt), Number(job.completesAt)]);
    const buildingMaterialCounts = BUILDING_DEFINITIONS.flatMap(building =>
        getBuildingMaterialCosts(building).map(([itemId]) => [itemId, getCraftingItemCount(itemId)]));
    const requirementSignature = JSON.stringify(BUILDING_DEFINITIONS.map(building => [building.id, getMissingBuildingRequirements(building)]));
    const signature = `${brass}:${creative}:${hasConstructionStation}:${search}:${JSON.stringify(buildingKitCounts)}:${JSON.stringify(buildingMaterialCounts)}:${JSON.stringify(constructionJobs)}:${requirementSignature}`;
    if (signature === buildingRenderSignature) return;
    buildingRenderSignature = signature;
    list.replaceChildren();
    const visibleBuildings = BUILDING_DEFINITIONS.filter(building => !search || normalizeInventorySearch(building.name).includes(search));
    if (!visibleBuildings.length) {
        const empty = document.createElement('span');
        empty.className = 'inventory-empty';
        empty.textContent = '該当する建築物はありません';
        list.appendChild(empty);
    }
    visibleBuildings.forEach(building => {
        const ownedCount = getCraftingItemCount(building.id);
        const activeJobs = (engineRuntimeState.craftingJobs || [])
            .filter(job => job.recipeKey === `building:${building.id}`)
            .sort((first, second) => Number(first.startedAt) - Number(second.startedAt));
        const requiresStation = isLargeBuilding(building) && building.id !== 'craft-bench';
        const stationAvailable = !requiresStation || hasConstructionStation;
        const materialCosts = getBuildingMaterialCosts(building);
        const missingRequirements = getMissingBuildingRequirements(building);
        const affordableCount = creative ? 99 : Math.max(0, Math.min(
            Math.floor(brass / Math.max(1, building.brassCost)),
            ...materialCosts.map(([itemId, amount]) => Math.floor(getCraftingItemCount(itemId) / amount))
        ));
        const maxCraftCount = missingRequirements.length && !creative ? 0 : affordableCount;
        const affordable = maxCraftCount > 0;
        const canCraftNow = stationAvailable && affordable;
        const missingBrass = !creative && brass < building.brassCost;
        const missingMaterialNames = creative ? [] : materialCosts
            .filter(([itemId, amount]) => getCraftingItemCount(itemId) < amount)
            .map(([itemId]) => getCraftingItemName(itemId));
        const missingRequirementNames = missingRequirements.map(id => BUILDING_BY_ID.get(id)?.name || id);
        const missingCostParts = [...(missingBrass ? ['真鍮'] : []), ...missingMaterialNames, ...missingRequirementNames];
        const missingCost = missingCostParts.length ? `${missingCostParts.join('・')}不足` : '';
        const card = document.createElement('article');
        card.className = `crafting-recipe-card building-item-card is-${building.role} ${canCraftNow ? 'is-craftable' : 'is-not-craftable is-unavailable'}`;
        const heading = document.createElement('div');
        heading.className = 'crafting-recipe-title';
        heading.dataset.unavailableLabel = !stationAvailable ? '作業台以上の設備が必要' : missingRequirements.length ? `前提設備: ${missingRequirementNames.join('・')}` : missingCost || '素材不足';
        const title = document.createElement('strong');
        title.textContent = `${building.name}を製作する`;
        const category = document.createElement('small');
        category.textContent = '建築キット';
        heading.append(title, category);

        const outputBlock = document.createElement('div');
        outputBlock.className = 'crafting-recipe-output';
        const outputCaption = document.createElement('span');
        outputCaption.className = 'crafting-output-caption';
        outputCaption.textContent = '建築物';
        const outputMain = document.createElement('div');
        outputMain.className = 'crafting-output-main';
        const icon = document.createElement('span');
        icon.className = `crafting-output-icon building-item-icon is-${building.role}`;
        icon.appendChild(createBuildingSvgIcon(building.id));
        const outputName = document.createElement('strong');
        outputName.className = 'crafting-output-name';
        outputName.textContent = building.name;
        const outputCount = document.createElement('span');
        outputCount.className = 'crafting-output-count';
        outputCount.textContent = `×${affordable ? 1 : 0}`;
        outputMain.append(icon, outputName, outputCount);
        outputBlock.append(outputCaption, outputMain);

        const materialsBlock = document.createElement('div');
        materialsBlock.className = 'crafting-recipe-materials';
        const materialsCaption = document.createElement('span');
        materialsCaption.className = 'crafting-materials-caption';
        materialsCaption.textContent = '必要素材';
        const materials = document.createElement('div');
        materials.className = 'crafting-materials-list';
        const materialEntries = [
            ['brass-stock', building.brassCost],
            ...materialCosts
        ];
        materialEntries.forEach(([itemId, amount]) => materials.appendChild(createCraftingChip(itemId, amount)));
        materialsBlock.append(materialsCaption, materials);

        const footer = document.createElement('div');
        footer.className = 'crafting-recipe-footer';
        const cost = document.createElement('span');
        const queueCount = activeJobs.length;
        const placementRule = building.requiresFoundation ? ' / 基礎必須' : building.role === 'vehicle' ? ' / 線路必須' : '';
        const status = queueCount
            ? `キュー ${queueCount}個`
            : !stationAvailable ? '作業台以上の設備が必要'
            : missingRequirements.length ? `前提設備が必要: ${missingRequirementNames.join('・')}`
            : !affordable ? missingCost || '素材不足'
            : `作成可能${ownedCount ? ` / 所持 ${ownedCount}` : ''}`;
        cost.textContent = `建築サイズ ${building.width}×${building.height}${placementRule} / ${status}`;
        if (activeJobs.length) {
            const countdown = document.createElement('span');
            countdown.className = 'building-item-countdown';
            countdown.dataset.completesAt = String(activeJobs[0].completesAt);
            countdown.textContent = `${Math.max(0, Math.ceil((Number(activeJobs[0].completesAt) - Date.now()) / 1000))}秒`;
            cost.appendChild(countdown);
        }
        const quantityLabel = document.createElement('label');
        quantityLabel.className = 'crafting-quantity-control';
        quantityLabel.append('作成数');
        const quantityMax = document.createElement('small');
        quantityMax.textContent = `最大 ${maxCraftCount}`;
        const quantityInput = document.createElement('input');
        quantityInput.className = 'crafting-quantity-input building-quantity-input';
        quantityInput.type = 'number';
        quantityInput.min = '1';
        quantityInput.max = String(maxCraftCount);
        quantityInput.value = affordable ? '1' : '0';
        quantityInput.disabled = !affordable;
        quantityInput.setAttribute('aria-label', `${building.name}の作成数`);
        quantityLabel.appendChild(quantityInput);
        quantityLabel.appendChild(quantityMax);
        const createButton = document.createElement('button');
        createButton.type = 'button';
        createButton.className = 'building-item-create';
        createButton.dataset.action = 'craft-building-kit';
        createButton.dataset.buildingId = building.id;
        createButton.textContent = `製作 ×${affordable ? 1 : 0}`;
        createButton.disabled = !stationAvailable || !affordable;
        quantityInput.addEventListener('input', () => {
            const selectedCount = Math.max(1, Math.min(maxCraftCount, Math.floor(Number(quantityInput.value) || 1)));
            outputCount.textContent = `×${selectedCount}`;
            createButton.textContent = `製作 ×${selectedCount}`;
        });
        const note = document.createElement('p');
        note.className = 'crafting-recipe-note';
        note.textContent = `所持キット: ${ownedCount}`;
        footer.append(cost, quantityLabel, createButton);
        card.append(heading, outputBlock, materialsBlock, footer, note);
        list.appendChild(card);
    });
}

function craftBuildingKit(buildingId, requestedCount) {
    const building = BUILDING_BY_ID.get(buildingId);
    if (!building || !engineRuntimeState) return;
    const requiresStation = isLargeBuilding(building) && building.id !== 'craft-bench';
    if (requiresStation && !hasBuildingConstructionStation()) {
        showAppNotice('2×2以上の建築には作業台以上の設備が必要です。');
        return;
    }
    const missingRequirements = getMissingBuildingRequirements(building);
    if (missingRequirements.length) {
        showAppNotice(`建設条件を満たしていません。必要設備: ${missingRequirements.map(id => BUILDING_BY_ID.get(id)?.name || id).join('・')}`);
        return;
    }
    const creative = Boolean(engineRuntimeState.creativeMode);
    const materialCosts = getBuildingMaterialCosts(building);
    const maxCraftCount = creative ? 99 : Math.max(0, Math.min(
        Math.floor(getCraftingItemCount('brass-stock') / Math.max(1, building.brassCost)),
        ...materialCosts.map(([itemId, amount]) => Math.floor(getCraftingItemCount(itemId) / amount))
    ));
    const quantity = Math.floor(Number(requestedCount));
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > maxCraftCount) {
        const missingBrass = getCraftingItemCount('brass-stock') < building.brassCost;
        const missingMaterials = materialCosts
            .filter(([itemId, amount]) => getCraftingItemCount(itemId) < amount)
            .map(([itemId]) => getCraftingItemName(itemId));
        const missingCost = [...(missingBrass ? ['真鍮'] : []), ...missingMaterials].join('・');
        showAppNotice(maxCraftCount > 0 ? `作成数は1〜${maxCraftCount}個で指定してください。` : `建築キットの作成に必要な${missingCost || '素材'}が足りません。`);
        return;
    }
    if (!creative && getCraftingItemCount('brass-stock') < building.brassCost * quantity) {
        showAppNotice('建築キットの作成に必要な真鍮が足りません。');
        return;
    }
    if (!creative) {
        engineRuntimeState.brass = Math.max(0, Number(engineRuntimeState.brass) - building.brassCost * quantity);
        materialCosts.forEach(([itemId, amount]) => {
            engineRuntimeState.materialInventory[itemId] = Math.max(0, getCraftingItemCount(itemId) - amount * quantity);
        });
    }
    const now = Date.now();
    let nextStartAt = getCraftingQueueNextStartAt(now);
    const batchGroupId = `building:${building.id}:${now}:${Math.random().toString(36).slice(2)}`;
    const duration = Math.max(4, building.brassCost * 4) * 1000;
    for (let index = 0; index < quantity; index++) {
        const startedAt = nextStartAt;
        const completesAt = startedAt + duration;
        engineRuntimeState.craftingJobs.push({
            jobId: `${batchGroupId}:${index + 1}`,
            batchGroupId,
            batchIndex: index + 1,
            batchCount: quantity,
            recipeKey: `building:${building.id}`,
            outputItem: building.id,
            outputAmount: 1,
            startedAt,
            completesAt
        });
        nextStartAt = completesAt;
    }
    engineRuntimeState.saveGameData();
    engineRuntimeState.notify();
    updateEngineDashboard();
    buildingRenderSignature = '';
    renderBuildingInventory();
}

function saveBuildings() {
    try {
        localStorage.setItem(BUILDINGS_STORAGE_KEY, JSON.stringify(state.buildings));
    } catch (error) {
        showAppNotice('建築物を保存できませんでした。');
    }
}

function captureBuildingHistoryState() {
    return {
        buildings: JSON.parse(JSON.stringify(state.buildings)),
        brass: Number(engineRuntimeState.brass) || 0,
        materialInventory: { ...engineRuntimeState.materialInventory }
    };
}

function updateBuildingHistoryButtons() {
    const undoButton = document.querySelector('[data-action="undo-building"]');
    const redoButton = document.querySelector('[data-action="redo-building"]');
    if (undoButton) undoButton.disabled = buildingUndoHistory.length === 0;
    if (redoButton) redoButton.disabled = buildingRedoHistory.length === 0;
}

function recordBuildingHistory(before, after = captureBuildingHistoryState()) {
    const beforeById = new Map(before.buildings.map((building, index) => [building.instanceId, { building, index }]));
    const afterById = new Map(after.buildings.map((building, index) => [building.instanceId, { building, index }]));
    const changedIds = [...new Set([...beforeById.keys(), ...afterById.keys()])]
        .filter(instanceId => JSON.stringify(beforeById.get(instanceId)?.building) !== JSON.stringify(afterById.get(instanceId)?.building));
    if (!changedIds.length) return;

    const inventoryDeltas = {};
    for (const itemId of new Set([...Object.keys(before.materialInventory), ...Object.keys(after.materialInventory)])) {
        const delta = (Number(after.materialInventory[itemId]) || 0) - (Number(before.materialInventory[itemId]) || 0);
        if (delta) inventoryDeltas[itemId] = delta;
    }
    buildingUndoHistory.push({
        changes: changedIds.map(instanceId => ({
            before: beforeById.get(instanceId) || null,
            after: afterById.get(instanceId) || null
        })),
        brassDelta: after.brass - before.brass,
        inventoryDeltas
    });
    if (buildingUndoHistory.length > BUILDING_HISTORY_LIMIT) buildingUndoHistory.shift();
    buildingRedoHistory.length = 0;
    updateBuildingHistoryButtons();
}

function applyBuildingHistory(direction) {
    const undoing = direction === 'undo';
    const source = undoing ? buildingUndoHistory : buildingRedoHistory;
    const destination = undoing ? buildingRedoHistory : buildingUndoHistory;
    const entry = source[source.length - 1];
    if (!entry) return;

    const resourceDirection = undoing ? -1 : 1;
    const nextBrass = (Number(engineRuntimeState.brass) || 0) + entry.brassDelta * resourceDirection;
    const nextInventory = new Map(Object.entries(entry.inventoryDeltas).map(([itemId, delta]) => [
        itemId,
        (Number(engineRuntimeState.materialInventory[itemId]) || 0) + delta * resourceDirection
    ]));
    if (nextBrass < 0 || [...nextInventory.values()].some(count => count < 0)) {
        showAppNotice('必要な素材が足りないため、この操作を戻せません。');
        return;
    }

    const targetSide = undoing ? 'before' : 'after';
    const affectedIds = new Set(entry.changes.flatMap(change => [
        change.before?.building.instanceId,
        change.after?.building.instanceId
    ]).filter(Boolean));
    state.buildings = state.buildings.filter(building => !affectedIds.has(building.instanceId));
    entry.changes
        .map(change => change[targetSide])
        .filter(Boolean)
        .sort((left, right) => left.index - right.index)
        .forEach(({ building, index }) => {
            state.buildings.splice(Math.min(index, state.buildings.length), 0, JSON.parse(JSON.stringify(building)));
        });

    engineRuntimeState.brass = nextBrass;
    nextInventory.forEach((count, itemId) => {
        engineRuntimeState.materialInventory[itemId] = count;
    });
    if (state.buildings.some(building => building.instanceId === selectedBuildingInstanceId)) {
        openBuildingMenu(selectedBuildingInstanceId);
    } else if (selectedBuildingInstanceId) {
        closeBuildingMenu();
    }
    source.pop();
    destination.push(entry);
    engineRuntimeState.saveGameData();
    engineRuntimeState.notify();
    saveBuildings();
    buildingRenderSignature = '';
    renderCellMaterials();
    updateBuildingHistoryButtons();
    scheduleDraw();
    showAppNotice(undoing ? '建築を元に戻しました。' : '建築をやり直しました。');
}

function loadBuildings() {
    try {
        const saved = JSON.parse(localStorage.getItem(BUILDINGS_STORAGE_KEY) || '[]');
        const validBuildings = Array.isArray(saved) ? saved.filter(building => isRecord(building)
            && BUILDING_BY_ID.has(building.id) && Number.isInteger(building.x) && Number.isInteger(building.y)
            && typeof building.instanceId === 'string'
            && building.x >= 0 && building.y >= 0
            && building.x + BUILDING_BY_ID.get(building.id).width <= state.cols
            && building.y + BUILDING_BY_ID.get(building.id).height <= state.rows) : [];
        const railPositions = new Set(validBuildings.filter(building => BUILDING_BY_ID.get(building.id)?.role === 'rail')
            .map(building => `${building.x},${building.y}`));
        let migrated = false;
        state.buildings = validBuildings.map(building => {
            const placed = { ...building };
            const definition = BUILDING_BY_ID.get(placed.id);
            const utilityState = normalizeBuildingUtilityState(placed.id, placed.utilityState);
            if (utilityState) {
                if (JSON.stringify(placed.utilityState) !== JSON.stringify(utilityState)) migrated = true;
                placed.utilityState = utilityState;
            }
            if (definition.role === 'vehicle') {
                if (!isRecord(placed.vehicle)) {
                    const legacyCenter = { x: placed.x + 1, y: placed.y + 1 };
                    if (railPositions.has(`${legacyCenter.x},${legacyCenter.y}`)) Object.assign(placed, legacyCenter);
                    placed.vehicle = { ...VEHICLE_DEFAULTS, resources: { ...VEHICLE_DEFAULTS.resources } };
                    migrated = true;
                } else {
                    const hasVehicleResources = isRecord(placed.vehicle.resources);
                    placed.vehicle = {
                        ...VEHICLE_DEFAULTS,
                        ...placed.vehicle,
                        resources: { ...VEHICLE_DEFAULTS.resources, ...(isRecord(placed.vehicle.resources) ? placed.vehicle.resources : {}) }
                    };
                    if (!hasVehicleResources) migrated = true;
                    if (placed.vehicle.running) {
                        placed.vehicle.running = false;
                        placed.vehicle.stopReason = '再読み込み後は停止';
                        placed.vehicle.previousRail = null;
                        placed.vehicle.movement = null;
                        placed.vehicle.nextMoveAt = 0;
                        migrated = true;
                    }
                }
            } else if (definition.kind === 'station' && !isRecord(placed.stationControl)) {
                placed.stationControl = { ...STATION_CONTROL_DEFAULTS, destinations: [], conditions: [] };
                migrated = true;
            }
            return placed;
        });
        if (migrated) saveBuildings();
    } catch (error) {
        state.buildings = [];
    }
}

function createInventoryIcon(itemId) {
    if (BUILDING_BY_ID.has(itemId)) return createBuildingSvgIcon(itemId);
    if (CRAFTING_ITEM_BY_ID.has(itemId) || itemId === 'grain' || itemId === 'paper_scroll' || itemId === 'cloth_scroll' || itemId === 'scroll_book' || itemId === 'fog' || itemId === 'power' || itemId === 'steam_power') {
        return createCraftingIcon(itemId);
    }
    const icon = document.createElement('span');
    icon.className = 'inventory-item-icon-fallback';
    icon.textContent = '・';
    return icon;
}

function renderCellMaterials() {
    if (!engineRuntimeState) return;
    renderBuildingInventory();
    const inventoryList = document.getElementById('inventory-item-list');
    const inventoryIds = new Set(Object.entries(engineRuntimeState.materialInventory || {})
        .filter(([, count]) => Number(count) > 0)
        .filter(([itemId]) => !DEFERRED_CRAFTING_ITEM_IDS.has(itemId))
        .map(([item]) => item));
    if (engineRuntimeState.brass > 0) inventoryIds.add('brass-stock');
    ['water', 'fog', 'power', 'steam_power'].forEach(itemId => {
        if (getCraftingItemCount(itemId) > 0) inventoryIds.add(itemId);
    });
    const orderedIds = [
        ...CRAFTING_ITEMS.map(([id]) => id).filter(id => inventoryIds.has(id)),
        ...[...inventoryIds].filter(id => !CRAFTING_ITEM_BY_ID.has(id))
    ];
    const inventorySearch = normalizeInventorySearch(document.getElementById('inventory-item-search')?.value);
    const visibleInventoryIds = orderedIds.filter(id => !inventorySearch || normalizeInventorySearch(getCraftingItemName(id)).includes(inventorySearch));
    const inventorySignature = `${inventorySearch}:${JSON.stringify(visibleInventoryIds.map(id => [id, getCraftingItemCount(id)]))}`;
    if (inventoryList && inventorySignature !== inventoryRenderSignature) {
        inventoryRenderSignature = inventorySignature;
        inventoryList.replaceChildren();
        if (!visibleInventoryIds.length) {
            const empty = document.createElement('span');
            empty.className = 'inventory-empty';
            empty.textContent = inventorySearch ? '該当する所持品はありません' : '所持品はありません';
            inventoryList.appendChild(empty);
        }
        visibleInventoryIds.forEach(itemId => {
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
    if (!recipeList || document.getElementById('inventory-crafting-view')?.hidden) return;
    const selectedFamily = document.getElementById('crafting-family-filter')?.value || 'all';
    const recipeSearch = normalizeInventorySearch(document.getElementById('crafting-recipe-search')?.value);
    const visibleRecipes = sortCraftingRecipesByAvailability(CRAFTING_RECIPES.map((recipe, index) => ({ recipe, index }))
        .filter(({ recipe }) => {
            if (recipe[4] !== HANDCRAFT_STATION) return false;
            if (selectedFamily !== 'all' && recipe[0] !== selectedFamily) return false;
            if (!recipeSearch) return true;
            const [family, title, inputs, output, station, note] = recipe;
            const searchableText = [family, title, station, note, getCraftingItemName(output), ...inputs.map(([itemId]) => getCraftingItemName(itemId))].join(' ');
            return normalizeInventorySearch(searchableText).includes(recipeSearch);
        }));
    const now = Date.now();
    const jobSignature = JSON.stringify((engineRuntimeState.craftingJobs || [])
        .map(job => [job.jobId, job.recipeKey, Number(job.startedAt), Number(job.completesAt)]));
    const craftingSignature = `${selectedFamily}:${recipeSearch}:${JSON.stringify(orderedIds.map(id => [id, getCraftingItemCount(id)]))}:${jobSignature}`;
    if (craftingSignature === craftingRenderSignature) return;
    craftingRenderSignature = craftingSignature;
    recipeList.replaceChildren();
    if (!visibleRecipes.length) {
        const empty = document.createElement('p');
        empty.className = 'inventory-empty';
        empty.textContent = recipeSearch || selectedFamily !== 'all'
            ? '条件に一致する手作業の加工・合成レシピはありません'
            : '手作業で作れる加工・合成レシピはありません';
        recipeList.appendChild(empty);
        return;
    }
    visibleRecipes.forEach(({ recipe, index }) => recipeList.appendChild(createCraftingRecipeCard(recipe, index, now)));
}

function createCraftingRecipeCard(recipe, index, now, buildingInstanceId = '') {
    const [family, title, inputs, output, station, note, batch = 1, duration = 0] = recipe;
    const recipeKey = `${family}:${title}`;
    const activeJobs = (engineRuntimeState.craftingJobs || []).filter(job => job.recipeKey === recipeKey);
    const maxCraftCount = getMaximumCraftCount(inputs);
    const defaultCraftCount = maxCraftCount > 0 ? 1 : 0;
    const card = document.createElement('article');
    card.className = `crafting-recipe-card${maxCraftCount > 0 ? '' : ' is-unavailable'}`;
    const heading = document.createElement('div');
    heading.className = 'crafting-recipe-title';
    const titleText = document.createElement('strong');
    titleText.textContent = title === '木材を板に挽く' ? '製材板に加工' : title;
    const groupText = document.createElement('small');
    groupText.textContent = family;
    heading.append(titleText, groupText);
    const outputBlock = document.createElement('div');
    outputBlock.className = 'crafting-recipe-output';
    const outputCaption = document.createElement('span');
    outputCaption.className = 'crafting-output-caption';
    outputCaption.textContent = '生成物';
    const outputMain = document.createElement('div');
    outputMain.className = 'crafting-output-main';
    const outputIcon = document.createElement('span');
    outputIcon.className = 'crafting-output-icon';
    outputIcon.appendChild(createInventoryIcon(output));
    const outputName = document.createElement('strong');
    outputName.className = 'crafting-output-name';
    outputName.textContent = getCraftingItemName(output);
    const outputCount = document.createElement('span');
    outputCount.className = 'crafting-output-count';
    outputCount.textContent = `×${batch * defaultCraftCount}`;
    outputMain.append(outputIcon, outputName, outputCount);
    outputBlock.append(outputCaption, outputMain);

    const materialsBlock = document.createElement('div');
    materialsBlock.className = 'crafting-recipe-materials';
    const materialsCaption = document.createElement('span');
    materialsCaption.className = 'crafting-materials-caption';
    materialsCaption.textContent = '必要素材';
    const materialsList = document.createElement('div');
    materialsList.className = 'crafting-materials-list';
    inputs.forEach(([itemId, amount]) => materialsList.appendChild(createCraftingChip(itemId, amount)));
    materialsBlock.append(materialsCaption, materialsList);
    const footer = document.createElement('div');
    footer.className = 'crafting-recipe-footer';
    const stationLabel = document.createElement('span');
    stationLabel.textContent = activeJobs.length
        ? `${station} / 進行中 ${activeJobs.length}回`
        : `${station} / ${Math.max(1, Math.round(duration / CRAFTING_RATE_MULTIPLIER))}秒`;
    if (activeJobs.length) {
        const countdown = document.createElement('span');
        countdown.className = 'crafting-countdown';
        countdown.dataset.completesAt = String(activeJobs[0].completesAt);
        countdown.textContent = `${Math.max(0, Math.ceil((Number(activeJobs[0].completesAt) - now) / 1000))}秒`;
        stationLabel.appendChild(countdown);
    }
    const quantityLabel = document.createElement('label');
    quantityLabel.className = 'crafting-quantity-control';
    quantityLabel.append('作成回数');
    const quantityInput = document.createElement('input');
    quantityInput.className = 'crafting-quantity-input';
    quantityInput.type = 'number';
    quantityInput.min = '1';
    quantityInput.max = String(maxCraftCount);
    quantityInput.value = String(defaultCraftCount);
    quantityInput.disabled = maxCraftCount === 0;
    quantityInput.setAttribute('aria-label', `${getCraftingItemName(output)}の作成回数`);
    quantityLabel.appendChild(quantityInput);
    const quantityMax = document.createElement('small');
    quantityMax.textContent = `最大 ${maxCraftCount}回`;
    quantityLabel.appendChild(quantityMax);
    const craftButton = document.createElement('button');
    craftButton.type = 'button';
    craftButton.dataset.action = 'craft-recipe';
    craftButton.dataset.recipeIndex = String(index);
    if (buildingInstanceId) craftButton.dataset.buildingInstanceId = buildingInstanceId;
    craftButton.textContent = `製作 ×${batch * defaultCraftCount}`;
    craftButton.disabled = maxCraftCount === 0;
    quantityInput.addEventListener('input', () => {
        const selectedCount = Math.max(1, Math.min(maxCraftCount, Math.floor(Number(quantityInput.value) || 1)));
        outputCount.textContent = `×${batch * selectedCount}`;
        craftButton.textContent = `製作 ×${batch * selectedCount}`;
    });
    footer.append(stationLabel, quantityLabel, craftButton);
    const noteElement = document.createElement('p');
    noteElement.className = 'crafting-recipe-note';
    noteElement.textContent = note;
    card.append(heading, outputBlock, materialsBlock, footer, noteElement);
    return card;
}

function createCraftingChip(itemId, amount) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.dataset.action = 'show-recipe-detail';
    chip.dataset.itemKey = itemId;
    const available = getCraftingItemCount(itemId);
    chip.className = `crafting-item-chip${available < amount ? ' is-missing' : ''}`;
    chip.setAttribute('aria-label', `${getCraftingItemName(itemId)}: 所持 ${formatInventoryCount(itemId, available)} / 必要 ${amount}`);
    const icon = document.createElement('span');
    icon.className = 'crafting-item-icon';
    icon.appendChild(createInventoryIcon(itemId));
    const label = document.createElement('span');
    label.className = 'crafting-item-name';
    label.textContent = getCraftingItemName(itemId);
    const quantity = document.createElement('strong');
    quantity.className = 'crafting-item-quantity';
    quantity.textContent = `×${amount}`;
    chip.append(icon, label, quantity);
    return chip;
}

function createRecipeDetailSection(title) {
    const section = document.createElement('section');
    section.className = 'recipe-detail-section';
    const heading = document.createElement('h3');
    heading.textContent = title;
    section.appendChild(heading);
    return section;
}

function appendRecipeDetailLink(container, itemId, label, amount) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'recipe-detail-material';
    button.dataset.action = 'show-recipe-detail';
    button.dataset.itemKey = itemId;
    button.append(document.createTextNode(label || getCraftingItemName(itemId)));
    if (amount !== undefined) {
        const quantity = document.createElement('strong');
        quantity.textContent = `×${amount}`;
        button.appendChild(quantity);
    }
    container.appendChild(button);
}

function appendRecipeDetailMaterial(container, itemId, amount) {
    appendRecipeDetailLink(container, itemId, '', amount);
}

function showRecipeDetail(itemId, pushHistory = true) {
    if (pushHistory) recipeDetailHistory.push(itemId);
    const currentItemId = recipeDetailHistory.at(-1);
    if (!currentItemId) return;
    const item = CRAFTING_ITEM_BY_ID.get(currentItemId);
    const building = BUILDING_BY_ID.get(currentItemId);
    const name = getCraftingItemName(currentItemId);
    document.getElementById('recipe-detail-title').textContent = `${name}の製作方法・用途`;
    document.getElementById('recipe-detail-back').hidden = recipeDetailHistory.length < 2;
    const content = document.getElementById('recipe-detail-content');
    content.replaceChildren();

    const sources = Object.entries(WORLD_CELL_TYPES).flatMap(([type, definition]) => {
        const collectionCount = Array.from({ length: 5 }, (_, count) => count)
            .find((count) => getCellDrops(type, count).includes(currentItemId));
        return definition.collect === currentItemId || collectionCount !== undefined
            ? [{ type, definition, collectionCount: collectionCount ?? 0 }]
            : [];
    });
    if (sources.length) {
        const section = createRecipeDetailSection('採集できるセル');
        const list = document.createElement('div');
        list.className = 'recipe-detail-row';
        sources.forEach(({ type, definition, collectionCount }) => {
            const source = document.createElement('span');
            source.className = 'recipe-detail-material';
            source.textContent = `${definition.label} / ${getCellCollectionPowerCost(type, collectionCount)} 動力`;
            list.appendChild(source);
        });
        section.appendChild(list);
        content.appendChild(section);
    }

    const recipes = CRAFTING_RECIPES.filter((recipe) => recipe[3] === currentItemId);
    recipes.forEach((recipe) => {
        const section = createRecipeDetailSection(recipe[1]);
        const station = document.createElement('p');
        const stationBuildings = (CRAFTING_STATION_BUILDING_IDS[recipe[4]] || [])
            .map((buildingId) => BUILDING_BY_ID.get(buildingId)?.name)
            .filter((buildingName) => buildingName && buildingName !== recipe[4]);
        station.textContent = `製作場所: ${recipe[4]}${stationBuildings.length ? `（${stationBuildings.join('・')}）` : ''}`;
        section.appendChild(station);
        const materials = document.createElement('div');
        materials.className = 'recipe-detail-row';
        recipe[2].forEach(([materialId, amount]) => appendRecipeDetailMaterial(materials, materialId, amount));
        section.appendChild(materials);
        if (recipe[5]) {
            const note = document.createElement('p');
            note.textContent = recipe[5];
            section.appendChild(note);
        }
        content.appendChild(section);
    });

    if (building) {
        const section = createRecipeDetailSection('建築キットの作成素材');
        const station = document.createElement('p');
        station.textContent = building.width >= 2 && building.height >= 2
            ? '作成場所: インベントリの「建築」タブ（作業台以上の設備が必要）'
            : '作成場所: インベントリの「建築」タブ';
        section.appendChild(station);
        const materials = document.createElement('div');
        materials.className = 'recipe-detail-row';
        appendRecipeDetailMaterial(materials, 'brass-stock', building.brassCost);
        (building.materialCosts || []).forEach(([materialId, amount]) => appendRecipeDetailMaterial(materials, materialId, amount));
        section.appendChild(materials);
        content.appendChild(section);
    }

    const recipeUses = CRAFTING_RECIPES.filter((recipe) =>
        recipe[2].some(([materialId]) => materialId === currentItemId)
    );
    const transformUses = Object.entries(TERRAIN_TRANSFORM_RECIPES).filter(([, inputs]) =>
        Object.prototype.hasOwnProperty.call(inputs, currentItemId)
    );
    const uses = BUILDING_DEFINITIONS.filter((candidate) =>
        (candidate.materialCosts || []).some(([materialId]) => materialId === currentItemId)
    );
    if (recipeUses.length || transformUses.length || uses.length) {
        const section = createRecipeDetailSection('後続工程・建築での用途');
        const list = document.createElement('div');
        list.className = 'recipe-detail-row';
        recipeUses.forEach((recipe) => {
            appendRecipeDetailLink(list, recipe[3], `加工: ${recipe[1]}`);
        });
        transformUses.forEach(([type]) => {
            const use = document.createElement('span');
            use.className = 'recipe-detail-material';
            use.textContent = `地形変成: ${WORLD_CELL_TYPES[type]?.label || type}`;
            list.appendChild(use);
        });
        uses.forEach((candidate) => {
            const amount = candidate.materialCosts.find(([id]) => id === currentItemId)[1];
            appendRecipeDetailLink(list, candidate.id, candidate.name, amount);
        });
        section.appendChild(list);
        content.appendChild(section);
    }

    const hasUse = recipeUses.length > 0 || transformUses.length > 0 || uses.length > 0;
    if (recipes.length && !hasUse) {
        const note = document.createElement('p');
        note.className = 'recipe-detail-empty';
        note.textContent = 'この製品は作成できますが、現行の加工・建築・地形変成で使う先がありません。';
        content.appendChild(note);
    } else if (!sources.length && !recipes.length && !building && !hasUse) {
        const note = document.createElement('p');
        note.className = 'recipe-detail-empty';
        note.textContent = item
            ? 'この素材は現在の採集・加工・建築データに用途が登録されていません。'
            : 'このアイテムは現在のレシピ・建築データに登録されていません。';
        content.appendChild(note);
    }
    document.getElementById('recipe-detail-modal').hidden = false;
}

function closeRecipeDetail() {
    document.getElementById('recipe-detail-modal').hidden = true;
    recipeDetailHistory.length = 0;
}

function goBackRecipeDetail() {
    if (recipeDetailHistory.length < 2) return;
    recipeDetailHistory.pop();
    showRecipeDetail(recipeDetailHistory.at(-1), false);
}

function canCraftRecipeAtBuilding(recipe, buildingInstanceId) {
    if (!recipe || recipe[4] === HANDCRAFT_STATION || !buildingInstanceId) return false;
    const buildingIds = CRAFTING_STATION_BUILDING_IDS[recipe[4]] || [];
    return state.buildings.some(building => building.instanceId === buildingInstanceId && buildingIds.includes(building.id));
}

function craftRecipe(recipeIndex, buildingInstanceId = '', requestedCount) {
    const recipe = CRAFTING_RECIPES[recipeIndex];
    const creative = Boolean(engineRuntimeState?.creativeMode);
    const isHandcraft = recipe?.[4] === HANDCRAFT_STATION;
    if (!recipe || (isHandcraft ? Boolean(buildingInstanceId) : !canCraftRecipeAtBuilding(recipe, buildingInstanceId))) {
        showAppNotice('このレシピに対応する製作設備が必要です。');
        return;
    }
    const maxCraftCount = getMaximumCraftCount(recipe[2], creative);
    const quantity = Math.floor(Number(requestedCount));
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > maxCraftCount) {
        showAppNotice(maxCraftCount > 0 ? `作成回数は1〜${maxCraftCount}回で指定してください。` : '製作に必要な素材が足りません。');
        return;
    }
    if (!creative && recipe[2].some(([itemId, amount]) => getCraftingItemCount(itemId) < amount * quantity)) {
        showAppNotice('製作に必要な素材が足りません。');
        return;
    }
    const recipeKey = `${recipe[0]}:${recipe[1]}`;
    engineRuntimeState.saveState();
    if (!creative) recipe[2].forEach(([itemId, amount]) => {
        const totalAmount = amount * quantity;
        if (itemId === 'brass-stock') engineRuntimeState.brass -= totalAmount;
        else if (['water', 'fog', 'power', 'steam_power'].includes(itemId)) {
            const resourceKey = { water: 'water', fog: 'fog', power: 'power', steam_power: 'steamPower' }[itemId];
            engineRuntimeState[resourceKey] = Math.max(0, Number(engineRuntimeState[resourceKey]) - totalAmount);
        }
        else engineRuntimeState.materialInventory[itemId] = Math.max(0, getCraftingItemCount(itemId) - totalAmount);
    });
    const outputAmount = Number(recipe[6]) || 1;
    const duration = Math.max(1000, Math.round((Number(recipe[7]) || 90) / CRAFTING_RATE_MULTIPLIER * 1000));
    const now = Date.now();
    const startedAt = getCraftingQueueNextStartAt(now);
    const batchGroupId = `${recipeKey}:${startedAt}:${Math.random().toString(36).slice(2)}`;
    let nextStartAt = startedAt;
    for (let index = 0; index < quantity; index++) {
        const completesAt = nextStartAt + duration;
        engineRuntimeState.craftingJobs.push({
            jobId: `${batchGroupId}:${index + 1}`,
            batchGroupId,
            batchIndex: index + 1,
            batchCount: quantity,
            recipeKey,
            outputItem: recipe[3],
            outputAmount,
            startedAt: nextStartAt,
            completesAt
        });
        nextStartAt = completesAt;
    }
    engineRuntimeState.saveGameData();
    engineRuntimeState.notify();
    updateEngineDashboard();
    if (!document.getElementById('building-crafting-modal')?.hidden) renderBuildingCrafting();
    showAppNotice(`${getCraftingItemName(recipe[3])}の製作を開始しました。`);
}

function getCraftingQueueNextStartAt(now = Date.now()) {
    return Math.max(now, ...(engineRuntimeState?.craftingJobs || [])
        .map(job => Number(job.completesAt))
        .filter(Number.isFinite));
}

function closeBuildingCrafting() {
    const modal = document.getElementById('building-crafting-modal');
    if (modal) modal.hidden = true;
    activeCraftingBuildingInstanceId = null;
    buildingCraftingRenderSignature = '';
}

function renderBuildingCrafting() {
    const placed = state.buildings.find(building => building.instanceId === activeCraftingBuildingInstanceId);
    const definition = BUILDING_BY_ID.get(placed?.id);
    const list = document.getElementById('building-crafting-list');
    if (!placed || !definition || !list) {
        closeBuildingCrafting();
        return;
    }
    document.getElementById('building-crafting-title').textContent = `${definition.name}で製作`;
    const search = normalizeInventorySearch(document.getElementById('building-crafting-search')?.value);
    const recipes = getCraftingRecipesForBuilding(definition.id).filter(({ recipe }) => {
        if (!search) return true;
        const [family, title, inputs, output, station, note] = recipe;
        const searchableText = [family, title, station, note, getCraftingItemName(output), ...inputs.map(([itemId]) => getCraftingItemName(itemId))].join(' ');
        return normalizeInventorySearch(searchableText).includes(search);
    });
    const jobSignature = JSON.stringify(recipes.map(({ recipe }) => {
        const recipeKey = `${recipe[0]}:${recipe[1]}`;
        const activeJobs = (engineRuntimeState.craftingJobs || [])
            .filter(job => job.recipeKey === recipeKey)
            .map(job => [job.jobId, Number(job.completesAt)]);
        const availableInputs = recipe[2].map(([itemId]) => getCraftingItemCount(itemId));
        return [recipeKey, activeJobs, availableInputs];
    }));
    const signature = `${placed.instanceId}:${search}:${jobSignature}`;
    if (signature === buildingCraftingRenderSignature) return;
    buildingCraftingRenderSignature = signature;
    list.replaceChildren();
    if (!recipes.length) {
        const empty = document.createElement('p');
        empty.className = 'inventory-empty';
        empty.textContent = search ? '該当する製作レシピはありません' : 'この設備で製作できるレシピはありません';
        list.appendChild(empty);
        return;
    }
    const now = Date.now();
    sortCraftingRecipesByAvailability(recipes)
        .forEach(({ recipe, index }) => list.appendChild(createCraftingRecipeCard(recipe, index, now, placed.instanceId)));
}

function updateCraftingCountdowns() {
    document.querySelectorAll('.crafting-countdown, .building-item-countdown').forEach(countdown => {
        const remaining = Math.max(0, Math.ceil((Number(countdown.dataset.completesAt) - Date.now()) / 1000));
        countdown.textContent = `${remaining}秒`;
    });
    syncCraftingNotifications();
}

function createCraftingNotification(job) {
    const card = document.createElement('article');
    card.className = 'crafting-progress-card';
    card.dataset.jobId = job.jobId;
    const icon = document.createElement('span');
    icon.className = 'crafting-progress-icon';
    icon.appendChild(createInventoryIcon(job.outputItem));
    const copy = document.createElement('span');
    copy.className = 'crafting-progress-copy';
    const title = document.createElement('strong');
    title.className = 'crafting-progress-title';
    const meta = document.createElement('span');
    meta.className = 'crafting-progress-meta';
    const batch = document.createElement('span');
    batch.className = 'crafting-progress-batch';
    const remaining = document.createElement('span');
    remaining.className = 'crafting-progress-remaining';
    const track = document.createElement('span');
    track.className = 'crafting-progress-track';
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    const fill = document.createElement('span');
    fill.className = 'crafting-progress-fill';
    track.appendChild(fill);
    meta.append(batch, remaining);
    copy.append(title, meta, track);
    card.append(icon, copy);
    document.getElementById('crafting-notifications')?.appendChild(card);
    return { card, title, batch, remaining, track };
}

function syncCraftingNotifications() {
    const container = document.getElementById('crafting-notifications');
    if (!container || !engineRuntimeState) return;
    const jobs = engineRuntimeState.craftingJobs || [];
    const activeIds = new Set(jobs.map(job => job.jobId));
    for (const [jobId, entry] of craftingNotificationCards) {
        if (activeIds.has(jobId)) continue;
        entry.card.remove();
        craftingNotificationCards.delete(jobId);
    }
    const now = Date.now();
    const queuePositions = new Map(jobs
        .slice()
        .sort((first, second) => Number(first.startedAt) - Number(second.startedAt)
            || Number(first.completesAt) - Number(second.completesAt))
        .map((job, index) => [job.jobId, index + 1]));
    jobs.forEach(job => {
        let entry = craftingNotificationCards.get(job.jobId);
        if (!entry) {
            entry = createCraftingNotification(job);
            craftingNotificationCards.set(job.jobId, entry);
        }
        const outputName = getCraftingItemName(job.outputItem);
        const outputAmount = Math.max(1, Math.floor(Number(job.outputAmount) || 1));
        const batchIndex = Math.max(1, Math.floor(Number(job.batchIndex) || 1));
        const batchCount = Math.max(batchIndex, Math.floor(Number(job.batchCount) || 1));
        const startedAt = Number(job.startedAt);
        const completesAt = Number(job.completesAt);
        const start = Number.isFinite(startedAt) ? startedAt : now;
        const duration = Math.max(1, completesAt - start);
        const progress = Math.max(0, Math.min(100, ((now - start) / duration) * 100));
        const secondsLeft = Math.max(0, Math.ceil((completesAt - now) / 1000));
        const queued = now < start;
        const queuePosition = queuePositions.get(job.jobId);
        entry.title.textContent = `${outputName}${outputAmount > 1 ? ` ×${outputAmount}` : ''}`;
        const batchLabel = queued
            ? `キュー ${queuePosition}番目`
            : batchCount > 1 ? `作成中 ${batchIndex}/${batchCount}` : '作成中';
        const remainingLabel = queued
            ? `着手まで ${Math.max(0, Math.ceil((start - now) / 1000))}秒`
            : `残り ${secondsLeft}秒`;
        entry.card.toggleAttribute('data-queued', queued);
        if (entry.batch.textContent !== batchLabel) entry.batch.textContent = batchLabel;
        if (entry.remaining.textContent !== remainingLabel) entry.remaining.textContent = remainingLabel;
        entry.track.setAttribute('aria-label', `${outputName}の作成進行状況`);
        entry.track.setAttribute('aria-valuenow', String(Math.round(progress)));
        entry.track.firstElementChild.style.setProperty('--crafting-progress', `${progress}%`);
    });
}

function openBuildingCrafting() {
    const placed = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
    if (!placed || !getCraftingRecipesForBuilding(placed.id).length) return;
    activeCraftingBuildingInstanceId = placed.instanceId;
    document.getElementById('building-crafting-search').value = '';
    document.getElementById('building-crafting-modal').hidden = false;
    renderBuildingCrafting();
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

let vehicleFrameQueued = false;

function scheduleVehicleAnimation() {
    if (vehicleFrameQueued) return;
    vehicleFrameQueued = true;
    requestAnimationFrame(now => {
        vehicleFrameQueued = false;
        tickVehicleRuntime(now);
        drawVehicleAnimation(now);
        if (state.buildings.some(placed => placed.vehicle?.running || placed.vehicle?.movement)) scheduleVehicleAnimation();
    });
}

function getVehicleMotionSprite(placed) {
    let sprite = vehicleMotionSprites.get(placed.instanceId);
    if (sprite) return sprite;
    const element = document.createElement('canvas');
    element.className = 'vehicle-motion-sprite';
    element.setAttribute('aria-hidden', 'true');
    vehicleAnimationLayer.appendChild(element);
    sprite = { element, animation: null, movementKey: '', viewKey: '' };
    vehicleMotionSprites.set(placed.instanceId, sprite);
    return sprite;
}

function drawVehicleAnimation(now) {
    const viewW = canvas.width / state.zoom;
    const viewH = canvas.height / state.zoom;
    const left = state.camera.x - viewW / 2;
    const top = state.camera.y - viewH / 2;
    const startCol = Math.max(0, Math.floor(left / state.tileSize));
    const endCol = Math.min(state.cols, Math.ceil((left + viewW) / state.tileSize));
    const startRow = Math.max(0, Math.floor(top / state.tileSize));
    const endRow = Math.min(state.rows, Math.ceil((top + viewH) / state.tileSize));
    const activeSprites = new Set();
    state.buildings.forEach(placed => {
        const definition = BUILDING_BY_ID.get(placed.id);
        if (definition?.role !== 'vehicle' || !placed.vehicle?.movement) return;
        activeSprites.add(placed.instanceId);
        const frame = getVehicleRenderState(placed, now);
        const sprite = getVehicleMotionSprite(placed);
        const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
        const spriteSize = Math.round(state.tileSize * pixelRatio);
        if (sprite.element.width !== spriteSize || sprite.element.height !== spriteSize) {
            sprite.element.width = spriteSize;
            sprite.element.height = spriteSize;
        }
        const spriteContext = sprite.element.getContext('2d');
        spriteContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        spriteContext.clearRect(0, 0, state.tileSize, state.tileSize);
        drawBuilding(spriteContext, { ...definition, x: 0, y: 0, rotation: frame.rotation }, state.tileSize, { zoom: 1 });
        sprite.element.style.width = `${state.tileSize * state.zoom}px`;
        sprite.element.style.height = `${state.tileSize * state.zoom}px`;
        const movement = placed.vehicle.movement;
        const movementKey = `${movement.startedAt}:${movement.from.x},${movement.from.y}:${movement.to.x},${movement.to.y}:${movement.durationMs}`;
        const viewKey = `${state.camera.x},${state.camera.y},${state.zoom},${canvas.width},${canvas.height}`;
        if (sprite.movementKey !== movementKey || sprite.viewKey !== viewKey) {
            sprite.animation?.cancel();
            const fromLeft = (movement.from.x * state.tileSize - state.camera.x) * state.zoom + canvas.width / 2;
            const fromTop = (movement.from.y * state.tileSize - state.camera.y) * state.zoom + canvas.height / 2;
            const toLeft = (movement.to.x * state.tileSize - state.camera.x) * state.zoom + canvas.width / 2;
            const toTop = (movement.to.y * state.tileSize - state.camera.y) * state.zoom + canvas.height / 2;
            const startTransform = `translate3d(${fromLeft}px, ${fromTop}px, 0)`;
            const endTransform = `translate3d(${toLeft}px, ${toTop}px, 0)`;
            const duration = Math.max(1, Number(movement.durationMs) || 1);
            sprite.element.style.transform = startTransform;
            sprite.animation = sprite.element.animate([
                { transform: startTransform },
                { transform: endTransform }
            ], { duration, easing: 'linear', fill: 'both' });
            sprite.animation.currentTime = Math.max(0, Math.min(duration, now - movement.startedAt));
            sprite.movementKey = movementKey;
            sprite.viewKey = viewKey;
        }
    });
    vehicleMotionSprites.forEach((sprite, instanceId) => {
        if (activeSprites.has(instanceId)) return;
        sprite.element.remove();
        vehicleMotionSprites.delete(instanceId);
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

function hasBuildingResources(building) {
    return Boolean(engineRuntimeState?.creativeMode) || getCraftingItemCount('brass-stock') >= building.brassCost;
}

function getBuildingPlacementIssue(building, x, y) {
    if (!building) return '建築データがありません';
    if (x < 0 || y < 0 || x + building.width > state.cols || y + building.height > state.rows) return 'マップの範囲外です';
    if (activeBuildingPlacement?.fromInventory) {
        if (getCraftingItemCount(building.id) <= 0) return '設置用の建築キットがありません';
    } else if (!hasBuildingResources(building)) return '真鍮が不足しています';
    const right = x + building.width;
    const bottom = y + building.height;
    const vehicle = building.role === 'vehicle';
    if (building.role === 'rail' && state.buildings.some(placed => BUILDING_BY_ID.get(placed.id)?.role === 'rail' && placed.x === x && placed.y === y)) return 'このセルにはすでに線路があります';
    for (const placed of state.buildings) {
        const other = BUILDING_BY_ID.get(placed.id);
        if (!other || placed.instanceId === activeBuildingPlacement?.ignoreInstanceId) continue;
        const overlaps = x < placed.x + other.width && right > placed.x && y < placed.y + other.height && bottom > placed.y;
        if (!overlaps || !building.blocksConstruction || !other.blocksConstruction) continue;
        if (vehicle && other.role === 'rail') continue;
        return other.role === 'rail' ? '建築物は線路を避けてください' : '別の建築物と重なっています';
    }
    if (state.player.x >= x && state.player.x < right && state.player.y >= y && state.player.y < bottom) return 'プレイヤーの位置を避けてください';
    for (let row = y; row < bottom; row++) {
        for (let column = x; column < right; column++) {
            const tile = state.map[row]?.[column];
            if (!canPlaceBuildingOnTerrainCell(building, tile)) return building.role === 'rail' ? '海や湖には線路を置けません' : '陸地を選んでください';
        }
    }
    if (vehicle) {
        const railY = y + Math.floor(building.height / 2);
        for (let column = x; column < right; column++) {
            if (!state.buildings.some(placed => BUILDING_BY_ID.get(placed.id)?.role === 'rail' && placed.x === column && placed.y === railY)) return '車両全長分の線路が必要です';
        }
    }
    if (building.requiresFoundation) {
        let missingFoundationCount = 0;
        for (let row = y; row < bottom; row++) {
            for (let column = x; column < right; column++) {
                if (!state.buildings.some(placed => placed.id === 'foundation-cell' && placed.x === column && placed.y === row)) missingFoundationCount++;
            }
        }
        if (missingFoundationCount) return `基礎セルが${missingFoundationCount}マス不足しています`;
    }
    return '';
}

function isBuildingPlacementValid(building, x, y) {
    return !getBuildingPlacementIssue(building, x, y);
}

function getBuildingRotationLabel(building, rotation) {
    const labels = building.kind === 'rail-curve'
        ? ['北東', '東南', '南西', '西北']
        : building.kind === 'rail-switch'
            ? ['東', '南', '西', '北']
            : ['北南', '東西', '南北', '西東'];
    return labels[rotation % 4];
}

function updateBuildingPlacementControls() {
    const controls = document.getElementById('building-placement-controls');
    const message = document.getElementById('building-placement-message');
    const confirm = document.getElementById('building-placement-confirm');
    const rotate = document.getElementById('building-placement-rotate');
    const orientation = document.getElementById('building-placement-orientation');
    const direction = document.getElementById('building-placement-direction');
    if (!controls || !activeBuildingPlacement) {
        if (controls) controls.hidden = true;
        return;
    }
    const building = BUILDING_BY_ID.get(activeBuildingPlacement.buildingId);
    const continuous = Boolean(activeBuildingPlacement.continuous);
    const previewVisible = activeBuildingPlacement.previewVisible !== false;
    const affordable = hasBuildingResources(building);
    const valid = isBuildingPlacementValid(building, activeBuildingPlacement.x, activeBuildingPlacement.y);
    activeBuildingPlacement.valid = valid;
    controls.hidden = false;
    controls.classList.toggle('is-invalid', !valid && previewVisible);
    if (orientation) orientation.hidden = building.role !== 'rail';
    if (rotate) rotate.hidden = building.role !== 'rail';
    if (direction) direction.textContent = getBuildingRotationLabel(building, activeBuildingPlacement.rotation || 0);
    if (message) {
        const reason = valid ? 'この位置に配置できます' : getBuildingPlacementIssue(building, activeBuildingPlacement.x, activeBuildingPlacement.y);
        const orientationLabel = building.role === 'rail' ? ` / 向き ${direction?.textContent || ''}` : '';
        message.textContent = continuous && !previewVisible
            ? `${building.name} / 連続配置中 / 次の配置セル (${activeBuildingPlacement.x}, ${activeBuildingPlacement.y})`
            : `${building.name} / ${continuous ? '連続' : '単発'} / セル (${activeBuildingPlacement.x}, ${activeBuildingPlacement.y})${orientationLabel} / ${reason}${continuous ? ' / タップまたはドラッグで配置' : activeBuildingPlacement.awaitingConfirmation ? ' / 配置ボタンで確定' : ' / 地図をタップして位置を選択'}`;
    }
    if (confirm) {
        confirm.disabled = !valid || !continuous && !activeBuildingPlacement.awaitingConfirmation;
        confirm.hidden = continuous;
    }
}

function drawPlacedBuildings(startCol, endCol, startRow, endRow, now) {
    const drawOrder = { foundation: 0, decoration: 1, rail: 2, structure: 3, vehicle: 4 };
    [...state.buildings].sort((left, right) => {
        const leftRole = BUILDING_BY_ID.get(left.id)?.role || 'structure';
        const rightRole = BUILDING_BY_ID.get(right.id)?.role || 'structure';
        return drawOrder[leftRole] - drawOrder[rightRole];
    }).forEach(placed => {
        const building = BUILDING_BY_ID.get(placed.id);
        if (!building) return;
        if (building.role === 'vehicle' && placed.vehicle?.movement) return;
        if (placed.x + building.width < startCol || placed.x > endCol || placed.y + building.height < startRow || placed.y > endRow) return;
        drawBuilding(ctx, { ...building, x: placed.x, y: placed.y, rotation: placed.rotation || 0 }, state.tileSize, { zoom: state.zoom });
    });
}

function drawBuildingGhost() {
    if (!activeBuildingPlacement || activeBuildingPlacement.previewVisible === false) return;
    const building = BUILDING_BY_ID.get(activeBuildingPlacement.buildingId);
    if (!building) return;
    drawBuilding(ctx, { ...building, x: activeBuildingPlacement.x, y: activeBuildingPlacement.y, rotation: activeBuildingPlacement.rotation || 0 }, state.tileSize, {
        ghost: true,
        valid: activeBuildingPlacement.valid,
        zoom: state.zoom
    });
    const zoom = Math.max(0.01, state.zoom);
    const x = activeBuildingPlacement.x * state.tileSize;
    const y = activeBuildingPlacement.y * state.tileSize;
    const width = building.width * state.tileSize;
    const height = building.height * state.tileSize;
    const markerColor = activeBuildingPlacement.valid ? '#8fffd4' : '#ff7568';
    ctx.save();
    ctx.strokeStyle = markerColor;
    ctx.fillStyle = markerColor;
    ctx.shadowColor = markerColor;
    ctx.shadowBlur = 7 / zoom;
    ctx.lineWidth = 2.5 / zoom;
    ctx.setLineDash([5 / zoom, 3 / zoom]);
    ctx.strokeRect(x + 2 / zoom, y + 2 / zoom, width - 4 / zoom, height - 4 / zoom);
    ctx.setLineDash([]);
    if (building.role === 'rail') {
        const centerX = x + width / 2;
        const centerY = y + height / 2;
        ctx.lineWidth = 3 / zoom;
        ctx.lineCap = 'round';
        getRailConnections(building.kind, activeBuildingPlacement.rotation || 0).forEach(([dx, dy]) => {
            const endX = centerX + dx * state.tileSize * 0.38;
            const endY = centerY + dy * state.tileSize * 0.38;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(endX, endY, Math.max(3, 4 / zoom), 0, Math.PI * 2);
            ctx.fill();
        });
    }
    ctx.restore();
}

function supportsBuildingPlacementStroke(building) {
    return ['foundation', 'decoration', 'rail'].includes(building?.role);
}

function getBuildingPlacementCell(event) {
    if (!activeBuildingPlacement) return null;
    const building = BUILDING_BY_ID.get(activeBuildingPlacement.buildingId);
    const point = getWorldPointFromEvent(event, true);
    return {
        x: Math.floor(point.x / state.tileSize - building.width / 2 + .5),
        y: Math.floor(point.y / state.tileSize - building.height / 2 + .5)
    };
}

function getGridLineCells(start, end) {
    const cells = [{ ...start }];
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const stepX = Math.sign(deltaX);
    const stepY = Math.sign(deltaY);
    const distanceX = Math.abs(deltaX);
    const distanceY = Math.abs(deltaY);
    let progressedX = 0;
    let progressedY = 0;
    let x = start.x;
    let y = start.y;
    while (x !== end.x || y !== end.y) {
        const nextXFraction = progressedX < distanceX ? (progressedX + .5) / distanceX : Infinity;
        const nextYFraction = progressedY < distanceY ? (progressedY + .5) / distanceY : Infinity;
        if (nextXFraction <= nextYFraction) {
            x += stepX;
            progressedX++;
        } else {
            y += stepY;
            progressedY++;
        }
        cells.push({ x, y });
    }
    return cells;
}

function appendBuildingPlacementStroke(placement, cell) {
    if (!placement.strokeLastCell) {
        placement.strokeCells = [{ ...cell }];
    } else {
        placement.strokeCells.push(...getGridLineCells(placement.strokeLastCell, cell).slice(1));
    }
    placement.strokeLastCell = { ...cell };
}

function getStrokeRailRotation(building, position, previousCell, nextCell) {
    const pathDirections = [previousCell, nextCell].filter(Boolean).map(cell => [cell.x - position.x, cell.y - position.y]);
    if (!pathDirections.length) return getRailAutoRotation(building, position.x, position.y, state.buildings);
    let bestRotation = 0;
    let bestScore = -1;
    for (let rotation = 0; rotation < 4; rotation++) {
        const connections = getRailConnections(building.kind, rotation);
        const pathScore = pathDirections.filter(([dx, dy]) => connections.some(([cx, cy]) => cx === dx && cy === dy)).length;
        const existingScore = connections.filter(([dx, dy]) => {
            const neighbor = state.buildings.find(placed => placed.x === position.x + dx && placed.y === position.y + dy
                && BUILDING_BY_ID.get(placed.id)?.role === 'rail');
            const neighborDefinition = BUILDING_BY_ID.get(neighbor?.id);
            return neighborDefinition && getRailConnections(neighborDefinition.kind, neighbor.rotation || 0)
                .some(([neighborDx, neighborDy]) => neighborDx === -dx && neighborDy === -dy);
        }).length;
        const score = pathScore * 10 + existingScore;
        if (score > bestScore) {
            bestRotation = rotation;
            bestScore = score;
        }
    }
    return bestRotation;
}

function updateBuildingPlacementFromEvent(event) {
    if (!activeBuildingPlacement) return;
    const building = BUILDING_BY_ID.get(activeBuildingPlacement.buildingId);
    const cell = getBuildingPlacementCell(event);
    activeBuildingPlacement.x = cell.x;
    activeBuildingPlacement.y = cell.y;
    activeBuildingPlacement.previewVisible = true;
    if (building.role === 'rail' && !activeBuildingPlacement.manualRotation) {
        activeBuildingPlacement.rotation = getRailAutoRotation(building, activeBuildingPlacement.x, activeBuildingPlacement.y, state.buildings);
    } else if (building.role === 'vehicle') {
        activeBuildingPlacement.rotation = getVehicleRailRotation(building, activeBuildingPlacement.x, activeBuildingPlacement.y, state.buildings);
    }
    activeBuildingPlacement.valid = isBuildingPlacementValid(building, activeBuildingPlacement.x, activeBuildingPlacement.y);
    scheduleDraw();
    updateBuildingPlacementControls();
}

function draw() {
    const now = performance.now();
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
    drawPlacedBuildings(startCol, endCol, startRow, endRow, now);
    drawBuildingGhost();
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
    if (state.buildings.some(placed => placed.vehicle?.movement)) scheduleVehicleAnimation();
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

function closeBuildingMenu() {
    const modal = document.getElementById('building-menu-modal');
    if (modal) modal.hidden = true;
    selectedBuildingInstanceId = null;
}

function getVehicleState(placed) {
    const saved = isRecord(placed.vehicle) ? placed.vehicle : {};
    placed.vehicle = {
        ...VEHICLE_DEFAULTS,
        ...saved,
        resources: { ...VEHICLE_DEFAULTS.resources, ...(isRecord(saved.resources) ? saved.resources : {}) }
    };
    return placed.vehicle;
}

function getRailAt(x, y) {
    return state.buildings.find(placed => placed.x === x && placed.y === y
        && BUILDING_BY_ID.get(placed.id)?.role === 'rail');
}

function getStationControlAtRail(x, y) {
    for (const placed of state.buildings) {
        const definition = BUILDING_BY_ID.get(placed.id);
        if (definition?.kind !== 'station') continue;
        const nearestX = Math.max(placed.x, Math.min(x, placed.x + definition.width - 1));
        const nearestY = Math.max(placed.y, Math.min(y, placed.y + definition.height - 1));
        if (Math.abs(nearestX - x) + Math.abs(nearestY - y) !== 1) continue;
        return placed.stationControl ? { ...placed.stationControl, stationId: placed.instanceId } : null;
    }
    return null;
}

function getStationDirection(control) {
    return ({ north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] })[control?.departureDirection] || null;
}

function vehicleStopLabel(vehicle) {
    if (vehicle.running) return '運行中';
    return vehicle.stopReason ? `停止: ${vehicle.stopReason}` : '停止中';
}

function renderVehicleMenu(placed, definition) {
    const controls = document.getElementById('vehicle-menu-controls');
    const start = document.getElementById('building-menu-start-vehicle');
    const status = document.getElementById('vehicle-status');
    const resourceSettings = document.getElementById('vehicle-resource-settings');
    const scrollSelect = document.getElementById('vehicle-movement-scroll');
    const isLocomotive = definition.kind === 'locomotive';
    if (controls) controls.hidden = !isLocomotive;
    if (!isLocomotive) {
        if (start) start.hidden = true;
        return;
    }
    const vehicle = getVehicleState(placed);
    if (start) {
        start.hidden = false;
        start.textContent = vehicle.running ? '停止' : '起動';
        start.classList.toggle('inventory-modal-secondary', vehicle.running);
        start.classList.toggle('saved-scroll-use', !vehicle.running);
    }
    if (status) status.textContent = `${vehicleStopLabel(vehicle)} / 将来消費枠: 動力 ${vehicle.powerPerCell}・蒸気 ${vehicle.steamPerCell} / セル`;
    if (resourceSettings) resourceSettings.textContent = `車載在庫: 動力 ${vehicle.resources.power} / 蒸気 ${vehicle.resources.steam} (未接続) / 速度 ${vehicle.speedCellsPerSecond}セル/秒`;
    if (!scrollSelect) return;
    const selectedScrollId = vehicle.movementScrollId || '';
    let scrolls = [];
    try {
        const saved = JSON.parse(localStorage.getItem('fogsgear_scroll_library') || '[]');
        scrolls = Array.isArray(saved) ? saved.filter(scroll => typeof scroll?.id === 'string') : [];
    } catch (error) {}
    scrollSelect.replaceChildren(new Option('未割当', ''));
    scrolls.forEach(scroll => scrollSelect.add(new Option(scroll.name || scroll.id, scroll.id)));
    if (selectedScrollId && !scrolls.some(scroll => scroll.id === selectedScrollId)) {
        scrollSelect.add(new Option(`未登録 (${selectedScrollId})`, selectedScrollId));
    }
    scrollSelect.value = selectedScrollId;
}

function formatUtilityAmount(amount) {
    return String(Math.round((Number(amount) || 0) * 10) / 10);
}

function updateBuildingMenuDetails(placed, definition) {
    const tileEffects = getTileEffectsUnderFootprint(state.buildings, placed.x, placed.y, definition.width, definition.height);
    const effectSummary = tileEffects.length
        ? ` / タイル効果: ${tileEffects.map(effect => effect.label || effect.id || effect.type).join('、')}`
        : '';
    const utilityStates = getBuildingUtilityStatus(state.buildings).get(placed.instanceId) || new Map();
    const utilityLabels = { water: '水', steam: '蒸気' };
    const utilitySummary = [...new Set((definition.utilityPorts || []).map(port => port.resource))]
        .map(resource => {
            const status = utilityStates.get(resource);
            if (!status?.connected) return `${utilityLabels[resource] || resource}: 未接続`;
            if (status.capacity > 0) {
                const pressure = status.pressure === null ? '' : ` / 圧力 ${status.pressure}%`;
                return `${utilityLabels[resource] || resource}: ${formatUtilityAmount(status.amount)} / ${formatUtilityAmount(status.capacity)}${pressure}`;
            }
            return `${utilityLabels[resource] || resource}: 接続 / 貯留設備なし`;
        })
        .join(' / ');
    const operationStatus = buildingUtilityOperationStatuses.get(placed.instanceId);
    const utilityNote = utilitySummary ? ` / ${utilitySummary}${operationStatus ? ` / ${operationStatus}` : ''}` : '';
    const storageNote = definition.storageCapacity
        ? ` / 資材保管 ${getStorageUsedCapacity(placed)} / ${definition.storageCapacity}`
        : '';
    const vehicleNote = definition.role === 'vehicle' ? ' / 線路配置済みの車両' : '';
    const foundationNote = definition.requiresFoundation ? ' / 基礎上に建設' : '';
    const railOrientation = definition.role === 'rail' ? ` / 向き ${getBuildingRotationLabel(definition, placed.rotation || 0)}` : '';
    document.getElementById('building-menu-details').textContent = `${definition.width}×${definition.height}セル / 座標 (${placed.x}, ${placed.y}) / 建設真鍮 ${definition.brassCost}${railOrientation}${foundationNote}${vehicleNote}${effectSummary}${utilityNote}${storageNote}`;
}

function openBuildingMenu(instanceId) {
    const placed = state.buildings.find(building => building.instanceId === instanceId);
    const definition = BUILDING_BY_ID.get(placed?.id);
    if (!placed || !definition) return;
    selectedBuildingInstanceId = instanceId;
    document.getElementById('building-menu-title').textContent = definition.name;
    renderVehicleMenu(placed, definition);
    updateBuildingMenuDetails(placed, definition);
    renderBuildingStorage(placed, definition);
    const rotateRail = document.getElementById('building-menu-rotate-rail');
    if (rotateRail) rotateRail.hidden = definition.role !== 'rail';
    const craftButton = document.getElementById('building-menu-craft');
    if (craftButton) craftButton.hidden = !getCraftingRecipesForBuilding(definition.id).length;
    const demolish = document.getElementById('building-menu-demolish');
    demolish.dataset.armed = '';
    demolish.textContent = `解体（真鍮 ${Math.floor(definition.brassCost / 2)} 返却）`;
    document.getElementById('building-menu-modal').hidden = false;
}

const VEHICLE_STOP_MESSAGES = {
    'missing-track': '線路上にありません',
    'connection-mismatch': '線路の接続方向が一致しません',
    'disconnected-track': '線路が途切れています',
    'ambiguous-junction': '分岐に駅舎の指示がありません',
    'track-ended': '線路の終端です',
    'station-route-unavailable': '駅舎の指定方向へ接続する線路がありません',
    collision: 'ほかの車両と衝突しました'
};

function getVehicleNextStep(placed, vehicle) {
    const rail = getRailAt(placed.x, placed.y);
    if (!rail) return { error: 'missing-track' };
    const stationControl = getStationControlAtRail(placed.x, placed.y);
    const stationDirection = getStationDirection(stationControl);
    const preferredDirection = stationDirection || (!vehicle.previousRail ? getTrackDirection(rail.rotation || 0) : null);
    const step = findNextRailStep(state.buildings, BUILDING_BY_ID, placed, vehicle.previousRail, preferredDirection, Boolean(stationDirection));
    if (stationDirection && !step.error
        && (step.direction[0] !== stationDirection[0] || step.direction[1] !== stationDirection[1])) {
        return { error: 'station-route-unavailable' };
    }
    return step;
}

function settleVehicleMovement(placed, vehicle, now) {
    const movement = vehicle.movement;
    if (!movement) return;
    const progress = Math.max(0, Math.min(1, (now - movement.startedAt) / movement.durationMs));
    if (progress >= 0.5) {
        placed.x = movement.to.x;
        placed.y = movement.to.y;
        vehicle.previousRail = { ...movement.from };
        vehicle.direction = movement.direction;
        placed.rotation = movement.toRotation;
        const stationControl = getStationControlAtRail(placed.x, placed.y);
        if (stationControl) vehicle.lastStationId = stationControl.stationId || '';
    }
    vehicle.movement = null;
}

function startSelectedVehicle() {
    const placed = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
    if (!placed || BUILDING_BY_ID.get(placed.id)?.kind !== 'locomotive') return;
    const vehicle = getVehicleState(placed);
    if (vehicle.running) {
        settleVehicleMovement(placed, vehicle, performance.now());
        vehicle.running = false;
        vehicle.stopReason = '手動停止';
        vehicle.nextMoveAt = 0;
    } else {
        const rail = getRailAt(placed.x, placed.y);
        if (!rail) {
            vehicle.stopReason = VEHICLE_STOP_MESSAGES['missing-track'];
        } else {
            vehicle.running = true;
            vehicle.stopReason = '';
            vehicle.previousRail = null;
            vehicle.direction = getStationDirection(getStationControlAtRail(placed.x, placed.y)) || getTrackDirection(rail.rotation || 0);
            const firstStep = getVehicleNextStep(placed, vehicle);
            if (firstStep.error) {
                vehicle.running = false;
                vehicle.stopReason = VEHICLE_STOP_MESSAGES[firstStep.error] || '線路を確認してください';
            } else {
                vehicle.direction = firstStep.direction;
                placed.rotation = directionToVehicleRotation(firstStep.direction);
                vehicle.nextMoveAt = performance.now();
            }
        }
    }
    saveBuildings();
    renderVehicleMenu(placed, BUILDING_BY_ID.get(placed.id));
    scheduleDraw();
    scheduleVehicleAnimation();
}

function tickVehicleRuntime(now) {
    if (!state.map.length) return;
    let changed = false;
    let startedVehicleMotion = false;
    const settledVehicles = new Set();
    const locomotives = state.buildings.filter(placed => BUILDING_BY_ID.get(placed.id)?.kind === 'locomotive');
    for (const placed of locomotives) {
        const vehicle = getVehicleState(placed);
        if (!vehicle.running) continue;
        const wasMoving = Boolean(vehicle.movement);
        let segmentStartAt = now;
        if (vehicle.movement) {
            const movementEndAt = vehicle.movement.startedAt + vehicle.movement.durationMs;
            if (now < movementEndAt) continue;
            settleVehicleMovement(placed, vehicle, movementEndAt);
            settledVehicles.add(placed);
            vehicle.nextMoveAt = movementEndAt;
            segmentStartAt = movementEndAt;
            changed = true;
        }
        if (now < vehicle.nextMoveAt) continue;
        const step = getVehicleNextStep(placed, vehicle);
        if (step.error) {
            vehicle.running = false;
            vehicle.stopReason = VEHICLE_STOP_MESSAGES[step.error] || '線路を確認してください';
            vehicle.nextMoveAt = 0;
            changed = true;
            continue;
        }
        const blockingVehicle = state.buildings.find(other => other.instanceId !== placed.instanceId
            && BUILDING_BY_ID.get(other.id)?.role === 'vehicle'
            && (other.x === step.position.x && other.y === step.position.y
                || other.vehicle?.movement?.to.x === step.position.x && other.vehicle?.movement?.to.y === step.position.y));
        if (blockingVehicle) {
            vehicle.running = false;
            vehicle.stopReason = VEHICLE_STOP_MESSAGES.collision;
            vehicle.nextMoveAt = 0;
            if (BUILDING_BY_ID.get(blockingVehicle.id)?.kind === 'locomotive') {
                const otherVehicle = getVehicleState(blockingVehicle);
                settleVehicleMovement(blockingVehicle, otherVehicle, now);
                settledVehicles.add(blockingVehicle);
                otherVehicle.running = false;
                otherVehicle.stopReason = VEHICLE_STOP_MESSAGES.collision;
                otherVehicle.nextMoveAt = 0;
            }
            changed = true;
            continue;
        }
        const durationMs = 1000 / Math.max(0.1, Number(vehicle.speedCellsPerSecond) || 1);
        const from = { x: placed.x, y: placed.y };
        const direction = step.direction;
        vehicle.movement = {
            from,
            to: step.position,
            direction,
            fromRotation: placed.rotation || 0,
            toRotation: directionToVehicleRotation(direction),
            startedAt: segmentStartAt,
            durationMs
        };
        vehicle.nextMoveAt = segmentStartAt + durationMs;
        if (!wasMoving) startedVehicleMotion = true;
        changed = true;
    }
    if (!changed) return;
    saveBuildings();
    if (selectedBuildingInstanceId) {
        const selected = state.buildings.find(placed => placed.instanceId === selectedBuildingInstanceId);
        if (selected && BUILDING_BY_ID.get(selected.id)?.kind === 'locomotive') renderVehicleMenu(selected, BUILDING_BY_ID.get(selected.id));
    }
    if (startedVehicleMotion || [...settledVehicles].some(placed => !placed.vehicle?.movement)) scheduleDraw();
    if (state.buildings.some(placed => placed.vehicle?.movement)) scheduleVehicleAnimation();
}

function startBuildingPlacement(buildingId, fromInventory = false) {
    const building = BUILDING_BY_ID.get(buildingId);
    if (!building) return;
    if (fromInventory && getCraftingItemCount(buildingId) <= 0) return;
    loadBuildingIconImages([buildingId]).then(scheduleDraw).catch(error => {
        console.warn(`Building icon failed to load for ${buildingId}.`, error);
    });
    closeInventoryItem();
    closeBuildingMenu();
    const inventoryPanel = document.getElementById('inventory-panel');
    if (inventoryPanel) inventoryPanel.hidden = true;
    document.querySelectorAll('[data-action="toggle-inventory"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
    const x = Math.round(state.player.x - (building.width - 1) / 2);
    const y = Math.round(state.player.y - (building.height - 1) / 2);
    activeBuildingPlacement = {
        buildingId,
        x,
        y,
        rotation: building.role === 'vehicle'
            ? getVehicleRailRotation(building, x, y, state.buildings)
            : getRailAutoRotation(building, x, y, state.buildings),
        pointerId: null,
        fromInventory,
        awaitingConfirmation: false,
        valid: false,
        continuous: buildingPlacementMode === 'continuous',
        previewVisible: true,
        strokeCells: [],
        strokeLastCell: null
    };
    updateBuildingPlacementControls();
    scheduleDraw();
}

function cancelBuildingPlacement() {
    activeBuildingPlacement = null;
    activePointers.clear();
    isDragging = false;
    updateBuildingPlacementControls();
    scheduleDraw();
}

function rotateBuildingPlacement() {
    if (!activeBuildingPlacement || BUILDING_BY_ID.get(activeBuildingPlacement.buildingId)?.role !== 'rail') return;
    activeBuildingPlacement.rotation = ((activeBuildingPlacement.rotation || 0) + 1) % 4;
    activeBuildingPlacement.manualRotation = true;
    updateBuildingPlacementControls();
    scheduleDraw();
}

function rotateSelectedRail() {
    const placed = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
    if (!placed || BUILDING_BY_ID.get(placed.id)?.role !== 'rail') return;
    const historyBefore = captureBuildingHistoryState();
    placed.rotation = ((Number(placed.rotation) || 0) + 1) % 4;
    recordBuildingHistory(historyBefore);
    saveBuildings();
    buildingRenderSignature = '';
    openBuildingMenu(placed.instanceId);
    scheduleDraw();
}

function placeBuildingAt(placement) {
    const definition = BUILDING_BY_ID.get(placement.buildingId);
    if (!definition) return { issue: '建築データがありません' };
    const issue = getBuildingPlacementIssue(definition, placement.x, placement.y);
    if (issue) return { issue };
    if (placement.fromInventory) {
        engineRuntimeState.materialInventory[definition.id] = Math.max(0, getCraftingItemCount(definition.id) - 1);
    } else if (!engineRuntimeState.creativeMode) {
        engineRuntimeState.brass = Math.max(0, Number(engineRuntimeState.brass) - definition.brassCost);
    }
    if (definition.role === 'foundation' || definition.role === 'decoration' || definition.role === 'rail') {
        state.buildings = state.buildings.filter(placed => {
            const placedDefinition = BUILDING_BY_ID.get(placed.id);
            return !(placed.x === placement.x && placed.y === placement.y
                && (placed.id === definition.id || definition.role === 'decoration' && placedDefinition?.role === 'decoration'
                    || definition.role === 'rail' && placedDefinition?.role === 'rail'));
        });
    }
    const placedBuilding = {
        id: definition.id,
        x: placement.x,
        y: placement.y,
        rotation: placement.rotation || 0,
        instanceId: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    };
    const utilityState = normalizeBuildingUtilityState(definition.id, null);
    if (utilityState) placedBuilding.utilityState = utilityState;
    if (definition.role === 'vehicle') {
        placedBuilding.vehicle = {
            ...VEHICLE_DEFAULTS,
            resources: { ...VEHICLE_DEFAULTS.resources },
            direction: getTrackDirection(placedBuilding.rotation)
        };
    }
    if (definition.kind === 'station') {
        placedBuilding.stationControl = { ...STATION_CONTROL_DEFAULTS, destinations: [], conditions: [] };
    }
    state.buildings.push(placedBuilding);
    return { definition };
}

function commitBuildingPlacementCells(cells, orientRailsFromStroke = false) {
    const building = BUILDING_BY_ID.get(activeBuildingPlacement?.buildingId);
    if (!building) return { placedCount: 0, issue: '建築データがありません' };
    const historyBefore = captureBuildingHistoryState();
    let placedCount = 0;
    let issue = '';
    const visited = new Set();
    for (let index = 0; index < cells.length; index++) {
        const cell = cells[index];
        const key = `${cell.x},${cell.y}`;
        if (visited.has(key)) continue;
        visited.add(key);
        const placement = { ...activeBuildingPlacement, ...cell };
        if (orientRailsFromStroke && building.role === 'rail') {
            placement.rotation = getStrokeRailRotation(building, cell, cells[index - 1], cells[index + 1]);
        }
        const result = placeBuildingAt(placement);
        if (!result.definition) {
            issue = result.issue;
            break;
        }
        placedCount++;
    }
    if (placedCount) {
        recordBuildingHistory(historyBefore);
        engineRuntimeState.saveGameData();
        engineRuntimeState.notify();
        saveBuildings();
        buildingRenderSignature = '';
        renderCellMaterials();
        scheduleDraw();
    }
    return { placedCount, issue };
}

function showBuildingPlacementResult(definition, placedCount, issue = '') {
    if (!placedCount) {
        showAppNotice(issue === '真鍮が不足しています' ? '建設に必要な真鍮が足りません。' : 'この位置には建築できません。');
        return;
    }
    const placementMessage = placedCount === 1
        ? `${definition.name}を配置しました。`
        : `${definition.name}を${placedCount}個配置しました。`;
    showAppNotice(issue ? `${placementMessage}以降は配置を停止しました: ${issue}` : placementMessage);
}

function confirmBuildingPlacement() {
    if (!activeBuildingPlacement) return;
    const placement = { ...activeBuildingPlacement };
    const definition = BUILDING_BY_ID.get(placement.buildingId);
    const result = commitBuildingPlacementCells([placement]);
    if (!result.placedCount) {
        updateBuildingPlacementControls();
        showBuildingPlacementResult(definition, 0, result.issue);
        return;
    }
    activeBuildingPlacement = null;
    updateBuildingPlacementControls();
    showBuildingPlacementResult(definition, result.placedCount, result.issue);
}

function demolishSelectedBuilding() {
    const button = document.getElementById('building-menu-demolish');
    if (!selectedBuildingInstanceId || !button) return;
    if (button.dataset.armed !== selectedBuildingInstanceId) {
        button.dataset.armed = selectedBuildingInstanceId;
        button.textContent = 'もう一度押して解体';
        return;
    }
    const index = state.buildings.findIndex(building => building.instanceId === selectedBuildingInstanceId);
    const placed = state.buildings[index];
    const definition = BUILDING_BY_ID.get(placed?.id);
    if (!definition) return closeBuildingMenu();
    const historyBefore = captureBuildingHistoryState();
    state.buildings.splice(index, 1);
    engineRuntimeState.brass += Math.floor(definition.brassCost / 2);
    recordBuildingHistory(historyBefore);
    engineRuntimeState.saveGameData();
    engineRuntimeState.notify();
    saveBuildings();
    closeBuildingMenu();
    buildingRenderSignature = '';
    renderCellMaterials();
    scheduleDraw();
}

function getWorldPointFromEvent(event, touchOffset = false) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const pixelX = (event.clientX - rect.left) * scaleX;
    const touchPreviewOffset = activeBuildingPlacement?.continuous ? 0 : Math.min(36, state.tileSize * state.zoom * .65);
    const offset = touchOffset && event.pointerType !== 'mouse' ? touchPreviewOffset * scaleY : 0;
    const pixelY = (event.clientY - rect.top) * scaleY - offset;
    return {
        x: state.camera.x - canvas.width / (2 * state.zoom) + pixelX / state.zoom,
        y: state.camera.y - canvas.height / (2 * state.zoom) + pixelY / state.zoom
    };
}

function findBuildingAtEvent(event) {
    const point = getWorldPointFromEvent(event);
    const cellX = Math.floor(point.x / state.tileSize);
    const cellY = Math.floor(point.y / state.tileSize);
    let underlay = null;
    for (let index = state.buildings.length - 1; index >= 0; index--) {
        const placed = state.buildings[index];
        const building = BUILDING_BY_ID.get(placed.id);
        if (!building || cellX < placed.x || cellX >= placed.x + building.width || cellY < placed.y || cellY >= placed.y + building.height) continue;
        if (building.role === 'structure' || building.role === 'vehicle') return placed;
        underlay ||= placed;
    }
    return underlay;
}

function clearBuildingPress() {
    if (buildingPressTimer) clearTimeout(buildingPressTimer);
    buildingPressTimer = null;
    buildingPressCandidate = null;
}

function startBuildingPress(placed, event) {
    clearBuildingPress();
    buildingPressCandidate = { instanceId: placed.instanceId, pointerId: event.pointerId, x: event.clientX, y: event.clientY, opened: false };
    buildingPressTimer = setTimeout(() => {
        if (!buildingPressCandidate || buildingPressCandidate.pointerId !== event.pointerId) return;
        buildingPressCandidate.opened = true;
        isDragging = false;
        openBuildingMenu(placed.instanceId);
    }, 550);
}

function setupControls() {
    window.addEventListener('resize', () => {
        resize();
        scheduleDraw();
    });

    document.addEventListener('contextmenu', event => {
        if (!(event.target instanceof Element)) return;
        if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
        if (event.target.closest('#gameCanvas, #building-menu-modal, #building-placement-controls')) {
            event.preventDefault();
        }
    }, true);

    canvas.addEventListener('selectstart', event => event.preventDefault());

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

        if (activeBuildingPlacement) {
            activeBuildingPlacement.pointerId = e.pointerId;
            activeBuildingPlacement.awaitingConfirmation = false;
            activeBuildingPlacement.previewVisible = true;
            const placementCell = getBuildingPlacementCell(e);
            const building = BUILDING_BY_ID.get(activeBuildingPlacement.buildingId);
            activeBuildingPlacement.strokeCells = activeBuildingPlacement.continuous && supportsBuildingPlacementStroke(building)
                ? [{ ...placementCell }]
                : [];
            activeBuildingPlacement.strokeLastCell = activeBuildingPlacement.continuous && supportsBuildingPlacementStroke(building)
                ? { ...placementCell }
                : null;
            isDragging = false;
            updateBuildingPlacementFromEvent(e);
            return;
        }

        const placedBuilding = findBuildingAtEvent(e);
        if (placedBuilding) {
            isDragging = false;
            startBuildingPress(placedBuilding, e);
            return;
        }

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
        if (activeBuildingPlacement) {
            if (activeBuildingPlacement.awaitingConfirmation) return;
            if (activeBuildingPlacement.pointerId === null || activeBuildingPlacement.pointerId === e.pointerId) {
                if (activeBuildingPlacement.pointerId !== null) {
                    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
                    const building = BUILDING_BY_ID.get(activeBuildingPlacement.buildingId);
                    if (activeBuildingPlacement.continuous && supportsBuildingPlacementStroke(building)) {
                        const cell = getBuildingPlacementCell(e);
                        if (cell.x !== activeBuildingPlacement.strokeLastCell?.x || cell.y !== activeBuildingPlacement.strokeLastCell?.y) {
                            activeBuildingPlacement.manualRotation = false;
                            appendBuildingPlacementStroke(activeBuildingPlacement, cell);
                        }
                    }
                }
                updateBuildingPlacementFromEvent(e);
            }
            return;
        }
        if (buildingPressCandidate?.pointerId === e.pointerId) {
            if (buildingPressCandidate.opened) return;
            if (Math.hypot(e.clientX - buildingPressCandidate.x, e.clientY - buildingPressCandidate.y) <= 8) return;
            const start = buildingPressCandidate;
            clearBuildingPress();
            dragStart = { x: start.x, y: start.y };
            cameraStart = { x: state.camera.x, y: state.camera.y };
            isDragging = true;
        }
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

        if (activeBuildingPlacement?.pointerId === e.pointerId) {
            activePointers.delete(e.pointerId);
            if (activeBuildingPlacement.continuous) {
                const placement = activeBuildingPlacement;
                const building = BUILDING_BY_ID.get(placement.buildingId);
                if (e.type === 'pointerup') {
                    const cell = getBuildingPlacementCell(e);
                    updateBuildingPlacementFromEvent(e);
                    const cells = supportsBuildingPlacementStroke(building)
                        ? (appendBuildingPlacementStroke(placement, cell), placement.strokeCells)
                        : [{ ...cell, rotation: placement.rotation }];
                    const result = commitBuildingPlacementCells(cells, supportsBuildingPlacementStroke(building) && cells.length > 1);
                    showBuildingPlacementResult(building, result.placedCount, result.issue);
                }
                placement.pointerId = null;
                placement.awaitingConfirmation = true;
                placement.previewVisible = false;
                placement.strokeCells = [];
                placement.strokeLastCell = null;
                isDragging = false;
                updateBuildingPlacementControls();
                scheduleDraw();
                return;
            }
            activeBuildingPlacement.pointerId = null;
            activeBuildingPlacement.awaitingConfirmation = e.type !== 'pointercancel';
            isDragging = false;
            updateBuildingPlacementControls();
            scheduleDraw();
            return;
        }

        if (buildingPressCandidate?.pointerId === e.pointerId) {
            activePointers.delete(e.pointerId);
            clearBuildingPress();
            isDragging = false;
            return;
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
    canvas.addEventListener('contextmenu', event => {
        event.preventDefault();
        if (activeBuildingPlacement) cancelBuildingPlacement();
        else {
            const building = findBuildingAtEvent(event);
            if (building) openBuildingMenu(building.instanceId);
        }
    });
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
    const values = {
        'main-engine-steam': save.steamPower,
        'main-engine-water': save.water,
        'main-engine-fog': save.fog,
        'main-engine-power': save.power
    };
    const displayValues = Object.fromEntries(Object.entries(values).map(([id, value]) => [
        id,
        id === 'main-engine-steam' ? String(Math.floor(Number(value) || 0)) : formatCompact(value)
    ]));
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
    const generationRates = {
        water: save.waterGenerationRate,
        fog: save.fogRecoveryRate,
        power: save.powerGenerationRate,
        steam: save.steamGenerationRate
    };
    const collectedMaterialRates = new Map();
    if (save.mainGearRunning && (save.creativeMode || save.steamPower > 0) && state.map.length) {
        save.getActiveScrollRuntimes(performance.now()).forEach(runtime => {
            const tile = state.map[runtime.target.y]?.[runtime.target.x];
            if (!tile) return;
            const collectionCount = Number(tile.collectionCount) || 0;
            const drops = getCellDrops(tile.type, collectionCount);
            if (!drops.length || save.power < getCellCollectionPowerCost(tile.type, collectionCount)) return;
            runtime.gears.forEach(gear => {
                if (!gear.powered || gear.isDeadlocked || gear.processMode !== 'RESOURCE_COLLECTION') return;
                const rotationRate = Math.abs(gear.angularVelocity || 0) * 0.012 * 60 / (Math.PI * 2);
                const collectionRate = rotationRate * Math.max(1, Number(gear.teeth) || 1);
                drops.forEach(itemId => collectedMaterialRates.set(itemId, (collectedMaterialRates.get(itemId) || 0) + collectionRate));
            });
        });
    }
    const collectedMaterials = [...collectedMaterialRates].map(([itemId, rate]) => ({
        itemId,
        name: getCraftingItemName(itemId),
        amount: getCraftingItemCount(itemId),
        rate: formatCompact(rate)
    }));
    const previewFrame = document.querySelector('.gear-preview-page iframe');
    previewFrame?.contentWindow?.postMessage({
        type: 'fogsgear:engine-dashboard',
        values: displayValues,
        rates: Object.fromEntries(Object.entries(rates).map(([id, value]) => [id, `${formatCompact(value)} /秒`])),
        generationRates,
        collectedMaterials,
        creativeMode: Boolean(save.creativeMode)
    }, '*');
    renderCellMaterials();
}

let lastBuildingUtilityUpdateAt = null;
let buildingUtilityOperationStatuses = new Map();

function updateBuildingUtilityNetworks() {
    if (!state.map.length || !engineRuntimeState) return;
    const now = performance.now();
    const elapsed = lastBuildingUtilityUpdateAt === null
        ? 0
        : Math.min(1, Math.max(0, (now - lastBuildingUtilityUpdateAt) / 1000));
    lastBuildingUtilityUpdateAt = now;
    if (elapsed <= 0) return;

    const result = simulateBuildingUtilityNetworks(
        state.buildings,
        state.map,
        engineRuntimeState.materialInventory.coal,
        elapsed
    );
    buildingUtilityOperationStatuses = result.operationStatuses;
    if (result.coalChanged) {
        engineRuntimeState.materialInventory.coal = result.coalInventory;
        engineRuntimeState.saveGameData();
        engineRuntimeState.notify();
    }
    if (result.stateChanged) saveBuildings();
    const buildingMenu = document.getElementById('building-menu-modal');
    if (buildingMenu && !buildingMenu.hidden) {
        const placed = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
        const definition = BUILDING_BY_ID.get(placed?.id);
        if (placed && definition) updateBuildingMenuDetails(placed, definition);
    }
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
    frame.src = 'cell-atlas.html?modal=1&guide=7';
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
    if (button.dataset.action === 'show-recipe-detail') {
        showRecipeDetail(button.dataset.itemKey);
        return;
    }
    if (button.dataset.action === 'recipe-detail-back') {
        goBackRecipeDetail();
        return;
    }
    if (button.dataset.action === 'close-recipe-detail') {
        closeRecipeDetail();
        return;
    }
    if (button.dataset.inventoryView) {
        const view = button.dataset.inventoryView;
        document.querySelectorAll('.inventory-view-tab').forEach(tab => {
            const active = tab === button;
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-selected', String(active));
        });
        document.getElementById('inventory-items-view').hidden = view !== 'items';
        document.getElementById('inventory-crafting-view').hidden = view !== 'crafting';
        document.getElementById('inventory-building-view').hidden = view !== 'buildings';
        if (view === 'buildings') renderBuildingInventory();
        if (view === 'crafting') renderCellMaterials();
        return;
    }
    if (button.dataset.action === 'select-building') {
        startBuildingPlacement(button.dataset.buildingId);
        return;
    }
    if (button.dataset.action === 'undo-building') {
        applyBuildingHistory('undo');
        return;
    }
    if (button.dataset.action === 'redo-building') {
        applyBuildingHistory('redo');
        return;
    }
    if (button.dataset.action === 'craft-building-kit') {
        const quantity = button.closest('.building-item-card')?.querySelector('.building-quantity-input')?.value;
        craftBuildingKit(button.dataset.buildingId, quantity);
        return;
    }
    if (button.dataset.action === 'place-building-from-inventory') {
        const buildingId = button.dataset.buildingId;
        buildingPlacementMode = button.dataset.placementMode === 'continuous' ? 'continuous' : 'single';
        closeInventoryItem();
        startBuildingPlacement(buildingId, true);
        return;
    }
    if (button.dataset.action === 'confirm-building-placement') {
        confirmBuildingPlacement();
        return;
    }
    if (button.dataset.action === 'cancel-building-placement') {
        cancelBuildingPlacement();
        return;
    }
    if (button.dataset.action === 'rotate-building-placement') {
        rotateBuildingPlacement();
        return;
    }
    if (button.dataset.action === 'rotate-selected-rail') {
        rotateSelectedRail();
        return;
    }
    if (button.dataset.action === 'close-building-menu') {
        closeBuildingMenu();
        return;
    }
    if (button.dataset.action === 'building-storage-transfer') {
        transferBuildingStorage(button.dataset.direction);
        return;
    }
    if (button.dataset.action === 'open-building-crafting') {
        openBuildingCrafting();
        return;
    }
    if (button.dataset.action === 'close-building-crafting') {
        closeBuildingCrafting();
        return;
    }
    if (button.dataset.action === 'toggle-building-vehicle') {
        startSelectedVehicle();
        return;
    }
    if (button.dataset.action === 'demolish-building') {
        demolishSelectedBuilding();
        return;
    }
    if (button.dataset.action === 'craft-recipe') {
        const quantity = button.closest('.crafting-recipe-card')?.querySelector('.crafting-quantity-input')?.value;
        craftRecipe(Number(button.dataset.recipeIndex), button.dataset.buildingInstanceId || '', quantity);
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

document.getElementById('vehicle-movement-scroll')?.addEventListener('change', event => {
    const placed = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
    if (!placed || BUILDING_BY_ID.get(placed.id)?.kind !== 'locomotive') return;
    getVehicleState(placed).movementScrollId = event.target.value;
    saveBuildings();
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

document.getElementById('inventory-item-search')?.addEventListener('input', () => {
    inventoryRenderSignature = '';
    renderCellMaterials();
});

document.getElementById('crafting-recipe-search')?.addEventListener('input', () => {
    craftingRenderSignature = '';
    renderCellMaterials();
});

document.getElementById('building-crafting-search')?.addEventListener('input', renderBuildingCrafting);

document.getElementById('building-crafting-modal')?.addEventListener('click', event => {
    if (event.target === event.currentTarget) closeBuildingCrafting();
});

document.getElementById('building-item-search')?.addEventListener('input', () => {
    buildingRenderSignature = '';
    renderBuildingInventory();
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
        if (event.data?.type === 'fogsgear:skin-updated'
            && typeof event.data.url === 'string'
            && typeof event.data.sourceType === 'string') {
            applySelectedSkinSource(event.data.url, event.data.sourceType, String(event.data.name || ''))
                .then(scheduleDraw)
                .catch(error => {
                    console.warn('Skin load failed; using fallback.', error);
                    showAppNotice('スキン画像を読み込めませんでした。');
                });
            return;
        }
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

document.getElementById('recipe-detail-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'recipe-detail-modal') closeRecipeDetail();
});

document.getElementById('building-menu-modal')?.addEventListener('click', event => {
    if (event.target.id === 'building-menu-modal') closeBuildingMenu();
});
document.getElementById('building-storage-item')?.addEventListener('change', () => {
    const placed = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
    const definition = BUILDING_BY_ID.get(placed?.id);
    if (placed && definition) renderBuildingStorage(placed, definition);
});

document.addEventListener('pointerup', (event) => {
    const target = event.target;
    const recipeDetailModal = document.getElementById('recipe-detail-modal');
    if (recipeDetailModal && !recipeDetailModal.hidden) return;

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
    const recipeDetailModal = document.getElementById('recipe-detail-modal');
    if (recipeDetailModal && !recipeDetailModal.hidden) {
        closeRecipeDetail();
        event.preventDefault();
        return;
    }
    closeBuildingCrafting();
    if (activeBuildingPlacement) cancelBuildingPlacement();
    closeBuildingMenu();
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

const engineRuntimeState = new EngineGameState();
migrateLegacyMaterialIds();
new EngineGearManager(engineRuntimeState);
engineRuntimeState.worldCellHandler = handleWorldCellOperation;
engineRuntimeState.subscribe(() => {
    const inventoryPanel = document.getElementById('inventory-panel');
    if (inventoryPanel && !inventoryPanel.hidden) {
        if (!document.getElementById('inventory-building-view')?.hidden) renderBuildingInventory();
        else renderCellMaterials();
    }
    if (!document.getElementById('building-crafting-modal')?.hidden) renderBuildingCrafting();
    updateCraftingCountdowns();
    updateEngineDashboard();
});
syncCraftingNotifications();
updateEngineDashboard();
window.setInterval(() => engineRuntimeState.tick(), 16);
window.setInterval(updateBuildingUtilityNetworks, 1000);

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
    const lastPage = Math.max(0, mainPageDots.length - 1);
    currentMainPage = Math.max(0, Math.min(lastPage, page));
    mainPageViewport?.classList.toggle('gear-preview-active', currentMainPage === 1);
    if (mainPageTrack) mainPageTrack.style.transform = `translateX(-${currentMainPage * 50}%)`;
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
gearPreviewIframe?.addEventListener('load', updateEngineDashboard);
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
