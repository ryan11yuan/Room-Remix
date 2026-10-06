This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Hackathon demo: rooms from video

Phones on the laptop's Wi-Fi can film a room and get it back as a Gaussian splat in the 3D view. The laptop builds it
with ffmpeg, COLMAP and OpenSplat in Docker (design: `docs/superpowers/specs/2026-10-06-room-remix-video-splats-design.md`).

1. Start Docker Desktop.
2. `npm run pipeline:build` (first time only; roughly 30–60 minutes).
3. `npm run pipeline:check` (prints the GPU and each tool's version).
4. `npm run demo`, and allow Node through Windows Firewall on private networks when asked. The Wi-Fi network must be
   set to Private.
5. Open the printed `http://<laptop address>:8080` on the phone.

`npm run demo:serve` restarts the server without rebuilding the app. Job folders (video, frames, COLMAP model, splat,
logs) are kept in `%LOCALAPPDATA%\RoomRemix\jobs`; set `ROOM_REMIX_JOBS_DIR` or `PORT` to change where and which port.
