import Link from 'next/link';
import { PRESETS } from '@/lib/presets/presets';

export const metadata = { title: 'About · Room Remix' };

export default function About() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8">
      <h1 className="text-3xl font-bold">About Room Remix</h1>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">What this is</h2>
        <p className="text-neutral-300">
          Room Remix lets you hear how your room sounds, and what a few fixes would change, before you spend any money.
          Describe your room or scan it, play a song through it, then switch a rug or some panels on and off to hear
          the difference.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Privacy</h2>
        <p className="text-neutral-300">
          Nothing you add leaves your device. Songs, room scans and your rooms stay in this browser. There are no
          accounts and nothing is uploaded.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Credits</h2>
        {PRESETS.map((p) => (
          <p key={p.id} className="text-neutral-300">
            {p.credit.text} Licence:{' '}
            <a href={p.credit.licenceUrl} rel="noreferrer" className="underline">
              {p.credit.licence}
            </a>
            .{' '}
            <a href={p.credit.sourceUrl} rel="noreferrer" className="underline">
              Source
            </a>
          </p>
        ))}
        <p className="text-neutral-300">The built-in drum loop and guitar riff are generated in your browser.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">How it works, briefly</h2>
        <p className="text-neutral-300">
          The room is modelled as an empty box with materials on its surfaces. Furniture in a scan has no effect on the
          sound.
        </p>
      </section>

      <Link href="/" className="self-start underline">
        Back to the home page
      </Link>
    </main>
  );
}
