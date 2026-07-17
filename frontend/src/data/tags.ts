import type { QuestionOption, Selections } from "./types";

import tagTable from "../../../shared/tags.json";
import { WHO_ACTION } from "./questions";

/**
 * Tag 固定 taxonomy —— **唯一事實來源在 repo 根目錄 `shared/tags.json`**
 *（前端 import、後端載入餵 GET /tags；維護規則見 api-contract-additions.md §1）。
 * 本檔只保留：型別、與「圖卡選項 → tag」的推導邏輯（前端專屬）。
 * 週報關懷規則跑在「維度」上（如：外出=0 且 居家≥5 → 建議出門），
 * 不綁個別 tag——新增 tag 只要標對維度，週報規則自動涵蓋。
 */

/** 分析維度：週報/關懷訊號的統計單位 */
export type TagDimension =
  | "social" // 社交
  | "outing" // 外出
  | "physical" // 身體活動
  | "leisure" // 生活樂趣
  | "home" // 居家
  | "health"; // 健康（保留）

export interface Tag {
  id: string;
  label: string;
  icon: string;
  /** 所屬維度（可多個，如樂齡中心＝外出＋社交） */
  dimensions: TagDimension[];
  /** 保留欄位：功能尚未上線（如健康），不出現在篩選列 */
  reserved?: boolean;
}

export const TAG_TABLE_VERSION: number = tagTable.version;

export const TAGS: Tag[] = tagTable.tags as Tag[];

const TAG_BY_ID = Object.fromEntries(TAGS.map((t) => [t.id, t]));

export function getTag(id: string): Tag | undefined {
  return TAG_BY_ID[id];
}

/**
 * 選項 value → tag id（一個選項可對多個 tag，如 event:spouse.walk＝spouse＋walk）。
 * 事件組合的 tags 由 WHO_ACTION 矩陣（questions.ts）推導——單一事實來源；
 * 本表只手寫地點與棄用的舊事件 value。
 */
export const OPTION_TAG_MAP: Record<string, string[]> = {
  ...Object.fromEntries(WHO_ACTION.map((c) => [c.value, c.tags])),
  "place:market": ["market"],
  "place:park": ["walk"],
  "place:home": ["home"],
  "place:center": ["center"],
  // ---- 以下為 v2 複合句時代的舊 value（deprecated）——key 永不刪，
  // 供 localStorage 殘存舊日記推導；對照新 value 見 PR 說明 ----
  "event:grandchild": ["grandchild"], // → event:grandchild.call
  "event:photo": ["grandchild"], // → event:grandchild.photo
  "event:children": ["children"], // → event:children.meal
  "event:parents": ["parents"], // → event:parents.chat
  "event:spouse-walk": ["spouse", "walk"], // → event:spouse.walk
  "event:tea": ["friend"], // → event:friend.tea
  "event:oldfriend": ["friend"], // → event:friend.reunion
  "event:visit": ["friend"], // → event:friend.visit
  "event:stroll": ["walk"], // → event:solo.stroll
  "event:veggie": ["market"], // → event:solo.market
  "event:food": ["food"], // → event:solo.food
  "event:cook": ["food"], // → event:solo.cook
  "event:exercise": ["exercise"], // → event:solo.exercise
  "event:music": ["music"], // → event:solo.music
};

/** 由本次選擇推導 tag（去重、依 TAGS 順序輸出） */
export function deriveTags(
  selections: Selections,
  events: QuestionOption[],
): string[] {
  const values = [
    selections.place?.value,
    ...events.map((e) => e.value),
  ].filter(Boolean) as string[];
  const ids = new Set(values.flatMap((v) => OPTION_TAG_MAP[v] ?? []));
  return TAGS.filter((t) => ids.has(t.id)).map((t) => t.id);
}

/** 選項 label → tag id（供舊資料由 loglineText 補推導；舊 label 保留相容） */
const LABEL_TAG_MAP: Record<string, string[]> = {
  // 現行 label（v3 對象×行動組合，由矩陣推導）
  ...Object.fromEntries(WHO_ACTION.map((c) => [c.label, c.tags])),
  // v2 複合句時代的 label（歷史 logline 相容）
  "跟孫子/孫女講電話": ["grandchild"],
  "看孫子/孫女的照片": ["grandchild"],
  跟兒女吃飯聊天: ["children"],
  陪爸媽說說話: ["parents"],
  跟老伴一起散步: ["spouse", "walk"],
  跟朋友泡茶聊天: ["friend"],
  遇到好久不見的老朋友: ["friend"],
  去朋友家坐坐: ["friend"],
  出去散散步: ["walk"],
  菜市場: ["market"],
  買了新鮮的菜: ["market"],
  買到好吃的: ["food"],
  自己煮了一道好菜: ["food"],
  公園散步: ["walk"],
  做了運動: ["exercise"],
  聽了老歌: ["music"],
  待在家裡: ["home"],
  樂齡中心: ["center"],
  // 舊 label（改名前的歷史資料）
  跟孫子講電話: ["grandchild"],
  看孫子的照片: ["grandchild"],
  跟朋友泡茶: ["friend"],
};

/** 舊紀錄沒存 tags 時，從 logline（「高興 + 菜市場 + …」）補推導 */
export function tagsFromLogline(loglineText: string): string[] {
  const ids = new Set(
    loglineText
      .split(" + ")
      .flatMap((label) => LABEL_TAG_MAP[label.trim()] ?? []),
  );
  return TAGS.filter((t) => ids.has(t.id)).map((t) => t.id);
}
