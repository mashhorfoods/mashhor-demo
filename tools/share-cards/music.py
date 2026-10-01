#!/usr/bin/env python3
"""Four original soundtracks, one per service film, composed to the film's
timeline. Synthesised here (numpy + scipy), so they are ours outright.

    python3 tools/share-cards/music.py cues.json out.wav

cues.json is the film's CUES: style, bpm, duration, and the moments the music
follows. Every style reads the same keys:

    groove      [start, end]: the beat plays between these
    breaks      [[a, b], ...]: the beat drops out (the music breathes)
    hits        [t, ...]: a big accent on a cut (impact, flash)
    accents     [[t, kind], ...]: a small sound for something on screen
                (kind: note, pop, blip, tick, flip, beep, swipe, glitch, chime)
    whooshes    [[t, dur], ...]: a filtered sweep into a move
    risers      [[t, dur], ...]: a rising sweep into a moment
    outro       t: the closing chord, held to the end

and a style decides how the band plays:

    branding    100 BPM, D major: marimba arpeggios, plucked bass, rim and
                shaker, soft kick; warm room reverb. Crafted, light, precise.
    websites    128 BPM, E minor: synthwave/electro; four-on-the-floor,
                gated snare, octave bass, a sixteenth-note saw arpeggio.
    intro       120 BPM, D major: the short intro. Pixora's five-note
                signature on the wordmark; a bar per service on that
                service film's instrument; all four together at the end.
    social      96 BPM, F major: bouncy pop; swung hats, finger snaps,
                off-beat pluck chords, sub bass locked to the kick.
    ads         140 BPM half-time, F minor: trap; 808 with glides, rolling
                hats, a clap on three, a dark pad.

44.1 kHz stereo, peak-normalised and softly limited (reel.mjs then sets the
loudness to -14 LUFS).
"""
import json
import sys
import wave

import numpy as np
from scipy.signal import fftconvolve, lfilter

SR = 44100
rng = np.random.default_rng(11)


# ---------------------------------------------------------------------------
# Building blocks.

def tt(n):
    return np.arange(n) / SR


def env(n, attack, decay):
    t = tt(n)
    return np.clip(t / max(attack, 1e-4), 0, 1) * np.exp(-t * decay)


def lp(x, cutoff):
    """One-pole low-pass; cutoff a number or an array (a sweep, done in blocks)."""
    if np.isscalar(cutoff):
        a = np.exp(-2 * np.pi * cutoff / SR)
        return lfilter([1 - a], [1, -a], x)
    cutoff = np.asarray(cutoff, dtype=float) * np.ones(len(x))
    y = np.zeros_like(x)
    zi = np.zeros(1)
    for i in range(0, len(x), 256):
        a = np.exp(-2 * np.pi * cutoff[i] / SR)
        y[i:i + 256], zi = lfilter([1 - a], [1, -a], x[i:i + 256], zi=zi * 1)
    return y


def hp(x, cutoff):
    return x - lp(x, cutoff)


def bp(x, lo, hi):
    return lp(hp(x, lo), hi)


def noise(n):
    return rng.standard_normal(n)


def place(track, sound, at, gain=1.0):
    i = int(round(at * SR))
    if i >= len(track) or i + len(sound) <= 0:
        return
    s = sound
    if i < 0:
        s, i = s[-i:], 0
    n = min(len(s), len(track) - i)
    track[i:i + n] += s[:n] * gain


def saw(f, n, detune=0.0):
    t = tt(n)
    return 2 * ((t * f * (1 + detune)) % 1) - 1


def pulse(f, n, width=0.5):
    t = tt(n)
    return np.where((t * f) % 1 < width, 1.0, -1.0)


def note(name):
    """'A4' → Hz."""
    names = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6,
             'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}
    k, o = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((names[k] + 12 * (o + 1) - 69) / 12)


def room(x, size=1.6, mix=0.25, bright=4000):
    """A small synthetic room: decaying filtered noise as the impulse."""
    n = int(size * SR)
    ir = lp(noise(n), bright) * np.exp(-tt(n) * 6.5 / size)
    ir[:int(0.012 * SR)] = 0
    ir /= np.sqrt(np.sum(ir ** 2)) + 1e-9
    wet = fftconvolve(x, ir)[:len(x)]
    return x * (1 - mix) + wet * mix


