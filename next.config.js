/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Don't run ESLint during build
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Don't run TypeScript during build
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig; 