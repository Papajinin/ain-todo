// AIN Todo 캘린더 v4: 일요일·공휴일 빨간 숫자, 주간·월간 접고 펴기, 이전·다음 이동, 쓸어넘기기(손가락 따라 넘어감)

const calEl = document.getElementById('cal');
const calBody = document.getElementById('calBody');
const calGrid = document.getElementById('calGrid');
const calLabels = document.getElementById('calLabels');
const handleBtn = document.getElementById('handleBtn');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// 날짜 칸의 위치: 가로(넘김 애니메이션), 세로(주간일 때 선택한 주로 올림)
let gridX = 0;
let gridY = 0;
let sliding = false;

function applyGrid() {
  calGrid.style.transform = `translate(${gridX}px, ${gridY}px)`;
}

function weekStartDay() {
  return state.settings.weekStart === 'sun' ? 0 : 1;
}

// 선택한 날짜가 있는 달의 전체 칸 (앞뒤 달 날짜 포함, 5~6줄)
function monthCells(selected) {
  const sel = parseYmd(selected);
  const y = sel.getFullYear(), m = sel.getMonth();
  const first = new Date(y, m, 1);
  const offset = (first.getDay() - weekStartDay() + 7) % 7;
  const lastDate = new Date(y, m + 1, 0).getDate();
  const rows = Math.ceil((offset + lastDate) / 7);
  const cells = [];
  for (let i = 0; i < rows * 7; i++) {
    const d = new Date(y, m, 1 - offset + i);
    cells.push({ str: ymd(d), day: d.getDate(), inMonth: d.getMonth() === m });
  }
  return { rows, cells };
}

// 날짜별 카테고리 색 점 (최대 3개, 같은 카테고리는 한 번만)
function dotsByDate() {
  const map = {};
  state.tasks.forEach(t => {
    if (picking() && !ui.pick.includes(t.categoryId)) return; // 골라 보기 중이면 고른 카테고리만
    const list = map[t.date] || (map[t.date] = []);
    if (!list.includes(t.categoryId)) list.push(t.categoryId);
  });
  return map;
}

function renderCalendar(animate) {
  const start = weekStartDay();
  calLabels.innerHTML = [0, 1, 2, 3, 4, 5, 6].map(i => {
    const wd = (start + i) % 7;
    return `<div${wd === 0 ? ' class="sun"' : ''}>${WEEK_NAMES[wd]}</div>`;
  }).join('');

  const { rows, cells } = monthCells(ui.selected);
  const dots = dotsByDate();
  let selRow = 0;
  calGrid.innerHTML = cells.map((c, i) => {
    const cls = ['day'];
    if (!c.inMonth) cls.push('out');
    if (isRedDay(c.str)) cls.push('red');
    if (c.str === ui.today) cls.push('today');
    if (c.str === ui.selected) { cls.push('sel'); selRow = Math.floor(i / 7); }
    const ds = (dots[c.str] || []).slice(0, 3).map(id => `<i class="dot" style="background:${catColor(id)}"></i>`).join('');
    return `<button class="${cls.join(' ')}" type="button" data-date="${c.str}" aria-label="${c.str}"><span class="num">${c.day}</span><span class="dots">${ds}</span></button>`;
  }).join('');

  // 이동할 때는 바로, 접고 펼 때만 부드럽게
  if (!animate) calEl.classList.add('no-anim');
  const rowH = calGrid.firstElementChild.getBoundingClientRect().height || 46;
  calBody.style.height = (ui.expanded ? rows : 1) * rowH + 'px';
  gridY = ui.expanded ? 0 : -selRow * rowH;
  applyGrid();
  if (!animate) {
    calEl.offsetHeight; // 바로 적용
    calEl.classList.remove('no-anim');
  }
  handleBtn.setAttribute('aria-label', ui.expanded ? '주간으로 접기' : '월간으로 펼치기');
}

function toggleExpand(open) {
  const next = open === undefined ? !ui.expanded : open;
  if (next === ui.expanded || sliding) return;
  ui.expanded = next;
  // 주간으로 접으면 골라 보기는 풀림 (골라 보기는 월간에서만)
  if (!next && ui.pick.length) {
    ui.pick = [];
    renderList();
  }
  renderCalendar(true);
  renderPickBtn();
}

// 주간: 7일씩 / 월간: 한 달씩 (그 달에 오늘이 있으면 오늘, 아니면 1일 선택)
function nextSelected(dir) {
  if (!ui.expanded) return addDays(ui.selected, 7 * dir);
  const sel = parseYmd(ui.selected);
  const first = new Date(sel.getFullYear(), sel.getMonth() + dir, 1);
  const t = parseYmd(ui.today);
  const sameMonth = t.getFullYear() === first.getFullYear() && t.getMonth() === first.getMonth();
  return sameMonth ? ui.today : ymd(first);
}

function moveCalendar(dir) {
  if (sliding) return;
  if (reduceMotion) {
    ui.selected = nextSelected(dir);
    renderAll();
    return;
  }
  slideCalendar(dir);
}

