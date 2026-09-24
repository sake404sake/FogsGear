import { MapManager } from './MapGenerator/index.js?v=77';

self.onmessage = (event) => {
    const { seed } = event.data || {};
    try {
        const generator = new MapManager({ width: 2000, height: 1000, seed });
        const generated = generator.generate(seed);
        self.postMessage({ type: 'complete', generated });
    } catch (error) {
        self.postMessage({ type: 'error', message: error?.message || 'マップ生成に失敗しました。' });
    }
};