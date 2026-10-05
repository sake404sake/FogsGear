import { CELL_MATERIALS } from '../../MapSystem/js/worldCells.js?v=8';

/**
 * UIController - DOM操作、ポインター入力、ギア設定吹き出しを管理する。
 * GameStateの値を読み取り、ユーザー操作だけを各管理モジュールへ渡す。
 */
export class UIController {
    // DOMイベントをGameStateとGearManagerへ橋渡しし、状態を画面へ反映する。
    constructor(state, gearManager, renderer) {
        this.state = state;
        this.gearManager = gearManager;
        this.renderer = renderer;
        this.canvas = renderer.canvas;
        this.activeTouches = new Map();
        this.initialPinchDist = null;
        this.initialZoom = 1;
        this.startX = 0;
        this.startY = 0;
        this.pendingPointer = null;
        this.inputFrame = 0;
        this.pendingZoom = null;
        this.pointerDownGear = null;
        this.pointerDownPoint = null;
        this.longPressTimer = null;
        this.noticeTimer = null;
        this.initEvents();
        this.state.subscribe(() => this.updateUI());
    }

    showNotice(message) {
        const notice = document.getElementById('gear-notice');
        if (!notice) return;
        notice.textContent = message;
        notice.hidden = false;
        clearTimeout(this.noticeTimer);
        this.noticeTimer = setTimeout(() => { notice.hidden = true; }, 2800);
    }

    initEvents() {
        // ボタン、設定セレクト、キャンバス入力を一度だけ登録する。
        document.addEventListener('click', event => {
            const button = event.target.closest('button');
            if (!button) return;
            if (button.dataset.action === 'return-map') {
                if (new URLSearchParams(window.location.search).get('hosted') === '1' && window.parent !== window) {
                    window.parent.postMessage({ type: 'fogsgear:close-editor' }, window.location.origin);
                } else {
                    window.location.href = '../MapSystem/index.html';
                }
            } else if (button.dataset.action === 'toggle-gear-size-popup') {
                const popup = document.getElementById('gear-size-popup');
                const isGearSelected = this.state.selectedItem === 'GEAR' && this.state.selectedSize === null;
                if (this.state.selectedSize === null) {
                    this.state.setSelectedItem(isGearSelected ? 'NONE' : 'GEAR');
                }
                if (popup) {
                    popup.hidden = !popup.hidden;
                    button.setAttribute('aria-expanded', String(!popup.hidden));
                }
            } else if (button.dataset.action === 'close-gear-size-popup') {
                this.closeGearSizePopup();
            } else if (button.dataset.size) {
                this.state.setSelectedSize(this.state.selectedSize === button.dataset.size ? null : button.dataset.size);
                this.state.ghostGear = null;
                this.closeGearPopover();
                this.closeGearSizePopup();
            } else if (button.dataset.visibilityLayer !== undefined) {
                const layer = Number(button.dataset.visibilityLayer);
                this.state.toggleLayerVisibility(layer);
                if (!this.state.visibleLayers[layer]) this.closeGearPopover();
            } else if (button.dataset.visibility === 'belts') {
                this.state.toggleBeltsVisibility();
            } else if (button.dataset.layer !== undefined) {
                this.state.setSelectedLayer(button.dataset.layer);
            } else if (button.dataset.item) {
                this.state.setSelectedItem(this.state.selectedItem === button.dataset.item ? 'NONE' : button.dataset.item);
            } else if (button.dataset.action === 'confirm-belt') {
                const gears = this.state.beltSelection.map(id => this.gearManager.findGearById(id)).filter(Boolean);
                if (this.gearManager.addBelt(gears)) this.state.setBeltSelection([]);
            } else if (button.dataset.action === 'undo') {
                this.state.undo();
            } else if (button.dataset.action === 'redo') {
                this.state.redo();
            } else if (button.dataset.action === 'toggle-loops') {
                this.state.showLoops = !this.state.showLoops;
                this.state.notify();
            } else if (button.dataset.action === 'toggle-dashboard') {
                this.state.dashboardOpen = !this.state.dashboardOpen;
                this.state.notify();
            } else if (button.dataset.action === 'toggle-rate-table') {
                this.state.rateTableOpen = !this.state.rateTableOpen;
                this.state.notify();
            } else if (button.dataset.action === 'toggle-main-gear') {
                this.state.toggleMainGear();
            } else if (button.dataset.action === 'toggle-creative') {
                this.state.setCreativeMode(!this.state.creativeMode);
            } else if (button.dataset.action === 'save-scroll') {
                const input = document.getElementById('named-scroll-name');
                const effectSelect = document.getElementById('scroll-effect-select');
                const name = input ? input.value : '';
                const effectType = effectSelect ? effectSelect.value : 'custom';
                const effectConfig = {
                    boost: effectType === 'steam_boost' ? 20 : undefined,
                    density: effectType === 'fog_stabilize' ? 1 : undefined,
                    sync: effectType === 'gear_sync' ? true : undefined
                };
                const result = this.state.saveNamedScroll(name, null, {
                    type: effectType,
                    label: effectSelect?.selectedOptions?.[0]?.textContent || '未設定',
                    config: Object.fromEntries(Object.entries(effectConfig).filter(([, value]) => value !== undefined))
                });
                if (result) {
                    if (input) input.value = '';
                    if (effectSelect) effectSelect.value = 'custom';
                    try {
                        window.dispatchEvent(new StorageEvent('storage', { key: 'fogsgear_scroll_library', newValue: localStorage.getItem('fogsgear_scroll_library') }));
                    } catch (error) {}
                    this.showNotice(`「${result.name}」として保存しました。`);
                } else {
                    this.showNotice('保存名を入力してください。');
                }
            } else if (button.dataset.action === 'reset') {
                const modal = document.getElementById('reset-confirm-modal');
                if (modal) modal.hidden = false;
            } else if (button.dataset.action === 'cancel-reset') {
                const modal = document.getElementById('reset-confirm-modal');
                if (modal) modal.hidden = true;
            } else if (button.dataset.action === 'confirm-reset') {
                const modal = document.getElementById('reset-confirm-modal');
                if (modal) modal.hidden = true;
                this.state.reset();
            } else if (button.dataset.action === 'delete-gear') {
                const gear = this.gearManager.findGearById(this.state.selectedGearId);
                if (gear && this.gearManager.removeGear(gear)) this.closeGearPopover();
            }
        });

        document.getElementById('gear-size-popup')?.addEventListener('click', event => {
            if (event.target.id === 'gear-size-popup') this.closeGearSizePopup();
        });
        document.getElementById('reset-confirm-modal')?.addEventListener('click', event => {
            if (event.target.id === 'reset-confirm-modal') event.currentTarget.hidden = true;
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                this.closeGearSizePopup();
                const modal = document.getElementById('reset-confirm-modal');
                if (modal) modal.hidden = true;
            }
        });

