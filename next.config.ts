import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse/mammoth (file parsing) rely on dynamic requires and data files
  // that Next's serverless bundler can miss unless these packages are left
  // external and file-traced as whole node_modules directories.
  serverExternalPackages: ["pdf-parse", "mammoth"],
};

export default nextConfig;
