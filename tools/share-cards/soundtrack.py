#!/usr/bin/env python3
"""An original soundtrack for a promo video, composed to its timeline.

    python3 tools/share-cards/soundtrack.py cues.json out.wav

cues.json is the video's CUES (reel-energy.html): bpm, duration, impacts,
whooshes, ticks, riser, groove, breaks, roll, outro, hits, snaps. The track is synthesised here, so it is ours
outright: a four-on-the-floor groove in A minor (kick, clap, hats, a
side-chained saw bass) between the groove's start and end, a sub-drop and
burst on every impact, a filtered-noise sweep on every whoosh, a shutter tick
on every cut of the work, a rising sweep into the logo, and a held chord at
the end. 44.1 kHz stereo, peak-normalised and softly limited.
"""
import json
import sys
import wave

import numpy as np

SR = 44100
rng = np.random.default_rng(7)


def env(n, attack, decay):
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-t * decay)


def place(track, sound, at, gain=1.0):
    i = int(at * SR)
    if i >= len(track):
        return
    n = min(len(sound), len(track) - i)
    track[i:i + n] += sound[:n] * gain


def lowpass(x, cutoff):
    """One-pole low-pass; cutoff may be an array (a sweep)."""
    a = np.exp(-2 * np.pi * np.asarray(cutoff, dtype=float) / SR) * np.ones(len(x))
    y = np.zeros_like(x)
    prev = 0.0
    for i in range(len(x)):
        prev = (1 - a[i]) * x[i] + a[i] * prev
        y[i] = prev
    return y


def kick():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t * 28)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)
    click = rng.standard_normal(n) * np.exp(-t * 300) * 0.3
    return np.tanh((body + click) * 1.6)


def clap():
    n = int(0.25 * SR)
    noise = rng.standard_normal(n)
    hp = noise - lowpass(noise, 1200)
    e = np.zeros(n)
    for d in (0, 0.011, 0.022):  # three quick hands
        e += env(n, 0.001, 38) * (np.arange(n) >= d * SR)
    return hp * e * 0.6


def hat(open_=False):
    n = int((0.18 if open_ else 0.05) * SR)
    noise = rng.standard_normal(n)
    hp = noise - lowpass(noise, 7000)
    return hp * env(n, 0.0005, 18 if open_ else 70) * 0.35


def tick():
    n = int(0.06 * SR)
    noise = rng.standard_normal(n)
    hp = noise - lowpass(noise, 3000)
    t = np.arange(n) / SR
    return (hp * np.exp(-t * 90) + np.sin(2 * np.pi * 2400 * t) * np.exp(-t * 120) * 0.3) * 0.5


def impact():
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    sub = np.sin(2 * np.pi * np.cumsum(30 + 70 * np.exp(-t * 6)) / SR) * np.exp(-t * 2.2)
    burst = rng.standard_normal(n)
    burst = lowpass(burst, 2500 * np.exp(-t * 3) + 120) * np.exp(-t * 5) * 1.4
    return np.tanh((sub * 1.3 + burst) * 1.2)


