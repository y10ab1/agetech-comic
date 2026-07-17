/* eslint-disable @next/next/no-img-element */
import type { DisplayPanel } from "@/data/types";

interface ComicPanelsProps {
  panels: DisplayPanel[];
  title: string;
  /** 目前高亮的格數（隨朗讀推進），-1 表示不高亮 */
  activeIndex?: number;
}

/**
 * 漫畫格 —— 每格 <img> 皆有動態 alt（來自後端 alt_text 或 mock）。
 * activeIndex 讓正在朗讀的格子有視覺強調（保留文字標號，不靠純色彩）。
 */
export function ComicPanels({
  panels,
  title,
  activeIndex = -1,
}: ComicPanelsProps) {
  return (
    <section aria-label={title}>
      <ol className="comic__grid">
        {panels.map((panel, i) => (
          <li
            key={i}
            className={`comic__cell ${
              i === activeIndex ? "comic__cell--active" : ""
            }`}
          >
            <span className="comic__no" aria-hidden="true">
              第 {i + 1} 格
            </span>
            <img className="comic__img" src={panel.src} alt={panel.alt} />
            <p className="comic__caption">{panel.caption}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
