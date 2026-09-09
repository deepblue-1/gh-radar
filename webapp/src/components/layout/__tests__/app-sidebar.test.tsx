import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import type { RelayLimitChaser } from "@gh-radar/shared";

/**
 * Phase 16 Plan 11 Task 1 — AppSidebar 트리 계약 (NAV-01 · D-15~D-19 · UI-SPEC N1~N7).
 *
 * 이 파일이 잠그는 것은 **구조와 조건**이지 픽셀이 아니다:
 *  ① 그룹 소제목이 링크·버튼이 **아니다** (drawer 자동 닫힘 회귀 방지)
 *  ② 로그인 + `ready` 일 때만 트레이딩·My page 가 **DOM 에 존재**한다
 *  ③ 비로그인 / `unauthorized` / 연결 중에는 **렌더되지 않는다**(숨김 아님)
 *  ④ 3단 항목 = 종목명 + 원 아이콘 묶음 1개, 라벨은 「매수 켜짐 · 매도 꺼짐」
 *  ⑤ `aria-current` 는 `/trading/limit-chaser/new` 에서 「상따」에만
 *  ⑥ 모든 링크에 `data-nav-item`
 *  ⑦ 전략 0건이면 「등록된 전략 없음」(링크 아님)
 */

// ---------------------------------------------------------------------------
// 훅 스텁 — 상태를 테스트가 직접 주입한다
// ---------------------------------------------------------------------------

type RelayShape = ReturnType<typeof import("@/lib/relay-provider").useRelayContext>;
type AuthShape = ReturnType<typeof import("@/lib/auth-context").useAuth>;

let mockPathname = "/";
let mockRelay: RelayShape;
let mockAuth: AuthShape;

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

vi.mock("@/lib/relay-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/relay-provider")>();
  return { ...actual, useRelayContext: () => mockRelay };
});

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => mockAuth,
}));

// UserSection 은 Radix Popover + Supabase 세션 표면이라 트리 계약과 무관하다.
vi.mock("../user-section", () => ({
  UserSection: () => <div data-testid="user-section" />,
}));

import { EMPTY_RELAY_VALUE } from "@/lib/relay-provider";

import { AppSidebar } from "../app-sidebar";

// ---------------------------------------------------------------------------
// 픽스처
// ---------------------------------------------------------------------------

/**
 * 상따 전략 1건. **긴 종목명**을 기본으로 둔다 — 짧은 이름만 쓰면 240px 폭에서
 * 잘림이 발생해도 테스트가 아무것도 눈치채지 못한다.
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

/**
 * 잔고·미체결에 실린 종목명 — 사이드바가 이름을 얻는 유일한 경로다(relay 역매핑 산물).
 *
 * ★ **계좌를 둘로 나눠 둔다** (16-23 WR-08). CHASER_A 의 종목은 계좌 A 의 잔고에만,
 *   CHASER_B 의 종목은 계좌 B 의 미체결에만 있다. 역매핑이 「마지막으로 받은 계좌」
 *   하나만 보면 둘 중 하나는 반드시 ISIN 원문으로 남는다 — 그 회귀를 이 픽스처가 잠근다.
 */
function accountStatesWithNames(): RelayShape["accountStates"] {
  return new Map([
    [
      "37728502101",
      {
        t: "acct",
        a: "37728502101",
        snap: true,
        hold: [
          {
            isin: "KR7086520004",
            qty: 76,
            sellableQty: 76,
            avgPrice: 130_000,
            // 긴 이름 — 잘림 회귀를 잡을 수 있게 넉넉히 길다.
            name: "에코프로머티리얼즈우선주",
          },
        ],
        unf: [],
        rm: [],
        st: "13:44:02",
      },
    ],
    [
      "37728502102",
      {
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
          },
        ],
        rm: [],
        st: "13:44:05",
      },
    ],
  ]) as RelayShape["accountStates"];
}

function relayState(over: Partial<RelayShape> = {}): RelayShape {
  return { ...EMPTY_RELAY_VALUE, ...over };
}

function authed(): AuthShape {
  return {
    user: { id: "u1", email: "e2e@gh-radar.local" },
    displayName: "e2e",
    isLoading: false,
    signOut: vi.fn(),
  } as unknown as AuthShape;
}

function guest(): AuthShape {
  return {
    user: null,
    displayName: null,
    isLoading: false,
    signOut: vi.fn(),
  } as unknown as AuthShape;
}

/** 트레이딩 노출 조건을 만족하는 기본 상태(로그인 + ready + 전략 2건). */
function setupReady(over: Partial<RelayShape> = {}): void {
  mockAuth = authed();
  mockRelay = relayState({
    status: "ready",
    limitChasers: [CHASER_A, CHASER_B],
    accountStates: accountStatesWithNames(),
    ...over,
  });
}

beforeEach(() => {
  mockPathname = "/";
  mockAuth = guest();
  mockRelay = relayState();
});

// ---------------------------------------------------------------------------

