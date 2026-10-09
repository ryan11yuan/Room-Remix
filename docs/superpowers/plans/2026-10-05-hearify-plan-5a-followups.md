# Hearify Plan 5a: follow-ups for Plans 5b–5d

Plan 5a (rooms that persist) is on `master` (7bac8fa..6967383). It passed:
- per-task reviews, with fix rounds on Tasks 1–3;
- a final whole-branch review, then one fix wave and its re-review;
- one small residual patch after that, checked by the controller and by tests;
- Chrome checks of boot, autosave, share links, two real tabs, "My rooms" and per-room scans.

472 tests pass. This file keeps what is still open.

## What the browser checks confirmed
- **Saving:**
  - The page opens a room and saves edits as you make them. A reload brings them back.
  - A cleared size field doesn't overwrite the saved room, and the form says the room isn't being saved.
- **Share links:**
  - **Share link** copies a link without changing the address bar.
  - A pasted link opens as its own room and clears the address bar. Opening it again adds no copy.
  - A bad link shows a notice.
- **Two tabs on one room:**
  - A tab with no edits follows the other tab's saved edit.
  - When both changed the room, the later tab's version is saved as "… copy" with a notice. The other tab's version is untouched.
- **My rooms:** new, open, duplicate, rename and the two-step delete all work. Deleting the open room opens another.
- **Scans:**
  - A scan is stored under its room.
  - Switching rooms ends walk mode and shows no scan in the other room. Switching back restores it.
  - Deleting a room removes its scan from storage.

## Not checked by machine
- **Screen readers:** whether notices and "Link copied" are announced.
- **Phones:** whether the save on leaving the page lands in time (Safari and Chrome).
- **Safari clipboard:** copying right after an edit should fall back to the copy-by-hand field.

## For Plan 5b (presets, landing page)
- **Demo room scan:** the demo room needs to load a scan from a static file. `ScanController` only loads from IndexedDB by room id, and pruning must never touch the demo's scan.
- **Demo link:** a link to `/room#v1.…` from another page opens as its own room and is reused on later visits. Check same-page links, which may not fire `hashchange`.

## For Plan 5c (setup wizard, layout, accessibility)
- **Room creation:**
  - The wizard needs a public session method that creates a room from a given state. `create()` always starts from the default room.
  - Decide whether a first visit to `/room` still auto-creates "My room" or goes to setup.
- **Accessibility of the new UI:**
  - Focus after pressing Delete in the dialog.
  - "Delete for good" and "Keep" don't name the room.
  - Clicking the backdrop doesn't close the dialog.
  - The "sharing isn't supported" label isn't announced.
  - The copy-by-hand panel doesn't take focus.
- **Unsavable rooms:** edits made while a room can't be saved are dropped if you switch rooms or close the tab. The form says the room isn't being saved, but no draft is kept.
- **Empty names:** an empty name duplicates as " copy".

## Fix when the saved format next changes
- **File version:** bump the file version (`v`) whenever `RoomState` gains a field. An older build's open tab keeps only what it understands, and would silently strip a new field from every room it saves.
- **Backup:**
  - Once a backup of unreadable rooms exists (`hearify:rooms:backup`), scans are never pruned in that browser again.
  - Nothing reads or clears the backup yet. A build that can read it should import it and remove it.
  - There is one backup slot.

## Smaller open items
- **Scans and copies:** Duplicate, and the copy made after a two-tab conflict, don't carry the scan. The original room keeps it.
- **Crash guard:** it is per room, not per tab. A second tab opening the same room during a slow scan restore sees "didn't open last time".
- **Storage recovery:** if storage fails and later recovers in the same visit, the page keeps using its in-memory rooms.
- **Alignment and switching:** an alignment finished while the scan's first save is still running is lost if you switch rooms before the save ends.
- **Tests:** `useRoomSession`, the page and `ShareButton` have no tests in the repo. The autosave timer is covered by `watchEdits` tests.
- **Compare by text:** `stateKey` normalises through `migrate`, so equal rooms compare equal whatever their key order. `addRoom` doesn't reject an id that already exists (ids are fresh UUIDs).

## Deliberate decisions made during execution
These went beyond or against the plan's literal text. The reasons are in the commit history.
1. **Plan 5 runs as four plans** (5a–5d).
2. **Missing author inputs don't block.** The demo room will ship as a box with placeholder values, and the deploy is prepared but not run.
3. **Rooms this build can't read are kept** and written back untouched. A stored file it can't read at all is copied to a backup key before being overwritten.
4. **The save check is "will it come back from storage"**, which is stricter than the form's validation.
5. **Two tabs never overwrite each other:** a tab with no edits follows the other tab; a tab with edits saves a copy and moves into it.
6. **Each tab keeps its own room** across a reload (`sessionStorage`). Starting again or deleting another room never switches rooms.
7. **Notices add up** until dismissed, so one never hides another.
8. **Deleted rooms stay deleted:** an idle tab doesn't bring back a room another tab deleted.
9. **A conflict copy is an ordinary room switch for the 3D view.**
10. **The "not saved" line** sits in the form's error list, not above the 3D view.
11. **Scan pruning** runs once, at the first start, and never when the rooms list could be incomplete.
12. **Renaming a room doesn't re-run the simulation.**
