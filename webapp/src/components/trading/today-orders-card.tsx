"use client";

/**
 * TodayOrdersCard — My page 의 「오늘 주문」 (RELAY-02 / D-24, quick-260910-jce).
 *
 * ① 무엇을 메우는가
 *   주문 **접수**는 16-16 이 wss 단일 경로로 옮겼지만 **복원**은 옮기지 않았다. 서버
 *   `GET /api/orders` 라우트는 살아 있는데 호출자가 0건이라, 새로고침하면 오늘 낸 주문이
 *   화면에서 사라졌다. 이 카드가 그 호출자다.
 *
 * ② ★ 조회는 **페이지당 1회**다
 *   마운트 시 한 번 부른다. 계좌 카드(`AccountPanel`) 안에 넣지 않은 이유가 여기 있다 —
 *   그 컴포넌트는 4표면이 공유하고 My page 에서는 **계좌마다 한 벌씩** 렌더되므로, 계좌가
 *   2개면 계좌 축이 없는 같은 응답을 2번 부르게 된다(`listTodayOrders` 는 `user_id` 로만
 *   거른다). T-16-02 의 취지(표면마다 조회 경로를 늘리지 않는다)는 유지된다 — 늘어난
 *   조회 표면은 **하나**다.
 *
 * ③ ★ 라이브 프레임으로 행을 **만들지 않는다**
 *   `RelayOrderMsg` 는 `side`·`isin`·`accountNo` 를 의도적으로 싣지 않는다(취소·정정 통보의
 *   매매구분은 믿을 수 없다). 합성하면 트레이더가 방향을 읽는 매매구분 칸이 빈 줄이 선다.
 *   대신 복원 목록에 없는 주문번호가 나오면 **그 번호당 최대 1회** 재조회한다 — 페이지 로드
 *   이후 낸 주문이 「오늘 주문」이라는 이름의 목록에서 빠지는 것을 막기 위해서다.
 *   ★ 루프가 될 수 없다: 이미 요청한 주문번호를 `requestedRef` 의 Set 에 **먼저 넣고** 부르므로,
 *     재조회 응답에 그 번호가 여전히 없어도 두 번째 재조회는 일어나지 않는다. 폴링이 아니다.
 *
 * ④ ★ 실패는 **이 카드 안에서** 수렴한다
 *   조회가 깨져도 throw 하지 않는다. 이 카드가 터지면 같은 트리의 전략·계좌 카드까지
 *   함께 죽는다 — 주문 목록 하나 때문에 잔고를 못 보는 것이 훨씬 나쁘다.
 *
 * ⑤ ★ 좁은 폭에서는 표가 아니라 **카드 행**이다 (account-panel 헤더 ⑧ 과 같은 규율)
 *   flex 자식 중 `flex:1 1 auto; min-width:0` 은 **종목 칸 하나뿐**이고 나머지는 전부
 *   `flex-none` 이다. 이 규칙이 어긋나면 스크롤이 아니라 **조용한 잘림**이 된다
 *   (`tasks/lessons.md` 등재 함정). 색 토큰도 account-panel 이 쓰는 것만 쓴다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { DmaOrderRow } from "@gh-radar/shared";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fetchTodayOrders,
  mergeTodayOrders,
  orderDisplayStatus,
  type OrderDisplayStatus,
} from "@/lib/orders-api";
import { useRelayContext } from "@/lib/relay-provider";
import { cn } from "@/lib/utils";

const KRW = new Intl.NumberFormat("ko-KR");

/**
 * 주문 시각 — `created_at`(UTC ISO) 을 **KST** 로 읽는다.
 * 브라우저 시간대에 맡기면 해외에서 접속한 화면만 조용히 다른 시각을 그린다.
 */
const KST_TIME = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** 모르는 모양은 지어내지 않고 `—` 로 둔다(me-client `formatServerTime` 과 같은 규율). */
function orderTime(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? "—" : KST_TIME.format(at);
}

/** 표시용 종목 — 단축코드가 없으면(상장폐지) ISIN 으로 폴백한다. 기록은 남아야 한다. */
function stockLabel(row: DmaOrderRow): string {
  return row.stockCode ?? row.isin;
}

