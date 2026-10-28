// AIN Todo 할 일 목록 v6: 날짜 제목에 공휴일 이름, 완료 체크(체크 애니메이션), 메모 펼치기, PC 더블클릭 수정, 길게 눌러 수정 창 열기, 넘긴 할 일 표시

const listEl = document.getElementById('list');
const dayTitle = document.getElementById('dayTitle');
const dayCount = document.getElementById('dayCount');

// 마우스를 쓰는 기기(PC)에서만 더블클릭 수정
const isPointerFine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

const CHECK_SVG = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
let popTaskId = null; // 방금 완료한 할 일 (체크 애니메이션은 한 번만)
const MEMO_SVG = '<svg viewBox="0 0 24 24"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>';

function renderList() {
  dayTitle.parentElement.hidden = picking(); // 골라 보기 중에는 날짜마다 제목이 따로 붙음
  if (picking()) {
    renderPickList();
    focusEditInput();
    return;
  }
  dayTitle.innerHTML = dayTitleHtml(ui.selected);

  const tasks = state.tasks.filter(t => t.date === ui.selected);
  dayCount.textContent = tasks.length ? `${tasks.filter(t => t.done).length}/${tasks.length}` : '';

  if (!tasks.length) {
    listEl.className = 'list empty';
    listEl.textContent = '할 일이 없어요';
    return;
  }
  listEl.className = 'list';
  listEl.innerHTML = tasks.map(taskRow).join('');
  focusEditInput();
}

// 할 일 한 줄 (하루 목록과 골라 보기 목록이 같이 씀)
function taskRow(t) {
  const open = t.memo && ui.openMemos.has(t.id);
  const text = ui.editingId === t.id
    ? `<input class="t-input" id="editInput" type="text" value="${escapeHtml(t.title)}" aria-label="할 일 수정">`
    : `<span class="t-text">${escapeHtml(t.title)}</span>`;
  const skipped = t.skipped && !t.done;
  return `<div class="task${t.done ? ' done' : ''}${skipped ? ' skipped' : ''}" data-id="${t.id}">
      <button class="check-btn" type="button" aria-label="${t.done ? '완료 취소' : '완료'}"><span class="check${t.done && t.id === popTaskId ? ' pop' : ''}">${t.done ? CHECK_SVG : ''}</span></button>
      <span class="t-dot" style="background:${catColor(t.categoryId)}"></span>
      <div class="t-body">${text}${skipped ? '<span class="skip-tag">넘김</span>' : ''}${t.memo ? `<span class="memo-ic">${MEMO_SVG}</span>` : ''}</div>
    </div>${open ? `<div class="memo">${escapeHtml(t.memo)}</div>` : ''}`;
}

function focusEditInput() {
  const input = document.getElementById('editInput');
  if (input) {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

function findTask(id) {
  return state.tasks.find(t => t.id === id);
}

function toggleDone(id) {
  const t = findTask(id);
  if (!t) return;
  t.done = !t.done;
  if (t.done) delete t.skipped; // 넘겼던 할 일도 하면 완료로
  popTaskId = t.done ? id : null;
  saveState();
  renderAll();
  popTaskId = null;
}

function toggleMemo(id) {
  if (ui.openMemos.has(id)) ui.openMemos.delete(id);
  else ui.openMemos.add(id);
  renderList();
}

function finishEdit(save) {
  const input = document.getElementById('editInput');
  const t = findTask(ui.editingId);
  ui.editingId = null;
  if (save && t && input && input.value.trim()) {
    t.title = input.value.trim();
    saveState();
  }
  renderAll();
}

// ---------- 길게 누르기 (0.5초) → 수정 창 ----------
let press = null;
let longPressedAt = 0;

function cancelPress() {
  if (!press) return;
  clearTimeout(press.timer);
  press.row.classList.remove('pressing');
  press = null;
}

listEl.addEventListener('pointerdown', e => {
  const row = e.target.closest('.task');
  if (!row || e.button > 0 || e.target.closest('.check-btn') || e.target.closest('.t-input')) return;
  cancelPress();
  row.classList.add('pressing');
  press = {
    row, x: e.clientX, y: e.clientY,
    timer: setTimeout(() => {
      const id = row.dataset.id;
      cancelPress();
      longPressedAt = Date.now();
      openSheet(id);
    }, 500)
  };
});

listEl.addEventListener('pointermove', e => {
  if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) cancelPress();
});
listEl.addEventListener('pointerup', cancelPress);
listEl.addEventListener('pointercancel', cancelPress);
listEl.addEventListener('pointerleave', cancelPress);
listEl.addEventListener('contextmenu', e => { if (e.target.closest('.task')) e.preventDefault(); });

listEl.addEventListener('click', e => {
  if (Date.now() - longPressedAt < 600) return;
  const row = e.target.closest('.task');
  if (!row) return;
  if (e.target.closest('.check-btn')) return toggleDone(row.dataset.id);
  if (e.target.closest('.t-input')) return;
  const t = findTask(row.dataset.id);
  if (t && t.memo && e.target.closest('.t-body')) toggleMemo(t.id);
});

listEl.addEventListener('dblclick', e => {
  if (!isPointerFine) return;
  const text = e.target.closest('.t-text');
  if (!text) return;
  const id = text.closest('.task').dataset.id;
  ui.openMemos.delete(id); // 더블클릭의 첫 클릭으로 메모가 열렸으면 다시 닫기
  ui.editingId = id;
  renderList();
});

listEl.addEventListener('keydown', e => {
  if (!e.target.matches('.t-input')) return;
  if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); finishEdit(true); }
  if (e.key === 'Escape') finishEdit(false);
});

listEl.addEventListener('focusout', e => {
  if (e.target.matches('.t-input') && ui.editingId) finishEdit(true);
});
