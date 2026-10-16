import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type {
  RelayAccountState,
  RelayLimitChaser,
  RelayStrategiesDisabledMsg,
  RelayViTrigger,
} from "@gh-radar/shared";

/**
 * Phase 16 Plan 15 Task 1 — 전략 현황 카드 계약 (MYPAGE-01 · UI-SPEC C2~C4 · D-09/D-14/D-20).
 *
 * 이 파일이 잠그는 것은 **정보와 조작 경로**이지 픽셀이 아니다:
 *  ① 전략 3건이 종목명·코드·거래소·상태 배지를 보여주고 2줄째에 계좌번호는 없다(Phase 32 D-21 — 계좌는 /me 칩이 말한다)
 *  ② 행 링크가 `encodeURIComponent` 된 전략 키로 나간다
 *  ⑦ 전략 0 빈 상태 문구
 *  ⑨ 단절 중에도 상따 목록이 남아 보인다
 *
 * quick-260928-no0 — 세 스위치가 모두 꺼진 전략은 행·요약에서 빠진다(isActiveStrategy · 사이드바·작업대와
 * 같은 기준). 취소잔량만 켜진 전략은 남는다. 스냅샷 전에는 거른 수가 0 이어도 로딩이다.
 *
 * Phase 32 — 카드는 /me 계좌 칩이 고른 계좌(`accountNo`)만 그린다(D-21 · S5′). 끄기 UI 는 /me 현황에 없다
 * (D-27 — 「이 계좌 끄기」 는 32-06 이 세운다 · 계좌 끄기 케이스도 32-06 이 쓴다).
 */

// ---------------------------------------------------------------------------
// 훅 스텁 — 상태를 테스트가 직접 주입한다
// ---------------------------------------------------------------------------

type RelayShape = ReturnType<typeof import("@/lib/relay-provider").useRelayContext>;

let mockRelay: RelayShape;

vi.mock("next/navigation", () => ({
  usePathname: () => "/me",
}));

vi.mock("@/lib/relay-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/relay-provider")>();
  return { ...actual, useRelayContext: () => mockRelay };
});

import { EMPTY_RELAY_VALUE } from "@/lib/relay-provider";
import { STRATEGIES_DISABLE_ACK_TIMEOUT_MS } from "@/lib/use-relay-socket";

import { StrategyStatusCard, viSummaryText } from "../strategy-status-card";
import { LC_BUY3_ECHO_DEFAULTS } from "@/test-fixtures/limit-chaser";

// ---------------------------------------------------------------------------
// 픽스처
// ---------------------------------------------------------------------------

/**
 * 상따 전략 1건. **긴 종목명이 붙을 수 있는 ISIN** 과 11자리 계좌를 기본으로 둔다 —
 * 짧은 값만 쓰면 잘림·마스킹 회귀가 테스트를 통과해 버린다.
 */
function makeChaser(over: Partial<RelayLimitChaser> = {}): RelayLimitChaser {
  const isin = over.isin ?? "KR7005930003";
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
    cancelEntryLatched: false,
    ...LC_BUY3_ECHO_DEFAULTS,
    key: `${isin}:${accountNo}:${exchange}`,
    ...over,
  };
}

const CHASER_A = makeChaser({
  isin: "KR7086520004",
  accountNo: "37728502101",
  exchange: "KRX",
  buyEnabled: true,
  sellEnabled: false,
});
const CHASER_B = makeChaser({
  isin: "KR7007660006",
  accountNo: "37728502102",
  exchange: "NXT",
  buyEnabled: false,
  sellEnabled: true,
});
const CHASER_C = makeChaser({
  isin: "KR7000660001",
  accountNo: "37728502101",
  exchange: "KRX",
  buyEnabled: true,
  sellEnabled: true,
  sellEntryLatched: true,
});
/** 서버가 게이트만 내린 등록 전략(crud "C" + 세 스위치 OFF). */
const CHASER_OFF = makeChaser({
  isin: "KR7005930003",
  accountNo: "37728502101",
  exchange: "KRX",
  buyEnabled: false,
  sellEnabled: false,
  cancelQtyEnabled: false,
});
/** isActiveStrategy 세 번째 항 — 매수∨매도 판정이면 빠진다. */
const CHASER_CANCEL_ONLY = makeChaser({
  isin: "KR7035720002",
  accountNo: "37728502102",
  exchange: "KRX",
  buyEnabled: false,
  sellEnabled: false,
  cancelQtyEnabled: true,
});

/**
 * 계좌 상태 2벌 — 종목명·단축코드의 **유일한 원천**이다(relay 역매핑 산물).
 * 계좌를 두 개로 두는 이유: 마지막 계좌만 훑으면 다른 계좌의 전략이 ISIN 으로 남는다.
 */
function accountStates(): ReadonlyMap<string, RelayAccountState> {
  const first: RelayAccountState = {
    t: "acct",
    a: "37728502101",
    snap: true,
    hold: [
      {
        isin: "KR7086520004",
        qty: 76,
        sellableQty: 76,
        avgPrice: 130_000,
        name: "에코프로머티리얼즈우선주",
        code: "086520",
      },
    ],
    unf: [],
    rm: [],
    st: "20260908134402",
  };
  const second: RelayAccountState = {
    t: "acct",
    a: "37728502102",
    snap: true,
    hold: [],
    unf: [
      {
        orderNo: "0031102",
        orgOrderNo: "",
        isin: "KR7007660006",
        side: "B",
        price: 48_750,
        orderQty: 205,
        filledQty: 0,
        unfilledQty: 205,
        orderTime: "093015",
        queuedStatus: "",
        pendingStatus: "",
        board: "",
        pendingCancelSent: false,
        exchange: "NXT",
        name: "이수페타시스",
        code: "007660",
      },
    ],
    rm: [],
    st: "20260908134402",
  };
  return new Map([
    [first.a, first],
    [second.a, second],
  ]);
}

function relayState(over: Partial<RelayShape> = {}): RelayShape {
  return { ...EMPTY_RELAY_VALUE, ...over };
}

const VI_RUNNING = {
  accountNo: "37728502101",
  exchange: "KRX" as const,
  orderAmountKrw: 10_000_000,
  checkRate: 22,
  priceType: "U" as const,
  run: true,
};

