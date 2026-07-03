/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

const nextConfig = {
  // Bật strict mode trong production để phát hiện bugs sớm hơn
  reactStrictMode: true,

  async rewrites() {
    // Trong production (Vercel), frontend gọi thẳng backend Render qua NEXT_PUBLIC_API_URL.
    // Rewrites chỉ cần trong development để proxy local backend.
    if (isProd) return [];

    return [
      {
        source: "/api/v1/:path*",
        destination: "http://127.0.0.1:8000/api/v1/:path*",
      },
      {
        source: "/jupyter/:path*",
        destination: "http://127.0.0.1:8888/:path*",
      },
    ];
  },

  async headers() {
    // Header cho Jupyter proxy — chỉ cần trong development
    if (isProd) return [];

    return [
      {
        source: "/jupyter/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Authorization,Content-Type,X-XSRFToken" },
        ],
      },
    ];
  },
};

export default nextConfig;
