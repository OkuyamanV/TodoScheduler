/* ============================
   TaskManager: タスクデータの操作（作成・更新・削除・状態変更）を担うコントローラー
   目的: モーダル等からの入力を受け取り、TodoStoreのデータを安全に書き換えて画面を更新する
   ============================ */
const TaskManager = {
    // --------------------------------------------------------
    // タスクの保存・更新（新規作成＆編集のすべてをここで処理）
    // --------------------------------------------------------
    handleSave() {
        // 1. 入力フォームから各種設定値を取得
        const name = document.getElementById('input-todo-name').value;
        const hasTime = document.getElementById('input-has-time').value === 'true';
        const taskType = document.getElementById('input-task-type').value;
        const isCarryOver = document.getElementById('input-is-carry-over').checked;
        const notifyOverride = document.getElementById('input-notify-override').value;

        // 時間の取得（時間指定なしの場合は内部的に "23:59" として扱う）
        const start = TodoModal.getTime('start');
        const end = hasTime ? TodoModal.getTime('end') : "23:59";

        // 2. バリデーション（開始時間が終了時間より後になっていないか）
        if (hasTime && start >= end) {
            document.getElementById('time-error-msg').style.display = 'block';
            return;
        }

        // 3. 実行コンテキスト（今、どの画面の何のタスクを編集/作成しているか）を取得
        const { dayIdx, todoId, isAdhoc, isDaily, isRevert, isCurrentEdit } = App.currentContext;
        let targetId = todoId; // 既存タスクの編集ならそのIDを引き継ぐ
        
        // 終了時間が未来に変更されたかどうかの判定（通知フラグの再リセットに使用）
        const now = new Date();
        const currentTime = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
        const isFutureMove = (todoId !== null && end > currentTime);

        /* --- ここからコンテキストに応じた保存処理の分岐 --- */

        // 【分岐A】現在のタスク（今日のリスト）の直接編集
        if (isCurrentEdit) {
            const index = TodoStore.currentData.todos.findIndex(t => t.id === todoId);
            if (index !== -1) {
                const oldTodo = TodoStore.currentData.todos[index];
                const currentEndNotified = oldTodo.endNotified;
                
                // TaskFactoryを使って安全に上書き
                TodoStore.currentData.todos[index] = TaskFactory.create({ 
                    ...oldTodo,
                    name, start, end, hasTime, taskType, isCarryOver, notifyOverride,
                    // 終了時間が未来に延ばされた場合は通知済みフラグをリセットする
                    endNotified: isFutureMove ? false : currentEndNotified
                });
                
                // 延ばされた場合は通知の予約もリセット
                if (isFutureMove && typeof TodoNotifier !== 'undefined') TodoNotifier.resetNotification(todoId);
            }
            TodoStore.saveCurrent(TodoStore.currentData);
            TodoModal.close();
            App.updateView();
            App.scheduleNextTick(0);
            return; // ここで処理完了
        }

        // 【分岐B】完了/削除済みタスクを「未完了」に戻す（復活処理）
        if (isRevert) {
            const oldIndex = TodoStore.currentData.todos.findIndex(t => t.id === todoId);
            let fromWeeklyId = null;
            let fromDailyId = null;
            
            // 元データの紐付け情報（週間/日間由来か）を保持しつつ、古いデータを一度消す
            if (oldIndex !== -1) {
                fromWeeklyId = TodoStore.currentData.todos[oldIndex].fromWeeklyId;
                fromDailyId = TodoStore.currentData.todos[oldIndex].fromDailyId;
                TodoStore.currentData.todos.splice(oldIndex, 1);
            }
            
            // 新しいIDを付与して、真っ新な「未完了」タスクとして再作成
            targetId = "id-" + Date.now() + Math.random().toString(36).substr(2, 5);
            TodoStore.currentData.todos.push(TaskFactory.create({ 
                id: targetId, name, start, end, hasTime, taskType, isCarryOver, notifyOverride,
                isCompleted: false, isDeleted: false, endNotified: false, completedTime: null,
                isAdhoc: !(fromWeeklyId || fromDailyId), // どこにも紐付いていなければ単発扱い
                fromWeeklyId, fromDailyId
            }));
            
            TodoStore.saveCurrent(TodoStore.currentData);
            if (typeof TodoNotifier !== 'undefined') TodoNotifier.resetNotification(targetId);
            TodoModal.close();
            App.updateView();
            App.scheduleNextTick(0);
            return; 
        }

        // 【分岐C】単発（今日だけのアドホック）タスクの保存
        if (isAdhoc) {
            if (todoId !== null) {
                // 既存の単発タスクの編集
                const index = TodoStore.currentData.todos.findIndex(t => t.id === todoId);
                if (index !== -1) {
                    const oldTodo = TodoStore.currentData.todos[index];
                    const currentEndNotified = oldTodo.endNotified;
                    TodoStore.currentData.todos[index] = TaskFactory.create({ 
                        ...oldTodo,
                        name, start, end, hasTime, taskType, isAdhoc: true, isCarryOver, notifyOverride,
                        endNotified: isFutureMove ? false : currentEndNotified
                    });
                    if (isFutureMove && typeof TodoNotifier !== 'undefined') TodoNotifier.resetNotification(todoId);
                }
            } else {
                // 新規の単発タスクの作成
                targetId = "id-" + Date.now() + Math.random().toString(36).substr(2, 5);
                TodoStore.currentData.todos.push(TaskFactory.create({ 
                    id: targetId, name, start, end, hasTime, taskType, isAdhoc: true, isCarryOver, notifyOverride
                }));
            }
            TodoStore.saveCurrent(TodoStore.currentData);
        } 
        
        // 【分岐D】日間スケジュール（ルーチン）の保存
        else if (isDaily) {
            if (todoId !== null) {
                // 1. 日間の大元データを更新
                const index = TodoStore.dailyData.findIndex(t => t.id === todoId);
                if (index !== -1) {
                    const oldDaily = TodoStore.dailyData[index];
                    TodoStore.dailyData[index] = TaskFactory.create({ 
                        ...oldDaily,
                        name, start, end, hasTime, taskType, isCarryOver, notifyOverride 
                    });
                }
                
                // 2. 既に「今日のリスト」に展開されているコピーがあれば、それも連動して更新する
                const cTodoIndex = TodoStore.currentData.todos.findIndex(t => t.fromDailyId === todoId);
                if (cTodoIndex !== -1) {
                    const cTodo = TodoStore.currentData.todos[cTodoIndex];
                    TodoStore.currentData.todos[cTodoIndex] = TaskFactory.create({
                        ...cTodo,
                        name, start, end, hasTime, taskType, isCarryOver, notifyOverride,
                        endNotified: isFutureMove ? false : cTodo.endNotified
                    });
                    if (isFutureMove && typeof TodoNotifier !== 'undefined') TodoNotifier.resetNotification(cTodo.id);
                }
            } else {
                // 新規の日間タスク作成
                targetId = "id-" + Date.now() + Math.random().toString(36).substr(2, 5);
                TodoStore.dailyData.push(TaskFactory.create({ 
                    id: targetId, name, start, end, hasTime, taskType, isCarryOver, notifyOverride 
                }));
                
                // 追加した瞬間に「今日のリスト」にもコピーを展開する
                TodoStore.currentData.todos.push(TaskFactory.create({ 
                    fromDailyId: targetId,
                    name, start, end, hasTime, taskType, isCarryOver, notifyOverride
                }));
            }
            TodoStore.saveDaily(TodoStore.dailyData);
            TodoStore.saveCurrent(TodoStore.currentData);
        } 
        
        // 【分岐E】週間スケジュールの保存（デフォルト）
        else {
            if (todoId !== null) {
                // 1. 週間の大元データを更新
                const index = TodoStore.data[dayIdx].findIndex(t => t.id === todoId);
                if (index !== -1) {
                    const oldWeekly = TodoStore.data[dayIdx][index];
                    TodoStore.data[dayIdx][index] = TaskFactory.create({ 
                        ...oldWeekly,
                        name, start, end, hasTime, taskType, isCarryOver, notifyOverride 
                    });
                }
                
                // 2. 今日のリストに展開済みのコピーがあれば連動して更新
                const cTodoIndex = TodoStore.currentData.todos.findIndex(t => t.fromWeeklyId === todoId);
                if (cTodoIndex !== -1) {
                    const cTodo = TodoStore.currentData.todos[cTodoIndex];
                    TodoStore.currentData.todos[cTodoIndex] = TaskFactory.create({
                        ...cTodo,
                        name, start, end, hasTime, taskType, isCarryOver, notifyOverride,
                        endNotified: isFutureMove ? false : cTodo.endNotified
                    });
                    if (isFutureMove && typeof TodoNotifier !== 'undefined') TodoNotifier.resetNotification(cTodo.id);
                }
            } else {
                // 新規の週間タスク作成
                targetId = "id-" + Date.now() + Math.random().toString(36).substr(2, 5);
                TodoStore.data[dayIdx].push(TaskFactory.create({ 
                    id: targetId, name, start, end, hasTime, taskType, isCarryOver, notifyOverride 
                }));
                
                // 編集中の曜日が「今日」であれば、即座に今日のリストにもコピーを展開する
                if (dayIdx === new Date().getDay()) {
                    TodoStore.currentData.todos.push(TaskFactory.create({
                        fromWeeklyId: targetId,
                        name, start, end, hasTime, taskType, isCarryOver, notifyOverride
                    }));
                }
            }
            TodoStore.saveWeekly(TodoStore.data);
            TodoStore.saveCurrent(TodoStore.currentData);
        }

        // 4. 保存後の事後処理（通知リセット、モーダルを閉じる、再描画）
        if (typeof TodoNotifier !== 'undefined') TodoNotifier.resetNotification(targetId);
        TodoModal.close();
        App.updateView();
        App.scheduleNextTick(0);
    },

    // --------------------------------------------------------
    // タスクの削除（大元データの削除）
    // --------------------------------------------------------
    
    // 週間タスクの削除
    deleteTodo(dIdx, todoId) {
        const todo = TodoStore.data[dIdx].find(t => t.id === todoId);
        if (!todo) return;
        const timeStr = todo.end === "23:59" ? `${todo.start}～` : `${todo.start}～${todo.end}`;
        const infoText = `${todo.name}  ${timeStr} (${App.days[dIdx]}曜日)`;

        // 削除確認モーダルを表示
        DeleteModal.open(infoText, () => {
            // 1. 週間の大元データから削除
            TodoStore.data[dIdx] = TodoStore.data[dIdx].filter(t => t.id !== todoId);
            TodoStore.saveWeekly(TodoStore.data); 
            
            // 2. 今日のリスト（Current）にコピーがあれば、それも連動して削除
            TodoStore.currentData.todos = TodoStore.currentData.todos.filter(t => t.fromWeeklyId !== todoId);
            TodoStore.saveCurrent(TodoStore.currentData);
            App.updateView();
        });
    },

    // 日間タスクの削除
    deleteDailyTodo(todoId) {
        const todo = TodoStore.dailyData.find(t => t.id === todoId);
        if (!todo) return;
        const timeStr = todo.end === "23:59" ? `${todo.start}～` : `${todo.start}～${todo.end}`;
        const infoText = `${todo.name}  ${timeStr}`;

        DeleteModal.open(infoText, () => {
            // 1. 日間の大元データから削除
            TodoStore.dailyData = TodoStore.dailyData.filter(t => t.id !== todoId);
            TodoStore.saveDaily(TodoStore.dailyData);
            
            // 2. 今日のリスト（Current）にコピーがあれば連動して削除
            TodoStore.currentData.todos = TodoStore.currentData.todos.filter(t => t.fromDailyId !== todoId);
            TodoStore.saveCurrent(TodoStore.currentData);
            App.updateView();
        });
    },
    
    // --------------------------------------------------------
    // 現在のタスク（今日のタスク）の状態変更
    // --------------------------------------------------------

    // 通常完了 (チェックボタンクリック)
    completeTodo(todoId) {
        const todo = TodoStore.currentData.todos.find(t => t.id === todoId);
        if (todo) {
            todo.isCompleted = true;
            // 完了した時間を記録（UIの「何時何分に完了」表示用）
            const now = new Date();
            todo.completedTime = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
        }

        // 完了したタスクの通知は不要になるためキャンセル
        if (typeof TodoNotifier !== 'undefined') {
            TodoNotifier.dismiss(todoId);         
            TodoNotifier.dismiss('end-' + todoId); 
        }

        // エフェクトとサウンドの再生
        const config = TodoStore.notifyConfig;
        if (config.completeSound) SoundManager.playComplete(config.completeSoundType);
        if (config.completeEffect !== false) EffectManager.playComplete();

        TodoStore.saveCurrent(TodoStore.currentData);
        App.updateView();
    },

    // ゴミ箱への削除（Currentタスク専用）
    deleteCurrentTodo(todoId) {
        const todo = TodoStore.currentData.todos.find(t => t.id === todoId);
        if (!todo) return;
        const timeStr = todo.end === "23:59" ? `${todo.start}～` : `${todo.start}～${todo.end}`;
        const infoText = `${todo.name}  ${timeStr}`;

        DeleteModal.open(infoText, () => {
            // 完全に消すのではなく、isDeletedフラグを立ててゴミ箱タブに移動させる
            todo.isDeleted = true;
            if (typeof TodoNotifier !== 'undefined') {
                TodoNotifier.dismiss(todoId);         
                TodoNotifier.dismiss('end-' + todoId); 
            }
            TodoStore.saveCurrent(TodoStore.currentData);
            App.updateView();
        });
    },

    // 完全完了 (画面からの完全消去)
    confirmFullComplete(todoId) {
        const todo = TodoStore.currentData.todos.find(t => t.id === todoId);
        if (!todo) return;
        const timeStr = todo.end === "23:59" ? `${todo.start}～` : `${todo.start}～${todo.end}`;
        const infoText = `${todo.name}  ${timeStr}`;

        // 完全完了確認モーダルを表示
        FullCompleteModal.open(infoText, () => {
            // isFullCompletedフラグを立てることで、どのタブ（未完了/完了/ゴミ箱）からも非表示になる
            todo.isFullCompleted = true;
            TodoStore.saveCurrent(TodoStore.currentData);

            // 豪華なエフェクトとサウンドの再生
            const config = TodoStore.notifyConfig;
            if (config.fullCompleteSound) SoundManager.playComplete(config.fullCompleteSoundType);
            if (config.fullCompleteEffect !== false) EffectManager.playFullComplete();

            App.updateView();
        });
    },

    // --------------------------------------------------------
    // 全てのタスクを一括で完全完了
    // --------------------------------------------------------
    confirmAllFullComplete() {
        // 現在の完了済みタスク（完全完了・削除済みを除く）を抽出
        const completedTodos = TodoStore.currentData.todos.filter(t => t.isCompleted && !t.isFullCompleted && !t.isDeleted);
        
        // タスクが2つ以上ない場合は処理しない
        if (completedTodos.length < 2) return;

        // モーダルに表示する全タスクのテキストを生成（改行区切り）
        const infoText = completedTodos.map(todo => {
            const timeStr = todo.end === "23:59" ? `${todo.start}～` : `${todo.start}～${todo.end}`;
            return `${todo.name}  ${timeStr}`;
        }).join('\n');

        // 一括完全完了確認モーダルを表示
        AllFullCompleteModal.open(infoText, () => {
            // 対象の全タスクに完全完了フラグを立てる
            completedTodos.forEach(todo => {
                todo.isFullCompleted = true;
            });
            TodoStore.saveCurrent(TodoStore.currentData);

            // エフェクトとサウンドの再生（一括なので1回だけ鳴らす）
            const config = TodoStore.notifyConfig;
            if (config.fullCompleteSound) SoundManager.playComplete(config.fullCompleteSoundType);
            if (config.fullCompleteEffect !== false) EffectManager.playFullComplete();

            App.updateView();
        });
    }
};