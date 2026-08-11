/**
 * 排球對角紀錄表 App (v2.5.0)
 * 模組化邏輯：集中化 State 管理、事件委派 (Event Delegation)、非阻塞 Toast/Modal 系統
 */

// ================= 全域集中化 State 結構 =================
const state = {
    matchInfo: { date: '', time: '', location: '', opponent: '', round: '' },
    rolesMapping: { oh1: '', mb1: '', setter: '', opposite: '', oh2: '', mb2: '', libero: '' },
    playersDatabase: {},
    courtPositions: { pos1: '', pos2: '', pos3: '', pos4: '', pos5: '', pos6: '' },
    miniPositions: [],
    miniRotationIndex: 1,
    currentScores: { home: 0, away: 0 },
    fallZoneCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 },
    actionLedger: [],
    pos5CycleState: 0,
    currentActiveMb3: 'mb1',
    currentSetterStartPos: 'pos1'
};

let saveStorageTimer = null;

// ================= Service Worker 註冊 =================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW Registration failed:', err));
    });
}

// ================= 非阻塞式 Toast 提示系統 =================
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;

    let iconClass = 'fa-circle-info';
    if (type === 'success') iconClass = 'fa-circle-check';
    if (type === 'warning') iconClass = 'fa-triangle-exclamation';
    if (type === 'error') iconClass = 'fa-circle-xmark';

    toast.innerHTML = `<i class="fa-solid ${iconClass}"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-fade-out');
        toast.addEventListener('transitionend', () => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        });
    }, 2500);
}

// ================= 自訂非阻塞 Confirm Modal =================
function showConfirmModal({ title = '確定執行？', message = '', confirmText = '確定', cancelText = '取消', onConfirm }) {
    const existing = document.getElementById('custom-confirm-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'custom-confirm-modal';
    overlay.className = 'modal-overlay';

    overlay.innerHTML = `
        <div class="modal-box">
            <h3><i class="fa-solid fa-circle-question" style="color:#2563eb"></i> ${title}</h3>
            <p>${message}</p>
            <div class="modal-actions">
                <button class="btn" id="modal-btn-cancel" style="background:#e2e8f0; color:#334155; padding:6px 14px; font-size:13px;">${cancelText}</button>
                <button class="btn" id="modal-btn-confirm" style="background:#e11d48; color:white; padding:6px 16px; font-size:13px;">${confirmText}</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const closeModal = () => {
        overlay.classList.add('hidden');
        overlay.remove();
    };

    overlay.querySelector('#modal-btn-cancel').addEventListener('click', closeModal);
    overlay.querySelector('#modal-btn-confirm').addEventListener('click', () => {
        closeModal();
        if (typeof onConfirm === 'function') onConfirm();
    });
}

// ================= 本地持久化 (LocalStorage) =================
function saveGameToStorage() {
    try {
        localStorage.setItem('vball_current_match', JSON.stringify(state));
    } catch (e) {
        console.error("Save state failed:", e);
    }
}

function saveGameToStorageDebounced() {
    clearTimeout(saveStorageTimer);
    saveStorageTimer = setTimeout(() => {
        saveGameToStorage();
    }, 500);
}

window.addEventListener('beforeunload', () => {
    if (saveStorageTimer) {
        clearTimeout(saveStorageTimer);
        saveGameToStorage();
    }
});

window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && saveStorageTimer) {
        clearTimeout(saveStorageTimer);
        saveGameToStorage();
    }
});

function checkSavedGame() {
    try {
        let saved = localStorage.getItem('vball_current_match');
        if (saved) {
            let parsed = JSON.parse(saved);
            if (parsed && parsed.matchInfo && parsed.matchInfo.opponent) {
                const banner = document.getElementById('restore-banner-box');
                if (banner) banner.classList.remove('hidden');
            }
        }
    } catch (e) {}
}

