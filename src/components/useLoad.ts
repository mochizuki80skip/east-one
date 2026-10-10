"use client";

import { useCallback, useEffect, useState } from "react";

/** 画面表示時にデータを読み込む。reload() で読み直す。 */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let alive = true;
    load()
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, reload };
}
