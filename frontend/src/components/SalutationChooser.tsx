"use client";

import { useId, useState } from "react";
import { AccessibleButton } from "./AccessibleButton";
import { Icon } from "./Icon";
import { SALUTATION_HINT, SALUTATION_OPTIONS } from "@/data/questions";

interface SalutationChooserProps {
  /** 目前已選稱呼（用於高亮） */
  current: string;
  /** 選定後回呼（preset label 或自訂文字） */
  onPick: (name: string) => void;
  /** 自訂確認鈕文案 */
  confirmLabel?: string;
}

/**
 * 稱呼選擇器 —— 初次註冊(/welcome)與設定(/settings)共用。
 * 大按鈕預選為主 ＋ 可跳過的自訂輸入（僅暱稱、非個資）。
 */
export function SalutationChooser({
  current,
  onPick,
  confirmLabel = "就叫我這個",
}: SalutationChooserProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const inputId = useId();

  return (
    <>
      <ul className="m-0 flex list-none flex-col gap-[var(--touch-gap)] p-0">
        {SALUTATION_OPTIONS.map((option) => (
          <li key={option.value}>
            <AccessibleButton
              size="xl"
              variant={current === option.label ? "primary" : "neutral"}
              icon={option.icon}
              block
              aria-pressed={current === option.label}
              className="!justify-start !gap-5"
              onClick={() => onPick(option.label)}
            >
              {/* 選中＝磚紅底＋✓ 雙重訊號（WCAG 1.4.1 不靠純色彩） */}
              <span className="flex w-full items-center gap-3">
                {option.label}
                {current === option.label && (
                  <Icon name="check" size={32} className="ml-auto" />
                )}
              </span>
            </AccessibleButton>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        {!showCustom ? (
          <AccessibleButton
            size="md"
            variant="ghost"
            icon={<Icon name="pencil" />}
            debounce={false}
            onClick={() => setShowCustom(true)}
          >
            自己輸入稱呼
          </AccessibleButton>
        ) : (
          <div className="rounded-[var(--radius)] border-[3px] border-[color:var(--color-neutral-border)] bg-white p-5">
            <label className="mb-2 block text-[24px] font-bold" htmlFor={inputId}>
              想被叫的稱呼
            </label>
            <p className="mb-3 text-[20px] text-[color:var(--color-text-soft)]">
              {SALUTATION_HINT}
            </p>
            <input
              id={inputId}
              className="min-h-[var(--touch-min)] w-full rounded-[var(--radius)] border-[3px] border-[color:var(--color-neutral-border)] bg-white px-[18px] py-[14px] text-[24px]"
              type="text"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              autoComplete="off"
              maxLength={12}
              placeholder="例如：阿明伯"
            />
            <div className="mt-4">
              <AccessibleButton
                size="lg"
                icon={<Icon name="check" />}
                debounce={false}
                onClick={() => {
                  const name = customValue.trim();
                  if (name) onPick(name);
                }}
                disabled={!customValue.trim()}
              >
                {confirmLabel}
              </AccessibleButton>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
