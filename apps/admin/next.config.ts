import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // モノレポ内 workspace パッケージを Next の transpile 対象にする
  transpilePackages: ['@tecnova/shared', '@tecnova/ui'],
};

export default nextConfig;
