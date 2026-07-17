"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AccessibleButton } from "@/components/AccessibleButton";
import { ScreenHeading } from "@/components/ScreenHeading";
import { Icon } from "@/components/Icon";
import { markOnboarded } from "@/data/profile";

/**
 * 新手引導 —— 一次一張大圖卡（先 mock 示意圖，之後替換）。
 * 大「下一步/開始」＋可跳過；完成後標記 onboarded 並開始第一則日記。
 */
interface Slide {
  emoji: string;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    emoji: "💬",
    title: "我是阿咪，您的說故事小幫手",
    body: "接下來我會陪您把今天的生活，變成一則可愛的漫畫。",
  },
  {
    emoji: "🖐️",
    title: "用點的、拍照、或用講的都行",
    body: "不用打字。您只要選圖卡、或拍張照片、或直接跟我說今天做了什麼。",
  },
  {
    emoji: "📖",
    title: "我會畫成漫畫，還會念給您聽",
    body: "做好之後我會慢慢念故事給您聽，聽不清楚可以再聽一次。",
  },
  {
    emoji: "💚",
    title: "一鍵分享家人，還能集印章",
    body: "喜歡的話可以傳給孫子；每記錄一天，就在集章存摺蓋一個章。",
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  const finish = () => {
    markOnboarded(new Date().toISOString());
    router.push("/q/mood");
  };

  return (
    <main id="main">
      <div className="mx-auto max-w-[640px]">
        <nav aria-label="教學進度" className="mb-4">
          <p className="mb-2 text-[20px] font-bold text-[color:var(--color-text-soft)]">
            第 {index + 1} 張，共 {SLIDES.length} 張
          </p>
          <ol className="flex gap-3 p-0" aria-hidden="true">
            {SLIDES.map((s, i) => (
              <li
                key={s.title}
                className="h-3.5 w-7 rounded-full"
                style={{
                  background:
                    i <= index ? "var(--color-primary-strong)" : "#d8d3c4",
                }}
              />
            ))}
          </ol>
        </nav>

        <ScreenHeading key={index}>{slide.title}</ScreenHeading>

        {/* 示意圖佔位（之後替換為正式圖） */}
        <div
          className="my-6 flex aspect-video items-center justify-center rounded-[var(--radius)] border-[3px] border-[color:var(--color-neutral-border)] bg-[#f2ecdf]"
          role="img"
          aria-label={`示意圖：${slide.title}`}
        >
          <span className="text-[96px]" aria-hidden="true">
            {slide.emoji}
          </span>
        </div>

        <p className="mb-8 text-[24px] leading-[1.6]">{slide.body}</p>

        <div className="flex flex-col gap-[var(--touch-gap)]">
          {isLast ? (
            <AccessibleButton
              size="xl"
              variant="primary"
              icon={<Icon name="play" />}
              block
              onClick={finish}
            >
              開始做我的第一則日記
            </AccessibleButton>
          ) : (
            <AccessibleButton
              size="xl"
              variant="primary"
              icon={<Icon name="arrow-right" />}
              block
              debounce={false}
              onClick={() => setIndex((i) => i + 1)}
            >
              下一步
            </AccessibleButton>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4">
            {index > 0 ? (
              <AccessibleButton
                size="md"
                variant="neutral"
                icon={<Icon name="arrow-left" />}
                debounce={false}
                onClick={() => setIndex((i) => i - 1)}
              >
                上一張
              </AccessibleButton>
            ) : (
              <span />
            )}
            {!isLast && (
              <AccessibleButton
                size="md"
                variant="ghost"
                debounce={false}
                onClick={finish}
              >
                跳過教學
              </AccessibleButton>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
