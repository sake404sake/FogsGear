/**
 * GameState - リソース、ギア、保存データ、Undo/Redo履歴の管理モジュール
 */
export class GameState {
    constructor() {
        this.steamPower = 100;
        this.water = 200;
        this.fog = 0;
        this.liquidMetal = 0;
        this.solidMetal = 0;
        this.brass = 300;
        this.creativeMode = false;
        this.productionRate = 0;
        this.powerOutput = 0;
        this.rotationProgress = new Map();
        this.waterRecoveryRate = 0;
        this.fogRecoveryRate = 0;
        this.fogToWaterRate = 0;
        this.liquidMetalRate = 0;
        this.solidMetalRate = 0;
        this.solidMetalToBrassRate = 0;
        this.steamTransformRate = 0;
        this.generatedSteamRate = 0;
        this.mainGearRunning = true;
        this.lastTickAt = performance.now();
        
        this.selectedSize = null;
        this.selectedLayer = 0;
        
        this.placedGears = [];
        this.ghostGear = null;
        this.showLoops = false;
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
        
        this.listeners = [];
    }

    subscribe(listener) {
        this.listeners.push(listener);
    }

    notify() {
        this.listeners.forEach(fn => fn(this));
    }

    getCurrentCosts() {
        return this.network
            ? { brass: this.network.calculateBrassCost(), steam: this.network.calculateSteamConsumption() }
            : { brass: this.placedGears.filter(gear => !gear.isCore).reduce((sum, gear) => sum + (gear.cost || 0), 0), steam: this.placedGears.filter(gear => !gear.isCore).reduce((sum, gear) => sum + (gear.teeth || 0), 0) };
    }

    setCreativeMode(active) {
        this.creativeMode = active;
        this.steamPower = 200;
        this.water = active ? 400 : 200;
        this.saveGameData();
        this.notify();
    }

    setSelectedSize(size) {
        this.selectedSize = size;
        this.notify();
    }

    setSelectedLayer(layer) {
        this.selectedLayer = parseInt(layer, 10);
        this.notify();
    }

    toggleMainGear() {
        this.mainGearRunning = !this.mainGearRunning;
        this.updatePowerGrid();
        this.saveGameData();
        this.notify();
    }

    saveState() {
        this.undoStack.push(this.createSnapshot());
        if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
        this.redoStack = [];
        this.notify();
    }

    createSnapshot() {
        return JSON.stringify({
            steamPower: this.steamPower,
            water: this.water,
            fog: this.fog,
            liquidMetal: this.liquidMetal,
            solidMetal: this.solidMetal,
            brass: this.brass,
            mainGearRunning: this.mainGearRunning,
            gears: this.placedGears.map(gear => ({
                q: gear.q,
                r: gear.r,
                size: gear.sizeKey,
                layer: gear.layer,
                isCore: gear.isCore,
                angle: gear.angle, isLocked: gear.isLocked, designType: gear.designType, processMode: gear.processMode
            }))
        });
    }

    restoreSnapshot(snapshot) {
        const data = JSON.parse(snapshot);
        this.steamPower = data.steamPower;
        this.water = data.water ?? 200;
        this.fog = data.fog ?? 0;
        this.liquidMetal = data.liquidMetal ?? 0;
        this.solidMetal = data.solidMetal ?? 0;
        this.brass = data.brass;
        this.mainGearRunning = data.mainGearRunning ?? true;
        const gears = data.gears || data.placedGears || [];
        this.placedGears = this.createGear
            ? gears.map(gear => this.createGear(gear))
            : gears.map(gear => ({ ...gear, sizeKey: gear.sizeKey || gear.size }));
        this.placedGears.forEach((gear, index) => {
            const savedGear = gears[index];
            gear.isLocked = savedGear.isLocked ?? gear.isCore;
            gear.designType = savedGear.designType || gear.designType;
            gear.processMode = savedGear.processMode || gear.processMode;
        });
        this.rotationProgress = new Map();
        this.updatePowerGrid();
        this.notify();
    }

    undo() {
        if (this.undoStack.length === 0) return;
        
        this.redoStack.push(this.createSnapshot());
        this.restoreSnapshot(this.undoStack.pop());
        this.saveGameData();
    }

    redo() {
        if (this.redoStack.length === 0) return;
        
        this.undoStack.push(this.createSnapshot());
        this.restoreSnapshot(this.redoStack.pop());
        this.saveGameData();
    }

