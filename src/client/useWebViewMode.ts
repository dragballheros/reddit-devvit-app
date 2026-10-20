import { addWebViewModeListener, getWebViewMode, removeWebViewModeListener } from '@devvit/web/client';
import { useEffect, useState } from 'react';

export type PresentedWebViewMode = 'inline' | 'expanded';

/**
 * Outside a Reddit web view there is no host mode to expand into, so render
 * the full interface. Inside Reddit, inline is the feed-sized default.
 */
export const readWebViewMode = (): PresentedWebViewMode => {
  const host = globalThis as { devvit?: unknown };
  if (!host.devvit) return 'expanded';
  try {
    return getWebViewMode();
  } catch {
    return 'expanded';
  }
};

export const useWebViewMode = (): PresentedWebViewMode => {
  const [mode, setMode] = useState<PresentedWebViewMode>(readWebViewMode);

  useEffect(() => {
    const sync = () => setMode(readWebViewMode());
    window.addEventListener('focus', sync);
    addWebViewModeListener(sync);
    return () => {
      window.removeEventListener('focus', sync);
      removeWebViewModeListener(sync);
    };
  }, []);

  return mode;
};
