import { SkinRenderer } from './skinRenderer.js?v=5';

export class SkinPreview {
    constructor({ canvas, rotation, rotationValue, rotateLeft, rotateRight, beforeDraw = null, afterDraw = null }) {
        this.canvas = canvas;
        this.context = canvas.getContext('2d');
        this.renderer = new SkinRenderer();
        this.beforeDraw = beforeDraw;
        this.afterDraw = afterDraw;
        this.rotation = rotation;
        this.rotationValue = rotationValue;
        this.dragX = null;
        this.rotation.addEventListener('input', () => {
            this.setRotation(Number(this.rotation.value));
        });
        rotateLeft.addEventListener('click', () => this.setRotation(this.rotationValueDegrees() - 15));
        rotateRight.addEventListener('click', () => this.setRotation(this.rotationValueDegrees() + 15));
        canvas.addEventListener('pointerdown', event => {
            this.dragX = event.clientX;
            canvas.setPointerCapture(event.pointerId);
        });
        canvas.addEventListener('pointermove', event => {
            if (this.dragX === null) return;
            const delta = event.clientX - this.dragX;
            this.dragX = event.clientX;
            this.setRotation(this.rotationValueDegrees() + delta * 1.2);
        });
        const stopDragging = () => { this.dragX = null; };
        canvas.addEventListener('pointerup', stopDragging);
        canvas.addEventListener('pointercancel', stopDragging);
        this.setRotation(0);
    }

    rotationValueDegrees() {
        return Number(this.rotation.value) || 0;
    }

    setRotation(degrees) {
        const normalized = ((degrees % 360) + 360) % 360;
        this.rotation.value = String(Math.round(normalized));
        this.rotationValue.value = `${Math.round(normalized)}°`;
        this.rotationValue.textContent = this.rotationValue.value;
        this.render();
    }

    async load(source) {
        await this.renderer.loadSkin(source);
        this.renderer.setDirection(0, 1);
        this.render();
    }

    render() {
        const { canvas, context } = this;
        if (!context) return;
        const width = canvas.width;
        const height = canvas.height;
        context.clearRect(0, 0, width, height);
        const size = Math.min(width * 0.78, height * 0.78);
        const views = [0, 3, 1, 2];
        const directionIndex = Math.round(this.rotationValueDegrees() / 90) % views.length;
        const x = (width - size) / 2;
        const y = (height - size) / 2;
        this.renderer.direction = views[directionIndex];
        this.beforeDraw?.(context, x, y, size, this.renderer.direction);
        this.renderer.draw(context, x, y, size, { drawShadow: !this.beforeDraw });
        this.afterDraw?.(context, x, y, size, this.renderer.direction);
    }
}
