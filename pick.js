// AIN Todo 골라 보기 v2 (날짜 제목에 공휴일 이름): 카테고리를 여러 개 골라서 그 일정만 보기 (AIN Cost "골라 보기"와 같은 방식)
//  - 월간 달력일 때만 "골라 보기" 버튼이 보임. 주간으로 접으면 풀림
//  - 달력에는 고른 카테고리 색 점만, 아래에는 그 달의 고른 일정이 날짜별로
//  - 날짜를 누르면 목록이 그날로 내려감. 달을 넘겨도 유지, 앱을 켜면 풀린 채로 시작

const pickBtn = document.getElementById('pickBtn');
const pickOverlay = document.getElementById('pickOverlay');
const pickCats = document.getElementById('pickCats');
const PICK_CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function picking() {
  return ui.expanded && ui.pick.length > 0;
}

function pickMonthTasks() {
  const m = ui.selected.slice(0, 7);
  return state.tasks.filter(t => t.date.slice(0, 7) === m);
}

// 달력 오른쪽 위 버튼: 고르는 중이면 테마 색으로 채우고 고른 개수
function renderPickBtn() {
  // 지운 카테고리는 고른 목록에서도 뺌
  ui.pick = ui.pick.filter(id => state.categories.some(c => c.id === id));
  pickBtn.hidden = !ui.expanded;
  pickBtn.classList.toggle('on', picking());
  pickBtn.textContent = picking() ? `골라 보기 ${ui.pick.length}` : '골라 보기';
}

// 골라 보기 창: 카테고리마다 이번 달 일정 개수, 누를 때마다 ✓
function renderPickSheet() {
  const tasks = pickMonthTasks();
  pickCats.innerHTML = state.categories.map(c => {
    const on = ui.pick.includes(c.id);
    const n = tasks.filter(t => t.categoryId === c.id).length;
    return `<button type="button" class="row pick-row" data-cat="${c.id}" aria-pressed="${on}">
      <span class="pick-name"><i class="pick-dot" style="background:var(--c-${c.color})"></i>${escapeHtml(c.name)}</span>
      <span class="pick-right"><span class="pick-n">${n}개</span><span class="pick-ck">${on ? PICK_CHECK : ''}</span></span>
    </button>`;
  }).join('');
}

// 골라 보기 목록: 그 달의 고른 일정을 날짜 순서대로
function renderPickList() {
  const tasks = pickMonthTasks().filter(t => ui.pick.includes(t.categoryId));
  const names = state.categories.filter(c => ui.pick.includes(c.id))
    .map(c => `<span class="pb-cat"><i class="pick-dot" style="background:var(--c-${c.color})"></i>${escapeHtml(c.name)}</span>`).join('');
  const month = Number(ui.selected.slice(5, 7));
  const bar = `<div class="pick-bar">
      <span class="pb-body"><b>${names}</b><span class="pb-sub">${month}월 ${tasks.length}개 · ${tasks.filter(t => t.done).length}개 완료</span></span>
      <button class="pb-clear" type="button" id="pickClear">✕ 전체</button>
    </div>`;
  listEl.className = 'list picking';
  if (!tasks.length) {
    listEl.innerHTML = bar + '<p class="pick-empty">이 달에는 고른 카테고리의 일정이 없어요</p>';
    return;
  }
  const byDay = {};
  tasks.forEach(t => { (byDay[t.date] = byDay[t.date] || []).push(t); });
  listEl.innerHTML = bar + Object.keys(byDay).sort().map(date => {
    const list = byDay[date];
    return `<section class="pick-day" data-day="${date}">
      <div class="day-head"><h2>${dayTitleHtml(date)}</h2><span>${list.filter(t => t.done).length}/${list.length}</span></div>
      <div class="list">${list.map(taskRow).join('')}</div>
    </section>`;
  }).join('');
}

// 달력에서 날짜를 누르면 목록을 그날(없으면 그 뒤 가장 가까운 날)로
function scrollToPickDay(date) {
  const days = [...listEl.querySelectorAll('.pick-day')];
  const target = days.find(el => el.dataset.day >= date);
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearPick() {
  ui.pick = [];
  renderAll();
}

pickBtn.addEventListener('click', () => {
  renderPickSheet();
  showOverlay(pickOverlay);
});
pickCats.addEventListener('click', e => {
  const b = e.target.closest('.pick-row');
  if (!b) return;
  const i = ui.pick.indexOf(b.dataset.cat);
  if (i >= 0) ui.pick.splice(i, 1);
  else ui.pick.push(b.dataset.cat);
  renderPickSheet();
  renderAll();
});
document.getElementById('pickClearAll').addEventListener('click', () => {
  clearPick();
  renderPickSheet();
});
document.getElementById('pickDone').addEventListener('click', () => hideOverlay(pickOverlay));
pickOverlay.addEventListener('click', e => { if (e.target === pickOverlay) hideOverlay(pickOverlay); });
listEl.addEventListener('click', e => {
  if (e.target.closest('#pickClear')) clearPick();
});
