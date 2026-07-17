/**
 * 虛擬陪伴員阿咪 —— 貓臉插圖（調色版：描邊統一 #1E1E24、內耳芥末黃、
 * 磚紅鼻、腮紅、鬍鬚、眼神光）。
 *
 * 動畫（keyframes 在 globals.css，全域 prefers-reduced-motion 會自動停止）：
 *  - 呼吸：緩慢縮放＋輕微上浮（3.8s）
 *  - 眨眼：每 ~5 秒眨一次
 *  - idle=true 時呼吸幅度加大（閒置引導，v1.md §2.1 呼吸燈）
 *
 * 無障礙：旁邊有「阿咪」文字標籤時用 decorative（aria-hidden，預設）；
 * 單獨出現時 decorative={false} 會掛 role="img" ＋ 語音報讀描述（WCAG 1.1.1）。
 */
interface AmiCatProps {
  /** px 尺寸（正方形） */
  size?: number;
  /** 閒置引導：呼吸變明顯 */
  idle?: boolean;
  /** 純裝飾（旁有文字標籤）＝true；單獨出現＝false */
  decorative?: boolean;
  className?: string;
}

export function AmiCat({
  size = 96,
  idle = false,
  decorative = true,
  className,
}: AmiCatProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      {...(decorative
        ? { "aria-hidden": true, focusable: false }
        : {
            role: "img",
            "aria-label": "虛擬陪伴員阿咪：一隻溫暖橘色、帶著微笑的可愛貓咪",
          })}
    >
      <g className={`ami-breathe ${idle ? "ami-breathe--strong" : ""}`}>
        <polygon
          points="20,40 25,10 45,30"
          fill="#F4A261"
          stroke="#1E1E24"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <polygon
          points="80,40 75,10 55,30"
          fill="#F4A261"
          stroke="#1E1E24"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <polygon points="26,36 29,18 41,30" fill="#D4AC2F" />
        <polygon points="74,36 71,18 59,30" fill="#D4AC2F" />
        <circle cx="50" cy="55" r="40" fill="#F4A261" stroke="#1E1E24" strokeWidth="4" />
        <g className="ami-eyes">
          <circle cx="35" cy="50" r="5.5" fill="#1E1E24" />
          <circle cx="65" cy="50" r="5.5" fill="#1E1E24" />
          <circle cx="36.6" cy="48.4" r="1.6" fill="#FAF6EE" />
          <circle cx="66.6" cy="48.4" r="1.6" fill="#FAF6EE" />
        </g>
        <circle cx="27" cy="62" r="5" fill="#E8A9A0" opacity="0.7" />
        <circle cx="73" cy="62" r="5" fill="#E8A9A0" opacity="0.7" />
        <polygon points="45,60 55,60 50,65.5" fill="#8C3B24" />
        <path
          d="M 40,70 Q 50,80 60,70"
          fill="none"
          stroke="#1E1E24"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <g stroke="#1E1E24" strokeWidth="2" strokeLinecap="round">
          <line x1="14" y1="58" x2="26" y2="60" />
          <line x1="14" y1="66" x2="26" y2="65" />
          <line x1="86" y1="58" x2="74" y2="60" />
          <line x1="86" y1="66" x2="74" y2="65" />
        </g>
      </g>
    </svg>
  );
}
