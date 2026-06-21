/* ============================
   【データ構造仕様：タスクオブジェクト (Task Object Schema)】
   アプリ内でやり取りされるTodoデータは、以下のプロパティを持つオブジェクトとして扱われます。
   
   [基本情報]
   - id             : String  // 一意の識別子（例: "id-1623456789abcde"）
   - name           : String  // タスク名
   - start          : String  // 開始時間（"HH:MM"）
   - end            : String  // 終了時間（"HH:MM"、時間指定なしの場合は "23:59"）
   
   [設定・タイプ]
   - hasTime        : Boolean // 時間指定の有無（true: あり, false: なし）
   - taskType       : String  // タスクの種類（'duration': 期間, 'check': 単発チェック）
   - isCarryOver    : Boolean // 翌日への持ち越し設定（true: 持ち越す）
   - notifyOverride : String  // 個別通知設定（'default': 全体設定に従う, 'none': 通知しない 等）
   
   [状態管理フラグ]
   - isCompleted    : Boolean // 通常完了フラグ（true: 完了済み）
   - isFullCompleted: Boolean // 完全完了フラグ（true: 完全に画面から消去）
   - isDeleted      : Boolean // 削除済みフラグ（true: ゴミ箱行き / ※現在は Current 以外は配列から直接消去）
   - endNotified    : Boolean // 終了時間の通知が実行されたかどうかのフラグ
   - completedTime  : String  // 完了ボタンを押した時間、または自動完了した時間（"HH:MM" / 未完了時は null）
   
   [出自・リンク情報]
   - isAdhoc        : Boolean // 今日単発で追加されたタスクかどうか（true: 単発）
   - fromWeeklyId   : String  // 週間スケジュールから生成された場合、その元データのID（単発・日間の場合は null）
   - fromDailyId    : String  // 日間スケジュールから生成された場合、その元データのID（単発・週間の場合は null）
   ============================ */

/* ============================
   TaskFactory: タスク生成の雛形関数
   目的: どこでタスクを作っても必ず同じプロパティを持つようにし、バグを防ぐ
   ============================ */
const TaskFactory = {
    create(params = {}) {
        return {
            id: params.id || "id-" + Date.now() + Math.random().toString(36).substr(2, 5),
            name: params.name || "",
            start: params.start || "09:00",
            end: params.end || "10:00",
            hasTime: params.hasTime !== undefined ? params.hasTime : true,
            taskType: params.taskType || "duration",
            isCarryOver: !!params.isCarryOver,
            notifyOverride: params.notifyOverride || "default",
            
            isCompleted: !!params.isCompleted,
            isFullCompleted: !!params.isFullCompleted,
            isDeleted: !!params.isDeleted,
            endNotified: !!params.endNotified,
            completedTime: params.completedTime || null,
            
            isAdhoc: !!params.isAdhoc,
            fromWeeklyId: params.fromWeeklyId || null,
            fromDailyId: params.fromDailyId || null
        };
    }
};

/* ============================
   TodoStore: アプリケーションのデータ管理（LocalStorageとの通信と状態保持）
   目的: 週間、日間、現在のTodoデータ、および設定情報の保存と読み込みを行う
   ============================ */
const TodoStore = {

    // --------------------------------------------------------
    // 1. 週間スケジュール (Weekly Schedule)
    // --------------------------------------------------------
    // 各曜日（0:日曜日 〜 6:土曜日）ごとに固定で入るタスクのリストを管理。
    // LocalStorage Key: 'weeklyTodo'
    data: JSON.parse(localStorage.getItem('weeklyTodo')) || {
        0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: []
    },
    
    // --------------------------------------------------------
    // 2. 日間スケジュール (Daily Schedule)
    // --------------------------------------------------------
    // 毎日（指定した曜日に）共通で発生するルーチンタスクのリストを管理。
    // LocalStorage Key: 'dailyTodo'
    dailyData: JSON.parse(localStorage.getItem('dailyTodo')) || [],
    
    // 日間スケジュールを適用する「曜日」の配列（初期値は0〜6の毎日）。
    // LocalStorage Key: 'dailyActiveDays'
    dailyActiveDays: JSON.parse(localStorage.getItem('dailyActiveDays')) || [0, 1, 2, 3, 4, 5, 6],
    
    // --------------------------------------------------------
    // 3. 現在のTodo (Current Todo)
    // --------------------------------------------------------
    // 「今日」実行すべきタスクのリストと、その基準となる日付を管理。
    // 週間・日間スケジュールからコピーされたものや、今日単発で追加されたタスクが入る。
    // date: どの日付のデータか（日替わり判定に使用）
    // todos: 実際のタスクオブジェクトの配列
    // LocalStorage Key: 'currentTodoList'
    currentData: JSON.parse(localStorage.getItem('currentTodoList')) || {
        date: "",
        todos: []
    },

    // --------------------------------------------------------
    // 4. アプリケーション設定 (Settings / Notify Config)
    // --------------------------------------------------------
    // 通知音、完了エフェクトなどのユーザー設定を管理。
    // LocalStorage Key: 'notifyConfig'
    notifyConfig: JSON.parse(localStorage.getItem('notifyConfig')) || {
        startNotify: true,            // 開始時の通知 ON/OFF
        startSound: 'chime',          // 開始時の通知音種類
        endNotify: false,             // 終了時の通知 ON/OFF
        endSound: 'beep',             // 終了時の通知音種類
        volume: 0.5,                  // 通知音・完了音のマスター音量 (0.0 ~ 1.0)
        completeEffect: true,         // 通常完了時のエフェクト (ポワポワ) ON/OFF
        fullCompleteEffect: true,     // 完全完了時のエフェクト (紙吹雪) ON/OFF
        completeSound: false,         // 通常完了時のサウンド ON/OFF
        completeSoundType: 'melody',  // 通常完了時のサウンド種類
        fullCompleteSound: false,     // 完全完了時のサウンド ON/OFF
        fullCompleteSoundType: 'melody' // 完全完了時のサウンド種類
    },

    // ========================================================
    // データ保存用メソッド群 (Save Methods)
    // ========================================================
    
    // 週間スケジュールの保存
    saveWeekly(newData) {
        this.data = newData;
        localStorage.setItem('weeklyTodo', JSON.stringify(this.data));
    },

    // 現在のTodo（今日やるタスクと日付）の保存
    saveCurrent(newCurrentData) {
        this.currentData = newCurrentData;
        localStorage.setItem('currentTodoList', JSON.stringify(this.currentData));
    },

    // 日間スケジュール（ルーチンタスク自体）の保存
    saveDaily(newDailyData) {
        this.dailyData = newDailyData;
        localStorage.setItem('dailyTodo', JSON.stringify(this.dailyData));
    },

    // 日間スケジュールの適用曜日の保存
    saveDailyActiveDays(newActiveDays) {
        this.dailyActiveDays = newActiveDays;
        localStorage.setItem('dailyActiveDays', JSON.stringify(this.dailyActiveDays));
    },

    // アプリケーション設定の保存
    saveNotifyConfig(newConfig) {
        this.notifyConfig = newConfig;
        localStorage.setItem('notifyConfig', JSON.stringify(this.notifyConfig));
    },
    
    // ========================================================
    // データ取得用メソッド群 (Getter Methods)
    // ========================================================
    
    // 指定した曜日インデックス（0〜6）の週間スケジュール配列を取得
    getTodosByDay(dayIdx) {
        return this.data[dayIdx];
    }
};