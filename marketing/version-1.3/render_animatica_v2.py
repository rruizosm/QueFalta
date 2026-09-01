#!/usr/bin/env python3
"""Renderiza la animática 1.2.1 -> 1.3 desde los assets separados."""

from __future__ import annotations

import argparse
import math
import os
import random
import shutil
import struct
import subprocess
import tempfile
import wave
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter


WIDTH = 1080
HEIGHT = 1920
PAD = 28
CANVAS = (WIDTH + PAD * 2, HEIGHT + PAD * 2)
FPS = 30
DURATION = 6.0


def clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(upper, value))


def smoothstep(value: float) -> float:
    value = clamp(value)
    return value * value * (3.0 - 2.0 * value)


def interval(value: float, start: float, end: float) -> float:
    return smoothstep((value - start) / (end - start))


def load_rgba(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    return image.crop(bbox) if bbox else image


def cover(image: Image.Image, size: tuple[int, int], zoom: float = 1.0) -> Image.Image:
    source = image.convert("RGB")
    scale = max(size[0] / source.width, size[1] / source.height) * zoom
    resized = source.resize(
        (round(source.width * scale), round(source.height * scale)),
        Image.Resampling.LANCZOS,
    )
    left = (resized.width - size[0]) // 2
    top = (resized.height - size[1]) // 2
    return resized.crop((left, top, left + size[0], top + size[1])).convert("RGBA")


def with_opacity(image: Image.Image, opacity: float) -> Image.Image:
    if opacity >= 0.999:
        return image
    result = image.copy()
    result.putalpha(result.getchannel("A").point(lambda value: round(value * opacity)))
    return result


def transformed(image: Image.Image, target_height: int, angle: float = 0.0) -> Image.Image:
    scale = target_height / image.height
    resized = image.resize(
        (max(1, round(image.width * scale)), target_height), Image.Resampling.LANCZOS
    )
    if abs(angle) < 0.01:
        return resized
    return resized.rotate(
        angle,
        resample=Image.Resampling.BICUBIC,
        expand=True,
        fillcolor=(0, 0, 0, 0),
    )


def paste_bottom_center(
    canvas: Image.Image,
    image: Image.Image,
    center_x: float,
    baseline: float,
    target_height: int,
    angle: float = 0.0,
    opacity: float = 1.0,
) -> tuple[int, int, int, int]:
    item = with_opacity(transformed(image, target_height, angle), opacity)
    x = round(center_x + PAD - item.width / 2)
    y = round(baseline + PAD - item.height)
    canvas.alpha_composite(item, (x, y))
    return x, y, item.width, item.height


def add_shadow(
    canvas: Image.Image,
    center_x: float,
    baseline: float,
    width: float,
    height: float,
    opacity: int = 95,
) -> None:
    layer = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    x = center_x + PAD
    y = baseline + PAD
    draw.ellipse(
        (x - width / 2, y - height / 2, x + width / 2, y + height / 2),
        fill=(0, 0, 0, opacity),
    )
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(14)))


def draw_webs(canvas: Image.Image, pull: float) -> None:
    alpha = round(100 * (1.0 - interval(pull, 0.45, 0.9)))
    if alpha <= 0:
        return
    layer = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    color = (205, 211, 205, alpha)
    points = [
        ((205, 675), (360, 650)),
        ((495, 640), (680, 675)),
        ((500, 680), (705, 710)),
    ]
    for start, end in points:
        sx, sy = start[0] + PAD, start[1] + PAD
        ex, ey = end[0] + PAD, end[1] + PAD
        mid = ((sx + ex) / 2, (sy + ey) / 2 + 13)
        draw.line((sx, sy, mid[0], mid[1], ex, ey), fill=color, width=2)
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(0.35)))


def make_particles(seed: int = 121) -> list[dict[str, float]]:
    rng = random.Random(seed)
    particles: list[dict[str, float]] = []
    for origin_x, direction in ((365, -1), (775, 1)):
        for _ in range(78):
            particles.append(
                {
                    "birth": rng.uniform(2.25, 3.0),
                    "life": rng.uniform(0.45, 1.15),
                    "x": origin_x + rng.uniform(-55, 55),
                    "y": 1232 + rng.uniform(-12, 18),
                    "vx": direction * rng.uniform(35, 150) + rng.uniform(-35, 35),
                    "vy": rng.uniform(-260, -60),
                    "size": rng.uniform(2.0, 8.0),
                    "shade": rng.uniform(0.0, 1.0),
                }
            )
    return particles


