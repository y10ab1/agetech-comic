"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AccessibleButton } from "@/components/AccessibleButton";
import { BackButton } from "@/components/BackButton";
import { ScreenHeading } from "@/components/ScreenHeading";
import { SubtitleBox } from "@/components/SubtitleBox";
import { CharacterStage } from "@/components/CharacterStage";
import { ComicPanels } from "@/components/ComicPanels";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Icon } from "@/components/Icon";
import { useFlow } from "@/context/FlowContext";
import { useSpeech, SPEECH_RATES, type SpeechRate } from "@/hooks/useSpeech";
import { useIdleHint } from "@/hooks/useIdleHint";
import { isComplete } from "@/data/logline";
import { createComic } from "@/data/comic";
import { getNarrator } from "@/data/narrator";
import { QUESTIONS } from "@/data/questions";
import type { DisplayScript } from "@/data/types";

type Phase = "loading" | "ready" | "playing" | "paused" | "done";

const RATE_LABEL: Record<SpeechRate, string> = {
  1: "正常",
  0.8: "慢",
  0.6: "最慢",
};

/**
 * 虛擬人劇場 + 漫畫 —— 生成後先呈現「可閱讀故事文字 + 漫畫」，
 * 再由使用者主動觸發朗讀（WCAG 1.4.2；文字與語音並存）。
 * 慢速 TTS 逐段朗讀、同步切換貓咪表情與高亮漫畫格；語速三段、無倒數。
 */
