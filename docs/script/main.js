/* ============================
   App: アプリケーション全体の制御（メインループ、初期化、イベント紐付け）
   目的: タイマーによる定期的な時間チェックと画面更新、各モジュール間の橋渡しを行う
   ============================ */
const App = {
    // ======== 定数・状態管理 ========
    days: ['日', '月', '火', '水', '木', '金', '土'],
    
    // 現在ユーザーが何を操作しているか（どの日の、どのタスクを、どんなモードで編集しているか）
    currentContext: { dayIdx: null, todoId: null, isDaily: false },
    
    // 最後に画面を更新した「分」（分が変わった時だけ画面を再描画するためのキャッシュ）
    lastUpdatedMinute: "",

    // メインループの間隔（通常時は10秒ごと、通知が迫っている時は1秒ごとに早回しする）
    BASE_INTERVAL: 10000,   
    SHORT_INTERVAL: 1000,   
    currentInterval: 10000, 
    timerId: null,          

    // --------------------------------------------------------
    // 1. 初期化処理 (Initialization)
    // --------------------------------------------------------
    init() {
        // 各種機能（エフェクトエンジン、各モーダル）の初期化
        SoundManager.initUnlock();
        EffectManager.init();
        TodoModal.init();
        DayCopyModal.init(); 
        NotifySettingsModal.init();
        
        // ユーザー操作のイベントリスナーを登録
        this.bindEvents();
        
        // アプリ起動時の「現在時刻」を記録
        const now = new Date();
        this.lastUpdatedMinute = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
        
        // 最初の画面描画を実行し、メインループ（タイマー）をスタート
        this.updateView();
        this.scheduleNextTick(1000); 
    },

    // --------------------------------------------------------
    // 2. イベントの紐付け (Event Binding)
    // --------------------------------------------------------
    bindEvents() {
        // [オーディオ制約の解除] 
        // ブラウザの仕様で、ユーザーが画面をクリックするまで音が出せないため、最初のクリックでロックを解除する
        const unlockAudio = () => {
            if (typeof CelebrationEngine !== 'undefined' && CelebrationEngine.ctx.state === 'suspended') {
                CelebrationEngine.ctx.resume();
            }
            document.removeEventListener('click', unlockAudio);
        };
        document.addEventListener('click', unlockAudio);
        
        // 各セクションの「並び替え」ラジオボタンが変更されたら即座に画面を再描画
        document.querySelectorAll('input[name="sort-current"], input[name="sort-week"], input[name="sort-daily"]').forEach(input => {
            input.onchange = () => { this.updateView(); };
        });

        // 日間スケジュールの「適用曜日」ボタンのトグル（ON/OFF）処理
        document.querySelectorAll('#daily-header-days .day-btn').forEach(btn => {
            btn.onclick = () => {
                const idx = parseInt(btn.dataset.idx);
                let activeDays = [...TodoStore.dailyActiveDays];
                if (activeDays.includes(idx)) {
                    activeDays = activeDays.filter(d => d !== idx); // 選択解除
                } else {
                    activeDays.push(idx); // 選択追加
                }
                TodoStore.saveDailyActiveDays(activeDays);
                this.updateView();
            };
        });

        // ヘッダーの操作類
        document.getElementById('current-view-mode').onchange = () => this.updateView(); // 未完了/完了/ゴミ箱 の切り替え
        document.getElementById('notify-setup').onclick = () => NotifySettingsModal.open(); // 設定モーダルを開く
        
        // Todo編集モーダルの操作
        document.getElementById('modal-cancel').onclick = () => TodoModal.close();
        document.getElementById('modal-save').onclick = () => TaskManager.handleSave(); // 保存処理はTaskManagerへ丸投げ

        // 画面のどこかをクリックした時、開いているドロップダウンメニュー（･･･）があれば閉じる
        window.onclick = (e) => {
            if (!e.target.matches('.menu-dots')) {
                document.querySelectorAll('.dropdown').forEach(d => d.style.display = 'none');
            }
        };
    },

    // --------------------------------------------------------
    // 3. UI・モーダル呼び出しの窓口 (Modal Openers)
    // --------------------------------------------------------
    
    // 特定の曜日データを別の曜日にコピーするモーダル
    openCopyModal(dIdx, todoId) { DayCopyModal.open(dIdx, todoId); },

    // 新規タスクの追加
    addTodo(idx, isCurrent = false) { 
        // どのモード（単発か、週間か）で追加しようとしているかをContextに記録
        this.currentContext = { dayIdx: idx, todoId: null, isAdhoc: isCurrent, isDaily: false };
        if (isCurrent) {
            // 今日のタスク（単発）を追加する場合は、開始時間を「現在時刻」でロックする
            const now = new Date();
            const currentTime = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
            TodoModal.open(idx, null, { startTime: currentTime, isStartLocked: true });
        } else {
            TodoModal.open(idx);
        }
    },

    // 日間（ルーチン）タスクの追加
    addDailyTodo() {
        this.currentContext = { dayIdx: null, todoId: null, isAdhoc: false, isDaily: true };
        TodoModal.open(null);
    },
    
    // 週間タスクの編集
    editTodo(dIdx, todoId) { 
        let todo = TodoStore.data[dIdx].find(t => t.id === todoId) || TodoStore.currentData.todos.find(t => t.id === todoId);
        this.currentContext = { dayIdx: dIdx, todoId: todoId, isAdhoc: !!(todo && todo.isAdhoc), isDaily: false };
        TodoModal.open(dIdx, todoId, { isStartLocked: !!(todo && todo.isAdhoc) }); 
    },

    // 日間（ルーチン）タスクの編集
    editDailyTodo(todoId) {
        this.currentContext = { dayIdx: null, todoId: todoId, isAdhoc: false, isDaily: true };
        TodoModal.open(null, todoId);
    },

    // 今日のタスク（Current）の直接編集
    editCurrentTodo(todoId) {
        let todo = TodoStore.currentData.todos.find(t => t.id === todoId);
        if (!todo) return;
        this.currentContext = { dayIdx: null, todoId: todoId, isAdhoc: !!todo.isAdhoc, isDaily: !!todo.fromDailyId, isCurrentEdit: true };
        TodoModal.open(null, todoId, { isStartLocked: true });
    },

    // 完了/削除済みタスクを「未完了」に復活させる（実質的には現在時刻からの単発タスクとして再作成）
    revertToIncomplete(todoId) {
        let todo = TodoStore.currentData.todos.find(t => t.id === todoId);
        if (!todo) return;
        this.currentContext = { dayIdx: null, todoId: todoId, isAdhoc: !!todo.isAdhoc, isDaily: !!todo.fromDailyId, isRevert: true };
        TodoModal.open(null, todoId, { isStartLocked: true, isRevert: true });
    },

    // 各タスク右上の「･･･（メニュー）」を開閉する
    toggleMenu(todoId) {
        const el = document.getElementById(`menu-${todoId}`);
        const isVisible = el.style.display === 'block';
        document.querySelectorAll('.dropdown').forEach(d => d.style.display = 'none'); // 他をすべて閉じる
        if (!isVisible) el.style.display = 'block';
    },

    // --------------------------------------------------------
    // 4. TaskManagerへの橋渡し (Controller Delegates)
    // --------------------------------------------------------
    // ※ HTML側（onclick="App.xxx"）から呼ばれ、実際の処理はTaskManagerに委譲する
    deleteTodo(dIdx, todoId) { TaskManager.deleteTodo(dIdx, todoId); },
    deleteDailyTodo(todoId) { TaskManager.deleteDailyTodo(todoId); },
    completeTodo(todoId) { TaskManager.completeTodo(todoId); },
    deleteCurrentTodo(todoId) { TaskManager.deleteCurrentTodo(todoId); },
    confirmFullComplete(todoId) { TaskManager.confirmFullComplete(todoId); },
    confirmAllFullComplete() { TaskManager.confirmAllFullComplete(); },

    // --------------------------------------------------------
    // 5. メインループ・システム稼働 (System Loop)
    // --------------------------------------------------------
    
    // 定期的に実行される「心臓部」。時間経過の監視と通知を行う。
    tick() {
        // 通知システムに「今、通知すべきタスクはあるか？」をチェックさせる
        const reqShortInterval = TodoNotifier.check(TodoStore.currentData.todos);
        
        const now = new Date();
        const currentTime = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');

        // 前回チェック時から「分」が変わっていれば、画面（現在のタスクリスト等）を再計算・再描画する
        if (this.lastUpdatedMinute !== currentTime) {
            this.lastUpdatedMinute = currentTime;
            this.updateView();
        }

        // 通知が直前に迫っている場合はチェック頻度を上げ（1秒間隔）、そうでない場合は通常（10秒間隔）に戻す
        if (typeof reqShortInterval === 'number') {
            this.currentInterval = reqShortInterval;
        } else {
            this.currentInterval = reqShortInterval ? this.SHORT_INTERVAL : this.BASE_INTERVAL;
        }
        this.scheduleNextTick(this.currentInterval);
    },

    // 次の tick() をスケジュールする
    scheduleNextTick(ms) {
        if (this.timerId) clearTimeout(this.timerId);
        this.timerId = setTimeout(() => this.tick(), ms);
    },

    // --------------------------------------------------------
    // 6. 画面の再計算・再描画 (View Update & Automation)
    // --------------------------------------------------------
    // この関数は「手動でデータが変更された時」または「分が変わった時（自動）」に呼ばれる。
    updateView() {
        const now = new Date();
        const currentDay = now.getDay(); // 0:日 〜 6:土
        const todayStr = now.toDateString();
        
        // 現在のUIの表示設定（並び順・表示モード）を取得
        const sortCurrent = document.querySelector('input[name="sort-current"]:checked').value;
        const sortWeek = document.querySelector('input[name="sort-week"]:checked').value;
        const sortDaily = document.querySelector('input[name="sort-daily"]:checked').value; 
        const time = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
        const viewMode = document.getElementById('current-view-mode').value;

        // 【自動処理A】日替わり処理（日付が変わった瞬間に、持ち越し設定された未完了タスクだけを残してリセット）
        if (TodoStore.currentData.date !== todayStr) {
            const carriedOver = TodoStore.currentData.todos.filter(t => !t.isCompleted && t.isCarryOver);
            TodoStore.currentData = {
                date: todayStr,
                todos: carriedOver.map(t => ({ ...t, isCompleted: false, completedTime: null, isFullCompleted: false, isDeleted: false })) 
            };
            TodoStore.saveCurrent(TodoStore.currentData);
        }

        // 【自動処理B】終了時間を過ぎたタスクの「自動完了」処理
        let isStoreChanged = false;
        TodoStore.currentData.todos.forEach(t => {
            if (!t.isCompleted && t.taskType === 'duration' && t.hasTime && t.end !== "23:59" && t.end <= time) {
                t.isCompleted = true;
                t.completedTime = t.end; 
                isStoreChanged = true;
            }
        });
        if (isStoreChanged) TodoStore.saveCurrent(TodoStore.currentData);

        // 【自動処理C】週間スケジュールから「現在のTodo」への自動展開
        // 今日が該当する曜日のタスクのうち、開始時間を過ぎたものを抽出してコピーする
        TodoStore.data[currentDay].forEach(wTodo => {
            if (wTodo.start > time) return; // まだ開始時間になっていない
            if (wTodo.taskType === 'duration' && wTodo.hasTime && wTodo.end <= time) return; // 既に終了時間を過ぎている

            // 既に「今日のリスト」にコピー済みかどうかをチェック
            const isDuplicate = TodoStore.currentData.todos.some(cTodo => 
                (cTodo.name === wTodo.name && cTodo.start === wTodo.start) || cTodo.fromWeeklyId === wTodo.id
            );
            
            // 未展開ならコピーを作成して追加
            if (!isDuplicate) {
                TodoStore.currentData.todos.push({
                    ...wTodo,
                    id: "current-w-" + Date.now() + Math.random().toString(36).substr(2, 5), // Current用の独自IDを付与
                    fromWeeklyId: wTodo.id,
                    isCompleted: false,
                    endNotified: false 
                });
            }
        });

        // 【自動処理D】日間（ルーチン）スケジュールから「現在のTodo」への自動展開
        // 今日の曜日が、日間スケジュールの「適用曜日」に含まれている場合のみ展開処理を行う
        if (TodoStore.dailyActiveDays.includes(currentDay)) {
            TodoStore.dailyData.forEach(dTodo => {
                if (dTodo.start > time) return;
                if (dTodo.taskType === 'duration' && dTodo.hasTime && dTodo.end <= time) return;

                const isDuplicate = TodoStore.currentData.todos.some(cTodo => cTodo.fromDailyId === dTodo.id);
                if (!isDuplicate) {
                    TodoStore.currentData.todos.push({
                        ...dTodo,
                        id: "current-d-" + Date.now() + Math.random().toString(36).substr(2, 5),
                        fromDailyId: dTodo.id,
                        isCompleted: false,
                        endNotified: false 
                    });
                }
            });
        } else {
            // もし「今日」のチェックが外された場合は、既に展開されていた日間タスクを今日のリストから撤去する
            TodoStore.currentData.todos = TodoStore.currentData.todos.filter(t => !t.fromDailyId);
        }
        
        TodoStore.saveCurrent(TodoStore.currentData);

        // 【描画準備】データをソート（並び替え）する
        const sortedFullData = {};
        for (let i = 0; i < 7; i++) {
            sortedFullData[i] = [...TodoStore.data[i]].sort((a, b) => a[sortWeek].localeCompare(b[sortWeek]));
        }

        // 【描画準備】現在の表示モード（未完了/完了）に合わせて「今日のリスト」をフィルタリング
        let currentVisible = [];
        if (viewMode === 'incomplete') {
            // 未完了モード：完了・削除済みは非表示。また「持ち越し」以外で開始前の未来タスクも非表示。
            currentVisible = TodoStore.currentData.todos.filter(t => {
                if (t.isCompleted || t.isFullCompleted || !!t.isDeleted) return false;
                if (!t.isCarryOver && t.start > time) return false;
                return true;
            });
        } else {
            // 完了モード：完了フラグが立っており、かつ「完全完了」「削除」されていないものだけ表示
            currentVisible = TodoStore.currentData.todos.filter(t => t.isCompleted && !t.isFullCompleted && !t.isDeleted);
        }

        // --------------------------------------------------------
        // 7. レンダリングの実行（TodoRendererへ描画を依頼）
        // --------------------------------------------------------
        TodoRenderer.renderCurrent(currentVisible, sortCurrent, viewMode);
        TodoRenderer.renderGrid(sortedFullData, this.days, currentDay);
        TodoRenderer.renderDaily(TodoStore.dailyData, TodoStore.dailyActiveDays, sortDaily);
    }
};

// スクリプト読み込みの最後に、自動的にアプリを起動する
App.init();