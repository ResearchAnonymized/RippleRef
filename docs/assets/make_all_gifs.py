#!/usr/bin/env python3
"""Animated GIFs for RippleRef README: banner, architecture, SP flow, MA flow."""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = Path(__file__).resolve().parent


def font(size: int, bold: bool = False):
    paths = [
        "/System/Library/Fonts/Supplemental/Georgia.ttf" if not bold else "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()


def save_gif(frames: list[Image.Image], path: Path, duration: int):
    frames[0].save(
        path,
        save_all=True,
        append_images=frames[1:],
        duration=duration,
        loop=0,
        optimize=False,
        disposal=2,
    )
    print(f"wrote {path.name} frames={len(frames)} bytes={path.stat().st_size}")


def lerp(a, b, t):
    return a + (b - a) * t


# ---------- BANNER ----------
def make_banner_frames(n: int = 24) -> list[Image.Image]:
    W, H = 1280, 420
    frames = []
    nodes = [(820, 120), (780, 260), (840, 320), (1100, 100), (1160, 280)]
    cx, cy = 980, 210
    F_BRAND = font(72, True)
    # Georgia for brand if available
    try:
        F_BRAND = ImageFont.truetype("/System/Library/Fonts/Supplemental/Georgia.ttf", 72)
    except Exception:
        pass
    F_SUB = font(22)
    F_LINE = font(16)
    F_BTN = font(14, True)

    for i in range(n):
        t = i / n
        img = Image.new("RGB", (W, H), (11, 31, 42))
        d = ImageDraw.Draw(img, "RGBA")
        # gradient-ish vertical bands
        for y in range(H):
            g = int(18 + 20 * (y / H))
            d.line([(0, y), (W, y)], fill=(11, 31 + g // 3, 42 + g // 2))

        # expanding ripples (two staggered)
        for k in range(5):
            phase = (t + k * 0.18) % 1.0
            r = 40 + phase * 220
            alpha = int(90 * (1 - phase))
            # draw ring as ellipse outline approximation
            for w in range(2):
                d.ellipse(
                    (cx - r - w, cy - r - w, cx + r + w, cy + r + w),
                    outline=(94, 234, 212, alpha),
                )

        # dependency lines with traveling sparks
        for ni, (nx, ny) in enumerate(nodes):
            d.line([(cx, cy), (nx, ny)], fill=(94, 234, 212, 90), width=2)
            spark_t = (t + ni * 0.17) % 1.0
            sx = int(lerp(cx, nx, spark_t))
            sy = int(lerp(cy, ny, spark_t))
            d.ellipse((sx - 4, sy - 4, sx + 4, sy + 4), fill=(240, 180, 41, 220))

        # outer nodes pulse
        for ni, (nx, ny) in enumerate(nodes):
            pr = 4 + int(2 * (0.5 + 0.5 * math.sin(2 * math.pi * (t + ni * 0.2))))
            d.ellipse((nx - pr, ny - pr, nx + pr, ny + pr), fill=(94, 234, 212, 255))

        # center pulse
        cr = 8 + int(4 * (0.5 + 0.5 * math.sin(2 * math.pi * t)))
        d.ellipse((cx - cr - 6, cy - cr - 6, cx + cr + 6, cy + cr + 6), fill=(240, 180, 41, 60))
        d.ellipse((cx - cr, cy - cr, cx + cr, cy + cr), fill=(240, 180, 41, 255))

        # text
        d.text((72, 118), "RippleRef", fill=(247, 244, 236, 255), font=F_BRAND)
        d.text((76, 198), "Repository-level ripple safety for LLM Java refactoring", fill=(167, 243, 208, 255), font=F_SUB)
        d.text((76, 248), "Single-prompt | Multi-agent | Shared L1-L5 verifier | Full audit trail", fill=(203, 213, 225, 255), font=F_LINE)
        # button pulse
        btn_glow = int(20 * (0.5 + 0.5 * math.sin(2 * math.pi * t)))
        d.rounded_rectangle((70 - 2, 294 - 2, 250 + 2, 336 + 2), radius=6, fill=(240, 180, 41, 40 + btn_glow))
        d.rounded_rectangle((76, 300, 244, 336), radius=4, fill=(240, 180, 41, 255))
        d.text((92, 308), "OPEN RESEARCH", fill=(11, 31, 42, 255), font=F_BTN)

        frames.append(img.convert("RGB"))
    return frames


# ---------- ARCHITECTURE ----------
def make_arch_frames(n_hold: int = 4) -> list[Image.Image]:
    W, H = 1100, 280
    BG = (247, 244, 236)
    stages = [
        (28, 88, 208, 228, (11, 31, 42), (240, 180, 41), "1 - Control", "Web UI", "Batch scripts", "Next.js / shell"),
        (260, 88, 460, 228, (18, 58, 58), (94, 234, 212), "2 - Generate", "Single-prompt V2", "or LangGraph MA", "Python agents / LLMs"),
        (512, 88, 712, 228, (26, 77, 58), (240, 180, 41), "3 - Verify (shared)", "L1 to L5 ripple checks", "Spring Boot API", "port 8083"),
        (764, 88, 1072, 228, (240, 180, 41), (11, 31, 42), "4 - Evidence", "pair_key artifacts", "risk / adoption / reports", "prompts / candidates"),
    ]
    F_T = font(15, True)
    F_B = font(13, True)
    F_S = font(12)
    F_M = font(11)

    def dim(c, on):
        if on:
            return c
        return tuple(int(x * 0.4 + 247 * 0.6) for x in c)

    frames = []
    # build up 0..3 then hold all + pulse arrow
    sequence = [0, 1, 2, 3, 3, 3]
    for step in sequence:
        for hold in range(n_hold):
            img = Image.new("RGB", (W, H), BG)
            d = ImageDraw.Draw(img)
            d.text((28, 22), "RippleRef - one horizontal path", fill=(11, 31, 42), font=F_T)
            d.text((28, 46), "You operate the left - agents generate in the middle - one verifier scores the right", fill=(71, 85, 105), font=F_S)

            for i, (x0, y0, x1, y1, fill, accent, t1, t2, t3, t4) in enumerate(stages):
                on = i <= step
                fc = dim(fill, on)
                d.rounded_rectangle((x0, y0, x1, y1), radius=10, fill=fc)
                # title color
                if fill == (240, 180, 41):
                    title_c = (11, 31, 42) if on else (100, 100, 100)
                    body_c = title_c
                    muted = (80, 80, 80)
                else:
                    title_c = accent if on else (160, 160, 160)
                    body_c = (247, 244, 236) if on else (180, 180, 180)
                    muted = (148, 163, 184) if on else (190, 190, 190)
                d.text((x0 + 18, y0 + 22), t1, fill=title_c, font=F_B)
                d.text((x0 + 18, y0 + 52), t2, fill=body_c, font=F_S)
                d.text((x0 + 18, y0 + 74), t3, fill=body_c, font=F_S)
                d.text((x0 + 18, y0 + 104), t4, fill=muted, font=F_M)

            # arrows
            gaps = [(208, 260), (460, 512), (712, 764)]
            cy = 158
            for gi, (a, b) in enumerate(gaps):
                on = gi < step
                col = (11, 31, 42) if on else (200, 200, 200)
                d.line((a + 4, cy, b - 10, cy), fill=col, width=3)
                d.polygon([(b - 2, cy), (b - 14, cy - 7), (b - 14, cy + 7)], fill=col)
                if on and gi == step - 1:
                    # spark
                    tt = (hold + 1) / (n_hold + 1)
                    sx = int(a + (b - a) * tt)
                    d.ellipse((sx - 5, cy - 5, sx + 5, cy + 5), fill=(240, 180, 41))

            # progress
            pw = int(1040 * ((step + 1) / 4))
            d.rounded_rectangle((28, 250, 1068, 258), radius=4, fill=(220, 220, 220))
            d.rounded_rectangle((28, 250, 28 + pw, 258), radius=4, fill=(240, 180, 41))
            frames.append(img)
    return frames


# ---------- SINGLE PROMPT / MA (improved) ----------
INK = (11, 31, 42)
TEAL = (18, 58, 58)
GREEN = (26, 77, 58)
GOLD = (240, 180, 41)
BG = (247, 244, 236)
LIGHT = (247, 244, 236)
MUTED = (148, 163, 184)
SUB = (71, 85, 105)


def fnt(sz, bold=False):
    return font(sz, bold)


def rounded(d, xy, fill):
    d.rounded_rectangle(xy, radius=10, fill=fill)


def dim(c, on):
    return c if on else tuple(int(x * 0.42 + 247 * 0.58) for x in c)


def arrow(d, x0, x1, y, on, spark_t=None):
    col = INK if on else (190, 190, 190)
    d.line((x0, y, x1 - 8, y), fill=col, width=3)
    d.polygon([(x1, y), (x1 - 12, y - 7), (x1 - 12, y + 7)], fill=col)
    if on and spark_t is not None:
        x = int(x0 + (x1 - x0) * spark_t)
        d.ellipse((x - 5, y - 5, x + 5, y + 5), fill=GOLD)


def make_sp_frames() -> list[Image.Image]:
    W, H = 1100, 240
    boxes = [
        (28, 84, 178, 172, INK, "File + smells", "+ dep. context"),
        (226, 84, 376, 172, TEAL, "Build V2 prompt", "single user message"),
        (424, 84, 574, 172, GREEN, "One LLM call", "OpenRouter model"),
        (622, 84, 772, 172, INK, "Extract Java", "sanitize / store"),
        (820, 84, 1072, 172, GOLD, "Shared L1-L5 verify", "risk / adoption / reports"),
    ]
    gaps = [(178, 226), (376, 424), (574, 622), (772, 820)]
    frames = []
    for step in range(5):
        for hold in range(5):
            img = Image.new("RGB", (W, H), BG)
            d = ImageDraw.Draw(img)
            d.text((28, 18), "Single-prompt (B0-V2)", fill=INK, font=fnt(18, True))
            d.text((28, 44), "One dependency-aware prompt - one LLM call - same shared verifier", fill=SUB, font=fnt(13))
            for i, (x0, y0, x1, y1, col, a, b) in enumerate(boxes):
                on = i <= step
                fill = dim(col, on)
                tc = LIGHT if fill[0] < 200 else INK
                sc = MUTED if fill[0] < 200 else (63, 63, 70)
                if col == GOLD and on:
                    tc, sc = INK, (63, 63, 70)
                rounded(d, (x0, y0, x1, y1), fill)
                d.text((x0 + 14, y0 + 28), a, fill=tc, font=fnt(14, True))
                d.text((x0 + 14, y0 + 52), b, fill=sc, font=fnt(12))
            cy = 128
            for gi, (a, b) in enumerate(gaps):
                on = gi < step
                spark = (hold + 1) / 6 if gi == step - 1 and on else None
                arrow(d, a + 2, b - 2, cy, on, spark)
            d.text((28, 198), "Code: agents/ripple_ref_study.py | prompts in agents/llm_prompts.py", fill=MUTED, font=fnt(11))
            pw = int(1040 * ((step + 1) / 5))
            d.rounded_rectangle((28, 220, 1068, 228), 4, fill=(220, 220, 220))
            d.rounded_rectangle((28, 220, 28 + pw, 228), 4, fill=GOLD)
            frames.append(img)
    # end hold
    for _ in range(6):
        frames.append(frames[-1].copy())
    return frames


def make_ma_frames() -> list[Image.Image]:
    W, H = 1100, 280
    boxes = [
        (28, 90, 158, 168, INK, "Context", "file / deps"),
        (206, 90, 336, 168, TEAL, "Planner", "strategy"),
        (384, 90, 514, 168, GREEN, "Editor", "rewrite Java"),
        (562, 90, 702, 168, TEAL, "Agent verify", "static / LLM"),
        (750, 90, 1072, 168, GOLD, "Shared L1-L5 verify (same as B0)", "apply-and-verify / reports"),
    ]
    frames = []
    # approach
    for step in range(4):
        for hold in range(4):
            img = Image.new("RGB", (W, H), BG)
            d = ImageDraw.Draw(img)
            d.text((28, 18), "Multi-agent (P-MA / LangGraph)", fill=INK, font=fnt(18, True))
            d.text((28, 44), "Specialized agents collaborate - may revise - then the same shared verifier", fill=SUB, font=fnt(13))
            lit = set(range(step + 1))
            for i, (x0, y0, x1, y1, col, a, b) in enumerate(boxes):
                on = i in lit
                fill = dim(col, on)
                tc = LIGHT if fill[0] < 200 else INK
                sc = MUTED if fill[0] < 200 else (63, 63, 70)
                if col == GOLD and on:
                    tc, sc = INK, (63, 63, 70)
                rounded(d, (x0, y0, x1, y1), fill)
                d.text((x0 + 14, y0 + 24), a, fill=tc, font=fnt(14, True))
                d.text((x0 + 14, y0 + 48), b, fill=sc, font=fnt(12))
            cy = 129
            gaps = [(158, 206), (336, 384), (514, 562), (702, 750)]
            for gi, (a, b) in enumerate(gaps):
                on = gi < step
                spark = (hold + 1) / 5 if gi == step - 1 and on else None
                arrow(d, a + 2, b - 2, cy, on, spark)
            # dormant loop
            d.line([(632, 168), (632, 198), (450, 198), (450, 168)], fill=(210, 210, 210), width=3)
            d.text((470, 208), "revise if needed", fill=MUTED, font=fnt(11))
            d.text((28, 236), "Code: agents/ma_ref_study.py | agents/refactor_graph.py | agents/refactor_nodes/", fill=MUTED, font=fnt(11))
            pw = int(1040 * ((step + 1) / 6))
            d.rounded_rectangle((28, 258, 1068, 266), 4, fill=(220, 220, 220))
            d.rounded_rectangle((28, 258, 28 + pw, 266), 4, fill=GOLD)
            frames.append(img)

    # revise loop phases
    for ph in range(16):
        img = Image.new("RGB", (W, H), BG)
        d = ImageDraw.Draw(img)
        d.text((28, 18), "Multi-agent (P-MA / LangGraph)", fill=INK, font=fnt(18, True))
        d.text((28, 44), "Specialized agents collaborate - may revise - then the same shared verifier", fill=SUB, font=fnt(13))
        for i, (x0, y0, x1, y1, col, a, b) in enumerate(boxes):
            on = i < 4
            # pulse editor/verify
            if i in (2, 3):
                fill = col
            else:
                fill = dim(col, on)
            tc = LIGHT if fill[0] < 200 else INK
            sc = MUTED if fill[0] < 200 else (63, 63, 70)
            rounded(d, (x0, y0, x1, y1), fill)
            d.text((x0 + 14, y0 + 24), a, fill=tc, font=fnt(14, True))
            d.text((x0 + 14, y0 + 48), b, fill=sc, font=fnt(12))
        cy = 129
        for a, b in [(158, 206), (336, 384), (514, 562)]:
            arrow(d, a + 2, b - 2, cy, True)
        arrow(d, 702 + 2, 750 - 2, cy, False)
        # loop
        d.line([(632, 168), (632, 198), (450, 198), (450, 168)], fill=GOLD, width=3)
        d.polygon([(450, 168), (443, 180), (457, 180)], fill=GOLD)
        d.text((470, 208), "revise if needed", fill=(146, 64, 14), font=fnt(11))
        # pulse along loop
        pts = [(632, 168), (632, 198), (450, 198), (450, 172)]
        segs = list(zip(pts, pts[1:]))
        lens = [math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in segs]
        total = sum(lens) or 1
        dist = (ph / 16) * total
        acc = 0
        px, py = pts[0]
        for (a, b), L in zip(segs, lens):
            if dist <= acc + L:
                tt = 0 if L == 0 else (dist - acc) / L
                px = int(a[0] + (b[0] - a[0]) * tt)
                py = int(a[1] + (b[1] - a[1]) * tt)
                break
            acc += L
        d.ellipse((px - 6, py - 6, px + 6, py + 6), fill=GOLD)
        d.text((28, 236), "Code: agents/ma_ref_study.py | agents/refactor_graph.py | agents/refactor_nodes/", fill=MUTED, font=fnt(11))
        d.rounded_rectangle((28, 258, 1068, 266), 4, fill=(220, 220, 220))
        d.rounded_rectangle((28, 258, 28 + int(1040 * 5 / 6), 266), 4, fill=GOLD)
        frames.append(img)

    # final verify
    for hold in range(8):
        img = Image.new("RGB", (W, H), BG)
        d = ImageDraw.Draw(img)
        d.text((28, 18), "Multi-agent (P-MA / LangGraph)", fill=INK, font=fnt(18, True))
        d.text((28, 44), "Specialized agents collaborate - may revise - then the same shared verifier", fill=SUB, font=fnt(13))
        for i, (x0, y0, x1, y1, col, a, b) in enumerate(boxes):
            fill = col
            tc = LIGHT if col != GOLD else INK
            sc = MUTED if col != GOLD else (63, 63, 70)
            if col == GOLD:
                tc, sc = INK, (63, 63, 70)
            else:
                tc, sc = LIGHT, MUTED
            rounded(d, (x0, y0, x1, y1), fill)
            d.text((x0 + 14, y0 + 24), a, fill=tc, font=fnt(14, True))
            d.text((x0 + 14, y0 + 48), b, fill=sc, font=fnt(12))
        cy = 129
        for a, b in [(158, 206), (336, 384), (514, 562), (702, 750)]:
            spark = (hold + 1) / 9 if (a, b) == (702, 750) else None
            arrow(d, a + 2, b - 2, cy, True, spark)
        d.line([(632, 168), (632, 198), (450, 198), (450, 168)], fill=(210, 210, 210), width=3)
        d.text((470, 208), "revise if needed", fill=MUTED, font=fnt(11))
        d.text((28, 236), "Code: agents/ma_ref_study.py | agents/refactor_graph.py | agents/refactor_nodes/", fill=MUTED, font=fnt(11))
        d.rounded_rectangle((28, 258, 1068, 266), 4, fill=(220, 220, 220))
        d.rounded_rectangle((28, 258, 1068, 266), 4, fill=GOLD)
        frames.append(img)
    return frames


def main():
    save_gif(make_banner_frames(28), OUT / "banner.gif", duration=90)
    save_gif(make_arch_frames(3), OUT / "architecture.gif", duration=220)
    save_gif(make_sp_frames(), OUT / "flow-single-prompt.gif", duration=160)
    save_gif(make_ma_frames(), OUT / "flow-multi-agent.gif", duration=140)
    # also refresh static PNG first frames for fallbacks
    make_banner_frames(1)[0].save(OUT / "banner.png")
    make_arch_frames(1)[-1].save(OUT / "architecture.png")


if __name__ == "__main__":
    main()
