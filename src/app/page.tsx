import Link from 'next/link';
import { ListenDemo } from '@/components/ListenDemo';
import { MyRoomsLink } from '@/components/MyRoomsLink';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-4 py-8">
      <h1 className="text-4xl font-bold">Room Remix</h1>
      <p className="text-lg text-neutral-300">
        Hear your music the way it sounds in your room, then hear what a rug or a few panels would fix, before you
        buy anything.
      </p>
      <ListenDemo />
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/setup" className="inline-flex min-h-11 items-center rounded-lg bg-white px-5 py-3 font-semibold text-neutral-950">
          Try your room
        </Link>
        <MyRoomsLink />
      </div>
      <footer className="text-xs text-neutral-400">
        <Link href="/about" className="inline-flex min-h-11 items-center underline">
          About and privacy
        </Link>
      </footer>
    </main>
  );
}
