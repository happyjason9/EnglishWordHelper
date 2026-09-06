// 填空挖字解析 — build.mjs 使用。
// 三層：明確覆寫 → 原形比對 → 字尾變化比對。失敗回傳 null，由呼叫端大聲報錯。

const ESC = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 由字根產生可能的變化形，長的排前面（優先比對最長者）。
export function variants(word) {
  const c = new Set();
  const w = word.toLowerCase();
  if (w.endsWith('e')) {
    const b = w.slice(0, -1);
    c.add(b + 'ed'); c.add(b + 'ing'); c.add(w + 's'); c.add(w + 'd');
  } else if (w.endsWith('y') && !/[aeiou]y$/.test(w)) {
    const b = w.slice(0, -1);
    c.add(b + 'ies'); c.add(b + 'ied'); c.add(w + 's'); c.add(w + 'ing');
  } else {
    c.add(w + 's'); c.add(w + 'es'); c.add(w + 'ed'); c.add(w + 'ing');
    if (/[^aeiou][aeiou][^aeiouwxy]$/.test(w)) {
      const l = w.slice(-1);
      c.add(w + l + 'ed'); c.add(w + l + 'ing');
    }
  }
  return [...c].sort((a, b) => b.length - a.length);
}

// 在句中尋找 needle（詞界、不分大小寫），回傳原句中的實際大小寫形式。
function findLiteral(sentence, needle) {
  const re = new RegExp('(?:^|(?<=[^A-Za-z]))' + ESC(needle) + '(?:$|(?=[^A-Za-z]))', 'i');
  const m = sentence.match(re);
  return m ? { text: m[0], index: m.index } : null;
}

/**
 * @returns {{cloze:string, at:number, stem:string, suffix:string}|null}
 *   cloze  — 句中要處理的完整字面子字串
 *   at     — 該子字串在句中的起始位置（詞界正確；不可用 indexOf 重找，
 *            例如 "Younger consumers consume…" 的 indexOf("consume") 會命中 consumers）
 *   stem   — 空格要蓋住的部分
 *   suffix — 留在空格外的字尾（如 "ing"），無則為空字串
 */
export function resolveCloze(headword, sentence, override) {
  // 1. 明確覆寫，永遠勝出
  if (override) {
    const hit = findLiteral(sentence, override);
    if (hit) return { cloze: hit.text, at: hit.index, stem: hit.text, suffix: '' };
    const at = sentence.indexOf(override);
    return at < 0 ? null : { cloze: override, at, stem: override, suffix: '' };
  }

  // 2. 原形比對 — 必須先於字尾變化比對。
  //    "Younger consumers consume most of…" 中 consumers 與 consume 並存，
  //    若先試最長變化形會挖掉 consumers 而讓真正的答案 consume 留在句中。
  const literal = findLiteral(sentence, headword);
  if (literal) return { cloze: literal.text, at: literal.index, stem: literal.text, suffix: '' };

  // 3. 字尾變化比對（僅對單字詞條；多字片語的變化在片語內部，交給覆寫處理）
  if (!/\s/.test(headword)) {
    for (const v of variants(headword)) {
      const hit = findLiteral(sentence, v);
      if (!hit) continue;
      // 字尾若能乾淨切分就留在空格外，避免 "After ____ several brands" 這種文法上不可判別的題目
      if (hit.text.toLowerCase().startsWith(headword.toLowerCase())) {
        return {
          cloze: hit.text, at: hit.index,
          stem: hit.text.slice(0, headword.length),
          suffix: hit.text.slice(headword.length),
        };
      }
      // 字根被改動過（drop-e / y→ies / 重複子音），整個挖掉
      return { cloze: hit.text, at: hit.index, stem: hit.text, suffix: '' };
    }
  }

  return null;
}
