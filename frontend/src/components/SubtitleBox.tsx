interface SubtitleBoxProps {
  text: string;
  /** 用亮黃字強調（高潮劇情）；預設純白字 */
  accent?: boolean;
}

/**
 * 字幕框 —— 高對比黑底白/黃字（7:1↑），字級≥24px。
 * aria-live="polite" + aria-atomic：字幕更新時螢幕閱讀器整段即時播報。
 */
export function SubtitleBox({ text, accent = false }: SubtitleBoxProps) {
  return (
    <div
      className={`subtitle ${accent ? "subtitle--accent" : ""}`}
      aria-live="polite"
      aria-atomic="true"
      role="status"
    >
      <p className="subtitle__text">{text}</p>
    </div>
  );
}
