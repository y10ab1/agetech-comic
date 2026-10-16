"use client";

import { useEffect, useRef } from "react";
import type { NarrationAudio, ScriptSegment } from "@/data/types";
import { segmentAtTime } from "@/lib/narrationTiming";
import { useSpeech, type SpeechRate } from "./useSpeech";

/**
 * 旁白音檔的播放速度：後端 TTS 本身已是慢速溫柔語調，
 * 預設「慢」(0.8) 對應原速，避免再放慢失真。
 */
const AUDIO_RATE: Record<SpeechRate, number> = { 1: 1.15, 0.8: 1, 0.6: 0.85 };

export interface StoryPlayerCallbacks {
  /** 開始念第 i 句（用於字幕／象限高亮） */
  onSegment: (index: number) => void;
  /** 全部念完 */
  onEnd: () => void;
}

/**
 * 劇場／回憶內頁的朗讀器：有後端旁白音檔就播音檔（LIFF WebView 沒有
 * speechSynthesis，issue #9），依時間推算目前句子；沒有音檔或播放失敗時
 * 退回瀏覽器 speechSynthesis 逐句朗讀（從失敗當下那句接著念）。
 */
export function useStoryPlayer(initialRate: SpeechRate = 0.8) {
  const speech = useSpeech(initialRate);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // 每次 play／cancel 遞增；舊的回呼（已取消的音檔或語句）一律忽略
  const tokenRef = useRef(0);

  const stopAudio = () => {
    const a = audioRef.current;
    if (a) {
      a.ontimeupdate = a.onended = a.onerror = null;
      a.pause();
      a.removeAttribute("src");
      a.load();
    }
    audioRef.current = null;
  };

  useEffect(() => () => stopAudio(), []);

  // 純函式遞迴（同頁面原本的逐句模式）；每次 render 重建即可，不需 useCallback
  function speakFrom(
    token: number,
    segments: ScriptSegment[],
    index: number,
    cb: StoryPlayerCallbacks,
  ) {
    if (token !== tokenRef.current) return;
    if (index >= segments.length) {
      cb.onEnd();
      return;
    }
    cb.onSegment(index);
    speech.speak(segments[index].text, () => speakFrom(token, segments, index + 1, cb));
  }

  const play = (
    segments: ScriptSegment[],
    audio: NarrationAudio | undefined,
    cb: StoryPlayerCallbacks,
  ) => {
      stopAudio();
      speech.cancel();
      const token = ++tokenRef.current;
      if (!audio || typeof Audio === "undefined") {
        speakFrom(token, segments, 0, cb);
        return;
      }
      let current = 0;
      let fellBack = false;
      const fallback = () => {
        if (fellBack || token !== tokenRef.current) return;
        fellBack = true;
        stopAudio();
        speakFrom(token, segments, current, cb);
      };
      const a = new Audio(audio.url);
      a.preload = "auto";
      a.playbackRate = AUDIO_RATE[speech.rate];
      a.ontimeupdate = () => {
        if (token !== tokenRef.current) return;
        const i = segmentAtTime(a.currentTime * 1000, segments, audio);
        if (i !== current) {
          current = i;
          cb.onSegment(i);
        }
      };
      a.onended = () => {
        if (token !== tokenRef.current) return;
        stopAudio();
        cb.onEnd();
      };
      a.onerror = fallback;
      audioRef.current = a;
      cb.onSegment(0);
      a.play().catch(fallback);
  };

  const pause = () => {
    if (audioRef.current) audioRef.current.pause();
    else speech.pause();
  };

  const resume = () => {
    if (audioRef.current) void audioRef.current.play().catch(() => undefined);
    else speech.resume();
  };

  const cancel = () => {
    tokenRef.current++;
    stopAudio();
    speech.cancel();
  };

  const setRate = (r: SpeechRate) => {
    speech.setRate(r);
    if (audioRef.current) audioRef.current.playbackRate = AUDIO_RATE[r];
  };

  return { rate: speech.rate, setRate, play, pause, resume, cancel };
}
