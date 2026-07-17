"use client";

import { ComingSoon } from "@/components/ComingSoon";

/** 語音口述 —— 佔位（等後端語音辨識就緒）。 */
export default function SpeakPage() {
  return (
    <ComingSoon
      title="用講的"
      iconSrc="/assets/icons/microphone.svg"
      description="用講的做漫畫的功能快要好了！這幾天先用點的試試看，很快就能開放講話喔。"
    />
  );
}
