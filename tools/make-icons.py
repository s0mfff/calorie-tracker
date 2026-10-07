# Генерация иконок «Калории»: градиентный фон + яблоко с укусом
import math
import numpy as np
from PIL import Image, ImageDraw

OUT = 'icons'
BASE = 4096  # суперсэмплинг для гладких краёв

def rounded_mask(size, radius):
    m = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m

def gradient_bg(size, top, bottom):
    t = np.linspace(0, 1, size, dtype=np.float32)
    top = np.array(top, dtype=np.float32)
    bottom = np.array(bottom, dtype=np.float32)
    g = top[None, :] * (1 - t[:, None]) + bottom[None, :] * t[:, None]  # (size,3)
    arr = np.repeat(g[:, None, :], size, axis=1)                        # (size,size,3)
    return Image.fromarray(arr.astype(np.uint8))

def draw_icon(size, pad_ratio=0.0):
    # pad_ratio: отступ для maskable-иконки
    img = gradient_bg(BASE, (58, 224, 138), (26, 168, 98))
    # фон оставляем квадратным, скругление — на финальной стадии не нужно (iOS сам скругляет)
    d = ImageDraw.Draw(img)
    pad = int(BASE * pad_ratio)
    s = BASE - 2 * pad
    u = s / 1024.0  # юнит масштаба

    def E(cx, cy, rx, ry, fill):
        d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=fill)

    white = (255, 255, 255)
    # --- тело яблока: две доли + низ ---
    cx1, cy1 = (512 - 66) * u + pad, (600 - 20) * u + pad
    r1 = 330 * u
    cx2 = (512 + 66) * u + pad
    E(cx1, cy1, r1, r1, white)
    E(cx2, cy1, r1, r1, white)
    E(512 * u + pad, 640 * u + pad, 350 * u, 330 * u, white)
    # --- укус справа: вырезаем кружком цвета фона в этой точке ---
    # (градиент вертикальный — цвет зависит только от y, сэмпл берём правее яблока)
    bite_cx, bite_cy = 850 * u + pad, 430 * u + pad
    bite_r = 150 * u
    sample_x = min(BASE - 2, int(bite_cx + bite_r + 24))
    sample_y = min(BASE - 2, int(bite_cy))
    bg_at_bite = img.getpixel((sample_x, sample_y))
    E(bite_cx, bite_cy, bite_r, bite_r, bg_at_bite)
    # --- черенок ---
    stem_w = 34 * u
    d.rounded_rectangle(
        [512 * u + pad - stem_w / 2, 118 * u + pad, 512 * u + pad + stem_w / 2, 300 * u + pad],
        radius=int(stem_w / 2), fill=(122, 82, 44))
    # --- листик (повёрнутый эллипс) ---
    leaf = Image.new('RGBA', (BASE, BASE), (0, 0, 0, 0))
    ld = ImageDraw.Draw(leaf)
    lw, lh = 300 * u, 110 * u
    lcx, lcy = 512 * u + pad + 120 * u, 190 * u + pad
    ld.ellipse([lcx - lw / 2, lcy - lh / 2, lcx + lw / 2, lcy + lh / 2], fill=(150, 240, 180, 255))
    leaf = leaf.rotate(-32, center=(lcx, lcy), resample=Image.BICUBIC)
    img.paste(leaf, (0, 0), leaf)
    return img

def save_all():
    master = draw_icon(BASE)
    maskable = draw_icon(BASE, pad_ratio=0.13)
    for name, px in [('apple-touch-icon', 180), ('icon-192', 192), ('icon-512', 512), ('favicon-32', 32)]:
        master.resize((px, px), Image.LANCZOS).save(f'{OUT}/{name}.png')
        print('saved', name)
    maskable.resize((512, 512), Image.LANCZOS).save(f'{OUT}/icon-maskable-512.png')
    print('saved icon-maskable-512')

if __name__ == '__main__':
    save_all()
