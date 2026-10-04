import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-4">
      <h1 className="text-4xl font-bold">Room Remix</h1>
      <p className="text-lg text-neutral-300">
        Hear your music the way it sounds in your room, then hear what a rug or a few panels would fix, before you
        buy anything.
      </p>
      <p className="text-sm text-neutral-400">🎧 Use headphones. Room differences are hard to hear on phone speakers.</p>
      <Link href="/room" className="self-start rounded-lg bg-white px-5 py-3 font-semibold text-neutral-950">
        Try your room
      </Link>
    </main>
  );
}
