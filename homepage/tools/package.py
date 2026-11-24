#!/usr/bin/env python3
"""
Xサーバーにアップロードする一式を作る。

public_html/ を dist/public_html/ に書き出し、同じ中身の dist/eastone-homepage.zip も作る。
あわせて、未記入の箇所（【要記入】【要確認】）や計測IDの入れ忘れを知らせる。
公開アドレスは https://east-one.hachimaru-80skip.com （各ファイルに直接書いてある）。

使い方（homepage/ フォルダで実行）:
  python3 tools/package.py
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
TEXT_EXT = (".html", ".txt", ".xml", ".css", ".js", ".htaccess")
SITE = "https://east-one.hachimaru-80skip.com"


def main() -> None:
    shutil.rmtree(OUT, ignore_errors=True)
    shutil.copytree(SRC, OUT)

    todos, held = [], []
    for dirpath, _, files in os.walk(OUT):
        for name in files:
            path = os.path.join(dirpath, name)
            if not name.endswith(TEXT_EXT):
                continue
            with open(path, encoding="utf-8") as f:
                text = f.read()
            if "__SITE_URL__" in text:
                sys.exit("エラー: %s に __SITE_URL__ が残っています。%s に置き換えてください" % (name, SITE))
            n = len(re.findall(r"【要(?:記入|確認)】", text))
            if n and name.endswith(".html"):
                # 未記入のページは公開しない（黄色の【要記入】がそのまま見えてしまうため）
                os.remove(path)
                held.append((os.path.relpath(path, OUT), n))
            elif n:
                todos.append((os.path.relpath(path, OUT), n))

    if os.path.exists(ZIP):
        os.remove(ZIP)
    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as z:
        for dirpath, _, files in os.walk(OUT):
            for name in sorted(files):
                path = os.path.join(dirpath, name)
                z.write(path, os.path.relpath(path, OUT))

    print("作成しました: dist/public_html/ と dist/eastone-homepage.zip（公開アドレス: %s）" % SITE)

    with open(os.path.join(OUT, "analytics.js"), encoding="utf-8") as f:
        idx = f.read()
    if "EASTONE_GA4_ID = ''" in idx:
        print("  注意: GA4 の測定IDが未設定です（analytics.js の EASTONE_GA4_ID）")
    if "EASTONE_CLARITY_ID = ''" in idx:
        print("  注意: Microsoft Clarity のIDが未設定です（analytics.js の EASTONE_CLARITY_ID）")
    for path, n in todos:
        print("  注意: %s に未記入の箇所が %d か所あります（【要記入】【要確認】）" % (path, n))
    for path, n in held:
        print("  保留: %s は未記入が %d か所あるため一式に入れていません（埋めてから作り直すと入ります）" % (path, n))


if __name__ == "__main__":
    main()