function restoreSavedGame() {
    try {
        let saved = localStorage.getItem('vball_current_match');
        if (!saved) return;
        let data = JSON.parse(saved);

        Object.assign(state, data);

        document.getElementById('restore-banner-box').classList.add('hidden');
        document.getElementById('setup-section').classList.add('hidden');
        document.getElementById('operating-section').classList.remove('hidden');
        document.getElementById('action-buttons').classList.remove('hidden');

        document.getElementById('score-home').innerText = state.currentScores.home;
        document.getElementById('score-away').innerText = state.currentScores.away;

        for (let zone in state.fallZoneCounts) {
            let el = document.getElementById(`fall-count-${zone}`);
            if (el) el.innerText = state.fallZoneCounts[zone];
        }

        document.getElementById('match-info-banner-id').innerHTML = `
            <i class="fa-solid fa-file-invoice"></i> 
            <span>日期：<strong>${state.matchInfo.date || ''}</strong></span>
            <span>時間：<strong>${state.matchInfo.time || ''}</strong></span>
            <span>地點：<strong>${state.matchInfo.location || ''}</strong></span>
            <span>對手：<strong style="color:#2563eb">${state.matchInfo.opponent || ''}</strong></span>
            <span>場次：<strong>${state.matchInfo.round || ''}</strong></span>
        `;

        refreshUI();
        showToast("已成功復原上次比賽紀錄！", "success");
    } catch (e) {
        showToast("載入歷史紀錄失敗", "error");
    }
}

function clearSavedGame() {
    localStorage.removeItem('vball_current_match');
    const banner = document.getElementById('restore-banner-box');
    if (banner) banner.classList.add('hidden');
}

// ================= 球員紀錄初始化 & 行為日誌 =================
function initPlayerInDb(name, roleKey) {
    let chName = { oh1: "大砲手", oh2: "大砲手", mb1: "快攻手", mb2: "快攻手", setter: "舉球員", opposite: "副攻手", libero: "自由球員" }[roleKey] || "球員";
    if (!state.playersDatabase[name]) {
        state.playersDatabase[name] = {
            name: name, role: chName,
            stats: {
                s_total: 0, s_good: 0, s_err: 0,
                r_total: 0, r_err: 0,
                at_total: 0, at_good: 0, at_err: 0,
                b_total: 0, b_good: 0,
                d_total: 0, d_err: 0,
                st_total: 0, st_good: 0, st_err: 0
            }
        };
    }
}

function logAction(playerOrType, actionName, valDetail) {
    let now = new Date();
    let timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    state.actionLedger.push({
        timestamp: timeStr,
        actor: playerOrType,
        action: actionName,
        detail: valDetail,
        scoreState: `${state.currentScores.home}:${state.currentScores.away}`,
        t_p1: state.courtPositions.pos1 || '--',
        t_p2: state.courtPositions.pos2 || '--',
        t_p3: state.courtPositions.pos3 || '--',
        t_p4: state.courtPositions.pos4 || '--',
        t_p5: state.courtPositions.pos5 || '--',
        t_p6: state.courtPositions.pos6 || '--'
    });
}

// ================= 比分與落點計數 =================
function adjustScore(team, val) {
    state.currentScores[team] = Math.max(0, state.currentScores[team] + val);
    document.getElementById(`score-${team}`).innerText = state.currentScores[team];
    logAction("Scoreboard", `${team}比數調整`, `${state.currentScores.home}:${state.currentScores.away}`);
    saveGameToStorageDebounced();
}

function adjustFallZone(zoneNum, val) {
    state.fallZoneCounts[zoneNum] = Math.max(0, state.fallZoneCounts[zoneNum] + val);
    document.getElementById(`fall-count-${zoneNum}`).innerText = state.fallZoneCounts[zoneNum];
    logAction("FallZone", `攔網落地點-${zoneNum}號位`, val > 0 ? "計數+1" : "計數-1");
    saveGameToStorageDebounced();
}

// ================= 行動端與平板分頁切換 (900px 統一斷點) =================
const MOBILE_BREAKPOINT_QUERY = '(max-width: 900px)';
const mobileMediaMatcher = window.matchMedia(MOBILE_BREAKPOINT_QUERY);

function switchMobileTab(tabName) {
    document.querySelectorAll('.mobile-tab-btn').forEach(btn => btn.classList.remove('active'));
    let activeBtn = document.getElementById(`tab-btn-${tabName}`);
    if (activeBtn) activeBtn.classList.add('active');

    if (mobileMediaMatcher.matches) {
        document.getElementById('panel-court').style.display = (tabName === 'court') ? 'grid' : 'none';
        document.getElementById('panel-fall').style.display = (tabName === 'fall') ? 'flex' : 'none';
        document.getElementById('panel-bench').style.display = (tabName === 'bench') ? 'flex' : 'none';
    } else {
        // 電腦版清除 JS 設定的行內 display，還原 CSS 標準佈局
        document.getElementById('panel-court').style.display = '';
        document.getElementById('panel-fall').style.display = '';
        document.getElementById('panel-bench').style.display = '';
    }
}

