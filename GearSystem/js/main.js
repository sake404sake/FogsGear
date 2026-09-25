/**
 * main.js - エントリーポイント（システムの初期化とモジュール結合）
 */
import { GameState } from './GameState.js?v=runtime-3';
import { GearManager } from './GearManager.js';
import { CanvasRenderer } from './CanvasRenderer.js';
import { UIController } from './UIController.js?v=scroll-edit-2';

// DOMの準備後に、状態・ギア操作・描画・入力操作を同じGameStateへ接続する。
document.addEventListener('DOMContentLoaded', () => {
    // 1. 状態の初期化
    const gameState = new GameState();

    // 2. ギア配置ロジックの初期化
    const gearManager = new GearManager(gameState);

    // 3. 描画エンジンの初期化
    const renderer = new CanvasRenderer('gearCanvas', gameState);

    // 4. UIコントローラーの初期化
    const uiController = new UIController(gameState, gearManager, renderer);

    // 保存データの復元結果を、ステータス表示と各種ボタンへ反映する。
    uiController.updateUI();
    const editId = new URLSearchParams(window.location.search).get('editScroll');
    if (editId) {
        try {
            const scroll = JSON.parse(localStorage.getItem('fogsgear_scroll_library') || '[]').find(item => item.id === editId);
            const nameInput = document.getElementById('named-scroll-name');
            const effectSelect = document.getElementById('scroll-effect-select');
            if (scroll && nameInput) nameInput.value = scroll.name || '';
            if (scroll?.effect?.type && effectSelect) effectSelect.value = scroll.effect.type;
        } catch (error) {}
    }

    console.log('Fogs Gear Engine initialized.');
    document.getElementById('loadingOverlay')?.setAttribute('hidden', '');
});
