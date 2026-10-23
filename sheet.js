// AIN Todo 입력 창 v5: 할 일 추가·수정·삭제, 카테고리 바로 만들기, 기한 있는 반복, 할 일 자동완성

const COLOR_KEYS = ['blue', 'green', 'red', 'brown', 'purple', 'orange', 'teal', 'pink']; // brown = 노랑

const sheetOverlay = document.getElementById('sheetOverlay');
const sheetTitle = document.getElementById('sheetTitle');
const sheetSave = document.getElementById('sheetSave');
const fTitle = document.getElementById('fTitle');
const titleSuggest = document.getElementById('titleSuggest');
const fMemo = document.getElementById('fMemo');
const catChips = document.getElementById('catChips');
const catNew = document.getElementById('catNew');
const fCatName = document.getElementById('fCatName');
const colorDots = document.getElementById('colorDots');
const fDate = document.getElementById('fDate');
const fRepeat = document.getElementById('fRepeat');
const rowDays = document.getElementById('rowDays');
const fDays = document.getElementById('fDays');
const rowEnd = document.getElementById('rowEnd');
const fEnd = document.getElementById('fEnd');
const fPin = document.getElementById('fPin');
const fError = document.getElementById('fError');
const deleteGroup = document.getElementById('deleteGroup');
const actionOverlay = document.getElementById('actionOverlay');
const actionMsg = document.getElementById('actionMsg');
const actionBtns = document.getElementById('actionBtns');

let form = null;      // 입력 중인 값
let original = null;  // 수정 중인 할 일 (새로 만들 때는 null)
let newCatColor = 'blue';
let titleIndex = []; // 지난 할 일 이름: [{ title, count, last(가장 최근 할 일) }] 많이 쓴 순

// ---------- 반복 날짜 만들기 (종료일까지만) ----------
function repeatDates(start, rule) {
  const out = [];
  const s = parseYmd(start);
  const e = parseYmd(rule.end);
  if (rule.type === 'monthly') {
    // 31일처럼 없는 날은 그달을 건너뜀
    const day = s.getDate();
    for (let i = 0; ; i++) {
      const d = new Date(s.getFullYear(), s.getMonth() + i, day);
      if (d > e) break;
      if (d.getDate() === day) out.push(ymd(d));
    }
    return out;
  }
  for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    if (rule.type === 'daily' || rule.days.includes(d.getDay())) out.push(ymd(d));
  }
  return out;
}

function sameRule(a, b) {
  const ta = a ? a.type : 'none';
  const tb = b ? b.type : 'none';
  if (ta !== tb) return false;
  if (ta === 'none') return true;
  return a.end === b.end && [...a.days].sort().join() === [...b.days].sort().join();
}

// ---------- 열기·닫기 ----------
function openSheet(taskId) {
  const t = taskId ? findTask(taskId) : null;
  original = t ? { ...t } : null;
  const date = t ? t.date : ui.selected;
  const defaultCat = state.categories.some(c => c.id === state.settings.lastCategory)
    ? state.settings.lastCategory : state.categories[0].id;
  form = {
    date,
    categoryId: t ? t.categoryId : defaultCat,
    pin: t ? !!t.pin : false,
    repeat: t && t.repeat
      ? { type: t.repeat.type, days: [...t.repeat.days], end: t.repeat.end }
      : { type: 'none', days: [parseYmd(date).getDay()], end: '' }
  };
  fTitle.value = t ? t.title : '';
  fMemo.value = t ? t.memo || '' : '';
  sheetTitle.textContent = t ? '할 일 수정' : '새 할 일';
  sheetSave.textContent = t ? '저장' : '추가';
  deleteGroup.hidden = !t;
  catNew.hidden = true;
  showError('');
  buildTitleIndex();
  hideSuggest();
  renderForm();

  sheetOverlay.hidden = false;
  document.body.classList.add('locked');
  autoGrow();
  if (!t) { fTitle.focus(); settleCaret(fTitle); } // 새로 만들 때만 바로 키보드
  requestAnimationFrame(() => sheetOverlay.classList.add('show'));
}

// 아이폰 Safari: 올라오는 중인 칸에 커서를 넣으면 깜빡이는 커서가 처음 자리(창 뒤)에 남을 때가 있어서,
// 창이 다 올라온 뒤 커서 위치를 한 번 더 잡아 줌 (키보드는 누르는 순간 넣어야 열리므로 그때 한 번, 지금 한 번)
function settleCaret(el) {
  setTimeout(() => {
    if (document.activeElement !== el) return;
    const n = el.value.length;
    try { el.setSelectionRange(n, n); } catch (e) {}
  }, 320);
}

