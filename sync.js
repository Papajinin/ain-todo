// AIN Todo 클라우드 v2: 구글 로그인 + 실시간 동기화 (Firebase Auth + Firestore)
//  - 클라우드 위치: users/{uid} 문서(카테고리, 설정) + users/{uid}/tasks/{할 일 id} 문서 하나씩
//  - 할 일을 하나씩 따로 저장해서, 폰과 PC에서 서로 다른 할 일을 고쳐도 덮어쓰지 않음
//  - 다른 기기에서 바꾸면 onSnapshot으로 바로 받아서 화면을 다시 그림
//  - 인터넷이 끊겨도 Firestore가 기기에 저장해 뒀다가 연결되면 올림
//  - 누가 쓸 수 있는지는 Firebase 관리 화면의 Firestore "규칙"에서 정함 (firestore.rules 참고)

// Firebase 관리 화면 → 프로젝트 설정 → 내 앱(웹)에서 복사해 넣는 값
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCNDfsJnE_jHWR1YYWBiCZ_ArCfbiz0OFQ',
  authDomain: 'ain-todo.firebaseapp.com',
  projectId: 'ain-todo',
  storageBucket: 'ain-todo.firebasestorage.app',
  messagingSenderId: '1097869200161',
  appId: '1:1097869200161:web:cdc6de820886b4180e8c60'
};

const UID_KEY = 'ainTodo.uid';          // 이 기기에 마지막으로 로그인한 사람
const LOCAL_ONLY_SETTINGS = ['theme'];  // 기기마다 따로 두는 설정 (결정 13번)

const loginEl = document.getElementById('login');
const loginError = document.getElementById('loginError');

const cloud = {
  auth: null,
  db: null,
  user: null,
  ready: false,          // 첫 내려받기가 끝났는지 (끝나기 전에는 올리지 않음)
  gotUser: false,
  gotTasks: false,
  unsubs: [],
  shadowTasks: new Map(), // 클라우드에 있는 할 일 (id → 글자) — 바뀐 것만 올리려고
  shadowUser: ''
};

// 키 순서와 상관없이 같은 내용인지 비교하려고 키를 정렬해서 글자로 만듦
function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

function userPayload() {
  const settings = { ...state.settings };
  LOCAL_ONLY_SETTINGS.forEach(k => delete settings[k]);
  return { categories: state.categories, settings };
}

// ---------- 로그인 화면 ----------
function showLogin(msg) {
  loginError.textContent = msg || '';
  loginError.hidden = !msg;
  loginEl.hidden = false;
}
function hideLogin() {
  loginEl.hidden = true;
}
function showLoginError(err) {
  console.warn(err);
  showLogin('로그인하지 못했어요. 잠시 뒤 다시 해 주세요.' + (err && err.code ? ` (${err.code})` : ''));
}

// ---------- 시작 ----------
function initCloud() {
  if (!window.firebase) {
    // 인터넷이 없어 Firebase를 못 불러온 경우: 전에 로그인했으면 기기에 저장된 내용으로 계속
    if (!localStorage.getItem(UID_KEY)) showLogin('인터넷 연결을 확인해 주세요.');
    return;
  }
  if (!FIREBASE_CONFIG.apiKey) {
    showLogin('Firebase 설정이 아직 없어요.');
    return;
  }
  firebase.initializeApp(FIREBASE_CONFIG);
  cloud.auth = firebase.auth();
  cloud.db = firebase.firestore();
  cloud.db.settings({ ignoreUndefinedProperties: true });
  cloud.db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

  cloud.auth.getRedirectResult().catch(showLoginError);
  cloud.auth.onAuthStateChanged(user => {
    if (user) startSync(user);
    else {
      stopSync();
      showLogin();
    }
  });
  // 전에 로그인한 적이 없으면 확인을 기다리지 않고 바로 로그인 화면
  if (!localStorage.getItem(UID_KEY)) showLogin();
}

function signIn() {
  if (!cloud.auth) return;
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  cloud.auth.signInWithPopup(provider).catch(err => {
    // 팝업이 막힌 환경(홈 화면 앱 등)이면 페이지 이동 방식으로 다시
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
      return cloud.auth.signInWithRedirect(provider).catch(showLoginError);
    }
    if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') showLoginError(err);
  });
}

// ---------- 동기화 ----------
function userRef() {
  return cloud.db.collection('users').doc(cloud.user.uid);
}

