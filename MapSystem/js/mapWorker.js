import { MapManager } from './MapGenerator/index.js?v=79';

self.onmessage = (event) => {
    const { seed, width = 2000, height = 1000, coastalOnly = false } = event.data || {};
    try {
        const generator = new MapManager({ width, height, seed, coastalOnly });
        const generated = generator.generate(seed);
        self.postMessage({ type: 'complete', generated });
    } catch (error) {
        self.postMessage({ type: 'error', message: error?.message || 'マップ生成に失敗しました。' });
    }
};