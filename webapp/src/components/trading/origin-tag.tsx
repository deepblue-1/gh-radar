import type { JournalOrderOrigin } from '@gh-radar/shared';

/**
 * 출처 태그 (UI-SPEC C7 → Phase 19 D-08).
 *
 * 한 조각을 두 표면이 쓴다 — 두 벌이면 한쪽만 모양이 바뀐다(`exchange-tag.tsx` 와 같은 이유).
 *  - **account-panel 미체결 행**: 값의 원천은 화면 컨텍스트다(상따 페이지 = 상따 · VI 페이지 = VI).
 *    수동 주문 표면(호가주문 탭 · My page)은 태그를 넘기지 않는다 — 종전 그대로 상따/VI 만.
 *  - **「오늘 주문」 카드(D-08)**: 값의 원천은 저널 행의 `origin` 이다. 계좌 기준 기록이라 같은
 *    계좌의 WinForms · 다른 DMA 사용자 주문이 섞이므로 **「수동」 도 표시**한다 — 누가 낸
 *    주문인지를 칩 하나가 말한다. `origin` 미상(null · 게이트웨이 재시작 뒤 termId=0 등)은
 *    칩을 **생략**한다(D-08 보충) — 「수동」 으로 그리면 거짓일 수 있다.
 *
 * 색은 기존 토큰(muted · muted-fg)만 쓴다 — 새 색이 없다.
 *
 * ★ 순수 표시 원자다 — `'use client'` 도 relay 훅도 없다(`exchange-tag.tsx` 와 같은 결).
 */
export type OriginTagLabel = '상따' | 'VI' | '수동';

/** 저널 행 `origin` → 칩 라벨. 미상(null)은 `undefined` = 칩 없음(D-08 보충). */
export function originTagOf(origin: JournalOrderOrigin | null): OriginTagLabel | undefined {
  switch (origin) {
    case 'manual':
      return '수동';
    case 'limit_chaser':
      return '상따';
    case 'vi':
      return 'VI';
    default:
      return undefined;
  }
}

export function OriginTag({
  tag,
  slot = 'account-origin-tag',
}: {
  tag?: OriginTagLabel;
  /** DOM 계약 — account-panel 은 기본값, 오늘 주문 카드는 `today-order-origin`. */
  slot?: string;
}) {
  if (tag === undefined) return null;
  return (
    <span
      data-slot={slot}
      className="whitespace-nowrap rounded-[var(--r-sm)] bg-[var(--muted)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--muted-fg)]"
    >
      {tag}
    </span>
  );
}
