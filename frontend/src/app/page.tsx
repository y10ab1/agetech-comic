"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AccessibleButton } from "@/components/AccessibleButton";
import { ScreenHeading } from "@/components/ScreenHeading";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Icon } from "@/components/Icon";
import { useFlow } from "@/context/FlowContext";
import { mockLineLogin } from "@/data/comic";
import { isOnboarded, loadProfile } from "@/data/profile";

/**
 * 登入頁 —— 極簡畫面、中央超大磚紅色主按鈕。
 * 模擬 LINE 一鍵免密登入，無 Email/密碼欄位。
 */
export default function LoginPage() {
  const router = useRouter();
  const { login, reset, setSalutation } = useFlow();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const existing =
        typeof window !== "undefined"
          ? localStorage.getItem("llsg_user_id")
          : null;
      const id = await mockLineLogin(existing);
      login(id);
      reset();
      // 已註冊 → 主選單；初次 → 選稱呼開始新手流程
      if (isOnboarded()) {
        const p = loadProfile();
        if (p?.salutation) setSalutation(p.salutation);
        router.push("/home");
      } else {
        router.push("/welcome");
      }
    } catch {
      setError("阿公阿嬤，網路好像有點累，請再點一次大按鈕試試看喔！");
      setLoading(false);
    }
  };

  return (
    <main id="main">
      <div className="mx-auto max-w-[620px] pt-6 text-center">
        <ScreenHeading>樂齡時光繪本</ScreenHeading>
        <p className="mb-10 text-[24px] leading-[1.6]">
          點一下下面的大按鈕，
          <br />
          就能把今天的故事變成漫畫，念給家人聽。
        </p>

        {error && <ErrorNotice message={error} />}

        <div className="my-8">
          <AccessibleButton
            size="xl"
            variant="primary"
            icon={<Icon name="chat" size={34} />}
            block
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? "正在為您開啟…" : "用 LINE 開始建立我的回憶錄"}
          </AccessibleButton>
        </div>

        <p className="sr-only" aria-live="polite">
          {loading ? "正在登入，請稍候" : ""}
        </p>

        <p className="mt-6 text-[20px] text-[color:var(--color-text-soft)]">
          不需要輸入電話、密碼或個人資料，安心又方便。
        </p>
      </div>
    </main>
  );
}