function startSync(user) {
  stopSync();
  cloud.user = user;

  // 이 기기에 다른 사람이 쓰던 내용이 있으면 비움
  if (localStorage.getItem(UID_KEY) !== user.uid) {
    resetLocalState();
    try { localStorage.setItem(UID_KEY, user.uid); } catch (e) {}
  }

  const ref = userRef();
  // 허용된 계정인지 확인하면서, 처음 쓰는 사람이면 기본 카테고리를 만들어 둠
  ref.get().then(snap => {
    if (!snap.exists) {
      return ref.set({ ...userPayload(), createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
  }).then(subscribe, err => {
    if (err.code === 'permission-denied') return denyAccount();
    subscribe(); // 인터넷이 없을 때 등: 기기에 저장된 내용으로 계속
  });
}

function subscribe() {
  if (!cloud.user) return;
  hideLogin();
  const ref = userRef();
  cloud.unsubs.push(ref.onSnapshot(onUserSnap, onCloudError));
  cloud.unsubs.push(ref.collection('tasks').onSnapshot(onTasksSnap, onCloudError));
}

function onUserSnap(snap) {
  if (snap.exists) {
    const d = snap.data();
    state.categories = d.categories && d.categories.length ? d.categories : DEFAULT_CATEGORIES;
    const local = {};
    LOCAL_ONLY_SETTINGS.forEach(k => { local[k] = state.settings[k]; });
    state.settings = { ...state.settings, ...(d.settings || {}), ...local };
    cloud.shadowUser = stableStringify(userPayload());
    applyTheme(); // 다른 기기에서 테마 색을 바꿨으면 바로 반영
  }
  cloud.gotUser = true;
  afterSnapshot();
}

function onTasksSnap(snap) {
  const tasks = [];
  cloud.shadowTasks = new Map();
  snap.forEach(doc => {
    const t = { ...doc.data(), id: doc.id };
    tasks.push(t);
    cloud.shadowTasks.set(t.id, stableStringify(t));
  });
  state.tasks = tasks;
  cloud.gotTasks = true;
  afterSnapshot();
}

function afterSnapshot() {
  if (cloud.gotUser && cloud.gotTasks) cloud.ready = true;
  saveLocal();
  refreshViews();
}

// 다른 기기에서 바뀐 내용을 화면에 반영 (입력 중인 곳은 건드리지 않음)
function refreshViews() {
  if (ui.editingId) return;
  renderAll();
  if (!drawerOverlay.hidden) renderDrawer();
  const typing = document.activeElement && settingsOverlay.contains(document.activeElement) && document.activeElement.matches('input');
  if (!settingsOverlay.hidden && !typing) renderSettings();
}

// saveState()가 부름: 바뀐 할 일만 골라서 올림
function cloudSave() {
  if (!cloud.user || !cloud.ready) return;
  const ref = userRef();
  const ops = [];
  const now = new Map(state.tasks.map(t => [t.id, t]));

  now.forEach((t, id) => {
    const json = stableStringify(t);
    if (cloud.shadowTasks.get(id) === json) return;
    const { id: _, ...data } = t;
    ops.push(b => b.set(ref.collection('tasks').doc(id), data));
    cloud.shadowTasks.set(id, json);
  });
  cloud.shadowTasks.forEach((_, id) => {
    if (now.has(id)) return;
    ops.push(b => b.delete(ref.collection('tasks').doc(id)));
    cloud.shadowTasks.delete(id);
  });
  const u = stableStringify(userPayload());
  if (u !== cloud.shadowUser) {
    ops.push(b => b.set(ref, userPayload(), { merge: true }));
    cloud.shadowUser = u;
  }

  // 한 번에 보낼 수 있는 개수(500)를 넘지 않게 나눠서
  for (let i = 0; i < ops.length; i += 400) {
    const batch = cloud.db.batch();
    ops.slice(i, i + 400).forEach(f => f(batch));
    batch.commit().catch(onCloudError);
  }
}

function onCloudError(err) {
  console.warn(err);
  if (err && err.code === 'permission-denied') denyAccount();
}

function stopSync() {
  cloud.unsubs.forEach(u => u());
  cloud.unsubs = [];
  cloud.user = null;
  cloud.ready = cloud.gotUser = cloud.gotTasks = false;
  cloud.shadowTasks = new Map();
  cloud.shadowUser = '';
}

// 가족 목록에 없는 계정
function denyAccount() {
  stopSync();
  try { localStorage.removeItem(UID_KEY); } catch (e) {}
  resetLocalState();
  cloud.auth.signOut();
  showLogin('이 계정은 사용할 수 없어요. 가족 계정으로 로그인해 주세요.');
}

// 기기에 저장된 할 일·카테고리를 비움 (화면 모드는 남김)
function resetLocalState() {
  state.tasks = [];
  state.categories = DEFAULT_CATEGORIES;
  state.settings = { weekStart: 'mon', calendarView: 'week', theme: state.settings.theme };
  saveLocal();
  renderAll();
}

function confirmSignOut() {
  showActions('로그아웃하면 이 기기에서 할 일이 보이지 않아요. 다시 로그인하면 그대로 돌아와요.', [
    { label: '로그아웃', danger: true, fn: () => {
      stopSync();
      try { localStorage.removeItem(UID_KEY); } catch (e) {}
      resetLocalState();
      hideOverlay(settingsOverlay);
      cloud.auth.signOut();
    } }
  ]);
}

document.getElementById('loginBtn').addEventListener('click', signIn);
