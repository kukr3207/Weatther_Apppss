import { useEffect, useState } from 'react';

function preferredTheme() {
  if (typeof globalThis.matchMedia !== 'function') return 'dark';
  return globalThis.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme(theme = 'system') {
  const [systemTheme, setSystemTheme] = useState(preferredTheme);
  const resolvedTheme = theme === 'system' ? systemTheme : theme;

  useEffect(() => {
    if (typeof globalThis.matchMedia !== 'function') return undefined;
    const media = globalThis.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event) => setSystemTheme(event.matches ? 'dark' : 'light');
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    const root = globalThis.document?.documentElement;
    if (!root) return undefined;
    root.dataset.theme = resolvedTheme;
    root.style.colorScheme = resolvedTheme;
    return () => {
      delete root.dataset.theme;
      root.style.removeProperty('color-scheme');
    };
  }, [resolvedTheme]);

  return resolvedTheme;
}
