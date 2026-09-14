/** GearManager - ギア仕様定義・配置・補正計算ロジック */
import { Gear, GearNetwork } from './GearSystem.js';
export const GEAR_CONFIG = {
    'XXS': { teeth: 4, radius: 12, cost: 4, pattern: 'ring' }, 'SS': { teeth: 6, radius: 18, cost: 6, pattern: 'sunburst' }, 'S': { teeth: 10, radius: 30, cost: 10, pattern: 'holes' }, 'M': { teeth: 14, radius: 42, cost: 14, pattern: 'triangular' }, 'L': { teeth: 18, radius: 54, cost: 18, pattern: 'wave' }, 'LL': { teeth: 24, radius: 72, cost: 24, pattern: 'crown' }, '3L': { teeth: 32, radius: 96, cost: 32, pattern: 'lattice' }, '4L': { teeth: 40, radius: 120, cost: 40, pattern: 'radial' }, 'MAX': { teeth: 48, radius: 144, cost: 48, pattern: 'industrial' }
};

export const PITCH = 2;

export function pixelToHex(x, y) {
    const q = (Math.sqrt(3) / 3 * x - y / 3) / PITCH;
    const r = (2 / 3 * y) / PITCH;
    const z = -q - r;
    let rq = Math.round(q), rr = Math.round(r), rz = Math.round(z);
    const qDiff = Math.abs(rq - q), rDiff = Math.abs(rr - r), zDiff = Math.abs(rz - z);
    if (qDiff > rDiff && qDiff > zDiff) rq = -rr - rz;
    else if (rDiff > zDiff) rr = -rq - rz;
    return { q: rq, r: rr };
}

export function hexToPixel(q, r) {
    return { x: PITCH * Math.sqrt(3) * (q + r / 2), y: PITCH * 1.5 * r };
}

export class GearManager {
    constructor(gameState) {
        this.state = gameState;
        this.canvas = document.getElementById('gearCanvas');
        this.network = new GearNetwork();
        this.state.network = this.network;
        this.state.loadGameData(data => {
            const sizeKey = data.sizeKey || data.size || 'M';
            const position = data.q === undefined ? pixelToHex(data.x || 0, data.y || 0) : { q: data.q, r: data.r };
            const gear = this.createGear(position.q, position.r, sizeKey, data.layer, data.isCore, data.angle);
            gear.isLocked = data.isLocked ?? Boolean(data.isCore);
            gear.designType = data.designType || gear.designType;
            gear.processMode = data.processMode || gear.processMode;
            return gear;
        });
        this.network.rebuild(this.state.placedGears);
        this.state.updatePowerGrid();
        this.state.saveGameData();
    }

    createGear(q = 0, r = 0, sizeKey, layer = 0, isCore = false, angle = 0) {
        const config = GEAR_CONFIG[sizeKey] || GEAR_CONFIG.M;
        const position = hexToPixel(q, r);
        const gear = new Gear({ size: config.teeth, layer, position: { q, r }, isCore, angle });
        return Object.assign(gear, { x: position.x, y: position.y, sizeKey, radius: config.radius, cost: config.cost, pattern: config.pattern });
    }

    removeGear(gear) {
        if (!gear || gear.isCore) return false;
        this.state.saveState();
        this.state.placedGears = this.state.placedGears.filter(other => other.id !== gear.id);
        if (!this.state.creativeMode) this.state.brass += Math.floor(gear.cost * 0.8);
        this.state.updatePowerGrid();
        this.state.saveGameData();
        this.state.notify();
        return true;
    }

    findGearById(id) { return this.state.placedGears.find(gear => gear.id === id) || null; }
    setGearLock(gear, locked) {
        const synced = this.state.placedGears.filter(other => other.q === gear.q && other.r === gear.r);
        if (locked && synced.length < 2) {
            gear.isLocked = false;
            this.state.notify();
            return false;
        }
        synced.forEach(other => { other.isLocked = locked || other.isCore; });
        if (locked) {
            const lockedGears = synced.filter(other => other.isLocked).sort((a, b) => a.layer - b.layer);
            const base = lockedGears[0];
            if (base) lockedGears.forEach(other => {
                other.angle = base.angle;
                other.rotationDir = base.rotationDir || 1;
                other.angularVelocity = base.angularVelocity || 1;
                other.angleError = false;
                other.isDeadlocked = false;
            });
        } else {
            gear.angleError = false;
            gear.isDeadlocked = false;
        }
        this.state.updatePowerGrid();
        this.state.saveGameData();
        this.state.notify();
        return true;
    }

    findMeshConnections(x, y, radius, layer) {
        return this.state.placedGears.filter(gear => gear.layer === layer && Math.hypot(gear.x - x, gear.y - y) <= gear.radius + radius + 2);
    }
    updateGearSettings(gear, settings) { Object.assign(gear, settings); this.state.saveGameData(); this.state.notify(); }

