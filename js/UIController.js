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
        this.initEvents();
        this.state.subscribe(() => this.updateUI());
    }

    initEvents() {
        // ボタン、設定セレクト、キャンバス入力を一度だけ登録する。
        document.addEventListener('click', event => {
            const button = event.target.closest('button');
            if (!button) return;
            if (button.dataset.size) {
                this.state.setSelectedSize(this.state.selectedSize === button.dataset.size ? null : button.dataset.size);
                this.state.ghostGear = null;
                this.closeGearPopover();
            } else if (button.dataset.layer !== undefined) {
                this.state.setSelectedLayer(button.dataset.layer);
            } else if (button.dataset.item) {
                this.state.setSelectedItem(this.state.selectedItem === button.dataset.item ? 'NONE' : button.dataset.item);
            } else if (button.dataset.action === 'confirm-belt') {
                const gears = this.state.beltSelection.map(id => this.gearManager.findGearById(id)).filter(Boolean);
                if (this.gearManager.addBelt(gears)) this.state.setBeltSelection([]);
            } else if (button.dataset.action === 'toggle-creative') {
                this.state.setCreativeMode(!this.state.creativeMode);
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
            } else if (button.dataset.action === 'reset' && confirm('盤面のギアと資材を初期状態にリセットしますか？')) {
                this.state.reset();
            } else if (button.dataset.action === 'delete-gear') {
                const gear = this.gearManager.findGearById(this.state.selectedGearId);
                if (gear && this.gearManager.removeGear(gear)) this.closeGearPopover();
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
        });
        document.getElementById('gear-process-select').addEventListener('change', event => this.updateSelectedGear({ processMode: event.target.value }));
        document.getElementById('axis-layer-select').addEventListener('change', event => {
            // 同じ軸にある別レイヤーを、IDで直接選択し直す。
            const gear = this.gearManager.findGearById(event.target.value);
            if (gear) this.openGearPopover(gear);
        });
        document.getElementById('gear-popover-close').addEventListener('click', () => this.closeGearPopover());
        document.getElementById('gear-modal').addEventListener('click', event => {
            if (event.target.id === 'gear-modal') this.closeGearPopover();
        });

        // キャンバス外を押したときは配置候補と吹き出しを閉じる。
        document.addEventListener('pointerdown', event => {
            if (!this.canvas.contains(event.target) && !event.target.closest('.panel') && !event.target.closest('.gear-popover')) {
                this.state.setSelectedSize(null);
                this.state.ghostGear = null;
                this.closeGearPopover();
            }
        });
        this.canvas.addEventListener('pointerdown', event => this.pointerDown(event));
        this.canvas.addEventListener('pointermove', event => this.pointerMove(event));
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
            this.activeTouches.delete(event.pointerId);
            this.initialPinchDist = null;
            this.state.ghostGear = null;
        });
        this.canvas.addEventListener('wheel', event => {
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
            if (gear && !this.state.beltSelection.includes(gear.id)) this.state.setBeltSelection([...this.state.beltSelection, gear.id]);
            return;
        }
        this.pointerDownGear = this.state.selectedSize ? null : this.selectGearAt(point.x, point.y);
        if (this.pointerDownGear) {
            this.updateAxisLayerOptions(this.pointerDownGear);
            this.openGearPopover(this.pointerDownGear);
            this.state.ghostGear = null;
            this.activeTouches.clear();
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
        if (this.activeTouches.has(event.pointerId)) this.activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
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
        if (this.state.selectedItem === 'BELT') return;
        if (this.pointerDownGear) {
            this.pointerDownGear = null;
            return;
        }
        this.activeTouches.delete(event.pointerId);
        if (this.activeTouches.size < 2) this.initialPinchDist = null;
        if (this.activeTouches.size !== 0) return;
        const point = this.renderer.worldPoint(event.clientX, event.clientY);
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
        const gears = this.gearManager.findGearsAt(x, y);
        if (gears.length === 0) return null;
        const nearestDistance = Math.min(...gears.map(gear => Math.hypot(gear.x - x, gear.y - y)));
        const stackedGears = gears.filter(gear => Math.abs(Math.hypot(gear.x - x, gear.y - y) - nearestDistance) < 1);
        if (stackedGears.length === 1) return stackedGears[0];
        const currentIndex = stackedGears.findIndex(gear => gear.id === this.state.selectedGearId);
        return stackedGears[currentIndex >= 0 ? (currentIndex + 1) % stackedGears.length : 0];
    }

    updateAxisLayerOptions(gear) {
        // ドロップダウンには、指定ギアと同じq/rに実在するレイヤーだけを表示する。
        const row = document.getElementById('axis-layer-row');
        const select = document.getElementById('axis-layer-select');
        const axisGears = this.state.placedGears
            .filter(other => other.q === gear.q && other.r === gear.r)
            .sort((first, second) => first.layer - second.layer);
        select.replaceChildren(...axisGears.map(axisGear => new Option(`L${axisGear.layer + 1} (${['金', '銀', '銅'][axisGear.layer]})`, axisGear.id)));
        select.value = gear.id;
        row.classList.toggle('main-gear-hidden', axisGears.length < 2);
    }

    getProcessOptions(designType) {
        // ギア種類ごとに選べる処理モードを返す。新しい処理はここへ追加する。
        if (designType === 'PRODUCTION') return [['NONE', '処理なし'], ['FOG_COLLECTION', '霧の回収']];
        if (designType === 'ALCHEMICAL') return [['NONE', '処理なし'], ['TRANSFORM', '水→スチーム'], ['FOG_TO_WATER', '霧→水'], ['FOG_TO_LIQUID_METAL', '霧→液体金属'], ['LIQUID_TO_SOLID_METAL', '液体金属→固体金属'], ['SOLID_TO_BRASS', '固体金属→真鍮資材']];
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
    // 選択ギアの設定、コスト、同期状態を吹き出しへまとめて表示する。
    openGearPopover(gear) { this.state.selectedGearId = gear.id; this.updateProcessInfo(gear); document.getElementById('gear-modal').hidden = false; document.getElementById('gear-popover-title').textContent = gear.isCore ? 'メインギア' : `${gear.sizeKey} ギア設定`; document.getElementById('gear-popover-meta').textContent = gear.isCore ? `L${gear.layer + 1} / ${gear.teeth}歯` : `L${gear.layer + 1} / ${gear.teeth}歯 / ${gear.designType} / ${gear.processMode}`; const friction = Math.round(this.state.network?.calculateGearFriction(gear) || 0); const driveCost = Math.round(gear.steamLoad); const steamCost = driveCost + friction; const rotation = Math.round(Math.abs(gear.angularVelocity || 0)); const loopBonus = this.state.network?.loopGearIds?.has(gear.id) ? '環機構ボーナス' : ''; document.getElementById('gear-popover-cost').innerHTML = gear.isCore ? '<div class="cost-note">メインギア<br>現在コストの集計対象外</div>' : `<div class="resource-block brass-block"><div class="resource-heading">真鍮資材 <strong>${Math.round(gear.brassCost)}</strong></div></div><div class="resource-divider"></div><div class="resource-block steam-block"><div class="cost-row"><span>駆動コスト</span><strong>${driveCost}</strong></div><div class="cost-row"><span>摩擦コスト</span><strong>${friction}</strong></div>${loopBonus ? `<div class="bonus-row">(${loopBonus})</div>` : ''}</div><div class="resource-divider strong"></div><div class="cost-row steam-total"><span>消費スチーム / 回転</span><strong>${steamCost} / ${rotation}</strong></div>`; document.getElementById('gear-lock-toggle').checked = gear.isLocked; document.getElementById('main-gear-size-select').value = gear.sizeKey; document.getElementById('gear-design-select').value = gear.designType; this.updateProcessOptions(gear.designType, gear.processMode); document.getElementById('main-gear-size-row').classList.toggle('main-gear-hidden', !gear.isCore); document.getElementById('gear-design-row').classList.toggle('main-gear-hidden', gear.isCore); document.getElementById('gear-process-row').classList.toggle('main-gear-hidden', gear.isCore); document.getElementById('gear-delete-button').disabled = gear.isCore; }
    updateProcessInfo(gear) {
        // 選択ギアの処理定義を毎秒レートへ変換し、処理能力枠を更新する。
        const section = document.getElementById('gear-process-section');
        if (!section || !gear || gear.isCore) {
            if (section) section.hidden = true;
            return;
        }
        const info = this.state.getGearProcessInfo(gear);
        section.hidden = gear.processMode === 'NONE';
        document.getElementById('gear-process-info-name').textContent = info.name;
        document.getElementById('gear-process-info-input').textContent = info.input === '-'
            ? '-'
            : `${info.input} ${info.inputRate.toFixed(2)} /秒`;
        document.getElementById('gear-process-info-output').textContent = info.output === '-'
            ? '-'
            : `${info.output} ${info.outputRate.toFixed(2)} /秒`;
    }
    updateSelectedGear(settings) { const gear = this.gearManager.findGearById(this.state.selectedGearId); if (gear) this.gearManager.updateGearSettings(gear, settings); }
    closeGearPopover() {
        // 選択ギアとモーダル表示を解除する。
        this.state.selectedGearId = null;
        this.state.ghostGear = null;
        const modal = document.getElementById('gear-modal');
        if (modal) modal.hidden = true;
    }

    pointerOffset(event) {
        // タッチ操作だけ、指でUIが隠れないよう入力位置を上方向へ補正する。
        return event.pointerType === 'mouse' ? 0 : 110;
    }

    updateUI() {
        // 資源値、ダッシュボード、ボタン状態、開閉パネルを現在のGameStateへ同期する。
        const steam = document.getElementById('steamPower');
        const brass = document.getElementById('brass');
        const costs = this.state.getCurrentCosts();
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
            dashboardLiquidMetal: this.state.liquidMetal,
            liquidMetalGenerationRate: this.state.liquidMetalRate,
            liquidMetalConsumptionRate: this.state.liquidMetalConsumptionRate,
            dashboardSolidMetal: this.state.solidMetal,
            solidMetalGenerationRate: this.state.solidMetalRate,
            solidMetalConsumptionRate: this.state.solidMetalConsumptionRate,
            dashboardBrass: this.state.brass,
            brassGenerationRate: this.state.brassGenerationRate,
            dashboardSteamPower: this.state.steamPower,
            steamGenerationRate: this.state.steamGenerationRate,
            steamConsumptionRate: this.state.steamConsumptionRate
        };
        const integerDashboardIds = new Set(['dashboardBrass', 'dashboardSteamPower']);
        Object.entries(dashboardValues).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (!element) return;
            const displayValue = id.startsWith('dashboard') && integerDashboardIds.has(id)
                ? Math.floor(value || 0)
                : (value || 0).toFixed(2);
            element.textContent = displayValue + (id.startsWith('dashboard') ? '' : ' /秒');
        });
        const selectedGear = this.gearManager.findGearById(this.state.selectedGearId);
        if (selectedGear) this.updateProcessInfo(selectedGear);
        document.querySelectorAll('.btn-item').forEach(button => button.classList.toggle('active', button.dataset.item === this.state.selectedItem));
        const beltConfirm = document.getElementById('belt-confirm-button');
        if (beltConfirm) beltConfirm.hidden = this.state.selectedItem !== 'BELT' || this.state.beltSelection.length < 2;
        const creative = document.getElementById('creativeBtn');
        if (creative) {
            creative.classList.toggle('active', this.state.creativeMode);
            creative.textContent = `クリエイティブ: ${this.state.creativeMode ? 'ON' : 'OFF'}`;
        }
        document.querySelectorAll('.btn-size').forEach(button => button.classList.toggle('active', button.dataset.size === this.state.selectedSize));
        document.querySelectorAll('.btn-layer').forEach(button => button.classList.toggle('active', Number(button.dataset.layer) === this.state.selectedLayer));
        document.getElementById('btn-undo').disabled = this.state.undoStack.length === 0;
        document.getElementById('btn-redo').disabled = this.state.redoStack.length === 0;
        const loopButton = document.querySelector('[data-action="toggle-loops"]');
        if (loopButton) {
            loopButton.textContent = `環機構可視化: ${this.state.showLoops ? 'ON' : 'OFF'}`;
            loopButton.classList.toggle('active', this.state.showLoops);
            loopButton.setAttribute('aria-pressed', String(this.state.showLoops));
        }
        const mainGearButton = document.querySelector('[data-action="toggle-main-gear"]');
        if (mainGearButton) {
            mainGearButton.textContent = `メインギア: ${this.state.mainGearRunning ? '起動中' : '停止中'}`;
            mainGearButton.classList.toggle('active', this.state.mainGearRunning);
            mainGearButton.setAttribute('aria-pressed', String(this.state.mainGearRunning));
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
