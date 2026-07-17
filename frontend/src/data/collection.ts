import type { StampRecord } from "./types";
import { tagsFromLogline } from "./tags";

/**
 * 集章存摺儲存 —— 每完成一天的漫畫記錄一枚印章。
 * 純前端 localStorage、0 AI token；日後可換成後端 /achievements。
 */
const STAMP_KEY = "llsg_stamps";

export function loadStamps(): StampRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STAMP_KEY);
    const list = raw ? (JSON.parse(raw) as StampRecord[]) : [];
    // 舊資料沒存 tags：讀取時由 logline 補推導
    return list.map((s) =>
      s.tags ? s : { ...s, tags: tagsFromLogline(s.loglineText) },
    );
  } catch {
    return [];
  }
}

export function addStamp(record: StampRecord): StampRecord[] {
  const list = [record, ...loadStamps()];
  if (typeof window !== "undefined") {
    localStorage.setItem(STAMP_KEY, JSON.stringify(list));
  }
  return list;
}

/** 今天是否已經記錄過（用當地日期字串比對） */
export function hasStampToday(): boolean {
  const today = new Date().toLocaleDateString("zh-TW");
  return loadStamps().some((s) => s.createdAt === today);
}

// ---- 月份資料夾 ----

/** createdAt（如 2026/7/15）→ 月份 key（2026/7） */
export function monthKey(createdAt: string): string {
  const [y, m] = createdAt.split("/");
  return `${y}/${m}`;
}

/** 月份 key → 顯示名（今年顯示「7月的回憶」，跨年含年份） */
export function monthLabel(key: string): string {
  const [y, m] = key.split("/");
  const thisYear = String(new Date().getFullYear());
  return y === thisYear ? `${m}月的回憶` : `${y}年${m}月的回憶`;
}

export interface MonthGroup {
  key: string;
  label: string;
  stamps: StampRecord[];
}

/** 依月份分組（新到舊；stamps 本身已是新到舊） */
export function groupByMonth(stamps: StampRecord[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const s of stamps) {
    const key = monthKey(s.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.stamps.push(s);
    else groups.push({ key, label: monthLabel(key), stamps: [s] });
  }
  return groups;
}
