# Hearify

A helper films a place once on a phone. The laptop turns the video into a 3D room and finds what matters for getting
around. Someone who can't see it can then explore it by sound, on headphones (design:
`docs/superpowers/specs/2026-10-08-hearify-sound-rehearsal-design.md`).

## Hackathon demo: rooms from video

Phones on the laptop's Wi-Fi can film a room and get it back as a Gaussian splat in the 3D view. The laptop builds it
with ffmpeg, COLMAP and OpenSplat in Docker (design: `docs/superpowers/specs/2026-10-06-hearify-video-splats-design.md`).

1. Start Docker Desktop.
2. `npm run pipeline:build` (first time only; roughly 30–60 minutes).
3. `npm run pipeline:check` (prints the GPU and each tool's version).
4. `npm run demo`, and allow Node through Windows Firewall on private networks when asked. The Wi-Fi network must be
   set to Private.
5. Open the printed `http://<laptop address>:8080` on the phone.

If the image build stalls or Docker stops answering, rebuild with fewer parallel compile jobs (slower, but it needs less
memory): `docker build --build-arg BUILD_JOBS=1 -t hearify-splat pipeline`.

If the venue Wi-Fi keeps devices apart, turn on Windows Mobile Hotspot on the laptop and connect the phone to it; the
address printed for the hotspot adapter works the same way.

`npm run demo:serve` restarts the server without rebuilding the app. Job folders (video, frames, COLMAP model, splat,
logs) are kept in `%LOCALAPPDATA%\Hearify\jobs`; set `HEARIFY_JOBS_DIR` or `PORT` to change where and which port.
