import { useEffect, useState } from 'react';

/** Estado persistido no navegador (preferências e dados de protótipo). Falha silenciosamente. */
export function usePersistentState<T>(key: string, initial: T | (() => T)) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) return JSON.parse(raw) as T;
    } catch {
      /* armazenamento indisponível */
    }
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignora */
    }
  }, [key, value]);
  return [value, setValue] as const;
}
