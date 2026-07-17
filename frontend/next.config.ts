import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 專案根在上一層（shared/tags.json 為 tag 唯一事實來源，需可被 import）
  turbopack: {
    root: path.join(__dirname, ".."),
  },
};

export default nextConfig;
