/**
 * GameState - リソース、ギア、保存データ、Undo/Redo履歴の管理モジュール
 */
export class GameState {
    constructor() {
        this.steamPower = 100;
        this.brass = 300;
        this.creativeMode = false;
        
        this.selectedSize = 'M';
        this.selectedLayer = 0;
        
        this.placedGears = [];
        this.ghostGear = null;
        this.zoomScale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistory = 30;
        this.createGear = null;
        
        this.listeners = [];
    }

    subscribe(listener) {
        this.listeners.push(listener);
    }

    notify() {
        this.listeners.forEach(fn => fn(this));
    }

    setCreativeMode(active) {
        this.creativeMode = active;
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

    saveState() {
        this.undoStack.push(this.createSnapshot());
        if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
        this.redoStack = [];
        this.notify();
    }

    createSnapshot() {
        return JSON.stringify({
            steamPower: this.steamPower,
            brass: this.brass,
            gears: this.placedGears.map(gear => ({
                q: gear.q,
                r: gear.r,
                size: gear.sizeKey,
                layer: gear.layer,
                isCore: gear.isCore,
                angle: gear.angle
            }))
        });
    }

    restoreSnapshot(snapshot) {
        const data = JSON.parse(snapshot);
        this.steamPower = data.steamPower;
        this.brass = data.brass;
        const gears = data.gears || data.placedGears || [];
        this.placedGears = this.createGear
            ? gears.map(this.createGear)
            : gears.map(gear => ({ ...gear, sizeKey: gear.sizeKey || gear.size }));
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
        this.brass = 300;
        this.undoStack = [];
        this.redoStack = [];
        this.updatePowerGrid();
        this.saveGameData();
        this.notify();
    }

    saveGameData() {
        const data = {
            steamPower: this.steamPower,
            brass: this.brass,
            gears: this.placedGears.map(gear => ({
                q: gear.q, r: gear.r, size: gear.sizeKey, layer: gear.layer,
                isCore: Boolean(gear.isCore), angle: gear.angle
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
                this.brass = data.brass ?? 300;
                this.placedGears = (data.gears || data.placedGears || []).map(createGear);
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
        this.updatePowerGrid();
        const activeCount = this.placedGears.filter(gear => gear.powered && !gear.isDeadlocked).length;
        if (this.creativeMode) {
            this.steamPower = 200;
            this.brass = 9999;
        } else {
            this.steamPower = Math.min(200, Math.max(0, this.steamPower + 0.1 - activeCount * 0.05));
            if (activeCount > 1 && this.steamPower > 5) this.brass += activeCount * 0.01;
        }
        this.placedGears.forEach(gear => {
            if (gear.powered && !gear.isDeadlocked) {
                const speed = 0.012 * (24 / gear.teeth) * gear.rotationDir;
                gear.angle += gear.layer > 0 && gear.layer % 2 === 1 ? -speed : speed;
            }
        });
        this.notify();
    }

    updatePowerGrid() {
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
