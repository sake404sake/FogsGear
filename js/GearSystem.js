// ギアの歯数をサイズ名から参照する。歯数はコスト・回転比・処理量の基準になる。
export const GearSize = Object.freeze({ XXS: 4, SS: 6, S: 10, M: 14, L: 18, LL: 24, THREE_L: 32, FOUR_L: 40, MAX: 48 });
// 物理レイヤーは金・銀・銅の3段で、同じq/rなら同軸として扱う。
export const Layer = Object.freeze({ GOLD: 0, SILVER: 1, BRONZE: 2 });
// ギアの外観分類。処理モードとは独立した設定値として保持する。
export const GearDesignType = Object.freeze({ INDUSTRIAL: 'INDUSTRIAL', ALCHEMICAL: 'ALCHEMICAL', LOGISTICS: 'LOGISTICS', CLOCKWORK: 'CLOCKWORK', PRODUCTION: 'PRODUCTION' });
// 資源変換や霧回収の種類。実際の資源処理はGameStateが担当する。
export const ProcessMode = Object.freeze({ NONE: 'NONE', FOG_COLLECTION: 'FOG_COLLECTION', TRANSFORM: 'TRANSFORM', FOG_TO_WATER: 'FOG_TO_WATER', FOG_TO_LIQUID_METAL: 'FOG_TO_LIQUID_METAL', LIQUID_TO_SOLID_METAL: 'LIQUID_TO_SOLID_METAL', SOLID_TO_BRASS: 'SOLID_TO_BRASS' });

const layerDesigns = [GearDesignType.INDUSTRIAL, GearDesignType.ALCHEMICAL, GearDesignType.CLOCKWORK];

export class Gear {
    // ギア1個の永続設定と、ネットワークが毎 tick 更新する回転状態を保持する。
    constructor({ id, size, layer = Layer.GOLD, isLocked, designType, processMode = ProcessMode.NONE, position = { q: 0, r: 0 }, isCore = false, angle = 0 }) {
        this.id = id || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        this.size = size;
        this.sizeKey = Object.keys(GearSize).find(key => GearSize[key] === size) || 'M';
        this.teeth = size;
        this.layer = layer;
        this.isLocked = isLocked ?? isCore;
        this.designType = designType || layerDesigns[layer];
        this.processMode = processMode === 'POWER' ? ProcessMode.NONE : processMode;
        this.q = position.q;
        this.r = position.r;
        this.isCore = isCore;
        this.angle = angle;
        this.powered = isCore;
        this.rotationDir = isCore ? 1 : 0;
        this.angularVelocity = isCore ? 1 : 0;
        this.isDeadlocked = false;
        this.angleError = false;
    }

    // ギアサイズに応じた設置コストと駆動負荷を返す。
    get brassCost() { return Number.isFinite(this.size) ? this.size : Number(this.teeth) || 0; }
    get steamLoad() { return Math.floor(Math.sqrt(Number(this.teeth) || 0)); }

}

export class Axis {
    // 同じq/rにある複数レイヤーのギアをまとめ、同軸ロックと摩擦を計算する。
    constructor(q, r) { this.q = q; this.r = r; this.gears = new Map(); }
    add(gear) { this.gears.set(gear.layer, gear); }
    get lockedGears() { return [...this.gears.values()].filter(gear => gear.isLocked); }
    friction() {
        const gears = [...this.gears.values()].filter(gear => !gear.isCore);
        const synchronized = this.lockedGears.filter(gear => !gear.isCore).length;
        return gears.filter(gear => !gear.isLocked).length * 8 + (synchronized ? 8 / synchronized : 0);
    }
}

