import type { Metadata } from "next";
import { Noto_Sans_TC } from "next/font/google";
import "./globals.css";
import { FlowProvider } from "@/context/FlowContext";

const notoSansTC = Noto_Sans_TC({
  variable: "--font-noto-tc",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "樂齡時光繪本",
  description:
    "樂齡時光繪本 — 用點選、拍照或用講的，把今天的故事變成漫畫，念給家人聽。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant" className={notoSansTC.variable}>
      <body>
        <a className="skip-link" href="#main">
          跳到主要內容
        </a>
        <FlowProvider>{children}</FlowProvider>
      </body>
    </html>
  );
}
