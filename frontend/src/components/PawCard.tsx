"use client";

import { useId, useState } from "react";
import { Icon } from "./Icon";
import { REWARDS } from "@/data/rewards";

/** 貓腳印章（AmiCat 同風格：磚紅圓章＋象牙白貓掌） */
export function PawStamp({ size = 44 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="22" fill="#8C3B24" stroke="#1E1E24" strokeWidth="2.5" />
      <ellipse cx="24" cy="29" rx="8.5" ry="7" fill="#FAF6EE" />
      <circle cx="14.5" cy="20" r="3.6" fill="#FAF6EE" />
      <circle cx="24" cy="16.5" r="3.8" fill="#FAF6EE" />
      <circle cx="33.5" cy="20" r="3.6" fill="#FAF6EE" />
    </svg>
  );
}

/** 空格（虛線圓） */
function EmptySlot({ size = 44 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" focusable="false">
      <circle
        cx="24"
        cy="24"
        r="21"
        fill="#FFFFFF"
        stroke="#8A877C"
        strokeWidth="2.5"
        strokeDasharray="5 5"
      />
    </svg>
  );
}

/** 由 REWARDS 參數動態產生白話規則（調參數時說明自動同步） */
function ruleLines(): string[] {
  const lines = [
    "每記錄一天，就蓋 1 個腳印。",
    "腳印用累計的，休息幾天也不會不見。",
  ];
  for (const m of REWARDS.milestones) {
    if (m.generations) {
      lines.push(`蓋到第 ${m.at} 格：加送 ${m.generations} 次漫畫生成。`);
    }
    if (m.styles) {
      lines.push(
        `蓋滿第 ${m.at} 格：解鎖 ${m.styles} 種新畫風${
          m.fallbackGenerations
            ? `（畫風集齊後改送 ${m.fallbackGenerations} 次生成）`
            : ""
        }。`,
      );
    }
  }
  lines.push(`集滿 ${REWARDS.cycleLength} 格就換一張新卡，繼續蓋。`);
  return lines;
}

interface PawCardProps {
  /** 累計總章數 */
  totalStamps: number;
}

/**
 * 集點卡 —— 高齡友善進度視覺（大格腳印，長輩熟悉的集點隱喻）。
 * 里程碑格以禮物 icon 標記；規則說明用 inline 揭示區（aria-expanded），
 * 不用 hover tooltip（觸控無 hover、WCAG 1.4.13 風險、手抖易閃現閃消）。
 */
export function PawCard({ totalStamps }: PawCardProps) {
  const { cycleLength, milestones } = REWARDS;
  const [open, setOpen] = useState(false);
  const panelId = useId();

  // 本輪已蓋格數：剛集滿一輪的當下顯示滿卡（下一枚才開新卡）
  const rem = totalStamps % cycleLength;
  const filled = totalStamps > 0 && rem === 0 ? cycleLength : rem;
  const milestoneAts = new Set(milestones.map((m) => m.at));

  const nextMilestone = milestones.find((m) => m.at > filled);
  const hint = nextMilestone
    ? `再蓋 ${nextMilestone.at - filled} 個腳印，就有${
        nextMilestone.styles ? "新畫風" : "額外生成次數"
      }可以拿！`
    : "這張卡蓋滿了，下一枚腳印開新卡！";

  return (
    <section
      aria-label="本輪集點卡"
      className="rounded-[var(--radius)] border-[3px] border-[color:var(--color-neutral-border)] bg-white p-5"
    >
      <h2 className="mb-3 text-[24px]">本輪集點卡</h2>
      <ol className="m-0 flex list-none justify-between gap-1 p-0">
        {Array.from({ length: cycleLength }, (_, i) => {
          const slot = i + 1;
          const done = slot <= filled;
          return (
            <li key={slot} className="flex flex-col items-center gap-1">
              {done ? <PawStamp /> : <EmptySlot />}
              <span
                className="flex h-[22px] items-center text-[color:var(--color-primary-strong)]"
                aria-hidden="true"
              >
                {milestoneAts.has(slot) && <Icon name="gift" size={20} />}
              </span>
              <span className="sr-only">
                第 {slot} 格{done ? "已蓋章" : "未蓋章"}
                {milestoneAts.has(slot) ? "，有獎勵" : ""}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="m-0 mt-2 text-[20px] font-bold text-[color:var(--color-text)]">
        {hint}
      </p>

      {/* 規則揭示區：大按鈕點開 inline 展開，取代 hover tooltip */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="mt-4 flex min-h-[56px] w-full cursor-pointer items-center gap-3 rounded-[var(--radius)] border-2 border-[color:var(--color-neutral-border)] bg-[#f6f1e4] px-4 py-2 text-left text-[20px] font-bold text-[color:var(--color-text)]"
      >
        <span className="text-[color:var(--color-primary-strong)]">
          <Icon name="gift" size={26} />
        </span>
        <span className="flex-1">集腳印有什麼好處？</span>
        <span
          className={`transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <Icon name="chevron-down" size={24} />
        </span>
      </button>
      {open && (
        <div
          id={panelId}
          className="mt-3 rounded-[var(--radius)] bg-[#faf6ee] p-4"
        >
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {ruleLines().map((line, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-[20px] leading-[1.5]"
              >
                <span
                  className="mt-1 shrink-0 text-[color:var(--color-success)]"
                  aria-hidden="true"
                >
                  <Icon name="check" size={20} />
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
