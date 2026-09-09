import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { RelayAccountState, RelayLimitChaser } from "@gh-radar/shared";

/**
 * Phase 16 Plan 15 Task 1 — 전략 현황 카드 계약 (MYPAGE-01 · UI-SPEC C2~C4 · D-09/D-14/D-20).
 *
 * 이 파일이 잠그는 것은 **정보와 조작 경로**이지 픽셀이 아니다:
 *  ① 전략 3건이 종목명·코드·거래소 태그·**계좌번호 전체**·상태 배지를 전부 보여준다
 *  ② 행 링크가 `encodeURIComponent` 된 전략 키로 나간다
 *  ③ 전략 0 + VI 중지 → 「전체 비활성화」가 `disabled`
 *  ④ 확인 다이얼로그의 기본 포커스가 **닫기**다 (Enter 연타 방어)
 *  ⑤ 확정 시 `{t:"strategies.disable"}` 1회 · **`key` 프로퍼티 없음**(생략 = 전체)
 *  ⑥ 65 수신이 목록 상태를 바꾸지 않는다 (완료 신호일 뿐 — T-16-07)
 *  ⑦ 전략 0 빈 상태 문구
 *
 * Plan 19(gap 3) 가 덧붙인 것 — **킬 스위치가 침묵하지 않는다**:
 *  ⑨  단절 중에는 목록이 남아 있어도 버튼이 비활성이다 (회귀 잠금)
 *  ⑩  `send` 가 `false` 면 `awaitingAck` 가 서지 않고 실패 문구가 뜬다
 *  ⑪  8초 안에 65 가 오지 않으면 「반영을 확인하지 못했어요」가 뜬다 (실패로 단정하지 않는다)
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

import { StrategyStatusCard, viSummaryText } from "../strategy-status-card";

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
  orderAmountKrw: 10_000_000,
  checkRate: 22,
  priceType: "U" as const,
  run: true,
};

/** 전략 3건 + VI 가동 + 계좌 2개 — 목업의 「전략 3 · 계좌 2」 시나리오다. */
function populated(over: Partial<RelayShape> = {}): RelayShape {
  return relayState({
    status: "ready",
    accounts: [
      { accountNo: "37728502101", name: "위탁종합" },
      { accountNo: "37728502102", name: "위탁CMA" },
    ],
    limitChasers: [CHASER_A, CHASER_B, CHASER_C],
    viTrigger: VI_RUNNING,
    accountStates: accountStates(),
    ...over,
  });
}

const rows = () => document.querySelectorAll('[data-slot="strategy-row"]');
const disableButton = () => screen.getByRole("button", { name: "전체 비활성화" });

beforeEach(() => {
  mockRelay = populated();
});

// 가짜 타이머를 쓴 케이스가 다음 케이스로 새면 무관한 테스트가 멈춘다.
afterEach(() => {
  vi.useRealTimers();
});

// ===========================================================================

