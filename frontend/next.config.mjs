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
};

export default nextConfig;
