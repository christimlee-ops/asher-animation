import { useState, useEffect } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    setMatches(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/** True when viewport is 1024px or narrower (typical tablet breakpoint) */
export function useIsTablet(): boolean {
  return useMediaQuery('(max-width: 1024px)');
}

/** True when viewport is 600px or narrower (mobile breakpoint) */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 600px)');
}
