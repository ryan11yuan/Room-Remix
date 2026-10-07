import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Room Remix',
  description: 'Import a video of your room and walk around it in 3D.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-neutral-950 text-neutral-100 antialiased">{children}</body>
    </html>
  );
}
