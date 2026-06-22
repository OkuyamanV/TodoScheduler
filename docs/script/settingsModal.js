/* ============================
   NotifySettingsModal: アプリケーション設定モーダルの制御
   目的: 通知音、完了エフェクト、マスター音量などのユーザー設定UIを管理し、
         TodoStoreの notifyConfig と同期させる
   ============================ */
const NotifySettingsModal = {
    // --------------------------------------------------------
    // 1. 初期化とイベント紐付け
    // --------------------------------------------------------
    init() {
        // ① 音源のマスターリストを定義
        const soundList = [
            { val: 'beep', name: '電子音' },
            { val: 'melody', name: 'メロディ' },
            { val: 'chime', name: 'チャイム' },
            { val: 'piano', name: 'ピアノ' },
            { val: 'calm', name: '穏やか' },
            { val: 'fanfare', name: 'ファンファーレ' },
            { val: 'levelUp', name: 'レベルアップ' },
            { val: 'clear', name: 'クリア' }
        ];
        
        // HTMLのセレクトボックス（<select>）の中身を動的に生成する
        // 通知音用は「なし（none）」を選択肢に含め、完了音用はリストのみとする
        const notifyHtml = '<option value="none">なし</option>' + 
                           soundList.map(s => `<option value="${s.val}">${s.name}</option>`).join('');
        const completeHtml = soundList.map(s => `<option value="${s.val}">${s.name}</option>`).join('');

        document.getElementById('notify-start-sound').innerHTML = notifyHtml;
        document.getElementById('notify-end-sound').innerHTML = notifyHtml;
        document.getElementById('complete-sound-type').innerHTML = completeHtml;
        document.getElementById('full-complete-sound-type').innerHTML = completeHtml;

        // ② 各「▶ プレビュー」ボタンが押された時の処理（SoundManagerを呼び出して試し聴きする）
        document.getElementById('btn-preview-start').onclick = () => {
            const val = document.getElementById('notify-start-sound').value;
            const vol = parseInt(document.getElementById('notify-volume').value) / 100;
            SoundManager.playComplete(val, vol);//重なって再生して欲しくないため、通知音だが完了音として再生
        };
        document.getElementById('btn-preview-end').onclick = () => {
            const val = document.getElementById('notify-end-sound').value;
            const vol = parseInt(document.getElementById('notify-volume').value) / 100;
            SoundManager.playComplete(val, vol);//重なって再生して欲しくないため、通知音だが完了音として再生
        };
        document.getElementById('btn-preview-complete').onclick = () => {
            const val = document.getElementById('complete-sound-type').value;
            const vol = parseInt(document.getElementById('notify-volume').value) / 100;
            SoundManager.playComplete(val, vol);
        };
        document.getElementById('btn-preview-full-complete').onclick = () => {
            const val = document.getElementById('full-complete-sound-type').value;
            const vol = parseInt(document.getElementById('notify-volume').value) / 100;
            SoundManager.playComplete(val, vol);
        };

        // ③ 音量スライダーを動かした時に、右側の「〇〇%」というテキストをリアルタイム更新する
        const volumeSlider = document.getElementById('notify-volume');
        const volumeValue = document.getElementById('notify-volume-value');
        volumeSlider.oninput = () => {
            volumeValue.textContent = `${volumeSlider.value}%`;
        };

        // ④ UIの連動制御（ON/OFFトグルに応じて、関連する入力を有効化/無効化する）
        const setupToggleDependency = (checkboxId, selectId, buttonId) => {
            const cb = document.getElementById(checkboxId);
            const select = document.getElementById(selectId);
            const btn = document.getElementById(buttonId);
            
            cb.onchange = () => {
                // チェックが外れている(OFFの)時は、セレクトボックスとプレビューボタンを操作不可(disabled)にする
                select.disabled = !cb.checked;
                btn.disabled = !cb.checked;
            };
        };

        // 各種サウンド設定に連動制御を適用
        setupToggleDependency('notify-start-toggle', 'notify-start-sound', 'btn-preview-start');
        setupToggleDependency('notify-end-toggle', 'notify-end-sound', 'btn-preview-end');
        setupToggleDependency('complete-sound-toggle', 'complete-sound-type', 'btn-preview-complete');
        setupToggleDependency('full-complete-sound-toggle', 'full-complete-sound-type', 'btn-preview-full-complete');

        // 保存・キャンセルボタンの紐付け
        document.getElementById('notify-cancel').onclick = () => this.close();
        document.getElementById('notify-save-btn').onclick = () => this.handleSave();
    },

    // --------------------------------------------------------
    // 2. モーダルの開閉処理
    // --------------------------------------------------------
    open() {
        // TodoStoreから現在の設定データを読み込む
        const config = TodoStore.notifyConfig;
        
        // フォーム要素に現在の設定値をセットしていく
        document.getElementById('notify-start-toggle').checked = config.startNotify;
        document.getElementById('notify-end-toggle').checked = config.endNotify;
        document.getElementById('notify-start-sound').value = config.startSound || 'chime';
        document.getElementById('notify-end-sound').value = config.endSound || 'chime';

        // ※ エフェクト系のトグルは、未設定(undefined)の場合はデフォルトでON(true)にする
        document.getElementById('complete-effect-toggle').checked = config.completeEffect !== undefined ? config.completeEffect : true;
        document.getElementById('full-complete-effect-toggle').checked = config.fullCompleteEffect !== undefined ? config.fullCompleteEffect : true;
        
        document.getElementById('complete-sound-toggle').checked = !!config.completeSound;
        document.getElementById('complete-sound-type').value = config.completeSoundType || 'melody';
        document.getElementById('full-complete-sound-toggle').checked = !!config.fullCompleteSound;
        document.getElementById('full-complete-sound-type').value = config.fullCompleteSoundType || 'melody';

        // 音量のセット（0.0〜1.0 の内部データを 0〜100 のパーセント表示に変換する）
        const savedVol = config.volume !== undefined ? config.volume : 0.5;
        const volPercent = Math.round(savedVol * 100);
        document.getElementById('notify-volume').value = volPercent;
        document.getElementById('notify-volume-value').textContent = `${volPercent}%`;

        // 値のセットアップが終わったら、手動で'change'イベントを発火させ、
        // 「トグルがOFFならセレクトボックスをグレーアウトする」というUI連動を即座に反映させる
        document.getElementById('notify-start-toggle').dispatchEvent(new Event('change'));
        document.getElementById('notify-end-toggle').dispatchEvent(new Event('change'));
        document.getElementById('complete-sound-toggle').dispatchEvent(new Event('change'));
        document.getElementById('full-complete-sound-toggle').dispatchEvent(new Event('change'));

        // モーダルを表示
        document.getElementById('notify-settings-modal').style.display = 'flex';
    },

    close() {
        document.getElementById('notify-settings-modal').style.display = 'none';
    },

    // --------------------------------------------------------
    // 3. 設定の保存処理
    // --------------------------------------------------------
    handleSave() {
        // 画面上の全フォームから現在の入力値を取得
        const startNotify = document.getElementById('notify-start-toggle').checked;
        const endNotify = document.getElementById('notify-end-toggle').checked;
        const startSound = document.getElementById('notify-start-sound').value;
        const endSound = document.getElementById('notify-end-sound').value;
        const volume = parseInt(document.getElementById('notify-volume').value) / 100; // 内部データ用に0.0〜1.0に戻す

        const completeEffect = document.getElementById('complete-effect-toggle').checked;
        const fullCompleteEffect = document.getElementById('full-complete-effect-toggle').checked;
        const completeSound = document.getElementById('complete-sound-toggle').checked;
        const completeSoundType = document.getElementById('complete-sound-type').value;
        const fullCompleteSound = document.getElementById('full-complete-sound-toggle').checked;
        const fullCompleteSoundType = document.getElementById('full-complete-sound-type').value;

        // TodoStoreを通じてLocalStorageへ一括保存
        TodoStore.saveNotifyConfig({ 
            startNotify, endNotify, startSound, endSound, volume,
            completeEffect, fullCompleteEffect, completeSound, completeSoundType, fullCompleteSound, fullCompleteSoundType
        });
        
        this.close();
        App.updateView();
    }
};