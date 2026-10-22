// js/main.js - Steampunk Explorer Game Logic
import { MapGenerator, BIOME_COLORS, loadMapSnapshot, saveMapSnapshot } from './mapGenerator.js?v=92';
import { SkinRenderer } from './skinRenderer.js?v=5';
import { SkinPreview } from './skinPreview.js?v=4';
import { CELL_DEFINITIONS, canEnterCell, getCellEntryRule, getCellTypeKey, getMosaicColor } from './cellRules.js';
import { drawCellIcon, loadCellIconAtlas } from './cellIconRenderer.js?v=5';
import { ACTIVE_SCROLL_TARGETS_KEY, CELL_MATERIALS, TERRAIN_TRANSFORM_RECIPES, WORLD_CELL_TYPES, applyCellChanges, chooseEraCellType, getCellCollectionPowerCost, getCellDrops, readCellChanges, saveCellChange } from './worldCells.js?v=13';
import { CRAFTING_ITEMS, CRAFTING_ITEM_BY_ID, CRAFTING_OVERCLOCK_OPTIONS, CRAFTING_RATE_MULTIPLIER, CRAFTING_RECIPES, CRAFTING_STATION_BUILDING_IDS, CRAFTING_STATION_POWER_RATES, DEFERRED_CRAFTING_ITEM_IDS, HANDCRAFT_STATION, SCROLL_MATERIAL_BY_ITEM, SCROLL_MATERIAL_BY_TYPE } from './craftingData.js?v=19';
import { BUILDING_BY_ID, BUILDING_DEFINITIONS, canPlaceBuildingOnTerrainCell, drawBuilding, getRailAutoRotation, getRailConnections, getTileEffectsUnderFootprint, getVehicleRailRotation, loadBuildingIconImages, normalizeBuildingUtilityState } from './buildingData.js?v=36';
import { getBuildingUtilityStatus, simulateBuildingUtilityNetworks } from './buildingUtilityNetworks.js?v=5';
import { buildTerritoryBorderSegments, buildTerritoryBorderSegmentsAsync } from './territoryBorders.js?v=36';
import { directionToVehicleRotation, findNextRailStep, getTrackDirection, getVehicleRenderState, STATION_CONTROL_DEFAULTS, VEHICLE_DEFAULTS } from './railwayRuntime.js?v=9';
import { getBuildingSoundProfile, getShoreSoundProfile, getSurfaceSoundProfile, getTerrainSoundProfile, playGameSound, updateBuildingSoundscape } from './gameAudio.js?v=7';
import { GameState as EngineGameState, clearGameProgress, MATERIAL_INVENTORY_SLOT_LIMIT } from '../../GearSystem/js/GameState.js?v=runtime-59';
import { GEAR_CONFIG as ENGINE_GEAR_CONFIG, GearManager as EngineGearManager } from '../../GearSystem/js/GearManager.js?v=runtime-6';
import { GearNetwork as EngineGearNetwork } from '../../GearSystem/js/GearSystem.js?v=network-11';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const vehicleAnimationLayer = document.getElementById('vehicleAnimationLayer');
const vehicleAnimationCanvas = document.createElement('canvas');
vehicleAnimationCanvas.className = 'vehicle-animation-canvas';
vehicleAnimationLayer.prepend(vehicleAnimationCanvas);
const vehicleAnimationContext = vehicleAnimationCanvas.getContext('2d');
let vehicleAnimationLayerActive = false;
const vehicleAnimationPoses = new Map();
const automatonSkinRenderers = new Map();
const AUTOMATON_TRANSPORT_RADIUS = 12;
const AUTOMATON_CARRY_STACK_SIZE = 99;
const automatonTransportRoutes = new Map();
const automatonTransportPlanCache = new Map();
const automatonTransportReachabilityCache = new Map();
let buildingNavigationRevision = 0;
let buildingDrawOrderCacheRevision = -1;
let orderedBuildingDrawCache = [];
const AUTOMATON_TRANSPORT_STEP_DURATION_MS = 300;
const AUTOMATON_SPEED_MULTIPLIERS = [1, 1.25, 1.5, 2, 3];
const TRAIN_BASE_POWER_PER_CELL = 1;
const AUTOMATON_CARRY_MULTIPLIERS = [1, 2, 3, 5, 10];
let automatonSkinPreview = null;
let automatonPreviewSource = '';

function invalidateAutomatonNavigation() {
    buildingNavigationRevision += 1;
    automatonTransportPlanCache.clear();
    automatonTransportReachabilityCache.clear();
    buildingDrawOrderCacheRevision = -1;
}
let cellIconAtlas = null;
const INVENTORY_ITEMS_KEY = 'steampunk_explorer_inventory_items';
const BUILDINGS_STORAGE_KEY = 'fogsgear_world_buildings';
const CRAFTING_RESERVATIONS_KEY = 'fogsgear_crafting_reservations';
const GAME_PROGRESS_EPOCH_KEY = 'fogsgear_game_progress_epoch';
const gameProgressEpochAtStart = localStorage.getItem(GAME_PROGRESS_EPOCH_KEY) || '';
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
const TERRAIN_CACHE_CHUNK_SIZE = 16;
const TERRAIN_CACHE_MAX_PIXELS = 16 * 1024 * 1024;
const WORLD_AFFECTING_SCROLL_MODES = new Set([
    'RESOURCE_COLLECTION',
    'TERRAIN_TRANSFORM',
    'ERA_SHIFT',
    'TARGET_SHIFT_UP',
    'TARGET_SHIFT_DOWN',
    'TARGET_SHIFT_LEFT',
    'TARGET_SHIFT_RIGHT'
]);
const terrainChunkCache = new Map();
let terrainChunkCachePixels = 0;
let terrainChunkCacheMap = null;
let activeBuildingPlacement = null;
let buildingPlacementMode = 'single';
let selectedBuildingInstanceId = null;
let pendingBuildingDemolitionInstanceId = null;
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
const SAVE_BACKUP_VERSION = 4;
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
const SAVE_BACKUP_V3_KEYS = [
    ...LEGACY_SAVE_BACKUP_KEYS,
    INVENTORY_ITEMS_KEY,
    BUILDINGS_STORAGE_KEY,
    'fogsgear_active_scroll_id',
    'fogsgear_active_scroll_running',
    ACTIVE_SCROLL_TARGETS_KEY,
    'fogsgear_active_scroll_sync_state'
];
const SAVE_BACKUP_KEYS = [...SAVE_BACKUP_V3_KEYS, CRAFTING_RESERVATIONS_KEY];
let pendingSaveBackup = null;

function isGameSaveStorageKey(key) {
    return key === 'fog_thermo_save'
        || key?.startsWith('fogsgear_') && key !== GAME_PROGRESS_EPOCH_KEY && !key.startsWith(CELL_CHANGES_PREFIX)
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
const inventoryOpenCategories = new Set(['scrolls']);
let craftingRenderSignature = '';
let buildingRenderSignature = '';
let buildingCraftingRenderSignature = '';
const craftingQuantitySelections = new Map();
const craftingNotificationCards = new Map();
let craftingNotificationQueueIds = [];
let activeCraftingNotificationQueueId = null;
let isCraftingNotificationFlipInProgress = false;
let inventoryRefreshTimer = 0;
let craftingReservationRenderSignature = '';
let lastCraftingReservationCheckAt = 0;
let lastCraftingProgressUpdateAt = 0;
let lastCraftingNotificationSyncAt = 0;
let lastCraftingCountdownUpdateAt = 0;
let selectedStorageStack = null;
let pendingInventoryDiscardItemId = null;

const INVENTORY_ITEM_DEFINITIONS = {
    paper_scroll: { name: 'スクロール（紙）', description: '新しいギア設計を記録する紙の巻物。ギア編集画面で設計を作成できます。', iconId: 'paper_scroll', image: null, meta: '未使用・新規設計用' },
    cloth_scroll: { name: 'スクロール（布）', description: '新しいギア設計を記録する布の巻物。ギア編集画面で設計を作成できます。', iconId: 'cloth_scroll', image: null, meta: '未使用・新規設計用' },
    scroll_book: { name: 'スクロールブック', description: '保存済みスクロールを一覧で確認し、使用やギア編集を行える記録帳です。', iconId: 'scroll_book', image: null, meta: '保存済み設計図' },
    water: { name: '水', description: 'ギアの稼働や資源変換に使用する共有エネルギーです。', iconId: 'water', image: null, meta: '共有エネルギー' },
    fog: { name: '霧', description: 'ギアの処理で回収・消費される共有エネルギーです。', iconId: 'fog', image: null, meta: '共有エネルギー' },
    power: { name: '動力', description: '採集や製作などに使用する共有エネルギーです。', iconId: 'power', image: null, meta: '共有エネルギー' },
    steam_power: { name: 'スチーム', description: 'ギアの作動負荷を支える共有エネルギーです。', iconId: 'steam_power', image: null, meta: '共有エネルギー' }
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
    reinforced_paper_scroll: 'i-paper_scroll',
    cloth_scroll: 'i-cloth_scroll',
    pressure_cloth_scroll: 'i-cloth_scroll',
    alloy_alchemy_cloth_scroll: 'i-cloth_scroll',
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
    const discardButton = document.getElementById('inventory-modal-discard');
    if (!modal || !icon) return;
    modal.dataset.itemKey = itemKey;
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
    if (discardButton) discardButton.hidden = Boolean(scroll) || getCraftingItemCount(itemKey) <= 0;
    if (placementModes) {
        placementModes.hidden = !building || getCraftingItemCount(itemKey) <= 0;
        placementModes.querySelectorAll('[data-action="place-building-from-inventory"]').forEach(button => {
            button.dataset.buildingId = building?.id || '';
        });
    }
    if (editButton) {
        const scrollMaterial = SCROLL_MATERIAL_BY_ITEM.get(itemKey);
        editButton.hidden = !scrollMaterial;
        editButton.dataset.material = scrollMaterial?.type || 'paper';
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
    use.setAttribute('href', `../MainSystem/icons/items/crafting-icons.svg?v=10#${iconId}`);
    svg.appendChild(use);
    return svg;
}

function closeInventoryItem() {
    const modal = document.getElementById('inventory-item-modal');
    if (modal) modal.hidden = true;
}

function openInventoryDiscardConfirmation() {
    const itemKey = document.getElementById('inventory-item-modal')?.dataset.itemKey;
    const count = itemKey ? getCraftingItemCount(itemKey) : 0;
    if (!itemKey || count <= 0) return;
    pendingInventoryDiscardItemId = itemKey;
    const amountInput = document.getElementById('inventory-discard-amount');
    const continuous = ['water', 'fog', 'power', 'steam_power'].includes(itemKey);
    const available = continuous ? count : Math.floor(count);
    amountInput.step = continuous ? '0.01' : '1';
    amountInput.min = continuous ? '0.000001' : '1';
    amountInput.max = String(available);
    amountInput.value = String(available);
    updateInventoryDiscardConfirmation();
    document.getElementById('inventory-discard-confirm-modal').hidden = false;
}

function updateInventoryDiscardConfirmation() {
    const itemId = pendingInventoryDiscardItemId;
    const amountInput = document.getElementById('inventory-discard-amount');
    const confirmButton = document.querySelector('[data-action="confirm-inventory-discard"]');
    const continuous = ['water', 'fog', 'power', 'steam_power'].includes(itemId);
    const count = itemId ? getCraftingItemCount(itemId) : 0;
    const amount = Number(amountInput?.value);
    const available = continuous ? count : Math.floor(count);
    const valid = Number.isFinite(amount) && amount > 0 && amount <= available
        && (continuous || Number.isInteger(amount));
    if (confirmButton) confirmButton.disabled = !valid;
    document.getElementById('inventory-discard-confirm-message').textContent = itemId
        ? `「${getCraftingItemName(itemId)}」の所持数 ${formatInventoryCount(itemId, count)} 個から指定数を破棄します。この操作は取り消せません。`
        : '破棄するアイテムがありません。';
}

function cancelInventoryDiscard() {
    document.getElementById('inventory-discard-confirm-modal').hidden = true;
    pendingInventoryDiscardItemId = null;
}

function discardInventoryItem() {
    const itemId = pendingInventoryDiscardItemId;
    const count = itemId ? getCraftingItemCount(itemId) : 0;
    const continuous = ['water', 'fog', 'power', 'steam_power'].includes(itemId);
    const amountInput = document.getElementById('inventory-discard-amount');
    const amount = Number(amountInput?.value);
    const discardAmount = amount;
    const available = continuous ? count : Math.floor(count);
    if (!itemId || !Number.isFinite(discardAmount) || discardAmount <= 0 || discardAmount > available) {
        cancelInventoryDiscard();
        showAppNotice('破棄する数量を確認してください。');
        return;
    }
    if (!continuous && !Number.isInteger(discardAmount)) {
        cancelInventoryDiscard();
        showAppNotice('破棄する数量は整数で指定してください。');
        return;
    }
    if (itemId === 'brass-stock') engineRuntimeState.brass = Math.max(0, count - discardAmount);
    else {
        const resourceKey = { water: 'water', fog: 'fog', power: 'power', steam_power: 'steamPower' }[itemId];
        if (resourceKey) engineRuntimeState[resourceKey] = Math.max(0, count - discardAmount);
        else {
            const remaining = Math.max(0, count - discardAmount);
            if (remaining > 0) engineRuntimeState.materialInventory[itemId] = remaining;
            else delete engineRuntimeState.materialInventory[itemId];
        }
    }
    engineRuntimeState.saveGameData();
    engineRuntimeState.notify();
    cancelInventoryDiscard();
    closeInventoryItem();
    renderCellMaterials();
    updateEngineDashboard();
}

function getStoredSavedScrolls() {
    try {
        const saved = JSON.parse(localStorage.getItem('fogsgear_scroll_library') || '[]');
        return Array.isArray(saved) ? saved : [];
    } catch (error) {
        return [];
    }
}

function getUniqueScrollName(name, scrolls) {
    const baseName = String(name || '').trim().slice(0, 80);
    if (!baseName) throw new Error('スクロール名を入力してください。');
    const existingNames = new Set(scrolls.map(scroll => String(scroll.name || '').toLocaleLowerCase()));
    if (!existingNames.has(baseName.toLocaleLowerCase())) return baseName;
    for (let suffix = 2; suffix < 10000; suffix++) {
        const suffixText = `（${suffix}）`;
        const candidate = `${baseName.slice(0, 80 - suffixText.length)}${suffixText}`;
        if (!existingNames.has(candidate.toLocaleLowerCase())) return candidate;
    }
    throw new Error('重複しないスクロール名を作成できませんでした。');
}

function getScrollDurabilityLimit(scroll) {
    const materialType = SCROLL_MATERIAL_BY_TYPE.has(scroll?.material)
        ? scroll.material
        : SCROLL_MATERIAL_BY_TYPE.has(scroll?.scrollType) ? scroll.scrollType : 'paper';
    return SCROLL_MATERIAL_BY_TYPE.get(materialType)?.durability || 50;
}

function getScrollUsedRotations(scroll) {
    const rotations = Number(scroll?.usedRotations);
    return Number.isFinite(rotations) ? Math.max(0, rotations) : 0;
}

function isScrollExhausted(scroll) {
    return getScrollUsedRotations(scroll) >= getScrollDurabilityLimit(scroll);
}

function getInstalledScrollIds(excludeBuildingInstanceId = null) {
    return new Set(state.buildings
        .filter(building => building.instanceId !== excludeBuildingInstanceId)
        .flatMap(building => [
            building.craftingScrollId,
            building.vehicle?.movementScrollId,
            building.automaton?.movementScrollId,
            building.stationControl?.movementScrollId
        ])
        .filter(scrollId => typeof scrollId === 'string' && scrollId));
}

function isUsableCraftingScroll(scroll) {
    const gears = scroll?.blueprint?.gears;
    return Array.isArray(gears) && gears.some(gear => gear.isCore)
        && gears.some(gear => !gear.isCore)
        && !isScrollExhausted(scroll);
}

let cachedCraftingScrollLibraryValue = null;
let cachedCraftingScrollIds = new Set();
let lastCraftingPowerTickAt = Date.now();
let lastCraftingScrollSyncAt = 0;
let craftingWorldReady = false;
let startupStage = '起動準備';

function hasAssignedCraftingScroll(placed) {
    return Boolean(placed?.craftingScrollId && getStoredSavedScrolls().some(scroll =>
        scroll.id === placed.craftingScrollId && isUsableCraftingScroll(scroll)));
}

function requiresMovementScroll(placed) {
    const kind = BUILDING_BY_ID.get(placed?.id)?.kind;
    return kind === 'locomotive' || kind === 'automaton';
}

function getMovementScrollId(placed) {
    const kind = BUILDING_BY_ID.get(placed?.id)?.kind;
    if (kind === 'locomotive') return placed.vehicle?.movementScrollId || '';
    if (kind === 'automaton') return placed.automaton?.movementScrollId || '';
    return '';
}

function setMovementScrollId(placed, scrollId) {
    const kind = BUILDING_BY_ID.get(placed?.id)?.kind;
    if (kind === 'locomotive') {
        const vehicle = getVehicleState(placed);
        if (scrollId) vehicle.movementScrollId = scrollId;
        else delete vehicle.movementScrollId;
    } else if (kind === 'automaton') {
        const automaton = getAutomatonState(placed);
        if (scrollId) automaton.movementScrollId = scrollId;
        else delete automaton.movementScrollId;
    }
}

function hasAssignedMovementScroll(placed) {
    const scrollId = getMovementScrollId(placed);
    return Boolean(scrollId
        && getStoredSavedScrolls().some(scroll => scroll.id === scrollId && isUsableCraftingScroll(scroll))
        && !getInstalledScrollIds(placed.instanceId).has(scrollId));
}

function hasRunningCraftingScroll(placed) {
    return Boolean(hasAssignedCraftingScroll(placed)
        && getActiveScrollIds().includes(placed.craftingScrollId)
        && engineRuntimeState.mainGearRunning
        && (engineRuntimeState.creativeMode || Number(engineRuntimeState.steamPower) > 0));
}

function getCraftingOverclock(placed) {
    const selectedMultiplier = Number(placed?.craftingOverclockMultiplier) || 1;
    return CRAFTING_OVERCLOCK_OPTIONS.find(option => option.speedMultiplier === selectedMultiplier)
        || CRAFTING_OVERCLOCK_OPTIONS[0];
}

function getCraftingStationPowerRate(placed) {
    const baseRate = CRAFTING_STATION_POWER_RATES[placed?.id];
    if (!Number.isFinite(baseRate) || baseRate <= 0) {
        console.error(`No crafting power rate configured for building "${placed?.id}".`);
        return 0;
    }
    return baseRate * getCraftingOverclock(placed).powerMultiplier;
}

async function advanceOfflineCraftingJobs() {
    const now = Date.now();
    const savedAt = Number(engineRuntimeState.offlineCraftingStartedAt);
    const startAt = Number.isFinite(savedAt) && savedAt > 0 ? Math.min(now, savedAt) : now;
    const elapsedMs = Math.max(0, now - startAt);
    const poweredJobs = engineRuntimeState.craftingJobs.filter(job => job.requiresPower);
    engineRuntimeState.offlineCraftingStartedAt = now;
    if (elapsedMs <= 0) {
        lastCraftingPowerTickAt = now;
        craftingWorldReady = true;
        return;
    }

    const activeIds = new Set(getActiveScrollIds());
    const targets = (() => {
        try {
            const stored = JSON.parse(localStorage.getItem(ACTIVE_SCROLL_TARGETS_KEY) || '{}');
            return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
        } catch (error) {
            console.warn('Could not read active scroll targets during offline simulation.', error);
            return {};
        }
    })();
    const motorWasRunning = engineRuntimeState.mainGearRunning
        && (engineRuntimeState.creativeMode || Number(engineRuntimeState.steamPower) > 0);
    const offlineScrolls = new Map();
    const exhaustedIds = new Set();
    if (motorWasRunning) {
        getStoredSavedScrolls().forEach(scroll => {
            if (!activeIds.has(scroll.id)) return;
            const durabilityLimit = getScrollDurabilityLimit(scroll);
            const usedRotations = Math.min(durabilityLimit, getScrollUsedRotations(scroll));
            if (usedRotations >= durabilityLimit) {
                exhaustedIds.add(scroll.id);
                return;
            }
            const target = targets[scroll.id];
            const targetStartedAt = Number(target?.startedAt);
            const savedRotationAt = Number(scroll.usedRotationsUpdatedAt);
            const startedAt = Math.max(
                startAt,
                Number.isFinite(targetStartedAt) && targetStartedAt > 0 ? targetStartedAt : startAt,
                Number.isFinite(savedRotationAt) && savedRotationAt > 0 ? savedRotationAt : startAt
            );
            const gears = (Array.isArray(scroll.blueprint?.gears) ? scroll.blueprint.gears : [])
                .map(gear => {
                    const sizeKey = gear.sizeKey || gear.size || 'M';
                    const runtimeGear = engineGearManager.createGear(
                        gear.q, gear.r, sizeKey, gear.layer, gear.isCore, gear.angle, gear.id
                    );
                    runtimeGear.isLocked = gear.isLocked ?? Boolean(gear.isCore);
                    return runtimeGear;
                });
            const network = new EngineGearNetwork(gears, scroll.blueprint?.belts || []);
            network.updateRotation();
            const core = gears.find(gear => gear.isCore);
            if (!core?.powered || core.isDeadlocked || core.angleError) return;
            offlineScrolls.set(scroll.id, {
                scroll,
                usedRotations,
                durabilityLimit,
                rotationsPerSecond: Math.abs(core.angularVelocity || 0) * 0.012 * 60 / (Math.PI * 2),
                startedAt,
                exhausted: false
            });
        });
    }

    getStoredSavedScrolls().forEach(scroll => {
        if (activeIds.has(scroll.id)
            && getScrollUsedRotations(scroll) >= getScrollDurabilityLimit(scroll)) {
            exhaustedIds.add(scroll.id);
        }
    });
    exhaustedIds.forEach(scrollId => {
        activeIds.delete(scrollId);
        delete targets[scrollId];
    });

    const stations = new Map();
    poweredJobs.forEach(job => {
        if (!stations.has(job.craftingStationId)) {
            const placed = state.buildings.find(building => building.instanceId === job.craftingStationId);
            const overclock = getCraftingOverclock(placed);
            const powerRate = getCraftingStationPowerRate(placed);
            const scrollRuntime = placed?.craftingScrollId
                ? offlineScrolls.get(placed.craftingScrollId)
                : null;
            stations.set(job.craftingStationId, {
                placed,
                overclock,
                powerRate,
                scrollRuntime,
                installed: Boolean(scrollRuntime),
                startedAt: scrollRuntime?.startedAt ?? Infinity,
                pausedAt: scrollRuntime ? null : startAt,
                powerPausedAt: null
            });
        }
    });

    stations.forEach(({ overclock, installed, startedAt }, stationId) => {
        const stationJobs = poweredJobs.filter(job => job.craftingStationId === stationId);
        if (!installed) {
            stationJobs.forEach(job => {
                if (Number(job.startedAt) <= startAt) {
                    const remaining = Math.max(0, Number(job.workRemainingMs) || 0);
                    job.completesAt = now + remaining / overclock.speedMultiplier;
                } else {
                    job.startedAt = Number(job.startedAt) + elapsedMs;
                    job.completesAt = Number(job.completesAt) + elapsedMs;
                }
                job.powerPaused = true;
            });
            return;
        }
        const delayedStartMs = Math.max(0, startedAt - startAt);
        if (delayedStartMs > 0) {
            stationJobs.forEach(job => {
                if (Number(job.startedAt) <= startAt) {
                    job.completesAt = Number(job.completesAt) + delayedStartMs;
                } else {
                    job.startedAt = Number(job.startedAt) + delayedStartMs;
                    job.completesAt = Number(job.completesAt) + delayedStartMs;
                }
            });
        }
        stationJobs.forEach(job => {
            const queuedDuration = Number(job.completesAt) - (Number(job.startedAt) || startAt);
            const savedDuration = Number(job.workDurationMs) || Number(job.durationMs)
                || (queuedDuration > 0 ? queuedDuration : 1);
            const workDuration = Math.max(1, savedDuration);
            job.workDurationMs = workDuration;
            job.workRemainingMs = Math.max(0, Number(job.workRemainingMs) || workDuration);
            job.durationMs = workDuration / overclock.speedMultiplier;
            if (Number(job.startedAt) <= startAt && job.workRemainingMs > 0) {
                job.completesAt = startAt + job.workRemainingMs / overclock.speedMultiplier;
            }
            job.powerPaused = false;
        });
        engineRuntimeState.scheduleCraftingJobs([], startAt, stationId);
    });

    let currentTime = startAt;
    let remainingMs = elapsedMs;
    const parallelSlots = Math.max(1, Math.floor(Number(engineRuntimeState.craftingParallelSlots) || 1));
    let simulationSteps = 0;
    while (remainingMs > 0) {
        const activeStations = [];
        stations.forEach((station, stationId) => {
            if (!station.installed || station.powerRate <= 0 || station.startedAt > currentTime) return;
            const activeJobs = engineRuntimeState.craftingJobs
                .filter(job => job.requiresPower && job.craftingStationId === stationId
                    && Number(job.startedAt) <= currentTime && Number(job.workRemainingMs) > 0)
                .sort((first, second) => Number(first.startedAt) - Number(second.startedAt)
                    || Number(first.batchIndex) - Number(second.batchIndex))
                .slice(0, parallelSlots);
            if (activeJobs.length) activeStations.push({ ...station, stationId, activeJobs });
        });
        const totalPowerRate = activeStations.reduce((total, station) => total + station.powerRate, 0);
        const availablePowerMs = engineRuntimeState.creativeMode
            ? Infinity
            : totalPowerRate > 0 ? Math.max(0, Number(engineRuntimeState.power) || 0) / totalPowerRate * 1000 : Infinity;
        if (!engineRuntimeState.creativeMode && availablePowerMs <= 0) {
            activeStations.forEach(station => {
                if (station.powerPausedAt === null) station.powerPausedAt = currentTime;
            });
        }
        const nextCompletionMs = activeStations.length && availablePowerMs > 0
            ? Math.min(...activeStations.flatMap(station => station.activeJobs.map(job =>
                Math.max(0, Number(job.workRemainingMs) || 0) / station.overclock.speedMultiplier)))
            : Infinity;
        const nextScrollExhaustionMs = Math.min(Infinity, ...[...offlineScrolls.values()]
            .filter(runtime => !runtime.exhausted && runtime.startedAt <= currentTime && runtime.rotationsPerSecond > 0)
            .map(runtime => Math.max(0, runtime.durabilityLimit - runtime.usedRotations)
                / runtime.rotationsPerSecond * 1000));
        const nextScrollStartMs = Math.min(Infinity, ...[...offlineScrolls.values()]
            .filter(runtime => !runtime.exhausted && runtime.startedAt > currentTime)
            .map(runtime => runtime.startedAt - currentTime));
        const nextStationStartMs = Math.min(Infinity, ...[...stations.values()]
            .filter(station => station.installed && station.startedAt > currentTime)
            .map(station => station.startedAt - currentTime));
        const nextPowerDepletionMs = activeStations.length && availablePowerMs > 0
            ? availablePowerMs
            : Infinity;
        const elapsedStepMs = Math.min(
            remainingMs,
            nextPowerDepletionMs,
            nextCompletionMs,
            nextScrollExhaustionMs,
            nextScrollStartMs,
            nextStationStartMs
        );
        if (!(elapsedStepMs > 0)) break;

        const poweredStepMs = Math.min(elapsedStepMs, availablePowerMs);
        const finishedStations = [];
        activeStations.forEach(station => {
            station.activeJobs.forEach(job => {
                job.workRemainingMs = Math.max(0, Number(job.workRemainingMs) - poweredStepMs * station.overclock.speedMultiplier);
                job.completesAt = currentTime + elapsedStepMs + job.workRemainingMs / station.overclock.speedMultiplier;
                job.powerPaused = poweredStepMs < elapsedStepMs;
                if (job.workRemainingMs <= 0) finishedStations.push(station.stationId);
            });
        });
        if (!engineRuntimeState.creativeMode && poweredStepMs > 0) {
            engineRuntimeState.power = Math.max(0, Number(engineRuntimeState.power) - totalPowerRate * poweredStepMs / 1000);
        }
        offlineScrolls.forEach(runtime => {
            if (runtime.startedAt > currentTime || runtime.rotationsPerSecond <= 0) return;
            runtime.usedRotations = Math.min(
                runtime.durabilityLimit,
                runtime.usedRotations + runtime.rotationsPerSecond * elapsedStepMs / 1000
            );
        });
        currentTime += elapsedStepMs;
        remainingMs -= elapsedStepMs;

        const exhaustedScrollIds = [];
        offlineScrolls.forEach((runtime, scrollId) => {
            if (runtime.usedRotations < runtime.durabilityLimit || runtime.exhausted) return;
            exhaustedScrollIds.push(scrollId);
            runtime.exhausted = true;
            stations.forEach(station => {
                if (station.scrollRuntime?.scroll.id === scrollId) {
                    station.installed = false;
                    station.pausedAt = currentTime;
                }
            });
        });
        if (exhaustedScrollIds.length) {
            exhaustedScrollIds.forEach(scrollId => {
                activeIds.delete(scrollId);
                delete targets[scrollId];
            });
        }

        if (finishedStations.length) {
            engineRuntimeState.completeCraftingJobs(currentTime, false);
            [...new Set(finishedStations)].forEach(stationId =>
                engineRuntimeState.scheduleCraftingJobs([], currentTime, stationId));
        }
        if (!engineRuntimeState.creativeMode && Number(engineRuntimeState.power) <= 0) {
            activeStations.forEach(station => {
                if (station.powerPausedAt === null) station.powerPausedAt = currentTime;
            });
        }
        simulationSteps++;
        if (simulationSteps % 32 === 0) {
            const progress = elapsedMs > 0 ? Math.min(100, Math.floor((currentTime - startAt) / elapsedMs * 100)) : 100;
            const loadingMessage = document.getElementById('loadingMessage');
            if (loadingMessage) loadingMessage.textContent = `オフライン進行を反映しています... ${progress}%`;
            await new Promise(resolve => window.setTimeout(resolve, 0));
        }
    }

    stations.forEach((station, stationId) => {
        const pausedAt = station.pausedAt
            ?? station.powerPausedAt
            ?? (!engineRuntimeState.creativeMode && Number(engineRuntimeState.power) <= 0 ? currentTime : null);
        if (pausedAt === null) return;
        const pausedMs = Math.max(0, now - pausedAt);
        engineRuntimeState.craftingJobs
            .filter(job => job.requiresPower && job.craftingStationId === stationId)
            .forEach(job => {
                if (Number(job.startedAt) > pausedAt) {
                    job.startedAt = Number(job.startedAt) + pausedMs;
                    job.completesAt = Number(job.completesAt) + pausedMs;
                } else if (Number(job.workRemainingMs) > 0) {
                    job.completesAt = now + Number(job.workRemainingMs) / station.overclock.speedMultiplier;
                }
                job.powerPaused = true;
            });
    });

    const rotationsByScrollId = new Map([...offlineScrolls.values()].map(runtime => [
        runtime.scroll.id,
        runtime.usedRotations
    ]));
    if (rotationsByScrollId.size) {
        const scrollLibrary = getStoredSavedScrolls();
        scrollLibrary.forEach(scroll => {
            if (!rotationsByScrollId.has(scroll.id)) return;
            scroll.usedRotations = rotationsByScrollId.get(scroll.id);
            scroll.usedRotationsUpdatedAt = now;
        });
        localStorage.setItem('fogsgear_scroll_library', JSON.stringify(scrollLibrary));
    }
    const previousActiveScrolls = getActiveScrollIds();
    if (previousActiveScrolls.some(scrollId => !activeIds.has(scrollId))) {
        localStorage.setItem('fogsgear_active_scroll_id', JSON.stringify([...activeIds]));
        localStorage.removeItem('fogsgear_active_scroll_running');
        localStorage.setItem(ACTIVE_SCROLL_TARGETS_KEY, JSON.stringify(targets));
    }

    engineRuntimeState.completeCraftingJobs(now, false);
    engineRuntimeState.saveGameData();
    engineRuntimeState.notify();
    lastCraftingPowerTickAt = now;
    craftingWorldReady = true;
}

function advancePoweredCraftingJobs() {
    if (!craftingWorldReady) return;
    const now = Date.now();
    const elapsed = Math.min(0.25, Math.max(0, (now - lastCraftingPowerTickAt) / 1000));
    lastCraftingPowerTickAt = now;
    if (now - lastCraftingScrollSyncAt >= 250) {
        const libraryValue = localStorage.getItem('fogsgear_scroll_library') || '[]';
        if (libraryValue !== cachedCraftingScrollLibraryValue) {
            cachedCraftingScrollLibraryValue = libraryValue;
            try {
                const scrolls = JSON.parse(libraryValue);
                cachedCraftingScrollIds = new Set(Array.isArray(scrolls)
                    ? scrolls.filter(isUsableCraftingScroll).map(scroll => scroll.id)
                    : []);
            } catch (error) {
                cachedCraftingScrollIds = new Set();
            }
        }
        lastCraftingScrollSyncAt = now;
    }
    const activeJobs = (engineRuntimeState.craftingJobs || []).filter(job => job.requiresPower
        && Number(job.startedAt) <= now && Number(job.workRemainingMs) > 0);
    const runningScrollIds = new Set(getActiveScrollIds());
    const motorRunning = engineRuntimeState.mainGearRunning
        && (engineRuntimeState.creativeMode || Number(engineRuntimeState.steamPower) > 0);
    const jobsByStation = new Map();
    activeJobs.forEach(job => {
        const stationId = job.craftingStationId;
        if (!jobsByStation.has(stationId)) jobsByStation.set(stationId, []);
        jobsByStation.get(stationId).push(job);
    });
    const finishedStations = [];
    jobsByStation.forEach((jobs, stationId) => {
        const placed = state.buildings.find(building => building.instanceId === stationId);
        const scrollInstalled = motorRunning
            && placed?.craftingScrollId
            && runningScrollIds.has(placed.craftingScrollId)
            && cachedCraftingScrollIds.has(placed.craftingScrollId);
        const overclock = getCraftingOverclock(placed);
        const powerRate = getCraftingStationPowerRate(placed);
        const creativeMode = Boolean(engineRuntimeState.creativeMode);
        const poweredSeconds = scrollInstalled
            ? creativeMode ? elapsed : Math.min(elapsed, powerRate > 0 ? Math.max(0, engineRuntimeState.power) / powerRate : 0)
            : 0;
        if (!creativeMode && poweredSeconds > 0) {
            engineRuntimeState.power = Math.max(0, engineRuntimeState.power - powerRate * poweredSeconds);
        }
        const pausedMs = (elapsed - poweredSeconds) * 1000;
        jobs.forEach(job => {
            const workDuration = Math.max(1, Number(job.workDurationMs) || Number(job.durationMs) || 1);
            job.workDurationMs = workDuration;
            job.workRemainingMs = Math.max(0, (Number(job.workRemainingMs) || 0) - poweredSeconds * overclock.speedMultiplier * 1000);
            job.durationMs = workDuration / overclock.speedMultiplier;
            job.completesAt = now + job.workRemainingMs / overclock.speedMultiplier;
            job.powerPaused = pausedMs > 0;
            if (job.workRemainingMs <= 0) finishedStations.push(stationId);
        });
        if (pausedMs > 0) {
            engineRuntimeState.craftingJobs.forEach(job => {
                if (job.craftingStationId === stationId && job.requiresPower
                    && Number(job.startedAt) > now) {
                    job.startedAt = Number(job.startedAt) + pausedMs;
                    job.completesAt = Number(job.completesAt) + pausedMs;
                }
            });
        }
    });
    if (finishedStations.length) {
        engineRuntimeState.completeCraftingJobs(now);
        [...new Set(finishedStations)].forEach(stationId =>
            engineRuntimeState.scheduleCraftingJobs([], now, stationId));
    }
}

let appNoticeTimer = null;
let inventoryFullNoticeAt = 0;

function showAppNotice(message) {
    const notice = document.getElementById('app-notice');
    if (!notice) return;
    notice.textContent = message;
    notice.hidden = false;
    clearTimeout(appNoticeTimer);
    appNoticeTimer = setTimeout(() => { notice.hidden = true; }, 3200);
}

function notifyInventoryFull() {
    const now = Date.now();
    if (now - inventoryFullNoticeAt < 10000) return;
    inventoryFullNoticeAt = now;
    showAppNotice(`所持枠が上限（${MATERIAL_INVENTORY_SLOT_LIMIT}枠）です。資材をストレージに預けてください。`);
}

function canPersistGameProgress() {
    return !gameResetInProgress
        && (localStorage.getItem(GAME_PROGRESS_EPOCH_KEY) || '') === gameProgressEpochAtStart;
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

function readCraftingReservations() {
    try {
        const reservations = JSON.parse(localStorage.getItem(CRAFTING_RESERVATIONS_KEY) || '[]');
        if (!Array.isArray(reservations)) return [];
        return reservations.filter(reservation => isRecord(reservation)
            && typeof reservation.id === 'string'
            && typeof reservation.buildingInstanceId === 'string'
            && ((Number.isInteger(reservation.recipeIndex) && reservation.recipeIndex >= 0)
                || (reservation.recipeIndex === -1 && typeof reservation.buildingId === 'string' && BUILDING_BY_ID.has(reservation.buildingId)))
            && Number.isInteger(reservation.quantity)
            && reservation.quantity > 0);
    } catch (error) {
        return [];
    }
}

function saveCraftingReservations(reservations) {
    localStorage.setItem(CRAFTING_RESERVATIONS_KEY, JSON.stringify(reservations));
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
    } else if (key === CRAFTING_RESERVATIONS_KEY) {
        if (!Array.isArray(parsed) || parsed.some(reservation => !isRecord(reservation)
            || typeof reservation.id !== 'string' || !reservation.id
            || typeof reservation.buildingInstanceId !== 'string'
            || (!Number.isInteger(reservation.recipeIndex)
                || reservation.recipeIndex < -1
                || (reservation.recipeIndex === -1
                    ? (typeof reservation.buildingId !== 'string' || !BUILDING_BY_ID.has(reservation.buildingId))
                    : (reservation.recipeIndex >= CRAFTING_RECIPES.length
                        || (!reservation.buildingInstanceId && CRAFTING_RECIPES[reservation.recipeIndex]?.[4] !== HANDCRAFT_STATION)
                        || (reservation.buildingInstanceId && CRAFTING_RECIPES[reservation.recipeIndex]?.[4] === HANDCRAFT_STATION))))
            || !Number.isInteger(reservation.quantity) || reservation.quantity < 1 || reservation.quantity > 99
            || !Number.isFinite(Number(reservation.queuedAt)))) {
            throw new Error('製作予約データが不正です。');
        }
    } else if (key === ACTIVE_SCROLL_TARGETS_KEY) {
        if (!isRecord(parsed) || Object.values(parsed).some(target => !isRecord(target)
            || !Number.isInteger(target.x) || !Number.isInteger(target.y)
            || (target.buildingInstanceId !== undefined && (typeof target.buildingInstanceId !== 'string' || !target.buildingInstanceId)))) {
            throw new Error('スクロール対象位置が不正です。');
        }
    } else if (key === 'fogsgear_active_scroll_sync_state') {
        if (!isRecord(parsed) || Object.values(parsed).some(locks => !isRecord(locks) || Object.values(locks).some(locked => typeof locked !== 'boolean'))) throw new Error('スクロール同期状態が不正です。');
    } else if (['fogsgear_world_unlocks', 'fogsgear_cell_entry_rules'].includes(key) && !isRecord(parsed)) {
        throw new Error('設定データの形式が正しくありません。');
    }
}

function validateSaveBackup(backup) {
    if (!isRecord(backup) || backup.format !== SAVE_BACKUP_FORMAT || ![1, 2, 3, SAVE_BACKUP_VERSION].includes(backup.version)) {
        throw new Error('FogsGearの対応セーブJSONではありません。');
    }
    if (!isRecord(backup.data) || !isRecord(backup.cellChanges)) throw new Error('セーブJSONの構造が不正です。');
    const requiredKeys = backup.version === 1 ? LEGACY_SAVE_BACKUP_KEYS
        : backup.version === 2 ? SAVE_BACKUP_V3_KEYS.filter(key => key !== BUILDINGS_STORAGE_KEY)
            : backup.version === 3 ? SAVE_BACKUP_V3_KEYS : SAVE_BACKUP_KEYS;
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
    return fileName || '既定の見た目';
}

function updateSkinName(name) {
    const skinName = document.getElementById('skinName');
    if (skinName) skinName.textContent = `選択中: ${name || '未選択'}`;
}

function getPlayerSkinConfig() {
    let url = './5504543579.png';
    let name = '5504543579.png';
    try {
        const savedUrl = localStorage.getItem('steampunk_explorer_skin_url');
        if (savedUrl && savedUrl !== 'https://mineskin.org/download/639735497') {
            url = savedUrl;
            name = localStorage.getItem('steampunk_explorer_skin_name') || getSkinNameFromSource(url);
        }
    } catch (error) {
        console.warn('Could not read the selected player skin; using the default skin.', error);
    }
    return { url, name };
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
        const worker = new Worker('./js/mapWorker.js?v=90', { type: 'module' });
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
    const setStartupStage = (stage, message) => {
        startupStage = stage;
        const loadingMessage = document.getElementById('loadingMessage');
        if (loadingMessage && message) loadingMessage.textContent = message;
    };
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
    setStartupStage('保存マップ読み込み', '保存済みのマップを読み込んでいます...');
    let generated = await loadMapSnapshot(state.worldSeed, mapSize.width, mapSize.height, progress => {
        if (loadingMessage) {
            loadingMessage.textContent = `保存済みマップを展開しています... ${Math.round(progress * 100)}%`;
        }
    });
    if (!generated) {
        setStartupStage('マップ生成', 'マップを生成しています...');
        generated = await generateMapInWorker(state.worldSeed).catch(() => state.generator.generate(state.worldSeed));
        saveMapSnapshot(generated, state.worldSeed, mapSize.width, mapSize.height).catch(() => {});
    }
    state.map = generated.grid;
    clearTerrainChunkCache();
    setStartupStage('建築データ復元', '建築データを読み込んでいます...');
    await new Promise(resolve => window.setTimeout(resolve, 0));
    loadBuildings();
    setStartupStage('オフライン進行復元', '製作とスクロールのオフライン進行を反映しています...');
    await new Promise(resolve => window.setTimeout(resolve, 0));
    await advanceOfflineCraftingJobs();
    setStartupStage('地形変更復元', '地形の変更を反映しています...');
    state.cellChanges = applyCellChanges(state.map, state.worldSeed);
    try {
        const targets = JSON.parse(localStorage.getItem(ACTIVE_SCROLL_TARGETS_KEY) || '{}');
        state.activeScrollTargets = getWorldAffectingActiveScrollTargets(targets && typeof targets === 'object' ? targets : {});
    } catch (error) {
        state.activeScrollTargets = {};
    }
    state.territories = state.generator.coastalOnly ? [] : generated.territories || [];
    state.rivers = generated.rivers || [];
    state.ruins = generated.ruins || [];
    state.routes = generated.routes || [];
    if (!state.generator.coastalOnly) {
        setStartupStage('領土境界生成', '領土境界を準備しています...');
        state.territoryBorderSegments = await buildTerritoryBorderSegmentsAsync(state.map, progress => {
            if (loadingMessage) {
                loadingMessage.textContent = `領土境界を準備しています... ${Math.round(progress * 100)}%`;
            }
        });
    } else {
        state.territoryBorderSegments = [];
    }
    state.labels = buildLabelEntries();

    setStartupStage('開始位置計算', 'プレイヤーの開始位置を確認しています...');
    await new Promise(resolve => window.setTimeout(resolve, 0));
    findSafeSpawn(generated.playerPos);
    stopPlayerTargetedScrolls();

    let savedSkin = './5504543579.png';
    let savedSkinName = '5504543579.png';
    try {
        const stored = localStorage.getItem('steampunk_explorer_skin_url');
        if (stored && stored !== 'https://mineskin.org/download/639735497') savedSkin = stored;
        const storedName = localStorage.getItem('steampunk_explorer_skin_name');
        if (storedName && savedSkin !== './5504543579.png') savedSkinName = storedName;
    } catch(e) {}

    setStartupStage('画面初期化', 'ゲーム画面を準備しています...');
    resize();
    centerCameraOnPlayer();
    updateUI();
    setupControls();
    renderSavedScrolls();
    renderCellLegend();
    gameLoop();
    if (state.buildings.some(placed => placed.vehicle?.running || placed.vehicle?.movement
        || placed.automaton?.running || placed.automaton?.movement)) scheduleVehicleAnimation();
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
    if (!canPersistGameProgress()) return;
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
    if (!canPersistGameProgress()) return { success: false, error: 'ゲームデータがリセットされました。画面を再読み込みしてください。' };
    const { x, y } = operation.target || {};
    if (!Number.isInteger(x) || !Number.isInteger(y)) return { success: false };
    const targetStand = operation.target?.buildingInstanceId
        ? state.buildings.find(building => building.instanceId === operation.target.buildingInstanceId
            && supportsStationaryScrolls(building) && building.craftingScrollId === operation.scrollId)
        : null;
    if (operation.target?.buildingInstanceId && !targetStand) {
        return { success: false };
    }
    if (!targetStand && (state.player.x !== x || state.player.y !== y)) return { success: false };
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
        if (typeChanged) invalidateTerrainChunkAt(x, y);
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
        if (!definition || !['direct', 'direct2'].includes(definition.category) || tile.isSea || tile.isLake) return { success: false };
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
        const storageTargets = targetStand ? getNearbyScrollStorageTargets(targetStand) : [];
        const storageAllocations = [];
        const projectedStorage = new Map();
        const remainingDrops = [];
        for (const itemId of drops) {
            let remaining = 1;
            for (const { storage, definition } of storageTargets) {
                if (!projectedStorage.has(storage)) {
                    projectedStorage.set(storage, { ...storage.storedMaterials });
                }
                const projectedMaterials = projectedStorage.get(storage);
                const storedCount = Math.floor(Math.max(0, Number(projectedMaterials[itemId]) || 0));
                const usedSlots = Object.values(projectedMaterials).reduce((total, amount) =>
                    total + Math.ceil(Math.max(0, Number(amount) || 0) / 99), 0);
                const freeSlots = Math.max(0, definition.storageCapacity - usedSlots);
                const stackSpace = storedCount > 0 ? Math.ceil(storedCount / 99) * 99 - storedCount : 0;
                const amount = Math.min(remaining, stackSpace + freeSlots * 99);
                if (amount > 0) {
                    storageAllocations.push({ storage, itemId, amount });
                    projectedMaterials[itemId] = storedCount + amount;
                    remaining -= amount;
                }
                if (remaining <= 0) break;
            }
            if (remaining > 0) remainingDrops.push(itemId);
        }
        if (!canAddInventoryItems(remainingDrops)) {
            notifyInventoryFull();
            return { success: false, error: 'inventory-full' };
        }
        const consumedPower = getCellCollectionPowerCost(currentType, collectionCount);
        if ((Number(operation.power) || 0) < consumedPower) return { success: false };
        new Set(storageAllocations.map(allocation => allocation.storage)).forEach(storage => {
            storage.storedMaterials = projectedStorage.get(storage);
        });
        if (storageAllocations.length) {
            saveBuildings();
            const selectedBuilding = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
            if (selectedBuilding?.id === 'simple-storage' || selectedBuilding?.id === 'warehouse') {
                renderBuildingStorage(selectedBuilding, BUILDING_BY_ID.get(selectedBuilding.id));
                updateBuildingMenuDetails(selectedBuilding, BUILDING_BY_ID.get(selectedBuilding.id));
            }
        }
        persistChange(currentType, transformCount, collectionCount + 1);
        return {
            success: true,
            consumedPower,
            producedItems: remainingDrops.length
                ? Object.fromEntries(remainingDrops.map(item => [item, 1]))
                : {}
        };
    }

    return { success: false };
}

function refreshActiveScrollTargets(targets = null) {
    let activeTargets = targets;
    if (!activeTargets) {
        try {
            const stored = JSON.parse(localStorage.getItem(ACTIVE_SCROLL_TARGETS_KEY) || '{}');
            activeTargets = stored && typeof stored === 'object' ? stored : {};
        } catch (error) {
            activeTargets = {};
        }
    }
    state.activeScrollTargets = getWorldAffectingActiveScrollTargets(activeTargets);
    updateCellInspection();
    scheduleDraw();
}

function getWorldAffectingActiveScrollTargets(targets) {
    const savedScrolls = new Map(getStoredSavedScrolls().map(scroll => [scroll.id, scroll]));
    return Object.fromEntries(Object.entries(targets).filter(([scrollId]) => {
        const scroll = savedScrolls.get(scrollId);
        return !scroll || !Array.isArray(scroll.blueprint?.gears)
            || scroll.blueprint.gears.some(gear => WORLD_AFFECTING_SCROLL_MODES.has(gear.processMode));
    }));
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
    if (itemId === 'crafting_reservations') return readCraftingReservations().length;
    if (itemId === 'brass-stock') return Math.max(0, Number(engineRuntimeState?.brass) || 0);
    const resourceKey = { water: 'water', fog: 'fog', power: 'power', steam_power: 'steamPower' }[itemId];
    if (resourceKey) return Math.max(0, Number(engineRuntimeState?.[resourceKey]) || 0);
    return Math.max(0, Number(engineRuntimeState?.materialInventory?.[itemId]) || 0);
}

function canAddInventoryItems(itemIds) {
    return engineRuntimeState?.canAddInventoryItems(itemIds) ?? false;
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

function getMaximumBuildingKitCraftCount(building, creative = Boolean(engineRuntimeState?.creativeMode)) {
    if (creative) return 99;
    const materialCosts = getBuildingMaterialCosts(building);
    return Math.max(0, Math.min(
        Math.floor(getCraftingItemCount('brass-stock') / Math.max(1, Number(building.brassCost) || 1)),
        ...materialCosts.map(([itemId, amount]) =>
            Math.floor(getCraftingItemCount(itemId) / Math.max(1, Number(amount) || 1)))
    ));
}

function getMaximumCraftCountForCard(card) {
    if (card.classList.contains('building-item-card')) {
        const buildingId = card.querySelector('[data-action="craft-building-kit"]')?.dataset.buildingId;
        const building = BUILDING_BY_ID.get(buildingId);
        return building ? getMaximumBuildingKitCraftCount(building) : 0;
    }
    const recipeIndex = Number(card.dataset.recipeIndex);
    const baseRecipe = CRAFTING_RECIPES[recipeIndex];
    const buildingInstanceId = card.querySelector('[data-action="craft-recipe"]')?.dataset.buildingInstanceId || '';
    const buildingId = state.buildings.find(building => building.instanceId === buildingInstanceId)?.id;
    const recipe = getCraftingRecipeForBuilding(baseRecipe, buildingId);
    return recipe ? getMaximumCraftCount(recipe[2]) : 0;
}

function formatCompactCount(value) {
    const number = Number(value) || 0;
    const absolute = Math.abs(number);
    const units = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
    let unitIndex = units.findIndex(([threshold]) => absolute >= threshold);
    if (unitIndex < 0) return number.toFixed(2);
    let [threshold, suffix] = units[unitIndex];
    if (unitIndex > 0 && Math.abs(Number((number / threshold).toFixed(2))) >= 1e3) {
        [threshold, suffix] = units[--unitIndex];
    }
    return `${(number / threshold).toFixed(2).replace(/\.00$/, '').replace(/(\.[0-9])0$/, '$1')}${suffix}`;
}

function createCraftQuantityControl(label, selectionKey, maxCount, defaultCount, outputBatch = 1, disabled = false) {
    const control = document.createElement('div');
    control.className = 'crafting-quantity-control';
    const caption = document.createElement('span');
    caption.className = 'crafting-quantity-label';
    caption.textContent = '製作数';
    const toggle = document.createElement('div');
    toggle.className = 'crafting-quantity-toggle';
    toggle.setAttribute('role', 'group');
    toggle.setAttribute('aria-label', label);
    toggle.dataset.selectionKey = selectionKey;
    toggle.dataset.outputBatch = String(outputBatch);
    const rememberedSelection = craftingQuantitySelections.get(selectionKey);
    const selectedCount = maxCount > 0
        ? rememberedSelection === 'max'
            ? maxCount
            : Math.min(maxCount, Math.max(1, rememberedSelection || defaultCount))
        : 0;
    if (control.dataset.selectedCount !== String(selectedCount)) control.dataset.selectedCount = String(selectedCount);
    if (maxCount > 0 && rememberedSelection !== 'max') craftingQuantitySelections.set(selectionKey, selectedCount);

    const options = maxCount > 0
        ? [
            { count: 1, label: '1' },
            { count: 5, label: '5' },
            { count: 10, label: '10' }
        ].filter(option => option.count <= maxCount)
        : [{ count: 0, label: '0' }];
    if (maxCount > 0 && selectedCount > 0 && !options.some(option => option.count === selectedCount)) {
        options.push({ count: selectedCount, label: String(selectedCount) });
    }
    if (maxCount > 0 && !options.some(option => option.count === maxCount)) {
        options.push({ count: maxCount, label: '最大' });
    }
    options.forEach(option => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'crafting-quantity-option';
        button.dataset.action = 'select-craft-quantity';
        button.dataset.quantity = String(option.count);
        button.dataset.isMaximum = String(option.count === maxCount);
        button.textContent = option.label;
        button.setAttribute('aria-label', option.label === '最大'
            ? `最大 ${maxCount}個`
            : `${option.count}個`);
        const selected = option.count === selectedCount;
        button.setAttribute('aria-pressed', String(selected));
        button.disabled = disabled || maxCount === 0;
        toggle.appendChild(button);
    });
    control.append(caption, toggle);
    return control;
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
        || ({ crafting_reservations: '製作予約' }[itemId])
        || ({ fog: '霧', power: '動力', steam_power: 'スチーム' }[itemId]) || itemId;
}

function getCraftingRecipeDisplayName(recipeTitle) {
    return String(recipeTitle).replace('を製作する', '');
}

function isLargeBuilding(building) {
    return Boolean(building && building.width >= 2 && building.height >= 2);
}

function isBuildingConstructionStation(buildingId) {
    const building = BUILDING_BY_ID.get(buildingId);
    return Boolean(building && !building.supportsStationaryScrolls
        && (BUILDING_CONSTRUCTION_STARTER_STATIONS.has(buildingId)
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

function getStorageUsedSlots(storage) {
    return Object.values(storage.storedMaterials || {}).reduce((total, amount) => {
        const count = Number(amount);
        return total + (Number.isFinite(count) ? Math.ceil(Math.max(0, count) / 99) : 0);
    }, 0);
}

function getGridDistanceBetweenBuildings(first, firstDefinition, second, secondDefinition) {
    let distance = Number.POSITIVE_INFINITY;
    for (let firstY = first.y; firstY < first.y + firstDefinition.height; firstY++) {
        for (let firstX = first.x; firstX < first.x + firstDefinition.width; firstX++) {
            for (let secondY = second.y; secondY < second.y + secondDefinition.height; secondY++) {
                for (let secondX = second.x; secondX < second.x + secondDefinition.width; secondX++) {
                    distance = Math.min(distance, Math.max(Math.abs(firstX - secondX), Math.abs(firstY - secondY)));
                }
            }
        }
    }
    return distance;
}

function getNearbyScrollStorageTargets(sourceBuilding) {
    const sourceDefinition = BUILDING_BY_ID.get(sourceBuilding?.id);
    if (!sourceDefinition?.supportsStationaryScrolls) return [];
    return state.buildings
        .map(storage => {
            const definition = BUILDING_BY_ID.get(storage.id);
            const range = Number(definition?.collectionImportRange) || 0;
            if (!definition?.storageCapacity || range === 0) return null;
            const distance = getGridDistanceBetweenBuildings(sourceBuilding, sourceDefinition, storage, definition);
            return distance <= range ? { storage, definition, distance } : null;
        })
        .filter(Boolean)
        .sort((first, second) => first.distance - second.distance
            || String(first.storage.instanceId).localeCompare(String(second.storage.instanceId)));
}

function getStorageInventoryCount(itemId) {
    const resourceKey = { water: 'water', fog: 'fog', power: 'power', steam_power: 'steamPower' }[itemId];
    if (itemId === 'brass-stock') return Math.max(0, Number(engineRuntimeState?.brass) || 0);
    if (resourceKey) return Math.max(0, Number(engineRuntimeState?.[resourceKey]) || 0);
    return getCraftingItemCount(itemId);
}

function getStorageTransferCandidates(placed) {
    const storedMaterials = placed?.storedMaterials || {};
    return CRAFTING_ITEMS.filter(([itemId]) => selectedStorageStack
        ? Number(storedMaterials[itemId]) > 0
        : getStorageInventoryCount(itemId) > 0);
}

function createBuildingStorageIcon(itemId) {
    const icon = document.createElement('span');
    icon.className = 'inventory-item-icon';
    icon.appendChild(createInventoryIcon(itemId));
    return icon;
}

function setBuildingStorageItemPickerOpen(open) {
    const picker = document.getElementById('building-storage-item-picker');
    const button = document.getElementById('building-storage-item-button');
    if (!picker || !button) return;
    if (open) {
        picker.hidden = false;
        if (typeof picker.showPopover === 'function' && !picker.matches(':popover-open')) picker.showPopover();
        const buttonRect = button.getBoundingClientRect();
        const width = Math.min(280, window.innerWidth - 32);
        const belowSpace = window.innerHeight - buttonRect.bottom - 8;
        const aboveSpace = buttonRect.top - 8;
        const popupHeight = picker.scrollHeight;
        const showAbove = popupHeight > belowSpace && aboveSpace > belowSpace;
        const availableHeight = Math.max(0, showAbove ? aboveSpace : belowSpace);
        const left = Math.max(16, Math.min(buttonRect.left, window.innerWidth - width - 16));
        const top = showAbove
            ? Math.max(8, buttonRect.top - Math.min(popupHeight, availableHeight) - 4)
            : Math.min(buttonRect.bottom + 4, window.innerHeight - Math.min(popupHeight, availableHeight) - 8);
        picker.style.width = `${width}px`;
        picker.style.maxHeight = `${availableHeight}px`;
        picker.style.overflowY = 'auto';
        picker.style.left = `${left}px`;
        picker.style.top = `${Math.max(8, top)}px`;
    } else {
        if (picker.matches(':popover-open')) picker.hidePopover();
        picker.hidden = true;
    }
    button.setAttribute('aria-expanded', String(open));
}

function renderBuildingStorageItemPicker() {
    const itemSelect = document.getElementById('building-storage-item');
    const selectedItemId = itemSelect.value;
    const placed = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
    const candidates = getStorageTransferCandidates(placed);
    const button = document.getElementById('building-storage-item-button');
    const selectedName = candidates.some(([id]) => id === selectedItemId)
        ? getCraftingItemName(selectedItemId)
        : '';
    const selectedNameElement = document.getElementById('building-storage-item-name');
    const selectedIcon = document.getElementById('building-storage-item-icon');
    selectedIcon.replaceChildren();
    if (selectedName) selectedIcon.appendChild(createBuildingStorageIcon(selectedItemId));
    selectedNameElement.textContent = selectedName || '資材を選択';
    selectedNameElement.style.fontSize = '';
    button.disabled = candidates.length === 0;
    button.setAttribute('aria-label', selectedName ? `資材: ${selectedName}。タップして変更` : '選択できる資材がありません');
    const textCanvas = document.createElement('canvas');
    const context = textCanvas.getContext('2d');
    if (context) {
        const baseSize = Number.parseFloat(getComputedStyle(selectedNameElement).fontSize);
        const availableWidth = selectedNameElement.clientWidth;
        context.font = getComputedStyle(selectedNameElement).font;
        const textWidth = context.measureText(selectedName).width;
        if (availableWidth > 0 && textWidth > availableWidth) {
            selectedNameElement.style.fontSize = `${Math.max(7, baseSize * availableWidth / textWidth)}px`;
        }
    }

    const search = normalizeInventorySearch(document.getElementById('building-storage-item-search').value);
    const itemList = document.getElementById('building-storage-item-list');
    const options = candidates.filter(([itemId, name]) =>
        !search || normalizeInventorySearch(`${name} ${itemId}`).includes(search));
    const items = options.map(([itemId, name]) => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'building-storage-item-option';
        option.dataset.itemId = itemId;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(itemId === selectedItemId));
        if (itemId === selectedItemId) option.classList.add('is-selected');
        option.appendChild(createBuildingStorageIcon(itemId));
        const itemName = document.createElement('span');
        itemName.className = 'building-storage-item-option-name';
        itemName.textContent = name;
        const quantity = document.createElement('span');
        quantity.className = 'building-storage-item-option-count';
        const itemCount = selectedStorageStack
            ? getStorageMaterialCount(placed, itemId)
            : getStorageInventoryCount(itemId);
        quantity.textContent = formatInventoryCount(itemId, itemCount);
        option.append(itemName, quantity);
        return option;
    });
    itemList.replaceChildren(...items);
    if (!items.length) {
        const empty = document.createElement('span');
        empty.className = 'building-storage-item-empty';
        empty.textContent = candidates.length ? '該当する資材はありません' : '移動できる資材はありません';
        itemList.appendChild(empty);
    }
}

function renderBuildingStorage(placed, definition) {
    const section = document.getElementById('building-storage-controls');
    const itemSelect = document.getElementById('building-storage-item');
    if (!section || !itemSelect) return;
    const capacity = Number(definition.storageCapacity) || 0;
    section.hidden = capacity <= 0;
    if (capacity <= 0) return;
    if (!isRecord(placed.storedMaterials)) placed.storedMaterials = {};
    if (selectedStorageStack && !placed.storedMaterials[selectedStorageStack.itemId]) selectedStorageStack = null;
    const transferButton = document.getElementById('building-storage-transfer-button');
    const amountDisplay = document.getElementById('building-storage-amount-display');
    const transferDirection = selectedStorageStack ? 'withdraw' : 'deposit';
    transferButton.dataset.direction = transferDirection;
    transferButton.textContent = transferDirection === 'withdraw' ? '取り出す' : '預ける';
    transferButton.setAttribute('aria-label', transferDirection === 'withdraw' ? '選択した資材を取り出す' : '選択した資材を預ける');
    const currentItemId = itemSelect.value;
    const candidates = getStorageTransferCandidates(placed);
    itemSelect.replaceChildren(...candidates.map(([id, name]) => new Option(name, id)));
    itemSelect.value = candidates.some(([id]) => id === currentItemId) ? currentItemId : candidates[0]?.[0] || '';
    renderBuildingStorageItemPicker();
    const usedSlots = getStorageUsedSlots(placed);
    const selectedItemId = itemSelect.value;
    const selectedItemCount = getStorageMaterialCount(placed, selectedItemId);
    const amountMaximum = getBuildingStorageTransferMaximum(placed, definition, selectedItemId, transferDirection);
    setBuildingStorageAmount(amountMaximum);
    document.getElementById('building-storage-status').textContent =
        `保管枠 ${usedSlots} / ${capacity}　${getCraftingItemName(selectedItemId)} ${formatInventoryCount(selectedItemId, selectedItemCount)}`;
    transferButton.disabled = candidates.length === 0 || amountMaximum < 1;
    amountDisplay.disabled = candidates.length === 0 || amountMaximum < 1;
    const grid = document.getElementById('building-storage-grid');
    const cells = [];
    Object.entries(placed.storedMaterials)
        .filter(([, amount]) => Number.isFinite(Number(amount)) && Number(amount) > 0)
        .forEach(([storedItemId, rawAmount]) => {
            let remaining = Math.floor(Number(rawAmount));
            let stackIndex = 0;
            while (remaining > 0) {
                const stackSize = Math.min(99, remaining);
                const cell = document.createElement('button');
                cell.type = 'button';
                cell.className = 'building-storage-cell';
                cell.dataset.itemId = storedItemId;
                cell.dataset.stackCount = String(stackSize);
                cell.dataset.stackIndex = String(stackIndex);
                cell.setAttribute('aria-pressed', String(
                    selectedStorageStack?.itemId === storedItemId && selectedStorageStack.stackIndex === stackIndex
                ));
                cell.setAttribute('aria-label', `${getCraftingItemName(storedItemId)} ${stackSize}個`);
                cell.title = `${getCraftingItemName(storedItemId)} ${stackSize}個`;
                if (selectedStorageStack?.itemId === storedItemId && selectedStorageStack.stackIndex === stackIndex) {
                    cell.classList.add('is-selected');
                }
                cell.appendChild(createBuildingStorageIcon(storedItemId));
                const count = document.createElement('span');
                count.className = 'building-storage-cell-count';
                count.textContent = String(stackSize);
                cell.appendChild(count);
                cells.push(cell);
                remaining -= stackSize;
                stackIndex++;
            }
        });
    grid.replaceChildren(...cells);
}

function getBuildingStorageTransferMaximum(placed, definition, itemId, direction) {
    if (!CRAFTING_ITEM_BY_ID.has(itemId)) return 0;
    const storedCount = Math.max(0, Math.floor(Number(getStorageMaterialCount(placed, itemId)) || 0));
    if (direction === 'withdraw') return storedCount;
    const freeSlots = Math.max(0, definition.storageCapacity - getStorageUsedSlots(placed));
    const stackSpace = Math.ceil(storedCount / 99) * 99 - storedCount;
    const capacityLeft = stackSpace + freeSlots * 99;
    return Math.max(0, Math.floor(Math.min(capacityLeft, getStorageInventoryCount(itemId))));
}

function setBuildingStorageAmount(maximum) {
    const display = document.getElementById('building-storage-amount-display');
    if (!display) return;
    const maxAmount = Math.max(1, Math.floor(Number(maximum)) || 0);
    display.max = String(maxAmount);
    display.value = String(maxAmount);
}

setBuildingStorageAmount(1);

function transferBuildingStorage(direction) {
    const placed = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
    const definition = BUILDING_BY_ID.get(placed?.id);
    const itemId = document.getElementById('building-storage-item')?.value;
    const amountInput = document.getElementById('building-storage-amount-display');
    const amount = Math.floor(Number(amountInput?.value));
    if (!placed || !definition?.storageCapacity || !amountInput || !CRAFTING_ITEM_BY_ID.has(itemId)
        || !(amount > 0) || amount > Number(amountInput.max)) {
        showAppNotice('資材と数量を正しく指定してください。');
        return;
    }
    if (!isRecord(placed.storedMaterials)) placed.storedMaterials = {};
    const resourceKey = { water: 'water', fog: 'fog', power: 'power', steam_power: 'steamPower' }[itemId];
    const inventoryCount = getStorageInventoryCount(itemId);
    const storedCount = Number.isFinite(getStorageMaterialCount(placed, itemId))
        ? Math.floor(getStorageMaterialCount(placed, itemId))
        : 0;
    const before = captureBuildingHistoryState();
    if (direction === 'deposit') {
        const freeSlots = Math.max(0, definition.storageCapacity - getStorageUsedSlots(placed));
        const stackSpace = Math.ceil(storedCount / 99) * 99 - storedCount;
        const capacityLeft = stackSpace + freeSlots * 99;
        const moved = Math.min(amount, capacityLeft, inventoryCount);
        if (moved < 1) {
            showAppNotice(capacityLeft < 1 ? 'ストレージに空きがありません。' : '所持資材がありません。');
            return;
        }
        placed.storedMaterials[itemId] = storedCount + moved;
        if (itemId === 'brass-stock') engineRuntimeState.brass -= moved;
        else if (resourceKey) engineRuntimeState[resourceKey] = inventoryCount - moved;
        else engineRuntimeState.materialInventory[itemId] = inventoryCount - moved;
    } else {
        if (storedCount > 0 && inventoryCount <= 0 && !canAddInventoryItems([itemId])) {
            notifyInventoryFull();
            return;
        }
        const moved = Math.min(amount, storedCount);
        if (moved < 1) {
            showAppNotice('ストレージに選択した資材がありません。');
            return;
        }
        placed.storedMaterials[itemId] = storedCount - moved;
        if (itemId === 'brass-stock') engineRuntimeState.brass += moved;
        else if (resourceKey) engineRuntimeState[resourceKey] = inventoryCount + moved;
        else engineRuntimeState.materialInventory[itemId] = inventoryCount + moved;
    }
    selectedStorageStack = null;
    recordBuildingHistory(before);
    saveBuildings();
    engineRuntimeState.saveGameData();
    engineRuntimeState.notify();
    renderBuildingStorage(placed, definition);
    showAppNotice(direction === 'deposit' ? '資材をストレージに預けました。' : '資材をストレージから取り出しました。');
}

function formatInventoryCount(itemId, count) {
    const amount = Number(count) || 0;
    const isContinuousResource = ['water', 'fog', 'power', 'steam_power'].includes(itemId);
    const value = isContinuousResource ? amount : Math.floor(amount);
    if (Math.abs(value) >= 1e3) return formatCompactCount(value);
    if (!isContinuousResource) return String(value);
    return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function normalizeInventorySearch(value) {
    return String(value || '').normalize('NFKC').toLocaleLowerCase('ja');
}

function getCraftingRecipeForBuilding(recipe, buildingId) {
    if (!recipe || buildingId !== 'boiler-forge' || recipe[4] !== '簡易炉') return recipe;
    const upgradedRecipe = recipe.slice();
    upgradedRecipe[5] = `${recipe[5]} 炉では産出数が2倍になり、製作時間が25%短縮されます。`;
    upgradedRecipe[6] = (Number(recipe[6]) || 1) * 2;
    upgradedRecipe[7] = Math.ceil((Number(recipe[7]) || 90) * 0.75);
    return upgradedRecipe;
}

function getCraftingRecipesForBuilding(buildingId) {
    return CRAFTING_RECIPES.map((recipe, index) => ({ recipe, index }))
        .filter(({ recipe }) => (CRAFTING_STATION_BUILDING_IDS[recipe[4]] || []).includes(buildingId))
        .map(({ recipe, index }) => ({ recipe: getCraftingRecipeForBuilding(recipe, buildingId), index }));
}

function supportsStationaryScrolls(building) {
    return Boolean(BUILDING_BY_ID.get(building?.id)?.supportsStationaryScrolls);
}

function canInstallScrollInBuilding(building) {
    return Boolean(building && (supportsStationaryScrolls(building)
        || requiresMovementScroll(building)
        || getCraftingRecipesForBuilding(building.id).length));
}

function createBuildingSvgIcon(buildingId) {
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(namespace, 'svg');
    const use = document.createElementNS(namespace, 'use');
    svg.classList.add('building-item-icon-svg');
    svg.setAttribute('viewBox', '0 0 96 96');
    svg.setAttribute('aria-hidden', 'true');
    if (buildingId === 'scroll-stand') {
        svg.innerHTML = '<rect x="12" y="69" width="72" height="15" rx="3" fill="#604833" stroke="#d4ad60" stroke-width="4"/><path d="M22 70V34h52v36" fill="#34473f" stroke="#b98b4e" stroke-width="5"/><path d="M30 43h36v26H30z" fill="#1e2d28" stroke="#718b7e" stroke-width="3"/><circle cx="48" cy="55" r="12" fill="#9b693c" stroke="#edcf78" stroke-width="4"/><circle cx="48" cy="55" r="4" fill="#d9bc68"/><path d="M48 39v5m0 22v5M32 55h5m22 0h5" stroke="#e6ca7a" stroke-width="4"/>';
        return svg;
    }
    const iconSprite = buildingId === 'field-automaton'
        ? 'assets/field-automaton-icon.svg?v=3#building-field-automaton'
        : `assets/building-icons.svg?v=1#building-${buildingId}`;
    use.setAttribute('href', iconSprite);
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
    const visibleBuildings = BUILDING_DEFINITIONS
        .filter(building => !search || normalizeInventorySearch(building.name).includes(search))
        .map((building, index) => {
            const requirements = getMissingBuildingRequirements(building);
            const requiresStation = isLargeBuilding(building) && building.id !== 'craft-bench';
            const stationAvailable = !requiresStation || hasConstructionStation;
            const affordable = creative || (!requirements.length
                && brass >= building.brassCost
                && getBuildingMaterialCosts(building).every(([itemId, amount]) => getCraftingItemCount(itemId) >= amount));
            return { building, index, craftable: stationAvailable && affordable };
        })
        .sort((first, second) => Number(second.craftable) - Number(first.craftable) || first.index - second.index)
        .map(({ building }) => building);
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
        const affordableCount = getMaximumBuildingKitCraftCount(building, creative);
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
        title.textContent = building.name;
        title.title = building.name;
        const category = document.createElement('small');
        category.textContent = '建築キット';
        heading.append(title, category);

        const outputBlock = document.createElement('div');
        outputBlock.className = 'crafting-recipe-output';
        const outputCaption = document.createElement('span');
        outputCaption.className = 'crafting-output-caption';
        outputCaption.textContent = `建築物 / 所持 ${formatInventoryCount(building.id, ownedCount)}`;
        outputCaption.title = outputCaption.textContent;
        const outputMain = document.createElement('div');
        outputMain.className = 'crafting-output-main';
        const icon = document.createElement('span');
        icon.className = `crafting-output-icon building-item-icon is-${building.role}`;
        icon.appendChild(createBuildingSvgIcon(building.id));
        const outputName = document.createElement('strong');
        outputName.className = 'crafting-output-name';
        outputName.textContent = building.name;
        outputName.title = building.name;
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
            : `製作可能${ownedCount ? ` / 所持 ${formatInventoryCount(building.id, ownedCount)}` : ''}`;
        cost.textContent = `建築サイズ ${building.width}×${building.height}${placementRule} / ${status}`;
        if (activeJobs.length) {
            const countdown = document.createElement('span');
            countdown.className = 'building-item-countdown';
            countdown.dataset.completesAt = String(activeJobs[0].completesAt);
            countdown.textContent = `${Math.max(0, Math.ceil((Number(activeJobs[0].completesAt) - Date.now()) / 1000))}秒`;
            cost.appendChild(countdown);
        }
        cost.title = cost.textContent;
        const quantityControl = createCraftQuantityControl(
            `${building.name}の製作数`,
            `building:${building.id}`,
            maxCraftCount,
            affordable ? 1 : 0,
            1,
            !canCraftNow
        );
        const selectedCount = Number(quantityControl.dataset.selectedCount) || 0;
        updateCraftingMaterialCounts(materials, selectedCount);
        outputCount.textContent = `×${selectedCount}`;
        const availableCount = document.createElement('span');
        availableCount.className = 'crafting-available-count';
        const craftableCount = stationAvailable ? maxCraftCount : 0;
        availableCount.textContent = `最大 ${formatInventoryCount(building.id, craftableCount)}個`;
        availableCount.title = `製作可能数: ${craftableCount}個`;
        const createButton = document.createElement('button');
        createButton.type = 'button';
        createButton.className = 'building-item-create';
        createButton.dataset.action = 'craft-building-kit';
        createButton.dataset.buildingId = building.id;
        createButton.textContent = `製作 ×${selectedCount}`;
        createButton.disabled = !stationAvailable || !affordable;
        footer.append(cost, quantityControl, availableCount, createButton);
        const reservationControls = document.createElement('div');
        reservationControls.className = 'crafting-reservation-controls';
        const reservationLabel = document.createElement('label');
        reservationLabel.className = 'crafting-reservation-quantity';
        reservationLabel.append(document.createTextNode('予約数'));
        const reservationInput = document.createElement('input');
        reservationInput.type = 'number';
        reservationInput.min = '1';
        reservationInput.max = '99';
        reservationInput.step = '1';
        reservationInput.value = '1';
        reservationInput.setAttribute('aria-label', `${building.name}の製作予約数`);
        reservationLabel.appendChild(reservationInput);
        const reservationButton = document.createElement('button');
        reservationButton.type = 'button';
        reservationButton.dataset.action = 'add-building-crafting-reservation';
        reservationButton.dataset.buildingId = building.id;
        reservationButton.textContent = '予約';
        reservationControls.append(reservationLabel, reservationButton);
        footer.appendChild(reservationControls);
        card.append(heading, outputBlock, footer, materialsBlock);
        list.appendChild(card);
    });
}

function craftBuildingKit(buildingId, requestedCount, { quiet = false } = {}) {
    const building = BUILDING_BY_ID.get(buildingId);
    if (!building || !engineRuntimeState) return false;
    const requiresStation = isLargeBuilding(building) && building.id !== 'craft-bench';
    if (requiresStation && !hasBuildingConstructionStation()) {
        if (!quiet) showAppNotice('2×2以上の建築には作業台以上の設備が必要です。');
        return false;
    }
    const missingRequirements = getMissingBuildingRequirements(building);
    if (missingRequirements.length) {
        if (!quiet) showAppNotice(`建設条件を満たしていません。必要設備: ${missingRequirements.map(id => BUILDING_BY_ID.get(id)?.name || id).join('・')}`);
        return false;
    }
    const creative = Boolean(engineRuntimeState.creativeMode);
    const materialCosts = getBuildingMaterialCosts(building);
    const maxCraftCount = getMaximumBuildingKitCraftCount(building, creative);
    const quantity = requestedCount === 'max' ? maxCraftCount : Math.floor(Number(requestedCount));
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > maxCraftCount) {
        const missingBrass = getCraftingItemCount('brass-stock') < building.brassCost;
        const missingMaterials = materialCosts
            .filter(([itemId, amount]) => getCraftingItemCount(itemId) < amount)
            .map(([itemId]) => getCraftingItemName(itemId));
        const missingCost = [...(missingBrass ? ['真鍮'] : []), ...missingMaterials].join('・');
        if (!quiet) showAppNotice(maxCraftCount > 0 ? `製作数は1〜${maxCraftCount}個で指定してください。` : `建築キットの製作に必要な${missingCost || '素材'}が足りません。`);
        return false;
    }
    if (!canAddInventoryItems(Array(quantity).fill(building.id))) {
        if (!quiet) notifyInventoryFull();
        return false;
    }
    if (!creative && getCraftingItemCount('brass-stock') < building.brassCost * quantity) {
        if (!quiet) showAppNotice('建築キットの製作に必要な真鍮が足りません。');
        return false;
    }
    if (!creative) {
        engineRuntimeState.brass = Math.max(0, Number(engineRuntimeState.brass) - building.brassCost * quantity);
        materialCosts.forEach(([itemId, amount]) => {
            engineRuntimeState.materialInventory[itemId] = Math.max(0, getCraftingItemCount(itemId) - amount * quantity);
        });
    }
    const now = Date.now();
    const batchGroupId = `building:${building.id}:${now}:${Math.random().toString(36).slice(2)}`;
    const duration = Math.max(4, building.brassCost * 4) * 1000;
    const newJobs = [];
    for (let index = 0; index < quantity; index++) {
        newJobs.push({
            jobId: `${batchGroupId}:${index + 1}`,
            batchGroupId,
            batchIndex: index + 1,
            batchCount: quantity,
            recipeKey: `building:${building.id}`,
            craftingStationId: 'construction',
            queuedAt: now,
            durationMs: duration,
            outputItem: building.id,
            outputAmount: 1,
            inputCosts: creative ? [] : [
                ['brass-stock', building.brassCost],
                ...materialCosts.map(([itemId, amount]) => [itemId, amount])
            ],
            startedAt: now,
            completesAt: now + duration
        });
    }
    engineRuntimeState.scheduleCraftingJobs(newJobs, now);
    engineRuntimeState.saveGameData();
    engineRuntimeState.notify();
    updateEngineDashboard();
    buildingRenderSignature = '';
    renderBuildingInventory();
    return true;
}

function saveBuildings() {
    if (!canPersistGameProgress()) return;
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
        materialInventory: { ...engineRuntimeState.materialInventory },
        resourceInventory: {
            water: Number(engineRuntimeState.water) || 0,
            fog: Number(engineRuntimeState.fog) || 0,
            power: Number(engineRuntimeState.power) || 0,
            steamPower: Number(engineRuntimeState.steamPower) || 0
        }
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
    const resourceDeltas = {};
    for (const resourceId of Object.keys(before.resourceInventory)) {
        const delta = after.resourceInventory[resourceId] - before.resourceInventory[resourceId];
        if (delta) resourceDeltas[resourceId] = delta;
    }
    buildingUndoHistory.push({
        changes: changedIds.map(instanceId => ({
            before: beforeById.get(instanceId) || null,
            after: afterById.get(instanceId) || null
        })),
        brassDelta: after.brass - before.brass,
        inventoryDeltas,
        resourceDeltas
    });
    invalidateAutomatonNavigation();
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
    const nextResources = new Map(Object.entries(entry.resourceDeltas).map(([resourceId, delta]) => [
        resourceId,
        (Number(engineRuntimeState[resourceId]) || 0) + delta * resourceDirection
    ]));
    if (nextBrass < 0 || [...nextInventory.values(), ...nextResources.values()].some(count => count < 0)) {
        showAppNotice('必要な素材が足りないため、この操作を戻せません。');
        return;
    }
    const addedItemIds = [...nextInventory]
        .filter(([itemId, count]) => count > 0 && (Number(engineRuntimeState.materialInventory[itemId]) || 0) <= 0)
        .map(([itemId]) => itemId);
    const resourceItems = { water: 'water', fog: 'fog', power: 'power', steamPower: 'steam_power' };
    nextResources.forEach((count, resourceId) => {
        if (count > 0 && (Number(engineRuntimeState[resourceId]) || 0) <= 0 && resourceItems[resourceId]) {
            addedItemIds.push(resourceItems[resourceId]);
        }
    });
    if (nextBrass > 0 && (Number(engineRuntimeState.brass) || 0) <= 0) addedItemIds.push('brass-stock');
    if (!canAddInventoryItems(addedItemIds)) {
        notifyInventoryFull();
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
    invalidateAutomatonNavigation();

    engineRuntimeState.brass = nextBrass;
    nextInventory.forEach((count, itemId) => {
        engineRuntimeState.materialInventory[itemId] = count;
    });
    nextResources.forEach((count, resourceId) => {
        engineRuntimeState[resourceId] = count;
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
            if (typeof placed.customName === 'string') {
                const normalizedName = placed.customName.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 32);
                if (normalizedName !== placed.customName) migrated = true;
                placed.customName = normalizedName;
                if (!placed.customName) {
                    delete placed.customName;
                    migrated = true;
                }
            } else if (placed.customName !== undefined) {
                delete placed.customName;
                migrated = true;
            }
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
                    } else if (definition.kind !== 'locomotive' && placed.vehicle.movement) {
                        placed.vehicle.movement = null;
                        migrated = true;
                    }
                }
            } else if (definition.kind === 'automaton') {
                const savedAutomaton = isRecord(placed.automaton) ? placed.automaton : {};
                placed.automaton = {
                    ...getAutomatonState(placed),
                    ...savedAutomaton,
                    origin: isRecord(savedAutomaton.origin) ? savedAutomaton.origin : { x: placed.x, y: placed.y }
                };
                if (savedAutomaton.stopReason === '再読み込み後は停止') {
                    placed.automaton.running = true;
                    placed.automaton.stopReason = '';
                    migrated = true;
                }
                if (placed.automaton.running || placed.automaton.movement) {
                    placed.automaton.movement = null;
                    placed.automaton.nextMoveAt = 0;
                    if (placed.automaton.running) placed.automaton.stopReason = '';
                    migrated = true;
                }
                if (placed.automaton.running && !hasAssignedMovementScroll(placed)) {
                    placed.automaton.running = false;
                    placed.automaton.stopReason = '動作スクロール未設定';
                    migrated = true;
                }
            } else if (definition.kind === 'station' && !isRecord(placed.stationControl)) {
                placed.stationControl = { ...STATION_CONTROL_DEFAULTS, destinations: [], conditions: [] };
                migrated = true;
            }
            return placed;
        });
        invalidateAutomatonNavigation();
        if (migrated) saveBuildings();
    } catch (error) {
        state.buildings = [];
    }
}

function createInventoryIcon(itemId) {
    if (BUILDING_BY_ID.has(itemId)) return createBuildingSvgIcon(itemId);
    if (itemId === 'crafting_reservations') return createCraftingIcon('scroll_book');
    if (CRAFTING_ITEM_BY_ID.has(itemId) || itemId === 'grain' || itemId === 'paper_scroll' || itemId === 'cloth_scroll' || itemId === 'scroll_book' || itemId === 'fog' || itemId === 'power' || itemId === 'steam_power') {
        return createCraftingIcon(itemId);
    }
    const icon = document.createElement('span');
    icon.className = 'inventory-item-icon-fallback';
    icon.textContent = '・';
    return icon;
}

function getInventoryCategory(itemId) {
    if (SCROLL_MATERIAL_BY_ITEM.has(itemId) || itemId === 'scroll_book' || itemId === 'crafting_reservations') return 'scrolls';
    if (['water', 'fog', 'power', 'steam_power'].includes(itemId)) return 'resources';
    if (BUILDING_BY_ID.has(itemId)) return 'building-kits';
    const item = CRAFTING_ITEM_BY_ID.get(itemId);
    if (!item) return 'other';
    return ({
        raw: 'raw-materials',
        processed: 'processed-materials',
        part: 'parts',
        finished: 'finished-items'
    })[item[2]] || 'other';
}

const INVENTORY_CATEGORY_LABELS = Object.freeze({
    scrolls: 'スクロール・設計図',
    resources: '共有エネルギー',
    'raw-materials': '採集素材',
    'processed-materials': '加工素材',
    parts: '部品',
    'finished-items': '完成品',
    'building-kits': '建築キット',
    other: 'その他'
});

function createInventoryItemCard(itemId) {
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
    const itemCount = document.createElement('strong');
    itemCount.className = 'inventory-item-count';
    itemCount.dataset.itemKey = itemId;
    const itemCountValue = getCraftingItemCount(itemId);
    itemCount.textContent = formatInventoryCount(itemId, itemCountValue);
    itemCount.title = String(itemCountValue);
    button.append(icon, name, itemCount);
    return button;
}

function syncInventoryItemCards(container, itemIds) {
    const existingCards = new Map([...container.children]
        .filter(child => child instanceof HTMLButtonElement && child.classList.contains('inventory-item-card'))
        .map(card => [card.dataset.itemKey, card]));
    const orderedCards = itemIds.map(itemId => {
        let card = existingCards.get(itemId);
        if (card) existingCards.delete(itemId);
        else card = createInventoryItemCard(itemId);
        return card;
    });
    existingCards.forEach(card => card.remove());
    orderedCards.forEach((card, index) => {
        if (container.children[index] !== card) container.insertBefore(card, container.children[index] || null);
    });
}

function createInventoryCategory(category) {
    const section = document.createElement('details');
    section.className = `inventory-category${category === 'scrolls' ? ' is-important' : ''}`;
    section.dataset.inventoryCategory = category;
    section.open = inventoryOpenCategories.has(category);
    const heading = document.createElement('summary');
    heading.className = 'inventory-category-heading';
    const label = document.createElement('span');
    label.textContent = INVENTORY_CATEGORY_LABELS[category];
    const count = document.createElement('strong');
    heading.append(label, count);
    const itemGrid = document.createElement('div');
    itemGrid.className = 'inventory-category-items';
    section.append(heading, itemGrid);
    return section;
}

function syncInventoryCategories(inventoryList, visibleInventoryIds) {
    const groupedInventory = new Map();
    visibleInventoryIds.forEach(itemId => {
        const category = getInventoryCategory(itemId);
        if (!groupedInventory.has(category)) groupedInventory.set(category, []);
        groupedInventory.get(category).push(itemId);
    });
    const existingSections = new Map([...inventoryList.children]
        .filter(child => child instanceof HTMLDetailsElement && child.classList.contains('inventory-category'))
        .map(section => [section.dataset.inventoryCategory, section]));
    const previousScrollTop = inventoryList.scrollTop;
    const orderedSections = [];
    Object.keys(INVENTORY_CATEGORY_LABELS).forEach(category => {
        const items = groupedInventory.get(category);
        if (!items) return;
        let section = existingSections.get(category);
        if (section) existingSections.delete(category);
        else section = createInventoryCategory(category);
        const categoryCount = section.querySelector('.inventory-category-heading strong');
        const categoryCountText = String(items.length);
        if (categoryCount.textContent !== categoryCountText) categoryCount.textContent = categoryCountText;
        syncInventoryItemCards(section.querySelector('.inventory-category-items'), items);
        orderedSections.push(section);
    });
    existingSections.forEach(section => section.remove());
    orderedSections.forEach((section, index) => {
        if (inventoryList.children[index] !== section) inventoryList.insertBefore(section, inventoryList.children[index] || null);
    });
    inventoryList.scrollTop = previousScrollTop;
}

function renderCraftingReservations() {
    const list = document.getElementById('crafting-reservation-list');
    const count = document.getElementById('crafting-reservation-count');
    if (!list || !count) return;
    const buildings = new Map(state.buildings.map(building => [building.instanceId, building]));
    let reservations = readCraftingReservations();
    const validReservations = reservations.filter(reservation => {
        if (reservation.recipeIndex === -1) return BUILDING_BY_ID.has(reservation.buildingId);
        const building = buildings.get(reservation.buildingInstanceId);
        const recipe = CRAFTING_RECIPES[reservation.recipeIndex];
        if (!reservation.buildingInstanceId) return recipe?.[4] === HANDCRAFT_STATION;
        return Boolean(building && recipe?.[4] !== HANDCRAFT_STATION
            && getCraftingRecipesForBuilding(building.id).some(entry => entry.index === reservation.recipeIndex));
    });
    if (validReservations.length !== reservations.length) {
        reservations = validReservations;
        saveCraftingReservations(reservations);
    }
    count.textContent = String(reservations.length);
    const itemCount = document.querySelector('.inventory-item-count[data-item-key="crafting_reservations"]');
    if (itemCount) itemCount.textContent = String(reservations.length);
    const signature = JSON.stringify(reservations.map(reservation => [
        reservation.id, reservation.buildingInstanceId, reservation.recipeIndex, reservation.buildingId,
        reservation.quantity, reservation.queuedAt,
        buildings.get(reservation.buildingInstanceId)?.customName || ''
    ]));
    if (signature === craftingReservationRenderSignature) return;
    craftingReservationRenderSignature = signature;
    list.replaceChildren();
    if (!reservations.length) {
        const empty = document.createElement('p');
        empty.className = 'crafting-reservation-empty';
        empty.textContent = '製作予約はありません';
        list.appendChild(empty);
        return;
    }
    reservations.forEach((reservation, index) => {
        if (reservation.recipeIndex === -1) {
            const building = BUILDING_BY_ID.get(reservation.buildingId);
            const row = document.createElement('article');
            row.className = 'crafting-reservation-row';
            row.dataset.reservationId = reservation.id;
            const grip = document.createElement('button');
            grip.type = 'button';
            grip.className = 'crafting-reservation-grip';
            grip.dataset.reservationHandle = reservation.id;
            grip.setAttribute('aria-label', `${building.name}の製作予約の優先度。ドラッグまたは上下矢印で並べ替え`);
            grip.title = 'つまんで優先順を変更';
            grip.textContent = '⋮⋮';
            const copy = document.createElement('div');
            copy.className = 'crafting-reservation-copy';
            const title = document.createElement('strong');
            title.textContent = building.name;
            const detail = document.createElement('span');
            detail.textContent = `建築キット / ${reservation.quantity}個`;
            copy.append(title, detail);
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'crafting-reservation-delete';
            remove.dataset.action = 'delete-crafting-reservation';
            remove.dataset.reservationId = reservation.id;
            remove.setAttribute('aria-label', `${building.name}の製作予約を削除`);
            remove.title = '予約を削除';
            remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m4 3v7m4-7v7" /></svg>';
            row.append(grip, copy, remove);
            list.appendChild(row);
            return;
        }
        const building = buildings.get(reservation.buildingInstanceId);
        const baseRecipe = CRAFTING_RECIPES[reservation.recipeIndex];
        const recipe = getCraftingRecipeForBuilding(baseRecipe, building?.id);
        if (!recipe) return;
        const row = document.createElement('article');
        row.className = 'crafting-reservation-row';
        row.dataset.reservationId = reservation.id;
        const grip = document.createElement('button');
        grip.type = 'button';
        grip.className = 'crafting-reservation-grip';
        grip.dataset.reservationHandle = reservation.id;
        grip.setAttribute('aria-label', `${getCraftingRecipeDisplayName(recipe[1])}の優先度。ドラッグまたは上下矢印で並べ替え`);
        grip.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown');
        grip.title = 'つまんで優先順を変更';
        grip.textContent = '⋮⋮';
        const copy = document.createElement('div');
        copy.className = 'crafting-reservation-copy';
        const title = document.createElement('strong');
        title.textContent = getCraftingRecipeDisplayName(recipe[1]);
        const detail = document.createElement('span');
        const buildingDefinition = BUILDING_BY_ID.get(building?.id);
        const buildingName = building?.customName || buildingDefinition?.name || '手作業';
        const outputAmount = Math.max(1, Number(recipe[6]) || 1) * reservation.quantity;
        detail.textContent = `${buildingName} / ${reservation.quantity}回分・${outputAmount}個`;
        copy.append(title, detail);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'crafting-reservation-delete';
        remove.dataset.action = 'delete-crafting-reservation';
        remove.dataset.reservationId = reservation.id;
        remove.setAttribute('aria-label', `${getCraftingRecipeDisplayName(recipe[1])}の予約を削除`);
        remove.title = '予約を削除';
        remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m4 3v7m4-7v7" /></svg>';
        row.append(grip, copy, remove);
        list.appendChild(row);
    });
}

function openCraftingReservations() {
    const modal = document.getElementById('crafting-reservation-modal');
    if (!modal) return;
    renderCraftingReservations();
    modal.hidden = false;
}

function closeCraftingReservations() {
    const modal = document.getElementById('crafting-reservation-modal');
    if (modal) modal.hidden = true;
}

function addCraftingReservation(recipeIndex, buildingInstanceId, quantity) {
    const building = state.buildings.find(item => item.instanceId === buildingInstanceId);
    const baseRecipe = CRAFTING_RECIPES[recipeIndex];
    const recipe = getCraftingRecipeForBuilding(baseRecipe, building?.id);
    const isHandcraft = baseRecipe?.[4] === HANDCRAFT_STATION;
    if ((!isHandcraft && (!building || !recipe)) || (isHandcraft && buildingInstanceId)) return false;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return false;
    const reservationId = globalThis.crypto?.randomUUID?.()
        || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const reservations = readCraftingReservations();
    reservations.push({ id: reservationId, buildingInstanceId: buildingInstanceId || '', recipeIndex, quantity, queuedAt: Date.now() });
    saveCraftingReservations(reservations);
    craftingReservationRenderSignature = '';
    renderCraftingReservations();
    showAppNotice(`${getCraftingRecipeDisplayName(recipe[1])}を${quantity}回分予約しました。`);
    processCraftingReservations(Date.now(), true);
    return true;
}

function addBuildingCraftingReservation(buildingId, quantity) {
    if (!BUILDING_BY_ID.has(buildingId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) return false;
    const reservationId = globalThis.crypto?.randomUUID?.()
        || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const reservations = readCraftingReservations();
    reservations.push({ id: reservationId, buildingInstanceId: '', recipeIndex: -1, buildingId, quantity, queuedAt: Date.now() });
    saveCraftingReservations(reservations);
    craftingReservationRenderSignature = '';
    renderCraftingReservations();
    showAppNotice(`${BUILDING_BY_ID.get(buildingId).name}を${quantity}個予約しました。`);
    processCraftingReservations(Date.now(), true);
    return true;
}

function removeCraftingReservation(reservationId) {
    const reservations = readCraftingReservations();
    const remaining = reservations.filter(reservation => reservation.id !== reservationId);
    if (remaining.length === reservations.length) return false;
    saveCraftingReservations(remaining);
    craftingReservationRenderSignature = '';
    renderCraftingReservations();
    return true;
}

function moveCraftingReservation(reservationId, targetIndex) {
    const reservations = readCraftingReservations();
    const sourceIndex = reservations.findIndex(reservation => reservation.id === reservationId);
    if (sourceIndex < 0 || !Number.isInteger(targetIndex)) return false;
    const destination = Math.max(0, Math.min(reservations.length - 1, targetIndex));
    if (sourceIndex === destination) return false;
    const [reservation] = reservations.splice(sourceIndex, 1);
    reservations.splice(destination, 0, reservation);
    saveCraftingReservations(reservations);
    craftingReservationRenderSignature = '';
    renderCraftingReservations();
    return true;
}

function removeCraftingReservationsForBuilding(buildingInstanceId) {
    const reservations = readCraftingReservations();
    const remaining = reservations.filter(reservation => reservation.buildingInstanceId !== buildingInstanceId);
    if (remaining.length === reservations.length) return false;
    saveCraftingReservations(remaining);
    craftingReservationRenderSignature = '';
    renderCraftingReservations();
    return true;
}

function processCraftingReservations(now = Date.now(), force = false) {
    if (!craftingWorldReady || !force && now - lastCraftingReservationCheckAt < 250) return;
    lastCraftingReservationCheckAt = now;
    const reservations = readCraftingReservations();
    let changed = false;
    for (let index = reservations.length - 1; index >= 0; index--) {
        const reservation = reservations[index];
        if (reservation.recipeIndex === -1) {
            const building = BUILDING_BY_ID.get(reservation.buildingId);
            if (!building) {
                reservations.splice(index, 1);
                changed = true;
                continue;
            }
            const missingRequirements = getMissingBuildingRequirements(building);
            const requiresStation = isLargeBuilding(building) && building.id !== 'craft-bench';
            if (requiresStation && !hasBuildingConstructionStation() || missingRequirements.length) continue;
            const maxCraftCount = getMaximumBuildingKitCraftCount(building, Boolean(engineRuntimeState.creativeMode));
            const startQuantity = Math.min(reservation.quantity, maxCraftCount);
            if (startQuantity < 1 || !craftBuildingKit(building.id, startQuantity, { quiet: true })) continue;
            reservation.quantity -= startQuantity;
            changed = true;
            if (reservation.quantity < 1) {
                reservations.splice(index, 1);
                index--;
            }
            continue;
        }
        const building = state.buildings.find(item => item.instanceId === reservation.buildingInstanceId);
        const baseRecipe = CRAFTING_RECIPES[reservation.recipeIndex];
        const validHandcraft = !reservation.buildingInstanceId && baseRecipe?.[4] === HANDCRAFT_STATION;
        if (!baseRecipe || (!validHandcraft && (!building || !getCraftingRecipeForBuilding(baseRecipe, building.id)))) {
            reservations.splice(index, 1);
            changed = true;
        }
    }
    const runningScrollIds = new Set(getActiveScrollIds());
    for (let index = 0; index < reservations.length; index++) {
        const reservation = reservations[index];
        const building = state.buildings.find(item => item.instanceId === reservation.buildingInstanceId);
        const recipe = getCraftingRecipeForBuilding(CRAFTING_RECIPES[reservation.recipeIndex], building?.id);
        const isHandcraft = !reservation.buildingInstanceId && recipe?.[4] === HANDCRAFT_STATION;
        if (!recipe || (!isHandcraft && (!building || !hasAssignedCraftingScroll(building)
            || !isBuildingScrollRunning(building, runningScrollIds)
            || !engineRuntimeState.creativeMode && Number(engineRuntimeState.power) <= 0))) continue;
        let startQuantity = Math.min(reservation.quantity, getMaximumCraftCount(recipe[2]));
        const outputMultiplier = Math.max(1, Number(recipe[6]) || 1);
        while (startQuantity > 0 && !canAddInventoryItems(Array(startQuantity * outputMultiplier).fill(recipe[3]))) startQuantity--;
        if (startQuantity < 1 || !craftRecipe(reservation.recipeIndex, building?.instanceId || '', startQuantity, { quiet: true })) continue;
        reservation.quantity -= startQuantity;
        changed = true;
        if (reservation.quantity < 1) {
            reservations.splice(index, 1);
            index--;
        }
    }
    if (changed) {
        saveCraftingReservations(reservations);
        craftingReservationRenderSignature = '';
        renderCraftingReservations();
    }
}

function renderCellMaterials() {
    if (!engineRuntimeState) return;
    renderCraftingReservations();
    renderBuildingInventory();
    const capacityStatus = document.getElementById('inventory-capacity-status');
    if (capacityStatus) {
        capacityStatus.textContent = `所持枠 ${engineRuntimeState.getInventorySlotCount()} / ${MATERIAL_INVENTORY_SLOT_LIMIT}`;
    }
    const inventoryList = document.getElementById('inventory-item-list');
    const inventoryIds = new Set(Object.entries(engineRuntimeState.materialInventory || {})
        .filter(([, count]) => Number(count) > 0)
        .filter(([itemId]) => !DEFERRED_CRAFTING_ITEM_IDS.has(itemId))
        .map(([item]) => item));
    if (engineRuntimeState.brass > 0) inventoryIds.add('brass-stock');
    ['water', 'fog', 'power', 'steam_power'].forEach(itemId => {
        if (getCraftingItemCount(itemId) > 0) inventoryIds.add(itemId);
    });
    inventoryIds.add('crafting_reservations');
    const orderedIds = [
        ...CRAFTING_ITEMS.map(([id]) => id).filter(id => inventoryIds.has(id)),
        ...[...inventoryIds].filter(id => !CRAFTING_ITEM_BY_ID.has(id))
    ];
    const inventorySearch = normalizeInventorySearch(document.getElementById('inventory-item-search')?.value);
    const visibleInventoryIds = orderedIds.filter(id => !inventorySearch || normalizeInventorySearch(getCraftingItemName(id)).includes(inventorySearch));
    if (inventoryList) {
        const mode = inventorySearch
            ? visibleInventoryIds.length ? 'search-results' : 'empty-search'
            : visibleInventoryIds.length ? 'categories' : 'empty';
        if (inventoryList.dataset.renderMode !== mode) {
            inventoryList.replaceChildren();
            inventoryList.dataset.renderMode = mode;
        }
        if (mode === 'search-results') {
            let results = inventoryList.querySelector('.inventory-search-results');
            if (!results) {
                results = document.createElement('section');
                results.className = 'inventory-search-results';
                const heading = document.createElement('h3');
                const itemGrid = document.createElement('div');
                itemGrid.className = 'inventory-category-items';
                results.append(heading, itemGrid);
                inventoryList.appendChild(results);
            }
            const heading = results.querySelector('h3');
            const headingText = `検索結果（${visibleInventoryIds.length}件）`;
            if (heading.textContent !== headingText) heading.textContent = headingText;
            syncInventoryItemCards(results.querySelector('.inventory-category-items'), visibleInventoryIds);
        } else if (mode === 'categories') {
            syncInventoryCategories(inventoryList, visibleInventoryIds);
        } else {
            let empty = inventoryList.querySelector('.inventory-empty');
            if (!empty) {
                empty = document.createElement('span');
                empty.className = 'inventory-empty';
                inventoryList.appendChild(empty);
            }
            const emptyText = inventorySearch ? '該当する所持品はありません' : '所持品はありません';
            if (empty.textContent !== emptyText) empty.textContent = emptyText;
        }
    }
    if (inventoryList) {
        inventoryList.querySelectorAll('.inventory-item-count[data-item-key]').forEach(countElement => {
            const itemId = countElement.dataset.itemKey;
            const count = getCraftingItemCount(itemId);
            const countText = formatInventoryCount(itemId, count);
            if (countElement.textContent !== countText) countElement.textContent = countText;
            if (countElement.title !== String(count)) countElement.title = String(count);
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
    const craftingSignature = `${Boolean(engineRuntimeState.creativeMode)}:${selectedFamily}:${recipeSearch}:${jobSignature}:${visibleRecipes.map(({ index }) => index).join(',')}`;
    if (craftingSignature === craftingRenderSignature) {
        visibleRecipes.forEach(({ recipe, index }) => {
            const card = recipeList.querySelector(`.crafting-recipe-card[data-recipe-index="${index}"]`);
            if (card) updateCraftingRecipeCard(card, recipe, index, now);
        });
        return;
    }
    craftingRenderSignature = craftingSignature;
    if (!visibleRecipes.length) {
        if (!recipeList.querySelector('.inventory-empty')) {
            recipeList.replaceChildren();
            const empty = document.createElement('p');
            empty.className = 'inventory-empty';
            recipeList.appendChild(empty);
        }
        recipeList.querySelector('.inventory-empty').textContent = recipeSearch || selectedFamily !== 'all'
            ? '条件に一致する手作業の加工・合成レシピはありません'
            : '手作業で作れる加工・合成レシピはありません';
        return;
    }
    const previousScrollTop = recipeList.scrollTop;
    const existingCards = new Map([...recipeList.querySelectorAll('.crafting-recipe-card[data-recipe-index]')]
        .map(card => [Number(card.dataset.recipeIndex), card]));
    const orderedCards = [];
    recipeList.querySelector('.inventory-empty')?.remove();
    visibleRecipes.forEach(({ recipe, index }) => {
        let card = existingCards.get(index);
        if (card) existingCards.delete(index);
        else card = createCraftingRecipeCard(recipe, index, now);
        updateCraftingRecipeCard(card, recipe, index, now);
        orderedCards.push(card);
    });
    existingCards.forEach(card => card.remove());
    orderedCards.forEach((card, index) => {
        if (recipeList.children[index] !== card) recipeList.insertBefore(card, recipeList.children[index] || null);
    });
    recipeList.scrollTop = previousScrollTop;
}

function createCraftingRecipeCard(recipe, index, now, buildingInstanceId = '') {
    const [family, title, inputs, output, station, note, batch = 1, duration = 0] = recipe;
    const recipeKey = `${family}:${title}`;
    const activeJobs = (engineRuntimeState.craftingJobs || []).filter(job => job.recipeKey === recipeKey);
    const maxCraftCount = getMaximumCraftCount(inputs);
    const defaultCraftCount = maxCraftCount > 0 ? 1 : 0;
    const card = document.createElement('article');
    card.className = `crafting-recipe-card${maxCraftCount > 0 ? '' : ' is-unavailable'}`;
    card.dataset.recipeIndex = String(index);
    const heading = document.createElement('div');
    heading.className = 'crafting-recipe-title';
    const titleText = document.createElement('strong');
    titleText.textContent = title === '木材を板に挽く' ? '製材板に加工' : getCraftingRecipeDisplayName(title);
    titleText.title = titleText.textContent;
    const groupText = document.createElement('small');
    groupText.textContent = family;
    heading.append(titleText, groupText);
    const outputBlock = document.createElement('div');
    outputBlock.className = 'crafting-recipe-output';
    const outputCaption = document.createElement('span');
    outputCaption.className = 'crafting-output-caption';
    outputCaption.textContent = `生成物 / 所持 ${formatInventoryCount(output, getCraftingItemCount(output))}`;
    outputCaption.title = outputCaption.textContent;
    const outputMain = document.createElement('div');
    outputMain.className = 'crafting-output-main';
    const outputIcon = document.createElement('span');
    outputIcon.className = 'crafting-output-icon';
    outputIcon.appendChild(createInventoryIcon(output));
    const outputName = document.createElement('strong');
    outputName.className = 'crafting-output-name';
    outputName.textContent = getCraftingItemName(output);
    outputName.title = outputName.textContent;
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
    stationLabel.className = 'crafting-station-label';
    stationLabel.textContent = activeJobs.length
        ? `${station} / 進行中 ${activeJobs.length}回`
        : `${station} / ${Math.max(1, Math.round(duration / CRAFTING_RATE_MULTIPLIER))}秒`;
    if (activeJobs.length) {
        const countdown = document.createElement('span');
        countdown.className = 'crafting-countdown';
        const completesAt = String(activeJobs[0].completesAt);
        if (countdown.dataset.completesAt !== completesAt) countdown.dataset.completesAt = completesAt;
        const countdownText = `${Math.max(0, Math.ceil((Number(activeJobs[0].completesAt) - now) / 1000))}秒`;
        if (countdown.textContent !== countdownText) countdown.textContent = countdownText;
        stationLabel.appendChild(countdown);
    }
    stationLabel.title = stationLabel.textContent;
    const quantityControl = createCraftQuantityControl(
        `${getCraftingItemName(output)}の製作数`,
        `recipe:${recipeKey}:${buildingInstanceId || 'handcraft'}`,
        maxCraftCount,
        defaultCraftCount,
        batch,
        maxCraftCount === 0
    );
    const selectedCount = Number(quantityControl.dataset.selectedCount) || 0;
    updateCraftingMaterialCounts(materialsList, selectedCount);
    outputCount.textContent = `×${batch * selectedCount}`;
    const availableCount = document.createElement('span');
    availableCount.className = 'crafting-available-count';
    const craftableOutputCount = batch * maxCraftCount;
    availableCount.textContent = `最大 ${formatInventoryCount(output, craftableOutputCount)}個`;
    availableCount.title = `製作可能数: ${craftableOutputCount}個`;
    const craftButton = document.createElement('button');
    craftButton.type = 'button';
    craftButton.dataset.action = 'craft-recipe';
    craftButton.dataset.recipeIndex = String(index);
    if (buildingInstanceId) craftButton.dataset.buildingInstanceId = buildingInstanceId;
    craftButton.textContent = `製作 ×${batch * selectedCount}`;
    craftButton.disabled = maxCraftCount === 0;
    footer.append(stationLabel, quantityControl, availableCount, craftButton);
    if (buildingInstanceId || station === HANDCRAFT_STATION) {
        const reservationControls = document.createElement('div');
        reservationControls.className = 'crafting-reservation-controls';
        const reservationLabel = document.createElement('label');
        reservationLabel.className = 'crafting-reservation-quantity';
        reservationLabel.append(document.createTextNode('予約数'));
        const reservationInput = document.createElement('input');
        reservationInput.type = 'number';
        reservationInput.min = '1';
        reservationInput.max = '99';
        reservationInput.step = '1';
        reservationInput.value = '1';
        reservationInput.setAttribute('aria-label', `${getCraftingItemName(output)}の予約数`);
        reservationLabel.appendChild(reservationInput);
        const reservationButton = document.createElement('button');
        reservationButton.type = 'button';
        reservationButton.dataset.action = 'add-crafting-reservation';
        reservationButton.dataset.recipeIndex = String(index);
        if (buildingInstanceId) reservationButton.dataset.buildingInstanceId = buildingInstanceId;
        reservationButton.textContent = '予約';
        reservationControls.append(reservationLabel, reservationButton);
        footer.appendChild(reservationControls);
    }
    const noteElement = document.createElement('p');
    noteElement.className = 'crafting-recipe-note';
    noteElement.textContent = note;
    card.append(heading, outputBlock, footer, materialsBlock, noteElement);
    return card;
}

function updateCraftingRecipeCard(card, recipe, index, now) {
    const [family, title, inputs, output, station, , batch = 1, duration = 0] = recipe;
    const recipeKey = `${family}:${title}`;
    const activeJobs = (engineRuntimeState.craftingJobs || []).filter(job => job.recipeKey === recipeKey);
    const maxCraftCount = getMaximumCraftCount(inputs);
    const quantityControl = card.querySelector('.crafting-quantity-control');
    refreshCraftQuantityControl(quantityControl, maxCraftCount);
    const selectedCount = Number(quantityControl.dataset.selectedCount) || 0;
    const outputCaption = card.querySelector('.crafting-output-caption');
    const outputCaptionText = `生成物 / 所持 ${formatInventoryCount(output, getCraftingItemCount(output))}`;
    if (outputCaption.textContent !== outputCaptionText) outputCaption.textContent = outputCaptionText;
    if (outputCaption.title !== outputCaptionText) outputCaption.title = outputCaptionText;
    const outputCount = card.querySelector('.crafting-output-count');
    const outputCountText = `×${batch * selectedCount}`;
    if (outputCount.textContent !== outputCountText) outputCount.textContent = outputCountText;
    const availableCount = card.querySelector('.crafting-available-count');
    const availableOutputCount = batch * maxCraftCount;
    const availableText = `最大 ${formatInventoryCount(output, availableOutputCount)}個`;
    if (availableCount.textContent !== availableText) availableCount.textContent = availableText;
    const availableTitle = `製作可能数: ${availableOutputCount}個`;
    if (availableCount.title !== availableTitle) availableCount.title = availableTitle;
    const craftButton = card.querySelector('[data-action="craft-recipe"]');
    if (craftButton.dataset.recipeIndex !== String(index)) craftButton.dataset.recipeIndex = String(index);
    if (craftButton.disabled !== (maxCraftCount === 0)) craftButton.disabled = maxCraftCount === 0;
    const craftButtonText = `製作 ×${batch * selectedCount}`;
    if (craftButton.textContent !== craftButtonText) craftButton.textContent = craftButtonText;
    card.classList.toggle('is-unavailable', maxCraftCount === 0);
    updateCraftingMaterialCounts(card, selectedCount);
    const stationLabel = card.querySelector('.crafting-recipe-footer > .crafting-station-label');
    if (stationLabel) {
        const stationText = activeJobs.length
            ? `${station} / 進行中 ${activeJobs.length}回`
            : `${station} / ${Math.max(1, Math.round(duration / CRAFTING_RATE_MULTIPLIER))}秒`;
        const labelNode = stationLabel.firstChild;
        if (labelNode?.nodeType === Node.TEXT_NODE) {
            if (labelNode.nodeValue !== stationText) labelNode.nodeValue = stationText;
        }
        else stationLabel.prepend(document.createTextNode(stationText));
        if (stationLabel.title !== stationText) stationLabel.title = stationText;
        let countdown = stationLabel.querySelector('.crafting-countdown');
        if (activeJobs.length) {
            if (!countdown) {
                countdown = document.createElement('span');
                countdown.className = 'crafting-countdown';
                stationLabel.appendChild(countdown);
            }
            const completesAt = String(activeJobs[0].completesAt);
            if (countdown.dataset.completesAt !== completesAt) countdown.dataset.completesAt = completesAt;
            const countdownText = `${Math.max(0, Math.ceil((Number(activeJobs[0].completesAt) - now) / 1000))}秒`;
            if (countdown.textContent !== countdownText) countdown.textContent = countdownText;
        } else {
            countdown?.remove();
        }
    }
}

function refreshCraftQuantityControl(control, maxCount) {
    if (!control) return;
    const toggle = control.querySelector('.crafting-quantity-toggle');
    const selectionKey = toggle.dataset.selectionKey;
    const rememberedSelection = craftingQuantitySelections.get(selectionKey);
    const selectedCount = maxCount > 0
        ? rememberedSelection === 'max'
            ? maxCount
            : Math.min(maxCount, Math.max(1, rememberedSelection || 1))
        : 0;
    if (control.dataset.selectedCount !== String(selectedCount)) control.dataset.selectedCount = String(selectedCount);
    if (maxCount > 0 && rememberedSelection !== 'max') craftingQuantitySelections.set(selectionKey, selectedCount);
    const options = maxCount > 0
        ? [{ count: 1, label: '1' }, { count: 5, label: '5' }, { count: 10, label: '10' }]
            .filter(option => option.count <= maxCount)
        : [{ count: 0, label: '0' }];
    if (maxCount > 0 && selectedCount > 0 && !options.some(option => option.count === selectedCount)) {
        options.push({ count: selectedCount, label: String(selectedCount) });
    }
    if (maxCount > 0 && !options.some(option => option.count === maxCount)) {
        options.push({ count: maxCount, label: '最大' });
    }
    const existingButtons = new Map([...toggle.children].map(button => [Number(button.dataset.quantity), button]));
    const orderedButtons = options.map(option => {
        let button = existingButtons.get(option.count);
        if (button) existingButtons.delete(option.count);
        else {
            button = document.createElement('button');
            button.type = 'button';
            button.className = 'crafting-quantity-option';
            button.dataset.action = 'select-craft-quantity';
            button.dataset.quantity = String(option.count);
        }
        button.dataset.isMaximum = String(option.count === maxCount);
        if (button.textContent !== option.label) button.textContent = option.label;
        const ariaLabel = option.label === '最大' ? `最大 ${maxCount}個` : `${option.count}個`;
        if (button.getAttribute('aria-label') !== ariaLabel) button.setAttribute('aria-label', ariaLabel);
        const pressed = String(option.count === selectedCount);
        if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
        if (button.disabled !== (maxCount === 0)) button.disabled = maxCount === 0;
        return button;
    });
    existingButtons.forEach(button => button.remove());
    orderedButtons.forEach((button, index) => {
        if (toggle.children[index] !== button) toggle.insertBefore(button, toggle.children[index] || null);
    });
}

function createCraftingChip(itemId, amount) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.dataset.action = 'show-recipe-detail';
    chip.dataset.itemKey = itemId;
    const available = getCraftingItemCount(itemId);
    chip.className = `crafting-item-chip${available < amount ? ' is-missing' : ''}`;
    chip.setAttribute('aria-label', `${getCraftingItemName(itemId)}: 所持 ${formatInventoryCount(itemId, available)} / 必要 ${formatInventoryCount(itemId, amount)}`);
    const icon = document.createElement('span');
    icon.className = 'crafting-item-icon';
    icon.appendChild(createInventoryIcon(itemId));
    const details = document.createElement('span');
    details.className = 'crafting-item-details';
    const label = document.createElement('span');
    label.className = 'crafting-item-name';
    label.textContent = getCraftingItemName(itemId);
    const count = document.createElement('span');
    count.className = 'crafting-item-count';
    count.dataset.requiredAmount = String(amount);
    count.textContent = `所持 ${formatInventoryCount(itemId, available)} / 必要 ${formatInventoryCount(itemId, amount)}`;
    details.append(label, count);
    chip.append(icon, details);
    return chip;
}

function updateCraftingMaterialCounts(card, selectedCount) {
    card.querySelectorAll('.crafting-item-count[data-required-amount]').forEach(count => {
        const itemId = count.closest('.crafting-item-chip')?.dataset.itemKey;
        if (!itemId) return;
        const available = getCraftingItemCount(itemId);
        const required = Number(count.dataset.requiredAmount) * Math.max(1, selectedCount);
        const countText = `所持 ${formatInventoryCount(itemId, available)} / 必要 ${formatInventoryCount(itemId, required)}`;
        if (count.textContent !== countText) count.textContent = countText;
        const chip = count.closest('.crafting-item-chip');
        chip?.classList.toggle('is-missing', available < required);
        const ariaLabel = `${getCraftingItemName(itemId)}: 所持 ${formatInventoryCount(itemId, available)} / 必要 ${formatInventoryCount(itemId, required)}`;
        if (chip?.getAttribute('aria-label') !== ariaLabel) chip?.setAttribute('aria-label', ariaLabel);
    });
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
    const icon = document.getElementById('recipe-detail-icon');
    icon.replaceChildren(building ? createBuildingSvgIcon(currentItemId) : createInventoryIcon(currentItemId));
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
        const section = createRecipeDetailSection(getCraftingRecipeDisplayName(recipe[1]));
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
        const section = createRecipeDetailSection('建築キットの製作素材');
        const station = document.createElement('p');
        station.textContent = building.width >= 2 && building.height >= 2
            ? '製作場所: インベントリの「建築」タブ（作業台以上の設備が必要）'
            : '製作場所: インベントリの「建築」タブ';
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
            const amount = recipe[2].find(([materialId]) => materialId === currentItemId)?.[1];
            appendRecipeDetailLink(list, recipe[3], `加工: ${getCraftingRecipeDisplayName(recipe[1])}`, amount);
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
        note.textContent = 'この製品は製作できますが、現行の加工・建築・地形変成で使う先がありません。';
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
    document.body.classList.remove('guide-item-detail-open');
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

function craftRecipe(recipeIndex, buildingInstanceId = '', requestedCount, { quiet = false } = {}) {
    const baseRecipe = CRAFTING_RECIPES[recipeIndex];
    const buildingId = state.buildings.find(building => building.instanceId === buildingInstanceId)?.id;
    const recipe = getCraftingRecipeForBuilding(baseRecipe, buildingId);
    const creative = Boolean(engineRuntimeState?.creativeMode);
    const isHandcraft = recipe?.[4] === HANDCRAFT_STATION;
    if (!recipe || (isHandcraft ? Boolean(buildingInstanceId) : !canCraftRecipeAtBuilding(recipe, buildingInstanceId))) {
        if (!quiet) showAppNotice('このレシピに対応する製作設備が必要です。');
        return false;
    }
    const craftingBuilding = buildingInstanceId
        ? state.buildings.find(building => building.instanceId === buildingInstanceId)
        : null;
    if (craftingBuilding && !hasAssignedCraftingScroll(craftingBuilding)) {
        if (!quiet) showAppNotice('製作設備に有効なスクロールをセットしてください。');
        return false;
    }
    if (craftingBuilding && !hasRunningCraftingScroll(craftingBuilding)) {
        if (!quiet) showAppNotice('製作設備にセットしたスクロールを起動してください。');
        return false;
    }
    if (craftingBuilding && !engineRuntimeState.creativeMode && Number(engineRuntimeState.power) <= 0) {
        if (!quiet) showAppNotice('製作設備に動力が供給されていません。');
        return false;
    }
    const maxCraftCount = getMaximumCraftCount(recipe[2], creative);
    const quantity = requestedCount === 'max' ? maxCraftCount : Math.floor(Number(requestedCount));
    const outputMultiplier = Math.max(1, Number(recipe[6]) || 1);
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > maxCraftCount) {
        if (!quiet) showAppNotice(maxCraftCount > 0 ? `製作数は1〜${maxCraftCount}回で指定してください。` : '製作に必要な素材が足りません。');
        return false;
    }
    if (!canAddInventoryItems(Array(quantity * outputMultiplier).fill(recipe[3]))) {
        if (!quiet) notifyInventoryFull();
        return false;
    }
    if (!creative && recipe[2].some(([itemId, amount]) => getCraftingItemCount(itemId) < amount * quantity)) {
        if (!quiet) showAppNotice('製作に必要な素材が足りません。');
        return false;
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
    const workDuration = Math.max(1000, Math.round((Number(recipe[7]) || 90) / CRAFTING_RATE_MULTIPLIER * 1000));
    const overclock = getCraftingOverclock(craftingBuilding);
    const duration = Math.max(1, Math.round(workDuration / overclock.speedMultiplier));
    const now = Date.now();
    const batchGroupId = `${recipeKey}:${now}:${Math.random().toString(36).slice(2)}`;
    const newJobs = [];
    for (let index = 0; index < quantity; index++) {
        newJobs.push({
            jobId: `${batchGroupId}:${index + 1}`,
            batchGroupId,
            batchIndex: index + 1,
            batchCount: quantity,
            recipeKey,
            craftingStationId: buildingInstanceId || 'handcraft',
            queuedAt: now,
            durationMs: duration,
            outputItem: recipe[3],
            outputAmount,
            inputCosts: creative ? [] : recipe[2].map(([itemId, amount]) => [itemId, amount]),
            ...(craftingBuilding ? {
                requiresPower: true,
                workDurationMs: workDuration,
                workRemainingMs: workDuration,
                powerPaused: false
            } : {}),
            startedAt: now,
            completesAt: now + duration
        });
    }
    engineRuntimeState.scheduleCraftingJobs(newJobs, now);
    engineRuntimeState.saveGameData();
    engineRuntimeState.notify();
    updateEngineDashboard();
    if (!document.getElementById('building-crafting-modal')?.hidden) renderBuildingCrafting();
    if (!quiet) showAppNotice(`${getCraftingItemName(recipe[3])}の製作を開始しました。`);
    return true;
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
    const signature = `${placed.instanceId}:${search}:${recipes.map(({ index }) => index).join(',')}`;
    const rebuildList = signature !== buildingCraftingRenderSignature;
    if (rebuildList) {
        buildingCraftingRenderSignature = signature;
        list.replaceChildren();
        if (!recipes.length) {
            const empty = document.createElement('p');
            empty.className = 'inventory-empty';
            empty.textContent = search ? '該当する製作レシピはありません' : 'この設備で製作できるレシピはありません';
            list.appendChild(empty);
            return;
        }
    }
    const now = Date.now();
    if (rebuildList) {
        sortCraftingRecipesByAvailability(recipes)
            .forEach(({ recipe, index }) => list.appendChild(createCraftingRecipeCard(recipe, index, now, placed.instanceId)));
        return;
    }
    recipes.forEach(({ recipe, index }) => {
        let card = list.querySelector(`.crafting-recipe-card[data-recipe-index="${index}"]`);
        if (!card) {
            card = createCraftingRecipeCard(recipe, index, now, placed.instanceId);
            list.appendChild(card);
        }
        updateCraftingRecipeCard(card, recipe, index, now);
    });
}

function updateCraftingCountdowns() {
    const now = Date.now();
    if (now - lastCraftingCountdownUpdateAt >= 250) {
        document.querySelectorAll('.crafting-countdown, .building-item-countdown').forEach(countdown => {
            const remaining = Math.max(0, Math.ceil((Number(countdown.dataset.completesAt) - now) / 1000));
            const text = `${remaining}秒`;
            if (countdown.textContent !== text) countdown.textContent = text;
        });
        lastCraftingCountdownUpdateAt = now;
    }
    syncCraftingNotifications();
}

function scheduleInventoryRefresh() {
    if (inventoryRefreshTimer) return;
    inventoryRefreshTimer = window.setTimeout(() => {
        inventoryRefreshTimer = 0;
        const inventoryPanel = document.getElementById('inventory-panel');
        if (!inventoryPanel || inventoryPanel.hidden) return;
        if (!document.getElementById('inventory-building-view')?.hidden) renderBuildingInventory();
        else renderCellMaterials();
    }, 100);
}

function createCraftingNotification(job, queueId) {
    const card = document.createElement('article');
    card.className = 'crafting-progress-card';
    card.dataset.jobId = job.jobId;
    card.dataset.queueId = queueId;
    card.setAttribute('aria-label', `${getCraftingItemName(job.outputItem)}の製作`);
    const icon = document.createElement('span');
    icon.className = 'crafting-progress-icon';
    icon.appendChild(createInventoryIcon(job.outputItem));
    const copy = document.createElement('span');
    copy.className = 'crafting-progress-copy';
    const title = document.createElement('strong');
    title.className = 'crafting-progress-title';
    const meta = document.createElement('span');
    meta.className = 'crafting-progress-meta';
    const queuePage = document.createElement('span');
    queuePage.className = 'crafting-progress-queue-page';
    const track = document.createElement('span');
    track.className = 'crafting-progress-track';
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    const fill = document.createElement('span');
    fill.className = 'crafting-progress-fill';
    track.appendChild(fill);
    copy.append(title, meta);
    card.append(icon, copy, queuePage, track);
    document.getElementById('crafting-notifications')?.appendChild(card);
    const entry = { card, title, meta, queuePage, track, fill };
    bindCraftingNotificationSwipe(entry);
    return entry;
}

function bindCraftingNotificationSwipe(entry) {
    let pointerStart = null;
    const stopTracking = () => {
        window.removeEventListener('pointermove', trackPointerMove, true);
        window.removeEventListener('pointerup', finishPointer, true);
        window.removeEventListener('pointercancel', cancelPointer, true);
    };
    const trackPointerMove = event => {
        if (!pointerStart || pointerStart.id !== event.pointerId) return;
        const deltaX = event.clientX - pointerStart.x;
        const deltaY = event.clientY - pointerStart.y;
        if (!pointerStart.axis) {
            if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 8) return;
            pointerStart.axis = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
            if (pointerStart.axis === 'vertical' && craftingNotificationQueueIds.length < 2) {
                pointerStart = null;
                stopTracking();
                return;
            }
        }
        if (event.cancelable) event.preventDefault();
        if (pointerStart.axis === 'horizontal') {
            entry.card.classList.add('is-dragging');
            entry.card.style.transform = `translateX(${deltaX}px)`;
            entry.card.style.opacity = String(Math.max(0, 1 - Math.abs(deltaX) / Math.max(180, entry.card.clientWidth)));
        } else {
            entry.card.classList.add('is-vertical-dragging');
            entry.card.style.transform = `translateY(${deltaY * .25}px)`;
            entry.card.style.opacity = String(Math.max(.65, 1 - Math.abs(deltaY) / Math.max(500, entry.card.clientHeight * 8)));
        }
    };
    const resetCardGesture = () => {
        entry.card.classList.remove('is-dragging', 'is-vertical-dragging');
        entry.card.style.transform = '';
        entry.card.style.opacity = '';
        entry.card.style.removeProperty('--crafting-dismiss-x');
    };
    const finishPointer = event => {
        if (!pointerStart || pointerStart.id !== event.pointerId) return;
        event.stopPropagation();
        const deltaX = event.clientX - pointerStart.x;
        const deltaY = event.clientY - pointerStart.y;
        const axis = pointerStart.axis;
        pointerStart = null;
        stopTracking();
        entry.card.classList.remove('is-dragging', 'is-vertical-dragging');
        if (axis === 'horizontal' && Math.abs(deltaX) > Math.max(48, entry.card.clientWidth * .3)) {
            const direction = Math.sign(deltaX);
            entry.card.style.setProperty('--crafting-dismiss-x', `${direction * (window.innerWidth + entry.card.clientWidth)}px`);
            entry.card.classList.add('is-dismissing');
            window.setTimeout(() => cancelCraftingJob(entry.card.dataset.jobId), 220);
            return;
        }
        entry.card.style.transform = '';
        entry.card.style.opacity = '';
        entry.card.style.removeProperty('--crafting-dismiss-x');
        if (axis === 'vertical' && Math.abs(deltaY) > Math.max(24, entry.card.clientHeight * .3)) {
            turnCraftingNotificationQueue(deltaY < 0 ? 1 : -1);
        }
    };
    const cancelPointer = event => {
        if (!pointerStart || pointerStart.id !== event.pointerId) return;
        pointerStart = null;
        stopTracking();
        resetCardGesture();
    };
    entry.card.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.stopPropagation();
        pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: null };
        window.addEventListener('pointermove', trackPointerMove, true);
        window.addEventListener('pointerup', finishPointer, true);
        window.addEventListener('pointercancel', cancelPointer, true);
    });
}

function turnCraftingNotificationQueue(direction) {
    if (isCraftingNotificationFlipInProgress || craftingNotificationQueueIds.length < 2) return;
    const currentIndex = craftingNotificationQueueIds.indexOf(activeCraftingNotificationQueueId);
    const nextIndex = (currentIndex + direction + craftingNotificationQueueIds.length) % craftingNotificationQueueIds.length;
    const nextQueueId = craftingNotificationQueueIds[nextIndex];
    const currentEntry = craftingNotificationCards.get(activeCraftingNotificationQueueId);
    if (!currentEntry || nextQueueId === activeCraftingNotificationQueueId) return;
    isCraftingNotificationFlipInProgress = true;
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180;
    const exitAngle = direction > 0 ? -68 : 68;
    currentEntry.card.animate([
        { transform: 'perspective(520px) rotateX(0deg) translateY(0)', opacity: 1 },
        { transform: `perspective(520px) rotateX(${exitAngle}deg) translateY(${direction > 0 ? -10 : 10}px)`, opacity: 0 }
    ], { duration, easing: 'ease-in', fill: 'forwards' }).finished.then(() => {
        activeCraftingNotificationQueueId = nextQueueId;
        syncCraftingNotifications(true);
        const nextEntry = craftingNotificationCards.get(nextQueueId);
        if (nextEntry) {
            nextEntry.card.animate([
                { transform: `perspective(520px) rotateX(${-exitAngle}deg) translateY(${direction > 0 ? 10 : -10}px)`, opacity: 0 },
                { transform: 'perspective(520px) rotateX(0deg) translateY(0)', opacity: 1 }
            ], { duration, easing: 'ease-out' });
        }
    }).catch(() => {}).finally(() => {
        isCraftingNotificationFlipInProgress = false;
    });
}

function getCraftingJobRefundItems(job) {
    if (Array.isArray(job.inputCosts)) return job.inputCosts;
    if (String(job.recipeKey).startsWith('building:')) {
        const building = BUILDING_BY_ID.get(job.outputItem);
        if (!building) return [];
        return [
            ['brass-stock', building.brassCost],
            ...getBuildingMaterialCosts(building)
        ];
    }
    const recipe = CRAFTING_RECIPES.find(candidate => `${candidate[0]}:${candidate[1]}` === job.recipeKey);
    return recipe ? recipe[2] : [];
}

function cancelCraftingJob(jobId) {
    craftingNotificationCards.forEach(entry => {
        if (!entry.card.classList.contains('is-dismissing')) return;
        entry.card.classList.remove('is-dismissing', 'is-dragging', 'is-vertical-dragging');
        entry.card.style.transform = '';
        entry.card.style.opacity = '';
        entry.card.style.removeProperty('--crafting-dismiss-x');
    });
    const job = engineRuntimeState.craftingJobs.find(candidate => candidate.jobId === jobId);
    if (!job) return;
    const cancelled = engineRuntimeState.cancelCraftingJob(jobId, getCraftingJobRefundItems(job));
    if (!cancelled) {
        showAppNotice('完了済みの製作はキャンセルできません。');
        return;
    }
    updateEngineDashboard();
    showAppNotice(`${getCraftingItemName(cancelled.outputItem)}の製作をキャンセルし、素材を返却しました。`);
}

function syncCraftingNotifications(force = false) {
    const container = document.getElementById('crafting-notifications');
    if (!container || !engineRuntimeState) return;
    const syncAt = Date.now();
    if (!force && syncAt - lastCraftingNotificationSyncAt < 33) return;
    lastCraftingNotificationSyncAt = syncAt;
    const jobs = engineRuntimeState.craftingJobs || [];
    const queueGroups = new Map();
    jobs.forEach(job => {
        const queueId = typeof job.craftingStationId === 'string' && job.craftingStationId
            ? job.craftingStationId
            : 'legacy';
        if (!queueGroups.has(queueId)) queueGroups.set(queueId, []);
        queueGroups.get(queueId).push(job);
    });
    const queues = [...queueGroups].map(([queueId, queueJobs]) => {
        queueJobs.sort((first, second) => Number(first.startedAt) - Number(second.startedAt)
            || Number(first.batchIndex) - Number(second.batchIndex)
            || Number(first.completesAt) - Number(second.completesAt));
        return {
            queueId,
            jobs: queueJobs,
            queuedAt: Math.min(...queueJobs.map(job => Number(job.queuedAt ?? job.startedAt) || syncAt))
        };
    }).sort((first, second) => first.queuedAt - second.queuedAt || first.queueId.localeCompare(second.queueId));
    craftingNotificationQueueIds = queues.map(queue => queue.queueId);
    if (!queues.length) {
        activeCraftingNotificationQueueId = null;
    } else if (!craftingNotificationQueueIds.includes(activeCraftingNotificationQueueId)) {
        activeCraftingNotificationQueueId = queues[0].queueId;
    }
    const selectedQueueIndex = queues.findIndex(queue => queue.queueId === activeCraftingNotificationQueueId);
    const selectedQueue = queues[selectedQueueIndex];
    for (const [queueId, entry] of craftingNotificationCards) {
        if (queueId === selectedQueue?.queueId) continue;
        entry.card.remove();
        craftingNotificationCards.delete(queueId);
    }
    if (!selectedQueue) return;
    const job = selectedQueue.jobs[0];
    const queuePositionText = `${selectedQueueIndex + 1}/${queues.length}`;
    let didUpdateProgress = false;
    let entry = craftingNotificationCards.get(selectedQueue.queueId);
    if (!entry) {
        entry = createCraftingNotification(job, selectedQueue.queueId);
        craftingNotificationCards.set(selectedQueue.queueId, entry);
    }
    entry.card.dataset.jobId = job.jobId;
    entry.queuePage.textContent = queuePositionText;
    const outputName = getCraftingItemName(job.outputItem);
    const outputAmount = Math.max(1, Math.floor(Number(job.outputAmount) || 1));
    const batchIndex = Math.max(1, Math.floor(Number(job.batchIndex) || 1));
    const batchCount = Math.max(batchIndex, Math.floor(Number(job.batchCount) || 1));
    const startedAt = Number(job.startedAt);
    const completesAt = Number(job.completesAt);
    const start = Number.isFinite(startedAt) ? startedAt : syncAt;
    const duration = Math.max(1, Number(job.workDurationMs) || completesAt - start);
    const remainingWork = job.requiresPower ? Math.max(0, Number(job.workRemainingMs) || 0) : null;
    const progress = job.requiresPower
        ? Math.max(0, Math.min(100, ((duration - remainingWork) / duration) * 100))
        : Math.max(0, Math.min(100, ((syncAt - start) / duration) * 100));
    const secondsLeft = Math.max(0, Math.ceil((completesAt - syncAt) / 1000));
    const queued = syncAt < start;
    entry.title.textContent = `${outputName}${outputAmount > 1 ? ` ×${outputAmount}` : ''}`;
    const batchLabel = `製作中 ${batchIndex}/${batchCount} 待機 ${Math.max(0, selectedQueue.jobs.length - 1)}件`;
    const remainingLabel = job.requiresPower && job.powerPaused && !queued
        ? `動力待ち / 残り ${Math.ceil(remainingWork / 1000)}秒`
        : queued
        ? `着手まで ${Math.max(0, Math.ceil((start - syncAt) / 1000))}秒`
        : `残り ${secondsLeft}秒`;
    entry.card.toggleAttribute('data-queued', queued);
    entry.card.setAttribute('aria-label', `${outputName}の製作キュー ${queuePositionText}`);
    const statusText = `${batchLabel}　${remainingLabel}`;
    if (entry.meta.textContent !== statusText) entry.meta.textContent = statusText;
    const ariaLabel = `${outputName}の製作進行状況`;
    if (entry.track.getAttribute('aria-label') !== ariaLabel) entry.track.setAttribute('aria-label', ariaLabel);
    const progressValue = String(Math.round(progress));
    if (entry.track.getAttribute('aria-valuenow') !== progressValue) entry.track.setAttribute('aria-valuenow', progressValue);
    if (syncAt - lastCraftingProgressUpdateAt >= 33 || progress >= 100) {
        entry.fill.style.setProperty('--crafting-progress-scale', String(progress / 100));
        didUpdateProgress = true;
    }
    if (didUpdateProgress) lastCraftingProgressUpdateAt = syncAt;
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
let vehicleAnimationTimer = null;

function scheduleVehicleAnimation() {
    if (vehicleFrameQueued) return;
    vehicleFrameQueued = true;
    const hasMovingVehicle = state.buildings.some(placed =>
        placed.vehicle?.running || placed.vehicle?.movement);
    const hasMovingAutomaton = state.buildings.some(placed => placed.automaton?.movement);
    const runningAutomatons = state.buildings.filter(placed => placed.automaton?.running);
    const hasVehicleRuntime = state.buildings.some(placed =>
        BUILDING_BY_ID.get(placed.id)?.kind === 'locomotive'
        && (placed.vehicle?.running || placed.vehicle?.movement));
    const animate = now => {
        vehicleAnimationTimer = null;
        vehicleFrameQueued = false;
        if (hasVehicleRuntime) tickVehicleRuntime(now);
        tickAutomatons(now);
        if (hasVehicleRuntime) {
            const hasActiveVehicle = state.buildings.some(placed => placed.vehicle?.running || placed.vehicle?.movement);
            if (hasActiveVehicle !== vehicleAnimationLayerActive) draw();
            else if (hasActiveVehicle) drawVehicleAnimationLayer(now);
        }
        if (state.buildings.some(placed => placed.vehicle?.running || placed.vehicle?.movement
            || placed.automaton?.running || placed.automaton?.movement)) scheduleVehicleAnimation();
    };
    if (!hasMovingVehicle && !hasMovingAutomaton && runningAutomatons.length) {
        const nextMoveAt = runningAutomatons.reduce((earliest, placed) =>
            Math.min(earliest, Math.max(0, Number(placed.automaton.nextMoveAt) || 0)), Infinity);
        const delay = Math.max(16, Math.min(100, nextMoveAt - performance.now()));
        vehicleAnimationTimer = setTimeout(() => animate(performance.now()), delay);
        return;
    }
    requestAnimationFrame(animate);
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

function drawAutomatonTransportOverlay() {
    const modal = document.getElementById('automaton-menu-modal');
    const showReachability = !modal?.hidden;
    const selected = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId
        && BUILDING_BY_ID.get(building.id)?.kind === 'automaton');
    const automatons = state.buildings.filter(placed => BUILDING_BY_ID.get(placed.id)?.kind === 'automaton')
        .filter(placed => {
            const automaton = getAutomatonState(placed);
            return automaton.action === 'STORAGE_TRANSPORT'
                && (automaton.running || placed === selected);
        });
    if (!automatons.length) return;

    ctx.save();
    for (const placed of automatons) {
        const automaton = getAutomatonState(placed);
        if (showReachability && placed === selected) {
            const bounds = getAutomatonTransportBounds(placed, automaton);
            const reachabilityKey = [
                buildingNavigationRevision, placed.instanceId, placed.x, placed.y,
                state.player.x, state.player.y,
                bounds.minX, bounds.maxX, bounds.minY, bounds.maxY
            ].join(':');
            let reachable = automatonTransportReachabilityCache.get(placed.instanceId);
            if (reachable?.key !== reachabilityKey) {
                reachable = {
                    key: reachabilityKey,
                    cells: getAutomatonWalkPaths(placed, placed, bounds)
                };
                automatonTransportReachabilityCache.set(placed.instanceId, reachable);
            }
            ctx.fillStyle = 'rgba(92, 224, 185, .10)';
            reachable.cells.forEach((previous, key) => {
                const [x, y] = key.split(',').map(Number);
                ctx.fillRect(x * state.tileSize, y * state.tileSize, state.tileSize, state.tileSize);
            });
            ctx.strokeStyle = 'rgba(117, 255, 209, .65)';
            ctx.lineWidth = 1.5 / state.zoom;
            ctx.setLineDash([5 / state.zoom, 4 / state.zoom]);
            ctx.strokeRect(
                bounds.minX * state.tileSize,
                bounds.minY * state.tileSize,
                (bounds.maxX - bounds.minX + 1) * state.tileSize,
                (bounds.maxY - bounds.minY + 1) * state.tileSize
            );
        }

        const activeRoute = automatonTransportRoutes.get(placed.instanceId);
        const routeIsCurrent = activeRoute?.buildingRevision === buildingNavigationRevision;
        const plan = routeIsCurrent ? null : getCachedAutomatonTransportPlan(placed, automaton);
        let path = [];
        if (routeIsCurrent && activeRoute?.cyclePath) {
            path = [...activeRoute.cyclePath, ...activeRoute.cyclePath.slice(0, -1).reverse()];
        } else if (routeIsCurrent && automaton.running && activeRoute) {
            path = [placed, ...activeRoute.path.slice(activeRoute.index)];
        } else if (plan) {
            path = [...plan.sourceRoute.path, ...plan.destinationRoute.path.slice(1)];
        }
        if (path.length < 2) continue;
        ctx.beginPath();
        path.forEach((point, index) => {
            const x = (point.x + .5) * state.tileSize;
            const y = (point.y + .5) * state.tileSize;
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = 'rgba(255, 222, 126, .96)';
        ctx.lineWidth = Math.max(2, 3 / state.zoom);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba(255, 192, 80, .8)';
        ctx.shadowBlur = 7 / state.zoom;
        ctx.setLineDash([state.tileSize * .16, state.tileSize * .2]);
        ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
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

function drawPlacedBuildings(startCol, endCol, startRow, endRow, now, foundationPass = null) {
    const drawOrder = { foundation: 0, decoration: 1, rail: 2, structure: 3, vehicle: 4 };
    if (buildingDrawOrderCacheRevision !== buildingNavigationRevision) {
        orderedBuildingDrawCache = [...state.buildings].sort((left, right) => {
            const leftRole = BUILDING_BY_ID.get(left.id)?.role || 'structure';
            const rightRole = BUILDING_BY_ID.get(right.id)?.role || 'structure';
            return drawOrder[leftRole] - drawOrder[rightRole];
        });
        buildingDrawOrderCacheRevision = buildingNavigationRevision;
    }
    const activeCraftingStationIds = new Set();
    for (const job of engineRuntimeState.craftingJobs) {
        if (Number(job.startedAt) <= now && Number(job.completesAt) > now) {
            activeCraftingStationIds.add(job.craftingStationId);
        }
    }
    orderedBuildingDrawCache.forEach(placed => {
        const building = BUILDING_BY_ID.get(placed.id);
        if (!building) return;
        if (foundationPass !== null && (building.role === 'foundation') !== foundationPass) return;
        const activeVehicle = building.role === 'vehicle' && (placed.vehicle?.running || placed.vehicle?.movement);
        if (activeVehicle) return;
        const vehicleRender = building.role === 'vehicle' ? getVehicleRenderState(placed, now) : null;
        const automatonMovement = building.kind === 'automaton' ? placed.automaton?.movement : null;
        const drawX = vehicleRender?.x ?? placed.x;
        const drawY = vehicleRender?.y ?? placed.y;
        const minX = Math.min(drawX, automatonMovement?.from.x ?? placed.x, automatonMovement?.to.x ?? placed.x);
        const maxX = Math.max(drawX, automatonMovement?.from.x ?? placed.x, automatonMovement?.to.x ?? placed.x);
        const minY = Math.min(drawY, automatonMovement?.from.y ?? placed.y, automatonMovement?.to.y ?? placed.y);
        const maxY = Math.max(drawY, automatonMovement?.from.y ?? placed.y, automatonMovement?.to.y ?? placed.y);
        if (maxX + building.width < startCol || minX > endCol || maxY + building.height < startRow || minY > endRow) return;
        if (building.kind === 'automaton') {
            drawAutomaton(placed, now);
            return;
        }
        const drawRotation = vehicleRender ? vehicleRender.rotation : placed.rotation || 0;
        drawBuilding(ctx, { ...building, x: drawX, y: drawY, rotation: drawRotation }, state.tileSize, { zoom: state.zoom });
        if (activeCraftingStationIds.has(placed.instanceId)) {
            const zoom = Math.max(0.5, state.zoom);
            const x = placed.x * state.tileSize;
            const y = placed.y * state.tileSize;
            const width = building.width * state.tileSize;
            const height = building.height * state.tileSize;
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 226, 122, .98)';
            ctx.lineWidth = 2 / zoom;
            ctx.shadowColor = 'rgba(255, 190, 52, .98)';
            ctx.shadowBlur = 14 / zoom;
            ctx.strokeRect(x + 1 / zoom, y + 1 / zoom, width - 2 / zoom, height - 2 / zoom);
            ctx.restore();
        }
    });
}

function isBuildingCraftingActive(placed, now = Date.now()) {
    return engineRuntimeState.craftingJobs.some(job =>
        job.craftingStationId === placed.instanceId
        && Number(job.startedAt) <= now
        && Number(job.completesAt) > now);
}

function isBuildingSoundActive(placed, now = Date.now()) {
    if (placed.vehicle?.running || placed.vehicle?.movement
        || placed.automaton?.running || placed.automaton?.movement) return true;
    if (placed.id === 'scroll-stand' && hasRunningCraftingScroll(placed)) return true;
    return engineRuntimeState.craftingJobs.some(job =>
        job.craftingStationId === placed.instanceId
        && Number(job.startedAt) <= now
        && Number(job.completesAt) > now
        && (!job.requiresPower || (hasRunningCraftingScroll(placed)
            && (engineRuntimeState.creativeMode
                || (!job.powerPaused && Number(engineRuntimeState.power) > 0)))))
        || (placed.id === 'boiler-forge'
            && buildingUtilityOperationStatuses.get(placed.instanceId) === '稼働中');
}

function updateBuildingSoundscapeForWorld() {
    const now = Date.now();
    const sounds = state.buildings.map(placed => {
        const definition = BUILDING_BY_ID.get(placed.id);
        return {
            instanceId: placed.instanceId,
            profile: getBuildingSoundProfile(placed.id),
            active: isBuildingSoundActive(placed, now),
            x: placed.x + (definition?.width || 1) / 2,
            y: placed.y + (definition?.height || 1) / 2
        };
    });
    updateBuildingSoundscape(sounds, {
        x: state.player.x + 0.5,
        y: state.player.y + 0.5
    });
}

function getActiveCraftingBuildingSignature(now = Date.now()) {
    return state.buildings
        .filter(placed => isBuildingCraftingActive(placed, now))
        .map(placed => placed.instanceId)
        .sort()
        .join(',');
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

function getBuildingScrollId(building) {
    return requiresMovementScroll(building) ? getMovementScrollId(building) : building?.craftingScrollId || '';
}

function isBuildingScrollRunning(building, activeScrollIds) {
    const scrollId = getBuildingScrollId(building);
    if (!scrollId || !activeScrollIds.has(scrollId)) return false;
    if (requiresMovementScroll(building)) {
        return hasAssignedMovementScroll(building) && engineRuntimeState.mainGearRunning
            && (engineRuntimeState.creativeMode || Number(engineRuntimeState.steamPower) > 0);
    }
    return hasRunningCraftingScroll(building);
}

function drawScrollAlchemyCircles(context, now, runningState) {
    const activeScrollIds = new Set(getActiveScrollIds());
    const scrollBuildings = state.buildings.filter(building => Boolean(getBuildingScrollId(building)));
    let hasRunningCircle = false;
    const viewW = canvas.width / state.zoom;
    const viewH = canvas.height / state.zoom;
    const viewLeft = state.camera.x - viewW / 2;
    const viewTop = state.camera.y - viewH / 2;
    const zoom = Math.max(0.25, state.zoom);
    scrollBuildings.forEach(building => {
        const definition = BUILDING_BY_ID.get(building.id);
        if (!definition) return;
        const running = isBuildingScrollRunning(building, activeScrollIds);
        if (running !== runningState) return;
        hasRunningCircle ||= running;
        const worldCenterX = (building.x + definition.width / 2) * state.tileSize;
        const worldCenterY = (building.y + definition.height / 2) * state.tileSize;
        const isAutomaton = building.id === 'field-automaton';
        const influenceRange = isAutomaton
            ? 0
            : supportsStationaryScrolls(building)
            ? getNearbyScrollStorageTargets(building).reduce((range, target) => Math.max(range, target.definition.collectionImportRange), 0)
            : Number(definition.scrollAlchemyRange) || 0;
        const footprintRadius = isAutomaton
            ? 0.5
            : Math.hypot(definition.width, definition.height) / 2;
        const radius = state.tileSize * (footprintRadius + influenceRange + (isAutomaton ? 0 : 0.12));
        if (worldCenterX + radius < viewLeft || worldCenterX - radius > viewLeft + viewW
            || worldCenterY + radius < viewTop || worldCenterY - radius > viewTop + viewH) return;
        const angle = running ? now / 18000 * Math.PI * 2 : 0;
        const alpha = running ? 0.92 : 0.94;
        context.save();
        context.translate(worldCenterX, worldCenterY);
        context.globalAlpha = alpha;
        context.strokeStyle = running ? '#8ef5d9' : '#f0b66d';
        context.fillStyle = running ? '#8ef5d9' : '#f0b66d';
        context.lineWidth = running ? 2 / zoom : 1.8 / zoom;
        if (running) {
            context.shadowColor = 'rgba(98, 220, 190, .55)';
            context.shadowBlur = 3 / zoom;
        } else {
            context.shadowColor = 'rgba(240, 182, 109, .5)';
            context.shadowBlur = 3 / zoom;
        }
        context.beginPath();
        context.arc(0, 0, radius * .96, 0, Math.PI * 2);
        context.stroke();
        context.beginPath();
        context.setLineDash([5 / zoom, 4 / zoom]);
        context.arc(0, 0, radius * .78, -angle, Math.PI * 2 - angle);
        context.stroke();
        context.setLineDash([]);
        if (running) context.rotate(angle);
        context.beginPath();
        for (let index = 0; index < 72; index++) {
            const tooth = Math.floor(index / 6);
            const point = index % 6;
            const offsets = [0, .12, .12, .3, .3, .5];
            const radii = [radius * .8, radius * .8, radius * .96, radius * .96, radius * .8, radius * .8];
            const theta = (tooth + offsets[point]) * Math.PI / 6 - Math.PI / 2;
            const x = Math.cos(theta) * radii[point];
            const y = Math.sin(theta) * radii[point];
            if (index === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
        }
        context.closePath();
        context.stroke();
        context.beginPath();
        context.arc(0, 0, radius * .58, 0, Math.PI * 2);
        context.stroke();
        context.restore();
    });
    return hasRunningCircle;
}

function clearTerrainChunkCache() {
    terrainChunkCache.clear();
    terrainChunkCachePixels = 0;
    terrainChunkCacheMap = state.map;
}

function invalidateTerrainChunkAt(x, y) {
    const chunkX = Math.floor(x / TERRAIN_CACHE_CHUNK_SIZE);
    const chunkY = Math.floor(y / TERRAIN_CACHE_CHUNK_SIZE);
    const keyPrefix = `${chunkX},${chunkY},`;
    for (const [key, chunk] of terrainChunkCache) {
        if (!key.startsWith(keyPrefix)) continue;
        terrainChunkCachePixels -= chunk.pixels;
        terrainChunkCache.delete(key);
    }
}

function createTerrainChunk(chunkX, chunkY, showIcons) {
    const startCol = chunkX * TERRAIN_CACHE_CHUNK_SIZE;
    const startRow = chunkY * TERRAIN_CACHE_CHUNK_SIZE;
    const endCol = Math.min(state.cols, startCol + TERRAIN_CACHE_CHUNK_SIZE);
    const endRow = Math.min(state.rows, startRow + TERRAIN_CACHE_CHUNK_SIZE);
    const worldWidth = (endCol - startCol) * state.tileSize;
    const worldHeight = (endRow - startRow) * state.tileSize;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(worldWidth));
    canvas.height = Math.max(1, Math.ceil(worldHeight));
    const context = canvas.getContext('2d');
    if (!context) return null;

    const pixelSize = Math.ceil(state.tileSize);
    for (let y = startRow; y < endRow; y++) {
        for (let x = startCol; x < endCol; x++) {
            const tile = state.map[y][x];
            const localX = (x - startCol) * state.tileSize;
            const localY = (y - startRow) * state.tileSize;
            context.fillStyle = getMosaicColor(tile.color || '#526f4e', x, y);
            context.fillRect(Math.floor(localX), Math.floor(localY), pixelSize, pixelSize);
        }
    }

    if (showIcons) {
        const iconSize = state.tileSize * 0.58;
        const iconOffset = (state.tileSize - iconSize) / 2;
        context.save();
        context.globalAlpha = 0.28;
        context.imageSmoothingEnabled = true;
        for (let y = startRow; y < endRow; y++) {
            for (let x = startCol; x < endCol; x++) {
                drawCellIcon(context, cellIconAtlas, state.map[y][x],
                    (x - startCol) * state.tileSize + iconOffset,
                    (y - startRow) * state.tileSize + iconOffset,
                    iconSize);
            }
        }
        context.restore();
    }

    return { canvas, pixels: canvas.width * canvas.height, worldWidth, worldHeight };
}

function getTerrainChunk(chunkX, chunkY, showIcons) {
    if (terrainChunkCacheMap !== state.map) clearTerrainChunkCache();
    const key = `${chunkX},${chunkY},${showIcons ? 1 : 0}`;
    const cached = terrainChunkCache.get(key);
    if (cached) {
        terrainChunkCache.delete(key);
        terrainChunkCache.set(key, cached);
        return cached;
    }

    const chunk = createTerrainChunk(chunkX, chunkY, showIcons);
    if (!chunk) return null;
    while (terrainChunkCache.size && terrainChunkCachePixels + chunk.pixels > TERRAIN_CACHE_MAX_PIXELS) {
        const oldestKey = terrainChunkCache.keys().next().value;
        const oldest = terrainChunkCache.get(oldestKey);
        terrainChunkCache.delete(oldestKey);
        terrainChunkCachePixels -= oldest.pixels;
    }
    if (chunk.pixels <= TERRAIN_CACHE_MAX_PIXELS) {
        terrainChunkCache.set(key, chunk);
        terrainChunkCachePixels += chunk.pixels;
    }
    return chunk;
}

function drawTerrainChunks(startCol, endCol, startRow, endRow) {
    if (startCol >= endCol || startRow >= endRow) return;
    const showIcons = Boolean(cellIconAtlas && state.tileSize * state.zoom >= 14);
    const firstChunkX = Math.floor(startCol / TERRAIN_CACHE_CHUNK_SIZE);
    const lastChunkX = Math.floor((endCol - 1) / TERRAIN_CACHE_CHUNK_SIZE);
    const firstChunkY = Math.floor(startRow / TERRAIN_CACHE_CHUNK_SIZE);
    const lastChunkY = Math.floor((endRow - 1) / TERRAIN_CACHE_CHUNK_SIZE);
    for (let chunkY = firstChunkY; chunkY <= lastChunkY; chunkY++) {
        for (let chunkX = firstChunkX; chunkX <= lastChunkX; chunkX++) {
            const chunk = getTerrainChunk(chunkX, chunkY, showIcons);
            if (!chunk) continue;
            ctx.drawImage(chunk.canvas,
                chunkX * TERRAIN_CACHE_CHUNK_SIZE * state.tileSize,
                chunkY * TERRAIN_CACHE_CHUNK_SIZE * state.tileSize,
                chunk.worldWidth,
                chunk.worldHeight);
        }
    }
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

    drawTerrainChunks(startCol, endCol, startRow, endRow);

    drawGridOverlay(startCol, endCol, startRow, endRow);
    drawPlacedBuildings(startCol, endCol, startRow, endRow, now, true);
    drawScrollAlchemyCircles(ctx, now, false);
    drawPlacedBuildings(startCol, endCol, startRow, endRow, now, false);
    drawBuildingGhost();
    drawTerritoryOverlay(startCol, endCol, startRow, endRow);
    drawTargetCellHighlights(left, top, viewW, viewH);
    drawAutomatonTransportOverlay();

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

    const hasRunningScrollAlchemyCircle = drawScrollAlchemyCircles(ctx, now, true);
    ctx.restore();
    if (hasRunningScrollAlchemyCircle) requestAnimationFrame(scheduleDraw);
    const hasActiveVehicle = state.buildings.some(placed => placed.vehicle?.running || placed.vehicle?.movement);
    vehicleAnimationLayerActive = hasActiveVehicle;
    if (hasActiveVehicle) drawVehicleAnimationLayer(now);
    else {
        vehicleAnimationContext.clearRect(0, 0, vehicleAnimationCanvas.width, vehicleAnimationCanvas.height);
        vehicleAnimationPoses.clear();
    }
    if (state.buildings.some(placed => placed.vehicle?.running || placed.vehicle?.movement
        || placed.automaton?.movement)) scheduleVehicleAnimation();
}

function drawVehicleAnimationLayer(now) {
    if (vehicleAnimationCanvas.width !== canvas.width || vehicleAnimationCanvas.height !== canvas.height) {
        vehicleAnimationCanvas.width = canvas.width;
        vehicleAnimationCanvas.height = canvas.height;
    }
    vehicleAnimationContext.setTransform(1, 0, 0, 1, 0, 0);
    vehicleAnimationContext.clearRect(0, 0, vehicleAnimationCanvas.width, vehicleAnimationCanvas.height);

    const viewW = canvas.width / state.zoom;
    const viewH = canvas.height / state.zoom;
    const left = state.camera.x - viewW / 2;
    const top = state.camera.y - viewH / 2;
    vehicleAnimationContext.save();
    vehicleAnimationContext.scale(state.zoom, state.zoom);
    vehicleAnimationContext.translate(-left, -top);
    state.buildings.forEach(placed => {
        const vehicle = placed.vehicle;
        if (!vehicle?.running && !vehicle?.movement) return;
        const building = BUILDING_BY_ID.get(placed.id);
        if (!building) return;
        const render = vehicle.movement
            ? getVehicleRenderState(placed, now)
            : vehicleAnimationPoses.get(placed.instanceId) || { x: placed.x, y: placed.y, rotation: placed.rotation || 0 };
        vehicleAnimationPoses.set(placed.instanceId, render);
        drawBuilding(vehicleAnimationContext, { ...building, x: render.x, y: render.y, rotation: render.rotation }, state.tileSize, { zoom: state.zoom });
    });
    vehicleAnimationContext.restore();
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
    setBuildingStorageItemPickerOpen(false);
    const modal = document.getElementById('building-menu-modal');
    if (modal) modal.hidden = true;
    document.getElementById('automaton-menu-modal').hidden = true;
    document.getElementById('building-demolition-confirm-modal').hidden = true;
    pendingBuildingDemolitionInstanceId = null;
    selectedBuildingInstanceId = null;
    scheduleDraw();
}

function getVehicleState(placed) {
    const saved = isRecord(placed.vehicle) ? placed.vehicle : {};
    placed.vehicle = {
        ...VEHICLE_DEFAULTS,
        ...saved,
        resources: { ...VEHICLE_DEFAULTS.resources, ...(isRecord(saved.resources) ? saved.resources : {}) }
    };
    placed.vehicle.speedMultiplier = Math.max(1, Math.min(3, Number(placed.vehicle.speedMultiplier) || 1));
    placed.vehicle.maxWagons = Math.max(0, Math.min(32, Math.floor(Number(placed.vehicle.maxWagons) || 0)));
    delete placed.vehicle.powerPerCell;
    delete placed.vehicle.powerWagonExponent;
    return placed.vehicle;
}

function getAutomatonState(placed) {
    const saved = isRecord(placed.automaton) ? placed.automaton : {};
    const skin = typeof saved.skinUrl === 'string' && saved.skinUrl
        ? { url: saved.skinUrl, name: typeof saved.skinName === 'string' ? saved.skinName : getSkinNameFromSource(saved.skinUrl) }
        : getPlayerSkinConfig();
    placed.automaton = {
        running: false,
        axis: 'horizontal',
        direction: 1,
        range: 3,
        speedMultiplier: 1,
        carryCapacityMultiplier: 1,
        powerPerOperation: 1,
        action: 'RESOURCE_COLLECTION',
        conditionCellType: '',
        transformTargetType: 'IRON_VEIN',
        itemFilterMode: 'include',
        itemFilterIds: [],
        sourceStorageInstanceId: '',
        destinationStorageInstanceId: '',
        transportTargetStorageInstanceId: '',
        movementScrollId: '',
        cargo: {},
        facingDirection: { x: 1, y: 0 },
        skinUrl: skin.url,
        skinName: skin.name,
        origin: { x: placed.x, y: placed.y },
        nextMoveAt: 0,
        movement: null,
        stopCondition: '',
        stopAfterItemCount: 0,
        stopAfterRoundTripCount: 0,
        processedItemCount: 0,
        completedRoundTripCount: 0,
        deliveredAtDestination: false,
        ...saved
    };
    if (!['horizontal', 'vertical'].includes(placed.automaton.axis)) placed.automaton.axis = 'horizontal';
    placed.automaton.speedMultiplier = AUTOMATON_SPEED_MULTIPLIERS.includes(Number(placed.automaton.speedMultiplier))
        ? Number(placed.automaton.speedMultiplier) : 1;
    placed.automaton.carryCapacityMultiplier = AUTOMATON_CARRY_MULTIPLIERS.includes(Number(placed.automaton.carryCapacityMultiplier))
        ? Number(placed.automaton.carryCapacityMultiplier) : 1;
    placed.automaton.powerPerOperation = Math.max(0, Math.min(1000, Number(placed.automaton.powerPerOperation) || 0));
    if (typeof placed.automaton.skinUrl !== 'string' || !placed.automaton.skinUrl) placed.automaton.skinUrl = skin.url;
    if (typeof placed.automaton.skinName !== 'string') placed.automaton.skinName = skin.name;
    if (!['RESOURCE_COLLECTION', 'TERRAIN_TRANSFORM', 'STORAGE_WITHDRAW', 'STORAGE_DEPOSIT', 'STORAGE_TRANSPORT'].includes(placed.automaton.action)) {
        placed.automaton.action = 'RESOURCE_COLLECTION';
    }
    if (!['none', 'item-count', 'round-trips', 'source-empty'].includes(placed.automaton.stopCondition)) {
        placed.automaton.stopCondition = placed.automaton.stopAfterItemCount > 0
            ? 'item-count'
            : placed.automaton.action === 'STORAGE_TRANSPORT' ? 'source-empty' : 'none';
    }
    placed.automaton.sourceStorageInstanceId = typeof placed.automaton.sourceStorageInstanceId === 'string'
        ? placed.automaton.sourceStorageInstanceId : '';
    placed.automaton.destinationStorageInstanceId = typeof placed.automaton.destinationStorageInstanceId === 'string'
        ? placed.automaton.destinationStorageInstanceId : '';
    placed.automaton.transportTargetStorageInstanceId = typeof placed.automaton.transportTargetStorageInstanceId === 'string'
        ? placed.automaton.transportTargetStorageInstanceId : '';
    placed.automaton.stopAfterItemCount = Math.max(1, Math.min(
        1_000_000_000, Math.floor(Number(placed.automaton.stopAfterItemCount) || 1)
    ));
    placed.automaton.stopAfterRoundTripCount = Math.max(1, Math.min(
        1_000_000_000, Math.floor(Number(placed.automaton.stopAfterRoundTripCount) || 1)
    ));
    placed.automaton.processedItemCount = Math.max(0, Math.floor(Number(placed.automaton.processedItemCount) || 0));
    placed.automaton.completedRoundTripCount = Math.max(
        0, Math.floor(Number(placed.automaton.completedRoundTripCount) || 0)
    );
    placed.automaton.deliveredAtDestination = Boolean(placed.automaton.deliveredAtDestination);
    const cargo = isRecord(placed.automaton.cargo) ? placed.automaton.cargo : {};
    let cargoSpace = getAutomatonCarryCapacity(placed.automaton);
    placed.automaton.cargo = {};
    for (const [itemId] of CRAFTING_ITEMS) {
        const amount = Math.min(cargoSpace, Math.max(0, Math.floor(Number(cargo[itemId]) || 0)));
        if (amount > 0) {
            placed.automaton.cargo[itemId] = amount;
            cargoSpace -= amount;
        }
    }
    placed.automaton.itemFilterMode = placed.automaton.itemFilterMode === 'exclude' ? 'exclude' : 'include';
    const validItemIds = new Set(CRAFTING_ITEMS.map(([itemId]) => itemId));
    placed.automaton.itemFilterIds = Array.isArray(placed.automaton.itemFilterIds)
        ? [...new Set(placed.automaton.itemFilterIds.filter(itemId => validItemIds.has(itemId)))]
        : [];
    if (!isRecord(placed.automaton.facingDirection)
        || ![-1, 0, 1].includes(placed.automaton.facingDirection.x)
        || ![-1, 0, 1].includes(placed.automaton.facingDirection.y)
        || Math.abs(placed.automaton.facingDirection.x) + Math.abs(placed.automaton.facingDirection.y) !== 1) {
        placed.automaton.facingDirection = {
            x: placed.automaton.axis === 'horizontal' ? placed.automaton.direction : 0,
            y: placed.automaton.axis === 'vertical' ? placed.automaton.direction : 0
        };
    }
    placed.automaton.range = Math.max(1, Math.min(5, Math.floor(Number(placed.automaton.range) || 3)));
    if (!isRecord(placed.automaton.origin)
        || !Number.isInteger(placed.automaton.origin.x) || !Number.isInteger(placed.automaton.origin.y)) {
        placed.automaton.origin = { x: placed.x, y: placed.y };
    }
    if (!Object.prototype.hasOwnProperty.call(WORLD_CELL_TYPES, placed.automaton.conditionCellType)) {
        placed.automaton.conditionCellType = '';
    }
    if (!['direct', 'direct2'].includes(WORLD_CELL_TYPES[placed.automaton.transformTargetType]?.category)) {
        placed.automaton.transformTargetType = 'IRON_VEIN';
    }
    return placed.automaton;
}

function getAutomatonCarryCapacity(automaton) {
    return AUTOMATON_CARRY_STACK_SIZE * automaton.carryCapacityMultiplier;
}

function getAutomatonActionDuration(automaton, baseDuration) {
    return baseDuration / automaton.speedMultiplier;
}

function getTrainPowerPerCell(vehicle, wagonCount) {
    const consistSize = Math.max(1, wagonCount + 1);
    const speedMultiplier = Math.max(1, Number(vehicle.speedMultiplier) || 1);
    return TRAIN_BASE_POWER_PER_CELL * speedMultiplier * consistSize * consistSize;
}

function getRailAt(x, y) {
    return state.buildings.find(placed => placed.x === x && placed.y === y
        && BUILDING_BY_ID.get(placed.id)?.role === 'rail');
}

function buildingOccupiesCell(placed, x, y) {
    const definition = BUILDING_BY_ID.get(placed.id);
    return Boolean(definition
        && x >= placed.x && x < placed.x + definition.width
        && y >= placed.y && y < placed.y + definition.height);
}

function isBuildingCellBlocked(x, y, movingInstanceId = null) {
    return state.buildings.some(placed => {
        if (placed.instanceId === movingInstanceId || !buildingOccupiesCell(placed, x, y)) return false;
        const role = BUILDING_BY_ID.get(placed.id)?.role;
        return !['foundation', 'decoration', 'rail'].includes(role);
    });
}

function getAdjacentWagons(placed) {
    const rail = getRailAt(placed.x, placed.y);
    const railDefinition = BUILDING_BY_ID.get(rail?.id);
    if (!rail || !railDefinition) return [];
    return getRailConnections(railDefinition.kind, rail.rotation || 0).flatMap(([dx, dy]) => {
        const position = { x: placed.x + dx, y: placed.y + dy };
        const neighborRail = getRailAt(position.x, position.y);
        const neighborDefinition = BUILDING_BY_ID.get(neighborRail?.id);
        const connected = neighborRail && neighborDefinition
            && getRailConnections(neighborDefinition.kind, neighborRail.rotation || 0)
                .some(([neighborDx, neighborDy]) => neighborDx === -dx && neighborDy === -dy);
        const wagon = connected && state.buildings.find(other => other.x === position.x && other.y === position.y
            && BUILDING_BY_ID.get(other.id)?.role === 'vehicle'
            && BUILDING_BY_ID.get(other.id)?.kind !== 'locomotive');
        return wagon ? [{ wagon, position, direction: [dx, dy] }] : [];
    });
}

function getCoupledWagonsBehind(placed, vehicle) {
    if (!vehicle.previousRail) return [];
    const wagons = [];
    let frontPosition = { x: placed.x, y: placed.y };
    let backPosition = vehicle.previousRail;
    const visited = new Set([`${placed.x},${placed.y}`]);
    while (!visited.has(`${backPosition.x},${backPosition.y}`)) {
        visited.add(`${backPosition.x},${backPosition.y}`);
        const wagon = state.buildings.find(other => other.x === backPosition.x && other.y === backPosition.y
            && BUILDING_BY_ID.get(other.id)?.role === 'vehicle'
            && BUILDING_BY_ID.get(other.id)?.kind !== 'locomotive');
        if (!wagon) break;
        wagons.push({ placed: wagon, from: backPosition, to: frontPosition });
        const next = findNextRailStep(state.buildings, BUILDING_BY_ID, backPosition, frontPosition);
        if (next.error) break;
        frontPosition = backPosition;
        backPosition = next.position;
    }
    return wagons;
}

function getConnectedWagonCount(placed, vehicle, firstStep = null) {
    let previousRail = vehicle.previousRail;
    if (!previousRail && firstStep && !firstStep.error) {
        const adjacentWagons = getAdjacentWagons(placed);
        const wagonBehind = adjacentWagons.find(({ direction }) =>
            direction[0] !== firstStep.direction[0] || direction[1] !== firstStep.direction[1])
            || adjacentWagons[0];
        previousRail = wagonBehind?.position || null;
    }
    return previousRail ? getCoupledWagonsBehind(placed, { ...vehicle, previousRail }).length : 0;
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

function ensureAutomatonPreview() {
    if (automatonSkinPreview) return automatonSkinPreview;
    automatonSkinPreview = new SkinPreview({
        canvas: document.getElementById('automaton-skin-preview'),
        rotation: document.getElementById('automaton-skin-rotation'),
        rotationValue: document.getElementById('automaton-skin-rotation-value'),
        rotateLeft: document.getElementById('automaton-skin-rotate-left'),
        rotateRight: document.getElementById('automaton-skin-rotate-right'),
        beforeDraw: drawAutomatonGearShadow,
        afterDraw: drawAutomatonHeadGear
    });
    return automatonSkinPreview;
}

function renderAutomatonMenu(placed) {
    const automaton = getAutomatonState(placed);
    const definition = BUILDING_BY_ID.get(placed.id);
    document.getElementById('automaton-menu-title').textContent = getBuildingTitle(placed, definition);
    document.getElementById('automaton-custom-name').value = placed.customName || '';
    document.getElementById('automaton-menu-details').textContent = `座標 (${placed.x}, ${placed.y}) / 巡回中心 (${automaton.origin.x}, ${automaton.origin.y})`;
    document.getElementById('automaton-axis').value = automaton.axis;
    document.getElementById('automaton-range').value = String(automaton.range);
    document.getElementById('automaton-action').value = automaton.action;
    document.getElementById('automaton-speed-multiplier').value = String(automaton.speedMultiplier);
    document.getElementById('automaton-carry-capacity').value = String(automaton.carryCapacityMultiplier);
    document.getElementById('automaton-power-per-operation').value = String(automaton.powerPerOperation);
    const isTransportAction = automaton.action === 'STORAGE_TRANSPORT';
    const stopCondition = document.getElementById('automaton-stop-condition');
    stopCondition.querySelector('[value="round-trips"]').hidden = !isTransportAction;
    stopCondition.querySelector('[value="source-empty"]').hidden = !isTransportAction;
    if (!isTransportAction && ['round-trips', 'source-empty'].includes(automaton.stopCondition)) {
        automaton.stopCondition = 'none';
    }
    stopCondition.value = automaton.stopCondition;
    const stopLimitRow = document.getElementById('automaton-stop-limit-row');
    const stopLimit = document.getElementById('automaton-stop-limit');
    const stopLimitLabel = document.getElementById('automaton-stop-limit-label');
    const needsStopLimit = ['item-count', 'round-trips'].includes(automaton.stopCondition);
    stopLimitRow.hidden = !needsStopLimit;
    stopLimitLabel.textContent = automaton.stopCondition === 'round-trips' ? '停止する往復回数' : '停止する個数';
    stopLimit.value = String(automaton.stopCondition === 'round-trips'
        ? automaton.stopAfterRoundTripCount : Math.max(1, automaton.stopAfterItemCount));
    const condition = document.getElementById('automaton-condition-cell');
    if (!condition.options.length) {
        condition.add(new Option('指定なし', ''));
        Object.entries(WORLD_CELL_TYPES).forEach(([type, cell]) => condition.add(new Option(cell.label, type)));
    }
    condition.value = automaton.conditionCellType;
    const transformTarget = document.getElementById('automaton-transform-target');
    if (!transformTarget.options.length) {
        Object.entries(WORLD_CELL_TYPES)
            .filter(([, cell]) => ['direct', 'direct2'].includes(cell.category))
            .forEach(([type, cell]) => transformTarget.add(new Option(cell.label, type)));
    }
    transformTarget.value = automaton.transformTargetType;
    document.querySelector('.automaton-transform-setting').hidden = automaton.action !== 'TERRAIN_TRANSFORM';
    const isStorageAction = ['STORAGE_WITHDRAW', 'STORAGE_DEPOSIT', 'STORAGE_TRANSPORT'].includes(automaton.action);
    document.getElementById('automaton-patrol-settings').hidden = isTransportAction;
    document.getElementById('automaton-transport-settings').hidden = !isTransportAction;
    const transportBounds = getAutomatonTransportBounds(placed, automaton);
    const availableStorages = state.buildings.filter(storage =>
        BUILDING_BY_ID.get(storage.id)?.storageCapacity > 0
        && (!isTransportAction || isStorageWithinAutomatonTransportBounds(storage, transportBounds)));
    const sourceStorage = document.getElementById('automaton-source-storage');
    const destinationStorage = document.getElementById('automaton-destination-storage');
    const storageOptions = [
        new Option('倉庫を選択', ''),
        ...availableStorages.map(storage => new Option(
            `${getBuildingSelectionName(storage)} (${storage.x}, ${storage.y})`,
            storage.instanceId
        ))
    ];
    sourceStorage.replaceChildren(...storageOptions.map(option => option.cloneNode(true)));
    destinationStorage.replaceChildren(...storageOptions.map(option => option.cloneNode(true)));
    sourceStorage.value = automaton.sourceStorageInstanceId;
    destinationStorage.value = automaton.destinationStorageInstanceId;
    if (!sourceStorage.value) automaton.sourceStorageInstanceId = '';
    if (!destinationStorage.value) automaton.destinationStorageInstanceId = '';
    document.getElementById('automaton-storage-filter-settings').hidden = !isStorageAction;
    const itemFilterToggle = document.querySelector('[data-item-filter-toggle]');
    const isIncludingOnly = automaton.itemFilterMode === 'include';
    itemFilterToggle.setAttribute('aria-checked', String(isIncludingOnly));
    itemFilterToggle.setAttribute('aria-label', `対象アイテム: ${isIncludingOnly ? 'のみ' : '以外'}`);
    document.getElementById('automaton-item-filter-toggle-label').textContent =
        isIncludingOnly ? 'のみ' : '以外';
    if (isStorageAction) renderAutomatonItemFilter(automaton);
    renderAutomatonMovementScrollControl(placed);
    const toggle = document.getElementById('automaton-toggle');
    toggle.textContent = automaton.running ? '停止' : '起動';
    toggle.disabled = !automaton.running && !hasAssignedMovementScroll(placed);
    toggle.classList.toggle('inventory-modal-secondary', automaton.running);
    toggle.classList.toggle('saved-scroll-use', !automaton.running);
    const cargoCount = Object.values(automaton.cargo).reduce((total, amount) => total + amount, 0);
    const itemProgressStatus = automaton.stopCondition === 'item-count'
        ? `処理個数 ${automaton.processedItemCount}/${automaton.stopAfterItemCount}`
        : automaton.stopCondition === 'round-trips'
            ? `往復回数 ${automaton.completedRoundTripCount}/${automaton.stopAfterRoundTripCount}`
            : automaton.stopCondition === 'source-empty'
                ? `処理個数 ${automaton.processedItemCount} / 搬出元在庫切れで停止`
                : `処理個数 ${automaton.processedItemCount}`;
    const carryCapacity = getAutomatonCarryCapacity(automaton);
    const transportStatus = isTransportAction
        ? `25×25移動範囲 / 倉庫間の点線が経路 / 積荷 ${cargoCount}/${carryCapacity}`
        : '';
    const movementScrollStatus = hasAssignedMovementScroll(placed) ? '' : '動作スクロール未設定 / ';
    const powerStatus = !engineRuntimeState.creativeMode
        ? `動力 ${formatUtilityAmount(engineRuntimeState.power)} / 作業消費 ${formatUtilityAmount(automaton.powerPerOperation)}`
        : 'クリエイティブ / 動力消費なし';
    document.getElementById('automaton-status').textContent = automaton.running
        ? `稼働中 / ${{ RESOURCE_COLLECTION: '資源を採取', TERRAIN_TRANSFORM: '地形を変成', STORAGE_WITHDRAW: '前方から取り出し', STORAGE_DEPOSIT: '前方へ収納', STORAGE_TRANSPORT: `倉庫間運搬 (${cargoCount}/${carryCapacity})` }[automaton.action]} / ${itemProgressStatus} / ${powerStatus}${isTransportAction ? ' / ' + transportStatus : ''}`
        : `${movementScrollStatus}${automaton.stopReason || '停止中'} / ${itemProgressStatus} / ${powerStatus}${transportStatus ? ` / ${transportStatus}` : ''}`;
    document.getElementById('automaton-skin-name').textContent = `適用中: ${automaton.skinName || 'プレイヤーの見た目'}`;
    const previewSource = automaton.skinUrl || getPlayerSkinConfig().url;
    if (automatonPreviewSource !== previewSource) {
        automatonPreviewSource = previewSource;
        ensureAutomatonPreview().load(previewSource).catch(error => {
            console.error('Automaton skin preview failed to load.', error);
            document.getElementById('automaton-skin-name').textContent = '画像を読み込めませんでした';
        });
    }
    scheduleDraw();
}

async function applyAutomatonSkin(source, name) {
    const placed = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
    if (!placed || BUILDING_BY_ID.get(placed.id)?.kind !== 'automaton') return;
    const url = String(source || '').trim();
    if (!url) return;
    try {
        await ensureAutomatonPreview().load(url);
        automatonPreviewSource = url;
    } catch (error) {
        console.error('Automaton skin failed to load.', error);
        showAppNotice('画像を読み込めませんでした。');
        return;
    }
    const automaton = getAutomatonState(placed);
    automaton.skinUrl = url;
    automaton.skinName = name || getSkinNameFromSource(url);
    document.getElementById('automaton-skin-name').textContent = `適用中: ${automaton.skinName}`;
    automatonSkinRenderers.delete(placed.instanceId);
    saveBuildings();
    scheduleDraw();
}

function changeAutomatonSetting(setting, value) {
    const placed = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
    if (!placed || BUILDING_BY_ID.get(placed.id)?.kind !== 'automaton') return;
    const automaton = getAutomatonState(placed);
    if (setting === 'axis') automaton.axis = value === 'vertical' ? 'vertical' : 'horizontal';
    if (setting === 'range') automaton.range = Math.max(1, Math.min(5, Math.floor(Number(value) || 1)));
    if (setting === 'speedMultiplier') {
        const multiplier = Number(value);
        automaton.speedMultiplier = AUTOMATON_SPEED_MULTIPLIERS.includes(multiplier) ? multiplier : 1;
    }
    if (setting === 'carryCapacityMultiplier') {
        const multiplier = Number(value);
        automaton.carryCapacityMultiplier = AUTOMATON_CARRY_MULTIPLIERS.includes(multiplier) ? multiplier : 1;
    }
    if (setting === 'powerPerOperation') {
        automaton.powerPerOperation = Math.max(0, Math.min(1000, Number(value) || 0));
    }
    if (setting === 'stopCondition') {
        const allowedConditions = automaton.action === 'STORAGE_TRANSPORT'
            ? ['none', 'item-count', 'round-trips', 'source-empty']
            : ['none', 'item-count'];
        automaton.stopCondition = allowedConditions.includes(value) ? value : 'none';
    }
    if (setting === 'stopLimit') {
        const limit = Math.max(1, Math.min(1_000_000_000, Math.floor(Number(value) || 1)));
        if (automaton.stopCondition === 'round-trips') automaton.stopAfterRoundTripCount = limit;
        else automaton.stopAfterItemCount = limit;
        if (automaton.running && automaton.stopCondition === 'item-count'
            && automaton.processedItemCount >= automaton.stopAfterItemCount) {
            stopAutomatonAtItemLimit(placed, automaton);
        }
        if (automaton.running && automaton.stopCondition === 'round-trips'
            && automaton.completedRoundTripCount >= automaton.stopAfterRoundTripCount) {
            stopAutomatonAtRoundTripLimit(placed, automaton);
        }
    }
    if (setting === 'stopCondition' && automaton.running) {
        if (automaton.stopCondition === 'item-count'
            && automaton.processedItemCount >= automaton.stopAfterItemCount) {
            stopAutomatonAtItemLimit(placed, automaton);
        } else if (automaton.stopCondition === 'round-trips'
            && automaton.completedRoundTripCount >= automaton.stopAfterRoundTripCount) {
            stopAutomatonAtRoundTripLimit(placed, automaton);
        } else if (automaton.stopCondition === 'source-empty'
            && automaton.transportTargetStorageInstanceId === automaton.sourceStorageInstanceId
            && !hasAutomatonTransportItems(
                state.buildings.find(storage => storage.instanceId === automaton.sourceStorageInstanceId),
                automaton
            )) {
            stopAutomatonWithReason(placed, automaton, '運搬するアイテムがありません');
        }
    }
    if (setting === 'action') {
        automaton.action = ['TERRAIN_TRANSFORM', 'STORAGE_WITHDRAW', 'STORAGE_DEPOSIT', 'STORAGE_TRANSPORT'].includes(value)
            ? value : 'RESOURCE_COLLECTION';
        automatonTransportRoutes.delete(placed.instanceId);
        automaton.movement = null;
        if (automaton.action === 'STORAGE_TRANSPORT' && automaton.running) {
            automaton.origin = { x: placed.x, y: placed.y };
        }
    }
    if (setting === 'sourceStorageInstanceId' || setting === 'destinationStorageInstanceId') {
        const selectedStorage = state.buildings.find(storage => storage.instanceId === value
            && BUILDING_BY_ID.get(storage.id)?.storageCapacity > 0
            && (automaton.action !== 'STORAGE_TRANSPORT'
                || isStorageWithinAutomatonTransportBounds(storage, getAutomatonTransportBounds(placed, automaton))));
        const otherId = setting === 'sourceStorageInstanceId'
            ? automaton.destinationStorageInstanceId : automaton.sourceStorageInstanceId;
        if (selectedStorage && selectedStorage.instanceId === otherId) {
            showAppNotice('搬出元と搬入先には別々の倉庫を選択してください。');
        } else {
            automaton[setting] = selectedStorage?.instanceId || '';
        }
        if (automaton.running && automaton.action === 'STORAGE_TRANSPORT') {
            automatonTransportRoutes.delete(placed.instanceId);
            automaton.movement = null;
            automaton.transportTargetStorageInstanceId = Object.values(automaton.cargo).some(amount => amount > 0)
                ? automaton.destinationStorageInstanceId
                : automaton.sourceStorageInstanceId;
        }
    }
    if (setting === 'conditionCellType') automaton.conditionCellType = Object.prototype.hasOwnProperty.call(WORLD_CELL_TYPES, value) ? value : '';
    if (setting === 'transformTargetType' && ['direct', 'direct2'].includes(WORLD_CELL_TYPES[value]?.category)) {
        automaton.transformTargetType = value;
    }
    if (setting === 'itemFilterMode') automaton.itemFilterMode = value === 'exclude' ? 'exclude' : 'include';
    if (setting === 'itemFilterIds' && Array.isArray(value)) {
        const validItemIds = new Set(CRAFTING_ITEMS.map(([itemId]) => itemId));
        automaton.itemFilterIds = [...new Set(value.filter(itemId => validItemIds.has(itemId)))];
    }
    if (['action', 'sourceStorageInstanceId', 'destinationStorageInstanceId'].includes(setting)
        && automaton.action === 'STORAGE_TRANSPORT'
        && automaton.sourceStorageInstanceId && automaton.destinationStorageInstanceId
        && !getAutomatonTransportPlan(placed, automaton)) {
        showAppNotice('搬送可能経路がありません');
    }
    renderAutomatonMenu(placed);
    saveBuildings();
    scheduleDraw();
}

function renderAutomatonItemFilter(automaton) {
    const select = document.getElementById('automaton-item-selection');
    const selectedItemId = select.value;
    if (!select.options.length) {
        select.replaceChildren(...CRAFTING_ITEMS.map(([itemId, name]) => new Option(name, itemId)));
        select.value = CRAFTING_ITEMS[0]?.[0] || '';
    } else if (!CRAFTING_ITEM_BY_ID.has(selectedItemId)) {
        select.value = CRAFTING_ITEMS[0]?.[0] || '';
    }
    const currentItemId = select.value;
    const currentName = getCraftingItemName(currentItemId);
    document.getElementById('automaton-item-icon').replaceChildren(createBuildingStorageIcon(currentItemId));
    document.getElementById('automaton-item-name').textContent = currentName;
    const button = document.getElementById('automaton-item-button');
    button.setAttribute('aria-label', `登録するアイテム: ${currentName}。タップして変更`);

    const search = normalizeInventorySearch(document.getElementById('automaton-item-search').value);
    const optionList = document.getElementById('automaton-item-option-list');
    const options = CRAFTING_ITEMS.filter(([itemId, name]) =>
        !search || normalizeInventorySearch(`${name} ${itemId}`).includes(search));
    optionList.replaceChildren(...options.map(([itemId, name]) => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = `building-storage-item-option${itemId === currentItemId ? ' is-selected' : ''}`;
        option.dataset.itemId = itemId;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(itemId === currentItemId));
        option.appendChild(createBuildingStorageIcon(itemId));
        const itemName = document.createElement('span');
        itemName.className = 'building-storage-item-option-name';
        itemName.textContent = name;
        const quantity = document.createElement('span');
        quantity.className = 'building-storage-item-option-count';
        quantity.textContent = formatInventoryCount(itemId, getStorageInventoryCount(itemId));
        option.append(itemName, quantity);
        return option;
    }));

    const registeredItems = document.getElementById('automaton-registered-items');
    registeredItems.replaceChildren(...automaton.itemFilterIds.map(itemId => {
        const item = document.createElement('span');
        item.className = 'automaton-registered-item';
        const icon = createBuildingStorageIcon(itemId);
        const name = document.createElement('span');
        name.className = 'automaton-registered-item-name';
        name.textContent = getCraftingItemName(itemId);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'automaton-registered-item-remove';
        remove.dataset.itemId = itemId;
        remove.setAttribute('aria-label', `${getCraftingItemName(itemId)}の登録を解除`);
        remove.textContent = '×';
        item.append(icon, name, remove);
        return item;
    }));
}

function getAutomatonSkinRenderer(placed, automaton) {
    const cached = automatonSkinRenderers.get(placed.instanceId);
    const source = automaton.skinUrl || getPlayerSkinConfig().url;
    if (cached?.source === source) return cached.renderer;
    const renderer = new SkinRenderer();
    renderer.setDirection(0, 1);
    automatonSkinRenderers.set(placed.instanceId, { source, renderer });
    renderer.loadSkin(source).then(scheduleDraw).catch(error => {
        console.warn(`Automaton skin failed to load for ${placed.instanceId}; using fallback rendering.`, error);
    });
    return renderer;
}

function traceGearPath(context, centerX, centerY, outerRadius, teeth = 8) {
    const steps = teeth * 4;
    for (let step = 0; step < steps; step += 1) {
        const angle = (Math.PI * 2 * step / steps) - Math.PI / 2;
        const phase = step % 4;
        const radius = phase === 0 || phase === 3 ? outerRadius : outerRadius * .78;
        const pointX = centerX + Math.cos(angle) * radius;
        const pointY = centerY + Math.sin(angle) * radius;
        if (step === 0) context.moveTo(pointX, pointY);
        else context.lineTo(pointX, pointY);
    }
    context.closePath();
}

function drawAutomatonGearShadow(context, x, y, size, running = false) {
    context.save();
    context.translate(x + size / 2, y + size * .8);
    context.scale(1, .34);
    context.beginPath();
    traceGearPath(context, 0, 0, size * .54);
    context.fillStyle = running ? '#bd7d28' : '#8b5e27';
    context.strokeStyle = running ? '#fff0a0' : '#e9bd62';
    context.lineWidth = Math.max(1, size * .024);
    context.shadowColor = running ? '#ffc94d' : 'transparent';
    context.shadowBlur = running ? size * .13 : 0;
    context.fill();
    context.stroke();
    context.shadowBlur = 0;
    context.beginPath();
    context.arc(0, 0, size * .3, 0, Math.PI * 2);
    context.fillStyle = running ? '#293a32' : '#252d28';
    context.fill();
    context.strokeStyle = running ? '#ffe38a' : '#d8a84b';
    context.lineWidth = Math.max(1, size * .02);
    context.stroke();
    context.beginPath();
    context.arc(0, 0, size * .09, 0, Math.PI * 2);
    context.fillStyle = running ? '#ffdf70' : '#c38a35';
    context.fill();
    context.strokeStyle = '#f7d67d';
    context.lineWidth = Math.max(1, size * .016);
    context.stroke();
    for (let spoke = 0; spoke < 8; spoke += 1) {
        const angle = Math.PI * spoke / 4;
        context.beginPath();
        context.moveTo(Math.cos(angle) * size * .1, Math.sin(angle) * size * .1);
        context.lineTo(Math.cos(angle) * size * .27, Math.sin(angle) * size * .27);
        context.stroke();
    }
    context.restore();
}

function drawAutomatonHeadGear(context, x, y, size, direction = 0) {
    const isRight = direction === 3;
    const isLeft = direction === 2;
    const centerX = x + size * (isLeft ? .34 : isRight ? .66 : .69);
    const centerY = y + size * .2;
    const radius = size * .065;
    context.save();
    context.lineJoin = 'round';
    context.lineWidth = Math.max(1, size * .012);
    context.beginPath();
    traceGearPath(context, centerX, centerY, radius, 6);
    context.fillStyle = '#74552e';
    context.strokeStyle = '#edca72';
    context.fill();
    context.stroke();
    context.beginPath();
    context.arc(centerX, centerY, radius * .38, 0, Math.PI * 2);
    context.fillStyle = '#283934';
    context.fill();
    context.strokeStyle = '#f0d68d';
    context.lineWidth = Math.max(1, size * .009);
    context.stroke();
    context.restore();
}

function drawAutomatonSkin(context, renderer, x, y, size, running = false) {
    drawAutomatonGearShadow(context, x, y, size, running);
    renderer.draw(context, x, y, size, { drawShadow: false });
    drawAutomatonHeadGear(context, x, y, size, renderer.direction);
}

function drawAutomaton(placed, now) {
    const automaton = getAutomatonState(placed);
    const movement = automaton.movement;
    const progress = movement
        ? Math.max(0, Math.min(1, (now - movement.startedAt) / movement.durationMs))
        : 1;
    const x = movement ? movement.from.x + (movement.to.x - movement.from.x) * progress : placed.x;
    const y = movement ? movement.from.y + (movement.to.y - movement.from.y) * progress : placed.y;
    const renderer = getAutomatonSkinRenderer(placed, automaton);
    const facing = movement
        ? { x: movement.to.x - movement.from.x, y: movement.to.y - movement.from.y }
        : automaton.facingDirection;
    renderer.setDirection(facing.x, facing.y);
    const size = state.tileSize * 0.88;
    const drawX = x * state.tileSize + (state.tileSize - size) / 2;
    const drawY = y * state.tileSize + (state.tileSize - size) / 2;
    drawAutomatonSkin(ctx, renderer, drawX, drawY, size, automaton.running);
}

function canAutomatonEnter(placed, x, y) {
    if (x < 0 || y < 0 || x >= state.cols || y >= state.rows) return false;
    const tile = state.map[y]?.[x];
    if (!tile) return false;
    const items = new Set(state.inventoryItems);
    Object.entries(engineRuntimeState.materialInventory || {}).forEach(([item, count]) => {
        if (Number(count) > 0) items.add(item);
    });
    if (engineRuntimeState.brass > 0) items.add('brass-stock');
    if (!canEnterCell(tile, { rules: state.cellEntryRules, items })) return false;
    if (state.player.x === x && state.player.y === y) return false;
    if (isBuildingCellBlocked(x, y, placed.instanceId)) return false;
    return !state.buildings.some(building =>
        BUILDING_BY_ID.get(building.id)?.role === 'rail'
        && buildingOccupiesCell(building, x, y));
}

function getAutomatonTransportBounds(placed, automaton) {
    const center = automaton.running && isRecord(automaton.origin)
        ? automaton.origin
        : placed;
    return {
        minX: Math.max(0, center.x - AUTOMATON_TRANSPORT_RADIUS),
        maxX: Math.min(state.cols - 1, center.x + AUTOMATON_TRANSPORT_RADIUS),
        minY: Math.max(0, center.y - AUTOMATON_TRANSPORT_RADIUS),
        maxY: Math.min(state.rows - 1, center.y + AUTOMATON_TRANSPORT_RADIUS)
    };
}

function isInsideAutomatonTransportBounds(x, y, bounds) {
    return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
}

function isStorageWithinAutomatonTransportBounds(storage, bounds) {
    const definition = BUILDING_BY_ID.get(storage.id);
    return Boolean(definition?.storageCapacity > 0
        && storage.x >= bounds.minX && storage.y >= bounds.minY
        && storage.x + definition.width - 1 <= bounds.maxX
        && storage.y + definition.height - 1 <= bounds.maxY);
}

function getAutomatonWalkPaths(placed, start, bounds, additionalStarts = []) {
    const items = new Set(state.inventoryItems);
    Object.entries(engineRuntimeState.materialInventory || {}).forEach(([item, count]) => {
        if (Number(count) > 0) items.add(item);
    });
    if (engineRuntimeState.brass > 0) items.add('brass-stock');
    const blockedCells = new Set();
    state.buildings.forEach(building => {
        if (building.instanceId === placed.instanceId) return;
        const role = BUILDING_BY_ID.get(building.id)?.role;
        if (['foundation', 'decoration'].includes(role)) return;
        const definition = BUILDING_BY_ID.get(building.id);
        if (!definition) return;
        for (let y = building.y; y < building.y + definition.height; y++) {
            for (let x = building.x; x < building.x + definition.width; x++) {
                blockedCells.add(`${x},${y}`);
            }
        }
    });
    const entryOptions = { rules: state.cellEntryRules, items };
    const canEnter = (x, y) => {
        const tile = state.map[y]?.[x];
        return Boolean(tile && !(state.player.x === x && state.player.y === y)
            && !blockedCells.has(`${x},${y}`)
            && canEnterCell(tile, entryOptions));
    };
    const previousByKey = new Map();
    const queue = [];
    for (const point of [start, ...additionalStarts]) {
        const key = `${point.x},${point.y}`;
        if (previousByKey.has(key) || !isInsideAutomatonTransportBounds(point.x, point.y, bounds)
            || !canEnter(point.x, point.y)) continue;
        previousByKey.set(key, null);
        queue.push({ x: point.x, y: point.y });
    }
    if (!queue.length) return previousByKey;
    const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let index = 0; index < queue.length; index++) {
        const current = queue[index];
        for (const [dx, dy] of directions) {
            const next = { x: current.x + dx, y: current.y + dy };
            const key = `${next.x},${next.y}`;
            if (previousByKey.has(key) || !isInsideAutomatonTransportBounds(next.x, next.y, bounds)
                || !canEnter(next.x, next.y)) continue;
            previousByKey.set(key, `${current.x},${current.y}`);
            queue.push(next);
        }
    }
    return previousByKey;
}

function getAutomatonPathTo(paths, target) {
    const targetKey = `${target.x},${target.y}`;
    if (!paths.has(targetKey)) return null;
    const path = [];
    let currentKey = targetKey;
    while (currentKey !== null) {
        const [x, y] = currentKey.split(',').map(Number);
        path.push({ x, y });
        currentKey = paths.get(currentKey);
    }
    return path.reverse();
}

function getAutomatonStorageApproaches(storage, placed, bounds) {
    const definition = BUILDING_BY_ID.get(storage.id);
    if (!isStorageWithinAutomatonTransportBounds(storage, bounds)) return [];
    const right = storage.x + definition.width - 1;
    const bottom = storage.y + definition.height - 1;
    const approaches = new Map();
    const add = (x, y, facingDirection) => {
        const key = `${x},${y}`;
        if (!isInsideAutomatonTransportBounds(x, y, bounds)
            || !canAutomatonEnter(placed, x, y)) return;
        approaches.set(key, { x, y, facingDirection });
    };
    for (let x = storage.x; x <= right; x++) {
        add(x, storage.y - 1, { x: 0, y: 1 });
        add(x, bottom + 1, { x: 0, y: -1 });
    }
    for (let y = storage.y; y <= bottom; y++) {
        add(storage.x - 1, y, { x: 1, y: 0 });
        add(right + 1, y, { x: -1, y: 0 });
    }
    return [...approaches.values()];
}

function findAutomatonRouteToStorage(placed, start, storage, bounds) {
    const approaches = getAutomatonStorageApproaches(storage, placed, bounds);
    if (!approaches.length) return null;
    const paths = getAutomatonWalkPaths(placed, start, bounds);
    let bestRoute = null;
    for (const approach of approaches) {
        const path = getAutomatonPathTo(paths, approach);
        if (path && (!bestRoute || path.length < bestRoute.path.length)) {
            bestRoute = { path, approach };
        }
    }
    return bestRoute;
}

function findAutomatonRouteToApproach(placed, start, approach, bounds) {
    const paths = getAutomatonWalkPaths(placed, start, bounds);
    const path = getAutomatonPathTo(paths, approach);
    return path ? { path, approach } : null;
}

function findAutomatonRouteBetweenStorages(placed, source, destination, bounds, reachableFromStart) {
    const sourceApproaches = getAutomatonStorageApproaches(source, placed, bounds)
        .filter(approach => reachableFromStart.has(`${approach.x},${approach.y}`));
    const destinationApproaches = getAutomatonStorageApproaches(destination, placed, bounds);
    if (!sourceApproaches.length || !destinationApproaches.length) return null;
    const sourceApproachByKey = new Map(sourceApproaches.map(approach => [
        `${approach.x},${approach.y}`, approach
    ]));
    const paths = getAutomatonWalkPaths(placed, sourceApproaches[0], bounds, sourceApproaches.slice(1));
    let bestRoute = null;
    for (const destinationApproach of destinationApproaches) {
        const path = getAutomatonPathTo(paths, destinationApproach);
        if (!path || bestRoute && path.length >= bestRoute.path.length) continue;
        bestRoute = {
            path,
            sourceApproach: sourceApproachByKey.get(`${path[0].x},${path[0].y}`),
            destinationApproach
        };
    }
    return bestRoute;
}

function getAutomatonTransportPlan(placed, automaton, start = placed) {
    const bounds = getAutomatonTransportBounds(placed, automaton);
    const source = state.buildings.find(building => building.instanceId === automaton.sourceStorageInstanceId);
    const destination = state.buildings.find(building => building.instanceId === automaton.destinationStorageInstanceId);
    if (!source || !destination || source.instanceId === destination.instanceId
        || !isStorageWithinAutomatonTransportBounds(source, bounds)
        || !isStorageWithinAutomatonTransportBounds(destination, bounds)) return null;
    const reachableFromStart = getAutomatonWalkPaths(placed, start, bounds);
    const connection = findAutomatonRouteBetweenStorages(
        placed, source, destination, bounds, reachableFromStart
    );
    if (!connection) return null;
    const sourceRoute = {
        path: getAutomatonPathTo(reachableFromStart, connection.sourceApproach),
        approach: connection.sourceApproach
    };
    if (!sourceRoute.path) return null;
    const destinationRoute = {
        path: connection.path,
        approach: connection.destinationApproach
    };
    return { bounds, sourceRoute, destinationRoute };
}

function getCachedAutomatonTransportPlan(placed, automaton, start = placed) {
    const key = [
        buildingNavigationRevision,
        placed.instanceId,
        start.x, start.y,
        automaton.origin.x, automaton.origin.y,
        automaton.sourceStorageInstanceId,
        automaton.destinationStorageInstanceId
    ].join(':');
    const cached = automatonTransportPlanCache.get(placed.instanceId);
    if (cached?.key === key) return cached.plan;
    const plan = getAutomatonTransportPlan(placed, automaton, start);
    automatonTransportPlanCache.set(placed.instanceId, { key, plan });
    return plan;
}

function setAutomatonTransportRoute(
    placed, automaton, targetStorageInstanceId, precomputedRoute = null, transportPlan = null
) {
    const bounds = getAutomatonTransportBounds(placed, automaton);
    const storage = state.buildings.find(building => building.instanceId === targetStorageInstanceId);
    if (!storage || !isStorageWithinAutomatonTransportBounds(storage, bounds)) return false;
    const route = precomputedRoute || findAutomatonRouteToStorage(placed, placed, storage, bounds);
    if (!route) return false;
    automaton.transportTargetStorageInstanceId = targetStorageInstanceId;
    automatonTransportRoutes.set(placed.instanceId, {
        path: route.path,
        index: 1,
        approach: route.approach,
        targetStorageInstanceId,
        cyclePath: transportPlan?.destinationRoute.path || null,
        sourceApproach: transportPlan?.sourceRoute.approach || null,
        destinationApproach: transportPlan?.destinationRoute.approach || null,
        buildingRevision: buildingNavigationRevision
    });
    return true;
}

function rebuildAutomatonTransportRoute(placed, automaton, targetStorageInstanceId) {
    const plan = getCachedAutomatonTransportPlan(placed, automaton);
    if (!plan) return false;
    const currentRoute = targetStorageInstanceId === automaton.sourceStorageInstanceId
        ? plan.sourceRoute
        : targetStorageInstanceId === automaton.destinationStorageInstanceId
            ? findAutomatonRouteToApproach(
                placed,
                placed,
                plan.destinationRoute.approach,
                plan.bounds
            )
            : null;
    return Boolean(currentRoute && setAutomatonTransportRoute(
        placed, automaton, targetStorageInstanceId, currentRoute, plan
    ));
}

function getAutomatonStorageTarget(placed, automaton) {
    const { x: dx, y: dy } = automaton.facingDirection;
    const targetX = placed.x + dx;
    const targetY = placed.y + dy;
    return state.buildings.find(other => {
        const definition = BUILDING_BY_ID.get(other.id);
        return definition?.storageCapacity > 0 && buildingOccupiesCell(other, targetX, targetY);
    });
}

function getAutomatonItemCountRemaining(automaton) {
    return automaton.stopCondition === 'item-count'
        ? Math.max(0, automaton.stopAfterItemCount - automaton.processedItemCount)
        : Infinity;
}

function stopAutomatonWithReason(placed, automaton, reason) {
    automaton.running = false;
    automaton.movement = null;
    automaton.stopReason = reason;
    automatonTransportRoutes.delete(placed.instanceId);
    saveBuildings();
    if (selectedBuildingInstanceId === placed.instanceId) renderAutomatonMenu(placed);
    scheduleDraw();
}

function recordAutomatonItemProgress(automaton, amount) {
    automaton.processedItemCount += Math.max(0, Math.floor(Number(amount) || 0));
    return automaton.stopCondition === 'item-count'
        && automaton.processedItemCount >= automaton.stopAfterItemCount;
}

function stopAutomatonAtItemLimit(placed, automaton) {
    stopAutomatonWithReason(placed, automaton, '指定したアイテム数に到達');
}

function stopAutomatonAtRoundTripLimit(placed, automaton) {
    stopAutomatonWithReason(placed, automaton, '指定した往復回数に到達');
}

function hasAutomatonTransportItems(storage, automaton) {
    if (!storage) return false;
    const selectedItems = new Set(automaton.itemFilterIds);
    return CRAFTING_ITEMS.some(([itemId]) => {
        const isSelected = selectedItems.has(itemId);
        const included = automaton.itemFilterMode === 'include' ? isSelected : !isSelected;
        return included && getStorageMaterialCount(storage, itemId) > 0;
    });
}

function transferAutomatonStorage(placed, automaton) {
    const storage = getAutomatonStorageTarget(placed, automaton);
    const definition = BUILDING_BY_ID.get(storage?.id);
    if (!storage || !definition?.storageCapacity) return false;
    if (!isRecord(storage.storedMaterials)) storage.storedMaterials = {};

    const selectedItems = new Set(automaton.itemFilterIds);
    const itemIds = CRAFTING_ITEMS
        .map(([itemId]) => itemId)
        .filter(itemId => automaton.itemFilterMode === 'include'
            ? selectedItems.has(itemId)
            : !selectedItems.has(itemId));
    let changed = false;
    let movedTotal = 0;
    let remainingQuota = Math.min(getAutomatonCarryCapacity(automaton), getAutomatonItemCountRemaining(automaton));
    for (const itemId of itemIds) {
        const resourceKey = { water: 'water', fog: 'fog', power: 'power', steam_power: 'steamPower' }[itemId];
        const storedCount = Math.floor(getStorageMaterialCount(storage, itemId));
        const inventoryCount = Math.floor(getStorageInventoryCount(itemId));
        if (automaton.action === 'STORAGE_DEPOSIT') {
            const freeSlots = Math.max(0, definition.storageCapacity - getStorageUsedSlots(storage));
            const stackSpace = storedCount > 0 ? Math.ceil(storedCount / 99) * 99 - storedCount : 0;
            const moved = Math.min(inventoryCount, stackSpace + freeSlots * 99, remainingQuota);
            if (moved < 1) continue;
            storage.storedMaterials[itemId] = storedCount + moved;
            if (itemId === 'brass-stock') engineRuntimeState.brass -= moved;
            else if (resourceKey) engineRuntimeState[resourceKey] -= moved;
            else engineRuntimeState.materialInventory[itemId] -= moved;
            remainingQuota -= moved;
            movedTotal += moved;
        } else {
            if (storedCount > 0 && inventoryCount <= 0 && !canAddInventoryItems([itemId])) {
                notifyInventoryFull();
                continue;
            }
            const moved = Math.min(storedCount, remainingQuota);
            if (moved < 1) continue;
            storage.storedMaterials[itemId] = storedCount - moved;
            if (itemId === 'brass-stock') engineRuntimeState.brass += moved;
            else if (resourceKey) engineRuntimeState[resourceKey] += moved;
            else engineRuntimeState.materialInventory[itemId] =
                (Number(engineRuntimeState.materialInventory[itemId]) || 0) + moved;
            remainingQuota -= moved;
            movedTotal += moved;
        }
        changed = true;
        break;
    }
    if (!changed) return false;
    const reachedItemLimit = recordAutomatonItemProgress(automaton, movedTotal);
    saveBuildings();
    engineRuntimeState.saveGameData();
    engineRuntimeState.notify();
    if (reachedItemLimit) stopAutomatonAtItemLimit(placed, automaton);
    return true;
}

function transferAutomatonBetweenStorages(placed, automaton) {
    const storage = getAutomatonStorageTarget(placed, automaton);
    if (!storage || storage.instanceId === automaton.sourceStorageInstanceId
        && storage.instanceId === automaton.destinationStorageInstanceId) return false;
    const definition = BUILDING_BY_ID.get(storage.id);
    if (!definition?.storageCapacity) return false;
    if (!isRecord(storage.storedMaterials)) storage.storedMaterials = {};

    const cargoCount = Object.values(automaton.cargo).reduce((total, amount) => total + amount, 0);
    const selectedItems = new Set(automaton.itemFilterIds);
    const itemIds = CRAFTING_ITEMS
        .map(([itemId]) => itemId)
        .filter(itemId => automaton.itemFilterMode === 'include'
            ? selectedItems.has(itemId)
            : !selectedItems.has(itemId));
    let changed = false;
    let movedTotal = 0;

    if (cargoCount === 0 && storage.instanceId === automaton.sourceStorageInstanceId) {
        let remainingCapacity = Math.min(getAutomatonCarryCapacity(automaton), getAutomatonItemCountRemaining(automaton));
        for (const itemId of itemIds) {
            const storedCount = Math.floor(getStorageMaterialCount(storage, itemId));
            const moved = Math.min(storedCount, remainingCapacity);
            if (moved < 1) continue;
            storage.storedMaterials[itemId] = storedCount - moved;
            automaton.cargo[itemId] = moved;
            remainingCapacity -= moved;
            changed = true;
            break;
        }
    } else if (cargoCount > 0 && storage.instanceId === automaton.destinationStorageInstanceId) {
        for (const itemId of Object.keys(automaton.cargo)) {
            if (!itemIds.includes(itemId)) continue;
            const storedCount = Math.floor(getStorageMaterialCount(storage, itemId));
            const usedSlots = getStorageUsedSlots(storage);
            const freeSlots = Math.max(0, definition.storageCapacity - usedSlots);
            const stackSpace = storedCount > 0 ? (99 - storedCount % 99) % 99 : 0;
            const storageSpace = stackSpace + freeSlots * 99;
            const moved = Math.min(automaton.cargo[itemId], storageSpace);
            if (moved < 1) continue;
            storage.storedMaterials[itemId] = storedCount + moved;
            automaton.cargo[itemId] -= moved;
            if (automaton.cargo[itemId] === 0) delete automaton.cargo[itemId];
            changed = true;
            movedTotal += moved;
        }
    }

    if (!changed) return false;
    if (movedTotal > 0) recordAutomatonItemProgress(automaton, movedTotal);
    saveBuildings();
    return true;
}

function processAutomatonCell(placed, automaton) {
    const tile = state.map[placed.y]?.[placed.x];
    if (!tile || automaton.conditionCellType && getCellTypeKey(tile) !== automaton.conditionCellType) return false;
    const creativeMode = Boolean(engineRuntimeState.creativeMode);
    const operationPower = creativeMode ? 0 : automaton.powerPerOperation;
    if (!creativeMode && Number(engineRuntimeState.power) < operationPower) {
        stopAutomatonWithReason(placed, automaton, '動力不足');
        return false;
    }
    if (['STORAGE_WITHDRAW', 'STORAGE_DEPOSIT'].includes(automaton.action)) {
        const transferred = transferAutomatonStorage(placed, automaton);
        if (transferred && !creativeMode) {
            engineRuntimeState.power -= operationPower;
            engineRuntimeState.saveGameData();
            engineRuntimeState.notify();
        }
        return transferred;
    }
    if (automaton.action === 'STORAGE_TRANSPORT') {
        const transferred = transferAutomatonBetweenStorages(placed, automaton);
        if (transferred && !creativeMode) {
            engineRuntimeState.power -= operationPower;
            engineRuntimeState.saveGameData();
            engineRuntimeState.notify();
        }
        return transferred;
    }
    const mode = automaton.action;
    const operationMaterials = creativeMode
        ? Object.fromEntries(Object.keys(TERRAIN_TRANSFORM_RECIPES[automaton.transformTargetType] || {})
            .map(item => [item, Number.MAX_SAFE_INTEGER]))
        : engineRuntimeState.materialInventory;
    const result = handleWorldCellOperation({
        target: { x: placed.x, y: placed.y },
        mode,
        terrainTargetType: automaton.transformTargetType,
        materials: operationMaterials,
        power: creativeMode ? Number.MAX_SAFE_INTEGER : engineRuntimeState.power - operationPower
    });
    if (!result?.success) {
        if (!creativeMode && mode === 'RESOURCE_COLLECTION') {
            const requiredPower = operationPower + getCellCollectionPowerCost(
                getCellTypeKey(tile), Number(tile.collectionCount) || 0
            );
            if (Number(engineRuntimeState.power) < requiredPower) {
                stopAutomatonWithReason(placed, automaton, '動力不足');
            }
        }
        return false;
    }
    if (!creativeMode) {
        Object.entries(result.consumedItems || {}).forEach(([item, amount]) => {
            engineRuntimeState.materialInventory[item] = Math.max(0, (Number(engineRuntimeState.materialInventory[item]) || 0) - amount);
        });
        engineRuntimeState.power = Math.max(0, engineRuntimeState.power - operationPower - (Number(result.consumedPower) || 0));
    }
    Object.entries(result.producedItems || {}).forEach(([item, amount]) => {
        engineRuntimeState.materialInventory[item] = (Number(engineRuntimeState.materialInventory[item]) || 0) + amount;
    });
    const producedItemCount = Object.values(result.producedItems || {})
        .reduce((total, amount) => total + Math.max(0, Math.floor(Number(amount) || 0)), 0);
    engineRuntimeState.saveGameData();
    engineRuntimeState.notify();
    if (producedItemCount > 0 && recordAutomatonItemProgress(automaton, producedItemCount)) {
        stopAutomatonAtItemLimit(placed, automaton);
    }
    return true;
}

function tryAutomatonStorageTransfer(placed, automaton, direction, now) {
    if (!['STORAGE_WITHDRAW', 'STORAGE_DEPOSIT', 'STORAGE_TRANSPORT'].includes(automaton.action)) return false;
    automaton.facingDirection = direction;
    if (!getAutomatonStorageTarget(placed, automaton)) return false;
    if (!processAutomatonCell(placed, automaton)) return false;
    automaton.nextMoveAt = now + getAutomatonActionDuration(automaton, 1400);
    return true;
}

function stopAutomatonWithoutTransportRoute(placed, automaton) {
    automaton.running = false;
    automaton.movement = null;
    automaton.stopReason = '搬送可能経路がありません';
    automatonTransportRoutes.delete(placed.instanceId);
    saveBuildings();
    if (selectedBuildingInstanceId === placed.instanceId) renderAutomatonMenu(placed);
    showAppNotice('搬送可能経路がありません');
    scheduleDraw();
}

function finishAutomatonTransportLeg(placed, automaton, route, now) {
    automaton.facingDirection = route.approach.facingDirection;
    const reachedSource = route.targetStorageInstanceId === automaton.sourceStorageInstanceId;
    if (reachedSource && automaton.deliveredAtDestination) {
        automaton.completedRoundTripCount += 1;
        automaton.deliveredAtDestination = false;
        if (automaton.stopCondition === 'round-trips'
            && automaton.completedRoundTripCount >= automaton.stopAfterRoundTripCount) {
            stopAutomatonAtRoundTripLimit(placed, automaton);
            return false;
        }
    }
    if (reachedSource && automaton.stopCondition === 'item-count'
        && getAutomatonItemCountRemaining(automaton) <= 0) {
        stopAutomatonAtItemLimit(placed, automaton);
        return false;
    }
    const transferSucceeded = processAutomatonCell(placed, automaton);
    if (!automaton.running) return false;
    if (reachedSource && !Object.values(automaton.cargo).some(amount => amount > 0)) {
        const hasSourceItems = hasAutomatonTransportItems(
            state.buildings.find(storage => storage.instanceId === automaton.sourceStorageInstanceId),
            automaton
        );
        if (!hasSourceItems && automaton.stopCondition !== 'none') {
            stopAutomatonWithReason(placed, automaton, '運搬するアイテムがありません');
            return false;
        }
    }
    const cargoCount = Object.values(automaton.cargo).reduce((total, amount) => total + amount, 0);
    if (!reachedSource && cargoCount > 0) {
        stopAutomatonWithReason(placed, automaton, '搬入先に空きがありません');
        return false;
    }
    if (!reachedSource && transferSucceeded) automaton.deliveredAtDestination = true;
    if (!reachedSource && cargoCount === 0 && automaton.stopCondition === 'item-count'
        && automaton.processedItemCount >= automaton.stopAfterItemCount) {
        stopAutomatonAtItemLimit(placed, automaton);
        return false;
    }
    if (route.cyclePath && route.sourceApproach && route.destinationApproach) {
        const targetStorageInstanceId = reachedSource
            ? automaton.destinationStorageInstanceId : automaton.sourceStorageInstanceId;
        const path = reachedSource ? route.cyclePath : [...route.cyclePath].reverse();
        const approach = reachedSource ? route.destinationApproach : route.sourceApproach;
        automaton.transportTargetStorageInstanceId = targetStorageInstanceId;
        automatonTransportRoutes.set(placed.instanceId, {
            ...route,
            path,
            index: 1,
            approach,
            targetStorageInstanceId
        });
        automaton.nextMoveAt = now + getAutomatonActionDuration(automaton, 1400);
        saveBuildings();
        if (selectedBuildingInstanceId === placed.instanceId) renderAutomatonMenu(placed);
        scheduleDraw();
        return true;
    }
    const targetStorageId = route.targetStorageInstanceId === automaton.destinationStorageInstanceId
        && Object.values(automaton.cargo).some(amount => amount > 0)
        ? automaton.destinationStorageInstanceId
        : route.targetStorageInstanceId === automaton.sourceStorageInstanceId
            ? automaton.destinationStorageInstanceId
            : automaton.sourceStorageInstanceId;
    if (!setAutomatonTransportRoute(placed, automaton, targetStorageId)) {
        stopAutomatonWithoutTransportRoute(placed, automaton);
        return false;
    }
    automaton.nextMoveAt = now + getAutomatonActionDuration(automaton, 1400);
    saveBuildings();
    if (selectedBuildingInstanceId === placed.instanceId) renderAutomatonMenu(placed);
    scheduleDraw();
    return true;
}

function tickAutomatonTransport(placed, automaton, now) {
    let route = automatonTransportRoutes.get(placed.instanceId);
    if (route && route.buildingRevision !== buildingNavigationRevision) {
        automaton.movement = null;
        route = null;
    }
    if (!route) {
        const targetStorageId = state.buildings.some(storage => storage.instanceId === automaton.transportTargetStorageInstanceId)
            ? automaton.transportTargetStorageInstanceId
            : Object.values(automaton.cargo).some(amount => amount > 0)
                ? automaton.destinationStorageInstanceId
                : automaton.sourceStorageInstanceId;
        if (!rebuildAutomatonTransportRoute(placed, automaton, targetStorageId)) {
            stopAutomatonWithoutTransportRoute(placed, automaton);
            return true;
        }
        route = automatonTransportRoutes.get(placed.instanceId);
    }

    if (automaton.movement) {
        const movementEnd = automaton.movement.startedAt + automaton.movement.durationMs;
        if (now < movementEnd) {
            scheduleDraw();
            return false;
        }
        placed.x = automaton.movement.to.x;
        placed.y = automaton.movement.to.y;
        automaton.facingDirection = {
            x: automaton.movement.to.x - automaton.movement.from.x,
            y: automaton.movement.to.y - automaton.movement.from.y
        };
        route.index += 1;
        automaton.movement = null;
        if (route.index >= route.path.length) {
            finishAutomatonTransportLeg(placed, automaton, route, movementEnd);
        } else {
            saveBuildings();
            scheduleDraw();
        }
        return true;
    }

    if (route.index >= route.path.length) {
        finishAutomatonTransportLeg(placed, automaton, route, now);
        return true;
    }
    if (now < automaton.nextMoveAt) return false;

    const next = route.path[route.index];
    if (!canAutomatonEnter(placed, next.x, next.y)) {
        automatonTransportRoutes.delete(placed.instanceId);
        automatonTransportPlanCache.delete(placed.instanceId);
        if (!rebuildAutomatonTransportRoute(placed, automaton, route.targetStorageInstanceId)) {
            stopAutomatonWithoutTransportRoute(placed, automaton);
            return true;
        }
        route = automatonTransportRoutes.get(placed.instanceId);
        if (route.index >= route.path.length) {
            finishAutomatonTransportLeg(placed, automaton, route, now);
            return true;
        }
    }
    const target = route.path[route.index];
    automaton.movement = {
        from: { x: placed.x, y: placed.y },
        to: target,
        startedAt: now,
        durationMs: getAutomatonActionDuration(automaton, AUTOMATON_TRANSPORT_STEP_DURATION_MS)
    };
    automaton.nextMoveAt = now + getAutomatonActionDuration(automaton, AUTOMATON_TRANSPORT_STEP_DURATION_MS);
    scheduleDraw();
    return true;
}

function tickAutomatons(now) {
    let buildingsChanged = false;
    for (const placed of state.buildings) {
        if (BUILDING_BY_ID.get(placed.id)?.kind !== 'automaton') continue;
        const automaton = getAutomatonState(placed);
        if (!automaton.running) continue;
        if (!hasAssignedMovementScroll(placed)) {
            automaton.running = false;
            automaton.movement = null;
            automaton.stopReason = '動作スクロール未設定';
            automatonTransportRoutes.delete(placed.instanceId);
            buildingsChanged = true;
            continue;
        }
        if (automaton.action === 'STORAGE_TRANSPORT') {
            buildingsChanged = tickAutomatonTransport(placed, automaton, now) || buildingsChanged;
            continue;
        }
        if (automaton.movement) {
            const movementEnd = automaton.movement.startedAt + automaton.movement.durationMs;
            if (now < movementEnd) {
                scheduleDraw();
                continue;
            }
            placed.x = automaton.movement.to.x;
            placed.y = automaton.movement.to.y;
            automaton.facingDirection = {
                x: automaton.movement.to.x - automaton.movement.from.x,
                y: automaton.movement.to.y - automaton.movement.from.y
            };
            automaton.movement = null;
            const transferred = processAutomatonCell(placed, automaton);
            automaton.nextMoveAt = movementEnd + getAutomatonActionDuration(automaton, transferred ? 1400 : 250);
            buildingsChanged = true;
            continue;
        }
        if (now < automaton.nextMoveAt) continue;
        const axis = automaton.axis === 'vertical' ? 'y' : 'x';
        const direction = automaton.direction < 0 ? -1 : 1;
        const step = { x: 0, y: 0 };
        step[axis] = direction;
        let movementStep = step;
        let target = { x: placed.x + movementStep.x, y: placed.y + movementStep.y };
        if (Math.abs(target[axis] - automaton.origin[axis]) > automaton.range) {
            automaton.direction = -direction;
            movementStep = { x: -step.x, y: -step.y };
            target = { x: placed.x + movementStep.x, y: placed.y + movementStep.y };
        }
        if (!canAutomatonEnter(placed, target.x, target.y)) {
            if (tryAutomatonStorageTransfer(placed, automaton, movementStep, now)) {
                buildingsChanged = true;
                continue;
            }
            automaton.direction = -automaton.direction;
            movementStep = { x: -movementStep.x, y: -movementStep.y };
            target = { x: placed.x + movementStep.x, y: placed.y + movementStep.y };
        }
        if (!canAutomatonEnter(placed, target.x, target.y)) {
            if (tryAutomatonStorageTransfer(placed, automaton, movementStep, now)) {
                buildingsChanged = true;
                continue;
            }
            automaton.running = false;
            automaton.stopReason = '進行できるセルがありません';
            if (selectedBuildingInstanceId === placed.instanceId) renderAutomatonMenu(placed);
            buildingsChanged = true;
            continue;
        }
        automaton.movement = {
            from: { x: placed.x, y: placed.y },
            to: target,
            startedAt: now,
            durationMs: getAutomatonActionDuration(automaton, 420)
        };
        automaton.nextMoveAt = now + getAutomatonActionDuration(automaton, 700);
        scheduleDraw();
        buildingsChanged = true;
    }
    if (buildingsChanged) {
        saveBuildings();
        if (selectedBuildingInstanceId) {
            const selected = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
            if (selected && BUILDING_BY_ID.get(selected.id)?.kind === 'automaton') renderAutomatonMenu(selected);
        }
    }
}

function toggleSelectedAutomaton() {
    const placed = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
    if (!placed || BUILDING_BY_ID.get(placed.id)?.kind !== 'automaton') return;
    const automaton = getAutomatonState(placed);
    if (automaton.running) {
        if (automaton.movement) {
            const progress = Math.max(0, Math.min(1,
                (performance.now() - automaton.movement.startedAt) / automaton.movement.durationMs));
            if (progress >= 0.5) {
                placed.x = automaton.movement.to.x;
                placed.y = automaton.movement.to.y;
            }
        }
        automaton.running = false;
        automaton.movement = null;
        automaton.stopReason = '手動停止';
        automatonTransportRoutes.delete(placed.instanceId);
    } else {
        if (!hasAssignedMovementScroll(placed)) {
            showAppNotice('動作スクロールをセットしてください。');
            return;
        }
        let transportPlan = null;
        if (automaton.action === 'STORAGE_TRANSPORT') {
            const sourceExists = state.buildings.some(storage =>
                storage.instanceId === automaton.sourceStorageInstanceId
                && isStorageWithinAutomatonTransportBounds(storage, getAutomatonTransportBounds(placed, automaton)));
            const destinationExists = state.buildings.some(storage =>
                storage.instanceId === automaton.destinationStorageInstanceId
                && isStorageWithinAutomatonTransportBounds(storage, getAutomatonTransportBounds(placed, automaton)));
            if (!sourceExists || !destinationExists
                || automaton.sourceStorageInstanceId === automaton.destinationStorageInstanceId) {
                showAppNotice('搬出元と搬入先に別々のストレージを指定してください。');
                return;
            }
            transportPlan = getCachedAutomatonTransportPlan(placed, automaton);
            if (!transportPlan) {
                showAppNotice('搬送可能経路がありません');
                return;
            }
            if (automaton.itemFilterMode === 'include' && automaton.itemFilterIds.length === 0) {
                showAppNotice('運搬するアイテムを1つ以上登録してください。');
                return;
            }
        }
        automaton.running = true;
        automaton.direction = 1;
        automaton.processedItemCount = 0;
        automaton.completedRoundTripCount = 0;
        automaton.deliveredAtDestination = false;
        automaton.facingDirection = {
            x: automaton.axis === 'horizontal' ? 1 : 0,
            y: automaton.axis === 'vertical' ? 1 : 0
        };
        automaton.origin = { x: placed.x, y: placed.y };
        automaton.stopReason = '';
        if (automaton.action === 'STORAGE_TRANSPORT') {
            const hasCargo = Object.values(automaton.cargo).some(amount => amount > 0);
            const targetStorageId = hasCargo
                ? automaton.destinationStorageInstanceId
                : automaton.sourceStorageInstanceId;
            const initialRoute = hasCargo
                ? findAutomatonRouteToApproach(
                    placed, placed, transportPlan.destinationRoute.approach, transportPlan.bounds
                )
                : transportPlan.sourceRoute;
            if (!setAutomatonTransportRoute(
                placed, automaton, targetStorageId, initialRoute, transportPlan
            )) {
                automaton.running = false;
                showAppNotice('搬送可能経路がありません');
                return;
            }
            automaton.nextMoveAt = performance.now() + 250;
        } else {
            const transferred = processAutomatonCell(placed, automaton);
            automaton.nextMoveAt = performance.now() + getAutomatonActionDuration(automaton, transferred ? 1400 : 600);
        }
    }
    saveBuildings();
    renderAutomatonMenu(placed);
    scheduleDraw();
    scheduleVehicleAnimation();
}

function renderVehicleMenu(placed, definition) {
    const controls = document.getElementById('vehicle-menu-controls');
    const start = document.getElementById('building-menu-start-vehicle');
    const status = document.getElementById('vehicle-status');
    const guide = document.getElementById('vehicle-start-guide');
    const resourceSettings = document.getElementById('vehicle-resource-settings');
    const isLocomotive = definition.kind === 'locomotive';
    if (controls) controls.hidden = !isLocomotive;
    if (!isLocomotive) {
        if (start) start.hidden = true;
        return;
    }
    const vehicle = getVehicleState(placed);
    renderVehicleMovementScrollControl(placed);
    const speedSelect = document.getElementById('vehicle-speed-multiplier');
    const maxWagonsInput = document.getElementById('vehicle-max-wagons');
    if (speedSelect) speedSelect.value = String(vehicle.speedMultiplier);
    if (maxWagonsInput) maxWagonsInput.value = String(vehicle.maxWagons);
    const firstStep = vehicle.running ? null : getVehicleNextStep(placed, { ...vehicle, previousRail: null });
    const coupledWagonCount = getConnectedWagonCount(placed, vehicle, firstStep);
    const segmentPower = getTrainPowerPerCell(vehicle, coupledWagonCount);
    const hasMovementScroll = hasAssignedMovementScroll(placed);
    if (start) {
        start.hidden = false;
        start.disabled = !vehicle.running && !hasMovementScroll;
        start.textContent = vehicle.running ? '停止' : '出発';
        start.classList.toggle('inventory-modal-secondary', vehicle.running);
        start.classList.toggle('saved-scroll-use', !vehicle.running);
        start.setAttribute('aria-label', vehicle.running ? '機関車を停止' : '機関車を出発');
    }
    if (status) {
        status.textContent = vehicle.running ? '運行中' : coupledWagonCount > vehicle.maxWagons
            ? '牽引上限を超過'
            : !hasMovementScroll ? '動作スクロール未設定' : firstStep?.error ? '出発できません' : '停車中';
        status.classList.toggle('is-running', vehicle.running);
        status.classList.toggle('is-blocked', Boolean(!vehicle.running && (firstStep?.error || coupledWagonCount > vehicle.maxWagons)));
    }
    if (guide) {
        if (vehicle.running) {
            guide.textContent = '運行中です。「停止」を押すと、現在の移動を確定して停車します。';
        } else if (coupledWagonCount > vehicle.maxWagons) {
            guide.textContent = `連結貨車 ${coupledWagonCount} 台が設定上限 ${vehicle.maxWagons} 台を超えています。最大連結貨車数を増やしてください。`;
        } else if (!hasMovementScroll) {
            guide.textContent = '出発前に動作スクロールをセットしてください。';
        } else if (firstStep?.error) {
            const reason = VEHICLE_STOP_MESSAGES[firstStep.error] || '線路の接続を確認してください';
            guide.textContent = `出発できません：${reason}。線路を確認してください。`;
        } else if (vehicle.stopReason && vehicle.stopReason !== '手動停止') {
            guide.textContent = vehicle.stopReason === '動力不足'
                ? '動力が不足して停止しました。動力を補充してから「出発」を押してください。'
                : `前回の停止理由：${vehicle.stopReason}。線路と連結貨車数を確認してください。`;
        } else {
            guide.textContent = '出発準備完了。「出発」を押すと線路に沿って進みます。連結した貨車は自動で追従し、分岐では駅舎で進路を指定します。';
        }
    }
    if (resourceSettings) resourceSettings.textContent =
        `速度：${formatUtilityAmount(vehicle.speedCellsPerSecond * vehicle.speedMultiplier)}マス / 秒` +
        ` / 連結貨車 ${coupledWagonCount}/${vehicle.maxWagons}台` +
        ` / 消費動力 ${engineRuntimeState.creativeMode ? 'なし' : `${formatUtilityAmount(segmentPower)} / マス（実連結数・速度倍率で増加）`}`;
}

function renderVehicleMovementScrollControl(placed) {
    const select = document.getElementById('vehicle-movement-scroll-select');
    if (!select) return;
    const assignedScrollId = getMovementScrollId(placed);
    const installedScrollIds = getInstalledScrollIds(placed.instanceId);
    const scrolls = getStoredSavedScrolls().filter(scroll => typeof scroll?.id === 'string'
        && isUsableCraftingScroll(scroll)
        && (!installedScrollIds.has(scroll.id) || scroll.id === assignedScrollId));
    if (assignedScrollId && !scrolls.some(scroll => scroll.id === assignedScrollId)) {
        const assigned = getStoredSavedScrolls().find(scroll => scroll.id === assignedScrollId);
        scrolls.unshift(assigned || { id: assignedScrollId, name: '登録解除されたスクロール' });
    }
    select.replaceChildren(new Option('スクロールを選択', ''));
    scrolls.forEach(scroll => select.add(new Option(scroll.name || scroll.id, scroll.id)));
    select.value = assignedScrollId;
    const assigned = getStoredSavedScrolls().find(scroll => scroll.id === assignedScrollId);
    updateScrollPreviewElements(assigned || null, 'vehicle-scroll-preview', 'vehicle-scroll-preview-frame');
    updateBuildingScrollToggle(
        hasAssignedMovementScroll(placed) ? assigned : null,
        'vehicle-scroll-toggle'
    );
    const status = document.getElementById('vehicle-movement-scroll-status');
    if (status) {
        status.textContent = !assignedScrollId
            ? '動作スクロールをセットすると起動できます。'
            : hasAssignedMovementScroll(placed)
                ? `${assigned?.name || 'スクロール'} セット済み / ${getActiveScrollIds().includes(assignedScrollId) ? '稼働中' : '停止中'}`
                : assigned && isScrollExhausted(assigned)
                    ? 'スクロールを使い切りました。別のスクロールをセットしてください。'
                    : 'セットしたスクロールが使えません。別のスクロールをセットしてください。';
    }
}

function changeVehicleSetting(setting, value) {
    const placed = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
    if (!placed || BUILDING_BY_ID.get(placed.id)?.kind !== 'locomotive') return;
    const vehicle = getVehicleState(placed);
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        renderVehicleMenu(placed, BUILDING_BY_ID.get(placed.id));
        return;
    }
    if (setting === 'speedMultiplier') {
        vehicle.speedMultiplier = AUTOMATON_SPEED_MULTIPLIERS.includes(numericValue) ? numericValue : 1;
    } else if (setting === 'maxWagons') {
        vehicle.maxWagons = Math.max(0, Math.min(32, Math.floor(numericValue)));
    }
    saveBuildings();
    renderVehicleMenu(placed, BUILDING_BY_ID.get(placed.id));
}

function formatUtilityAmount(amount) {
    return String(Math.round((Number(amount) || 0) * 10) / 10);
}

function getBuildingTitle(placed, definition = BUILDING_BY_ID.get(placed.id)) {
    return placed.customName ? `${placed.customName} / ${definition.name}` : definition.name;
}

function getBuildingSelectionName(placed) {
    const definition = BUILDING_BY_ID.get(placed.id);
    return placed.customName ? `${placed.customName} / ${definition.name}` : definition.name;
}

function updateBuildingScrollStatus(placed) {
    const controls = document.getElementById('building-scroll-controls');
    const select = document.getElementById('building-scroll-select');
    const overclockSelect = document.getElementById('building-overclock-select');
    const status = document.getElementById('building-scroll-status');
    const craftButton = document.getElementById('building-menu-craft');
    if (!controls || !select || !status) return;
    const hasRecipes = Boolean(placed && getCraftingRecipesForBuilding(placed.id).length);
    const canInstallScroll = canInstallScrollInBuilding(placed);
    const isLocomotive = BUILDING_BY_ID.get(placed?.id)?.kind === 'locomotive';
    controls.hidden = !canInstallScroll || isLocomotive;
    const overclockControl = document.getElementById('building-overclock-control');
    if (overclockControl) overclockControl.hidden = !hasRecipes;
    if (!canInstallScroll) return;
    const movementScrollRequired = requiresMovementScroll(placed);
    const toggle = document.getElementById('building-scroll-toggle');
    if (toggle) toggle.hidden = false;
    if (movementScrollRequired) {
        const scrollId = getMovementScrollId(placed);
        const selectedScroll = getStoredSavedScrolls().find(scroll => scroll.id === scrollId);
        updateBuildingScrollPreview(
            BUILDING_BY_ID.get(placed.id)?.kind === 'locomotive' ? selectedScroll || null : null
        );
        const assigned = hasAssignedMovementScroll(placed);
        updateBuildingScrollToggle(assigned ? selectedScroll : null);
        if (BUILDING_BY_ID.get(placed.id)?.kind === 'locomotive') {
            updateScrollPreviewElements(selectedScroll || null, 'vehicle-scroll-preview', 'vehicle-scroll-preview-frame');
            updateBuildingScrollToggle(assigned ? selectedScroll : null, 'vehicle-scroll-toggle');
            const vehicleStatus = document.getElementById('vehicle-movement-scroll-status');
            if (vehicleStatus) {
                vehicleStatus.textContent = !scrollId
                    ? '動作スクロールをセットすると起動できます。'
                    : assigned
                        ? `${selectedScroll?.name || 'スクロール'} セット済み / ${getActiveScrollIds().includes(scrollId) ? '稼働中' : '停止中'}`
                        : selectedScroll && isScrollExhausted(selectedScroll)
                            ? 'スクロールを使い切りました。別のスクロールをセットしてください。'
                            : 'セットしたスクロールが使えません。別のスクロールをセットしてください。';
            }
        }
        if (!scrollId) status.textContent = '動作スクロール未設定。セットすると運転できます。';
        else if (!hasAssignedMovementScroll(placed)) {
            status.textContent = selectedScroll && isScrollExhausted(selectedScroll)
                ? `${selectedScroll.name || 'スクロール'} は使い切りました。別のスクロールをセットしてください。`
                : 'セットしたスクロールが使えません。別のスクロールをセットしてください。';
        } else status.textContent = `${selectedScroll.name || 'スクロール'} セット済み / ${getActiveScrollIds().includes(scrollId) ? '稼働中' : '停止中'} / 運転可能`;
        return;
    }
    const overclock = getCraftingOverclock(placed);
    const basePowerRate = hasRecipes ? CRAFTING_STATION_POWER_RATES[placed.id] : 0;
    const powerRate = hasRecipes ? getCraftingStationPowerRate(placed) : 0;
    const formatRate = rate => Number.isFinite(rate) ? String(Number(rate.toFixed(2))) : '不明';
    if (overclockSelect && hasRecipes) overclockSelect.value = String(overclock.speedMultiplier);
    const selectedScroll = getStoredSavedScrolls().find(scroll => scroll.id === placed.craftingScrollId);
    const assigned = hasAssignedCraftingScroll(placed);
    const running = assigned && hasRunningCraftingScroll(placed);
    updateBuildingScrollPreview(selectedScroll || null);
    updateBuildingScrollToggle(assigned ? selectedScroll : null);
    if (selectedScroll && isScrollExhausted(selectedScroll)) {
        status.textContent = `${selectedScroll.name || 'スクロール'} は耐久度を使い切りました（${getScrollDurabilityLimit(selectedScroll)}/${getScrollDurabilityLimit(selectedScroll)}回転）。取り外すとスクロールブックから写本できます。`;
    } else if (!assigned) {
        status.textContent = hasRecipes
            ? `スクロール未設定。セットすると製作設備を起動できます。基本動力 ${formatRate(basePowerRate)} 動力/秒`
            : 'スクロールをセットすると、この台の設置セルで稼働します。';
    } else if (!running) {
        status.textContent = `${selectedScroll.name || 'スクロール'} セット済み / 停止中。起動すると製作できます。`;
    } else if (!engineRuntimeState.creativeMode && Number(engineRuntimeState.steamPower) <= 0) {
        status.textContent = `${selectedScroll.name || 'スクロール'} セット済み / 蒸気動力待ち`;
    } else if (!engineRuntimeState.creativeMode && hasRecipes && Number(engineRuntimeState.power) <= 0) {
        status.textContent = `${selectedScroll.name || 'スクロール'} セット済み / 動力待ち / オーバークロック ${overclock.speedMultiplier}倍 / ${formatRate(powerRate)} 動力/秒`;
    } else {
        status.textContent = hasRecipes
            ? `${selectedScroll.name || 'スクロール'} セット済み / 稼働可能 / オーバークロック ${overclock.speedMultiplier}倍 / ${formatRate(powerRate)} 動力/秒`
            : `${selectedScroll.name || 'スクロール'} セット済み / 稼働可能`;
    }
    if (craftButton && hasRecipes) craftButton.disabled = false;
}

function getActiveScrollIds() {
    try {
        const stored = JSON.parse(localStorage.getItem('fogsgear_active_scroll_id') || '[]');
        if (Array.isArray(stored)) return stored.filter(scrollId => typeof scrollId === 'string');
        return typeof stored === 'string' && stored && localStorage.getItem('fogsgear_active_scroll_running') === 'true'
            ? [stored]
            : [];
    } catch (error) {
        const legacyId = localStorage.getItem('fogsgear_active_scroll_id');
        return localStorage.getItem('fogsgear_active_scroll_running') === 'true' && legacyId ? [legacyId] : [];
    }
}

function stopPlayerTargetedScrolls(playerMoved = false) {
    const activeIds = new Set(getActiveScrollIds());
    if (!activeIds.size) return;
    const savedScrolls = new Map(getStoredSavedScrolls().map(scroll => [scroll.id, scroll]));
    let targets;
    try {
        const stored = JSON.parse(localStorage.getItem(ACTIVE_SCROLL_TARGETS_KEY) || '{}');
        targets = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    } catch (error) {
        console.warn('Could not read active scroll targets after player movement.', error);
        return;
    }
    const stoppedIds = [...activeIds].filter(scrollId => {
        const target = targets[scrollId];
        const scroll = savedScrolls.get(scrollId);
        const anchoredBuilding = state.buildings.find(building => building.instanceId === target?.buildingInstanceId
            && (supportsStationaryScrolls(building) && building.craftingScrollId === scrollId
                || requiresMovementScroll(building) && getMovementScrollId(building) === scrollId));
        const affectsWorld = !scroll || !Array.isArray(scroll.blueprint?.gears)
            || scroll.blueprint.gears.some(gear => WORLD_AFFECTING_SCROLL_MODES.has(gear.processMode));
        return !anchoredBuilding
            && affectsWorld
            && (playerMoved || target?.x !== state.player.x || target?.y !== state.player.y);
    });
    if (!stoppedIds.length) return;
    stoppedIds.forEach(scrollId => {
        activeIds.delete(scrollId);
        delete targets[scrollId];
    });
    localStorage.setItem('fogsgear_active_scroll_id', JSON.stringify([...activeIds]));
    localStorage.removeItem('fogsgear_active_scroll_running');
    localStorage.setItem(ACTIVE_SCROLL_TARGETS_KEY, JSON.stringify(targets));
    refreshActiveScrollTargets(targets);
    renderSavedScrolls();
    const selectedBuilding = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
    if (selectedBuilding) updateBuildingScrollStatus(selectedBuilding);
}

function updateBuildingScrollToggle(scroll, buttonId = 'building-scroll-toggle') {
    const button = document.getElementById(buttonId);
    if (!button) return;
    const isRunning = Boolean(scroll && getActiveScrollIds().includes(scroll.id));
    button.textContent = isRunning ? 'スクロールを停止' : 'スクロールを起動';
    button.classList.toggle('is-running', isRunning);
    button.disabled = !scroll || !isRunning
        && !engineRuntimeState.creativeMode
        && Number(engineRuntimeState.steamPower) <= 0;
    button.setAttribute('aria-pressed', String(isRunning));
}

function updateBuildingScrollPreview(scroll) {
    updateScrollPreviewElements(scroll, 'building-scroll-preview', 'building-scroll-preview-frame');
}

function updateAutomatonScrollPreview(scroll) {
    updateScrollPreviewElements(scroll, 'automaton-scroll-preview', 'automaton-scroll-preview-frame');
}

function updateScrollPreviewElements(scroll, previewId, frameId) {
    const preview = document.getElementById(previewId);
    const frame = document.getElementById(frameId);
    if (!preview || !frame) return;
    preview.hidden = !scroll;
    if (!scroll) {
        if (frame.dataset.scrollId) {
            frame.src = 'about:blank';
            delete frame.dataset.scrollId;
        }
        return;
    }
    frame.title = `${scroll.name || 'スクロール'}の動作プレビュー`;
    if (frame.dataset.scrollId === scroll.id) return;
    const previewUrl = new URL('../GearSystem/scroll-library.html', window.location.href);
    previewUrl.searchParams.set('previewOnly', '1');
    previewUrl.searchParams.set('followRunning', '1');
    previewUrl.searchParams.set('scrollId', scroll.id);
    previewUrl.searchParams.set('v', '59');
    frame.src = previewUrl.href;
    frame.dataset.scrollId = scroll.id;
}

function renderBuildingScrollControls(placed) {
    const controls = document.getElementById('building-scroll-controls');
    const select = document.getElementById('building-scroll-select');
    const overclockSelect = document.getElementById('building-overclock-select');
    if (!controls || !select) return;
    const hasRecipes = Boolean(getCraftingRecipesForBuilding(placed.id).length);
    const canInstallScroll = canInstallScrollInBuilding(placed);
    const isLocomotive = BUILDING_BY_ID.get(placed.id)?.kind === 'locomotive';
    controls.hidden = !canInstallScroll || isLocomotive;
    const overclockControl = document.getElementById('building-overclock-control');
    if (overclockControl) overclockControl.hidden = !hasRecipes;
    if (!canInstallScroll) return;
    if (overclockSelect && hasRecipes) {
        overclockSelect.replaceChildren(...CRAFTING_OVERCLOCK_OPTIONS.map(option =>
            new Option(`${option.label}（速度${option.speedMultiplier}倍・動力${option.powerMultiplier}倍）`, String(option.speedMultiplier))));
        overclockSelect.value = String(getCraftingOverclock(placed).speedMultiplier);
    }
    const movementScrollRequired = requiresMovementScroll(placed);
    const assignedScrollId = movementScrollRequired ? getMovementScrollId(placed) : placed.craftingScrollId;
    const installedScrollIds = getInstalledScrollIds(placed.instanceId);
    const scrolls = getStoredSavedScrolls().filter(scroll => typeof scroll?.id === 'string'
        && isUsableCraftingScroll(scroll)
        && !installedScrollIds.has(scroll.id)
        && scroll.id !== assignedScrollId);
    const assignedScroll = getStoredSavedScrolls().find(scroll => scroll.id === assignedScrollId);
    if (assignedScroll && isUsableCraftingScroll(assignedScroll)) scrolls.unshift(assignedScroll);
    select.replaceChildren(new Option('スクロールを選択', ''));
    scrolls.forEach(scroll => select.add(new Option(scroll.name || scroll.id, scroll.id)));
    if (assignedScrollId && !scrolls.some(scroll => scroll.id === assignedScrollId)) {
        const label = assignedScroll && isScrollExhausted(assignedScroll)
            ? `${assignedScroll.name || 'スクロール'}（使い切った・回収して写本）`
            : '登録解除されたスクロール';
        select.add(new Option(label, assignedScrollId));
    }
    select.value = assignedScrollId || '';
    const scrollLabel = select.labels?.[0];
    if (scrollLabel) scrollLabel.textContent = movementScrollRequired ? '動作スクロール' : '動力スクロール';
    if (movementScrollRequired) {
        select.setAttribute('aria-label', BUILDING_BY_ID.get(placed.id)?.kind === 'locomotive'
            ? '汽車にセットする動作スクロール' : 'オートマタにセットする動作スクロール');
    } else select.setAttribute('aria-label', '建物にセットするスクロール');
    updateBuildingScrollStatus(placed);
}

function renderAutomatonMovementScrollControl(placed) {
    const select = document.getElementById('automaton-movement-scroll-select');
    if (!select) return;
    const assignedScrollId = getMovementScrollId(placed);
    const installedScrollIds = getInstalledScrollIds(placed.instanceId);
    const scrolls = getStoredSavedScrolls().filter(scroll => typeof scroll?.id === 'string'
        && isUsableCraftingScroll(scroll)
        && (!installedScrollIds.has(scroll.id) || scroll.id === assignedScrollId));
    if (assignedScrollId && !scrolls.some(scroll => scroll.id === assignedScrollId)) {
        const assigned = getStoredSavedScrolls().find(scroll => scroll.id === assignedScrollId);
        scrolls.unshift(assigned || { id: assignedScrollId, name: '登録解除されたスクロール' });
    }
    select.replaceChildren(new Option('スクロールを選択', ''));
    scrolls.forEach(scroll => select.add(new Option(scroll.name || scroll.id, scroll.id)));
    select.value = assignedScrollId;
    const status = document.getElementById('automaton-movement-scroll-status');
    const assigned = getStoredSavedScrolls().find(scroll => scroll.id === assignedScrollId);
    updateAutomatonScrollPreview(assigned || null);
    const movementScrollAssigned = hasAssignedMovementScroll(placed);
    updateBuildingScrollToggle(movementScrollAssigned ? assigned : null, 'automaton-scroll-toggle');
    if (status) {
        status.textContent = !assignedScrollId
            ? '動作スクロールをセットすると起動できます。'
            : hasAssignedMovementScroll(placed)
                ? `${assigned?.name || 'スクロール'} セット済み / ${getActiveScrollIds().includes(assignedScrollId) ? '稼働中' : '停止中'} / 稼働可能`
                : assigned && isScrollExhausted(assigned)
                    ? 'スクロールを使い切りました。別のスクロールをセットしてください。'
                    : 'セットしたスクロールが使えません。別のスクロールをセットしてください。';
    }
}

function toggleBuildingScroll() {
    const placed = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
    if (!canInstallScrollInBuilding(placed)) return;
    const movementScrollRequired = requiresMovementScroll(placed);
    if (movementScrollRequired ? !hasAssignedMovementScroll(placed) : !hasAssignedCraftingScroll(placed)) return;
    const scrollId = movementScrollRequired ? getMovementScrollId(placed) : placed.craftingScrollId;
    const activeIds = new Set(getActiveScrollIds());
    const targets = (() => {
        try {
            const stored = JSON.parse(localStorage.getItem(ACTIVE_SCROLL_TARGETS_KEY) || '{}');
            return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
        } catch (error) {
            return {};
        }
    })();
    if (activeIds.has(scrollId)) {
        activeIds.delete(scrollId);
        delete targets[scrollId];
    } else {
        if (!engineRuntimeState.creativeMode && Number(engineRuntimeState.steamPower) <= 0) {
            showAppNotice('蒸気動力がないためスクロールを起動できません。');
            return;
        }
        targets[scrollId] = supportsStationaryScrolls(placed) || movementScrollRequired
            ? { x: placed.x, y: placed.y, buildingInstanceId: placed.instanceId, startedAt: Date.now() }
            : { x: state.player.x, y: state.player.y, startedAt: Date.now() };
        activeIds.add(scrollId);
        if (engineRuntimeState.mainGearRunning === false) {
            engineRuntimeState.mainGearRunning = true;
            engineRuntimeState.userStoppedMainGear = false;
            engineRuntimeState.autoStoppedBySteam = false;
            engineRuntimeState.updatedAt = Date.now();
            engineRuntimeState.saveGameData();
        }
    }
    localStorage.setItem('fogsgear_active_scroll_id', JSON.stringify([...activeIds]));
    localStorage.removeItem('fogsgear_active_scroll_running');
    localStorage.setItem(ACTIVE_SCROLL_TARGETS_KEY, JSON.stringify(targets));
    refreshActiveScrollTargets(targets);
    if (BUILDING_BY_ID.get(placed.id)?.kind === 'automaton') renderAutomatonMovementScrollControl(placed);
    else if (BUILDING_BY_ID.get(placed.id)?.kind === 'locomotive') renderVehicleMovementScrollControl(placed);
    else updateBuildingScrollStatus(placed);
}

function stopScrollIfRunning(scrollId) {
    if (!scrollId) return;
    const activeIds = new Set(getActiveScrollIds());
    if (!activeIds.delete(scrollId)) return;
    let targets = {};
    try {
        const stored = JSON.parse(localStorage.getItem(ACTIVE_SCROLL_TARGETS_KEY) || '{}');
        if (stored && typeof stored === 'object' && !Array.isArray(stored)) targets = stored;
    } catch (error) {
        console.warn('Could not read active scroll targets while removing an installed scroll.', error);
    }
    delete targets[scrollId];
    localStorage.setItem('fogsgear_active_scroll_id', JSON.stringify([...activeIds]));
    localStorage.removeItem('fogsgear_active_scroll_running');
    localStorage.setItem(ACTIVE_SCROLL_TARGETS_KEY, JSON.stringify(targets));
    refreshActiveScrollTargets(targets);
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
        ? ` / 資材保管 ${getStorageUsedSlots(placed)} / ${definition.storageCapacity} 枠`
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
    const modal = document.getElementById('building-menu-modal');
    const isOpeningMenu = modal.hidden || selectedBuildingInstanceId !== instanceId;
    const soundProfile = getBuildingSoundProfile(placed.id) || getSurfaceSoundProfile(placed.id);
    const isStorage = placed.id === 'simple-storage' || placed.id === 'warehouse';
    if (selectedBuildingInstanceId !== instanceId) selectedStorageStack = null;
    selectedBuildingInstanceId = instanceId;
    cancelBuildingDemolition();
    if (definition.kind === 'automaton') {
        document.getElementById('building-menu-modal').hidden = true;
        renderAutomatonMenu(placed);
        document.getElementById('automaton-menu-modal').hidden = false;
        if (isOpeningMenu && isStorage) playGameSound(soundProfile, { singleHit: true });
        return;
    }
    document.getElementById('automaton-menu-modal').hidden = true;
    document.getElementById('building-menu-title').textContent = getBuildingTitle(placed, definition);
    document.getElementById('building-custom-name').value = placed.customName || '';
    renderBuildingScrollControls(placed);
    renderVehicleMenu(placed, definition);
    updateBuildingMenuDetails(placed, definition);
    renderBuildingStorage(placed, definition);
    const rotateRail = document.getElementById('building-menu-rotate-rail');
    if (rotateRail) rotateRail.hidden = definition.role !== 'rail';
    const craftButton = document.getElementById('building-menu-craft');
    if (craftButton) craftButton.hidden = !getCraftingRecipesForBuilding(definition.id).length;
    const startVehicleButton = document.getElementById('building-menu-start-vehicle');
    const actions = document.querySelector('#building-menu-modal .inventory-modal-actions');
    if (actions) actions.hidden = Boolean(craftButton?.hidden && startVehicleButton?.hidden);
    modal.hidden = false;
    if (isOpeningMenu && isStorage) playGameSound(soundProfile, { singleHit: true });
}

function saveSelectedBuildingName(input) {
    const placed = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
    const definition = BUILDING_BY_ID.get(placed?.id);
    if (!placed || !definition) return;
    const customName = input.value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 32);
    input.value = customName;
    if (customName) placed.customName = customName;
    else delete placed.customName;
    saveBuildings();
    if (definition.kind === 'automaton') renderAutomatonMenu(placed);
    else {
        document.getElementById('building-menu-title').textContent = getBuildingTitle(placed, definition);
        updateBuildingMenuDetails(placed, definition);
    }
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

function settleCoupledWagonMovements(locomotive, now) {
    for (const wagon of state.buildings) {
        if (wagon === locomotive || BUILDING_BY_ID.get(wagon.id)?.role !== 'vehicle') continue;
        const vehicle = getVehicleState(wagon);
        if (vehicle.movement?.locomotiveInstanceId !== locomotive.instanceId) continue;
        settleVehicleMovement(wagon, vehicle, now);
    }
}

function startSelectedVehicle() {
    const placed = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
    if (!placed || BUILDING_BY_ID.get(placed.id)?.kind !== 'locomotive') return;
    const vehicle = getVehicleState(placed);
    if (vehicle.running) {
        settleVehicleMovement(placed, vehicle, performance.now());
        settleCoupledWagonMovements(placed, performance.now());
        vehicle.running = false;
        vehicle.stopReason = '手動停止';
        vehicle.nextMoveAt = 0;
    } else {
        if (!hasAssignedMovementScroll(placed)) {
            vehicle.stopReason = '動作スクロール未設定';
            showAppNotice('出発前に動作スクロールをセットしてください。');
            renderVehicleMenu(placed, BUILDING_BY_ID.get(placed.id));
            return;
        }
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
                const stationDirection = getStationDirection(getStationControlAtRail(placed.x, placed.y));
                if (!stationDirection) {
                    const adjacentWagons = getAdjacentWagons(placed);
                    const wagonBehind = adjacentWagons.find(({ direction }) =>
                        direction[0] !== firstStep.direction[0] || direction[1] !== firstStep.direction[1])
                        || adjacentWagons[0];
                    if (wagonBehind) {
                        vehicle.previousRail = { ...wagonBehind.position };
                    }
                }
                const departureStep = getVehicleNextStep(placed, vehicle);
                if (departureStep.error) {
                    vehicle.running = false;
                    vehicle.stopReason = VEHICLE_STOP_MESSAGES[departureStep.error] || '線路を確認してください';
                    vehicle.nextMoveAt = 0;
                } else {
                    vehicle.direction = departureStep.direction;
                    placed.rotation = directionToVehicleRotation(departureStep.direction);
                    vehicle.nextMoveAt = performance.now();
                }
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
    let stoppedVehicle = false;
    const settledVehicles = new Set();
    const locomotives = state.buildings.filter(placed => BUILDING_BY_ID.get(placed.id)?.kind === 'locomotive');
    for (const placed of locomotives) {
        const vehicle = getVehicleState(placed);
        if (!vehicle.running) continue;
        if (!hasAssignedMovementScroll(placed)) {
            vehicle.running = false;
            vehicle.movement = null;
            vehicle.stopReason = '動作スクロール未設定';
            vehicle.nextMoveAt = 0;
            stoppedVehicle = true;
            changed = true;
            continue;
        }
        const wasMoving = Boolean(vehicle.movement);
        let segmentStartAt = now;
        if (vehicle.movement) {
            const movementEndAt = vehicle.movement.startedAt + vehicle.movement.durationMs;
            if (now < movementEndAt) continue;
            settleVehicleMovement(placed, vehicle, movementEndAt);
            settledVehicles.add(placed);
            settleCoupledWagonMovements(placed, movementEndAt);
            state.buildings.filter(other => other.vehicle?.movement?.locomotiveInstanceId === placed.instanceId)
                .forEach(other => settledVehicles.add(other));
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
            stoppedVehicle = true;
            changed = true;
            continue;
        }
        const coupledWagons = getCoupledWagonsBehind(placed, vehicle);
        if (coupledWagons.length > vehicle.maxWagons) {
            vehicle.running = false;
            vehicle.stopReason = `連結貨車が上限（${vehicle.maxWagons}台）を超過`;
            vehicle.nextMoveAt = 0;
            stoppedVehicle = true;
            changed = true;
            continue;
        }
        const segmentPower = getTrainPowerPerCell(vehicle, coupledWagons.length);
        if (!engineRuntimeState.creativeMode && Number(engineRuntimeState.power) < segmentPower) {
            vehicle.running = false;
            vehicle.stopReason = '動力不足';
            vehicle.nextMoveAt = 0;
            stoppedVehicle = true;
            changed = true;
            continue;
        }
        const consistIds = new Set([placed.instanceId, ...coupledWagons.map(({ placed: wagon }) => wagon.instanceId)]);
        const destinations = [step.position, ...coupledWagons.map(({ to }) => to)];
        const blockingVehicle = state.buildings.find(other => !consistIds.has(other.instanceId)
            && BUILDING_BY_ID.get(other.id)?.role === 'vehicle'
            && destinations.some(position => other.x === position.x && other.y === position.y
                || other.vehicle?.movement?.to.x === position.x && other.vehicle?.movement?.to.y === position.y));
        if (blockingVehicle) {
            vehicle.running = false;
            vehicle.stopReason = VEHICLE_STOP_MESSAGES.collision;
            vehicle.nextMoveAt = 0;
            stoppedVehicle = true;
            if (BUILDING_BY_ID.get(blockingVehicle.id)?.kind === 'locomotive') {
                const otherVehicle = getVehicleState(blockingVehicle);
                settleVehicleMovement(blockingVehicle, otherVehicle, now);
                settleCoupledWagonMovements(blockingVehicle, now);
                settledVehicles.add(blockingVehicle);
                otherVehicle.running = false;
                otherVehicle.stopReason = VEHICLE_STOP_MESSAGES.collision;
                otherVehicle.nextMoveAt = 0;
                stoppedVehicle = true;
            }
            changed = true;
            continue;
        }
        if (!engineRuntimeState.creativeMode) {
            engineRuntimeState.power = Math.max(0, engineRuntimeState.power - segmentPower);
            engineRuntimeState.saveGameData();
            engineRuntimeState.notify();
        }
        const durationMs = 1000 / (Math.max(0.1, Number(vehicle.speedCellsPerSecond) || 1) * vehicle.speedMultiplier);
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
        coupledWagons.forEach(({ placed: wagon, from, to }) => {
            const wagonVehicle = getVehicleState(wagon);
            const wagonDirection = [to.x - from.x, to.y - from.y];
            wagonVehicle.movement = {
                from,
                to,
                direction: wagonDirection,
                fromRotation: wagon.rotation || 0,
                toRotation: directionToVehicleRotation(wagonDirection),
                startedAt: segmentStartAt,
                durationMs,
                locomotiveInstanceId: placed.instanceId
            };
        });
        vehicle.nextMoveAt = segmentStartAt + durationMs;
        if (!wasMoving) startedVehicleMotion = true;
        changed = true;
    }
    if (!changed) return;
    const vehicleStillMoving = state.buildings.some(placed => placed.vehicle?.movement);
    if (stoppedVehicle || !vehicleStillMoving) saveBuildings();
    if (selectedBuildingInstanceId && (stoppedVehicle || !vehicleStillMoving)) {
        const selected = state.buildings.find(placed => placed.instanceId === selectedBuildingInstanceId);
        if (selected && BUILDING_BY_ID.get(selected.id)?.kind === 'locomotive') renderVehicleMenu(selected, BUILDING_BY_ID.get(selected.id));
    }
    if (startedVehicleMotion || [...settledVehicles].some(placed => !placed.vehicle?.movement)) scheduleDraw();
    if (state.buildings.some(placed => placed.vehicle?.movement)) scheduleVehicleAnimation();
}

window.addEventListener('pagehide', () => {
    const now = performance.now();
    const locomotives = state.buildings.filter(placed => BUILDING_BY_ID.get(placed.id)?.kind === 'locomotive');
    for (const locomotive of locomotives) {
        const vehicle = getVehicleState(locomotive);
        settleVehicleMovement(locomotive, vehicle, now);
        settleCoupledWagonMovements(locomotive, now);
    }
    if (locomotives.some(placed => placed.vehicle?.running || placed.vehicle?.movement)) saveBuildings();
});

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
    if (definition.kind === 'automaton') getAutomatonState(placedBuilding);
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

function getBuildingDemolitionRefunds(placed, definition) {
    const refunds = new Map();
    getBuildingMaterialCosts(definition).forEach(([itemId, amount]) => {
        const refund = Math.ceil(Number(amount) / 10);
        if (refund > 0) refunds.set(itemId, (refunds.get(itemId) || 0) + refund);
    });
    if (isRecord(placed.storedMaterials)) {
        Object.entries(placed.storedMaterials).forEach(([itemId, amount]) => {
            const stored = Math.floor(Number(amount));
            if (stored > 0) refunds.set(itemId, (refunds.get(itemId) || 0) + stored);
        });
    }
    return [...refunds].map(([itemId, amount]) => ({ itemId, amount }));
}

function openBuildingDemolitionConfirmation() {
    const placed = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
    const definition = BUILDING_BY_ID.get(placed?.id);
    if (!placed || !definition) return;
    pendingBuildingDemolitionInstanceId = placed.instanceId;
    const refunds = getBuildingDemolitionRefunds(placed, definition);
    const message = document.getElementById('building-demolition-confirm-message');
    const refundList = document.getElementById('building-demolition-refunds');
    message.textContent = `${definition.name}を解体しますか？ 以下の資材を獲得します。`;
    refundList.replaceChildren();
    if (!refunds.length) {
        const empty = document.createElement('p');
        empty.className = 'building-demolition-empty';
        empty.textContent = '返却される資材はありません';
        refundList.appendChild(empty);
    } else {
        refunds.forEach(({ itemId, amount }) => {
            const entry = document.createElement('span');
            entry.className = 'building-demolition-refund';
            entry.appendChild(createBuildingStorageIcon(itemId));
            const name = document.createElement('span');
            name.textContent = getCraftingItemName(itemId);
            const count = document.createElement('strong');
            count.textContent = `×${amount}`;
            entry.append(name, count);
            refundList.appendChild(entry);
        });
    }
    document.getElementById('building-demolition-confirm-modal').hidden = false;
}

function cancelBuildingDemolition() {
    document.getElementById('building-demolition-confirm-modal').hidden = true;
    pendingBuildingDemolitionInstanceId = null;
}

function demolishSelectedBuilding() {
    const demolitionInstanceId = pendingBuildingDemolitionInstanceId;
    if (!demolitionInstanceId) return;
    const index = state.buildings.findIndex(building => building.instanceId === demolitionInstanceId);
    const placed = state.buildings[index];
    const definition = BUILDING_BY_ID.get(placed?.id);
    if (!placed || !definition) {
        cancelBuildingDemolition();
        showAppNotice('解体する建築物が見つかりません。');
        return;
    }
    const refunds = getBuildingDemolitionRefunds(placed, definition);
    if (!canAddInventoryItems(refunds.map(({ itemId }) => itemId))) {
        notifyInventoryFull();
        return;
    }
    const historyBefore = captureBuildingHistoryState();
    stopScrollIfRunning(placed.craftingScrollId);
    stopScrollIfRunning(getMovementScrollId(placed));
    state.buildings.splice(index, 1);
    removeCraftingReservationsForBuilding(placed.instanceId);
    refunds.forEach(({ itemId, amount }) => {
        const resourceKey = { water: 'water', fog: 'fog', power: 'power', steam_power: 'steamPower' }[itemId];
        if (itemId === 'brass-stock') engineRuntimeState.brass += amount;
        else if (resourceKey) engineRuntimeState[resourceKey] = (Number(engineRuntimeState[resourceKey]) || 0) + amount;
        else engineRuntimeState.materialInventory[itemId] = getCraftingItemCount(itemId) + amount;
    });
    recordBuildingHistory(historyBefore);
    engineRuntimeState.saveGameData();
    engineRuntimeState.notify();
    saveBuildings();
    cancelBuildingDemolition();
    closeBuildingMenu();
    buildingRenderSignature = '';
    renderSavedScrolls();
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
        window.getSelection?.()?.removeAllRanges();
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
        if (event.target.closest('#canvas-container, #building-menu-modal, #building-placement-controls')) {
            event.preventDefault();
        }
    }, true);

    document.addEventListener('selectstart', event => {
        const target = event.target instanceof Element ? event.target : event.target?.parentElement;
        if (!target || target.closest('input, textarea, select, [contenteditable="true"]')) return;
        if (target.closest('#canvas-container, #building-menu-modal, #building-crafting-modal, #building-placement-controls')) {
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

function movePlayer(dx, dy, { haptic = false } = {}) {
    const newX = state.player.x + dx;
    const newY = state.player.y + dy;

    if (newX >= 0 && newX < state.cols && newY >= 0 && newY < state.rows) {
        const targetTile = state.map[newY][newX];
        const ownedItems = new Set(state.inventoryItems);
        Object.entries(engineRuntimeState.materialInventory || {}).forEach(([item, count]) => {
            if (Number(count) > 0) ownedItems.add(item);
        });
        if (engineRuntimeState.brass > 0) ownedItems.add('brass-stock');
        if (canEnterCell(targetTile, { rules: state.cellEntryRules, items: ownedItems })
            && !isBuildingCellBlocked(newX, newY)) {
            const previousShoreProfile = getShoreSoundProfile(state.map, state.player.x, state.player.y);
            let surface = null;
            for (let index = state.buildings.length - 1; index >= 0; index--) {
                const building = state.buildings[index];
                if (building.x === newX && building.y === newY && getSurfaceSoundProfile(building.id)) {
                    surface = building;
                    break;
                }
            }
            const footstepProfile = getSurfaceSoundProfile(surface?.id) || getTerrainSoundProfile(targetTile);
            state.player.x = newX;
            state.player.y = newY;
            if (haptic) triggerMovementHaptic();
            playGameSound(footstepProfile, {
                singleHit: true,
                ...(surface ? {} : { normalizeToProfile: 'grass' })
            });
            const shoreProfile = getShoreSoundProfile(state.map, newX, newY);
            if (shoreProfile && shoreProfile !== previousShoreProfile) {
                playGameSound(shoreProfile, { singleHit: true, normalizeToProfile: 'grass' });
            }
            stopPlayerTargetedScrolls(true);
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
    const values = {
        'main-engine-steam': save.steamPower,
        'main-engine-water': save.water,
        'main-engine-fog': save.fog,
        'main-engine-power': save.power
    };
    const displayValues = Object.fromEntries(Object.entries(values).map(([id, value]) => [
        id,
        formatCompactCount(id === 'main-engine-steam' ? Math.floor(Number(value) || 0) : value)
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
    const consumptionRates = {
        water: save.waterConsumptionRate,
        fog: save.fogConsumptionRate,
        power: save.powerConsumptionRate,
        steam: save.steamConsumptionRate
    };
    const collectedMaterialRates = new Map();
    if (save.mainGearRunning && (save.creativeMode || save.steamPower > 0) && state.map.length) {
        save.getActiveScrollRuntimes(performance.now()).forEach(runtime => {
            const targetStand = runtime.target.buildingInstanceId
                ? state.buildings.find(building => building.instanceId === runtime.target.buildingInstanceId
                    && supportsStationaryScrolls(building) && building.craftingScrollId === runtime.scrollId)
                : null;
            if (runtime.target.buildingInstanceId
                ? !targetStand || targetStand.x !== runtime.target.x || targetStand.y !== runtime.target.y
                : runtime.target.x !== state.player.x || runtime.target.y !== state.player.y) return;
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
        rate: formatCompactCount(rate)
    }));
    const dashboard = document.querySelector('.gear-preview-dashboard');
    if (dashboard) {
        Object.entries(displayValues).forEach(([id, value]) => {
            const element = dashboard.querySelector(`#${id}`);
            const text = String(value);
            if (element && element.textContent !== text) element.textContent = text;
        });
        Object.entries(rates).forEach(([id, value]) => {
            const element = dashboard.querySelector(`#${id}`);
            const text = `${formatCompactCount(value)} /秒`;
            if (element && element.textContent !== text) element.textContent = text;
        });
        dashboard.querySelectorAll('[data-generated-resource]').forEach(row => {
            const resource = row.dataset.generatedResource;
            const hidden = !(Number(generationRates[resource]) > 0 || Number(consumptionRates[resource]) > 0);
            if (row.hidden !== hidden) row.hidden = hidden;
        });
        const resourceTable = dashboard.querySelector('.dashboard-resource-table');
        const collectedIds = new Set(collectedMaterials.map(material => material.itemId));
        resourceTable?.querySelectorAll('[data-collected-material]').forEach(row => {
            if (!collectedIds.has(row.dataset.collectedMaterial)) row.remove();
        });
        collectedMaterials.forEach(material => {
            if (typeof material.itemId !== 'string' || typeof material.name !== 'string') return;
            let row = resourceTable?.querySelector(`[data-collected-material="${CSS.escape(material.itemId)}"]`);
            if (!row && resourceTable) {
                row = document.createElement('div');
                row.className = 'dashboard-resource-row';
                row.dataset.collectedMaterial = material.itemId;
                row.append(document.createElement('span'), document.createElement('strong'), document.createElement('span'), document.createElement('span'));
                resourceTable.appendChild(row);
            }
            if (!row) return;
            const values = [
                material.name,
                formatInventoryCount(material.itemId, material.amount),
                `${material.rate} /秒`,
                '—'
            ];
            values.forEach((value, index) => {
                if (row.children[index].textContent !== value) row.children[index].textContent = value;
            });
        });
        const creativeIndicator = dashboard.querySelector('#main-creative-mode-indicator');
        if (creativeIndicator && creativeIndicator.hidden === Boolean(save.creativeMode)) {
            creativeIndicator.hidden = !save.creativeMode;
        }
    }
    const dashboardMessage = {
        type: 'fogsgear:engine-dashboard',
        values: displayValues,
        rates: Object.fromEntries(Object.entries(rates).map(([id, value]) => [id, `${formatCompactCount(value)} /秒`])),
        generationRates,
        consumptionRates,
        collectedMaterials,
        creativeMode: Boolean(save.creativeMode)
    };
    const previewFrame = document.querySelector('.gear-preview-page iframe');
    [previewFrame, appPageFrame].forEach(frame => frame?.contentWindow?.postMessage(dashboardMessage, '*'));
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
    const isInstalledFullscreen = window.matchMedia('(display-mode: fullscreen)').matches;
    const isInstalledStandalone = window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
    const isFullscreen = isInstalledFullscreen
        || (!isInstalledStandalone && Boolean(document.fullscreenElement));
    button.hidden = isInstalledFullscreen;
    button.textContent = isInstalledStandalone
        ? '全画面設定を反映'
        : isFullscreen ? '全画面を解除' : '全画面表示';
    button.setAttribute('aria-pressed', String(isFullscreen));
}

updateFullscreenButton();

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
        updateFullscreenButton();
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
let gameResetInProgress = false;
let engineTickIntervalId = null;
let buildingUtilityIntervalId = null;
let buildingSoundIntervalId = null;
let gearEditorFrame = null;

function pushOverlayHistory(kind) {
    const currentState = history.state && typeof history.state === 'object' ? history.state : {};
    history.pushState({ ...currentState, fogsgearOverlay: kind }, '', window.location.href);
}

function clearOverlayHistory() {
    const { fogsgearOverlay, ...state } = history.state && typeof history.state === 'object' ? history.state : {};
    history.replaceState(state, '', window.location.href);
}

function closeGearEditorOverlay(syncHistory = false) {
    if (!gearEditorFrame) return;
    gearEditorFrame.parentElement?.remove();
    gearEditorFrame = null;
    if (syncHistory && history.state?.fogsgearOverlay === 'gear-editor') history.back();
}

function closeAppPageOverlay(syncHistory = false) {
    if (!appPageFrame) return;
    appPageFrame.parentElement?.remove();
    appPageFrame = null;
    if (syncHistory && history.state?.fogsgearOverlay === 'app-page') history.back();
}

window.addEventListener('popstate', event => {
    const activeOverlay = event.state?.fogsgearOverlay;
    if (activeOverlay !== 'gear-editor') closeGearEditorOverlay();
    if (activeOverlay !== 'app-page') closeAppPageOverlay();
});

function openAppPage(path, title) {
    if (appPageFrame) closeAppPageOverlay();
    if (gearEditorFrame) closeGearEditorOverlay();
    const overlay = document.createElement('div');
    overlay.className = 'app-page-overlay';
    const frame = document.createElement('iframe');
    frame.title = title;
    frame.src = new URL(path, window.location.href).href;
    frame.addEventListener('load', () => {
        if (appPageFrame === frame) updateEngineDashboard();
    }, { once: true });
    overlay.appendChild(frame);
    document.body.appendChild(overlay);
    appPageFrame = frame;
    pushOverlayHistory('app-page');
}

function openGearEditor(material, scrollId = null) {
    if (gearEditorFrame) closeGearEditorOverlay();
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
    pushOverlayHistory('gear-editor');
    closeInventoryItem();
}

async function toggleFullscreen() {
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
        showAppNotice('このインストールアプリには全画面設定が反映されていません。ホーム画面からアプリをアンインストールし、Chromeから再インストールしてください。キャッシュ削除だけでは表示モードは更新されません。');
        return;
    }
    if (!document.fullscreenEnabled) {
        showAppNotice('このアプリでは全画面表示に切り替えられません。アプリを最新版に更新してください。');
        return;
    }
    if (document.fullscreenElement) {
        await document.exitFullscreen();
    } else {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
}

function closeGuideModal() {
    if (document.body.classList.contains('guide-item-detail-open')) closeRecipeDetail();
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
    frame.src = 'cell-atlas.html?modal=1&v=13';
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
    if (button.dataset.action === 'select-craft-quantity') {
        const toggle = button.closest('.crafting-quantity-toggle');
        const card = button.closest('.crafting-recipe-card');
        if (!toggle || !card || button.disabled) return;
        toggle.querySelectorAll('.crafting-quantity-option').forEach(option => {
            const selected = option === button;
            option.setAttribute('aria-pressed', String(selected));
        });
        const quantity = Number(button.dataset.quantity) || 0;
        const selectedCount = button.dataset.isMaximum === 'true'
            ? getMaximumCraftCountForCard(card)
            : quantity;
        craftingQuantitySelections.set(
            toggle.dataset.selectionKey,
            button.dataset.isMaximum === 'true' ? 'max' : selectedCount
        );
        const outputCount = selectedCount * (Number(toggle.dataset.outputBatch) || 1);
        const outputCountLabel = card.querySelector('.crafting-output-count');
        const craftButton = card.querySelector('[data-action="craft-recipe"], [data-action="craft-building-kit"]');
        if (outputCountLabel) outputCountLabel.textContent = `×${outputCount}`;
        if (craftButton) craftButton.textContent = `製作 ×${outputCount}`;
        updateCraftingMaterialCounts(card, selectedCount);
        return;
    }
    if (button.dataset.action === 'craft-building-kit') {
        const selectedQuantity = button.closest('.building-item-card')?.querySelector('.crafting-quantity-option[aria-pressed="true"]');
        const quantity = selectedQuantity?.dataset.isMaximum === 'true' ? 'max' : selectedQuantity?.dataset.quantity;
        craftBuildingKit(button.dataset.buildingId, quantity);
        return;
    }
    if (button.dataset.action === 'add-building-crafting-reservation') {
        const card = button.closest('.building-item-card');
        const quantity = Math.floor(Number(card?.querySelector('.crafting-reservation-quantity input')?.value));
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
            showAppNotice('予約数は1〜99個で指定してください。');
            return;
        }
        addBuildingCraftingReservation(button.dataset.buildingId, quantity);
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
        transferBuildingStorage(selectedStorageStack ? 'withdraw' : 'deposit');
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
    if (button.dataset.action === 'toggle-automaton') {
        toggleSelectedAutomaton();
        return;
    }
    if (button.dataset.action === 'copy-player-skin-to-automaton') {
        const skin = getPlayerSkinConfig();
        applyAutomatonSkin(skin.url, skin.name);
        return;
    }
    if (button.dataset.action === 'demolish-building') {
        openBuildingDemolitionConfirmation();
        return;
    }
    if (button.dataset.action === 'cancel-building-demolition') {
        cancelBuildingDemolition();
        return;
    }
    if (button.dataset.action === 'confirm-building-demolition') {
        demolishSelectedBuilding();
        return;
    }
    if (button.dataset.action === 'add-crafting-reservation') {
        const card = button.closest('.crafting-recipe-card');
        const quantity = Math.floor(Number(card?.querySelector('.crafting-reservation-quantity input')?.value));
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
            showAppNotice('予約数は1〜99回で指定してください。');
            return;
        }
        addCraftingReservation(Number(button.dataset.recipeIndex), button.dataset.buildingInstanceId, quantity);
        return;
    }
    if (button.dataset.action === 'delete-crafting-reservation') {
        removeCraftingReservation(button.dataset.reservationId);
        return;
    }
    if (button.dataset.action === 'craft-recipe') {
        const selectedQuantity = button.closest('.crafting-recipe-card')?.querySelector('.crafting-quantity-option[aria-pressed="true"]');
        const quantity = selectedQuantity?.dataset.isMaximum === 'true' ? 'max' : selectedQuantity?.dataset.quantity;
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
        openAppPage('settings.html?v=8', '設定');
        return;
    }
    if (button.dataset.action === 'inspect-inventory-item') {
        if (button.dataset.itemKey === 'crafting_reservations') {
            openCraftingReservations();
            return;
        }
        if (button.dataset.itemKey === 'scroll_book') {
            openAppPage('../GearSystem/scroll-library.html?embed=1&source=scroll-book&v=14', 'スクロール書庫');
            return;
        }
        openInventoryItem(button.dataset.itemKey);
        return;
    }
    if (button.dataset.action === 'inspect-scroll') {
        const scroll = getStoredSavedScrolls().find(item => item.id === button.dataset.scrollId);
        if (scroll) {
            const materialType = SCROLL_MATERIAL_BY_TYPE.has(scroll.material)
                ? scroll.material
                : SCROLL_MATERIAL_BY_TYPE.has(scroll.scrollType) ? scroll.scrollType : 'paper';
            openInventoryItem(SCROLL_MATERIAL_BY_TYPE.get(materialType)?.itemId || 'paper_scroll', scroll);
        }
        return;
    }
    if (button.dataset.action === 'close-inventory-modal') {
        closeInventoryItem();
        return;
    }
    if (button.dataset.action === 'close-crafting-reservations') {
        closeCraftingReservations();
        return;
    }
    if (button.dataset.action === 'open-inventory-discard-confirmation') {
        openInventoryDiscardConfirmation();
        return;
    }
    if (button.dataset.action === 'cancel-inventory-discard') {
        cancelInventoryDiscard();
        return;
    }
    if (button.dataset.action === 'confirm-inventory-discard') {
        discardInventoryItem();
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
        toggleFullscreen().catch(error => {
            console.error('Fullscreen mode could not be changed.', error);
            showAppNotice('全画面表示を切り替えられませんでした。');
        });
        return;
    }
    if (button.dataset.action === 'toggle-orientation-lock') {
        toggleOrientationLock().catch(() => showAppNotice('画面方向を固定できませんでした。'));
    }
});

[
    ['automaton-axis', 'axis'],
    ['automaton-range', 'range'],
    ['automaton-speed-multiplier', 'speedMultiplier'],
    ['automaton-carry-capacity', 'carryCapacityMultiplier'],
    ['automaton-power-per-operation', 'powerPerOperation'],
    ['automaton-action', 'action'],
    ['automaton-source-storage', 'sourceStorageInstanceId'],
    ['automaton-destination-storage', 'destinationStorageInstanceId'],
    ['automaton-condition-cell', 'conditionCellType'],
    ['automaton-transform-target', 'transformTargetType'],
    ['automaton-stop-condition', 'stopCondition'],
    ['automaton-stop-limit', 'stopLimit']
].forEach(([id, setting]) => {
    document.getElementById(id)?.addEventListener('change', event => changeAutomatonSetting(setting, event.target.value));
});

[
    ['vehicle-speed-multiplier', 'speedMultiplier'],
    ['vehicle-max-wagons', 'maxWagons']
].forEach(([id, setting]) => {
    document.getElementById(id)?.addEventListener('change', event =>
        changeVehicleSetting(setting, event.currentTarget.value));
});

document.getElementById('automaton-skin-file')?.addEventListener('change', event => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => applyAutomatonSkin(String(reader.result || ''), file.name);
    reader.onerror = error => {
        console.error('Automaton skin file could not be read.', error);
        showAppNotice('画像を読み込めませんでした。');
    };
    reader.readAsDataURL(file);
});

document.querySelector('[data-item-filter-toggle]')?.addEventListener('click', () => {
    const placed = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
    if (!placed || BUILDING_BY_ID.get(placed.id)?.kind !== 'automaton') return;
    const automaton = getAutomatonState(placed);
    changeAutomatonSetting('itemFilterMode', automaton.itemFilterMode === 'include' ? 'exclude' : 'include');
});

document.getElementById('automaton-item-search')?.addEventListener('input', () => {
    const placed = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
    if (placed && BUILDING_BY_ID.get(placed.id)?.kind === 'automaton') {
        renderAutomatonItemFilter(getAutomatonState(placed));
    }
});

document.getElementById('automaton-item-button')?.addEventListener('click', () => {
    const picker = document.getElementById('automaton-item-picker');
    const button = document.getElementById('automaton-item-button');
    picker.hidden = !picker.hidden;
    button.setAttribute('aria-expanded', String(!picker.hidden));
    if (!picker.hidden) {
        document.getElementById('automaton-item-search').focus();
        document.getElementById('automaton-item-search').select();
    }
});

document.getElementById('automaton-item-option-list')?.addEventListener('click', event => {
    const option = event.target.closest('.building-storage-item-option');
    if (!option || !CRAFTING_ITEM_BY_ID.has(option.dataset.itemId)) return;
    document.getElementById('automaton-item-selection').value = option.dataset.itemId;
    document.getElementById('automaton-item-picker').hidden = true;
    document.getElementById('automaton-item-button').setAttribute('aria-expanded', 'false');
    const placed = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
    if (placed && BUILDING_BY_ID.get(placed.id)?.kind === 'automaton') {
        renderAutomatonItemFilter(getAutomatonState(placed));
    }
});

document.getElementById('automaton-item-register')?.addEventListener('click', () => {
    const placed = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
    if (!placed || BUILDING_BY_ID.get(placed.id)?.kind !== 'automaton') return;
    const automaton = getAutomatonState(placed);
    const itemId = document.getElementById('automaton-item-selection').value;
    if (!CRAFTING_ITEM_BY_ID.has(itemId)) return;
    if (automaton.itemFilterIds.includes(itemId)) {
        showAppNotice(`${getCraftingItemName(itemId)}は登録済みです。`);
        return;
    }
    changeAutomatonSetting('itemFilterIds', [...automaton.itemFilterIds, itemId]);
});

document.getElementById('automaton-registered-items')?.addEventListener('click', event => {
    const remove = event.target.closest('.automaton-registered-item-remove');
    if (!remove) return;
    const placed = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
    if (!placed || BUILDING_BY_ID.get(placed.id)?.kind !== 'automaton') return;
    const itemIds = getAutomatonState(placed).itemFilterIds.filter(itemId => itemId !== remove.dataset.itemId);
    changeAutomatonSetting('itemFilterIds', itemIds);
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
    renderCellMaterials();
});

document.getElementById('inventory-item-list')?.addEventListener('toggle', event => {
    const section = event.target;
    if (!(section instanceof HTMLDetailsElement) || !section.dataset.inventoryCategory) return;
    if (normalizeInventorySearch(document.getElementById('inventory-item-search')?.value)) return;
    if (section.open) inventoryOpenCategories.add(section.dataset.inventoryCategory);
    else inventoryOpenCategories.delete(section.dataset.inventoryCategory);
}, true);

document.getElementById('crafting-recipe-search')?.addEventListener('input', () => {
    craftingRenderSignature = '';
    renderCellMaterials();
});

document.getElementById('building-crafting-search')?.addEventListener('input', renderBuildingCrafting);

document.getElementById('building-crafting-modal')?.addEventListener('click', event => {
    if (event.target === event.currentTarget) closeBuildingCrafting();
});
document.getElementById('building-scroll-select')?.addEventListener('change', event => {
    const placed = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
    if (!placed) return;
    const scrollId = event.currentTarget.value;
    const movementScrollRequired = requiresMovementScroll(placed);
    if (scrollId && !getStoredSavedScrolls().some(scroll =>
        scroll.id === scrollId && isUsableCraftingScroll(scroll)
        && !getInstalledScrollIds(placed.instanceId).has(scroll.id))) {
        event.currentTarget.value = '';
        showAppNotice('未使用の有効な保存スクロールを選択してください。');
        return;
    }
    const previousScrollId = movementScrollRequired ? getMovementScrollId(placed) : placed.craftingScrollId;
    if (previousScrollId !== scrollId) stopScrollIfRunning(previousScrollId);
    if (movementScrollRequired) setMovementScrollId(placed, scrollId);
    else if (scrollId) placed.craftingScrollId = scrollId;
    else delete placed.craftingScrollId;
    saveBuildings();
    renderSavedScrolls();
    renderBuildingScrollControls(placed);
    const kind = BUILDING_BY_ID.get(placed.id)?.kind;
    if (kind === 'automaton') renderAutomatonMenu(placed);
    else if (kind === 'locomotive') renderVehicleMenu(placed, BUILDING_BY_ID.get(placed.id));
});
document.getElementById('vehicle-movement-scroll-select')?.addEventListener('change', event => {
    const placed = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId
        && BUILDING_BY_ID.get(building.id)?.kind === 'locomotive');
    if (!placed) return;
    const scrollId = event.currentTarget.value;
    if (scrollId && !getStoredSavedScrolls().some(scroll =>
        scroll.id === scrollId && isUsableCraftingScroll(scroll)
        && !getInstalledScrollIds(placed.instanceId).has(scroll.id))) {
        event.currentTarget.value = getMovementScrollId(placed);
        showAppNotice('未使用の有効な保存スクロールを選択してください。');
        return;
    }
    const previousScrollId = getMovementScrollId(placed);
    if (previousScrollId !== scrollId) stopScrollIfRunning(previousScrollId);
    setMovementScrollId(placed, scrollId);
    saveBuildings();
    renderSavedScrolls();
    renderBuildingScrollControls(placed);
    renderVehicleMenu(placed, BUILDING_BY_ID.get(placed.id));
});
document.getElementById('automaton-movement-scroll-select')?.addEventListener('change', event => {
    const placed = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId
        && BUILDING_BY_ID.get(building.id)?.kind === 'automaton');
    if (!placed) return;
    const scrollId = event.currentTarget.value;
    if (scrollId && !getStoredSavedScrolls().some(scroll =>
        scroll.id === scrollId && isUsableCraftingScroll(scroll)
        && !getInstalledScrollIds(placed.instanceId).has(scroll.id))) {
        event.currentTarget.value = '';
        showAppNotice('未使用の有効な保存スクロールを選択してください。');
        return;
    }
    const previousScrollId = getMovementScrollId(placed);
    if (previousScrollId !== scrollId) stopScrollIfRunning(previousScrollId);
    setMovementScrollId(placed, scrollId);
    saveBuildings();
    renderSavedScrolls();
    renderAutomatonMenu(placed);
});
document.getElementById('building-overclock-select')?.addEventListener('change', event => {
    const placed = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
    if (!placed) return;
    const selectedMultiplier = Number(event.currentTarget.value);
    const overclock = CRAFTING_OVERCLOCK_OPTIONS.find(option => option.speedMultiplier === selectedMultiplier);
    if (!overclock) {
        event.currentTarget.value = String(getCraftingOverclock(placed).speedMultiplier);
        showAppNotice('オーバークロック倍率を選択できませんでした。');
        return;
    }
    if (getCraftingOverclock(placed).speedMultiplier === overclock.speedMultiplier) return;
    placed.craftingOverclockMultiplier = overclock.speedMultiplier;
    saveBuildings();

    const now = Date.now();
    engineRuntimeState.craftingJobs
        .filter(job => job.requiresPower && job.craftingStationId === placed.instanceId)
        .forEach(job => {
            const workDuration = Math.max(1, Number(job.workDurationMs) || Number(job.durationMs) || 1);
            const workRemaining = Number(job.workRemainingMs);
            job.workDurationMs = workDuration;
            job.workRemainingMs = Number.isFinite(workRemaining) ? Math.max(0, workRemaining) : workDuration;
            job.durationMs = workDuration / overclock.speedMultiplier;
            if (Number(job.startedAt) <= now && job.workRemainingMs > 0) {
                job.completesAt = now + job.workRemainingMs / overclock.speedMultiplier;
            }
        });
    engineRuntimeState.scheduleCraftingJobs([], now, placed.instanceId);
    engineRuntimeState.saveGameData();
    engineRuntimeState.notify();
    updateBuildingScrollStatus(placed);
    updateEngineDashboard();
    syncCraftingNotifications(true);
});
document.getElementById('building-scroll-toggle')?.addEventListener('click', toggleBuildingScroll);
document.getElementById('automaton-scroll-toggle')?.addEventListener('click', toggleBuildingScroll);
document.getElementById('vehicle-scroll-toggle')?.addEventListener('click', toggleBuildingScroll);
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
    if (gearEditorFrame && event.source === gearEditorFrame.contentWindow) {
        if (event.data?.type === 'fogsgear:close-editor') {
            closeGearEditorOverlay(true);
            return;
        }
    }
    const scrollLibraryFrame = [
        appPageFrame,
        document.querySelector('iframe[title="保存スクロールのギアプレビュー"]')
    ].find(frame => frame && event.source === frame.contentWindow);
    if (appPageFrame && event.source === appPageFrame.contentWindow) {
        if (event.data?.type === 'fogsgear:reload-game-save') {
            window.clearInterval(engineTickIntervalId);
            window.clearInterval(buildingUtilityIntervalId);
            window.clearInterval(buildingSoundIntervalId);
            closeAppPageOverlay();
            clearOverlayHistory();
            window.location.reload();
            return;
        }
        if (event.data?.type === 'fogsgear:skin-updated'
            && typeof event.data.url === 'string'
            && typeof event.data.sourceType === 'string') {
            applySelectedSkinSource(event.data.url, event.data.sourceType, String(event.data.name || ''))
                .then(scheduleDraw)
                .catch(error => {
                    console.warn('Skin load failed; using fallback.', error);
                    showAppNotice('画像を読み込めませんでした。');
                });
            return;
        }
        if (event.data?.type === 'fogsgear:close-page') {
            closeAppPageOverlay(true);
            return;
        }
        if (event.data?.type === 'fogsgear:reset-game') {
            if (gameResetInProgress) return;
            gameResetInProgress = true;
            window.clearInterval(engineTickIntervalId);
            window.clearInterval(buildingUtilityIntervalId);
            window.clearInterval(buildingSoundIntervalId);
            try {
                clearGameProgress(Boolean(event.data.keepSavedGears));
            } catch (error) {
                gameResetInProgress = false;
                console.error('Game progress reset failed.', error);
                event.source.postMessage({ type: 'fogsgear:reset-game-failed', message: '保存データを消去できませんでした。空き容量やブラウザー設定を確認してください。' }, window.location.origin);
                return;
            }
            closeAppPageOverlay();
            clearOverlayHistory();
            window.location.reload();
            return;
        }
    }
    const guideFrame = document.querySelector('.guide-modal iframe');
    if (guideFrame && event.source === guideFrame.contentWindow && event.data?.type === 'fogsgear:show-guide-item-detail') {
        const itemId = String(event.data.itemId || '');
        if (itemId.length > 100 || !(
            CRAFTING_ITEM_BY_ID.has(itemId)
            || BUILDING_BY_ID.has(itemId)
            || Object.prototype.hasOwnProperty.call(CELL_MATERIALS, itemId)
            || Object.prototype.hasOwnProperty.call(INVENTORY_ITEM_DEFINITIONS, itemId)
        )) return;
        document.body.classList.add('guide-item-detail-open');
        showRecipeDetail(itemId);
        return;
    }
    if (scrollLibraryFrame && event.data?.type === 'fogsgear:copy-scroll') {
        const requestId = typeof event.data.requestId === 'string' ? event.data.requestId.slice(0, 100) : '';
        const respond = result => event.source.postMessage({
            type: 'fogsgear:copy-scroll-result',
            requestId,
            ...result
        }, event.origin === 'null' ? '*' : window.location.origin);
        try {
            if (!requestId) throw new Error('写本リクエストを識別できません。');
            if ((localStorage.getItem(GAME_PROGRESS_EPOCH_KEY) || '') !== gameProgressEpochAtStart) {
                throw new Error('ゲームデータがリセットされました。画面を再読み込みしてください。');
            }
            const scrollId = String(event.data.scrollId || '');
            const sourceScroll = getStoredSavedScrolls().find(scroll => scroll.id === scrollId);
            if (!sourceScroll) throw new Error('写本する設計図が見つかりません。');
            if (getInstalledScrollIds().has(scrollId)) {
                throw new Error('設置中のスクロールは、建物から回収してから写本してください。');
            }
            const material = SCROLL_MATERIAL_BY_TYPE.get(event.data.material);
            if (!material) throw new Error('写本先の種類を選択してください。');
            if (!Array.isArray(sourceScroll.blueprint?.gears)
                || sourceScroll.blueprint.gears.filter(gear => gear.isCore).length !== 1) {
                throw new Error('この設計図のギア構成は写本できません。');
            }
            const copyCost = sourceScroll.blueprint.gears.reduce((total, gear) => {
                if (gear.isCore) return total;
                const cost = ENGINE_GEAR_CONFIG[gear.size]?.cost;
                if (!Number.isFinite(cost)) throw new Error('設計図に不明なギアサイズがあります。');
                return total + cost;
            }, 0);
            if (copyCost <= 0) throw new Error('メインギア以外のギアがないため写本できません。');
            const chargedCost = engineRuntimeState.creativeMode ? 0 : copyCost;
            if (engineRuntimeState.brass < chargedCost) {
                throw new Error(`真鍮資材が不足しています（必要 ${chargedCost} / 所持 ${Math.floor(engineRuntimeState.brass)}）。`);
            }
            const materialCount = Math.floor(Number(engineRuntimeState.materialInventory[material.itemId]) || 0);
            if (!engineRuntimeState.creativeMode && materialCount < 1) {
                throw new Error(`${material.label}スクロール素材がありません。合成してから写本してください。`);
            }
            const library = getStoredSavedScrolls();
            const name = getUniqueScrollName(event.data.name, library);
            const now = Date.now();
            const copy = {
                ...sourceScroll,
                id: `scroll-${now}-${Math.random().toString(16).slice(2, 8)}`,
                name,
                createdAt: now,
                material: material.type,
                usedRotations: 0,
                effect: JSON.parse(JSON.stringify(sourceScroll.effect || { type: 'custom', label: '未設定', config: {} })),
                blueprint: JSON.parse(JSON.stringify(sourceScroll.blueprint)),
                metadata: { ...(sourceScroll.metadata || {}), source: 'scroll-copy', version: 1 }
            };
            const previousLibrary = localStorage.getItem('fogsgear_scroll_library');
            const previousBrass = engineRuntimeState.brass;
            try {
                library.unshift(copy);
                localStorage.setItem('fogsgear_scroll_library', JSON.stringify(library));
                engineRuntimeState.brass -= chargedCost;
                if (!engineRuntimeState.creativeMode) {
                    const remaining = materialCount - 1;
                    if (remaining > 0) engineRuntimeState.materialInventory[material.itemId] = remaining;
                    else delete engineRuntimeState.materialInventory[material.itemId];
                }
                engineRuntimeState.saveGameData();
            } catch (error) {
                engineRuntimeState.brass = previousBrass;
                if (!engineRuntimeState.creativeMode) {
                    if (materialCount > 0) engineRuntimeState.materialInventory[material.itemId] = materialCount;
                    else delete engineRuntimeState.materialInventory[material.itemId];
                }
                if (previousLibrary === null) localStorage.removeItem('fogsgear_scroll_library');
                else localStorage.setItem('fogsgear_scroll_library', previousLibrary);
                throw error;
            }
            respond({ success: true, name, cost: chargedCost, scrollId: copy.id });
        } catch (error) {
            respond({ success: false, message: error instanceof Error ? error.message : String(error) });
        }
        return;
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
});

document.getElementById('inventory-item-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'inventory-item-modal') closeInventoryItem();
});
document.getElementById('inventory-discard-confirm-modal')?.addEventListener('click', event => {
    if (event.target.id === 'inventory-discard-confirm-modal') cancelInventoryDiscard();
});
document.getElementById('inventory-discard-amount')?.addEventListener('input', updateInventoryDiscardConfirmation);

document.getElementById('recipe-detail-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'recipe-detail-modal') closeRecipeDetail();
});

document.getElementById('building-menu-modal')?.addEventListener('click', event => {
    if (event.target.id === 'building-menu-modal') closeBuildingMenu();
});
document.getElementById('automaton-menu-modal')?.addEventListener('click', event => {
    if (event.target.id === 'automaton-menu-modal') closeBuildingMenu();
});
document.getElementById('building-custom-name')?.addEventListener('change', event => {
    saveSelectedBuildingName(event.currentTarget);
});
document.getElementById('automaton-custom-name')?.addEventListener('change', event => {
    saveSelectedBuildingName(event.currentTarget);
});
document.getElementById('building-demolition-confirm-modal')?.addEventListener('click', event => {
    if (event.target.id === 'building-demolition-confirm-modal') cancelBuildingDemolition();
});
document.getElementById('building-storage-grid')?.addEventListener('click', event => {
    const cell = event.target.closest('.building-storage-cell');
    const placed = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
    const definition = BUILDING_BY_ID.get(placed?.id);
    if (!cell) {
        if (!placed || !definition || !selectedStorageStack) return;
        selectedStorageStack = null;
        renderBuildingStorage(placed, definition);
        return;
    }
    const itemId = cell.dataset.itemId;
    const stackCount = Math.min(99, Math.floor(Number(cell.dataset.stackCount)));
    const stackIndex = Math.floor(Number(cell.dataset.stackIndex));
    if (!placed || !definition || !CRAFTING_ITEM_BY_ID.has(itemId) || stackCount < 1) return;
    if (!Number.isInteger(stackIndex) || stackIndex < 0) return;
    const isAlreadySelected = selectedStorageStack?.itemId === itemId && selectedStorageStack.stackIndex === stackIndex;
    if (isAlreadySelected) {
        selectedStorageStack = null;
        renderBuildingStorage(placed, definition);
        return;
    }
    selectedStorageStack = { itemId, count: stackCount, stackIndex };
    const itemSelect = document.getElementById('building-storage-item');
    itemSelect.value = itemId;
    setBuildingStorageItemPickerOpen(false);
    renderBuildingStorage(placed, definition);
});

document.getElementById('building-storage-item-button')?.addEventListener('click', () => {
    const picker = document.getElementById('building-storage-item-picker');
    const isOpen = picker.matches(':popover-open') || (!picker.hidden && typeof picker.showPopover !== 'function');
    const shouldOpen = !isOpen;
    if (shouldOpen) {
        const search = document.getElementById('building-storage-item-search');
        search.value = '';
        if (state.buildings.some(building => building.instanceId === selectedBuildingInstanceId)) renderBuildingStorageItemPicker();
        setBuildingStorageItemPickerOpen(true);
        search.focus();
    } else {
        setBuildingStorageItemPickerOpen(false);
    }
});

document.getElementById('building-storage-amount-display')?.addEventListener('input', event => {
    const input = event.currentTarget;
    const amount = Number(input.value);
    const transferButton = document.getElementById('building-storage-transfer-button');
    transferButton.disabled = !Number.isInteger(amount) || amount < 1 || amount > Number(input.max);
});

document.getElementById('building-storage-amount-display')?.addEventListener('change', event => {
    const input = event.currentTarget;
    const maximum = Number(input.max);
    const amount = Math.floor(Number(input.value));
    if (Number.isInteger(amount)) {
        input.value = String(Math.min(maximum, Math.max(1, amount)));
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }
});

document.addEventListener('click', event => {
    const stepButton = event.target.closest('.quantity-dial-step');
    if (!stepButton) return;
    const input = document.getElementById(stepButton.dataset.quantityTarget);
    if (!(input instanceof HTMLInputElement) || input.disabled) return;
    const direction = Number(stepButton.dataset.step);
    const min = Number(input.min) || 0;
    const max = Number(input.max);
    const step = Number(input.step) || 1;
    const current = Number(input.value) || min;
    const precision = step < 1 ? 2 : 0;
    input.value = String(Math.min(max, Math.max(min, Number((current + direction * step).toFixed(precision)))));
    input.dispatchEvent(new Event('input', { bubbles: true }));
});

document.getElementById('building-storage-item-search')?.addEventListener('input', () => {
    if (state.buildings.some(building => building.instanceId === selectedBuildingInstanceId)) renderBuildingStorageItemPicker();
});

document.getElementById('building-storage-item-list')?.addEventListener('click', event => {
    const option = event.target.closest('.building-storage-item-option');
    if (!option || !CRAFTING_ITEM_BY_ID.has(option.dataset.itemId)) return;
    const placed = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
    const definition = BUILDING_BY_ID.get(placed?.id);
    selectedStorageStack = null;
    document.getElementById('building-storage-item').value = option.dataset.itemId;
    setBuildingStorageItemPickerOpen(false);
    if (placed && definition) renderBuildingStorage(placed, definition);
});

const craftingReservationList = document.getElementById('crafting-reservation-list');
let activeCraftingReservationDrag = null;
function clearCraftingReservationDrag() {
    craftingReservationList?.querySelectorAll('.is-drag-target, .is-dragging').forEach(row =>
        row.classList.remove('is-drag-target', 'is-dragging'));
    activeCraftingReservationDrag = null;
}

craftingReservationList?.addEventListener('pointerdown', event => {
    const handle = event.target.closest('.crafting-reservation-grip');
    if (!handle || !event.isPrimary || event.pointerType === 'mouse' && event.button !== 0) return;
    const row = handle.closest('.crafting-reservation-row');
    if (!row) return;
    activeCraftingReservationDrag = { pointerId: event.pointerId, reservationId: handle.dataset.reservationHandle };
    row.classList.add('is-dragging');
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
});

craftingReservationList?.addEventListener('pointermove', event => {
    if (!activeCraftingReservationDrag || activeCraftingReservationDrag.pointerId !== event.pointerId) return;
    const targetRow = document.elementFromPoint(event.clientX, event.clientY)?.closest('.crafting-reservation-row');
    craftingReservationList.querySelectorAll('.is-drag-target').forEach(row => row.classList.remove('is-drag-target'));
    if (targetRow && targetRow.dataset.reservationId !== activeCraftingReservationDrag.reservationId) {
        targetRow.classList.add('is-drag-target');
    }
    event.preventDefault();
});

craftingReservationList?.addEventListener('pointerup', event => {
    const drag = activeCraftingReservationDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const targetRow = document.elementFromPoint(event.clientX, event.clientY)?.closest('.crafting-reservation-row');
    const reservations = readCraftingReservations();
    const targetIndex = reservations.findIndex(reservation => reservation.id === targetRow?.dataset.reservationId);
    if (targetIndex >= 0) moveCraftingReservation(drag.reservationId, targetIndex);
    clearCraftingReservationDrag();
});

craftingReservationList?.addEventListener('pointercancel', clearCraftingReservationDrag);
craftingReservationList?.addEventListener('keydown', event => {
    const handle = event.target.closest('.crafting-reservation-grip');
    if (!handle || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const reservations = readCraftingReservations();
    const sourceIndex = reservations.findIndex(reservation => reservation.id === handle.dataset.reservationHandle);
    if (sourceIndex < 0) return;
    event.preventDefault();
    const targetIndex = sourceIndex + (event.key === 'ArrowUp' ? -1 : 1);
    if (moveCraftingReservation(handle.dataset.reservationHandle, targetIndex)) {
        [...craftingReservationList.querySelectorAll('.crafting-reservation-grip')]
            .find(button => button.dataset.reservationHandle === handle.dataset.reservationHandle)?.focus();
    }
});

document.addEventListener('pointerdown', event => {
    const picker = document.getElementById('building-storage-item-picker');
    const automatonPicker = document.getElementById('automaton-item-picker');
    if (!(event.target instanceof Element)) return;
    if (picker && !picker.hidden && !event.target.closest('.building-storage-picker')) {
        setBuildingStorageItemPickerOpen(false);
    }
    if (automatonPicker && !automatonPicker.hidden && !event.target.closest('.automaton-item-picker')) {
        automatonPicker.hidden = true;
        document.getElementById('automaton-item-button').setAttribute('aria-expanded', 'false');
    }
});

document.addEventListener('pointerup', (event) => {
    const target = event.target;
    const craftingReservationModal = document.getElementById('crafting-reservation-modal');
    if (craftingReservationModal && !craftingReservationModal.hidden) {
        if (target === craftingReservationModal) closeCraftingReservations();
        return;
    }
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
    const craftingReservationModal = document.getElementById('crafting-reservation-modal');
    if (craftingReservationModal && !craftingReservationModal.hidden) {
        closeCraftingReservations();
        event.preventDefault();
        return;
    }
    const discardModal = document.getElementById('inventory-discard-confirm-modal');
    if (discardModal && !discardModal.hidden) {
        cancelInventoryDiscard();
        event.preventDefault();
        return;
    }
    const demolitionModal = document.getElementById('building-demolition-confirm-modal');
    if (demolitionModal && !demolitionModal.hidden) {
        cancelBuildingDemolition();
        event.preventDefault();
        return;
    }
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
    const selectedBuilding = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
    if (event.key === 'fogsgear_scroll_library' && selectedBuilding) renderBuildingScrollControls(selectedBuilding);
    if (event.key === 'fogsgear_active_scroll_id') {
        if (selectedBuilding) updateBuildingScrollStatus(selectedBuilding);
        scheduleDraw();
    }
    if (event.key === ACTIVE_SCROLL_TARGETS_KEY) refreshActiveScrollTargets();
});

window.addEventListener('fogsgear:scroll-targets-changed', event => refreshActiveScrollTargets(event.detail));

const engineRuntimeState = new EngineGameState();
migrateLegacyMaterialIds();
const engineGearManager = new EngineGearManager(engineRuntimeState);
engineRuntimeState.worldCellHandler = handleWorldCellOperation;
let activeCraftingBuildingsSignature = getActiveCraftingBuildingSignature();
engineRuntimeState.subscribe(() => {
    const inventoryPanel = document.getElementById('inventory-panel');
    if (inventoryPanel && !inventoryPanel.hidden) {
        scheduleInventoryRefresh();
    }
    if (!document.getElementById('building-crafting-modal')?.hidden) renderBuildingCrafting();
    updateCraftingCountdowns();
    updateEngineDashboard();
    const selectedBuilding = state.buildings.find(building => building.instanceId === selectedBuildingInstanceId);
    if (selectedBuilding) updateBuildingScrollStatus(selectedBuilding);
    const nextActiveCraftingBuildingsSignature = getActiveCraftingBuildingSignature();
    if (nextActiveCraftingBuildingsSignature !== activeCraftingBuildingsSignature) {
        activeCraftingBuildingsSignature = nextActiveCraftingBuildingsSignature;
        scheduleDraw();
    }
});
syncCraftingNotifications();
updateEngineDashboard();
engineTickIntervalId = window.setInterval(() => {
    if (!craftingWorldReady) return;
    advancePoweredCraftingJobs();
    engineRuntimeState.tick();
    processCraftingReservations();
}, 16);
buildingUtilityIntervalId = window.setInterval(updateBuildingUtilityNetworks, 1000);
buildingSoundIntervalId = window.setInterval(updateBuildingSoundscapeForWorld, 400);
function handlePlayerMovementKey(e) {
    const target = e.target;
    if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    let handled = true;
    switch(e.key.toLowerCase()) {
        case 'w': case 'arrowup': movePlayer(0, -1); break;
        case 's': case 'arrowdown': movePlayer(0, 1); break;
        case 'a': case 'arrowleft': movePlayer(-1, 0); break;
        case 'd': case 'arrowright': movePlayer(1, 0); break;
        default: handled = false;
    }
    if (handled && e.key.toLowerCase().startsWith('arrow')) e.preventDefault();
}
window.addEventListener('keydown', handlePlayerMovementKey);

function triggerMovementHaptic(duration = 12) {
    if (typeof navigator.vibrate === 'function') navigator.vibrate(duration);
}

const joystick = document.getElementById('move-joystick');
const joystickKnob = joystick?.querySelector('.movement-joystick-knob');
let joystickDirection = '';
let joystickSuppressClicksUntil = 0;
let continuousMoveOwner = null;
let continuousMoveDirection = '';
let continuousMoveDelayTimer = null;
let continuousMoveTimer = null;

const MOVEMENT_VECTORS = Object.freeze({
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0]
});

function moveInDirection(direction) {
    const movement = MOVEMENT_VECTORS[direction];
    if (movement) movePlayer(movement[0], movement[1], { haptic: true });
}

function stopContinuousMovement(owner = null) {
    if (owner && continuousMoveOwner !== owner) return;
    if (continuousMoveDelayTimer) {
        window.clearTimeout(continuousMoveDelayTimer);
        continuousMoveDelayTimer = null;
    }
    if (continuousMoveTimer) {
        window.clearInterval(continuousMoveTimer);
        continuousMoveTimer = null;
    }
    continuousMoveOwner = null;
    continuousMoveDirection = '';
}

function startContinuousMovement(owner, direction) {
    if (continuousMoveOwner === owner && continuousMoveDirection === direction) return;
    stopContinuousMovement();
    continuousMoveOwner = owner;
    continuousMoveDirection = direction;
    moveInDirection(direction);
    continuousMoveDelayTimer = window.setTimeout(() => {
        continuousMoveDelayTimer = null;
        if (continuousMoveOwner !== owner || continuousMoveDirection !== direction) return;
        continuousMoveTimer = window.setInterval(() => {
            if (continuousMoveOwner === owner && continuousMoveDirection === direction) {
                moveInDirection(direction);
            }
        }, 180);
    }, 300);
}

const movementButtons = [
    ['move-up', 'up'],
    ['move-down', 'down'],
    ['move-left', 'left'],
    ['move-right', 'right']
];

for (const [buttonId, direction] of movementButtons) {
    const button = document.getElementById(buttonId);
    let suppressPointerClick = false;
    button.addEventListener('pointerdown', event => {
        suppressPointerClick = true;
        button.setPointerCapture(event.pointerId);
        startContinuousMovement(button, direction);
    });
    const stopButtonMovement = event => {
        if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
        stopContinuousMovement(button);
    };
    button.addEventListener('pointerup', stopButtonMovement);
    button.addEventListener('pointercancel', event => {
        suppressPointerClick = false;
        stopButtonMovement(event);
    });
    button.addEventListener('lostpointercapture', () => stopContinuousMovement(button));
    button.addEventListener('click', event => {
        if (suppressPointerClick && event.detail > 0) {
            suppressPointerClick = false;
            return;
        }
        suppressPointerClick = false;
        moveInDirection(direction);
    });
}

window.addEventListener('blur', () => stopContinuousMovement());
document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopContinuousMovement();
});

function resetJoystick() {
    joystickDirection = '';
    stopContinuousMovement(joystick);
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
        stopContinuousMovement(joystick);
        joystick.setAttribute('aria-valuenow', '0');
        return;
    }

    const nextDirection = Math.abs(deltaX) > Math.abs(deltaY)
        ? (deltaX > 0 ? 'right' : 'left')
        : (deltaY > 0 ? 'down' : 'up');
    if (nextDirection === joystickDirection) return;
    joystickDirection = nextDirection;
    joystick.setAttribute('aria-valuenow', nextDirection === 'right' || nextDirection === 'down' ? '1' : '-1');
    startContinuousMovement(joystick, nextDirection);
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
const movementPreviewIframes = document.querySelectorAll('#building-scroll-preview-frame, #vehicle-scroll-preview-frame, #automaton-scroll-preview-frame, .gear-preview-page iframe');
const movementPreviewDocuments = new WeakSet();
const canvasContainer = document.getElementById('canvas-container');
let currentMainPage = 0;
let mainPagePointerStart = null;
let mainPagePointerId = null;
const mainPageIgnoredPointerIds = new Set();
let mainPageTouchStart = null;
let mainPageTouchId = null;

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

function bindMovementKeysToPreview(iframe) {
    const bindDocument = () => {
        const frameDocument = iframe.contentDocument;
        if (!frameDocument || movementPreviewDocuments.has(frameDocument)) return;
        movementPreviewDocuments.add(frameDocument);
        frameDocument.addEventListener('keydown', handlePlayerMovementKey, true);
    };
    iframe.addEventListener('load', bindDocument);
    bindDocument();
}

movementPreviewIframes.forEach(bindMovementKeysToPreview);

mainPageDots.forEach(dot => dot.addEventListener('click', () => setMainPage(Number(dot.dataset.mainPage))));
mainPageArrows.forEach(arrow => arrow.addEventListener('click', () => {
    setMainPage(currentMainPage + (arrow.dataset.mainPage === 'next' ? 1 : -1));
}));
const captureMainPageSwipe = (event, allowInteractiveTarget = false) => {
    mainPagePointerStart = null;
    mainPagePointerId = null;
    if (event.target?.closest('.movement-pad')) {
        mainPageIgnoredPointerIds.add(event.pointerId);
        mainPageTouchStart = null;
        mainPageTouchId = null;
        return;
    }
    if (event.pointerType === 'touch') return;
    if (!allowInteractiveTarget && event.target && event.target.closest('button, input, select, .crafting-progress-card')) return;
    mainPagePointerStart = { x: event.clientX, y: event.clientY };
    mainPagePointerId = event.pointerId;
};
const releaseMainPageSwipe = (event, start = mainPagePointerStart) => {
    if (mainPageIgnoredPointerIds.delete(event.pointerId)
        || event.target?.closest('.movement-pad')
        || mainPagePointerId !== event.pointerId) {
        if (mainPagePointerId === event.pointerId) {
            mainPagePointerStart = null;
            mainPagePointerId = null;
        }
        return;
    }
    if (!start) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    mainPagePointerStart = null;
    mainPagePointerId = null;
    if (Math.abs(deltaX) < 42 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
    setMainPage(currentMainPage + (deltaX < 0 ? 1 : -1));
};
const captureMainPageTouch = event => {
    mainPageTouchStart = null;
    mainPageTouchId = null;
    if (event.target?.closest('.movement-pad')) {
        mainPagePointerStart = null;
        return;
    }
    if (event.target?.closest('.crafting-progress-card')) return;
    const touch = event.changedTouches[0];
    if (touch) {
        mainPageTouchStart = { x: touch.clientX, y: touch.clientY };
        mainPageTouchId = touch.identifier;
    }
};
const releaseMainPageTouch = event => {
    const touch = event.changedTouches[0];
    if (event.target?.closest('.movement-pad') || touch?.target?.closest?.('.movement-pad')) {
        mainPageTouchStart = null;
        mainPageTouchId = null;
        return;
    }
    if (!touch || touch.identifier !== mainPageTouchId || !mainPageTouchStart) return;
    const start = mainPageTouchStart;
    mainPageTouchStart = null;
    mainPageTouchId = null;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 42 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
    setMainPage(currentMainPage + (deltaX < 0 ? 1 : -1));
};

mainPageViewport?.addEventListener('pointerdown', captureMainPageSwipe);
mainPageViewport?.addEventListener('pointerup', event => releaseMainPageSwipe(event));
mainPageViewport?.addEventListener('pointercancel', event => {
    mainPageIgnoredPointerIds.delete(event.pointerId);
    if (mainPagePointerId === event.pointerId) {
        mainPagePointerStart = null;
        mainPagePointerId = null;
    }
});
mainPageViewport?.addEventListener('touchstart', captureMainPageTouch, { passive: true });
mainPageViewport?.addEventListener('touchend', releaseMainPageTouch, { passive: true });
mainPageViewport?.addEventListener('touchcancel', event => {
    const touch = event.changedTouches[0];
    if (!touch || touch.identifier === mainPageTouchId) {
        mainPageTouchStart = null;
        mainPageTouchId = null;
    }
}, { passive: true });

const bindGearPreviewSwipe = () => {
    if (!gearPreviewIframe || !gearPreviewIframe.contentWindow || !gearPreviewIframe.contentWindow.document) return;
    const frameDocument = gearPreviewIframe.contentWindow.document;
    const capturePreviewSwipe = event => captureMainPageSwipe(event, true);
    frameDocument.addEventListener('pointerdown', capturePreviewSwipe, { passive: true, capture: true });
    frameDocument.addEventListener('pointerup', event => releaseMainPageSwipe(event), { passive: true, capture: true });
    frameDocument.addEventListener('pointercancel', event => {
        mainPageIgnoredPointerIds.delete(event.pointerId);
        if (mainPagePointerId === event.pointerId) {
            mainPagePointerStart = null;
            mainPagePointerId = null;
        }
    }, { passive: true });
    frameDocument.addEventListener('touchstart', captureMainPageTouch, { passive: true, capture: true });
    frameDocument.addEventListener('touchend', releaseMainPageTouch, { passive: true, capture: true });
    frameDocument.addEventListener('touchcancel', event => {
        const touch = event.changedTouches[0];
        if (!touch || touch.identifier === mainPageTouchId) {
            mainPageTouchStart = null;
            mainPageTouchId = null;
        }
    }, { passive: true, capture: true });
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
        if (isOpen && panel.id === 'inventory-panel') renderSavedScrolls();
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
        const appScope = new URL('../', window.location.href);
        const previousScope = new URL('./', window.location.href);
        navigator.serviceWorker.register('../sw.js', { scope: appScope.pathname })
            .then(async () => {
                const registrations = await navigator.serviceWorker.getRegistrations();
                await Promise.all(registrations
                    .filter(registration => registration.scope === previousScope.href)
                    .map(registration => registration.unregister()));
            })
            .catch(error => console.error('Service worker registration failed:', error));
    });
}

init().catch(error => {
    console.error('Game initialization failed.', error);
    const panel = document.querySelector('.loading-panel');
    panel?.classList.add('is-error');
    const loadingMessage = document.getElementById('loadingMessage');
    const detail = error instanceof Error ? error.message : String(error);
    if (loadingMessage) loadingMessage.textContent = `起動失敗［${startupStage}］: ${detail}`;
    const retryButton = document.getElementById('loading-retry');
    if (retryButton) retryButton.hidden = false;
});
