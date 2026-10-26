// AIN Todo 서랍장 v3: 떠오른 일 적기(날짜 없는 할 일), 오늘 완료, 밀린 일
//  - 할 일: 날짜·카테고리 없이 적어 둠 (회색 점). 누르면 제목 고치기 + 카테고리와 날짜를 골라 캘린더로 보냄
//  - 오늘 완료: 서랍장에서 체크한 할 일은 그날 하루 남겨 두고 다시 눌러 되돌릴 수 있음
//  - 밀린 일: 지난 날짜에 안 한 할 일 — 오늘 하기, 날짜 변경, 넘기기, 삭제 (v1과 같음)

const drawerOverlay = document.getElementById('drawerOverlay');
const drawerList = document.getElementById('drawerList');
const quickForm = document.getElementById('quickForm');
const quickInput = document.getElementById('quickInput');

let inboxOpenId = null; // 날짜 정하기 칸이 열린 할 일
let inboxCat = null; // 캘린더로 보낼 때 고른 카테고리

function shortDate(s) {
  const d = parseYmd(s);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK_NAMES[d.getDay()]})`;
}

// 서랍장의 할 일 한 줄 (모양은 하루 목록과 같음)
function inboxRow(t) {
  const open = inboxOpenId === t.id && !t.done;
  const pick = open ? `<div class="i-pick">
      <div class="cat-chips">${state.categories.map(c =>
        `<button type="button" class="cat-chip${c.id === inboxCat ? ' on' : ''}" data-act="cat" data-cat="${c.id}" aria-pressed="${c.id === inboxCat}"><i style="background:var(--c-${c.color})"></i>${escapeHtml(c.name)}</button>`).join('')}</div>
      <div class="i-pick-row">
        <input class="f-date" type="date" value="${ui.today}" aria-label="날짜">
        <button class="small-btn" type="button" data-act="send">캘린더로</button>
        <button class="small-btn danger" type="button" data-act="del">삭제</button>
      </div>
    </div>` : '';
  return `<div class="task${t.done ? ' done' : ''}" data-id="${t.id}">
      <button class="check-btn" type="button" data-act="check" aria-label="${t.done ? '완료 취소' : '완료'}"><span class="check${t.done && t.id === popTaskId ? ' pop' : ''}">${t.done ? CHECK_SVG : ''}</span></button>
      <span class="t-dot" style="background:var(--sub)"></span>
      ${open
        ? `<div class="t-body"><input class="t-input i-title" type="text" value="${escapeHtml(t.title)}" aria-label="할 일 고치기" enterkeyhint="done"></div>`
        : `<button class="t-body i-body" type="button" data-act="open" aria-expanded="false"><span class="t-text">${escapeHtml(t.title)}</span>${t.done ? '' : '<span class="i-sub">누르면 날짜 정하기</span>'}</button>`}
    </div>${pick}`;
}

function overdueItem(t) {
  const ago = daysBetween(t.date, ui.today);
  const from = t.rescheduledFrom ? ` · 원래 ${shortDate(t.rescheduledFrom)}` : '';
  return `<div class="group d-item" data-id="${t.id}">
      <div class="d-info">
        <span class="t-dot" style="background:${catColor(t.categoryId)}"></span>
        <div class="d-text">
          <div class="d-title">${escapeHtml(t.title)}</div>
          <div class="d-date">${shortDate(t.date)} · ${ago}일 전${from}</div>
        </div>
      </div>
      <div class="d-move" hidden>
        <input class="f-date" type="date" value="${ui.today}" aria-label="옮길 날짜">
        <button class="small-btn" type="button" data-act="moveGo">옮기기</button>
      </div>
      <div class="d-actions">
        <button type="button" data-act="today">오늘 하기</button>
        <button type="button" data-act="move">날짜 변경</button>
        <button type="button" data-act="skip">넘기기</button>
        <button type="button" data-act="del" class="danger">삭제</button>
      </div>
    </div>`;
}

function renderDrawer() {
  // 새로 적은 것이 위로 (id 앞부분이 만든 시각)
  const inbox = state.tasks.filter(isInbox).sort((a, b) => b.id.localeCompare(a.id));
  const doneToday = state.tasks.filter(t => !t.date && t.done && t.doneOn === ui.today);
  const overdue = state.tasks.filter(isOverdue).sort((a, b) => a.date.localeCompare(b.date));
  const sec = (title, n, body) => `<section class="d-sec"><div class="d-sec-h">${title} <b>${n}</b></div>${body}</section>`;
  drawerList.innerHTML =
    sec('할 일', inbox.length, inbox.length
      ? `<div class="group">${inbox.map(inboxRow).join('')}</div>`
      : '<p class="d-empty">적어 둔 할 일이 없어요</p>') +
    (doneToday.length ? sec('오늘 완료', doneToday.length, `<div class="group">${doneToday.map(inboxRow).join('')}</div>`) : '') +
    (overdue.length ? sec('밀린 일', overdue.length, overdue.map(overdueItem).join('')) : '');
}

function openDrawer() {
  inboxOpenId = null;
  renderDrawer();
  showOverlay(drawerOverlay);
}

// 날짜를 옮겨도 처음 예정일은 rescheduledFrom에 남겨 둔다
function moveTask(t, date) {
  if (!t.rescheduledFrom) t.rescheduledFrom = t.date;
  t.date = date;
}

function afterDrawerChange() {
  saveState();
  renderAll();
  renderDrawer();
}

function deleteFromDrawer(t) {
  showActions('', [{ label: '할 일 삭제', danger: true, fn: () => {
    state.tasks = state.tasks.filter(x => x.id !== t.id);
    afterDrawerChange();
  } }]);
}

// 떠오른 일 적기: 엔터를 치면 바로 다음 일을 이어서 적을 수 있게 칸을 비우고 그대로 둠
quickForm.addEventListener('submit', e => {
  e.preventDefault();
  const title = quickInput.value.trim();
  if (!title) return;
  state.tasks.push({ id: newId(), title, date: '', categoryId: null, done: false });
  quickInput.value = '';
  afterDrawerChange();
});

drawerList.addEventListener('click', e => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const act = b.dataset.act;

  // 서랍장의 할 일 (날짜 없음 · 오늘 완료)
  if (act === 'cat') {
    inboxCat = b.dataset.cat;
    renderDrawer();
    return;
  }
  const row = b.closest('.task') || (b.closest('.i-pick') && b.closest('.i-pick').previousElementSibling);
  if (row) {
    const t = findTask(row.dataset.id);
    if (!t) return;
    if (act === 'check') {
      t.done = !t.done;
      if (t.done) t.doneOn = ui.today;
      else delete t.doneOn;
      popTaskId = t.done ? t.id : null;
      inboxOpenId = null;
      afterDrawerChange();
      popTaskId = null;
    } else if (act === 'open') {
      if (t.done) return;
      inboxOpenId = inboxOpenId === t.id ? null : t.id;
      inboxCat = state.categories.length ? state.categories[0].id : null;
      renderDrawer();
    } else if (act === 'send') {
      const v = row.nextElementSibling.querySelector('.f-date').value;
      if (!v) return;
      t.date = v;
      t.categoryId = inboxCat;
      inboxOpenId = null;
      afterDrawerChange();
    } else if (act === 'del') {
      deleteFromDrawer(t);
    }
    return;
  }

  // 밀린 일
  const item = b.closest('.d-item');
  if (!item) return;
  const t = findTask(item.dataset.id);
  if (!t) return;
  if (act === 'today') {
    moveTask(t, ui.today);
    afterDrawerChange();
  } else if (act === 'move') {
    const box = item.querySelector('.d-move');
    box.hidden = !box.hidden;
  } else if (act === 'moveGo') {
    const v = item.querySelector('.d-move input').value;
    if (!v) return;
    moveTask(t, v);
    afterDrawerChange();
  } else if (act === 'skip') {
    // 삭제하지 않고 "안 하기로 함" 기록만 남김
    t.skipped = true;
    afterDrawerChange();
  } else if (act === 'del') {
    deleteFromDrawer(t);
  }
});

// 펼친 할 일의 제목 고치기: 엔터나 다른 곳을 누르면 저장
// (서랍장은 다시 그리지 않음: "캘린더로"를 바로 눌러도 그 누름이 사라지지 않게)
drawerList.addEventListener('change', e => {
  if (!e.target.classList.contains('i-title')) return;
  const t = findTask(e.target.closest('.task').dataset.id);
  const title = e.target.value.trim();
  if (!t || !title) { if (t) e.target.value = t.title; return; }
  t.title = title;
  saveState();
  renderAll();
});
drawerList.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.classList.contains('i-title')) e.target.blur();
});

document.getElementById('drawerClose').addEventListener('click', () => hideOverlay(drawerOverlay));
drawerOverlay.addEventListener('click', e => { if (e.target === drawerOverlay) hideOverlay(drawerOverlay); });
