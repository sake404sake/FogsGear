/** GearManager - ギア仕様定義・配置・補正計算ロジック */
import { Gear, GearNetwork } from './GearSystem.js';
export const GEAR_CONFIG = {
    'XXS': { teeth: 4, radius: 12, cost: 4, pattern: 'ring' }, 'SS': { teeth: 6, radius: 18, cost: 6, pattern: 'sunburst' }, 'S': { teeth: 10, radius: 30, cost: 10, pattern: 'holes' }, 'M': { teeth: 14, radius: 42, cost: 14, pattern: 'triangular' }, 'L': { teeth: 18, radius: 54, cost: 18, pattern: 'wave' }, 'LL': { teeth: 24, radius: 72, cost: 24, pattern: 'crown' }, '3L': { teeth: 32, radius: 96, cost: 32, pattern: 'lattice' }, '4L': { teeth: 40, radius: 120, cost: 40, pattern: 'radial' }, 'MAX': { teeth: 48, radius: 144, cost: 48, pattern: 'industrial' }
};

export const PITCH = 2;

// 画面上の座標を、ギア配置に使う六角座標へ丸める。
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

// 六角座標をキャンバス上のワールド座標へ変換する。
export function hexToPixel(q, r) {
    return { x: PITCH * Math.sqrt(3) * (q + r / 2), y: PITCH * 1.5 * r };
}

export class GearManager {
    // 配置・保存復元・ギア設定変更を担当する。物理計算はGearNetworkへ委譲する。
    constructor(gameState) {
        this.state = gameState;
        this.canvas = document.getElementById('gearCanvas');
        this.network = new GearNetwork();
        this.state.network = this.network;
        // 保存データからギアを1個ずつ復元し、種類・処理・ロック状態を各オブジェクトへ設定する。
        this.state.loadGameData(data => {
            const sizeKey = data.sizeKey || data.size || 'M';
            const hasHexPosition = Number.isFinite(data.q) && Number.isFinite(data.r);
            const position = hasHexPosition ? { q: data.q, r: data.r } : pixelToHex(data.x || 0, data.y || 0);
            const gear = this.createGear(position.q, position.r, sizeKey, data.layer, data.isCore, data.angle, data.id);
            gear.isLocked = data.isLocked ?? Boolean(data.isCore);
            gear.designType = data.designType || gear.designType;
            gear.processMode = data.processMode === 'GAS_TO_LIQUID_METAL' ? 'FOG_TO_LIQUID_METAL' : data.processMode || gear.processMode;
            return gear;
        });
        this.state.loadScrollEditorSession(data => {
            const sizeKey = data.sizeKey || data.size || 'M';
            const hasHexPosition = Number.isFinite(data.q) && Number.isFinite(data.r);
            const position = hasHexPosition ? { q: data.q, r: data.r } : pixelToHex(data.x || 0, data.y || 0);
            const gear = this.createGear(position.q, position.r, sizeKey, data.layer, data.isCore, data.angle, data.id);
            gear.isLocked = data.isLocked ?? Boolean(data.isCore);
            gear.designType = data.designType || gear.designType;
            gear.processMode = data.processMode || gear.processMode;
            return gear;
        });
        this.network.rebuild(this.state.placedGears, this.state.belts);
        this.state.updatePowerGrid();
        this.state.saveGameData();
    }

    createGear(q = 0, r = 0, sizeKey, layer = 0, isCore = false, angle = 0, id = null) {
        // サイズ定義から、独立したGearオブジェクトと描画用メタデータを作る。
        const config = GEAR_CONFIG[sizeKey] || GEAR_CONFIG.M;
        const position = hexToPixel(q, r);
        const gear = new Gear({id, size: config.teeth, layer, position: { q, r }, isCore, angle });
        return Object.assign(gear, { x: position.x, y: position.y, sizeKey, radius: config.radius, cost: config.cost, pattern: config.pattern });
    }

    removeGear(gear) {
        // 配置一覧から対象ギアだけを除去し、通常モードでは使用コストの80%を返還する。
        if (!gear || gear.isCore) return false;
        this.state.saveState();
        this.state.placedGears = this.state.placedGears.filter(other => other.id !== gear.id);
        this.state.belts = this.state.belts.filter(belt => !belt.gearIds?.includes(gear.id));
        if (!this.state.creativeMode) this.state.brass += Math.floor(gear.cost * 0.8);
        this.state.updatePowerGrid();
        this.state.saveGameData();
        this.state.notify();
        return true;
    }

