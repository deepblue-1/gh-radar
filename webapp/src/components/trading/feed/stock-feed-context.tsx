'use client';

/**
 * 작업대 안 공유 뉴스·공시 피드 (Phase 41 D-04 · D-17 · D-18).
 *
 * - 폴링은 작업대에 하나 — `StockFeedProvider` 가 `useStockFeedPolling` 을 한 번 돌리고, ② 돌파 칩 · 표와
 *   ③ 상따 카드 띠(41-07)가 같은 응답을 읽는다. 같은 탭의 다른 화면은 이 공급자가 없으니 폴링도 없다.
 * - 문맥은 둘로 나눈다. 갱신 주기가 달라서다.
 *   · `StockFeedEntriesContext` — entries. 10초 폴링 응답 때만 바뀐다. 칩 · 표는 이것만 읽는다
 *     (5Hz 가격 렌더 경로에 1초 강조 시계를 섞지 않는다 — trading-cpu-260923).
 *   · `StockFeedClockContext` — `now` · `firstSeen`. 강조할 글이 있을 때만 1초 타이머 **하나**가 `now` 를 올린다.
 *     글마다 타이머를 걸지 않는다(돌파 강조 규칙 ⑤ — 최대 수백 줄). 강조할 글이 없으면 타이머가 멈춘다.
 *   · `StockFeedFailedContext` — 연속 실패한 코드(IN-61). 실패 상태가 바뀔 때만 바뀐다. 첫 응답 전 코드의 자리가
 *     「불러오는 중」 대신 「불러오지 못했어요」 를 말하는 데 쓴다. 형식 밖 코드(`SHORT_CODE_RE`)는 폴링에서 빠지므로
 *     처음부터 실패로 본다.
 * - 공급자 밖이면 빈 Map · undefined · 항상 거짓 · 「공급자 없음」 — 오류를 던지지 않는다.
 *   `useStockFeedAvailable` 로 41-07 띠가 「공급자 없음 = 그리지 않음」 과 「첫 응답 전 = 자리만」 을 가른다.
 * - 거르기 · 합치기는 서버가 한 번 했다 — 받은 대로 그린다(D-14).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SHORT_CODE_RE, type StockFeedEntry } from '@gh-radar/shared';

import { STOCK_FEED_NEW_MS, isFeedItemNew, useStockFeedPolling } from '@/lib/use-stock-feed';

/** 강조 시계 간격. */
const CLOCK_TICK_MS = 1000;

/** entries — `null` 이면 공급자 밖. 테스트는 이 문맥에 값을 직접 넣을 수 있다. */
export const StockFeedEntriesContext = createContext<ReadonlyMap<string, StockFeedEntry> | null>(null);

interface StockFeedClock {
  now: number;
  firstSeen: ReadonlyMap<string, number>;
}

const StockFeedClockContext = createContext<StockFeedClock | null>(null);

/** 연속 실패한 코드 — `null` 이면 공급자 밖. */
export const StockFeedFailedContext = createContext<ReadonlySet<string> | null>(null);

const EMPTY_ENTRIES: ReadonlyMap<string, StockFeedEntry> = new Map();

export function StockFeedProvider({ codes, children }: { codes: readonly string[]; children: ReactNode }) {
  const { entries, firstSeen, failed } = useStockFeedPolling(codes);
  const [now, setNow] = useState(() => Date.now());

  // 가장 늦게 처음 본 글이 아직 30초 안인가 — 그때만 시계가 돈다.
  let latest = Number.NEGATIVE_INFINITY;
  for (const t of firstSeen.values()) if (t > latest) latest = t;
  const highlighting = latest + STOCK_FEED_NEW_MS > now;

  useEffect(() => {
    if (!highlighting) return;
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, [highlighting]);

  const clock = useMemo<StockFeedClock>(() => ({ now, firstSeen }), [now, firstSeen]);

  return (
    <StockFeedEntriesContext.Provider value={entries}>
      <StockFeedFailedContext.Provider value={failed}>
        <StockFeedClockContext.Provider value={clock}>{children}</StockFeedClockContext.Provider>
      </StockFeedFailedContext.Provider>
    </StockFeedEntriesContext.Provider>
  );
}

/** 코드 → 묶음. 공급자 밖이면 빈 Map. */
export function useStockFeedEntries(): ReadonlyMap<string, StockFeedEntry> {
  return useContext(StockFeedEntriesContext) ?? EMPTY_ENTRIES;
}

/** 한 종목의 묶음 — 첫 응답 전 · 공급자 밖 · 코드 없음이면 undefined. */
export function useStockFeedEntry(code: string | null | undefined): StockFeedEntry | undefined {
  const entries = useStockFeedEntries();
  return code ? entries.get(code) : undefined;
}

/** 글 id → 지금 강조 중인가. 강조 시계를 읽으므로 1초마다 다시 그려진다 — 글 목록에서만 쓴다. */
export function useStockFeedIsNew(): (id: string) => boolean {
  const clock = useContext(StockFeedClockContext);
  return useCallback(
    (id: string) => (clock === null ? false : isFeedItemNew(id, clock.firstSeen, clock.now)),
    [clock],
  );
}

/**
 * 그 코드의 조회가 실패 중인가(IN-61) — 연속 실패 회차가 상한을 넘었거나 형식 밖 코드(폴링 대상 아님).
 * 공급자 밖 · 코드 없음이면 거짓. 마지막 entries 가 있으면 화면은 그 값을 그대로 쓰고 이 값은 첫 응답 전 자리에만 쓴다.
 */
export function useStockFeedFailed(code: string | null | undefined): boolean {
  const failed = useContext(StockFeedFailedContext);
  if (failed === null || !code) return false;
  return !SHORT_CODE_RE.test(code) || failed.has(code);
}

/** 공급자 안인가. */
export function useStockFeedAvailable(): boolean {
  return useContext(StockFeedEntriesContext) !== null;
}
