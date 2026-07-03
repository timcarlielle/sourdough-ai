/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  transpilePackages: ["db"],
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client"],
  },
};

module.exports = nextConfig;
