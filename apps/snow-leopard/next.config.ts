import { withGTConfig } from "gt-next/config";
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    ppr: true
  },
  images: {
    remotePatterns: [
    {
      hostname: 'avatar.vercel.sh'
    }]

  }
};

export default withGTConfig(nextConfig, {});