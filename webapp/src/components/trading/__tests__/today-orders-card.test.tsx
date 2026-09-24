import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import {
  kstDateIso,
  type JournalOrderRow,
  type RelayAccountState,
  type RelayOrderMsg,
} from "@gh-radar/shared";

/**
 * quick-260910-jce Task 2 — 「오늘 주문」 카드 계약 (RELAY-02 / D-24).
 *
 * 잠그는 것은 **정보와 실패 수렴**이지 픽셀이 아니다:
 *  ① 복원 3건(접수 2 · 취소 1)이 3줄로 서고 취소 행이 취소로 표시된다
 *  ② 같은 `orderNo` 의 라이브 프레임은 **줄을 늘리지 않고** 그 줄의 상태만 바꾼다
 *  ③ 조회가 `ApiClientError` 로 실패해도 throw 하지 않고 안내 문구로 수렴한다
 *     — 이 카드가 터지면 My page 의 전략·계좌 카드까지 같이 죽는다
 *  ④ 복원 0건은 **로딩과 구분되는** 빈 상태 문구다
 *
 * quick-260910-kql 이 ⑤ 를 더한다 — 종목 칸의 **3단 폴백**(이름 → 코드 → ISIN).
 *  ★ `useIsinLabels` 를 mock 하지 **않는다.** 실물 훅이 아래 `mockRelay` 를 그대로 읽으므로
 *    훅과 컴포넌트의 **연결까지** 함께 잠긴다 — 훅을 스텁하면 잠기는 것은 렌더 분기뿐이다.
 */

// --- 훅 스텁 — 라이브 주문 배열을 테스트가 직접 주입한다 -----------------------
type RelayShape = ReturnType<typeof import("@/lib/relay-provider").useRelayContext>;

let mockRelay: RelayShape;

vi.mock("@/lib/relay-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/relay-provider")>();
  return { ...actual, useRelayContext: () => mockRelay };
});

// --- 조회 mock — 순수 함수(mergeTodayOrders 등)는 **실물**을 쓴다 ---------------
const fetchTodayOrdersMock = vi.fn();
vi.mock("@/lib/orders-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orders-api")>();
  return { ...actual, fetchTodayOrders: () => fetchTodayOrdersMock() };
});

import { ApiClientError } from "@/lib/api";
import { EMPTY_RELAY_VALUE } from "@/lib/relay-provider";

import { TodayOrdersCard } from "../today-orders-card";

// ---------------------------------------------------------------------------
// 픽스처
// ---------------------------------------------------------------------------

/** 스펙 실행 시각의 KST 오늘 — 카드가 푸시 행을 거르는 기준과 같은 shared 함수다. */
const TODAY = kstDateIso();

function row(over: Partial<JournalOrderRow> = {}): JournalOrderRow {
  return {
    id: "id-1",
    tradeDate: TODAY,
    accountNo: "1234567801",
    isin: "KR7005930003",
    stockCode: "005930",
    exchange: "KRX",
    board: null,
    side: "B",
    orderType: "N",
    orgOrderNo: null,
    qty: 10,
    price: 70_000,
    orderNo: "0000135742",
    filledQty: 0,
    modifiedQty: 0,
    status: "accepted",
    resultCode: 0,
    noticeType: "A",
    message: null,
    origin: "manual",
    requester: null,
    requestKind: null,
    lastSeq: 1,
    createdAt: "2026-09-10T00:10:00.000Z",
    updatedAt: "2026-09-10T00:10:00.000Z",
    ...over,
  };
}

function frame(over: Partial<RelayOrderMsg> = {}): RelayOrderMsg {
  return {
    t: "order",
    no: "0000135742",
    nt: "A",
    rc: 0,
    msg: "",
    org: "",
    p: 70_000,
    q: 10,
    x: "KRX",
    ...over,
  };
}

