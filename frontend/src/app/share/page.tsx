"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AccessibleButton } from "@/components/AccessibleButton";
import { BackButton } from "@/components/BackButton";
import { ScreenHeading } from "@/components/ScreenHeading";
import { Icon } from "@/components/Icon";
import { useFlow } from "@/context/FlowContext";
import { isComplete } from "@/data/logline";
import { generateMockScript, mockLineShare } from "@/data/comic";
import { addStamp } from "@/data/collection";
import { deriveTags } from "@/data/tags";
import { consumeGeneration, grantForStampCount } from "@/data/rewards";
import { getNarrator } from "@/data/narrator";
import { QUESTIONS } from "@/data/questions";
import type { StampRecord } from "@/data/types";

/**
 * 輸出與留存 —— 兩顆醒目按鈕：分享到 LINE、打開集章存摺。
 * 進頁把這次的漫畫記為集章存摺的一枚印章（純前端、0 token）。
 */
export default function SharePage() {
  const router = useRouter();
  const { userId, salutation, selections, events, narratorId, styleId, reset } =
    useFlow();
  const [greeting, setGreeting] = useState("");
  const [sharing, setSharing] = useState(false);
  const [rewards, setRewards] = useState<string[]>([]);
  const savedRef = useRef(false);

  const complete = isComplete(selections, events);
  const script = complete
    ? generateMockScript({ userId, salutation, selections, events, narratorId })
    : null;
  const narrator = getNarrator(narratorId);

  useEffect(() => {
    if (!complete) {
      router.replace(`/q/${QUESTIONS[0].slug}`);
      return;
    }
    if (!script || savedRef.current) return;
    savedRef.current = true;
    const record: StampRecord = {
      id: "S" + Date.now().toString(36),
      createdAt: new Date().toLocaleDateString("zh-TW"),
      loglineText: script.loglineText,
      title: script.title,
      narratorName: narrator.name,
      // 正式封面待後端 AI 圖（image_url）；先用「準備中」佔位圖
      coverSrc: "/assets/comics/cover-placeholder.svg",
      kind: "diary",
      tags: deriveTags(selections, events),
      styleId: styleId || undefined,
    };
    const list = addStamp(record);
    // 消耗一次生成、依累計章數發里程碑獎勵
    consumeGeneration(record.createdAt);
    const msgs = grantForStampCount(list.length);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (msgs.length) setRewards(msgs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete]);

  if (!complete || !script) return null;

  const handleShare = async () => {
    setSharing(true);
    const res = await mockLineShare(selections, events, narrator.name);
    setGreeting(res.greeting);
    setSharing(false);
  };

  return (
    <main id="main">
      <div className="mx-auto max-w-[640px]">
        <ScreenHeading>做好了！要分享給家人嗎？</ScreenHeading>

        {/* 里程碑獎勵慶祝（aria-live 播報） */}
        {rewards.length > 0 && (
          <div
            role="status"
            aria-live="polite"
            className="mb-6 rounded-[var(--radius)] border-[3px] border-[color:var(--color-primary-strong)] bg-[#f6ecd9] p-5"
          >
            <p className="mb-2 flex items-center gap-2 text-[24px] font-bold text-[color:var(--color-primary-strong)]">
              <Icon name="gift" size={28} />
              蓋章成功，還有獎勵！
            </p>
            {rewards.map((m, i) => (
              <p key={i} className="m-0 text-[20px] leading-[1.5]">
                {m}
              </p>
            ))}
          </div>
        )}

        <figure className="mb-7 text-center">
          <img
            className="mx-auto w-[240px] max-w-[70%] rounded-[var(--radius)] border-[3px] border-[color:var(--color-neutral-border)]"
            src={script.panels[0].src}
            alt={script.panels[0].alt}
          />
          <figcaption className="mt-3 text-[20px] font-bold">
            今天的故事：「{script.title}」
          </figcaption>
        </figure>

        <div className="flex flex-col gap-[var(--touch-gap)]">
          <AccessibleButton
            size="xl"
            variant="primary"
            icon={<Icon name="heart" />}
            block
            onClick={handleShare}
            disabled={sharing}
          >
            {sharing ? "正在傳送…" : "傳送給家人（分享到 LINE）"}
          </AccessibleButton>

          <AccessibleButton
            size="xl"
            variant="secondary"
            icon={<Icon name="book" />}
            block
            onClick={() => router.push("/collection")}
          >
            打開我的集章存摺
          </AccessibleButton>
        </div>

        <div aria-live="polite" aria-atomic="true" className="min-h-[8px]">
          {greeting && (
            <div
              role="status"
              className="mt-6 rounded-[var(--radius)] border-[3px] border-[color:var(--color-success)] bg-[#eaf7ee] p-5"
            >
              <p className="mb-2 text-[24px] font-bold text-[color:var(--color-success)]">
                <span aria-hidden="true" className="mr-1 inline-block align-middle"><Icon name="check" size={26} /></span>已幫您送到家族群組！
              </p>
              <p className="m-0 text-[20px] leading-[1.5]">「{greeting}」</p>
              <p className="mb-0 mt-2 text-[20px] leading-[1.5]">
                等他們回話，{narrator.name}再念給您聽。
              </p>
            </div>
          )}
        </div>

        <div className="mt-9 flex flex-wrap items-center justify-between gap-[var(--touch-gap)]">
          <BackButton to="/theater" />
          <AccessibleButton
            size="md"
            variant="ghost"
            icon={<Icon name="home" />}
            debounce={false}
            onClick={() => {
              reset();
              router.push("/home");
            }}
          >
            回主選單
          </AccessibleButton>
        </div>
      </div>
    </main>
  );
}
