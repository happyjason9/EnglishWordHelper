# -*- coding: utf-8 -*-
"""一次性遷移：Lesson 3 的 .docx → data/lessons/lesson-03-warranties.md
Lesson 3 是唯一沒有 HTML 的一課。Python stdlib 即可，免 pip、也避開
PowerShell 5.1 的 Expand-Archive 拒收 .docx 問題。"""
import re
import sys
import zipfile
sys.stdout.reconfigure(encoding='utf-8')
import xml.etree.ElementTree as ET
from pathlib import Path

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
NS = {'w': W}
ROOT = Path(__file__).resolve().parent.parent
DOCX = ROOT / 'archive' / '背英文單字' / 'Lesson 3 - Warranties 保固' / 'Lesson 3 Warranties 單字卡與常見句子.docx'
OUT = ROOT / 'data' / 'lessons' / 'lesson-03-warranties.md'
TAGS = ['用法', '衍生', '片語', '易混', '同義', '反義', '注意', '搭配', '延伸', '拼字']

with zipfile.ZipFile(DOCX) as z:
    root = ET.fromstring(z.read('word/document.xml'))

paras = []
for p in root.iter(f'{{{W}}}p'):
    style_el = p.find('.//w:pStyle', NS)
    style = style_el.get(f'{{{W}}}val') if style_el is not None else ''
    text = ''.join(t.text or '' for t in p.iter(f'{{{W}}}t')).strip()
    if text:
        paras.append((style, text))

intro, words, cur = '', [], None
for style, text in paras:
    if style == 'Heading1':
        continue
    if style == 'Heading2':
        m = re.match(r'^(\d+)\.\s+(.+?)\s+\(([^)]*)\)\s*(?:—|–|\s-\s)\s*(.+)$', text)
        if not m:
            sys.exit(f'標題格式不符: {text}')
        cur = {'n': int(m.group(1)), 'w': m.group(2).strip(), 'p': m.group(3).strip(),
               'zh': m.group(4).strip(), 'ex': [], 'note': [], '_pending': None}
        words.append(cur)
        continue
    if cur is None:
        intro = intro or text
        continue
    # 註記行：以已知 tag 開頭
    tag = next((t for t in TAGS if text.startswith(t)), None)
    if tag:
        cur['note'].append((tag, text[len(tag):].strip()))
        continue
    m = re.match(r'^([a-z])\.\s+(.*)$', text)
    if m:                                  # 英文例句
        cur['ex'].append({'en': m.group(2).strip(), 'zh': None})
    elif cur['ex'] and cur['ex'][-1]['zh'] is None:
        cur['ex'][-1]['zh'] = text         # 緊接其後的即為中譯
    else:
        sys.exit(f"{cur['w']}: 無法歸類的段落 {text!r}")

LET = 'abcdefghijklmnopqrstuvwxyz'
out = ['---', 'id: lesson-03-warranties', 'number: 3', 'topic: Warranties',
       'topic_zh: 保固', f'intro: {intro}', '---', '']
for w in words:
    for e in w['ex']:
        if not e['zh']:
            sys.exit(f"{w['w']}: 例句缺少中譯 {e['en']!r}")
    out.append(f"## {w['n']}. {w['w']} ({w['p']}) — {w['zh']}")
    out.append('')
    for i, e in enumerate(w['ex']):
        out.append(f"- {LET[i]}. {e['en']}")
        out.append(f"- {LET[i]}-zh. {e['zh']}")
    for tag, text in w['note']:
        out.append(f'- {tag}: {text}')
    out.append('')

OUT.write_text('\n'.join(out), encoding='utf-8')
print(f'✓ {OUT.name}  ({len(words)} 字, {sum(len(w["ex"]) for w in words)} 例句)')
