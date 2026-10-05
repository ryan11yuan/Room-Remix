# Room Remix Plan 1: follow-ups for Plans 2–5

Plan 1 (core "hear your room") is implemented on `master` (20150c1..29895ff). It passed per-task reviews, a final whole-branch review, and one final fix wave. This file keeps what is still open so the next plans can pick it up.

## Open issue that changes what you hear: fix first

**Room modes play about 8 dB louder than Dry on typical music.** Measured in Chrome with loud pink noise (−7.8 dBFS RMS): Dry −13.3 dBFS RMS, Now −5.4, With fixes −5.2. With a 440 Hz pluck the gap was only +1.8 dB.
- **Cause:** `normalizeIr` (`src/lib/audio/mix.ts`) scales each IR to unit *flat* energy. That average is dominated by the top band, which covers 88% of the linear-frequency bins. The room IR's spectrum is heavier in the lows than that average, and music is too, so the room modes come out louder.
- **Why it matters:** spec §6 asks for matched perceived loudness across all modes. A louder "In your room" biases the Dry ↔ Room comparison.
- **Fix:** normalise each IR by a pink-weighted (optionally K-weighted) average of |H(f)|² instead of flat energy. Weight 1/f over about 50 Hz–16 kHz, from one FFT of the IR. The dry path has |H| = 1, so it stays the reference. Test: pink noise through a normalised IR gives the same RMS as dry, within 1 dB.
- **Related:** the final review measured With fixes 0.4–0.8 dB louder than Now under pink + K-weighting. The same fix resolves that.

## Before Plan 2 (clap calibration)
- Add bounds for `calibration.factor` and `measuredRt60` in both `migrate` (`urlCodec.ts`) and `validateRoom`. Today any factor > 0 is accepted. An extreme factor gives very short IRs, which can briefly sum slot gain to 1.6 during an interrupted swap.
- Show the *uncalibrated* prediction in "Predicted X s · Measured Y s": `predictRt60({ ...room, calibration: { factor: 1 } })`.
- Calibration semantics are now as spec §5 requires: `absorptionArea = f·(surfaces + furnishing) + Σ fix area·(α_fix − f·α_surface under fix)`. Build the solver on that.

## Before Plan 3 (3D scene + rays)
- **Rays need more data:**
  - `RayPath` has a single `energy` and `hitFixes`. To dim a pulse at the bounce where it hits a rug or panel, add per-bounce energies or per-hit fix flags.
  - Add `computeRayPaths(room, maxOrder)` in `simulate.ts`, using the same energy calculation, for per-frame low-order rays on the main thread.
- **Simulation waits for a song:** it needs `sampleRate`, which is `null` until a song is picked (`Player.tsx`). So there are no paths for the rays before then. Default to 48 kHz and re-render if the AudioContext's rate differs.
- **Yaw convention:** `listener.yaw` θ (+x toward +z) corresponds to three.js `rotation.y = −θ`. The frame is right-handed and y is up. Facing the front wall (x = 0), the right wall is `wallZ0`.
- **Worker client:**
  - After a fatal worker error (or on a disposed client), `simulate()` never settles. Reject everything pending, terminate the worker, recreate it lazily, and add a Retry button (spec §11).
  - When the error event has no message, the user sees "Couldn't simulate this room" twice.
  - Coalesce queued simulations to one in flight plus one pending, so drag-end renders don't pile up on phones.
- **Overlapping fixes:**
  - `absorptionArea` counts every overlapping fix, while the image-source lookup counts only the first.
  - New panels are placed side by side, but they can stack again after a panel is deleted.
  - Reject or union overlaps once drag placement exists.
- **Small fixes:**
  - The clearance bounds in `validateRoom` have no epsilon (e.g. length 1.9, x = 1.6 is rejected by float noise). Add one before drag clamps and the ft→m conversion.
  - `earResponse` is now covered by a wall-sidedness test. A direct yaw = π/2 unit test would still be cheap insurance.

## Before Plan 5 (presets, wizard, deploy)
- Add a 50–100 ms raised-cosine fade where the 4 s IR cap cuts the tail. It is audible for RT60 above about 3 s (bare tile rooms, presets).
- **Safari clipboard:** the copy probably always falls back, because `clipboard.writeText` runs after `await encodeRoom`. Precompute the share code when the room changes, so the click handler writes synchronously.
- **Stale fragment:** after a share, later edits leave the old `#v1…` in the address bar. Clear or sync it, or rely on autosave.
- **Autosave ("My rooms"):** `migrate` rejects invalid rooms, and NaN serialises to `null`. Autosave only valid rooms, or use a lenient loader for in-progress edits.
- **Accessibility pass:**
  - The Dry/Room and Now/With fixes toggles need `aria-pressed`.
  - The validation list, notices and "Link copied" should be announced (`role="alert"`/`"status"`), and invalid inputs need `aria-invalid`.
  - `text-neutral-500` contrast is about 3.8–4.2:1.
  - Form fields lack `id`/`name` (DevTools issue).
