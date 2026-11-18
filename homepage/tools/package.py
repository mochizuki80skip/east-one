#!/usr/bin/env python3
"""
Xサーバーにアップロードする一式を作る。

public_html/ の中の「__SITE_URL__」（OGP・正規URL・サイトマップなどで使う
サイトのアドレス）を本番のアドレスに置き換えて dist/public_html/ に書き出し、
同じ中身の dist/eastone-homepage.zip も作る。
あわせて、未記入の箇所（【要記入】【要確認】）や計測IDの入れ忘れを知らせる。

使い方（homepage/ フォルダで実行）:
  python3 tools/package.py https://www.example.jp
"""

import os
import re
import shutil
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "public_html")
DIST = os.path.join(ROOT, "dist")
OUT = os.path.join(DIST, "public_html")
ZIP = os.path.join(DIST, "eastone-homepage.zip")
TEXT_EXT = (".html", ".txt", ".xml", ".css", ".htaccess")
PLACEHOLDER = "__SITE_URL__"


def main() -> None:
    if len(sys.argv) != 2 or not re.match(r"^https://[a-z0-9.-]+\.[a-z]{2,}$", sys.argv[1].rstrip("/")):
        sys.exit("使い方: python3 tools/package.py https://www.example.jp\n"
                 "（https:// から始まるサイトのアドレス。最後の / は不要）")
    site = sys.argv[1].rstrip("/")

    shutil.rmtree(OUT, ignore_errors=True)
    shutil.copytree(SRC, OUT)

    todos = []
    for dirpath, _, files in os.walk(OUT):
        for name in files:
            path = os.path.join(dirpath, name)
            if not name.endswith(TEXT_EXT):
                continue
            with open(path, encoding="utf-8") as f:
                text = f.read()
            text = text.replace(PLACEHOLDER, site)
            with open(path, "w", encoding="utf-8") as f:
                f.write(text)
            n = len(re.findall(r"【要(?:記入|確認)】", text))
            if n:
                todos.append((os.path.relpath(path, OUT), n))

    if os.path.exists(ZIP):
        os.remove(ZIP)
    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as z:
        for dirpath, _, files in os.walk(OUT):
            for name in sorted(files):
                path = os.path.join(dirpath, name)
                z.write(path, os.path.relpath(path, OUT))

    print("作成しました: dist/public_html/ と dist/eastone-homepage.zip（アドレス: %s）" % site)

    with open(os.path.join(OUT, "index.html"), encoding="utf-8") as f:
        idx = f.read()
    if "EASTONE_GA4_ID = ''" in idx:
        print("  注意: GA4 の測定IDが未設定です（index.html の EASTONE_GA4_ID）")
    if "EASTONE_CLARITY_ID = ''" in idx:
        print("  注意: Microsoft Clarity のIDが未設定です（index.html の EASTONE_CLARITY_ID）")
    for path, n in todos:
        print("  注意: %s に未記入の箇所が %d か所あります（【要記入】【要確認】）" % (path, n))


if __name__ == "__main__":
    main()
