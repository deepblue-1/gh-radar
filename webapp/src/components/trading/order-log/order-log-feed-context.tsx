'use client';

/**
 * OrderLogFeedProvider — 작업대 공용 주문로그 피드 (Phase 25-07 · D-07).
 *
 * 작업대 마운트 시 하루치 `GET /api/strategy-events` **1회** + `journal.events` 푸시 이어붙임을 한 곳(`useOrderLogFeed`)
 * 에서 들고, 공용 패널 「주문로그」 탭과 카드 탭(25-10)이 **같은 피드**를 읽는다 — 표면마다 조회하면 카드 N장이
 * 조회 N번이 된다(사용자 수 · 카드 수와 무관한 호출량 원칙).
 *
 * `useOrderLogFeedContext()` 는 Provider 밖이면 throw 하지 않고 `null` 을 준다 — 작업대 밖 렌더 · 단위 테스트에서
 * 공용 패널이 터지지 않게(소비처는 `EMPTY_ORDER_LOG_FEED` 로 떨어진다).
 */
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import { useOrderLogFeed, type OrderLogFeed } from '@/lib/use-order-log-feed';

const OrderLogFeedContext = createContext<OrderLogFeed | null>(null);

export function OrderLogFeedProvider({ date, children }: { date?: string; children: ReactNode }) {
  const feed = useOrderLogFeed({ date });
  return <OrderLogFeedContext.Provider value={feed}>{children}</OrderLogFeedContext.Provider>;
}

export function useOrderLogFeedContext(): OrderLogFeed | null {
  return useContext(OrderLogFeedContext);
}
