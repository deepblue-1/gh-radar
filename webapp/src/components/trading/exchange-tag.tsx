import type { RelayExchange } from '@gh-radar/shared';

import { cn } from '@/lib/utils';

/**
 * 거래소 태그 (목업 `.tag.krx` / `.tag.nxt`, Phase 18 D-05·D-06).
 *
 * KRX 는 **테두리형**, NXT 는 **채움형 accent** 다 — 색이 아니라 형태로도 두 시장이 갈린다.
 * VI 설정 2줄·VI 발동 표·계좌 패널·사이드바 VI 줄(가동 거래소, quick-260923-dmb)이 같은 조각을
 * 쓴다(두 벌이면 한쪽만 모양이 바뀐다).
 *
 * ★ 순수 표시 원자다 — `'use client'` 도 relay 훅도 없다(`strategy-badge.tsx` 와 같은 결).
 *   사이드바는 앱 셸에 실려 모든 페이지 번들에 들어가므로, 체크박스·표·relay 훅을 끌고 오는
 *   `vi-order-list.tsx` 대신 이 파일을 import 한다. `vi-order-list.tsx` 는 기존 import 처를 위해
 *   같은 이름으로 re-export 한다.
 */
export function ExchangeTag({
  exchange,
  size = 'sm',
}: {
  exchange: RelayExchange;
  /** `md` = VI 설정 줄(20px) · `sm` = 표 셀 · 사이드바(18px). */
  size?: 'sm' | 'md';
}) {
  return (
    <span
      data-slot="exchange-tag"
      data-exchange={exchange}
      className={cn(
        'inline-flex flex-none items-center rounded-[var(--r-sm)] border px-1.5 text-[10px] font-bold tracking-[.02em]',
        size === 'md' ? 'h-5' : 'h-[18px]',
        exchange === 'NXT'
          ? 'border-transparent bg-[var(--accent)] text-[var(--accent-fg)]'
          : 'border-[var(--border)] bg-transparent text-[var(--muted-fg)]',
      )}
    >
      {exchange}
    </span>
  );
}
