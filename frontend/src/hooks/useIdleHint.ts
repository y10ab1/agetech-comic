"use client";

import { useEffect, useState } from "react";

/**
 * 閒置引導 —— 對應 wcag v1.md §2.1：長輩不知所措（閒置一段時間）時，
 * 以溫和的視覺提示引導操作。無自動語音、不強迫、任何互動即解除。
 *
 * @param delayMs 閒置多久才算（預設 10 秒）
 * @param active  false 時完全停用（例如朗讀播放中不要打擾）
 * @returns idle  是否處於閒置狀態
 */
export function useIdleHint(delayMs = 10000, active = true): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    // active 切換時歸零，避免上一段的 idle 狀態殘留（如朗讀結束瞬間跳提示）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIdle(false);
    if (!active) return;
    let timer: number;

    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), delayMs);
    };
    const onActivity = () => {
      setIdle(false);
      schedule();
    };

    schedule();
    const events = ["pointerdown", "keydown", "touchstart", "scroll"] as const;
    events.forEach((e) =>
      window.addEventListener(e, onActivity, { passive: true }),
    );
    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [delayMs, active]);

  return active && idle;
}
