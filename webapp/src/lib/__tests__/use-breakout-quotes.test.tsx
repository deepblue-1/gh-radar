import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

/**
 * Phase 18 Plan 04 Task 3 — 돌파 종목 다중 시세 구독 훅 (D-16, TRADE-06).
 *
 * 잠그는 명제:
 *  ① `useRelayContext().subscribe/unsubscribe` 참조계수 API 만 쓴다 — 소켓 프레임을 직접 만들지 않는다
 *  ② 구독 diff — 빈 집합 무호출 · 초기 구독 · 같은 집합 재렌더 무호출 · 교체(남는 키 무변경) · 언마운트 전량 해제
 *  ③ 거래소 `"KRX"` 고정
 *  ④ 자율 상한 `MAX_BREAKOUT_SUBS` — 카드 종목은 예산 제외, 남은 예산은 최근 돌파 순, 넘친 키는 반환
 */

type RelayShape = ReturnType<typeof import("@/lib/relay-provider").useRelayContext>;

let mockRelay: RelayShape;

vi.mock("@/lib/relay-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/relay-provider")>();
  return { ...actual, useRelayContext: () => mockRelay };
});

import { EMPTY_RELAY_VALUE } from "@/lib/relay-provider";

import { MAX_BREAKOUT_SUBS, useBreakoutQuotes } from "../use-breakout-quotes";

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

/** addedAt 이 클수록 최근 돌파. */
function cands(...isins: string[]) {
  return isins.map((isin, i) => ({ isin, addedAt: i }));
}

describe("useBreakoutQuotes — 구독 diff", () => {
  it("빈 집합이면 subscribe 가 한 번도 불리지 않는다", () => {
    renderHook(() => useBreakoutQuotes([]));
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("[A, B] 로 마운트하면 KRX 로 각 1회 구독한다", () => {
    renderHook(() => useBreakoutQuotes(cands(A, B)));
    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(subscribe).toHaveBeenCalledWith(A, "KRX");
    expect(subscribe).toHaveBeenCalledWith(B, "KRX");
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
    expect(unsubscribe).toHaveBeenCalledWith(A, "KRX");
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith(C, "KRX");
  });

  it("언마운트하면 남은 키를 전부 해제한다", () => {
    const { unmount } = renderHook(() => useBreakoutQuotes(cands(A, B)));
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(2);
    expect(unsubscribe).toHaveBeenCalledWith(A, "KRX");
    expect(unsubscribe).toHaveBeenCalledWith(B, "KRX");
  });

  it("quotes 는 컨텍스트 맵을 그대로 돌려준다(소비자가 relayQuoteKey 로 고른다)", () => {
    const { result } = renderHook(() => useBreakoutQuotes(cands(A)));
    expect(result.current.quotes).toBe(mockRelay.quotes);
  });
});

describe("useBreakoutQuotes — 자율 상한과 우선순위", () => {
  it("MAX_BREAKOUT_SUBS 는 40 이다", () => {
    expect(MAX_BREAKOUT_SUBS).toBe(40);
  });

  it("상한을 넘으면 카드 종목을 빼고 최근 돌파 순 상위 40개만 구독하고, 넘친 키를 돌려준다", () => {
    // 45종목 — addedAt 0(가장 오래됨) … 44(가장 최근). 최근 2종목은 카드가 있다.
    const all = Array.from({ length: 45 }, (_, i) => ({
      isin: `KR7${String(i).padStart(8, "0")}0`,
      addedAt: i,
    }));
    const cardIsins = new Set([all[44].isin, all[43].isin]);
    const { result } = renderHook(() => useBreakoutQuotes(all, { excludeIsins: cardIsins }));

    expect(subscribe).toHaveBeenCalledTimes(MAX_BREAKOUT_SUBS);
    const subscribed = subscribe.mock.calls.map((c) => c[0] as string);
    // 카드 종목은 카드가 이미 구독을 소유한다 — 예산에서 제외.
    expect(subscribed).not.toContain(all[44].isin);
    expect(subscribed).not.toContain(all[43].isin);
    // 남은 43종목 중 최근 40개(addedAt 3..42)가 구독되고 가장 오래된 3개가 넘친다.
    expect(new Set(subscribed)).toEqual(new Set(all.slice(3, 43).map((c) => c.isin)));
    expect([...result.current.overflow].sort()).toEqual(all.slice(0, 3).map((c) => c.isin).sort());
    expect(result.current.subscribed.size).toBe(MAX_BREAKOUT_SUBS);
    expect(subscribe.mock.calls.every((c) => c[1] === "KRX")).toBe(true);
  });
});

describe("useBreakoutQuotes — 소스 규율", () => {
  const SOURCE = readFileSync(path.resolve(__dirname, "../use-breakout-quotes.ts"), "utf8");

  it("소켓 전송이나 sub 프레임을 직접 만들지 않는다(재구독 경로 단일화)", () => {
    expect(SOURCE).not.toMatch(/\.send\(/);
    expect(SOURCE).not.toMatch(/t:\s*["']sub["']/);
  });
});
