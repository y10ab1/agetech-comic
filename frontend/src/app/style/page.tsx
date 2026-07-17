"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AccessibleButton } from "@/components/AccessibleButton";
import { BackButton } from "@/components/BackButton";
import { ScreenHeading } from "@/components/ScreenHeading";
import { Icon } from "@/components/Icon";
import { useFlow } from "@/context/FlowContext";
import { isComplete } from "@/data/logline";
import { QUESTIONS } from "@/data/questions";
import {
  REWARDS,
  STYLES,
  unlockedStyles,
  type ComicStyle,
} from "@/data/rewards";

/**
 * 畫風選擇頁 —— 只有解鎖 2 種以上才會進到這裡（事件頁自動跳過）。
 * 一頁一問題；鎖住的畫風以資訊列呈現（非灰色 disabled 按鈕），
 * 並用白話說明還差幾個腳印。
 */
export default function StylePage() {
  const router = useRouter();
  const { selections, events, styleId, setStyle } = useFlow();
  const [available, setAvailable] = useState<ComicStyle[]>([]);
  const [mounted, setMounted] = useState(false);

  const missing = !isComplete(selections, events);
  useEffect(() => {
    if (missing) {
      router.replace(`/q/${QUESTIONS[0].slug}`);
      return;
    }
    // 掛載後才讀 localStorage（避免 SSR/hydration 不一致）
    /* eslint-disable react-hooks/set-state-in-effect */
    setAvailable(unlockedStyles());
    setMounted(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [missing, router]);

  if (missing || !mounted) return null;

  const locked = STYLES.filter((s) => !available.some((a) => a.id === s.id));
  const currentId = styleId || available.find((s) => s.isDefault)?.id || "";

  const handlePick = (id: string) => {
    setStyle(id);
    router.push("/theater");
  };

  return (
    <main id="main">
      <div className="mx-auto max-w-[640px]">
        <ScreenHeading>想要哪一種畫風呢？</ScreenHeading>
        <p className="mb-6 text-[20px] text-[color:var(--color-text-soft)]">
          選一種喜歡的，阿咪就用它來畫今天的漫畫。
        </p>

        <ul className="m-0 flex list-none flex-col gap-[var(--touch-gap)] p-0">
          {available.map((style) => {
            const selected = currentId === style.id;
            return (
              <li key={style.id}>
                <AccessibleButton
                  size="xl"
                  variant={selected ? "primary" : "neutral"}
                  icon={style.icon}
                  block
                  aria-pressed={selected}
                  className="!justify-start !gap-5"
                  onClick={() => handlePick(style.id)}
                >
                  <span className="flex w-full items-center gap-3">
                    {style.name}
                    {selected && (
                      <Icon name="check" size={32} className="ml-auto" />
                    )}
                  </span>
                </AccessibleButton>
              </li>
            );
          })}
        </ul>

        {locked.length > 0 && (
          <p className="mt-6 rounded-[var(--radius)] bg-[#f6f1e4] p-4 text-[20px] text-[color:var(--color-text-soft)]">
            還有 {locked.length} 種畫風（{locked.map((s) => s.name).join("、")}
            ）等您解鎖——每集滿 {REWARDS.cycleLength} 個腳印就送一種喔！
          </p>
        )}

        <div className="mt-10">
          <BackButton to="/events" />
        </div>
      </div>
    </main>
  );
}
