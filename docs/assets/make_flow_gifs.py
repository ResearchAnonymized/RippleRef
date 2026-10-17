#!/usr/bin/env python3
"""Generate animated GIFs for single-prompt and multi-agent flows (GitHub-safe)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent
W, H = 1100, 240
BG = (247, 244, 236)
INK = (11, 31, 42)
TEAL = (18, 58, 58)
GREEN = (26, 77, 58)
GOLD = (240, 180, 41)
LIGHT = (247, 244, 236)
MUTED = (148, 163, 184)
SUB = (71, 85, 105)
LOOP = (146, 64, 14)


def font(size: int, bold: bool = False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


F_TITLE = font(18, True)
F_SUB = font(13)
F_BOX = font(14, True)
F_SMALL = font(12)
F_FOOT = font(11)


def rounded(draw: ImageDraw.ImageDraw, xy, fill, radius=10):
    draw.rounded_rectangle(xy, radius=radius, fill=fill)


def dim(color, active: bool):
    if active:
        return color
    # fade toward background
    return tuple(int(c * 0.45 + 247 * 0.55) for c in color)


def arrow(draw, x0, y, x1, active: bool):
    col = INK if active else (180, 180, 180)
    draw.line((x0, y, x1 - 8, y), fill=col, width=3)
    draw.polygon([(x1, y), (x1 - 12, y - 7), (x1 - 12, y + 7)], fill=col)


def pulse_dot(draw, x, y, t: float, active_seg: bool):
    if not active_seg:
        return
    # t in [0,1] along segment
    r = 5 + int(2 * abs(0.5 - (t % 1.0)) * 2)
    draw.ellipse((x - r, y - r, x + r, y + r), fill=GOLD)


def draw_sp_frame(step: int, n_steps: int) -> Image.Image:
    """step 0..4 highlight boxes; also animate dots between."""
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.text((28, 18), "Single-prompt (B0-V2)", fill=INK, font=F_TITLE)
    d.text((28, 44), "One dependency-aware prompt - one LLM call - same shared verifier", fill=SUB, font=F_SUB)

    boxes = [
        (28, 84, 178, 172, INK, "File + smells", "+ dep. context"),
        (226, 84, 376, 172, TEAL, "Build V2 prompt", "single user message"),
        (424, 84, 574, 172, GREEN, "One LLM call", "OpenRouter model"),
        (622, 84, 772, 172, INK, "Extract Java", "sanitize / store"),
        (820, 84, 1072, 172, GOLD, "Shared L1-L5 verify", "risk / adoption / reports"),
    ]
    # highlight up to step
    for i, (x0, y0, x1, y1, col, t1, t2) in enumerate(boxes):
        active = i <= step
        fill = dim(col, active)
        text_col = LIGHT if fill[0] < 200 else INK
        sub_col = MUTED if fill[0] < 200 else (63, 63, 70)
        if col == GOLD and active:
            text_col, sub_col = INK, (63, 63, 70)
        rounded(d, (x0, y0, x1, y1), fill)
        d.text((x0 + 14, y0 + 28), t1, fill=text_col, font=F_BOX)
        d.text((x0 + 14, y0 + 52), t2, fill=sub_col, font=F_SMALL)

    # arrows between boxes
    gaps = [(178, 226), (376, 424), (574, 622), (772, 820)]
    cy = 128
    for i, (a, b) in enumerate(gaps):
        active = i < step
        arrow(d, a + 2, cy, b - 2, active)
        if active and i == step - 1:
            # traveling pulse near end of just-activated arrow
            t = 0.7
            x = int(a + (b - a) * t)
            pulse_dot(d, x, cy, t, True)

    d.text((28, 198), "Code: agents/ripple_ref_study.py | prompts in agents/llm_prompts.py", fill=MUTED, font=F_FOOT)
    # progress bar
    bar_w = int(1040 * ((step + 1) / 5))
    d.rounded_rectangle((28, 220, 1068, 228), radius=4, fill=(220, 220, 220))
    d.rounded_rectangle((28, 220, 28 + bar_w, 228), radius=4, fill=GOLD)
    return img


def draw_ma_frame(step: int, loop_phase: int = 0) -> Image.Image:
    """
    steps: 0 context, 1 planner, 2 editor, 3 agent verify, 4 loop highlight, 5 shared verify
    loop_phase: 0 none, 1 showing revise arrow
    """
    H2 = 280
    img = Image.new("RGB", (W, H2), BG)
    d = ImageDraw.Draw(img)
    d.text((28, 18), "Multi-agent (P-MA / LangGraph)", fill=INK, font=F_TITLE)
    d.text((28, 44), "Specialized agents collaborate - may revise - then the same shared verifier", fill=SUB, font=F_SUB)

    boxes = [
        (28, 90, 158, 168, INK, "Context", "file / deps"),
        (206, 90, 336, 168, TEAL, "Planner", "strategy"),
        (384, 90, 514, 168, GREEN, "Editor", "rewrite Java"),
        (562, 90, 702, 168, TEAL, "Agent verify", "static / LLM"),
        (750, 90, 1072, 168, GOLD, "Shared L1-L5 verify (same as B0)", "apply-and-verify / reports"),
    ]

    # map logical step to which boxes are lit
    # 0: ctx, 1: +planner, 2: +editor, 3: +agent verify, 4: loop (editor+verify), 5: +final
    lit = {
        0: {0},
        1: {0, 1},
        2: {0, 1, 2},
        3: {0, 1, 2, 3},
        4: {0, 1, 2, 3},  # loop
        5: {0, 1, 2, 3, 4},
    }[step]

    for i, (x0, y0, x1, y1, col, t1, t2) in enumerate(boxes):
        active = i in lit
        fill = dim(col, active)
        text_col = LIGHT if fill[0] < 200 else INK
        sub_col = MUTED if fill[0] < 200 else (63, 63, 70)
        if col == GOLD and active:
            text_col, sub_col = INK, (63, 63, 70)
        # during loop, pulse editor+verify
        if step == 4 and i in (2, 3):
            fill = col
            text_col, sub_col = (LIGHT if col != GOLD else INK), MUTED
        rounded(d, (x0, y0, x1, y1), fill)
        d.text((x0 + 14, y0 + 24), t1, fill=text_col, font=F_BOX)
        d.text((x0 + 14, y0 + 48), t2, fill=sub_col, font=F_SMALL)

    cy = 129
    gaps = [(158, 206), (336, 384), (514, 562), (702, 750)]
    for i, (a, b) in enumerate(gaps):
        need = i + 1
        active = step >= need if i < 3 else step >= 5
        if i == 3:
            active = step >= 5
        arrow(d, a + 2, cy, b - 2, active)

    # revise loop
    show_loop = step >= 4
    loop_col = GOLD if show_loop else (210, 210, 210)
    # path: from under agent verify back under editor
    d.line([(632, 168), (632, 198), (450, 198), (450, 168)], fill=loop_col, width=3)
    d.polygon([(450, 168), (443, 180), (457, 180)], fill=loop_col)
    d.text((470, 208), "revise if needed", fill=LOOP if show_loop else MUTED, font=F_SMALL)
    if step == 4:
        # moving pulse on loop
        xs = [632, 632, 450, 450]
        ys = [168, 198, 198, 172]
        # interpolate along polyline by loop_phase 0..11
        segs = [(xs[i], ys[i], xs[i + 1], ys[i + 1]) for i in range(3)]
        lengths = [((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5 for x0, y0, x1, y1 in segs]
        total = sum(lengths) or 1
        dist = (loop_phase / 12.0) * total
        acc = 0.0
        px, py = xs[0], ys[0]
        for (x0, y0, x1, y1), L in zip(segs, lengths):
            if dist <= acc + L:
                t = 0 if L == 0 else (dist - acc) / L
                px = int(x0 + (x1 - x0) * t)
                py = int(y0 + (y1 - y0) * t)
                break
            acc += L
        pulse_dot(d, px, py, 0.5, True)

    d.text((28, 236), "Code: agents/ma_ref_study.py | agents/refactor_graph.py | agents/refactor_nodes/", fill=MUTED, font=F_FOOT)
    bar_w = int(1040 * ((step + 1) / 6))
    d.rounded_rectangle((28, 258, 1068, 266), radius=4, fill=(220, 220, 220))
    d.rounded_rectangle((28, 258, 28 + bar_w, 266), radius=4, fill=GOLD)
    return img


def save_gif(frames: list[Image.Image], path: Path, duration: int = 450):
    frames[0].save(
        path,
        save_all=True,
        append_images=frames[1:],
        duration=duration,
        loop=0,
        optimize=False,
    )
    print("wrote", path, "frames", len(frames), "size", path.stat().st_size)


def main():
    # Single-prompt: hold each stage, then pause at end
    sp_frames = []
    for step in range(5):
        for _ in range(3):  # hold
            sp_frames.append(draw_sp_frame(step, 5))
    for _ in range(4):
        sp_frames.append(draw_sp_frame(4, 5))
    save_gif(sp_frames, OUT / "flow-single-prompt.gif", duration=280)

    # Multi-agent
    ma_frames = []
    for step in range(4):
        for _ in range(3):
            ma_frames.append(draw_ma_frame(step))
    # loop animation
    for ph in range(12):
        ma_frames.append(draw_ma_frame(4, ph))
    for _ in range(5):
        ma_frames.append(draw_ma_frame(5))
    save_gif(ma_frames, OUT / "flow-multi-agent.gif", duration=220)

    # also a smaller architecture pulse gif? skip - user asked for these two


if __name__ == "__main__":
    main()
