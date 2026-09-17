/**
 * GameState - リソース、ギア、保存データ、Undo/Redo履歴の管理モジュール
 */
export class GameState {
    // 資源、配置ギア、保存、Undo/Redo、UI通知を一元管理するアプリケーション状態。
    constructor() {
        this.steamPower = 100;
        this.water = 200;
        this.fog = 0;
        this.liquidMetal = 0;
        this.solidMetal = 0;
        this.brass = 300;
        this.creativeMode = false;
        this.creativeSnapshot = null;
        this.productionRate = 0;
        this.rotationProgress = new Map();
        this.waterRecoveryRate = 0;
        this.waterGenerationRate = 0;
        this.waterConsumptionRate = 0;
        this.fogRecoveryRate = 0;
        this.fogConsumptionRate = 0;
        this.fogToWaterRate = 0;
        this.liquidMetalRate = 0;
        this.liquidMetalConsumptionRate = 0;
        this.solidMetalRate = 0;
        this.solidMetalConsumptionRate = 0;
        this.solidMetalToBrassRate = 0;
        this.steamTransformRate = 0;
        this.generatedSteamRate = 0;
        this.steamGenerationRate = 0;
        this.steamConsumptionRate = 0;
        this.brassGenerationRate = 0;
        this.mainGearRunning = true;
        this.lastTickAt = performance.now();
        this.lastTickElapsed = 1 / 60;
        
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
        
        this.listeners = [];
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
            water: this.water,
            fog: this.fog,
            liquidMetal: this.liquidMetal,
            solidMetal: this.solidMetal,
            brass: this.brass
        };
    }

    restoreResourceSnapshot(snapshot) {
        // 保存済みの資源値を現在状態へ戻す。
        this.steamPower = snapshot.steamPower;
        this.water = snapshot.water;
        this.fog = snapshot.fog;
        this.liquidMetal = snapshot.liquidMetal;
        this.solidMetal = snapshot.solidMetal;
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

    toggleMainGear() {
        // メインギアの稼働状態を反転し、接続グラフへ再計算を依頼する。
        this.mainGearRunning = !this.mainGearRunning;
        this.updatePowerGrid();
        this.saveGameData();
        this.notify();
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
            water: this.water,
            fog: this.fog,
            liquidMetal: this.liquidMetal,
            solidMetal: this.solidMetal,
            brass: this.brass,
            mainGearRunning: this.mainGearRunning,
            creativeMode: this.creativeMode,
            creativeSnapshot: this.creativeSnapshot,
            belts: this.belts,
            gears: this.placedGears.map(gear => ({
                id: gear.id,
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
        // JSONスナップショットからギア実体を再生成し、ネットワークを再構築する。
        const data = JSON.parse(snapshot);
        this.steamPower = Number.isFinite(data.steamPower) ? data.steamPower : 100;
        this.water = data.water ?? 200;
        this.fog = data.fog ?? 0;
        this.liquidMetal = data.liquidMetal ?? 0;
        this.solidMetal = data.solidMetal ?? 0;
        this.brass = data.brass;
        this.mainGearRunning = data.mainGearRunning ?? true;
        this.creativeMode = data.creativeMode ?? false;
        this.creativeSnapshot = data.creativeSnapshot ?? null;
        this.belts = data.belts ?? [];
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
        // 直前の操作を戻し、現在状態をRedo履歴へ移す。
        if (this.undoStack.length === 0) return;
        
        this.redoStack.push(this.createSnapshot());
        this.restoreSnapshot(this.undoStack.pop());
        this.saveGameData();
    }

    redo() {
        // Undoで戻した操作を再適用する。
        if (this.redoStack.length === 0) return;
        
        this.undoStack.push(this.createSnapshot());
        this.restoreSnapshot(this.redoStack.pop());
        this.saveGameData();
    }

    reset() {
        // 保存データと盤面を初期状態へ戻す。
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
        this.belts = [];
        this.beltSelection = [];
        this.updatePowerGrid();
        this.saveGameData();
        this.notify();
    }

    saveGameData() {
        // 次回起動で復元する資源・ギア・履歴をlocalStorageへ保存する。
        const data = {
            steamPower: this.steamPower,
            water: this.water,
            fog: this.fog,
            liquidMetal: this.liquidMetal,
            solidMetal: this.solidMetal,
            brass: this.brass,
            mainGearRunning: this.mainGearRunning,
            creativeMode: this.creativeMode,
            creativeSnapshot: this.creativeSnapshot,
            belts: this.belts,
            gears: this.placedGears.map(gear => ({
                id: gear.id,
                q: gear.q, r: gear.r, size: gear.sizeKey, layer: gear.layer,
                isCore: Boolean(gear.isCore), angle: gear.angle, isLocked: gear.isLocked, designType: gear.designType, processMode: gear.processMode
            })),
            undoStack: this.undoStack,
            redoStack: this.redoStack
        };
        localStorage.setItem('fog_thermo_save', JSON.stringify(data));
    }

    loadGameData(createGear) {
        // 保存データを読み込み、渡された生成関数で各ギアを独立した実体として復元する。
        this.createGear = createGear;
        const saved = localStorage.getItem('fog_thermo_save');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                this.steamPower = Number.isFinite(data.steamPower) ? data.steamPower : 100;
                this.water = data.water ?? 200;
                this.fog = data.fog ?? data.gasMetal ?? 0;
                this.liquidMetal = data.liquidMetal ?? 0;
                this.solidMetal = data.solidMetal ?? 0;
                this.brass = data.brass ?? 300;
                this.mainGearRunning = data.mainGearRunning ?? true;
                this.creativeMode = data.creativeMode ?? false;
                this.creativeSnapshot = data.creativeSnapshot ?? null;
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

    getGearProcessInfo(gear) {
        // ギア単体の処理名、入力、出力、毎秒レートをUI用の共通形式で返す。
        // 処理ごとの表示情報をここに集約し、吹き出し側が個別の計算式を持たないようにする。
        const rotationRate = gear ? gear.teeth * Math.abs(gear.angularVelocity || 0) * 0.012 * 60 / (Math.PI * 2) : 0;
        const processInfo = {
            NONE: { name: '処理なし', input: '-', output: '-', rate: 0 },
            FOG_COLLECTION: { name: '霧の回収', input: '-', output: '霧', rate: rotationRate * 10 },
            TRANSFORM: { name: '水→スチーム', input: '水', output: 'スチーム', rate: rotationRate * 10 },
            FOG_TO_WATER: { name: '霧→水', input: '霧', output: '水', rate: rotationRate * 0.1 },
            FOG_TO_LIQUID_METAL: { name: '霧→液体金属', input: '霧', output: '液体金属', rate: rotationRate * 0.1 },
            LIQUID_TO_SOLID_METAL: { name: '液体金属→固体金属', input: '液体金属', output: '固体金属', rate: rotationRate },
            SOLID_TO_BRASS: { name: '固体金属→真鍮資材', input: '固体金属', output: '真鍮資材', rate: rotationRate }
        };
        const info = processInfo[gear?.processMode] || processInfo.NONE;
        const inputMultiplier = ['FOG_TO_WATER', 'FOG_TO_LIQUID_METAL'].includes(gear?.processMode) ? 10 : 1;
        return { ...info, inputRate: info.rate * inputMultiplier, outputRate: info.rate };
    }

    tick() {
        // 1フレーム分の時間を基準に、回転・資源変換・UI表示値を更新する。
        const now = performance.now();
        const elapsed = Math.min(0.25, Math.max(0, (now - this.lastTickAt) / 1000));
        this.lastTickAt = now;
        this.lastTickElapsed = elapsed;
        if (this.network) this.network.updateRotation();
        // 連結していても、処理設定は各ギア自身の値だけを参照する。
        const activeCount = this.placedGears.filter(gear => gear.powered && !gear.isDeadlocked).length;
        const activeGears = this.placedGears.filter(gear => gear.powered && !gear.isDeadlocked);
        this.water += elapsed;
        this.waterRecoveryRate = elapsed > 0 ? 1 : 0;
        this.productionRate = 0;
        const gearRate = gear => gear.teeth * Math.abs(gear.angularVelocity || 0) * 0.012 / Math.max(elapsed, 1 / 240) / (Math.PI * 2);
        this.fogRecoveryRate = activeGears.filter(gear => gear.processMode === 'FOG_COLLECTION').reduce((sum, gear) => sum + gearRate(gear) * 10, 0);
        this.liquidMetalRate = activeGears.filter(gear => gear.designType === 'ALCHEMICAL' && gear.processMode === 'FOG_TO_LIQUID_METAL').reduce((sum, gear) => sum + gearRate(gear) * 0.1, 0);
        this.fogToWaterRate = activeGears.filter(gear => gear.designType === 'ALCHEMICAL' && gear.processMode === 'FOG_TO_WATER').reduce((sum, gear) => sum + gearRate(gear) * 0.1, 0);
        this.solidMetalRate = activeGears.filter(gear => gear.designType === 'ALCHEMICAL' && gear.processMode === 'LIQUID_TO_SOLID_METAL').reduce((sum, gear) => sum + gearRate(gear), 0);
        this.solidMetalToBrassRate = activeGears.filter(gear => gear.designType === 'ALCHEMICAL' && gear.processMode === 'SOLID_TO_BRASS').reduce((sum, gear) => sum + gearRate(gear), 0);
        this.steamTransformRate = activeGears.filter(gear => gear.designType === 'ALCHEMICAL' && gear.processMode === 'TRANSFORM').reduce((sum, gear) => sum + gearRate(gear), 0);
        const steamConsumption = this.network && this.mainGearRunning && activeCount > 0
            ? this.network.calculateSteamConsumption()
            : 0;
        // ダッシュボードの3列目・4列目用のレートを、変換の入力と出力に分けて集計する。
        this.waterGenerationRate = this.waterRecoveryRate + this.fogToWaterRate;
        this.waterConsumptionRate = this.steamTransformRate;
        // 水1に対してスチーム10を生成するため、水→スチームの出力は水消費量から直接算出する。
        this.generatedSteamRate = this.waterConsumptionRate * 10;
        // 霧→水・霧→液体金属は、出力1に対して霧10を消費する。
        // 各出力レートはすでに0.1倍後なので、入力レートへ戻すには10倍する。
        this.fogConsumptionRate = (this.fogToWaterRate + this.liquidMetalRate) * 10;
        this.liquidMetalConsumptionRate = this.solidMetalRate;
        this.solidMetalConsumptionRate = this.solidMetalToBrassRate;
        this.brassGenerationRate = this.solidMetalToBrassRate;
        this.steamGenerationRate = this.generatedSteamRate + this.waterRecoveryRate;
        this.steamConsumptionRate = steamConsumption;
        if (this.creativeMode) {
            // クリエイティブ中も自然回復は実値へ反映し、上限だけを設けない。
            this.steamPower += elapsed;
        } else {
            this.steamPower = Math.max(0, this.steamPower + elapsed - steamConsumption * elapsed);
        }
        if (this.steamPower <= 0) this.mainGearRunning = false;
        if (!this.mainGearRunning) {
            this.placedGears.forEach(gear => {
                gear.powered = false;
                gear.rotationDir = 0;
                gear.angularVelocity = 0;
            });
        }
        // 回転中の各ギアを個別に処理する。同じ軸でも資源処理は共有しない。
        this.placedGears.forEach(gear => {
            if (gear.powered && !gear.isDeadlocked && this.steamPower > 0 && this.mainGearRunning) {
                const rotationDelta = 0.012 * 60 * (gear.angularVelocity || 1) * elapsed * gear.rotationDir;
                gear.angle += rotationDelta;
                // 霧回収は1回転の完了を待たず、回転角に比例して連続的に加算する。
                if (gear.processMode === 'FOG_COLLECTION') {
                    this.fog += gear.teeth * 10 * Math.abs(rotationDelta) / (Math.PI * 2);
                }
                if (gear.designType === 'ALCHEMICAL' && gear.processMode === 'TRANSFORM') {
                    const progress = (this.rotationProgress.get(gear.id) || 0) + Math.abs(rotationDelta);
                    const completedRotations = Math.floor(progress / (Math.PI * 2));
                    this.rotationProgress.set(gear.id, progress % (Math.PI * 2));
                    if (completedRotations > 0) {
                        const transformed = Math.min(this.water, completedRotations * gear.teeth);
                        this.water -= transformed;
                        this.steamPower += transformed * 10;
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
            this.network.rebuild(this.placedGears, this.belts).updateRotation();
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
