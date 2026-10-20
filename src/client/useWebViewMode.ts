import { addWebViewModeListener, getWebViewMode, removeWebViewModeListener } from '@devvit/web/client';
import { useEffect, useState } from 'react';

export type PresentedWebViewMode = 'inline' | 'expanded';

/**
 * Devvit 0.14.7 shows every post entrypoint inline until a trusted click calls
 * requestExpandedMode. Only a positive expanded reading changes the UI. A missing
 * host, or a mode Reddit did not confirm, stays on the inline card.
 */
export const readWebViewMode = (): PresentedWebViewMode => {
  const host = globalThis as { devvit?: unknown };
  if (!host.devvit) return 'inline';
  try {
    return getWebViewMode() === 'expanded' ? 'expanded' : 'inline';
  } catch {
    return 'inline';
  }
};

export const useWebViewMode = (): PresentedWebViewMode => {
  const [mode, setMode] = useState<PresentedWebViewMode>(readWebViewMode);

  useEffect(() => {
    const sync = () => setMode(readWebViewMode());
    sync();
    window.addEventListener('focus', sync);
    addWebViewModeListener(sync);
    return () => {
      window.removeEventListener('focus', sync);
      removeWebViewModeListener(sync);
    };
  }, []);

  return mode;
};
