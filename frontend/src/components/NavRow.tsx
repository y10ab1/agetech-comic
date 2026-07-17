"use client";

import { Icon, type IconName } from "./Icon";

interface NavRowProps {
  icon: IconName;
  label: string;
  /** 右側淡色補充資訊（如「12 枚」） */
  meta?: string;
  onClick: () => void;
}

/**
 * 安靜清單列 —— 元件層級的「次要導航」：透明底＋細分隔線＋右側 chevron。
 * 不與磚紅主行動鈕爭視覺；觸控高度仍 ≥64px。
 */
export function NavRow({ icon, label, meta, onClick }: NavRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[var(--touch-min)] w-full cursor-pointer items-center gap-4 border-0 border-b-2 border-solid border-b-[#e3dccb] bg-transparent px-1 py-4 text-left font-[inherit]"
    >
      <span className="text-[color:var(--color-text-soft)]">
        <Icon name={icon} size={30} />
      </span>
      <span className="flex-1 text-[22px] font-bold text-[color:var(--color-text)]">
        {label}
      </span>
      {meta && (
        <span className="text-[20px] text-[color:var(--color-text-soft)]">
          {meta}
        </span>
      )}
      <span className="text-[color:var(--color-text-soft)]">
        <Icon name="chevron-right" size={24} />
      </span>
    </button>
  );
}
