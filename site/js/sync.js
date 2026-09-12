// Firebase 雲端同步。
// 設計原則：localStorage 永遠是主要儲存，雲端只是額外的一層。
// 沒網路、沒登入、Firebase 掛掉 — 練習功能都必須照常運作。

import * as store from './store.js';

const CFG = {
  apiKey: 'AIzaSyAQP6eV3hM5FMxkEjHPBsdKwZ_0ul1QMj8',
  authDomain: 'toiecvocabulary.firebaseapp.com',
  projectId: 'toiecvocabulary',
  storageBucket: 'toiecvocabulary.firebasestorage.app',
  messagingSenderId: '360437030530',
  appId: '1:360437030530:web:cc2f26de44f97e45bade9b',
};
const V = 'https://www.gstatic.com/firebasejs/10.14.1';

let fb = null;          // {auth, db, fns}
let user = null;
let pushTimer = null;
let listeners = [];

export const currentUser = () => user;
export const onChange = fn => { listeners.push(fn); return () => { listeners = listeners.filter(x => x !== fn); }; };
const emit = () => listeners.forEach(fn => { try { fn(user); } catch {} });

// Firebase SDK 只在需要時才載入，離線或被擋也不影響主程式啟動
async function ensure() {
  if (fb) return fb;
  const [{ initializeApp }, auth, fs] = await Promise.all([
    import(`${V}/firebase-app.js`),
    import(`${V}/firebase-auth.js`),
    import(`${V}/firebase-firestore.js`),
  ]);
  const app = initializeApp(CFG);
  fb = {
    auth: auth.getAuth(app),
    db: fs.getFirestore(app),
    a: auth,
    f: fs,
  };
  return fb;
}

/** 啟動時呼叫：若先前已登入會自動恢復工作階段，並拉一次雲端資料。 */
export async function init() {
  let f;
  try { f = await ensure(); } catch { return; }   // 載入失敗就當作沒有雲端

  f.a.onAuthStateChanged(f.auth, async u => {
    user = u;
    emit();
    if (u) { await pull(); emit(); }
  });
}

export async function signIn() {
  const f = await ensure();
  const provider = new f.a.GoogleAuthProvider();
  try {
    await f.a.signInWithPopup(f.auth, provider);
  } catch (e) {
    // 手機瀏覽器常擋彈出視窗，退回導向式登入
    if (String(e.code).includes('popup')) return f.a.signInWithRedirect(f.auth, provider);
    throw e;
  }
}

export async function signOut() {
  const f = await ensure();
  await f.a.signOut(f.auth);
  user = null;
  emit();
}

function docRef(f) {
  return f.f.doc(f.db, 'progress', user.uid);
}

/** 雲端 → 本機。沿用 store 的 max() 合併，兩邊都不會被覆蓋掉。 */
export async function pull() {
  if (!user) return false;
  try {
    const f = await ensure();
    const snap = await f.f.getDoc(docRef(f));
    if (snap.exists()) {
      const w = snap.data().words;
      if (w && Object.keys(w).length) store.importFrom(w);
    }
    return true;
  } catch (e) {
    console.warn('pull 失敗', e);
    return false;
  }
}

/** 本機 → 雲端。 */
export async function push() {
  if (!user) return false;
  try {
    const f = await ensure();
    const d = store.load();
    await f.f.setDoc(docRef(f), {
      words: d.words,
      updatedAt: new Date().toISOString(),
      email: user.email || null,
    });
    return true;
  } catch (e) {
    console.warn('push 失敗', e);
    return false;
  }
}

/** 答題後呼叫。合併 3 秒內的多次作答，避免每題都打一次網路。 */
export function schedulePush() {
  if (!user) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { push(); }, 3000);
}

/** 離開頁面前把還沒送出的進度補送。 */
export function flush() {
  if (!user || !pushTimer) return;
  clearTimeout(pushTimer);
  pushTimer = null;
  push();
}