        document.getElementById('gear-lock-toggle').addEventListener('change', event => { const gear = this.gearManager.findGearById(this.state.selectedGearId); if (gear) this.gearManager.setGearLock(gear, event.target.checked); });
        document.getElementById('main-gear-size-select').addEventListener('change', event => {
            const gear = this.gearManager.findGearById(this.state.selectedGearId);
            if (gear && this.gearManager.updateGearSize(gear, event.target.value)) this.openGearPopover(gear);
        });
        document.getElementById('gear-design-select').addEventListener('change', event => {
            // 種類を変えると、その種類で利用できる処理の先頭を選択する。
            const processMode = this.updateProcessOptions(event.target.value);
            this.updateSelectedGear({ designType: event.target.value, processMode });
            this.updateTerrainTargetRow({ processMode, terrainTargetType: document.getElementById('gear-terrain-target-select')?.value });
            this.updateControlConfig(this.gearManager.findGearById(this.state.selectedGearId));
        });
        document.getElementById('gear-process-select').addEventListener('change', event => {
            const gear = this.gearManager.findGearById(this.state.selectedGearId);
            this.updateSelectedGear({ processMode: event.target.value });
            this.updateTerrainTargetRow({ ...gear, processMode: event.target.value });
            this.updateControlConfig(gear ? { ...gear, processMode: event.target.value } : null);
        });
        document.getElementById('gear-terrain-target-select')?.addEventListener('change', event => this.updateSelectedGear({ terrainTargetType: event.target.value }));
        document.getElementById('gear-control-action')?.addEventListener('change', event => {
            this.updateControlSetting('controlAction', event.target.value);
            this.updateControlConfig(this.gearManager.findGearById(this.state.selectedGearId));
        });
        document.getElementById('gear-control-condition')?.addEventListener('change', event => {
            this.updateControlSetting('controlCondition', event.target.value);
            this.updateControlConfig(this.gearManager.findGearById(this.state.selectedGearId));
        });
        document.getElementById('gear-control-rotation-count')?.addEventListener('change', event => this.updateControlSetting('controlRotationCount', event.target.value));
        document.getElementById('gear-control-item-type')?.addEventListener('change', event => this.updateControlSetting('controlItemType', event.target.value));
        document.getElementById('gear-control-item-count')?.addEventListener('change', event => this.updateControlSetting('controlItemCount', event.target.value));
        document.querySelectorAll('.gear-number-step').forEach(button => {
            button.addEventListener('click', () => {
                const input = document.getElementById(button.dataset.numberTarget);
                if (!input) return;
                const minimum = Number(input.min) || 1;
                const step = Number(input.step) || 1;
                const current = Math.max(minimum, Number(input.value) || minimum);
                input.value = String(Math.max(minimum, current + Number(button.dataset.step) * step));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            });
        });
        document.getElementById('gear-control-targets')?.addEventListener('change', () => {
            const targetGearIds = [...document.querySelectorAll('#gear-control-targets input:checked')].map(input => input.value);
            this.updateSelectedGear({ controlTargetGearIds: targetGearIds });
        });
        document.getElementById('gear-layer-select').addEventListener('change', event => {
            const gear = this.gearManager.findGearById(this.state.selectedGearId);
            if (!gear) return;
            if (!this.gearManager.changeGearLayer(gear, Number(event.target.value))) this.openGearPopover(gear);
        });
        document.getElementById('gear-cycle-button')?.addEventListener('click', () => {
            const gear = this.gearManager.findGearById(this.state.selectedGearId);
            if (!gear) return;
            const axisGears = this.getAxisGears(gear);
            const index = axisGears.findIndex(item => item.id === gear.id);
            this.openGearPopover(axisGears[(index + 1) % axisGears.length]);
        });
        document.getElementById('belt-add-button')?.addEventListener('click', () => {
            const gear = this.gearManager.findGearById(this.state.selectedGearId);
            if (!gear || this.state.selectedItem !== 'BELT' || this.state.beltSelection.includes(gear.id)) return;
            this.state.setBeltSelection([...this.state.beltSelection, gear.id]);
            this.closeGearPopover();
        });
        document.getElementById('gear-popover-close').addEventListener('click', () => this.closeGearPopover());
        document.getElementById('gear-modal').addEventListener('click', event => {
            if (event.target.id === 'gear-modal') this.closeGearPopover();
        });

