# Room Remix — Design Spec (v1 public release)

**Date:** 2026-10-04
**Status:** Approved design, pending spec review
**Revised:** 2026-10-05: walk mode added (§2, §8, §12)

## 1. Purpose

Room Remix lets people hear how their room will sound, and how fixes would change it, before they spend money. A visitor enters their room's size and materials, plays a song, and hears it "in their room" on headphones, then adds a rug or acoustic panels or moves the speaker and A/Bs the difference.

**Primary user:** home listeners setting up a music or home-theater space.

**Success criterion:** a stranger opens the link on a phone, enters three dimensions and materials, uploads a song, and hears a clear before/after difference within about two minutes, with no account and no install.

**Where it lives:** a public, hosted web app.

## 2. Scope

### In v1

- Manual room input: length, width, height; one material per surface; furnishing level
- Simulated binaural impulse response (image source method + synthesized late tail), computed in the browser
- Clap calibration: measured vs predicted RT60
- Draggable speaker and listener (headphone/binaural playback)
- What-ifs: rug and wall panels; A/B "Now ↔ With fixes"
- A/B "Dry ↔ In your room"
- Presets: cathedral and parking garage from real recorded impulse responses
- 3D view: room box with animated sound rays
- Walk mode: tap the floor to walk the listener around the room, with an over-the-shoulder camera and live rays
- Optional Gaussian splat view of the user's room, loaded from a local file and aligned to the box
- One hosted demo room (the author's bedroom) with a pre-aligned splat
- Sharing by URL; "My rooms" saved in the browser

### Out of v1

Export of any kind (audio, video, room file, splat) · material detection from photos · fix list and product/affiliate links · stereo speaker pairs · non-box rooms · accounts and server-side storage · sine-sweep measurement · hosting user-uploaded splats · LiDAR / RoomPlan.

### Constraints

- Capture device is an iPhone 13 (no LiDAR); there is no LiDAR upgrade path planned.
- Everything runs client-side. No user data (songs, mic recordings, scans) leaves the device.
- Hosting must work on a free tier.

## 3. Architecture

Next.js + TypeScript, exported as a static site (`output: 'export'`). No server code.

```
┌─────────────── UI (Next.js pages + React) ───────────────┐
│  Landing → Room setup → Player (A/B, what-ifs, 3D view)  │
└──────┬──────────────┬───────────────┬──────────────┬─────┘
       │ RoomState    │               │              │
┌──────▼──────┐ ┌─────▼──────┐ ┌──────▼──────┐ ┌─────▼──────┐
│  acoustics  │ │   audio    │ │   scene     │ │  measure   │
│ (Web Worker)│ │ (Web Audio)│ │ (three.js + │ │ (mic clap  │
│ room → IR + │→│ song ⊛ IR, │ │  splat,     │ │  → RT60)   │
│ ray paths   │ │ A/B fades  │ │  rays)      │ │            │
└─────────────┘ └────────────┘ └─────────────┘ └────────────┘
       ▲
┌──────┴─────────────────── state ─────────────────────────┐
│  RoomState store · URL encode/decode · localStorage list │
│  · IndexedDB for splat files                             │
└──────────────────────────────────────────────────────────┘
```

| Unit | Responsibility | Depends on |
|---|---|---|
| `acoustics` | `RoomState` → stereo binaural IR + reflection paths + predicted RT60. Pure TS, no DOM; runs in a Web Worker. | nothing |
| `audio` | Decode song, convolve with IRs, A/B crossfades, loudness matching | Web Audio API |
| `scene` | three.js room box, speaker/listener/what-if gizmos, rays, splat layer + alignment | three.js, splat renderer, `acoustics` path output |
| `measure` | Mic capture of a clap → measured RT60 + calibration factor | Web Audio API, `getUserMedia` |
| `state` | `RoomState` store, URL encode/decode, localStorage rooms list, IndexedDB splat storage | zustand |

The splat renderer (candidates: Spark, GaussianSplats3D) must render inside the same three.js scene as the rays and gizmos, support `.ply`, `.splat` and `.spz`, and support raycasting for the alignment taps. The choice is made during planning.

### Coordinate frame

Metres. Origin at one floor corner; x along length, z along width, y up. Shared by `acoustics` and `scene`.

## 4. RoomState

```ts
type RoomState = {
  v: 1;
  name: string;
  dims: { length: number; width: number; height: number };   // metres
  surfaces: {
    floor: MaterialId; ceiling: MaterialId;
    wallX0: MaterialId; wallX1: MaterialId;   // walls at x=0 and x=length
    wallZ0: MaterialId; wallZ1: MaterialId;   // walls at z=0 and z=width
  };
  furnishing: 'bare' | 'some' | 'full';
  speaker: { x: number; y: number; z: number };
  listener: { x: number; y: number; z: number; yaw: number | 'faceSpeaker' };
  fixes: Array<
    | { kind: 'rug'; size: 'S' | 'M' | 'L'; x: number; z: number; on: boolean }
    | { kind: 'panel'; wall: WallId; u: number; v: number; on: boolean }   // u,v = panel centre on the wall
  >;
  calibration: { factor: number; measuredRt60?: number };   // factor defaults to 1
};
```

Validation: length and width 1.5–30 m, height 2–15 m; speaker and listener at least 0.3 m from every wall; at most 8 panels and 1 rug. Rug sizes: S 1.2×1.8 m, M 1.6×2.3 m, L 2×3 m. Panels: 0.6×1.2 m.

## 5. Acoustics engine

**Materials:** about 12 presets (drywall, brick, concrete, glass, wood floor, carpet, tile, curtains, plaster, wood panelling, acoustic panel, rug), each with absorption coefficients in 6 octave bands (125, 250, 500, 1k, 2k, 4k Hz) from standard published tables. Furnishing level adds an equivalent absorption area per band (values from typical furnished-room data).

**Early reflections (to ~80 ms):** shoebox image source method up to order 6–8. For each image source, compute the reflection points along the path; each bounce applies the reflection coefficient √(1−α) of the material *at the hit point* (rug or panel if the point falls inside one, else the surface material). Gain also includes 1/distance and per-band air absorption. Delay = distance / 343 m/s.

**Late tail:** per-band exponentially decaying noise with decay time from the Eyring formula using total absorption (surfaces + fixes + furnishing) × calibration factor. Its level is matched to the early-reflection energy at the transition time. Left and right use independent noise for width.

**Binaural:** every arrival (direct sound included) gets an interaural time difference (Woodworth spherical-head model, radius 8.75 cm) and a frequency-dependent interaural level difference (head shadow on the higher bands) based on its arrival direction relative to the listener's yaw. Per-band contributions are band-filtered and summed into the stereo IR.

**Outputs:**

```ts
type AcousticsResult = {
  ir: { left: Float32Array; right: Float32Array; sampleRate: number };
  paths: Array<{ points: Vec3[]; energy: number; hitFixes: boolean }>; // top ~200 by energy
  rt60: { bands: number[]; mid: number };  // mid = mean of 500 Hz and 1 kHz
};
```

The worker computes two results per change: **Now** (fixes off) and **With fixes** (fixes on).

**Calibration:** given measured mid RT60, solve for the factor that scales total absorption so the predicted mid RT60 equals the measured value. Fixes are applied on top of the calibrated room.

**Performance:** during a drag, rays recompute every frame at low order; the full IR re-renders ~150 ms after the drag ends. IR length is capped at 4 s.

**Reference check:** a one-off Python script runs pyroomacoustics on a set of reference shoeboxes and writes JSON fixtures, which the tests use as reference values.

## 6. Audio playback

- **Input:** user-picked file (any browser-decodable format) or a built-in demo clip (CC0/CC BY music, voice, drum loop). Decoded in memory, never uploaded. Downmixed to mono: one speaker = one point source.
- **Graph:**
  ```
  song ─┬─► dry (centred stereo) ──────────────┐
        ├─► convolver "Now"         ─► gain ───┼─► master ─► output
        └─► convolver "With fixes"  ─► gain ───┘
  ```
  Toggling A/B is a 50 ms equal-power crossfade between gains. On IR re-render, the new IR loads into the idle convolver for that slot and crossfades in.
- **Loudness matching:** each IR is normalised so all modes play at matched perceived loudness (energy-normalised IR, verified by measuring RMS of a reference noise convolved offline).
- **iOS:** the AudioContext resumes on the first tap; set `navigator.audioSession.type = 'playback'` where supported; show a "use headphones" prompt the first time.
- **Presets:** cathedral and garage play the recorded stereo IR through the same graph (no "With fixes" slot).

## 7. Clap measurement

1. `getUserMedia` with `echoCancellation`, `noiseSuppression` and `autoGainControl` all `false`.
2. Record ~3 s while the user claps once, standing near the room centre.
3. Find the peak; require ≥ 35 dB between peak and noise floor; reject clipping and multiple peaks.
4. Octave-band filter at 500 Hz and 1 kHz; Schroeder backward integration with the noise floor truncated; linear fit from −5 to −25 dB; RT60 = 3 × T20; mid = mean of the two bands.
5. Up to 3 claps; use the median.
6. Return `{ measuredRt60, factor }`; show "Predicted X s · Measured Y s".
7. Discard the recording immediately after analysis.

## 8. 3D scene

- **Box view (always):** translucent walls tinted by material, edge lines, floor grid. Touch: one finger orbit, two fingers zoom/pan. Camera buttons: Top, Corner, Listener's view.
- **Gizmos:** speaker and listener dragged on the floor plane (raycast), clamped 0.3 m from walls; height slider (desk, stand, seated, standing). Rug dragged on the floor; panels placed by tapping a wall. Side list toggles/removes fixes.
- **Rays:** draw the `paths` as glowing pulses travelling from speaker to listener at ~1/200 of real speed; brightness follows remaining energy, so pulses dim on hitting a rug or panel. Rendered as a single batched line geometry with a custom shader. Rays toggle on/off.
- **Walk mode:** a **Walk** button beside the camera buttons. It works with or without a splat; with one, you walk around your real room.
  - **Camera:** over the listener's shoulder, 1 m behind and 0.3 m above the head, on the speaker → listener line extended past the listener (the speaker is ahead, beyond the head). Drag orbits the head; pinch zooms 0.6–3 m. The camera is always pulled at least 0.1 m inside the box, so it never shows the back of the scan.
  - **Walking:** tap bare floor and the listener walks there at 1.4 m/s; tapping again re-targets. On a computer, WASD / arrow keys walk relative to the camera. The listener keeps facing the speaker, so moving changes the room's sound, not left/right.
  - **Staying valid:** targets are clamped 0.3 m from walls and outside the speaker's 0.5 m zone. The walk goes around the speaker, never through it, so the room is valid on every frame.
  - **Taps:** a tap is < 8 px of movement in < 300 ms. It is intersected with the floor plane y = 0, so tapping the splat's floor lands where you'd expect and taps above the horizon do nothing. Place panel mode, then presses on the speaker or rug, take priority over walking.
  - **Rays and audio:** rays recompute every frame while walking and arrive at the listener's head. The IR re-renders 150 ms after the walk stops (the existing debounce), then crossfades in.
  - **Leaving:** pressing Walk again or any camera button exits walk mode and stops any walk in progress.
  - **Saving:** walk mode and the camera angle aren't saved or shared; the listener's final position is saved like a drag.
  - **Limit:** the sound model is an empty box with materials. Furniture in the splat has no acoustic effect, and the listener can walk through it.
  - **Built as:** a pure `scene/walk.ts` (`walkTarget`, `walkStep` with `dt` capped at 0.1 s, `followCamera`, `keyDirection`), plus `RoomScene.setWalking(on)` and an `onListenerMove` callback that updates the store the same way a listener drag does. It ships as the first task of Plan 4, before the splat layer, so it can be tried in the box view before any scan exists.
- **Splat layer (optional):**
  - Load `.ply` / `.splat` / `.spz`; store the file in IndexedDB keyed by room id.
  - Alignment wizard: (1) tap 3 floor points → fit plane, level the scan; (2) tap the two floor corners at the ends of the x=0..length wall → origin, yaw, and scale = typed length ÷ tapped distance; (3) box outline overlaid, nudge rotate / scale / offset until it fits.
  - Alignment stored as a 4×4 transform with the splat in IndexedDB.
  - Crop splats outside the box (+ small margin) if the renderer supports it.
  - Warn above ~1.5M splats.
- **Demo room:** the author's bedroom as `.spz`, ~0.5–1M splats, ~15–25 MB, pre-aligned, served as a static asset.
- **Presets:** no geometry; show a photo/illustration labelled "Recorded in a real space". No rays or what-ifs.

## 9. State, sharing and saving

- zustand store holds the current `RoomState`; the acoustics worker re-runs when acoustic fields change.
- **Share link:** `RoomState` → JSON → deflate (`CompressionStream`) → base64url, placed in the URL fragment: `/room#v1.<data>`. The fragment is never sent to the server. Song, splat and alignment are not included.
- **My rooms:** localStorage list of `{ id, name, updatedAt, state }`, autosaved while editing.
- **Splats:** IndexedDB, keyed by room id, with alignment transform.
- **Versioning:** `migrate(state)` upgrades older versions; unreadable links open room setup with "This link couldn't be fully loaded."

## 10. Screens and flow (mobile-first)

1. **Landing:** tabs Cathedral / Parking garage / Demo bedroom; play a demo clip; "🎧 headphones recommended"; "Try your room" button.
2. **Room setup wizard:** Size (m/ft toggle) → Surfaces (tap-a-surface box diagram + furnishing level) → Placement (top view drag) → Clap (skippable) → Scan (skippable).
3. **Player:** 3D view on top; bottom sheet with play/pause, song picker, **Dry ↔ Room**, **Now ↔ With fixes**, what-if list, and a room card (RT60 now vs with fixes, measured vs predicted, plain-language rating against a 0.3–0.5 s living-room target, e.g. "Echoey → Balanced"). Header: Share, My rooms.
4. **About / Privacy:** credits for impulse responses and demo music; plain statement that nothing you upload leaves your device.

## 11. Error handling

| Situation | Behaviour |
|---|---|
| Song won't decode | "This file type isn't supported on your browser. Try MP3 or M4A." |
| Mic permission denied | Skip calibration with how-to-enable note; room works uncalibrated |
| Bad clap (noise, clipping, too quiet, double) | Specific reason + retry |
| Splat load fails / too large / unsupported | Clear message; fall back to box view |
| No WebGL | Audio-only mode with a 2D top view for placement |
| IndexedDB quota exceeded | Keep splat in memory for the session; warn |
| Dimensions out of range | Inline validation |
| Acoustics worker error | "Couldn't simulate this room" + retry; last good IR keeps playing |
| Unreadable/newer share link | Open setup with notice |

## 12. Testing

- **acoustics (Vitest):** Sabine/Eyring vs closed form; image-source arrival times and energies vs pyroomacoustics fixtures; rug/panel hit detection; calibration hits target RT60 within 2%.
- **measure (Vitest):** synthetic exponential decays with known RT60 plus noise are recovered within 10%; each failure case is detected.
- **state (Vitest):** URL round-trip; migration; corrupted-link handling; validation bounds.
- **walk (Vitest):** targets respect wall and speaker clearance; no step exceeds 1.4 m/s × `dt`; the walk arrives exactly at the target; walking straight through the speaker's position goes around it, keeps 0.5 m on every step and still arrives; every step's room passes `validateRoom`; the camera starts behind the head and stays inside the box at walls, corners and in a 1.5 m room; keys map relative to the camera.
- **E2E (Playwright, Chromium + WebKit):** load preset → play → toggle → open setup → add rug → share link → reopen link restores room; no console errors.
- **Manual on iPhone 13 Safari before each release:** mic capture, silent switch behaviour, demo splat frame rate, headphone listening check that rug and panels are clearly audible.

## 13. Hosting and licensing

- **Cloudflare Pages** (free tier, no bandwidth cap; the demo splat is 15–25 MB per first visit). Custom domain added by the author.
- Optional Cloudflare Web Analytics (cookieless).
- Preset IRs: OpenAIR recordings under **CC BY** only (commercial use allowed); no NC licences. Demo music: CC0 or CC BY. All credited on the About page.

## 14. Inputs needed from the author

- A Scaniverse/Polycam/Luma scan of the bedroom, exported as `.ply` or `.spz`
- The bedroom's measured length, width and height, and each surface's material
- A domain name and a Cloudflare account (at deploy time)

Until the scan arrives, the demo room ships as a box view with rays only.
