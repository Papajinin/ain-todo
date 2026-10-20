// AIN Todo 미완료 서랍 v1: 지난 날짜에 안 한 할 일 — 오늘 하기, 날짜 변경, 넘기기, 삭제

const drawerOverlay = document.getElementById('drawerOverlay');
const drawerList = document.getElementById('drawerList');

function shortDate(s) {
  const d = parseYmd(s);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK_NAMES[d.getDay()]})`;
}

function renderDrawer() {
  const items = state.tasks.filter(isOverdue).sort((a, b) => a.date.localeCompare(b.date));
  if (!items.length) {
    drawerList.innerHTML = '<p class="d-empty">밀린 할 일이 없어요</p>';
    return;
  }
  drawerList.innerHTML = items.map(t => {
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
  }).join('');
}

function openDrawer() {
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

drawerList.addEventListener('click', e => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const item = b.closest('.d-item');
  const t = findTask(item.dataset.id);
  if (!t) return;
  const act = b.dataset.act;

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
    showActions('', [{ label: '할 일 삭제', danger: true, fn: () => {
      state.tasks = state.tasks.filter(x => x.id !== t.id);
      afterDrawerChange();
    } }]);
  }
});

document.getElementById('drawerClose').addEventListener('click', () => hideOverlay(drawerOverlay));
drawerOverlay.addEventListener('click', e => { if (e.target === drawerOverlay) hideOverlay(drawerOverlay); });
