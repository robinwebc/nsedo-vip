"""Rasterise the nSedo mark and the Open Graph card. Requires Pillow and CairoSVG."""

from pathlib import Path

import cairosvg
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
ICONS = PUBLIC / "icons"
SERIF = "/usr/share/fonts/truetype/noto/NotoSerifBengali-Bold.ttf"
SANS = "/usr/share/fonts/truetype/noto/NotoSansBengali-Regular.ttf"
LATIN_SERIF = "/usr/share/fonts/truetype/noto/NotoSerif-Bold.ttf"
LATIN_SANS = "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf"
LATIN_SANS_BOLD = "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf"

INK = (20, 32, 43, 255)
COBALT = (36, 87, 230, 255)
PAPER = (244, 247, 251, 255)
MUTED = (183, 195, 209, 255)


def mark(size: int) -> Image.Image:
    png = cairosvg.svg2png(
        url=str(PUBLIC / "favicon.svg"),
        output_width=size,
        output_height=size,
    )
    return Image.open(__import__("io").BytesIO(png)).convert("RGBA")


def og() -> Image.Image:
    img = Image.new("RGB", (1200, 630), INK[:3])
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, 14, 630), fill=COBALT[:3])
    icon = mark(120)
    img.paste(icon, (72, 72), icon)

    name_font = ImageFont.truetype(LATIN_SERIF, 72)
    vip_font = ImageFont.truetype(LATIN_SANS_BOLD, 22)
    bn_font = ImageFont.truetype(SERIF, 64)
    bn_sub = ImageFont.truetype(SANS, 32)
    en_font = ImageFont.truetype(LATIN_SANS, 26)

    draw.text((220, 92), "nSedo", font=name_font, fill=PAPER[:3])
    vip = "VIP"
    box = draw.textbbox((0, 0), vip, font=vip_font)
    vw = box[2] - box[0]
    vh = box[3] - box[1]
    name_box = draw.textbbox((220, 92), "nSedo", font=name_font)
    vx = name_box[2] + 22
    vy = 118
    draw.rounded_rectangle((vx, vy, vx + vw + 26, vy + vh + 16), radius=3, outline=COBALT[:3], width=2)
    draw.text((vx + 13, vy + 6), vip, font=vip_font, fill=COBALT[:3])

    draw.text((72, 268), "খালি ভিআইপি নাম্বার", font=bn_font, fill=PAPER[:3])
    left = "রবি ০১৮"
    draw.text((72, 390), left, font=bn_sub, fill=MUTED[:3])
    left_box = draw.textbbox((72, 390), left, font=bn_sub)
    gap_x = left_box[2] + 18
    mid_y = (left_box[1] + left_box[3]) // 2
    draw.rectangle((gap_x, mid_y - 3, gap_x + 18, mid_y + 3), fill=COBALT[:3])
    draw.text((gap_x + 32, 390), "এয়ারটেল ০১৬", font=bn_sub, fill=MUTED[:3])
    draw.text((72, 470), "Open numbers, checked on the operator's public list.", font=en_font, fill=MUTED[:3])
    return img


def main() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    mark(192).save(ICONS / "icon-192.png")
    mark(512).save(ICONS / "icon-512.png")
    mark(180).save(ICONS / "apple-touch-icon.png")
    og().save(PUBLIC / "og.png", optimize=True)
    print("wrote icons and og.png")


if __name__ == "__main__":
    main()
