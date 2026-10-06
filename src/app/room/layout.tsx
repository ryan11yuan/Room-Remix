import type { Metadata } from 'next';

// The page is a client component, which can't export metadata: its title lives here.
export const metadata: Metadata = { title: 'Your room · Room Remix' };

export default function RoomLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
