import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import type { RelayOrderMsg, RelayRateCrossItem, RelayViNoticeMsg } from "@gh-radar/shared";

vi.mock("@/lib/alert-tone", () => ({ playBreakoutTone: vi.fn(() => true) }));

import { playBreakoutTone } from "@/lib/alert-tone";
import { ALERT_HOLD_MS, type OrderIndexEntry, type TradingAlert } from "../trading-alerts";
import { useTradingAlerts } from "../use-trading-alerts";

/**
 * quick-260923-pgu Task 1 — `useTradingAlerts`: 새 프레임만 · 이력 재생 없음 · 색인 조인 보류 · 소리.
 *
 * 원천은 relay 컨텍스트 배열의 **객체 정체성**(WeakSet)이다 — 리듀서가 새 프레임을 앞에 붙인 새
 * 배열을 만들 뿐 기존 객체는 그대로이므로, 마운트 시점에 있던 객체는 「본 것」으로 기록된다.
 * 주문번호 색인은 relay 리듀서가 소유하는 add-only `orderIndex` 다(원시 `acct` 프레임에서 채운다).
 */

const ACCOUNT = "37728502101";

interface Input {
  orders: RelayOrderMsg[];
  viNotices: RelayViNoticeMsg[];
  rateCrossItems: RelayRateCrossItem[];
  rateCrossSnapSeq: number;
  orderIndex: ReadonlyMap<string, OrderIndexEntry>;
  onNew?: (a: TradingAlert) => void;
}

function order(over: Partial<RelayOrderMsg> = {}): RelayOrderMsg {
  return { t: "order", no: "123", nt: "E", rc: 0, msg: "", org: "", p: 12_100, q: 100, x: "KRX", ...over };
}

function viNotice(over: Partial<RelayViNoticeMsg> = {}): RelayViNoticeMsg {
  return {
    t: "vi.notice",
    isin: "KR7196170005",
    exchange: "KRX",
    accountNo: ACCOUNT,
    triggerPrice: 453_200,
    basePrice: 412_000,
    changeRate: 10,
    orderPrice: 535_500,
    orderQty: 3,
    market: "Q",
    orderSeq: 1,
    viEndTime: "094412000",
    name: "알테오젠",
    ...over,
  } as RelayViNoticeMsg;
}

function rc(isin: string): RelayRateCrossItem {
  return {
    isin,
    exchange: "KRX",
    lastPrice: 12_100,
    changeRate: 20.13,
    thresholdPct: 20,
    basePrice: 10_000,
    exchangeTime: "094131000000",
    serverTime: "09:41:31",
    name: "씨젠",
  };
}

const ENTRY: OrderIndexEntry = {
  isin: "KR7096530001",
  exchange: "KRX",
  side: "B",
  name: "씨젠",
  code: "096530",
  orderQty: 500,
  accountNo: ACCOUNT,
};

const EMPTY_INDEX: ReadonlyMap<string, OrderIndexEntry> = new Map();
const INDEXED: ReadonlyMap<string, OrderIndexEntry> = new Map([["123", ENTRY]]);

function base(over: Partial<Input> = {}): Input {
  return { orders: [], viNotices: [], rateCrossItems: [], rateCrossSnapSeq: 0, orderIndex: EMPTY_INDEX, ...over };
}

function setup(initial: Input) {
  return renderHook((props: Input) => useTradingAlerts(props), { initialProps: initial });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.mocked(playBreakoutTone).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useTradingAlerts — 새 프레임만", () => {
  it("마운트 시 이미 있는 orders/viNotices/rateCrossItems 는 알림 0", () => {
    const hook = setup(
      base({ orders: [order()], viNotices: [viNotice()], rateCrossItems: [rc("KR7096530001")], orderIndex: INDEXED }),
    );
    expect(hook.result.current.alerts).toEqual([]);
    expect(playBreakoutTone).not.toHaveBeenCalled();
  });

  it("새 order 프레임 prepend → 알림 1 (색인 조인) · 같은 배열 재전달은 중복 0", () => {
    const old = order({ no: "1", nt: "A" });
    const hook = setup(base({ orders: [old], orderIndex: INDEXED }));
    const next = [order(), old];
    hook.rerender(base({ orders: next, orderIndex: INDEXED }));
    expect(hook.result.current.alerts).toHaveLength(1);
    expect(hook.result.current.alerts[0]).toMatchObject({ kind: "fill", name: "씨젠", isin: "KR7096530001" });
    hook.rerender(base({ orders: next, orderIndex: INDEXED }));
    hook.rerender(base({ orders: [...next], orderIndex: INDEXED }));
    expect(hook.result.current.alerts).toHaveLength(1);
  });

  it("한 렌더에 새 프레임 둘 — 도착 순(뒤 → 앞)으로 처리한다", () => {
    const hook = setup(base({ orderIndex: INDEXED }));
    const first = order({ nt: "A" });
    const second = order({ nt: "E" });
    hook.rerender(base({ orders: [second, first], orderIndex: INDEXED }));
    expect(hook.result.current.alerts.map((a) => a.kind)).toEqual(["accept", "fill"]);
  });
});

