import type { ReactNode } from "react";

/**
 * 功能 icon 集 —— 單色線條、粗筆畫、currentColor。
 * icon 自動繼承按鈕/文字的顏色（磚紅鍵上為白、白鍵上為碳灰），
 * 對比永遠與文字一致（≥7:1），零相依、零網路請求。
 * 插圖層（相機/麥克風/阿咪）另存 public/assets，不在此列。
 */
export type IconName =
  | "arrow-left"
  | "arrow-right"
  | "check"
  | "warning"
  | "pencil"
  | "pencil-plus"
  | "book"
  | "settings"
  | "chat"
  | "play"
  | "pause"
  | "replay"
  | "bulb"
  | "home"
  | "heart"
  | "chevron-right"
  | "chevron-down"
  | "gift";

const PATHS: Record<IconName, ReactNode> = {
  "arrow-left": (
    <>
      <path d="M19 12H5" />
      <path d="M11 18l-6-6 6-6" />
    </>
  ),
  "arrow-right": (
    <>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </>
  ),
  check: <path d="M4 12.5l5 5L20 6.5" />,
  warning: (
    <>
      <path d="M12 3.5L2.8 19.5h18.4L12 3.5z" />
      <path d="M12 9.5v4.5" />
      <path d="M12 16.8v.4" />
    </>
  ),
  pencil: <path d="M4 20l1.2-4.2L16.5 4.5a2.12 2.12 0 013 3L8.2 18.8 4 20z" />,
  "pencil-plus": (
    <>
      <path d="M4 20l1.2-4.2L14.5 6.5l3 3-9.3 9.3L4 20z" />
      <path d="M18.5 2.5v6" />
      <path d="M15.5 5.5h6" />
    </>
  ),
  book: (
    <>
      <path d="M12 6.5C10 5.2 7.3 4.5 4 4.5v13.5c3.3 0 6 .7 8 2 2-1.3 4.7-2 8-2V4.5c-3.3 0-6 .7-8 2z" />
      <path d="M12 6.5V20" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h2.8M12.2 7H20M4 12h7.8M17.8 12H20M4 17h1M10 17h10" />
      <circle cx="9.5" cy="7" r="2.6" />
      <circle cx="14.8" cy="12" r="2.6" />
      <circle cx="7.5" cy="17" r="2.6" />
    </>
  ),
  chat: (
    <>
      <path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2h-8l-6 5v-5H6a2 2 0 01-2-2V6z" />
    </>
  ),
  play: <path d="M8 5.5l11 6.5-11 6.5v-13z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <path d="M8 5v14" strokeWidth={3.4} />
      <path d="M16 5v14" strokeWidth={3.4} />
    </>
  ),
  replay: (
    <>
      <path d="M4 4.5v5.5h5.5" />
      <path d="M4.8 10A8 8 0 1012 4a8 8 0 00-6 2.7L4 9" />
    </>
  ),
  bulb: (
    <>
      <path d="M12 3a6 6 0 00-4 10.4c.7.6 1 1.5 1 2.6h6c0-1.1.3-2 1-2.6A6 6 0 0012 3z" />
      <path d="M9.5 19.5h5M10.5 22h3" />
    </>
  ),
  home: (
    <>
      <path d="M3 11.5l9-8 9 8" />
      <path d="M5.5 10v10.5h13V10" />
    </>
  ),
  heart: (
    <path d="M12 20.5S3.8 15.6 2.6 10.7A4.8 4.8 0 0112 7a4.8 4.8 0 019.4 3.7C20.2 15.6 12 20.5 12 20.5z" />
  ),
  "chevron-right": <path d="M9 5l7 7-7 7" />,
  "chevron-down": <path d="M5 9l7 7 7-7" />,
  gift: (
    <>
      <rect x="4" y="11.5" width="16" height="9" rx="1" />
      <rect x="3" y="7.5" width="18" height="4" rx="1" />
      <path d="M12 7.5v13" />
      <path d="M12 7.5c0-2.5-1.8-4-3.4-4a2 2 0 000 4H12z" />
      <path d="M12 7.5c0-2.5 1.8-4 3.4-4a2 2 0 010 4H12z" />
    </>
  ),
};

interface IconProps {
  name: IconName;
  /** px，預設 28（配 24px 按鈕字） */
  size?: number;
  className?: string;
}

export function Icon({ name, size = 28, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}
