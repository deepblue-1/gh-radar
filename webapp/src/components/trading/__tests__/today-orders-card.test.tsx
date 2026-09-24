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
 *  ② (Phase 19 D-03 로 삭제 — 옛 라이브 join. 대체: ⑨ journal 원천)
 *  ③ 조회가 `ApiClientError` 로 실패해도 throw 하지 않고 안내 문구로 수렴한다
 *     — 이 카드가 터지면 My page 의 전략·계좌 카드까지 같이 죽는다
 *  ④ 복원 0건은 **로딩과 구분되는** 빈 상태 문구다
 *
 * quick-260910-kql 이 ⑤ 를 더한다 — 종목 칸의 **3단 폴백**(이름 → 코드 → ISIN).
 *  ★ `useIsinLabels` 를 mock 하지 **않는다.** 실물 훅이 아래 `mockRelay` 를 그대로 읽으므로
 *    훅과 컴포넌트의 **연결까지** 함께 잠긴다 — 훅을 스텁하면 잠기는 것은 렌더 분기뿐이다.
 */

// --- 훅 스텁 — 저널 푸시 행·relay 상태를 테스트가 직접 주입한다 -----------------
type RelayShape = ReturnType<typeof import("@/lib/relay-provider").useRelayContext>;

let mockRelay: RelayShape;

vi.mock("@/lib/relay-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/relay-provider")>();
  return { ...actual, useRelayContext: () => mockRelay };
});

