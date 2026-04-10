# -*- coding: utf-8 -*-
"""產生各書資料夾內的翻頁 HTML 與更新首頁。需要時可再執行：python build_books.py"""
import json
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))
PAGE_RE = re.compile(r"頁面_(\d+)_")


def page_sort_key(name: str) -> tuple:
    m = PAGE_RE.search(name)
    return (int(m.group(1)), name) if m else (0, name)


def list_jpg_paths(subdir: str) -> list[str]:
    pages_dir = os.path.join(ROOT, subdir, "pages")
    if not os.path.isdir(pages_dir):
        return []
    files = [f for f in os.listdir(pages_dir) if f.lower().endswith(".jpg")]
    files.sort(key=page_sort_key)
    return ["pages/" + f for f in files]


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<link rel="stylesheet" href="../flipbook.css">
</head>
<body>

<div id="book"></div>
<div id="page-indicator"></div>

<div class="controls">
  <button type="button" onclick="event.stopPropagation(); prevPage()">← 上一頁</button>
  <button type="button" onclick="event.stopPropagation(); nextPage()">下一頁 →</button>
</div>

<script id="flipbook-data" type="application/json">{images_json}</script>
<script src="../flipbook.js"></script>
</body>
</html>
"""


def main() -> None:
    entries = []
    for name in sorted(os.listdir(ROOT)):
        path = os.path.join(ROOT, name)
        if not os.path.isdir(path) or name.startswith("."):
            continue
        rels = list_jpg_paths(name)
        if not rels:
            continue
        html_name = name + ".html"
        out_path = os.path.join(path, html_name)
        title = name + " — 翻頁閱讀"
        body = HTML_TEMPLATE.format(
            title=title,
            images_json=json.dumps(rels, ensure_ascii=False),
        )
        with open(out_path, "w", encoding="utf-8", newline="\n") as f:
            f.write(body)
        entries.append((name, html_name))

        # 移除舊版重複檔名（例如 高木折浩1 內曾用 高木折浩.html）
        stale = os.path.join(path, "高木折浩.html")
        if os.path.isfile(stale) and html_name != "高木折浩.html":
            try:
                os.remove(stale)
            except OSError:
                pass

    def esc_js_str(s: str) -> str:
        return s.replace("\\", "\\\\").replace("'", "\\'")

    # index.html
    entry_map = {name: html_name for name, html_name in entries}
    buttons = []
    for name, html_name in sorted(entries, key=lambda x: x[0]):
        # 首頁只顯示「角色本名」按鈕；但點進去導到「角色1」版本（若存在）
        if name.endswith("1"):
            continue
        target_name = name + "1" if (name + "1") in entry_map else name
        target_html = entry_map.get(target_name, html_name)
        href = esc_js_str(target_name + "/" + target_html)
        label_esc = (
            name.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
        )
        buttons.append(
            f"  <button type=\"button\" onclick=\"location.href='{href}'\">{label_esc}</button>"
        )
    index_body = f"""<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>請將我深埋</title>

<style>
body {{
  margin: 0;
  background: #111;
  color: white;
  font-family: sans-serif;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
}}

.container {{
  text-align: center;
  padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom));
  max-width: 360px;
  margin: 0 auto;
}}

h1 {{
  margin: 0 0 24px;
  font-size: clamp(1.15rem, 4vw, 1.35rem);
  font-weight: 600;
}}

button {{
  display: block;
  width: min(260px, 88vw);
  margin: 10px auto;
  padding: 10px 14px;
  font-size: 15px;
  border: none;
  border-radius: 8px;
  background: #333;
  color: white;
  cursor: pointer;
  transition: 0.3s;
}}

button:hover {{
  background: #555;
  transform: scale(1.02);
}}
</style>
</head>

<body>

<div class="container">
  <h1>請將我深埋</h1>
{chr(10).join(buttons)}
</div>

</body>
</html>
"""
    index_path = os.path.join(ROOT, "index.html")
    with open(index_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(index_body)

    print("已寫入", len(entries), "本書的 HTML 與 index.html")


if __name__ == "__main__":
    main()
