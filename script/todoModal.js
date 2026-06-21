/* ============================
   TodoModal: モーダル（タスク入力・編集画面）のUI制御
   目的: ドラムロール（ホイール）式の時間選択UIの制御、入力フォーム間の連動、
         および新規作成・編集時のデータ流し込みを行う
   ============================ */
const TodoModal = {
    // --------------------------------------------------------
    // 1. 初期化
    // --------------------------------------------------------
    init() {
        this.setupWheels();
        this.bindUIEvents();
    },

    // --------------------------------------------------------
    // 2. ドラムロール式 時間ピッカーの制御 (Wheel UI Controls)
    // --------------------------------------------------------

    // 時間と分のスクロールホイール（00〜23, 00〜59）のHTML要素を生成し、スクロールイベントを紐付ける
    setupWheels() {
        const createWheelItems = (el, max) => {
            let html = '<div class="spacer"></div>'; // 上部の余白
            for (let i = 0; i <= max; i++) {
                html += `<div class="val-item">${i.toString().padStart(2, '0')}</div>`;
            }
            html += '<div class="spacer"></div>'; // 下部の余白
            el.innerHTML = html;
            
            // スクロール位置（scrollTop）から現在選択されている数値を計算する
            // ※ 1アイテムの高さが 40px に設定されている前提の計算式
            el.addEventListener('scroll', () => {
                const index = Math.round(el.scrollTop / 40);
                const items = el.querySelectorAll('.val-item');
                // 選択中の中央のアイテムだけに 'selected' クラスを付与（文字を大きくハイライト）
                items.forEach((item, i) => item.classList.toggle('selected', i === index));
            });
            // 初期化時に一度スクロールイベントを発火させて見た目を整える
            setTimeout(() => el.dispatchEvent(new Event('scroll')), 10);
        };
        
        // 開始・終了それぞれの時(hour)と分(min)のホイールを生成
        createWheelItems(document.getElementById('start-hour'), 23);
        createWheelItems(document.getElementById('start-min'), 59);
        createWheelItems(document.getElementById('end-hour'), 23);
        createWheelItems(document.getElementById('end-min'), 59);
    },

    // 指定した時間（"HH:MM"）に合わせてホイールを自動スクロールさせる
    setTime(idPrefix, timeStr) {
        const [h, m] = timeStr.split(':').map(Number);
        const hEl = document.getElementById(`${idPrefix}-hour`);
        const mEl = document.getElementById(`${idPrefix}-min`);
        
        // 要素が非表示（hidden）の時にスクロールさせるとバグるため、
        // 実際の表示とは別に、一時保存用として dataset（HTMLのカスタム属性）に時間を記録しておく
        document.getElementById('todo-modal').dataset[idPrefix] = timeStr;

        const parentBlock = hEl.closest('.time-picker-block');
        if (parentBlock && parentBlock.classList.contains('hidden')) {
            return; // 非表示ならスクロール処理をスキップ
        }
        
        // モーダルが表示された直後は描画が追いつかないことがあるため、少し遅延させてからスクロールさせる
        setTimeout(() => {
            hEl.scrollTo({ top: h * 40, behavior: 'auto' });
            mEl.scrollTo({ top: m * 40, behavior: 'auto' });
            
            // スクロール後にハイライト用のクラスを付与させるためのイベント発火
            setTimeout(() => {
                hEl.dispatchEvent(new Event('scroll'));
                mEl.dispatchEvent(new Event('scroll'));
            }, 50);
        }, 30);
    },

    // 現在ホイールで選択されている時間を "HH:MM" 形式で取得する
    getTime(idPrefix) {
        const hEl = document.getElementById(`${idPrefix}-hour`);
        const parentBlock = hEl.closest('.time-picker-block');
        
        // 「時間指定なし」などでホイールが非表示になっている場合は、dataset に退避してあった値を返す
        if (parentBlock && parentBlock.classList.contains('hidden')) {
            return document.getElementById('todo-modal').dataset[idPrefix] || "00:00";
        }

        // スクロール位置（px）から選択中のインデックスを逆算
        const hIndex = Math.round(hEl.scrollTop / 40);
        const mIndex = Math.round(document.getElementById(`${idPrefix}-min`).scrollTop / 40);
        return `${hIndex.toString().padStart(2, '0')}:${mIndex.toString().padStart(2, '0')}`;
    },

    // --------------------------------------------------------
    // 3. 入力フォームの連動・イベント定義 (Form Linkage)
    // --------------------------------------------------------
    bindUIEvents() {
        const hasTimeSelect = document.getElementById('input-has-time');
        const taskTypeSelect = document.getElementById('input-task-type');
        const endPickerBlock = document.querySelector('.time-picker-block:last-child');
        const carryOverGroup = document.getElementById('carry-over-group');

        // ① 「時間指定の有無」が変更された時の処理
        hasTimeSelect.onchange = () => {
            const hasTime = hasTimeSelect.value === 'true';
            if (!hasTime) {
                // 時間指定「なし」の場合：終了時間ホイールを隠し、タスクタイプを強制的に「チェック」にする
                endPickerBlock.classList.add('hidden');
                taskTypeSelect.value = 'check';
                taskTypeSelect.disabled = true;
            } else {
                // 時間指定「あり」の場合：終了時間ホイールを表示し、タスクタイプの選択を可能にする
                endPickerBlock.classList.remove('hidden');
                taskTypeSelect.disabled = false;
                
                // 隠している間に崩れてしまったホイール位置を、datasetから復元する
                const savedTime = document.getElementById('todo-modal').dataset['end'] || "00:00";
                this.setTime('end', savedTime);
            }
            taskTypeSelect.onchange(); // 連動してタスクタイプの処理も発火させる
        };

        // ② 「タスクタイプ（時間経過 / チェック）」が変更された時の処理
        taskTypeSelect.onchange = () => {
            if (taskTypeSelect.value === 'check') {
                // 「チェック」タイプなら、翌日への持ち越し設定を表示する
                carryOverGroup.classList.remove('hidden');
            } else {
                // 「時間経過」タイプなら、持ち越し設定は非表示にし、チェックボックスのチェックも外す
                carryOverGroup.classList.add('hidden');
                document.getElementById('input-is-carry-over').checked = false; 
            }
        };

        // ③ 完全完了サウンドのプレビュー再生ボタン
        document.getElementById('btn-preview-full-complete').onclick = () => {
            const type = document.getElementById('full-complete-sound-type').value;
            SoundManager.playComplete(type);
        };
    },

    // --------------------------------------------------------
    // 4. モーダルの開閉処理 (Modal Open/Close)
    // --------------------------------------------------------
    
    // モーダルを開き、必要なデータをフォームにセットする
    // dIdx: 曜日インデックス, todoId: 編集対象のID (新規ならnull), options: 特殊な初期状態の設定
    open(dIdx, todoId = null, options = { startTime: null, isStartLocked: false, isRevert: false }) {
        const modal = document.getElementById('todo-modal');
        const startBlock = document.querySelector('.time-picker-block:first-child');

        // 前回の時間エラーメッセージを非表示にリセット
        document.getElementById('time-error-msg').style.display = 'none';

        modal.style.display = 'flex';

        if (todoId) {
            // 【編集モード】既存のタスクデータを探し出して各入力欄にセットする
            // 週間データ、現在のデータ、日間データを横断して対象のタスクを探す
            let todo = (dIdx !== null && TodoStore.data[dIdx] ? TodoStore.data[dIdx].find(t => t.id === todoId) : null) || 
                       TodoStore.currentData.todos.find(t => t.id === todoId) ||
                       TodoStore.dailyData.find(t => t.id === todoId);
            
            document.getElementById('input-todo-name').value = todo.name;
            document.getElementById('input-has-time').value = todo.hasTime ? 'true' : 'false';
            document.getElementById('input-task-type').value = todo.taskType || 'duration';
            document.getElementById('input-is-carry-over').checked = !!todo.isCarryOver; 
            document.getElementById('input-notify-override').value = todo.notifyOverride || 'default';

            this.setTime('start', todo.start);
            this.setTime('end', todo.end);
        } else {
            // 【新規作成モード】入力欄をデフォルト値にリセットする
            document.getElementById('input-todo-name').value = '';
            document.getElementById('input-has-time').value = 'true';
            document.getElementById('input-task-type').value = 'duration';
            document.getElementById('input-is-carry-over').checked = false; 
            document.getElementById('input-notify-override').value = 'default';
            
            // オプションで開始時間が指定されていればそれを、なければ「09:00」を初期値にする
            const startStr = options.startTime || '09:00';
            this.setTime('start', startStr);
            // 終了時間は開始時間の1時間後に自動セット
            this.setTime('end', options.startTime ? this._addOneHour(startStr) : '10:00');
        }

        // 今日のタスク（単発追加や復活）の場合など、開始時間を変更させないための「ロック」処理
        if (options.isStartLocked) {
            startBlock.classList.add('locked'); // CSSで操作不能にするためのクラス
        } else {
            startBlock.classList.remove('locked');
        }
        
        // セットされた値に基づいて、フォームの連動処理（非表示など）を発火させる
        document.getElementById('input-has-time').dispatchEvent(new Event('change'));

        // 少し遅延させてからタスク名入力欄にフォーカスを当てる（すぐに文字入力できるようにする）
        setTimeout(() => {
            document.getElementById('input-todo-name').focus();
        }, 50);
    },

    close() {
        document.getElementById('todo-modal').style.display = 'none';
    },

    // --------------------------------------------------------
    // 5. ユーティリティ
    // --------------------------------------------------------
    
    // "HH:MM" 形式の文字列を受け取り、1時間後の時間を文字列で返す
    _addOneHour(timeStr) {
        let [h, m] = timeStr.split(':').map(Number);
        h = (h + 1) % 24; // 24時を超えたら0時にループさせる
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }
};