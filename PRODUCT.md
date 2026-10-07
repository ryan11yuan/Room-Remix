# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Hackathon judges watching the maker demo Room Remix live on a laptop (confirmed 2026-10-07). The maker drives: imports a phone video of a room, waits for the build, then walks around the finished room in 3D while the judges look on. First impressions and the room itself matter most.

## Product Purpose

Import a video of your room and walk around it in 3D. A phone films one slow lap of a room; the laptop turns that video into a Gaussian splat that the browser shows full screen. Success: the judges see a real room, made from one video, that they can walk through.

## Positioning

The room is built entirely on the maker's own laptop from a single video, with free, open-source tools: ffmpeg, COLMAP, OpenSplat, then Spark in the browser (Memento's pipeline). No paid service and no cloud capture app.

## Operating Context

- Runs on the maker's laptop (`npm run demo`, port 8080); phones on the same Wi-Fi can film the room.
- One page: `/` holds the import (Quick about 5 minutes, Best sharper and about half an hour), the build's progress, the list of finished rooms, and a full-screen viewer at `#room=<id>`.
- Viewer: drag to spin, scroll to zoom, W/A/S/D to move, Q/E down and up, click to look around, Esc to stop.
- Sound in the viewer (Plan 8: speaker placement, object detection, best-spot search) is being added by a parallel session.

## Capabilities and Constraints

- Input is video only; the pipeline cannot use a single photo.
- Free and open-source only: never a paid tool, font or service.
- The acoustics pages (/room, /setup, /about) stay in the code but nothing links to them.
- Desktop browser on the laptop is the main surface; the page must still work at phone width.

## Brand Commitments

- Name: Room Remix.
- Visual world pinned by the user on 2026-10-07: the ORYZO darkroom product-editorial style (warm dark canvas, cream uppercase type, one ember accent for credit lines only). See DESIGN.md.

## Evidence on Hand

- The rooms the maker has built on this laptop (served by the local server at `/api/splat/rooms`).
- No testimonials, metrics, customers or press exist. Do not invent any.

## Product Principles

- The room is the hero: show the real splat, not a picture of an interface.
- Every claim is true of this laptop and this pipeline.
- The demo must read in seconds to someone watching over the maker's shoulder.