export function TodayOrdersCard() {
  const { orders } = useRelayContext();

  /** `null` = 아직 한 번도 응답을 못 받음(로딩). `[]` = 오늘 주문이 정말 없음. */
  const [restored, setRestored] = useState<DmaOrderRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  /** 재조회를 이미 요청한 주문번호. 같은 번호로 두 번 부르지 않는다(위 ③). */
  const requestedRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const rows = await fetchTodayOrders();
      setRestored(rows);
      setFailed(false);
    } catch {
      /*
        어떤 실패든 여기서 멈춘다(위 ④). 실패 사유를 화면에 풀어 쓰지 않는다 —
        401/500/타임아웃 중 무엇이든 사용자가 할 일은 같다(다시 열어 보기).
      */
      setRestored([]);
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const { rows, unmatchedOrderNos } = useMemo(
    () => mergeTodayOrders(restored ?? [], orders),
    [restored, orders],
  );

  useEffect(() => {
    // 최초 응답 전에는 「없다」를 판정할 수 없다 — 전부 unmatched 로 보여 헛돈다.
    if (restored === null || failed) return;
    const fresh = unmatchedOrderNos.filter((no) => !requestedRef.current.has(no));
    if (fresh.length === 0) return;
    // ★ 부르기 **전에** 표시한다 — 응답에 여전히 없어도 재진입하지 않는다.
    for (const no of fresh) requestedRef.current.add(no);
    void load();
  }, [restored, failed, unmatchedOrderNos, load]);

  return (
    <section
      data-slot="today-orders-card"
      aria-label="오늘 주문"
      className="flex flex-col gap-[var(--s-2)] rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--card)] px-[var(--s-3)] py-[var(--s-3)]"
    >
      <div className="flex min-w-0 items-center gap-[var(--s-2)]">
        <h2 className="text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">오늘 주문</h2>
        {rows.length > 0 && (
          <span className="mono flex-none text-[length:var(--t-caption)] text-[var(--muted-fg)]">
            {rows.length}건
          </span>
        )}
      </div>

      {failed ? (
        <p
          role="status"
          data-testid="today-orders-error"
          className="rounded-[var(--r-md)] border border-dashed border-[var(--border)] px-[var(--s-4)] py-[var(--s-4)] text-center text-[length:var(--t-sm)] text-[var(--muted-fg)]"
        >
          오늘 주문 목록을 불러오지 못했어요. 잔고·미체결은 위 계좌 카드에서 그대로 볼 수 있어요.
        </p>
      ) : restored === null ? (
        <p
          data-testid="today-orders-loading"
          aria-busy="true"
          className="rounded-[var(--r-md)] border border-dashed border-[var(--border)] px-[var(--s-4)] py-[var(--s-4)] text-center text-[length:var(--t-sm)] text-[var(--muted-fg)]"
        >
          오늘 주문을 불러오는 중이에요…
        </p>
      ) : rows.length === 0 ? (
        <div
          data-testid="today-orders-empty"
          className="flex flex-col items-center gap-1 rounded-[var(--r-md)] border border-dashed border-[var(--border)] px-[var(--s-4)] py-[var(--s-5)] text-center"
        >
          <p className="text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
            오늘 낸 주문이 없어요
          </p>
          <p className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
            주문을 넣으면 접수·체결·취소가 여기에 모두 남아요.
          </p>
        </div>
      ) : (
        <>
          {/* 데스크톱(≥1280) — 표 */}
          <div className="max-[1279px]:hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">시각</TableHead>
                  <TableHead scope="col">종목</TableHead>
                  <TableHead scope="col">구분</TableHead>
                  <TableHead scope="col" className="num">
                    수량
                  </TableHead>
                  <TableHead scope="col" className="num">
                    가격
                  </TableHead>
                  <TableHead scope="col">상태</TableHead>
                  <TableHead scope="col">주문번호</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} data-slot="today-order-table-row">
                    <TableCell className="mono text-[length:var(--t-caption)]">
                      {orderTime(row.createdAt)}
                    </TableCell>
                    <TableCell className="mono text-[length:var(--t-caption)]">
                      {stockLabel(row)}
                    </TableCell>
                    <TableCell>
                      <SideTag side={row.side} cancel={row.orderType === "C"} />
                    </TableCell>
                    <TableCell className="num mono text-[length:var(--t-caption)]">
                      {KRW.format(row.qty)}
                    </TableCell>
                    <TableCell className="num mono text-[length:var(--t-caption)]">
                      {KRW.format(row.price)}
                    </TableCell>
                    <TableCell>
                      <StatusTag shown={orderDisplayStatus(row)} />
                    </TableCell>
                    <TableCell className="mono text-[length:var(--t-caption)]">
                      {row.orderNo ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* 모바일(<1280) — 2줄 카드 행 (위 ⑤) */}
          <div
            data-slot="today-orders-list"
            className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[var(--r-md)] border border-[var(--border)] min-[1280px]:hidden"
          >
            {rows.map((row) => (
              <div
                key={row.id}
                data-slot="today-order-row"
                className="min-w-0 px-[var(--s-3)] py-[var(--s-2)]"
              >
                {/* ①줄 — 종목(유일한 신축 항목) · 구분 · (우) 상태 */}
                <div className="flex min-w-0 items-center gap-[var(--s-2)]">
                  <span className="mono min-w-0 flex-1 truncate text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
                    {stockLabel(row)}
                  </span>
                  <span className="flex flex-none items-center gap-1">
                    <SideTag side={row.side} cancel={row.orderType === "C"} />
                  </span>
                  <span className="ml-auto flex flex-none items-center gap-1">
                    <StatusTag shown={orderDisplayStatus(row)} />
                  </span>
                </div>
                {/* ②줄 — 시각 · 수량 · 가격 · (우) 주문번호 */}
                <div className="mt-1 flex min-w-0 items-center gap-[var(--s-2)]">
                  <span className="flex flex-none items-center gap-1">
                    <RowValue>{orderTime(row.createdAt)}</RowValue>
                  </span>
                  <span className="flex flex-none items-center gap-1">
                    <RowKey>수량</RowKey>
                    <RowValue>{KRW.format(row.qty)}</RowValue>
                  </span>
                  <span className="flex flex-none items-center gap-1">
                    <RowKey>가격</RowKey>
                    <RowValue>{KRW.format(row.price)}</RowValue>
                  </span>
                  <span className="ml-auto flex flex-none items-center gap-1">
                    <RowKey>주문</RowKey>
                    <RowValue>{row.orderNo ?? "—"}</RowValue>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** 카드 행의 라벨(11px 중립). **`flex:none`** 이라 숫자를 밀어내지 않는다. */
function RowKey({ children }: { children: ReactNode }) {
  return <span className="text-[11px] text-[var(--muted-fg)]">{children}</span>;
}

/** 카드 행의 값(mono·tabular). 이것도 `flex:none` 이어야 잘리지 않는다. */
function RowValue({ children }: { children: ReactNode }) {
  return (
    <span className="mono whitespace-nowrap text-[length:var(--t-caption)] font-semibold text-[var(--fg)]">
      {children}
    </span>
  );
}

/**
 * 매매 구분 — **부호 + 라벨 병기**로 색에 의존하지 않는다(WCAG 1.4.1, account-panel 과 동형).
 * 취소 주문은 방향색을 쓰지 않는다 — 「매수 취소」를 빨강으로 그리면 신규 매수와 헷갈린다.
 */
function SideTag({ side, cancel }: { side: DmaOrderRow["side"]; cancel: boolean }) {
  const buy = side === "B";
  if (cancel) {
    return (
      <span className="whitespace-nowrap text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)]">
        {buy ? "매수 취소" : "매도 취소"}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "whitespace-nowrap text-[length:var(--t-caption)] font-semibold",
        buy ? "text-[var(--up)]" : "text-[var(--down)]",
      )}
    >
      {buy ? "▲ 매수" : "▼ 매도"}
    </span>
  );
}

/** 상태 배지 — 색은 톤 3종만 쓴다(account-panel 이 쓰는 토큰과 같은 집합). */
function StatusTag({ shown }: { shown: OrderDisplayStatus }) {
  return (
    <span
      data-slot="today-order-status"
      data-tone={shown.tone}
      className={cn(
        "whitespace-nowrap rounded-[var(--r-sm)] bg-[var(--muted)] px-1.5 py-0.5 text-[11px] font-semibold",
        shown.tone === "danger" && "text-[var(--destructive)]",
        shown.tone === "muted" && "text-[var(--muted-fg)]",
        shown.tone === "normal" && "text-[var(--fg)]",
      )}
    >
      {shown.label}
    </span>
  );
}