function handleBreakpointChange(e) {
    if (!e.matches) {
        // > 900px 桌機版：清除行內 display，顯示所有面板
        document.getElementById('panel-court').style.display = '';
        document.getElementById('panel-fall').style.display = '';
        document.getElementById('panel-bench').style.display = '';
    } else {
        // <= 900px 行動版：啟動分頁頁籤
        let activeBtn = document.querySelector('.mobile-tab-btn.active');
        let tabName = activeBtn ? activeBtn.id.replace('tab-btn-', '') : 'court';
        switchMobileTab(tabName);
    }
}

mobileMediaMatcher.addEventListener('change', handleBreakpointChange);

// ================= UI 渲染邏輯 =================
function refreshUI() {
    for (let i = 1; i <= 6; i++) {
        if (i === 5) continue;
        let posKey = 'pos' + i;
        let pName = state.courtPositions[posKey];
        document.getElementById(`name-${posKey}`).innerText = pName;

        let roleEl = document.getElementById(`role-${posKey}`);
        let cellBox = document.getElementById(`cell-box-${posKey}`);

        cellBox.className = (i === 2 || i === 3 || i === 4) ? "court-cell-box front-row-box" : "court-cell-box back-row-box";

        if (posKey === 'pos4' || posKey === 'pos6') {
            roleEl.innerText = "大砲手";
            roleEl.className = "cell-player-role role-badge-oh";
        }
        if (posKey === 'pos3') {
            roleEl.innerText = "快攻手";
            roleEl.className = "cell-player-role role-badge-mb";
        }
        if (posKey === 'pos2' || posKey === 'pos1') {
            let isSetter = (pName === state.rolesMapping.setter);
            roleEl.innerText = isSetter ? "舉球員" : "副攻手";
            roleEl.className = isSetter ? "cell-player-role role-badge-setter" : "cell-player-role role-badge-opp";
        }

        renderStandardMetricsUI(posKey, pName);
    }

    let p5Box = document.getElementById('cell-box-pos5');
    let role5El = document.getElementById('role-pos5');
    let p5Name = state.courtPositions.pos5;
    document.getElementById('name-pos5').innerText = p5Name;

    if (state.pos5CycleState === 0 || state.pos5CycleState === 2) {
        p5Box.className = "court-cell-box back-row-box libero-active-style";
        role5El.innerText = "自由球員";
        role5El.className = "cell-player-role role-badge-libero";
        renderLiberoMetricsUI('pos5', p5Name);
    } else {
        p5Box.className = "court-cell-box back-row-box";
        role5El.innerText = "快攻手";
        role5El.className = "cell-player-role role-badge-mb";
        renderStandardMetricsUI('pos5', p5Name);
    }

    document.getElementById('mini-pos4').innerText = state.miniPositions[3] || '--';
    document.getElementById('mini-pos3').innerText = state.miniPositions[2] || '--';
    document.getElementById('mini-pos2').innerText = state.miniPositions[1] || '--';
    document.getElementById('mini-pos5').innerText = state.miniPositions[4] || '--';
    document.getElementById('mini-pos6').innerText = state.miniPositions[5] || '--';
    document.getElementById('mini-pos1').innerText = state.miniPositions[0] || '--';

    updateSubSelectMenu();
}

function updateSubSelectMenu() {
    const selectEl = document.getElementById('select-replace-role');
    if (!selectEl) return;
    const currentVal = selectEl.value;

    selectEl.innerHTML = `
        <option value="oh1">大砲手 (${state.rolesMapping.oh1 || '--'})</option>
        <option value="oh2">大砲手 (${state.rolesMapping.oh2 || '--'})</option>
        <option value="mb1">快攻手 (${state.rolesMapping.mb1 || '--'})</option>
        <option value="mb2">快攻手 (${state.rolesMapping.mb2 || '--'})</option>
        <option value="setter">舉球員 (${state.rolesMapping.setter || '--'})</option>
        <option value="opposite">副攻手 (${state.rolesMapping.opposite || '--'})</option>
        <option value="libero">自由球員 (${state.rolesMapping.libero || '--'})</option>
    `;
    if (currentVal) selectEl.value = currentVal;
}

