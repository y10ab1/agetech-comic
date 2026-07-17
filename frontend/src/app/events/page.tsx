"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AccessibleButton } from "@/components/AccessibleButton";
import { BackButton } from "@/components/BackButton";
import { ScreenHeading } from "@/components/ScreenHeading";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Icon } from "@/components/Icon";
import { useFlow } from "@/context/FlowContext";
import {
  ACTION_TITLE,
  EVENT_POOL,
  MAX_EVENTS,
  QUESTIONS,
  WHO_HINT,
  WHO_OPTIONS,
  actionsForWho,
} from "@/data/questions";
import { suggestNextEvent } from "@/data/comic";
import { getNarrator } from "@/data/narrator";
import { unlockedStyles } from "@/data/rewards";

/**
 * 事件細節串接頁（v3 對象先行兩步式）——
 * 步驟A「今天跟誰在一起呀？」選對象 → 步驟B 依對象過濾行動（白名單矩陣），
 * 消滅複合句贅字；仍維持一頁一問題、圖卡連續串接（設上限）＋「幫我想」不打字。
 * 全程線性、無 Modal、每步有「就這樣，看漫畫」出口，含返回與逐段容錯移除。
 */
export default function EventBuilderPage() {
  const router = useRouter();
  const { selections, salutation, events, addEvent, removeLastEvent, narratorId } =
    useFlow();
  const narrator = getNarrator(narratorId);
  const [announce, setAnnounce] = useState("");
  /** 步驟B的對象（null＝步驟A選對象中） */
  const [whoPick, setWhoPick] = useState<string | null>(null);

  const missing = !selections.mood || !selections.place;
  useEffect(() => {
    if (missing) router.replace(`/q/${QUESTIONS[0].slug}`);
  }, [missing, router]);
  if (missing) return null;

  const atLimit = events.length >= MAX_EVENTS;
  const chosen = new Set(events.map((e) => e.value));
  const available = EVENT_POOL.filter((e) => !chosen.has(e.value));
  const who = salutation || "阿公阿嬤";
  /** 只顯示還有行動可選的對象（該對象行動選完就自動消失） */
  const whoAvailable = WHO_OPTIONS.filter(
    (w) => actionsForWho(w.value, chosen).length > 0,
  );
  const actions = whoPick ? actionsForWho(whoPick, chosen) : [];
  const whoPicked = WHO_OPTIONS.find((w) => w.value === whoPick);

  const handleSuggest = () => {
    const suggestion = suggestNextEvent(events, EVENT_POOL);
    if (!suggestion) return;
    addEvent(suggestion);
    setAnnounce(`${narrator.name}幫您加了一段：${suggestion.label}`);
  };

  return (
    <main id="main">
      <div className="mx-auto max-w-[720px]">
        <ScreenHeading>{who}今天還發生了什麼呢？</ScreenHeading>
        <p className="mb-6 text-[20px] text-[color:var(--color-text-soft)]">
          可以一直加，把今天的故事說得更完整；覺得夠了就按下面最大的按鈕看漫畫。
        </p>

        <section
          aria-label="今天的故事"
          className="mb-7 rounded-[var(--radius)] border-[3px] border-[color:var(--color-neutral-border)] bg-[#f6f1e4] p-5"
        >
          <h2 className="mb-3 text-[24px]">今天的故事</h2>
          <ol className="m-0 flex list-none flex-wrap gap-3 p-0">
            <li className="inline-flex items-center gap-2.5 rounded-full border-2 border-[color:var(--color-neutral-border)] bg-[#efe7d8] px-[18px] py-2.5 text-[20px] font-bold">
              <span aria-hidden="true">😊 </span>心情{selections.mood!.label}
            </li>
            <li className="inline-flex items-center gap-2.5 rounded-full border-2 border-[color:var(--color-neutral-border)] bg-[#efe7d8] px-[18px] py-2.5 text-[20px] font-bold">
              <span aria-hidden="true">📍 </span>
              {selections.place!.label}
            </li>
            {events.map((e, i) => (
              <li
                key={e.value}
                className="inline-flex items-center gap-2.5 rounded-full border-2 border-[color:var(--color-neutral-border)] bg-white px-[18px] py-2.5 text-[20px] font-bold"
              >
                <span aria-hidden="true">{e.icon} </span>
                {e.label}
                {i === events.length - 1 && (
                  <button
                    type="button"
                    className="ml-1 min-h-[44px] cursor-pointer rounded-full border-2 border-[color:var(--color-error)] bg-white px-3 py-1.5 text-[18px] font-bold text-[color:var(--color-error)]"
                    onClick={removeLastEvent}
                    aria-label={`移除「${e.label}」`}
                  >
                    ✕ 移除
                  </button>
                )}
              </li>
            ))}
          </ol>
          {events.length === 0 && (
            <p className="mt-3 mb-0 text-[20px] text-[color:var(--color-text-soft)]">
              還沒加事情，先從下面選選看今天跟誰在一起吧。
            </p>
          )}
        </section>

        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {announce}
        </p>

        {atLimit ? (
          <ErrorNotice
            message={`今天的故事已經很豐富囉！按下面最大的按鈕，看看${narrator.name}幫您畫的漫畫吧。`}
          />
        ) : whoPick === null ? (
          <section aria-label="選擇今天在一起的人">
            <h2 className="mb-2 text-[24px]">今天跟誰在一起呀？</h2>
            <p className="mb-4 text-[20px] text-[color:var(--color-text-soft)]">
              {WHO_HINT}
            </p>
            <ul className="m-0 mb-6 grid list-none grid-cols-1 gap-[var(--touch-gap)] p-0 sm:grid-cols-2">
              {whoAvailable.map((option) => (
                <li key={option.value}>
                  <AccessibleButton
                    size="lg"
                    variant="neutral"
                    icon={option.icon}
                    block
                    className="!justify-start !gap-4"
                    onClick={() => setWhoPick(option.value)}
                  >
                    {option.label}
                  </AccessibleButton>
                </li>
              ))}
            </ul>

            <AccessibleButton
              size="lg"
              variant="secondary"
              icon={<Icon name="bulb" />}
              block
              onClick={handleSuggest}
              disabled={available.length === 0}
            >
              讓{narrator.name}幫我想一段
            </AccessibleButton>
          </section>
        ) : (
          <section aria-label="選擇做了什麼事">
            <h2 className="mb-4 text-[24px]">
              {ACTION_TITLE[whoPick] ?? "做了什麼呀？"}
            </h2>
            <ul className="m-0 mb-6 grid list-none grid-cols-1 gap-[var(--touch-gap)] p-0 sm:grid-cols-2">
              {actions.map((combo) => (
                <li key={combo.value}>
                  <AccessibleButton
                    size="lg"
                    variant="neutral"
                    icon={combo.icon}
                    block
                    className="!justify-start !gap-4"
                    onClick={() => {
                      addEvent({
                        value: combo.value,
                        label: combo.label,
                        icon: combo.icon,
                      });
                      setWhoPick(null);
                      setAnnounce(`已加入：${combo.label}`);
                    }}
                  >
                    {combo.actionLabel}
                  </AccessibleButton>
                </li>
              ))}
            </ul>

            <AccessibleButton
              size="md"
              variant="neutral"
              icon={<Icon name="arrow-left" />}
              debounce={false}
              onClick={() => setWhoPick(null)}
            >
              換一個人{whoPicked ? `（不選${whoPicked.label}）` : ""}
            </AccessibleButton>
          </section>
        )}

        <div className="mt-9 flex flex-wrap items-center justify-between gap-[var(--touch-gap)]">
          <BackButton to={`/q/${QUESTIONS[QUESTIONS.length - 1].slug}`} />
          <AccessibleButton
            size="xl"
            variant="primary"
            icon={<Icon name="arrow-right" />}
            onClick={() =>
              // 解鎖 ≥2 種畫風才問畫風，否則直接看漫畫（維持一頁一問題）
              router.push(unlockedStyles().length > 1 ? "/style" : "/theater")
            }
            disabled={events.length === 0}
          >
            就這樣，看漫畫
          </AccessibleButton>
        </div>
      </div>
    </main>
  );
}