def draw_particles(canvas: Image.Image, particles: list[dict[str, float]], t: float) -> None:
    layer = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for particle in particles:
        age = t - particle["birth"]
        if age < 0 or age > particle["life"]:
            continue
        progress = age / particle["life"]
        x = particle["x"] + particle["vx"] * age
        y = particle["y"] + particle["vy"] * age + 210 * age * age
        opacity = round(185 * (1.0 - progress) ** 1.6)
        shade = particle["shade"]
        color = (
            round(128 + 76 * shade),
            round(108 + 72 * shade),
            round(78 + 62 * shade),
            opacity,
        )
        radius = particle["size"] * (1.0 + progress * 0.8)
        draw.ellipse(
            (x + PAD - radius, y + PAD - radius, x + PAD + radius, y + PAD + radius),
            fill=color,
        )
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(1.8)))


def draw_sparkles(canvas: Image.Image, t: float) -> None:
    layer = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    sparkles = (
        (280, 650, 3.58),
        (520, 550, 3.76),
        (765, 630, 3.92),
        (390, 870, 4.18),
        (890, 820, 4.42),
        (620, 980, 4.72),
        (190, 900, 5.05),
    )
    for x, y, birth in sparkles:
        age = t - birth
        if age < 0 or age > 0.65:
            continue
        pulse = math.sin(math.pi * age / 0.65)
        radius = 5 + 18 * pulse
        alpha = round(220 * pulse)
        color = (255, 224, 137, alpha)
        draw.line((x - radius + PAD, y + PAD, x + radius + PAD, y + PAD), fill=color, width=3)
        draw.line((x + PAD, y - radius + PAD, x + PAD, y + radius + PAD), fill=color, width=3)
        draw.ellipse(
            (x - 4 + PAD, y - 4 + PAD, x + 4 + PAD, y + 4 + PAD),
            fill=(255, 255, 225, alpha),
        )
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(0.7)))


