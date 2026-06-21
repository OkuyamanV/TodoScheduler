/* ============================
   SoundManager: サウンド再生の総合コントローラー
   目的: CelebrationScore（楽譜データ）を読み込み、Web Audio API (CelebrationEngine) 
         を使って正確なタイミングと音量・音色で再生する。
   ============================ */
const SoundManager = {
    // 完了音（長めのメロディなど）の再生中オシレーター（音の発生源）を保持する配列。
    // 途中で別の音が鳴った時などに、前の音を強制停止するために使用する。
    activeCompleteOscillators: [],

    // ユーザー操作によって音声再生が許可されたかどうか
    // false の間に発生した通知音は「溜めずに捨てる」
    isAudioUnlocked: false,

    // 初回クリック/タップでAudioContextを解放する
    initUnlock() {
        const unlock = () => {
            this.isAudioUnlocked = true;

            if (CelebrationEngine.ctx.state === 'suspended') {
                CelebrationEngine.ctx.resume().catch(() => {
                    // 失敗してもアプリ本体は止めない
                });
            }
        };

        window.addEventListener('pointerdown', unlock, { once: true, capture: true });
        window.addEventListener('keydown', unlock, { once: true, capture: true });
    },

    // --------------------------------------------------------
    // 1. 公開メソッド (Public Methods)
    // --------------------------------------------------------

    // 通知音（開始・終了時などの短い音）を再生する
    // key: 再生する楽譜のキー（'chime', 'beep'など）
    // customVolume: 設定画面でのプレビュー再生時などに使用する一時的な音量
    playNotifier(key, customVolume = null) {
        if (!key || key === 'none') return;
        this._play(key, false, customVolume);
    },

    // 完了音（タスク完了時・完全完了時のメロディ）を再生する
    playComplete(key, customVolume = null) {
        if (!key || key === 'none') return;
        this.stopComplete();
        this._play(key, true, customVolume);
    },

    // 再生中の完了音をすべて強制停止する
    stopComplete() {
        this.activeCompleteOscillators.forEach(osc => {
            try { osc.stop(); } catch(e) { /* 既に停止済みのエラーは無視 */ }
        });
        this.activeCompleteOscillators = [];
    },

    // 指定された楽譜の「総再生時間（ミリ秒）」を計算する
    // エフェクトの表示時間とサウンドの長さを同期させたい場合などに使用する
    getDurationMs(key) {
        const score = CelebrationScore[key];
        if (!score) return 0;
        
        let maxDurationSec = 0; // 全パートの中で一番長い再生時間（秒）
        
        Object.values(score).forEach(part => {
            let partDurationSec = 0;
            part.notes.forEach(([noteName, duration]) => {
                partDurationSec += duration * 0.1; // 1 duration = 0.1秒 として計算
            });
            if (partDurationSec > maxDurationSec) maxDurationSec = partDurationSec;
        });
        
        return maxDurationSec * 1000; // ミリ秒に変換して返す
    },

    // --------------------------------------------------------
    // 2. 内部メソッド (Private Methods)
    // --------------------------------------------------------

    // 楽譜データを解析し、各音符の再生をスケジュールするコアロジック
    _play(key, isComplete, customVolume = null) {
        const score = CelebrationScore[key];
        if (!score) return;
        
        // ユーザー操作前に発生した音は、溜めずに捨てる
        // これにより、初回クリック時に過去の通知音が一気に鳴るのを防ぐ
        if (!this.isAudioUnlocked && CelebrationEngine.ctx.state !== 'running') {
            return;
        }

        // ユーザー操作後で、まだAudioContextがsuspendedなら再開を試みる
        if (CelebrationEngine.ctx.state === 'suspended') {
            CelebrationEngine.ctx.resume().catch(() => {
                // resume失敗時もアプリ本体は止めない
            });
        }

        // 処理のわずかな遅延による「過去の時間に再生をスケジュールしようとして発生するエラー」
        // を防ぐため、全体の開始時間を「現在時刻＋0.05秒後」に設定する
        const now = CelebrationEngine.ctx.currentTime + 0.05;
        
        // 音量の決定（引数指定があればそれを、なければ設定値、設定がなければデフォルト0.5）
        const masterVolume = customVolume ?? TodoStore.notifyConfig.volume ?? 0.5;

        // メロディや和音など、各パート（トラック）ごとにループ処理
        Object.entries(score).forEach(([partKey, part]) => {
            let currentTime = now; // このパートの再生開始ポインタ
            
            part.notes.forEach(([noteName, duration]) => {
                const freq = CelebrationEngine.noteToFreq(noteName);
                
                // 休符（freq === 0）以外の場合のみ音を生成する
                if (freq > 0) {
                    let freqMultiplier = 1;
                    // 低音域（ド/262Hz 未満）は人間の耳に聞こえにくいため、音量を少し持ち上げて補正する
                    if (freq < 262) {
                        freqMultiplier = 1 + ((262 - freq) / 262) * 1.0; 
                    }
                    
                    const volume = part.volume * masterVolume * freqMultiplier;
                    
                    // オシレーター（発信器）を生成して再生をスケジュール
                    const osc = this._createOscillator(freq, part.type, duration * 0.1, currentTime, volume);
                    
                    // 完了音の場合は、後から停止できるように配列に保存しておく
                    if (isComplete) this.activeCompleteOscillators.push(osc);
                }
                
                // 次の音符の開始時間を、現在の音符の長さ分だけ進める
                currentTime += duration * 0.1;
            });
        });
    },

    // 指定された周波数、音色、長さ、タイミングで1つの音符を生成・スケジュールする
    _createOscillator(freq, type, duration, startTime, volume) {
        const ctx = CelebrationEngine.ctx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain(); // 音量コントローラー
        
        // Web Audio API のエラーを防ぐため、音量は必ず 0 より大きくする
        const safeVolume = Math.max(volume, 0.001);
        
        /* === ピアノ音色の特別なエンベロープ（音量変化）制御 === */
        if (type === 'piano') {
            osc.type = 'triangle'; // ピアノっぽさを出すために三角波を使用
            osc.frequency.setValueAtTime(freq, startTime);
            
            // 鳴り始めは音量ゼロ
            gain.gain.setValueAtTime(0, startTime);
            
            // アタック（Attack）: 叩いた瞬間に0.01秒で最大音量まで一気に立ち上げる
            gain.gain.linearRampToValueAtTime(safeVolume, startTime + 0.01);
            
            // ディケイ〜サスティン（Decay〜Sustain）: 
            // setTargetAtTime を使い、最大音量から10%の音量へ向かって、自然なカーブ（指数関数的）で減衰させる
            gain.gain.setTargetAtTime(safeVolume * 0.1, startTime + 0.01, 0.3); 
            
            // リリース（Release）: 
            // duration（指定された音の長さ＝鍵盤を離した時点）を過ぎたら、素早く音量ゼロへ減衰させる
            gain.gain.setTargetAtTime(0, startTime + duration, 0.05); 

            osc.connect(gain);
            gain.connect(ctx.destination); // 最終出力（スピーカー）へ接続
            osc.start(startTime);
            osc.stop(startTime + duration + 0.5); // 余韻を鳴らし切るために、実際の停止は少し遅らせる
        } 
        /* === 通常の持続音（ピー、プーなど）の制御 === */
        else {
            osc.type = type; // 'sine', 'square', 'sawtooth' など
            osc.frequency.setValueAtTime(freq, startTime);
            
            gain.gain.setValueAtTime(0, startTime);
            
            // ノイズ（プチッというポップノイズ）を防ぐため、0.01秒だけかけてフェードイン
            gain.gain.linearRampToValueAtTime(safeVolume, startTime + 0.01);
            
            // 音の終わりの少し手前から、素早くフェードアウトして自然に消す
            gain.gain.setTargetAtTime(0, Math.max(startTime + 0.01, startTime + duration - 0.05), 0.02);
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(startTime);
            osc.stop(startTime + duration);
        }
        
        return osc;
    }
};