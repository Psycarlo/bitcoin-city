import { useEffect, useState } from "react";

interface Settled<T> {
  error?: unknown;
  key: string;
  value?: T;
}

export interface AsyncResult<T> {
  error?: unknown;
  loading: boolean;
  value?: T;
}

/**
 * Loads `key` with `load` and loads again whenever the key changes. Results
 * that arrive for an older key are dropped. `load` must be stable.
 */
export const useAsync = <T>(
  key: string | undefined,
  load: (key: string, signal: AbortSignal) => Promise<T>
): AsyncResult<T> => {
  const [settled, setSettled] = useState<Settled<T>>();

  useEffect(() => {
    if (key === undefined) {
      return;
    }
    const controller = new AbortController();
    const run = async () => {
      try {
        const value = await load(key, controller.signal);
        if (!controller.signal.aborted) {
          setSettled({ key, value });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setSettled({ error, key });
        }
      }
    };
    void run();
    return () => {
      controller.abort();
    };
  }, [key, load]);

  const current = settled?.key === key ? settled : undefined;
  return {
    error: current?.error,
    loading: key !== undefined && current === undefined,
    value: current?.value,
  };
};
