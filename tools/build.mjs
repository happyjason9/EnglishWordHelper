// data/lessons/*.md → site/data/*.json + manifest.json
// 同時是驗證關卡：填空無法解析即以非零碼結束，讓壞掉的題目不會默默上線。
import fs from 'node:fs';
import path from 'node:path';
import { parseMarkdown } from './mdfmt.mjs';
import { resolveCloze } from './cloze.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'data', 'lessons');
const OUT = path.join(ROOT, 'site', 'data');

fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.json')) fs.unlinkSync(path.join(OUT, f));

const files = fs.readdirSync(SRC).filter(f => f.endsWith('.md')).sort();
const manifest = [];
const failures = [];
const leaks = [];
let totalWords = 0, totalEx = 0, clozeable = 0;

for (const file of files) {
  const lesson = parseMarkdown(fs.readFileSync(path.join(SRC, file), 'utf8'), file);

  for (const w of lesson.words) {
    w.key = `${lesson.id}:${w.w}`;
    for (let i = 0; i < w.ex.length; i++) {
      const e = w.ex[i];
      const r = resolveCloze(w.w, e.en, e.cloze);
      const letter = 'abcdefghijklmnopqrstuvwxyz'[i];
      if (r) {
        // 挖空後答案不得在句中他處露出 — 例句裡同一個字出現兩次時會發生。
        // 例：「...are affordable for a Fortune 500 company will not be affordable for...」
        const blanked = e.en.slice(0, r.at) + '____' + (r.suffix || '') + e.en.slice(r.at + r.cloze.length);
        const bare = w.w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`(^|[^A-Za-z])${bare}($|[^A-Za-z])`, 'i').test(blanked)) {
          delete e.cloze; e.at = -1; e.stem = null; e.suffix = '';
          leaks.push({ lesson: lesson.id, word: w.w, letter, en: e.en });
          totalEx++;
          continue;
        }
        e.cloze = r.cloze; e.at = r.at; e.stem = r.stem; e.suffix = r.suffix;
        clozeable++;
      } else {
        delete e.cloze; e.at = -1; e.stem = null; e.suffix = '';
        failures.push({ lesson: lesson.id, word: w.w, letter, en: e.en });
      }
      totalEx++;
    }
    totalWords++;
  }

  fs.writeFileSync(path.join(OUT, lesson.id + '.json'), JSON.stringify(lesson), 'utf8');
  manifest.push({
    id: lesson.id, number: lesson.number,
    topic: lesson.topic, topic_zh: lesson.topic_zh,
    count: lesson.words.length,
  });
}

manifest.sort((a, b) => a.number - b.number);
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ lessons: manifest }), 'utf8');

// progress.md 在 site/ 之外不會被 Pages 服務，複製進來供全新裝置回填
const prog = path.join(ROOT, 'data', 'progress.md');
if (fs.existsSync(prog)) {
  fs.copyFileSync(prog, path.join(OUT, 'progress.md'));
  console.log('已複製 progress.md 供回填');
}

console.log(`建置完成：${manifest.length} 課, ${totalWords} 字, ${totalEx} 例句`);
console.log(`填空可用：${clozeable}/${totalEx}`);

// 同一個字在例句中出現兩次：挖掉一個、另一個仍露出答案。
// 這是課本原文使然，無法靠改 .md 修正，因此排除該例句而非中斷建置。
if (leaks.length) {
  console.log(`\n⚠ ${leaks.length} 個例句因單字重複出現而不用於填空（其他模式仍正常）：`);
  for (const f of leaks) {
    console.log(`  [${f.lesson}] ${f.word} 例句 ${f.letter}`);
  }
}

// 每個字至少要有一個可出填空題的例句
const noCloze = [];
for (const l of manifest) {
  const data = JSON.parse(fs.readFileSync(path.join(OUT, l.id + '.json'), 'utf8'));
  for (const w of data.words) {
    if (!w.ex.some(e => e.cloze)) noCloze.push(`${l.id}: ${w.w}`);
  }
}
if (noCloze.length) {
  console.error(`\n✗ 下列單字沒有任何可用於填空的例句：`);
  noCloze.forEach(s => console.error('  ' + s));
  process.exit(1);
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} 個例句無法解析填空，請在 .md 對應例句下加一行 \`{字母}-cloze: <句中的字面形式>\`：`);
  for (const f of failures) {
    console.error(`  [${f.lesson}] ${f.word} 例句 ${f.letter}: ${f.en}`);
  }
  process.exit(1);
}
console.log('✓ 填空檢查通過（無答案外洩，每個字都有可用例句）');
