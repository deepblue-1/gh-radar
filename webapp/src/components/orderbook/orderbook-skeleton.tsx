/**
 * OrderbookSkeleton — 호가창 초기 로딩 골격 (UI-SPEC C14).
 *
 * `ui/skeleton.tsx` 조합만 쓴다(신규 primitive 없음). 레이아웃은 확정 L1=B 2축을
 * 그대로 흉내내 데이터 도착 시 layout shift(CLS) 가 생기지 않게 한다:
 *   ≥900px  `380px 220px minmax(360px,1fr)` 3컬럼
 *   <900px  M1 세로 순서(사다리 → 주문 → 체결)
 *
 * ★ 밀도: 사다리·테이프에 `data-density="compact"`(32px)를 **명시**한다.
 *   globals.css 의 모바일 자동 comfortable 규칙은
 *   `[data-density]:not([data-density="compact"])` 를 대상으로 하므로,
 *   compact 를 명시해야 모바일에서도 32px 이 유지되고 실제 사다리와 높이가 맞는다.
 *
 * ★ 색: 로딩 표면은 전부 중립이다. 방향색(상승·하락 시맨틱 토큰)을 쓰지 않는다
 *   (UI-SPEC §Color 금지 목록).
 *
 * shimmer 는 `ui/skeleton.tsx` 가 `prefers-reduced-motion` 을 이미 처리한다.
 */

import { Skeleton } from '@/components/ui/skeleton';

/** 사다리 골격 행 수 — 매도 10단 + 매수 10단. */
const LADDER_ROWS = 20;
/** 체결 테이프 골격 행 수 (C6 로딩 상태). */
const TAPE_ROWS = 8;
/** 주문 폼 골격 행 수 — 계좌 · 거래소 · 가격 · 수량 · 주문금액. */
const FORM_ROWS = 5;

export interface OrderbookSkeletonProps {
  className?: string;
}

export function OrderbookSkeleton({ className }: OrderbookSkeletonProps) {
  return (
    <div
      aria-busy="true"
      aria-label="호가창 불러오는 중"
      data-slot="orderbook-skeleton"
      className={[
        'grid gap-px',
        'min-[900px]:grid-cols-[380px_220px_minmax(360px,1fr)]',
        className ?? '',
      ]
        .join(' ')
        .trim()}
    >
      {/* 호가 10단 사다리 — 20행 */}
      <div data-density="compact" className="flex flex-col gap-px p-[var(--s-2)]">
        <Skeleton className="mb-1 h-3 w-16" />
        {Array.from({ length: LADDER_ROWS }, (_, i) => (
          <Skeleton key={`ladder-${i}`} className="h-[var(--row-h)] w-full" />
        ))}
      </div>

      {/* 체결 테이프 — 8행. 모바일(M1)에서는 주문 패널보다 아래로 내려간다. */}
      <div
        data-density="compact"
        className="order-3 flex flex-col gap-px p-[var(--s-2)] min-[900px]:order-none"
      >
        <Skeleton className="mb-1 h-3 w-12" />
        {Array.from({ length: TAPE_ROWS }, (_, i) => (
          <Skeleton key={`tape-${i}`} className="h-[var(--row-h)] w-full" />
        ))}
      </div>

      {/* 주문 폼 */}
      <div className="order-2 flex flex-col gap-[var(--s-2)] p-[var(--s-3)] min-[900px]:order-none">
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: FORM_ROWS }, (_, i) => (
          <Skeleton key={`form-${i}`} className="h-9 w-full" />
        ))}
        <Skeleton className="h-10 w-full rounded-[var(--r)]" />
      </div>
    </div>
  );
}
