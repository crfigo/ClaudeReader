import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // jsdom (used for URL article extraction) and pdf-parse/mammoth (file
  // parsing) rely on dynamic requires and data files that Next's serverless
  // bundler can miss unless these packages are left external and file-traced
  // as whole node_modules directories.
  serverExternalPackages: ["jsdom", "@mozilla/readability", "pdf-parse", "mammoth"],
};

export default nextConfig;
