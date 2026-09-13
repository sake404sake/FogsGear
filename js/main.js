/**
 * main.js - エントリーポイント（システムの初期化とモジュール結合）
 */
import { GameState } from './GameState.js';
import { GearManager } from './GearManager.js';
import { CanvasRenderer } from './CanvasRenderer.js';
import { UIController } from './UIController.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. 状態の初期化
    const gameState = new GameState();

    // 2. ギア配置ロジックの初期化
    const gearManager = new GearManager(gameState);

    // 3. 描画エンジンの初期化
    const renderer = new CanvasRenderer('gearCanvas', gameState);

    // 4. UIコントローラーの初期化
    const uiController = new UIController(gameState, gearManager, renderer);

    // 初期状態の反映
    uiController.updateUI();

    console.log('Fog Thermodynamics Engine initialized.');
});
