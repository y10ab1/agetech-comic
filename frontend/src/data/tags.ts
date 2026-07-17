import type { QuestionOption, Selections } from "./types";

/**
 * Tag 固定 taxonomy（PM 定案）—— controlled vocabulary。
 * 前端由結構化選項自動推導（0 AI token、0 打字）；
 * 日後拍照/語音輸入時，後端 AI 也必須從這張表選 tag（ComicResult.tags）。
 * emoji 屬內容插圖（依 guideline 准用）。
 */
export interface Tag {
  id: string;
  label: string;
  icon: string;
  /** 保留欄位：功能尚未上線（如健康），不出現在篩選列 */
  reserved?: boolean;
}

export const TAGS: Tag[] = [
  { id: "grandchild", label: "孫子", icon: "👶" },
  { id: "friend", label: "朋友", icon: "🤝" },
  { id: "market", label: "買菜", icon: "🧺" },
  { id: "food", label: "美食", icon: "🍜" },
  { id: "walk", label: "出門走走", icon: "🌳" },
  { id: "exercise", label: "運動", icon: "🤸" },
  { id: "music", label: "音樂", icon: "🎶" },
  { id: "home", label: "在家", icon: "🏠" },
  { id: "center", label: "樂齡中心", icon: "🏫" },
  // 保留：等健康小記（拍藥袋/回診）上線後掛入
  { id: "health", label: "健康", icon: "💊", reserved: true },
];

const TAG_BY_ID = Object.fromEntries(TAGS.map((t) => [t.id, t]));

export function getTag(id: string): Tag | undefined {
  return TAG_BY_ID[id];
}

/** 選項 value → tag id（自動推導對照表） */
export const OPTION_TAG_MAP: Record<string, string[]> = {
  "event:grandchild": ["grandchild"],
  "event:photo": ["grandchild"],
  "event:tea": ["friend"],
  "event:oldfriend": ["friend"],
  "event:visit": ["friend"],
  "place:market": ["market"],
  "event:veggie": ["market"],
  "event:food": ["food"],
  "place:park": ["walk"],
  "event:exercise": ["exercise"],
  "event:music": ["music"],
  "place:home": ["home"],
  "place:center": ["center"],
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

/** 選項 label → tag id（供舊資料由 loglineText 補推導） */
const LABEL_TAG_MAP: Record<string, string[]> = {
  跟孫子講電話: ["grandchild"],
  看孫子的照片: ["grandchild"],
  跟朋友泡茶: ["friend"],
  遇到好久不見的老朋友: ["friend"],
  去朋友家坐坐: ["friend"],
  菜市場: ["market"],
  買了新鮮的菜: ["market"],
  買到好吃的: ["food"],
  公園散步: ["walk"],
  做了運動: ["exercise"],
  聽了老歌: ["music"],
  待在家裡: ["home"],
  樂齡中心: ["center"],
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
