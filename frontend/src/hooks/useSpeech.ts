"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SpeechStatus = "idle" | "speaking" | "paused" | "ended";

/** wcag v1.md §3：語速三段 */
export const SPEECH_RATES = [1.0, 0.8, 0.6] as const;
export type SpeechRate = (typeof SPEECH_RATES)[number];

/**
 * 包裝瀏覽器 Web Speech API（SpeechSynthesis）。
 * 慢速朗讀、zh-TW、pause/resume、無倒數。
 * rate 可由使用者在 1.0 / 0.8 / 0.6x 之間切換（v1.md §3）。
 * 不支援時以估算時間觸發 onEnd，維持流程可用。
 */
export function useSpeech(initialRate: SpeechRate = 0.8) {
  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;
  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [rate, setRate] = useState<SpeechRate>(initialRate);
  const rateRef = useRef<SpeechRate>(initialRate);
  // 於 effect 同步（不可在 render 期間寫 ref），讓 speak 讀最新語速又保持穩定身分
  useEffect(() => {
    rateRef.current = rate;
  }, [rate]);

  const cancel = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setStatus("idle");
  }, [supported]);

  useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel();
    };
  }, [supported]);

  const speak = useCallback(
    (text: string, onEnd?: () => void) => {
      if (!supported) {
        const ms = Math.max(1200, text.length * 220);
        setStatus("speaking");
        window.setTimeout(() => {
          setStatus("ended");
          onEnd?.();
        }, ms);
        return;
      }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-TW";
      u.rate = rateRef.current;
      u.pitch = 1;
      u.onstart = () => setStatus("speaking");
      u.onend = () => {
        setStatus("ended");
        onEnd?.();
      };
      window.speechSynthesis.speak(u);
    },
    [supported],
  );

  const pause = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.pause();
    setStatus("paused");
  }, [supported]);

  const resume = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.resume();
    setStatus("speaking");
  }, [supported]);

  return { supported, status, rate, setRate, speak, pause, resume, cancel };
}
