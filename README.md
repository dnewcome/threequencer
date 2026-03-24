# Threequencer

> A 3D voxel sequencer. Sixteen steps. Sixteen pitches. Sixteen layers. One cube.

Threequencer is an experimental browser-based musical sequencer built around a 16×16×16 cube of voxels rendered in WebGL. Rather than the flat grid of a traditional step sequencer, the third dimension opens up new ways to organize, layer, and trigger notes — from straightforward row-by-row patterns to diagonal plane sweeps that cut corner-to-corner through the whole structure.

It runs entirely in the browser. No install, no build step, no account.

---

## The Idea

A standard step sequencer is a 2D grid: time on one axis, pitch on the other. Threequencer adds a third axis — layers — and then asks: what happens when you don't just sweep left-to-right anymore?

The cube has three axes with distinct musical meanings:

```
      Y (pitch: low → high)
      │
      │   Z (layers: front → back)
      │  ╱
      │ ╱
      └──────── X (time: step 0 → 15)
```

- **X axis** — time. The sequencer sweeps a plane through the cube in the +X direction, one slice per clock tick. Each slice is one step.
- **Y axis** — pitch. A voxel's vertical position maps to a musical note. Higher = higher pitch.
- **Z axis** — layers. Multiple slices can be stacked in depth, sounding simultaneously or combined through mix rules.

At its most basic it behaves like 16 stacked step sequencers playing at once. At its most unhinged, a tilted plane sweeps through at an angle, intersecting a different set of voxels on every tick, producing rhythms that no flat grid could generate.

---

## Running It

Requires a local HTTP server (ES modules don't load over `file://`):

```bash
cd threequencer
python3 -m http.server 8080
```

Then open `http://localhost:8080` in a modern browser (Chrome or Firefox recommended for Web Audio timing).

All dependencies load from CDN — Three.js and Tone.js. No `npm install` needed.

---

## Controls

| Action | How |
|---|---|
| Toggle a voxel | Click it |
| Orbit the camera | Click and drag |
| Zoom | Scroll wheel |
| Play / Stop | ▶ Play button |
| BPM | Slider in the control bar |
| Synth voice | Dropdown: Synth, FM, AM, Membrane |
| Layer mix mode | Dropdown: OR, AND, First |

The demo pattern is pre-loaded so there's something to hear immediately on first play.

---

## Playback Modes

### Linear Sweep (current)

The default mode. A plane sweeps along the X axis one step at a time. Every active voxel in the current slice triggers its note. With 16 Y positions and 16 Z layers, each step can fire up to 256 notes simultaneously (in practice: a chord or two).

### Layer Mix Modes

When multiple Z layers are active at the same step, the mix mode determines what fires:

- **OR** — any active voxel fires. Layers stack additively. The richest mode.
- **AND** — only pitches that are active in *every* layer fire. Acts as a gate: layers must agree.
- **First** — only the front-most (lowest Z) layer with any active cells is heard. Layers become override/priority tracks.

Planned:
- **XOR** — parity across layers. Odd number of active cells on a pitch = fire, even = silent.
- **Weighted** — number of active layers on a pitch sets velocity. Dynamics from density.
- **Random** — each active cell fires with a set probability. Controlled chaos.

### Anarchy / Planar Sweep (planned)

Instead of sweeping a plane orthogonal to X, define an arbitrary plane by its normal vector and sweep it through the cube. A plane with normal `(1, 0, 0)` is the standard mode. A plane with normal `(1, 1, 1)` sweeps corner-to-corner diagonally, intersecting the cube over ~48 steps instead of 16. A plane with normal `(1, 0.3, 0.7)` hits everything at a weird angle that won't repeat cleanly against a standard bar.

Voxels fire when the sweeping plane crosses their center point. The step count and rhythm are determined by the geometry — not by a BPM subdivision.

Wobble the plane's normal with an LFO and the same pattern sounds different every loop.

### Multi-Plane / Polyrhythm Mode (planned)

Multiple independent planes sweeping simultaneously, each with its own speed, direction, and mix assignment. Two planes at coprime step counts produce true polyrhythm. Three planes at different angles produce textures that no human could program into a flat grid.

### Algorithmic Layer Selection (planned)

Rather than all layers playing at once, a control signal selects which layer (or layers) are active at a given moment:

- **LFO** — a slow sine wave sweeps through Z=0..15, playing one layer at a time in a rolling wave
- **MIDI velocity/aftertouch** — press harder on a keyboard to reach deeper layers
- **Envelope follower** — audio input amplitude drives depth

---

## Pitch Mapping

Y position 0–15 maps to a two-octave pentatonic major scale starting at C3:

```
C3  D3  E3  G3  A3  C4  D4  E4  G4  A4  C5  D5  E5  G5  A5  C6
 0   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15
```

Pentatonic was chosen because anything you draw sounds at least vaguely musical. Future plan: selectable scale, chromatic mode, or per-voxel pitch assignment.

---

## Architecture

```
index.html    — shell, import map, control bar UI
main.js       — wiring: grid ↔ renderer ↔ clock ↔ audio
grid.js       — 16³ Uint8Array, getSlice(x) for step reads
renderer.js   — Three.js instanced mesh, orbit controls, voxel picking
clock.js      — Tone.js Sequence driving 16 steps at 16n
audio.js      — PolySynth wrapper, mix mode logic, Y→frequency mapping
```

**Rendering:** 4096 voxels drawn as a single instanced mesh draw call. Each voxel is a `RoundedBoxGeometry` with a slightly larger back-face-only shell for the outline glow. Color is driven per-instance via `setColorAt`. Triggered voxels flash white and decay back to blue over ~18 frames.

**Audio timing:** Tone.js schedules note events in the Web Audio clock thread for sample-accurate timing, then uses `Tone.Draw` to synchronize visual state back to the animation frame.

**No framework:** plain ES modules, CDN imports via import map. Works with `python3 -m http.server`.

---

## Roadmap

- [x] 3D voxel grid renderer
- [x] Orbit camera + voxel click-to-toggle
- [x] BPM clock, linear X-axis sweep
- [x] Tone.js synth output (Synth, FM, AM, Membrane)
- [x] OR / AND / First-layer mix modes
- [x] Trigger flash animation
- [ ] Web MIDI output (note on/off to external instruments)
- [ ] External MIDI clock input
- [ ] Anarchy mode — arbitrary plane sweep
- [ ] LFO plane wobble
- [ ] Algorithmic layer selection
- [ ] Multi-plane polyrhythm mode
- [ ] Per-voxel note assignment
- [ ] Save / load patterns as JSON
- [ ] Selectable scales
- [ ] Bloom / glow post-processing

---

## Why

Step sequencers have looked the same since the 1970s. The 2D grid is an extremely good interface for what it does. This is an attempt to find out whether the third dimension adds anything musically useful, or just looks cool.

Probably both.

---

## Stack

- [Three.js](https://threejs.org/) — WebGL rendering
- [Tone.js](https://tonejs.github.io/) — Web Audio scheduling and synthesis
- No bundler, no framework, no build step
