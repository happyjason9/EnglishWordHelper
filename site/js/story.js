// 故事模式：用該課全部單字寫成的短文，單字可點開看意思。
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderStory(lesson, showTr) {
  const head = `<h2>Lesson ${lesson.number} — ${esc(lesson.topic)} ${esc(lesson.topic_zh)}</h2>`;
  const s = lesson.story;
  if (!s) return `<div class="handout story">${head}<p class="intro">這課還沒有故事。</p></div>`;

  const byN = new Map(lesson.words.map(w => [w.n, w]));
  // 句中是變化形（took part in、considered）時，一併標出原形
  const gloss = x => {
    const w = byN.get(x.n);
    return x.t.toLowerCase() === w.w.toLowerCase() ? w.zh : `${w.w}：${w.zh}`;
  };
  const paras = s.paras.map(p => `<div class="sp">
      <p class="en">${p.en.map(x => typeof x === 'string' ? esc(x)
        : `<button type="button" class="sw" data-gloss="${esc(gloss(x))}">${esc(x.t)}</button>`).join('')}</p>
      ${showTr ? `<p class="tr">${p.zh.map(x => typeof x === 'string' ? esc(x)
        : `<span class="zw">${esc(x.t)}</span>`).join('')}</p>` : ''}</div>`).join('');

  const list = lesson.words.map(w => `<div><span class="hw-n">${String(w.n).padStart(2, '0')}</span>
      <b>${esc(w.w)}</b> <i>${esc(w.p)}</i> ${esc(w.zh)}</div>`).join('');

  return `<div class="handout story">
    ${head}
    <div class="st">${esc(s.title)}<small>${esc(s.title_zh)}</small></div>
    ${paras}
    <div class="sl">${list}</div>
  </div>`;
}
