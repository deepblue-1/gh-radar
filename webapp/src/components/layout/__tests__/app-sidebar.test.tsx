import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

import type { RelayAccount, RelayLimitChaser, RelayViTrigger } from "@gh-radar/shared";

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
 *  ⑨ 레일(quick-260930-e30 D1) — 접힘에서만 `title` 툴팁 · 트레이딩 켜진 전략 수 배지(0 이면 없음).
 *     펼침에서는 배지·title 이 DOM 에 없다(「트레이딩」 전체 일치 이름 조회 보존)
 *  ⑩ Admin 그룹(Phase 29 D-13) — `useAppRole() === "admin"` 일 때만 · 「분석」 뒤 · My page 앞 · 하위 사용자 · 서버
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

// Phase 29 D-13 — Admin 그룹 노출은 `useAppRole()`(RPC my_app_access) 하나가 정한다. 기본은 null(Admin 없음).
let mockRole: "admin" | "trader" | "viewer" | null | undefined = null;
vi.mock("@/hooks/use-app-role", () => ({
  useAppRole: () => mockRole,
}));

// UserSection 은 Radix Popover + Supabase 세션 표면이라 트리 계약과 무관하다.
vi.mock("../user-section", () => ({
  UserSection: () => <div data-testid="user-section" />,
}));

import { EMPTY_RELAY_VALUE } from "@/lib/relay-provider";
import { TRADING_ACCOUNT_EVENT, TRADING_FOCUS_EVENT } from "@/lib/trading-focus";

import { AppSidebar, sidebarGroupsOf, strategyLedLabel } from "../app-sidebar";
import { SIDEBAR_COLLAPSED_KEY, setSidebarCollapsed } from "@/lib/sidebar-collapse";
import { LC_BUY3_ECHO_DEFAULTS } from "@/test-fixtures/limit-chaser";

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

/** VI (계좌, 거래소) 슬롯 Map — 키 `${accountNo}|${exchange}`(리듀서와 같은 키 · Phase 32 D-17). 넣은 순서 = 수신 순. */
function viSlotsOf(...cfgs: RelayViTrigger[]): RelayShape["viSlots"] {
  return new Map(cfgs.map((c) => [`${c.accountNo}|${c.exchange}`, c] as const));
}

