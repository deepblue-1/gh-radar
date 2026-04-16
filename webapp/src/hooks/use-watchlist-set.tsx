"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";

/**
 * Phase 06.2 Plan 07 Task 1 — useWatchlistSet.
 *
 * StockHero / Scanner Table / Scanner Card / Watchlist Table / Watchlist Card 5개 위치에서
 * 각 `stock_code` 가 관심종목에 포함되는지 O(1) 로 조회하기 위한 전역 Set 훅.
 *
 * 설계:
 * - Scanner 결과가 많은 경우(수십~수백 종목) 카드/행마다 개별 쿼리를 날리면 N+1 이 된다.
 *   Provider 가 한 번 fetch → Set<string> 공유 → 각 WatchlistToggle 이 `set.has(code)` 로 조회.
 * - Provider 는 AuthProvider 내부에 배치 (useAuth 선행 요구).
 * - user 가 없으면 빈 Set — 비로그인 사용자에게 WatchlistToggle 은 null 반환(Task 2 책임).
 * - optimisticAdd / optimisticRemove 로 토글 클릭 즉시 UI 반영. refresh 로 서버 재동기화.
 *
 * 상한 (Plan 02 trigger 와 동일):
 * - WATCHLIST_LIMIT = 50. `isAtLimit` derived 값으로 노출 — Toggle 의 unset → disabled
 *   전환에 사용 (UI-SPEC §5 "Disabled").
 */

const WATCHLIST_LIMIT = 50;

export interface WatchlistSetValue {
  /** 현재 관심종목으로 등록된 stock_code 의 Set. */
  set: Set<string>;
  /** `set.size` 별칭 — renderer 편의. */
  count: number;
  /** size >= 50 인지 여부. WatchlistToggle 의 unset → disabled 분기에 사용. */
  isAtLimit: boolean;
  /** 클릭 즉시 UI 반영용 — 서버 insert 전에 호출. */
  optimisticAdd: (stockCode: string) => void;
  /** 클릭 즉시 UI 반영용 — 서버 delete 전에 호출. */
  optimisticRemove: (stockCode: string) => void;
  /** 성공적 insert/delete 이후 서버와 재동기화 — 타 탭/디바이스 반영 보장. */
  refresh: () => Promise<void>;
}

const NOOP = () => {};
const NOOP_REFRESH = async () => {};
const EMPTY_VALUE: WatchlistSetValue = {
  set: new Set<string>(),
  count: 0,
  isAtLimit: false,
  optimisticAdd: NOOP,
  optimisticRemove: NOOP,
  refresh: NOOP_REFRESH,
};

const WatchlistSetContext = createContext<WatchlistSetValue | null>(null);

export function WatchlistSetProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [set, setSet] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!user) {
      setSet(new Set());
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from("watchlists")
      .select("stock_code")
      .eq("user_id", user.id);
    if (error || !data) return;
    setSet(
      new Set((data as { stock_code: string }[]).map((r) => r.stock_code)),
    );
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const optimisticAdd = useCallback((stockCode: string) => {
    setSet((prev) => {
      if (prev.has(stockCode)) return prev;
      const next = new Set(prev);
      next.add(stockCode);
      return next;
    });
  }, []);

  const optimisticRemove = useCallback((stockCode: string) => {
    setSet((prev) => {
      if (!prev.has(stockCode)) return prev;
      const next = new Set(prev);
      next.delete(stockCode);
      return next;
    });
  }, []);

  const value: WatchlistSetValue = {
    set,
    count: set.size,
    isAtLimit: set.size >= WATCHLIST_LIMIT,
    optimisticAdd,
    optimisticRemove,
    refresh,
  };

  return (
    <WatchlistSetContext.Provider value={value}>
      {children}
    </WatchlistSetContext.Provider>
  );
}

/**
 * Hook — Provider 바깥에서는 빈 Set + no-op 을 반환. 테스트 환경에서 Provider 없이도
 * WatchlistToggle 이 throw 하지 않도록 함. production 은 항상 Provider 내부에 있음.
 */
export function useWatchlistSet(): WatchlistSetValue {
  return useContext(WatchlistSetContext) ?? EMPTY_VALUE;
}

export { WatchlistSetContext, WATCHLIST_LIMIT };
