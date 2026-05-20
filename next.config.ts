import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    reactCompiler: true,
  },
  // pdf-parse mencoba membaca file test saat di-bundle oleh Next.js
  // serverExternalPackages memaksa Next.js untuk tidak me-bundle library ini
  serverExternalPackages: ['pdf-parse'],
};

export default nextConfig;