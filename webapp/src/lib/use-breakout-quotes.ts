/**
 * 돌파 종목 다중 시세 구독 훅 (Phase 18 D-16, TRADE-06).
 *
 * ① `useRelaySubscription` 과 **같은 계약**이다 — 다른 점은 키가 집합이라는 것뿐이다
 *   `useRelayContext()` 의 `subscribe`/`unsubscribe` 참조계수 API 만 쓴다. 소켓 프레임을
 *   직접 만들지 않는다 — 재구독 트리거는 세션 `ready` 하나(`flushSubscriptions`)뿐이고, 경로를
 *   두 벌 만들면 「재접속 후 새로고침해야 돌파 행 시세가 나온다」가 된다(RESEARCH Pitfall 7).
 *   참조계수라 카드·호가 탭·돌파 행이 같은 종목을 봐도 와이어는 1벌이다.
 *
 * ② 거래소는 `"KRX"` 고정이다
 *   돌파 감지는 서버 정본상 KRX A3 에서만 발화한다(gh-trade `rate-cross-alert.md` ②). 칩에
 *   거래소를 표시하지 않는 것(D-07)과도 일관된다.
 *
 * ③ 구독 diff — 남는 키는 건드리지 않는다
 *   effect 재실행은 선택된 키를 정렬·결합한 **안정 문자열 시그니처**로만 유발한다(새 배열 인스턴스로는
 *   재실행되지 않는다). 집합이 바뀌면 빠진 키만 해제하고 새 키만 구독한다 — 전량 해제 후 재구독하면
 *   남는 종목의 참조계수가 0 을 지나 업스트림 해제·재구독이 한 번 더 나간다. 언마운트에서 이 훅이
 *   잡은 키를 전부 해제한다.
 *
 * ④ 자율 상한 `MAX_BREAKOUT_SUBS`
 *   카드가 소유한 구독(`excludeIsins`)은 예산에서 빼고, 남은 예산을 최근 돌파 순으로 채운다.
 *   넘친 키는 `overflow` 로 돌려준다 — 그 행은 현재가를 모르므로 `shouldRemoveBreakout` 이
 *   `currentPrice === undefined` 로 읽어 **지우지 않는다**(76 의 마지막 가격을 그대로 보인다).
 */

import { useEffect, useMemo, useRef } from "react";

import type { RelayQuote } from "@gh-radar/shared";

import { useRelayContext } from "@/lib/relay-provider";
import { relayQuoteKey } from "@/lib/use-relay-socket";

/**
 * 돌파 목록이 스스로 잡는 구독의 상한.
 *
 * ⚠️ **실측이 아니라 보수적 선택**이다. relay `SubscriptionHub` 에는 구독 수 상한이 없음이
 *    실측됐고, 게이트웨이(gh-trade) 세션당 상한은 **확인되지 않았다** — 「상한이 없다」고 읽지 말 것.
 *    돌파 200 상한(D-14)을 전부 구독하지 않겠다는 선택이다(RESEARCH §Pattern 1).
 */
export const MAX_BREAKOUT_SUBS = 40;

/** 돌파 거래소 — 서버 정본상 KRX 에서만 발화한다(②). */
const BREAKOUT_EXCHANGE = "KRX" as const;

/**
 * 돌파 행의 현재가 — 구독 거래소(②)의 시세 맵에서 고른다. **모르면 `undefined`** 이다.
 *
 * 소비자(돌파 스트립)가 거래소 상수를 직접 들지 않게 하려고 여기 둔다 — 칩/행에 거래소 문자열이
 * 들어가지 않는 것(D-07)을 소스 수준에서도 지킨다. `undefined` 는 「0원」이 아니라 「모름」이고,
 * `shouldRemoveBreakout` 은 그 값으로 행을 지우지 않는다.
 */
