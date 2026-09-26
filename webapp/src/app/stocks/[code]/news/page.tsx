import { notFound, redirect } from 'next/navigation';

/**
 * `/stocks/[code]/news` — 옛 전체 뉴스 페이지(Phase 07 NEWS-01) → 탭 안 전체목록 리다이렉트.
 *
 * Phase 21 D-29 (G-21-R3-8) — 전체 뉴스는 종목상세 「뉴스토론」 탭 안 전체목록
 * `/stocks/{code}?tab=news&view=news` 로 옮겼다. 이 주소는 **북마크 · 외부 링크 호환**으로만 남아
 * 새 자리로 보낸다(21-25 사용자 동의).
 *
 * T-21-83 — 경로 파라미터는 사용자 제어 입력이다. `CODE_RE` 로 거른 뒤에만 `encodeURIComponent` 로
 * 조립하고, 어긋나면 `notFound()`(부모 `not-found.tsx` 상속).
 */
const CODE_RE = /^[A-Za-z0-9]{1,10}$/;

export default async function StockNewsPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!CODE_RE.test(code)) notFound();
  redirect(`/stocks/${encodeURIComponent(code)}?tab=news&view=news`);
}