function renderStandardMetricsUI(posId, pName) {
    const container = document.getElementById(`metrics-${posId}`);
    container.className = "metric-action-row";
    container.innerHTML = "";
    const pData = state.playersDatabase[pName];
    if (!pData) return;

    createGridRow(container, pName, "發球", [
        { label: "總", f: "s_total", type: "total" },
        { label: "好", f: "s_good", type: "good" },
        { label: "失", f: "s_err", type: "err" }
    ]);

    createGridRow(container, pName, "接球", [
        { label: "總", f: "r_total", type: "total" },
        { placeholder: true },
        { label: "誤", f: "r_err", type: "err" }
    ]);

    if (pName === state.rolesMapping.setter) {
        createGridRow(container, pName, "舉球", [
            { label: "總", f: "st_total", type: "total" },
            { label: "好", f: "st_good", type: "good" },
            { label: "失", f: "st_err", type: "err" }
        ]);
    } else {
        createGridRow(container, pName, "攻擊", [
            { label: "總", f: "at_total", type: "total" },
            { label: "得", f: "at_good", type: "good" },
            { label: "失", f: "at_err", type: "err" }
        ]);
    }

    createGridRow(container, pName, "攔網", [
        { label: "總", f: "b_total", type: "total" },
        { label: "得", f: "b_good", type: "good" },
        { placeholder: true }
    ]);
}

function renderLiberoMetricsUI(posId, pName) {
    const container = document.getElementById(`metrics-${posId}`);
    container.className = "metric-action-row libero-row-gap-style";
    container.innerHTML = "";
    const pData = state.playersDatabase[pName];
    if (!pData) return;

    createGridRow(container, pName, "接(發)", [
        { label: "總", f: "r_total", type: "total" },
        { placeholder: true },
        { label: "誤", f: "r_err", type: "err" }
    ]);

    createGridRow(container, pName, "防守", [
        { label: "總", f: "d_total", type: "total" },
        { placeholder: true },
        { label: "誤", f: "d_err", type: "err" }
    ]);
}

// 建立單列按鈕 (零 inline onclick，改用 data-* 屬性做 Event Delegation)
function createGridRow(parentContainer, playerName, rowTitle, itemsConfig) {
    let block = document.createElement('div');
    block.className = "metric-block";
    block.innerHTML = `<span class="metric-title">${rowTitle}</span>`;

    let btnRow = document.createElement('div');
    btnRow.className = "counter-unit-row";

    itemsConfig.forEach(it => {
        if (it.placeholder) {
            let ph = document.createElement('div');
            ph.className = "grid-placeholder-cell";
            btnRow.appendChild(ph);
        } else {
            let btnClass = "btn-plus-total";
            if (it.type === "good") btnClass = "btn-plus";
            if (it.type === "err") btnClass = "btn-plus-err";

            let grp = document.createElement('div');
            grp.className = "ctrl-btn-group-inline";
            let currentVal = (state.playersDatabase[playerName] && state.playersDatabase[playerName].stats[it.f]) || 0;

            grp.innerHTML = `
                <span class="counter-sub-label">${it.label}</span>
                <span class="counter-val-inline" data-stat-id="${playerName}_${it.f}">${currentVal}</span>
                <button class="btn-mini-inline btn-minus" data-action="do-stat" data-pname="${playerName}" data-field="${it.f}" data-val="-1">-</button>
                <button class="btn-mini-inline ${btnClass}" data-action="do-stat" data-pname="${playerName}" data-field="${it.f}" data-val="1">+</button>
            `;
            btnRow.appendChild(grp);
        }
    });
    block.appendChild(btnRow);
    parentContainer.appendChild(block);
}