export function breakoutQuotePrice(
  quotes: ReadonlyMap<string, RelayQuote>,
  isin: string,
): number | undefined {
  const q = quotes.get(relayQuoteKey(isin, BREAKOUT_EXCHANGE));
  return q !== undefined && Number.isFinite(q.p) && q.p > 0 ? q.p : undefined;
}

/** 구독 후보. `addedAt` 이 클수록 최근 돌파다. */
export interface BreakoutQuoteCandidate {
  isin: string;
  addedAt: number;
}

export interface BreakoutQuotesResult {
  /** 컨텍스트 시세 맵 그대로 — 소비자가 `relayQuoteKey(isin, "KRX")` 로 골라 쓴다. */
  quotes: ReadonlyMap<string, RelayQuote>;
  /** 이 훅이 구독한 ISIN. */
  subscribed: ReadonlySet<string>;
  /** 상한을 넘어 구독하지 못한 ISIN — 이 행은 이탈 판정을 하지 않는다. */
  overflow: readonly string[];
}

/** 예산 안에 들 ISIN 과 넘친 ISIN 을 가른다. 카드 종목은 양쪽 어디에도 넣지 않는다. */
function pickWithinBudget(
  candidates: readonly BreakoutQuoteCandidate[],
  exclude: ReadonlySet<string> | undefined,
): { picked: string[]; overflow: string[] } {
  const byIsin = new Map<string, number>();
  for (const c of candidates) {
    if (c.isin.length === 0 || exclude?.has(c.isin)) continue;
    const prev = byIsin.get(c.isin);
    if (prev === undefined || c.addedAt > prev) byIsin.set(c.isin, c.addedAt);
  }
  // 최근 돌파가 먼저 — 동률이면 ISIN 으로 결정적 순서.
  const ordered = [...byIsin].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return {
    picked: ordered.slice(0, MAX_BREAKOUT_SUBS).map(([isin]) => isin),
    overflow: ordered.slice(MAX_BREAKOUT_SUBS).map(([isin]) => isin),
  };
}

export function useBreakoutQuotes(
  candidates: readonly BreakoutQuoteCandidate[],
  opts: { excludeIsins?: ReadonlySet<string> } = {},
): BreakoutQuotesResult {
  const { subscribe, unsubscribe, quotes } = useRelayContext();
  const { excludeIsins } = opts;

  const { picked, overflow } = pickWithinBudget(candidates, excludeIsins);
  // 안정 시그니처 — 같은 집합이면 같은 문자열이다(③).
  const sig = [...picked].sort().join("|");
  const overflowSig = [...overflow].sort().join("|");

  /** 이 훅이 지금 잡고 있는 구독. 렌더와 무관한 부수효과 장부라 ref 다. */
  const heldRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const want = new Set(sig === "" ? [] : sig.split("|"));
    const held = heldRef.current;
    for (const isin of [...held]) {
      if (!want.has(isin)) {
        unsubscribe(isin, BREAKOUT_EXCHANGE);
        held.delete(isin);
      }
    }
    for (const isin of want) {
      if (!held.has(isin)) {
        subscribe(isin, BREAKOUT_EXCHANGE);
        held.add(isin);
      }
    }
  }, [sig, subscribe, unsubscribe]);

  // 언마운트(또는 참조계수 API 교체) 시 잡은 키를 전부 해제한다 — 빠뜨리면 relay 참조계수가 샌다.
  useEffect(() => {
    const held = heldRef.current;
    return () => {
      for (const isin of held) unsubscribe(isin, BREAKOUT_EXCHANGE);
      held.clear();
    };
  }, [unsubscribe]);

  const subscribed = useMemo<ReadonlySet<string>>(
    () => new Set(sig === "" ? [] : sig.split("|")),
    [sig],
  );
  const overflowList = useMemo<readonly string[]>(
    () => (overflowSig === "" ? [] : overflowSig.split("|")),
    [overflowSig],
  );

  return { quotes, subscribed, overflow: overflowList };
}
