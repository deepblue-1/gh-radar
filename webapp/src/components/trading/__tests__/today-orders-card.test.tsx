import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import type { DmaOrderRow, RelayAccountState, RelayOrderMsg } from "@gh-radar/shared";

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

function row(over: Partial<DmaOrderRow> = {}): DmaOrderRow {
  return {
    id: "id-1",
    accountNo: "1234567801",
    isin: "KR7005930003",
    stockCode: "005930",
    exchange: "KRX",
    market: "K",
    side: "B",
    orderType: "N",
    orgOrderNo: null,
    qty: 10,
    price: 70_000,
    orderNo: "0000135742",
    status: "accepted",
    resultCode: 0,
    noticeType: "A",
    message: null,
    filledQty: 0,
    origin: "manual",
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
const THREE_ORDERS: DmaOrderRow[] = [
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
});