def whoosh(dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = t / dur
    noise = rng.standard_normal(n)
    swept = lowpass(noise, 300 + 9000 * x ** 2)
    return swept * np.sin(np.pi * np.clip(x, 0, 1)) ** 1.5 * 1.3


def riser(dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = t / dur
    noise = lowpass(rng.standard_normal(n), 200 + 8000 * x ** 2) * x ** 2
    tone = np.sin(2 * np.pi * np.cumsum(220 + 660 * x ** 2) / SR) * x ** 3 * 0.25
    return (noise + tone) * 0.9


def saw(freq, n):
    t = np.arange(n) / SR
    return 2 * ((t * freq) % 1) - 1


def chord(freqs, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = sum(saw(f, n) + saw(f * 1.004, n) for f in freqs) / (2 * len(freqs))
    return lowpass(x, 1800) * np.minimum(1, t / 0.05) * np.exp(-t * 0.6)


def main(cues_path, out_path):
    c = json.load(open(cues_path))
    beat = 60 / c["bpm"]
    total = c["duration"] + 0.5
    n = int(total * SR)
    drums, bass, fx, music = (np.zeros(n) for _ in range(4))
    g0, g1 = c["groove"]
    impacts = c["impacts"]
    # Breaks: no groove from one beat before an impact pair to the next cut.
    breaks = [tuple(b) for b in c.get("breaks", [])]
    in_break = lambda t: any(a <= t < b for a, b in breaks)

    # Groove: kick on every beat, clap on 2 and 4, hats on the off-beats.
    t = g0
    k = 0
    while t < g1 - 1e-6:
        if not in_break(t):
            place(drums, kick(), t, 0.9)
            if k % 2 == 1:
                place(drums, clap(), t, 0.7)
            place(drums, hat(open_=(k % 4 == 3)), t + beat / 2, 0.8)
            place(drums, hat(), t + beat / 4, 0.35)
            place(drums, hat(), t + 3 * beat / 4, 0.35)
        t += beat
        k += 1
    # A roll into the logo.
    if "roll" in c:
        for i in range(16):
            place(drums, clap(), c["roll"] + i / 16, 0.15 + 0.03 * i)

    # Bass: A F C G, two beats each, eighth notes, side-chained to the kick.
    roots = [55.0, 43.65, 65.41, 49.0]
    step = beat / 2
    t = g0
    i = 0
    while t < g1 - 1e-6:
        if not in_break(t):
            f = roots[int((t - g0) / (2 * beat)) % 4] * (2 if i % 4 == 2 else 1)
            m = int(step * SR)
            note = lowpass(saw(f, m) + saw(f * 2, m) * 0.3, 900) * env(m, 0.003, 6)
            place(bass, note, t, 0.55)
        t += step
        i += 1
    duck = np.ones(n)
    t = g0
    while t < g1:
        if not in_break(t):
            i0 = int(t * SR)
            m = int(0.22 * SR)
            duck[i0:i0 + m] = np.minimum(duck[i0:i0 + m], 0.25 + 0.75 * np.linspace(0, 1, len(duck[i0:i0 + m])) ** 0.6)
        t += beat
    bass *= duck

    # Intro pad under the X (0.25–1.5s), the break's held note, and the end chord.
    place(music, chord([110, 130.81, 164.81], 1.5), 0.25, 0.35)
    place(music, chord([55, 110, 164.81], 1.5), 4.5, 0.35)
    outro = c.get("outro", c["duration"] - 1.5)
    place(music, chord([110, 130.81, 164.81, 220, 261.63], c["duration"] - outro + 0.5), outro, 0.5)
    for ti in impacts:
        place(fx, impact(), ti, 0.95)
    for at, dur in c["whooshes"]:
        place(fx, whoosh(dur + 0.15), at - 0.05, 0.55)
    for at in c["ticks"]:
        place(fx, tick(), at, 0.6)
    for at in c.get("hits", []):
        place(drums, kick(), at, 0.9)
        place(drums, clap(), at, 0.6)
    for i, at in enumerate(c.get("snaps", [])):
        place(fx, tick(), at, 0.9)
        place(drums, clap(), at, 0.25 + 0.05 * i)
    if c.get("snaps"):
        place(fx, riser(c["impacts"][3] - c["snaps"][0]), c["snaps"][0], 0.35)
    r0, rdur = c["riser"]
    place(fx, riser(rdur), r0, 0.45)
    place(fx, riser(0.25), 0.0, 0.5)  # into the first hit

    mix = drums * 0.8 + bass * 0.9 + music * 0.7 + fx * 0.75
    # A little width: the hats and fx a touch apart.
    left = mix + 0.08 * np.roll(fx + drums, 220)
    right = mix + 0.08 * np.roll(fx + drums, -220)
    stereo = np.stack([left, right], axis=1)
    fade = int(0.6 * SR)
    stereo[-fade:] *= np.linspace(1, 0, fade)[:, None]
    stereo /= np.max(np.abs(stereo)) + 1e-9
    stereo = np.tanh(stereo * 1.4) / np.tanh(1.4) * 0.95
    with wave.open(out_path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((stereo * 32767).astype("<i2").tobytes())


if __name__ == "__main__":
    main(*sys.argv[1:3])