# ---- drums ----------------------------------------------------------------

def kick(kind='house'):
    if kind == 'soft':
        n = int(0.3 * SR); t = tt(n)
        f = 50 + 70 * np.exp(-t * 30)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11) * 0.9
    if kind == '808':
        n = int(0.25 * SR); t = tt(n)
        f = 55 + 140 * np.exp(-t * 40)
        return np.tanh(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14) * 2) * 0.9 + noise(n) * np.exp(-t * 400) * 0.2
    n = int(0.35 * SR); t = tt(n)
    f = 45 + 110 * np.exp(-t * 28)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)
    return np.tanh((body + noise(n) * np.exp(-t * 300) * 0.3) * 1.6)


def snare(gated=False):
    n = int(0.3 * SR); t = tt(n)
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 25) * 0.6
    sn = hp(noise(n), 1500) * (np.where(t < 0.16, 1, np.exp(-(t - 0.16) * 80)) * 0.55 if gated else np.exp(-t * 22))
    return (body + sn) * 0.7


def clap():
    n = int(0.25 * SR); t = tt(n)
    e = sum(env(n, 0.001, 38) * (t >= d) for d in (0, 0.011, 0.022))
    return bp(noise(n), 900, 5000) * e * 0.7


def snap():
    n = int(0.12 * SR); t = tt(n)
    return (bp(noise(n), 1800, 7000) * np.exp(-t * 60) + np.sin(2 * np.pi * 1400 * t) * np.exp(-t * 90) * 0.4) * 0.8


def rim():
    n = int(0.08 * SR); t = tt(n)
    return (np.sin(2 * np.pi * 1700 * t) * np.exp(-t * 70) + np.sin(2 * np.pi * 820 * t) * np.exp(-t * 90) * 0.5
            + hp(noise(n), 3000) * np.exp(-t * 200) * 0.3) * 0.6


def hat(open_=False):
    n = int((0.2 if open_ else 0.05) * SR)
    return hp(noise(n), 7500) * env(n, 0.0005, 15 if open_ else 75) * 0.4


def shaker():
    n = int(0.09 * SR); t = tt(n)
    e = np.sin(np.pi * np.clip(t / 0.09, 0, 1)) ** 2
    return bp(noise(n), 5000, 11000) * e * 0.3


# ---- tuned ----------------------------------------------------------------

def marimba(f, dur=0.9):
    n = int(dur * SR); t = tt(n)
    x = (np.sin(2 * np.pi * f * t) * np.exp(-t * 5)
         + np.sin(2 * np.pi * f * 3.93 * t) * np.exp(-t * 18) * 0.35
         + np.sin(2 * np.pi * f * 9.2 * t) * np.exp(-t * 45) * 0.12)
    return x * np.clip(t / 0.002, 0, 1) * 0.6


def pluck(f, dur=1.0, bright=0.5):
    """Karplus–Strong, a block of one period at a time."""
    n = int(dur * SR)
    p = max(2, int(SR / f))
    buf = lp(noise(p), 2000 + 8000 * bright)
    out = np.zeros(n + p)
    out[:p] = buf
    k = p
    while k < n + p:
        seg = out[k - p:k]
        nxt = 0.5 * (seg + np.roll(seg, 1)) * 0.996
        nxt[0] = 0.5 * (seg[0] + out[k - p - 1 if k - p - 1 >= 0 else 0]) * 0.996
        m = min(p, n + p - k)
        out[k:k + m] = nxt[:m]
        k += p
    return out[:n] * 0.6


def bell(f, dur=1.6):
    """FM bell."""
    n = int(dur * SR); t = tt(n)
    mod = np.sin(2 * np.pi * f * 3.5 * t) * 2.2 * np.exp(-t * 3)
    return np.sin(2 * np.pi * f * t + mod) * np.exp(-t * 3) * np.clip(t / 0.003, 0, 1) * 0.45


