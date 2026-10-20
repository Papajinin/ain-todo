// AIN Todo 설정 v2: 화면 모드, 한 주의 시작, 캘린더 기본 보기, 카테고리 관리, 계정, 백업 내보내기

const settingsOverlay = document.getElementById('settingsOverlay');
const sCats = document.getElementById('sCats');
const DRAG_SVG = '<svg viewBox="0 0 24 24"><path d="M4 8h16M4 12h16M4 16h16"/></svg>';

let openCatId = null; // 이름·색을 고치는 중인 카테고리

function renderSettings() {
  const s = state.settings;
  [['sTheme', s.theme], ['sWeek', s.weekStart], ['sView', s.calendarView]].forEach(([id, v]) => {
    document.getElementById(id).querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  });
  document.getElementById('accountEmail').textContent = (cloud.user && cloud.user.email) || '';
  renderSettingsCats();
}

function renderSettingsCats() {
  sCats.innerHTML = state.categories.map(c => {
    const count = state.tasks.filter(t => t.categoryId === c.id).length;
    const open = c.id === openCatId;
    return `<div class="cat-row${open ? ' open' : ''}" data-id="${c.id}">
      <div class="cat-line">
        <span class="drag" aria-label="순서 바꾸기">${DRAG_SVG}</span>
        <button class="cat-main" type="button" aria-expanded="${open}">
          <i style="background:var(--c-${c.color})"></i>
          <span class="cat-name">${escapeHtml(c.name)}</span>
          <span class="cat-count">${count}</span>
        </button>
      </div>
      ${open ? `<div class="cat-edit">
        <input class="cat-name-input" type="text" value="${escapeHtml(c.name)}" maxlength="10" enterkeyhint="done" autocomplete="off" aria-label="카테고리 이름">
        <div class="color-dots">${COLOR_KEYS.map(k =>
          `<button type="button" class="color-dot${k === c.color ? ' on' : ''}" data-color="${k}" aria-label="${k}"><i style="background:var(--c-${k})"></i></button>`).join('')}</div>
        <button class="row danger" type="button" data-act="del">카테고리 삭제</button>
      </div>` : ''}
    </div>`;
  }).join('') +
    `<button class="row link add-cat" type="button" id="addCatRow">+ 카테고리 추가</button>`;
}

function openSettings() {
  openCatId = null;
  renderSettings();
  showOverlay(settingsOverlay);
}

function setSetting(key, value) {
  state.settings[key] = value;
  saveState();
  if (key === 'theme') applyTheme();
  if (key === 'calendarView') ui.expanded = value === 'month'; // 바로 보여 주기
  renderSettings();
  renderAll();
}

document.getElementById('sTheme').addEventListener('click', e => {
  const b = e.target.closest('button'); if (b) setSetting('theme', b.dataset.v);
});
document.getElementById('sWeek').addEventListener('click', e => {
  const b = e.target.closest('button'); if (b) setSetting('weekStart', b.dataset.v);
});
document.getElementById('sView').addEventListener('click', e => {
  const b = e.target.closest('button'); if (b) setSetting('calendarView', b.dataset.v);
});

// ---------- 카테고리 ----------
function catById(id) {
  return state.categories.find(c => c.id === id);
}

sCats.addEventListener('click', e => {
  if (e.target.closest('#addCatRow')) {
    const used = state.categories.map(c => c.color);
    const cat = { id: 'cat_' + Date.now().toString(36), name: '새 카테고리', color: COLOR_KEYS.find(k => !used.includes(k)) || 'blue' };
    state.categories.push(cat);
    saveState();
    openCatId = cat.id;
    renderSettingsCats();
    const input = sCats.querySelector('.cat-name-input');
    input.focus();
    input.select();
    return;
  }
  const row = e.target.closest('.cat-row');
  if (!row) return;
  const cat = catById(row.dataset.id);

  if (e.target.closest('.cat-main')) {
    openCatId = openCatId === cat.id ? null : cat.id;
    renderSettingsCats();
    return;
  }
  const dot = e.target.closest('.color-dot');
  if (dot) {
    cat.color = dot.dataset.color;
    saveState();
    renderSettingsCats();
    renderAll();
    return;
  }
  if (e.target.closest('[data-act="del"]')) deleteCategory(cat);
});

