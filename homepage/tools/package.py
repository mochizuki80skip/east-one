#!/usr/bin/env python3
"""
Xサーバーにアップロードする一式を作る。

public_html/ を dist/public_html/ に書き出し、同じ中身の zip を作る。
あわせて、未記入の箇所（【要記入】【要確認】）や計測IDの入れ忘れを知らせる。

ファイル名には版（日付＋その日の何回目か a, b, c…）を付ける。
  dist/East-oneHP_アップロード用_20261124a.zip
  dist/East-oneHP_確認用_20261124a.html   （preview/preview-index.html の写し）
最後に作った版は tools/last_version.txt に記録する（Git に入れて、別の作業環境でも続きの記号になるように）。
公開アドレスは https://east-one.hachimaru-80skip.com （各ファイルに直接書いてある）。

使い方（homepage/ フォルダで実行）:
  python3 tools/package.py
"""

import os
import re
import shutil
import sys
import zipfile
from datetime import datetime
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "public_html")
DIST = os.path.join(ROOT, "dist")
OUT = os.path.join(DIST, "public_html")
TITLE = "East-oneHP"
VERSION_FILE = os.path.join(HERE, "last_version.txt")
PREVIEW = os.path.join(ROOT, "preview", "preview-index.html")
TEXT_EXT = (".html", ".txt", ".xml", ".css", ".js", ".htaccess")
SITE = "https://east-one.hachimaru-80skip.com"


def next_version() -> str:
    """今日の日付（日本時間）＋ a, b, c…。前回と同じ日なら記号を1つ進める"""
    today = datetime.now(ZoneInfo("Asia/Tokyo")).strftime("%Y%m%d")
    last = ""
    if os.path.exists(VERSION_FILE):
        with open(VERSION_FILE, encoding="utf-8") as f:
            last = f.read().strip()
    if last[:8] == today and len(last) == 9:
        if last[8] == "z":
            sys.exit("エラー: 同じ日に26回を超えました。tools/last_version.txt を確認してください")
        return today + chr(ord(last[8]) + 1)
    return today + "a"


def main() -> None:
    version = next_version()
    zip_path = os.path.join(DIST, "%s_アップロード用_%s.zip" % (TITLE, version))
    preview_path = os.path.join(DIST, "%s_確認用_%s.html" % (TITLE, version))
    shutil.rmtree(OUT, ignore_errors=True)
    # サーバー上にだけある管理画面の設定・登録データは一式に入れない（上書きで消さないため）
    shutil.copytree(SRC, OUT, ignore=lambda d, names: [
        n for n in names
        if (os.path.basename(d) == "kanri" and n == "config.php")
        or (os.path.basename(d) in ("data", "files") and n != ".htaccess")])

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

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for dirpath, _, files in os.walk(OUT):
            for name in sorted(files):
                path = os.path.join(dirpath, name)
                z.write(path, os.path.relpath(path, OUT))

    # 確認用（画像埋め込み版）は build_preview.py の結果を写す。古ければ知らせる
    if os.path.exists(PREVIEW):
        shutil.copyfile(PREVIEW, preview_path)
        if os.path.getmtime(PREVIEW) < os.path.getmtime(os.path.join(SRC, "index.html")):
            print("  注意: 確認用ファイルが index.html より古いです。先に python3 build_preview.py を実行してください")
    with open(VERSION_FILE, "w", encoding="utf-8") as f:
        f.write(version + "\n")

    print("作成しました（版 %s／公開アドレス: %s）" % (version, SITE))
    print("  " + os.path.relpath(zip_path, ROOT))
    if os.path.exists(preview_path):
        print("  " + os.path.relpath(preview_path, ROOT))

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
