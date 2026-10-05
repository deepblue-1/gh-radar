'use client';

/**
 * OrderLogPanel — 공용 패널 「주문로그」 탭 본문 (Phase 25-07 · UI-SPEC ②-1 · D-05~D-08).
 *
 * 데이터 흐름: 작업대 공용 피드(`useOrderLogFeedContext` → `feed` prop) → **범위**(상태줄 단일 계좌의 주문 이벤트 +
 * 시세 이벤트 전부 · 결정 1-A) → **필터**(종목 · 거래소 · 구분 group 축 · D-08) → `OrderLogList`(panel · 172px).
 *
 * - 계좌를 바꾸면 스토어 행을 다시 거를 뿐 재조회하지 않는다 — 범위는 보기 선택이고 가시성은 서버가 판정했다.
 * - 종목 이름 = relay 라벨(`useIsinLabels`) → 마스터 폴백(`useStockNames` — relay 가 이름을 모르는 종목만) →
 *   단축코드 → ISIN(오늘 주문 카드 ⑥ 규율 · 새 조회 경로 없음).
 * - 필터를 바꾸면 목록이 맨 아래로 · 핀 0 · 폰 펼침 전부 접힘(`resetKey` = 필터 JSON).
 * - 창 분리 = `/trading/order-log?{정본 쿼리}` 를 `gh-radar-order-log` 창(960×720)으로 — 같은 창 재사용 · opener 는
 *   연 뒤 끊는다(R3 · R4 · WR-04 — `noopener` 는 이름 재사용을 막아 쓰지 않는다).
 * - 새 색 토큰 0 · 새 shadcn 컴포넌트 0 · 폰 판정은 prop(새 경계 숫자 없음).
 */
import { useCallback, useMemo, useState } from 'react';
import { kstDateIso } from '@gh-radar/shared';
import type { StrategyEventRow } from '@gh-radar/shared';

import { useIsinLabels } from '@/lib/isin-labels';
import {
  DEFAULT_ORDER_LOG_FILTERS,
  ORDER_LOG_WINDOW_PATH,
  applyOrderLogFilters,
  inScope,
  openOrderLogWindow,
  orderLogQueryString,
  stockOptions,
  type OrderLogFilters as OrderLogFilterValue,
} from '@/lib/order-log-feed';
import { useStockNames } from '@/lib/stock-names';
import type { OrderLogFeed } from '@/lib/use-order-log-feed';

import { OrderLogFilters } from './order-log-filters';
import { OrderLogList } from './order-log-list';

export interface OrderLogPanelProps {
  /** 상태줄 단일 계좌. 빈 문자열 = 계좌 없음(시세 이벤트만). */
  accountNo: string;
  phoneBand?: boolean | null;
  feed: OrderLogFeed;
}

/**
 * 종목 표시명 3단 폴백 — 이름(relay → 마스터) → 코드 → ISIN. 이미 받은 프레임 · 마스터 캐시만 읽는다.
 * 카드 탭 · 창 분리도 같은 규칙을 쓴다.
 */
export function useOrderLogNameOf(rows: readonly StrategyEventRow[]): (row: StrategyEventRow) => string {
  const labels = useIsinLabels();
  const unnamed = useMemo(
    () => [...new Set(rows.map((r) => r.isin))].filter((isin) => !labels.get(isin)?.name),
    [rows, labels],
  );
  const masterNames = useStockNames(unnamed);
  return useCallback(
    (row: StrategyEventRow) => {
      const label = labels.get(row.isin);
      return label?.name || masterNames.get(row.isin) || row.stockCode || label?.code || row.isin;
    },
    [labels, masterNames],
  );
}

export function OrderLogPanel({ accountNo, phoneBand, feed }: OrderLogPanelProps) {
  const [filters, setFilters] = useState<OrderLogFilterValue>(DEFAULT_ORDER_LOG_FILTERS);

  const scoped = useMemo(() => {
    const scope = { accountNo: accountNo === '' ? null : accountNo };
    return feed.rows.filter((r) => inScope(r, scope));
  }, [feed.rows, accountNo]);
  const visible = useMemo(() => applyOrderLogFilters(scoped, filters), [scoped, filters]);
  const nameOf = useOrderLogNameOf(scoped);
  const options = useMemo(() => stockOptions(scoped, nameOf), [scoped, nameOf]);

  const popout = useCallback(() => {
    const today = kstDateIso();
    const query = orderLogQueryString(
      { account: accountNo === '' ? null : accountNo, date: feed.date || today, filters },
      today,
    );
    openOrderLogWindow(query === '' ? ORDER_LOG_WINDOW_PATH : `${ORDER_LOG_WINDOW_PATH}?${query}`);
  }, [accountNo, feed.date, filters]);

  // 「상한가 특징」 체크 켜짐도 기본값이 아닌 필터다(UI-SPEC ②-1 빈 문구 판정 · Phase 28 D-07).
  const filtered =
    filters.stock !== 'all' || filters.ex !== 'all' || filters.kind !== 'all' || feed.showLimitFeature;

  return (
    <div data-slot="order-log-panel" className="min-w-0">
      <OrderLogFilters
        filters={filters}
        onChange={setFilters}
        stockOptions={options}
        count={visible.length}
        onPopout={popout}
        showLimitFeature={feed.showLimitFeature}
        onShowLimitFeatureChange={feed.setShowLimitFeature}
      />
      <OrderLogList
        rows={visible}
        variant="panel"
        nameOf={nameOf}
        newKeys={feed.newKeys}
        phoneBand={phoneBand}
        status={feed.status}
        onRetry={feed.retry}
        filteredEmpty={filtered && scoped.length > 0}
        resetKey={`${JSON.stringify(filters)}|${feed.showLimitFeature ? 'lf' : ''}`}
      />
    </div>
  );
}
