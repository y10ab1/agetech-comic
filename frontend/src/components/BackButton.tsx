"use client";

import { useRouter } from "next/navigation";
import { AccessibleButton } from "./AccessibleButton";
import { Icon } from "./Icon";

interface BackButtonProps {
  /** 指定返回路徑；未指定則回上一頁 */
  to?: string;
  label?: string;
}

/**
 * 隨時可點的「返回上一步」大按鈕 —— 無痛容錯設計。
 */
export function BackButton({ to, label = "返回上一步" }: BackButtonProps) {
  const router = useRouter();
  return (
    <AccessibleButton
      variant="neutral"
      size="md"
      icon={<Icon name="arrow-left" />}
      debounce={false}
      onClick={() => (to ? router.push(to) : router.back())}
    >
      {label}
    </AccessibleButton>
  );
}
