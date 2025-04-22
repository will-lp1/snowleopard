// @ts-check -- Remove this comment if using pure JS

/** @type {import('next').NextConfig} */
const nextConfig = {
  // experimental: {
  //   ppr: true, // Disabled: Requires canary Next.js version
  // },
  images: {
    remotePatterns: [
      {
        hostname: 'avatar.vercel.sh',
      },
    ],
  },
};

export default nextConfig; 