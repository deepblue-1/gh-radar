'use client';

/**
 * OrderLogList — 상따 주문로그 목록 (Phase 25 · UI-SPEC ②-0 · 채택 목업 F-A `ul.lines`).
 *
 * 한 줄 = 전략 이벤트 1건. 문장 조립은 `@gh-radar/shared` 조립기 한 곳(D-09 — `strategyEventParts` ·
 * `orderLogLineText`)이고, 이 컴포넌트는 조각을 F-A 문법으로 배치만 한다:
 *
 *   [시각][주문번호][구분] 거래소 | 종목 | {행위 600} · 본문 | 누적 N
 *
 * - 정렬은 받은 순서 그대로다 — 스토어(`upsertStrategyEvents`)가 이미 오름차순(새 로그는 아래)으로 둔다.
 * - 시세 이벤트(kind 1·2)는 주문번호 칸 자체가 없고, 주문번호가 빈 주문 이벤트는 `[—]`.
 * - 줄은 `nowrap` + 끝 말줄임, 전체 문장은 네이티브 `title`(UI-SPEC R11 — 줄 전체 평문). Tooltip 을 쓰지 않는다
 *   (줄 수백 개에 포털 · 리스너가 줄 수만큼 생긴다).
 * - 색은 기존 토큰만(구분 칸 색 축: 매수 `--up` · 매도 `--down` · 시세 `--accent-fg` · 모름 `--muted-fg`).
 *
 * 이 플랜(25-01)은 `panel` 변형의 줄 렌더만 한다. 필터 · 핀 · 새 로그 배지 · 상태(로딩/빈/실패) · 폰 밴드 탭
 * 펼침은 25-07, 카드 dense 줄 · 창 분리는 25-07 · 25-10 이 `variant` 로 확장한다.
 */
import {
  formatKstMs,
  isMarketStrategyEvent,
  orderLogLineText,
  strategyEventKey,
  strategyEventParts,
} from '@gh-radar/shared';
import type { StrategyEventParts, StrategyEventRow } from '@gh-radar/shared';

import { cn } from '@/lib/utils';

export type OrderLogListProps = {
  /** 표시할 이벤트 — 오름차순(스토어 순서 그대로). */
  rows: readonly StrategyEventRow[];
  /** 표면 — 공용 패널 · 카드 탭 · 창 분리. 이 플랜은 panel 줄 문법만 그린다. */
  variant: 'panel' | 'card' | 'window';
  /** 종목 표시명(이름 → 코드 → ISIN 폴백은 호출자가 한다 — 새 조회 경로를 만들지 않는다). */
  nameOf: (row: StrategyEventRow) => string;
};

/** 구분 칸 색 축 (UI-SPEC 「색 축」 — 새 토큰 0). */
const TONE_CLASS: Record<StrategyEventParts['tone'], string> = {
  buy: 'text-[var(--up)]',
  sell: 'text-[var(--down)]',
  market: 'text-[var(--accent-fg)]',
  unknown: 'text-[var(--muted-fg)]',
};

export function OrderLogList({ rows, variant, nameOf }: OrderLogListProps) {
  return (
    <ol
      data-slot="order-log-list"
      data-surface={variant}
      className="m-0 flex list-none flex-col gap-px px-2.5 py-1.5 text-[11px] leading-[1.7]"
    >
      {rows.map((row) => {
        const parts = strategyEventParts(row, 'log');
        const name = nameOf(row);
        const market = isMarketStrategyEvent(row.kind);
        const middle = [row.exchange, name].filter((s) => s !== '').join(' | ');
        const hasSentence = parts.action !== null || parts.body !== '';
        return (
          <li
            key={strategyEventKey(row)}
            data-slot="order-log-line"
            data-kind={row.kind}
            data-group={row.group}
            title={orderLogLineText(row, name)}
            className="flex min-w-0 gap-1.5 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--fg)]"
          >
            <span className="mono flex-none text-[var(--muted-fg)]">[{formatKstMs(row.gwTimeMs)}]</span>
            {!market && (
              <span className="mono flex-none text-[var(--muted-fg)]">[{row.orderNo === '' ? '—' : row.orderNo}]</span>
            )}
            <span data-slot="order-log-kind" className={cn('flex-none font-semibold', TONE_CLASS[parts.tone])}>
              [{parts.badge}]
            </span>{' '}
            <span data-slot="order-log-text" className="min-w-0 flex-auto overflow-hidden text-ellipsis">
              {middle}
              {hasSentence && ' | '}
              {parts.action !== null && <span className="font-semibold">{parts.action}</span>}
              {parts.action !== null && parts.body !== '' && ' · '}
              {parts.body}
              <span className="text-[var(--muted-fg)]">
                {' | '}
                {parts.cum}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