describe("useTradingAlerts — 색인 미스 보류 (ALERT_HOLD_MS)", () => {
  it("색인 미스 → 즉시 알림 없음 · 1.4초 뒤 색인에 그 주문이 오면 이름 조인된 알림 1번", () => {
    const msg = order();
    const hook = setup(base());
    hook.rerender(base({ orders: [msg] }));
    expect(hook.result.current.alerts).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(1_400);
    });
    hook.rerender(base({ orders: [msg], orderIndex: INDEXED }));
    expect(hook.result.current.alerts).toHaveLength(1);
    expect(hook.result.current.alerts[0].name).toBe("씨젠");
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(hook.result.current.alerts).toHaveLength(1);
  });

  it("아무것도 안 오면 1.5초에 「주문 {no}」 알림", () => {
    const msg = order({ no: "777" });
    const hook = setup(base());
    hook.rerender(base({ orders: [msg] }));
    act(() => {
      vi.advanceTimersByTime(ALERT_HOLD_MS - 1);
    });
    expect(hook.result.current.alerts).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(hook.result.current.alerts).toHaveLength(1);
    expect(hook.result.current.alerts[0].name).toBe("주문 777");
  });

  it("알 수 없는 nt 는 보류도 알림도 없다", () => {
    const hook = setup(base());
    hook.rerender(base({ orders: [order({ nt: "" })] }));
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(hook.result.current.alerts).toHaveLength(0);
  });

  it("언마운트 시 보류 타이머를 전부 치운다", () => {
    const hook = setup(base());
    hook.rerender(base({ orders: [order()] }));
    hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("useTradingAlerts — 돌파 76/78", () => {
  it("rateCrossSnapSeq 가 바뀐 렌더의 새 종목은 알림 0 · 같은 seq 에서 새 키는 breakout 1", () => {
    const a = rc("KR7096530001");
    const hook = setup(base({ rateCrossItems: [a], rateCrossSnapSeq: 1 }));
    hook.rerender(base({ rateCrossItems: [rc("KR7000660001"), a], rateCrossSnapSeq: 2 }));
    expect(hook.result.current.alerts).toHaveLength(0);
    hook.rerender(base({ rateCrossItems: [rc("KR7005930003"), rc("KR7000660001"), a], rateCrossSnapSeq: 2 }));
    expect(hook.result.current.alerts).toHaveLength(1);
    expect(hook.result.current.alerts[0]).toMatchObject({ kind: "breakout", isin: "KR7005930003" });
  });
});

describe("useTradingAlerts — 소리 · onNew · dismiss", () => {
  it("fill·vi 는 톤 1회 (묶음 병합 시 추가 호출 없음) · accept 는 0", () => {
    const hook = setup(base({ orderIndex: INDEXED }));
    const f1 = order({ q: 100 });
    hook.rerender(base({ orders: [f1], orderIndex: INDEXED }));
    expect(playBreakoutTone).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    const f2 = order({ q: 100 });
    hook.rerender(base({ orders: [f2, f1], orderIndex: INDEXED }));
    expect(hook.result.current.alerts).toHaveLength(1);
    expect(hook.result.current.alerts[0]).toMatchObject({ count: 2, filledQty: 200 });
    expect(playBreakoutTone).toHaveBeenCalledTimes(1);

    const acc = order({ nt: "A", no: "124" });
    hook.rerender(base({ orders: [acc, f2, f1], orderIndex: new Map([...INDEXED, ["124", ENTRY]]) }));
    expect(playBreakoutTone).toHaveBeenCalledTimes(1);

    const v = viNotice();
    hook.rerender(base({ orders: [acc, f2, f1], viNotices: [v], orderIndex: new Map([...INDEXED, ["124", ENTRY]]) }));
    expect(playBreakoutTone).toHaveBeenCalledTimes(2);
    expect(hook.result.current.alerts.map((a) => a.kind)).toEqual(["fill", "accept", "vi"]);
  });

  it("onNew 는 새 알림에만 불리고 병합엔 안 불린다 · dismiss(id) 로 빠진다", () => {
    const onNew = vi.fn();
    const hook = setup(base({ orderIndex: INDEXED, onNew }));
    const f1 = order();
    hook.rerender(base({ orders: [f1], orderIndex: INDEXED, onNew }));
    const f2 = order();
    hook.rerender(base({ orders: [f2, f1], orderIndex: INDEXED, onNew }));
    expect(onNew).toHaveBeenCalledTimes(1);
    expect(onNew.mock.calls[0][0]).toMatchObject({ kind: "fill", isin: "KR7096530001" });

    const id = hook.result.current.alerts[0].id;
    act(() => hook.result.current.dismiss(id));
    expect(hook.result.current.alerts).toEqual([]);
  });
});