// 이름은 입력하는 대로 저장 (빈 이름은 저장하지 않음)
sCats.addEventListener('input', e => {
  if (!e.target.matches('.cat-name-input')) return;
  const cat = catById(e.target.closest('.cat-row').dataset.id);
  const name = e.target.value.trim();
  if (!name) return;
  cat.name = name;
  e.target.closest('.cat-row').querySelector('.cat-name').textContent = name;
  saveState();
});
sCats.addEventListener('keydown', e => {
  if (e.target.matches('.cat-name-input') && e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) e.target.blur();
});

// 할 일이 있으면 다른 카테고리로 옮긴 뒤 삭제 (결정 7번)
function deleteCategory(cat) {
  if (state.categories.length === 1) {
    showActions('카테고리가 하나뿐이라 지울 수 없어요', []);
    return;
  }
  const remove = targetId => {
    if (targetId) state.tasks.forEach(t => { if (t.categoryId === cat.id) t.categoryId = targetId; });
    state.categories = state.categories.filter(c => c.id !== cat.id);
    if (state.settings.lastCategory === cat.id) delete state.settings.lastCategory;
    openCatId = null;
    saveState();
    renderSettingsCats();
    renderAll();
  };
  const count = state.tasks.filter(t => t.categoryId === cat.id).length;
  if (!count) {
    showActions(`'${cat.name}' 카테고리를 삭제할까요?`, [{ label: '카테고리 삭제', danger: true, fn: () => remove(null) }]);
    return;
  }
  showActions(`'${cat.name}'의 할 일 ${count}개를 어느 카테고리로 옮길까요? 옮긴 뒤 이 카테고리는 삭제돼요.`,
    state.categories.filter(c => c.id !== cat.id).map(c => ({
      label: `<i class="a-dot" style="background:var(--c-${c.color})"></i>${escapeHtml(c.name)}`,
      fn: () => remove(c.id)
    })));
}

// ---------- 끌어서 순서 바꾸기 ----------
let drag = null;

sCats.addEventListener('pointerdown', e => {
  const handle = e.target.closest('.drag');
  if (!handle) return;
  e.preventDefault();
  if (openCatId) { // 고치는 중인 칸이 있으면 먼저 닫기
    openCatId = null;
    renderSettingsCats();
    return;
  }
  const row = handle.closest('.cat-row');
  const rows = [...sCats.querySelectorAll('.cat-row')];
  drag = { row, rows, from: rows.indexOf(row), to: rows.indexOf(row), y: e.clientY, h: row.offsetHeight, handle, pid: e.pointerId };
  handle.setPointerCapture(e.pointerId);
  row.classList.add('dragging');
});

sCats.addEventListener('pointermove', e => {
  if (!drag) return;
  const dy = e.clientY - drag.y;
  const max = drag.rows.length - 1;
  drag.to = Math.max(0, Math.min(max, drag.from + Math.round(dy / drag.h)));
  drag.row.style.transform = `translateY(${dy}px)`;
  drag.rows.forEach((r, i) => {
    if (r === drag.row) return;
    let shift = 0;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) shift = -drag.h;
    if (drag.from > drag.to && i < drag.from && i >= drag.to) shift = drag.h;
    r.style.transform = shift ? `translateY(${shift}px)` : '';
  });
});

function endDrag() {
  if (!drag) return;
  const { from, to } = drag;
  drag = null;
  if (from !== to) {
    const [moved] = state.categories.splice(from, 1);
    state.categories.splice(to, 0, moved);
    saveState();
    renderAll();
  }
  renderSettingsCats();
}
sCats.addEventListener('pointerup', endDrag);
sCats.addEventListener('pointercancel', endDrag);

// ---------- 백업 내보내기 ----------
function exportBackup() {
  const data = {
    app: 'AIN Todo',
    version: 1,
    exportedAt: new Date().toISOString(),
    categories: state.categories,
    tasks: state.tasks,
    settings: state.settings
  };
  const name = `ain-todo-backup-${ui.today}.json`;
  const file = new File([JSON.stringify(data, null, 2)], name, { type: 'application/json' });
  // 아이폰: 공유 창 → "파일에 저장" / PC: 바로 내려받기
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file] }).catch(() => {});
    return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.getElementById('exportBtn').addEventListener('click', exportBackup);
document.getElementById('logoutBtn').addEventListener('click', () => confirmSignOut());
document.getElementById('settingsClose').addEventListener('click', () => hideOverlay(settingsOverlay));
settingsOverlay.addEventListener('click', e => { if (e.target === settingsOverlay) hideOverlay(settingsOverlay); });
