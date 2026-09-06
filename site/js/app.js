import * as store from './store.js';
import { buildSession, grade, MODES } from './quiz.js';
import { renderHandout } from './handout.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = id => document.getElementById(id);

const state = {
  screen: 'lessons',
  selected: new Set(),
  mode: null,
  session: null,   // {qs, pos, answers:[{key,correct}]}
  lessons: [],     // manifest
  loaded: new Map(),
  showTr: false,
};

const el = {
  title: $('title'), count: $('count'), ticks: $('ticks'),
  stage: $('stage'), bar: $('bar'), util: $('util'),
};

/* ---------- 資料載入 ---------- */

async function loadLesson(id) {
  if (state.loaded.has(id)) return state.loaded.get(id);
  const r = await fetch(`./data/${id}.json`);
  if (!r.ok) throw new Error(`載入 ${id} 失敗`);
  const j = await r.json();
  state.loaded.set(id, j);
  return j;
}

async function selectedWords() {
  const ids = [...state.selected].sort();
  const ls = await Promise.all(ids.map(loadLesson));
  return ls.flatMap(l => l.words.map(w => ({ ...w, lessonId: l.id, lessonNo: l.number })));
}

// 全新裝置：localStorage 為空時才自 progress.md 回填。
async function seedProgress() {
  if (!store.isEmpty()) return;
  try {
    const r = await fetch('./data/progress.md');
    if (!r.ok) return;
    const words = {};
    let lesson = null;
    for (const line of (await r.text()).split('\n')) {
      // 課程標題形如 "## [lesson-01-contracts] Lesson 1 — …"，鍵需還原成 lessonId:word
      const h = line.match(/^##\s+\[([a-z0-9-]+)\]/);
      if (h) { lesson = h[1]; continue; }
      const m = line.match(/^\|\s*`([^`]+)`\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*[\d.]+\s*\|\s*(\S*)\s*\|/);
      if (m && lesson) {
        words[`${lesson}:${m[1]}`] = {
          wrong: +m[2], right: +m[3], streak: 0,
          lastSeen: m[4] && m[4] !== '—' ? m[4] : null,
        };
      }
    }
    if (Object.keys(words).length) store.importFrom(words);
  } catch {}
}

/* ---------- 路由 ---------- */

// 只改 hash，畫面一律由 hashchange 統一驅動 —
// 若在這裡先設 state.screen，hashchange 的相等判斷會直接 return 而不 render。
function go(screen) {
  if (location.hash === '#/' + screen) { state.screen = screen; render(); return; }
  location.hash = '#/' + screen;
}

window.addEventListener('hashchange', () => {
  const s = (location.hash.replace('#/', '') || 'lessons');
  // 從測驗返回時丟棄 session，避免半途的題目狀態殘留
  if (s === 'lessons' || s === 'modes') state.session = null;
  state.screen = s;
  render();
});

/* ---------- 畫面 ---------- */

function setChrome({ title, count = '', ticks = false, bar = '', util = '' }) {
  el.title.textContent = title;
  el.count.textContent = count;
  el.ticks.classList.toggle('hide', !ticks);
  el.bar.innerHTML = bar;
  el.util.innerHTML = util;
  el.bar.classList.toggle('hide', !bar);
  el.util.classList.toggle('hide', !util);
}

function screenLessons() {
  const p = store.load().words;
  const missOf = id => Object.entries(p)
    .filter(([k, v]) => k.startsWith(id + ':') && v.wrong > 0)
    .reduce((a, [, v]) => a + v.wrong, 0);

  const rows = state.lessons.map(l => {
    const on = state.selected.has(l.id);
    const miss = missOf(l.id);
    return `<button class="opt${on ? ' on' : ''}" data-lesson="${l.id}">
      <span class="box">${on ? '✓' : ''}</span>
      <span><span class="t">Lesson ${l.number} — ${esc(l.topic)} ${esc(l.topic_zh)}</span>
      <span class="d">${l.count} 字</span></span>
      ${miss ? `<span class="miss">錯 ${miss}</span>` : '<span class="n"></span>'}
    </button>`;
  }).join('');

  const all = state.selected.size === state.lessons.length;
  el.stage.innerHTML = `<div class="panel">
    <h2>選擇課程</h2>
    <p class="sub">可複選多課混合測驗。右側數字是累計答錯次數，測驗時錯多的字會優先出現。</p>
    ${rows}
    <button class="opt" id="allBtn" style="margin-top:14px">
      <span class="box">${all ? '✓' : ''}</span><span class="t">${all ? '全部取消' : '全選'}</span>
    </button>
  </div>`;

  const n = state.selected.size;
  setChrome({
    title: '英文單字練習',
    count: n ? `已選 ${n} 課` : '',
    bar: `<button id="toModes" class="primary" ${n ? '' : 'disabled'}>下一步 →</button>`,
    util: `<button id="resetBtn">清除進度</button><button id="exportBtn">匯出進度</button>`,
  });

  el.stage.querySelectorAll('[data-lesson]').forEach(b => b.onclick = () => {
    const id = b.dataset.lesson;
    state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id);
    render();
  });
  $('allBtn').onclick = () => {
    if (state.selected.size === state.lessons.length) state.selected.clear();
    else state.lessons.forEach(l => state.selected.add(l.id));
    render();
  };
  $('toModes').onclick = () => go('modes');
  $('exportBtn').onclick = doExport;
  $('resetBtn').onclick = () => {
    if (confirm('確定清除所有答題紀錄？此動作無法復原。')) { store.reset(); render(); }
  };
}

function screenModes() {
  if (!state.selected.size) return go('lessons');
  const rows = MODES.map(m => `<button class="opt" data-mode="${m.id}">
      <span><span class="t">${m.label}</span><span class="d">${m.desc}</span></span>
    </button>`).join('');
  el.stage.innerHTML = `<div class="panel">
    <h2>選擇模式</h2>
    <p class="sub">已選 ${state.selected.size} 課。四種測驗都會累計錯誤次數。</p>
    ${rows}
    <button class="opt" data-mode="handout" style="margin-top:14px">
      <span><span class="t">講義模式</span><span class="d">完整單字表，可直接列印或存成 PDF</span></span>
    </button>
  </div>`;
  setChrome({ title: '英文單字練習', bar: `<button id="back">← 返回選課</button>` });
  el.stage.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
    state.mode = b.dataset.mode;
    b.dataset.mode === 'handout' ? go('handout') : startSession();
  });
  $('back').onclick = () => go('lessons');
}

async function startSession() {
  const words = await selectedWords();
  state.session = { qs: buildSession(words, state.mode), pos: 0, answers: [] };
  go('study');
}

function drawTicks() {
  const s = state.session;
  el.ticks.innerHTML = s.qs.map((_, i) => {
    const a = s.answers[i];
    const cls = a ? (a.correct ? 'hit' : 'done') : (i === s.pos ? 'now' : '');
    return `<i class="${cls}"></i>`;
  }).join('');
}

function screenStudy() {
  const s = state.session;
  if (!s) return go('lessons');
  if (s.pos >= s.qs.length) return go('results');

  const q = s.qs[s.pos];
  const modeLabel = (MODES.find(m => m.id === state.mode) || {}).label || '';
  setChrome({
    title: modeLabel,
    count: `${s.pos + 1} / ${s.qs.length}`,
    ticks: true,
    bar: state.mode === 'flip'
      ? `<button id="forgot">不記得</button><button id="remember" class="primary">記得</button>`
      : '',
    util: `<button id="quit">結束本輪</button>`,
  });

  const choices = q.choices
    ? `<div class="choices">${q.choices.map((c, i) =>
        `<button class="choice" data-i="${i}">${esc(c.text)}</button>`).join('')}</div>`
    : `<div class="tapcue">輕觸卡片看解答</div>`;

  el.stage.innerHTML = `<div class="card${q.choices ? '' : ' tappable'}" id="card">
    <div class="num">${String(q.word.n).padStart(2, '0')}</div>
    ${q.prompt}${choices}<div class="stamp">熟</div></div>`;

  drawTicks();
  $('quit').onclick = () => go('results');

  if (q.choices) {
    el.stage.querySelectorAll('.choice').forEach(b => b.onclick = () => answer(+b.dataset.i));
  } else {
    let flipped = false;
    const flip = () => {
      if (flipped) return;
      flipped = true;
      $('card').querySelector('.tapcue')?.remove();
      $('card').insertAdjacentHTML('beforeend', `<div class="answer reveal">${q.reveal}</div>`);
    };
    $('card').onclick = flip;
    $('remember').onclick = () => { flip(); answer(true); };
    $('forgot').onclick = () => { flip(); answer(false); };
  }
}

function answer(response) {
  const s = state.session, q = s.qs[s.pos];
  if (s.answers[s.pos]) return;           // 已作答，忽略重複點擊
  const r = grade(q, response);
  s.answers[s.pos] = r;
  store.record(r.key, r.correct);
  drawTicks();

  if (q.choices) {
    el.stage.querySelectorAll('.choice').forEach((b, i) => {
      b.disabled = true;
      if (q.choices[i].correct) b.classList.add('right');
      else if (i === response) b.classList.add('wrong');
    });
    // 答錯時顯示完整卡片，把訂正留在眼前
    if (!r.correct) {
      $('card').insertAdjacentHTML('beforeend', `<div class="answer reveal"><div class="hr"></div>${q.reveal}</div>`);
    }
  } else if (r.correct) {
    $('card').classList.add('known');
  }

  const delay = r.correct ? 620 : (q.choices ? 2400 : 900);
  setTimeout(next, delay);
}

function next() {
  const s = state.session;
  if (!s) return;
  s.pos++;
  s.pos >= s.qs.length ? go('results') : render();
}

function screenResults() {
  const s = state.session;
  if (!s) return go('lessons');
  const done = s.answers.filter(Boolean);
  const right = done.filter(a => a.correct).length;
  const missed = s.qs.filter((q, i) => s.answers[i] && !s.answers[i].correct);

  el.stage.innerHTML = `<div class="panel" id="done">
    <h2>這一輪完成</h2>
    <div class="score">${right}<small> / ${done.length}</small></div>
    ${missed.length
      ? `<div class="misslist">要再看的字：<br>${missed.map(q =>
          `<span>${esc(q.word.w)}</span> ${esc(q.word.zh)}`).join('<br>')}</div>`
      : `<div class="misslist">全部答對。</div>`}
  </div>`;

  setChrome({
    title: '結算',
    count: `${right} / ${done.length}`,
    bar: `${missed.length ? '<button id="again" class="primary">重練錯的</button>' : ''}
          <button id="restart">再來一輪</button><button id="home">選課</button>`,
    util: `<button id="exportBtn">匯出進度</button>`,
  });

  if (missed.length) $('again').onclick = () => {
    state.session = { qs: buildSession(missed.map(q => q.word), state.mode), pos: 0, answers: [] };
    render();
  };
  $('restart').onclick = startSession;
  $('home').onclick = () => go('lessons');
  $('exportBtn').onclick = doExport;
}

async function screenHandout() {
  if (!state.selected.size) return go('lessons');
  const ids = [...state.selected].sort();
  const ls = await Promise.all(ids.map(loadLesson));
  el.stage.innerHTML = `<div class="panel">${ls.map(l => renderHandout(l, state.showTr)).join('')}</div>`;
  setChrome({
    title: '講義模式',
    count: `${ls.reduce((a, l) => a + l.words.length, 0)} 字`,
    bar: `<button id="back">← 返回</button><button id="print" class="primary">列印 / 存 PDF</button>`,
    util: `<button id="trBtn">${state.showTr ? '隱藏中譯' : '顯示中譯'}</button>`,
  });
  $('back').onclick = () => go('modes');
  $('print').onclick = () => window.print();
  $('trBtn').onclick = () => { state.showTr = !state.showTr; render(); };
}

/* ---------- 匯出 ---------- */

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

async function doExport() {
  const json = store.exportJSON();
  try {
    await navigator.clipboard.writeText(json);
    toast('已複製到剪貼簿');
    return;
  } catch {}
  // clipboard API 需要安全上下文，非 https 時退回可全選的 textarea
  const ta = document.createElement('textarea');
  ta.value = json;
  el.stage.querySelector('.panel')?.appendChild(ta);
  ta.select();
  toast('請手動複製下方內容');
}

/* ---------- 啟動 ---------- */

function render() {
  ({
    lessons: screenLessons,
    modes: screenModes,
    study: screenStudy,
    results: screenResults,
    handout: screenHandout,
  }[state.screen] || screenLessons)();
}

document.addEventListener('keydown', e => {
  if (state.screen !== 'study' || !state.session) return;
  const q = state.session.qs[state.session.pos];
  if (!q) return;
  if (q.choices && /^[1-4]$/.test(e.key)) {
    const b = el.stage.querySelector(`.choice[data-i="${+e.key - 1}"]`);
    if (b && !b.disabled) b.click();
  }
  if (!q.choices && e.key === ' ') { e.preventDefault(); $('card')?.click(); }
});

(async function init() {
  await seedProgress();
  const r = await fetch('./data/manifest.json');
  state.lessons = (await r.json()).lessons;
  state.screen = (location.hash.replace('#/', '') || 'lessons');
  if (!['lessons', 'modes', 'handout'].includes(state.screen)) state.screen = 'lessons';
  render();
})();
