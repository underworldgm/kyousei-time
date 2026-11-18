import { useEffect, useState } from "react";
import { liveQuery } from "dexie";

/** Dexie liveQuery を React state にする。IndexedDB のエラーは error として返す。 */
export function useLive<T>(query: () => Promise<T>, initial: T): { value: T; error: Error | null; loaded: boolean } {
  const [value, setValue] = useState<T>(initial);
  const [error, setError] = useState<Error | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({
      next: (v) => {
        setValue(v);
        setLoaded(true);
        setError(null);
      },
      error: (e) => setError(e instanceof Error ? e : new Error(String(e))),
    });
    return () => sub.unsubscribe();
  }, [query]);
  return { value, error, loaded };
}
