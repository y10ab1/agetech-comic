import path from "node:path";
import type { NextConfig } from "next";

// 專案根在上一層（shared/tags.json 為 tag 唯一事實來源，需可被 import）
const repoRoot = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  turbopack: {
    root: repoRoot,
  },
  // 正式部署（Docker / Cloud Run）：standalone 產出最小 node server
  output: "standalone",
  outputFileTracingRoot: repoRoot,
};

export default nextConfig;
