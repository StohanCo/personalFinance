/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Receipt uploads use POST /api/receipts/scan as a route handler with its
  // own 10MB cap; no Server Action needs an enlarged body limit.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
};

export default nextConfig;
