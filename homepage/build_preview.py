#!/usr/bin/env python3
"""
public_html/ の各ページを、画像とCSSを埋め込んだ1枚ファイルにして
preview/ に書き出す（確認用。アップロードはしない）。

相対パスの画像はローカルやチャットのプレビューでは表示されないため、
見た目の確認にはこちらを使う。

使い方:  python3 build_preview.py   （homepage/ フォルダで実行）
"""

import base64
import io
import os
import re
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow が必要です:  pip install Pillow")

ROOT = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(ROOT, "public_html")
IMG_DIR = os.path.join(PUB, "images")
OUT = os.path.join(ROOT, "preview")
PAGES = ["index.html", "juyojiko.html", "privacy.html", "404.html"]

# 埋め込み時だけ縮小・再圧縮する（本番画像には手を触れない）
MAX_EDGE = 620
QUALITY = 52
PHOTO_PREFIXES = ("hero-", "store-", "inner-", "voice-", "prog-", "concept")

_cache = {}


def data_uri(name: str) -> str:
    if name in _cache:
        return _cache[name]
    src = os.path.join(IMG_DIR, name)
    buf = io.BytesIO()
    if name.startswith(PHOTO_PREFIXES):
        im = Image.open(src).convert("RGB")
        im.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
        im.save(buf, "JPEG", quality=QUALITY, optimize=True)
        mime = "image/jpeg"
    elif name == "logo-mark.png":
        Image.open(src).convert("RGB").resize((160, 160), Image.LANCZOS).save(buf, "PNG")
        mime = "image/png"
    else:
        with open(src, "rb") as f:
            buf.write(f.read())
        mime = "image/png" if name.endswith(".png") else "image/jpeg"
    _cache[name] = "data:%s;base64,%s" % (mime, base64.b64encode(buf.getvalue()).decode())
    return _cache[name]


def build(page: str) -> None:
    with open(os.path.join(PUB, page), encoding="utf-8") as f:
        html = f.read()

    # 下層ページの共通CSSを埋め込む
    with open(os.path.join(PUB, "sub.css"), encoding="utf-8") as f:
        css = f.read()
    html = re.sub(r'<link rel="stylesheet" href="/?sub\.css">', "<style>\n%s</style>" % css, html)

    html = re.sub(r'src="/?images/([^"]+)"', lambda m: 'src="%s"' % data_uri(m.group(1)), html)
    if re.search(r'src="/?images/', html):
        sys.exit("エラー: %s に埋め込めなかった画像参照が残っています" % page)

    os.makedirs(OUT, exist_ok=True)
    dst = os.path.join(OUT, "preview-" + page)
    with open(dst, "w", encoding="utf-8") as f:
        f.write(html)
    print("生成しました: preview/preview-%s (%d KB)" % (page, os.path.getsize(dst) // 1024))


if __name__ == "__main__":
    for p in PAGES:
        build(p)