    /**
     * 指定位置に既存ギアの中心があるか判定（中心タップで削除用）
     */
    findGearAt(x, y) {
        return [...this.state.placedGears].sort((a, b) => b.layer - a.layer).find(gear => {
            const dx = gear.x - x;
            const dy = gear.y - y;
            return Math.hypot(dx, dy) < Math.max(18, gear.radius * 0.55);
        });
    }

    /**
     * 重複配置のチェック（同じレイヤーで距離が小さすぎる場合は不可）
     */
    canPlaceAt(x, y, radius, layer) {
        return !this.state.placedGears.some(gear => {
            if (gear.layer !== layer) return false;
            const dx = gear.x - x;
            const dy = gear.y - y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            return dist < gear.radius + radius - 2;
        });
    }

    updateGhost(mouseX, mouseY, pointerOffsetY = 110) {
        const sizeKey = this.state.selectedSize;
        if (!sizeKey) {
            this.state.ghostGear = null;
            return;
        }
        const adjustedMouseY = mouseY - pointerOffsetY;
        const x = (mouseX - this.canvas.width / 2) / this.state.zoomScale - this.state.offsetX;
        const y = (adjustedMouseY - this.canvas.height / 2) / this.state.zoomScale - this.state.offsetY;
        const config = GEAR_CONFIG[sizeKey];
        const layer = this.state.selectedLayer;
        let valid = layer < 3 && (this.state.creativeMode || this.state.brass >= config.cost);
        const sameLayer = this.state.placedGears.filter(gear => gear.layer === layer);
        const allAxes = [];
        const axisKeys = new Set();
        this.state.placedGears.forEach(gear => {
            const key = `${gear.q},${gear.r}`;
            if (axisKeys.has(key)) return;
            axisKeys.add(key);
            const axisPosition = hexToPixel(gear.q, gear.r);
            allAxes.push({ q: gear.q, r: gear.r, x: axisPosition.x, y: axisPosition.y });
        });
        let position = { x, y };
        let hex = pixelToHex(x, y);
        const nearest = sameLayer.reduce((best, gear) => {
            const distance = Math.hypot(x - gear.x, y - gear.y);
            return distance < best.distance ? { gear, distance } : best;
        }, { gear: null, distance: Infinity });
        if (nearest.gear && nearest.distance < nearest.gear.radius + config.radius + 50) {
            const angle = Math.atan2(y - nearest.gear.y, x - nearest.gear.x);
            const meshOverlap = Math.max(3, config.radius * 0.015);
            const targetDistance = nearest.gear.radius + config.radius - meshOverlap;
            position = {
                x: nearest.gear.x + Math.cos(angle) * targetDistance,
                y: nearest.gear.y + Math.sin(angle) * targetDistance
            };
            hex = pixelToHex(position.x, position.y);
            const otherPitch = Math.PI * 2 / nearest.gear.teeth;
            const selfPitch = Math.PI * 2 / config.teeth;
            const otherTooth = nearest.gear.angle + Math.round((angle - nearest.gear.angle) / otherPitch) * otherPitch;
            const fineToothCorrection = sizeKey === '4L' || sizeKey === 'MAX' ? selfPitch / 2 : 0;
            const meshAngle = otherTooth + Math.PI + selfPitch / 2 + fineToothCorrection;
            const blockedBy = sameLayer.filter(gear => gear !== nearest.gear && Math.hypot(position.x - gear.x, position.y - gear.y) < config.radius + gear.radius - 2);
            const designType = ['INDUSTRIAL', 'ALCHEMICAL', 'CLOCKWORK'][layer] || 'INDUSTRIAL';
            if (blockedBy.length) {
                const cursorBlockedBy = sameLayer.filter(gear => Math.hypot(x - gear.x, y - gear.y) < config.radius + gear.radius - 2);
                const cursorConnections = this.findMeshConnections(x, y, config.radius, layer);
                this.state.ghostGear = { x, y, q: pixelToHex(x, y).q, r: pixelToHex(x, y).r, layer, sizeKey, designType, radius: config.radius, teeth: config.teeth, pattern: config.pattern, angle: 0, valid: false, connectionIds: cursorConnections.map(gear => gear.id), blockedIds: cursorBlockedBy.map(gear => gear.id) };
                return;
            }
            const connections = this.findMeshConnections(position.x, position.y, config.radius, layer);
            this.state.ghostGear = { ...position, q: hex.q, r: hex.r, layer, sizeKey, designType, radius: config.radius, teeth: config.teeth, pattern: config.pattern, angle: meshAngle, valid, connectionIds: connections.map(gear => gear.id), blockedIds: blockedBy.map(gear => gear.id) };
            return;
        } else {
            let closestAxis = null;
            let closestDistance = 65;
            allAxes.forEach(axis => {
                const distance = Math.hypot(x - axis.x, y - axis.y);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestAxis = axis;
                }
            });
            if (closestAxis) hex = { q: closestAxis.q, r: closestAxis.r };
            const snapped = hexToPixel(hex.q, hex.r);
            position = snapped;
            const blockedBy = sameLayer.filter(gear => gear.q === hex.q && gear.r === hex.r || Math.hypot(position.x - gear.x, position.y - gear.y) < config.radius + gear.radius - 2);
            if (blockedBy.length) valid = false;
        }
        const designType = ['INDUSTRIAL', 'ALCHEMICAL', 'CLOCKWORK'][layer] || 'INDUSTRIAL';
        const connections = this.findMeshConnections(position.x, position.y, config.radius, layer);
        const blockedBy = sameLayer.filter(gear => gear.q === hex.q && gear.r === hex.r || Math.hypot(position.x - gear.x, position.y - gear.y) < config.radius + gear.radius - 2);
        this.state.ghostGear = { ...position, q: hex.q, r: hex.r, layer, sizeKey, designType, radius: config.radius, teeth: config.teeth, pattern: config.pattern, angle: 0, valid, connectionIds: connections.map(gear => gear.id), blockedIds: blockedBy.map(gear => gear.id) };
    }

    /**
     * 近接するギアとの自動噛み合い補正（スナップ計算）
     */
    calculateSnapPosition(x, y, sizeKey, layer) {
        const config = GEAR_CONFIG[sizeKey];
        if (!config) return { x, y, angle: 0 };

        let bestX = x;
        let bestY = y;
        let bestAngle = 0;

        // 同一層で近くにあるギアを探して噛み合わせ計算
        this.state.placedGears.forEach(other => {
            if (other.layer !== layer) return;

            const dx = x - other.x;
            const dy = y - other.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const targetDist = other.radius + config.radius;

            // スナップ対象の距離範囲内か判定
            if (Math.abs(dist - targetDist) < 25) {
                const angle = Math.atan2(dy, dx);
                bestX = other.x + Math.cos(angle) * targetDist;
                bestY = other.y + Math.sin(angle) * targetDist;
                
                // 歯車の回転角補正
                const pitchSelf = (2 * Math.PI) / config.teeth;
                bestAngle = angle + Math.PI + (pitchSelf / 2);
            }
        });

        return { x: bestX, y: bestY, angle: bestAngle };
    }

    /**
     * ギアの配置実行
     */
    tryPlaceGear(x, y) {
        const sizeKey = this.state.selectedSize;
        const layer = this.state.selectedLayer;
        if (!sizeKey) {
            const existingGear = this.findGearAt(x, y);
            if (!existingGear || existingGear.isCore) return false;
            this.state.saveState();
            this.state.placedGears = this.state.placedGears.filter(gear => gear !== existingGear);
            if (!this.state.creativeMode) this.state.brass += Math.floor(existingGear.cost * 0.8);
            this.state.updatePowerGrid();
            this.state.saveGameData();
            this.state.notify();
            return true;
        }
        const config = GEAR_CONFIG[sizeKey];
        if (!config || !this.state.ghostGear?.valid) return false;
        const ghost = this.state.ghostGear;
        this.state.saveState();
        this.state.placedGears.push(this.createGear(ghost.q, ghost.r, sizeKey, layer, false, ghost.angle));
        const placed = this.state.placedGears.at(-1);
        placed.x = ghost.x;
        placed.y = ghost.y;
        if (!this.state.creativeMode) this.state.brass -= config.cost;
        this.state.updatePowerGrid();
        this.state.saveGameData();
        this.state.notify();
        return true;
        /*
        if (existingGear) {
            this.state.saveState();
            this.state.placedGears = this.state.placedGears.filter(g => g.id !== existingGear.id);
            if (!this.state.creativeMode) {
                this.state.brass += Math.floor(GEAR_CONFIG[existingGear.sizeKey].cost * 0.7); // 7割返還
            }
            this.state.notify();
            return true;
        }

        // 配置可否およびスナップ位置算出
        if (!this.canPlaceAt(x, y, config.radius, layer)) return false;

        const pos = this.calculateSnapPosition(x, y, sizeKey, layer);

        this.state.saveState();
        
        const newGear = {
            id: Date.now() + Math.random(),
            x: pos.x,
            y: pos.y,
            sizeKey: sizeKey,
            teeth: config.teeth,
            radius: config.radius,
            layer: layer,
            angle: pos.angle
        };

        this.state.placedGears.push(newGear);
        if (!this.state.creativeMode) {
            this.state.brass -= config.cost;
        }
        
        this.state.notify();
        return true;
        */
    }
}
