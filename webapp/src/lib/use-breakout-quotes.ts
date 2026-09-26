/**
 * 돌파 종목 다중 시세 구독 훅 (Phase 18 D-16, TRADE-06).
 *
 * ① `useRelaySubscription` 과 **같은 계약**이다 — 다른 점은 키가 집합이라는 것뿐이다
 *   `useRelayContext()` 의 `subscribe`/`unsubscribe` 참조계수 API 만 쓴다. 소켓 프레임을
 *   직접 만들지 않는다 — 재구독 트리거는 세션 `ready` 하나(`flushSubscriptions`)뿐이고, 경로를
 *   두 벌 만들면 「재접속 후 새로고침해야 돌파 행 시세가 나온다」가 된다(RESEARCH Pitfall 7).
 *   참조계수라 카드·호가 탭·돌파 행이 같은 종목을 봐도 와이어는 1벌이다.
 *
 * ② 거래소는 행의 발화 거래소(피드 거래소)다 (quick-260926-rcc)
 *   76 의 exchange 는 발화 체결의 거래소, 78 원소의 exchange 는 above 구간을 연 거래소다 — gh-trade
 *   quick-260923-cfo 부터 서버는 KRX 접속매매 세션이 닫힌 08:00~09:00 · 15:30~16:00 의 NXT 접속매매도
 *   판정하므로 NXT 일 수 있다. 행마다 그 피드 하나만 구독하고, 발화 거래소가 바뀌면 옛 피드를 풀고
 *   새 피드를 건다 — 두 거래소 동시 구독은 없다(gh-trade FeedExchange/ReconcileFeed). 해제는 언제나
 *   장부에 기록된, 실제로 건 (ISIN, 거래소) 쌍으로 한다(gh-trade 해제 대칭). 칩에 거래소를 표시하지
 *   않는 것(D-07)은 그대로다.
 *
 * ③ 구독 diff — 남는 키는 건드리지 않는다
 *   키는 피드 키(`breakoutFeedKey` — ISIN 과 거래소)다. effect 재실행은 선택된 피드 키를 정렬·결합한
 *   **안정 문자열 시그니처**로만 유발한다(새 배열 인스턴스로는
 *   재실행되지 않는다). 집합이 바뀌면 빠진 키만 해제하고 새 키만 구독한다 — 전량 해제 후 재구독하면
 *   남는 종목의 참조계수가 0 을 지나 업스트림 해제·재구독이 한 번 더 나간다. 언마운트에서 이 훅이
 *   잡은 키를 전부 해제한다.
 *
 * ④ 자율 상한 `MAX_BREAKOUT_SUBS`
 *   카드가 소유한 구독(`excludeFeeds`)은 예산에서 빼고, 남은 예산을 최근 돌파 순으로 채운다. 제외는
 *   (ISIN, 거래소) 피드 단위다 — KRX 카드가 열린 종목이 NXT 로 발화하면 그 NXT 피드는 이 훅이 잡는다.
 *   넘친 키는 `overflow` 로 돌려준다 — 그 행은 현재가를 모르므로 `shouldRemoveBreakout` 이
 *   `currentPrice === undefined` 로 읽어 **지우지 않는다**(76 의 마지막 가격을 그대로 보인다).
 *
 * ⑤ 가격 갱신 스로틀 `BREAKOUT_PRICE_THROTTLE_MS` (quick-260923-elb 2a)
 *   스트립은 relay 컨텍스트 소비자라서 컨텍스트 분리(1b) 전까지는 커밋마다 다시 그려진다. 그런데
 *   칩에 필요한 것은 **가격 하나**이고 초당 5회면 충분하다(debug `trading-cpu-260923` #2 — 돌파 40
 *   종목의 풀 스트림이 프레임을 10배로 키웠고, 스트립은 가격 서명이 바뀔 때마다 두 번 렌더했다).
 *   그래서 원시 시세 맵을 내보내지 않고 **후보 피드 전체의 현재가(`prices`)** 만 ≤5Hz 로
 *   내보낸다. 원시 맵을 계속 내보내면 소비처가 스로틀을 우회할 수 있다. 마감은 절대 시각이라
 *   연속 틱이 갱신을 굶기지 않고, 마지막 값은 반드시 도착한다. 구독 diff 규칙(③)은 그대로다.
 *
 * ⑥ 가격 전용 구독 `BREAKOUT_SUB_LEVEL` (quick-260923-ge2 · 2b)
 *   칩은 현재가·등락률만 읽으므로 price level 로 잡는다 — 게이트웨이는 59 를 가격 섹션 갱신 때만
 *   (종목당 ≤10Hz) 보내고 71·75 는 보내지 않는다(PRICE 59 에도 호가 배열은 실려 오지만 읽지 않는다).
 *   같은 종목을 다른 소비자가 full 로 보면 relay·webapp 참조계수가 full 로 합성하고, 그 소비자가
 *   빠지면 price 로 강등된다. relay 는 게이트웨이 가동본이 구버전이어도 price 로 잡은 키에 tape 를
 *   흘리지 않는다. 호가창 카드가 연 피드는 ④ 의 `excludeFeeds` 로 애초에 이 훅이 잡지 않는다.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import type { RelayExchange, RelayQuote, RelaySubLevel } from "@gh-radar/shared";

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

/** 돌파 칩 구독 수준 — 가격 전용(⑥ · quick-260923-ge2). */
const BREAKOUT_SUB_LEVEL: RelaySubLevel = "price";

