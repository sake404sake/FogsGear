import { GearNetwork } from './GearSystem.js?v=network-8';
import { ACTIVE_SCROLL_TARGETS_KEY, CELL_MATERIALS, TERRAIN_TRANSFORM_RECIPES, WORLD_CELL_TYPES } from '../../MapSystem/js/worldCells.js?v=12';

const ACTIVE_SCROLL_SYNC_STATE_KEY = 'fogsgear_active_scroll_sync_state';
const INITIAL_MATERIAL_INVENTORY = Object.freeze({ paper_scroll: 10, cloth_scroll: 10, scroll_book: 1 });
const MATERIAL_INVENTORY_VERSION = 4;
const LEGACY_INITIAL_MATERIAL_INVENTORY = Object.freeze({ 'iron-screw': 12, 'pressure-gauge': 1 });

function removeLegacyInitialMaterials(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const inventory = { ...value };
    Object.entries(LEGACY_INITIAL_MATERIAL_INVENTORY).forEach(([itemId, initialAmount]) => {
        const amount = Number(inventory[itemId]);
        if (!Number.isFinite(amount)) return;
        if (amount <= initialAmount) delete inventory[itemId];
        else inventory[itemId] = amount - initialAmount;
    });
    return inventory;
}

function restoreMaterialInventory(value, version = MATERIAL_INVENTORY_VERSION) {
    const inventoryData = Number(version) < MATERIAL_INVENTORY_VERSION ? removeLegacyInitialMaterials(value) : value;
    const inventory = { ...INITIAL_MATERIAL_INVENTORY, ...(inventoryData && typeof inventoryData === 'object' && !Array.isArray(inventoryData) ? inventoryData : {}) };
    if (Number(version) === 3) {
        inventory.wood = Math.max(0, (Number(inventoryData?.wood) || 0) - 10);
    }
    if (Number(inventory.old_screw) > 0) inventory['iron-screw'] = (Number(inventory['iron-screw']) || 0) + Number(inventory.old_screw);
    delete inventory.old_screw;
    delete inventory.brass_gear;
    delete inventory.liquid_metal;
    delete inventory.solid_metal;
    return inventory;
}

/**
 * GameState - リソース、ギア、保存データ、Undo/Redo履歴の管理モジュール
 */
export class GameState {
    // 資源、配置ギア、保存、Undo/Redo、UI通知を一元管理するアプリケーション状態。
    constructor() {
        this.steamPower = 100;
        this.power = 0;
        this.water = 200;
        this.fog = 0;
        this.brass = 300;
        this.creativeMode = false;
        this.creativeSnapshot = null;
        this.materialInventoryVersion = MATERIAL_INVENTORY_VERSION;
        this.materialInventory = { ...INITIAL_MATERIAL_INVENTORY };
        this.craftingJobs = [];
        this.craftingParallelSlots = 1;
        this.productionRate = 0;
        this.rotationProgress = new Map();
        this.controlStates = new Map();
        this.waterRecoveryRate = 0;
        this.waterGenerationRate = 0;
        this.waterConsumptionRate = 0;
        this.fogRecoveryRate = 0;
        this.fogConsumptionRate = 0;
        this.fogToWaterRate = 0;
        this.steamTransformRate = 0;
        this.generatedSteamRate = 0;
        this.steamGenerationRate = 0;
        this.steamConsumptionRate = 0;
        this.powerGenerationRate = 0;
        this.powerConsumptionRate = 0;
        this.powerConsumedThisTick = 0;
        this.mainGearRunning = true;
        this.autoStoppedBySteam = false;
        this.userStoppedMainGear = false;
        this.lastTickAt = performance.now();
        this.lastTickElapsed = 1 / 60;
        this.lastStorageSaveAt = 0;
        this.lastExternalSaveAt = 0;
        
        this.selectedSize = null;
        this.selectedLayer = 0;
        
        this.placedGears = [];
        this.belts = [];
        this.selectedItem = 'NONE';
        this.beltSelection = [];
        this.ghostGear = null;
        this.showLoops = false;
        this.visibleLayers = [true, true, true];
        this.showBelts = true;
        this.dashboardOpen = false;
        this.rateTableOpen = false;
        this.zoomScale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistory = 30;
        this.createGear = null;
        this.selectedGearId = null;
        this.hoveredGearIds = [];
        this.currentScrollId = null;
        this.currentScrollMaterial = null;
        this.isScrollEditing = false;
        this.runtimeGears = null;
        this.runtimeBelts = null;
        this.runtimeNetwork = null;
        this.activeScrollRuntimes = [];
        this.activeScrollSignature = '';
        this.worldCellHandler = null;
        this.lastActiveScrollSyncAt = 0;
        window.addEventListener('storage', event => {
            if (event.key === ACTIVE_SCROLL_TARGETS_KEY) {
                this.syncActiveScrollTargets(event.newValue);
            } else if (event.key === null || ['fogsgear_active_scroll_id', 'fogsgear_scroll_library'].includes(event.key)) {
                this.activeScrollSignature = '';
            }
        });
        
        this.listeners = [];
    }

    isEditorRuntimeContext() {
        // ギア編集画面はマップ本体の外部保存状態で停止させない。
        return /(?:^|\/)GearSystem(?:\/|$)/.test(window.location.pathname || '');
    }

    subscribe(listener) {
        // UIなどを購読者として登録し、状態変更時に再描画を依頼する。
        this.listeners.push(listener);
    }

    notify() {
        // 登録済み購読者へ最新状態を通知する。
        this.listeners.forEach(fn => fn(this));
    }

    getCurrentCosts() {
        // ネットワークがあれば実ネットワーク、なければ配置一覧から現在コストを計算する。
        return this.network
            ? { brass: this.network.calculateBrassCost(), steam: this.network.calculateSteamConsumption() }
            : { brass: this.placedGears.filter(gear => !gear.isCore).reduce((sum, gear) => sum + (gear.cost || 0), 0), steam: this.placedGears.filter(gear => !gear.isCore).reduce((sum, gear) => sum + (gear.teeth || 0), 0) };
    }

    getRuntimeGears() {
        if (!this.isScrollEditing) return this.placedGears;
        if (this.runtimeGears !== this.placedGears) this.runtimeGears = this.placedGears;
        return this.runtimeGears || this.placedGears;
    }

    getRuntimeBelts() {
        if (!this.isScrollEditing) return this.belts;
        if (this.runtimeBelts !== this.belts) this.runtimeBelts = this.belts;
        return this.runtimeBelts || this.belts;
    }

    syncActiveScrollTargets(value = null) {
        let targets;
        try {
            const stored = value === null ? localStorage.getItem(ACTIVE_SCROLL_TARGETS_KEY) : value;
            const parsed = JSON.parse(stored || '{}');
            targets = parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
            return;
        }
        this.activeScrollRuntimes.forEach(runtime => {
            const target = targets[runtime.scrollId];
            if (!Number.isInteger(target?.x) || !Number.isInteger(target?.y)) return;
            runtime.target.x = target.x;
            runtime.target.y = target.y;
        });
    }

