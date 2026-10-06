/**
 * What pressing Play does on the room page:
 * - 'play': play (or pause) the song or clip that is loaded;
 * - 'drums': nothing is loaded or loading, so pick the drum loop and play it;
 * - 'wait': a song is still loading, so Play waits for it. A song is never thrown away for the drum loop.
 *
 * While something plays, Play stays Pause, even with the next song still loading.
 */
export type PlayAction = 'play' | 'drums' | 'wait';

export function playAction({ loaded, loading, playing }: { loaded: boolean; loading: boolean; playing: boolean }): PlayAction {
  if (playing) return 'play';
  if (loading) return 'wait';
  return loaded ? 'play' : 'drums';
}