/** 접수 2 · 취소 1 — 최종 검증 대상과 같은 모양이다. */
const THREE_ORDERS: JournalOrderRow[] = [
  row({ id: "a", orderNo: "0000135742", status: "accepted" }),
  row({ id: "b", orderNo: "0000135743", status: "accepted", side: "S" }),
  row({ id: "c", orderNo: "0000135744", status: "cancelled" }),
];

/**
 * 잔고에 `KR7005930003` 하나가 있는 계좌 상태 — `useIsinLabels` 가 읽는 **이름의 원천**이다.
 * 픽스처 본은 `src/lib/__tests__/isin-labels.test.tsx` 의 `heldAccountStates()` 다.
 */
function heldAccountStates(): ReadonlyMap<string, RelayAccountState> {
  const state: RelayAccountState = {
    t: "acct",
    a: "1234567801",
    snap: true,
    hold: [
      {
        isin: "KR7005930003",
        qty: 10,
        sellableQty: 10,
        avgPrice: 70_000,
        name: "삼성전자",
        code: "005930",
      },
    ],
    unf: [],
    rm: [],
    st: "20260910091000",
  };
  return new Map([[state.a, state]]);
}

/** 모바일 카드 행만 센다 — 표 행은 같은 정보를 CSS 로 가려 둔 한 벌이라 두 번 세면 안 된다. */
const listRows = () => document.querySelectorAll('[data-slot="today-order-row"]');

