# EnglishWordHelper

英文單字練習網站 — 講義閱讀 + 四種測驗模式，錯誤次數會累積並讓錯多的字優先出現。
電腦與手機皆可使用，部署在 GitHub Pages。

## 網站

部署後網址：`https://<你的帳號>.github.io/EnglishWordHelper/`

- **選課** — 可複選多課混合測驗，或全選
- **英 → 中** / **中 → 英** — 四選一
- **例句填空** — 從例句挖空選出正確單字，附中譯提示
- **翻卡自評** — 翻開卡片自評「記得 / 不記得」
- **講義模式** — 完整單字表，可直接列印或存成 PDF

答錯的字會累計次數，下次測驗時**權重排序**讓錯多的字排前面 —
但所有字仍然都會出現，不會漏練。

## 新增一課

1. 拍下課本頁面，交給 Claude，說「加成 Lesson 6」
2. Claude 依 [`docs/LESSON_FORMAT.md`](docs/LESSON_FORMAT.md) 寫成 `data/lessons/lesson-06-<slug>.md`
3. 對著照片核對一遍
4. 建置並推送：

```bash
node tools/build.mjs
git add -A && git commit -m "feat: add lesson 6" && git push
```

推上去後 Pages 會自動重新部署。

## 本機開發

```bash
node tools/build.mjs
npx --yes serve site -l 5173      # 或：python -m http.server 5173 --directory site
```

開 http://localhost:5173/

**必須用伺服器，不能直接雙擊 `index.html`** — ES modules 與 `fetch()` 在 `file://` 下會被 CORS 擋掉。

## 雲端同步（自動）

按一次 **登入同步**（Google 帳號），之後答題進度會自動同步到 Firebase，
手機和電腦看到的是同一筆紀錄。

- 進度仍然**同時**存在瀏覽器 localStorage — 沒網路、沒登入都能照常練習
- 上傳有 3 秒 debounce，不會每答一題就打一次網路
- 合併採 `max()`，兩台裝置分別練過不會互相覆蓋
- 安全性規則見 [`firestore.rules`](firestore.rules)：每個人只能讀寫自己的資料

不想登入也完全可以用，只是進度僅存在該瀏覽器。

## 同步錯誤紀錄到 repo（手動，選用）

答題紀錄即時存在瀏覽器的 localStorage。要把它存進 repo（換裝置、或想留一份可讀的紀錄）：

1. 網頁上按 **匯出進度**（會複製到剪貼簿）
2. 到 repo 的 **Actions → Sync progress → Run workflow**，貼進 `payload` 欄位後執行
3. Action 會把結果合併寫進 [`data/progress.md`](data/progress.md) 並 commit

`progress.md` 每課內依權重遞減排序，最上面就是最需要複習的字。
合併採 `max()`，所以從手機同步不會蓋掉筆電的紀錄。

全新的瀏覽器或裝置第一次開網站時，會自動從 `progress.md` 回填紀錄。

> **為什麼需要手動這一步？** GitHub Pages 是純靜態託管，網頁沒有伺服器也沒有憑證，
> 無法自行 push。而把 token 放進網頁等於公開它（Pages 網站是公開的）。
> 若日後覺得這個摩擦太大，可以改用一個小的 serverless endpoint（如 Cloudflare Worker）持有 token。

## 結構

```
data/lessons/*.md     課程資料（真實來源，手改這裡）
data/progress.md      錯誤紀錄（Action 寫入）
tools/build.mjs       .md → site/data/*.json，同時是驗證關卡
site/                 GitHub Pages 發布的目錄
archive/              原始的 docx / html / pdf，保留備查
```

`site/data/*.json` 是產生物但納入版控 — repo 可直接檢視，且建置失敗時線上仍有可用網站。

## 建置會擋下的錯誤

`tools/build.mjs` 在資料有問題時以非零碼結束，Pages 不會部署到壞掉的版本：

- front matter 缺欄位、標題格式不符、例句缺中譯
- **例句填空無法解析** — 會明確指出是哪一課哪個字，並要求加 `a-cloze:` 一行

最後一項是刻意設計的：填空必須在建置期確定，否則會變成手機上一題默默壞掉的測驗。
