'use client';

import { useEffect, useState } from 'react';
import { fetchHealth } from '@/lib/splatJobs/client';
import type { Health } from '@/lib/splatJobs/protocol';

/** The demo server's health, asked once on mount. Null until it answers, and where the page isn't served by it. */
export function useSplatHealth(): Health | null {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    let live = true;
    void fetchHealth().then((answer) => {
      if (live) setHealth(answer);
    });
    return () => {
      live = false;
    };
  }, []);
  return health;
}
