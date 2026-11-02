import { useCallback, useEffect, useState } from 'react';
import { BACKEND, api, enc } from '../services/api';
import { usePersistentState } from './storage';

export interface Collection<T extends { id: string }> {
  items: T[];
  save: (item: T) => Promise<void>;
  remove: (id: string) => Promise<void>;
  loaded: boolean;
}

/**
 * Coleção identificada por `id`:
 *  - modo protótipo: persistida no navegador (localStorage), com dados de exemplo;
 *  - modo backend: GET/PUT/DELETE em /api/collections/{name} (o servidor audita cada alteração).
 * A escolha do modo é fixa no build (VITE_DATA_SOURCE), então os hooks não mudam entre renderizações.
 */
export function useCollection<T extends { id: string }>(name: string, localKey: string, seed: T[] | (() => T[]), onError: (msg: string) => void): Collection<T> {
  if (!BACKEND) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [items, setItems] = usePersistentState<T[]>(localKey, seed);
    return {
      items,
      loaded: true,
      // eslint-disable-next-line react-hooks/rules-of-hooks
      save: useCallback(async (item: T) => setItems((p) => (p.some((x) => x.id === item.id) ? p.map((x) => (x.id === item.id ? item : x)) : [item, ...p])), [setItems]),
      // eslint-disable-next-line react-hooks/rules-of-hooks
      remove: useCallback(async (id: string) => setItems((p) => p.filter((x) => x.id !== id)), [setItems]),
    };
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [items, setItems] = useState<T[]>([]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [loaded, setLoaded] = useState(false);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    api<T[]>('GET', `/api/collections/${name}`).then(setItems).catch((e) => onError(`${name}: ${e.message}`)).finally(() => setLoaded(true));
  }, [name]); // eslint-disable-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const save = useCallback(async (item: T) => {
    let prev: T[] = [];
    setItems((p) => { prev = p; return p.some((x) => x.id === item.id) ? p.map((x) => (x.id === item.id ? item : x)) : [item, ...p]; });
    try {
      await api('PUT', `/api/collections/${name}/${enc(item.id)}`, item);
    } catch (e) {
      setItems(prev);
      onError((e as Error).message);
    }
  }, [name, onError]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const remove = useCallback(async (id: string) => {
    let prev: T[] = [];
    setItems((p) => { prev = p; return p.filter((x) => x.id !== id); });
    try {
      await api('DELETE', `/api/collections/${name}/${enc(id)}`);
    } catch (e) {
      setItems(prev);
      onError((e as Error).message);
    }
  }, [name, onError]);
  return { items, save, remove, loaded };
}
