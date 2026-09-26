import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import type { RelayLimitChaser, RelayViTrigger } from "@gh-radar/shared";

/**
 * AppSidebar 트리 계약 — Phase 16 Plan 11 (NAV-01 · D-15~D-19) 위에 Phase 18 Plan 12 (D-03 · E16) 가
 * 「트레이딩」 그룹을 다시 짰다.
 *
 * 이 파일이 잠그는 것은 **구조와 조건**이지 픽셀이 아니다:
 *  ① 검색 허브 하위 3링크(`/scanner`·`/themes`·`/watchlist`)는 사이드바에 없다 — `/search` 허브 타일로만
 *     들어가고, 그 페이지들(+ 테마 상세)에서는 「검색」이 켜진다 (quick-260926-o2u D1)
 *  ①' 「트레이딩」 제목은 `/trading` **링크**이고 `?focus=` 가 붙어도 활성이다 (D-03)
 *  ② 로그인 + `ready` 일 때만 트레이딩·My page 가 **DOM 에 존재**한다
 *  ③ 비로그인 / `unauthorized` / 연결 중에는 **렌더되지 않는다**(숨김 아님)
 *  ④ 3단 = 「VI」 한 줄(가동 거래소가 있을 때만) · 등록 전략(종목명 + LED 3점). 옛 `/trading/vi`
 *     · 상따 개별 메뉴 없음 (quick-260923-dmb)
 *  ⑤ VI 줄 오른쪽 태그는 가동 거래소만 — 거래소별 **독립** 판정, KRX → NXT 순. 둘 다 꺼지면 줄 미렌더
 *  ⑥ 모든 링크에 `data-nav-item`
 *  ⑦ 전략 0 + VI 꺼짐이면 3단 목록 자체가 없다 · 전략 0 + VI 가동이면 VI 한 줄만 — 빈 문구 없음
 *     (E16 empty/loading)
 *  ⑧ 하단 줄에 유저 섹션과 **테마 토글**이 나란히 산다 (토글이 탑바를 떠나 여기로 왔다)
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
import { TRADING_FOCUS_EVENT } from "@/lib/trading-focus";

import { AppSidebar, strategyLedLabel } from "../app-sidebar";

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
    cancelEntryLatched: false,
    buyEntryLatched: false,
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
 * VI 전략 1건 — **거래소별**이다 (17-06 / D-06). 서버가 거래소마다 1건을 따로 들고
 * 있으므로 픽스처도 거래소를 받는다. 기본은 중지다(가동은 케이스가 명시한다).
 */
function viCfg(
  exchange: "KRX" | "NXT",
  over: Partial<RelayViTrigger> = {},
): RelayViTrigger {
  return {
    accountNo: "37728502101",
    exchange,
    orderAmountKrw: 1_000_000,
    checkRate: 25,
    priceType: "U",
    run: false,
    ...over,
  };
}

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

/** 3단 목록(트레이딩 그룹 제목 바로 다음 형제 `li` 안의 `ul`) — 없으면 `null`. */
function tradingSubList(): HTMLUListElement | null {
  const title = screen.getByRole("link", { name: "트레이딩" });
  return (title.closest("li")?.nextElementSibling?.querySelector("ul") ?? null) as HTMLUListElement | null;
}

/** 3단 목록의 링크들. */
function tradingSubLinks(): HTMLAnchorElement[] {
  const list = tradingSubList();
  if (!list) throw new Error("트레이딩 3단 목록이 없다");
  return Array.from(list.querySelectorAll("a")) as HTMLAnchorElement[];
}

/** 사이드바 VI 줄(있으면) — `data-sidebar-item="vi"`. */
const viLinks = () => document.querySelectorAll('nav a[data-sidebar-item="vi"]');
/** VI 줄 안 거래소 태그의 `data-exchange` 목록. */
function viTagExchanges(): (string | null)[] {
  const a = document.querySelector('nav a[data-sidebar-item="vi"]');
  if (!a) throw new Error("VI 줄이 없다");
  return Array.from(a.querySelectorAll('[data-slot="exchange-tag"]')).map((t) =>
    t.getAttribute("data-exchange"),
  );
}

