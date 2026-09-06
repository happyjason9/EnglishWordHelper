// GitHub Action 用：把匯出的進度 JSON 合併進 data/progress.md
// payload 透過 env 傳入（不可內插進 shell — script injection 破口，且 JSON 內的引號會炸掉）
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'data', 'progress.md');
const SITE = path.join(ROOT, 'site', 'data');

const raw = process.env.PAYLOAD;
if (!raw || !raw.trim()) { console.error('PAYLOAD 為空'); process.exit(1); }

let incoming;
try {
  incoming = JSON.parse(raw).words || {};
} catch (e) {
  console.error('PAYLOAD 不是合法 JSON：' + e.message);
  process.exit(1);
}

// 讀回既有的 progress.md，取 max() 合併 — 從手機同步不會抹掉筆電的紀錄
const existing = {};
if (fs.existsSync(OUT)) {
  let lesson = null;
  for (const line of fs.readFileSync(OUT, 'utf8').split('\n')) {
    const h = line.match(/^##\s+\[([a-z0-9-]+)\]/);
    if (h) { lesson = h[1]; continue; }
    const m = line.match(/^\|\s*`([^`]+)`\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*[\d.]+\s*\|\s*(\S*)\s*\|/);
    if (m && lesson) {
      existing[`${lesson}:${m[1]}`] = {
        wrong: +m[2], right: +m[3], streak: 0,
        lastSeen: m[4] && m[4] !== '—' ? m[4] : null,
      };
    }
  }
}

const merged = { ...existing };
for (const [k, v] of Object.entries(incoming)) {
  const c = merged[k];
  merged[k] = c
    ? { wrong: Math.max(c.wrong | 0, v.wrong | 0), right: Math.max(c.right | 0, v.right | 0),
        lastSeen: [c.lastSeen, v.lastSeen].filter(Boolean).sort().pop() || null }
    : { wrong: v.wrong | 0, right: v.right | 0, lastSeen: v.lastSeen || null };
}

const weightOf = s => Math.min(12, Math.max(0.2, 1 + 2 * s.wrong - 0.6 * s.right));
const day = s => (s ? String(s).slice(0, 10) : '—');

// 課程標題與單字順序沿用建置產物
const manifest = JSON.parse(fs.readFileSync(path.join(SITE, 'manifest.json'), 'utf8')).lessons;
const titleOf = new Map(manifest.map(l => [l.id, `Lesson ${l.number} — ${l.topic} ${l.topic_zh}`]));

const byLesson = new Map();
for (const [k, v] of Object.entries(merged)) {
  const i = k.indexOf(':');
  const id = k.slice(0, i), word = k.slice(i + 1);
  if (!byLesson.has(id)) byLesson.set(id, []);
  byLesson.get(id).push({ word, ...v, weight: weightOf(v) });
}

const totalWrong = Object.values(merged).reduce((a, v) => a + v.wrong, 0);
const L = [];
L.push('# 學習進度');
L.push('');
L.push(`最後更新: ${new Date().toISOString().slice(0, 10)} (共 ${Object.keys(merged).length} 字, 累計答錯 ${totalWrong} 次)`);
L.push('');
L.push('> 由 `Sync progress` workflow 自動產生。每課內依權重遞減排序 — 最上面的就是最需要複習的字。');
L.push('');

for (const l of manifest) {
  const rows = byLesson.get(l.id);
  if (!rows || !rows.length) continue;
  rows.sort((a, b) => b.weight - a.weight || a.word.localeCompare(b.word));
  L.push(`## [${l.id}] ${titleOf.get(l.id)}`);
  L.push('');
  L.push('| 單字 | 錯 | 對 | 權重 | 最後練習 |');
  L.push('|---|---:|---:|---:|---|');
  for (const r of rows) {
    L.push(`| \`${r.word}\` | ${r.wrong} | ${r.right} | ${r.weight.toFixed(1)} | ${day(r.lastSeen)} |`);
  }
  L.push('');
  byLesson.delete(l.id);
}

// 已不在任何課程中的鍵：保留但集中列出，讓資料漂移可見
for (const [id, rows] of byLesson) {
  L.push(`## [${id}] (已不在課程中)`);
  L.push('');
  L.push('| 單字 | 錯 | 對 | 權重 | 最後練習 |');
  L.push('|---|---:|---:|---:|---|');
  for (const r of rows.sort((a, b) => b.weight - a.weight)) {
    L.push(`| \`${r.word}\` | ${r.wrong} | ${r.right} | ${r.weight.toFixed(1)} | ${day(r.lastSeen)} |`);
  }
  L.push('');
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, L.join('\n'), 'utf8');
console.log(`已寫入 ${path.relative(ROOT, OUT)}：${Object.keys(merged).length} 字, 累計答錯 ${totalWrong} 次`);
