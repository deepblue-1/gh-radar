import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { RelayQuote } from "@gh-radar/shared";

/**
 * Phase 18 Plan 04 Task 3 — 돌파 종목 다중 시세 구독 훅 (D-16, TRADE-06).
 *
 * 잠그는 명제:
 *  ① `useRelayContext().subscribe/unsubscribe` 참조계수 API 만 price level 로 쓴다 — 소켓 프레임을 직접 만들지 않는다
 *     (quick-260923-ge2 — 3번째 인자 `"price"` 는 계약 변경이라 호출 단언을 함께 갱신했다)
 *  ② 구독 diff — 빈 집합 무호출 · 초기 구독 · 같은 집합 재렌더 무호출 · 교체(남는 키 무변경) · 언마운트 전량 해제
 *  ③ 행의 발화 거래소로 구독한다 — 후보마다 (isin, exchange) 피드 하나 · 전환 시 옛 피드 해제 1 + 새 피드 구독 1
 *     (quick-260926-rcc · gh-trade FeedExchange/ReconcileFeed)
 *  ④ 자율 상한 `MAX_BREAKOUT_SUBS` — 카드 피드(ISIN, 거래소)는 예산 제외, 남은 예산은 최근 돌파 순, 넘친 키는 반환
 *  ⑤ 가격 스로틀 `BREAKOUT_PRICE_THROTTLE_MS` — 후보 피드 전체의 현재가만 ≤5Hz 로 내보낸다 (quick-260923-elb 2a)
 *
 * quick-260926-rcc 갱신: `prices` · `subscribed` · `overflow` · `excludeFeeds` 는 피드 키(`breakoutFeedKey`)다.
 */

type RelayShape = ReturnType<typeof import("@/lib/relay-provider").useRelayContext>;

let mockRelay: RelayShape;

vi.mock("@/lib/relay-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/relay-provider")>();
  return { ...actual, useRelayContext: () => mockRelay };
});

import { EMPTY_RELAY_VALUE } from "@/lib/relay-provider";

import { relayQuoteKey } from "@/lib/use-relay-socket";

import {
  BREAKOUT_PRICE_THROTTLE_MS,
  MAX_BREAKOUT_SUBS,
  breakoutFeedKey,
  useBreakoutQuotes,
} from "../use-breakout-quotes";

const A = "KR7005930003";
const B = "KR7000660001";
const C = "KR7035420009";

const subscribe = vi.fn();
const unsubscribe = vi.fn();

beforeEach(() => {
  subscribe.mockReset();
  unsubscribe.mockReset();
  mockRelay = { ...EMPTY_RELAY_VALUE, subscribe, unsubscribe };
});

type X = "KRX" | "NXT";

/** addedAt 이 클수록 최근 돌파. 거래소는 KRX(행의 발화 거래소 기본값). */
function cands(...isins: string[]) {
  return isins.map((isin, i) => ({ isin, exchange: "KRX" as X, addedAt: i }));
}

/** 거래소를 지정한 후보 — `[isin, exchange]` 쌍, addedAt 은 순번. */
function feeds(...pairs: Array<[string, X]>) {
  return pairs.map(([isin, exchange], i) => ({ isin, exchange, addedAt: i }));
}

/** 피드 키 — 훅의 단일 정의를 그대로 쓴다. */
function fk(isin: string, exchange: X = "KRX"): string {
  return breakoutFeedKey({ isin, exchange });
}

