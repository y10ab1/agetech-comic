"use client";

import { useParams, useRouter } from "next/navigation";
import { AccessibleButton } from "@/components/AccessibleButton";
import { BackButton } from "@/components/BackButton";
import { ScreenHeading } from "@/components/ScreenHeading";
import { useFlow } from "@/context/FlowContext";
import {
  QUESTIONS,
  QUESTION_BY_SLUG,
  nextSlug,
  prevSlug,
  renderTitle,
} from "@/data/questions";
import { getNarrator } from "@/data/narrator";
import { Icon } from "@/components/Icon";
import type { QuestionOption } from "@/data/types";

/**
 * 每則日記的導引圖卡（心情 / 地點）—— 一頁一問題 + 大圖示按鈕。
 * 稱呼已移到初次註冊/設定，這裡不再處理。
 */
export default function QuestionPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const router = useRouter();
  const { choose, selections, salutation, narratorId } = useFlow();
  const narrator = getNarrator(narratorId);

  const question = QUESTION_BY_SLUG[slug];
  const stepIndex = QUESTIONS.findIndex((q) => q.slug === slug);

  if (!question) {
    if (typeof window !== "undefined") router.replace(`/q/${QUESTIONS[0].slug}`);
    return null;
  }

  const prev = prevSlug(slug);

  const handleChoose = (option: QuestionOption) => {
    choose(question.id, option);
    const next = nextSlug(slug);
    router.push(next ? `/q/${next}` : "/events");
  };

  return (
    <main id="main">
      <div className="mx-auto max-w-[640px]">
        <nav aria-label="流程進度" className="mb-4">
          <p className="mb-2 text-[20px] font-bold text-[color:var(--color-text-soft)]">
            第 {stepIndex + 1} 步，共 {QUESTIONS.length} 步
          </p>
          <ol className="flex gap-3 p-0" aria-hidden="true">
            {QUESTIONS.map((q, i) => (
              <li
                key={q.id}
                className="h-3.5 w-7 rounded-full"
                style={{
                  background:
                    i <= stepIndex ? "var(--color-primary-strong)" : "#d8d3c4",
                }}
              />
            ))}
          </ol>
        </nav>

        <ScreenHeading>
          {renderTitle(question.title, salutation, narrator.name)}
        </ScreenHeading>

        <ul className="m-0 flex list-none flex-col gap-[var(--touch-gap)] p-0">
          {question.options.map((option) => {
            const selected = selections[question.id]?.value === option.value;
            return (
              <li key={option.value}>
                <AccessibleButton
                  size="xl"
                  variant={selected ? "primary" : "neutral"}
                  icon={option.icon}
                  block
                  aria-pressed={selected}
                  className="!justify-start !gap-5"
                  onClick={() => handleChoose(option)}
                >
                  {/* 選中＝磚紅底＋✓ 雙重訊號（WCAG 1.4.1 不靠純色彩） */}
                  <span className="flex w-full items-center gap-3">
                    {option.label}
                    {selected && (
                      <Icon name="check" size={32} className="ml-auto" />
                    )}
                  </span>
                </AccessibleButton>
              </li>
            );
          })}
        </ul>

        <div className="mt-10">
          <BackButton to={prev ? `/q/${prev}` : "/home"} />
        </div>
      </div>
    </main>
  );
}
