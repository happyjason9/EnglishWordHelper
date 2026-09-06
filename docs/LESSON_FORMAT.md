# 課程 `.md` 格式規範

拍照轉寫時遵循這份規範，寫進 `data/lessons/lesson-NN-<topic-slug>.md`。

## 完整範例

```markdown
---
id: lesson-03-warranties
number: 3
topic: Warranties
topic_zh: 保固
intro: 12 個保固情境高頻字。每個字附兩個例句、中譯,以及用法與衍生字提醒。
---

## 3. consider (v.) — 考慮

- a. Consider the warranty terms carefully before signing the contract.
- a-zh. 簽約前請仔細考慮保固條款。
- b. After considering several brands, she chose the one with the longest warranty.
- b-zh. 比較過幾個品牌後,她選了保固最長的那個。
- 用法: consider + V-ing(不接 to V)
- 衍生: consideration 考慮;considerable 相當大的
```

## front matter

| 欄位 | 說明 |
|---|---|
| `id` | 檔名（不含 `.md`）。格式 `lesson-NN-<英文主題小寫連字號>`，**必須與檔名一致** |
| `number` | 課次數字 |
| `topic` | 英文主題，如 `Warranties` |
| `topic_zh` | 中文主題，如 `保固` |
| `intro` | 一句話簡介，選填 |

`id` 只能用小寫英數與連字號 — 它會成為 JSON 檔名與網址的一部分，也是錯誤紀錄鍵的前綴。

## 單字區塊

標題格式：

```
## {編號}. {單字} ({詞性}) — {中文解釋}
```

- 破折號可用 `—`、`–`，或前後有空白的 `-`，三者皆可。
- 詞性照課本寫，如 `v.`、`n.`、`adj.`、`adv.`、`adj./n.`、`v. 片語`。
- 多字片語直接寫，如 `## 12. take part in (v. 片語) — 參加、參與`。

### 例句

以字母配對，**數量不限**（`a.`、`b.`、`c.` …）：

```
- a. 英文例句
- a-zh. 中文翻譯
```

每個英文例句都**必須**有對應的 `-zh.` 行，否則建置會失敗。

### 註記

```
- {標籤}: {內容}
```

常用標籤：`用法`、`衍生`、`片語`、`易混`、`同義`、`反義`、`注意`、`搭配`、`延伸`、`拼字`。
其他標籤也接受（限 6 字內）。可以 0 則、1 則或多則。

## `a-cloze:` — 填空逃生出口

「例句填空」模式需要在例句中找出該單字並挖空。建置時會自動處理兩種情況：

1. 例句中出現單字原形 → 直接挖空
2. 例句中是字尾變化 → 自動比對（`considering`、`established`、`companies` 等），
   且字尾會留在空格外，呈現為 `After ____ing several brands`

**只有自動比對失敗時**（不規則變化，如 `take part in` → `took part in`），
才需要手動加一行指出句中的實際字面形式：

```
- a. Over 100 companies took part in this year's trade conference.
- a-zh. 今年有超過一百家公司參與這場貿易會議。
- a-cloze: took part in
```

不必預先猜測 — 直接跑 `node tools/build.mjs`，若有需要它會明確告訴你是哪一課、哪個字、哪個例句：

```
✗ 1 個例句無法解析填空，請在 .md 對應例句下加一行 `{字母}-cloze: <句中的字面形式>`：
  [lesson-05-conferences] take part in 例句 a: Over 100 companies took part in…
```

## 新增一課的流程

1. 拍照，請 Claude 依本規範轉寫成 `data/lessons/lesson-NN-<slug>.md`
2. 對著照片核對一遍（這個格式就是為了方便逐行核對而設計的）
3. `node tools/build.mjs` — 確認字數正確、填空無錯誤
4. `git add -A && git commit -m "feat: add lesson N" && git push`

推上去後 Pages Action 會自動重新建置部署。

## 建置會擋下的錯誤

- front matter 缺欄位
- 標題格式不符
- 例句缺中譯
- 有單字但沒有任何例句
- 無法解析的行（打錯前綴時）
- 填空無法解析且未給 `a-cloze:`

任一項發生，建置以非零碼結束，Pages 不會部署到壞掉的版本。
