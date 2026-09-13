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
            } else if (button.dataset.layer !== undefined) {
                this.state.setSelectedLayer(button.dataset.layer);
            } else if (button.dataset.action === 'toggle-creative') {
                this.state.setCreativeMode(!this.state.creativeMode);
            } else if (button.dataset.action === 'undo') {
                this.state.undo();
            } else if (button.dataset.action === 'redo') {
                this.state.redo();
            } else if (button.dataset.action === 'reset' && confirm('盤面のギアと資材を初期状態にリセットしますか？')) {
                this.state.reset();
            }
        });

        document.addEventListener('pointerdown', event => {
            if (!this.canvas.contains(event.target) && !event.target.closest('.panel') && this.state.selectedSize) {
                this.state.setSelectedSize(null);
                this.state.ghostGear = null;
            }
        });
        this.canvas.addEventListener('pointerdown', event => this.pointerDown(event));
        this.canvas.addEventListener('pointermove', event => this.pointerMove(event));
        this.canvas.addEventListener('pointerup', event => this.pointerUp(event));
        this.canvas.addEventListener('pointercancel', event => {
            this.activeTouches.delete(event.pointerId);
            this.initialPinchDist = null;
            this.state.ghostGear = null;
        });
        this.canvas.addEventListener('wheel', event => {
            event.preventDefault();
            this.state.zoomScale = Math.max(0.4, Math.min(2.5, this.state.zoomScale + (event.deltaY > 0 ? -0.1 : 0.1)));
        }, { passive: false });
    }

    pointerDown(event) {
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
        if (this.activeTouches.has(event.pointerId)) this.activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
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
        this.activeTouches.delete(event.pointerId);
        if (this.activeTouches.size < 2) this.initialPinchDist = null;
        if (this.activeTouches.size !== 0) return;
        const point = this.renderer.worldPoint(event.clientX, event.clientY);
        if (this.state.selectedSize) {
            const canvasPoint = this.renderer.canvasPoint(event.clientX, event.clientY);
            this.gearManager.updateGhost(canvasPoint.x, canvasPoint.y, this.pointerOffset(event));
            this.gearManager.tryPlaceGear(point.x, point.y);
        } else {
            this.gearManager.tryPlaceGear(point.x, point.y);
        }
        this.state.ghostGear = null;
    }

    pointerOffset(event) {
        return event.pointerType === 'mouse' ? 0 : 110;
    }

    updateUI() {
        const steam = document.getElementById('steamPower');
        const brass = document.getElementById('brass');
        if (steam) steam.textContent = Math.floor(this.state.steamPower);
        if (brass) brass.textContent = this.state.creativeMode ? 'MAX' : Math.floor(this.state.brass);
        const creative = document.getElementById('creativeBtn');
        if (creative) {
            creative.classList.toggle('active', this.state.creativeMode);
            creative.textContent = `クリエイティブ: ${this.state.creativeMode ? 'ON' : 'OFF'}`;
        }
        document.querySelectorAll('.btn-size').forEach(button => button.classList.toggle('active', button.dataset.size === this.state.selectedSize));
        document.querySelectorAll('.btn-layer').forEach(button => button.classList.toggle('active', Number(button.dataset.layer) === this.state.selectedLayer));
        document.getElementById('btn-undo').disabled = this.state.undoStack.length === 0;
        document.getElementById('btn-redo').disabled = this.state.redoStack.length === 0;
    }
}