/** 시그니처 구분자 — 피드 키 안에 `|` 가 들어 있으므로 다른 문자를 쓴다(③). */
const SIG_SEP = ",";

/** 행의 피드 — (ISIN, 발화 거래소). */
interface BreakoutFeed {
  isin: string;
  exchange: RelayExchange;
}

/**
 * 돌파 행의 피드 키 — 이 훅의 `prices` · `excludeFeeds` · `subscribed` · `overflow` 가 쓰는 키의
 * **단일 정의**다. 소비자가 키 형식을 알지 않게 여기서만 만든다 (quick-260926-rcc).
 */
export function breakoutFeedKey(feed: BreakoutFeed): string {
  return relayQuoteKey(feed.isin, feed.exchange);
}

/**
 * 돌파 행의 현재가 — 행의 피드 거래소(②) 시세 맵에서 고른다. **모르면 `undefined`** 이다.
 *
 * `undefined` 는 「0원」이 아니라 「모름」이고, `shouldRemoveBreakout` 은 그 값으로 행을 지우지 않는다.
 * 다른 거래소 값으로 폴백하지 않는다 — 아침의 KRX 는 전일 종가라 NXT 행을 그 값으로 판정하면 틀린다.
 */
export function breakoutQuotePrice(
  quotes: ReadonlyMap<string, RelayQuote>,
  isin: string,
  exchange: RelayExchange,
): number | undefined {
  const q = quotes.get(relayQuoteKey(isin, exchange));
  return q !== undefined && Number.isFinite(q.p) && q.p > 0 ? q.p : undefined;
}

/** 구독 후보. `addedAt` 이 클수록 최근 돌파다. `exchange` 는 행의 발화 거래소(= 피드 거래소). */
export interface BreakoutQuoteCandidate {
  isin: string;
  exchange: RelayExchange;
  addedAt: number;
}

export interface BreakoutQuotesResult {
  /**
   * 피드 키(`breakoutFeedKey`) → 현재가 — **후보 피드 전체**(구독 여부 무관)의 **알려진 값만**,
   * ≤5Hz 로 갱신된다(⑤).
   *
   * 카드 피드는 구독 예산에서만 빠진다 — 그 가격은 카드 자신의 구독으로 전역 맵에 있으므로 여기에도
   * 있다. 키가 없으면 「모름」이지 0원이 아니다. 값이 같으면 신원이 유지된다.
   */
  prices: ReadonlyMap<string, number>;
  /** 이 훅이 구독한 피드 키. */
  subscribed: ReadonlySet<string>;
  /** 상한을 넘어 구독하지 못한 피드 키 — 이 행은 이탈 판정을 하지 않는다. */
  overflow: readonly string[];
}

