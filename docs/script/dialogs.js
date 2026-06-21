/* ============================
   ダイアログ系の制御まとめ
   目的: ユーザーへの確認ダイアログ（削除、完全完了）や、
         特殊な操作（曜日コピー）を行うための小規模なモーダル群を管理する
   ============================ */

/* --------------------------------------------------------
   DayCopyModal: 曜日複製モーダル
   目的: 週間スケジュールの特定のタスクを、他の曜日にも一括でコピー、
         または一括で削除するためのUIとロジックを提供する
   -------------------------------------------------------- */
const DayCopyModal = {
    // どの曜日の、どのタスクを元にして開いているかを保持
    currentContext: { dIdx: null, todoId: null },
    // 日〜土の7日分の選択状態（true: コピーする/維持する, false: コピーしない/削除する）
    selectedDays: new Array(7).fill(false),

    init() {
        // 各曜日のトグルボタンにクリックイベントを紐付ける
        const buttons = document.querySelectorAll('#copy-day-buttons .day-btn');
        buttons.forEach(btn => {
            btn.onclick = () => {
                const idx = parseInt(btn.dataset.idx);
                this.selectedDays[idx] = !this.selectedDays[idx]; // 状態を反転
                btn.classList.toggle('active', this.selectedDays[idx]); // 見た目を更新
            };
        });

        document.getElementById('copy-cancel').onclick = () => this.close();
        document.getElementById('copy-save').onclick = () => this.handleSave();
    },

    open(dIdx, todoId) {
        this.currentContext = { dIdx, todoId };
        this.selectedDays.fill(false); // 一旦すべて未選択にリセット

        // 元となるタスクのデータを取得
        const baseTodo = TodoStore.data[dIdx].find(t => t.id === todoId);
        if (!baseTodo) return;

        // 全曜日を走査し、既に同じ内容（名前・時間・タイプが完全一致）のタスクが存在するかをチェック
        for (let i = 0; i < 7; i++) {
            // 操作の起点となった曜日自身は、最初から選択状態(true)にしておく
            if (i === dIdx) {
                this.selectedDays[i] = true;
                continue;
            }
            
            const hasSameTodo = TodoStore.data[i].some(t => 
                t.name === baseTodo.name &&
                t.start === baseTodo.start &&
                t.end === baseTodo.end &&
                t.hasTime === baseTodo.hasTime &&
                t.taskType === baseTodo.taskType
            );

            // 同じタスクが既に設定されている曜日は、あらかじめ選択状態(true)にする
            if (hasSameTodo) {
                this.selectedDays[i] = true;
            }
        }

        document.getElementById('day-copy-modal').style.display = 'flex';

        // 判定した選択状態をUI（ボタンの見た目）に反映させる
        const buttons = document.querySelectorAll('#copy-day-buttons .day-btn');
        buttons.forEach(btn => {
            const idx = parseInt(btn.dataset.idx);
            btn.classList.toggle('active', this.selectedDays[idx]);
        });
    },

    close() {
        document.getElementById('day-copy-modal').style.display = 'none';
    },

    handleSave() {
        const { dIdx, todoId } = this.currentContext;
        const baseTodo = TodoStore.data[dIdx].find(t => t.id === todoId);
        if (!baseTodo) return;

        // 7つの曜日すべてに対して、追加・維持・削除の判定を行う
        for (let i = 0; i < 7; i++) {
            const isSelected = this.selectedDays[i];

            // その曜日に既に同じタスクが存在するかをチェック
            const existingTodo = TodoStore.data[i].find(t => 
                t.name === baseTodo.name &&
                t.start === baseTodo.start &&
                t.end === baseTodo.end &&
                t.hasTime === baseTodo.hasTime &&
                t.taskType === baseTodo.taskType
            );

            if (isSelected) {
                // 【選択されている場合】
                // 既存のものがなく、かつ自分自身（コピー元）でなければ新しくコピーを追加する
                if (!existingTodo && i !== dIdx) {
                    const newId = "id-" + Date.now() + Math.random().toString(36).substr(2, 5);
                    TodoStore.data[i].push({ ...baseTodo, id: newId });
                }
            } else {
                // 【選択されていない（チェックが外された）場合】
                if (i === dIdx) {
                    // もしコピー元自身のチェックが外された場合は、大元を削除する
                    TodoStore.data[i] = TodoStore.data[i].filter(t => t.id !== todoId);
                } else if (existingTodo) {
                    // 他の曜日でチェックが外された場合は、そこにある既存の同名タスクを削除する
                    TodoStore.data[i] = TodoStore.data[i].filter(t => t.id !== existingTodo.id);
                }
            }
        }

        // 週間スケジュールとして保存し、画面を再描画
        TodoStore.saveWeekly(TodoStore.data);
        this.close();
        App.updateView();
    }
};

/* --------------------------------------------------------
   DeleteModal: 削除確認モーダル
   目的: 誤操作を防ぐための、汎用的な「本当に削除しますか？」のダイアログ
   -------------------------------------------------------- */
const DeleteModal = {
    // infoText: ダイアログに表示するタスク名や時間のテキスト
    // onConfirm: ユーザーが「削除」ボタンを押した時に実行されるコールバック関数
    open(infoText, onConfirm) {
        document.getElementById('delete-modal-info').textContent = infoText;
        document.getElementById('delete-modal').style.display = 'flex';
        
        // OKボタンが押されたらコールバックを実行し、ダイアログを閉じる
        document.getElementById('delete-confirm').onclick = () => {
            onConfirm();
            this.close();
        };
        document.getElementById('delete-cancel').onclick = () => this.close();
    },
    close() {
        document.getElementById('delete-modal').style.display = 'none';
    }
};

/* --------------------------------------------------------
   FullCompleteModal: 完全完了確認モーダル
   目的: 誤操作を防ぐための、汎用的な「完全に完了にして非表示にしますか？」のダイアログ
   -------------------------------------------------------- */
const FullCompleteModal = {
    // DeleteModalとほぼ同じ構造で、表示テキストとボタンの色（クラス）が異なる
    open(infoText, onConfirm) {
        document.getElementById('full-complete-modal-info').textContent = infoText;
        document.getElementById('full-complete-modal').style.display = 'flex';
        
        document.getElementById('full-complete-confirm').onclick = () => {
            onConfirm();
            this.close();
        };
        document.getElementById('full-complete-cancel').onclick = () => this.close();
    },
    close() {
        document.getElementById('full-complete-modal').style.display = 'none';
    }
};

/* --------------------------------------------------------
   AllFullCompleteModal: 全て完全完了確認モーダル
   目的: 複数のタスクを一括で完全完了にする前の確認とリスト表示
   -------------------------------------------------------- */
const AllFullCompleteModal = {
    open(infoText, onConfirm) {
        document.getElementById('all-full-complete-modal-info').textContent = infoText;
        document.getElementById('all-full-complete-modal').style.display = 'flex';
        
        document.getElementById('all-full-complete-confirm').onclick = () => {
            onConfirm();
            this.close();
        };
        document.getElementById('all-full-complete-cancel').onclick = () => this.close();
    },
    close() {
        document.getElementById('all-full-complete-modal').style.display = 'none';
    }
};