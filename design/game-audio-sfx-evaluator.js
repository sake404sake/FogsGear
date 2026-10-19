import { evaluateCatalog } from './game-audio-sfx-synth.js';

const button = document.getElementById('evaluateButton');
const status = document.getElementById('evaluationStatus');
const report = document.getElementById('evaluationReport');

button.addEventListener('click', async () => {
    button.disabled = true;
    status.textContent = '全88サンプルのレンダーと技術項目を検査しています（音質評価ではありません）…';
    report.textContent = '';
    try {
        const result = await evaluateCatalog();
        const failedGates = [];
        if (result.renderedCount !== result.expectedCount) {
            failedGates.push(`レンダー件数: ${result.renderedCount}/${result.expectedCount}`);
        }
        if (result.terrainCount !== 31) failedGates.push(`足音数: ${result.terrainCount}/31`);
        if (result.wetFootstepCount !== 4 || result.wetFootstepIssues.length) {
            failedGates.push(`水分のある地形の足音設計: ${result.wetFootstepCount}/4 (${result.wetFootstepIssues.join('、') || '分類またはレイヤー不足'})`);
        }
        if (result.footstepSpreadDb > 1) failedGates.push(`足音音量差: ${result.footstepSpreadDb.toFixed(2)} dB（目標 1 dB以下）`);
        if (result.patternCount !== 57) failedGates.push(`建築・床材などの項目数: ${result.patternCount}/57`);
        if (result.patternSpreadDb > 1) failedGates.push(`建築・床材などの試聴音量差: ${result.patternSpreadDb.toFixed(2)} dB（目標 1 dB以下）`);
        if (result.uniquePatternRecipes !== result.patternCount) {
            failedGates.push(`建築・床材などの音イベント構成重複: ${result.patternCount - result.uniquePatternRecipes}件`);
        }
        if (result.uniqueRoleMixes !== result.terrainCount) {
            failedGates.push(`足音レイヤー構成の重複: ${result.terrainCount - result.uniqueRoleMixes}件`);
        }
        if (result.closePairs.length) failedGates.push(`音響特徴が近すぎる地形ペア: ${result.closePairs.length}組（距離 0.050未満）`);
        if (result.closePatternPairs.length) failedGates.push(`音響特徴が近すぎる建築等ペア: ${result.closePatternPairs.length}組（距離 0.025未満）`);
        if (result.semanticMisassignments.length) failedGates.push(`イベント名と物理動作分類の矛盾: ${result.semanticMisassignments.length}件`);
        if (result.silentProfiles.length) failedGates.push(`無音に近いサンプル: ${result.silentProfiles.join('、')}`);
        if (result.clippedProfiles.length) failedGates.push(`クリッピング: ${result.clippedProfiles.join('、')}`);
        if (result.errors.length) failedGates.push(`レンダー失敗: ${result.errors.length}件`);
        const passed = failedGates.length === 0;
        status.textContent = passed
            ? `技術検査 PASS（音質未評価）— ${result.renderedCount}/${result.expectedCount}項目を検査しました。`
            : `技術検査 REVIEW（音質未評価）— ${failedGates.join(' / ')}`;
        const lines = [
            `技術検査: ${passed ? 'PASS' : 'REVIEW'}（音質・素材の正しさ・ブラインド識別は未評価）`,
            `カタログ: ${result.renderedCount}/${result.expectedCount}項目（地形 ${result.terrainCount}/31 足音）`,
            `足音レイヤー構成: ${result.uniqueRoleMixes}/${result.terrainCount}種類`,
            `水分のある地形: ${result.wetFootstepCount}/4種（粘土・泥炭・塩沼・海藻場）${result.wetFootstepIssues.length ? ` / 要確認: ${result.wetFootstepIssues.join('、')}` : ''}`,
            `足音レンダー音量差: ${result.footstepSpreadDb.toFixed(2)} dB（目標 1.00 dB以下）`,
            `建築・床材・線路・車両の音量差: ${result.patternSpreadDb.toFixed(2)} dB（目標 1.00 dB以下）`,
            `建築等のイベント設計: ${result.uniquePatternRecipes}/${result.patternCount}種類`,
            `最も似た足音: ${result.nearestPair ? `${result.nearestPair.left.label} ↔ ${result.nearestPair.right.label} (特徴距離 ${result.nearestPair.distance.toFixed(4)})` : '測定不可'}`,
            `最も似た建築等の音: ${result.nearestPatternPair ? `${result.nearestPatternPair.left.label} ↔ ${result.nearestPatternPair.right.label} (特徴距離 ${result.nearestPatternPair.distance.toFixed(4)})` : '測定不可'}`,
            `近似判定 (距離 < 0.050): ${result.closePairs.length ? result.closePairs.map(pair => `${pair.left} ↔ ${pair.right} (${pair.distance.toFixed(4)})`).join(' / ') : 'なし'}`,
            `建築等の近似判定 (距離 < 0.025): ${result.closePatternPairs.length ? result.closePatternPairs.map(pair => `${pair.left} ↔ ${pair.right} (${pair.distance.toFixed(4)})`).join(' / ') : 'なし'}`,
            `足音の音程付き発振器: ${result.footstepOscillatorCount}基（硬質素材もノイズ層のみ）`,
            `イベント名と物理動作分類の矛盾: ${result.semanticMisassignments.length ? result.semanticMisassignments.join(' / ') : '指摘なし'}`,
            `無音に近い音: ${result.silentProfiles.length ? result.silentProfiles.join('、') : 'なし'} / クリッピング: ${result.clippedProfiles.length ? result.clippedProfiles.join('、') : 'なし'}`,
            `レンダー失敗: ${result.errors.length ? result.errors.map(error => `${error.label}: ${error.message}`).join(' / ') : 'なし'}`,
            '',
            '全項目の客観測定値: 場所 | グループ | RMS dBFS (足音は聴感補正後) | スペクトル重心 Hz | クレスト dB',
            ...result.rendered.map(entry =>
                `${entry.label} | ${entry.group} | ${entry.rmsDb.toFixed(1)} | ${Math.round(entry.centroidHz)} | ${entry.crestDb.toFixed(1)}`
            ),
            '',
            '重要: PASSはレンダーや測定処理の技術検査結果です。音の意味、実録音への類似、地形/建物としての識別しやすさを評価していません。人によるブラインド試聴合格まで音質承認に使わないでください。'
        ];
        report.textContent = lines.join('\n');
        report.dataset.report = JSON.stringify({
            evaluatedAt: new Date().toISOString(),
            passed,
            failedGates,
            result
        }, null, 2);
    } catch (error) {
        status.textContent = `音響評価を完了できませんでした: ${error.message}`;
        console.error('音響評価に失敗しました', error);
    } finally {
        button.disabled = false;
    }
});