    getActiveScrollRuntimes(now) {
        if (this.isEditorRuntimeContext() || !this.createGear || !this.network) return [];
        if (this.activeScrollSignature && now - this.lastActiveScrollSyncAt < 250) return this.activeScrollRuntimes;
        this.lastActiveScrollSyncAt = now;

        let activeScrollValue = '[]';
        let libraryValue = '[]';
        let targetValue = '{}';
        let legacyRunning = false;
        try {
            activeScrollValue = localStorage.getItem('fogsgear_active_scroll_id') || '[]';
            libraryValue = localStorage.getItem('fogsgear_scroll_library') || '[]';
            targetValue = localStorage.getItem(ACTIVE_SCROLL_TARGETS_KEY) || '{}';
            legacyRunning = localStorage.getItem('fogsgear_active_scroll_running') === 'true';
        } catch (error) {
            return [];
        }
        const signature = `${activeScrollValue}\n${libraryValue}\n${legacyRunning}`;
        if (signature === this.activeScrollSignature) return this.activeScrollRuntimes;
        this.activeScrollSignature = signature;

        let activeIds = [];
        let library = [];
        let targets = {};
        try {
            const parsedIds = JSON.parse(activeScrollValue);
            activeIds = Array.isArray(parsedIds) ? parsedIds.filter(Boolean) : legacyRunning ? [activeScrollValue] : [];
            const parsedLibrary = JSON.parse(libraryValue);
            library = Array.isArray(parsedLibrary) ? parsedLibrary : [];
            const parsedTargets = JSON.parse(targetValue);
            targets = parsedTargets && typeof parsedTargets === 'object' ? parsedTargets : {};
        } catch (error) {
            activeIds = legacyRunning ? [activeScrollValue] : [];
        }

        const activeIdSet = new Set(activeIds);
        this.activeScrollRuntimes = [];
        let targetsChanged = false;
        library.forEach(scroll => {
            if (!activeIdSet.has(scroll.id)) return;
            const blueprintGears = Array.isArray(scroll.blueprint?.gears) ? scroll.blueprint.gears : [];
            if (!blueprintGears.some(gear => gear.isCore)) return;

            const gearIdMap = new Map();
            const gears = blueprintGears.map((data, index) => {
                const sourceId = String(data.id || `preview-${index}`);
                const gearId = `active-scroll:${scroll.id}:${sourceId}`;
                const gear = this.createGear({ ...data, id: gearId });
                gearIdMap.set(sourceId, gearId);
                return gear;
            });
            gears.forEach((gear, index) => {
                gear.controlTargetGearIds = (blueprintGears[index].controlTargetGearIds || [])
                    .map(id => gearIdMap.get(String(id)))
                    .filter(Boolean);
            });
            const belts = (Array.isArray(scroll.blueprint?.belts) ? scroll.blueprint.belts : [])
                .map(belt => ({ ...belt, gearIds: (belt.gearIds || []).map(id => gearIdMap.get(String(id))).filter(Boolean) }))
                .filter(belt => belt.gearIds.length >= 2);
            const network = new GearNetwork(gears, belts);
            network.updateRotation();
            if (gears.some(gear => gear.isDeadlocked || gear.angleError)) return;
            if (!targets[scroll.id] || !Number.isInteger(targets[scroll.id].x) || !Number.isInteger(targets[scroll.id].y)) {
                let playerPosition = { x: 0, y: 0 };
                try {
                    const savedPlayer = JSON.parse(localStorage.getItem('steampunk_explorer_player_pos') || 'null');
                    if (Number.isInteger(savedPlayer?.x) && Number.isInteger(savedPlayer?.y)) playerPosition = { x: savedPlayer.x, y: savedPlayer.y };
                } catch (error) {}
                targets[scroll.id] = playerPosition;
                targetsChanged = true;
            }
            this.activeScrollRuntimes.push({ scrollId: scroll.id, target: { ...targets[scroll.id] }, gears, belts, network });
        });
        if (targetsChanged) {
            localStorage.setItem(ACTIVE_SCROLL_TARGETS_KEY, JSON.stringify(targets));
            window.dispatchEvent(new CustomEvent('fogsgear:scroll-targets-changed', { detail: targets }));
        }
        this.publishActiveScrollSyncState(this.activeScrollRuntimes);
        return this.activeScrollRuntimes;
    }

    publishActiveScrollSyncState(runtimeGroups) {
        const syncState = {};
        runtimeGroups.forEach(group => {
            if (!group.scrollId) return;
            const prefix = `active-scroll:${group.scrollId}:`;
            syncState[group.scrollId] = Object.fromEntries(group.gears.map(gear => [
                gear.id.startsWith(prefix) ? gear.id.slice(prefix.length) : gear.id,
                Boolean(gear.isLocked)
            ]));
        });
        try {
            localStorage.setItem(ACTIVE_SCROLL_SYNC_STATE_KEY, JSON.stringify(syncState));
        } catch (error) {}
    }

    setCreativeMode(active) {
        // ON直前の資源を保存し、OFF時に同じ値へ戻せるようにする。
        if (active && !this.creativeMode) {
            this.creativeSnapshot = this.getResourceSnapshot();
        } else if (!active && this.creativeMode && this.creativeSnapshot) {
            this.restoreResourceSnapshot(this.creativeSnapshot);
            this.creativeSnapshot = null;
        }
        this.creativeMode = active;
        this.saveGameData();
        this.notify();
    }

    getResourceSnapshot() {
        // クリエイティブ切替で復元する資源だけを値コピーとして取得する。
        return {
            steamPower: this.steamPower,
            power: this.power,
            water: this.water,
            fog: this.fog,
            brass: this.brass
        };
    }

    restoreResourceSnapshot(snapshot) {
        // 保存済みの資源値を現在状態へ戻す。
        this.steamPower = snapshot.steamPower;
        this.power = Number.isFinite(snapshot.power) ? snapshot.power : 0;
        this.water = snapshot.water;
        this.fog = snapshot.fog;
        this.brass = snapshot.brass;
    }

    setSelectedSize(size) {
        // 配置するサイズ選択を更新する。
        this.selectedSize = size;
        if (size !== null) {
            this.selectedItem = 'NONE';
            this.beltSelection = [];
        }
        this.notify();
    }

    setSelectedLayer(layer) {
        // 配置対象レイヤーを数値化して更新する。
        this.selectedLayer = parseInt(layer, 10);
        this.notify();
    }

    setSelectedItem(item) {
        this.selectedItem = item;
        this.selectedSize = null;
        this.ghostGear = null;
        this.beltSelection = [];
        this.notify();
    }

    toggleLayerVisibility(layer) {
        this.visibleLayers[layer] = !this.visibleLayers[layer];
        if (!this.visibleLayers[layer]) {
            const selectedGear = this.placedGears.find(gear => gear.id === this.selectedGearId);
            if (selectedGear?.layer === layer) this.selectedGearId = null;
            this.beltSelection = this.beltSelection.filter(id => {
                const gear = this.placedGears.find(item => item.id === id);
                return gear && this.visibleLayers[gear.layer];
            });
        }
        this.notify();
    }

    toggleBeltsVisibility() {
        this.showBelts = !this.showBelts;
        this.notify();
    }

    setBeltSelection(gearIds) {
        this.beltSelection = [...new Set(gearIds)];
        this.notify();
    }

    setMainGearRunning(running) {
        // 手動停止は steam > 0 時の自動再起動で上書きしないよう、停止状態を保持する。
        if (running) {
            this.mainGearRunning = true;
            this.userStoppedMainGear = false;
            this.autoStoppedBySteam = false;
        } else {
            this.mainGearRunning = false;
            this.userStoppedMainGear = true;
            this.autoStoppedBySteam = false;
        }
        this.updatePowerGrid();
        this.saveGameData();
        this.notify();
    }

    toggleMainGear() {
        this.setMainGearRunning(!this.mainGearRunning);
    }

    saveState() {
        // 操作前状態をUndo履歴へ積み、Redo履歴を破棄する。
        this.undoStack.push(this.createSnapshot());
        if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
        this.redoStack = [];
        this.notify();
    }

