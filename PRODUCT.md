# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Hackathon judges watching the maker demo Hearify live on a laptop. The story has two people: a sighted helper who films a place, and a blind or low-vision explorer who rehearses it by sound before going. In the demo, a blindfolded judge plays the explorer.

## Product Purpose

Rehearse a place by sound. A helper films one slow lap of a room on a phone; the laptop turns the video into a 3D room and finds what matters for getting around: doors, stairs, chairs, tables and the rest. The helper checks the list. The explorer then walks the room on headphones and the keyboard: each object says its name from where it really is, Space sweeps the room clockwise, and Tab and Enter choose a place and lead there with a pulse. Success: a blindfolded judge explores for two minutes, then walks to the real door.

## Positioning

Built entirely on the maker's laptop from one video, with free, open-source tools: ffmpeg, COLMAP, OpenSplat, OWL-ViT and a free speech model, shown with Spark in the browser. No paid service and no cloud.

## Operating Context

- Runs on the maker's laptop (`npm run demo`, port 8080).
- One page: `/` holds the import (Quick about 5 minutes, Best about half an hour), the build's progress, the list of finished rooms, and a full-screen viewer at `#room=<id>`.
- Viewer, check mode: the found objects, with rename, remove and add; Start exploring.
- Viewer, explore mode: W/S step, A/D turn, Space scan, Tab choose, Enter go, Esc stop, H help. Headphones.

## Capabilities and Constraints

- Input is video only; the pipeline can't use a single photo.
- Free and open-source only: never a paid tool, font or service.
- Distances are approximate: the scale assumes the phone was held 1.5 m up.
- For rehearsal before a visit, not navigation on the day. It doesn't replace a cane or a guide.
- No blind person has tried it yet. Don't claim it helps blind people until one has.
- The desktop browser on the laptop is the main surface.

## Brand Commitments

- Name: Hearify.
- Visual world pinned by the user on 2026-10-07: the ORYZO darkroom product-editorial style (warm dark canvas, cream uppercase type, one ember accent for credit lines only). See DESIGN.md.

## Evidence on Hand

- The rooms the maker has built on this laptop (served by the local server at `/api/splat/rooms`).
- No testimonials, metrics, users or press exist. Do not invent any.

## Product Principles

- Sound first: everything the explorer needs is heard; the screen is for onlookers.
- Every claim is true of this laptop and this pipeline.
- A wrong label misleads someone who can't see it, so the helper checks the list.
- The demo must read in seconds to someone watching over the maker's shoulder.
