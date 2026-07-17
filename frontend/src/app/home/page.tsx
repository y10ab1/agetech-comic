"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AccessibleButton } from "@/components/AccessibleButton";
import { ScreenHeading } from "@/components/ScreenHeading";
import { Icon } from "@/components/Icon";
import { NavRow } from "@/components/NavRow";
import { AmiCat } from "@/components/AmiCat";
import { useFlow } from "@/context/FlowContext";
import { useIdleHint } from "@/hooks/useIdleHint";
import { getNarrator } from "@/data/narrator";
import { hasStampToday, loadStamps } from "@/data/collection";
import { remainingToday } from "@/data/rewards";
import { DEFAULT_SALUTATION } from "@/data/questions";

function greetingByHour(h: number): string {
  if (h < 11) return "早安";
  if (h < 18) return "午安";
  return "晚安";
}

/**
 * 已註冊用戶主選單 —— 首頁是啟動器不是 dashboard：
 * 一顆磚紅主行動＋安靜清單列，狀態縮成問候區一行小字（圖示＋文字，不靠顏色）。
 */
export default function HomePage() {
  const router = useRouter();
  const { salutation, narratorId, reset } = useFlow();
  const narrator = getNarrator(narratorId);

  const [recordedToday, setRecordedToday] = useState(false);
  const [stampCount, setStampCount] = useState(0);
  const [remaining, setRemaining] = useState(1);
  const [greeting, setGreeting] = useState("您好");
  // 閒置 10 秒：僅在還能生成時提示（今天做完就不催）
  const idle = useIdleHint(10000, remaining > 0);

  useEffect(() => {
    // 掛載後才讀 localStorage / 時間（避免 SSR/hydration 不一致）
    /* eslint-disable react-hooks/set-state-in-effect */
    const today = new Date().toLocaleDateString("zh-TW");
    setRecordedToday(hasStampToday());
    setStampCount(loadStamps().length);
    setRemaining(remainingToday(today));
    setGreeting(greetingByHour(new Date().getHours()));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const canGenerate = remaining > 0;

  const who = salutation || DEFAULT_SALUTATION;

  const startNewDiary = () => {
    reset();
    // 第一次(還沒有任何印章)只給點擊；之後才進模式選擇頁(漸進解鎖)
    router.push(stampCount === 0 ? "/q/mood" : "/new");
  };

  return (
    <main id="main">
      <div className="mx-auto max-w-[560px]">
        {/* 問候＋狀態（一行小字，不用大 banner） */}
        <div className="mb-8 flex items-center gap-4">
          <AmiCat size={72} idle={idle} decorative className="shrink-0" />
          <div>
            <ScreenHeading>
              {greeting}，{who}
            </ScreenHeading>
            <p
              className="m-0 flex items-center gap-2 text-[20px] text-[color:var(--color-text-soft)]"
              role="status"
            >
              {recordedToday && <Icon name="check" size={22} />}
              {recordedToday ? "今天記好了，真棒" : "今天還沒記錄"}
            </p>
          </div>
        </div>

        {/* 每日次數用完：轉成正向狀態，不用灰色 disabled */}
        {!canGenerate && (
          <div
            role="status"
            className="mb-4 rounded-[var(--radius)] border-[3px] border-[color:var(--color-success)] bg-[#eaf7ee] p-5 text-[22px] font-bold text-[color:var(--color-success)]"
          >
            今天的漫畫做好了！明天再來蓋一個新的章喔。
          </div>
        )}

        {/* 閒置 10 秒：溫和文字提示（無自動語音，任何互動即消失） */}
        {idle && (
          <div
            role="status"
            className="mb-4 rounded-[var(--radius)] border-[3px] border-[color:var(--color-neutral-border)] bg-white p-4 text-[22px] font-bold"
          >
            {narrator.name}：點下面的大按鈕，開始記今天的日記喔！
          </div>
        )}

        {/* 唯一主行動：能生成＝新增日記；用完＝看今天的漫畫（位置固定）。
            文案與下方 NavRow「我的集章存摺」(看全部)作「今天 vs 全部」區分，避免重複 */}
        {canGenerate ? (
          <AccessibleButton
            size="xl"
            variant="primary"
            icon={<Icon name="pencil-plus" size={36} />}
            block
            className="!justify-start !gap-5"
            onClick={startNewDiary}
          >
            <span className="text-left">
              <span className="block text-[28px]">新增今天的日記</span>
              <span className="block text-[18px] font-normal">
                {recordedToday
                  ? `今天還可以再做 ${remaining} 則`
                  : "用點的、拍的或講的都可以"}
              </span>
            </span>
          </AccessibleButton>
        ) : (
          <AccessibleButton
            size="xl"
            variant="primary"
            icon={<Icon name="book" size={36} />}
            block
            className="!justify-start !gap-5"
            onClick={() => router.push("/collection")}
          >
            <span className="text-left">
              <span className="block text-[28px]">看今天的漫畫</span>
              <span className="block text-[18px] font-normal">
                今天的故事做好了，點進去回味一下
              </span>
            </span>
          </AccessibleButton>
        )}

        {/* 安靜清單列：次要導航，不與主行動爭視覺 */}
        <div className="mt-8 border-t-2 border-solid border-t-[#e3dccb]">
          <NavRow
            icon="book"
            label="我的集章存摺"
            meta={stampCount > 0 ? `${stampCount} 枚` : undefined}
            onClick={() => router.push("/collection")}
          />
          <NavRow
            icon="settings"
            label="設定（更改稱呼）"
            onClick={() => router.push("/settings")}
          />
        </div>
      </div>
    </main>
  );
}
