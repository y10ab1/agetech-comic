"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AccessibleButton } from "@/components/AccessibleButton";
import { BackButton } from "@/components/BackButton";
import { ScreenHeading } from "@/components/ScreenHeading";
import { Icon } from "@/components/Icon";
import { PawCard } from "@/components/PawCard";
import { useFlow } from "@/context/FlowContext";
import {
  groupByMonth,
  hasStampToday,
  loadStamps,
  type MonthGroup,
} from "@/data/collection";
import { remainingToday } from "@/data/rewards";
import { TAGS, getTag } from "@/data/tags";
import type { StampRecord } from "@/data/types";

const COVER_PLACEHOLDER = "/assets/comics/cover-placeholder.svg";

const ALL = "all";

/**
 * 集章存摺 —— 貓腳印集點卡進度 + tag 篩選 + 大圖卡片 + 月份資料夾。
 * 取代日曆的無障礙貼紙簿；追蹤全走本地邏輯、0 AI token。
 */
export default function CollectionPage() {
  const router = useRouter();
  const { reset } = useFlow();
  const [groups, setGroups] = useState<MonthGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [recordedToday, setRecordedToday] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [monthKey, setMonthKey] = useState<string>("");
  const [tag, setTag] = useState<string>(ALL);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // 掛載後才讀 localStorage（避免 SSR/hydration 不一致）
    /* eslint-disable react-hooks/set-state-in-effect */
    const stamps = loadStamps();
    const g = groupByMonth(stamps);
    setGroups(g);
    setTotal(stamps.length);
    setRecordedToday(hasStampToday());
    setRemaining(remainingToday(new Date().toLocaleDateString("zh-TW")));
    setMonthKey(g[0]?.key ?? "");
    setMounted(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const startNewDiary = () => {
    reset();
    router.push("/new");
  };

  if (!mounted) return null;

  const currentGroup = groups.find((g) => g.key === monthKey);
  const monthStamps = currentGroup?.stamps ?? [];
  const otherMonths = groups.filter((g) => g.key !== monthKey);

  // 篩選列只顯示本月真的出現過的 tag（避免空篩選）
  const tagsInMonth = new Set(monthStamps.flatMap((s) => s.tags ?? []));
  const filterTags = TAGS.filter((t) => tagsInMonth.has(t.id));
  const shown =
    tag === ALL
      ? monthStamps
      : monthStamps.filter((s) => (s.tags ?? []).includes(tag));

  return (
    <main id="main">
      <div className="mx-auto max-w-[680px]">
        <ScreenHeading>我的集章存摺</ScreenHeading>
        <p
          className="mb-5 flex items-center gap-2 text-[20px] text-[color:var(--color-text-soft)]"
          role="status"
        >
          {recordedToday && (
            <span className="text-[color:var(--color-success)]">
              <Icon name="check" size={22} />
            </span>
          )}
          {recordedToday
            ? `今天蓋章了，真棒！總共收集了 ${total} 枚`
            : `已收集 ${total} 枚印章，今天還沒蓋章`}
        </p>

        {/* 剩餘免費生成次數提示（正向語氣，不用倒數壓力） */}
        <p className="mb-5 text-[20px] font-bold text-[color:var(--color-primary-strong)]">
          {remaining > 0
            ? `今天還可以做 ${remaining} 則漫畫`
            : "今天的漫畫做好了，明天再來蓋新的章喔"}
        </p>

        {/* 集點卡進度 */}
        <div className="mb-7">
          <PawCard totalStamps={total} />
        </div>

        {total === 0 ? (
          <div className="flex flex-col items-center gap-6 py-6 text-center text-[24px]">
            <p>還沒有印章喔，我們現在就來蓋第一個吧！</p>
            <AccessibleButton
              size="lg"
              variant="primary"
              icon={<Icon name="pencil" />}
              onClick={startNewDiary}
            >
              開始做故事
            </AccessibleButton>
          </div>
        ) : (
          <>
            {/* 月份標題 */}
            <h2 className="mb-3 text-[24px]">{currentGroup?.label}</h2>

            {/* Tag 篩選 chips（單選；選中＝磚紅底＋✓） */}
            {filterTags.length > 0 && (
              /* 稽核修正：chips 間距補到 ≥24px（guideline 四：按鈕間距防誤觸） */
              <div
                className="mb-5 flex flex-wrap gap-[var(--touch-gap)]"
                role="group"
                aria-label="用標籤篩選"
              >
                <TagChip
                  label="全部"
                  selected={tag === ALL}
                  onClick={() => setTag(ALL)}
                />
                {filterTags.map((t) => (
                  <TagChip
                    key={t.id}
                    label={t.label}
                    icon={t.icon}
                    selected={tag === t.id}
                    onClick={() => setTag(t.id)}
                  />
                ))}
              </div>
            )}

            {/* 大圖卡片（單欄/寬螢幕雙欄） */}
            <ul className="m-0 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2">
              {shown.map((s) => (
                <StampCard key={s.id} stamp={s} onTagClick={setTag} />
              ))}
            </ul>
            {shown.length === 0 && (
              <p className="text-[20px] text-[color:var(--color-text-soft)]">
                這個標籤這個月還沒有故事。
              </p>
            )}

            {/* 月份資料夾（其他月份收起來） */}
            {otherMonths.length > 0 && (
              <div className="mt-8">
                <h2 className="mb-3 text-[24px]">其他月份</h2>
                <div className="border-t-2 border-solid border-t-[#e3dccb]">
                  {otherMonths.map((g) => (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => {
                        setMonthKey(g.key);
                        setTag(ALL);
                      }}
                      className="flex min-h-[var(--touch-min)] w-full cursor-pointer items-center gap-4 border-0 border-b-2 border-solid border-b-[#e3dccb] bg-transparent px-1 py-4 text-left font-[inherit]"
                    >
                      <span className="text-[color:var(--color-text-soft)]">
                        <Icon name="book" size={28} />
                      </span>
                      <span className="flex-1 text-[22px] font-bold">
                        {g.label}
                      </span>
                      <span className="text-[20px] text-[color:var(--color-text-soft)]">
                        {g.stamps.length} 則
                      </span>
                      <span className="text-[color:var(--color-text-soft)]">
                        <Icon name="chevron-right" size={24} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="mt-9 flex flex-wrap items-center justify-between gap-[var(--touch-gap)]">
          <BackButton to="/home" label="回主選單" />
          <AccessibleButton
            size="md"
            variant="ghost"
            icon={<Icon name="pencil" />}
            debounce={false}
            onClick={startNewDiary}
          >
            再記一則
          </AccessibleButton>
        </div>
      </div>
    </main>
  );
}

/** 篩選列的 tag chip */
function TagChip({
  label,
  icon,
  selected,
  onClick,
}: {
  label: string;
  icon?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`inline-flex min-h-[48px] cursor-pointer items-center gap-2 rounded-full border-2 px-[18px] py-2 text-[18px] font-bold ${
        selected
          ? "border-[color:var(--color-primary-strong)] bg-[color:var(--color-primary-strong)] text-white"
          : "border-[color:var(--color-neutral-border)] bg-white text-[color:var(--color-text)]"
      }`}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      {label}
      {selected && <Icon name="check" size={20} />}
    </button>
  );
}

/** 大圖卡片：cover ＋ AI 標題 ＋ 日期 ＋ 可點擊 tag（卡片要素依 PM 定案） */
function StampCard({
  stamp,
  onTagClick,
}: {
  stamp: StampRecord;
  onTagClick: (id: string) => void;
}) {
  const title = stamp.title ?? stamp.loglineText;
  return (
    <li className="overflow-hidden rounded-[var(--radius)] border-[3px] border-[color:var(--color-neutral-border)] bg-white">
      {/* 正式封面待後端 AI 圖；舊資料與 mock 一律顯示「準備中」佔位圖 */}
      <img
        src={COVER_PLACEHOLDER}
        alt={`「${title}」的漫畫封面（圖片準備中）`}
        className="aspect-[4/3] w-full bg-[#efebe0] object-cover"
      />
      <div className="p-4">
        <h3 className="m-0 mb-1 text-[22px] leading-[1.4] text-[color:var(--color-text)]">
          {title}
        </h3>
        <p className="m-0 mb-3 text-[18px] font-bold text-[color:var(--color-primary-strong)]">
          {stamp.createdAt}
        </p>
        {/* 稽核修正：卡內輔助控制 44px（WCAG 2.5.5），間距 16px */}
        <div className="flex flex-wrap gap-4">
          {(stamp.tags ?? []).map((id) => {
            const t = getTag(id);
            if (!t) return null;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onTagClick(id)}
                className="inline-flex min-h-[44px] cursor-pointer items-center gap-1 rounded-full border-2 border-[#b4b2a9] bg-[#f6f1e4] px-4 py-1 text-[16px] font-bold text-[color:var(--color-text)]"
              >
                <span aria-hidden="true">{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
    </li>
  );
}
