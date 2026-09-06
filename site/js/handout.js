// 講義模式：把同一份資料排成可閱讀、可列印的版面。
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderHandout(lesson, showTr) {
  const words = lesson.words.map(w => {
    const exs = w.ex.map((e, i) => `<div class="ex"><span class="mk">${'abcdefgh'[i]}.</span><div>
        <div class="en">${esc(e.en)}</div>
        ${showTr ? `<div class="tr">${esc(e.zh)}</div>` : ''}</div></div>`).join('');
    const notes = w.note.map(n => `<div><b>${esc(n[0])}</b>　${esc(n[1])}</div>`).join('');
    return `<div class="hw">
      <div class="hw-head"><span class="hw-n">${String(w.n).padStart(2, '0')}</span>
        <span class="hw-w">${esc(w.w)}</span><span class="hw-p">${esc(w.p)}</span></div>
      <div class="hw-zh">${esc(w.zh)}</div>
      ${exs}${notes ? `<div class="note">${notes}</div>` : ''}
    </div>`;
  }).join('');

  return `<div class="handout">
    <h2>Lesson ${lesson.number} — ${esc(lesson.topic)} ${esc(lesson.topic_zh)}</h2>
    ${lesson.intro ? `<p class="intro">${esc(lesson.intro)}</p>` : ''}
    ${words}
  </div>`;
}