def synth(f, dur, cutoff=1800, decay=4.0, voices=3, kind='saw'):
    n = int(dur * SR)
    if kind == 'saw':
        x = sum(saw(f, n, d) for d in np.linspace(-0.006, 0.006, voices)) / voices
    else:
        x = pulse(f, n, 0.35)
    e = env(n, 0.004, decay)
    return lp(x, cutoff * (0.4 + 0.6 * e)) * e


def pad(freqs, dur, cutoff=1400, attack=0.4):
    n = int(dur * SR); t = tt(n)
    x = sum(saw(f, n, d) for f in freqs for d in (-0.005, 0, 0.005)) / (3 * len(freqs))
    e = np.clip(t / attack, 0, 1) * np.clip((dur - t) / 0.4, 0, 1)
    return lp(x, cutoff) * e


def sub(f, dur, glide_from=None):
    n = int(dur * SR); t = tt(n)
    if glide_from:
        g = np.clip(t / 0.08, 0, 1)
        f = glide_from + (f - glide_from) * g
    ph = 2 * np.pi * np.cumsum(np.ones(n) * f) / SR
    e = np.clip(t / 0.005, 0, 1) * np.clip((dur - t) / 0.05, 0, 1)
    return np.tanh(np.sin(ph) * 1.8) * e * 0.8


# ---- effects ----------------------------------------------------------------

def impact():
    n = int(1.6 * SR); t = tt(n)
    s = np.sin(2 * np.pi * np.cumsum(30 + 70 * np.exp(-t * 6)) / SR) * np.exp(-t * 2.2)
    burst = lp(noise(n), 2500 * np.exp(-t * 3) + 120) * np.exp(-t * 5) * 1.4
    return np.tanh((s * 1.3 + burst) * 1.2)


def whoosh(dur):
    n = int(dur * SR); x = tt(n) / dur
    return lp(noise(n), 300 + 9000 * x ** 2) * np.sin(np.pi * np.clip(x, 0, 1)) ** 1.5 * 1.3


def riser(dur):
    n = int(dur * SR); x = tt(n) / dur
    nz = lp(noise(n), 200 + 8000 * x ** 2) * x ** 2
    tone = np.sin(2 * np.pi * np.cumsum(220 + 660 * x ** 2) / SR) * x ** 3 * 0.25
    return (nz + tone) * 0.9


def pop():
    n = int(0.09 * SR); t = tt(n)
    f = 350 + 1300 * np.clip(t / 0.03, 0, 1)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 45) * 0.7


def blip(f=2200):
    n = int(0.05 * SR); t = tt(n)
    return np.sign(np.sin(2 * np.pi * f * t)) * np.exp(-t * 80) * 0.18


def beep():
    n = int(0.22 * SR); t = tt(n)
    on = ((t < 0.07) | ((t > 0.11) & (t < 0.18))).astype(float)
    return np.sin(2 * np.pi * 1760 * t) * lp(on, 300) * 0.35


def tick():
    n = int(0.06 * SR); t = tt(n)
    return (hp(noise(n), 3000) * np.exp(-t * 90) + np.sin(2 * np.pi * 2400 * t) * np.exp(-t * 120) * 0.3) * 0.5


