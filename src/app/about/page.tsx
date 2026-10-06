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
          Nothing you add leaves your device. Songs are played from memory; your rooms and room scans are kept in this
          browser only. There are no accounts and nothing is uploaded. A share link carries the room&apos;s name, size
          and materials in the link itself, and only when you share it.
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
          The room is modelled as a box with a material on each surface and a furnishing level. The shapes of furniture
          in a scan aren&apos;t modelled, so a scan changes what you see, not what you hear.
        </p>
      </section>

      <Link href="/" className="self-start underline">
        Back to the home page
      </Link>
    </main>
  );
}
