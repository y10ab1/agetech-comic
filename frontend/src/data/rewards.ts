/**
 * 集章獎勵經濟 —— 全部參數化（demo 前端 mock；正式由後端 config 下發）。
 *
 * 節奏（PM 定案）：累計制（非連續制，漏一天不歸零）、7 格一輪循環換新卡。
 *  - 第 3 格：+1 次生成（可再生資源，每輪都給得起）
 *  - 第 7 格：解鎖 1 種新畫風；4 種畫風集齊後自動轉為 +N 次生成
 *
 * 待與後端同步的契約：GET /styles、DiaryEntry.style、GET /me/rewards。
 */

export interface ComicStyle {
  id: string;
  name: string;
  /** 內容插圖用 emoji（示意，正式由後端給縮圖） */
  icon: string;
  /** 預設畫風：不需解鎖 */
  isDefault?: boolean;
}

/** 畫風清單（mock；正式 GET /styles） */
export const STYLES: ComicStyle[] = [
  { id: "japanese", name: "日系漫畫", icon: "🌸", isDefault: true },
  { id: "american", name: "美式漫畫", icon: "💥" },
  { id: "korean", name: "韓式漫畫", icon: "🎀" },
  { id: "watercolor", name: "溫暖水彩", icon: "🖌️" },
];

export interface Milestone {
  /** 集點卡上的位置（1..cycleLength） */
  at: number;
  /** 獎勵生成次數 */
  generations?: number;
  /** 解鎖畫風數 */
  styles?: number;
  /** 畫風已集齊時，styles 獎勵轉換成的生成次數 */
  fallbackGenerations?: number;
}

export const REWARDS = {
  /** 每日免費生成次數 */
  dailyFreeGenerations: 1,
  /** 集點卡一輪幾格 */
  cycleLength: 7,
  milestones: [
    { at: 3, generations: 1 },
    { at: 7, styles: 1, fallbackGenerations: 2 },
  ] as Milestone[],
};

// ---- 錢包（localStorage；正式換 GET /me/rewards）----

export interface Wallet {
  /** 里程碑累積的額外生成次數 */
  bonusGenerations: number;
  /** 已解鎖畫風 id（不含預設） */
  unlockedStyleIds: string[];
  /** 今日已用次數（依日期歸零） */
  usedDate: string;
  usedCount: number;
}

const WALLET_KEY = "llsg_wallet";

export function loadWallet(): Wallet {
  if (typeof window === "undefined") {
    return { bonusGenerations: 0, unlockedStyleIds: [], usedDate: "", usedCount: 0 };
  }
  try {
    const raw = localStorage.getItem(WALLET_KEY);
    if (raw) return JSON.parse(raw) as Wallet;
  } catch {
    // 壞資料視同新錢包
  }
  return { bonusGenerations: 0, unlockedStyleIds: [], usedDate: "", usedCount: 0 };
}

function saveWallet(w: Wallet) {
  if (typeof window !== "undefined") {
    localStorage.setItem(WALLET_KEY, JSON.stringify(w));
  }
}

/** 目前可用的畫風（預設＋已解鎖） */
export function unlockedStyles(): ComicStyle[] {
  const w = loadWallet();
  return STYLES.filter((s) => s.isDefault || w.unlockedStyleIds.includes(s.id));
}

/** 今天還剩幾次生成（免費額度＋bonus） */
export function remainingToday(today: string): number {
  const w = loadWallet();
  const usedToday = w.usedDate === today ? w.usedCount : 0;
  const freeLeft = Math.max(0, REWARDS.dailyFreeGenerations - usedToday);
  return freeLeft + w.bonusGenerations;
}

export function canGenerateToday(today: string): boolean {
  return remainingToday(today) > 0;
}

/** 消耗一次生成：先用當日免費額度，再用 bonus */
export function consumeGeneration(today: string) {
  const w = loadWallet();
  const usedToday = w.usedDate === today ? w.usedCount : 0;
  if (usedToday < REWARDS.dailyFreeGenerations) {
    saveWallet({ ...w, usedDate: today, usedCount: usedToday + 1 });
  } else if (w.bonusGenerations > 0) {
    saveWallet({ ...w, bonusGenerations: w.bonusGenerations - 1 });
  }
}

/**
 * 蓋下第 stampCount 個章時發獎勵。
 * 回傳白話訊息（供畫面慶祝與 aria-live 播報）。
 */
export function grantForStampCount(stampCount: number): string[] {
  const messages: string[] = [];
  const pos = ((stampCount - 1) % REWARDS.cycleLength) + 1;
  const w = loadWallet();
  let bonus = w.bonusGenerations;
  const unlocked = [...w.unlockedStyleIds];

  for (const m of REWARDS.milestones) {
    if (m.at !== pos) continue;
    if (m.generations) {
      bonus += m.generations;
      messages.push(`獲得 ${m.generations} 次額外生成，想多記一則也可以！`);
    }
    if (m.styles) {
      const lockable = STYLES.filter(
        (s) => !s.isDefault && !unlocked.includes(s.id),
      );
      const toUnlock = lockable.slice(0, m.styles);
      if (toUnlock.length > 0) {
        toUnlock.forEach((s) => unlocked.push(s.id));
        messages.push(
          `解鎖新畫風「${toUnlock.map((s) => s.name).join("、")}」！下次做漫畫可以選喔。`,
        );
      } else if (m.fallbackGenerations) {
        bonus += m.fallbackGenerations;
        messages.push(
          `畫風已全部集齊！改送您 ${m.fallbackGenerations} 次額外生成。`,
        );
      }
    }
  }

  if (pos === REWARDS.cycleLength) {
    messages.push("這張集點卡蓋滿了！換一張新卡，繼續蓋腳印。");
  }

  saveWallet({ ...w, bonusGenerations: bonus, unlockedStyleIds: unlocked });
  return messages;
}