describe("AppSidebar — 트리 구조 (N1/N2)", () => {
  it("① 그룹 소제목 2개는 <li> 이고 링크·버튼이 아니다", () => {
    setupReady();
    render(<AppSidebar />);

    for (const title of ["종목검색", "트레이딩"]) {
      const heading = screen.getByText(title);
      expect(heading.tagName).toBe("LI");
      // 소제목 자체도, 그 안쪽 어디에도 클릭 대상이 없어야 한다 —
      // drawer 자동 닫힘 순회가 A / BUTTON[data-nav-item] 을 잡기 때문이다.
      expect(heading.closest("a")).toBeNull();
      expect(heading.closest("button")).toBeNull();
      expect(heading.querySelector("a")).toBeNull();
      expect(heading.querySelector("button")).toBeNull();
      expect(heading.hasAttribute("data-nav-item")).toBe(false);
    }

    // 소제목 문구가 링크로 잡히지 않는다.
    expect(screen.queryByRole("link", { name: "종목검색" })).toBeNull();
    expect(screen.queryByRole("link", { name: "트레이딩" })).toBeNull();
  });

  it("`/scanner` 항목 라벨이 「상승률 상위」이고 URL 은 그대로다 (D-15)", () => {
    setupReady();
    render(<AppSidebar />);

    const link = screen.getByRole("link", { name: "상승률 상위" });
    expect(link).toHaveAttribute("href", "/scanner");
    // 접근가능 이름이 **정확히** 새 라벨이어야 한다 — 구 라벨이 남아 있으면 여기서 깨진다.
    // (구 라벨 문자열을 이 파일에 적지 않는다: 「전 표면에서 0건」을 grep 으로 검사하기 때문.)
    expect(link).toHaveAccessibleName("상승률 상위");
  });
});

