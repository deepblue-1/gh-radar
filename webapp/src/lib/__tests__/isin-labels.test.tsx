import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import type { RelayAccountState, RelayLimitChaser } from "@gh-radar/shared";

/**
 * Phase 16 Plan 42 Task 1 — 이름의 원천에 상따 전략을 더한다 (갭 4).
 *
 * 잠그는 명제는 셋이다:
 *  ① 보유도 미체결도 없는 종목에 건 전략이 **이름을 갖는다** — `KR7005930003` 원문이 아니다
 *  ② relay 가 이름을 못 준 전략은 라벨이 **비어 있다** — ISIN 을 이름 자리에 넣지 않는다(T-16-05)
 *  ③ 잔고가 아는 이름을 이름 없는 전략이 **지우지 않는다** — `put` 의 병합 규칙 회귀
 *
 * 원천은 여전히 relay wss 하나다(T-16-02) — 이 훅은 `useRelayContext()` 밖을 보지 않는다.
 */

// ---------------------------------------------------------------------------
// 훅 스텁 — 상태를 테스트가 직접 주입한다 (strategy-status-card.test.tsx 하네스)
// ---------------------------------------------------------------------------

type RelayShape = ReturnType<typeof import("@/lib/relay-provider").useRelayContext>;

let mockRelay: RelayShape;

vi.mock("@/lib/relay-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/relay-provider")>();
  return { ...actual, useRelayContext: () => mockRelay };
});

import { EMPTY_RELAY_VALUE } from "@/lib/relay-provider";

import { useIsinLabels } from "../isin-labels";

// ---------------------------------------------------------------------------
// 픽스처
// ---------------------------------------------------------------------------

/** 전략만 걸린 종목 — 잔고·미체결 어디에도 없다. 갭 4 가 보고된 정확한 상황이다. */
const ISIN_STRATEGY_ONLY = "KR7005930003";
/** 잔고가 아는 종목 — ③ 이 쓰는 대조군. */
const ISIN_HELD = "KR7086520004";

function makeChaser(over: Partial<RelayLimitChaser> = {}): RelayLimitChaser {
  const isin = over.isin ?? ISIN_STRATEGY_ONLY;
  const accountNo = over.accountNo ?? "37728502101";
  const exchange = over.exchange ?? "KRX";
  return {
    isin,
    accountNo,
    market: "K",
    crud: "C",
    buyOrderPrice: 130_000,
    buyOrderQty: 76,
    buyWatchPrice: 129_000,
    buyWatchQty: 1_000,
    buyMinTradeQty: 0,
    buyWatchSide: "0",
    buyTradeQtyEnabled: false,
    buyEnabled: true,
    sellOrderPrice: 131_000,
    sellOrderQty: 0,
    sellWatchPrice: 131_500,
    sellWatchQty: 500,
    sellMinTradeQty: 0,
    sellEnabled: false,
    sellTradeQtyEnabled: false,
    sweepWatchPrice: 0,
    sweepEnabled: false,
    sweepMinTickCount: 0,
    sweepRecalcEnabled: true,
    sweepMinCount: 0,
    sweepMinRate: 0,
    exchange,
    sellOrderRatio: 100,
    sellQtyTrackEnabled: false,
    sellQtyTrackRatio: 50,
    sellQtyTrackBaseline: 0,
    buyOrderAmount: 1_000,
    sellEntryLatched: false,
    cancelQtyEnabled: false,
    cancelWatchQty: 0,
    cancelTradeEnabled: false,
    cancelQtyTrackEnabled: false,
    cancelQtyTrackBaseline: 0,
    key: `${isin}:${accountNo}:${exchange}`,
    ...over,
  };
}

