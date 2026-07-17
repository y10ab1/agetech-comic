"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useDebouncedAction } from "@/hooks/useDebouncedAction";

type Variant = "primary" | "secondary" | "neutral" | "danger" | "ghost";
type Size = "md" | "lg" | "xl";

interface AccessibleButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  icon?: ReactNode;
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  block?: boolean;
  debounce?: boolean;
  onClick?: () => void;
}

/**
 * 唯一的按鈕入口 —— 語意化 <button>（嚴禁 div/span + onClick）。
 * 最小觸控 64px、內建 1.5s 防手抖 debounce、icon+文字（不靠純色彩）。
 */
export const AccessibleButton = forwardRef<
  HTMLButtonElement,
  AccessibleButtonProps
>(function AccessibleButton(
  {
    icon,
    children,
    variant = "primary",
    size = "lg",
    block = false,
    debounce = true,
    onClick,
    disabled,
    className = "",
    type = "button",
    ...rest
  },
  ref,
) {
  const { run, busy } = useDebouncedAction(1500);

  const handleClick = () => {
    if (!onClick) return;
    if (debounce) run(onClick);
    else onClick();
  };

  const isDisabled = disabled || (debounce && busy);

  return (
    <button
      ref={ref}
      type={type}
      className={`btn btn--${variant} btn--${size} ${
        block ? "btn--block" : ""
      } ${className}`}
      onClick={handleClick}
      disabled={isDisabled}
      aria-busy={busy || undefined}
      {...rest}
    >
      {icon != null && (
        <span className="btn__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="btn__label">{children}</span>
    </button>
  );
});
