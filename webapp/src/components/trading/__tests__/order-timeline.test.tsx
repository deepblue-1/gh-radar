import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { JournalOrderRow, OrderTimelineRow } from "@gh-radar/shared";

/**
 * 25-08 Task 2 — `OrderTimeline`(오늘 주문 행 펼침 본문) 계약 (D-01 ~ D-03 · UI-SPEC ① 상태 · 라이브).
 *
 *  ① 마운트 = 조회 1회(`fetchOrderEvents(members[0].id, 구성원 주문번호)`) · 처음 조회 중 「불러오는 중…」 + aria-busy
 *  ② 줄 = 같은 ms 통보 먼저 · 배지 「통보」/「상따」 · 묶음이면 줄 끝 `#주문번호`
 *  ③ 0건 · 실패(role=status + 다시 시도 = 조회 1회) · 재조회 실패는 기존 줄 유지 + 아래 실패 줄
 *  ④ 라이브: 스토어 전략 이벤트는 순서 자리에 끼워 넣는다(재조회 0) · 구성원 lastSeq 상승은 400ms trailing
 *     디바운스 재조회 1회 · 재조회 중 로딩 줄 없음
 */

type RelayShape = ReturnType<typeof import("@/lib/relay-provider").useRelayContext>;
let mockRelay: RelayShape;

vi.mock("@/lib/relay-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/relay-provider")>();
  return { ...actual, useRelayContext: () => mockRelay };
});

const fetchOrderEventsMock = vi.fn<(anchorId: string, orderNos: readonly string[]) => Promise<OrderTimelineRow[]>>();
vi.mock("@/lib/orders-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orders-api")>();
  return {
    ...actual,
    fetchOrderEvents: (anchorId: string, orderNos: readonly string[]) => fetchOrderEventsMock(anchorId, orderNos),
  };
});

import { EMPTY_RELAY_VALUE } from "@/lib/relay-provider";
import { mergeOrderNotices, type MergedOrderNotice } from "@/lib/order-notices";
import {
  BUNDLE_ROWS,
  ROW_12451,
  TIMELINE_12451,
  TIMELINE_BUNDLE,
  strategyRow,
} from "@/test-fixtures/order-timeline";

import { OrderTimeline } from "../order-timeline";

const noticeOf = (rows: JournalOrderRow[]): MergedOrderNotice => {
  const merged = mergeOrderNotices(rows);
  expect(merged).toHaveLength(1);
  return merged[0]!;
};

const items = () => [...document.querySelectorAll<HTMLElement>('[data-slot="order-timeline-item"]')];