/** 선정된 피드 — 키와 (ISIN, 거래소) 쌍. */
type PickedFeed = BreakoutFeed & { key: string };

/** 예산 안에 들 피드와 넘친 피드 키를 가른다. 카드 피드는 양쪽 어디에도 넣지 않는다. */
function pickWithinBudget(
  candidates: readonly BreakoutQuoteCandidate[],
  exclude: ReadonlySet<string> | undefined,
): { picked: PickedFeed[]; overflow: string[] } {
  const byFeed = new Map<string, PickedFeed & { addedAt: number }>();
  for (const c of candidates) {
    if (c.isin.length === 0) continue;
    const key = breakoutFeedKey(c);
    if (exclude?.has(key)) continue;
    const prev = byFeed.get(key);
    if (prev === undefined || c.addedAt > prev.addedAt) {
      byFeed.set(key, { key, isin: c.isin, exchange: c.exchange, addedAt: c.addedAt });
    }
  }
  // 최근 돌파가 먼저 — 동률이면 피드 키로 결정적 순서.
  const ordered = [...byFeed.values()].sort(
    (a, b) => b.addedAt - a.addedAt || a.key.localeCompare(b.key),
  );
  return {
    picked: ordered
      .slice(0, MAX_BREAKOUT_SUBS)
      .map(({ key, isin, exchange }) => ({ key, isin, exchange })),
    overflow: ordered.slice(MAX_BREAKOUT_SUBS).map((f) => f.key),
  };
}

/** 후보 피드 — 중복 제거 · 빈 ISIN 제외 · 받은 순서. */
function candidateFeeds(candidates: readonly BreakoutQuoteCandidate[]): PickedFeed[] {
  const seen = new Map<string, PickedFeed>();
  for (const c of candidates) {
    if (c.isin.length === 0) continue;
    const key = breakoutFeedKey(c);
    if (!seen.has(key)) seen.set(key, { key, isin: c.isin, exchange: c.exchange });
  }
  return [...seen.values()];
}

/** 표시 가격 서명 — 값이 바뀌었는지만 가른다(맵 **객체**가 바뀌어도 값이 같으면 같다). */
function priceSigOf(quotes: ReadonlyMap<string, RelayQuote>, feeds: readonly PickedFeed[]): string {
  return feeds
    .map((f) => `${f.key}:${breakoutQuotePrice(quotes, f.isin, f.exchange) ?? ""}`)
    .join(SIG_SEP);
}

/** 알려진 피드 가격만 담은 맵(피드 키 → 현재가). */
function readPrices(
  quotes: ReadonlyMap<string, RelayQuote>,
  feeds: readonly PickedFeed[],
): Map<string, number> {
  const prices = new Map<string, number>();
  for (const f of feeds) {
    const p = breakoutQuotePrice(quotes, f.isin, f.exchange);
    if (p !== undefined) prices.set(f.key, p);
  }
  return prices;
}

