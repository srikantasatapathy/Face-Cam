/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @facecam/shared is consumed as TypeScript source from the workspace.
  transpilePackages: ['@facecam/shared'],
  eslint: {
    ignoreDuringBuilds: false,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // getUserMedia is only used by the kiosk, and only on this origin.
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

export default nextConfig