// 아이폰처럼: 지금 화면이 옆으로 밀려나고, 새 화면이 반대쪽에서 들어온다
function slideCalendar(dir) {
  sliding = true;
  const w = calBody.clientWidth;
  const outMs = Math.round(80 + 140 * (1 - Math.min(Math.abs(gridX) / w, 1)));
  calGrid.style.transition = `transform ${outMs}ms ease-in`;
  gridX = -dir * w;
  applyGrid();
  setTimeout(() => {
    ui.selected = nextSelected(dir);
    calGrid.style.transition = 'none';
    gridX = dir * w;
    renderAll();
    calGrid.offsetHeight; // 새 화면을 반대쪽에 먼저 놓기
    calGrid.style.transition = 'transform 240ms ease-out';
    gridX = 0;
    applyGrid();
    setTimeout(() => {
      calGrid.style.transition = '';
      sliding = false;
    }, 250);
  }, outMs);
}

// 덜 밀었으면 제자리로
function snapBack() {
  calGrid.style.transition = 'transform 200ms ease-out';
  gridX = 0;
  applyGrid();
  setTimeout(() => { calGrid.style.transition = ''; }, 210);
}

function selectDate(str) {
  ui.selected = str;
  renderAll();
  if (picking()) scrollToPickDay(str);
}

// ---------- 터치: 좌우는 손가락 따라 넘기기, 아래로 쓸면 펼치기, 위로 쓸면 접기 ----------
let touch = null;
let swipedAt = 0;

calEl.addEventListener('touchstart', e => {
  if (sliding) return;
  const t = e.touches[0];
  touch = { x: t.clientX, y: t.clientY, time: Date.now(), axis: null };
}, { passive: true });

calEl.addEventListener('touchmove', e => {
  if (!touch) return;
  const t = e.touches[0];
  const dx = t.clientX - touch.x;
  const dy = t.clientY - touch.y;
  if (!touch.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
    touch.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    swipedAt = Date.now();
  }
  if (touch.axis === 'x' && !reduceMotion) {
    calGrid.style.transition = 'none';
    gridX = dx;
    applyGrid();
  }
}, { passive: true });

calEl.addEventListener('touchend', e => {
  if (!touch) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touch.x;
  const dy = t.clientY - touch.y;
  const fast = Math.abs(dx) / Math.max(Date.now() - touch.time, 1) > 0.4; // 휙 넘긴 경우
  const axis = touch.axis;
  touch = null;
  if (axis) swipedAt = Date.now();
  if (axis === 'x') {
    const far = Math.abs(dx) > calBody.clientWidth * 0.25;
    if (far || (fast && Math.abs(dx) > 30)) moveCalendar(dx < 0 ? 1 : -1);
    else if (!reduceMotion) snapBack();
  } else if (axis === 'y' && Math.abs(dy) > 30) {
    toggleExpand(dy > 0);
  }
});

calEl.addEventListener('touchcancel', () => {
  if (touch && touch.axis === 'x') snapBack();
  touch = null;
});

calGrid.addEventListener('click', e => {
  if (sliding || Date.now() - swipedAt < 400 || Date.now() - longPressedAt < 600) return;
  const btn = e.target.closest('.day');
  if (!btn) return;
  // PC: 같은 날짜를 두 번 빠르게 누르면 그 날짜로 새 할 일
  const now = Date.now();
  if (isPointerFine && lastDayClick && lastDayClick.date === btn.dataset.date && now - lastDayClick.time < 400) {
    lastDayClick = null;
    openSheet();
    return;
  }
  lastDayClick = { date: btn.dataset.date, time: now };
  selectDate(btn.dataset.date);
});

// ---------- 날짜 길게 누르기 (0.5초) → 그 날짜로 새 할 일 ----------
let dayPress = null;
let lastDayClick = null;

function cancelDayPress() {
  if (!dayPress) return;
  clearTimeout(dayPress.timer);
  dayPress.btn.classList.remove('pressing');
  dayPress = null;
}

calGrid.addEventListener('pointerdown', e => {
  const btn = e.target.closest('.day');
  if (!btn || e.button > 0 || sliding) return;
  cancelDayPress();
  btn.classList.add('pressing');
  dayPress = {
    btn, x: e.clientX, y: e.clientY,
    timer: setTimeout(() => {
      const date = btn.dataset.date;
      cancelDayPress();
      longPressedAt = Date.now();
      selectDate(date);
      openSheet();
    }, 500)
  };
});

// 넘기거나 펼치려고 움직이면 취소
calGrid.addEventListener('pointermove', e => {
  if (dayPress && Math.hypot(e.clientX - dayPress.x, e.clientY - dayPress.y) > 10) cancelDayPress();
});
calGrid.addEventListener('pointerup', cancelDayPress);
calGrid.addEventListener('pointercancel', cancelDayPress);
calGrid.addEventListener('pointerleave', cancelDayPress);
calGrid.addEventListener('contextmenu', e => { if (e.target.closest('.day')) e.preventDefault(); });

handleBtn.addEventListener('click', () => {
  if (Date.now() - swipedAt < 400) return;
  toggleExpand();
});
