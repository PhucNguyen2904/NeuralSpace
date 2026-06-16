/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable StrictMode double-invoke in development to avoid duplicate Jupyter API
  // requests (ERR_CONNECTION_REFUSED × 2) when the backend is not running.
  // Re-enable before deploying to production for full effect strictness checks.
  reactStrictMode: false,
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: "http://localhost:8000/api/v1/:path*",
      },
      {
        source: "/jupyter/:path*",
        destination: "http://localhost:8888/:path*",
      },
    ];
  },
  // FIX [STEP 5]: Explicitly allow auth/content headers + PUT methods on proxied Jupyter path.
  async headers() {
    return [
      {
        source: "/jupyter/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Authorization,Content-Type,X-XSRFToken" }
        ]
      }
    ];
  }
};

export default nextConfig;