/** 잔고에 `ISIN_HELD` 하나만 있는 계좌 상태. */
function heldAccountStates(): ReadonlyMap<string, RelayAccountState> {
  const state: RelayAccountState = {
    t: "acct",
    a: "37728502101",
    snap: true,
    hold: [
      {
        isin: ISIN_HELD,
        qty: 76,
        sellableQty: 76,
        avgPrice: 130_000,
        name: "에코프로머티리얼즈",
        code: "086520",
      },
    ],
    unf: [],
    rm: [],
    st: "20260909134402",
  };
  return new Map([[state.a, state]]);
}

function relayState(over: Partial<RelayShape> = {}): RelayShape {
  return { ...EMPTY_RELAY_VALUE, ...over };
}

beforeEach(() => {
  mockRelay = relayState();
});

// ---------------------------------------------------------------------------

describe("useIsinLabels — 상따 전략도 이름의 원천이다 (갭 4)", () => {
  it("① 보유도 미체결도 없는 종목의 전략이 종목명·단축코드를 갖는다", () => {
    mockRelay = relayState({
      // 계좌 상태는 **비어 있다** — 갭 4 의 전제다.
      limitChasers: [makeChaser({ name: "삼성전자", code: "005930" })],
    });

    const { result } = renderHook(() => useIsinLabels());

    expect(result.current.get(ISIN_STRATEGY_ONLY)?.name).toBe("삼성전자");
    expect(result.current.get(ISIN_STRATEGY_ONLY)?.code).toBe("005930");
  });

  it("② relay 가 이름을 못 준 전략은 라벨이 비어 있다 — ISIN 을 이름 자리에 넣지 않는다", () => {
    mockRelay = relayState({
      // `name`·`code` 없이 온 전략 = relay 의 SymbolMap 이 못 푼 종목 (16-41 ⑭ 의 클라 측 대칭).
      limitChasers: [makeChaser()],
    });

    const { result } = renderHook(() => useIsinLabels());

    expect(result.current.get(ISIN_STRATEGY_ONLY)?.name).toBeUndefined();
    // 「이름이 없다」와 「이름이 ISIN 이다」는 다른 사실이다. 후자를 만들면 소비자가 둘을 구분 못 한다.
    expect(result.current.get(ISIN_STRATEGY_ONLY)?.name).not.toBe(ISIN_STRATEGY_ONLY);
    expect(result.current.get(ISIN_STRATEGY_ONLY)?.code).toBeUndefined();
  });

  it("③ 잔고가 아는 이름을 이름 없는 전략이 지우지 않는다 (put 병합 규칙 회귀)", () => {
    mockRelay = relayState({
      accountStates: heldAccountStates(),
      // 같은 ISIN 인데 relay 가 이름을 못 붙인 전략 — 나중 원천이 빈 값으로 덮으면 안 된다.
      limitChasers: [makeChaser({ isin: ISIN_HELD })],
    });

    const { result } = renderHook(() => useIsinLabels());

    expect(result.current.get(ISIN_HELD)?.name).toBe("에코프로머티리얼즈");
    expect(result.current.get(ISIN_HELD)?.code).toBe("086520");
  });

  it("④ 전략이 늘면 라벨도 늘어난다 — useMemo 의존성 누락 잠금", () => {
    // 계좌 상태는 **같은 참조**로 고정한다. `limitChasers` 가 의존성 배열에서 빠지면
    // 다른 원천의 변경이 memo 를 재계산시켜 버려서 누락이 가려진다.
    const frozenAccountStates = heldAccountStates();
    mockRelay = relayState({ accountStates: frozenAccountStates, limitChasers: [] });

    const { result, rerender } = renderHook(() => useIsinLabels());
    expect(result.current.get(ISIN_STRATEGY_ONLY)).toBeUndefined();

    mockRelay = relayState({
      accountStates: frozenAccountStates,
      limitChasers: [makeChaser({ name: "삼성전자", code: "005930" })],
    });
    rerender();

    expect(result.current.get(ISIN_STRATEGY_ONLY)?.name).toBe("삼성전자");
  });
});
