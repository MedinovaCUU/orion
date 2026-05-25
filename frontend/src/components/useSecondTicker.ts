import { useEffect, useState } from 'react';

export default function useSecondTicker(enabled = true) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return;
    }

    const syncNow = () => {
      if (document.visibilityState === 'hidden') {
        return;
      }

      setNowMs(Date.now());
    };

    syncNow();
    const timer = window.setInterval(syncNow, 1000);
    document.addEventListener('visibilitychange', syncNow);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', syncNow);
    };
  }, [enabled]);

  return nowMs;
}
