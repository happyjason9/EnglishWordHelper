// 一次性遷移：4 份既有 HTML 的 DATA 陣列 → data/lessons/*.md
// 初次 commit 後不再執行，保留作為 archive → 新格式的對應紀錄。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { toMarkdown } from './mdfmt.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const ARCHIVE = path.join(ROOT, 'archive', '背英文單字');
const OUT = path.join(ROOT, 'data', 'lessons');

const SLUG = {
  1: ['lesson-01-contracts', 'Contracts', '合約'],
  2: ['lesson-02-marketing', 'Marketing', '行銷'],
  3: ['lesson-03-warranties', 'Warranties', '保固'],
  4: ['lesson-04-business-planning', 'Business Planning', '商務規劃'],
  5: ['lesson-05-conferences', 'Conferences', '會議'],
};

for (const dir of fs.readdirSync(ARCHIVE)) {
  const full = path.join(ARCHIVE, dir);
  if (!fs.statSync(full).isDirectory()) continue;
  const htmlName = fs.readdirSync(full).find(f => f.endsWith('.html'));
  if (!htmlName) { console.log(`跳過（無 HTML）：${dir}`); continue; }

  const num = +dir.match(/Lesson (\d+)/)[1];
  const [id, topic, topic_zh] = SLUG[num];
  const src = fs.readFileSync(path.join(full, htmlName), 'utf8');

  // DATA 已是合法 JS，用 vm 求值而非正則解析 — 完全精確，無跳脫字元問題。
  const i = src.indexOf('const DATA=[');
  const j = src.indexOf('\n];', i);
  if (i < 0 || j < 0) throw new Error(`${htmlName}: 找不到 DATA 陣列`);
  const DATA = vm.runInNewContext('(' + src.slice(i + 11, j + 2) + ')');

  const lesson = {
    id, number: num, topic, topic_zh,
    intro: `12 個${topic_zh}情境高頻字。每個字附兩個例句、中譯,以及用法與衍生字提醒。`,
    words: DATA.map(d => ({
      n: d.n, w: d.w, p: d.p, zh: d.zh,
      ex: d.ex.map(([en, zh]) => ({ en, zh })),
      note: d.note,
    })),
  };

  fs.writeFileSync(path.join(OUT, id + '.md'), toMarkdown(lesson), 'utf8');
  console.log(`✓ ${id}.md  (${lesson.words.length} 字)`);
}