// ================= 行為操作邏輯 =================
function doAction(pName, field, val) {
    if (state.playersDatabase[pName]) {
        let newVal = Math.max(0, state.playersDatabase[pName].stats[field] + val);
        state.playersDatabase[pName].stats[field] = newVal;
        logAction(pName, `${field}變更`, val > 0 ? "+1" : "-1");

        // 局部 DOM 數字精準更新
        let targets = document.querySelectorAll(`[data-stat-id="${pName}_${field}"]`);
        targets.forEach(el => el.innerText = newVal);

        saveGameToStorageDebounced();
    }
}

function swapDiagonals(posA, posB) {
    let temp = state.courtPositions[posA];
    state.courtPositions[posA] = state.courtPositions[posB];
    state.courtPositions[posB] = temp;
    logAction("System", `對角互換: ${posA} ↔ ${posB}`, "手動調整");
    refreshUI();
    saveGameToStorage();
    showToast(`對角互換成功 (${posA} ↔ ${posB})`, 'info');
}

function swapMb3() {
    if (state.currentActiveMb3 === 'mb1') {
        state.courtPositions.pos3 = state.rolesMapping.mb2;
        state.currentActiveMb3 = 'mb2';
    } else {
        state.courtPositions.pos3 = state.rolesMapping.mb1;
        state.currentActiveMb3 = 'mb1';
    }
    logAction("System", `3號位獨立更換: 當前3號為${state.currentActiveMb3}`, "手動調整");
    refreshUI();
    saveGameToStorage();
    showToast(`3號位快攻切換為：${state.courtPositions.pos3}`, 'info');
}

function cyclePos5() {
    state.pos5CycleState = (state.pos5CycleState + 1) % 4;
    if (state.pos5CycleState === 0 || state.pos5CycleState === 2) {
        state.courtPositions.pos5 = state.rolesMapping.libero;
    } else if (state.pos5CycleState === 1) {
        state.courtPositions.pos5 = state.rolesMapping.mb1;
    } else if (state.pos5CycleState === 3) {
        state.courtPositions.pos5 = state.rolesMapping.mb2;
    }
    logAction("System", `5號位循環切換: 狀態[${state.pos5CycleState}] 姓名:${state.courtPositions.pos5}`, "手動調整");
    refreshUI();
    saveGameToStorage();
    showToast(`5號位切換為：${state.courtPositions.pos5}`, 'info');
}

function rotateMini() {
    let temp = state.miniPositions[0];
    state.miniPositions[0] = state.miniPositions[1];
    state.miniPositions[1] = state.miniPositions[2];
    state.miniPositions[2] = state.miniPositions[3];
    state.miniPositions[3] = state.miniPositions[4];
    state.miniPositions[4] = state.miniPositions[5];
    state.miniPositions[5] = temp;
    state.miniRotationIndex = state.miniRotationIndex === 6 ? 1 : state.miniRotationIndex + 1;
    refreshUI();
    saveGameToStorage();
    showToast("隊形已完成順時針輪轉", 'success');
}

function executeSub() {
    let selectRoleEl = document.getElementById('select-replace-role');
    let targetRole = selectRoleEl.value;
    let newName = document.getElementById('input-sub-name').value.trim();

    if (!newName) {
        showToast("請輸入替補球員姓名！", 'warning');
        return;
    }

    let oldName = state.rolesMapping[targetRole];
    state.rolesMapping[targetRole] = newName;

    initPlayerInDb(newName, targetRole);

    for (let key in state.courtPositions) {
        if (state.courtPositions[key] === oldName) {
            state.courtPositions[key] = newName;
        }
    }

    logAction("System", `角色更換: ${targetRole}(原${oldName}) ↔ ${newName}`, "替補上場");
    let roleText = selectRoleEl.selectedOptions[0].text.split(' ')[0];
    
    showToast(`更換成功！【${roleText}】已換成：${newName}`, 'success');

    document.getElementById('input-sub-name').value = "";
    refreshUI();
    saveGameToStorage();
}