// --- 조회 mock — 순수 함수(mergeJournalRows 등)는 **실물**을 쓴다 ---------------
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

  it("⑥-1 신규 매수 주문에 취소확인 통보가 반영되면 행위 단어가 「취소」로 바뀌고 방향색이 죽는다", async () => {
    // orderType 은 여전히 "N"(신규)이다 — 판정 근거는 **통보 종류**지 우리가 보낸 주문 종류가 아니다.
    fetchTodayOrdersMock.mockResolvedValue([
      row({ id: "a", orderNo: "0000135742", side: "B", orderType: "N", lastSeq: 1 }),
    ]);
    // 같은 주문의 더 최신 저널 행(취소확인 C)이 푸시로 왔다.
    mockRelay = {
      ...EMPTY_RELAY_VALUE,
      journalRows: [
        row({
          id: "a",
          orderNo: "0000135742",
          side: "B",
          orderType: "N",
          noticeType: "C",
          status: "cancelled",
          lastSeq: 2,
        }),
      ],
    };

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
    // 저널 행이 통보 사실(board · requester)을 스스로 싣는다. 「수동」 꼬리 제거는 19-08(D-08).
    fetchTodayOrdersMock.mockResolvedValue([
      row({ id: "a", orderNo: "0000135742", side: "B", board: "G2", requester: "Manual" }),
    ]);

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
 * 가득 찬다. 묶기는 그것을 한 줄로 만든다. 저널 행은 모두 통보 사실(`noticeType`)을 가지므로
 * 복원 행과 푸시 행이 **같은 규칙**으로 묶인다(Phase 19 D-03).
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

describe("TodayOrdersCard — 통보 묶기 (17-10 / D-16)", () => {
  it("⑦-1 같은 자동주문의 조각 매도 체결 3건이 한 줄로 그려진다", async () => {
    fetchTodayOrdersMock.mockResolvedValue(AUTO_SELL_FILLS);

    render(<TodayOrdersCard />);

    await waitFor(() => expect(listRows()).toHaveLength(1));
    const text = listRows()[0]?.textContent ?? "";
    expect(text).toContain("#0000200001~0000200003");
    expect(text).toContain("(3건)");
    // 수량은 합계다 — 3 + 5 + 10.
    expect(text).toContain("18");
  });

  it("⑦-3 푸시로만 온 조각 체결도 복원 행과 같은 규칙으로 한 줄에 묶인다", async () => {
    fetchTodayOrdersMock.mockResolvedValue([AUTO_SELL_FILLS[2]]);
    mockRelay = { ...EMPTY_RELAY_VALUE, journalRows: [AUTO_SELL_FILLS[0], AUTO_SELL_FILLS[1]] };

    render(<TodayOrdersCard />);

    await waitFor(() => expect(listRows()).toHaveLength(1));
    expect(listRows()[0]?.textContent).toContain("(3건)");
  });

  it("⑦-3b 출처 미상(origin null) 조각 체결은 묶지 않는다 — 자동주문의 증거가 없다", async () => {
    fetchTodayOrdersMock.mockResolvedValue(AUTO_SELL_FILLS.map((r) => ({ ...r, origin: null })));

    render(<TodayOrdersCard />);

    await waitFor(() => expect(listRows()).toHaveLength(3));
    expect(document.body.textContent).not.toContain("건)");
  });

  it("⑦-4 묶인 행을 펼치는 UI 는 만들지 않는다 (이번 phase 범위 밖)", async () => {
    fetchTodayOrdersMock.mockResolvedValue(AUTO_SELL_FILLS);

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
    // 끊기기 전: 접수로 복원 + 같은 접수 행을 푸시로도 받은 상태.
    fetchTodayOrdersMock.mockResolvedValue([row({ id: "a", status: "accepted", lastSeq: 1 })]);
    mockRelay = {
      ...EMPTY_RELAY_VALUE,
      status: "ready",
      journalRows: [row({ id: "a", status: "accepted", lastSeq: 1 })],
    };
    const view = render(<TodayOrdersCard />);
    await waitFor(() => expect(listRows()).toHaveLength(1));
    expect(listRows()[0]?.textContent).toContain("접수");
    expect(fetchTodayOrdersMock).toHaveBeenCalledTimes(1);

    // 백그라운드 — 소켓이 죽었고, 그 사이 기록기가 체결을 저널에 투영했다.
    mockRelay = { ...mockRelay, status: "reconnecting" };
    view.rerender(<TodayOrdersCard />);
    fetchTodayOrdersMock.mockResolvedValue([
      row({ id: "a", status: "filled", filledQty: 10, noticeType: "E", lastSeq: 2 }),
    ]);

    // 복귀 — 재인증.
    mockRelay = { ...mockRelay, status: "ready" };
    view.rerender(<TodayOrdersCard />);

    await waitFor(() => expect(fetchTodayOrdersMock).toHaveBeenCalledTimes(2));
    // 끊기기 전의 푸시 행(lastSeq 1)이 재조회한 「체결」(lastSeq 2)을 덮으면 안 된다.
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

// ---------------------------------------------------------------------------
// ⑩ journal.state 복구 재조회 (Phase 19 D-04) · 모르는 수량·가격 「—」 (D-08)
// ---------------------------------------------------------------------------

describe("TodayOrdersCard — journal.state 복구 재조회 (Phase 19 D-04)", () => {
  it("⑩-1 journal: delayed → live 전이 1회에 재조회 1회 — 이어받기로 채워진 행을 가져온다", async () => {
    mockRelay = {
      ...EMPTY_RELAY_VALUE,
      status: "ready",
      journalState: { t: "journal.state", s: "delayed", since: "2026-09-25T00:00:00.000Z" },
    };
    const view = render(<TodayOrdersCard />);
    await waitFor(() => expect(screen.getByTestId("today-orders-empty")).toBeInTheDocument());
    expect(fetchTodayOrdersMock).toHaveBeenCalledTimes(1);

    // 기록기가 끊긴 구간을 이어받아 저널을 채웠다.
    fetchTodayOrdersMock.mockResolvedValue([row({ id: "gap", orderNo: "0000155555" })]);
    mockRelay = { ...mockRelay, journalState: { t: "journal.state", s: "live" } };
    view.rerender(<TodayOrdersCard />);

    await waitFor(() => expect(fetchTodayOrdersMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(listRows()).toHaveLength(1));
    expect(listRows()[0]?.textContent).toContain("0000155555");

    // live 가 유지되는 리렌더는 전이가 아니다.
    mockRelay = { ...mockRelay, journalState: { t: "journal.state", s: "live" } };
    view.rerender(<TodayOrdersCard />);
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchTodayOrdersMock).toHaveBeenCalledTimes(2);
  });

  it("⑩-2 journal: live → live 는 재조회하지 않는다 (폴링이 아니다)", async () => {
    mockRelay = { ...EMPTY_RELAY_VALUE, journalState: { t: "journal.state", s: "live" } };
    const view = render(<TodayOrdersCard />);
    await waitFor(() => expect(screen.getByTestId("today-orders-empty")).toBeInTheDocument());

    mockRelay = { ...mockRelay, journalState: { t: "journal.state", s: "live" } };
    view.rerender(<TodayOrdersCard />);
    await new Promise((r) => setTimeout(r, 30));

    expect(fetchTodayOrdersMock).toHaveBeenCalledTimes(1);
  });

  it("⑩-3 journal: 마운트 직후 첫 live(null → live)는 마운트 조회와 같은 시점이다 — 다시 부르지 않는다", async () => {
    mockRelay = { ...EMPTY_RELAY_VALUE, journalState: null };
    const view = render(<TodayOrdersCard />);
    await waitFor(() => expect(screen.getByTestId("today-orders-empty")).toBeInTheDocument());

    mockRelay = { ...mockRelay, journalState: { t: "journal.state", s: "live" } };
    view.rerender(<TodayOrdersCard />);
    await new Promise((r) => setTimeout(r, 30));

    expect(fetchTodayOrdersMock).toHaveBeenCalledTimes(1);
  });

  it("⑩-4 journal: 수량·가격을 모르는 행(로컬 거부)은 「—」 로 그린다 — 0 을 지어내지 않는다", async () => {
    fetchTodayOrdersMock.mockResolvedValue([
      row({
        id: "rej",
        orderNo: null,
        qty: null,
        price: null,
        status: "rejected",
        noticeType: "R",
        resultCode: 804,
      }),
    ]);

    render(<TodayOrdersCard />);

    await waitFor(() => expect(listRows()).toHaveLength(1));
    const values = [...listRows()[0]!.querySelectorAll(".mono")].map((el) => el.textContent);
    // 수량 · 가격 · 주문번호 세 칸이 모두 「—」 다.
    expect(values.filter((v) => v === "—").length).toBeGreaterThanOrEqual(3);
    expect(listRows()[0]?.textContent).toContain("거부");
  });
});

// ---------------------------------------------------------------------------
// ⑪ B′ — 계좌별 묶음 · 출처 칩 · NXT 태그 (Phase 19 D-07 · D-08)
// ---------------------------------------------------------------------------

describe("TodayOrdersCard — B′ 계좌별 묶음 · 출처 칩 · NXT (Phase 19 D-07 · D-08)", () => {
  const ACCT_A = { accountNo: "1234567801", name: "위탁종합" };
  const ACCT_B = { accountNo: "1234567802", name: "위탁CMA" };
  const groupEls = () => [...document.querySelectorAll('[data-slot="today-orders-group"]')];

  it("⑪-1 묶음 순서는 relay 계좌 목록 순 · 목록 밖 계좌는 번호만으로 뒤에 · 소제목 「N건」 은 그 계좌 행 수", async () => {
    // 서버 정렬(최신 먼저) 그대로 — B 가 가장 최신이어도 묶음은 A 가 먼저다.
    fetchTodayOrdersMock.mockResolvedValue([
      row({ id: "b1", accountNo: ACCT_B.accountNo, orderNo: "0000000001", createdAt: "2026-09-10T00:13:00.000Z" }),
      row({ id: "a1", accountNo: ACCT_A.accountNo, orderNo: "0000000002", createdAt: "2026-09-10T00:12:00.000Z" }),
      row({ id: "x1", accountNo: "9999999901", orderNo: "0000000003", createdAt: "2026-09-10T00:11:00.000Z" }),
      row({ id: "a2", accountNo: ACCT_A.accountNo, orderNo: "0000000004", createdAt: "2026-09-10T00:10:00.000Z" }),
    ]);
    mockRelay = { ...EMPTY_RELAY_VALUE, accounts: [ACCT_A, ACCT_B] };

    render(<TodayOrdersCard />);

    await waitFor(() => expect(groupEls()).toHaveLength(3));
    expect(groupEls().map((el) => el.getAttribute("data-account"))).toEqual([
      ACCT_A.accountNo,
      ACCT_B.accountNo,
      "9999999901",
    ]);
    const [a, b, x] = groupEls();
    expect(a?.textContent).toContain("계좌");
    expect(a?.textContent).toContain(ACCT_A.accountNo);
    expect(a?.textContent).toContain("위탁종합");
    expect(a?.textContent).toContain("2건");
    expect(b?.textContent).toContain("위탁CMA");
    expect(b?.textContent).toContain("1건");
    // 목록 밖 계좌 — 상품명을 지어내지 않는다.
    expect(x?.textContent).not.toContain("위탁");
    expect(x?.querySelectorAll('[data-slot="today-order-row"]')).toHaveLength(1);
    // 계좌 A 묶음 안의 순서는 입력(최신 먼저) 그대로다.
    const aRows = [...(a?.querySelectorAll('[data-slot="today-order-row"]') ?? [])];
    expect(aRows[0]?.textContent).toContain("0000000002");
    expect(aRows[1]?.textContent).toContain("0000000004");
  });

  it("⑪-2 행이 없는 계좌는 묶음을 그리지 않는다", async () => {
    fetchTodayOrdersMock.mockResolvedValue([row({ id: "a1", accountNo: ACCT_A.accountNo })]);
    mockRelay = { ...EMPTY_RELAY_VALUE, accounts: [ACCT_A, ACCT_B] };

    render(<TodayOrdersCard />);

    await waitFor(() => expect(groupEls()).toHaveLength(1));
    expect(groupEls()[0]?.getAttribute("data-account")).toBe(ACCT_A.accountNo);
    expect(document.body.textContent).not.toContain("위탁CMA");
  });

  it("⑪-3 출처 칩 — limit_chaser 「상따」 · vi 「VI」 · manual 「수동」 · null 은 칩 없음", async () => {
    fetchTodayOrdersMock.mockResolvedValue([
      row({ id: "lc", orderNo: "0000000011", origin: "limit_chaser", createdAt: "2026-09-10T00:14:00.000Z" }),
      row({ id: "vi", orderNo: "0000000012", origin: "vi", createdAt: "2026-09-10T00:13:00.000Z" }),
      row({ id: "mn", orderNo: "0000000013", origin: "manual", createdAt: "2026-09-10T00:12:00.000Z" }),
      row({ id: "nu", orderNo: "0000000014", origin: null, createdAt: "2026-09-10T00:11:00.000Z" }),
    ]);
    mockRelay = { ...EMPTY_RELAY_VALUE, accounts: [ACCT_A] };

    render(<TodayOrdersCard />);

    await waitFor(() => expect(listRows()).toHaveLength(4));
    const chipOf = (el: Element | undefined) =>
      [...(el?.querySelectorAll('[data-slot="today-order-origin"]') ?? [])].map((c) => c.textContent);
    const rowsEls = [...listRows()];
    expect(chipOf(rowsEls[0])).toEqual(["상따"]);
    expect(chipOf(rowsEls[1])).toEqual(["VI"]);
    expect(chipOf(rowsEls[2])).toEqual(["수동"]);
    // 출처 미상 — 「수동」 으로 그리면 거짓일 수 있다(D-08 보충 · T-19-30).
    expect(chipOf(rowsEls[3])).toEqual([]);
    // 칩은 account-panel 출처 태그와 같은 클래스다(새 색 없음).
    const chip = rowsEls[0]?.querySelector('[data-slot="today-order-origin"]');
    expect(chip?.className).toContain("bg-[var(--muted)]");
    expect(chip?.className).toContain("text-[var(--muted-fg)]");
  });

  it("⑪-4 NXT 행에만 거래소 태그가 붙고 KRX 행에는 없다", async () => {
    fetchTodayOrdersMock.mockResolvedValue([
      row({ id: "nxt", orderNo: "0000000021", exchange: "NXT", createdAt: "2026-09-10T00:12:00.000Z" }),
      row({ id: "krx", orderNo: "0000000022", exchange: "KRX", createdAt: "2026-09-10T00:11:00.000Z" }),
    ]);

    render(<TodayOrdersCard />);

    await waitFor(() => expect(listRows()).toHaveLength(2));
    const [nxt, krx] = [...listRows()];
    const nxtTags = nxt?.querySelectorAll('[data-slot="exchange-tag"]') ?? [];
    expect(nxtTags).toHaveLength(1);
    expect(nxtTags[0]?.getAttribute("data-exchange")).toBe("NXT");
    expect(krx?.querySelectorAll('[data-slot="exchange-tag"]')).toHaveLength(0);
    // 데스크톱 표에도 같은 규칙 — NXT 행 1개에만.
    const tableTags = document.querySelectorAll(
      '[data-slot="today-order-table-row"] [data-slot="exchange-tag"]',
    );
    expect(tableTags).toHaveLength(1);
  });

  it("⑪-5 데스크톱 표 머리는 시각 · 종목 · 구분 · 출처 · 수량 · 가격 · 상태 · 주문번호 (출처가 구분 바로 뒤)", async () => {
    fetchTodayOrdersMock.mockResolvedValue([row({ id: "a1" })]);

    render(<TodayOrdersCard />);

    await waitFor(() => expect(listRows()).toHaveLength(1));
    const heads = [...document.querySelectorAll("th")].map((th) => th.textContent?.trim());
    expect(heads).toEqual(["시각", "종목", "구분", "출처", "수량", "가격", "상태", "주문번호"]);
  });

  it("⑪-6 통보 묶기는 계좌 경계를 넘지 않는다 — 두 계좌의 조각 체결은 따로 접힌다", async () => {
    fetchTodayOrdersMock.mockResolvedValue([
      ...AUTO_SELL_FILLS.slice(0, 2).map((r) => ({ ...r, accountNo: ACCT_A.accountNo })),
      { ...AUTO_SELL_FILLS[2]!, accountNo: ACCT_B.accountNo },
    ]);
    mockRelay = { ...EMPTY_RELAY_VALUE, accounts: [ACCT_A, ACCT_B] };

    render(<TodayOrdersCard />);

    await waitFor(() => expect(groupEls()).toHaveLength(2));
    expect(groupEls()[0]?.querySelectorAll('[data-slot="today-order-row"]')).toHaveLength(1);
    expect(groupEls()[0]?.textContent).toContain("(2건)");
    expect(groupEls()[1]?.querySelectorAll('[data-slot="today-order-row"]')).toHaveLength(1);
    expect(groupEls()[1]?.textContent).not.toContain("건)");
  });
});