describe("AppSidebar — 트리 구조 (N1/N2 · D-03)", () => {
  it("① 검색 허브 하위 그룹이 없다 — 그룹명 텍스트 없음 · 세 href 링크 0개 (quick-260926-o2u D1)", () => {
    setupReady();
    const { container } = render(<AppSidebar />);

    expect(screen.queryByText("종목검색")).toBeNull();
    for (const href of ["/scanner", "/themes", "/watchlist"]) {
      expect(container.querySelectorAll(`nav a[href="${href}"]`)).toHaveLength(0);
    }
  });

  it("①' 「트레이딩」 제목은 `/trading` 링크이고 `/trading` 에서 활성이다", () => {
    mockPathname = "/trading";
    setupReady();
    render(<AppSidebar />);

    const title = screen.getByRole("link", { name: "트레이딩" });
    expect(title).toHaveAttribute("href", "/trading");
    expect(title).toHaveAttribute("aria-current", "page");
    expect(title.hasAttribute("data-nav-item")).toBe(true);
  });

  it("①' `/trading?focus=…` 에서도 제목이 활성이다 — 쿼리는 활성 판정에 끼지 않는다", () => {
    // `usePathname()` 은 쿼리를 싣지 않는다. 경로만 같으면 활성이다.
    mockPathname = "/trading";
    setupReady();
    render(<AppSidebar />);
    expect(screen.getByRole("link", { name: "트레이딩" })).toHaveAttribute("aria-current", "page");
  });

  it("①' 다른 경로에서는 제목이 활성이 아니다", () => {
    mockPathname = "/me";
    setupReady();
    render(<AppSidebar />);
    expect(screen.getByRole("link", { name: "트레이딩" })).not.toHaveAttribute("aria-current");
  });

  it("260925-gy6 — sketch 003-A 사이드바 활성 = 선택 토큰(--nav-on-bg/--nav-on-fg), 비활성에는 없다", () => {
    mockPathname = "/trading";
    setupReady();
    render(<AppSidebar />);

    const active = screen.getByRole("link", { name: "트레이딩" });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active.className).toContain("bg-[var(--nav-on-bg)]");
    expect(active.className).toContain("text-[var(--nav-on-fg)]");

    const idle = screen.getByRole("link", { name: "홈" });
    expect(idle).not.toHaveAttribute("aria-current");
    expect(idle.className).not.toContain("bg-[var(--nav-on-bg)]");
  });

  it("21-08 D-07 · quick-260926-o2u D1 — 「홈」 다음 「검색」(`/search`), 그다음 「트레이딩」 제목 링크다", () => {
    setupReady();
    render(<AppSidebar />);

    const topItems = Array.from(
      document.querySelectorAll('nav[aria-label="주 메뉴"] > ul:first-child > li'),
    );
    expect(topItems[0]).toHaveTextContent("홈");
    const searchLink = within(topItems[1] as HTMLElement).getByRole("link", { name: "검색" });
    expect(searchLink).toHaveAttribute("href", "/search");
    expect(searchLink.hasAttribute("data-nav-item")).toBe(true);
    // 그 다음이 「트레이딩」 제목 링크 — 허브 하위 그룹은 없다
    const trading = within(topItems[2] as HTMLElement).getByRole("link", { name: "트레이딩" });
    expect(trading).toHaveAttribute("href", "/trading");
  });

  it("21-08 D-07 — `/search` 에서 「검색」이 활성(aria-current + 선택 토큰)이고 홈은 비활성이다", () => {
    mockPathname = "/search";
    setupReady();
    render(<AppSidebar />);

    const active = screen.getByRole("link", { name: "검색" });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active.className).toContain("bg-[var(--nav-on-bg)]");
    expect(active.className).toContain("text-[var(--nav-on-fg)]");
    expect(screen.getByRole("link", { name: "홈" })).not.toHaveAttribute("aria-current");
  });

  // quick-260926-o2u D1 — 검색 허브와 그 하위(상승률 상위·테마·관심종목 + 테마 상세)에서 「검색」이 켜진다.
  // (구 라벨 문자열을 이 파일에 적지 않는다: 「전 표면에서 0건」을 grep 으로 검사하기 때문.)
  it.each(["/search", "/scanner", "/themes", "/themes/abc-123", "/watchlist"])(
    "`%s` 에서 「검색」이 활성(aria-current + 선택 토큰)이다",
    (path) => {
      mockPathname = path;
      setupReady();
      render(<AppSidebar />);

      const link = screen.getByRole("link", { name: "검색" });
      expect(link).toHaveAttribute("aria-current", "page");
      expect(link.className).toContain("bg-[var(--nav-on-bg)]");
    },
  );

  it.each(["/", "/scanner/detail", "/stocks/005930", "/chat"])(
    "`%s` 에서는 「검색」이 활성이 아니다",
    (path) => {
      mockPathname = path;
      setupReady();
      render(<AppSidebar />);

      const link = screen.getByRole("link", { name: "검색" });
      expect(link).not.toHaveAttribute("aria-current");
      expect(link.className).not.toContain("bg-[var(--nav-on-bg)]");
    },
  );
});