/** 해소를 테스트가 쥐는 약속. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  mockRelay = { ...EMPTY_RELAY_VALUE };
  fetchOrderEventsMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("OrderTimeline — 조회 · 상태", () => {
  it("마운트 = 조회 1회 · 처음 조회 중 「불러오는 중…」 + aria-busy → 응답 줄(같은 ms 통보 먼저)", async () => {
    const pending = deferred<OrderTimelineRow[]>();
    fetchOrderEventsMock.mockReturnValue(pending.promise);

    render(<OrderTimeline notice={noticeOf([ROW_12451])} bundled={false} mobile={false} />);

    expect(fetchOrderEventsMock).toHaveBeenCalledTimes(1);
    expect(fetchOrderEventsMock).toHaveBeenCalledWith("ord-12451", ["12451"]);
    expect(screen.getByText("불러오는 중…")).toHaveAttribute("data-slot", "order-timeline-loading");
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();

    await act(async () => pending.resolve(TIMELINE_12451));

    expect(document.querySelector('[data-slot="order-timeline-loading"]')).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    const lines = items();
    expect(lines.map((li) => li.dataset.source)).toEqual([
      "strategy",
      "journal",
      "strategy",
      "journal",
      "strategy",
      "journal",
    ]);
    // 같은 ms(09:45:07.415) 두 줄 — 통보가 먼저.
    expect(lines[3]?.textContent).toContain("09:45:07.415");
    expect(lines[4]?.textContent).toContain("09:45:07.415");
    expect(lines[3]?.textContent).toContain("통보");
    expect(lines[4]?.textContent).toContain("상따");
    expect(lines[3]?.textContent).toContain("체결");
    expect(lines[3]?.textContent).toContain("(누적 100/300)");
    expect(lines[4]?.textContent).toContain("첫 체결");
    // 단건은 주문번호 꼬리 없음.
    expect(lines.some((li) => li.textContent?.includes("#12451"))).toBe(false);
    // 조회는 한 번뿐이다(폴링 없음).
    expect(fetchOrderEventsMock).toHaveBeenCalledTimes(1);
  });

  it("묶음 — 구성원 주문번호 전부로 조회 · 줄마다 #주문번호 꼬리", async () => {
    fetchOrderEventsMock.mockResolvedValue(TIMELINE_BUNDLE);

    render(<OrderTimeline notice={noticeOf(BUNDLE_ROWS)} bundled mobile={false} />);

    await waitFor(() => expect(items().length).toBeGreaterThan(0));
    expect(fetchOrderEventsMock).toHaveBeenCalledWith("ord-12461", [
      "12461",
      "12462",
      "12463",
      "12464",
      "12465",
      "12466",
      "12467",
    ]);
    expect(items()[0]?.textContent).toContain("#12461");
    expect(items().every((li) => /#1246\d/.test(li.textContent ?? ""))).toBe(true);
  });

  it("빈 응답 → 0건 한 줄", async () => {
    fetchOrderEventsMock.mockResolvedValue([]);

    render(<OrderTimeline notice={noticeOf([ROW_12451])} bundled={false} mobile={false} />);

    const empty = await screen.findByText("주문 기록 없음");
    expect(empty).toHaveAttribute("data-slot", "order-timeline-empty");
    expect(items()).toHaveLength(0);
  });

  it("실패 → role=status 안내 + 「다시 시도」 = 조회 1회 → 성공하면 줄", async () => {
    fetchOrderEventsMock.mockRejectedValueOnce(new Error("boom"));
    fetchOrderEventsMock.mockResolvedValueOnce(TIMELINE_12451);

    render(<OrderTimeline notice={noticeOf([ROW_12451])} bundled={false} mobile={false} />);

    const error = await screen.findByText("이벤트를 불러오지 못했어요");
    const box = error.closest('[data-slot="order-timeline-error"]');
    expect(box).toHaveAttribute("role", "status");

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(fetchOrderEventsMock).toHaveBeenCalledTimes(2);

    await waitFor(() => expect(items()).toHaveLength(6));
    expect(document.querySelector('[data-slot="order-timeline-error"]')).toBeNull();
  });

  it("모바일 — 시각 칸 78px · 줄 flex-wrap", async () => {
    fetchOrderEventsMock.mockResolvedValue(TIMELINE_12451);

    render(<OrderTimeline notice={noticeOf([ROW_12451])} bundled={false} mobile />);

    await waitFor(() => expect(items()).toHaveLength(6));
    const li = items()[0]!;
    expect(li.className).toContain("flex-wrap");
    expect(li.querySelector('[data-slot="order-timeline-time"]')?.className).toContain("w-[78px]");
  });
});

describe("OrderTimeline — 라이브 (D-03)", () => {
  it("스토어 전략 이벤트는 순서 자리에 끼워진다 — 재조회 0", async () => {
    // 응답에 대기 줄이 아직 없다(기록 전) → 푸시로 들어온다.
    const withoutQueued = TIMELINE_12451.filter(
      (r) => !(r.source === "strategy" && r.event.seq === strategyRow("queued12451").seq),
    );
    fetchOrderEventsMock.mockResolvedValue(withoutQueued);
    const notice = noticeOf([ROW_12451]);

    const view = render(<OrderTimeline notice={notice} bundled={false} mobile={false} />);
    await waitFor(() => expect(items()).toHaveLength(5));

    mockRelay = {
      ...mockRelay,
      strategyEvents: [strategyRow("exposed"), strategyRow("queued12451"), strategyRow("queued12452")],
    };
    view.rerender(<OrderTimeline notice={notice} bundled={false} mobile={false} />);

    expect(items()).toHaveLength(6);
    // 끝이 아니라 접수(.879)와 체결(07.415) 사이 — 09:45:02.880.
    expect(items()[2]?.textContent).toContain("09:45:02.880");
    expect(items()[2]?.textContent).toContain("대기");
    expect(fetchOrderEventsMock).toHaveBeenCalledTimes(1);
  });

  it("구성원 lastSeq 5회 연속 상승(100ms 간격) → 400ms trailing 뒤 조회 1회 · 재조회 중 로딩 줄 없음", async () => {
    vi.useFakeTimers();
    fetchOrderEventsMock.mockResolvedValueOnce(TIMELINE_12451);
    const second = deferred<OrderTimelineRow[]>();
    fetchOrderEventsMock.mockReturnValueOnce(second.promise);
    const notice = noticeOf([ROW_12451]);

    const view = render(<OrderTimeline notice={notice} bundled={false} mobile={false} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(items()).toHaveLength(6);
    expect(fetchOrderEventsMock).toHaveBeenCalledTimes(1);

    for (let i = 1; i <= 5; i += 1) {
      mockRelay = { ...mockRelay, journalRows: [{ ...ROW_12451, lastSeq: ROW_12451.lastSeq + i }] };
      view.rerender(<OrderTimeline notice={notice} bundled={false} mobile={false} />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
    }
    // 마지막 상승 뒤 100ms — 아직 창 안.
    expect(fetchOrderEventsMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(fetchOrderEventsMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchOrderEventsMock).toHaveBeenCalledTimes(2);
    // 재조회 중 — 기존 줄 유지 · 로딩 줄 없음 · aria-busy 없음.
    expect(items()).toHaveLength(6);
    expect(document.querySelector('[data-slot="order-timeline-loading"]')).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();

    // 한참 기다려도 더 부르지 않는다(주기 타이머 없음).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetchOrderEventsMock).toHaveBeenCalledTimes(2);
    await act(async () => second.resolve(TIMELINE_12451));
  });

  it("재조회 중 또 상승하면 in-flight 뒤 1건으로 접는다", async () => {
    vi.useFakeTimers();
    fetchOrderEventsMock.mockResolvedValueOnce(TIMELINE_12451);
    const second = deferred<OrderTimelineRow[]>();
    fetchOrderEventsMock.mockReturnValueOnce(second.promise);
    fetchOrderEventsMock.mockResolvedValue(TIMELINE_12451);
    const notice = noticeOf([ROW_12451]);

    const view = render(<OrderTimeline notice={notice} bundled={false} mobile={false} />);
    await act(async () => {
      await Promise.resolve();
    });

    const bump = async (n: number) => {
      mockRelay = { ...mockRelay, journalRows: [{ ...ROW_12451, lastSeq: ROW_12451.lastSeq + n }] };
      view.rerender(<OrderTimeline notice={notice} bundled={false} mobile={false} />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });
    };
    await bump(1);
    expect(fetchOrderEventsMock).toHaveBeenCalledTimes(2); // in-flight(second 미해소)
    await bump(2);
    await bump(3);
    expect(fetchOrderEventsMock).toHaveBeenCalledTimes(2); // 접힘 — 진행 중 요청 뒤로
    await act(async () => {
      second.resolve(TIMELINE_12451);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchOrderEventsMock).toHaveBeenCalledTimes(3); // 접힌 1건
  });

  it("재조회 실패 → 기존 줄 유지 + 아래 실패 줄", async () => {
    vi.useFakeTimers();
    fetchOrderEventsMock.mockResolvedValueOnce(TIMELINE_12451);
    fetchOrderEventsMock.mockRejectedValueOnce(new Error("boom"));
    const notice = noticeOf([ROW_12451]);

    const view = render(<OrderTimeline notice={notice} bundled={false} mobile={false} />);
    await act(async () => {
      await Promise.resolve();
    });
    mockRelay = { ...mockRelay, journalRows: [{ ...ROW_12451, lastSeq: ROW_12451.lastSeq + 1 }] };
    view.rerender(<OrderTimeline notice={notice} bundled={false} mobile={false} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(items()).toHaveLength(6);
    const error = document.querySelector('[data-slot="order-timeline-error"]');
    expect(error?.textContent).toContain("이벤트를 불러오지 못했어요");
    // 실패 줄은 타임라인 아래.
    const list = document.querySelector('[data-slot="order-timeline"]')!;
    expect(list.compareDocumentPosition(error!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