def synthesize_audio(path: Path, duration: float = DURATION, sample_rate: int = 48_000) -> None:
    total = round(duration * sample_rate)
    rng = random.Random(321)
    samples = [0.0] * total

    for index in range(total):
        t = index / sample_rate
        envelope = 0.55 + 0.45 * math.sin(2 * math.pi * 0.18 * t) ** 2
        samples[index] += envelope * (
            0.045 * math.sin(2 * math.pi * 48 * t)
            + 0.025 * math.sin(2 * math.pi * 73 * t)
        )

    def add_creak(start: float, length: float, base: float, amplitude: float) -> None:
        first = round(start * sample_rate)
        count = round(length * sample_rate)
        phase = 0.0
        for offset in range(count):
            index = first + offset
            if index >= total:
                break
            p = offset / count
            frequency = base * (1.0 + 0.45 * math.sin(math.pi * p))
            phase += 2 * math.pi * frequency / sample_rate
            grain = rng.uniform(-1.0, 1.0) * 0.16
            samples[index] += amplitude * math.sin(math.pi * p) * (math.sin(phase) + grain)

    add_creak(0.95, 0.62, 82, 0.12)
    add_creak(1.62, 0.58, 68, 0.14)
    add_creak(2.22, 0.78, 58, 0.17)

    break_start = round(2.88 * sample_rate)
    break_length = round(0.65 * sample_rate)
    for offset in range(break_length):
        index = break_start + offset
        if index >= total:
            break
        p = offset / break_length
        decay = math.exp(-6.2 * p)
        boom = math.sin(2 * math.pi * (72 - 28 * p) * offset / sample_rate)
        snap = rng.uniform(-1.0, 1.0) * math.exp(-22 * p)
        samples[index] += 0.30 * decay * boom + 0.34 * snap

    whoosh_start = round(3.06 * sample_rate)
    whoosh_length = round(0.52 * sample_rate)
    phase = 0.0
    for offset in range(whoosh_length):
        index = whoosh_start + offset
        if index >= total:
            break
        p = offset / whoosh_length
        phase += 2 * math.pi * (150 + 760 * p * p) / sample_rate
        samples[index] += 0.13 * math.sin(math.pi * p) * (
            math.sin(phase) + 0.32 * rng.uniform(-1.0, 1.0)
        )

    for start, frequency, amplitude in (
        (3.42, 523.25, 0.16),
        (3.48, 659.25, 0.14),
        (3.56, 783.99, 0.12),
        (4.35, 1046.50, 0.065),
        (4.78, 1318.51, 0.055),
    ):
        first = round(start * sample_rate)
        count = round(1.35 * sample_rate)
        for offset in range(count):
            index = first + offset
            if index >= total:
                break
            p = offset / count
            decay = math.exp(-5.0 * p)
            time = offset / sample_rate
            tone = math.sin(2 * math.pi * frequency * time)
            overtone = 0.35 * math.sin(2 * math.pi * frequency * 2.01 * time)
            samples[index] += amplitude * decay * (tone + overtone)

    peak = max(abs(sample) for sample in samples) or 1.0
    gain = min(0.92 / peak, 1.7)
    fade_samples = round(0.22 * sample_rate)
    with wave.open(str(path), "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        for index, sample in enumerate(samples):
            fade = 1.0
            if index < fade_samples:
                fade *= index / fade_samples
            if index > total - fade_samples:
                fade *= (total - index) / fade_samples
            value = math.tanh(sample * gain * 1.12) * fade
            left = round(32767 * value)
            right = round(32767 * value * (0.985 + 0.015 * math.sin(index * 0.00019)))
            output.writeframesraw(struct.pack("<hh", left, right))


def render_frame(
    t: float,
    background: Image.Image,
    reveal: Image.Image,
    assets: dict[str, Image.Image],
    particles: list[dict[str, float]],
) -> Image.Image:
    canvas = cover(background, CANVAS)
    baseline = 1240.0
    strain = interval(t, 0.72, 1.75)
    pull = interval(t, 1.92, 3.02)
    pose = interval(t, 1.08, 1.52)
    ladder_pose = interval(t, 1.68, 2.28)
    wobble = math.sin(t * 27.0) * strain * (1.0 - pull)

    digit_two_x = 440 - 9 * strain - 94 * pull
    digit_two_y = baseline - 30 * pull
    digit_two_angle = -1.7 * wobble - 10.5 * pull
    final_one_x = 716 + 7 * strain + 92 * pull
    final_one_y = baseline - 20 * pull
    final_one_angle = 1.35 * wobble + 11.5 * pull

    add_shadow(canvas, 145, baseline + 3, 185, 32)
    add_shadow(canvas, digit_two_x, baseline + 3, 250, 40)
    add_shadow(canvas, final_one_x, baseline + 3, 185, 34)

    paste_bottom_center(canvas, assets["one"], 145, baseline, 645)

    motion = interval(t, 2.18, 2.86) * (1.0 - interval(t, 3.0, 3.18))
    for trail in range(3, 0, -1):
        opacity = motion * (0.035 + trail * 0.025)
        paste_bottom_center(
            canvas,
            assets["two"],
            digit_two_x + trail * 9,
            digit_two_y + trail * 2,
            655,
            digit_two_angle + trail * 0.65,
            opacity,
        )
    paste_bottom_center(
        canvas, assets["two"], digit_two_x, digit_two_y, 655, digit_two_angle
    )
    paste_bottom_center(canvas, assets["dot"], 608, baseline - 3, 82)

    for trail in range(3, 0, -1):
        opacity = motion * (0.035 + trail * 0.025)
        paste_bottom_center(
            canvas,
            assets["one"],
            final_one_x - trail * 8,
            final_one_y + trail * 2,
            645,
            final_one_angle - trail * 0.6,
            opacity,
        )
    paste_bottom_center(
        canvas,
        assets["one"],
        final_one_x,
        final_one_y,
        645,
        final_one_angle,
    )
    draw_webs(canvas, pull)

    banana_x = 168 - 13 * pull
    banana_y = baseline + 9 + math.sin(t * 10.0) * 3 * strain
    add_shadow(canvas, banana_x, baseline + 11, 160, 28, 80)
    paste_bottom_center(canvas, assets["banana_a"], banana_x, banana_y, 445, opacity=1 - pose)
    paste_bottom_center(canvas, assets["banana_b"], banana_x, banana_y, 445, opacity=pose)

    # El primer punto queda delante del pie del plátano para que 1.2.1 siga
    # leyéndose durante todo el tirón.
    paste_bottom_center(canvas, assets["dot"], 280, baseline - 5, 74)

    walk = interval(t, 0.25, 1.72)
    eggplant_x = 1260 - 286 * walk
    eggplant_y = baseline + 12 - abs(math.sin(t * 8.5)) * 9 * (1 - ladder_pose)
    add_shadow(canvas, min(eggplant_x, 970), baseline + 13, 180, 28, 74)
    paste_bottom_center(
        canvas,
        assets["eggplant_a"],
        eggplant_x,
        eggplant_y,
        400,
        opacity=1 - ladder_pose,
    )
    paste_bottom_center(
        canvas,
        assets["eggplant_b"],
        960,
        baseline + 12,
        410,
        opacity=ladder_pose,
    )

    tomato_x = 850 + 15 * pull
    tomato_y = baseline + 7 + math.sin(t * 11.0 + 1.4) * 3 * strain
    add_shadow(canvas, tomato_x, baseline + 10, 145, 24, 78)
    paste_bottom_center(canvas, assets["tomato_a"], tomato_x, tomato_y, 330, opacity=1 - pose)
    paste_bottom_center(canvas, assets["tomato_b"], tomato_x, tomato_y, 330, opacity=pose)

    draw_particles(canvas, particles, t)

    shake_strength = 7.0 * math.sin(math.pi * clamp((t - 2.55) / 0.68)) if 2.55 <= t <= 3.23 else 0.0
    shake_x = round(math.sin(t * 73) * shake_strength)
    shake_y = round(math.cos(t * 61) * shake_strength * 0.58)
    old = canvas.crop(
        (
            PAD + shake_x,
            PAD + shake_y,
            PAD + shake_x + WIDTH,
            PAD + shake_y + HEIGHT,
        )
    )

    reveal_progress = interval(t, 3.18, 3.56)
    reveal_zoom = 1.0 + 0.018 * interval(t, 3.45, DURATION)
    clean = cover(reveal, (WIDTH, HEIGHT), reveal_zoom)
    if reveal_progress > 0:
        old = Image.blend(old.convert("RGBA"), clean, reveal_progress)
    if t >= 3.38:
        draw_sparkles(old, t)

    flash = clamp(1.0 - abs(t - 3.27) / 0.22) * 0.82
    if flash > 0:
        white = Image.new("RGBA", (WIDTH, HEIGHT), (255, 252, 238, round(255 * flash)))
        old = Image.alpha_composite(old, white)

    fade_in = interval(t, 0.0, 0.22)
    fade_out = 1.0 - interval(t, 5.76, DURATION)
    brightness = fade_in * fade_out
    if brightness < 0.999:
        old = ImageEnhance.Brightness(old.convert("RGB")).enhance(brightness).convert("RGBA")
    return old.convert("RGB")


def resolve_ffmpeg(requested: str | None) -> str:
    if requested:
        return requested
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg  # type: ignore

        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError as error:
        raise SystemExit("No se encontró ffmpeg; usa --ffmpeg /ruta/al/binario") from error


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--ffmpeg")
    args = parser.parse_args()

    root = Path(__file__).resolve().parent
    asset_root = root / "assets"
    background = Image.open(asset_root / "escenario-vacio-v1.png").convert("RGB")
    reveal = Image.open(root / "keyframe-revelado-1.3-v1.png").convert("RGB")
    assets = {
        "one": load_rgba(asset_root / "digito-1-final-viejo-rgba-v2.png"),
        "two": load_rgba(asset_root / "digito-2-viejo-rgba-v2.png"),
        "dot": load_rgba(asset_root / "punto-viejo-rgba-v1.png"),
        "banana_a": load_rgba(asset_root / "platano-agarre-inicial-rgba-v3.png"),
        "banana_b": load_rgba(asset_root / "platano-tirando-2-rgba-v2.png"),
        "tomato_a": load_rgba(asset_root / "tomate-tirando-1-final-rgba-v2.png"),
        "tomato_b": load_rgba(asset_root / "tomate-arranque-1-rgba-v3.png"),
        "eggplant_a": load_rgba(asset_root / "berenjena-caminando-escalera-rgba-v2.png"),
        "eggplant_b": load_rgba(asset_root / "berenjena-plantando-escalera-rgba-v3.png"),
    }
    particles = make_particles()
    ffmpeg = resolve_ffmpeg(args.ffmpeg)
    args.out.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="quefalta-animatica-") as temp_dir:
        audio_path = Path(temp_dir) / "soundtrack.wav"
        synthesize_audio(audio_path)
        command = [
            ffmpeg,
            "-y",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-s",
            f"{WIDTH}x{HEIGHT}",
            "-r",
            str(FPS),
            "-i",
            "-",
            "-i",
            str(audio_path),
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-shortest",
            "-movflags",
            "+faststart",
            str(args.out),
        ]
        process = subprocess.Popen(command, stdin=subprocess.PIPE)
        assert process.stdin is not None
        frame_count = round(DURATION * FPS)
        for frame_index in range(frame_count):
            t = frame_index / FPS
            frame = render_frame(t, background, reveal, assets, particles)
            process.stdin.write(frame.tobytes())
            if frame_index % FPS == 0:
                print(f"Render {frame_index // FPS}/{round(DURATION)} s", flush=True)
        process.stdin.close()
        result = process.wait()
        if result != 0:
            raise SystemExit(result)

    print(f"Vídeo escrito en {args.out}")


if __name__ == "__main__":
    main()