describe("AppSidebar — 조건부 숨김 (N4/D-19)", () => {
  it("② 로그인 + ready 면 트레이딩 그룹과 My page 가 렌더된다", () => {
    setupReady();
    render(<AppSidebar />);

    expect(screen.getByRole("link", { name: "트레이딩" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My page" })).toHaveAttribute("href", "/me");
  });

  it("③-a 비로그인이면 트레이딩·My page 가 DOM 에 없다 (숨김이 아니라 미렌더)", () => {
    mockAuth = guest();
    mockRelay = relayState({ status: "ready", limitChasers: [CHASER_A] });
    render(<AppSidebar />);

    expect(screen.queryByText("트레이딩")).toBeNull();
    expect(screen.queryByRole("link", { name: "My page" })).toBeNull();
    expect(screen.queryByRole("link", { name: /VI/ })).toBeNull();
    // 공개 항목은 그대로 보인다.
    expect(screen.getByRole("link", { name: "홈" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "검색" })).toBeInTheDocument();
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

describe("AppSidebar — 3단 목록 (D-03 · E16)", () => {
  it("④ 3단 = VI 한 줄 · 등록 전략 순서이고, 옛 `/trading/vi` · 상따 개별 메뉴가 없다", () => {
    setupReady({ viTriggers: { KRX: viCfg("KRX", { run: true }) } });
    render(<AppSidebar />);

    const names = tradingSubLinks().map((a) => a.getAttribute("data-sidebar-item"));
    expect(names).toEqual(["vi", "strategy", "strategy"]);

    expect(screen.queryByRole("link", { name: /^상따/ })).toBeNull();
    // 옛 개별 VI 메뉴(`/trading/vi` 화면) — 새 VI 줄의 이름은 「VI — …」라 여기 걸리지 않는다.
    expect(screen.queryByRole("link", { name: /^VI$/ })).toBeNull();
    for (const a of document.querySelectorAll("nav a")) {
      const href = a.getAttribute("href") ?? "";
      // 옛 상따·VI 화면 경로(이제 리다이렉트만 남았다)를 가리키는 링크가 없다.
      expect(href).not.toMatch(/^\/trading\/(limit-chaser|vi)(\/|$)/);
    }
  });

  it("④ VI 줄은 작업대(`/trading`)로 가고 활성 표시를 받지 않는다 — 활성은 제목 하나", () => {
    mockPathname = "/trading";
    setupReady({ viTriggers: { KRX: viCfg("KRX", { run: true }) } });
    render(<AppSidebar />);

    const a = screen.getByRole("link", { name: "VI — KRX 가동" });
    expect(a).toHaveAttribute("href", "/trading");
    expect(a).not.toHaveAttribute("aria-current");
    expect(a).toHaveAttribute("data-sidebar-item", "vi");
    expect(viTagExchanges()).toEqual(["KRX"]);
  });

  it("⑤ NXT 만 가동 → 태그는 NXT 하나 · 이름 「VI — NXT 가동」 (합집합이 아니라 거래소별)", () => {
    setupReady({
      viTriggers: { KRX: viCfg("KRX", { run: false }), NXT: viCfg("NXT", { run: true }) },
    });
    render(<AppSidebar />);

    expect(viLinks()).toHaveLength(1);
    expect(viTagExchanges()).toEqual(["NXT"]);
    expect(screen.getByRole("link", { name: "VI — NXT 가동" })).toBeInTheDocument();
  });

  it("⑤ 둘 다 가동 → KRX · NXT 순 태그(객체 키를 NXT 먼저 넣어도) · 이름 「VI — KRX·NXT 가동」", () => {
    setupReady({
      viTriggers: { NXT: viCfg("NXT", { run: true }), KRX: viCfg("KRX", { run: true }) },
    });
    render(<AppSidebar />);

    expect(viTagExchanges()).toEqual(["KRX", "NXT"]);
    expect(screen.getByRole("link", { name: "VI — KRX·NXT 가동" })).toBeInTheDocument();
  });

  it("⑤ 둘 다 중지 · 미등록(null) · 모름(키 부재) → VI 줄이 DOM 에 없다(미렌더) · 전략은 그대로", () => {
    const cases: RelayShape["viTriggers"][] = [
      { KRX: viCfg("KRX", { run: false }), NXT: viCfg("NXT", { run: false }) },
      { KRX: null, NXT: null },
      {},
      { KRX: null },
    ];
    for (const viTriggers of cases) {
      setupReady({ viTriggers });
      const view = render(<AppSidebar />);
      expect(viLinks()).toHaveLength(0);
      expect(screen.queryByRole("link", { name: /^VI/ })).toBeNull();
      expect(tradingSubLinks().map((a) => a.getAttribute("data-sidebar-item"))).toEqual([
        "strategy",
        "strategy",
      ]);
      view.unmount();
    }
  });

  it("⑤ VI 줄 텍스트는 「VI」 + 태그 글자뿐 — 옛 「가동」 배지 글자 · strategy-badge 슬롯이 없다", () => {
    setupReady({
      viTriggers: { KRX: viCfg("KRX", { run: true }), NXT: viCfg("NXT", { run: true }) },
    });
    render(<AppSidebar />);

    const a = viLinks()[0] as HTMLElement;
    expect(a.textContent).toBe("VIKRXNXT");
    expect(within(a).queryByText(/가동/)).toBeNull();
    expect(a.querySelector('[data-slot="strategy-badge"]')).toBeNull();
    // 태그 묶음은 이름이 이미 말하므로 스크린리더에서 숨긴다.
    expect(a.querySelector('[data-slot="exchange-tag"]')!.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it("⑦ 등록 전략 0 + VI 꺼짐 → 3단 목록 자체가 없다(빈 `ul` 미렌더)", () => {
    setupReady({ limitChasers: [] });
    render(<AppSidebar />);

    expect(tradingSubList()).toBeNull();
    const title = screen.getByRole("link", { name: "트레이딩" });
    // 제목 다음 형제는 곧바로 My page 다.
    expect(title.closest("li")?.nextElementSibling?.querySelector("a")).toHaveAccessibleName("My page");
    expect(screen.queryByText("등록된 전략 없음")).toBeNull();
  });

  it("⑨ 켜진 전략만 싣는다 — 매수·매도 스위치 또는 취소잔량. 취소 체결·잔량추적·한방만 켜진 전략은 뺀다 (사용자 결정 2026-09-23 개정)", () => {
    const base = { accountNo: "37728502101", exchange: "KRX" as const, buyEnabled: false, sellEnabled: false };
    const cancelQty = makeChaser({ ...base, isin: "KR7446540000", cancelQtyEnabled: true });
    const cancelTradeOnly = makeChaser({ ...base, isin: "KR7005930003", cancelQtyEnabled: false, cancelTradeEnabled: true, cancelQtyTrackEnabled: true, sweepEnabled: true });
    setupReady({ limitChasers: [CHASER_A, cancelQty, cancelTradeOnly, CHASER_B] });
    render(<AppSidebar />);

    const keys = tradingSubLinks()
      .map((a) => a.getAttribute("data-strategy-key"))
      .filter((k) => k !== null);
    expect(keys).toEqual([CHASER_A.key, cancelQty.key, CHASER_B.key]);
  });

  it("⑨ 남는 전략이 없고 VI 도 꺼져 있으면 3단 목록 자체가 없다", () => {
    setupReady({ limitChasers: [makeChaser({ buyEnabled: false, sellEnabled: false })] });
    render(<AppSidebar />);
    expect(tradingSubList()).toBeNull();
  });

  it("⑦ 등록 전략 0 + KRX 가동 → VI 한 줄만, 빈 문구 · 스피너 없음 (E16 empty)", () => {
    setupReady({ limitChasers: [], viTriggers: { KRX: viCfg("KRX", { run: true }) } });
    render(<AppSidebar />);

    expect(tradingSubLinks().map((a) => a.getAttribute("data-sidebar-item"))).toEqual(["vi"]);
    expect(screen.queryByText("등록된 전략 없음")).toBeNull();
    // 스피너 없음 — 로딩(스냅샷 전)은 빈 상태와 같은 모양이다 (E16 loading).
    expect(document.querySelector('nav [role="progressbar"], nav .animate-spin')).toBeNull();
  });

  it("④ 등록 전략 N개가 종목명 + LED 3점(7px)으로 붙고 링크는 `/trading?focus=` 다", () => {
    setupReady();
    render(<AppSidebar />);

    const a = screen.getByRole("link", { name: /에코프로머티리얼즈우선주/ });
    expect(a).toHaveAttribute("href", `/trading?focus=${encodeURIComponent(CHASER_A.key)}`);
    // 키에 `:` 가 들어가므로 인코딩된 형태여야 한다.
    expect(a.getAttribute("href")).toContain("%3A");
    expect(a.getAttribute("href")?.slice("/trading?focus=".length)).not.toContain(":");

    const leds = within(a).getByRole("img");
    expect(within(a).getAllByRole("img")).toHaveLength(1);
    const dots = leds.querySelectorAll("[data-led]");
    expect(Array.from(dots).map((d) => d.getAttribute("data-led"))).toEqual(["buy", "sell", "cancel"]);
    for (const d of dots) {
      expect(d.className).toContain("size-[7px]");
      expect(d.hasAttribute("aria-label")).toBe(false);
    }
    // CHASER_A: 매수 무장(매도잔량 기준 → 감시) · 매도 OFF · 취소 OFF — `latchLedStateOf` 판정 그대로.
    expect(Array.from(dots).map((d) => d.getAttribute("data-tone"))).toEqual(["armed", "off", "off"]);
    expect(leds).toHaveAttribute("aria-label", "매수 감시 · 매도 OFF · 취소 OFF");
    expect(leds).toHaveAttribute("title", "매수 감시 · 매도 OFF · 취소 OFF");

    // N3a — 3단 전략 항목에 거래소 태그·상태 배지를 두지 않는다. NXT 전략은 이름 꼬리 「· NXT」
    // 하나로만 가른다(GC-IN-04 · 18-31) — 별도 태그 요소는 없다.
    const b = screen.getByRole("link", { name: /이수페타시스/ });
    expect(b.querySelector("span[title]")!.textContent).toBe("이수페타시스 · NXT");
    expect(b.textContent?.match(/NXT/g)).toHaveLength(1);
    expect(a.querySelector('[data-slot="strategy-badge"]')).toBeNull();
    expect(b.querySelector('[data-slot="strategy-badge"]')).toBeNull();
  });

  it("LED 3점은 잠복(대기)·래치(감시)를 구분한다", () => {
    const latent = makeChaser({
      isin: "KR7000660001",
      buyEnabled: true,
      buyWatchSide: "1",
      buyEntryLatched: false,
      sellEnabled: true,
      sellEntryLatched: true,
      cancelQtyEnabled: true,
      cancelEntryLatched: false,
      name: "SK하이닉스",
    });
    setupReady({ limitChasers: [latent] });
    render(<AppSidebar />);

    const dots = within(screen.getByRole("link", { name: /SK하이닉스/ })).getByRole("img").querySelectorAll("[data-led]");
    expect(Array.from(dots).map((d) => d.getAttribute("data-tone"))).toEqual(["latent", "armed", "latent"]);
  });

  it("WR-08 — 계좌가 둘이면 **두 계좌 모두**에서 이름을 얻는다 (마지막 수신 계좌 하나가 아니다)", () => {
    setupReady();
    render(<AppSidebar />);

    expect(screen.getByRole("link", { name: /에코프로머티리얼즈우선주/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /이수페타시스/ })).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(CHASER_A.isin))).toBeNull();
    expect(screen.queryByText(new RegExp(CHASER_B.isin))).toBeNull();
  });

  it("partial — 이름 폴백: 전략의 `name` → 계좌 역매핑 이름 → `code` → ISIN (E16)", () => {
    const named = makeChaser({ isin: "KR7000001111", name: "와이어이름", code: "000111" });
    const coded = makeChaser({ isin: "KR7000002222", code: "000222" });
    const bare = makeChaser({ isin: "KR7000003333" });
    setupReady({ accountStates: new Map(), limitChasers: [named, coded, bare] });
    render(<AppSidebar />);

    expect(screen.getByRole("link", { name: /와이어이름/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^000222/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^KR7000003333/ })).toBeInTheDocument();
  });

  it("GC-IN-04 · D-03 — NXT 전략 이름은 「{종목명} · NXT」, KRX 전략은 이름만 · data-strategy-key · 링크 불변", () => {
    setupReady();
    render(<AppSidebar />);

    const nxt = screen.getByRole("link", { name: /이수페타시스/ });
    const nxtName = nxt.querySelector("span[title]")!;
    expect(nxtName.textContent).toBe("이수페타시스 · NXT");
    expect(nxtName).toHaveAttribute("title", "이수페타시스 · NXT");
    expect(nxt).toHaveAttribute("data-strategy-key", CHASER_B.key);
    expect(nxt).toHaveAttribute("href", `/trading?focus=${encodeURIComponent(CHASER_B.key)}`);
    expect(within(nxt).getByRole("img")).toHaveAttribute("aria-label", strategyLedLabel(CHASER_B));

    const krx = screen.getByRole("link", { name: /에코프로머티리얼즈우선주/ });
    expect(krx.querySelector("span[title]")!.textContent).toBe("에코프로머티리얼즈우선주");
    expect(krx).toHaveAttribute("data-strategy-key", CHASER_A.key);
  });

  it("GC-IN-04 — 이름 폴백 체인(ISIN 까지) 뒤에 꼬리가 붙는다 — ISIN 폴백이어도 NXT 면 꼬리", () => {
    const bareNxt = makeChaser({ isin: "KR7000004444", exchange: "NXT" });
    const codedNxt = makeChaser({ isin: "KR7000005555", code: "000555", exchange: "NXT" });
    setupReady({ accountStates: new Map(), limitChasers: [bareNxt, codedNxt] });
    render(<AppSidebar />);

    expect(screen.getByRole("link", { name: /^KR7000004444 · NXT/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^000555 · NXT/ })).toBeInTheDocument();
  });

  it("long-text — 종목명은 1줄 ellipsis 이고 전체는 `title` 에 담긴다", () => {
    setupReady();
    render(<AppSidebar />);

    const nameEl = within(screen.getByRole("link", { name: /에코프로머티리얼즈우선주/ })).getByText(
      "에코프로머티리얼즈우선주",
    );
    expect(nameEl.className).toContain("truncate");
    expect(nameEl.className).toContain("min-w-0");
    expect(nameEl).toHaveAttribute("title", "에코프로머티리얼즈우선주");
  });

  it("전략 항목 클릭은 작업대에 포커스 요청을 보낸다 — 이미 `/trading` 위여도 카드가 펼쳐진다", () => {
    setupReady();
    render(<AppSidebar />);
    const seen: string[] = [];
    const onFocus = (e: Event) => seen.push((e as CustomEvent<string>).detail);
    window.addEventListener(TRADING_FOCUS_EVENT, onFocus);
    try {
      const a = screen.getByRole("link", { name: /에코프로머티리얼즈우선주/ });
      // jsdom 은 문서 이동을 구현하지 않는다 — 대상 단계에서 이동만 막는다.
      a.addEventListener("click", (e) => e.preventDefault(), { once: true });
      fireEvent.click(a);
      expect(seen).toEqual([CHASER_A.key]);

      // 새 탭 열기(수식 키)는 지금 탭의 카드를 건드리지 않는다.
      a.addEventListener("click", (e) => e.preventDefault(), { once: true });
      fireEvent.click(a, { metaKey: true });
      expect(seen).toEqual([CHASER_A.key]);
    } finally {
      window.removeEventListener(TRADING_FOCUS_EVENT, onFocus);
    }
  });

  it("전략 항목은 활성 표시를 받지 않는다 — `/trading` 의 활성은 제목 하나다", () => {
    mockPathname = "/trading";
    setupReady();
    render(<AppSidebar />);
    expect(screen.getByRole("link", { name: /에코프로머티리얼즈우선주/ })).not.toHaveAttribute("aria-current");
  });
});

describe("AppSidebar — 활성 표시 · drawer 계약", () => {
  it("기존 정확 일치 동작이 유지된다 — `/scanner` 하위 경로는 「검색」도 「홈」도 켜지 않는다", () => {
    mockPathname = "/scanner/detail";
    setupReady();
    render(<AppSidebar />);

    expect(screen.getByRole("link", { name: "검색" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "홈" })).not.toHaveAttribute("aria-current");
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

// ---------------------------------------------------------------------------

describe("AppSidebar — 하단 줄 (테마 토글의 새 집)", () => {
  /**
   * 토글이 탑바에서 사이드바 하단으로 이사했다(quick 260911-tuk). 그래서 **여기 없으면
   * 사이드바가 있는 화면에는 토글이 아예 없다** — 그 사실을 이 파일이 잠근다.
   * `UserSection` 은 파일 상단에서 모킹돼 있으므로 보이는 것은 그 자리표시자다.
   */
  it("⑧ 유저 섹션과 테마 토글이 같은 줄에 나란히 있다", () => {
    setupReady();
    render(<AppSidebar />);

    const toggle = screen.getByRole("button", { name: /모드로 전환$/ });
    const userSection = screen.getByTestId("user-section");

    // 같은 래퍼의 자식 둘 — 하나가 다른 하나를 감싸면 레이아웃이 어긋난다.
    const row = toggle.parentElement;
    expect(row).not.toBeNull();
    expect(row).toContainElement(userSection);
    expect(row?.className).toContain("items-center");

    // 유저 섹션만 늘어난다(`w-full` 트리거가 토글을 밀어내지 않게) — 토글은 shrink-0.
    expect(userSection.parentElement?.className).toContain("flex-1");
    expect(toggle.className).toContain("shrink-0");
  });

  it("⑧-b 비로그인 사이드바에도 토글은 있다", () => {
    // 실제 `UserSection` 은 `user == null` 이면 `null` 을 돌려주지만 이 파일은 그것을
    // 모킹한다(트리 계약과 무관한 표면이라서). 그래서 여기서 잠그는 것은 「유저 섹션이
    // 사라져도 토글이 남는다」가 아니라 **토글이 로그인 여부와 무관하게 렌더된다**이다 —
    // 없는 검증을 이름으로 지어내지 않는다.
    mockAuth = guest();
    render(<AppSidebar />);

    expect(screen.getByRole("button", { name: /모드로 전환$/ })).toBeInTheDocument();
  });
});
