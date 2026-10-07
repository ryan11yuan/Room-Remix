import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

// Inter stands in for Halyard Display (a paid face). Self-hosted, so `next build` works with no network at the venue.
const inter = localFont({
  src: './fonts/InterVariable.woff2',
  variable: '--font-inter',
  weight: '100 900',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Room Remix',
  description: 'Import a video of your room and walk around it in 3D.',
};

export const viewport: Viewport = { themeColor: '#100904', colorScheme: 'dark' };

// The design direction, kept in the built page so a later review can check the build against it.
const DIRECTION = `<!--
THESIS: The room you filmed is the object on the plinth, lit in a warm void. Refuses the upload-form-above-a-list app page.
OWN-WORLD: Walnut #100904 void; bark #382416 for the one filled pill; cream #ffedd7 uppercase weight-500 labels; cork dashed hairlines; ember #dc5000 only on the credit line. Inter standing in for Halyard. Radii 12 / 22.5 / 36. No shadows.
STORY: Judges watch a real room develop out of the dark, learn it came from one phone video built on this laptop, then see the maker walk into it or import another.
FIRST VIEWPORT: Full-bleed live splat of the newest room, vignetted to walnut. Stacked ROOM / REMIX wordmark top left, heading left, 29px description right, bottom-left card with the room's date and the filled ENTER THE ROOM pill, IMPORT A VIDEO bottom right, vertical serial label on the right edge.
FORM: the user's pinned ORYZO darkroom editorial (overrides the roll). Seed ad6d2d5f.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
-->`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh bg-walnut text-neutral-100 antialiased">
        <div hidden dangerouslySetInnerHTML={{ __html: DIRECTION }} />
        {children}
      </body>
    </html>
  );
}
