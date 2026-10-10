import type { NextConfig } from "next";

/**
 * Xサーバー（レンタルサーバー）に置くため、静的なファイル（HTML/JS/CSS）として書き出す。
 * データの保存・ログイン・AI 文章作成は PHP（server/ → 公開時は /api/）が担当する。
 */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