export default function TheaterPage() {
  const router = useRouter();
  const { userId, salutation, selections, events, narratorId, styleId } =
    useFlow();
  const narrator = getNarrator(narratorId);
  const speech = useSpeech(0.8);

  const [script, setScript] = useState<DisplayScript | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [segIndex, setSegIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const scriptRef = useRef<DisplayScript | null>(null);

  const complete = isComplete(selections, events);
  // 閒置引導：只在「等待開始/聽完」時偵測，朗讀中不打擾（hooks 需無條件呼叫）
  const idle = useIdleHint(10000, phase === "ready" || phase === "done");

  useEffect(() => {
    if (!complete) return;
    // 初始 state 已是 loading/failed=false，故 effect 內只做非同步生成
    let alive = true;
    createComic({ userId, salutation, selections, events, narratorId, styleId })
      .then((s) => {
        if (!alive) return;
        scriptRef.current = s;
        setScript(s);
        setPhase("ready");
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete]);

  // 逐段朗讀：唸完一段自動推進下一段（純函式，避免遞迴 useCallback 的依賴問題）
  const speakFrom = (index: number) => {
    const s = scriptRef.current;
    if (!s) return;
    if (index >= s.segments.length) {
      setPhase("done");
      return;
    }
    setSegIndex(index);
    setPhase("playing");
    speech.speak(s.segments[index].text, () => speakFrom(index + 1));
  };

  const handlePlay = () => speakFrom(0);
  const handlePause = () => {
    speech.pause();
    setPhase("paused");
  };
  const handleResume = () => {
    speech.resume();
    setPhase("playing");
  };
  const handleReplay = () => {
    speech.cancel();
    speakFrom(0);
  };

  if (!complete) {
    return (
      <main id="main">
        <ErrorNotice message="我們先一起選好今天的心情、地點和做的事，再來看漫畫喔！" />
        <AccessibleButton
          size="lg"
          icon={<Icon name="arrow-right" />}
          onClick={() => router.push(`/q/${QUESTIONS[0].slug}`)}
        >
          回去選擇
        </AccessibleButton>
      </main>
    );
  }

  const isPlaybackActive = phase === "playing" || phase === "paused";
  const seg = script?.segments[segIndex];
  const subtitleText =
    phase === "loading"
      ? `${narrator.name}正在把您的故事畫成漫畫，請稍等一下下…`
      : isPlaybackActive
        ? seg?.text ?? ""
        : `故事和漫畫都準備好了，想聽${narrator.name}念給您聽嗎？`;

  return (
    <main id="main">
      <ScreenHeading>{narrator.name}說故事時間</ScreenHeading>

      {failed && (
        <ErrorNotice message="故事畫到一半好像卡住了，請點下面的黃色按鈕再試一次喔！" />
      )}

      <p className="sr-only" aria-live="polite">
        {phase === "loading" ? "正在生成漫畫，請稍候" : ""}
      </p>

      <div className="grid grid-cols-1 items-start gap-7 md:grid-cols-2">
        {/* 左：說書人 + 字幕 + 控制 */}
        <div className="flex flex-col gap-5">
          <CharacterStage name={narrator.name} idle={idle} />

          {/* 閒置 10 秒：溫和文字提示（無自動語音，任何互動即消失） */}
          {idle && (
            <div
              role="status"
              className="rounded-[var(--radius)] border-[3px] border-[color:var(--color-neutral-border)] bg-white p-4 text-[22px] font-bold"
            >
              {narrator.name}：點下面的大按鈕，我念今天的漫畫給您聽喔！
            </div>
          )}

          <SubtitleBox
            text={subtitleText}
            accent={isPlaybackActive && seg?.accent}
          />

          {/* 語速三段（v1.md §3） */}
          <div
            role="group"
            aria-label="朗讀速度"
            className="flex flex-wrap items-center gap-3"
          >
            <span className="text-[20px] font-bold">朗讀速度：</span>
            {SPEECH_RATES.map((r) => (
              <AccessibleButton
                key={r}
                size="md"
                variant={speech.rate === r ? "primary" : "neutral"}
                debounce={false}
                aria-pressed={speech.rate === r}
                onClick={() => speech.setRate(r)}
              >
                {RATE_LABEL[r]}
              </AccessibleButton>
            ))}
          </div>

          <div className="flex flex-col gap-[var(--touch-gap)]">
            {phase === "ready" && (
              <AccessibleButton
                size="xl"
                icon={<Icon name="play" />}
                block
                debounce={false}
                onClick={handlePlay}
              >
                要{narrator.name}念故事給您聽嗎？開始朗讀
              </AccessibleButton>
            )}
            {phase === "playing" && (
              <AccessibleButton
                size="lg"
                variant="secondary"
                icon={<Icon name="pause" />}
                block
                debounce={false}
                onClick={handlePause}
              >
                暫停
              </AccessibleButton>
            )}
            {phase === "paused" && (
              <AccessibleButton
                size="lg"
                icon={<Icon name="play" />}
                block
                debounce={false}
                onClick={handleResume}
              >
                繼續聽
              </AccessibleButton>
            )}
            {(phase === "playing" ||
              phase === "paused" ||
              phase === "done") && (
              <AccessibleButton
                size="md"
                variant="neutral"
                icon={<Icon name="replay" />}
                block
                debounce={false}
                onClick={handleReplay}
              >
                從頭再聽一次
              </AccessibleButton>
            )}
          </div>
        </div>

        {/* 右：漫畫 + 可閱讀故事 */}
        <div>
          {script && (
            <>
              <ComicPanels
                title={`${salutation || "阿公阿嬤"}的四格漫畫：${script.loglineText}`}
                panels={script.panels}
                activeIndex={isPlaybackActive ? seg?.panelIndex ?? -1 : -1}
              />
              <section
                aria-label="完整故事文字"
                className="mt-6 rounded-[var(--radius)] border-[3px] border-[color:var(--color-neutral-border)] bg-white p-5"
              >
                <h2 className="mb-3 text-[24px]">完整故事</h2>
                {script.segments.map((s, i) => (
                  <p
                    key={i}
                    className="mb-3 rounded-lg px-2 py-1 text-[20px] leading-[1.6]"
                    style={
                      isPlaybackActive && i === segIndex
                        ? { background: "#fff3c4", fontWeight: 700 }
                        : undefined
                    }
                  >
                    {s.text}
                  </p>
                ))}
              </section>
            </>
          )}
        </div>
      </div>

      <div className="mt-10 flex flex-wrap justify-between gap-[var(--touch-gap)]">
        <BackButton to="/events" />
        <AccessibleButton
          size="lg"
          variant="primary"
          icon={<Icon name="arrow-right" />}
          onClick={() => {
            speech.cancel();
            router.push("/share");
          }}
        >
          我喜歡，下一步分享
        </AccessibleButton>
      </div>
    </main>
  );
}
