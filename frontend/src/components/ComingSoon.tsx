"use client";

/* eslint-disable @next/next/no-img-element */
import { useRouter } from "next/navigation";
import { AccessibleButton } from "./AccessibleButton";
import { Icon } from "./Icon";
import { BackButton } from "./BackButton";
import { ScreenHeading } from "./ScreenHeading";

interface ComingSoonProps {
  title: string;
  iconSrc: string;
  description: string;
}

/**
 * 「即將開放」佔位頁 —— 拍照/語音功能待後端就緒。
 * 一律提供大大的「改用點的」退路，長輩不會卡住。
 */
export function ComingSoon({ title, iconSrc, description }: ComingSoonProps) {
  const router = useRouter();
  return (
    <main id="main">
      <div className="mx-auto max-w-[560px] text-center">
        <ScreenHeading>{title}</ScreenHeading>

        <div className="my-6 flex justify-center">
          <img src={iconSrc} alt="" aria-hidden="true" className="h-28 w-28" />
        </div>

        <div
          role="status"
          className="mb-8 rounded-[var(--radius)] border-[3px] border-[color:var(--color-neutral-border)] bg-[var(--color-warn-bg)] p-5 text-[24px] font-bold leading-[1.5]"
        >
          <span aria-hidden="true" className="mr-2 inline-block align-middle"><Icon name="warning" size={30} /></span>
          {description}
        </div>

        <div className="flex flex-col gap-[var(--touch-gap)]">
          <AccessibleButton
            size="xl"
            variant="primary"
            icon={<Icon name="arrow-right" />}
            block
            onClick={() => router.push("/q/mood")}
          >
            改用點的，現在就開始
          </AccessibleButton>
          <BackButton to="/new" label="回上一步" />
        </div>
      </div>
    </main>
  );
}
