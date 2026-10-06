import type { Metadata } from 'next';

// The page is a client component, which can't export metadata: its title lives here.
export const metadata: Metadata = { title: 'Set up your room · Room Remix' };

export default function SetupLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
