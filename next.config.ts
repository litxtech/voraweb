import fs from 'fs';
import path from 'path';
import type { NextConfig } from 'next';

function loadRootEnv(): void {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key]) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadRootEnv();

const supabaseHost = (() => {
  try {
    const raw = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
    return raw ? new URL(raw).hostname : null;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
    NEXT_PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://vora.app',
  },
  images: {
    remotePatterns: [
      ...(supabaseHost ? [{ protocol: 'https' as const, hostname: supabaseHost, pathname: '/storage/v1/object/public/**' }] : []),
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: 'tools.applemediaservices.com' },
      { protocol: 'https', hostname: 'play.google.com' },
    ],
  },
  async redirects() {
    return [
      { source: '/posts', destination: '/', permanent: false },
      { source: '/explore', destination: '/discover', permanent: false },
      { source: '/app', destination: '/', permanent: false },
      { source: '/app/explore', destination: '/discover', permanent: false },
      { source: '/app/reels', destination: '/reels', permanent: false },
      { source: '/app/profile', destination: '/profile', permanent: false },
      { source: '/app/messages', destination: '/messages', permanent: false },
      { source: '/app/compose', destination: '/compose', permanent: false },
    ];
  },
  async rewrites() {
    const app = '/vora-app.html';
    const screens = [
      '/',
      '/discover',
      '/reels',
      '/profile',
      '/messages',
      '/messages/:path*',
      '/compose',
      '/create',
      '/settings',
      '/settings/:path*',
      '/login',
      '/register',
      '/notifications',
      '/chat/:path*',
      '/u/:path*',
    ];
    return {
      beforeFiles: screens.map((source) => ({ source, destination: app })),
      fallback: [{ source: '/:path*', destination: app }],
    };
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self)' },
        ],
      },
    ];
  },
};

export default nextConfig;
