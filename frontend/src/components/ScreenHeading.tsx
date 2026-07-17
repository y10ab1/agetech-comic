"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

interface ScreenHeadingProps {
  children: ReactNode;
  /** 進頁時是否自動把焦點移到標題（路由切換用），預設 true */
  focusOnMount?: boolean;
}

/**
 * 每頁唯一 <h1> —— 路由切換後把焦點移到本標題，
 * 確保 Tab 從主內容開始、無鍵盤陷阱，並讓螢幕閱讀器朗讀新頁標題。
 */
export function ScreenHeading({
  children,
  focusOnMount = true,
}: ScreenHeadingProps) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focusOnMount) {
      const id = window.setTimeout(() => ref.current?.focus(), 60);
      return () => window.clearTimeout(id);
    }
  }, [focusOnMount]);

  return (
    <h1 ref={ref} tabIndex={-1}>
      {children}
    </h1>
  );
}