function closeSheet() {
  document.activeElement && document.activeElement.blur();
  sheetOverlay.classList.remove('show');
  document.body.classList.remove('locked');
  setTimeout(() => { if (!sheetOverlay.classList.contains('show')) sheetOverlay.hidden = true; }, 300);
}

// ---------- 화면에 값 채우기 ----------
function renderForm() {
  fDate.value = form.date;
  fPin.checked = form.pin;
  fRepeat.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === form.repeat.type));
  rowDays.hidden = form.repeat.type !== 'weekly';
  rowEnd.hidden = form.repeat.type === 'none';
  fEnd.value = form.repeat.end;
  fEnd.min = form.date;

  const start = weekStartDay();
  fDays.innerHTML = [0, 1, 2, 3, 4, 5, 6].map(i => {
    const wd = (start + i) % 7;
    const on = form.repeat.days.includes(wd);
    return `<button type="button" data-wd="${wd}" class="${on ? 'on' : ''}" aria-pressed="${on}">${WEEK_NAMES[wd]}</button>`;
  }).join('');

  renderCatChips();
}

function renderCatChips() {
  catChips.innerHTML = state.categories.map(c =>
    `<button type="button" class="cat-chip${c.id === form.categoryId ? ' on' : ''}" data-id="${c.id}" aria-pressed="${c.id === form.categoryId}"><i style="background:var(--c-${c.color})"></i>${escapeHtml(c.name)}</button>`
  ).join('') +
    `<button type="button" class="cat-chip add" id="catNewBtn"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>새 카테고리</button>`;
}

function renderColorDots() {
  colorDots.innerHTML = COLOR_KEYS.map(k =>
    `<button type="button" class="color-dot${k === newCatColor ? ' on' : ''}" data-color="${k}" aria-label="${k}"><i style="background:var(--c-${k})"></i></button>`
  ).join('');
}

function autoGrow() {
  fMemo.style.height = 'auto';
  fMemo.style.height = fMemo.scrollHeight + 'px';
}

function showError(msg) {
  fError.textContent = msg;
  fError.hidden = !msg;
}

// ---------- 할 일 자동완성 (AIN Cost와 같은 방식) ----------
// 창을 열 때 한 번 모아 둠. 반복 할 일은 한 번 만들 때 여러 개가 생기므로 묶음 하나를 1번으로 셈
function buildTitleIndex() {
  const map = new Map();
  state.tasks.forEach(t => {
    const title = (t.title || '').trim();
    if (!title) return;
    let e = map.get(title);
    if (!e) map.set(title, e = { title, count: 0, series: new Set(), last: t });
    if (!t.seriesId) e.count++;
    else if (!e.series.has(t.seriesId)) { e.series.add(t.seriesId); e.count++; }
    if (t.date >= e.last.date) e.last = t;
  });
  titleIndex = [...map.values()].sort((a, b) => b.count - a.count || (b.last.date > a.last.date ? 1 : -1));
}

function hideSuggest() {
  titleSuggest.hidden = true;
  titleSuggest.innerHTML = '';
}

// 친 글자가 들어간 이름을 최대 8개 (똑같이 적었으면 보이지 않음)
function renderSuggest() {
  const q = fTitle.value.trim();
  const hits = q ? titleIndex.filter(e => e.title !== q && e.title.includes(q)).slice(0, 8) : [];
  if (!hits.length) return hideSuggest();
  titleSuggest.innerHTML = hits.map((e, i) => {
    const at = e.title.indexOf(q);
    const name = escapeHtml(e.title.slice(0, at)) + '<mark>' + escapeHtml(q) + '</mark>' + escapeHtml(e.title.slice(at + q.length));
    return `<button class="sg" type="button" data-i="${i}"><span>${name}</span><small>${e.count}</small></button>`;
  }).join('');
  titleSuggest.hits = hits;
  titleSuggest.hidden = false;
  titleSuggest.scrollLeft = 0;
}

fTitle.addEventListener('input', renderSuggest);
fTitle.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== fTitle) hideSuggest(); }, 150));
// 추천을 누를 때 할 일 칸의 키보드가 내려가지 않게
titleSuggest.addEventListener('pointerdown', e => { if (e.target.closest('.sg')) e.preventDefault(); });
titleSuggest.addEventListener('click', e => {
  const b = e.target.closest('.sg');
  if (!b) return;
  const pick = titleSuggest.hits[Number(b.dataset.i)];
  fTitle.value = pick.title;
  hideSuggest();
  // 새로 만들 때만: 그 이름을 가장 최근에 쓴 할 일의 카테고리를 미리 골라 둠 (바꿀 수 있음). 날짜·반복은 그대로
  if (!original && state.categories.some(c => c.id === pick.last.categoryId)) {
    form.categoryId = pick.last.categoryId;
    renderCatChips();
  }
});

