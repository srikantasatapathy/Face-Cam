/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @facecam/shared is consumed as TypeScript source from the workspace.
  transpilePackages: ['@facecam/shared'],
  eslint: {
    ignoreDuringBuilds: false,
  },
  /**
   * Proxy API calls through the portal's own origin.
   *
   * The browser therefore talks to acme.localhost:3100/api rather than to
   * localhost:4000 directly, which buys three things:
   *   - no CORS preflight on every request
   *   - auth cookies are first-party to the portal, so SameSite is never in doubt
   *   - each subdomain gets its own cookie jar, so a session for one portal is
   *     not even transmitted to another
   */
  async rewrites() {
    const apiUrl = process.env.API_URL ?? 'http://localhost:4000'
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }]
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