        // キャンバス外を押したときは配置候補と吹き出しを閉じる。
        document.addEventListener('pointerdown', event => {
            if (!this.canvas.contains(event.target) && !event.target.closest('.panel') && !event.target.closest('.gear-popover') && !event.target.closest('#belt-confirm-button')) {
                this.state.setSelectedSize(null);
                this.state.ghostGear = null;
                this.closeGearPopover();
            }
        });
        this.canvas.addEventListener('pointerdown', event => this.pointerDown(event));
        this.canvas.addEventListener('pointermove', event => this.pointerMove(event));
        this.canvas.addEventListener('pointerleave', () => { this.state.hoveredGearIds = []; this.cancelLongPress(); });
        this.canvas.addEventListener('pointerup', event => this.pointerUp(event));
        this.canvas.addEventListener('contextmenu', event => {
            event.preventDefault();
            if (this.state.selectedItem === 'BELT') {
                this.state.setSelectedItem('NONE');
                return;
            }
            this.state.setSelectedSize(null);
            this.state.ghostGear = null;
            this.closeGearPopover();
        });
        this.canvas.addEventListener('pointercancel', event => {
            this.cancelLongPress();
            this.activeTouches.delete(event.pointerId);
            this.initialPinchDist = null;
            this.pointerDownGear = null;
            this.pointerDownPoint = null;
            this.state.ghostGear = null;
        });
        this.canvas.addEventListener('wheel', event => {
            const point = this.renderer.worldPoint(event.clientX, event.clientY);
            const stackedGears = this.getStackedGearsAt(point.x, point.y);
            if (stackedGears.length > 1) {
                event.preventDefault();
                const direction = event.deltaY > 0 ? 1 : -1;
                const currentIndex = stackedGears.findIndex(gear => gear.id === this.state.selectedGearId);
                const nextIndex = (currentIndex + direction + stackedGears.length) % stackedGears.length;
                const nextGear = stackedGears[nextIndex];
                this.state.selectedGearId = nextGear.id;
                this.state.hoveredGearIds = [nextGear.id];
                if (this.state.selectedItem === 'BELT') this.openGearPopover(nextGear);
                return;
            }
            event.preventDefault();
            const zoom = this.pendingZoom ?? this.state.zoomScale;
            this.pendingZoom = Math.max(0.4, Math.min(2.5, zoom * Math.exp(-event.deltaY * 0.0015)));
            this.scheduleInputFrame();
        }, { passive: false });
    }

    // 高頻度のポインターイベントを1フレームにまとめ、ズーム・パン更新を安定させる。
    scheduleInputFrame() { if (this.inputFrame) return; this.inputFrame = requestAnimationFrame(() => { this.inputFrame = 0; if (this.pendingZoom !== null) { this.state.zoomScale = this.pendingZoom; this.pendingZoom = null; } if (this.pendingPointer) { const event = this.pendingPointer; this.pendingPointer = null; this.applyPointerMove(event); } }); }

    pointerDown(event) {
        // ギアを押した場合は編集対象を確定し、それ以外はパン・ピンチ・配置操作を開始する。
        if (event.button === 2) return;
        const point = this.renderer.worldPoint(event.clientX, event.clientY);
        if (this.state.selectedItem === 'BELT') {
            const gear = this.selectGearAt(point.x, point.y);
            if (gear && this.isTouchPointer(event)) {
                this.pointerDownGear = gear;
                this.startLongPress(gear, event);
                this.canvas.setPointerCapture(event.pointerId);
            }
            else if (gear) this.openGearPopover(gear);
            return;
        }
        this.pointerDownGear = this.state.selectedSize ? null : this.selectGearAt(point.x, point.y);
        if (this.pointerDownGear) {
            this.pointerDownPoint = { x: event.clientX, y: event.clientY };
            if (this.isTouchPointer(event)) this.startLongPress(this.pointerDownGear, event);
            this.state.ghostGear = null;
            this.canvas.setPointerCapture(event.pointerId);
            return;
        }
        this.closeGearPopover();
        this.activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (this.activeTouches.size === 1) {
            this.startX = event.clientX;
            this.startY = event.clientY;
            this.initialPinchDist = null;
        } else if (this.activeTouches.size === 2 && !this.state.selectedSize) {
            const touches = [...this.activeTouches.values()];
            this.initialPinchDist = Math.hypot(touches[0].x - touches[1].x, touches[0].y - touches[1].y);
            this.initialZoom = this.state.zoomScale;
        }
        this.canvas.setPointerCapture(event.pointerId);
        if (this.state.selectedSize) {
            const point = this.renderer.canvasPoint(event.clientX, event.clientY);
            this.gearManager.updateGhost(point.x, point.y, this.pointerOffset(event));
        }
    }

    pointerMove(event) {
        // 押下中のタッチ位置を更新し、実際の移動処理を次フレームへ送る。
        if (event.buttons === 2 || event.button === 2) return;
        if (this.longPressTimer && event.pointerId === this.longPressPointerId
            && Math.hypot(event.clientX - this.longPressPoint.x, event.clientY - this.longPressPoint.y) > 8) {
            this.cancelLongPress();
        }
        if (this.pointerDownGear && this.pointerDownPoint
            && Math.hypot(event.clientX - this.pointerDownPoint.x, event.clientY - this.pointerDownPoint.y) > 8) {
            this.cancelLongPress();
            this.pointerDownGear = null;
            this.pointerDownPoint = null;
            this.activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
            this.startX = event.clientX;
            this.startY = event.clientY;
        }
        if (this.activeTouches.has(event.pointerId)) this.activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const point = this.renderer.worldPoint(event.clientX, event.clientY);
        const hovered = this.getStackedGearsAt(point.x, point.y);
        const selected = hovered.find(gear => gear.id === this.state.selectedGearId) || hovered[0];
        this.state.hoveredGearIds = selected ? [selected.id] : [];
        this.pendingPointer = event;
        this.scheduleInputFrame();
    }


    applyPointerMove(event) {
        // サイズ選択中はゴーストを更新し、通常時は1本指パンまたは2本指ズームを行う。
        if (this.state.selectedSize) {
            const point = this.renderer.canvasPoint(event.clientX, event.clientY);
            this.gearManager.updateGhost(point.x, point.y, this.pointerOffset(event));
            return;
        }
        if (this.activeTouches.size === 2 && this.initialPinchDist) {
            const touches = [...this.activeTouches.values()];
            const distance = Math.hypot(touches[0].x - touches[1].x, touches[0].y - touches[1].y);
            this.state.zoomScale = Math.max(0.4, Math.min(2.5, this.initialZoom * distance / this.initialPinchDist));
            return;
        }
        if (this.activeTouches.size === 1) {
            this.state.offsetX += (event.clientX - this.startX) / this.state.zoomScale;
            this.state.offsetY += (event.clientY - this.startY) / this.state.zoomScale;
            this.startX = event.clientX;
            this.startY = event.clientY;
        }
    }

    pointerUp(event) {
        // ギア編集、配置確定、または通常の盤面操作を終了する。
        if (event.button === 2) return;
        if (this.state.selectedItem === 'BELT') {
            if (this.pointerDownGear && this.isTouchPointer(event)) this.openGearPopover(this.pointerDownGear);
            this.cancelLongPress();
            this.pointerDownGear = null;
            return;
        }
        if (this.pointerDownGear) {
            if (!this.isTouchPointer(event)) this.openGearPopover(this.pointerDownGear);
            this.cancelLongPress();
            this.pointerDownGear = null;
            this.pointerDownPoint = null;
            return;
        }
        this.activeTouches.delete(event.pointerId);
        if (this.activeTouches.size < 2) this.initialPinchDist = null;
        if (this.activeTouches.size !== 0) return;
        const point = this.adjustedWorldPoint(event);
        const existingGear = this.state.selectedSize ? null : this.gearManager.findGearAt(point.x, point.y);
        if (existingGear) {
            this.openGearPopover(existingGear);
            return;
        }
        if (this.state.selectedSize) {
            const canvasPoint = this.renderer.canvasPoint(event.clientX, event.clientY);
            this.gearManager.updateGhost(canvasPoint.x, canvasPoint.y, this.pointerOffset(event));
            this.gearManager.tryPlaceGear(point.x, point.y);
        } else {
            this.gearManager.tryPlaceGear(point.x, point.y);
        }
        this.state.ghostGear = null;
    }

    selectGearAt(x, y) {
        // 横に並んだギアはクリック位置に最も近いものだけを選ぶ。
        // 同じ座標に重なった同軸ギアだけは、クリックごとに循環選択する。
        const stackedGears = this.getStackedGearsAt(x, y);
        if (stackedGears.length === 0) return null;
        const currentIndex = stackedGears.findIndex(gear => gear.id === this.state.selectedGearId);
        return stackedGears[currentIndex >= 0 ? (currentIndex + 1) % stackedGears.length : 0];
    }

    getStackedGearsAt(x, y) {
        const gears = this.gearManager.findGearsAt(x, y);
        if (gears.length === 0) return [];
        const nearestDistance = Math.min(...gears.map(gear => Math.hypot(gear.x - x, gear.y - y)));
        return gears.filter(gear => Math.abs(Math.hypot(gear.x - x, gear.y - y) - nearestDistance) < 1);
    }

    getAxisGears(gear) {
        return this.state.placedGears
            .filter(other => other.q === gear.q && other.r === gear.r && (this.state.visibleLayers?.[other.layer] ?? true))
            .sort((first, second) => first.layer - second.layer);
    }

    getProcessOptions(designType) {
        // ギア種類ごとに選べる処理モードを返す。新しい処理はここへ追加する。
        if (designType === 'INDUSTRIAL') return [['NONE', '処理なし'], ['POWER_STORAGE', '動力を蓄積']];
        if (designType === 'PRODUCTION') return [['NONE', '処理なし'], ['FOG_COLLECTION', '霧の回収'], ['RESOURCE_COLLECTION', '資材収集']];
        if (designType === 'ALCHEMICAL') return [['NONE', '処理なし'], ['TRANSFORM', '水→スチーム'], ['FOG_TO_WATER', '霧→水'], ['TERRAIN_TRANSFORM', '地形変成'], ['ERA_SHIFT', '時代変質']];
        if (designType === 'CLOCKWORK') return [['NONE', '処理なし'], ['TARGET_SHIFT_UP', '対象セルを上へシフト'], ['TARGET_SHIFT_DOWN', '対象セルを下へシフト'], ['TARGET_SHIFT_LEFT', '対象セルを左へシフト'], ['TARGET_SHIFT_RIGHT', '対象セルを右へシフト'], ['CONDITIONAL_CONTROL', '条件制御']];
        return [['NONE', '処理なし']];
    }
    updateProcessOptions(designType, selectedMode = null) {
        // 処理セレクトを種類に合わせて再生成し、選択値を決定する。
        const select = document.getElementById('gear-process-select');
        const options = this.getProcessOptions(designType);
        select.replaceChildren(...options.map(([value, label]) => new Option(label, value)));
        const mode = options.some(([value]) => value === selectedMode) ? selectedMode : options[0][0];
        select.value = mode;
        return mode;
    }
    updateTerrainTargetRow(gear) {
        const row = document.getElementById('gear-terrain-target-row');
        const select = document.getElementById('gear-terrain-target-select');
        if (!row || !select) return;
        const visible = Boolean(gear && gear.processMode === 'TERRAIN_TRANSFORM');
        row.hidden = !visible;
        row.style.display = visible ? '' : 'none';
        if (visible) {
            select.value = [...select.options].some(option => option.value === gear.terrainTargetType)
                ? gear.terrainTargetType
                : 'IRON_VEIN';
        }
    }
    updateControlConfig(gear) {
        const panel = document.getElementById('gear-control-config');
        const targetList = document.getElementById('gear-control-targets');
        const conditionSelect = document.getElementById('gear-control-condition');
        const itemSelect = document.getElementById('gear-control-item-type');
        if (!panel || !targetList || !conditionSelect || !itemSelect) return;
        const visible = Boolean(gear && gear.processMode === 'CONDITIONAL_CONTROL');
        panel.hidden = !visible;
        if (!visible) return;

        document.getElementById('gear-control-action').value = gear.controlAction || 'STOP_MAIN_GEAR';
        conditionSelect.value = gear.controlCondition || 'ROTATIONS';
        document.getElementById('gear-control-rotation-count').value = String(Math.max(1, Number(gear.controlRotationCount) || 1));
        document.getElementById('gear-control-item-count').value = String(Math.max(1, Number(gear.controlItemCount) || 1));
        if (!itemSelect.options.length) {
            const controlItems = [
                ...Object.entries(CELL_MATERIALS),
                ['fog', { label: '霧' }],
                ['power', { label: '動力' }],
                ['brass', { label: '真鍮資材' }],
                ['steam_power', { label: 'スチーム' }]
            ];
            itemSelect.replaceChildren(...controlItems.map(([id, item]) => new Option(item.label, id)));
        }
        const selectedItemType = [...itemSelect.options].some(option => option.value === gear.controlItemType)
            ? gear.controlItemType
            : 'wood';
        if (itemSelect.value !== selectedItemType) itemSelect.value = selectedItemType;
        const targetGearIds = new Set(Array.isArray(gear.controlTargetGearIds) ? gear.controlTargetGearIds : []);
        const actionNeedsTargets = ['SYNC_AXIS', 'UNSYNC_AXIS', 'TOGGLE_SYNC_AXIS'].includes(gear.controlAction);
        document.getElementById('gear-control-target-fieldset').hidden = !actionNeedsTargets;
        const targets = this.state.placedGears.filter(target => !target.isCore && target.id !== gear.id && target.q === gear.q && target.r === gear.r);
        const targetSignature = JSON.stringify(targets.map(target => target.id));
        if (targetList.dataset.targetSignature !== targetSignature) {
            targetList.dataset.targetSignature = targetSignature;
            targetList.replaceChildren();
            if (!targets.length) {
                const empty = document.createElement('span');
                empty.className = 'control-target-empty';
                empty.textContent = '同軸操作するギアを先に配置してください。';
                targetList.appendChild(empty);
            }
            targets.forEach(target => {
                const label = document.createElement('label');
                label.className = 'control-target-option';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = target.id;
                const name = document.createElement('span');
                name.textContent = `${target.sizeKey} / ${target.layer + 1}段目 / (${target.q}, ${target.r})`;
                label.append(checkbox, name);
                targetList.appendChild(label);
            });
        }
        targetList.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = targetGearIds.has(checkbox.value);
        });
        const usesItemCount = conditionSelect.value === 'ITEM_COUNT' || conditionSelect.value === 'ITEM_COUNT_BELOW';
        document.getElementById('gear-control-rotation-row').hidden = usesItemCount;
        document.getElementById('gear-control-item-fields').hidden = !usesItemCount;
    }
    // 選択ギアの設定、コスト、同期状態を吹き出しへまとめて表示する。
    openGearPopover(gear) { this.state.selectedGearId = gear.id; this.updateProcessInfo(gear); document.getElementById('gear-modal').hidden = false; document.getElementById('gear-popover-title').textContent = gear.isCore ? 'メインギア' : `${gear.sizeKey} ギア設定`; document.getElementById('gear-popover-meta').textContent = gear.isCore ? `L${gear.layer + 1} / ${gear.teeth}歯` : `L${gear.layer + 1} / ${gear.teeth}歯 / ${gear.designType} / ${gear.processMode}`; const friction = Math.round(this.state.network?.calculateGearFriction(gear) || 0); const driveCost = Math.round(gear.steamLoad); const steamCost = driveCost + friction; const rotation = Math.round(Math.abs(gear.angularVelocity || 0)); const loopBonus = this.state.network?.loopGearIds?.has(gear.id) ? '環機構ボーナス' : ''; document.getElementById('gear-popover-cost').innerHTML = gear.isCore ? '<div class="cost-note">メインギア<br>現在コストの集計対象外</div>' : `<div class="resource-block brass-block"><div class="resource-heading">真鍮資材 <strong>${Math.round(gear.brassCost)}</strong></div></div><div class="resource-divider"></div><div class="resource-block steam-block"><div class="cost-row"><span>駆動コスト</span><strong>${driveCost}</strong></div><div class="cost-row"><span>摩擦コスト</span><strong>${friction}</strong></div>${loopBonus ? `<div class="bonus-row">(${loopBonus})</div>` : ''}</div><div class="resource-divider strong"></div><div class="cost-row steam-total"><span>消費スチーム / 回転</span><strong>${steamCost} / ${rotation}</strong></div>`; document.getElementById('gear-lock-toggle').checked = gear.isLocked; document.getElementById('main-gear-size-select').value = gear.sizeKey; document.getElementById('gear-design-select').value = gear.designType; this.updateProcessOptions(gear.designType, gear.processMode); document.getElementById('main-gear-size-row').classList.toggle('main-gear-hidden', !gear.isCore); document.getElementById('gear-design-row').classList.toggle('main-gear-hidden', gear.isCore); document.getElementById('gear-process-row').classList.toggle('main-gear-hidden', gear.isCore); document.getElementById('gear-delete-button').disabled = gear.isCore; }
    updateProcessInfo(gear) {
        // 選択ギアの処理定義を毎秒レートへ変換し、処理能力枠を更新する。
        const section = document.getElementById('gear-process-section');
        this.updateControlConfig(gear);
        if (!section || !gear || gear.isCore) {
            if (section) section.hidden = true;
            this.updateTerrainTargetRow(null);
            return;
        }
        this.updateTerrainTargetRow(gear);
        const info = this.state.getGearProcessInfo(gear);
        const isConditionalControl = gear.processMode === 'CONDITIONAL_CONTROL';
        section.hidden = gear.processMode === 'NONE';
        document.getElementById('gear-process-info-name').textContent = info.name;
        document.getElementById('gear-process-info-input').textContent = isConditionalControl
            ? info.input
            : info.input === '-'
            ? '-'
            : `${info.input} ${info.inputRate.toFixed(2)} /秒`;
        document.getElementById('gear-process-info-output').textContent = isConditionalControl
            ? info.output
            : info.output === '-'
            ? '-'
            : `${info.output} ${info.outputRate.toFixed(2)} /秒`;
        queueMicrotask(() => {
            if (this.state.selectedGearId !== gear.id) return;
            const layerLabel = `${gear.layer + 1}段目 (${['金', '銀', '銅'][gear.layer]})`;
            document.getElementById('gear-popover-meta').textContent = gear.isCore
                ? `${layerLabel} / ${gear.teeth}歯`
                : `${layerLabel} / ${gear.teeth}歯 / ${gear.designType} / ${gear.processMode}`;
            document.getElementById('gear-popover-id').textContent = `ID: ${gear.id}`;
            const cycleButton = document.getElementById('gear-cycle-button');
            if (cycleButton) cycleButton.hidden = this.getAxisGears(gear).length < 2;
            this.updateBeltMarker(gear);
        });
    }

    updateBeltMarker(gear) {
        const title = document.getElementById('gear-popover-title');
        if (!title) return;
        const baseTitle = gear.isCore ? 'メインギア' : `${gear.sizeKey} ギア設定`;
        const beltLinked = this.state.belts.some(belt => belt.gearIds?.includes(gear.id));
        title.textContent = `${baseTitle}${beltLinked ? '  🔗' : ''}`;
    }
    updateControlSetting(key, value) {
        const gear = this.gearManager.findGearById(this.state.selectedGearId);
        if (!gear) return;
        this.updateSelectedGear({ [key]: value });
        this.updateProcessInfo(gear);
    }
    updateSelectedGear(settings) { const gear = this.gearManager.findGearById(this.state.selectedGearId); if (gear) this.gearManager.updateGearSettings(gear, settings); }
    closeGearSizePopup() {
        const popup = document.getElementById('gear-size-popup');
        const toggle = document.querySelector('[data-action="toggle-gear-size-popup"]');
        if (popup) popup.hidden = true;
        toggle?.setAttribute('aria-expanded', 'false');
    }
    closeGearPopover() {
        // 選択ギアとモーダル表示を解除する。
        this.state.selectedGearId = null;
        this.state.ghostGear = null;
        const modal = document.getElementById('gear-modal');
        if (modal) modal.hidden = true;
    }

    pointerOffset(event) {
        // タッチ操作だけ、指でギアの中心が隠れないよう上方向へ少し補正する。
        return event.pointerType === 'mouse' ? 0 : 110;
    }

    adjustedWorldPoint(event) {
        const point = this.renderer.worldPoint(event.clientX, event.clientY);
        if (!this.isTouchPointer(event)) return point;
        const offset = this.pointerOffset(event);
        const canvasPoint = this.renderer.canvasPoint(event.clientX, event.clientY);
        const adjustedCanvasY = canvasPoint.y - offset;
        return {
            x: (canvasPoint.x - this.canvas.width / 2) / this.state.zoomScale - this.state.offsetX,
            y: (adjustedCanvasY - this.canvas.height / 2) / this.state.zoomScale - this.state.offsetY
        };
    }

    isTouchPointer(event) { return event.pointerType === 'touch' || event.pointerType === 'pen'; }
    startLongPress(gear, event) {
        this.cancelLongPress();
        this.longPressTimer = setTimeout(() => {
            this.longPressTimer = null;
            this.openGearPopover(gear);
        }, 550);
        this.longPressPointerId = event.pointerId;
        this.longPressPoint = { x: event.clientX, y: event.clientY };
    }
    cancelLongPress() {
        if (this.longPressTimer) clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
        this.longPressPointerId = null;
        this.longPressPoint = null;
    }

    updateUI() {
        // 資源値、ダッシュボード、ボタン状態、開閉パネルを現在のGameStateへ同期する。
        const steam = document.getElementById('steamPower');
        const brass = document.getElementById('brass');
        const costs = this.state.getCurrentCosts();
            const scrollNameInput = document.getElementById('named-scroll-name');
            const scrollEffectSelect = document.getElementById('scroll-effect-select');
            const editId = new URLSearchParams(window.location.search).get('editScroll');
            const scrollId = this.state.currentScrollId || editId;
            if (scrollId && scrollNameInput && !scrollNameInput.value) {
                const scroll = this.state.getNamedScrollLibrary().find(item => item.id === scrollId);
                if (scroll) {
                    scrollNameInput.value = scroll.name || '';
                    if (scrollEffectSelect && scroll.effect?.type) scrollEffectSelect.value = scroll.effect.type;
                }
            }
        if (steam) steam.textContent = Math.floor(this.state.steamPower);
        if (brass) brass.textContent = this.state.creativeMode ? 'MAX' : Math.floor(this.state.brass);
        const waterStatus = document.getElementById('water');
        if (waterStatus) waterStatus.textContent = Math.floor(this.state.water || 0);
        const brassCost = document.getElementById('currentBrassCost'); const steamCost = document.getElementById('currentSteamCost');
        if (brassCost) brassCost.textContent = costs.brass;
        if (steamCost) steamCost.textContent = costs.steam;
        const dashboardValues = {
            dashboardWater: this.state.water,
            waterGenerationRate: this.state.waterGenerationRate,
            waterConsumptionRate: this.state.waterConsumptionRate,
            dashboardFog: this.state.fog,
            fogGenerationRate: this.state.fogRecoveryRate,
            fogConsumptionRate: this.state.fogConsumptionRate,
            dashboardPower: this.state.power,
            powerGenerationRate: this.state.powerGenerationRate,
            powerConsumptionRate: this.state.powerConsumptionRate,
            dashboardSteamPower: this.state.steamPower,
            steamGenerationRate: this.state.steamGenerationRate,
            steamConsumptionRate: this.state.steamConsumptionRate
        };
        const formatCompact = value => {
            const number = Number(value) || 0;
            const absolute = Math.abs(number);
            const units = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
            const unit = units.find(([threshold]) => absolute >= threshold);
            if (!unit) return number.toFixed(2);
            const [threshold, suffix] = unit;
            return `${(number / threshold).toFixed(2).replace(/\.00$/, '').replace(/(\.[0-9])0$/, '$1')}${suffix}`;
        };
        const integerDashboardIds = new Set(['dashboardSteamPower']);
        Object.entries(dashboardValues).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (!element) return;
            const displayValue = formatCompact(id.startsWith('dashboard') && integerDashboardIds.has(id)
                ? Math.floor(value || 0)
                : value);
            element.textContent = displayValue + (id.startsWith('dashboard') ? '' : ' /秒');
        });
        const generationRates = {
            water: this.state.waterGenerationRate,
            fog: this.state.fogRecoveryRate,
            power: this.state.powerGenerationRate,
            steam: this.state.steamGenerationRate
        };
        document.querySelectorAll('[data-generated-resource]').forEach(row => {
            row.hidden = !(Number(generationRates[row.dataset.generatedResource]) > 0);
        });
        const selectedGear = this.gearManager.findGearById(this.state.selectedGearId);
        if (selectedGear) {
            this.updateProcessInfo(selectedGear);
            this.updateBeltMarker(selectedGear);
            const layerSelect = document.getElementById('gear-layer-select');
            if (layerSelect) layerSelect.value = String(selectedGear.layer);
        }
        const beltAddButton = document.getElementById('belt-add-button');
        if (beltAddButton) beltAddButton.hidden = this.state.selectedItem !== 'BELT';
        document.querySelectorAll('.btn-item').forEach(button => {
            const item = button.dataset.item;
            const isBeltsActive = item === 'BELT' && this.state.selectedItem === 'BELT';
            const isGearActive = item === 'GEAR' && (this.state.selectedItem === 'GEAR' || this.state.selectedSize !== null);
            button.classList.toggle('active', isBeltsActive || isGearActive);
            button.setAttribute('aria-pressed', String(isBeltsActive || isGearActive));
        });
        const beltConfirm = document.getElementById('belt-confirm-button');
        if (beltConfirm) beltConfirm.hidden = this.state.selectedItem !== 'BELT' || this.state.beltSelection.length < 2;
        const creativeIndicator = document.getElementById('creative-mode-indicator');
        if (creativeIndicator) creativeIndicator.hidden = !this.state.creativeMode;
        document.querySelectorAll('.btn-size').forEach(button => button.classList.toggle('active', button.dataset.size === this.state.selectedSize));
        document.querySelectorAll('.btn-layer').forEach(button => button.classList.toggle('active', Number(button.dataset.layer) === this.state.selectedLayer));
        document.getElementById('btn-undo').disabled = this.state.undoStack.length === 0;
        document.getElementById('btn-redo').disabled = this.state.redoStack.length === 0;
        const loopButton = document.querySelector('[data-action="toggle-loops"]');
        if (loopButton) {
            loopButton.classList.toggle('active', this.state.showLoops);
            loopButton.setAttribute('aria-pressed', String(this.state.showLoops));
        }
        document.querySelectorAll('[data-visibility-layer]').forEach(button => {
            const layer = Number(button.dataset.visibilityLayer);
            const visible = this.state.visibleLayers[layer];
            button.classList.toggle('active', visible);
            button.setAttribute('aria-pressed', String(visible));
        });
        const beltVisibilityButton = document.querySelector('[data-visibility="belts"]');
        if (beltVisibilityButton) {
            beltVisibilityButton.classList.toggle('active', this.state.showBelts);
            beltVisibilityButton.setAttribute('aria-pressed', String(this.state.showBelts));
        }
        const mainGearButton = document.querySelector('[data-action="toggle-main-gear"]');
        if (mainGearButton) {
            mainGearButton.textContent = `メインギア: ${this.state.mainGearRunning ? '起動中' : '停止中'}`;
            mainGearButton.classList.toggle('active', this.state.mainGearRunning);
            mainGearButton.setAttribute('aria-pressed', String(this.state.mainGearRunning));
        }
        const creativeButton = document.querySelector('[data-action="toggle-creative"]');
        if (creativeButton) {
            creativeButton.textContent = `テストモード: ${this.state.creativeMode ? 'ON' : 'OFF'}`;
            creativeButton.classList.toggle('active', this.state.creativeMode);
            creativeButton.setAttribute('aria-pressed', String(this.state.creativeMode));
        }
        const dashboard = document.querySelector('.dashboard');
        const dashboardToggle = document.querySelector('[data-action="toggle-dashboard"]');
        if (dashboard && dashboardToggle) {
            dashboard.hidden = !this.state.dashboardOpen;
            dashboardToggle.setAttribute('aria-expanded', String(this.state.dashboardOpen));
            dashboardToggle.querySelector('span').textContent = this.state.dashboardOpen ? '−' : '+';
        }
        const rateTable = document.querySelector('.rate-table-panel');
        const rateTableToggle = document.querySelector('[data-action="toggle-rate-table"]');
        if (rateTable && rateTableToggle) {
            rateTable.hidden = !this.state.rateTableOpen;
            rateTableToggle.setAttribute('aria-expanded', String(this.state.rateTableOpen));
            rateTableToggle.querySelector('span').textContent = this.state.rateTableOpen ? '−' : '+';
        }
    }
}
