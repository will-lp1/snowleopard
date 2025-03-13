/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    // Add any experimental features if needed
    serverComponentsExternalPackages: ['better-sqlite3'], // Add any native dependencies
  },
}

module.exports = nextConfig 