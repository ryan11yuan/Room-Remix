'use client';

import { useSyncExternalStore } from 'react';

let webglSupport: boolean | undefined;
const webglListeners = new Set<() => void>();

function subscribeWebGL(listener: () => void) {
  webglListeners.add(listener);
  return () => {
    webglListeners.delete(listener);
  };
}

/** The renderer failed to start even though the probe passed: switch every view to its no-WebGL version. */
export function markWebGLUnavailable(): void {
  webglSupport = false;
  webglListeners.forEach((l) => l());
}

/** Probed once and cached: React calls this on every render, and browsers cap how many WebGL contexts can live. three.js needs WebGL 2. */
export function hasWebGL(): boolean {
  if (webglSupport === undefined) {
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      webglSupport = gl !== null;
      gl?.getExtension('WEBGL_lose_context')?.loseContext(); // free the probe context right away
    } catch {
      webglSupport = false;
    }
  }
  return webglSupport;
}

/** Whether this browser can show the 3D view. True while prerendering, so the page's first paint matches most browsers. */
export function useWebGL(): boolean {
  return useSyncExternalStore(subscribeWebGL, hasWebGL, () => true);
}
