/* ============================
   TodoRenderer: 画面描画（レンダリング）エンジン
   目的: TodoStoreのデータを元にHTML文字列を生成し、画面(DOM)に反映させる
   ============================ */
const TodoRenderer = {
    // --------------------------------------------------------
    // 1. 現在のTodo（今日のリスト）の描画
    // --------------------------------------------------------
    // todos: 表示対象のタスク配列, sortType: 並び順('start'/'end'など), viewMode: 'incomplete'または'completed'
    renderCurrent(todos, sortType, viewMode = 'incomplete') {
        const listEl = document.getElementById('current-list');
        
        // 指定されたソート条件（開始時間順・終了時間順など）で配列を並び替える
        const sorted = [...todos].sort((a, b) => a[sortType].localeCompare(b[sortType]));
        
        const sectionHeader = document.querySelector('#section-current .section-header');
        if (sectionHeader) {
            if (viewMode === 'completed') {
                sectionHeader.style.borderBottomColor = 'var(--complete-color)'; 
            } else {
                sectionHeader.style.borderBottomColor = ''; 
            }
        }

        // 現在のモードに合わせてタイトルの内容を変更する
        const titleEl = document.getElementById('current-section-title');
        if (titleEl) {
            titleEl.textContent = viewMode === 'completed' ? '完了したTodo' : '現在のTodo';
        }

        const now = new Date();
        const currentTime = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
        const todayIdx = new Date().getDay();
        
        // リストの一番下に追加する「+ 追加」ボタンのHTML
        const addButtonHtml = `<button class="add-btn" onclick="App.addTodo(${todayIdx}, true)">+ 現在のTodoに追加</button>`;
        
        /* === ① 完了済みタスクの表示モード === */
        if (viewMode === 'completed') {
            
            // リストが空の場合のメッセージ処理
            if (sorted.length === 0) {
                // 完全完了（画面から消去）したタスクの数をカウント
                const fullCompletedCount = TodoStore.currentData.todos.filter(t => t.isFullCompleted && !t.isDeleted).length;
                
                if (fullCompletedCount > 0) {
                    // 全て完全完了済みの場合（達成感を演出）
                    listEl.innerHTML = `<p style="text-align: center; color: #5f6368; font-weight: bold; margin-top: 25px; font-size: 1.05rem;">本日 ${fullCompletedCount} 件のタスクを完全完了しました</p>`;
                } else {
                    // まだ1つも完了していない場合
                    listEl.innerHTML = `<p style="text-align: center; color: #5f6368; margin-top: 25px;">本日完了済みのタスクはありません</p>`;
                }
            } else {
                listEl.innerHTML = '';
            }
            
            // 完了済みタスクのHTML生成ループ
            sorted.forEach(t => {
                let badgeClass = 'badge-green'; // デフォルトは緑色の完了バッジ
                let isLate = false;
                
                // 遅刻判定（チェックタイプ かつ 時間指定あり かつ 終了時間を過ぎてから完了したか）
                if (t.taskType === 'check' && t.hasTime && t.end !== "23:59") {
                    if (t.completedTime && t.completedTime > t.end) {
                        badgeClass = 'badge-red'; // 遅刻時はバッジを赤に変更
                        isLate = true; 
                    }
                }
                
                // 遅刻している場合は専用のクラス（赤い枠線や背景）を付与
                const itemRowClass = isLate ? 'todo-item completed-item overdue-completed' : 'todo-item completed-item';
                
                // バッジに表示する時間（完了時間があればそれ、なければ終了時間）
                const displayBadgeTime = t.completedTime || t.end;
                const startPart = t.start;
                const sepPart = '～';
                const endPart = (t.hasTime && t.end !== "23:59") ? t.end : '';
            
                // HTMLを生成してリストに追記
                listEl.innerHTML += `
                    <div class="${itemRowClass}">
                        <div class="todo-action">
                            <div class="todo-badge ${badgeClass}">${displayBadgeTime}</div>
                        </div>
                        <div class="todo-name" title="${t.name}">${t.name}</div>
                        <div style="display: flex; align-items: center; justify-content: flex-end; gap: 10px;">
                            <div class="todo-time">
                                <span class="time-start">${startPart}</span>
                                <span class="time-sep">${sepPart}</span>
                                <span class="time-end">${endPart}</span>
                            </div>
                            <div style="position: relative; text-align: right; margin-left: 5px;">
                                <span class="menu-dots" onclick="App.toggleMenu('completed-${t.id}')">⋮</span>
                                <div class="dropdown" id="menu-completed-${t.id}">
                                    <button onclick="App.revertToIncomplete('${t.id}')">未完了にする</button>
                                    <button class="complete-btn" style="color: var(--complete-color); font-weight: bold;" onclick="App.confirmFullComplete('${t.id}')">完全完了</button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });

            // 完了済みのタスクが2つ以上ある場合のみボタンを表示する
            if (sorted.length >= 2) {
                const allCompleteBtnHtml = `<button class="add-btn" style="background: var(--complete-color); color: white; border: none; margin-top: 15px; font-weight: bold; border-radius: 6px; box-shadow: 0 2px 4px rgba(111, 188, 240, 0.4);" onclick="App.confirmAllFullComplete()">✓ 全てのタスクを完全完了</button>`;
                listEl.innerHTML += allCompleteBtnHtml;
            }
            
        } 
        /* === ② 未完了タスクの表示モード === */
        else {
            listEl.innerHTML = sorted.length ? '' : '<p>予定なし</p>';
            
            sorted.forEach(t => {
                // 期限切れ（オーバーデュ）判定：チェックタイプ かつ 終了時間が現在時刻を過ぎている
                const isOverdue = (t.taskType === 'check' && t.hasTime && t.end < currentTime);
                const className = isOverdue ? 'todo-item overdue' : 'todo-item'; // 期限切れなら赤くする
                
                // チェックタイプのタスクのみ「✅ 完了」ボタンを表示する（時間経過タイプは表示しない）
                const checkButton = (t.taskType === 'check' && !t.isCompleted) 
                    ? `<button class="check-btn" onclick="App.completeTodo('${t.id}')"><span style="margin-right: 4px;">✓</span>完了</button>` 
                    : '';

                const startPart = t.start;
                const sepPart = '～';
                const endPart = (t.hasTime && t.end !== "23:59") ? t.end : '';
            
                listEl.innerHTML += `
                    <div class="${className}">
                        <div class="todo-action">${checkButton}</div>
                        <div class="todo-name" title="${t.name}">${t.name}</div>
                        <div style="display: flex; align-items: center; justify-content: flex-end; gap: 10px;">
                            <div class="todo-time">
                                <span class="time-start">${startPart}</span>
                                <span class="time-sep">${sepPart}</span>
                                <span class="time-end">${endPart}</span>
                            </div>
                            <div style="position: relative; text-align: right; margin-left: 5px;">
                                <span class="menu-dots" onclick="App.toggleMenu('incomplete-${t.id}')">⋮</span>
                                <div class="dropdown" id="menu-incomplete-${t.id}">
                                    <button onclick="App.editCurrentTodo('${t.id}')">編集</button>
                                    <button class="delete-btn" onclick="App.deleteCurrentTodo('${t.id}')">削除</button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });
            
            // 未完了リストの最後に「+ 追加」ボタンを配置
            listEl.innerHTML += addButtonHtml;
        }
    },

    // --------------------------------------------------------
    // 2. 週間スケジュール（7日分のグリッド）の描画
    // --------------------------------------------------------
    // allData: 0〜6の曜日別タスク配列, days: ['日',...], currentDay: 今日の曜日インデックス
    renderGrid(allData, days, currentDay) {
        const grid = document.getElementById('week-grid');
        grid.innerHTML = '';

        days.forEach((day, idx) => {
            const col = document.createElement('div');
            // 「今日」の曜日のカラム（列）には専用のハイライトクラスを付与する
            col.className = (idx === currentDay) ? 'day-column current-day-column' : 'day-column';

            // その曜日のタスク一覧をHTML化
            const todosHtml = allData[idx].map((t) => {
                const timeDisplay = (t.hasTime && t.end !== "23:59") ? `${t.start}～${t.end}` : `${t.start}～`;

                return `
                    <div class="saved-todo">
                        <b>${t.name}</b><br>
                        <small>${timeDisplay}</small>
                        <span class="menu-dots" onclick="App.toggleMenu('${t.id}')">⋮</span>
                        <div class="dropdown" id="menu-${t.id}">
                            <button onclick="App.openCopyModal(${idx}, '${t.id}')">曜日設定</button>
                            <button onclick="App.editTodo(${idx}, '${t.id}')">編集</button>
                            <button class="delete-btn" onclick="App.deleteTodo(${idx}, '${t.id}')">削除</button>
                        </div>
                    </div>
                `;
            }).join(''); // 配列を1つの文字列に結合

            // カラム全体（ヘッダー + タスク一覧 + 追加ボタン）の構築
            col.innerHTML = `
                <div class="day-header">${day}</div>
                ${todosHtml}
                <button class="add-btn" onclick="App.addTodo(${idx})">+ 追加</button>
            `;
            
            grid.appendChild(col);
        });
    },

    // --------------------------------------------------------
    // 3. 日間スケジュール（ルーチン）の描画
    // --------------------------------------------------------
    // todos: 日間タスクの配列, activeDays: 適用する曜日[0,1...], sortType: 並び順
    renderDaily(todos, activeDays, sortType) {
        // ① 適用曜日のトグルボタン（日〜土）の見た目を更新（選択されている曜日は色を変える）
        const dayButtons = document.querySelectorAll('#daily-header-days .day-btn');
        dayButtons.forEach(btn => {
            const idx = parseInt(btn.dataset.idx);
            btn.classList.toggle('active', activeDays.includes(idx));
        });

        // ② タスクリストの描画
        const container = document.getElementById('daily-list-container');
        const sorted = [...todos].sort((a, b) => a[sortType].localeCompare(b[sortType]));
        
        let html = '';
        sorted.forEach(t => {
            const timeDisplay = (t.hasTime && t.end !== "23:59") ? `${t.start}～${t.end}` : `${t.start}～`;
            const typeDisplay = t.taskType === 'check' ? 'チェック' : '時間経過';
            
            html += `
                <div class="daily-todo-row">
                    <div class="daily-todo-type">${typeDisplay}</div>
                    <div class="daily-todo-name" title="${t.name}">${t.name}</div>
                    <div class="daily-todo-time">${timeDisplay}</div>
                    <div style="position: relative; text-align: right;">
                        <span class="menu-dots" onclick="App.toggleMenu('daily-${t.id}')">⋮</span>
                        <div class="dropdown" id="menu-daily-${t.id}">
                            <button onclick="App.editDailyTodo('${t.id}')">編集</button>
                            <button class="delete-btn" onclick="App.deleteDailyTodo('${t.id}')">削除</button>
                        </div>
                    </div>
                </div>
            `;
        });
        
        // リストの最後に「+ 追加」ボタンを配置
        html += `<button class="add-btn" onclick="App.addDailyTodo()" style="margin-top: 5px;">+ 日間スケジュールを追加</button>`;
        container.innerHTML = html;
    }
};