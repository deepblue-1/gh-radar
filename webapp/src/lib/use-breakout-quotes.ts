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
 *
 * ⑤ 가격 갱신 스로틀 `BREAKOUT_PRICE_THROTTLE_MS` (quick-260923-elb 2a)
 *   스트립은 relay 컨텍스트 소비자라서 컨텍스트 분리(1b) 전까지는 커밋마다 다시 그려진다. 그런데
 *   칩에 필요한 것은 **가격 하나**이고 초당 5회면 충분하다(debug `trading-cpu-260923` #2 — 돌파 40
 *   종목의 풀 스트림이 프레임을 10배로 키웠고, 스트립은 가격 서명이 바뀔 때마다 두 번 렌더했다).
 *   그래서 원시 시세 맵을 내보내지 않고 **후보 ISIN 전체의 KRX 현재가(`prices`)** 만 ≤5Hz 로
 *   내보낸다. 원시 맵을 계속 내보내면 소비처가 스로틀을 우회할 수 있다. 마감은 절대 시각이라
 *   연속 틱이 갱신을 굶기지 않고, 마지막 값은 반드시 도착한다. 구독 diff 규칙(③)은 그대로다.
 *
 * ⑥ 가격 전용 구독 `BREAKOUT_SUB_LEVEL` (quick-260923-ge2 · 2b)
 *   칩은 현재가·등락률만 읽으므로 price level 로 잡는다 — 게이트웨이는 59 를 가격 섹션 갱신 때만
 *   (종목당 ≤10Hz) 보내고 71·75 는 보내지 않는다(PRICE 59 에도 호가 배열은 실려 오지만 읽지 않는다).
 *   같은 종목을 다른 소비자가 full 로 보면 relay·webapp 참조계수가 full 로 합성하고, 그 소비자가
 *   빠지면 price 로 강등된다. relay 는 게이트웨이 가동본이 구버전이어도 price 로 잡은 키에 tape 를
 *   흘리지 않는다. 호가창 카드가 연 종목은 ④ 의 `excludeIsins` 로 애초에 이 훅이 잡지 않는다.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import type { RelayQuote, RelaySubLevel } from "@gh-radar/shared";

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

/**
 * 돌파 칩·표의 가격 갱신 간격 — 초당 최대 2회 (⑤ · quick-260923-elb 2a).
 *
 * 처음엔 500ms(2Hz)였다. 게이트웨이 PRICE 구독 간격이 100ms 로 줄어(gh-trade quick-260923-hp5)
 * 칩도 더 빨리 따라가게 200ms(5Hz)로 올렸다 — 사용자 요청. PRICE 구독이라 돌파 종목의 프레임 자체가
 * 가격 변화 때만 오므로 1단계 측정 때보다 렌더 입력이 적다. 이탈 판정에는 이미 3초 유예
 * (`ARM_GRACE_MS`)가 있어 ≤200ms 추가 지연은 판정의 뜻을 바꾸지 않는다(T-elb-06).
 */
export const BREAKOUT_PRICE_THROTTLE_MS = 200;

/** 돌파 거래소 — 서버 정본상 KRX 에서만 발화한다(②). */
const BREAKOUT_EXCHANGE = "KRX" as const;

/** 돌파 칩 구독 수준 — 가격 전용(⑥ · quick-260923-ge2). */
const BREAKOUT_SUB_LEVEL: RelaySubLevel = "price";

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
  /**
   * ISIN → KRX 현재가 — **후보 ISIN 전체**(구독 여부 무관)의 **알려진 값만**, ≤5Hz 로 갱신된다(⑤).
   *
   * 카드 종목은 구독 예산에서만 빠진다 — 그 가격은 카드 자신의 구독으로 전역 맵에 있으므로 여기에도
   * 있다(오늘 `breakoutQuotePrice(quotes, isin)` 과 같은 뜻). 키가 없으면 「모름」이지 0원이 아니다.
   * 값이 같으면 신원이 유지된다.
   */
  prices: ReadonlyMap<string, number>;
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

