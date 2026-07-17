"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AccessibleButton } from "@/components/AccessibleButton";
import { BackButton } from "@/components/BackButton";
import { ScreenHeading } from "@/components/ScreenHeading";

const RICH_SEEN_KEY = "llsg_rich_seen";

/**
 * 「今天想怎麼記？」模式選擇頁 —— 第二次起才會進到這裡（漸進解鎖）。
 * 三個平行入口：用點的（現有）、用拍的、用講的；最後都匯流到漫畫生成。
 * 拍照/語音目前為佔位（/capture、/speak）。
 */
export default function NewDiaryPage() {
  const router = useRouter();
  const [firstUnlock, setFirstUnlock] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(RICH_SEEN_KEY)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFirstUnlock(true);
      localStorage.setItem(RICH_SEEN_KEY, "1");
    }
  }, []);

  return (
    <main id="main">
      <div className="mx-auto max-w-[560px]">
        <ScreenHeading>今天想怎麼記？</ScreenHeading>

        {firstUnlock && (
          <div
            role="status"
            className="mb-6 rounded-[var(--radius)] border-[3px] border-[color:var(--color-secondary)] bg-[#f1e8e2] p-5 text-[22px] font-bold text-[color:var(--color-secondary)]"
          >
            阿咪學會新把戲了！這次也可以用拍的或用講的試試看。
          </div>
        )}

        <p className="mb-6 text-[20px] text-[color:var(--color-text-soft)]">
          選一種您覺得方便的方式，都可以做出今天的漫畫。
        </p>

        <div className="flex flex-col gap-[var(--touch-gap)]">
          <AccessibleButton
            size="xl"
            variant="primary"
            block
            className="!justify-start !gap-5"
            icon={
              <img
                src="/assets/icons/tap-hand.svg"
                alt=""
                aria-hidden="true"
                className="h-11 w-11 rounded-lg bg-white p-0.5"
              />
            }
            onClick={() => router.push("/q/mood")}
          >
            <span className="text-left">
              <span className="block text-[28px]">用點的</span>
              <span className="block text-[18px] font-normal">
                最簡單，選圖卡就好
              </span>
            </span>
          </AccessibleButton>

          <AccessibleButton
            size="xl"
            variant="neutral"
            block
            className="!justify-start !gap-5"
            icon={
              <img
                src="/assets/icons/camera.svg"
                alt=""
                aria-hidden="true"
                className="h-11 w-11"
              />
            }
            onClick={() => router.push("/capture")}
          >
            <span className="text-left">
              <span className="block text-[28px]">用拍的</span>
              <span className="block text-[18px] font-normal">
                拍張照片或從相簿選
              </span>
            </span>
          </AccessibleButton>

          <AccessibleButton
            size="xl"
            variant="neutral"
            block
            className="!justify-start !gap-5"
            icon={
              <img
                src="/assets/icons/microphone.svg"
                alt=""
                aria-hidden="true"
                className="h-11 w-11"
              />
            }
            onClick={() => router.push("/speak")}
          >
            <span className="text-left">
              <span className="block text-[28px]">用講的</span>
              <span className="block text-[18px] font-normal">
                直接跟阿咪說今天的事
              </span>
            </span>
          </AccessibleButton>
        </div>

        <div className="mt-10">
          <BackButton to="/home" label="回主選單" />
        </div>
      </div>
    </main>
  );
}
