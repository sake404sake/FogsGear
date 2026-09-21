// js/skinRenderer.js
export class SkinRenderer {
    constructor() {
        this.skinImage = new Image();
        this.isLoaded = false;
        // 進行方向: 0: Down, 1: Up, 2: Left, 3: Right
        this.direction = 0;
    }

    loadSkin(url) {
        return new Promise((resolve, reject) => {
            this.skinImage.crossOrigin = "anonymous";
            this.skinImage.onload = () => {
                this.isLoaded = true;
                resolve();
            };
            this.skinImage.onerror = (e) => {
                // CORSなどの理由で失敗した場合でもフォールバックで動くように
                resolve();
            };
            this.skinImage.src = url;
        });
    }

    setDirection(dx, dy) {
        if (dy > 0) this.direction = 0; // Down
        else if (dy < 0) this.direction = 1; // Up
        else if (dx < 0) this.direction = 2; // Left
        else if (dx > 0) this.direction = 3; // Right
    }

    // コンパクトで頭でっかち可愛い2頭身ミニキャラクター描画
    draw(ctx, x, y, size) {
        if (!this.isLoaded || !this.skinImage.complete || this.skinImage.naturalWidth === 0) {
            // 外部スキンが読めない場合も、点ではなく人物として見える形で表示する
            const centerX = x + size / 2;
            const headRadius = size * 0.25;
            const headY = y + size * 0.28;
            const bodyTop = y + size * 0.48;
            const bodyWidth = size * 0.42;
            const bodyHeight = size * 0.28;
            const legTop = bodyTop + bodyHeight - 1;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
            ctx.beginPath();
            ctx.ellipse(centerX, y + size * 0.91, size * 0.28, size * 0.07, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#f3c653';
            ctx.strokeStyle = '#6b462d';
            ctx.lineWidth = Math.max(1, size * 0.06);
            ctx.beginPath();
            ctx.arc(centerX, headY, headRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#8e4e38';
            ctx.fillRect(centerX - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
            ctx.strokeRect(centerX - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
            ctx.fillStyle = '#3e5264';
            ctx.fillRect(centerX - size * 0.16, legTop, size * 0.1, size * 0.25);
            ctx.fillRect(centerX + size * 0.06, legTop, size * 0.1, size * 0.25);
            return;
        }

        ctx.imageSmoothingEnabled = false;

        // 全体の高さを14ユニットとして計算 (頭: 8, 胴: 3.5, 足: 2.5)
        const totalHeightUnits = 14;
        const unit = size / totalHeightUnits;

        // センター合わせ
        const centerX = x + size / 2;
        const startY = y + (size - totalHeightUnits * unit) / 2;

        const headSize = unit * 8;
        const bodyW = unit * 6;
        const bodyH = unit * 3.5;
        const legW = unit * 2.5;
        const legH = unit * 2.5;
        const armW = unit * 2;
        const armH = unit * 3.2;

        const headX = centerX - headSize / 2;
        const headY = startY;
        const bodyX = centerX - bodyW / 2;
        const bodyY = headY + headSize - unit * 0.5; // 少し頭に重ねて自然な繋がりに
        const legY = bodyY + bodyH;

        // スキンテクスチャ切り出し座標 [sx, sy, sw, sh]
        const parts = {
            head: {
                front: [8, 8, 8, 8], back: [24, 8, 8, 8], left: [16, 8, 8, 8], right: [0, 8, 8, 8],
                hatFront: [40, 8, 8, 8], hatBack: [56, 8, 8, 8], hatLeft: [48, 8, 8, 8], hatRight: [32, 8, 8, 8]
            },
            body: {
                front: [20, 20, 8, 8], back: [32, 20, 8, 8], left: [28, 20, 4, 8], right: [16, 20, 4, 8]
            },
            armL: {
                front: [44, 20, 4, 8], back: [52, 20, 4, 8], side: [48, 20, 4, 8]
            },
            armR: {
                front: [44, 20, 4, 8], back: [52, 20, 4, 8], side: [40, 20, 4, 8]
            },
            legL: {
                front: [4, 20, 4, 8], back: [12, 20, 4, 8], side: [8, 20, 4, 8]
            },
            legR: {
                front: [4, 20, 4, 8], back: [12, 20, 4, 8], side: [0, 20, 4, 8]
            }
        };

        // 影の描画
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(centerX, startY + totalHeightUnits * unit, headSize * 0.45, unit * 1.5, 0, 0, Math.PI * 2);
        ctx.fill();

        if (this.direction === 0) { // 正面 (Down)
            // 足
            this._drawPart(ctx, parts.legL.front, centerX - legW - unit * 0.2, legY, legW, legH);
            this._drawPart(ctx, parts.legR.front, centerX + unit * 0.2, legY, legW, legH);
            // 腕
            this._drawPart(ctx, parts.armL.front, bodyX - armW + unit * 0.5, bodyY + unit * 0.2, armW, armH);
            this._drawPart(ctx, parts.armR.front, bodyX + bodyW - unit * 0.5, bodyY + unit * 0.2, armW, armH);
            // 体
            this._drawPart(ctx, parts.body.front, bodyX, bodyY, bodyW, bodyH);
            // 頭
            this._drawPart(ctx, parts.head.front, headX, headY, headSize, headSize);
            this._drawPart(ctx, parts.head.hatFront, headX - unit * 0.4, headY - unit * 0.4, headSize + unit * 0.8, headSize + unit * 0.8);

        } else if (this.direction === 1) { // 背面 (Up)
            // 足
            this._drawPart(ctx, parts.legL.back, centerX - legW - unit * 0.2, legY, legW, legH);
            this._drawPart(ctx, parts.legR.back, centerX + unit * 0.2, legY, legW, legH);
            // 腕
            this._drawPart(ctx, parts.armL.back, bodyX - armW + unit * 0.5, bodyY + unit * 0.2, armW, armH);
            this._drawPart(ctx, parts.armR.back, bodyX + bodyW - unit * 0.5, bodyY + unit * 0.2, armW, armH);
            // 体
            this._drawPart(ctx, parts.body.back, bodyX, bodyY, bodyW, bodyH);
            // 頭
            this._drawPart(ctx, parts.head.back, headX, headY, headSize, headSize);
            this._drawPart(ctx, parts.head.hatBack, headX - unit * 0.4, headY - unit * 0.4, headSize + unit * 0.8, headSize + unit * 0.8);

        } else if (this.direction === 2) { // 左向き (Left)
            const sideBodyW = unit * 5.5;
            const sideBodyX = centerX - sideBodyW / 2;
            // 足
            this._drawPart(ctx, parts.legL.side, sideBodyX + unit * 0.7, legY, legW, legH);
            // 体
            this._drawPart(ctx, parts.body.left, sideBodyX, bodyY, sideBodyW, bodyH);
            // 腕
            this._drawPart(ctx, parts.armL.side, sideBodyX + unit * 1.2, bodyY + unit * 0.2, armW, armH);
            // 頭
            this._drawPart(ctx, parts.head.left, headX, headY, headSize, headSize);
            this._drawPart(ctx, parts.head.hatLeft, headX - unit * 0.4, headY - unit * 0.4, headSize + unit * 0.8, headSize + unit * 0.8);

        } else if (this.direction === 3) { // 右向き (Right)
            const sideBodyW = unit * 5.5;
            const sideBodyX = centerX - sideBodyW / 2;
            // 足
            this._drawPart(ctx, parts.legR.side, sideBodyX + unit * 0.7, legY, legW, legH);
            // 体
            this._drawPart(ctx, parts.body.right, sideBodyX, bodyY, sideBodyW, bodyH);
            // 腕
            this._drawPart(ctx, parts.armR.side, sideBodyX + unit * 1.2, bodyY + unit * 0.2, armW, armH);
            // 頭
            this._drawPart(ctx, parts.head.right, headX, headY, headSize, headSize);
            this._drawPart(ctx, parts.head.hatRight, headX - unit * 0.4, headY - unit * 0.4, headSize + unit * 0.8, headSize + unit * 0.8);
        }
    }

    _drawPart(ctx, s, dx, dy, dw, dh) {
        if (!s || s.length < 4) return;
        try {
            ctx.drawImage(this.skinImage, s[0], s[1], s[2], s[3], dx, dy, dw, dh);
        } catch (e) {
            // エラー時はスキップ
        }
    }
}