// ---------- 입력 반응 ----------
fMemo.addEventListener('input', autoGrow);

fTitle.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
    e.preventDefault();
    trySave();
  }
});

fDate.addEventListener('change', () => {
  if (!fDate.value) { fDate.value = form.date; return; }
  form.date = fDate.value;
  fEnd.min = form.date;
});

fRepeat.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  form.repeat.type = b.dataset.v;
  if (form.repeat.type === 'weekly' && !form.repeat.days.length) form.repeat.days = [parseYmd(form.date).getDay()];
  showError('');
  renderForm();
});

fDays.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const wd = Number(b.dataset.wd);
  const days = form.repeat.days;
  form.repeat.days = days.includes(wd) ? days.filter(x => x !== wd) : [...days, wd];
  renderForm();
});

fEnd.addEventListener('change', () => { form.repeat.end = fEnd.value; showError(''); });
fPin.addEventListener('change', () => { form.pin = fPin.checked; });

catChips.addEventListener('click', e => {
  const b = e.target.closest('.cat-chip');
  if (!b) return;
  if (b.id === 'catNewBtn') {
    const used = state.categories.map(c => c.color);
    newCatColor = COLOR_KEYS.find(k => !used.includes(k)) || 'blue';
    renderColorDots();
    fCatName.value = '';
    catNew.hidden = false;
    fCatName.focus();
    return;
  }
  form.categoryId = b.dataset.id;
  renderCatChips();
});

colorDots.addEventListener('click', e => {
  const b = e.target.closest('.color-dot');
  if (!b) return;
  newCatColor = b.dataset.color;
  renderColorDots();
});

function addCategory() {
  const name = fCatName.value.trim();
  if (!name) { fCatName.focus(); return; }
  const cat = { id: 'cat_' + Date.now().toString(36), name, color: newCatColor };
  state.categories.push(cat);
  form.categoryId = cat.id;
  saveState();
  catNew.hidden = true;
  renderCatChips();
}

document.getElementById('catAdd').addEventListener('click', addCategory);
fCatName.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); addCategory(); }
});

// ---------- 저장 ----------
function validate() {
  if (!fTitle.value.trim()) { fTitle.focus(); return '할 일을 입력해 주세요'; }
  const r = form.repeat;
  if (r.type === 'none') return '';
  if (!r.end) return '반복이 끝나는 날(종료일)을 정해 주세요';
  if (r.end < form.date) return '종료일은 날짜보다 뒤여야 해요';
  const limit = parseYmd(form.date);
  limit.setFullYear(limit.getFullYear() + 1);
  if (r.end > ymd(limit)) return '종료일은 날짜부터 1년 안으로 정해 주세요';
  if (r.type === 'weekly' && !r.days.length) return '반복할 요일을 하나 이상 골라 주세요';
  if (!repeatDates(form.date, r).length) return '반복 기간 안에 해당하는 날이 없어요';
  return '';
}

function fields() {
  return {
    title: fTitle.value.trim(),
    memo: fMemo.value.trim(),
    categoryId: form.categoryId,
    pin: form.pin
  };
}

// form.date부터 새 반복(또는 한 번) 할 일들을 만든다
function createFrom(keepDone) {
  const f = fields();
  if (form.repeat.type === 'none') {
    state.tasks.push({ id: newId(), ...f, date: form.date, done: !!keepDone });
    return;
  }
  const seriesId = newId();
  const rule = { type: form.repeat.type, days: [...form.repeat.days], end: form.repeat.end };
  repeatDates(form.date, rule).forEach((d, i) => {
    state.tasks.push({ id: newId(), ...f, date: d, done: i === 0 && d === form.date && !!keepDone, seriesId, repeat: rule });
  });
}

function removeWhere(fn) {
  state.tasks = state.tasks.filter(t => !fn(t));
}

function isFuture(t) {
  return original.seriesId && t.seriesId === original.seriesId && t.date >= original.date;
}

function finishSave() {
  state.settings.lastCategory = form.categoryId;
  saveState();
  closeSheet();
  renderAll();
}

