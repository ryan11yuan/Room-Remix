import Link from 'next/link';
import { ListenDemo } from '@/components/ListenDemo';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-4 py-8">
      <h1 className="text-4xl font-bold">Room Remix</h1>
      <p className="text-lg text-neutral-300">
        Hear your music the way it sounds in your room, then hear what a rug or a few panels would fix, before you
        buy anything.
      </p>
      <ListenDemo />
      <Link href="/room" className="self-start rounded-lg bg-white px-5 py-3 font-semibold text-neutral-950">
        Try your room
      </Link>
      <footer className="text-xs text-neutral-500">
        <Link href="/about" className="underline">
          About and privacy
        </Link>
      </footer>
    </main>
  );
}