describe("AppSidebar — 조건부 숨김 (N4/D-19)", () => {
  it("② 로그인 + ready 면 트레이딩 그룹과 My page 가 렌더된다", () => {
    setupReady();
    render(<AppSidebar />);

    expect(screen.getByText("트레이딩")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /상따/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /VI/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My page" })).toHaveAttribute(
      "href",
      "/me",
    );
  });

  it("③-a 비로그인이면 트레이딩·My page 가 DOM 에 없다 (숨김이 아니라 미렌더)", () => {
    mockAuth = guest();
    mockRelay = relayState({ status: "ready", limitChasers: [CHASER_A] });
    render(<AppSidebar />);

    expect(screen.queryByText("트레이딩")).toBeNull();
    expect(screen.queryByRole("link", { name: "My page" })).toBeNull();
    expect(screen.queryByRole("link", { name: /상따/ })).toBeNull();
    // 공개 항목은 그대로 보인다.
    expect(screen.getByRole("link", { name: "홈" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "상승률 상위" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AI 애널리스트" })).toBeInTheDocument();
  });

  it("③-b status=unauthorized 면 로그인 상태여도 미렌더", () => {
    mockAuth = authed();
    mockRelay = relayState({ status: "unauthorized", limitChasers: [CHASER_A] });
    render(<AppSidebar />);

    expect(screen.queryByText("트레이딩")).toBeNull();
    expect(screen.queryByRole("link", { name: "My page" })).toBeNull();
  });

  it("③-c 판정 전(연결 중)에는 숨긴 상태로 시작한다 — 깜빡임 금지", () => {
    mockAuth = authed();
    mockRelay = relayState({ status: "connecting" });
    render(<AppSidebar />);

    expect(screen.queryByText("트레이딩")).toBeNull();
    expect(screen.queryByRole("link", { name: "My page" })).toBeNull();
  });

  it("③-d 한 번 ready 였다면 재접속 중에도 내려가지 않는다", () => {
    setupReady();
    const view = render(<AppSidebar />);
    expect(screen.getByText("트레이딩")).toBeInTheDocument();

    // 재접속: relay 는 데이터를 지우지 않고 isStale 만 세운다.
    mockRelay = relayState({
      status: "reconnecting",
      attempt: 1,
      isStale: true,
      limitChasers: [CHASER_A, CHASER_B],
      accountStates: accountStatesWithNames(),
    });
    view.rerender(<AppSidebar />);

    expect(screen.getByText("트레이딩")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My page" })).toBeInTheDocument();
  });
});

describe("AppSidebar — 전략 3단 목록 (N3/N3a/N5)", () => {
  it("④ 전략 2건이 종목명 + 원 아이콘 묶음으로 렌더되고 aria-label 이 「매수 켜짐 · 매도 꺼짐」 형태다", () => {
    setupReady();
    render(<AppSidebar />);

    // A: 매수 ON · 매도 OFF
    const a = screen.getByRole("link", { name: /에코프로머티리얼즈우선주/ });
    expect(a).toHaveAttribute(
      "href",
      `/trading/limit-chaser/${encodeURIComponent(CHASER_A.key)}`,
    );
    // 키에 `:` 가 들어가므로 인코딩된 형태여야 한다.
    expect(a.getAttribute("href")).toContain("%3A");
    expect(a.getAttribute("href")).not.toContain(":");

    const ioA = within(a).getByRole("img");
    expect(ioA).toHaveAttribute("aria-label", "매수 켜짐 · 매도 꺼짐");
    expect(ioA).toHaveAttribute("title", "매수 켜짐 · 매도 꺼짐");
    // 묶음은 **1개**, 개별 원에는 라벨이 없다(중복 낭독 방지).
    expect(within(a).getAllByRole("img")).toHaveLength(1);
    expect(ioA.querySelectorAll("[aria-label]")).toHaveLength(0);
    expect(ioA.querySelectorAll("[data-io]")).toHaveLength(2);

    // B: 매수 OFF · 매도 ON
    const b = screen.getByRole("link", { name: /이수페타시스/ });
    expect(within(b).getByRole("img")).toHaveAttribute(
      "aria-label",
      "매수 꺼짐 · 매도 켜짐",
    );

    // N3a — 3단 항목에 거래소 태그·상태 배지를 두지 않는다.
    expect(b.textContent).not.toContain("NXT");
    expect(a.textContent).not.toContain("KRX");
    expect(a.querySelector('[data-slot="strategy-badge"]')).toBeNull();
    expect(b.querySelector('[data-slot="strategy-badge"]')).toBeNull();
  });

  it("WR-08 — 계좌가 둘이면 **두 계좌 모두**에서 이름을 얻는다 (마지막 수신 계좌 하나가 아니다)", () => {
    // 픽스처: A 의 종목은 계좌 A 잔고에만, B 의 종목은 계좌 B 미체결에만 있다.
    setupReady();
    render(<AppSidebar />);

    expect(
      screen.getByRole("link", { name: /에코프로머티리얼즈우선주/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /이수페타시스/ })).toBeInTheDocument();
    // 어느 쪽도 ISIN 원문으로 남지 않는다 — 「마지막 수신 계좌」만 보면 하나는 반드시 남는다.
    expect(screen.queryByText(new RegExp(CHASER_A.isin))).toBeNull();
    expect(screen.queryByText(new RegExp(CHASER_B.isin))).toBeNull();
  });

  it("종목명을 모르면 ISIN 을 그대로 보여준다", () => {
    setupReady({ accountStates: new Map(), limitChasers: [CHASER_A] });
    render(<AppSidebar />);

    expect(
      screen.getByRole("link", { name: new RegExp(CHASER_A.isin) }),
    ).toBeInTheDocument();
  });

  it("⑦ 전략 0건이면 「등록된 전략 없음」이 링크가 아닌 채로 나온다", () => {
    setupReady({ limitChasers: [] });
    render(<AppSidebar />);

    const empty = screen.getByText("등록된 전략 없음");
    expect(empty.closest("a")).toBeNull();
    expect(screen.queryByRole("link", { name: "등록된 전략 없음" })).toBeNull();
  });

  it("N7 — VI 항목 배지는 viTrigger.run 을 따른다", () => {
    setupReady({
      viTrigger: {
        accountNo: "37728502101",
        orderAmountKrw: 1_000_000,
        checkRate: 25,
        priceType: "U",
        run: true,
      },
    });
    const view = render(<AppSidebar />);
    expect(screen.getByRole("link", { name: /VI/ })).toHaveTextContent("가동");

    setupReady({ viTrigger: null });
    view.rerender(<AppSidebar />);
    expect(screen.getByRole("link", { name: /VI/ })).toHaveTextContent("중지");
  });
});

describe("AppSidebar — 활성 표시 · drawer 계약", () => {
  it("⑤ `/trading/limit-chaser/new` 에서만 「상따」가 aria-current=page 다", () => {
    mockPathname = "/trading/limit-chaser/new";
    setupReady();
    const view = render(<AppSidebar />);

    expect(screen.getByRole("link", { name: /상따/ })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // 편집 경로에서는 「상따」가 꺼지고 해당 3단 항목만 켜진다.
    mockPathname = `/trading/limit-chaser/${encodeURIComponent(CHASER_A.key)}`;
    setupReady();
    view.rerender(<AppSidebar />);

    expect(screen.getByRole("link", { name: /상따/ })).not.toHaveAttribute(
      "aria-current",
    );
    expect(
      screen.getByRole("link", { name: /에코프로머티리얼즈우선주/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("link", { name: /이수페타시스/ }),
    ).not.toHaveAttribute("aria-current");
  });

  it("기존 정확 일치 동작이 유지된다 — `/scanner` 하위 경로가 「상승률 상위」를 켜지 않는다", () => {
    mockPathname = "/scanner/detail";
    setupReady();
    render(<AppSidebar />);

    expect(screen.getByRole("link", { name: "상승률 상위" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("⑥ 모든 링크에 data-nav-item 이 붙어 있다 (drawer 자동 닫힘 계약)", () => {
    setupReady();
    const { container } = render(<AppSidebar />);

    const links = container.querySelectorAll("nav a");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.hasAttribute("data-nav-item")).toBe(true);
    }
  });
});