export function useBreakoutQuotes(
  candidates: readonly BreakoutQuoteCandidate[],
  opts: { excludeFeeds?: ReadonlySet<string> } = {},
): BreakoutQuotesResult {
  const { subscribe, unsubscribe, quotes } = useRelayContext();
  const { excludeFeeds } = opts;

  // 최대 200개 정렬 — 매 렌더가 아니라 후보·카드 집합이 바뀔 때만 한다.
  const { picked, overflow } = useMemo(
    () => pickWithinBudget(candidates, excludeFeeds),
    [candidates, excludeFeeds],
  );
  // 안정 시그니처 — 같은 피드 집합이면 같은 문자열이다(③).
  const sig = picked
    .map((f) => f.key)
    .sort()
    .join(SIG_SEP);
  const overflowSig = [...overflow].sort().join(SIG_SEP);

  /**
   * 이 훅이 지금 잡고 있는 구독 — 피드 키 → **실제로 건** (ISIN, 거래소). 렌더와 무관한 부수효과
   * 장부라 ref 다. 해제는 언제나 이 장부의 쌍으로 한다(② 해제 대칭).
   */
  const heldRef = useRef<Map<string, BreakoutFeed>>(new Map());
  /** 같은 렌더의 선정 결과 — 구독 effect 가 시그니처의 (ISIN, 거래소) 쌍을 여기서 읽는다. */
  const pickedRef = useRef<readonly PickedFeed[]>(picked);

  // 선언 순서상 아래 구독 effect 보다 먼저 돈다 — 그 effect 는 언제나 같은 렌더의 선정 결과를 읽는다.
  useEffect(() => {
    pickedRef.current = picked;
  });

  useEffect(() => {
    const want = new Map(pickedRef.current.map((f) => [f.key, f] as const));
    const held = heldRef.current;
    for (const [key, feed] of [...held]) {
      if (!want.has(key)) {
        unsubscribe(feed.isin, feed.exchange, BREAKOUT_SUB_LEVEL);
        held.delete(key);
      }
    }
    for (const [key, feed] of want) {
      if (!held.has(key)) {
        subscribe(feed.isin, feed.exchange, BREAKOUT_SUB_LEVEL);
        held.set(key, { isin: feed.isin, exchange: feed.exchange });
      }
    }
  }, [sig, subscribe, unsubscribe]);

  // 언마운트(또는 참조계수 API 교체) 시 잡은 피드를 전부 해제한다 — 빠뜨리면 relay 참조계수가 샌다.
  useEffect(() => {
    const held = heldRef.current;
    return () => {
      for (const feed of held.values()) unsubscribe(feed.isin, feed.exchange, BREAKOUT_SUB_LEVEL);
      held.clear();
    };
  }, [unsubscribe]);

  const subscribed = useMemo<ReadonlySet<string>>(
    () => new Set(sig === "" ? [] : sig.split(SIG_SEP)),
    [sig],
  );
  const overflowList = useMemo<readonly string[]>(
    () => (overflowSig === "" ? [] : overflowSig.split(SIG_SEP)),
    [overflowSig],
  );

  /* ── ⑤ 가격 스로틀 ─────────────────────────────────────────────────── */
  const feeds = useMemo(() => candidateFeeds(candidates), [candidates]);
  const currentSig = useMemo(() => priceSigOf(quotes, feeds), [quotes, feeds]);
  // 첫 렌더 값으로 동기 초기화 — 빈 첫 화면이 없다.
  const [shown, setShown] = useState(() => ({
    sig: currentSig,
    prices: readPrices(quotes, feeds) as ReadonlyMap<string, number>,
  }));
  const [mountedAt] = useState(() => Date.now());
  /** 마지막으로 표시 가격을 적용한 시각. 마운트 시각에서 시작한다. */
  const appliedAtRef = useRef(mountedAt);
  /** 타이머가 적용할 최신 입력. 창이 닫힐 때 그 시점의 값을 읽는다(마지막 값 도착). */
  const latestRef = useRef({ quotes, feeds });

  useEffect(() => {
    latestRef.current = { quotes, feeds };
  });

  useEffect(() => {
    if (currentSig === shown.sig) return;
    // 마감은 **절대 시각**(마지막 적용 + 간격)이다 — 재예약돼도 연속 틱이 갱신을 굶기지 않는다.
    const delay = Math.max(0, appliedAtRef.current + BREAKOUT_PRICE_THROTTLE_MS - Date.now());
    const timer = setTimeout(() => {
      const latest = latestRef.current;
      appliedAtRef.current = Date.now();
      setShown({
        sig: priceSigOf(latest.quotes, latest.feeds),
        prices: readPrices(latest.quotes, latest.feeds),
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [currentSig, shown.sig]);

  return { prices: shown.prices, subscribed, overflow: overflowList };
}