/** 후보 ISIN — 중복 제거 · 빈 값 제외 · 받은 순서. */
function candidateIsins(candidates: readonly BreakoutQuoteCandidate[]): string[] {
  const seen = new Set<string>();
  for (const c of candidates) if (c.isin.length > 0) seen.add(c.isin);
  return [...seen];
}

/** 표시 가격 서명 — 값이 바뀌었는지만 가른다(맵 **객체**가 바뀌어도 값이 같으면 같다). */
function priceSigOf(quotes: ReadonlyMap<string, RelayQuote>, isins: readonly string[]): string {
  return isins.map((isin) => `${isin}:${breakoutQuotePrice(quotes, isin) ?? ""}`).join("|");
}

/** 알려진 KRX 가격만 담은 맵. */
function readPrices(
  quotes: ReadonlyMap<string, RelayQuote>,
  isins: readonly string[],
): Map<string, number> {
  const prices = new Map<string, number>();
  for (const isin of isins) {
    const p = breakoutQuotePrice(quotes, isin);
    if (p !== undefined) prices.set(isin, p);
  }
  return prices;
}

export function useBreakoutQuotes(
  candidates: readonly BreakoutQuoteCandidate[],
  opts: { excludeIsins?: ReadonlySet<string> } = {},
): BreakoutQuotesResult {
  const { subscribe, unsubscribe, quotes } = useRelayContext();
  const { excludeIsins } = opts;

  // 최대 200개 정렬 — 매 렌더가 아니라 후보·카드 집합이 바뀔 때만 한다.
  const { picked, overflow } = useMemo(
    () => pickWithinBudget(candidates, excludeIsins),
    [candidates, excludeIsins],
  );
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
        unsubscribe(isin, BREAKOUT_EXCHANGE, BREAKOUT_SUB_LEVEL);
        held.delete(isin);
      }
    }
    for (const isin of want) {
      if (!held.has(isin)) {
        subscribe(isin, BREAKOUT_EXCHANGE, BREAKOUT_SUB_LEVEL);
        held.add(isin);
      }
    }
  }, [sig, subscribe, unsubscribe]);

  // 언마운트(또는 참조계수 API 교체) 시 잡은 키를 전부 해제한다 — 빠뜨리면 relay 참조계수가 샌다.
  useEffect(() => {
    const held = heldRef.current;
    return () => {
      for (const isin of held) unsubscribe(isin, BREAKOUT_EXCHANGE, BREAKOUT_SUB_LEVEL);
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

  /* ── ⑤ 가격 스로틀 ─────────────────────────────────────────────────── */
  const isins = useMemo(() => candidateIsins(candidates), [candidates]);
  const currentSig = useMemo(() => priceSigOf(quotes, isins), [quotes, isins]);
  // 첫 렌더 값으로 동기 초기화 — 빈 첫 화면이 없다.
  const [shown, setShown] = useState(() => ({
    sig: currentSig,
    prices: readPrices(quotes, isins) as ReadonlyMap<string, number>,
  }));
  const [mountedAt] = useState(() => Date.now());
  /** 마지막으로 표시 가격을 적용한 시각. 마운트 시각에서 시작한다. */
  const appliedAtRef = useRef(mountedAt);
  /** 타이머가 적용할 최신 입력. 창이 닫힐 때 그 시점의 값을 읽는다(마지막 값 도착). */
  const latestRef = useRef({ quotes, isins });

  useEffect(() => {
    latestRef.current = { quotes, isins };
  });

  useEffect(() => {
    if (currentSig === shown.sig) return;
    // 마감은 **절대 시각**(마지막 적용 + 간격)이다 — 재예약돼도 연속 틱이 갱신을 굶기지 않는다.
    const delay = Math.max(0, appliedAtRef.current + BREAKOUT_PRICE_THROTTLE_MS - Date.now());
    const timer = setTimeout(() => {
      const latest = latestRef.current;
      appliedAtRef.current = Date.now();
      setShown({
        sig: priceSigOf(latest.quotes, latest.isins),
        prices: readPrices(latest.quotes, latest.isins),
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [currentSig, shown.sig]);

  return { prices: shown.prices, subscribed, overflow: overflowList };
}
