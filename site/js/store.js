// 錯誤追蹤與加權排序。
// 鍵為 "{lessonId}:{word}" — 刻意不用編號 n，重新編號不該打亂歷史。

const KEY = 'ewh.progress.v1';

function blank() {
  return { version: 1, updatedAt: new Date().toISOString(), words: {} };
}

let cache = null;

export function load() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? JSON.parse(raw) : blank();
    if (!cache.words) cache.words = {};
  } catch {
    cache = blank();
  }
  return cache;
}

export function save() {
  const d = load();
  d.updatedAt = new Date().toISOString();
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {}
}

export function isEmpty() {
  return Object.keys(load().words).length === 0;
}

export function statOf(key) {
  return load().words[key] || { wrong: 0, right: 0, streak: 0, lastSeen: null, weight: 1 };
}

// weight = 1 + 2*wrong - 0.6*right，夾在 [0.2, 12]
// 只控制排序，絕不控制是否納入 — 所有字都會出現。
export function weightOf(s) {
  return Math.min(12, Math.max(0.2, 1 + 2 * (s.wrong || 0) - 0.6 * (s.right || 0)));
}

export function record(key, correct) {
  const d = load();
  const s = d.words[key] || { wrong: 0, right: 0, streak: 0, lastSeen: null };
  if (correct) { s.right++; s.streak++; } else { s.wrong++; s.streak = 0; }
  s.lastSeen = new Date().toISOString();
  s.weight = +weightOf(s).toFixed(2);
  d.words[key] = s;
  save();
}

// 加權洗牌 (Efraimidis-Spirakis)：依 -ln(U)/w 排序。
// 硬排序會讓每次順序完全相同；加權洗牌讓問題字在期望值上靠前，同時保持變化。
export function weightedShuffle(words) {
  return words
    .map(w => ({ w, k: -Math.log(Math.random() || 1e-12) / weightOf(statOf(w.key)) }))
    .sort((a, b) => a.k - b.k)
    .map(x => x.w);
}

export function exportJSON() {
  return JSON.stringify(load(), null, 2);
}

export function importFrom(words) {
  const d = load();
  for (const [k, v] of Object.entries(words)) {
    const cur = d.words[k];
    // max() 合併：從手機同步不會抹掉筆電的紀錄
    d.words[k] = cur
      ? { ...cur, wrong: Math.max(cur.wrong, v.wrong), right: Math.max(cur.right, v.right),
          lastSeen: [cur.lastSeen, v.lastSeen].filter(Boolean).sort().pop() || null }
      : v;
    d.words[k].weight = +weightOf(d.words[k]).toFixed(2);
  }
  save();
}

export function reset() {
  cache = blank();
  save();
}
