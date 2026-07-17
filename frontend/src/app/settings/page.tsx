"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BackButton } from "@/components/BackButton";
import { ScreenHeading } from "@/components/ScreenHeading";
import { Icon } from "@/components/Icon";
import { SalutationChooser } from "@/components/SalutationChooser";
import { useFlow } from "@/context/FlowContext";

/**
 * 設定 —— 目前提供更改稱呼（日後可加說書人、預設語速等）。
 */
export default function SettingsPage() {
  const router = useRouter();
  const { salutation, setSalutation } = useFlow();
  const [saved, setSaved] = useState("");

  const handlePick = (name: string) => {
    setSalutation(name);
    setSaved(name);
    // 稍作停留讓長輩看到確認，再回主選單
    window.setTimeout(() => router.push("/home"), 900);
  };

  return (
    <main id="main">
      <div className="mx-auto max-w-[640px]">
        <ScreenHeading>更改稱呼</ScreenHeading>
        <p className="mb-6 text-[20px] text-[color:var(--color-text-soft)]">
          目前的稱呼是「{salutation || "還沒設定"}」。選一個新的稱呼即可。
        </p>

        <div aria-live="polite" aria-atomic="true">
          {saved && (
            <div
              role="status"
              className="mb-6 rounded-[var(--radius)] border-[3px] border-[color:var(--color-success)] bg-[#eaf7ee] p-5 text-[22px] font-bold text-[color:var(--color-success)]"
            >
              <span aria-hidden="true" className="mr-1 inline-block align-middle"><Icon name="check" size={26} /></span>好的，以後叫您「{saved}」！
            </div>
          )}
        </div>

        <SalutationChooser
          current={salutation}
          onPick={handlePick}
          confirmLabel="改成這個"
        />

        <div className="mt-10">
          <BackButton to="/home" />
        </div>
      </div>
    </main>
  );
}
