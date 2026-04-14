import { redirect } from 'next/navigation';

/**
 * 루트(`/`) 진입 시 서버 사이드 리다이렉트로 `/scanner` 로 이동.
 * - Phase 4 D-01: v1 핵심이 Scanner 이므로 사이트 오픈 즉시 핵심 기능 진입
 * - Client redirect 금지 (SEO + hydration 비용) — App Router `redirect()` 사용
 */
export default function HomePage() {
  redirect('/scanner');
}
