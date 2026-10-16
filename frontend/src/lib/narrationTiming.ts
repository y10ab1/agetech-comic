import type { NarrationAudio, ScriptSegment } from "@/data/types";

/**
 * 旁白音檔播放到 timeMs 時，正在念第幾句（segments 索引）。
 *
 * 後端每格各合成一段再接起來，marksMs 是各格起始毫秒（精準）；
 * 同一格內的多句沒有逐句時間，依字數比例估算。
 * marksMs 只有 1 筆（沒有四格）時，整段音檔依字數分配給所有句子。
 */
export function segmentAtTime(
  timeMs: number,
  segments: ScriptSegment[],
  audio: Pick<NarrationAudio, "durationMs" | "marksMs">,
): number {
  if (segments.length === 0) return 0;
  const { durationMs, marksMs } = audio;
  const byQuadrant =
    marksMs.length === 4 &&
    segments.every((s) => s.panelIndex !== undefined && s.panelIndex >= 0 && s.panelIndex < 4);

  // 每組：[起, 迄) 與其句子索引
  const groups: { start: number; end: number; idx: number[] }[] = byQuadrant
    ? [0, 1, 2, 3].map((q) => ({
        start: marksMs[q],
        end: q < 3 ? marksMs[q + 1] : durationMs,
        idx: segments.flatMap((s, i) => (s.panelIndex === q ? [i] : [])),
      }))
    : [{ start: marksMs[0] ?? 0, end: durationMs, idx: segments.map((_, i) => i) }];

  let lastIdx = 0;
  for (const g of groups) {
    if (g.idx.length === 0) continue;
    lastIdx = g.idx[g.idx.length - 1];
    if (timeMs >= g.end) continue;
    const total = g.idx.reduce((n, i) => n + segments[i].text.length, 0) || 1;
    let t = g.start;
    for (const i of g.idx) {
      t += ((g.end - g.start) * segments[i].text.length) / total;
      if (timeMs < t) return i;
    }
    return lastIdx;
  }
  return lastIdx;
}
