/* ============================
   EffectManager: 視覚エフェクト（パーティクル）エンジン
   目的: タスク完了時の「ポワポワ」や、完全完了時の「紙吹雪」といった
         リッチなパーティクル（粒子）アニメーションを生成・制御する
   ============================ */
const EffectManager = {
    container: null,    // エフェクトを描画する専用のフルスクリーン要素
    particles: [],      // 現在画面上に存在しているすべての粒子の配列
    animating: false,   // アニメーションループが実行中かどうかのフラグ
    
    // アプリのテーマカラー（RGB値）。エフェクトの色を変更したい場合はここを書き換える
    themeColorRGB: '190, 225, 255',

    // --------------------------------------------------------
    // 1. 初期化とループ制御
    // --------------------------------------------------------
    
    init() {
        // エフェクト表示用の透明なレイヤーを画面最前面に作成する
        this.container = document.createElement('div');
        this.container.id = 'effect-overlay';
        
        // 画面全体を覆うが、クリック等は下の要素を透過させる（pointerEvents: 'none'）
        Object.assign(this.container.style, {
            position: 'fixed', top: '0', left: '0',
            width: '100vw', height: '100vh',
            pointerEvents: 'none', zIndex: '9999',
            overflow: 'hidden' // 画面外に出た粒子によるスクロールバー発生を防ぐ
        });
        document.body.appendChild(this.container);
    },

    // アニメーションの描画ループを開始する
    startLoop() {
        if (this.animating) return; // 既にループ中なら何もしない
        this.animating = true;
        
        // requestAnimationFrame を使って、モニターの描画間隔（通常60FPS）に合わせて画面を更新する
        const loop = () => {
            this.update();
            // 粒子が1つでも残っていればループを継続し、全滅したら停止してメモリを節約する
            if (this.particles.length > 0) {
                requestAnimationFrame(loop);
            } else {
                this.animating = false;
            }
        };
        requestAnimationFrame(loop);
    },

    // --------------------------------------------------------
    // 2. 物理演算と描画の更新 (Physics & Render Update)
    // --------------------------------------------------------
    update() {
        // 配列から要素を削除していくため、バグを防ぐ目的で「後ろから前に」ループを回す
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            
            // 物理演算：速度（Velocity）を座標（x, y）に足し込み、重力を下方向の速度（vy）に足す
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity;
            p.age++; // 粒子の年齢（生存フレーム数）を増やす

            let currentOpacity = p.baseOpacity;

            /* === ①「ポワポワ」タイプ特有の動き === */
            if (p.type === 'powa') {
                // サイン波（Math.sin）を使って、年齢に応じてホタルのようにフワフワと明滅させる
                currentOpacity = p.baseOpacity * (0.4 + 0.6 * Math.sin(p.age * p.twinkleSpeed));
                // 左右にもサイン波を使ってユラユラと揺らしながら上昇させる
                p.x += Math.sin(p.age * 0.05) * 0.5; 
            }

            /* === ②「紙吹雪」タイプ特有の動き === */
            if (p.type === 'confetti') {
                p.rotation += p.rotationSpeed;
                
                // 空気抵抗（drag）による滑らかな減速。1フレームごとに速度が少しずつ落ちる
                p.vx *= p.drag;
                p.vy *= p.drag;
                p.rotationSpeed *= p.drag; 
            }

            // 寿命（lifespan）を過ぎたら、30フレームかけて徐々に透明にしていく（フェードアウト）
            if (p.age > p.lifespan) {
                currentOpacity *= Math.max(0, 1 - (p.age - p.lifespan) / 30); 
            }

            // 完全に消え去った、または画面の下端（innerHeight）よりも下に落ちた粒子はDOMから削除する
            if (p.age > p.lifespan + 30 || p.y > window.innerHeight + 50) {
                p.el.remove();
                this.particles.splice(i, 1);
                continue;
            }

            // 計算した座標と回転をHTML要素のCSS（transform）に適用する
            let transformStr = `translate(${p.x}px, ${p.y}px)`;
            if (p.type === 'confetti') {
                transformStr += ` rotate(${p.rotation}deg) skew(10deg, 10deg)`; // 少し歪ませて紙切れ感を出す
            }

            p.el.style.transform = transformStr;
            p.el.style.opacity = currentOpacity;
        }
    },

    // --------------------------------------------------------
    // 3. エフェクトの発動メソッド (Effect Triggers)
    // --------------------------------------------------------

    // 通常完了時：画面下からフワフワと上昇する「ポワポワ」エフェクト
    playComplete() {
        const count = 25; // 粒の数
        const w = window.innerWidth;
        const h = window.innerHeight;

        for (let i = 0; i < count; i++) {
            const el = document.createElement('div');
            const size = Math.random() * 25 + 10; // 大きさは10px 〜 35pxの範囲でランダム
            
            Object.assign(el.style, {
                position: 'absolute', top: '0', left: '0',
                width: `${size}px`, height: `${size}px`,
                borderRadius: '50%', // 円形にする
                background: `rgba(${this.themeColorRGB}, 1)`,
                boxShadow: `0 0 15px rgba(${this.themeColorRGB}, 0.8)`, // ぼんやりとした光の広がり
                willChange: 'transform, opacity' // ブラウザにアニメーションの最適化を促す
            });
            this.container.appendChild(el);

            this.particles.push({
                el: el, type: 'powa',
                x: Math.random() * w, // 横幅のどこかランダムな位置から発生
                y: h + 20,            // 画面の少し下からスタート
                
                vx: (Math.random() - 0.5) * 1.0,  // 横の揺れ
                vy: -(Math.random() * 1.7 + 0.8), // 上昇速度（マイナスなので上へ進む）
                gravity: 0, // 重力ゼロ（落ちてこない）
                age: 0,
                
                lifespan: Math.random() * 120 + 150, // 寿命
                baseOpacity: Math.random() * 0.4 + 0.4, 
                twinkleSpeed: Math.random() * 0.04 + 0.02 // またたきの速度
            });
        }
        this.startLoop();
    },

    // 完全完了時：画面の左右下端から中央へ向かって放たれる「紙吹雪」エフェクト
    playFullComplete() {
        const count = 80; // 豪華にするため粒の数を多くする
        const w = window.innerWidth;
        const h = window.innerHeight;
        const opacities = [0.2, 0.4, 0.6, 0.8, 1]; // 遠近感を出すための透明度バリエーション

        for (let i = 0; i < count; i++) {
            const el = document.createElement('div');
            const size = Math.random() * 24 + 6; 
            
            Object.assign(el.style, {
                position: 'absolute', top: '0', left: '0',
                width: `${size}px`, height: `${size}px`,
                background: `rgba(${this.themeColorRGB}, 1)`,
                willChange: 'transform, opacity'
            });
            this.container.appendChild(el);

            const baseOp = opacities[Math.floor(Math.random() * opacities.length)];
            const isLeft = Math.random() > 0.5; // 半分の確率で左側から、残りは右側から発生

            const startY = h * 0.85 + (Math.random() * 100 - 50); // 画面下部のやや上から撃ち出す

            // 空気抵抗（1.0に近いほど摩擦ゼロで急ブレーキがかからずスーッと伸びる）
            const drag = 0.993 + Math.random() * 0.004;

            // 画面サイズに応じて初速を計算し、中央に向かって弧を描くようにする
            const baseVx = (w / 80) * (Math.random() * 0.7 + 0.3);
            const baseVy = (h / 70) * (Math.random() * 0.7 + 0.3);

            this.particles.push({
                el: el, type: 'confetti',
                x: isLeft ? -50 : w + 50, // 画面外の左右どちらかからスタート
                y: startY, 
                
                vx: isLeft ? baseVx : -baseVx, // 左発なら右へ、右発なら左へ飛ばす
                vy: -baseVy, 
                
                // ゆっくり飛んでも落ちないよう、重力を極限まで軽く（羽のようなフワフワ感）
                gravity: 0.02 + Math.random() * 0.03, 
                
                drag: drag, 
                age: 0, 
                lifespan: Math.random() * 300 + 500, // 長く画面に滞在させる
                
                baseOpacity: baseOp,
                rotation: Math.random() * 360, 
                rotationSpeed: (Math.random() - 0.5) * 8 // クルクル回る速度
            });
        }
        this.startLoop();
    }
};