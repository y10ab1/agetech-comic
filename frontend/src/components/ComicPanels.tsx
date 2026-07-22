/* eslint-disable @next/next/no-img-element */
import type { DisplayPanel } from "@/data/types";

interface ComicPanelsProps {
  panels: DisplayPanel[];
  title: string;
  /** 目前高亮的象限（隨朗讀推進），-1 表示不高亮 */
  activeIndex?: number;
  /** 四個象限的圖說（依閱讀順序）；未提供時退回顯示 panels[0].caption */
  quadrantCaptions?: string[];
}

/**
 * 四格漫畫 —— 單張 2×2 四格圖策略（api-contract-additions.md §1-1）。
 * 朗讀時以「象限高亮框」對位（accessibility-spec-v1.md §一-1：
 * 不裁圖、不依賴 AI 格線精準度）；圖說為圖下真文字列，與朗讀同步強調。
 * panels 多於 1 張時退回逐格渲染（相容舊資料/例外回應）。
 */
export function ComicPanels({
  panels,
  title,
  activeIndex = -1,
  quadrantCaptions,
}: ComicPanelsProps) {
  if (panels.length === 0) return null;

  // 例外情況（舊資料或後端回多張）：沿用逐格渲染
  if (panels.length > 1) {
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

  const panel = panels[0];
  return (
    <section aria-label={title}>
      <figure className="comic__single">
        <img className="comic__single-img" src={panel.src} alt={panel.alt} />
        {/* 象限高亮框：純視覺輔助（朗讀同步線索），對報讀器隱藏 */}
        {activeIndex >= 0 && activeIndex <= 3 && (
          <span
            aria-hidden="true"
            className={`comic__quadrant comic__quadrant--${activeIndex}`}
          />
        )}
      </figure>
      {quadrantCaptions?.length ? (
        <ol className="comic__caplist">
          {quadrantCaptions.map((caption, i) => (
            <li
              key={i}
              className={`comic__capitem ${
                i === activeIndex ? "comic__capitem--active" : ""
              }`}
            >
              <span className="comic__no">第 {i + 1} 格</span>
              {caption}
            </li>
          ))}
        </ol>
      ) : (
        panel.caption && <p className="comic__caption">{panel.caption}</p>
      )}
    </section>
  );
}