export class GearNetwork {
    // ギア間の接続グラフ、同軸、ループ、回転状態を再計算する物理モデル。
    constructor(gears = [], belts = []) { this.rebuild(gears, belts); }
    rebuild(gears, belts = []) {
        // 配置済みギアをIDで管理し、軸と接続関係を毎回再構築する。
        this.gears = new Map(gears.map(gear => [gear.id, gear]));
        this.axes = new Map();
        this.connections = new Map();
        this.beltEdges = new Set();
        this.belts = belts;
        this.loopGearIds = new Set();
        gears.forEach(gear => { const key = `${gear.q},${gear.r}`; if (!this.axes.has(key)) this.axes.set(key, new Axis(gear.q, gear.r)); this.axes.get(key).add(gear); });
        this.rebuildConnections(belts);
        this.rebuildLoops();
        return this;
    }
    connect(first, second) {
        // 接続はIDの隣接集合として双方向に登録する。
        if (!this.connections.has(first.id)) this.connections.set(first.id, new Set());
        if (!this.connections.has(second.id)) this.connections.set(second.id, new Set());
        this.connections.get(first.id).add(second.id);
        this.connections.get(second.id).add(first.id);
    }
    rebuildConnections(belts = []) {
        // 同軸のロック接続と、同一層で噛み合う物理接続だけを作る。
        this.connections.clear();
        this.beltEdges.clear();
        const gears = [...this.gears.values()];
        gears.forEach((gear, index) => gears.slice(index + 1).forEach(other => {
            const axis = gear.q === other.q && gear.r === other.r && gear.layer !== other.layer && gear.isLocked && other.isLocked;
            const mesh = gear.layer === other.layer && Math.hypot(gear.x - other.x, gear.y - other.y) <= gear.radius + other.radius + 2;
            if (axis || mesh) this.connect(gear, other);
        }));
        belts.forEach(belt => {
            const gearIds = belt.gearIds || [];
            for (let index = 1; index < gearIds.length; index++) {
                const first = this.gears.get(gearIds[index - 1]);
                const second = this.gears.get(gearIds[index]);
                if (!first || !second || first.id === second.id) continue;
                this.connect(first, second);
                this.beltEdges.add([first.id, second.id].sort().join(':'));
            }
        });
        this.rebuildLoops();
    }
    rebuildLoops() {
        // 次数1未満の端点を除去し、最後に残る閉路ギアをループとして識別する。
        const degree = new Map([...this.gears.keys()].map(id => [id, (this.connections.get(id) || new Set()).size]));
        const queue = [...degree.entries()].filter(([, count]) => count < 2).map(([id]) => id);
        const removed = new Set();
        while (queue.length) {
            const id = queue.shift();
            if (removed.has(id)) continue;
            removed.add(id);
            for (const neighbor of this.connections.get(id) || []) {
                if (removed.has(neighbor)) continue;
                degree.set(neighbor, degree.get(neighbor) - 1);
                if (degree.get(neighbor) < 2) queue.push(neighbor);
            }
        }
        this.loopGearIds = new Set([...this.gears.keys()].filter(id => !removed.has(id)));
    }
    // 配置済みギアのサイズから、設置済み真鍮コストを合計する。
    calculateBrassCost() { return [...this.gears.values()].filter(gear => !gear.isCore).reduce((sum, gear) => sum + gear.brassCost, 0); }
    // 基本駆動負荷と軸摩擦を合算する。ループ内の軸摩擦は0として扱う。
    calculateSteamConsumption() {
        const baseLoad = [...this.gears.values()].filter(gear => !gear.isCore).reduce((sum, gear) => sum + gear.steamLoad, 0);
        const friction = [...this.axes.values()].reduce((sum, axis) => {
            const axisInLoop = [...axis.gears.values()].some(gear => this.loopGearIds.has(gear.id));
            return sum + (axisInLoop ? 0 : axis.friction());
        }, 0);
        return baseLoad + friction;
    }
    // ポップオーバーに表示する、指定ギア単体の摩擦負荷を返す。
    calculateGearFriction(gear) {
        if (!gear || gear.isCore) return 0;
        const axis = this.axes.get(`${gear.q},${gear.r}`);
        if (!axis) return 8;
        if ([...axis.gears.values()].some(item => this.loopGearIds.has(item.id))) return 0;
        if (!gear.isLocked) return 8;
        const synchronized = axis.lockedGears.filter(item => !item.isCore).length;
        return synchronized ? 8 / synchronized : 8;
    }
    synchronizeLockedAxes() {
        // 同軸ロック時に同期するのは回転状態だけ。種類・処理設定は同期しない。
        for (const axis of this.axes.values()) {
            const locked = axis.lockedGears.sort((a, b) => a.layer - b.layer);
            if (locked.length < 2 || locked.some(gear => gear.isDeadlocked || gear.angleError)) continue;
            const base = locked[0];
            locked.slice(1).forEach(gear => {
                gear.angle = base.angle;
                gear.rotationDir = base.rotationDir;
                gear.angularVelocity = base.angularVelocity;
                gear.powered = base.powered;
            });
        }
    }
    updateRotation() {
        // 接続グラフから各ギアの回転方向・速度を決める。処理設定は変更しない。
        this.rebuildConnections(this.belts || []);
        const invalidLockedAxes = new Set();
        for (const edge of this.beltEdges) {
            const [firstId, secondId] = edge.split(':');
            const first = this.gears.get(firstId);
            const second = this.gears.get(secondId);
            const sameAxis = first && second
                && first.q === second.q
                && first.r === second.r
                && first.layer !== second.layer;
            if (sameAxis && !(first.isLocked && second.isLocked)) {
                invalidLockedAxes.add(first.id);
                invalidLockedAxes.add(second.id);
            }
        }
        for (const axis of this.axes.values()) {
            const locked = axis.lockedGears;
            if (locked.length < 2) continue;
            const base = locked[0];
            const invalid = locked.some(gear => Math.abs(Math.atan2(Math.sin(gear.angle - base.angle), Math.cos(gear.angle - base.angle))) > 0.08)
                || new Set(locked.map(gear => gear.rotationDir).filter(Boolean)).size > 1
                || locked.some(gear => gear.angularVelocity && base.angularVelocity && Math.abs(gear.angularVelocity - base.angularVelocity) > 0.001);
            if (invalid) {
                locked.forEach(gear => {
                    gear.angle = base.angle;
                    gear.rotationDir = base.rotationDir || 1;
                    gear.angularVelocity = base.angularVelocity || 1;
                    gear.angleError = false;
                    gear.isDeadlocked = false;
                });
            }
        }
        this.gears.forEach(gear => { gear.powered = false; gear.rotationDir = 0; gear.angularVelocity = 0; gear.isDeadlocked = false; gear.angleError = false; });
        invalidLockedAxes.forEach(id => { const gear = this.gears.get(id); gear.angleError = true; gear.isDeadlocked = true; });
        const core = [...this.gears.values()].find(gear => gear.isCore);
        if (!core) return;
        const rotationStates = new Map();
        const conflicts = new Set();
        const queue = [{ gear: core, speed: 1, direction: 1 }];
        while (queue.length) {
            const current = queue.shift();
            const known = rotationStates.get(current.gear.id);
            if (known) {
                const speedMismatch = Math.abs(known.speed - current.speed) > 0.001;
                const directionMismatch = known.direction !== current.direction;
                // 同じギアへ別経路が戻ってきても、すでに確定した状態は維持する。
                // 速度・方向が異なる場合だけ、物理的に矛盾する閉路として停止させる。
                if ((speedMismatch || directionMismatch) && !current.gear.isDeadlocked) {
                    conflicts.add(current.gear.id);
                }
                continue;
            }
            rotationStates.set(current.gear.id, { speed: current.speed, direction: current.direction });
            if (invalidLockedAxes.has(current.gear.id)) continue;
            current.gear.powered = true;
            current.gear.rotationDir = current.direction;
            current.gear.angularVelocity = current.speed;
            for (const id of this.connections.get(current.gear.id) || []) {
                const other = this.gears.get(id);
                const axis = current.gear.q === other.q && current.gear.r === other.r && current.gear.layer !== other.layer
                    && current.gear.isLocked && other.isLocked;
                const belt = this.beltEdges.has([current.gear.id, other.id].sort().join(':'));
                const driver = axis ? current.gear : this.getTransmissionGear(current.gear, other);
                const speed = axis
                    ? current.speed
                    : belt
                        ? current.speed * other.size / driver.size 
                        : current.speed * other.size / driver.size ;
                queue.push({ gear: other, speed, direction: axis || belt ? current.direction : -current.direction });
            }
        }
        conflicts.forEach(id => {
            const gear = this.gears.get(id);
            if (gear) { gear.isDeadlocked = true; gear.angleError = true; }
        });
        const deadlocked = new Set([...invalidLockedAxes, ...conflicts]);
        const blockedQueue = [...deadlocked];
        while (blockedQueue.length) {
            const id = blockedQueue.shift();
            for (const connectedId of this.connections.get(id) || []) {
                if (deadlocked.has(connectedId)) continue;
                deadlocked.add(connectedId);
                blockedQueue.push(connectedId);
            }
        }
        deadlocked.forEach(id => {
            const gear = this.gears.get(id);
            if (!gear) return;
            gear.powered = false;
            gear.rotationDir = 0;
            gear.angularVelocity = 0;
            gear.isDeadlocked = true;
            gear.angleError = true;
        });
    }

    getTransmissionGear(current, other) {
        // 同軸固定ギアから外部へ出る場合は、実際に接続された同軸ギアを駆動側にする。
        const axis = this.axes.get(`${current.q},${current.r}`);
        if (!axis || !current.isLocked) return current;
        const connected = [...axis.gears.values()].find(gear => gear.id === current.id);
        return connected || current;
    }
}