    // UIが保持するIDから、現在のギア実体を検索する。
    findGearById(id) { return this.state.placedGears.find(gear => gear.id === id) || null; }
    updateGearSize(gear, sizeKey) {
        // メインギアだけサイズを変更し、歯数・半径・コストを一緒に更新する。
        const config = GEAR_CONFIG[sizeKey];
        if (!gear || !config || !gear.isCore || gear.sizeKey === sizeKey) return false;
        this.state.saveState();
        Object.assign(gear, { size: config.teeth, teeth: config.teeth, sizeKey, radius: config.radius, cost: config.cost, pattern: config.pattern });
        this.state.updatePowerGrid();
        this.state.saveGameData();
        this.state.notify();
        return true;
    }
    setGearLock(gear, locked) {
        // 同じ軸のロック状態と回転状態を調整する。種類・処理設定は変更しない。
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
                other.powered = base.powered;
                other.angleError = false;
                other.isDeadlocked = false;
            });
        } else {
            synced.forEach(other => {
                other.angleError = false;
                other.isDeadlocked = false;
            });
        }
        this.state.updatePowerGrid();
        this.state.saveGameData();
        this.state.notify();
        return true;
    }

    findMeshConnections(x, y, radius, layer) {
        // ゴーストギアの候補から、同じレイヤーで接触範囲に入るギアを探す。
        return this.state.placedGears.filter(gear => gear.layer === layer && Math.hypot(gear.x - x, gear.y - y) <= gear.radius + radius + 2);
    }
    updateGearSettings(gear, settings) {
        // 設定変更の対象は、現在選択されている実体1個だけ。連結先にはコピーしない。
        if (!gear || !this.state.placedGears.includes(gear)) return false;
        if (Object.hasOwn(settings, 'designType')) gear.designType = settings.designType;
        if (Object.hasOwn(settings, 'processMode')) gear.processMode = settings.processMode;
        this.state.saveGameData();
        this.state.notify();
        return true;
    }

    changeGearLayer(gear, layer) {
        if (!gear || !this.state.placedGears.includes(gear) || !Number.isInteger(layer) || layer < 0 || layer > 2 || gear.layer === layer) return false;
        const occupied = this.state.placedGears.some(other => {
            if (other === gear || other.layer !== layer) return false;
            return other.q === gear.q && other.r === gear.r
                || Math.hypot(other.x - gear.x, other.y - gear.y) < other.radius + gear.radius - 4;
        });
        if (occupied) return false;
        this.state.saveState();
        gear.layer = layer;
        this.state.updatePowerGrid();
        this.state.saveGameData();
        this.state.notify();
        return true;
    }

    addBelt(gears) {
        const gearIds = [...new Set((gears || []).filter(Boolean).map(gear => gear.id))];
        if (gearIds.length < 2) return false;
        if (this.state.belts.some(belt => belt.gearIds?.slice().sort().join(':') === gearIds.slice().sort().join(':'))) return false;
        this.state.saveState();
        this.state.belts.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, gearIds });
        this.state.updatePowerGrid();
        this.state.saveGameData();
        this.state.notify();
        return true;
    }

    /**
     * 指定位置に既存ギアの中心があるか判定（中心タップで削除用）
     */
    findGearsAt(x, y) {
        // クリック位置に重なるギアを返す。同軸選択用に層順を保持する。
        return [...this.state.placedGears].filter(gear => {
            if (this.state.visibleLayers && !this.state.visibleLayers[gear.layer]) return false;
            const dx = gear.x - x;
            const dy = gear.y - y;
            return Math.hypot(dx, dy) < Math.max(40, gear.radius);
        }).sort((a, b) => b.layer - a.layer);
    }

    findGearAt(x, y) {
        return this.findGearsAt(x, y)[0];
    }

    /**
     * 重複配置のチェック（同じレイヤーで距離が小さすぎる場合は不可）
     */
    canPlaceAt(x, y, radius, layer) {
        // 同一レイヤーの物理重複を検査し、配置可能かを返す。
        return !this.state.placedGears.some(gear => {
            if (gear.layer !== layer) return false;
            const dx = gear.x - x;
            const dy = gear.y - y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            return dist < gear.radius + radius - 2;
        });
    }

    updateGhost(mouseX, mouseY, pointerOffsetY = 110) {
        // ポインター位置を配置候補へ変換し、軸合わせ・噛み合わせ・接続候補を計算する。
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
        const nearestAxis = allAxes.reduce((best, axis) => {
            const distance = Math.hypot(x - axis.x, y - axis.y);
            return distance < best.distance ? { axis, distance } : best;
        }, { axis: null, distance: Infinity });
        const axisGear = nearestAxis.axis && this.state.placedGears.find(gear => gear.q === nearestAxis.axis.q && gear.r === nearestAxis.axis.r);
        const axisOccupied = axisGear && sameLayer.some(gear => gear.q === nearestAxis.axis.q && gear.r === nearestAxis.axis.r);
        if (axisGear && !axisOccupied && nearestAxis.distance < 70) {
            const axisPosition = hexToPixel(nearestAxis.axis.q, nearestAxis.axis.r);
            const designType = ['INDUSTRIAL', 'ALCHEMICAL', 'CLOCKWORK'][layer] || 'INDUSTRIAL';
            const connections = this.findMeshConnections(axisPosition.x, axisPosition.y, config.radius, layer);
            this.state.ghostGear = {
                ...axisPosition,
                q: nearestAxis.axis.q,
                r: nearestAxis.axis.r,
                layer,
                sizeKey,
                designType,
                radius: config.radius,
                teeth: config.teeth,
                pattern: config.pattern,
                angle: axisGear.angle,
                valid,
                connectionIds: connections.map(gear => gear.id),
                blockedIds: []
            };
            return;
        }
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
        // 旧配置ロジック用のスナップ計算。現在のゴースト配置でも補正の考え方を共有する。
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
        // 選択サイズがあればゴーストを確定配置し、なければクリック位置のギアを撤去する。
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