    reset() {
        localStorage.removeItem('fog_thermo_save');
        this.placedGears = [this.createGear
            ? this.createGear({ q: 0, r: 0, size: 'LL', layer: 0, isCore: true })
            : { q: 0, r: 0, sizeKey: 'LL', layer: 0, isCore: true, angle: 0 }];
        this.steamPower = 100;
        this.water = 200;
        this.fog = 0;
        this.liquidMetal = 0;
        this.solidMetal = 0;
        this.brass = 300;
        this.mainGearRunning = true;
        this.undoStack = [];
        this.redoStack = [];
        this.updatePowerGrid();
        this.saveGameData();
        this.notify();
    }

    saveGameData() {
        const data = {
            steamPower: this.steamPower,
            water: this.water,
            fog: this.fog,
            liquidMetal: this.liquidMetal,
            solidMetal: this.solidMetal,
            brass: this.brass,
            mainGearRunning: this.mainGearRunning,
            gears: this.placedGears.map(gear => ({
                q: gear.q, r: gear.r, size: gear.sizeKey, layer: gear.layer,
                isCore: Boolean(gear.isCore), angle: gear.angle, isLocked: gear.isLocked, designType: gear.designType, processMode: gear.processMode
            })),
            undoStack: this.undoStack,
            redoStack: this.redoStack
        };
        localStorage.setItem('fog_thermo_save', JSON.stringify(data));
    }

