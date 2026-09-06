// .md 課程檔的序列化與解析 — migrate 腳本與 build.mjs 共用。

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

export function toMarkdown(lesson) {
  const L = [];
  L.push('---');
  L.push(`id: ${lesson.id}`);
  L.push(`number: ${lesson.number}`);
  L.push(`topic: ${lesson.topic}`);
  L.push(`topic_zh: ${lesson.topic_zh}`);
  L.push(`intro: ${lesson.intro}`);
  L.push('---');
  L.push('');
  for (const w of lesson.words) {
    L.push(`## ${w.n}. ${w.w} (${w.p}) — ${w.zh}`);
    L.push('');
    w.ex.forEach((e, i) => {
      const k = LETTERS[i];
      L.push(`- ${k}. ${e.en}`);
      L.push(`- ${k}-zh. ${e.zh}`);
      if (e.cloze) L.push(`- ${k}-cloze: ${e.cloze}`);
    });
    for (const [tag, text] of w.note) L.push(`- ${tag}: ${text}`);
    L.push('');
  }
  return L.join('\n');
}

export function parseMarkdown(src, file) {
  const err = m => { throw new Error(`${file}: ${m}`); };
  const fmMatch = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!fmMatch) err('缺少 YAML front matter');
  const meta = {};
  for (const line of fmMatch[1].split(/\r?\n/)) {
    const m = line.match(/^([a-z_]+):\s*(.*)$/);
    if (m) meta[m[1]] = m[2].trim();
  }
  for (const k of ['id', 'number', 'topic', 'topic_zh']) {
    if (!meta[k]) err(`front matter 缺少 ${k}`);
  }

  const body = src.slice(fmMatch[0].length);
  const words = [];
  const blocks = body.split(/^## /m).slice(1);
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const head = lines[0].trim();
    // {n}. {word} ({pos}) — {zh}   破折號容錯：— – 或前後有空白的 -
    const hm = head.match(/^(\d+)\.\s+(.+?)\s+\(([^)]*)\)\s*(?:—|–|\s-\s)\s*(.+)$/);
    if (!hm) err(`標題格式不符: "## ${head}"`);
    const w = { n: +hm[1], w: hm[2].trim(), p: hm[3].trim(), zh: hm[4].trim(), ex: [], note: [] };
    const exBy = new Map();

    for (const raw of lines.slice(1)) {
      const line = raw.trim();
      if (!line.startsWith('- ')) continue;
      const rest = line.slice(2);
      let m;
      if ((m = rest.match(/^([a-z])\.\s+(.*)$/))) {
        const e = exBy.get(m[1]) || {}; e.en = m[2].trim(); exBy.set(m[1], e);
      } else if ((m = rest.match(/^([a-z])-zh\.\s+(.*)$/))) {
        const e = exBy.get(m[1]) || {}; e.zh = m[2].trim(); exBy.set(m[1], e);
      } else if ((m = rest.match(/^([a-z])-cloze:\s*(.*)$/))) {
        const e = exBy.get(m[1]) || {}; e.cloze = m[2].trim(); exBy.set(m[1], e);
      } else if ((m = rest.match(/^([^:：]{1,6})[:：]\s*(.*)$/))) {
        w.note.push([m[1].trim(), m[2].trim()]);
      } else {
        err(`${w.w}: 無法解析的行 "- ${rest}"`);
      }
    }

    for (const k of [...exBy.keys()].sort()) {
      const e = exBy.get(k);
      if (!e.en) err(`${w.w}: 例句 ${k} 缺少英文`);
      if (!e.zh) err(`${w.w}: 例句 ${k} 缺少中譯`);
      w.ex.push(e);
    }
    if (!w.ex.length) err(`${w.w}: 沒有任何例句`);
    words.push(w);
  }
  if (!words.length) err('沒有任何單字');

  return { id: meta.id, number: +meta.number, topic: meta.topic, topic_zh: meta.topic_zh, intro: meta.intro || '', words };
}
