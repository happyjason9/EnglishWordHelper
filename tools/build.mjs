// data/lessons/*.md → site/data/*.json + manifest.json
// 同時是驗證關卡：填空無法解析即以非零碼結束，讓壞掉的題目不會默默上線。
import fs from 'node:fs';
import path from 'node:path';
import { parseMarkdown, parseStory } from './mdfmt.mjs';
import { resolveCloze, variants } from './cloze.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'data', 'lessons');
const OUT = path.join(ROOT, 'site', 'data');
const STORIES = path.join(ROOT, 'data', 'stories');

fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.json')) fs.unlinkSync(path.join(OUT, f));

const files = fs.readdirSync(SRC).filter(f => f.endsWith('.md')).sort();
const manifest = [];
const failures = [];
const leaks = [];
const storyErrors = [];
let totalWords = 0, totalEx = 0, clozeable = 0, stories = 0;

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
        // 變化形也算露出：「Our ____ satisfaction plan offers a discount to customers who...」
        // 空格後面還有 customers，等於把答案寫在題目裡。多字片語的變化形無法可靠推算，只比對原形。
        const blanked = e.en.slice(0, r.at) + '____' + (r.suffix || '') + e.en.slice(r.at + r.cloze.length);
        const forms = /\s/.test(w.w) ? [w.w] : [w.w, ...variants(w.w)];
        const stillShown = forms.some(form => {
          const bare = form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return new RegExp(`(^|[^A-Za-z])${bare}($|[^A-Za-z])`, 'i').test(blanked);
        });
        if (stillShown) {
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

  // 故事是選配的；有的話每個單字都必須至少標記一次，否則就失去「用全部單字」的意義
  const storyFile = path.join(STORIES, lesson.id + '.md');
  if (fs.existsSync(storyFile)) {
    const story = parseStory(fs.readFileSync(storyFile, 'utf8'), lesson.id + '.md');
    const nums = new Set(lesson.words.map(w => w.n));
    const used = new Set();
    for (const p of story.paras) {
      const marks = parts => parts.filter(x => typeof x !== 'string');
      for (const x of [...marks(p.en), ...marks(p.zh)]) {
        if (!nums.has(x.n)) storyErrors.push(`[${lesson.id}] {${x.t}|${x.n}} 編號不存在`);
      }
      // 中譯要標出同一段英文用到的每個字，中英才對得起來
      const zhNums = new Set(marks(p.zh).map(x => x.n));
      for (const x of marks(p.en)) {
        used.add(x.n);
        if (!zhNums.has(x.n)) storyErrors.push(`[${lesson.id}] {${x.t}|${x.n}} 的中譯段落沒有標記對應中文`);
      }
    }
    for (const w of lesson.words) {
      if (!used.has(w.n)) storyErrors.push(`[${lesson.id}] 故事沒有用到 ${w.n}. ${w.w}`);
    }
    lesson.story = story;
    stories++;
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
console.log(`故事：${stories}/${manifest.length} 課`);

// 檔名對不上任何課程的故事會被默默略過，必須擋下
if (fs.existsSync(STORIES)) {
  const ids = new Set(manifest.map(l => l.id));
  for (const f of fs.readdirSync(STORIES)) {
    if (f.endsWith('.md') && !ids.has(f.slice(0, -3))) storyErrors.push(`data/stories/${f} 沒有對應的課程`);
  }
}
if (storyErrors.length) {
  console.error(`\n✗ 故事檢查失敗：`);
  storyErrors.forEach(s => console.error('  ' + s));
  process.exit(1);
}

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