beforeEach(() => {
  mockRelay = { ...EMPTY_RELAY_VALUE };
  fetchTodayOrdersMock.mockReset();
  fetchTodayOrdersMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================

describe("TodayOrdersCard", () => {
  it("복원 3건(접수 2 · 취소 1)이 3줄로 서고 취소 행이 취소로 표시된다", async () => {
    fetchTodayOrdersMock.mockResolvedValue(THREE_ORDERS);

    render(<TodayOrdersCard />);

    await waitFor(() => expect(listRows()).toHaveLength(3));
    const cancelled = [...listRows()].find((el) => el.textContent?.includes("0000135744"));
    expect(cancelled?.textContent).toContain("취소");
  });

  it("같은 orderNo 의 라이브 프레임은 줄을 늘리지 않고 상태만 바꾼다", async () => {
    fetchTodayOrdersMock.mockResolvedValue(THREE_ORDERS);
    // 접수 상태로 복원된 주문에 취소확인 통보가 뒤따랐다 — 라이브가 이긴다.
    mockRelay = { ...EMPTY_RELAY_VALUE, orders: [frame({ no: "0000135742", nt: "C" })] };

    render(<TodayOrdersCard />);

    await waitFor(() => expect(listRows()).toHaveLength(3));
    const target = [...listRows()].find((el) => el.textContent?.includes("0000135742"));
    expect(target?.textContent).toContain("취소");
  });

  it("조회가 실패해도 throw 하지 않고 안내 문구로 수렴한다", async () => {
    fetchTodayOrdersMock.mockRejectedValue(
      new ApiClientError({ code: "HTTP_500", message: "boom", status: 500 }),
    );

    render(<TodayOrdersCard />);

    // 이 카드가 터지면 My page 의 전략·계좌 카드까지 함께 죽는다.
    await waitFor(() =>
      expect(screen.getByTestId("today-orders-error")).toBeInTheDocument(),
    );
    expect(listRows()).toHaveLength(0);
  });

  it("복원 0건은 로딩과 구분되는 빈 상태 문구를 낸다", async () => {
    fetchTodayOrdersMock.mockResolvedValue([]);

    render(<TodayOrdersCard />);

    await waitFor(() =>
      expect(screen.getByTestId("today-orders-empty")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("today-orders-loading")).not.toBeInTheDocument();
  });

  it("라이브에만 있는 주문번호는 행을 만들지 않고 그 번호당 재조회를 **한 번만** 한다", async () => {
    // 라이브 프레임에는 side·isin 이 없다 — 행을 합성하면 매매구분 칸이 빈 줄이 선다.
    fetchTodayOrdersMock.mockResolvedValue(THREE_ORDERS);
    mockRelay = { ...EMPTY_RELAY_VALUE, orders: [frame({ no: "0000199999", nt: "A" })] };

    render(<TodayOrdersCard />);

    await waitFor(() => expect(fetchTodayOrdersMock).toHaveBeenCalledTimes(2));
    expect(listRows()).toHaveLength(3);
    // 재조회해도 그 번호가 여전히 없다 — 그래도 **다시 부르지 않는다**(루프 금지).
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchTodayOrdersMock).toHaveBeenCalledTimes(2);
  });

  // --- ⑤ 종목 칸 3단 폴백 (quick-260910-kql) --------------------------------

  it("relay 가 이름을 아는 종목은 종목명과 단축코드를 **함께** 보여준다", async () => {
    fetchTodayOrdersMock.mockResolvedValue([row({ id: "a", orderNo: "0000135742" })]);
    // 실물 `useIsinLabels` 가 이 계좌 상태를 읽는다 — 훅↔컴포넌트 연결까지 잠근다.
    mockRelay = { ...EMPTY_RELAY_VALUE, accountStates: heldAccountStates() };

    render(<TodayOrdersCard />);

    await waitFor(() => expect(listRows()).toHaveLength(1));
    const text = listRows()[0]?.textContent ?? "";
    expect(text).toContain("삼성전자");
    // 이름이 코드를 **대체하지 않는다** — 이름만 보면 식별자가 사라진 회귀를 통과시킨다.
    expect(text).toContain("005930");
  });

  it("계좌 프레임 도착 전(라벨 없음)에도 종목 칸이 비지 않고 단축코드가 남는다", async () => {
    fetchTodayOrdersMock.mockResolvedValue([row({ id: "a", orderNo: "0000135742" })]);
    // `mockRelay` 는 `EMPTY_RELAY_VALUE` 그대로 = `accountStates` 가 비어 라벨 Map 이 빈 상태다.

    render(<TodayOrdersCard />);

    await waitFor(() => expect(listRows()).toHaveLength(1));
    const text = listRows()[0]?.textContent ?? "";
    expect(text).toContain("005930");
    expect(text.trim()).not.toBe("");
  });

  it("단축코드가 없고(상장폐지) 라벨도 없으면 ISIN 원문이 종목 칸에 남는다", async () => {
    fetchTodayOrdersMock.mockResolvedValue([
      row({ id: "a", orderNo: "0000135742", stockCode: null }),
    ]);

    render(<TodayOrdersCard />);

    await waitFor(() => expect(listRows()).toHaveLength(1));
    expect(listRows()[0]?.textContent).toContain("KR7005930003");
  });

  // --- ⑥ 행위 단어는 서버 필드가 말한다 (17-10 / D-15) ----------------------

  /** 모바일 카드 행의 행위 단어 칸. 표 행과 같은 문자열을 쓴다. */
  const sideCells = () => [...document.querySelectorAll('[data-slot="today-order-side"]')];

  it("⑥-1 신규 매수 주문에 취소확인 통보가 오면 행위 단어가 「취소」로 바뀌고 방향색이 죽는다", async () => {
    // orderType 은 여전히 "N"(신규)이다 — 판정 근거는 **통보 종류**지 우리가 보낸 주문 종류가 아니다.
    fetchTodayOrdersMock.mockResolvedValue([
      row({ id: "a", orderNo: "0000135742", side: "B", orderType: "N" }),
    ]);
    mockRelay = { ...EMPTY_RELAY_VALUE, orders: [frame({ no: "0000135742", nt: "C" })] };

    render(<TodayOrdersCard />);

    await waitFor(() => expect(listRows()).toHaveLength(1));
    const cells = sideCells();
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(cell.textContent).toContain("취소");
      // 취소·정정에는 방향이 없다 — 「매수 취소」를 빨강으로 그리면 신규 매수와 헷갈린다.
      expect(cell.getAttribute("data-side")).toBe("none");
      expect(cell.className).not.toContain("--up");
      expect(cell.className).not.toContain("--down");
    }
  });

  it("⑥-2 수동 발주 · 시간외종가 접수는 「시간외종가 매수」 + 「수동」 메타로 읽힌다", async () => {
    fetchTodayOrdersMock.mockResolvedValue([
      row({ id: "a", orderNo: "0000135742", side: "B" }),
    ]);
    mockRelay = {
      ...EMPTY_RELAY_VALUE,
      orders: [frame({ no: "0000135742", nt: "A", bd: "G2", rq: "Manual" })],
    };

    render(<TodayOrdersCard />);

    await waitFor(() => expect(listRows()).toHaveLength(1));
    const text = listRows()[0]?.textContent ?? "";
    expect(text).toContain("시간외종가 매수");
    expect(text).toContain("수동");
  });

  it("⑥-3 통보가 없는 신규 매도 행은 종전대로 방향색 매도다 — 없는 행위를 지어내지 않는다", async () => {
    fetchTodayOrdersMock.mockResolvedValue([
      row({ id: "a", orderNo: "0000135742", side: "S", noticeType: null, status: "accepted" }),
    ]);

    render(<TodayOrdersCard />);

    await waitFor(() => expect(listRows()).toHaveLength(1));
    const cell = sideCells()[0];
    expect(cell?.textContent).toContain("매도");
    expect(cell?.getAttribute("data-side")).toBe("S");
  });
});

// ===========================================================================
// 17-10 Task 3 — 오늘 주문 표에 3초 창 묶기 적용 (D-16 / T-17-35)
// ===========================================================================

/**
 * 부분체결 조각 매도(quick-260916-fq3)에서 통보가 조각 수만큼 쏟아져 표가 한 종목으로
 * 가득 찬다. 묶기는 그것을 한 줄로 만들되 **재조회 경로를 끊지 않아야** 한다 —
 * 합쳐진 주문번호가 `unmatchedOrderNos` 에서 사라지면 그 주문의 종목명이 영원히
 * 복원되지 않는다(T-17-35).
 */

/** 상따 자동주문의 조각 매도 체결 3건 — 1초 간격이라 3초 창 안이다. */
const AUTO_SELL_FILLS: JournalOrderRow[] = [
  row({
    id: "f3",
    orderNo: "0000200003",
    side: "S",
    origin: "limit_chaser",
    status: "filled",
    noticeType: "E",
    qty: 3,
    createdAt: "2026-09-10T00:10:02.000Z",
  }),
  row({
    id: "f2",
    orderNo: "0000200002",
    side: "S",
    origin: "limit_chaser",
    status: "filled",
    noticeType: "E",
    qty: 5,
    createdAt: "2026-09-10T00:10:01.000Z",
  }),
  row({
    id: "f1",
    orderNo: "0000200001",
    side: "S",
    origin: "limit_chaser",
    status: "filled",
    noticeType: "E",
    qty: 10,
    createdAt: "2026-09-10T00:10:00.000Z",
  }),
];

const AUTO_SELL_FRAMES: RelayOrderMsg[] = AUTO_SELL_FILLS.map((r) =>
  frame({ no: r.orderNo ?? "", nt: "E", q: r.qty ?? 0 }),
);

describe("TodayOrdersCard — 통보 묶기 (17-10 / D-16)", () => {
  it("⑦-1 같은 자동주문의 조각 매도 체결 3건이 한 줄로 그려진다", async () => {
    fetchTodayOrdersMock.mockResolvedValue(AUTO_SELL_FILLS);
    mockRelay = { ...EMPTY_RELAY_VALUE, orders: AUTO_SELL_FRAMES };

    render(<TodayOrdersCard />);

    await waitFor(() => expect(listRows()).toHaveLength(1));
    const text = listRows()[0]?.textContent ?? "";
    expect(text).toContain("#0000200001~0000200003");
    expect(text).toContain("(3건)");
    // 수량은 합계다 — 3 + 5 + 10.
    expect(text).toContain("18");
  });

  it("⑦-2 묶기 뒤에도 재조회 루프는 **묶기 전** 주문번호 목록을 본다 (T-17-35)", async () => {
    fetchTodayOrdersMock.mockResolvedValue(AUTO_SELL_FILLS);
    mockRelay = {
      ...EMPTY_RELAY_VALUE,
      // 복원에 없는 주문번호 1건 — 묶기와 무관하게 재조회가 나가야 한다.
      orders: [frame({ no: "0000299999", nt: "A" }), ...AUTO_SELL_FRAMES],
    };

    render(<TodayOrdersCard />);

    await waitFor(() => expect(fetchTodayOrdersMock).toHaveBeenCalledTimes(2));
    // 묶기는 화면만 접는다 — 재조회 판정은 `mergeTodayOrders` 결과가 정본이다.
    expect(listRows()).toHaveLength(1);
  });

  it("⑦-3 복원 행만 있고 relay 프레임이 없으면 묶기가 아무것도 바꾸지 않는다", async () => {
    fetchTodayOrdersMock.mockResolvedValue(AUTO_SELL_FILLS);
    // `orders` 가 비어 있다 = 통보가 온 적 없는 복원 스냅샷.

    render(<TodayOrdersCard />);

    await waitFor(() => expect(listRows()).toHaveLength(3));
    expect(document.body.textContent).not.toContain("건)");
  });

  it("⑦-4 묶인 행을 펼치는 UI 는 만들지 않는다 (이번 phase 범위 밖)", async () => {
    fetchTodayOrdersMock.mockResolvedValue(AUTO_SELL_FILLS);
    mockRelay = { ...EMPTY_RELAY_VALUE, orders: AUTO_SELL_FRAMES };

    render(<TodayOrdersCard />);

    await waitFor(() => expect(listRows()).toHaveLength(1));
    expect(document.querySelectorAll('[data-slot="today-orders-card"] button')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// ⑧ relay 재인증 뒤 재조회 (debug mobile-bg-resume-gaps 4)
// ---------------------------------------------------------------------------

describe("TodayOrdersCard — relay 재인증 뒤 재조회 (debug mobile-bg-resume-gaps 4)", () => {
  it("⑧-1 소켓이 끊겼다 다시 ready 가 되면 한 번 다시 불러와, 끊긴 사이 체결된 행을 고친다", async () => {
    // 끊기기 전: 접수로 복원 + 접수 라이브 프레임을 받은 상태.
    fetchTodayOrdersMock.mockResolvedValue([row({ id: "a", status: "accepted" })]);
    mockRelay = {
      ...EMPTY_RELAY_VALUE,
      status: "ready",
      orders: [frame({ no: "0000135742", nt: "A" })],
    };
    const view = render(<TodayOrdersCard />);
    await waitFor(() => expect(listRows()).toHaveLength(1));
    expect(listRows()[0]?.textContent).toContain("접수");
    expect(fetchTodayOrdersMock).toHaveBeenCalledTimes(1);

    // 백그라운드 — 소켓이 죽었고, 그 사이 relay 가 체결을 dma_orders 에 기록했다.
    mockRelay = { ...mockRelay, status: "reconnecting" };
    view.rerender(<TodayOrdersCard />);
    fetchTodayOrdersMock.mockResolvedValue([
      row({ id: "a", status: "filled", filledQty: 10, noticeType: "E" }),
    ]);

    // 복귀 — 재인증.
    mockRelay = { ...mockRelay, status: "ready" };
    view.rerender(<TodayOrdersCard />);

    await waitFor(() => expect(fetchTodayOrdersMock).toHaveBeenCalledTimes(2));
    // 끊기기 전의 라이브 A 가 재조회한 「체결」을 덮으면 안 된다.
    await waitFor(() => expect(listRows()[0]?.textContent).toContain("체결"));
    expect(listRows()[0]?.textContent).not.toContain("접수");
  });

  it("⑧-2 마운트 뒤 **첫** ready 는 마운트 조회와 같은 시점이다 — 다시 부르지 않는다", async () => {
    mockRelay = { ...EMPTY_RELAY_VALUE, status: "connecting" };
    const view = render(<TodayOrdersCard />);
    await waitFor(() => expect(screen.getByTestId("today-orders-empty")).toBeInTheDocument());

    mockRelay = { ...mockRelay, status: "ready" };
    view.rerender(<TodayOrdersCard />);
    await new Promise((r) => setTimeout(r, 30));

    expect(fetchTodayOrdersMock).toHaveBeenCalledTimes(1);
  });

  it("⑧-3 ready 가 유지되는 동안의 리렌더는 재조회하지 않는다 (폴링이 아니다)", async () => {
    mockRelay = { ...EMPTY_RELAY_VALUE, status: "ready" };
    const view = render(<TodayOrdersCard />);
    await waitFor(() => expect(screen.getByTestId("today-orders-empty")).toBeInTheDocument());

    mockRelay = { ...mockRelay, isStale: false };
    view.rerender(<TodayOrdersCard />);
    view.rerender(<TodayOrdersCard />);
    await new Promise((r) => setTimeout(r, 30));

    expect(fetchTodayOrdersMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// ⑨ 원천 = REST 복원 + journal.rows 푸시 (Phase 19 D-03)
// ---------------------------------------------------------------------------

describe("TodayOrdersCard — journal 원천 (Phase 19 D-03)", () => {
  it("⑨-1 journal: 같은 id 는 lastSeq 가 큰 푸시 행이 이겨 줄 수는 그대로 · 상태가 「체결」로 바뀐다", async () => {
    fetchTodayOrdersMock.mockResolvedValue([row({ id: "x", lastSeq: 3, status: "accepted" })]);
    mockRelay = {
      ...EMPTY_RELAY_VALUE,
      journalRows: [
        row({ id: "x", lastSeq: 5, status: "filled", filledQty: 10, noticeType: "E" }),
      ],
    };

    render(<TodayOrdersCard />);

    await waitFor(() => expect(listRows()).toHaveLength(1));
    const status = listRows()[0]?.querySelector('[data-slot="today-order-status"]');
    expect(status?.textContent).toBe("체결");
  });

  it("⑨-2 journal: 복원에 없는 오늘 푸시 행은 줄을 **만든다** — 푸시 행은 완전한 행이다", async () => {
    fetchTodayOrdersMock.mockResolvedValue([]);
    mockRelay = {
      ...EMPTY_RELAY_VALUE,
      journalRows: [row({ id: "y", orderNo: "0000177777", side: "S" })],
    };

    render(<TodayOrdersCard />);

    await waitFor(() => expect(listRows()).toHaveLength(1));
    const text = listRows()[0]?.textContent ?? "";
    expect(text).toContain("0000177777");
    expect(text).toContain("매도");
  });

  it("⑨-3 journal: 어제 tradeDate 의 푸시 행은 「오늘 주문」 에 서지 않는다", async () => {
    fetchTodayOrdersMock.mockResolvedValue([]);
    mockRelay = {
      ...EMPTY_RELAY_VALUE,
      journalRows: [row({ id: "old", orderNo: "0000166666", tradeDate: "2000-01-01" })],
    };

    render(<TodayOrdersCard />);

    await waitFor(() =>
      expect(screen.getByTestId("today-orders-empty")).toBeInTheDocument(),
    );
    expect(listRows()).toHaveLength(0);
  });

  it("⑨-4 journal: `{t:\"order\"}` 에만 있는 주문번호는 줄을 만들지 않고 재조회도 부르지 않는다", async () => {
    fetchTodayOrdersMock.mockResolvedValue(THREE_ORDERS);
    mockRelay = { ...EMPTY_RELAY_VALUE, orders: [frame({ no: "0000199999", nt: "A" })] };

    render(<TodayOrdersCard />);

    await waitFor(() => expect(listRows()).toHaveLength(3));
    await new Promise((r) => setTimeout(r, 30));
    expect(listRows()).toHaveLength(3);
    expect(fetchTodayOrdersMock).toHaveBeenCalledTimes(1);
  });
});
