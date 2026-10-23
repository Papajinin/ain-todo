// AIN Todo 시작 v7: 헤더, D-Day 핀(길게 눌러 수정 창), 전체 그리기

const monthTitle = document.getElementById('monthTitle');
const todayBtn = document.getElementById('todayBtn');
const overdueBadge = document.getElementById('overdueBadge');
const chipsEl = document.getElementById('chips');

function renderHeader() {
  const d = parseYmd(ui.selected);
  monthTitle.textContent = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
  todayBtn.hidden = ui.selected === ui.today;

  const overdue = state.tasks.filter(isOverdue).length;
  overdueBadge.hidden = overdue === 0;
  overdueBadge.textContent = overdue > 99 ? '99+' : overdue;
}

// D-Day 핀: 완료하기 전까지 계속 표시, 가까운 순서
// 반복 할 일은 아직 안 한 것 중 가장 이른 날 하나만
function renderChips() {
  const first = {};
  state.tasks.filter(t => t.pin && !t.done).forEach(t => {
    const key = t.seriesId || t.id;
    if (!first[key] || t.date < first[key].date) first[key] = t;
  });
  const pins = Object.values(first)
    .map(t => ({ ...t, diff: daysBetween(ui.today, t.date) }))
    .sort((a, b) => a.diff - b.diff);
  chipsEl.hidden = pins.length === 0;
  chipsEl.innerHTML = pins.map(p => {
    const label = p.diff === 0 ? 'D-Day' : p.diff > 0 ? `D-${p.diff}` : `D+${-p.diff}`;
    return `<span class="chip" data-id="${p.id}"><b>${label}</b>${escapeHtml(p.title)}</span>`;
  }).join('');
}

// ---------- D-Day 칩 길게 누르기 (0.5초) → 수정 창 ----------
let chipPress = null;

function cancelChipPress() {
  if (!chipPress) return;
  clearTimeout(chipPress.timer);
  chipPress.chip.classList.remove('pressing');
  chipPress = null;
}

chipsEl.addEventListener('pointerdown', e => {
  const chip = e.target.closest('.chip');
  if (!chip || e.button > 0) return;
  cancelChipPress();
  chip.classList.add('pressing');
  chipPress = {
    chip, x: e.clientX, y: e.clientY,
    timer: setTimeout(() => {
      const id = chip.dataset.id;
      cancelChipPress();
      longPressedAt = Date.now();
      openSheet(id);
    }, 500)
  };
});

// 좌우로 넘기기 시작하면 취소
chipsEl.addEventListener('pointermove', e => {
  if (chipPress && Math.hypot(e.clientX - chipPress.x, e.clientY - chipPress.y) > 10) cancelChipPress();
});
chipsEl.addEventListener('scroll', cancelChipPress, { passive: true });
chipsEl.addEventListener('pointerup', cancelChipPress);
chipsEl.addEventListener('pointercancel', cancelChipPress);
chipsEl.addEventListener('pointerleave', cancelChipPress);
chipsEl.addEventListener('contextmenu', e => { if (e.target.closest('.chip')) e.preventDefault(); });

function renderAll() {
  renderHeader();
  renderChips();
  renderCalendar(false);
  renderList();
}

document.getElementById('prevBtn').addEventListener('click', () => moveCalendar(-1));
document.getElementById('nextBtn').addEventListener('click', () => moveCalendar(1));
todayBtn.addEventListener('click', () => selectDate(ui.today));
document.getElementById('addBtn').addEventListener('click', () => openSheet());
document.getElementById('drawerBtn').addEventListener('click', openDrawer);
document.getElementById('settingsBtn').addEventListener('click', openSettings);

// 앱을 켜 둔 채 날짜가 바뀌면 '오늘'을 새로 계산
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const now = todayStr();
  if (now === ui.today) return;
  if (ui.selected === ui.today) ui.selected = now;
  ui.today = now;
  renderAll();
});

// 시작 화면: 첫 화면을 다 그린 뒤에 움직이기 시작 → 약 1.8초 움직이고 잠깐 두었다가 사라짐 (세 앱 공통)
let splashStarted = false;
function startSplash() {
  if (splashStarted) return;
  splashStarted = true;
  const splash = document.getElementById('splash');
  splash.classList.add('go');
  setTimeout(() => {
    splash.classList.add('hide');
    setTimeout(() => splash.remove(), 400);
  }, 2000);
}

loadState(); // 기기에 저장된 내용으로 먼저 보여 주고, 클라우드에서 최신 내용을 받으면 다시 그림
applyTheme();
ui.expanded = state.settings.calendarView === 'month';
renderAll();
initCloud();
requestAnimationFrame(() => requestAnimationFrame(startSplash)); // 첫 화면이 그려진 다음 장면부터
setTimeout(startSplash, 1000); // 화면 그리기 신호가 오지 않는 경우(백그라운드에서 열림 등) 대비
