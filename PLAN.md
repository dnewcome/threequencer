# Threequencer — 3D Voxel Sequencer

## Concept

A 3D musical sequencer built around a 16×16×16 cube of voxels. Each voxel is a "step" that can be on or off (or carry note/velocity data). The cube can be "read" by sweeping through it in many ways — axis-aligned, diagonal, planar — and the intersecting active voxels trigger notes.

---

## Core Architecture

### The Grid
- 16×16×16 boolean (or multi-value) voxel grid
- Each cell stores: on/off, pitch, velocity, channel (optional)
- Data structure: flat `Uint8Array` or typed 3D array, indexed as `x + y*16 + z*256`

### Rendering
- WebGL (raw or via a thin lib like `regl` or `twgl`)
- Each voxel rendered as a small cube
- Active voxels: lit/colored; inactive: dim wireframe or transparent
- "Current plane" highlighted as a semi-transparent slab sweeping through the cube
- Camera: orbitable via mouse drag (arcball or turntable)
- Picking: ray–AABB intersection to toggle voxels on click

### Clock
- Internal BPM clock using `AudioContext` scheduler (tight timing)
- External MIDI clock input (Web MIDI API)
- Step rate configurable per axis

---

## Playback Modes

### 1. Linear Axis Sweep (Standard Sequencer Mode)
- Choose an axis (X, Y, or Z)
- Sweep a plane orthogonal to that axis, one slice per clock tick
- All active voxels in the current slice fire simultaneously
- Effectively 16 steps × 16×16 polyphony per step

### 2. Multi-Layer Mix Modes
When sweeping along one axis, each "layer" (slice perpendicular to sweep axis) can be mixed:
- **OR** — any active voxel fires
- **AND** — only fire if voxel is active across multiple layers (chordal gate)
- **XOR** — toggle based on parity across layers
- **Weighted sum** — velocity = sum of active cells (allows dynamics)
- **Random** — probabilistic: active cell has p% chance of firing

### 3. Algorithmic Layer Selection
Rather than sweeping uniformly, the active layer index is determined by:
- **Velocity curve** — MIDI velocity input maps to layer index (pressure → depth)
- **Aftertouch/modwheel** — mod wheel sweeps through layers while holding a note
- **LFO** — internal LFO drives layer selection (sine, triangle, random)
- **Envelope follower** — audio input amplitude selects layer (future)

### 4. Anarchy / Planar Sweep Mode
Instead of axis-aligned planes, define an arbitrary cutting plane and sweep it through the cube:
- **Corner-to-corner diagonal** — plane normal = (1,1,1), sweeps 48 steps (0..√3 * 15)
- **Tilted planes** — user-definable normal vector (pitch/yaw of the sweep plane)
- **Offset/wobble** — normal vector LFO'd to create organic, shifting rhythms
- Voxels are triggered when the plane crosses them (plane vs. voxel center distance threshold)
- Step count depends on the plane normal and cube geometry

### 5. Multi-Plane / Strobe Mode
- Multiple planes active simultaneously, each with its own sweep speed and direction
- Overlapping triggers use the mix modes above
- Could produce polyrhythmic textures

---

## Output

- **Web MIDI API** — send note on/off to selected MIDI output port
- **Web Audio API** — built-in synth for standalone use (simple FM or sampler)
- Each voxel's pitch mapped from position (e.g. Y-axis = pitch, X = time, Z = layer)
- Or: free-assign pitch per voxel via right-click / inspector panel

---

## UI / UX

- Main view: 3D cube, orbitable
- Side panel: playback mode selector, BPM, clock source
- Voxel inspector: click to toggle, right-click for note/velocity editor
- Layer view: 2D slice editor for the current layer (top-down grid)
- Timeline scrubber showing current plane position
- Color coding: pitch → hue, velocity → brightness

---

## Implementation Phases

### Phase 0 — Skeleton
- [ ] Repo + build tool (Vite, plain HTML/JS)
- [ ] WebGL cube renderer (instanced rendering for 4096 voxels)
- [ ] Camera orbit controls
- [ ] Voxel toggle via mouse pick

### Phase 1 — Basic Sequencer
- [ ] Internal BPM clock
- [ ] Linear X-axis sweep
- [ ] Highlight current slice
- [ ] Web Audio synth output (simple oscillator)

### Phase 2 — MIDI + Output
- [ ] Web MIDI API integration (input clock + note output)
- [ ] Pitch mapping (position → MIDI note)
- [ ] Note on/off scheduling