/** VI (계좌, 거래소) 슬롯 Map — 키 `${accountNo}|${exchange}`(리듀서와 같은 키 · Phase 32 D-17). */
function viSlotsOf(...cfgs: RelayViTrigger[]): RelayShape["viSlots"] {
  return new Map(cfgs.map((c) => [`${c.accountNo}|${c.exchange}`, c] as const));
}

/** 미등록 슬롯(`null`) — 그 슬롯을 조회했고 없다. */
function unregisteredSlots(...keys: [string, "KRX" | "NXT"][]): RelayShape["viSlots"] {
  return new Map(keys.map(([a, x]) => [`${a}|${x}`, null] as const));
}

/** 전략 3건 + VI 가동 + 계좌 2개 — 목업의 「전략 3 · 계좌 2」 시나리오다. */
function populated(over: Partial<RelayShape> = {}): RelayShape {
  return relayState({
    status: "ready",
    accounts: [
      { accountNo: "37728502101", name: "위탁종합" },
      { accountNo: "37728502102", name: "위탁CMA" },
    ],
    limitChasers: [CHASER_A, CHASER_B, CHASER_C],
    viSlots: viSlotsOf(VI_RUNNING),
    accountStates: accountStates(),
    ...over,
  });
}

const rows = () => document.querySelectorAll('[data-slot="strategy-row"]');

beforeEach(() => {
  mockRelay = populated();
});

// 가짜 타이머를 쓴 케이스가 다음 케이스로 새면 무관한 테스트가 멈춘다.
afterEach(() => {
  vi.useRealTimers();
});

// ===========================================================================

