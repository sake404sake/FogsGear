export const GearSize = Object.freeze({ XXS: 4, SS: 6, S: 10, M: 14, L: 18, LL: 24, THREE_L: 32, FOUR_L: 40, MAX: 48 });
export const Layer = Object.freeze({ GOLD: 0, SILVER: 1, BRONZE: 2 });
export const GearDesignType = Object.freeze({ INDUSTRIAL: 'INDUSTRIAL', ALCHEMICAL: 'ALCHEMICAL', LOGISTICS: 'LOGISTICS', CLOCKWORK: 'CLOCKWORK', PRODUCTION: 'PRODUCTION' });
export const ProcessMode = Object.freeze({ NONE: 'NONE', FOG_COLLECTION: 'FOG_COLLECTION', TRANSFORM: 'TRANSFORM', FOG_TO_WATER: 'FOG_TO_WATER', FOG_TO_LIQUID_METAL: 'FOG_TO_LIQUID_METAL', LIQUID_TO_SOLID_METAL: 'LIQUID_TO_SOLID_METAL', SOLID_TO_BRASS: 'SOLID_TO_BRASS' });

const layerDesigns = [GearDesignType.INDUSTRIAL, GearDesignType.ALCHEMICAL, GearDesignType.CLOCKWORK];

export class Gear {
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

    get brassCost() { return this.size; }
    get steamLoad() { return Math.floor(Math.sqrt(this.teeth)); }
}

export class Axis {
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
    constructor(gears = []) { this.rebuild(gears); }
    rebuild(gears) {
        this.gears = new Map(gears.map(gear => [gear.id, gear]));
        this.axes = new Map();
        this.connections = new Map();
        this.loopGearIds = new Set();
        gears.forEach(gear => { const key = `${gear.q},${gear.r}`; if (!this.axes.has(key)) this.axes.set(key, new Axis(gear.q, gear.r)); this.axes.get(key).add(gear); });
        this.rebuildConnections();
        this.rebuildLoops();
        return this;
    }
    connect(first, second) {
        if (!this.connections.has(first.id)) this.connections.set(first.id, new Set());
        if (!this.connections.has(second.id)) this.connections.set(second.id, new Set());
        this.connections.get(first.id).add(second.id);
        this.connections.get(second.id).add(first.id);
    }
    rebuildConnections() {
        this.connections.clear();
        const gears = [...this.gears.values()];
        gears.forEach((gear, index) => gears.slice(index + 1).forEach(other => {
            const axis = gear.q === other.q && gear.r === other.r && gear.layer !== other.layer && gear.isLocked && other.isLocked;
            const mesh = gear.layer === other.layer && Math.hypot(gear.x - other.x, gear.y - other.y) <= gear.radius + other.radius + 2;
            if (axis || mesh) this.connect(gear, other);
        }));
        this.rebuildLoops();
    }
    rebuildLoops() {
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
    calculateBrassCost() { return [...this.gears.values()].filter(gear => !gear.isCore).reduce((sum, gear) => sum + gear.brassCost, 0); }
    calculateSteamConsumption() {
        const baseLoad = [...this.gears.values()].filter(gear => !gear.isCore).reduce((sum, gear) => sum + gear.steamLoad, 0);
        const friction = [...this.axes.values()].reduce((sum, axis) => {
            const axisInLoop = [...axis.gears.values()].some(gear => this.loopGearIds.has(gear.id));
            return sum + (axisInLoop ? 0 : axis.friction());
        }, 0);
        return baseLoad + friction;
    }
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
        this.rebuildConnections();
        const invalidLockedAxes = new Set();
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
                if (speedMismatch || directionMismatch) {
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
                const axis = current.gear.q === other.q && current.gear.r === other.r && current.gear.layer !== other.layer;
                queue.push({ gear: other, speed: axis ? current.speed : current.speed * current.gear.size / other.size, direction: axis ? current.direction : -current.direction });
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
}