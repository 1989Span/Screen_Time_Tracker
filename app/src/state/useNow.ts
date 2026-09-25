import { useEffect, useState } from 'react';

/**
 * The current time, refreshed every `everyMs`.
 *
 * For labels like "shared 3m ago". Reading Date.now() during render is impure:
 * the label would be frozen at whatever time the component last happened to
 * render. This re-renders on a timer instead.
 */
export function useNow(everyMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}
