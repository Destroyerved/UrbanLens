/** @type {import('next').NextConfig} */
const apiOrigin = (
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000"
).replace(/\/$/, "");

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${apiOrigin}/api/:path*` },
      { source: "/static/:path*", destination: `${apiOrigin}/static/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/data/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" },
          { key: "Content-Type", value: "application/json; charset=utf-8" },
          { key: "Content-Encoding", value: "gzip" },
        ],
      },
    ];
  },
};

export default nextConfig;
