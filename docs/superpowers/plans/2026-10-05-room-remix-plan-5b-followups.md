# Room Remix Plan 5b: follow-ups for Plans 5c–5d

Plan 5b (preset spaces, built-in clips, landing page) is on `master` (b6c5225..0732e36). It passed:
- per-task reviews, with a tests-only fix round on Task 1 and a fix round on Task 4;
- a clips rework after the controller measured loudness in the browser;
- a final whole-branch review, then one fix wave, its re-review and a small residual patch, which was checked again;
- Chrome checks of the landing page, all three spaces, the room page's built-in clips, Explore it in 3D and the About page.

508 tests pass. This file keeps what is still open.

## What the browser checks confirmed
- **Landing page:** the cathedral, the parking garage and the demo bedroom all play. Switching tabs keeps playing, switching clips works, and Pause is silent.
- **First tap:**
  - The cathedral (1.19 MB, was 2.9 MB) downloads about 0.6 s after the page loads, before any tap, and no audio context is created.
  - The first Play needs no second download; the Pause button appears 0.4 s after the tap.
- **One convolver per recorded space:** the second slot holds a 1-sample silent IR, shared across spaces.
- **Leaving mid-download:** the request is aborted (`net::ERR_ABORTED`) with no console error.
- **A failed Play:** an injected `resume()` failure shows "Your browser can't play audio here."; the next Play clears it and plays.
- **Loudness:** "In the space" and "Dry" match within 2.5 dB on the broadcast loudness measure (K-weighted, BS.1770), for both clips in every space. Two measuring runs gave different values:

  | Space | Drum loop | Guitar riff |
  |---|---|---|
  | Demo bedroom | +1.0 dB | −2.5 dB |
  | Cathedral | +1.7 / −2.0 dB | −0.1 / +0.2 dB |
  | Parking garage | +0.7 / −1.6 dB | −1.6 / −0.8 dB |

  - The garage file and the signal path didn't change between the runs, so the spread is the measurement (live analyser windows), not the code.
  - The trimmed cathedral matches the original 24-bit file to within about one 16-bit step.
  - Before the clips were reshaped toward a pink spectrum, the gap reached 5.5 dB A-weighted.
- **Explore it in 3D:**
  - It opens "Demo bedroom" (3.6 × 3 × 2.4 m) on the room page with a clean address bar, and adds it to My rooms.
  - Pressing it again reuses that room.
  - After an edit, it opens "Demo bedroom 2", and later presses reuse "Demo bedroom 2".
- **Room page:** "Or try a built-in clip" plays through the room, and the chosen clip shows as pressed.
- **About:** shows both credits, with the changes stated, and the privacy text about share links.
- **Phone width:** no overflow.

## Not checked by machine
- **Listening:** whether the spaces sound right and equally loud by ear, on headphones and on phone speakers. The guitar's A-weighted level still sits 2–4 dB below dry, because rooms lose treble and the engine matches energy pink-weighted.
- **Phones:**
  - the first-tap audio unlock on iOS Safari (Play does play() then pause() to unlock);
  - a real iOS audio interruption, then Play;
  - the CPU load of a 6 s stereo convolver on a low-end Android;
  - whether Safari accepts a 1-frame ConvolverNode buffer (Chrome does).
- **Screen readers:** the tabs, the Dry / In the space toggle and the load messages.

## For Plan 5c (setup wizard, layout, accessibility)
- **Toggle:** the landing page and the room page each have their own Dry / In the space toggle. Make one component, with one label and `aria-pressed` pattern.
- **Touch targets and contrast:** the clip buttons and tabs are below 44 px on phones; check the muted text colours against WCAG AA.
- **Heading order:** the landing page needs an h2 above the player.
- **Room page convolvers:** `Player` still runs both slots' convolvers, even with no fixes chosen. Give it the same silent-IR treatment as the landing page.
- **ListenDemo:** its loading and playing logic could move to a DOM-free controller with Node tests. Today only its parts are tested, and the cleared audio error has no automated test.
- **Demo bedroom scan:** the demo bedroom has no scan. `ScanController` only loads scans from IndexedDB by room id, so a static demo scan needs a loader, and pruning must never touch it.

## For Plan 5d (tests, hosting)
- **Prefetch 404s:** the client requests `/about/__next.about.__PAGE__.txt` (and the same for `/room`), but the export writes `out/about/__next.about/__PAGE__.txt`. Navigation still works. Check under Cloudflare Pages first, then add a `_redirects` rewrite or `prefetch={false}`.
- **Cache headers:** `/ir/*` files never change; give them a long `Cache-Control` in `_headers`.
- **End-to-end tests:**
  - play each space;
  - Explore it in 3D, twice with an edit between;
  - the About page.
- **A repeatable loudness check:** render each space through an `OfflineAudioContext` and compare K-weighted levels. Live analyser readings vary by 2–3 dB between runs.
- **Analytics:** if any is added, the privacy text on the About page must say so.

## Waiting on the author
- **The demo bedroom** uses placeholder values: 3.6 × 3 × 2.4 m, carpet, plaster, drywall, curtains, furnishing full. Replace them with a measured bedroom, and add its scan (.spz or .ply).

## Smaller open items
- **Slow connections:**
  - The 30 s load timeout starts with the idle download, not with the tap. On connections slower than about 320 kbps the cathedral can't load, and a tap at 25 s fails after 5 s. Restart the clock when Play joins a download that is still running.
  - Skip the idle download when `navigator.connection?.saveData` is set.
- **Clip switch errors:** in `ListenDemo`, `chooseClip` swallows a `play()` rejection instead of showing the audio error.
- **Clip tuning:** the Karplus–Strong guitar is 2–10 cents flat.
- **Clip levels:** the two clips are peak-normalised (0.8), not loudness-matched to each other.
- **`decodeIr`** detaches the caller's buffer; callers must not reuse it.
- **K-weighted IR normalisation:** matching IRs by K-weighted gain instead of pink-weighted energy might close the remaining A-weighted gap for real music. Decide after the listening check.

## Deliberate decisions made during execution
These went beyond or against the plan's literal text. The reasons are in the commit history.
1. **The CC BY credit states the changes** (shortened, converted to 16-bit, high-pass filtered, level-matched), and the York credit links to the York Minster page.
2. **The clips were reshaped, not the normalisation.** Both clips now have a near-pink spectrum (octave bands within ±6 dB), and a Node test pins the demo bedroom's A-weighted match within ±3 dB.
3. **The remaining loudness gap is accepted** at 2.5 dB K-weighted.
4. **The cathedral ships trimmed:** 6.2 s, 16-bit, 1.19 MB instead of 2.9 MB. The plan said to ship it as it is. `node scripts/trim-wav.mjs <in> <out> <seconds>` regenerates it.
5. **The landing page fetches the cathedral when idle**, before any tap, but creates no audio context until Play.
6. **A recorded space runs one convolver.** The second slot gets a silent one-sample IR.
7. **The last pick wins on the room page.** A song still decoding can't replace a clip picked after it, in the page or in the engine (`songToken`).
8. **Explore pushes the room through the router**, since lint flags `location.assign`.
9. **Opening a shared room:**
   - A room identical to a saved one reuses it.
   - A room with a saved room's name but different contents is added under a numbered name ("Demo bedroom 2").
   - Later opens of the same link reuse that numbered copy.