function exportCSV() {
    let csvContent = "\uFEFF";
    csvContent += `比賽日期,${state.matchInfo.date},比賽時間,${state.matchInfo.time},比賽地點,${state.matchInfo.location},對手名稱,${state.matchInfo.opponent},賽事場次,${state.matchInfo.round},最終比數,${state.currentScores.home}:${state.currentScores.away}\n\n`;

    csvContent += "=== 球員個人總計攻守數據 ===\n";
    csvContent += "球員姓名,綁定角色,發球-總次,發球-好球,發球-失分,接球-總次,接球-失誤,攻擊-總次,攻擊-得分,攻擊-失分,攔網-總次,攔網-得分,防守防守-總次,防守防守-失誤,舉球-總次,舉球-到位,舉球-失誤\n";
    for (let name in state.playersDatabase) {
        let p = state.playersDatabase[name];
        let s = p.stats;
        csvContent += `${p.name},${p.role},${s.s_total},${s.s_good},${s.s_err},${s.r_total},${s.r_err},${s.at_total},${s.at_good},${s.at_err},${s.b_total},${s.b_good},${s.d_total},${s.d_err},${s.st_total},${s.st_good},${s.st_err}\n`;
    }
    csvContent += "\n";

    csvContent += "=== 攔網失分落點九宮格統計 ===\n";
    csvContent += "落點位置,1號位(right-back),2號位(right-front),3號位(middle-front),4號位(left-front),5號位(left-back),6號位(middle-back),7號位(right-middle),8號位(center),9號位(left-middle)\n";
    csvContent += `累計失球次數,${state.fallZoneCounts[1]},${state.fallZoneCounts[2]},${state.fallZoneCounts[3]},${state.fallZoneCounts[4]},${state.fallZoneCounts[5]},${state.fallZoneCounts[6]},${state.fallZoneCounts[7]},${state.fallZoneCounts[8]},${state.fallZoneCounts[9]}\n\n`;

    csvContent += "=== 賽事即時行為時間軸 ===\n";
    csvContent += "發生時間,執行球員/模組,動作名稱,數值變動,當下得分比數,當下1號位,當下2號位,當下3號位,當下4號位,當下5號位,當下6號位\n";
    state.actionLedger.forEach(item => {
        csvContent += `${item.timestamp},${item.actor},${item.action},${item.detail},${item.scoreState},${item.t_p1},${item.t_p2},${item.t_p3},${item.t_p4},${item.t_p5},${item.t_p6}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", `排球紀錄表_${state.matchInfo.opponent}_${state.matchInfo.round}_v2.5.0.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("匯出 CSV 成功！", "success");
}

function previewRoles() {
    let selected = document.querySelector('input[name="setter-start"]:checked').value;
    if (selected === 'pos1') {
        document.getElementById('role-label-pos1').innerText = "舉球員";
        document.getElementById('role-label-pos2').innerText = "大砲手";
        document.getElementById('role-label-pos3').innerText = "快攻手";
        document.getElementById('role-label-pos4').innerText = "副攻手";
        document.getElementById('role-label-pos5').innerText = "大砲手";
        document.getElementById('role-label-pos6').innerText = "快攻手";
    } else {
        document.getElementById('role-label-pos2').innerText = "舉球員";
        document.getElementById('role-label-pos3').innerText = "大砲手";
        document.getElementById('role-label-pos4').innerText = "快攻手";
        document.getElementById('role-label-pos5').innerText = "副攻手";
        document.getElementById('role-label-pos6').innerText = "大砲手";
        document.getElementById('role-label-pos1').innerText = "快攻手";
    }
}

// ================= DOM 初始化與全局事件委派 =================
window.addEventListener('DOMContentLoaded', () => {
    let now = new Date();
    let yyyy = now.getFullYear();
    let mm = String(now.getMonth() + 1).padStart(2, '0');
    let dd = String(now.getDate()).padStart(2, '0');
    document.getElementById('match-date').value = `${yyyy}-${mm}-${dd}`;

    let hh = String(now.getHours()).padStart(2, '0');
    let min = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('match-time').value = `${hh}:${min}`;

    checkSavedGame();

    // 舉球起始位單選切換
    const setterRadios = document.querySelectorAll('input[name="setter-start"]');
    setterRadios.forEach(r => r.addEventListener('change', (e) => {
        let newPos = e.target.value;
        if (newPos !== state.currentSetterStartPos) {
            let p1 = document.getElementById('setup-p1').value;
            let p2 = document.getElementById('setup-p2').value;
            let p3 = document.getElementById('setup-p3').value;
            let p4 = document.getElementById('setup-p4').value;
            let p5 = document.getElementById('setup-p5').value;
            let p6 = document.getElementById('setup-p6').value;

            if (p1 || p2 || p3 || p4 || p5 || p6) {
                if (state.currentSetterStartPos === 'pos1' && newPos === 'pos2') {
                    document.getElementById('setup-p2').value = p1;
                    document.getElementById('setup-p3').value = p2;
                    document.getElementById('setup-p4').value = p3;
                    document.getElementById('setup-p5').value = p4;
                    document.getElementById('setup-p6').value = p5;
                    document.getElementById('setup-p1').value = p6;
                } else if (state.currentSetterStartPos === 'pos2' && newPos === 'pos1') {
                    document.getElementById('setup-p1').value = p2;
                    document.getElementById('setup-p2').value = p3;
                    document.getElementById('setup-p3').value = p4;
                    document.getElementById('setup-p4').value = p5;
                    document.getElementById('setup-p5').value = p6;
                    document.getElementById('setup-p6').value = p1;
                }
            }
            state.currentSetterStartPos = newPos;
        }
        previewRoles();
    }));
    previewRoles();

    // 示範資料帶入
    document.getElementById('btn-fill-demo').addEventListener('click', () => {
        let radioPos1 = document.querySelector('input[name="setter-start"][value="pos1"]');
        if (radioPos1) {
            radioPos1.checked = true;
            previewRoles();
        }
        document.getElementById('setup-p4').value = "隆興";
        document.getElementById('setup-p3').value = "銘祥";
        document.getElementById('setup-p2').value = "阿修";
        document.getElementById('setup-p5').value = "Dblue";
        document.getElementById('setup-p6').value = "小正";
        document.getElementById('setup-p1').value = "崔屁";
        document.querySelectorAll('.form-group').forEach(el => el.classList.remove('field-error'));
        showToast("已成功帶入示範球員名單！", "info");
    });

    // 開始比賽
    document.getElementById('btn-start-game').addEventListener('click', () => {
        document.querySelectorAll('.form-group').forEach(el => el.classList.remove('field-error'));

        state.matchInfo.date = document.getElementById('match-date').value;
        state.matchInfo.time = document.getElementById('match-time').value;
        state.matchInfo.location = document.getElementById('match-location').value.trim();
        state.matchInfo.round = document.getElementById('match-round').value.trim();
        state.matchInfo.opponent = document.getElementById('match-opponent').value.trim();

        let hasError = false;
        if (!state.matchInfo.location) { document.getElementById('group-location').classList.add('field-error'); hasError = true; }
        if (!state.matchInfo.opponent) { document.getElementById('group-opponent').classList.add('field-error'); hasError = true; }
        if (!state.matchInfo.round) { document.getElementById('group-round').classList.add('field-error'); hasError = true; }

        let p1 = document.getElementById('setup-p1').value.trim();
        let p2 = document.getElementById('setup-p2').value.trim();
        let p3 = document.getElementById('setup-p3').value.trim();
        let p4 = document.getElementById('setup-p4').value.trim();
        let p5 = document.getElementById('setup-p5').value.trim();
        let p6 = document.getElementById('setup-p6').value.trim();
        let pL = document.getElementById('setup-pL').value.trim();

        if (!p1) { document.getElementById('group-p1').classList.add('field-error'); hasError = true; }
        if (!p2) { document.getElementById('group-p2').classList.add('field-error'); hasError = true; }
        if (!p3) { document.getElementById('group-p3').classList.add('field-error'); hasError = true; }
        if (!p4) { document.getElementById('group-p4').classList.add('field-error'); hasError = true; }
        if (!p5) { document.getElementById('group-p5').classList.add('field-error'); hasError = true; }
        if (!p6) { document.getElementById('group-p6').classList.add('field-error'); hasError = true; }

        if (hasError) {
            showToast("請填寫完整的紅框資訊與名單！", "warning");
            let firstErr = document.querySelector('.field-error');
            if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        let selected = document.querySelector('input[name="setter-start"]:checked').value;
        if (selected === 'pos1') {
            state.rolesMapping.setter = p1;   state.rolesMapping.oh1 = p2;    state.rolesMapping.mb1 = p3;
            state.rolesMapping.opposite = p4; state.rolesMapping.oh2 = p5;    state.rolesMapping.mb2 = p6;
        } else {
            state.rolesMapping.mb2 = p1;      state.rolesMapping.setter = p2; state.rolesMapping.oh1 = p3;
            state.rolesMapping.mb1 = p4;      state.rolesMapping.opposite = p5; state.rolesMapping.oh2 = p6;
        }
        state.rolesMapping.libero = pL || "自由球員";

        state.miniPositions = [p1, p2, p3, p4, p5, p6];
        state.miniRotationIndex = 1;

        for (let key in state.rolesMapping) {
            if (state.rolesMapping[key]) initPlayerInDb(state.rolesMapping[key], key);
        }

        state.courtPositions.pos4 = state.rolesMapping.oh1;
        state.courtPositions.pos3 = state.rolesMapping.mb1;
        state.courtPositions.pos2 = state.rolesMapping.setter;
        state.courtPositions.pos5 = state.rolesMapping.libero;
        state.pos5CycleState = 0;

        state.courtPositions.pos6 = state.rolesMapping.oh2;
        state.courtPositions.pos1 = state.rolesMapping.opposite;
        state.currentActiveMb3 = 'mb1';

        document.getElementById('match-info-banner-id').innerHTML = `
            <i class="fa-solid fa-file-invoice"></i> 
            <span>日期：<strong>${state.matchInfo.date}</strong></span>
            <span>時間：<strong>${state.matchInfo.time}</strong></span>
            <span>地點：<strong>${state.matchInfo.location}</strong></span>
            <span>對手：<strong style="color:#2563eb">${state.matchInfo.opponent}</strong></span>
            <span>場次：<strong>${state.matchInfo.round}</strong></span>
        `;

        document.getElementById('setup-section').classList.add('hidden');
        document.getElementById('operating-section').classList.remove('hidden');
        document.getElementById('action-buttons').classList.remove('hidden');

        refreshUI();
        saveGameToStorage();
        showToast("比賽紀錄表已成功生成並開始！", "success");
    });
});

// ================= 全局事件委派中心 (Event Delegation Dispatcher) =================
document.body.addEventListener('click', (e) => {
    const targetBtn = e.target.closest('[data-action]');
    if (!targetBtn) return;

    const action = targetBtn.dataset.action;

    switch (action) {
        case 'do-stat': {
            const pname = targetBtn.dataset.pname;
            const field = targetBtn.dataset.field;
            const val = parseInt(targetBtn.dataset.val, 10);
            if (pname && field && !isNaN(val)) {
                doAction(pname, field, val);
            }
            break;
        }
        case 'adjust-score': {
            const team = targetBtn.dataset.team;
            const val = parseInt(targetBtn.dataset.val, 10);
            if (team && !isNaN(val)) {
                adjustScore(team, val);
            }
            break;
        }
        case 'adjust-fall': {
            const zone = parseInt(targetBtn.dataset.zone, 10);
            const val = parseInt(targetBtn.dataset.val, 10);
            if (!isNaN(zone) && !isNaN(val)) {
                adjustFallZone(zone, val);
            }
            break;
        }
        case 'swap-diagonal': {
            const posa = targetBtn.dataset.posa;
            const posb = targetBtn.dataset.posb;
            if (posa && posb) {
                swapDiagonals(posa, posb);
            }
            break;
        }
        case 'swap-mb3': {
            swapMb3();
            break;
        }
        case 'cycle-pos5': {
            cyclePos5();
            break;
        }
        case 'rotate-mini': {
            rotateMini();
            break;
        }
        case 'switch-tab': {
            const tab = targetBtn.dataset.tab;
            if (tab) switchMobileTab(tab);
            break;
        }
        case 'execute-sub': {
            executeSub();
            break;
        }
        case 'export-csv': {
            exportCSV();
            break;
        }
        case 'reset-match': {
            showConfirmModal({
                title: '放棄當前比賽？',
                message: '確定要放棄當前紀錄並重新開始新比賽嗎？（未導出的數據將會被清除）',
                confirmText: '確定重置',
                cancelText: '取消',
                onConfirm: () => {
                    clearSavedGame();
                    location.reload();
                }
            });
            break;
        }
        case 'restore-game': {
            restoreSavedGame();
            break;
        }
        case 'clear-game': {
            clearSavedGame();
            showToast("已放棄舊紀錄", "info");
            break;
        }
    }
});