    createSnapshot() {
        // 資源・モード・ギア設定をJSON化して履歴に保存する。
        return JSON.stringify({
            steamPower: this.steamPower,
            power: this.power,
            water: this.water,
            fog: this.fog,
            brass: this.brass,
            mainGearRunning: this.mainGearRunning,
            userStoppedMainGear: this.userStoppedMainGear,
            autoStoppedBySteam: this.autoStoppedBySteam,
            creativeMode: this.creativeMode,
            creativeSnapshot: this.creativeSnapshot,
            materialInventoryVersion: MATERIAL_INVENTORY_VERSION,
            materialInventory: this.materialInventory,
            craftingJobs: this.craftingJobs,
            craftingParallelSlots: this.craftingParallelSlots,
            waterGenerationRate: this.waterGenerationRate,
            waterConsumptionRate: this.waterConsumptionRate,
            fogRecoveryRate: this.fogRecoveryRate,
            fogConsumptionRate: this.fogConsumptionRate,
            steamGenerationRate: this.steamGenerationRate,
            steamConsumptionRate: this.steamConsumptionRate,
            belts: this.belts,
            gears: this.placedGears.map(gear => ({
                id: gear.id,
                q: gear.q,
                r: gear.r,
                size: gear.sizeKey,
                layer: gear.layer,
                isCore: gear.isCore,
                angle: gear.angle, isLocked: gear.isLocked, designType: gear.designType, processMode: gear.processMode, terrainTargetType: gear.terrainTargetType,
                controlAction: gear.controlAction, controlCondition: gear.controlCondition, controlRotationCount: gear.controlRotationCount,
                controlItemType: gear.controlItemType, controlItemCount: gear.controlItemCount, controlTargetGearIds: gear.controlTargetGearIds
            }))
        });
    }

    restoreSnapshot(snapshot) {
        // JSONスナップショットからギア実体を再生成し、ネットワークを再構築する。
        const data = JSON.parse(snapshot);
        this.steamPower = Number.isFinite(data.steamPower) ? data.steamPower : 100;
        this.power = Number.isFinite(data.power) ? data.power : 0;
        this.water = data.water ?? 200;
        this.fog = data.fog ?? 0;
        this.brass = data.brass;
        this.materialInventoryVersion = MATERIAL_INVENTORY_VERSION;
        this.materialInventory = restoreMaterialInventory(data.materialInventory, data.materialInventoryVersion);
        this.craftingParallelSlots = Math.max(1, Math.floor(Number(data.craftingParallelSlots) || 1));
        const editorRuntime = this.isEditorRuntimeContext();
        const savedManualStop = data.userStoppedMainGear === true;
        const savedMainGearRunning = data.mainGearRunning ?? true;
        this.userStoppedMainGear = savedManualStop;
        this.mainGearRunning = savedManualStop ? false : savedMainGearRunning;
        this.autoStoppedBySteam = editorRuntime
            ? (savedManualStop ? false : (data.autoStoppedBySteam === true || (savedMainGearRunning === false && this.steamPower > 0)))
            : (savedManualStop ? false : (data.autoStoppedBySteam === true || (savedMainGearRunning === false && this.steamPower > 0)));
        this.lastExternalSaveAt = Number(data.updatedAt) || 0;
        this.creativeMode = data.creativeMode ?? false;
        this.creativeSnapshot = data.creativeSnapshot ?? null;
        this.craftingJobs = Array.isArray(data.craftingJobs) ? data.craftingJobs.filter(job =>
            job && typeof job.recipeKey === 'string' && typeof job.outputItem === 'string'
            && Number.isFinite(Number(job.outputAmount)) && Number.isFinite(Number(job.completesAt))) : [];
        this.normalizeCraftingQueue();
        const gears = data.gears || data.placedGears || [];
        this.placedGears = this.createGear
            ? gears.map(gear => this.createGear(gear))
            : gears.map(gear => ({ ...gear, sizeKey: gear.sizeKey || gear.size }));
        const gearIds = new Set(this.placedGears.map(gear => gear.id));
        this.belts = Array.isArray(data.belts)
            ? data.belts
                .map(belt => ({ id: belt.id, gearIds: [...new Set(belt.gearIds || [])].filter(id => gearIds.has(id)) }))
                .filter(belt => belt.gearIds.length >= 2)
            : [];
        this.placedGears.forEach((gear, index) => {
            const savedGear = gears[index];
            gear.isLocked = savedGear.isLocked ?? gear.isCore;
            gear.designType = savedGear.designType || gear.designType;
            gear.processMode = savedGear.processMode || gear.processMode;
            gear.powered = false;
            gear.rotationDir = 0;
            gear.angularVelocity = 0;
            gear.isDeadlocked = false;
            gear.angleError = false;
        });
        this.rotationProgress = new Map();
        this.controlStates.clear();
        this.updatePowerGrid();
        if (this.network) this.network.rebuild(this.placedGears, this.belts).updateRotation();
        this.lastTickAt = performance.now();
        this.notify();
    }

    undo() {
        // 直前の操作を戻し、現在状態をRedo履歴へ移す。
        if (this.undoStack.length === 0) return;
        
        this.redoStack.push(this.createSnapshot());
        this.restoreSnapshot(this.undoStack.pop());
        this.saveGameData();
        this.selectedGearId = null;
        this.selectedItem = 'NONE';
        this.selectedSize = null;
        this.beltSelection = [];
        this.ghostGear = null;
        this.notify();
    }

    redo() {
        // Undoで戻した操作を再適用する。
        if (this.redoStack.length === 0) return;
        
        this.undoStack.push(this.createSnapshot());
        this.restoreSnapshot(this.redoStack.pop());
        this.saveGameData();
        this.selectedGearId = null;
        this.selectedItem = 'NONE';
        this.selectedSize = null;
        this.beltSelection = [];
        this.ghostGear = null;
        this.notify();
    }

    reset() {
        // 保存データと盤面を初期状態へ戻す。
        localStorage.removeItem('fog_thermo_save');
        this.placedGears = [this.createGear
            ? this.createGear({ q: 0, r: 0, size: 'LL', layer: 0, isCore: true })
            : { q: 0, r: 0, sizeKey: 'LL', layer: 0, isCore: true, angle: 0 }];
        this.steamPower = 100;
        this.power = 0;
        this.water = 200;
        this.fog = 0;
        this.brass = 300;
        this.materialInventoryVersion = MATERIAL_INVENTORY_VERSION;
        this.materialInventory = { ...INITIAL_MATERIAL_INVENTORY };
        this.craftingJobs = [];
        this.mainGearRunning = true;
        this.userStoppedMainGear = false;
        this.autoStoppedBySteam = false;
        this.undoStack = [];
        this.redoStack = [];
        this.belts = [];
        this.beltSelection = [];
        this.updatePowerGrid();
        this.saveGameData();
        this.notify();
    }

