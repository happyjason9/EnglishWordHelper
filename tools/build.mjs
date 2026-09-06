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

if (failures.length) {
  console.error(`\n✗ ${failures.length} 個例句無法解析填空，請在 .md 對應例句下加一行 \`{字母}-cloze: <句中的字面形式>\`：`);
  for (const f of failures) {
    console.error(`  [${f.lesson}] ${f.word} 例句 ${f.letter}: ${f.en}`);
  }
  process.exit(1);
}
console.log('✓ 全部例句填空解析成功');