describe("StrategyStatusCard — 전략 현황 (UI-SPEC C2~C4)", () => {
  /*
    ★ 260911-w5h — 행이 **2줄**이 됐다: r1(종목명 + 상태 배지 + 화살표) /
      r2(`{코드} · {거래소} · {계좌번호}`). 거래소가 **배지에서 텍스트로** 내려간 것이
      이 변경의 핵심이고, 그래서 r1 의 칩 개수가 **상태 배지 개수와 정확히 같아졌다** —
      행 높이가 배지 개수와 무관하게 일정해진다.
      보여주는 정보는 하나도 줄지 않았다(아래 단언이 셋 다 그대로 남는 이유다).
  */
  it("① 전략 3건이 2줄 문법으로 종목명·코드·거래소·상태 배지를 보여주고 2줄째에 계좌번호가 없다", () => {
    render(<StrategyStatusCard />);

    expect(rows()).toHaveLength(3);

    const first = rows()[0] as HTMLElement;
    const r1 = (row: HTMLElement) =>
      row.querySelector('[data-slot="strategy-row-status"]') as HTMLElement;
    const r2 = (row: HTMLElement) =>
      row.querySelector('[data-slot="strategy-row-meta"]') as HTMLElement;

    // r1 — 종목명(relay 역매핑에서만 온다) + 상태 배지.
    expect(within(r1(first)).getByText("에코프로머티리얼즈우선주")).toBeInTheDocument();
    expect(within(r1(first)).getByText("매수ON")).toBeInTheDocument();
    // r2 — 코드 · 거래소 뿐(Phase 32 D-21 — 계좌는 /me 계좌 칩이 말한다).
    expect(within(r2(first)).getByText("086520")).toBeInTheDocument();
    expect(within(r2(first)).getByText("KRX")).toBeInTheDocument();
    expect(r2(first).textContent).not.toContain("37728502101");
    expect(document.querySelectorAll('[data-slot="strategy-row-account"]')).toHaveLength(0);

    /*
      ★ **거래소가 배지가 아니다.** r1 의 `strategy-badge` 개수가 상태 배지 개수와
        정확히 같다 — 하나라도 많으면 거래소가 다시 칩으로 올라온 것이다.
    */
    expect(r1(first).querySelectorAll('[data-slot="strategy-badge"]')).toHaveLength(1);
    expect(r2(first).querySelectorAll('[data-slot="strategy-badge"]')).toHaveLength(0);

    const second = rows()[1] as HTMLElement;
    expect(within(r1(second)).getByText("이수페타시스")).toBeInTheDocument();
    expect(within(r1(second)).getByText("매도대기")).toBeInTheDocument();
    expect(within(r2(second)).getByText("NXT")).toBeInTheDocument();
    expect(r2(second).textContent).not.toContain("37728502102");

    // 이름을 모르는 전략은 ISIN 으로 폴백하고 **같은 값을 코드 칸에 두 번 쓰지 않는다**.
    const third = rows()[2] as HTMLElement;
    expect(within(third).getAllByText("KR7000660001")).toHaveLength(1);
    expect(within(r1(third)).getByText("매수ON")).toBeInTheDocument();
    expect(within(r1(third)).getByText("매도감시")).toBeInTheDocument();
    // 코드 조각이 없으면 r2 는 거래소 하나다.
    expect(r2(third).textContent).toBe("KRX");
    expect(r1(third).querySelectorAll('[data-slot="strategy-badge"]')).toHaveLength(2);

    /*
      ★ 접근성 라벨은 **그대로**다 — 거래소가 화면에서 배지 → 텍스트로 내려갔어도
        「{종목명} {거래소} 전략 — {배지텍스트}」 계약은 바뀌지 않았다.
    */
    expect(first).toHaveAttribute(
      "aria-label",
      "에코프로머티리얼즈우선주 KRX 전략 — 매수ON",
    );

    // 44px 터치 타깃 유지 — 2줄이 됐다고 행이 더 얕아지지 않는다.
    for (const row of rows()) expect((row as HTMLElement).className).toContain("min-h-11");

    // 카드 헤더 요약.
    expect(screen.getByText("상따 3 · VI 가동")).toBeInTheDocument();
  });

  it("② 행 링크가 인코딩된 전략 키로 나간다 (`:` → `%3A`)", () => {
    render(<StrategyStatusCard />);

    const first = rows()[0] as HTMLAnchorElement;
    expect(first.getAttribute("href")).toBe(
      `/trading?focus=${encodeURIComponent(CHASER_A.key)}`,
    );
    // 인코딩이 실제로 일어났는지 — 원문 `:` 가 남아 있으면 세그먼트가 깨진다.
    expect(first.getAttribute("href")).toContain("%3A");
    expect(first.getAttribute("href")).not.toContain(":");
  });

  it("⑦ 전략 0 이면 빈 상태 문구를 보여준다 (UI-SPEC §빈 상태)", () => {
    mockRelay = relayState({ status: "ready", limitChasers: [], viSlots: unregisteredSlots(["37728502101", "KRX"]) });
    render(<StrategyStatusCard />);

    expect(screen.getByText("켜진 상따 전략이 없어요")).toBeInTheDocument();
    expect(
      screen.getByText("트레이딩 › 상따에서 매수·매도·취소 스위치를 켜면 여기에 표시돼요."),
    ).toBeInTheDocument();
    expect(rows()).toHaveLength(0);
    // VI 행은 전략이 0건이어도 남는다 — 별개의 전략이다.
    expect(screen.getByText("VI 자동매수")).toBeInTheDocument();
    expect(screen.getByText("중지")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("⑦-a 스냅샷 수신 전에는 「없음」이 아니라 로딩이다 (C2 로딩)", () => {
    // `connecting` — 아직 `lc.snap` 을 받은 적이 없다.
    mockRelay = relayState({ status: "connecting", limitChasers: [], viSlots: new Map() });
    const { rerender } = render(<StrategyStatusCard />);

    expect(document.querySelector('[data-slot="strategy-list-loading"]')).toBeInTheDocument();
    expect(screen.getByText("전략 정보를 불러오는 중이에요…")).toBeInTheDocument();
    // ★ 묻지도 않은 상태에서 「없어요」라고 단정하지 않는다.
    expect(screen.queryByText("켜진 상따 전략이 없어요")).not.toBeInTheDocument();

    // `ready` 를 본 뒤의 빈 목록은 **확정된 0건**이다(relay 는 빈 스냅샷도 보낸다).
    mockRelay = relayState({ status: "ready", limitChasers: [], viSlots: unregisteredSlots(["37728502101", "KRX"]) });
    rerender(<StrategyStatusCard />);
    expect(screen.getByText("켜진 상따 전략이 없어요")).toBeInTheDocument();
    expect(document.querySelector('[data-slot="strategy-list-loading"]')).toBeNull();
  });

  it("⑧ VI 행 요약은 가동 중일 때만 조건을 보여주고 `/trading` 작업대로 간다 (C3 · Phase 18 D-02)", () => {
    render(<StrategyStatusCard />);

    const viRow = document.querySelector('[data-slot="vi-status-row"]') as HTMLAnchorElement;
    expect(viRow.getAttribute("href")).toBe("/trading");
    expect(within(viRow).getByText("가동")).toBeInTheDocument();
    expect(within(viRow).getByText("KRX 1,000만원 · 22.0% 이상")).toBeInTheDocument();
  });
});

describe("StrategyStatusCard — 켜진 전략만 나열 (quick-260928-no0 · isActiveStrategy)", () => {
  const rowKeys = () =>
    Array.from(rows()).map((row) => (row as HTMLElement).getAttribute("data-strategy-key"));
  const summaryText = () =>
    document.querySelector('[data-slot="strategy-status-summary"]')?.textContent ?? "";
  /** CHASER_B 의 매도 스위치만 내린 사본 — 같은 키가 서버 게이트로 접힌 모양이다. */
  const CHASER_B_OFF = { ...CHASER_B, sellEnabled: false };

  it("T-a 서버가 게이트를 내린 전략(crud \"C\" + 세 스위치 OFF)은 에코 뒤 행·요약에서 빠진다", () => {
    const { rerender } = render(<StrategyStatusCard />);
    expect(rows()).toHaveLength(3);

    // 60 에코 — 삭제("D")가 아니라 등록 유지("C") + 스위치 OFF 로 온다.
    const folded = {
      ...CHASER_A,
      crud: "C" as const,
      buyEnabled: false,
      sellEnabled: false,
      cancelQtyEnabled: false,
    };
    mockRelay = populated({ limitChasers: [folded, CHASER_B, CHASER_C] });
    rerender(<StrategyStatusCard />);

    expect(rows()).toHaveLength(2);
    expect(rowKeys()).toEqual([CHASER_B.key, CHASER_C.key]);
    expect(summaryText()).toBe("상따 2 · VI 가동");
  });

  it("T-b 섞인 목록 — 행·요약이 모두 켜진 수를 따른다", () => {
    mockRelay = populated({ limitChasers: [CHASER_A, CHASER_OFF, CHASER_B] });
    render(<StrategyStatusCard />);

    expect(rows()).toHaveLength(2);
    expect(rowKeys()).toEqual([CHASER_A.key, CHASER_B.key]);
    expect(summaryText()).toBe("상따 2 · VI 가동");
  });

  it("T-c 취소잔량만 켜진 전략은 켜진 전략이다 (매수∨매도 판정이면 이 케이스가 깨진다)", () => {
    mockRelay = populated({ limitChasers: [CHASER_CANCEL_ONLY] });
    render(<StrategyStatusCard />);

    expect(rows()).toHaveLength(1);
    expect(rowKeys()).toEqual([CHASER_CANCEL_ONLY.key]);
    expect(summaryText()).toBe("상따 1 · VI 가동");
  });

  it("T-d 등록 전략이 전부 꺼지고 VI 중지 → 새 빈 상태", () => {
    mockRelay = relayState({
      status: "ready",
      limitChasers: [CHASER_OFF, CHASER_B_OFF],
      viSlots: unregisteredSlots(["37728502101", "KRX"]),
    });
    render(<StrategyStatusCard />);

    expect(rows()).toHaveLength(0);
    expect(document.querySelector('[data-slot="strategy-row-list"]')).toBeNull();
    expect(document.querySelector('[data-slot="strategy-list-loading"]')).toBeNull();
    expect(screen.getByText("켜진 상따 전략이 없어요")).toBeInTheDocument();
    expect(
      screen.getByText("트레이딩 › 상따에서 매수·매도·취소 스위치를 켜면 여기에 표시돼요."),
    ).toBeInTheDocument();
    expect(summaryText()).toBe("상따 0 · VI 중지");
  });

  it("T-e 등록 전략이 전부 꺼져도 VI 가 가동이면 요약 · VI 행은 가동을 말한다", () => {
    mockRelay = relayState({
      status: "ready",
      limitChasers: [CHASER_OFF, CHASER_B_OFF],
      viSlots: viSlotsOf(VI_RUNNING),
    });
    render(<StrategyStatusCard />);

    expect(rows()).toHaveLength(0);
    expect(summaryText()).toBe("상따 0 · VI 가동");
    const viRow = document.querySelector('[data-slot="vi-status-row"]') as HTMLElement;
    expect(within(viRow).getByText("가동")).toBeInTheDocument();
  });

  it("T-f 스냅샷 수신 전에는 꺼진 전략만 있어도 「없어요」가 아니라 로딩이다", () => {
    mockRelay = relayState({ status: "connecting", limitChasers: [CHASER_OFF], viSlots: new Map() });
    render(<StrategyStatusCard />);

    expect(document.querySelector('[data-slot="strategy-list-loading"]')).toBeInTheDocument();
    expect(screen.getByText("전략 정보를 불러오는 중이에요…")).toBeInTheDocument();
    expect(screen.queryByText("켜진 상따 전략이 없어요")).not.toBeInTheDocument();
    expect(rows()).toHaveLength(0);
  });
});

describe("StrategyStatusCard — 단절 중 목록 유지 (gap 3)", () => {
  it("⑨ 단절 중에도 상따 목록이 남아 보인다 (리듀서는 isStale 만 세운다)", () => {
    mockRelay = populated({ status: "reconnecting", isStale: true });
    render(<StrategyStatusCard />);

    expect(rows()).toHaveLength(3);
  });
});

describe("viSummaryText — 거래소별 요약 · 단위 환산", () => {
  it("원 → 만원 환산은 반올림하지 않고, 어느 거래소인지 함께 말한다", () => {
    expect(viSummaryText({ KRX: VI_RUNNING })).toBe("KRX 1,000만원 · 22.0% 이상");
    expect(
      viSummaryText({ KRX: { ...VI_RUNNING, orderAmountKrw: 15_000, checkRate: 25 } }),
    ).toBe("KRX 1.5만원 · 25.0% 이상");
  });

  it("★ 두 거래소가 함께 가동이면 둘 다 말한다 (한쪽만 말하면 화면이 거짓이 된다)", () => {
    expect(
      viSummaryText({
        KRX: VI_RUNNING,
        NXT: { ...VI_RUNNING, exchange: "NXT", orderAmountKrw: 5_000_000, checkRate: 18 },
      }),
    ).toBe("KRX 1,000만원 · 22.0% 이상 / NXT 500만원 · 18.0% 이상");
  });

  it("★ NXT 만 가동이면 **NXT 값**을 말한다 (KRX 숫자를 빌려 오지 않는다)", () => {
    expect(
      viSummaryText({
        KRX: { ...VI_RUNNING, run: false },
        NXT: { ...VI_RUNNING, exchange: "NXT", orderAmountKrw: 5_000_000, checkRate: 18 },
      }),
    ).toBe("NXT 500만원 · 18.0% 이상");
  });

  it("중지·미등록·미조회는 전부 `—` 다", () => {
    expect(viSummaryText({ KRX: { ...VI_RUNNING, run: false } })).toBe("—");
    expect(viSummaryText({ KRX: null, NXT: null })).toBe("—");
    expect(viSummaryText({})).toBe("—");
  });
});

describe("StrategyStatusCard — 「현황 | 로그」 전환 (D-25a · 스케치 008 ① B)", () => {
  beforeEach(() => {
    mockRelay = { ...EMPTY_RELAY_VALUE, status: "ready", limitChasers: [makeChaser()] } as RelayShape;
  });

  it("머리 오른쪽 알약 세그먼트 · 기본 현황(행 목록 보임) → 로그로 바꾸면 같은 카드 본문이 로그가 되고 다시 현황으로 돌아온다", async () => {
    render(<StrategyStatusCard />);
    const seg = screen.getByRole("tablist", { name: "전략 현황 보기" });
    expect(within(seg).getAllByRole("tab").map((t) => t.textContent)).toEqual(["현황", "로그"]);
    expect(document.querySelector('[data-slot="strategy-row-list"]')).not.toBeNull();

    await userEvent.click(within(seg).getByRole("tab", { name: "로그" }));
    expect(document.querySelector('[data-slot="me-strategy-log"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="strategy-row-list"]')).toBeNull();

    await userEvent.click(within(seg).getByRole("tab", { name: "현황" }));
    expect(document.querySelector('[data-slot="me-strategy-log"]')).toBeNull();
    expect(document.querySelector('[data-slot="strategy-row-list"]')).not.toBeNull();
  });

  it("상따 · VI 요약은 현황 본문 첫 줄로 내려간다(머리 줄은 제목 + 세그먼트)", () => {
    render(<StrategyStatusCard />);
    const summary = document.querySelector('[data-slot="strategy-status-summary"]');
    expect(summary).toHaveTextContent("상따 1 · VI 중지");
    expect(screen.getByRole("heading", { name: /전략 현황/ }).contains(summary)).toBe(false);
  });
});

// ===========================================================================
// Phase 32 — 고른 계좌 (D-21 · S5′) · 끄기 UI 없음 (D-27)
// ===========================================================================

/** 끄기 UI 흔적 — 카드 맨 아래 줄 · 버튼 · 다이얼로그 · 오류 줄. 어느 것도 없어야 한다(D-27). */
function expectNoKillUi(): void {
  const card = document.querySelector('[data-slot="strategy-status-card"]') as HTMLElement;
  expect(card).not.toBeNull();
  expect(within(card).queryAllByRole("button")).toHaveLength(0);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(card.textContent ?? "").not.toContain("비활성화");
  expect(document.querySelectorAll('[data-slot^="strategy-disable"]')).toHaveLength(0);
}

describe("StrategyStatusCard — P32 끄기 UI 없음 (D-27)", () => {
  it("accountNo 없음(계좌 미수신 · 전 계좌) — 카드에 끄기 줄 · 버튼 · 다이얼로그 · 오류 줄이 없다", () => {
    render(<StrategyStatusCard />);
    expect(rows()).toHaveLength(3);
    expectNoKillUi();
  });
});

describe("StrategyStatusCard — P32 고른 계좌 (D-21 · S5′)", () => {
  const ACC_A = "37728502101";
  const ACC_B = "37728502102";
  const ACC_C = "37728502103";
  const rowKeys = () =>
    Array.from(rows()).map((row) => (row as HTMLElement).getAttribute("data-strategy-key"));
  const summaryText = () =>
    document.querySelector('[data-slot="strategy-status-summary"]')?.textContent ?? "";
  const viRow = () => document.querySelector('[data-slot="vi-status-row"]') as HTMLElement | null;
  const accountEmpty = () =>
    document.querySelector('[data-slot="strategy-account-empty"]') as HTMLElement | null;

  it("A(VI 등록 · 가동) — 행 2 · 요약 「상따 2 · VI 가동」 · VI 행 있음", () => {
    render(<StrategyStatusCard accountNo={ACC_A} />);

    expect(rowKeys()).toEqual([CHASER_A.key, CHASER_C.key]);
    expect(summaryText()).toBe("상따 2 · VI 가동");
    expect(viRow()).not.toBeNull();
    expect(within(viRow() as HTMLElement).getByText("가동")).toBeInTheDocument();
    expect(accountEmpty()).toBeNull();
  });

  it("B — 행 1 · VI 슬롯 미등록(VI 는 A 슬롯) → VI 행 「중지」 · 「—」(④ 뒤 늘 선다 · D-18) · 요약 「상따 1 · VI 중지」", () => {
    render(<StrategyStatusCard accountNo={ACC_B} />);

    expect(rowKeys()).toEqual([CHASER_B.key]);
    expect(summaryText()).toBe("상따 1 · VI 중지");
    expect(within(viRow() as HTMLElement).getByText("중지")).toBeInTheDocument();
    expect((viRow() as HTMLElement).querySelector('[data-slot="vi-status-summary"]')).toHaveTextContent(/^—$/);
    expect(accountEmpty()).toBeNull();
  });

  it("C(전략 0 · 등록 VI 슬롯 없음) — 「이 계좌에 등록된 전략 없음」 한 줄 + VI 행 「중지」 · 「켜진 상따 전략이 없어요」 없음 / VI 슬롯이 등록이면 VI 행만", () => {
    const { unmount } = render(<StrategyStatusCard accountNo={ACC_C} />);

    expect(accountEmpty()).toHaveTextContent("이 계좌에 등록된 전략 없음");
    expect(document.querySelectorAll('[data-slot="strategy-account-empty"]')).toHaveLength(1);
    expect(document.querySelector('[data-slot="strategy-row-list"]')).toBeNull();
    expect(screen.queryByText("켜진 상따 전략이 없어요")).toBeNull();
    expect(within(viRow() as HTMLElement).getByText("중지")).toBeInTheDocument();
    expect(summaryText()).toBe("상따 0 · VI 중지");
    unmount();

    // 전략 0 이지만 그 계좌가 VI 등록 계좌면 빈 상태 대신 VI 행만.
    mockRelay = populated({ viSlots: viSlotsOf({ ...VI_RUNNING, accountNo: ACC_C }) });
    render(<StrategyStatusCard accountNo={ACC_C} />);
    expect(accountEmpty()).toBeNull();
    expect(viRow()).not.toBeNull();
    expect(summaryText()).toBe("상따 0 · VI 가동");
  });

  it("VI KRX = A · NXT = B 로 등록 → A 는 KRX 만 · B 는 NXT 만 말한다", () => {
    mockRelay = populated({
      viSlots: viSlotsOf(VI_RUNNING, {
        ...VI_RUNNING,
        accountNo: ACC_B,
        exchange: "NXT",
        orderAmountKrw: 5_000_000,
        checkRate: 18,
      }),
    });
    const { unmount } = render(<StrategyStatusCard accountNo={ACC_A} />);
    expect(
      (viRow() as HTMLElement).querySelector('[data-slot="vi-status-summary"]'),
    ).toHaveTextContent(/^KRX 1,000만원 · 22\.0% 이상$/);
    unmount();

    render(<StrategyStatusCard accountNo={ACC_B} />);
    expect(
      (viRow() as HTMLElement).querySelector('[data-slot="vi-status-summary"]'),
    ).toHaveTextContent(/^NXT 500만원 · 18\.0% 이상$/);
    expect(summaryText()).toBe("상따 1 · VI 가동");
  });

  it("(D-27) accountNo 있음 — 끄기 컨트롤은 「이 계좌 끄기」 하나뿐(모든 계좌를 끄는 버튼 · 링크 · 다이얼로그 없음)", () => {
    for (const no of [ACC_A, ACC_B, ACC_C]) {
      const { unmount } = render(<StrategyStatusCard accountNo={no} />);
      const card = document.querySelector('[data-slot="strategy-status-card"]') as HTMLElement;
      const buttons = within(card).queryAllByRole("button");
      expect(buttons).toHaveLength(1);
      expect(buttons[0]).toHaveAccessibleName(`이 계좌 끄기 — ${no}`);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(card.textContent ?? "").not.toContain("전체 비활성화");
      expect(card.textContent ?? "").not.toContain("모든 계좌");
      expect(document.querySelectorAll('[data-slot="strategy-disable-all"]')).toHaveLength(0);
      unmount();
    }
  });

  it("전략 행 2줄째에 계좌번호가 없다 — strategy-row-account 0", () => {
    render(<StrategyStatusCard accountNo={ACC_A} />);

    expect(document.querySelectorAll('[data-slot="strategy-row-account"]')).toHaveLength(0);
    for (const row of rows()) {
      const meta = (row as HTMLElement).querySelector('[data-slot="strategy-row-meta"]');
      expect(meta?.textContent ?? "").not.toContain(ACC_A);
    }
  });

  it("accountNo 없음 → 종전과 같다(전 계좌 · 「켜진 상따 전략이 없어요」 · 로딩 스켈레톤)", () => {
    const { unmount } = render(<StrategyStatusCard />);
    expect(rows()).toHaveLength(3);
    expect(summaryText()).toBe("상따 3 · VI 가동");
    unmount();

    mockRelay = relayState({ status: "ready", limitChasers: [], viSlots: unregisteredSlots(["37728502101", "KRX"]) });
    const empty = render(<StrategyStatusCard />);
    expect(screen.getByText("켜진 상따 전략이 없어요")).toBeInTheDocument();
    expect(accountEmpty()).toBeNull();
    expect(viRow()).not.toBeNull();
    empty.unmount();

    mockRelay = relayState({ status: "connecting", limitChasers: [], viSlots: new Map() });
    render(<StrategyStatusCard />);
    expect(document.querySelector('[data-slot="strategy-list-loading"]')).toBeInTheDocument();
  });
});

// ===========================================================================
// Phase 32 — VI 슬롯 표면 (D-18 · S5′ · S12) — 웨이브 ④ 뒤 /me VI 행 · 요약 · 끄기 판정
// ===========================================================================

describe("StrategyStatusCard — P32 VI 슬롯 표면 (D-18)", () => {
  const ACC_A = "37728502101";
  const ACC_B = "37728502102";
  const ACC_C = "37728502103";
  const summaryText = () =>
    document.querySelector('[data-slot="strategy-status-summary"]')?.textContent ?? "";
  const viRow = () => document.querySelector('[data-slot="vi-status-row"]') as HTMLElement;
  const viSummary = () => viRow().querySelector('[data-slot="vi-status-summary"]');
  const accountEmpty = () => document.querySelector('[data-slot="strategy-account-empty"]');
  const killButton = (no: string) => screen.getByRole("button", { name: `이 계좌 끄기 — ${no}` });
  const B_KRX = { ...VI_RUNNING, accountNo: ACC_B, orderAmountKrw: 7_000_000, checkRate: 15 };

  it("같은 KRX 를 A · B 가 각자 슬롯으로 켜면 A 칩은 A 값 · B 칩은 B 값만 말한다(덮어쓰기 없음)", () => {
    mockRelay = populated({ viSlots: viSlotsOf(VI_RUNNING, B_KRX) });
    const a = render(<StrategyStatusCard accountNo={ACC_A} />);
    expect(within(viRow()).getByText("가동")).toBeInTheDocument();
    expect(viSummary()).toHaveTextContent(/^KRX 1,000만원 · 22\.0% 이상$/);
    a.unmount();

    render(<StrategyStatusCard accountNo={ACC_B} />);
    expect(within(viRow()).getByText("가동")).toBeInTheDocument();
    expect(viSummary()).toHaveTextContent(/^KRX 700만원 · 15\.0% 이상$/);
    expect(summaryText()).toBe("상따 1 · VI 가동");
  });

  it("B 슬롯 미등록(null) · 모름 → VI 행 「중지」 · 「—」 · 요약 「VI 중지」 — A 의 가동을 빌려 오지 않는다", () => {
    mockRelay = populated({
      viSlots: new Map([
        [`${ACC_A}|KRX`, VI_RUNNING],
        [`${ACC_B}|KRX`, null],
      ]),
    });
    render(<StrategyStatusCard accountNo={ACC_B} />);
    expect(within(viRow()).getByText("중지")).toBeInTheDocument();
    expect(viSummary()).toHaveTextContent(/^—$/);
    expect(summaryText()).toBe("상따 1 · VI 중지");
  });

  it("전략 0 ∧ 등록 슬롯 없음(미등록 null 만) → 「이 계좌에 등록된 전략 없음」 + VI 행 「중지」 · 등록이지만 중지면 빈 상태 없이 VI 행만", () => {
    mockRelay = populated({ viSlots: unregisteredSlots([ACC_C, "KRX"], [ACC_C, "NXT"]) });
    const view = render(<StrategyStatusCard accountNo={ACC_C} />);
    expect(accountEmpty()).toHaveTextContent("이 계좌에 등록된 전략 없음");
    expect(within(viRow()).getByText("중지")).toBeInTheDocument();
    // 순서 — 빈 상태 한 줄 다음에 VI 행.
    expect(accountEmpty()!.compareDocumentPosition(viRow()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    view.unmount();

    mockRelay = populated({ viSlots: viSlotsOf({ ...VI_RUNNING, accountNo: ACC_C, exchange: "NXT", run: false }) });
    render(<StrategyStatusCard accountNo={ACC_C} />);
    expect(accountEmpty()).toBeNull();
    expect(within(viRow()).getByText("중지")).toBeInTheDocument();
  });

  it("「이 계좌 끄기」 VI 판정 = 그 계좌 슬롯 가동(viAccountRunning) — C 는 전략 0 이어도 C NXT 가동이면 활성 · A 의 KRX 가동은 C 를 열지 않는다", () => {
    mockRelay = populated({ viSlots: viSlotsOf(VI_RUNNING) });
    const view = render(<StrategyStatusCard accountNo={ACC_C} />);
    expect(killButton(ACC_C)).toBeDisabled();
    view.unmount();

    mockRelay = populated({
      viSlots: viSlotsOf(VI_RUNNING, { ...VI_RUNNING, accountNo: ACC_C, exchange: "NXT" }),
    });
    render(<StrategyStatusCard accountNo={ACC_C} />);
    expect(killButton(ACC_C)).toBeEnabled();
    expect(summaryText()).toBe("상따 0 · VI 가동");
  });

  it("accountNo 없음(계좌 미수신) → 전 계좌 슬롯 기준 — 어느 계좌든 가동이면 「VI 가동」 · 요약은 가동 슬롯", () => {
    mockRelay = populated({ viSlots: viSlotsOf({ ...VI_RUNNING, accountNo: ACC_B, exchange: "NXT" }) });
    render(<StrategyStatusCard />);
    expect(summaryText()).toBe("상따 3 · VI 가동");
    expect(viSummary()).toHaveTextContent(/^NXT 1,000만원 · 22\.0% 이상$/);
  });
});

// ===========================================================================
// Phase 32 — 「이 계좌 끄기」 (D-09 보정 · D-27 · S5′)
// ===========================================================================

describe("StrategyStatusCard — P32 이 계좌 끄기 (D-09 · D-27 · S5′)", () => {
  const ACC_A = "37728502101";
  const ACC_B = "37728502102";
  const ACC_C = "37728502103";
  const HINT = "이 계좌의 상따 전략과 VI 자동매수를 한 번에 끕니다. 이미 나간 주문은 취소되지 않아요.";
  const BACKSTOP = "이 계좌 끄기 요청의 반영을 확인하지 못했어요. 전략 목록을 확인해 주세요.";
  const SEND_FAIL = "연결이 끊겨 이 계좌 끄기 요청을 보내지 못했어요. 연결이 복구된 뒤 다시 눌러 주세요.";
  const killRow = () => document.querySelector('[data-slot="strategy-disable-account"]') as HTMLElement | null;
  const killButton = (no: string) => screen.getByRole("button", { name: `이 계좌 끄기 — ${no}` });
  const errorLine = () =>
    document.querySelector('[data-slot="strategy-disable-account-error"]') as HTMLElement | null;
  const disabledMsg = (count: number): RelayStrategiesDisabledMsg => ({ t: "strategies.disabled", count, viDisabled: false });

  let send: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    send = vi.fn(() => true);
    mockRelay = populated({ send: send as unknown as RelayShape["send"] });
  });

  /** 「이 계좌 끄기」 → 다이얼로그 → 실행. */
  function confirmDisable(no: string): void {
    fireEvent.click(killButton(no));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "이 계좌 끄기" }));
  }

  it("① 켜진 전략 ≥ 1 — kill 줄 = 안내 + 「이 계좌 끄기」(활성 · 접근 이름에 번호) · 카드 맨 아래이고 그 아래 다른 끄기 줄 · 링크가 없다", () => {
    render(<StrategyStatusCard accountNo={ACC_A} />);

    const row = killRow();
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent(HINT);
    expect(within(row as HTMLElement).getAllByRole("button")).toHaveLength(1);
    expect(killButton(ACC_A)).toBeEnabled();
    expect(killButton(ACC_A)).toHaveTextContent("이 계좌 끄기");
    // 맨 아래 — 뒤에 형제가 없다(D-27 · 모든 계좌를 끄는 줄 · 링크 없음).
    expect((row as HTMLElement).nextElementSibling).toBeNull();
    expect(within(row as HTMLElement).queryAllByRole("link")).toHaveLength(0);
  });

  it("② 그 계좌 켜진 전략 0 ∧ 그 계좌 VI 미가동 → disabled · opacity .45 (숨기지 않는다)", () => {
    render(<StrategyStatusCard accountNo={ACC_C} />);
    expect(killButton(ACC_C)).toBeDisabled();
    expect(killButton(ACC_C).className).toContain("disabled:opacity-[.45]");
    expect(killRow()).toHaveTextContent(HINT);
  });

  it("③ 확인 → send 1건 { t: strategies.disable.account, accountNo } · 그 계좌 버튼만 disabled → strategies.disabled 새 참조 1건 → 열림", () => {
    const view = render(<StrategyStatusCard accountNo={ACC_A} />);
    confirmDisable(ACC_A);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ t: "strategies.disable.account", accountNo: ACC_A });
    expect(killButton(ACC_A)).toBeDisabled();

    mockRelay = { ...mockRelay, strategiesDisabled: disabledMsg(2) };
    view.rerender(<StrategyStatusCard accountNo={ACC_A} />);
    expect(killButton(ACC_A)).toBeEnabled();
    expect(errorLine()).toBeNull();
  });

  it("④ A 대기 중 B 칩으로 바꾸면 B 의 「이 계좌 끄기」 는 누를 수 있다 · A 로 돌아오면 아직 대기라 disabled", () => {
    const view = render(<StrategyStatusCard accountNo={ACC_A} />);
    confirmDisable(ACC_A);
    expect(killButton(ACC_A)).toBeDisabled();

    view.rerender(<StrategyStatusCard accountNo={ACC_B} />);
    expect(killButton(ACC_B)).toBeEnabled();

    view.rerender(<StrategyStatusCard accountNo={ACC_A} />);
    expect(killButton(ACC_A)).toBeDisabled();
  });

  it("④′ WR-01 A · B 대기 중 B 를 실은 strategies.disabled → B 만 열림 · A 는 대기 · 대기에 없는 계좌(다른 탭)의 완료는 아무것도 풀지 않는다", () => {
    const view = render(<StrategyStatusCard accountNo={ACC_A} />);
    confirmDisable(ACC_A);
    view.rerender(<StrategyStatusCard accountNo={ACC_B} />);
    confirmDisable(ACC_B);
    expect(killButton(ACC_B)).toBeDisabled();

    // 다른 탭이 끈 계좌 C 의 완료 — 맨 앞(A)을 풀지 않는다.
    mockRelay = { ...mockRelay, strategiesDisabled: { ...disabledMsg(1), accountNo: ACC_C } };
    view.rerender(<StrategyStatusCard accountNo={ACC_A} />);
    expect(killButton(ACC_A)).toBeDisabled();

    // B 의 완료 — B 만 풀린다(맨 앞 A 가 아니라).
    mockRelay = { ...mockRelay, strategiesDisabled: { ...disabledMsg(1), accountNo: ACC_B } };
    view.rerender(<StrategyStatusCard accountNo={ACC_B} />);
    expect(killButton(ACC_B)).toBeEnabled();
    view.rerender(<StrategyStatusCard accountNo={ACC_A} />);
    expect(killButton(ACC_A)).toBeDisabled();
  });

  it("⑤ 8초 백스톱 → kill 줄 바로 위 role=alert 미확인 문구 · 그 계좌 버튼 다시 열림", () => {
    vi.useFakeTimers();
    render(<StrategyStatusCard accountNo={ACC_A} />);
    confirmDisable(ACC_A);
    expect(killButton(ACC_A)).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(STRATEGIES_DISABLE_ACK_TIMEOUT_MS);
    });
    expect(killButton(ACC_A)).toBeEnabled();
    const err = errorLine();
    expect(err).not.toBeNull();
    expect(err).toHaveAttribute("role", "alert");
    expect(err).toHaveTextContent(BACKSTOP);
    expect((err as HTMLElement).nextElementSibling).toBe(killRow());
  });

  it("⑤′ WR-02 relay 거부(계좌 실음) → 백스톱 전에 그 계좌 대기 풀림 · 원문 오류 줄 · 계좌 빈 거부 · 다른 계좌 거부는 무시", () => {
    vi.useFakeTimers();
    const view = render(<StrategyStatusCard accountNo={ACC_A} />);
    confirmDisable(ACC_A);
    expect(killButton(ACC_A)).toBeDisabled();

    const reject = (a: string, m: string) => ({
      t: "msg" as const,
      lv: "ERROR",
      m,
      i: "",
      a,
      src: "Relay",
      kind: "strategies.disable.account",
      receivedAt: "09:00:00",
    });
    // 계좌 빈 중간 통지(송신 실패) · 다른 계좌 거부 — 끝 신호가 아니다.
    const sendFailed = reject("", "전략 요청을 전송하지 못했습니다. 연결 상태를 확인해 주세요.");
    const otherTab = reject(ACC_B, "이 계좌에 끌 전략이 없어요");
    mockRelay = { ...mockRelay, messages: [otherTab, sendFailed] };
    view.rerender(<StrategyStatusCard accountNo={ACC_A} />);
    expect(killButton(ACC_A)).toBeDisabled();
    expect(errorLine()).toBeNull();

    // 그 계좌 거부 — 즉시 풀리고 원문을 말한다(백스톱 문구가 아니라).
    mockRelay = { ...mockRelay, messages: [reject(ACC_A, "이 계좌에 끌 전략이 없어요"), otherTab, sendFailed] };
    view.rerender(<StrategyStatusCard accountNo={ACC_A} />);
    expect(killButton(ACC_A)).toBeEnabled();
    expect(errorLine()).toHaveTextContent("이 계좌에 끌 전략이 없어요");

    // 백스톱 타이머도 지워졌다 — 8초 뒤 미확인 문구로 덮지 않는다.
    act(() => {
      vi.advanceTimersByTime(STRATEGIES_DISABLE_ACK_TIMEOUT_MS);
    });
    expect(errorLine()).toHaveTextContent("이 계좌에 끌 전략이 없어요");
    expect(errorLine()).not.toHaveTextContent(BACKSTOP);
  });

  it("⑥ send false → 전송 실패 문구 · 잠그지 않는다", () => {
    send.mockReturnValue(false);
    render(<StrategyStatusCard accountNo={ACC_A} />);
    confirmDisable(ACC_A);

    expect(killButton(ACC_A)).toBeEnabled();
    expect(errorLine()).toHaveAttribute("role", "alert");
    expect(errorLine()).toHaveTextContent(SEND_FAIL);
  });

  it("⑦ 계좌 모드 다이얼로그 — 제목 · 표(상따 · VI · 계좌 전체 라벨) · 경고 문단 · 실행 버튼 「이 계좌 끄기」 · 기본 포커스 「닫기」", () => {
    mockRelay = populated({
      send: send as unknown as RelayShape["send"],
      accounts: [
        { accountNo: ACC_A, name: "위탁종합", serverKey: "KB120" },
        { accountNo: ACC_B, name: "위탁CMA", serverKey: "KB120" },
      ],
    });
    render(<StrategyStatusCard accountNo={ACC_A} />);
    fireEvent.click(killButton(ACC_A));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("이 계좌의 전략을 끌까요?")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("상따 전략");
    expect(dialog).toHaveTextContent("2건 → 전부 OFF");
    expect(dialog).toHaveTextContent("VI 자동매수");
    expect(dialog).toHaveTextContent("가동 → 중지");
    expect(dialog).toHaveTextContent(`계좌${ACC_A} · 위탁종합 · KB120`);
    expect(dialog).toHaveTextContent("이미 접수된 주문은 취소되지 않아요. 미체결은 아래 표에서 개별 취소해 주세요.");
    expect(within(dialog).getByRole("button", { name: "이 계좌 끄기" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "닫기" })).toHaveFocus();
    expect(dialog.textContent ?? "").not.toContain("비활성화");
  });

  it("⑧ 부제 — 그 계좌 건수 · 그 계좌 VI 기준(상따+VI · 상따만 · VI 만)", () => {
    const { unmount } = render(<StrategyStatusCard accountNo={ACC_A} />);
    fireEvent.click(killButton(ACC_A));
    expect(screen.getByRole("dialog")).toHaveTextContent("상따 2건과 VI 자동매수가 한 번에 꺼져요.");
    unmount();

    const b = render(<StrategyStatusCard accountNo={ACC_B} />);
    fireEvent.click(killButton(ACC_B));
    expect(screen.getByRole("dialog")).toHaveTextContent("상따 1건이 한 번에 꺼져요.");
    b.unmount();

    mockRelay = populated({
      send: send as unknown as RelayShape["send"],
      viSlots: viSlotsOf({ ...VI_RUNNING, accountNo: ACC_C }),
    });
    render(<StrategyStatusCard accountNo={ACC_C} />);
    expect(killButton(ACC_C)).toBeEnabled();
    fireEvent.click(killButton(ACC_C));
    expect(screen.getByRole("dialog")).toHaveTextContent("VI 자동매수가 꺼져요.");
  });

  it("⑨ accountNo undefined(계좌 미수신) → kill 줄 없음", () => {
    render(<StrategyStatusCard />);
    expect(killRow()).toBeNull();
    expect(screen.queryByRole("button", { name: /이 계좌 끄기/ })).toBeNull();
  });

  it("⑩ 끄기 어휘 통일 — 카드(kill 줄) · 열린 다이얼로그 · 전송 실패 오류 줄 어디에도 「비활성화」 가 없다 (quick-261017-bwt)", () => {
    send.mockReturnValue(false);
    render(<StrategyStatusCard accountNo={ACC_A} />);
    const card = document.querySelector('[data-slot="strategy-status-card"]') as HTMLElement;
    expect(killRow()).not.toBeNull();
    expect(card.textContent ?? "").not.toContain("비활성화");

    fireEvent.click(killButton(ACC_A));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("이 계좌의 전략을 끌까요?")).toBeInTheDocument();
    expect(dialog.textContent ?? "").not.toContain("비활성화");

    fireEvent.click(within(dialog).getByRole("button", { name: "이 계좌 끄기" }));
    expect(errorLine()).toHaveTextContent(SEND_FAIL);
    expect(errorLine()?.textContent ?? "").not.toContain("비활성화");
    expect(card.textContent ?? "").not.toContain("비활성화");
  });
});
