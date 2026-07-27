"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AccessibleButton } from "@/components/AccessibleButton";
import { BackButton } from "@/components/BackButton";
import { ScreenHeading } from "@/components/ScreenHeading";
import { SubtitleBox } from "@/components/SubtitleBox";
import { ComicPanels } from "@/components/ComicPanels";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Icon } from "@/components/Icon";
import { useSpeech, SPEECH_RATES, type SpeechRate } from "@/hooks/useSpeech";
import { buildMemoryScript } from "@/data/comic";
import { loadStamps, stampDateText } from "@/data/collection";
import { loadProfile } from "@/data/profile";
import { DEFAULT_SALUTATION } from "@/data/questions";
import { getTag } from "@/data/tags";
import type { ScriptSegment, StampRecord } from "@/data/types";

type Phase = "ready" | "playing" | "paused" | "done";

const RATE_LABEL: Record<SpeechRate, string> = {
  1: "正常",
  0.8: "慢",
  0.6: "最慢",
};

const COVER_PLACEHOLDER = "/assets/comics/cover-placeholder.svg";

/**
 * 回憶內頁 —— 集章存摺點進單枚印章，重溫那一天的漫畫與故事。
 * 有存 segments 的印章原句重播（與當天劇場一字不差）；
 * 沒存的（既有資料）由 logline 重建「阿咪憑記憶重述」腳本——退化不解釋。
 * 頁面刻意安靜（無進度、無獎勵、無編輯），像翻開日記本的一頁。
 */
export default function DiaryDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const speech = useSpeech(0.8);

  // undefined＝讀取中（避免 SSR/hydration 不一致）；null＝找不到
  const [stamp, setStamp] = useState<StampRecord | null | undefined>(undefined);
  const [segments, setSegments] = useState<ScriptSegment[]>([]);
  const [phase, setPhase] = useState<Phase>("ready");
  const [segIndex, setSegIndex] = useState(0);
  const segmentsRef = useRef<ScriptSegment[]>([]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const found = loadStamps().find((s) => s.id === id) ?? null;
    setStamp(found);
    if (found) {
      const segs = found.segments?.length
        ? found.segments
        : buildMemoryScript(
            found,
            loadProfile()?.salutation || DEFAULT_SALUTATION,
            stampDateText(found.createdAt),
          );
      segmentsRef.current = segs;
      setSegments(segs);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [id]);

  // 逐段朗讀：唸完一段自動推進下一段（同劇場的純函式模式）
  const speakFrom = (index: number) => {
    const segs = segmentsRef.current;
    if (index >= segs.length) {
      setPhase("done");
      return;
    }
    setSegIndex(index);
    setPhase("playing");
    speech.speak(segs[index].text, () => speakFrom(index + 1));
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

  if (stamp === undefined) return null;

  if (stamp === null) {
    return (
      <main id="main">
        <div className="mx-auto max-w-[640px]">
          <ScreenHeading>咦，翻不到這一頁</ScreenHeading>
          <ErrorNotice message="咦，這一頁阿咪翻不到了。我們回存摺，再挑一篇來看好嗎？" />
          <AccessibleButton
            size="lg"
            icon={<Icon name="book" />}
            onClick={() => router.push("/collection")}
          >
            回集章存摺
          </AccessibleButton>
        </div>
      </main>
    );
  }

  const name = stamp.narratorName || "阿咪";
  const dateText = stampDateText(stamp.createdAt);
  // 舊資料沒 title 不用 logline 硬湊（「高興 + 菜市場」放標題像壞掉），改日期樣板
  const title = stamp.title ?? `${dateText}的回憶`;
  const hasPanels = Boolean(stamp.panels?.length);
  const isPlaybackActive = phase === "playing" || phase === "paused";
  const seg = segments[segIndex];

  const subtitleText = isPlaybackActive
    ? seg?.text ?? ""
    : phase === "done"
      ? `說完了。這一天真好，${name}幫您好好收著。`
      : `翻開${dateText}的這一頁，想聽${name}再說一次嗎？`;

  const tags = (stamp.tags ?? [])
    .map((tid) => getTag(tid))
    .filter((t) => t !== undefined);

  return (
    <main id="main">
      <div className="mx-auto max-w-[640px]">
        <p className="mb-1 text-[20px] font-bold text-[color:var(--color-primary-strong)]">
          {stampDateText(stamp.createdAt, true)} · {name}說的故事
        </p>
        <ScreenHeading>{title}</ScreenHeading>

        {/* 漫畫：有存 panels 原樣重現（朗讀逐格高亮）；沒存的顯示封面 */}
        {hasPanels ? (
          <ComicPanels
            title={`「${title}」的四格漫畫`}
            panels={stamp.panels!}
            activeIndex={isPlaybackActive ? seg?.panelIndex ?? -1 : -1}
          />
        ) : (
          <img
            className="w-full rounded-[var(--radius)] border-[3px] border-[color:var(--color-neutral-border)] bg-[#efebe0]"
            src={stamp.coverSrc || COVER_PLACEHOLDER}
            alt={`「${title}」的漫畫封面（圖片準備中）`}
          />
        )}

        <div className="mt-5 flex flex-col gap-5">
          <SubtitleBox
            text={subtitleText}
            accent={isPlaybackActive && seg?.accent}
          />

          {/* 語速三段（同劇場同元件同位置） */}
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

          {/* 重聽：本頁唯一磚紅主行動；整段從頭播，不做逐句跳播 */}
          <div className="flex flex-col gap-[var(--touch-gap)]">
            {phase === "ready" && (
              <AccessibleButton
                size="xl"
                icon={<Icon name="play" />}
                block
                debounce={false}
                onClick={handlePlay}
              >
                想再聽一次嗎？請{name}重講這個故事
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
            {(phase === "playing" || phase === "paused" || phase === "done") && (
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

          {/* 完整故事文字（朗讀中逐句高亮；文字語音並存 WCAG 1.4.2） */}
          <section
            aria-label="完整故事文字"
            className="rounded-[var(--radius)] border-[3px] border-[color:var(--color-neutral-border)] bg-white p-5"
          >
            <h2 className="mb-3 text-[24px]">完整故事</h2>
            {segments.map((s, i) => (
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

          {/* 回憶標籤：純顯示（想看同類回憶回存摺用篩選；一頁一任務） */}
          {tags.length > 0 && (
            <section aria-label="這一天的回憶標籤">
              <div className="flex flex-wrap gap-3">
                {tags.map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1 rounded-full border-2 border-[#b4b2a9] bg-[#f6f1e4] px-4 py-1 text-[16px] font-bold text-[color:var(--color-text)]"
                  >
                    <span aria-hidden="true">{t.icon}</span>
                    {t.label}
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="mt-9">
          <BackButton to="/collection" label="回集章存摺" />
        </div>
      </div>
    </main>
  );
}