/** 미등록 슬롯(`null`)까지 섞어 만든다 — `[계좌, 거래소, cfg|null]`. */
function viSlotsRaw(...entries: [string, "KRX" | "NXT", RelayViTrigger | null][]): RelayShape["viSlots"] {
  return new Map(entries.map(([a, x, cfg]) => [`${a}|${x}`, cfg] as const));
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
  mockRole = null;
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
    // 공개 항목은 홈 · 검색뿐 — 「AI 애널리스트」 는 분석 하위(트레이딩 권한자 전용 · quick-261005-vk1 D-01).
    expect(screen.getByRole("link", { name: "홈" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "검색" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "AI 애널리스트" })).toBeNull();
  });

  it("③-b status=unauthorized 면 로그인 상태여도 미렌더", () => {
    mockAuth = authed();
    mockRelay = relayState({ status: "unauthorized", limitChasers: [CHASER_A] });
    render(<AppSidebar />);

    expect(screen.queryByText("트레이딩")).toBeNull();
    expect(screen.queryByRole("link", { name: "My page" })).toBeNull();
    expect(screen.queryByRole("link", { name: "AI 애널리스트" })).toBeNull();
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
    setupReady({ viSlots: viSlotsOf(viCfg("KRX", { run: true })) });
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

  it("④ VI 줄은 그 계좌 작업대(`/trading?account=`)로 가고 활성 표시를 받지 않는다 — 활성은 제목 하나", () => {
    mockPathname = "/trading";
    setupReady({ viSlots: viSlotsOf(viCfg("KRX", { run: true })) });
    render(<AppSidebar />);

    const a = screen.getByRole("link", { name: "VI — KRX 가동" });
    // Phase 32 D-18 — 그 계좌 작업대로(`?account=`).
    expect(a).toHaveAttribute("href", "/trading?account=37728502101");
    expect(a).not.toHaveAttribute("aria-current");
    expect(a).toHaveAttribute("data-sidebar-item", "vi");
    expect(viTagExchanges()).toEqual(["KRX"]);
  });

  it("⑤ NXT 만 가동 → 태그는 NXT 하나 · 이름 「VI — NXT 가동」 (합집합이 아니라 거래소별)", () => {
    setupReady({
      viSlots: viSlotsOf(viCfg("KRX", { run: false }), viCfg("NXT", { run: true })),
    });
    render(<AppSidebar />);

    expect(viLinks()).toHaveLength(1);
    expect(viTagExchanges()).toEqual(["NXT"]);
    expect(screen.getByRole("link", { name: "VI — NXT 가동" })).toBeInTheDocument();
  });

  it("⑤ 둘 다 가동 → KRX · NXT 순 태그(객체 키를 NXT 먼저 넣어도) · 이름 「VI — KRX·NXT 가동」", () => {
    setupReady({
      viSlots: viSlotsOf(viCfg("NXT", { run: true }), viCfg("KRX", { run: true })),
    });
    render(<AppSidebar />);

    expect(viTagExchanges()).toEqual(["KRX", "NXT"]);
    expect(screen.getByRole("link", { name: "VI — KRX·NXT 가동" })).toBeInTheDocument();
  });

  it("⑤ 둘 다 중지 · 미등록(null) · 모름(키 부재) → VI 줄이 DOM 에 없다(미렌더) · 전략은 그대로", () => {
    const cases: RelayShape["viSlots"][] = [
      viSlotsOf(viCfg("KRX", { run: false }), viCfg("NXT", { run: false })),
      viSlotsRaw(["37728502101", "KRX", null], ["37728502101", "NXT", null]),
      new Map(),
      viSlotsRaw(["37728502101", "KRX", null]),
    ];
    for (const viSlots of cases) {
      setupReady({ viSlots });
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

  it("⑤ relay vi.slot.clear 뒤(그 키 없는 Map) — KRX 만 가동이던 VI 줄은 사라지고, 둘 다 가동 중 KRX 만 지우면 「VI — NXT 가동」 만 (IN-04)", () => {
    setupReady({ viSlots: viSlotsOf(viCfg("KRX", { run: true })) });
    const view = render(<AppSidebar />);
    expect(screen.getByRole("link", { name: "VI — KRX 가동" })).toBeInTheDocument();

    setupReady({ viSlots: new Map() });
    view.rerender(<AppSidebar />);
    expect(screen.queryByRole("link", { name: /VI/ })).toBeNull();
    view.unmount();

    const both = viSlotsOf(viCfg("KRX", { run: true }), viCfg("NXT", { run: true }));
    setupReady({ viSlots: both });
    const view2 = render(<AppSidebar />);
    expect(screen.getByRole("link", { name: "VI — KRX·NXT 가동" })).toBeInTheDocument();

    const cleared = new Map(both);
    cleared.delete("37728502101|KRX");
    setupReady({ viSlots: cleared });
    view2.rerender(<AppSidebar />);
    expect(viTagExchanges()).toEqual(["NXT"]);
    expect(screen.getByRole("link", { name: "VI — NXT 가동" })).toBeInTheDocument();
  });

  it("⑤ VI 줄 텍스트는 「VI」 + 태그 글자뿐 — 옛 「가동」 배지 글자 · strategy-badge 슬롯이 없다", () => {
    setupReady({
      viSlots: viSlotsOf(viCfg("KRX", { run: true }), viCfg("NXT", { run: true })),
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
    // 제목 다음 형제는 곧바로 「분석」 그룹 제목이다(Phase 28 D-09 — 트레이딩 그룹 다음).
    expect(title.closest("li")?.nextElementSibling?.querySelector("a")).toHaveAttribute("href", "/analytics/limitup");
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
    setupReady({ limitChasers: [], viSlots: viSlotsOf(viCfg("KRX", { run: true })) });
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

  it("LED 3점은 잠복(대기)·래치(감시)·매수 보유중을 구분한다 (Phase 24 D-12)", () => {
    const latent = makeChaser({
      isin: "KR7000660001",
      buyEnabled: true,
      // 매수는 래치가 없다 — 후매수 보유중(단계 2)이 주황이다.
      postBuyPhase: 2,
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

// ---------------------------------------------------------------------------
// Phase 32 D-02 · UI-SPEC S3 — 「트레이딩」 3단 = 계좌 묶음 트리
// ---------------------------------------------------------------------------

/** 두 계좌 — CHASER_A 는 계좌 A, CHASER_B 는 계좌 B 의 전략이다. */
const ACCT_A: RelayAccount = { accountNo: "37728502101", name: "김알렉스", serverKey: "KB120" };
const ACCT_B: RelayAccount = { accountNo: "37728502102", name: "교보 종합", serverKey: "KYOBO119" };

/** 3단 목록 안 계좌 묶음들. */
const accountGroups = () =>
  Array.from(document.querySelectorAll('nav [data-slot="sidebar-account-group"]')) as HTMLElement[];
/** 묶음의 소제목. */
const headingOf = (group: Element) =>
  group.querySelector('[data-slot="sidebar-account-heading"]') as HTMLElement;
/** 묶음 안 전략 키(순서대로). */
const strategyKeysOf = (group: Element) =>
  Array.from(group.querySelectorAll("a[data-strategy-key]")).map((a) => a.getAttribute("data-strategy-key"));

describe("P32 사이드바 계좌 묶음 (D-02 · S3)", () => {
  it("sidebarGroupsOf — `accounts[]` 순으로 묶고 묶음 안 전략은 받은 순서 그대로", () => {
    const a2 = makeChaser({ isin: "KR7000001111", accountNo: ACCT_A.accountNo });
    // accounts[] = B → A 순. 전략은 A · B · A 순으로 섞여 와도 묶음은 accounts[] 순이다.
    const groups = sidebarGroupsOf([ACCT_B, ACCT_A], [CHASER_A, CHASER_B, a2], new Map());
    expect(groups.map((g) => g.accountNo)).toEqual([ACCT_B.accountNo, ACCT_A.accountNo]);
    expect(groups[0]!.account).toBe(ACCT_B);
    expect(groups[0]!.chasers).toEqual([CHASER_B]);
    expect(groups[1]!.chasers).toEqual([CHASER_A, a2]);
    expect(groups.every((g) => g.viRunning.length === 0)).toBe(true);
  });

  it("sidebarGroupsOf — 목록 밖 계좌는 처음 본 순서로 맨 뒤 · `account` 없음", () => {
    const x = makeChaser({ isin: "KR7000001111", accountNo: "99990000001" });
    const y = makeChaser({ isin: "KR7000002222", accountNo: "99990000002" });
    const x2 = makeChaser({ isin: "KR7000003333", accountNo: "99990000001" });
    const groups = sidebarGroupsOf([ACCT_A, ACCT_B], [x, CHASER_A, y, x2], new Map());
    expect(groups.map((g) => g.accountNo)).toEqual([ACCT_A.accountNo, "99990000001", "99990000002"]);
    expect(groups[1]!.account).toBeUndefined();
    expect(groups[1]!.chasers).toEqual([x, x2]);
    expect(groups[2]!.account).toBeUndefined();
  });

  it("sidebarGroupsOf — 켜진 전략도 가동 VI 도 없는 계좌는 묶음이 없다 · 전부 없으면 빈 배열", () => {
    expect(sidebarGroupsOf([ACCT_A, ACCT_B], [CHASER_A], new Map()).map((g) => g.accountNo)).toEqual([ACCT_A.accountNo]);
    expect(sidebarGroupsOf([ACCT_A, ACCT_B], [], new Map())).toEqual([]);
    expect(
      sidebarGroupsOf([ACCT_A], [], viSlotsRaw([ACCT_A.accountNo, "KRX", viCfg("KRX", { run: false })], [ACCT_A.accountNo, "NXT", null])),
    ).toEqual([]);
  });

  it("sidebarGroupsOf — `accounts[]` 미수신(빈 목록)이면 전략 계좌가 전부 목록 밖 묶음 · 수신 뒤 accounts[] 순", () => {
    const before = sidebarGroupsOf([], [CHASER_B, CHASER_A], new Map());
    expect(before.map((g) => [g.accountNo, g.account])).toEqual([
      [ACCT_B.accountNo, undefined],
      [ACCT_A.accountNo, undefined],
    ]);
    const after = sidebarGroupsOf([ACCT_A, ACCT_B], [CHASER_B, CHASER_A], new Map());
    expect(after.map((g) => g.account)).toEqual([ACCT_A, ACCT_B]);
  });

  it("렌더 — 묶음 2개 · 소제목 = 짧은 라벨(상품명) + 서버키 칩 · 묶음 안 그 계좌 전략 줄 · title = 전체 라벨", () => {
    setupReady({ accounts: [ACCT_A, ACCT_B] });
    render(<AppSidebar />);

    const groups = accountGroups();
    expect(groups).toHaveLength(2);
    // 묶음은 3단 목록(SUB_LIST) 안에 선다.
    expect(tradingSubList()!.contains(groups[0]!)).toBe(true);

    const [ha, hb] = groups.map(headingOf);
    expect(ha!.querySelector("span")!.textContent).toBe("김알렉스");
    expect(ha!.querySelector('[data-slot="sidebar-account-server"]')!.textContent).toBe("KB120");
    expect(ha).toHaveAttribute("title", "37728502101 · 김알렉스 · KB120");
    expect(hb!.querySelector("span")!.textContent).toBe("교보 종합");
    expect(hb!.querySelector('[data-slot="sidebar-account-server"]')!.textContent).toBe("KYOBO119");
    expect(hb).toHaveAttribute("title", "37728502102 · 교보 종합 · KYOBO119");

    expect(strategyKeysOf(groups[0]!)).toEqual([CHASER_A.key]);
    expect(strategyKeysOf(groups[1]!)).toEqual([CHASER_B.key]);
    // 소제목은 링크 · 버튼이 아니다(포커스 대상 아님 · drawer 자동 닫힘 규율).
    expect(ha!.closest("a, button")).toBeNull();
    expect(ha!.querySelector("a, button")).toBeNull();
    expect(ha).not.toHaveAttribute("tabindex");
  });

  it("접근성 — 묶음 안 `ul` 의 `aria-labelledby` = 소제목 id · 목록 이름 「김알렉스 KB120」", () => {
    setupReady({ accounts: [ACCT_A, ACCT_B] });
    render(<AppSidebar />);

    for (const group of accountGroups()) {
      const heading = headingOf(group);
      const list = group.querySelector("ul")!;
      expect(heading.id).not.toBe("");
      expect(list).toHaveAttribute("aria-labelledby", heading.id);
    }
    expect(screen.getByRole("list", { name: "김알렉스 KB120" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "교보 종합 KYOBO119" })).toBeInTheDocument();
  });

  it("zero-one-many — 묶음 1개여도 소제목을 그린다(계좌 표시가 목적)", () => {
    setupReady({ accounts: [ACCT_A, ACCT_B], limitChasers: [CHASER_A] });
    render(<AppSidebar />);

    const groups = accountGroups();
    expect(groups).toHaveLength(1);
    expect(headingOf(groups[0]!).querySelector("span")!.textContent).toBe("김알렉스");
  });

  it("같은 상품명 · 같은 서버키 두 묶음 → 둘 다 번호(mono)로 대신 · 서버키가 다르면 상품명", () => {
    const twinA = { ...ACCT_A, name: "위탁종합" };
    const twinB = { ...ACCT_B, name: "위탁종합", serverKey: "KB120" };
    setupReady({ accounts: [twinA, twinB] });
    const view = render(<AppSidebar />);

    let names = accountGroups().map((g) => headingOf(g).querySelector("span")!);
    expect(names.map((n) => n.textContent)).toEqual([ACCT_A.accountNo, ACCT_B.accountNo]);
    for (const n of names) expect(n.className).toContain("mono");
    view.unmount();

    setupReady({ accounts: [twinA, { ...twinB, serverKey: "KYOBO119" }] });
    render(<AppSidebar />);
    names = accountGroups().map((g) => headingOf(g).querySelector("span")!);
    expect(names.map((n) => n.textContent)).toEqual(["위탁종합", "위탁종합"]);
    for (const n of names) expect(n.className).not.toContain("mono");
  });

  it("서버키 없는 계좌 = 칩 없음 · 상품명 빈 계좌 = 번호(mono)", () => {
    setupReady({
      accounts: [
        { accountNo: ACCT_A.accountNo, name: "김알렉스" },
        { accountNo: ACCT_B.accountNo, name: "", serverKey: "KYOBO119" },
      ],
    });
    render(<AppSidebar />);

    const [ga, gb] = accountGroups();
    expect(ga!.querySelector('[data-slot="sidebar-account-server"]')).toBeNull();
    expect(headingOf(ga!)).toHaveAttribute("title", "37728502101 · 김알렉스");
    const nb = headingOf(gb!).querySelector("span")!;
    expect(nb.textContent).toBe(ACCT_B.accountNo);
    expect(nb.className).toContain("mono");
    expect(gb!.querySelector('[data-slot="sidebar-account-server"]')!.textContent).toBe("KYOBO119");
  });

  it("long-text — 소제목 이름 `min-w-0 truncate` · 서버키 칩 `whitespace-nowrap shrink-0` 오른쪽 끝", () => {
    const longA = { ...ACCT_A, accountNo: "1234-5678-90", name: "종합매매(위탁) 김알렉스", serverKey: "KYOBO127" };
    setupReady({
      accounts: [longA],
      limitChasers: [makeChaser({ isin: CHASER_A.isin, accountNo: longA.accountNo })],
    });
    render(<AppSidebar />);

    const heading = headingOf(accountGroups()[0]!);
    const name = heading.querySelector("span")!;
    expect(name.className).toContain("min-w-0");
    expect(name.className).toContain("truncate");
    expect(heading).toHaveAttribute("title", "1234-5678-90 · 종합매매(위탁) 김알렉스 · KYOBO127");
    const chip = heading.querySelector('[data-slot="sidebar-account-server"]')!;
    expect(chip.className).toContain("whitespace-nowrap");
    expect(chip.className).toContain("shrink-0");
    expect(chip.className).toContain("ml-auto");
    expect(heading.className).toContain("min-w-0");
  });

  it("「트레이딩」 레일 배지 = 켜진 전략 전 계좌 합(불변)", () => {
    setSidebarCollapsed(true);
    try {
      setupReady({ accounts: [ACCT_A, ACCT_B] });
      render(<AppSidebar />);
      const badge = screen.getByRole("link", { name: /^트레이딩/ }).querySelector('[data-slot="rail-badge"]');
      expect(badge?.textContent).toContain("켜진 전략 2개");
    } finally {
      act(() => setSidebarCollapsed(false));
      window.localStorage.removeItem(SIDEBAR_COLLAPSED_KEY);
    }
  });
});

/** 묶음 안 링크 종류 순서(`vi` · `strategy`). */
const itemKindsOf = (group: Element) =>
  Array.from(group.querySelectorAll("a[data-sidebar-item]")).map((a) => a.getAttribute("data-sidebar-item"));

describe("P32 사이드바 VI 줄 · 목록 밖 (D-02 · S3)", () => {
  it("VI KRX · NXT 가 둘 다 A 계좌 → A 묶음에 VI 한 줄(KRX · NXT 태그) · 소제목 → VI → 전략 순 · B 묶음은 VI 없음", () => {
    setupReady({
      accounts: [ACCT_A, ACCT_B],
      viSlots: viSlotsOf(viCfg("KRX", { run: true }), viCfg("NXT", { run: true })),
    });
    render(<AppSidebar />);

    const [ga, gb] = accountGroups();
    expect(itemKindsOf(ga!)).toEqual(["vi", "strategy"]);
    expect(itemKindsOf(gb!)).toEqual(["strategy"]);
    expect(viLinks()).toHaveLength(1);
    const vi = ga!.querySelector('a[data-sidebar-item="vi"]')!;
    expect(Array.from(vi.querySelectorAll('[data-slot="exchange-tag"]')).map((e) => e.getAttribute("data-exchange"))).toEqual([
      "KRX",
      "NXT",
    ]);
    expect(within(ga as HTMLElement).getByRole("link", { name: "VI — KRX·NXT 가동" })).toBe(vi);
    // VI 줄은 묶음 목록(aria-labelledby) 안이다 — 소제목 다음.
    expect(ga!.querySelector("ul")!.contains(vi)).toBe(true);
  });

  it("VI KRX 는 A · NXT 는 B 계좌 → A 묶음 「VI — KRX 가동」 · B 묶음 「VI — NXT 가동」 (태그는 그 묶음 거래소만)", () => {
    setupReady({
      accounts: [ACCT_A, ACCT_B],
      viSlots: viSlotsOf(viCfg("KRX", { run: true }), viCfg("NXT", { run: true, accountNo: ACCT_B.accountNo })),
    });
    render(<AppSidebar />);

    const [ga, gb] = accountGroups();
    expect(viLinks()).toHaveLength(2);
    expect(within(ga!).getByRole("link", { name: "VI — KRX 가동" })).toBeInTheDocument();
    expect(within(gb!).getByRole("link", { name: "VI — NXT 가동" })).toBeInTheDocument();
    expect(within(ga!).queryByRole("link", { name: /NXT 가동/ })).toBeNull();
    expect(itemKindsOf(gb!)).toEqual(["vi", "strategy"]);
  });

  it("VI 만 가동이고 켜진 전략 0 인 계좌 → 그 묶음이 선다(소제목 + VI 줄만)", () => {
    setupReady({
      accounts: [ACCT_A, ACCT_B],
      limitChasers: [CHASER_A],
      viSlots: viSlotsOf(viCfg("NXT", { run: true, accountNo: ACCT_B.accountNo })),
    });
    render(<AppSidebar />);

    const groups = accountGroups();
    expect(groups.map((g) => g.getAttribute("data-account-no"))).toEqual([ACCT_A.accountNo, ACCT_B.accountNo]);
    expect(headingOf(groups[1]!).querySelector("span")!.textContent).toBe("교보 종합");
    expect(itemKindsOf(groups[1]!)).toEqual(["vi"]);
    expect(itemKindsOf(groups[0]!)).toEqual(["strategy"]);
  });

  it("켜진 전략의 계좌가 `accounts[]` 에 없음 → 맨 뒤 번호(mono) 소제목 · 칩 없음 · `accounts[]` 가 비었을 때도 같은 모양", () => {
    const outside = makeChaser({ isin: "KR7000001111", accountNo: "99990000001" });
    setupReady({ accounts: [ACCT_A, ACCT_B], limitChasers: [outside, CHASER_A, CHASER_B] });
    const view = render(<AppSidebar />);

    let groups = accountGroups();
    expect(groups.map((g) => g.getAttribute("data-account-no"))).toEqual([
      ACCT_A.accountNo,
      ACCT_B.accountNo,
      "99990000001",
    ]);
    const last = headingOf(groups[2]!);
    expect(last.querySelector("span")!.textContent).toBe("99990000001");
    expect(last.querySelector("span")!.className).toContain("mono");
    expect(last).toHaveAttribute("title", "99990000001");
    expect(groups[2]!.querySelector('[data-slot="sidebar-account-server"]')).toBeNull();
    expect(strategyKeysOf(groups[2]!)).toEqual([outside.key]);
    view.unmount();

    // loading — accounts[] 미수신: 전 묶음이 번호 소제목 · 칩 없음(수신 뒤 제자리).
    setupReady({ accounts: [], limitChasers: [CHASER_A, CHASER_B] });
    render(<AppSidebar />);
    groups = accountGroups();
    expect(groups.map((g) => headingOf(g).querySelector("span")!.textContent)).toEqual([
      ACCT_A.accountNo,
      ACCT_B.accountNo,
    ]);
    for (const g of groups) {
      expect(headingOf(g).querySelector("span")!.className).toContain("mono");
      expect(g.querySelector('[data-slot="sidebar-account-server"]')).toBeNull();
    }
  });

  it("모든 묶음이 비면(켜진 전략 0 · 가동 VI 0) 3단 목록(`ul`) · 소제목이 없다", () => {
    setupReady({
      accounts: [ACCT_A, ACCT_B],
      limitChasers: [makeChaser({ buyEnabled: false, sellEnabled: false })],
      viSlots: viSlotsRaw(["37728502101", "KRX", viCfg("KRX", { run: false })], ["37728502101", "NXT", null]),
    });
    render(<AppSidebar />);

    expect(tradingSubList()).toBeNull();
    expect(accountGroups()).toHaveLength(0);
    expect(document.querySelector('[data-slot="sidebar-account-heading"]')).toBeNull();
  });
});

describe("P32 VI 슬롯 표면 (D-18) — 사이드바", () => {
  /** 교보 세션 계좌 C — 슬롯 원천은 모든 결선 세션(KB 한정 해제 · 32-11). */
  const ACCT_C: RelayAccount = { accountNo: "37728502103", name: "교보 위탁", serverKey: "KYOBO127" };

  it("A KRX 가동 · C(교보) KRX 가동 → A 묶음 「VI — KRX 가동」 · C 묶음 「VI — KRX 가동」 둘 다 · 가동 없는 B 묶음엔 VI 줄 없음", () => {
    setupReady({
      accounts: [ACCT_A, ACCT_B, ACCT_C],
      viSlots: viSlotsRaw(
        [ACCT_A.accountNo, "KRX", viCfg("KRX", { run: true })],
        [ACCT_B.accountNo, "KRX", viCfg("KRX", { run: false, accountNo: ACCT_B.accountNo })],
        [ACCT_B.accountNo, "NXT", null],
        [ACCT_C.accountNo, "KRX", viCfg("KRX", { run: true, accountNo: ACCT_C.accountNo })],
      ),
    });
    render(<AppSidebar />);

    const groups = accountGroups();
    expect(groups.map((g) => g.getAttribute("data-account-no"))).toEqual([
      ACCT_A.accountNo,
      ACCT_B.accountNo,
      ACCT_C.accountNo,
    ]);
    expect(viLinks()).toHaveLength(2);
    expect(within(groups[0]!).getByRole("link", { name: "VI — KRX 가동" })).toBeInTheDocument();
    expect(within(groups[2]!).getByRole("link", { name: "VI — KRX 가동" })).toBeInTheDocument();
    expect(groups[1]!.querySelector('a[data-sidebar-item="vi"]')).toBeNull();
    expect(itemKindsOf(groups[2]!)).toEqual(["vi"]);
  });

  it("sidebarGroupsOf — 같은 계좌 KRX · NXT 가동은 KRX → NXT 태그(수신 순 무관) · 미등록 · 중지 슬롯만 있는 계좌는 묶음 없음", () => {
    const groups = sidebarGroupsOf(
      [ACCT_A, ACCT_B],
      [],
      viSlotsRaw(
        [ACCT_A.accountNo, "NXT", viCfg("NXT", { run: true })],
        [ACCT_A.accountNo, "KRX", viCfg("KRX", { run: true })],
        [ACCT_B.accountNo, "KRX", null],
      ),
    );
    expect(groups.map((g) => [g.accountNo, g.viRunning])).toEqual([[ACCT_A.accountNo, ["KRX", "NXT"]]]);
  });

  it("VI 줄 클릭 → 링크 `/trading?account=C` + 계좌 전환 요청(C) · 수식 키 클릭은 요청하지 않는다", () => {
    setupReady({
      accounts: [ACCT_A, ACCT_C],
      viSlots: viSlotsOf(viCfg("NXT", { run: true, accountNo: ACCT_C.accountNo })),
    });
    render(<AppSidebar />);
    const seen: string[] = [];
    const onAccount = (e: Event) => seen.push((e as CustomEvent<string>).detail);
    window.addEventListener(TRADING_ACCOUNT_EVENT, onAccount);
    try {
      const groupC = accountGroups().find((g) => g.getAttribute("data-account-no") === ACCT_C.accountNo)!;
      const a = within(groupC).getByRole("link", { name: "VI — NXT 가동" });
      expect(a).toHaveAttribute("href", `/trading?account=${ACCT_C.accountNo}`);
      a.addEventListener("click", (e) => e.preventDefault(), { once: true });
      fireEvent.click(a);
      expect(seen).toEqual([ACCT_C.accountNo]);

      // 새 탭 열기(수식 키)는 지금 탭의 작업대 계좌를 건드리지 않는다.
      a.addEventListener("click", (e) => e.preventDefault(), { once: true });
      fireEvent.click(a, { ctrlKey: true });
      expect(seen).toEqual([ACCT_C.accountNo]);
    } finally {
      window.removeEventListener(TRADING_ACCOUNT_EVENT, onAccount);
    }
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

describe("AppSidebar — 레일(quick-260930-e30 D1)", () => {
  /** 꺼진 전략 — 매수·매도·취소잔량·매수후자동 모두 off(`isActiveStrategy` false). */
  const CHASER_OFF = makeChaser({
    isin: "KR7000660001",
    accountNo: "37728502103",
    exchange: "KRX",
    buyEnabled: false,
    sellEnabled: false,
    cancelQtyEnabled: false,
    postBuyAuto: false,
  });

  afterEach(() => {
    act(() => setSidebarCollapsed(false));
    window.localStorage.removeItem(SIDEBAR_COLLAPSED_KEY);
  });

  it("⑨ 접힘 + 켜진 전략 2 · 꺼진 전략 1 → 트레이딩 배지 「2」 · title 툴팁", () => {
    setSidebarCollapsed(true);
    setupReady({ limitChasers: [CHASER_A, CHASER_B, CHASER_OFF] });
    render(<AppSidebar />);

    const trading = screen.getByRole("link", { name: /^트레이딩/ });
    expect(trading).toHaveAttribute("title", "트레이딩");
    const badge = trading.querySelector('[data-slot="rail-badge"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain("2");
    expect(badge?.textContent).toContain("켜진 전략 2개");
    expect(screen.getByRole("link", { name: "홈" })).toHaveAttribute("title", "홈");
  });

  it("⑨ 접힘 + 켜진 전략 0 → 배지 없음", () => {
    setSidebarCollapsed(true);
    setupReady({ limitChasers: [CHASER_OFF] });
    render(<AppSidebar />);

    expect(document.querySelector('[data-slot="rail-badge"]')).toBeNull();
    expect(screen.getByRole("link", { name: "트레이딩" })).toHaveAttribute("title", "트레이딩");
  });

  it("⑨ 펼침(기본) → 배지 없음 · title 없음 · 「트레이딩」 전체 일치 조회가 그대로 된다", () => {
    setupReady({ limitChasers: [CHASER_A, CHASER_B, CHASER_OFF] });
    render(<AppSidebar />);

    expect(document.querySelector('[data-slot="rail-badge"]')).toBeNull();
    const trading = screen.getByRole("link", { name: "트레이딩" });
    expect(trading).not.toHaveAttribute("title");
    expect(screen.getByRole("link", { name: "홈" })).not.toHaveAttribute("title");
  });

  it("⑨ 펼침 → 접힘 전환이 렌더에 반영된다(구독)", () => {
    setupReady({ limitChasers: [CHASER_A] });
    render(<AppSidebar />);
    expect(document.querySelector('[data-slot="rail-badge"]')).toBeNull();

    act(() => setSidebarCollapsed(true));
    expect(document.querySelector('[data-slot="rail-badge"]')?.textContent).toContain("켜진 전략 1개");
  });
});

// ---------------------------------------------------------------------------

describe("AppSidebar — 「분석 › 상한가 보고서」 (Phase 28 D-09 · D-10 · R-7)", () => {
  afterEach(() => {
    act(() => setSidebarCollapsed(false));
    window.localStorage.removeItem(SIDEBAR_COLLAPSED_KEY);
  });

  const analytics = () => screen.queryByRole("link", { name: "분석" });
  const report = () => screen.queryByRole("link", { name: "상한가 보고서" });

  it("tradingVisible 거짓(비로그인 · unauthorized · 판정 전) → 「분석」 그룹 미렌더", () => {
    mockAuth = guest();
    mockRelay = relayState({ status: "ready" });
    const a = render(<AppSidebar />);
    expect(screen.queryByText("분석")).toBeNull();
    expect(report()).toBeNull();
    a.unmount();

    mockAuth = authed();
    mockRelay = relayState({ status: "unauthorized" });
    const b = render(<AppSidebar />);
    expect(screen.queryByText("분석")).toBeNull();
    b.unmount();

    mockRelay = relayState({ status: "connecting" });
    render(<AppSidebar />);
    expect(screen.queryByText("분석")).toBeNull();
    expect(screen.queryByText("상한가 보고서")).toBeNull();
  });

  it("tradingVisible 참 → 트레이딩 그룹(제목 + 3단) 다음 · 하위 = 상한가 보고서 · 팀 매집 · 매집감지 · AI 애널리스트 · 링크는 /analytics/limitup", () => {
    setupReady();
    render(<AppSidebar />);
    expect(analytics()).toHaveAttribute("href", "/analytics/limitup");
    expect(report()).toHaveAttribute("href", "/analytics/limitup");

    const order = Array.from(document.querySelectorAll('nav[aria-label="주 메뉴"] a[href]')).map((a) => {
      const item = a.getAttribute("data-sidebar-item");
      return item === "strategy" ? "strategy" : (a.textContent ?? "").trim();
    });
    expect(order).toEqual([
      "홈",
      "검색",
      "트레이딩",
      "strategy",
      "strategy",
      "분석",
      "상한가 보고서",
      "팀 매집 보고서",
      "매집감지 보고서",
      "AI 애널리스트",
      "My page",
    ]);
    // 하위 항목은 그룹 제목 바로 다음 형제 li 안 SUB_LIST(트레이딩 3단과 같은 문법)
    const sub = analytics()!.closest("li")!.nextElementSibling!;
    expect(sub.className).toContain("rail:hidden");
    expect(sub.querySelector("ul")!.className).toContain("border-l");
    expect(report()!.hasAttribute("data-nav-item")).toBe(true);
    expect(analytics()!.hasAttribute("data-nav-item")).toBe(true);
    // 「팀 매집」(Phase 33 TEAM-02) = 두 번째 · 「매집감지」(Phase 34 D-27) = 세 번째 · 「AI 애널리스트」 = 네 번째
    // (quick-261005-vk1 D-01) — 같은 SUB_LIST
    const subLinks = Array.from(sub.querySelectorAll("ul > li > a"));
    expect(subLinks.map((a) => a.getAttribute("data-sidebar-item"))).toEqual([
      "limitup-report",
      "teamflow",
      "accum",
      "chat",
    ]);
    expect(subLinks[1]).toHaveAttribute("href", "/analytics/teamflow");
    expect(subLinks[2]).toHaveAttribute("href", "/analytics/accum");
    const chat = screen.getByRole("link", { name: "AI 애널리스트" });
    expect(chat).toBe(subLinks[3]);
    expect(chat).toHaveAttribute("href", "/chat");
    expect(chat.hasAttribute("data-nav-item")).toBe(true);
    // 펼침에서는 레일 전용 아이콘이 없다(접근 이름 중복 없음)
    expect(screen.getAllByRole("link", { name: "AI 애널리스트" })).toHaveLength(1);
  });

  it("/chat → 「AI 애널리스트」 하위 항목만 활성(aria-current + 선택 토큰) · 「분석」 제목은 꺼짐", () => {
    mockPathname = "/chat";
    setupReady();
    render(<AppSidebar />);
    const chat = screen.getByRole("link", { name: "AI 애널리스트" });
    expect(chat).toHaveAttribute("aria-current", "page");
    expect(chat.className).toContain("bg-[var(--nav-on-bg)]");
    expect(chat.querySelector("span")!.className).not.toContain("text-[var(--fg)]");
    expect(analytics()).not.toHaveAttribute("aria-current");
    expect(analytics()!.className).not.toContain("bg-[var(--nav-on-bg)]");
    expect(document.querySelectorAll('nav [aria-current="page"]')).toHaveLength(1);
  });

  it("tradingVisible 거짓 → 「AI 애널리스트」 미렌더(비로그인 · unauthorized · 판정 전)", () => {
    for (const [auth, status] of [
      [guest(), "ready"],
      [authed(), "unauthorized"],
      [authed(), "connecting"],
    ] as const) {
      mockAuth = auth;
      mockRelay = relayState({ status });
      const r = render(<AppSidebar />);
      expect(screen.queryByRole("link", { name: "AI 애널리스트" })).toBeNull();
      expect(document.querySelector('[data-sidebar-item="chat"]')).toBeNull();
      r.unmount();
    }
  });

  it("/analytics/limitup → 하위 「상한가 보고서」 만 활성(선택 토큰 + aria-current) · 「분석」 제목은 꺼짐 (2026-10-06)", () => {
    mockPathname = "/analytics/limitup";
    setupReady();
    render(<AppSidebar />);
    expect(report()).toHaveAttribute("aria-current", "page");
    expect(report()!.className).toContain("bg-[var(--nav-on-bg)]");
    expect(report()!.className).toContain("text-[var(--nav-on-fg)]");
    expect(analytics()).not.toHaveAttribute("aria-current");
    expect(analytics()!.className).not.toContain("bg-[var(--nav-on-bg)]");
    // 한 줄만 켠다 — 트레이딩 · 홈은 꺼져 있다
    expect(screen.getByRole("link", { name: "트레이딩" })).not.toHaveAttribute("aria-current");
    expect(document.querySelectorAll('nav [aria-current="page"]')).toHaveLength(1);
  });

  it("tradingVisible 거짓 → 「팀 매집」 미렌더(비로그인 · unauthorized · 판정 전) — Phase 33 TEAM-02", () => {
    for (const [auth, status] of [
      [guest(), "ready"],
      [authed(), "unauthorized"],
      [authed(), "connecting"],
    ] as const) {
      mockAuth = auth;
      mockRelay = relayState({ status });
      const r = render(<AppSidebar />);
      expect(screen.queryByText("팀 매집 보고서")).toBeNull();
      expect(document.querySelector('[data-sidebar-item="teamflow"]')).toBeNull();
      r.unmount();
    }
  });

  it("/analytics/teamflow → 하위 「팀 매집」 만 활성 · 「상한가 보고서」 는 꺼짐(접두 겹침 없음) — Phase 33 TEAM-02", () => {
    mockPathname = "/analytics/teamflow";
    setupReady();
    render(<AppSidebar />);
    const teamflow = screen.getByRole("link", { name: "팀 매집 보고서" });
    expect(teamflow).toHaveAttribute("href", "/analytics/teamflow");
    expect(teamflow).toHaveAttribute("data-sidebar-item", "teamflow");
    expect(teamflow).toHaveAttribute("aria-current", "page");
    expect(teamflow.className).toContain("bg-[var(--nav-on-bg)]");
    expect(report()).not.toHaveAttribute("aria-current");
    expect(report()!.className).not.toContain("bg-[var(--nav-on-bg)]");
    expect(analytics()).not.toHaveAttribute("aria-current");
    expect(document.querySelectorAll('nav [aria-current="page"]')).toHaveLength(1);
  });

  it("tradingVisible 거짓 → 「매집감지」 미렌더(비로그인 · unauthorized · 판정 전) — Phase 34 D-27", () => {
    for (const [auth, status] of [
      [guest(), "ready"],
      [authed(), "unauthorized"],
      [authed(), "connecting"],
    ] as const) {
      mockAuth = auth;
      mockRelay = relayState({ status });
      const r = render(<AppSidebar />);
      expect(screen.queryByText("매집감지 보고서")).toBeNull();
      expect(document.querySelector('[data-sidebar-item="accum"]')).toBeNull();
      r.unmount();
    }
  });

  it("/analytics/accum → 하위 「매집감지」 만 활성 · 「팀 매집」 · 「상한가 보고서」 는 꺼짐(접두 겹침 없음) — Phase 34 D-27", () => {
    mockPathname = "/analytics/accum";
    setupReady();
    render(<AppSidebar />);
    const accum = screen.getByRole("link", { name: "매집감지 보고서" });
    expect(accum).toHaveAttribute("href", "/analytics/accum");
    expect(accum).toHaveAttribute("data-sidebar-item", "accum");
    expect(accum).toHaveAttribute("aria-current", "page");
    expect(accum.className).toContain("bg-[var(--nav-on-bg)]");
    expect(screen.getByRole("link", { name: "팀 매집 보고서" })).not.toHaveAttribute("aria-current");
    expect(report()).not.toHaveAttribute("aria-current");
    expect(analytics()).not.toHaveAttribute("aria-current");
    expect(document.querySelectorAll('nav [aria-current="page"]')).toHaveLength(1);
  });

  it("레일 + /analytics/limitup → 하위가 숨으므로 「분석」 아이콘이 활성 · aria-current 는 아이콘 하나", () => {
    mockPathname = "/analytics/limitup";
    setSidebarCollapsed(true);
    setupReady();
    render(<AppSidebar />);
    expect(analytics()).toHaveAttribute("aria-current", "page");
    expect(analytics()!.className).toContain("bg-[var(--nav-on-bg)]");
    expect(report()).not.toHaveAttribute("aria-current");
    expect(document.querySelectorAll('nav [aria-current="page"]')).toHaveLength(1);
  });

  it("레일 + /chat → 레일 전용 「AI 애널리스트」 아이콘만 aria-current · 「분석」 아이콘은 꺼짐", () => {
    mockPathname = "/chat";
    setSidebarCollapsed(true);
    setupReady();
    render(<AppSidebar />);
    expect(analytics()!.className).not.toContain("bg-[var(--nav-on-bg)]");
    const current = document.querySelectorAll('nav [aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("href", "/chat");
    expect(current[0].closest("li.rail\\:block")).not.toBeNull();
  });

  it("다른 경로 → 「분석」 비활성", () => {
    mockPathname = "/trading";
    setupReady();
    render(<AppSidebar />);
    expect(analytics()!.className).not.toContain("bg-[var(--nav-on-bg)]");
    expect(analytics()).not.toHaveAttribute("aria-current");
  });

  it("레일 — 제목은 아이콘 + sr-only 글자 + title 「분석」 · 하위 목록 rail:hidden", () => {
    setSidebarCollapsed(true);
    setupReady();
    render(<AppSidebar />);
    expect(analytics()).toHaveAttribute("title", "분석");
    expect(analytics()!.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(within(analytics()!).getByText("분석").className).toContain("rail:sr-only");
    expect(report()!.closest("li.rail\\:hidden")).not.toBeNull();
  });

  it("레일 + tradingVisible → 「분석」 아이콘 바로 다음 li(hidden rail:block)에 「AI 애널리스트」 아이콘 링크", () => {
    setSidebarCollapsed(true);
    setupReady();
    render(<AppSidebar />);
    const analyticsLi = analytics()!.closest("li")!;
    // 분석 제목 li → 하위 목록 li(rail:hidden) → 레일 전용 li
    const railLi = analyticsLi.nextElementSibling!.nextElementSibling!;
    expect(railLi.className).toContain("hidden");
    expect(railLi.className).toContain("rail:block");
    const icon = railLi.querySelector("a")!;
    expect(icon).toHaveAttribute("href", "/chat");
    expect(icon).toHaveAttribute("title", "AI 애널리스트");
    expect(icon.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("레일이 아니면 레일 전용 li 가 없다 · tradingVisible 거짓이면 레일에서도 없다", () => {
    setupReady();
    const a = render(<AppSidebar />);
    expect(document.querySelector("li.rail\\:block")).toBeNull();
    a.unmount();

    setSidebarCollapsed(true);
    mockAuth = guest();
    mockRelay = relayState({ status: "ready" });
    render(<AppSidebar />);
    expect(document.querySelector("li.rail\\:block")).toBeNull();
    expect(screen.queryByRole("link", { name: "AI 애널리스트" })).toBeNull();
  });
});

describe("AppSidebar — 「Admin › 사용자 · 서버 · 발사 · 매매손익」 (Phase 29 D-13 · Phase 35 D-11 · Phase 36 D-17)", () => {
  afterEach(() => {
    act(() => setSidebarCollapsed(false));
    window.localStorage.removeItem(SIDEBAR_COLLAPSED_KEY);
  });

  const admin = () => screen.queryByRole("link", { name: "Admin" });
  const users = () => screen.queryByRole("link", { name: "사용자" });
  const servers = () => screen.queryByRole("link", { name: "서버" });
  const launch = () => screen.queryByRole("link", { name: "발사" });
  const pnl = () => screen.queryByRole("link", { name: "매매손익" });

  it("role admin → 「Admin」(/admin/users) + 하위 「사용자」 · 「서버」 · 「발사」 · 「매매손익」(맨 뒤) — 「분석」 뒤 · My page 앞", () => {
    mockRole = "admin";
    setupReady();
    render(<AppSidebar />);
    expect(admin()).toHaveAttribute("href", "/admin/users");
    expect(users()).toHaveAttribute("href", "/admin/users");
    expect(servers()).toHaveAttribute("href", "/admin/servers");
    expect(launch()).toHaveAttribute("href", "/admin/launch");
    expect(launch()).toHaveAttribute("data-sidebar-item", "admin-launch");
    expect(pnl()).toHaveAttribute("href", "/admin/pnl");
    expect(pnl()).toHaveAttribute("data-sidebar-item", "admin-pnl");
    const order = Array.from(document.querySelectorAll('nav[aria-label="주 메뉴"] a[href]')).map((a) => {
      const item = a.getAttribute("data-sidebar-item");
      return item === "strategy" ? "strategy" : (a.textContent ?? "").trim();
    });
    expect(order).toEqual([
      "홈",
      "검색",
      "트레이딩",
      "strategy",
      "strategy",
      "분석",
      "상한가 보고서",
      "팀 매집 보고서",
      "매집감지 보고서",
      "AI 애널리스트",
      "Admin",
      "사용자",
      "서버",
      "발사",
      "매매손익",
      "My page",
    ]);
    // 하위는 제목 바로 다음 형제 li 안 SUB_LIST(「분석」 과 같은 문법) · 레일에서 숨김
    const sub = admin()!.closest("li")!.nextElementSibling!;
    expect(sub.className).toContain("rail:hidden");
    expect(sub.querySelector("ul")!.className).toContain("border-l");
    for (const a of [admin()!, users()!, servers()!, launch()!, pnl()!]) expect(a.hasAttribute("data-nav-item")).toBe(true);
  });

  it("Admin 노출은 역할만 본다 — 트레이딩이 안 보이는(relay 미연결) admin 에게도 보인다", () => {
    mockRole = "admin";
    mockAuth = authed();
    mockRelay = relayState({ status: "connecting" });
    render(<AppSidebar />);
    expect(admin()).not.toBeNull();
    expect(screen.queryByRole("link", { name: "트레이딩" })).toBeNull();
    expect(screen.queryByRole("link", { name: "My page" })).toBeNull();
  });

  it("role trader · viewer · null · 모름(undefined) → Admin 미렌더", () => {
    for (const role of ["trader", "viewer", null, undefined] as const) {
      mockRole = role;
      setupReady();
      const r = render(<AppSidebar />);
      expect(admin()).toBeNull();
      expect(users()).toBeNull();
      expect(servers()).toBeNull();
      expect(launch()).toBeNull();
      expect(pnl()).toBeNull();
      expect(screen.queryByText("Admin")).toBeNull();
      r.unmount();
    }
  });

  it("/admin/users → 「사용자」 만 활성 · /admin/servers → 「서버」 만 활성 · 「Admin」 제목은 꺼짐", () => {
    mockRole = "admin";
    mockPathname = "/admin/users";
    setupReady();
    const a = render(<AppSidebar />);
    expect(users()).toHaveAttribute("aria-current", "page");
    expect(users()!.className).toContain("bg-[var(--nav-on-bg)]");
    expect(servers()).not.toHaveAttribute("aria-current");
    expect(admin()).not.toHaveAttribute("aria-current");
    expect(admin()!.className).not.toContain("bg-[var(--nav-on-bg)]");
    expect(document.querySelectorAll('nav [aria-current="page"]')).toHaveLength(1);
    a.unmount();

    mockPathname = "/admin/servers";
    render(<AppSidebar />);
    expect(servers()).toHaveAttribute("aria-current", "page");
    expect(servers()!.className).toContain("bg-[var(--nav-on-bg)]");
    expect(users()).not.toHaveAttribute("aria-current");
    expect(users()!.className).not.toContain("bg-[var(--nav-on-bg)]");
    expect(admin()!.className).not.toContain("bg-[var(--nav-on-bg)]");
    expect(document.querySelectorAll('nav [aria-current="page"]')).toHaveLength(1);
  });

  it("/admin/launch → 「발사」 만 활성 · 「서버」 · 「사용자」 · 「Admin」 제목은 꺼짐", () => {
    mockRole = "admin";
    mockPathname = "/admin/launch";
    setupReady();
    render(<AppSidebar />);
    expect(launch()).toHaveAttribute("aria-current", "page");
    expect(launch()!.className).toContain("bg-[var(--nav-on-bg)]");
    expect(servers()).not.toHaveAttribute("aria-current");
    expect(users()).not.toHaveAttribute("aria-current");
    expect(admin()!.className).not.toContain("bg-[var(--nav-on-bg)]");
    expect(document.querySelectorAll('nav [aria-current="page"]')).toHaveLength(1);
  });

  it("/admin/pnl → 「매매손익」 만 활성 · 「발사」 · 「서버」 · 「사용자」 · 「Admin」 제목은 꺼짐", () => {
    mockRole = "admin";
    mockPathname = "/admin/pnl";
    setupReady();
    render(<AppSidebar />);
    expect(pnl()).toHaveAttribute("aria-current", "page");
    expect(pnl()!.className).toContain("bg-[var(--nav-on-bg)]");
    expect(launch()).not.toHaveAttribute("aria-current");
    expect(servers()).not.toHaveAttribute("aria-current");
    expect(users()).not.toHaveAttribute("aria-current");
    expect(admin()!.className).not.toContain("bg-[var(--nav-on-bg)]");
    expect(document.querySelectorAll('nav [aria-current="page"]')).toHaveLength(1);
  });

  it("레일 → 「Admin」 아이콘(title) · 하위 숨김 · /admin/* 접두 일치로 아이콘 활성", () => {
    mockRole = "admin";
    setSidebarCollapsed(true);
    mockPathname = "/admin/servers";
    setupReady();
    render(<AppSidebar />);
    expect(admin()).toHaveAttribute("title", "Admin");
    expect(admin()!.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(admin()!.className).toContain("bg-[var(--nav-on-bg)]");
    expect(servers()!.closest("li.rail\\:hidden")).not.toBeNull();
  });

  it("다른 경로 → Admin 쪽은 아무것도 활성이 아니다", () => {
    mockRole = "admin";
    mockPathname = "/trading";
    setupReady();
    render(<AppSidebar />);
    for (const a of [admin()!, users()!, servers()!, launch()!]) {
      expect(a).not.toHaveAttribute("aria-current");
      expect(a.className).not.toContain("bg-[var(--nav-on-bg)]");
    }
  });
});