- **Cleanup:**
  - The README is still create-next-app boilerplate.
  - Remove the `next start` script, which doesn't work with a static export.
  - `public/next.svg` and `public/vercel.svg` are unused.
- **Build warning:** a stray `C:\Users\ryany\pnpm-lock.yaml` triggers a Next.js warning; set `turbopack.root` or remove it.
- **iPhone check:**
  - pause/stop clicks (hard stop);
  - recovery after an iOS audio interruption (no `statechange` handling);
  - song memory is about 3–4× the PCM size, so consider a duration cap.

## Known minor issues (can wait or never)
- **Audio engine:**
  - Linear fractional delay acts as a mild position-dependent lowpass on early reflections.
  - The 5 ms tail fade-in leaves a small average dip right after the transition.
  - `dispose()` isn't idempotent and doesn't bump the play token.
  - `setIrs` can half-apply if `createBuffer` throws.
  - `CROSSFADE_SECONDS` is defined in both `mix.ts` and `engine.ts`.
  - The limiter's automatic makeup gain is about +0.57 dB on all modes.
  - Reverting A→B→A during warm-up rebuilds A's convolver (efficiency only).
- **UI:**
  - `rateRt60(NaN)` returns "Echoey".
  - The rating uses unrounded values against a 2-decimal display.
  - A previous error string survives a successful retry.
  - The share status timer isn't cleared on re-click.
  - The file input isn't reset after a failure.
  - +Rug/+Panel stay enabled while dimensions are invalid.
- **Untested or weak tests:**
  - air loss in image sources;
  - single-band mask behaviour;
  - unit variance of the noise;
  - the `normalizeIr` ILD-preservation case;
  - nested unknown-field stripping and size/wall/yaw guard cases in the codec;
  - the codec's 4096-char length guard, which isn't independently proven.
- **Engineering hygiene:**
  - The noise cache is shared and unbounded (about 9 MB per sample rate).
  - `applyBandMasks`/`fft` lack length guards.
  - `decodeRoom(undefined)` throws.
  - The decoder accepts non-canonical base64.
  - Furnishing/rug-size literals are duplicated from their types.
  - The pyroomacoustics fixture keys are fragile against float32 data, but fail safe.
  - `maxOrder` isn't validated.

## Deliberate decisions made during execution
These went beyond or against the plan's literal text. The reasons are in the commit history.
1. `images: { unoptimized: true }` in next.config: the generated landing page used `next/image`, which fails a static-export build.
2. Browser walk-through by the controller; audible checks left to the user.
3. `vitest.config.mts` instead of `.ts`, so `npm test` prints no ESM warning.
4. The pyroomacoustics damping tolerance is 1e-6 instead of 1e-9, because pyroomacoustics stores float32.
5. Image-source travel-order test rewritten, plus a polyline-length invariant (the plan's test passed with a reversed sort).
6. The seeded-noise determinism test was rewritten; the plan's version was vacuous because of the cache.
7. The IR timing tests use onset detection instead of argmax (linear fractional delay split the direct impulse).
8. Early reflections get a per-bounce diffuse factor, so furnishing and calibration affect them and the tail joins at matching level.
9. Share links are capped at 4096 chars and 16 KiB inflated (decompression-bomb guard).
10. A play token in `AudioEngine.play()` prevents double sources on a double tap.
11. `useSimulation` settles a stuck "running" status when the room becomes invalid.
12. Task 13 extras: playback and clipboard error handling, accessible names for the fix rows, following `hashchange` for pasted links.
13. `out/` excluded from `tsconfig` (Turbopack copies `worker.ts` into the build output).
14. The final fix wave was limited to the four Important findings plus panel placement.
15. Master gain is −6 dB, with a `DynamicsCompressorNode` safety limiter.
16. New IRs warm up for up to 0.5 s before crossfading, and unchanged slots are skipped.
17. Left/right wall labels corrected (wallZ0 = Right, wallZ1 = Left) and pinned in a test.
18. Fixes apply on top of the calibrated room (spec §5).
19. Fix B refinements: promote a faded-in pair, swap immediately when the context is suspended, re-arm the retire timer.
