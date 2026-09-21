/**
 * main.js - エントリーポイント（システムの初期化とモジュール結合）
 */
import { GameState } from './GameState.js';
import { GearManager } from './GearManager.js';
import { CanvasRenderer } from './CanvasRenderer.js';
import { UIController } from './UIController.js';

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

    console.log('Fogs Gear Engine initialized.');
});
