// AIN Todo 공통 v7: 날짜 도우미, 저장소, 상태, 화면 모드·테마 색

const STORE_KEY = 'ainTodo';
const WEEK_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

// ---------- 날짜 ('YYYY-MM-DD' 문자열로 다룸) ----------
function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
function daysBetween(from, to) {
  return Math.round((parseYmd(to) - parseYmd(from)) / 86400000);
}
function todayStr() {
  return ymd(new Date());
}

// ---------- 상태 ----------
const DEFAULT_CATEGORIES = [
  { id: 'cat_work', name: '업무', color: 'blue' },
  { id: 'cat_personal', name: '개인', color: 'green' },
  { id: 'cat_family', name: '가족', color: 'purple' },
  { id: 'cat_health', name: '건강', color: 'orange' }
];

let state = {
  categories: DEFAULT_CATEGORIES,
  tasks: [],
  // theme: light | dark | auto (기기마다), accent: blue | green | red | yellow (계정마다), calendarView: week | month
  settings: { weekStart: 'mon', theme: 'auto', accent: 'blue', calendarView: 'week' }
};

// 저장하지 않는 화면 상태
const ui = {
  today: todayStr(),
  selected: todayStr(),
  expanded: false,
  openMemos: new Set(),
  editingId: null
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    state = {
      categories: saved.categories || DEFAULT_CATEGORIES,
      tasks: saved.tasks || [],
      settings: { ...state.settings, ...(saved.settings || {}) }
    };
    return true;
  } catch (e) {
    return false;
  }
}

// 이 기기에만 저장 (클라우드에서 받은 내용을 저장할 때)
function saveLocal() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {}
}

// 내가 바꾼 내용 저장: 기기 + 클라우드 (sync.js)
function saveState() {
  saveLocal();
  if (typeof cloudSave === 'function') cloudSave();
}

// 화면 모드('자동'이면 아이폰 설정을 따름)와 테마 색
function applyTheme() {
  const { theme: mode, accent } = state.settings;
  const root = document.documentElement;
  if (mode === 'light' || mode === 'dark') root.setAttribute('data-theme', mode);
  else root.removeAttribute('data-theme');
  if (accent === 'green' || accent === 'red' || accent === 'yellow') root.setAttribute('data-accent', accent);
  else root.removeAttribute('data-accent');
}

// 아직 하지 않았고, 넘기지도 않은 지난 할 일
function isOverdue(t) {
  return !t.done && !t.skipped && t.date < ui.today;
}

// 아래에서 올라오는 창 열기·닫기 (설정, 미완료 서랍)
function showOverlay(el) {
  el.hidden = false;
  document.body.classList.add('locked');
  requestAnimationFrame(() => el.classList.add('show'));
}
function hideOverlay(el) {
  el.classList.remove('show');
  document.body.classList.remove('locked');
  setTimeout(() => { if (!el.classList.contains('show')) el.hidden = true; }, 380); // 닫히는 움직임(0.35초)이 끝난 뒤
}

function newId() {
  return 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function catColor(categoryId) {
  const c = state.categories.find(x => x.id === categoryId);
  return c ? `var(--c-${c.color})` : 'var(--sub)';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// 선택 버튼 묶음(.seg): 고른 칸 표시가 옆으로 미끄러짐 (네 앱 공통 방식)
// 어느 칸을 골랐는지는 화면마다 .on으로 정하고, 여기서는 그 칸을 따라가기만 함
const segPos = new Map(); // 묶음을 다시 그려도 지난 자리에서 미끄러지게
function segKey(seg) { return seg.id || seg.dataset.seg || seg.getAttribute('aria-label') || ''; }
function moveSegThumb(thumb, pos, animate) {
  if (!animate) thumb.style.transition = 'none';
  thumb.style.width = pos.w + 'px';
  thumb.style.transform = `translateX(${pos.x}px)`;
  if (!animate) { void thumb.offsetWidth; thumb.style.transition = ''; }
}
function placeSegThumb(seg, animate) {
  let thumb = seg.querySelector(':scope > .seg-thumb');
  if (!thumb) {
    thumb = document.createElement('span');
    thumb.className = 'seg-thumb';
    seg.prepend(thumb);
    seg.classList.add('has-thumb');
    segResize.observe(seg);
    const last = segPos.get(segKey(seg));
    if (last) { moveSegThumb(thumb, last, false); thumb.dataset.ready = '1'; } else animate = false;
  }
  const on = seg.querySelector(':scope > button.on');
  thumb.hidden = !on;
  if (!on || !on.offsetWidth) return; // 닫힌 창 안: 보일 때 segResize가 다시 부름
  const pos = { x: on.offsetLeft, w: on.offsetWidth };
  moveSegThumb(thumb, pos, animate && thumb.dataset.ready === '1');
  thumb.dataset.ready = '1';
  if (segKey(seg)) segPos.set(segKey(seg), pos);
}
const segResize = new ResizeObserver(list => list.forEach(e => placeSegThumb(e.target, true)));
new MutationObserver(list => {
  const segs = new Set();
  for (const m of list) {
    if (m.type === 'attributes') {
      const p = m.target.parentElement;
      if (p && p.classList.contains('seg')) segs.add(p);
      continue;
    }
    if (m.target.classList && m.target.classList.contains('seg')) segs.add(m.target);
    m.addedNodes.forEach(n => {
      if (n.nodeType !== 1) return;
      if (n.classList.contains('seg')) segs.add(n);
      n.querySelectorAll('.seg').forEach(s => segs.add(s));
    });
  }
  segs.forEach(s => placeSegThumb(s, true));
}).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
document.querySelectorAll('.seg').forEach(s => placeSegThumb(s, false));
// 아이폰 사파리는 이게 있어야 누르는 동안(:active) 모양이 바뀜
document.addEventListener('touchstart', () => {}, { passive: true });
