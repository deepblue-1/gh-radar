import type { NextConfig } from 'next';

/**
 * Next.js config.
 *
 * Phase 06.2 Plan 03 — T-06.2-12 (Clickjacking) mitigation:
 * - /login 과 /auth/* 응답에 X-Frame-Options: DENY + CSP frame-ancestors 'none' 추가
 * - iframe embedding 을 원천 차단하여 OAuth consent 화면/로그인 화면 위변조 방지
 * - ASVS V14.4.7 준수
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/login',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'none'",
          },
        ],
      },
      {
        source: '/auth/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'none'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
