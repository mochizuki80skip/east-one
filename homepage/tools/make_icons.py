#!/usr/bin/env python3
"""
ファビコン・スマホのホーム画面アイコン・OGP画像（SNSで共有したときのサムネイル）を
images/ の素材から作り直すスクリプト。ロゴや写真を差し替えたときだけ実行する。

使い方:  python3 tools/make_icons.py   （homepage/ フォルダで実行）
"""

import os
from PIL import Image, ImageDraw, ImageFont, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(HERE, "..", "public_html")
IMG = os.path.join(PUB, "images")
PINK = (0xD2, 0x4F, 0x93)
FONT_CANDIDATES = [
    "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf",
    "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc",
    "C:/Windows/Fonts/meiryob.ttc",
]


def circle_mark(size: int) -> Image.Image:
    """ピンク地のキャラクターを円形に切り抜く（背景は透過）"""
    mark = Image.open(os.path.join(IMG, "logo-mark.png")).convert("RGB")
    big = size * 4
    mark = mark.resize((big, big), Image.LANCZOS)
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, big - 1, big - 1), fill=255)
    out = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    out.paste(mark, (0, 0), mask)
    return out.resize((size, size), Image.LANCZOS)


def favicons() -> None:
    # favicon.ico（16/32/48）はサイト直下に置く。ブラウザが自動で探しに来る
    circle_mark(256).save(os.path.join(PUB, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
    circle_mark(192).save(os.path.join(PUB, "icon-192.png"), optimize=True)
    # iPhone のホーム画面用は透過不可・角丸は端末側でつくので、正方形のまま
    sq = Image.open(os.path.join(IMG, "logo-mark.png")).convert("RGB").resize((180, 180), Image.LANCZOS)
    sq.save(os.path.join(PUB, "apple-touch-icon.png"), optimize=True)


def font(px: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return ImageFont.truetype(path, px)
    raise SystemExit("日本語フォントが見つかりません。FONT_CANDIDATES にパスを追加してください")


def ogp() -> None:
    """1200×630。左にロゴと一言、右に写真"""
    W, H = 1200, 630
    canvas = Image.new("RGB", (W, H), PINK)

    photo = ImageOps.exif_transpose(Image.open(os.path.join(IMG, "hero-1.jpg"))).convert("RGB")
    photo = ImageOps.fit(photo, (620, H), Image.LANCZOS, centering=(0.5, 0.5))
    canvas.paste(photo, (W - 620, 0))

    # 左側の白いカード
    card = Image.new("RGB", (520, 470), "white")
    cmask = Image.new("L", card.size, 0)
    ImageDraw.Draw(cmask).rounded_rectangle((0, 0, card.size[0] - 1, card.size[1] - 1), 18, fill=255)
    canvas.paste(card, (40, 80), cmask)

    mark = circle_mark(120)
    canvas.paste(mark, (40 + 200, 112), mark)
    typ = Image.open(os.path.join(IMG, "logo-type-pink.png")).convert("RGBA")
    tw = 380
    typ = typ.resize((tw, round(typ.height * tw / typ.width)), Image.LANCZOS)
    canvas.paste(typ, (40 + (520 - tw) // 2, 250), typ)

    d = ImageDraw.Draw(canvas)
    deep = (0xA8, 0x3A, 0x73)
    lines = [("フィットネス型デイサービス", 34, (0x2E, 0x25, 0x30)), ("裾野市・三島市・長泉町", 30, deep)]
    y = 390
    for text, size, color in lines:
        f = font(size)
        w = d.textlength(text, font=f)
        d.text((40 + (520 - w) / 2, y), text, font=f, fill=color)
        y += size + 22

    canvas.save(os.path.join(IMG, "ogp.jpg"), quality=86, optimize=True)


if __name__ == "__main__":
    favicons()
    ogp()
    print("作成しました: favicon.ico / apple-touch-icon.png / icon-192.png / images/ogp.jpg")
