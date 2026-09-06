// 四種模式共用一條題目/計分管線。
import { weightedShuffle } from './store.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function shuffle(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

function levenshtein(a, b) {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    m[i][j] = Math.min(m[i-1][j] + 1, m[i][j-1] + 1, m[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return m[a.length][b.length];
}

// 誘答從所選課程的聯集抽取。同課誘答語意太接近，且單選一課時池子不夠。
function pickDistractors(answer, pool, n = 3) {
  const others = pool.filter(w => w.key !== answer.key);
  const notTooClose = w =>
    !(w.zh.slice(0, 2) === answer.zh.slice(0, 2)) &&
    levenshtein(w.w.toLowerCase(), answer.w.toLowerCase()) > 2;

  const tiers = [
    others.filter(w => w.p === answer.p && notTooClose(w)),  // 同詞性且不過近
    others.filter(w => notTooClose(w)),                       // 放寬詞性
    others,                                                   // 全部放寬
  ];
  const out = [], seen = new Set();
  for (const tier of tiers) {
    for (const w of shuffle(tier)) {
      if (out.length >= n) break;
      if (seen.has(w.key)) continue;
      seen.add(w.key); out.push(w);
    }
    if (out.length >= n) break;
  }
  return out;
}

function mc(answer, pool, textOf) {
  const ds = pickDistractors(answer, pool);
  return shuffle([{ text: textOf(answer), correct: true },
                  ...ds.map(d => ({ text: textOf(d), correct: false }))]);
}

function cardHTML(w) {
  const exs = w.ex.map((e, i) => `<div class="ex"><span class="mk">${'abcdefgh'[i]}.</span><div>
      <div class="en">${esc(e.en)}</div><div class="tr">${esc(e.zh)}</div></div></div>`).join('');
  const notes = w.note.map(n => `<div><b>${esc(n[0])}</b>　${esc(n[1])}</div>`).join('');
  return `<div class="zh">${esc(w.zh)}</div><div class="hr"></div>${exs}` +
         (notes ? `<div class="hr"></div><div class="note">${notes}</div>` : '');
}

// 挖空：字尾能乾淨切分就留在空格外，避免文法上不可判別的題目。
function blankOut(e) {
  // 用建置時算好的 at，不可 indexOf 重找 — 見 tools/cloze.mjs 的說明
  const at = e.at;
  if (at == null || at < 0) return esc(e.en);
  const before = e.en.slice(0, at), after = e.en.slice(at + e.cloze.length);
  return esc(before) + '<span class="blank">____</span>' + esc(e.suffix || '') + esc(after);
}

export function buildSession(words, mode) {
  const pool = words;
  const ordered = weightedShuffle(words);
  return ordered.map(w => {
    const base = { key: w.key, word: w, mode, reveal: cardHTML(w) };
    if (mode === 'en2zh')
      return { ...base, prompt: `<div class="q-word">${esc(w.w)}</div><div class="q-pos">${esc(w.p)}</div>`,
               choices: mc(w, pool, x => x.zh) };
    if (mode === 'zh2en')
      return { ...base, prompt: `<div class="q-zh">${esc(w.zh)}</div>`,
               choices: mc(w, pool, x => x.w) };
    if (mode === 'cloze') {
      const usable = w.ex.filter(e => e.cloze);
      const e = usable[Math.random() * usable.length | 0] || w.ex[0];
      return { ...base, prompt: `<div class="q-sent">${blankOut(e)}</div><div class="q-hint">${esc(e.zh)}</div>`,
               choices: mc(w, pool, x => x.w) };
    }
    // flip：無選項，自評
    return { ...base, prompt: `<div class="q-word">${esc(w.w)}</div><div class="q-pos">${esc(w.p)}</div>`,
             choices: null };
  });
}

export function grade(q, response) {
  if (q.choices) return { key: q.key, correct: !!(q.choices[response] || {}).correct };
  return { key: q.key, correct: response === true };
}

export const MODES = [
  { id: 'en2zh', label: '英 → 中', desc: '看英文選中文意思' },
  { id: 'zh2en', label: '中 → 英', desc: '看中文選英文單字' },
  { id: 'cloze', label: '例句填空', desc: '從例句挖空選出正確單字' },
  { id: 'flip',  label: '翻卡自評', desc: '翻開卡片，自己判斷記不記得' },
];