    saveGameData() {
        // 次回起動で復元する資源・ギア・履歴をlocalStorageへ保存する。
        const data = {
            updatedAt: Date.now(),
            steamPower: this.steamPower,
            power: this.power,
            water: this.water,
            fog: this.fog,
            brass: this.brass,
            mainGearRunning: this.mainGearRunning,
            userStoppedMainGear: this.userStoppedMainGear,
            autoStoppedBySteam: this.autoStoppedBySteam,
            creativeMode: this.creativeMode,
            creativeSnapshot: this.creativeSnapshot,
            materialInventoryVersion: MATERIAL_INVENTORY_VERSION,
            materialInventory: this.materialInventory,
            craftingJobs: this.craftingJobs,
            craftingParallelSlots: this.craftingParallelSlots,
            waterGenerationRate: this.waterGenerationRate,
            waterConsumptionRate: this.waterConsumptionRate,
            fogRecoveryRate: this.fogRecoveryRate,
            fogConsumptionRate: this.fogConsumptionRate,
            steamGenerationRate: this.steamGenerationRate,
            steamConsumptionRate: this.steamConsumptionRate,
            belts: this.getRuntimeBelts(),
            gears: this.getRuntimeGears().map(gear => ({
                id: gear.id,
                q: gear.q, r: gear.r, size: gear.sizeKey, layer: gear.layer,
                isCore: Boolean(gear.isCore), angle: gear.angle, isLocked: gear.isLocked, designType: gear.designType, processMode: gear.processMode, terrainTargetType: gear.terrainTargetType,
                controlAction: gear.controlAction, controlCondition: gear.controlCondition, controlRotationCount: gear.controlRotationCount,
                controlItemType: gear.controlItemType, controlItemCount: gear.controlItemCount, controlTargetGearIds: gear.controlTargetGearIds
            })),
            undoStack: this.undoStack,
            redoStack: this.redoStack
        };
        localStorage.setItem('fog_thermo_save', JSON.stringify(data));
        this.saveScrollDraft();
    }

    getScrollBlueprint() {
        return {
            gears: this.placedGears.map(gear => ({
                id: gear.id,
                q: gear.q,
                r: gear.r,
                size: gear.sizeKey,
                layer: gear.layer,
                isCore: Boolean(gear.isCore),
                angle: gear.angle,
                isLocked: gear.isLocked,
                designType: gear.designType,
                processMode: gear.processMode,
                terrainTargetType: gear.terrainTargetType,
                controlAction: gear.controlAction,
                controlCondition: gear.controlCondition,
                controlRotationCount: gear.controlRotationCount,
                controlItemType: gear.controlItemType,
                controlItemCount: gear.controlItemCount,
                controlTargetGearIds: gear.controlTargetGearIds
            })),
            belts: this.belts
        };
    }

    getScrollDraftKey(material) {
        return `fogsgear_scroll_draft_${material === 'cloth' ? 'cloth' : 'paper'}`;
    }

    saveScrollDraft() {
        if (!this.currentScrollMaterial || this.currentScrollId) return;
        localStorage.setItem(this.getScrollDraftKey(this.currentScrollMaterial), JSON.stringify(this.getScrollBlueprint()));
    }

    loadScrollEditorSession(createGear) {
        const params = new URLSearchParams(window.location.search);
        const editId = params.get('editScroll');
        const requestedMaterial = params.get('newScroll') === 'cloth' ? 'cloth' : 'paper';
        const library = this.getNamedScrollLibrary();
        const savedScroll = editId ? library.find(scroll => scroll.id === editId) : null;
        this.currentScrollId = savedScroll?.id || null;
        this.currentScrollMaterial = savedScroll?.material === 'cloth' || savedScroll?.scrollType === 'cloth'
            ? 'cloth'
            : savedScroll ? 'paper' : params.has('newScroll') ? requestedMaterial : null;
        this.isScrollEditing = Boolean(this.currentScrollMaterial);
        if (!this.isScrollEditing) return;
        this.runtimeGears = this.placedGears;
        this.runtimeBelts = this.belts;
        const blueprint = savedScroll?.blueprint || (this.currentScrollMaterial && !this.currentScrollId
            ? (() => {
                try { return JSON.parse(localStorage.getItem(this.getScrollDraftKey(this.currentScrollMaterial)) || 'null'); }
                catch (error) { return null; }
            })()
            : null);
        if (!blueprint) {
            if (params.has('newScroll')) {
                this.placedGears = [createGear({ q: 0, r: 0, size: 'LL', layer: 0, isCore: true })];
                this.belts = [];
                this.runtimeGears = this.placedGears;
                this.runtimeBelts = this.belts;
                this.updatePowerGrid();
                this.notify();
            }
            return;
        }
        const gears = Array.isArray(blueprint.gears) ? blueprint.gears : [];
        this.placedGears = gears.map(gear => createGear(gear));
        this.belts = Array.isArray(blueprint.belts) ? blueprint.belts : [];
        this.runtimeGears = this.placedGears;
        this.runtimeBelts = this.belts;
        this.updatePowerGrid();
        if (this.network) this.network.rebuild(this.placedGears, this.belts).updateRotation();
        this.notify();
    }

    getNamedScrollLibrary() {
        try {
            const saved = JSON.parse(localStorage.getItem('fogsgear_scroll_library') || '[]');
            return Array.isArray(saved) ? saved : [];
        } catch (error) {
            return [];
        }
    }

    saveNamedScroll(name, blueprint = null, effect = null) {
        const trimmedName = String(name || '').trim();
        if (!trimmedName) return null;
        const library = this.getNamedScrollLibrary();
        const now = Date.now();
        const finalBlueprint = blueprint || this.getScrollBlueprint();
        const effectType = effect?.type || 'custom';
        const effectConfig = effect?.config || {};
        const effectLabels = {
            custom: '未設定',
            steam_boost: '蒸気増幅',
            fog_stabilize: '霧安定化',
            gear_sync: 'ギア同期'
        };
        const entry = {
            id: `scroll-${now}-${Math.random().toString(16).slice(2, 8)}`,
            name: trimmedName,
            createdAt: now,
            effect: {
                type: effectType,
                label: effect?.label || effectLabels[effectType] || '未設定',
                config: effectConfig
            },
            blueprint: finalBlueprint,
            material: this.currentScrollMaterial || 'paper',
            metadata: {
                source: 'gear-editor',
                version: 1
            }
        };
        const index = this.currentScrollId
            ? library.findIndex(scroll => scroll.id === this.currentScrollId)
            : library.findIndex(scroll => String(scroll.name).toLowerCase() === trimmedName.toLowerCase());
        if (index >= 0) {
            library[index] = { ...library[index], ...entry, id: library[index].id || entry.id };
        } else {
            library.unshift(entry);
        }
        localStorage.setItem('fogsgear_scroll_library', JSON.stringify(library));
        this.currentScrollId = library[index >= 0 ? index : 0]?.id || entry.id;
        localStorage.removeItem(this.getScrollDraftKey(this.currentScrollMaterial));
        return entry;
    }

