import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import type { RelayOrderMsg, RelayRateCrossItem, RelayViNoticeMsg } from "@gh-radar/shared";

vi.mock("@/lib/alert-tone", () => ({ playBreakoutTone: vi.fn(() => true) }));
vi.mock("@/lib/push/push-devices-api", () => ({ fetchPushDevices: vi.fn(), fetchPushAccountMutes: vi.fn() }));

import { playBreakoutTone } from "@/lib/alert-tone";
import { ALERT_HOLD_MS, type OrderIndexEntry, type TradingAlert } from "../trading-alerts";
import { useTradingAlerts } from "../use-trading-alerts";
import { PUSH_DEVICE_KEY_STORAGE } from "@/lib/push/device-key";
import { fetchPushAccountMutes, fetchPushDevices } from "@/lib/push/push-devices-api";
import { accountBannerExpected, orderToastSuppressed, useOrderToastSuppression } from "@/lib/push/toast-suppression";
import { __resetPushAccountMutesForTest, updatePushAccountMutesLocal } from "@/lib/push/use-push-account-mutes";
import { __resetPushDevicesForTest, updatePushDevicesLocal } from "@/lib/push/use-push-devices";

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
  orderIndex: ReadonlyMap<string, OrderIndexEntry>;
  onNew?: (a: TradingAlert) => void;
  suppressOrderToasts?: (a: TradingAlert) => boolean;
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
  return { orders: [], viNotices: [], orderIndex: EMPTY_INDEX, ...over };
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
  it("마운트 시 이미 있는 orders/viNotices 는 알림 0", () => {
    const hook = setup(base({ orders: [order()], viNotices: [viNotice()], orderIndex: INDEXED }));
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

describe("useTradingAlerts — 돌파는 스트립 새 행 신호로만 (quick-260926-s5v)", () => {
  it("H1 notifyBreakouts([item]) → breakout 1건 · onNew 1회 · 톤 없음(돌파 톤은 스트립 몫)", () => {
    const onNew = vi.fn();
    const hook = setup(base({ onNew }));
    act(() => hook.result.current.notifyBreakouts([rc("KR7096530001")]));
    expect(hook.result.current.alerts).toHaveLength(1);
    expect(hook.result.current.alerts[0]).toMatchObject({ kind: "breakout", isin: "KR7096530001" });
    expect(onNew).toHaveBeenCalledTimes(1);
    expect(playBreakoutTone).not.toHaveBeenCalled();
  });

  it("H2 여러 행은 입력 순서대로 emit 된다", () => {
    const hook = setup(base());
    act(() => hook.result.current.notifyBreakouts([rc("KR7005930003"), rc("KR7000660001")]));
    expect(hook.result.current.alerts.map((a) => a.isin)).toEqual(["KR7005930003", "KR7000660001"]);
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

const ALWAYS = () => true;
const NEVER = () => false;

describe("useTradingAlerts — D-20 주문 토스트 숨김 (Phase 40)", () => {
  it("숨김 중 주문 통보 · VI 는 alerts 0 · 톤 0 · onNew 는 그대로(카드 표시)", () => {
    const onNew = vi.fn();
    const v0 = viNotice({ orderSeq: 0 });
    const hook = setup(base({ orderIndex: INDEXED, onNew, suppressOrderToasts: ALWAYS, viNotices: [v0] }));
    const f1 = order();
    const v1 = viNotice();
    hook.rerender(base({ orders: [f1], viNotices: [v1, v0], orderIndex: INDEXED, onNew, suppressOrderToasts: ALWAYS }));
    expect(hook.result.current.alerts).toEqual([]);
    expect(playBreakoutTone).not.toHaveBeenCalled();
    expect(onNew.mock.calls.map((c) => (c[0] as TradingAlert).kind)).toEqual(["fill", "vi"]);
  });

  it("숨김 중 accept · modify · cancel · reject 도 alerts 0 · onNew 는 불린다", () => {
    const onNew = vi.fn();
    const hook = setup(base({ orderIndex: INDEXED, onNew, suppressOrderToasts: ALWAYS }));
    const frames = [order({ nt: "A" }), order({ nt: "M" }), order({ nt: "C" }), order({ nt: "R", rc: 1 })];
    hook.rerender(base({ orders: [...frames].reverse(), orderIndex: INDEXED, onNew, suppressOrderToasts: ALWAYS }));
    expect(hook.result.current.alerts).toEqual([]);
    expect(onNew.mock.calls.map((c) => (c[0] as TradingAlert).kind)).toEqual(["accept", "modify", "cancel", "reject"]);
  });

  it("숨김 중에도 돌파(notifyBreakouts)는 alerts 에 들어간다", () => {
    const onNew = vi.fn();
    const hook = setup(base({ onNew, suppressOrderToasts: ALWAYS }));
    act(() => hook.result.current.notifyBreakouts([rc("KR7096530001")]));
    expect(hook.result.current.alerts).toHaveLength(1);
    expect(hook.result.current.alerts[0]).toMatchObject({ kind: "breakout" });
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it("숨김 중 들어온 통보는 숨김이 풀려도 되살아나지 않는다 · 뒤 조각은 새 토스트(병합 아님)", () => {
    const hook = setup(base({ orderIndex: INDEXED, suppressOrderToasts: ALWAYS }));
    const f1 = order({ q: 100 });
    hook.rerender(base({ orders: [f1], orderIndex: INDEXED, suppressOrderToasts: ALWAYS }));
    expect(hook.result.current.alerts).toEqual([]);

    hook.rerender(base({ orders: [f1], orderIndex: INDEXED, suppressOrderToasts: NEVER }));
    expect(hook.result.current.alerts).toEqual([]);

    const f2 = order({ q: 100 });
    hook.rerender(base({ orders: [f2, f1], orderIndex: INDEXED, suppressOrderToasts: NEVER }));
    expect(hook.result.current.alerts).toHaveLength(1);
    expect(hook.result.current.alerts[0]).toMatchObject({ kind: "fill", count: 1, filledQty: 100 });
    expect(playBreakoutTone).toHaveBeenCalledTimes(1);
  });

  it("WR-06 판정은 알림마다 — 판정이 그 알림 계좌로 거짓이면(끈 계좌) 토스트 · 톤이 그대로 나온다", () => {
    const seen: (string | undefined)[] = [];
    const notMuted = (a: TradingAlert) => {
      seen.push(a.accountNo);
      return a.accountNo !== ACCOUNT;
    };
    const hook = setup(base({ orderIndex: INDEXED, suppressOrderToasts: notMuted }));
    hook.rerender(base({ orders: [order()], orderIndex: INDEXED, suppressOrderToasts: notMuted }));
    expect(seen).toEqual([ACCOUNT]);
    expect(hook.result.current.alerts).toHaveLength(1);
    expect(playBreakoutTone).toHaveBeenCalledTimes(1);
  });

  it("false(기본)면 종전과 같다 — 통보 알림 1 · 톤 1", () => {
    const hook = setup(base({ orderIndex: INDEXED, suppressOrderToasts: NEVER }));
    hook.rerender(base({ orders: [order()], orderIndex: INDEXED, suppressOrderToasts: NEVER }));
    expect(hook.result.current.alerts).toHaveLength(1);
    expect(playBreakoutTone).toHaveBeenCalledTimes(1);
  });
});

describe("orderToastSuppressed — 진리표 (D-20)", () => {
  const ALL = { native: true, pluginAvailable: true, permission: "granted" as const, thisDeviceEnabled: true };

  it("넷 다 참(permission granted)일 때만 true", () => {
    expect(orderToastSuppressed(ALL)).toBe(true);
  });

  it.each([
    ["브라우저", { native: false }],
    ["옛 앱(플러그인 없음)", { pluginAvailable: false }],
    ["이 기기 꺼짐", { thisDeviceEnabled: false }],
    ["권한 denied", { permission: "denied" as const }],
    ["권한 prompt", { permission: "prompt" as const }],
    ["권한 unavailable", { permission: "unavailable" as const }],
    ["권한 아직 모름", { permission: null }],
  ])("%s → false", (_name, over) => {
    expect(orderToastSuppressed({ ...ALL, ...over })).toBe(false);
  });
});

describe("accountBannerExpected — 알림 계좌 배너 (WR-06)", () => {
  const LOADED = { muted: ["99999999999"], loadedAt: 1, error: false };

  it("목록을 읽었고 끈 계좌가 아니면 true", () => {
    expect(accountBannerExpected(ACCOUNT, LOADED)).toBe(true);
  });

  it.each([
    ["끈 계좌", "99999999999", LOADED],
    ["계좌 모름(색인 미스)", undefined, LOADED],
    ["끈 계좌 목록을 아직 못 읽음", ACCOUNT, { muted: [], loadedAt: null, error: false }],
    ["읽기 실패(한 번도 못 읽음)", ACCOUNT, { muted: [], loadedAt: null, error: true }],
  ])("%s → false", (_name, accountNo, mutes) => {
    expect(accountBannerExpected(accountNo, mutes)).toBe(false);
  });
});

describe("useOrderToastSuppression (D-20)", () => {
  const KEY = "aaaaaaaa-1111-4222-8333-444455556666";
  const ROW = {
    deviceKey: KEY,
    platform: "ios" as const,
    label: "iPhone · iOS 18.1",
    enabled: true,
    lastSeenAt: "2026-11-06T00:00:00.000Z",
    createdAt: "2026-11-01T00:00:00.000Z",
  };

  function installApp(permission: string) {
    const cap = {
      isPluginAvailable: vi.fn(() => true),
      nativePromise: vi.fn(async (_plugin: string, method: string) => {
        if (method === "checkPermissions") return { receive: permission };
        throw new Error(`unexpected ${method}`);
      }),
      addListener: vi.fn(() => ({ remove: vi.fn() })),
    };
    (window as unknown as { Capacitor?: unknown }).Capacitor = cap;
    document.documentElement.classList.add("native-app");
    document.documentElement.setAttribute("data-native-platform", "ios");
    return cap;
  }

  const alertOf = (accountNo?: string) => ({ accountNo });

  beforeEach(() => {
    vi.useRealTimers();
    __resetPushDevicesForTest();
    __resetPushAccountMutesForTest();
    vi.mocked(fetchPushDevices).mockReset();
    vi.mocked(fetchPushAccountMutes).mockReset().mockResolvedValue([]);
    window.localStorage.setItem(PUSH_DEVICE_KEY_STORAGE, KEY);
  });

  afterEach(() => {
    delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    document.documentElement.classList.remove("native-app");
    document.documentElement.removeAttribute("data-native-platform");
    window.localStorage.clear();
    __resetPushDevicesForTest();
    __resetPushAccountMutesForTest();
  });

  it("브라우저는 늘 false · 기기 목록 · 끈 계좌를 읽지 않는다", async () => {
    const { result } = renderHook(() => useOrderToastSuppression());
    await act(async () => {});
    expect(result.current(alertOf(ACCOUNT))).toBe(false);
    expect(fetchPushDevices).not.toHaveBeenCalled();
    expect(fetchPushAccountMutes).not.toHaveBeenCalled();
  });

  it("앱 · 플러그인 · 권한 granted · 이 기기 행 enabled · 끈 계좌 아님 → true · 카드에서 끄면(저장소 변경) false", async () => {
    installApp("granted");
    vi.mocked(fetchPushDevices).mockResolvedValue([ROW]);
    const { result } = renderHook(() => useOrderToastSuppression());
    await waitFor(() => expect(result.current(alertOf(ACCOUNT))).toBe(true));
    expect(fetchPushAccountMutes).toHaveBeenCalledTimes(1);

    act(() => updatePushDevicesLocal((list) => list.map((d) => ({ ...d, enabled: false }))));
    expect(result.current(alertOf(ACCOUNT))).toBe(false);
  });

  it("WR-06 끈 계좌의 알림은 숨기지 않는다 — 다른 계좌는 숨김 · 패널에서 끄면 즉시 · 계좌 모르는 알림은 보인다", async () => {
    installApp("granted");
    vi.mocked(fetchPushDevices).mockResolvedValue([ROW]);
    vi.mocked(fetchPushAccountMutes).mockResolvedValue(["99999999999"]);
    const { result } = renderHook(() => useOrderToastSuppression());
    await waitFor(() => expect(result.current(alertOf(ACCOUNT))).toBe(true));
    expect(result.current(alertOf("99999999999"))).toBe(false);
    expect(result.current(alertOf(undefined))).toBe(false);

    act(() => updatePushAccountMutesLocal((muted) => [...muted, ACCOUNT]));
    expect(result.current(alertOf(ACCOUNT))).toBe(false);
  });

  it("WR-06 끈 계좌 목록을 못 읽으면(모르면) 숨기지 않는다", async () => {
    installApp("granted");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(fetchPushDevices).mockResolvedValue([ROW]);
    vi.mocked(fetchPushAccountMutes).mockRejectedValue(new Error("HTTP 500"));
    const { result } = renderHook(() => useOrderToastSuppression());
    await waitFor(() => expect(fetchPushAccountMutes).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current(alertOf(ACCOUNT))).toBe(false);
  });

  it("권한 denied 면 행이 켜져 있어도 false", async () => {
    installApp("denied");
    vi.mocked(fetchPushDevices).mockResolvedValue([ROW]);
    const { result } = renderHook(() => useOrderToastSuppression());
    await waitFor(() => expect(fetchPushDevices).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current(alertOf(ACCOUNT))).toBe(false);
  });

  it("다른 기기 행만 켜져 있으면 false", async () => {
    installApp("granted");
    vi.mocked(fetchPushDevices).mockResolvedValue([{ ...ROW, deviceKey: "bbbbbbbb-1111-4222-8333-444455556666" }]);
    const { result } = renderHook(() => useOrderToastSuppression());
    await waitFor(() => expect(fetchPushDevices).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current(alertOf(ACCOUNT))).toBe(false);
  });
});