describe("StrategyStatusCard — 전략 현황 (UI-SPEC C2~C4)", () => {
  it("① 전략 3건이 종목명·코드·거래소 태그·계좌번호 전체·상태 배지를 모두 보여준다", () => {
    render(<StrategyStatusCard />);

    expect(rows()).toHaveLength(3);

    const first = rows()[0] as HTMLElement;
    // 종목명·단축코드는 relay 역매핑에서만 온다.
    expect(within(first).getByText("에코프로머티리얼즈우선주")).toBeInTheDocument();
    expect(within(first).getByText("086520")).toBeInTheDocument();
    // 거래소 태그 — 사이드바와 달리 이 화면은 전부 편다(C2).
    expect(within(first).getByText("KRX")).toBeInTheDocument();
    // ★ 계좌번호는 **마스킹 없이 전체** 표시된다 (D2 · S-5).
    expect(within(first).getByText("37728502101")).toBeInTheDocument();
    // 상태 배지.
    expect(within(first).getByText("매수ON")).toBeInTheDocument();

    const second = rows()[1] as HTMLElement;
    expect(within(second).getByText("이수페타시스")).toBeInTheDocument();
    expect(within(second).getByText("NXT")).toBeInTheDocument();
    expect(within(second).getByText("37728502102")).toBeInTheDocument();
    expect(within(second).getByText("매도대기")).toBeInTheDocument();

    // 이름을 모르는 전략은 ISIN 으로 폴백하고 **같은 값을 코드 칸에 두 번 쓰지 않는다**.
    const third = rows()[2] as HTMLElement;
    expect(within(third).getAllByText("KR7000660001")).toHaveLength(1);
    expect(within(third).getByText("매수ON")).toBeInTheDocument();
    expect(within(third).getByText("매도감시")).toBeInTheDocument();

    // 접근성 라벨은 배지 텍스트까지 읽어 준다(UI-SPEC §접근성 라벨).
    expect(first).toHaveAttribute(
      "aria-label",
      "에코프로머티리얼즈우선주 KRX 전략 — 매수ON",
    );

    // 카드 헤더 요약.
    expect(screen.getByText("상따 3 · VI 가동")).toBeInTheDocument();
  });

  it("② 행 링크가 인코딩된 전략 키로 나간다 (`:` → `%3A`)", () => {
    render(<StrategyStatusCard />);

    const first = rows()[0] as HTMLAnchorElement;
    expect(first.getAttribute("href")).toBe(
      `/trading/limit-chaser/${encodeURIComponent(CHASER_A.key)}`,
    );
    // 인코딩이 실제로 일어났는지 — 원문 `:` 가 남아 있으면 세그먼트가 깨진다.
    expect(first.getAttribute("href")).toContain("%3A");
    expect(first.getAttribute("href")).not.toContain(":");
  });

  it("③ 전략 0 + VI 중지 → 「전체 비활성화」가 disabled 다 (C4)", () => {
    mockRelay = relayState({ status: "ready", limitChasers: [], viTrigger: null });
    render(<StrategyStatusCard />);

    expect(disableButton()).toBeDisabled();
  });

  it("③-a 전략 0 이어도 VI 가 가동 중이면 열려 있다 (끌 것이 남아 있다)", () => {
    mockRelay = relayState({ status: "ready", limitChasers: [], viTrigger: VI_RUNNING });
    render(<StrategyStatusCard />);

    expect(disableButton()).toBeEnabled();
  });

  it("③-b 「전체 비활성화」는 채움이 아니라 `--destructive` 테두리다 (S-6 토큰 충돌)", () => {
    render(<StrategyStatusCard />);

    const button = disableButton();
    expect(button.className).toContain("border-[var(--destructive)]");
    expect(button.className).toContain("text-[var(--destructive)]");
    expect(button.className).toContain("bg-transparent");
    // 채움 빨강은 매수 버튼과 구분되지 않는다 — 배경 토큰이 들어오면 안 된다.
    expect(button.className).not.toContain("bg-[var(--destructive)]");
  });

  it("④ 확인 다이얼로그의 기본 포커스는 「닫기」다 (Enter 연타 방어)", async () => {
    const user = userEvent.setup();
    render(<StrategyStatusCard />);

    await user.click(disableButton());
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText("전략을 전부 비활성화할까요?")).toBeInTheDocument();
    expect(
      within(dialog).getByText("상따 3건과 VI 자동매수가 한 번에 꺼져요."),
    ).toBeInTheDocument();
    // 계좌 목록도 전체 표시된다.
    expect(within(dialog).getByText("37728502101 · 37728502102")).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "이미 접수된 주문은 취소되지 않아요. 미체결은 아래 표에서 개별 취소해 주세요.",
      ),
    ).toBeInTheDocument();

    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "닫기" })).toHaveFocus(),
    );

    /*
      ★ 포커스 단언만으로는 부족하다 — `onOpenAutoFocus` 오버라이드를 지우는 변이가
        `autoFocus` 이중 안전장치 덕에 **그대로 통과했다**(실측). 진짜로 지켜야 하는 것은
        「실행 버튼이 첫 tabbable 이 아니다」이므로 **DOM/탭 순서**를 함께 못 박는다.
    */
    const buttons = within(dialog).getAllByRole("button");
    expect(buttons[0]).toHaveTextContent("닫기");
    expect(buttons[1]).toHaveTextContent("전체 비활성화");
  });

  it("⑤ 확정하면 `{t:\"strategies.disable\"}` 이 1회 나가고 `key` 프로퍼티가 없다 (전체)", async () => {
    // `send` 는 boolean 계약이다 — 성공을 뜻하는 `true` 를 돌려줘야 65 대기로 넘어간다.
    const send = vi.fn(() => true);
    mockRelay = populated({ send });
    const user = userEvent.setup();
    render(<StrategyStatusCard />);

    await user.click(disableButton());
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "전체 비활성화" }));

    expect(send).toHaveBeenCalledTimes(1);
    const sent = send.mock.calls[0][0] as Record<string, unknown>;
    expect(sent).toEqual({ t: "strategies.disable" });
    // ★ 생략이 곧 「전부」다. `key: ""` 를 실어도 서버 뜻은 같지만, 단건 경로를 만들지
    //   않는다는 계약(D-09)을 프로퍼티 부재로 못 박는다.
    expect(Object.prototype.hasOwnProperty.call(sent, "key")).toBe(false);

    // 65 를 기다리는 동안 버튼은 잠긴다 — 연타로 14 가 두 번 나가지 않는다.
    await waitFor(() => expect(disableButton()).toBeDisabled());
  });

  it("⑥ 65(`strategies.disabled`) 수신은 목록 상태를 바꾸지 않는다 (완료 신호 — T-16-07)", () => {
    const { rerender } = render(<StrategyStatusCard />);
    expect(rows()).toHaveLength(3);
    expect(screen.getByText("상따 3 · VI 가동")).toBeInTheDocument();

    // 65 만 도착했다 — 60/61 에코는 아직 오지 않았다.
    mockRelay = populated({
      strategiesDisabled: { t: "strategies.disabled", count: 3, viDisabled: true },
    });
    rerender(<StrategyStatusCard />);

    // 행 수·배지·VI 상태 어느 것도 65 의 숫자로 만들어지지 않는다.
    expect(rows()).toHaveLength(3);
    expect(screen.getByText("상따 3 · VI 가동")).toBeInTheDocument();
    expect(within(rows()[0] as HTMLElement).getByText("매수ON")).toBeInTheDocument();
    expect(screen.getByText("1,000만원 · 22.0% 이상")).toBeInTheDocument();
  });

  it("⑦ 전략 0 이면 빈 상태 문구를 보여준다 (UI-SPEC §빈 상태)", () => {
    mockRelay = relayState({ status: "ready", limitChasers: [], viTrigger: null });
    render(<StrategyStatusCard />);

    expect(screen.getByText("등록된 상따 전략이 없어요")).toBeInTheDocument();
    expect(
      screen.getByText("트레이딩 › 상따에서 종목을 고르면 여기에 표시돼요."),
    ).toBeInTheDocument();
    expect(rows()).toHaveLength(0);
    // VI 행은 전략이 0건이어도 남는다 — 별개의 전략이다.
    expect(screen.getByText("VI 자동매수")).toBeInTheDocument();
    expect(screen.getByText("중지")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("⑦-a 스냅샷 수신 전에는 「없음」이 아니라 로딩이다 (C2 로딩)", () => {
    // `connecting` — 아직 `lc.snap` 을 받은 적이 없다.
    mockRelay = relayState({ status: "connecting", limitChasers: [], viTrigger: undefined });
    const { rerender } = render(<StrategyStatusCard />);

    expect(document.querySelector('[data-slot="strategy-list-loading"]')).toBeInTheDocument();
    expect(screen.getByText("전략 정보를 불러오는 중이에요…")).toBeInTheDocument();
    // ★ 묻지도 않은 상태에서 「없어요」라고 단정하지 않는다.
    expect(screen.queryByText("등록된 상따 전략이 없어요")).not.toBeInTheDocument();

    // `ready` 를 본 뒤의 빈 목록은 **확정된 0건**이다(relay 는 빈 스냅샷도 보낸다).
    mockRelay = relayState({ status: "ready", limitChasers: [], viTrigger: null });
    rerender(<StrategyStatusCard />);
    expect(screen.getByText("등록된 상따 전략이 없어요")).toBeInTheDocument();
    expect(document.querySelector('[data-slot="strategy-list-loading"]')).toBeNull();
  });

  it("⑧ VI 행 요약은 가동 중일 때만 조건을 보여주고 `/trading/vi` 로 간다 (C3)", () => {
    render(<StrategyStatusCard />);

    const viRow = document.querySelector('[data-slot="vi-status-row"]') as HTMLAnchorElement;
    expect(viRow.getAttribute("href")).toBe("/trading/vi");
    expect(within(viRow).getByText("가동")).toBeInTheDocument();
    expect(within(viRow).getByText("1,000만원 · 22.0% 이상")).toBeInTheDocument();
  });
});

describe("StrategyStatusCard — 킬 스위치의 침묵 방지 (gap 3 · T-16-19/20/21)", () => {
  const errorLine = () =>
    document.querySelector('[data-slot="strategy-disable-error"]') as HTMLElement | null;

  it("⑨ 단절 중에는 상따 목록이 남아 있어도 「전체 비활성화」가 비활성이다", () => {
    /*
      리듀서는 단절 시 `isStale` 만 세우고 `limitChasers` 를 유지한다 — 목록이 남아 있으니
      `nothingToDisable` 은 false 다. 세션 가드가 없으면 버튼이 열린 채 0바이트가 나간다.
    */
    mockRelay = populated({ status: "reconnecting", isStale: true });
    render(<StrategyStatusCard />);

    expect(rows()).toHaveLength(3);
    expect(disableButton()).toBeDisabled();
  });

  it("⑨-a `ready` 로 돌아오면 다시 열린다 (영구 잠금이 아니다)", () => {
    mockRelay = populated({ status: "reconnecting", isStale: true });
    const { rerender } = render(<StrategyStatusCard />);
    expect(disableButton()).toBeDisabled();

    mockRelay = populated();
    rerender(<StrategyStatusCard />);
    expect(disableButton()).toBeEnabled();
  });

  it("⑩ send 가 false 면 awaitingAck 가 서지 않고 실패 문구가 뜬다", async () => {
    // `ready` 인데도 소켓이 이미 닫혀 있는 경우다 — 상태 갱신보다 절단이 빠를 수 있다.
    const send = vi.fn(() => false);
    mockRelay = populated({ send });
    const user = userEvent.setup();
    render(<StrategyStatusCard />);

    await user.click(disableButton());
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "전체 비활성화" }));

    expect(send).toHaveBeenCalledTimes(1);

    const alert = await screen.findByRole("alert");
    expect(alert).toBe(errorLine());
    expect(alert).toHaveTextContent(
      "연결이 끊겨 비활성화 요청을 보내지 못했어요. 연결이 복구된 뒤 다시 눌러 주세요.",
    );
    // ★ 못 나갔으면 기다릴 것도 없다 — 8초 동안 잠기면 사용자는 껐다고 믿는다.
    expect(disableButton()).toBeEnabled();
  });

  it("⑪ 8초가 지나도 65 가 오지 않으면 「반영을 확인하지 못했어요」가 뜬다", async () => {
    // `shouldAdvanceTime` 없이는 Radix 다이얼로그의 열림 대기가 가짜 시계에 갇힌다.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const send = vi.fn(() => true);
    mockRelay = populated({ send });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<StrategyStatusCard />);

    await user.click(disableButton());
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "전체 비활성화" }));

    // 65 를 기다리는 동안은 잠긴다 — 아직 아무 문구도 없다.
    expect(disableButton()).toBeDisabled();
    expect(errorLine()).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(8_000);
    });

    const alert = screen.getByRole("alert");
    expect(alert).toBe(errorLine());
    expect(alert).toHaveTextContent(
      "전체 비활성화 요청의 반영을 확인하지 못했어요. 전략 목록을 확인해 주세요.",
    );
    // ★ 「실패」라고 단정하지 않는다 — 65 가 유실됐을 뿐 실제로 꺼졌을 수 있다(T-16-21).
    expect(alert.textContent ?? "").not.toContain("실패");
    expect(disableButton()).toBeEnabled();
  });
});

describe("viSummaryText — 단위 환산", () => {
  it("원 → 만원 환산은 반올림하지 않는다 (없는 금액을 말하지 않는다)", () => {
    expect(viSummaryText({ orderAmountKrw: 10_000_000, checkRate: 22 }, true)).toBe(
      "1,000만원 · 22.0% 이상",
    );
    expect(viSummaryText({ orderAmountKrw: 15_000, checkRate: 25 }, true)).toBe(
      "1.5만원 · 25.0% 이상",
    );
  });

  it("중지·미등록·미조회는 전부 `—` 다", () => {
    expect(viSummaryText({ orderAmountKrw: 10_000_000, checkRate: 22 }, false)).toBe("—");
    expect(viSummaryText(null, false)).toBe("—");
    expect(viSummaryText(undefined, true)).toBe("—");
  });
});
