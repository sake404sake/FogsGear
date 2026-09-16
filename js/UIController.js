/** DOM controls and pointer gestures for the gear board. */
export class UIController {
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
        document.addEventListener('click', event => {
            const button = event.target.closest('button');
            if (!button) return;
            if (button.dataset.size) {
                this.state.setSelectedSize(this.state.selectedSize === button.dataset.size ? null : button.dataset.size);
                this.state.ghostGear = null;
                this.closeGearPopover();
            } else if (button.dataset.layer !== undefined) {
                this.state.setSelectedLayer(button.dataset.layer);
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
            const processMode = this.updateProcessOptions(event.target.value);
            this.updateSelectedGear({ designType: event.target.value, processMode });
        });
        document.getElementById('gear-process-select').addEventListener('change', event => this.updateSelectedGear({ processMode: event.target.value }));
        document.getElementById('gear-popover-close').addEventListener('click', () => this.closeGearPopover());
        document.getElementById('gear-modal').addEventListener('click', event => {
            if (event.target.id === 'gear-modal') this.closeGearPopover();
        });

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
        this.canvas.addEventListener('click', event => this.clickGear(event));
        this.canvas.addEventListener('contextmenu', event => {
            event.preventDefault();
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

    scheduleInputFrame() { if (this.inputFrame) return; this.inputFrame = requestAnimationFrame(() => { this.inputFrame = 0; if (this.pendingZoom !== null) { this.state.zoomScale = this.pendingZoom; this.pendingZoom = null; } if (this.pendingPointer) { const event = this.pendingPointer; this.pendingPointer = null; this.applyPointerMove(event); } }); }

    pointerDown(event) {
        if (event.button === 2) return;
        const point = this.renderer.worldPoint(event.clientX, event.clientY);
        this.pointerDownGear = this.state.selectedSize ? null : this.gearManager.findGearAt(point.x, point.y);
        if (this.pointerDownGear) {
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
        if (event.buttons === 2 || event.button === 2) return;
        if (this.activeTouches.has(event.pointerId)) this.activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        this.pendingPointer = event;
        this.scheduleInputFrame();
    }

    applyPointerMove(event) {
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
        if (event.button === 2) return;
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

    clickGear(event) {
        if (event.button !== 0 || this.state.selectedSize) return;
        const point = this.renderer.worldPoint(event.clientX, event.clientY);
        const existingGear = this.gearManager.findGearAt(point.x, point.y);
        if (existingGear) this.openGearPopover(existingGear);
    }

    getProcessOptions(designType) {
        if (designType === 'PRODUCTION') return [['NONE', '処理なし'], ['FOG_COLLECTION', '霧の回収']];
        if (designType === 'ALCHEMICAL') return [['NONE', '処理なし'], ['TRANSFORM', '水→スチーム'], ['FOG_TO_WATER', '霧→水'], ['FOG_TO_LIQUID_METAL', '霧→液体金属'], ['LIQUID_TO_SOLID_METAL', '液体金属→固体金属'], ['SOLID_TO_BRASS', '固体金属→真鍮資材']];
        return [['NONE', '処理なし']];
    }
    updateProcessOptions(designType, selectedMode = null) {
        const select = document.getElementById('gear-process-select');
        const options = this.getProcessOptions(designType);
        select.replaceChildren(...options.map(([value, label]) => new Option(label, value)));
        const mode = options.some(([value]) => value === selectedMode) ? selectedMode : options[0][0];
        select.value = mode;
        return mode;
    }
    openGearPopover(gear) { this.state.selectedGearId = gear.id; document.getElementById('gear-modal').hidden = false; document.getElementById('gear-popover-title').textContent = gear.isCore ? 'メインギア' : `${gear.sizeKey} ギア設定`; document.getElementById('gear-popover-meta').textContent = gear.isCore ? `L${gear.layer + 1} / ${gear.teeth}歯` : `L${gear.layer + 1} / ${gear.teeth}歯 / ${gear.designType} / ${gear.processMode}`; const friction = Math.round(this.state.network?.calculateGearFriction(gear) || 0); const driveCost = Math.round(gear.steamLoad); const steamCost = driveCost + friction; const rotation = Math.round(Math.abs(gear.angularVelocity || 0)); const loopBonus = this.state.network?.loopGearIds?.has(gear.id) ? '環機構ボーナス' : ''; document.getElementById('gear-popover-cost').innerHTML = gear.isCore ? '<div class="cost-note">メインギア<br>現在コストの集計対象外</div>' : `<div class="resource-block brass-block"><div class="resource-heading">真鍮資材 <strong>${Math.round(gear.brassCost)}</strong></div></div><div class="resource-divider"></div><div class="resource-block steam-block"><div class="cost-row"><span>駆動コスト</span><strong>${driveCost}</strong></div><div class="cost-row"><span>摩擦コスト</span><strong>${friction}</strong></div>${loopBonus ? `<div class="bonus-row">(${loopBonus})</div>` : ''}</div><div class="resource-divider strong"></div><div class="cost-row steam-total"><span>消費スチーム / 回転</span><strong>${steamCost} / ${rotation}</strong></div>`; document.getElementById('gear-lock-toggle').checked = gear.isLocked; document.getElementById('main-gear-size-select').value = gear.sizeKey; document.getElementById('gear-design-select').value = gear.designType; this.updateProcessOptions(gear.designType, gear.processMode); document.getElementById('main-gear-size-row').classList.toggle('main-gear-hidden', !gear.isCore); document.getElementById('gear-design-row').classList.toggle('main-gear-hidden', gear.isCore); document.getElementById('gear-process-row').classList.toggle('main-gear-hidden', gear.isCore); document.getElementById('gear-delete-button').disabled = gear.isCore; }
    updateSelectedGear(settings) { const gear = this.gearManager.findGearById(this.state.selectedGearId); if (gear) this.gearManager.updateGearSettings(gear, settings); }
    closeGearPopover() {
        this.state.selectedGearId = null;
        this.state.ghostGear = null;
        const modal = document.getElementById('gear-modal');
        if (modal) modal.hidden = true;
    }

    pointerOffset(event) {
        return event.pointerType === 'mouse' ? 0 : 110;
    }

    updateUI() {
        const steam = document.getElementById('steamPower');
        const brass = document.getElementById('brass');
        const costs = this.state.getCurrentCosts();
        if (steam) steam.textContent = Math.floor(this.state.steamPower);
        if (brass) brass.textContent = this.state.creativeMode ? 'MAX' : Math.floor(this.state.brass);
        const brassCost = document.getElementById('currentBrassCost'); const steamCost = document.getElementById('currentSteamCost');
        if (brassCost) brassCost.textContent = costs.brass;
        if (steamCost) steamCost.textContent = costs.steam;
        const powerOutput = document.getElementById('powerOutput');
        const activeGears = document.getElementById('activeGears');
        const productionRate = document.getElementById('productionRate');
        const water = document.getElementById('water');
        const waterRecoveryRate = document.getElementById('waterRecoveryRate');
        const fog = document.getElementById('fog');
        const fogRecoveryRate = document.getElementById('fogRecoveryRate');
        const liquidMetal = document.getElementById('liquidMetal');
        const liquidMetalRate = document.getElementById('liquidMetalRate');
        const fogToWaterRate = document.getElementById('fogToWaterRate');
        const solidMetal = document.getElementById('solidMetal');
        const solidMetalRate = document.getElementById('solidMetalRate');
        const solidMetalToBrassRate = document.getElementById('solidMetalToBrassRate');
        const steamTransformRate = document.getElementById('steamTransformRate');
        const generatedSteamRate = document.getElementById('generatedSteamRate');
        const dashboardSteamCost = document.getElementById('dashboardSteamCost');
        if (powerOutput) powerOutput.textContent = Math.floor(this.state.powerOutput || 0);
        if (activeGears) activeGears.textContent = this.state.placedGears.filter(gear => gear.powered && !gear.isDeadlocked).length;
        if (productionRate) productionRate.textContent = (this.state.productionRate || 0).toFixed(1);
        if (water) water.textContent = Math.floor(this.state.water || 0);
        if (waterRecoveryRate) waterRecoveryRate.textContent = (this.state.waterRecoveryRate || 0).toFixed(1);
        if (fog) fog.textContent = (this.state.fog || 0).toFixed(1);
        if (fogRecoveryRate) fogRecoveryRate.textContent = (this.state.fogRecoveryRate || 0).toFixed(1);
        if (liquidMetal) liquidMetal.textContent = (this.state.liquidMetal || 0).toFixed(1);
        if (liquidMetalRate) liquidMetalRate.textContent = (this.state.liquidMetalRate || 0).toFixed(1);
        if (fogToWaterRate) fogToWaterRate.textContent = (this.state.fogToWaterRate || 0).toFixed(1);
        if (solidMetal) solidMetal.textContent = (this.state.solidMetal || 0).toFixed(1);
        if (solidMetalRate) solidMetalRate.textContent = (this.state.solidMetalRate || 0).toFixed(1);
        if (solidMetalToBrassRate) solidMetalToBrassRate.textContent = (this.state.solidMetalToBrassRate || 0).toFixed(1);
        if (steamTransformRate) steamTransformRate.textContent = (this.state.steamTransformRate || 0).toFixed(1);
        if (generatedSteamRate) generatedSteamRate.textContent = (this.state.generatedSteamRate || 0).toFixed(1);
        if (dashboardSteamCost) dashboardSteamCost.textContent = Math.round(costs.steam);
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