def glitch():
    n = int(0.18 * SR); t = tt(n)
    x = np.repeat(noise(n // 40 + 1), 40)[:n]                # sample-and-hold: crunchy
    gate = (np.floor(t / 0.03) % 2 == 0).astype(float)
    return hp(x, 400) * gate * np.exp(-t * 10) * 0.35


def swipe():
    return whoosh(0.22) * 0.8


def flip():
    n = int(0.12 * SR); t = tt(n)
    return bp(noise(n), 1500, 6000) * np.exp(-t * 35) * 0.6


def revcym(dur):
    n = int(dur * SR); x = tt(n) / dur
    return hp(noise(n), 4000) * x ** 3 * 0.5


# ---------------------------------------------------------------------------
# The styles. Each returns (drums, bass, music, fx) as arrays.

def grid(c, beat):
    """Beat times in the groove, minus the breaks: [(t, beat index)]."""
    g0, g1 = c['groove']
    br = [tuple(b) for b in c.get('breaks', [])]
    out, t, k = [], g0, 0
    while t < g1 - 1e-6:
        if not any(a <= t < b for a, b in br):
            out.append((t, k))
        t += beat
        k += 1
    return out


def in_groove(c, t):
    g0, g1 = c['groove']
    return g0 <= t < g1 and not any(a <= t < b for a, b in c.get('breaks', []))


def branding(c, n):
    beat = 60 / c['bpm']
    drums, bass, music, fx = (np.zeros(n) for _ in range(4))
    # D – Bm – G – A, a bar (four beats) each.
    prog = [['D', 'F#', 'A'], ['B', 'D', 'F#'], ['G', 'B', 'D'], ['A', 'C#', 'E']]
    roots = ['D2', 'B1', 'G1', 'A1']
    g0 = c['groove'][0]
    for t, k in grid(c, beat):
        bar = int((t - g0) / (4 * beat)) % 4
        if k % 2 == 0:
            place(drums, kick('soft'), t, 0.8)
        if k % 4 in (1, 3):
            place(drums, rim(), t, 0.55)
        for s in range(4):
            place(drums, shaker(), t + s * beat / 4, 0.5 if s % 2 else 0.3)
        # Plucked bass: root on the beat, octave on the "and" of 2 and 4.
        place(bass, pluck(note(roots[bar]) * 2, 0.6, 0.2), t, 0.9)
        if k % 2 == 1:
            place(bass, pluck(note(roots[bar]) * 4, 0.35, 0.3), t + beat / 2, 0.5)
        # Marimba: a rising-falling arpeggio in sixteenths.
        tones = [note(x + '4') for x in prog[bar]] + [note(prog[bar][0] + '5')]
        pattern = [0, 1, 2, 3, 2, 1, 2, 3][k % 2 * 4:(k % 2) * 4 + 4]
        for s, idx in enumerate(pattern):
            place(music, marimba(tones[idx], 0.5), t + s * beat / 4, 0.45 if s == 0 else 0.3)
    return drums, bass, music, fx


def websites(c, n):
    beat = 60 / c['bpm']
    drums, bass, music, fx = (np.zeros(n) for _ in range(4))
    # Em – C – G – D.
    prog = [['E', 'G', 'B'], ['C', 'E', 'G'], ['G', 'B', 'D'], ['D', 'F#', 'A']]
    g0 = c['groove'][0]
    duck = np.ones(n)
    for t, k in grid(c, beat):
        bar = int((t - g0) / (4 * beat)) % 4
        place(drums, kick('house'), t, 0.85)
        i0 = int(t * SR); m = min(int(0.2 * SR), n - i0)
        if m > 0:
            duck[i0:i0 + m] = np.minimum(duck[i0:i0 + m], 0.3 + 0.7 * np.linspace(0, 1, m) ** 0.6)
        if k % 2 == 1:
            place(drums, snare(gated=True), t, 0.6)
        place(drums, hat(open_=True), t + beat / 2, 0.5)
        place(drums, hat(), t + beat / 4, 0.3)
        place(drums, hat(), t + 3 * beat / 4, 0.3)
        root = note(prog[bar][0] + '2')
        for s in range(2):                                    # octave bass in eighths
            place(bass, synth(root * (2 if s else 1), beat / 2, 900, 9), t + s * beat / 2, 0.6)
        tones = [note(x + '4') for x in prog[bar]] + [note(prog[bar][0] + '5')]
        for s in range(4):                                    # the arp, sixteenths
            place(music, synth(tones[(k * 4 + s) % 4], beat / 4 * 1.6, 2600, 14, kind='pulse' if s % 2 else 'saw'),
                  t + s * beat / 4, 0.3)
    bass *= duck
    music *= 0.6 + 0.4 * duck
    return drums, bass, music, fx


def social(c, n):
    beat = 60 / c['bpm']
    drums, bass, music, fx = (np.zeros(n) for _ in range(4))
    # F – Dm – Bb – C.
    prog = [['F', 'A', 'C'], ['D', 'F', 'A'], ['Bb', 'D', 'F'], ['C', 'E', 'G']]
    roots = ['F1', 'D1', 'Bb1', 'C2']
    g0 = c['groove'][0]
    sw = beat / 2 * 0.16                                      # swing
    for t, k in grid(c, beat):
        bar = int((t - g0) / (4 * beat)) % 4
        kb = k % 4
        # Bounce: kick on 1, the "and" of 2 and on 3; snaps on 2 and 4.
        kicks = {0: [0], 1: [0.5], 2: [0], 3: [0.75]}[kb]
        for o in kicks:
            place(drums, kick('808'), t + o * beat, 0.8)
            place(bass, sub(note(roots[bar]) * 2, beat * 0.45), t + o * beat, 0.55)
        if kb in (1, 3):
            place(drums, snap(), t, 0.75)
            place(drums, clap(), t, 0.3)
        place(drums, hat(), t, 0.3)
        place(drums, hat(), t + beat / 2 + sw, 0.45)
        # Off-beat pluck chords.
        for f in prog[bar]:
            place(music, pluck(note(f + '4'), 0.4, 0.8), t + beat / 2 + sw, 0.28)
        if kb == 3:
            place(music, bell(note(prog[bar][2] + '5'), 0.8), t + beat / 2 + sw, 0.12)
    return drums, bass, music, fx


def ads(c, n):
    beat = 60 / c['bpm']
    drums, bass, music, fx = (np.zeros(n) for _ in range(4))
    # Fm – Db – Eb – C, two bars each in half time.
    prog = [['F', 'Ab', 'C'], ['Db', 'F', 'Ab'], ['Eb', 'G', 'Bb'], ['C', 'E', 'G']]
    roots = ['F1', 'Db1', 'Eb1', 'C1']
    g0 = c['groove'][0]
    last_root = None
    for t, k in grid(c, beat):
        bar = int((t - g0) / (8 * beat)) % 4
        kb = k % 8                                            # an 8-beat half-time bar
        if kb in (0, 5):
            place(drums, kick('808'), t, 0.9)
        if kb == 3 and k % 16 == 11:
            place(drums, kick('808'), t + beat / 2, 0.7)
        if kb in (4,):
            place(drums, clap(), t, 0.85)
            place(drums, snare(), t, 0.4)
        # Hats: eighths, a triplet roll at the end of every other bar.
        if kb == 7 and k % 16 == 15:
            for s in range(6):
                place(drums, hat(), t + s * beat / 6, 0.35 + 0.04 * s)
        else:
            place(drums, hat(), t, 0.35)
            place(drums, hat(), t + beat / 2, 0.25)
        # 808 bass: long notes on the kicks, gliding into new roots.
        if kb in (0, 5):
            r = note(roots[bar])
            r = r * 2 if r < 40 else r
            place(bass, sub(r, beat * (2.6 if kb == 0 else 1.4), glide_from=last_root if last_root and last_root != r else None), t, 0.85)
            last_root = r
        if kb == 0:
            place(music, pad([note(x + '3') for x in prog[bar]], beat * 8, 900, 0.3), t, 0.4)
            place(music, bell(note(prog[bar][0] + '5'), 1.2), t + beat * 3.5, 0.1)
    return drums, bass, music, fx


MOTIF = ['D5', 'E5', 'F#5', 'A5', 'B5']                       # the sonic logo: P I O R A, rising


def logo(at, fx, music, drums, bass, gain=1.0):
    """Pixora's sonic signature: five quick rising notes (bell over pluck), a
    breath, then the X — a sub boom under a bright D chord."""
    for i, nm in enumerate(MOTIF):
        t = at + i * 0.07
        place(music, bell(note(nm), 1.0), t, 0.32 * gain)
        place(music, pluck(note(nm), 0.6, 0.9), t, 0.25 * gain)
    x = at + 0.6
    place(fx, revcym(0.45), x - 0.45, 0.35 * gain)
    place(drums, kick('808'), x, 0.9 * gain)
    place(bass, sub(note('D2'), 1.4), x, 0.7 * gain)
    for f in ('D4', 'F#4', 'A4', 'D5'):
        place(music, synth(note(f), 1.6, 3200, 2.2), x, 0.22 * gain)
        place(music, bell(note(f) * 2, 1.4), x, 0.08 * gain)


def intro(c, n):
    """One team, four disciplines. The signature; the promise in three hits;
    then one bar per service, each played on that service film's instrument
    (marimba, synth arp, plucks and snaps, 808 and bell) over one beat; at the
    invitation all four together; the signature again to sign off."""
    beat = 60 / c['bpm']
    drums, bass, music, fx = (np.zeros(n) for _ in range(4))
    logo(c['logo'][0], fx, music, drums, bass)
    # The promise: a hit per line, the last one lifts.
    for (at, ch), g in zip(c['promise'], (0.7, 0.8, 1.0)):
        place(drums, kick('house'), at, 0.8 * g)
        place(drums, clap(), at, 0.4 * g)
        for f in ch:
            place(music, synth(note(f), 0.5, 2400, 7), at, 0.2 * g)
        place(bass, sub(note(ch[0][:-1] + '2'), 0.45), at, 0.6 * g)
    # A snare roll into the drop.
    r0 = c['drop'] - 1.0
    for i in range(16):
        place(drums, snare(), r0 + i / 16, 0.12 + 0.03 * i)
    # The services: D – A – Bm – G, a bar each.
    prog = [['D', 'F#', 'A'], ['A', 'C#', 'E'], ['B', 'D', 'F#'], ['G', 'B', 'D']]
    roots = ['D2', 'A1', 'B1', 'G1']
    g0, g1 = c['groove']
    duck = np.ones(n)

    def band(t, k, bar, layers, full=1.0):
        kb = k % 4
        place(drums, kick('house'), t, 0.85 * full)
        i0 = int(t * SR); m = min(int(0.2 * SR), n - i0)
        if m > 0:
            duck[i0:i0 + m] = np.minimum(duck[i0:i0 + m], 0.35 + 0.65 * np.linspace(0, 1, m) ** 0.6)
        if kb in (1, 3):
            place(drums, clap(), t, 0.6 * full)
        place(drums, hat(open_=kb == 3), t + beat / 2, 0.45)
        place(drums, hat(), t + beat / 4, 0.25)
        place(drums, hat(), t + 3 * beat / 4, 0.25)
        root = note(roots[bar])
        for s in range(2):
            place(bass, synth(root * (2 if s else 1), beat / 2, 800, 8), t + s * beat / 2, 0.55)
        tones = [note(x + '4') for x in prog[bar]] + [note(prog[bar][0] + '5')]
        if 'marimba' in layers:
            for s, idx in enumerate([0, 1, 2, 3] if kb % 2 == 0 else [3, 2, 1, 2]):
                place(music, marimba(tones[idx], 0.5), t + s * beat / 4, 0.32)
        if 'arp' in layers:
            for s in range(4):
                place(music, synth(tones[(kb * 4 + s) % 4] * 2, beat / 4 * 1.5, 2800, 14, kind='pulse' if s % 2 else 'saw'), t + s * beat / 4, 0.18)
        if 'pluck' in layers:
            for f in prog[bar]:
                place(music, pluck(note(f + '4'), 0.4, 0.8), t + beat / 2, 0.2)
            if kb in (1, 3):
                place(drums, snap(), t, 0.5)
        if 'trap' in layers:
            if kb == 0:
                place(bass, sub(root * 2, beat * 1.8, glide_from=root * 2.5), t, 0.5)
                place(music, bell(tones[3] * 2, 1.0), t + beat * 1.5, 0.14)
            if kb == 3:
                for s in range(6):
                    place(drums, hat(), t + s * beat / 6, 0.3)

    LAYERS = [['marimba'], ['arp'], ['pluck'], ['trap']]
    t, k = g0, 0
    while t < g1 - 1e-6:
        bar = int((t - g0) / (4 * beat))
        band(t, k, bar % 4, LAYERS[bar % 4] + (['marimba'] if bar % 4 else []))
        t += beat
        k += 1
    # The invitation: all four together, lighter drums, under the sign-off.
    t, k = g1, 0
    end = c['logo'][1] + 0.6
    while t < end - 1e-6:
        band(t, k, (k // 4) % 4, ['marimba', 'arp', 'pluck'], 0.7)
        t += beat
        k += 1
    bass *= duck
    logo(c['logo'][1], fx, music, drums, bass, 1.1)
    return drums, bass, music, fx


STYLES = {'branding': branding, 'websites': websites, 'social': social, 'ads': ads, 'intro': intro}
CHORDS = {'intro': ['D3', 'A3', 'D4', 'F#4', 'A4'], 'branding': ['D3', 'F#3', 'A3', 'D4', 'E4'], 'websites': ['E3', 'G3', 'B3', 'D4', 'F#4'],
          'social': ['F3', 'A3', 'C4', 'E4', 'G4'], 'ads': ['F2', 'C3', 'Ab3', 'C4', 'Eb4']}
NOTE = {'intro': lambda i: bell(note(MOTIF[i % 5]), 0.8), 'branding': lambda i: marimba(note(['D5', 'E5', 'F#5', 'A5', 'B5', 'D6'][i % 6]), 0.8),
        'websites': lambda i: synth(note(['E5', 'G5', 'B5', 'D6'][i % 4]), 0.3, 3000, 10),
        'social': lambda i: bell(note(['C6', 'A5', 'F5', 'G5'][i % 4]), 0.8),
        'ads': lambda i: bell(note(['C5', 'Eb5', 'F5', 'Ab5'][i % 4]), 0.8)}


def main(cues_path, out_path):
    c = json.load(open(cues_path))
    style = c['style']
    total = c['duration'] + 0.5
    n = int(total * SR)
    drums, bass, music, fx = STYLES[style](c, n)
    # The film's own moments.
    for i, (at, kind) in enumerate(c.get('accents', [])):
        s = {'note': lambda: NOTE[style](i), 'pop': pop, 'blip': lambda: blip(1800 + 400 * (i % 3)), 'tick': tick,
             'flip': flip, 'beep': beep, 'swipe': swipe, 'glitch': glitch,
             'chime': lambda: bell(note(CHORDS[style][-1].replace('4', '5')), 1.6),
             'rim': rim, 'snap': snap}[kind]()
        place(fx, s, at, 0.7)
    for at in c.get('hits', []):
        place(fx, impact(), at, 0.8)
        place(drums, kick('house' if style == 'websites' else '808' if style in ('ads', 'social') else 'soft'), at, 0.8)
    for at, dur in c.get('whooshes', []):
        place(fx, whoosh(dur + 0.15), at - 0.05, 0.5)
    for at, dur in c.get('risers', []):
        place(fx, riser(dur), at, 0.4)
        place(fx, revcym(dur), at, 0.3)
    outro = c.get('outro', c['duration'] - 2)
    place(music, pad([note(x) for x in CHORDS[style]], c['duration'] - outro + 0.5, 2200, 0.05), outro, 0.55)
    for i, x in enumerate(CHORDS[style][1:]):                 # a strum into the end chord
        place(music, pluck(note(x) * 2, 2.0, 0.6) if style != 'branding' else marimba(note(x) * 2, 1.5), outro + i * 0.04, 0.35)

    rev = {'intro': (1.6, 0.24), 'branding': (1.8, 0.3), 'websites': (1.2, 0.18), 'social': (0.9, 0.15), 'ads': (2.2, 0.22)}[style]
    music = room(music, *rev)
    fx = room(fx, 1.0, 0.15)
    mix = drums * 0.8 + bass * 0.9 + music * 0.75 + fx * 0.75
    left = mix + 0.1 * np.roll(music + fx, 300) + 0.05 * np.roll(drums, 180)
    right = mix + 0.1 * np.roll(music + fx, -300) + 0.05 * np.roll(drums, -180)
    stereo = np.stack([left, right], axis=1)
    fi = int(0.02 * SR)
    stereo[:fi] *= np.linspace(0, 1, fi)[:, None]
    fade = int(0.7 * SR)
    stereo[-fade:] *= np.linspace(1, 0, fade)[:, None]
    stereo /= np.max(np.abs(stereo)) + 1e-9
    stereo = np.tanh(stereo * 1.4) / np.tanh(1.4) * 0.95
    with wave.open(out_path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((stereo * 32767).astype('<i2').tobytes())


if __name__ == '__main__':
    main(*sys.argv[1:3])