    loadGameData(createGear) {
        // 保存データを読み込み、渡された生成関数で各ギアを独立した実体として復元する。
        this.createGear = createGear;
        let initialInventoryMigrated = false;
        let craftingQueueNormalized = false;
        const saved = localStorage.getItem('fog_thermo_save');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                const inventoryVersion = Number(data.materialInventoryVersion) || 1;
                initialInventoryMigrated = inventoryVersion < MATERIAL_INVENTORY_VERSION;
                this.steamPower = Number.isFinite(data.steamPower) ? data.steamPower : 100;
                this.power = Number.isFinite(data.power) ? data.power : 0;
                this.water = data.water ?? 200;
                this.fog = data.fog ?? data.gasMetal ?? 0;
                this.brass = data.brass ?? 300;
                this.materialInventoryVersion = MATERIAL_INVENTORY_VERSION;
                this.materialInventory = restoreMaterialInventory(data.materialInventory, inventoryVersion);
                const editorRuntime = this.isEditorRuntimeContext();
                const savedManualStop = data.userStoppedMainGear === true;
                const savedMainGearRunning = data.mainGearRunning ?? true;
                this.userStoppedMainGear = savedManualStop;
                this.mainGearRunning = savedManualStop ? false : savedMainGearRunning;
                this.autoStoppedBySteam = editorRuntime
                    ? (savedManualStop ? false : (data.autoStoppedBySteam === true || (savedMainGearRunning === false && this.steamPower > 0)))
                    : (savedManualStop ? false : (data.autoStoppedBySteam === true || (savedMainGearRunning === false && this.steamPower > 0)));
                this.lastExternalSaveAt = Number(data.updatedAt) || 0;
                this.creativeMode = data.creativeMode ?? false;
                this.creativeSnapshot = data.creativeSnapshot ?? null;
                this.craftingParallelSlots = Math.max(1, Math.floor(Number(data.craftingParallelSlots) || 1));
                this.craftingJobs = Array.isArray(data.craftingJobs) ? data.craftingJobs.filter(job =>
                    job && typeof job.recipeKey === 'string' && typeof job.outputItem === 'string'
                    && Number.isFinite(Number(job.outputAmount)) && Number.isFinite(Number(job.completesAt))) : [];
                craftingQueueNormalized = this.normalizeCraftingQueue();
                this.belts = Array.isArray(data.belts) ? data.belts.filter(belt => Array.isArray(belt?.gearIds) && belt.gearIds.length >= 2) : [];
                this.placedGears = (data.gears || data.placedGears || []).map(createGear);
                if (this.placedGears.length > 0 && !this.placedGears.some(gear => gear.isCore)) {
                    this.placedGears = [this.createGear({ q: 0, r: 0, size: 'LL', layer: 0, isCore: true })];
                    this.undoStack = [];
                    this.redoStack = [];
                    this.saveGameData();
                    return;
                }
                this.undoStack = data.undoStack || [];
                this.redoStack = data.redoStack || [];
                if (this.placedGears.length > 0) {
                    if (initialInventoryMigrated || craftingQueueNormalized) this.saveGameData();
                    return;
                }
            } catch (error) {
                console.error('セーブデータの読み込みに失敗しました', error);
            }
        }
        this.placedGears = [this.createGear
            ? this.createGear({ q: 0, r: 0, size: 'LL', layer: 0, isCore: true })
            : { q: 0, r: 0, sizeKey: 'LL', layer: 0, isCore: true, angle: 0 }];
        const runtimeGears = this.getRuntimeGears();
        const runtimeBelts = this.getRuntimeBelts();
        const runtimeNetwork = this.runtimeNetwork || this.network;
        if (runtimeNetwork) runtimeNetwork.rebuild(runtimeGears, runtimeBelts).updateRotation();
        if (initialInventoryMigrated) this.saveGameData();
    }

    getGearProcessInfo(gear) {
        // ギア単体の処理名、入力、出力、毎秒レートをUI用の共通形式で返す。
        // 処理ごとの表示情報をここに集約し、吹き出し側が個別の計算式を持たないようにする。
        const rotationRate = gear ? gear.teeth * Math.abs(gear.angularVelocity || 0) * 0.012 * 60 / (Math.PI * 2) : 0;
        const terrainTargetType = gear?.terrainTargetType || 'IRON_VEIN';
        const terrainRecipe = TERRAIN_TRANSFORM_RECIPES[terrainTargetType] || {};
        const terrainInput = Object.entries(terrainRecipe)
            .map(([item, count]) => `${CELL_MATERIALS[item]?.label || item} ×${count}`)
            .join(' + ') || '-';
        const controlActions = {
            STOP_MAIN_GEAR: 'メインギアを停止',
            START_MAIN_GEAR: 'メインギアを起動',
            SYNC_AXIS: '同軸同期',
            UNSYNC_AXIS: '同軸同期解除',
            TOGGLE_SYNC_AXIS: '同軸同期状態の切り替え'
        };
        const controlItemLabels = {
            fog: '霧',
            power: '動力',
            brass: '真鍮資材',
            steam_power: 'スチーム'
        };
        const controlCondition = gear?.controlCondition === 'ITEM_COUNT' || gear?.controlCondition === 'ITEM_COUNT_BELOW'
            ? `${CELL_MATERIALS[gear.controlItemType]?.label || controlItemLabels[gear.controlItemType] || gear.controlItemType} ${gear.controlItemCount}個${gear.controlCondition === 'ITEM_COUNT_BELOW' ? '未満' : '以上'}`
            : `${Math.max(1, Number(gear?.controlRotationCount) || 1)}回転ごと`;
        const processInfo = {
            NONE: { name: '処理なし', input: '-', output: '-', rate: 0 },
            POWER_STORAGE: { name: '動力を蓄積', input: '-', output: '動力', rate: rotationRate },
            FOG_COLLECTION: { name: '霧の回収', input: '-', output: '霧', rate: rotationRate * 10 },
            RESOURCE_COLLECTION: { name: '資材収集', input: '対象セル', output: 'セル資材', rate: rotationRate },
            TRANSFORM: { name: '水→スチーム', input: '水', output: 'スチーム', rate: rotationRate * 10 },
            FOG_TO_WATER: { name: '霧→水', input: '霧', output: '水', rate: rotationRate * 2.5 },
            TERRAIN_TRANSFORM: { name: '地形変成', input: terrainInput, output: WORLD_CELL_TYPES[terrainTargetType]?.label || '地形セル', rate: rotationRate },
            ERA_SHIFT: { name: '時代変質', input: '対象セル', output: 'ランダムな時代セル', rate: rotationRate },
            TARGET_SHIFT_UP: { name: '対象セルを上へシフト', input: '-', output: '対象座標', rate: rotationRate },
            TARGET_SHIFT_DOWN: { name: '対象セルを下へシフト', input: '-', output: '対象座標', rate: rotationRate },
            TARGET_SHIFT_LEFT: { name: '対象セルを左へシフト', input: '-', output: '対象座標', rate: rotationRate },
            TARGET_SHIFT_RIGHT: { name: '対象セルを右へシフト', input: '-', output: '対象座標', rate: rotationRate },
            CONDITIONAL_CONTROL: { name: '条件制御', input: controlCondition, output: controlActions[gear?.controlAction] || controlActions.STOP_MAIN_GEAR, rate: rotationRate }
        };
        const info = processInfo[gear?.processMode] || processInfo.NONE;
        const inputMultiplier = gear?.processMode === 'FOG_TO_WATER' ? 2 : 1;
        return { ...info, inputRate: info.rate * inputMultiplier, outputRate: info.rate };
    }

    processScrollCellGear(gear, scrollRuntime, rotationDelta) {
        const cellModes = new Set(['RESOURCE_COLLECTION', 'TERRAIN_TRANSFORM', 'ERA_SHIFT', 'TARGET_SHIFT_UP', 'TARGET_SHIFT_DOWN', 'TARGET_SHIFT_LEFT', 'TARGET_SHIFT_RIGHT']);
        if (!scrollRuntime || !cellModes.has(gear.processMode) || !this.worldCellHandler) return;
        const progressKey = `cell:${scrollRuntime.scrollId}:${gear.id}:${gear.processMode}`;
        const progress = (this.rotationProgress.get(progressKey) || 0) + Math.abs(rotationDelta);
        const completedRotations = Math.floor(progress / (Math.PI * 2));
        this.rotationProgress.set(progressKey, progress % (Math.PI * 2));
        const operationsPerRotation = gear.processMode === 'RESOURCE_COLLECTION'
            ? Math.max(1, Math.floor(Number(gear.teeth) || 1))
            : 1;
        for (let rotation = 0; rotation < completedRotations; rotation++) {
            for (let operation = 0; operation < operationsPerRotation; operation++) {
                const detail = {
                    scrollId: scrollRuntime.scrollId,
                    target: { ...scrollRuntime.target },
                    mode: gear.processMode,
                    terrainTargetType: gear.terrainTargetType,
                    materials: this.materialInventory,
                    power: this.power
                };
                const result = this.worldCellHandler(detail);
                if (!result?.success) continue;
                Object.entries(result.consumedItems || {}).forEach(([item, amount]) => {
                    this.materialInventory[item] = Math.max(0, (Number(this.materialInventory[item]) || 0) - amount);
                });
                const consumedPower = Math.max(0, Number(result.consumedPower) || 0);
                this.power = Math.max(0, this.power - consumedPower);
                this.powerConsumedThisTick += consumedPower;
                Object.entries(result.producedItems || {}).forEach(([item, amount]) => {
                    this.materialInventory[item] = (Number(this.materialInventory[item]) || 0) + amount;
                });
                if (result.target) {
                    Object.assign(scrollRuntime.target, result.target);
                    let targets = {};
                    try { targets = JSON.parse(localStorage.getItem(ACTIVE_SCROLL_TARGETS_KEY) || '{}'); } catch (error) {}
                    targets[scrollRuntime.scrollId] = { ...scrollRuntime.target };
                    localStorage.setItem(ACTIVE_SCROLL_TARGETS_KEY, JSON.stringify(targets));
                    window.dispatchEvent(new CustomEvent('fogsgear:scroll-targets-changed', { detail: targets }));
                }
            }
        }
    }

    executeControlAction(gear, group) {
        if (gear.controlAction === 'STOP_MAIN_GEAR') {
            if (!this.mainGearRunning && this.userStoppedMainGear && !this.autoStoppedBySteam) return false;
            this.setMainGearRunning(false);
            return true;
        }
        if (gear.controlAction === 'START_MAIN_GEAR') {
            if (this.mainGearRunning && !this.userStoppedMainGear && !this.autoStoppedBySteam) return false;
            this.setMainGearRunning(true);
            return true;
        }
        const targets = new Set(Array.isArray(gear.controlTargetGearIds) ? gear.controlTargetGearIds : []);
        if (!targets.size || !group?.gears) return false;
        let networkChanged = false;
        if (!['SYNC_AXIS', 'UNSYNC_AXIS', 'TOGGLE_SYNC_AXIS'].includes(gear.controlAction)) return false;
        const selectedTargets = group.gears.filter(target => targets.has(target.id) && !target.isCore
            && target.q === gear.q && target.r === gear.r);
        const processedAxes = new Set();
        for (const target of selectedTargets) {
            const axisKey = `${target.q},${target.r}`;
            if (processedAxes.has(axisKey)) continue;
            processedAxes.add(axisKey);
            const axisGears = group.gears.filter(other => other.q === target.q && other.r === target.r);
            const nonCoreGears = axisGears.filter(other => !other.isCore);
            const locked = gear.controlAction === 'SYNC_AXIS'
                || (gear.controlAction === 'TOGGLE_SYNC_AXIS' && !nonCoreGears.every(other => other.isLocked));
            axisGears.forEach(other => {
                const nextLock = locked || other.isCore;
                if (other.isLocked === nextLock) return;
                other.isLocked = nextLock;
                networkChanged = true;
            });
        }
        return networkChanged;
    }

    processControlGear(gear, group, rotationDelta) {
        if (gear.processMode !== 'CONDITIONAL_CONTROL' || !group) return false;
        const signature = JSON.stringify([
            gear.controlAction,
            gear.controlCondition,
            gear.controlRotationCount,
            gear.controlItemType,
            gear.controlItemCount,
            gear.controlTargetGearIds
        ]);
        let controlState = this.controlStates.get(gear.id);
        if (!controlState || controlState.signature !== signature) {
            controlState = { signature, rotationProgress: 0, itemTriggered: false };
            this.controlStates.set(gear.id, controlState);
        }
        if (gear.controlCondition === 'ITEM_COUNT' || gear.controlCondition === 'ITEM_COUNT_BELOW') {
            const resourceProperties = {
                water: 'water',
                fog: 'fog',
                power: 'power',
                brass: 'brass',
                steam_power: 'steamPower'
            };
            const property = resourceProperties[gear.controlItemType];
            const count = Number(property ? this[property] : this.materialInventory[gear.controlItemType]) || 0;
            const conditionMet = gear.controlCondition === 'ITEM_COUNT_BELOW'
                ? count < gear.controlItemCount
                : count >= gear.controlItemCount;
            if (!conditionMet) {
                controlState.itemTriggered = false;
                return false;
            }
            if (controlState.itemTriggered) return false;
            controlState.itemTriggered = true;
            return this.executeControlAction(gear, group);
        }
        const rotationsPerTrigger = Math.max(1, Math.floor(Number(gear.controlRotationCount) || 1));
        controlState.rotationProgress += Math.abs(rotationDelta);
        const triggerAngle = rotationsPerTrigger * Math.PI * 2;
        const triggerCount = Math.floor(controlState.rotationProgress / triggerAngle);
        controlState.rotationProgress %= triggerAngle;
        let networkChanged = false;
        for (let index = 0; index < triggerCount; index++) {
            networkChanged = this.executeControlAction(gear, group) || networkChanged;
        }
        return networkChanged;
    }

    completeCraftingJobs(now = Date.now()) {
        const completed = this.craftingJobs.filter(job => Number(job.completesAt) <= now);
        if (!completed.length) return;
        const completedIds = new Set(completed.map(job => job.jobId));
        this.craftingJobs = this.craftingJobs.filter(job => !completedIds.has(job.jobId));
        completed.forEach(job => {
            const amount = Math.max(1, Math.floor(Number(job.outputAmount) || 1));
            if (job.outputItem === 'brass-stock') this.brass += amount;
            else this.materialInventory[job.outputItem] = (Number(this.materialInventory[job.outputItem]) || 0) + amount;
        });
        this.saveGameData();
        this.notify();
    }

    cancelCraftingJob(jobId, refundItems = [], now = Date.now()) {
        const jobIndex = this.craftingJobs.findIndex(job => job.jobId === jobId);
        if (jobIndex < 0) return false;
        if (Number(this.craftingJobs[jobIndex].completesAt) <= now) {
            this.completeCraftingJobs(now);
            return false;
        }

        const [cancelledJob] = this.craftingJobs.splice(jobIndex, 1);
        refundItems.forEach(([itemId, rawAmount]) => {
            const amount = Math.max(0, Number(rawAmount) || 0);
            if (!amount) return;
            if (itemId === 'brass-stock') this.brass += amount;
            else if (itemId === 'water') this.water += amount;
            else if (itemId === 'fog') this.fog += amount;
            else if (itemId === 'power') this.power += amount;
            else if (itemId === 'steam_power') this.steamPower += amount;
            else this.materialInventory[itemId] = (Number(this.materialInventory[itemId]) || 0) + amount;
        });

        this.scheduleCraftingJobs([], now);
        this.saveGameData();
        this.notify();
        return cancelledJob;
    }

    scheduleCraftingJobs(newJobs = [], now = Date.now()) {
        const parallelSlots = Math.max(1, Math.floor(Number(this.craftingParallelSlots) || 1));
        const activeJobs = this.craftingJobs
            .filter(job => Number(job.startedAt) <= now && Number(job.completesAt) > now)
            .sort((first, second) => Number(first.startedAt) - Number(second.startedAt)
                || Number(first.completesAt) - Number(second.completesAt))
            .slice(0, parallelSlots);
        const activeSet = new Set(activeJobs);
        const slotAvailability = Array(parallelSlots).fill(now);
        activeJobs.forEach((job, index) => {
            slotAvailability[index] = Number(job.completesAt);
        });
        const pendingJobs = [
            ...this.craftingJobs.filter(job => !activeSet.has(job)),
            ...newJobs
        ];
        pendingJobs.forEach(job => {
            let slot = 0;
            for (let index = 1; index < slotAvailability.length; index++) {
                if (slotAvailability[index] < slotAvailability[slot]) slot = index;
            }
            const duration = Math.max(1, Number(job.completesAt) - Number(job.startedAt));
            job.startedAt = Math.max(now, slotAvailability[slot]);
            job.completesAt = job.startedAt + duration;
            slotAvailability[slot] = job.completesAt;
        });
        this.craftingJobs = [...activeJobs, ...pendingJobs]
            .sort((first, second) => Number(first.startedAt) - Number(second.startedAt)
                || Number(first.completesAt) - Number(second.completesAt));
        return newJobs;
    }

    setCraftingParallelSlots(slots) {
        const nextSlots = Math.max(1, Math.floor(Number(slots) || 1));
        if (nextSlots === this.craftingParallelSlots) return false;
        this.craftingParallelSlots = nextSlots;
        this.scheduleCraftingJobs();
        this.saveGameData();
        this.notify();
        return true;
    }

    normalizeCraftingQueue(now = Date.now()) {
        const before = this.craftingJobs.map(job => [job.jobId, job.startedAt, job.completesAt]);
        this.scheduleCraftingJobs([], now);
        return this.craftingJobs.some((job, index) =>
            job.jobId !== before[index]?.[0]
            || Number(job.startedAt) !== Number(before[index]?.[1])
            || Number(job.completesAt) !== Number(before[index]?.[2]));
    }

    tick() {
        // 1フレーム分の時間を基準に、回転・資源変換・UI表示値を更新する。
        const now = performance.now();
        const elapsed = Math.min(0.25, Math.max(0, (now - this.lastTickAt) / 1000));
        this.lastTickAt = now;
        this.lastTickElapsed = elapsed;
        this.completeCraftingJobs();
        this.syncExternalEngineControl();
        const runtimeGears = this.getRuntimeGears();
        const runtimeBelts = this.getRuntimeBelts();
        const runtimeNetwork = this.runtimeNetwork || this.network;
        const activeScrollRuntimes = this.getActiveScrollRuntimes(now);
        const runtimeGroups = [
            ...(this.isEditorRuntimeContext() ? [{ gears: runtimeGears, belts: runtimeBelts, network: runtimeNetwork }] : []),
            ...activeScrollRuntimes
        ];
        runtimeGroups.forEach(group => {
            if (group.network && this.mainGearRunning && (this.creativeMode || this.steamPower > 0)) {
                group.network.updateRotation({ rebuildConnections: false });
            } else {
                group.gears.forEach(gear => {
                    gear.powered = false;
                    gear.rotationDir = 0;
                    gear.angularVelocity = 0;
                });
            }
        });
        // 連結していても、処理設定は各ギア自身の値だけを参照する。
        const activeGearGroups = runtimeGroups
            .map(group => ({ network: group.network, gears: group.gears.filter(gear => gear.powered && !gear.isDeadlocked) }))
            .filter(group => group.network && group.gears.length > 0);
        const activeGears = activeGearGroups.flatMap(group => group.gears);
        const runtimeGroupByGearId = new Map();
        runtimeGroups.forEach(group => group.gears.forEach(gear => runtimeGroupByGearId.set(gear.id, group)));
        const scrollRuntimeByGearId = new Map();
        runtimeGroups.forEach(group => {
            if (group.scrollId) group.gears.forEach(gear => scrollRuntimeByGearId.set(gear.id, group));
        });
        const activeCount = activeGears.length;
        const hasActiveProcess = activeGears.some(gear => !gear.isCore && gear.processMode !== 'NONE' && gear.processMode !== 'CONDITIONAL_CONTROL');
        const ambientWaterRecovery = !this.creativeMode && (!this.mainGearRunning || this.autoStoppedBySteam || this.steamPower <= 0);
        this.waterRecoveryRate = (hasActiveProcess || ambientWaterRecovery) && elapsed > 0 ? 1 : 0;
        this.water += elapsed * this.waterRecoveryRate;
        this.productionRate = 0;
        const gearRate = gear => gear.teeth * Math.abs(gear.angularVelocity || 0) * 0.012 * 60 / (Math.PI * 2);
        this.powerGenerationRate = activeGears
            .filter(gear => !gear.isCore && gear.designType === 'INDUSTRIAL' && gear.processMode === 'POWER_STORAGE')
            .reduce((sum, gear) => sum + gear.teeth * Math.abs(gear.angularVelocity || 0) * 0.012 * 60 / (Math.PI * 2), 0);
        this.power += this.powerGenerationRate * elapsed;
        this.powerConsumedThisTick = 0;
        this.fogRecoveryRate = activeGears.filter(gear => gear.processMode === 'FOG_COLLECTION').reduce((sum, gear) => sum + gearRate(gear) * 10, 0);
        this.fogToWaterRate = activeGears.filter(gear => gear.designType === 'ALCHEMICAL' && gear.processMode === 'FOG_TO_WATER').reduce((sum, gear) => sum + gearRate(gear) * 2.5, 0);
        this.steamTransformRate = activeGears.filter(gear => gear.designType === 'ALCHEMICAL' && gear.processMode === 'TRANSFORM').reduce((sum, gear) => sum + gearRate(gear), 0);
        const steamConsumption = this.mainGearRunning && !this.creativeMode && activeCount > 0
            ? activeGearGroups.reduce((sum, group) => sum + group.network.calculateSteamConsumption(group.gears), 0)
            : 0;
        const steamAutoRecoveryRate = !this.creativeMode && (!this.mainGearRunning || this.autoStoppedBySteam || this.steamPower <= 0) ? 1 : 0;
        // ダッシュボードの3列目・4列目用のレートを、変換の入力と出力に分けて集計する。
        this.waterGenerationRate = this.waterRecoveryRate + this.fogToWaterRate;
        this.waterConsumptionRate = this.steamTransformRate;
        // 水1に対してスチーム10を生成するため、水→スチームの出力は水消費量から直接算出する。
        this.generatedSteamRate = this.waterConsumptionRate * 10;
        // 霧→水は水5に霧10を要する。
        this.fogConsumptionRate = this.fogToWaterRate * 2;
        this.steamGenerationRate = this.generatedSteamRate + (this.creativeMode && elapsed > 0 ? 1 : this.waterRecoveryRate) + steamAutoRecoveryRate;
        this.steamConsumptionRate = steamConsumption;
        if (this.creativeMode) {
            // クリエイティブ中も自然回復は実値へ反映し、上限だけを設けない。
            this.steamPower += elapsed;
        } else {
            const autoRecovery = steamAutoRecoveryRate;
            const recoveryRate = this.mainGearRunning ? this.waterRecoveryRate : 0;
            this.steamPower = Math.max(0, this.steamPower + (recoveryRate + autoRecovery) * elapsed - steamConsumption * elapsed);
        }
        if (!this.creativeMode && this.steamPower <= 0) {
            this.autoStoppedBySteam = true;
            this.userStoppedMainGear = true;
            this.mainGearRunning = false;
            this.fogRecoveryRate = 0;
            this.fogToWaterRate = 0;
            this.steamTransformRate = 0;
            this.waterConsumptionRate = 0;
            this.fogConsumptionRate = 0;
            this.steamConsumptionRate = 0;
        } else if (!this.creativeMode && this.steamPower > 0.25) {
            this.autoStoppedBySteam = false;
            // 蒸気切れで停止した場合は、手動停止と同じく自動再起動しない。
            if (!this.mainGearRunning && !this.userStoppedMainGear && this.steamPower > 0.25) {
                this.mainGearRunning = true;
            }
        }
        if (this.userStoppedMainGear) {
            this.mainGearRunning = false;
            this.autoStoppedBySteam = false;
        }
        if (!this.mainGearRunning) {
            runtimeGroups.forEach(group => group.gears.forEach(gear => {
                gear.powered = false;
                gear.rotationDir = 0;
                gear.angularVelocity = 0;
            }));
        }
        // 回転中の各ギアを個別に処理する。同じ軸でも資源処理は共有しない。
        const rotationDeltas = new Map();
        activeGears.forEach(gear => {
            if (gear.powered && !gear.isDeadlocked && this.steamPower > 0 && this.mainGearRunning) {
                const rotationDelta = 0.012 * 60 * (gear.angularVelocity || 1) * elapsed * gear.rotationDir;
            rotationDeltas.set(gear.id, rotationDelta);
                gear.angle += rotationDelta;
                // 霧回収は1回転の完了を待たず、回転角に比例して連続的に加算する。
                if (gear.processMode === 'FOG_COLLECTION') {
                    this.fog += gear.teeth * 10 * Math.abs(rotationDelta) / (Math.PI * 2);
                }
                if (gear.designType === 'ALCHEMICAL' && gear.processMode === 'TRANSFORM') {
                    const transformed = Math.min(this.water, gear.teeth * Math.abs(rotationDelta) / (Math.PI * 2));
                    this.water -= transformed;
                    this.steamPower += transformed * 10;
                }
                if (gear.designType === 'ALCHEMICAL' && gear.processMode === 'FOG_TO_WATER') {
                    const progressKey = `${gear.id}:${gear.processMode}`;
                    const progress = (this.rotationProgress.get(progressKey) || 0) + Math.abs(rotationDelta);
                    const completedRotations = Math.floor(progress / (Math.PI * 2));
                    this.rotationProgress.set(progressKey, progress % (Math.PI * 2));
                    if (completedRotations > 0) {
                        const amount = completedRotations * gear.teeth;
                        const transformed = Math.min(this.fog, amount * 10);
                        this.fog -= transformed;
                        this.water += transformed * 2.5;
                    }
                }
                this.processScrollCellGear(gear, scrollRuntimeByGearId.get(gear.id), rotationDelta);
            }
        });
        this.powerConsumptionRate = elapsed > 0 ? this.powerConsumedThisTick / elapsed : 0;
        let controlNetworkChanged = false;
        activeGears.forEach(gear => {
            const group = runtimeGroupByGearId.get(gear.id);
            if (!group || gear.controlCondition === 'ITEM_COUNT' || gear.controlCondition === 'ITEM_COUNT_BELOW') return;
            controlNetworkChanged = this.processControlGear(gear, group, rotationDeltas.get(gear.id) || 0) || controlNetworkChanged;
        });
        runtimeGroups.forEach(group => {
            group.gears.forEach(gear => {
                if (gear.processMode !== 'CONDITIONAL_CONTROL' || !['ITEM_COUNT', 'ITEM_COUNT_BELOW'].includes(gear.controlCondition)) return;
                controlNetworkChanged = this.processControlGear(gear, group, 0) || controlNetworkChanged;
            });
        });
        if (controlNetworkChanged) {
            runtimeGroups.forEach(group => {
                group.network?.rebuild(group.gears, group.belts).updateRotation();
                if (!this.mainGearRunning) group.gears.forEach(gear => {
                    gear.powered = false;
                    gear.rotationDir = 0;
                    gear.angularVelocity = 0;
                });
            });
            this.publishActiveScrollSyncState(runtimeGroups);
        }
        runtimeGroups.forEach(group => group.network?.synchronizeLockedAxes());
        const currentTime = performance.now();
        if (currentTime - (this.lastStorageSaveAt || 0) > 500) {
            this.lastStorageSaveAt = currentTime;
            this.saveGameData();
        }
        if (currentTime - (this.lastUiNotifyAt || 0) > 100) { this.lastUiNotifyAt = currentTime; this.notify(); }
    }

    updatePowerGrid() {
        if (this.network) {
            this.network.rebuild(this.placedGears, this.belts).updateRotation();
            if (this.runtimeNetwork && this.runtimeNetwork !== this.network) {
                this.runtimeNetwork.rebuild(this.getRuntimeGears(), this.getRuntimeBelts()).updateRotation();
            }
            if (!this.mainGearRunning || (!this.creativeMode && this.steamPower <= 0)) this.placedGears.forEach(gear => { gear.powered = false; gear.rotationDir = 0; gear.angularVelocity = 0; });
            return;
        }
        this.placedGears.forEach(gear => {
            gear.powered = false;
            gear.rotationDir = 0;
            gear.isDeadlocked = false;
        });
        const core = this.placedGears.find(gear => gear.isCore);
        if (!core) return;
        core.powered = true;
        core.rotationDir = 1;
        const queue = [core];
        const visited = new Map([[`${core.q},${core.r},${core.layer}`, 1]]);
        while (queue.length) {
            const current = queue.shift();
            const expectedDirection = -current.rotationDir;
            this.placedGears.forEach(other => {
                if (current === other) return;
                const distance = Math.hypot(current.x - other.x, current.y - other.y);
                const samePosition = current.q === other.q && current.r === other.r && Math.abs(current.layer - other.layer) === 1;
                const meshing = distance <= current.radius + other.radius + 1 && current.layer === other.layer;
                if (!samePosition && !meshing) return;
                const key = `${other.q},${other.r},${other.layer}`;
                const direction = samePosition ? current.rotationDir : expectedDirection;
                if (visited.has(key)) {
                    if (visited.get(key) !== direction) {
                        other.isDeadlocked = true;
                        current.isDeadlocked = true;
                    }
                    return;
                }
                other.powered = true;
                other.rotationDir = direction;
                visited.set(key, direction);
                queue.push(other);
            });
        }
        let changed = true;
        while (changed) {
            changed = false;
            this.placedGears.forEach(current => {
                if (current.isDeadlocked) return;
                this.placedGears.forEach(other => {
                    if (!other.isDeadlocked) return;
                    const distance = Math.hypot(current.x - other.x, current.y - other.y);
                    const samePosition = current.q === other.q && current.r === other.r && Math.abs(current.layer - other.layer) === 1;
                    const meshing = distance <= current.radius + other.radius + 1 && current.layer === other.layer;
                    if (samePosition || meshing) {
                        current.isDeadlocked = true;
                        changed = true;
                    }
                });
            });
        }
    }

    syncExternalEngineControl() {
        // ギア編集画面はマップ本体の外部停止状態に巻き込まれないようにする。
        if (this.isEditorRuntimeContext()) return;
        try {
            const saved = JSON.parse(localStorage.getItem('fog_thermo_save') || '{}');
            const updatedAt = Number(saved.updatedAt) || 0;
            if (updatedAt <= this.lastExternalSaveAt || saved.mainGearRunning === undefined) return;
            if (saved.userStoppedMainGear === true) {
                this.userStoppedMainGear = true;
                this.mainGearRunning = false;
                this.autoStoppedBySteam = false;
            } else {
                this.userStoppedMainGear = false;
                this.mainGearRunning = saved.mainGearRunning !== false;
                this.autoStoppedBySteam = saved.autoStoppedBySteam === true && this.mainGearRunning === false;
            }
            this.lastExternalSaveAt = updatedAt;
        } catch (error) {}
    }
}
