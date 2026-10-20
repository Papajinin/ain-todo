// AIN Todo 공통 v3: 날짜 도우미, 저장소, 상태, 화면 모드

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
  // theme: light | dark | auto, calendarView: week | month
  settings: { weekStart: 'mon', theme: 'auto', calendarView: 'week' }
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

// 화면 모드: '자동'이면 아이폰 설정을 따름
const THEME_BG = { light: '#F2F2F7', dark: '#000000' };
function applyTheme() {
  const mode = state.settings.theme;
  const root = document.documentElement;
  if (mode === 'light' || mode === 'dark') root.setAttribute('data-theme', mode);
  else root.removeAttribute('data-theme');
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
    const own = m.media.includes('dark') ? THEME_BG.dark : THEME_BG.light;
    m.content = THEME_BG[mode] || own;
  });
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
  setTimeout(() => { if (!el.classList.contains('show')) el.hidden = true; }, 300);
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
