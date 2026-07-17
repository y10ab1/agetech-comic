"use client";

import { useRouter } from "next/navigation";
import { ScreenHeading } from "@/components/ScreenHeading";
import { SalutationChooser } from "@/components/SalutationChooser";
import { useFlow } from "@/context/FlowContext";
import { getNarrator } from "@/data/narrator";
import { SALUTATION_TITLE, renderTitle } from "@/data/questions";

/**
 * 初次註冊：選擇稱呼（可自訂，日後可在設定變更）。
 * 選定後進入新手引導。
 */
export default function WelcomePage() {
  const router = useRouter();
  const { salutation, setSalutation, narratorId } = useFlow();
  const narrator = getNarrator(narratorId);

  const handlePick = (name: string) => {
    setSalutation(name);
    router.push("/onboarding");
  };

  return (
    <main id="main">
      <div className="mx-auto max-w-[640px]">
        <ScreenHeading>
          {renderTitle(SALUTATION_TITLE, salutation, narrator.name)}
        </ScreenHeading>
        <p className="mb-6 text-[20px] text-[color:var(--color-text-soft)]">
          選一個您喜歡的稱呼，之後想改隨時可以在設定裡更改。
        </p>
        <SalutationChooser current={salutation} onPick={handlePick} />
      </div>
    </main>
  );
}
