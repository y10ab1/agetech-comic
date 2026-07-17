import type { QuestionOption, Selections } from "./types";

/**
 * 把選擇打包成結構化 Logline（＝送給後端的日記文字 DiaryEntry.text）。
 * 例：高興 + 樂齡中心 + 遇到好久不見的老朋友 + 跟朋友泡茶
 */
export function buildLogline(
  selections: Selections,
  events: QuestionOption[],
): string {
  return [
    selections.mood?.label,
    selections.place?.label,
    ...events.map((e) => e.label),
  ]
    .filter(Boolean)
    .join(" + ");
}

/** 是否已可生成漫畫：心情、地點皆選，且至少一件事 */
export function isComplete(
  selections: Selections,
  events: QuestionOption[],
): boolean {
  return (
    Boolean(selections.mood) && Boolean(selections.place) && events.length >= 1
  );
}
