/* ============================
   TodoNotifier: トースト通知およびブラウザタブ点滅の制御
   目的: 開始/終了時刻に応じたトースト（ポップアップ）通知の生成と消去、
         およびユーザーが通知に気づきやすいようにタブのタイトルを点滅させる
   ============================ */
const TodoNotifier = {
    // --------------------------------------------------------
    // 1. 状態管理（State Management）
    // --------------------------------------------------------
    
    // 現在画面に表示されている「開始」通知のタスクIDの集合
    activeNotifications: new Set(),
    
    // ユーザーが手動で閉じた（×を押した）「開始」通知のタスクIDの集合
    // ※これがないと、メインループが回るたびに消した通知が何度も復活してしまいます
    dismissedNotifications: new Set(),
    
    // タブ点滅用の元のページタイトルと、点滅用タイマーID
    originalTitle: document.title,
    blinkInterval: null,

    // 設定画面のプレビューなどで「通知が鳴るか」をテストするためのダミー通知
    requestPermission() {
        this.send("通知設定", "通知が有効になりました。", "system", "chime");
    },

    // タスクの時間が変更された場合などに、そのタスクに関する通知履歴をリセットする
    resetNotification(todoId) {
        if (this.activeNotifications.has(todoId)) {
            this.removeNotification(todoId);
        }
        this.dismissedNotifications.delete(todoId);
    },

    // --------------------------------------------------------
    // 2. 通知の生成・消去 (Send / Dismiss)
    // --------------------------------------------------------
    
    // トースト通知のUIを生成し、画面に追加する
    send(title, message, todoId, soundType) {
        // 【二重通知の防止】
        // システム通知や終了通知(end-)以外で、既に表示中またはユーザーが消去済みの場合はスキップ
        if (todoId !== "system" && !todoId.startsWith("end-") && (this.activeNotifications.has(todoId) || this.dismissedNotifications.has(todoId))) {
            return;
        }
        
        // 開始通知の場合は、表示中リスト（active）に追加
        if (todoId !== "system" && !todoId.startsWith("end-")) {
            this.activeNotifications.add(todoId);
        }

        // 音を鳴らす（SoundManagerへの委譲）
        SoundManager.playNotifier(soundType);

        const container = document.getElementById('toast-container');
        if (!container) return;

        // トースト要素の作成
        const toast = document.createElement('div');
        toast.id = `toast-${todoId}`;
        toast.className = 'toast-item';
        
        // どこをクリックしても通知が消えるようにする
        toast.style.cursor = 'pointer'; 
        toast.onclick = () => this.dismiss(todoId);

        // トースト内のHTML構造（タイトル、閉じるボタン、メッセージ）
        toast.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items: flex-start;">
                <strong style="padding-right: 10px;">${title}</strong>
                <span class="close-btn" style="
                    font-size: 24px; 
                    line-height: 24px; 
                    width: 32px; 
                    height: 32px; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center;
                    margin-top: -5px;
                    margin-right: -10px;
                ">×</span>
            </div>
            <div style="font-size:0.9em; margin-top:5px;">${message}</div>
        `;
        
        container.appendChild(toast);
        this.updateBlinkingState(); // タブの点滅状態を更新
    },

    // ユーザーが通知をクリック（または×ボタン）して閉じた時の処理
    dismiss(todoId) {
        // 終了通知以外は「ユーザーが手動で消した」というフラグを立て、復活を防ぐ
        if (todoId !== "system" && !todoId.startsWith("end-")) {
            this.dismissedNotifications.add(todoId); 
        }
        this.removeNotification(todoId);
    },

    // 画面からトースト要素をアニメーション付きで取り除く
    removeNotification(todoId) {
        const toast = document.getElementById(`toast-${todoId}`);
        
        if (toast && !toast.classList.contains('exit')) { 
            toast.classList.add('exit'); // CSSアニメーション（フェードアウト/スライドアウト等）を開始
            
            const onAnimationEnd = () => {
                toast.remove();
                this.activeNotifications.delete(todoId);
                this.updateBlinkingState(); // すべての通知が消えたらタブ点滅を止める
            };

            // アニメーション完了後に確実にDOMから削除する
            toast.addEventListener('animationend', onAnimationEnd, { once: true });
            // 万が一アニメーションイベントが発火しなかった時のための安全策
            setTimeout(onAnimationEnd, 500); 
        }
    },

    // --------------------------------------------------------
    // 3. メインループからの監視処理 (Check Routine)
    // --------------------------------------------------------
    
    // App.js の tick() から呼ばれ、現在時刻とタスク状況を比較して通知を出すか判断する
    check(todos) {
        const now = new Date();
        const currentTime = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
        const config = TodoStore.notifyConfig;

        for (let i = 0; i < todos.length; i++) {
            const t = todos[i];
            if (t.isCompleted || t.isDeleted) continue; // 完了・削除済みのものは無視

            // 状態判定
            const isRunning = (t.start <= currentTime && t.end > currentTime);
            const isFinished = (t.end <= currentTime);

            // タスク個別の通知設定（override）と、全体設定（config）をかけ合わせて、通知を出すべきかを決定する
            const override = t.notifyOverride || 'default';
            const shouldNotifyStart = (override === 'all' || override === 'start' || (override === 'default' && config.startNotify));
            const shouldNotifyEnd   = (override === 'all' || override === 'end'   || (override === 'default' && config.endNotify));

            // ① 【最優先】タスク終了時の通知
            if (shouldNotifyEnd && t.hasTime && t.end !== "23:59" && isFinished) {
                if (!t.endNotified) {
                    t.endNotified = true; // 同じ終了通知が何度も鳴らないようにフラグを立てて保存
                    TodoStore.saveCurrent(TodoStore.currentData); 

                    // 終了通知はIDに 'end-' というプレフィックスを付けることで、開始通知と区別する
                    this.send("⏱ Todo終了の時間です", `${t.name} の終了時間になりました。`, `end-${t.id}`, config.endSound);

                    // ★重要: 終了通知のメロディが鳴っている最中に別の通知処理が走って音が重なるのを防ぐため、
                    // メロディの長さを計算し、App側に「その時間＋500msは次の処理を待ってくれ」と要求して即 return する
                    const durationMs = SoundManager.getDurationMs(config.endSound);
                    return durationMs + 500; 
                }
            }

            // ② タスク開始時の通知
            // （※もし上の終了通知が発火して return された場合、この処理は次回のループへ先送りされる）
            if (shouldNotifyStart && isRunning) {
                // 表示中でなく、消去済みでもない場合のみ通知
                if (!this.activeNotifications.has(t.id) && !this.dismissedNotifications.has(t.id)) {
                    const timeDisplay = t.end === "23:59" ? `${t.start}～` : `${t.start}～${t.end}`;
                    this.send("⏱ Todo開始の時間です", `${t.name} (${timeDisplay})`, t.id, config.startSound);
                }
            } 

            // ③ 終了時間を過ぎたタスクのクリーンアップ
            // 開始通知が出しっぱなしになっていれば消し、履歴からも削除する
            if (isFinished) {
                this.dismissedNotifications.delete(t.id);
                if (this.activeNotifications.has(t.id)) {
                    this.removeNotification(t.id);
                }
            }
        }

        // 何も重なるような重大な通知（終了通知）が出なかった時は、falseを返してAppに通常間隔でのループを許可する
        return false;
    },

    // --------------------------------------------------------
    // 4. ブラウザタブの点滅演出 (Blinking Tab Title)
    // --------------------------------------------------------
    
    // 表示されているトーストの数を確認し、点滅を開始/停止する
    updateBlinkingState() {
        const toastCount = document.querySelectorAll('.toast-item').length;
        if (toastCount > 0) {
            this.startBlinking(); 
        } else {
            this.stopBlinking();  
        }
    },

    // 1秒間隔でタブのタイトルを「【！】新着Todo」と元のタイトルで切り替える
    startBlinking() {
        if (this.blinkInterval) return; // 既に点滅中ならスキップ
        this.blinkInterval = setInterval(() => {
            document.title = document.title === "【！】新着Todo" ? this.originalTitle : "【！】新着Todo";
        }, 1000);
    },

    // タイトルの点滅を終了し、元のタイトルに戻す
    stopBlinking() {
        if (this.blinkInterval) {
            clearInterval(this.blinkInterval);
            this.blinkInterval = null;
        }
        document.title = this.originalTitle;
    }
};