describe("useBreakoutQuotes — 구독 diff", () => {
  it("빈 집합이면 subscribe 가 한 번도 불리지 않는다", () => {
    renderHook(() => useBreakoutQuotes([]));
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("[A, B] 로 마운트하면 KRX 로 각 1회 구독한다", () => {
    renderHook(() => useBreakoutQuotes(cands(A, B)));
    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(subscribe).toHaveBeenCalledWith(A, "KRX", "price");
    expect(subscribe).toHaveBeenCalledWith(B, "KRX", "price");
  });

  it("같은 집합으로 재렌더(새 배열 인스턴스)하면 추가 호출이 없다", () => {
    const { rerender } = renderHook(({ c }) => useBreakoutQuotes(c), {
      initialProps: { c: cands(A, B) },
    });
    subscribe.mockClear();
    rerender({ c: cands(A, B) });
    rerender({ c: [...cands(B, A)] });
    expect(subscribe).not.toHaveBeenCalled();
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it("[A, B] → [B, C] 면 A 해제 1회 · C 구독 1회이고 B 는 건드리지 않는다", () => {
    const { rerender } = renderHook(({ c }) => useBreakoutQuotes(c), {
      initialProps: { c: cands(A, B) },
    });
    subscribe.mockClear();
    rerender({ c: cands(B, C) });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledWith(A, "KRX", "price");
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith(C, "KRX", "price");
  });

  it("언마운트하면 남은 키를 전부 해제한다", () => {
    const { unmount } = renderHook(() => useBreakoutQuotes(cands(A, B)));
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(2);
    expect(unsubscribe).toHaveBeenCalledWith(A, "KRX", "price");
    expect(unsubscribe).toHaveBeenCalledWith(B, "KRX", "price");
  });

  it("원시 시세 맵은 내보내지 않는다 — 소비자는 스로틀된 prices(피드 키 → 현재가)만 본다", () => {
    const { result } = renderHook(() => useBreakoutQuotes(cands(A)));
    // 원시 맵을 계속 내보내면 소비처가 스로틀을 우회할 수 있다(quick-260923-elb 2a).
    expect(result.current).not.toHaveProperty("quotes");
    expect(result.current.prices).toBeInstanceOf(Map);
  });
});

describe("useBreakoutQuotes — 행의 발화 거래소 피드 (quick-260926-rcc)", () => {
  it("[A·KRX, B·NXT] 로 마운트하면 각 행의 거래소로 1회씩 구독한다", () => {
    renderHook(() => useBreakoutQuotes(feeds([A, "KRX"], [B, "NXT"])));
    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(subscribe).toHaveBeenCalledWith(A, "KRX", "price");
    expect(subscribe).toHaveBeenCalledWith(B, "NXT", "price");
  });

  it("A 의 발화 거래소가 KRX → NXT 로 바뀌면 옛 피드 해제 1 + 새 피드 구독 1 · B 는 건드리지 않는다 · 언마운트는 실제로 건 피드로", () => {
    const { rerender, unmount } = renderHook(({ c }) => useBreakoutQuotes(c), {
      initialProps: { c: feeds([A, "KRX"], [B, "KRX"]) },
    });
    subscribe.mockClear();
    rerender({ c: feeds([A, "NXT"], [B, "KRX"]) });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledWith(A, "KRX", "price");
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith(A, "NXT", "price");

    unsubscribe.mockClear();
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(2);
    expect(unsubscribe).toHaveBeenCalledWith(A, "NXT", "price");
    expect(unsubscribe).toHaveBeenCalledWith(B, "KRX", "price");
    expect(unsubscribe).not.toHaveBeenCalledWith(A, "KRX", "price");
  });

  it("카드 제외는 (ISIN, 거래소) 피드 단위다 — A·KRX 카드가 있어도 A·NXT 후보는 구독한다", () => {
    const exclude = new Set([fk(A, "KRX")]);
    renderHook(() => useBreakoutQuotes(feeds([A, "KRX"]), { excludeFeeds: exclude }));
    expect(subscribe).not.toHaveBeenCalled();

    subscribe.mockClear();
    renderHook(() => useBreakoutQuotes(feeds([A, "NXT"]), { excludeFeeds: exclude }));
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith(A, "NXT", "price");
  });
});

describe("useBreakoutQuotes — 자율 상한과 우선순위", () => {
  it("MAX_BREAKOUT_SUBS 는 40 이다", () => {
    expect(MAX_BREAKOUT_SUBS).toBe(40);
  });

  it("상한을 넘으면 카드 종목을 빼고 최근 돌파 순 상위 40개만 구독하고, 넘친 키를 돌려준다", () => {
    // 45종목 — addedAt 0(가장 오래됨) … 44(가장 최근). 최근 2종목은 카드가 있다.
    const allIsins = Array.from({ length: 45 }, (_, i) => `KR7${String(i).padStart(8, "0")}0`);
    const all = allIsins.map((isin, i) => ({ isin, exchange: "KRX" as X, addedAt: i }));
    const cardFeeds = new Set([fk(all[44].isin), fk(all[43].isin)]);
    const { result } = renderHook(() => useBreakoutQuotes(all, { excludeFeeds: cardFeeds }));

    expect(subscribe).toHaveBeenCalledTimes(MAX_BREAKOUT_SUBS);
    const subscribed = subscribe.mock.calls.map((c) => c[0] as string);
    // 카드 종목은 카드가 이미 구독을 소유한다 — 예산에서 제외.
    expect(subscribed).not.toContain(all[44].isin);
    expect(subscribed).not.toContain(all[43].isin);
    // 남은 43종목 중 최근 40개(addedAt 3..42)가 구독되고 가장 오래된 3개가 넘친다.
    expect(new Set(subscribed)).toEqual(new Set(all.slice(3, 43).map((c) => c.isin)));
    expect([...result.current.overflow].sort()).toEqual(all.slice(0, 3).map((c) => fk(c.isin)).sort());
    expect(result.current.subscribed.size).toBe(MAX_BREAKOUT_SUBS);
    expect(subscribe.mock.calls.every((c) => c[1] === "KRX")).toBe(true);
    expect(subscribe.mock.calls.every((c) => c[2] === "price")).toBe(true);
  });
});

describe("useBreakoutQuotes — 소스 규율", () => {
  const SOURCE = readFileSync(path.resolve(__dirname, "../use-breakout-quotes.ts"), "utf8");

  it("소켓 전송이나 sub 프레임을 직접 만들지 않는다(재구독 경로 단일화)", () => {
    expect(SOURCE).not.toMatch(/\.send\(/);
    expect(SOURCE).not.toMatch(/t:\s*["']sub["']/);
  });
});

describe("useBreakoutQuotes — 가격 스로틀 (quick-260923-elb 2a)", () => {
  const D = "KR7086520004";

  function q(isin: string, p: number, x: "KRX" | "NXT" = "KRX"): RelayQuote {
    return { t: "q", i: isin, x, snap: false, p } as unknown as RelayQuote;
  }

  /** 컨텍스트 시세 맵을 새 인스턴스로 교체한다(리듀서처럼). */
  function setQuotes(entries: Array<[string, number, ("KRX" | "NXT")?]>) {
    mockRelay = {
      ...mockRelay,
      quotes: new Map(entries.map(([isin, p, x = "KRX"]) => [relayQuoteKey(isin, x), q(isin, p, x)])),
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("마운트 첫 렌더부터 후보 피드의 알려진 가격이 있다 — 모르거나 0·NaN 은 키가 없다", () => {
    setQuotes([[A, 70_000], [B, 0], [C, Number.NaN], [D, 9_000, "NXT"]]);
    const seen: Array<ReadonlyMap<string, number>> = [];
    renderHook(() => {
      const r = useBreakoutQuotes(cands(A, B, C, D));
      seen.push(r.prices);
      return r;
    });

    // 빈 첫 화면이 없다 — 첫 렌더의 값이 곧 표시값이다.
    expect(seen[0].get(fk(A))).toBe(70_000);
    // 「모름」이지 0원이 아니다.
    expect(seen[0].has(fk(B))).toBe(false);
    expect(seen[0].has(fk(C))).toBe(false);
    // D 는 KRX 행이다 — NXT 시세는 이 행의 현재가가 아니다(피드 키로만 읽는다).
    expect(seen[0].has(fk(D))).toBe(false);
    expect(seen[0].has(fk(D, "NXT"))).toBe(false);
  });

  it("NXT 행은 NXT 피드 가격을 읽고 같은 종목의 KRX 값은 섞이지 않는다 (quick-260926-rcc)", () => {
    setQuotes([[A, 70_000, "KRX"], [A, 71_000, "NXT"]]);
    const { result } = renderHook(() => useBreakoutQuotes(feeds([A, "NXT"])));
    expect(result.current.prices.get(fk(A, "NXT"))).toBe(71_000);
    expect(result.current.prices.has(fk(A, "KRX"))).toBe(false);
  });

  it("카드 피드(excludeFeeds)는 구독 예산에서만 빠지고 가격은 prices 에 있다", () => {
    setQuotes([[A, 70_000], [B, 51_000]]);
    const { result } = renderHook(() =>
      useBreakoutQuotes(cands(A, B), { excludeFeeds: new Set([fk(A)]) }),
    );

    // 인자 개수와 무관하게 A 를 한 번도 잡지 않았음을 본다(3번째 인자 추가로 약해지지 않게).
    expect(subscribe.mock.calls.map((c) => c[0])).not.toContain(A);
    expect(subscribe).toHaveBeenCalledWith(B, "KRX", "price");
    // 거래중 행의 표시·이탈 판정은 카드 자신의 구독으로 들어온 전역 시세를 읽는다.
    expect(result.current.prices.get(fk(A))).toBe(70_000);
    expect(result.current.prices.get(fk(B))).toBe(51_000);
  });

  it("가격이 바뀌면 THROTTLE−1 동안은 이전 값이고, 그 시점에 최신 값이 된다", () => {
    setQuotes([[A, 70_000]]);
    const { result, rerender } = renderHook(() => useBreakoutQuotes(cands(A)));

    setQuotes([[A, 70_100]]);
    rerender();
    act(() => {
      vi.advanceTimersByTime(BREAKOUT_PRICE_THROTTLE_MS - 1);
    });
    expect(result.current.prices.get(fk(A))).toBe(70_000);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.prices.get(fk(A))).toBe(70_100);
  });

  it("창 안에서 5번 바뀌면 상태 갱신은 1번이고 마지막 값이 이긴다", () => {
    setQuotes([[A, 70_000]]);
    let renders = 0;
    const { result, rerender } = renderHook(() => {
      renders += 1;
      return useBreakoutQuotes(cands(A));
    });
    const mounted = renders;
    const step = BREAKOUT_PRICE_THROTTLE_MS / 5;

    for (let k = 1; k <= 5; k += 1) {
      setQuotes([[A, 70_000 + k * 10]]);
      rerender();
      if (k < 5) {
        act(() => {
          vi.advanceTimersByTime(step);
        });
        expect(result.current.prices.get(fk(A))).toBe(70_000);
      }
    }
    act(() => {
      vi.advanceTimersByTime(step);
    });

    expect(result.current.prices.get(fk(A))).toBe(70_050);
    // rerender 5회 + 스로틀 적용 1회. 창 안의 변경마다 상태를 바꾸지 않는다.
    expect(renders).toBe(mounted + 5 + 1);
  });

  it("틱이 끊임없이 와도 갱신이 굶지 않는다 — 마감은 첫 변경 기준 절대 시각이다", () => {
    setQuotes([[A, 70_000]]);
    const { result, rerender } = renderHook(() => useBreakoutQuotes(cands(A)));
    const step = BREAKOUT_PRICE_THROTTLE_MS / 5;

    for (let k = 1; k <= 10; k += 1) {
      setQuotes([[A, 70_000 + k]]);
      rerender();
      act(() => {
        vi.advanceTimersByTime(step);
      });
      if (k === 5) expect(result.current.prices.get(fk(A))).toBe(70_005);
    }
    expect(result.current.prices.get(fk(A))).toBe(70_010);
  });

  it("값이 같은 rerender 에서는 prices 신원이 유지된다", () => {
    setQuotes([[A, 70_000]]);
    const { result, rerender } = renderHook(() => useBreakoutQuotes(cands(A)));
    const first = result.current.prices;

    setQuotes([[A, 70_000]]); // 새 맵 · 같은 값
    rerender();
    act(() => {
      vi.advanceTimersByTime(BREAKOUT_PRICE_THROTTLE_MS);
    });
    expect(result.current.prices).toBe(first);
  });

  it("언마운트 뒤 타이머가 남지 않는다", () => {
    setQuotes([[A, 70_000]]);
    const { rerender, unmount } = renderHook(() => useBreakoutQuotes(cands(A)));
    setQuotes([[A, 70_100]]);
    rerender();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