### Phase 3 — Mix Modes
- [ ] OR / AND / XOR / weighted mix between layers
- [ ] UI controls for mix mode

### Phase 4 — Anarchy Mode
- [ ] Arbitrary plane definition
- [ ] Voxel–plane intersection test
- [ ] Diagonal and user-defined sweeps
- [ ] LFO wobble on plane normal

### Phase 5 — Algorithmic Layer Selection
- [ ] MIDI velocity/aftertouch → layer index
- [ ] Internal LFO layer driver
- [ ] UI for mapping sources to layer selector

### Phase 6 — Polish
- [ ] Save/load patterns (JSON)
- [ ] Multi-plane / polyrhythm mode
- [ ] Visual flair (bloom, transparency, voxel animation on trigger)

---

## Decisions

| Question | Decision |
|---|---|
| Voxel data | on/off for now; pitch derived from position |
| Time axis | **X** — steps proceed in +X direction |
| Pitch axis | **Y** — maps to MIDI note / frequency |
| Layer axis | **Z** — concurrent layers, mixed/selected per mode |
| Audio | **Tone.js** — built-in synth, no MIDI required to start |
| WebGL | **Three.js** — instanced mesh for voxels, OrbitControls for camera |
| Framework | **Plain HTML/JS** — CDN/ESM imports, no build step initially |
| Sweep style | Discrete — one X-slice per clock tick |

### Axis Summary
```
      Y (pitch: low→high)
      │
      │   Z (layers: front→back)
      │  ╱
      │ ╱
      └──────── X (time: step 0→15)
```

---

## Name

**Threequencer** — three dimensions, sequencer.

---

## Rendering Implementation Notes

### Instanced Rendering

All 4096 voxels are drawn with Three.js `InstancedMesh`, which issues a single GPU draw call with per-instance transform matrices and colors. Three separate instanced meshes are maintained:

- **Active mesh** — `RoundedBoxGeometry`, opaque, bright blue (`#89b4fa`). Only active voxels are drawn; `mesh.count` is set each frame to the number of active voxels, and their matrices are packed into the front of the instance buffer. Inactive voxels are simply omitted rather than hidden with scale tricks.
- **Ghost mesh** — same geometry, very low opacity (`~0.03`), dark color. Shows the full 16³ grid structure so the user can see and click on inactive positions.
- **Outline mesh** — slightly larger (`1.18×`) rounded box, `BackSide` rendering only. The back faces peek past the fill cube's edges, drawing a visible border around each ghost cube without any extra geometry pass.

### Color / Flash

`MeshBasicMaterial` is used throughout — no lights needed. Per-instance colors are set via `InstancedMesh.setColorAt()` which populates a `USE_INSTANCING_COLOR` attribute in the shader. **Do not set `vertexColors: true`** on the fill material: `RoundedBoxGeometry` has no vertex color attribute, so that flag causes the shader to multiply instance colors by zero (everything goes black). Instance colors work automatically without it.

On each clock step, triggered voxels get a flash counter. Each render frame, the active mesh lerps those voxels from white (`#ffffff`) back toward blue over 18 frames.

### Near-Plane Peel Culling

When the user zooms into the grid, front layers of cubes would normally block the interior. A custom culling pass is applied each frame to peel away the nearest cubes:

1. **Compute a world-space cull plane** — positioned `NEAR_CULL_DIST` units in front of the camera, perpendicular to the view direction:
   ```js
   camera.getWorldDirection(camDir);
   nearPlane.setFromNormalAndCoplanarPoint(
     camDir,
     cubeCenter.copy(camera.position).addScaledVector(camDir, NEAR_CULL_DIST)
   );
   ```

2. **Test each cube's geometric center** against the plane. If the center is on the camera side (`distanceToPoint < 0`), the cube is culled.

3. **All-or-nothing** — culled cubes are completely removed from all three meshes (active, ghost, outline) in the same frame. Ghost and outline use `scale = 0.0001` to hide instances without reordering their index buffers; the active mesh simply skips culled voxels when building its packed list.

This is deliberately **not** tied to `camera.near` (the GPU depth clip plane), which would cause triangles to be clipped mid-face rather than removing whole cubes. `camera.near` stays at `0.1` so the GPU never clips geometry; all culling is done in JavaScript before the draw call.

`NEAR_CULL_DIST` (default `10` units) controls how aggressively cubes peel away. Increase it for a more dramatic effect at wider zoom levels; decrease it to require tighter zoom before peeling begins.