    loadGameData(createGear) {
        this.createGear = createGear;
        const saved = localStorage.getItem('fog_thermo_save');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                this.steamPower = data.steamPower ?? 100;
                this.water = data.water ?? 200;
                this.fog = data.fog ?? data.gasMetal ?? 0;
                this.liquidMetal = data.liquidMetal ?? 0;
                this.solidMetal = data.solidMetal ?? 0;
                this.brass = data.brass ?? 300;
                this.mainGearRunning = data.mainGearRunning ?? true;
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
                if (this.placedGears.length > 0) return;
            } catch (error) {
                console.error('セーブデータの読み込みに失敗しました', error);
            }
        }
        this.placedGears = [this.createGear
            ? this.createGear({ q: 0, r: 0, size: 'LL', layer: 0, isCore: true })
            : { q: 0, r: 0, sizeKey: 'LL', layer: 0, isCore: true, angle: 0 }];
        this.saveGameData();
    }

    tick() {
        const now = performance.now();
        const elapsed = Math.min(0.25, Math.max(0, (now - this.lastTickAt) / 1000));
        this.lastTickAt = now;
        if (this.network) this.network.updateRotation();
        const activeCount = this.placedGears.filter(gear => gear.powered && !gear.isDeadlocked).length;
        const activeGears = this.placedGears.filter(gear => gear.powered && !gear.isDeadlocked);
        this.water += elapsed;
        this.powerOutput = activeGears.reduce((sum, gear) => sum + Math.abs(gear.angularVelocity || 0) * gear.size, 0);
        this.productionRate = 0;
        this.fogRecoveryRate = activeGears.filter(gear => gear.designType === 'PRODUCTION' && gear.processMode === 'FOG_COLLECTION').reduce((sum, gear) => sum + gear.teeth * Math.abs(gear.angularVelocity || 0) / (Math.PI * 2), 0);
        this.liquidMetalRate = activeGears.filter(gear => gear.designType === 'ALCHEMICAL' && gear.processMode === 'FOG_TO_LIQUID_METAL').reduce((sum, gear) => sum + gear.teeth * 0.1 * Math.abs(gear.angularVelocity || 0) / (Math.PI * 2), 0);
        this.fogToWaterRate = activeGears.filter(gear => gear.designType === 'ALCHEMICAL' && gear.processMode === 'FOG_TO_WATER').reduce((sum, gear) => sum + gear.teeth * 0.1 * Math.abs(gear.angularVelocity || 0) / (Math.PI * 2), 0);
        this.solidMetalRate = activeGears.filter(gear => gear.designType === 'ALCHEMICAL' && gear.processMode === 'LIQUID_TO_SOLID_METAL').reduce((sum, gear) => sum + gear.teeth * Math.abs(gear.angularVelocity || 0) / (Math.PI * 2), 0);
        this.solidMetalToBrassRate = activeGears.filter(gear => gear.designType === 'ALCHEMICAL' && gear.processMode === 'SOLID_TO_BRASS').reduce((sum, gear) => sum + gear.teeth * Math.abs(gear.angularVelocity || 0) / (Math.PI * 2), 0);
        this.steamTransformRate = activeGears.filter(gear => gear.designType === 'ALCHEMICAL' && gear.processMode === 'TRANSFORM').reduce((sum, gear) => sum + gear.teeth * Math.abs(gear.angularVelocity || 0) / (Math.PI * 2), 0);
        this.generatedSteamRate = Math.min(this.steamTransformRate * 10, this.water * 10);
        if (this.creativeMode) {
            this.steamPower = 200;
            this.water = 400;
            this.brass = 9999;
        } else {
            const steamConsumption = this.network && this.mainGearRunning && activeCount > 0
                ? this.network.calculateSteamConsumption()
                : 0;
            this.steamPower = Math.min(200, Math.max(0, this.steamPower + elapsed - steamConsumption * elapsed));
        }
        if (this.steamPower <= 0) this.mainGearRunning = false;
        if (!this.mainGearRunning) {
            this.placedGears.forEach(gear => {
                gear.powered = false;
                gear.rotationDir = 0;
                gear.angularVelocity = 0;
            });
        }
        this.placedGears.forEach(gear => {
            if (gear.powered && !gear.isDeadlocked && this.steamPower > 0 && this.mainGearRunning) {
                const rotationDelta = 0.012 * (gear.angularVelocity || 1) * gear.rotationDir;
                gear.angle += rotationDelta;
                if (gear.designType === 'PRODUCTION' && gear.processMode === 'FOG_COLLECTION') {
                    const progress = (this.rotationProgress.get(gear.id) || 0) + Math.abs(rotationDelta);
                    const completedRotations = Math.floor(progress / (Math.PI * 2));
                    this.rotationProgress.set(gear.id, progress % (Math.PI * 2));
                    if (completedRotations > 0) {
                        this.fog += completedRotations * gear.teeth;
                    }
                }
                if (gear.designType === 'ALCHEMICAL' && gear.processMode === 'TRANSFORM') {
                    const progress = (this.rotationProgress.get(gear.id) || 0) + Math.abs(rotationDelta);
                    const completedRotations = Math.floor(progress / (Math.PI * 2));
                    this.rotationProgress.set(gear.id, progress % (Math.PI * 2));
                    if (completedRotations > 0) {
                        const transformed = Math.min(this.water, completedRotations * gear.teeth);
                        this.water -= transformed;
                        this.steamPower = Math.min(200, this.steamPower + transformed * 10);
                    }
                }
                if (gear.designType === 'ALCHEMICAL' && (gear.processMode === 'FOG_TO_WATER' || gear.processMode === 'FOG_TO_LIQUID_METAL' || gear.processMode === 'LIQUID_TO_SOLID_METAL' || gear.processMode === 'SOLID_TO_BRASS')) {
                    const progressKey = `${gear.id}:${gear.processMode}`;
                    const progress = (this.rotationProgress.get(progressKey) || 0) + Math.abs(rotationDelta);
                    const completedRotations = Math.floor(progress / (Math.PI * 2));
                    this.rotationProgress.set(progressKey, progress % (Math.PI * 2));
                    if (completedRotations > 0) {
                        const amount = completedRotations * gear.teeth;
                        if (gear.processMode === 'FOG_TO_WATER') {
                            const transformed = Math.min(this.fog, amount * 10);
                            this.fog -= transformed;
                            this.water += transformed * 0.1;
                        } else if (gear.processMode === 'FOG_TO_LIQUID_METAL') {
                            const transformed = Math.min(this.fog, amount * 10);
                            this.fog -= transformed;
                            this.liquidMetal += transformed * 0.1;
                        } else if (gear.processMode === 'LIQUID_TO_SOLID_METAL') {
                            const transformed = Math.min(this.liquidMetal, amount);
                            this.liquidMetal -= transformed;
                            this.solidMetal += transformed;
                        } else {
                            const transformed = Math.min(this.solidMetal, amount);
                            this.solidMetal -= transformed;
                            this.brass += transformed;
                        }
                    }
                }
            }
        });
        if (this.network) this.network.synchronizeLockedAxes();
        if (performance.now() - (this.lastUiNotifyAt || 0) > 100) { this.lastUiNotifyAt = performance.now(); this.notify(); }
    }

    updatePowerGrid() {
        if (this.network) {
            this.network.rebuild(this.placedGears).updateRotation();
            if (!this.mainGearRunning || this.steamPower <= 0) this.placedGears.forEach(gear => { gear.powered = false; gear.rotationDir = 0; gear.angularVelocity = 0; });
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
}
