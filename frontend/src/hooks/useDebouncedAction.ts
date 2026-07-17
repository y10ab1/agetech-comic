"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 防手抖連點（Debounce）—— 對應高齡人因防錯機制。
 * 點擊後立即 busy 並在 windowMs 內忽略後續點擊，視為單次有效。
 */
export function useDebouncedAction(windowMs = 1500) {
  const [busy, setBusy] = useState(false);
  const lockRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const run = useCallback(
    (action: () => void) => {
      if (lockRef.current) return;
      lockRef.current = true;
      setBusy(true);
      action();
      timerRef.current = window.setTimeout(() => {
        lockRef.current = false;
        setBusy(false);
      }, windowMs);
    },
    [windowMs],
  );

  return { run, busy };
}