function trySave() {
  const err = validate();
  showError(err);
  if (err) return;

  // 새 할 일
  if (!original) {
    createFrom(false);
    return finishSave();
  }

  const t = findTask(original.id);
  const ruleChanged = !sameRule(original.repeat, form.repeat.type === 'none' ? null : form.repeat);

  // 반복 아닌 할 일 수정
  if (!original.seriesId) {
    if (form.repeat.type === 'none') {
      Object.assign(t, fields(), { date: form.date });
    } else {
      removeWhere(x => x.id === original.id);
      createFrom(t.done);
    }
    return finishSave();
  }

  // 반복 규칙을 바꾸면 이 날부터 이후 모두에 적용
  if (ruleChanged) {
    removeWhere(isFuture);
    createFrom(t.done);
    return finishSave();
  }

  showActions('반복되는 할 일이에요', [
    { label: '이 날만 바꾸기', fn: () => {
      Object.assign(t, fields(), { date: form.date });
      finishSave();
    } },
    { label: '이후 모두 바꾸기', fn: () => {
      if (form.date !== original.date) {
        // 날짜를 옮기면 새 날짜부터 같은 규칙으로 다시 만든다
        removeWhere(isFuture);
        createFrom(t.done);
      } else {
        state.tasks.filter(isFuture).forEach(x => Object.assign(x, fields()));
      }
      finishSave();
    } }
  ]);
}

// ---------- 삭제 ----------
function tryDelete() {
  if (!original) return;
  const done = () => {
    ui.openMemos.delete(original.id);
    saveState();
    closeSheet();
    renderAll();
  };
  if (!original.seriesId) {
    showActions('', [{ label: '할 일 삭제', danger: true, fn: () => { removeWhere(x => x.id === original.id); done(); } }]);
    return;
  }
  showActions('반복되는 할 일이에요', [
    { label: '이 날만 삭제', danger: true, fn: () => { removeWhere(x => x.id === original.id); done(); } },
    { label: '이후 모두 삭제', danger: true, fn: () => { removeWhere(isFuture); done(); } }
  ]);
}

// ---------- 선택 창 ----------
let actionList = [];

function showActions(msg, list) {
  actionList = list;
  actionMsg.textContent = msg;
  actionBtns.innerHTML = list.map((a, i) =>
    `<button type="button" class="action-btn${a.danger ? ' danger' : ''}" data-i="${i}">${a.label}</button>`
  ).join('');
  document.activeElement && document.activeElement.blur();
  actionOverlay.hidden = false;
  requestAnimationFrame(() => actionOverlay.classList.add('show'));
}

function hideActions() {
  actionOverlay.classList.remove('show');
  setTimeout(() => { if (!actionOverlay.classList.contains('show')) actionOverlay.hidden = true; }, 260);
}

actionBtns.addEventListener('click', e => {
  const b = e.target.closest('.action-btn');
  if (!b) return;
  const a = actionList[Number(b.dataset.i)];
  hideActions();
  a.fn();
});

document.getElementById('actionCancel').addEventListener('click', hideActions);
actionOverlay.addEventListener('click', e => { if (e.target === actionOverlay) hideActions(); });

document.getElementById('sheetCancel').addEventListener('click', closeSheet);
sheetSave.addEventListener('click', trySave);
document.getElementById('sheetDelete').addEventListener('click', tryDelete);
sheetOverlay.addEventListener('click', e => {
  // 길게 눌러 연 직후 손을 떼며 생기는 클릭은 무시
  if (e.target === sheetOverlay && Date.now() - longPressedAt > 600) closeSheet();
});

// 입력 칸이 키보드에 가리지 않게: 그 칸이 속한 묶음을 창 맨 위쪽으로 올림
// (키보드 높이를 알 수 없는 환경에서도 되도록, 입력 중에는 창 아래에 빈 공간을 붙임)
function revealFocused() {
  const el = document.activeElement;
  if (!el || !el.matches('input, textarea') || !el.closest('.sheet-scroll')) return;
  const block = el.closest('.cat-row, .d-item, .group') || el;
  block.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
document.addEventListener('focusin', e => {
  const scroller = e.target.closest('.sheet-scroll');
  if (!scroller || !e.target.matches('input, textarea')) return;
  scroller.classList.add('typing');
  setTimeout(revealFocused, 350); // 키보드가 다 올라온 뒤
});
document.addEventListener('focusout', e => {
  const scroller = e.target.closest('.sheet-scroll');
  if (!scroller) return;
  setTimeout(() => {
    if (!scroller.contains(document.activeElement)) scroller.classList.remove('typing');
  }, 100);
});

// 아이폰 키보드가 올라오면 입력 창도 키보드 위로 올림
if (window.visualViewport) {
  const vv = window.visualViewport;
  const fit = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', kb + 'px');
    revealFocused();
  };
  vv.addEventListener('resize', fit);
  vv.addEventListener('scroll', fit);
}
