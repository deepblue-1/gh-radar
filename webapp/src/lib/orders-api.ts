/**
 * orders-api — 「오늘 주문」 복원 조회 + 라이브 병합 (RELAY-02 / D-24, quick-260910-jce).
 *
 * ① 무엇을 푸는가
 *   주문 **접수**는 16-16 에서 wss 단일 경로(D-02)로 옮겨졌지만 **복원**은 옮겨지지 않았다.
 *   서버 `GET /api/orders` 라우트는 살아 있는데 `webapp/src` 전체에 호출자가 0건이었다 —
 *   그래서 새로고침하면 오늘 낸 주문이 화면에서 사라졌다. 이 모듈이 그 호출자다.
 *
 * ② ★ `date` 쿼리를 붙이지 않는다
 *   서버가 공유 `kstDateIso()` 로 KST 오늘을 계산하고 **그것이 정본**이다(`services/dma-orders.ts`
 *   의 `kstDayRangeUtc`). 브라우저에서 KST 를 한 번 더 계산하면 두 벌이 되고, 두 벌이 되는
 *   순간 한쪽만 고쳐진다(자정·서머타임 없는 KST 라도 「어느 시계를 믿는가」가 갈린다).
 *   그래서 요청 URL 은 쿼리 문자열 없는 `/api/orders` 다.
 *
 * ③ ★ 라이브 프레임은 행을 **만들 수 없다**, 덮어쓸 수만 있다
 *   `RelayOrderMsg` 는 `side`·`isin`·`accountNo` 를 의도적으로 싣지 않는다
 *   (`relay/src/hub/subscription-hub.ts` — 취소·정정 통보의 매매구분은 믿을 수 없다).
 *   그 프레임으로 행을 합성하면 트레이더가 방향을 읽는 **매매구분 칸이 빈 줄**이 화면에 선다.
 *   그래서 짝을 못 찾은 라이브 주문번호는 행이 아니라 `unmatchedOrderNos` 로 **보고만** 한다.
 *
 * ④ 응답은 bare array 다
 *   `routes/orders.ts` 가 `DmaOrderRow[]` 를 그대로 반환한다(scanner/themes/news/chat 과 같은
 *   규약). envelope 을 언랩하지 않는다.
 */

import type { DmaOrderRow, DmaOrderStatus, RelayOrderMsg } from "@gh-radar/shared";

import { authFetch } from "./auth-fetch";

/** 복원 행 + 그 주문의 **가장 최신** 라이브 통보(없으면 null). */
export type TodayOrderRow = DmaOrderRow & { live: RelayOrderMsg | null };

export interface MergeTodayOrdersResult {
  rows: TodayOrderRow[];
  /**
   * 복원 스냅샷에 없는 라이브 주문번호(중복 제거, 라이브 배열 순서 보존).
   *
   * 순수 함수가 **판정만** 하고 처리(재조회)는 컴포넌트가 한다 — 「화면에 없는 주문이
   * 생겼다」는 사실은 순수하게 판정할 수 있어서 타이머 없이 단위 테스트로 잠기고,
   * 무엇을 할지는 표면마다 다르기 때문이다.
   */
  unmatchedOrderNos: string[];
}

/**
 * 오늘(KST) 내 주문 전체를 복원한다. `requireAuth` 라우트라 Bearer 가 필수다.
 * 세션이 없으면 서버 왕복 없이 `ApiClientError`(UNAUTHENTICATED) 로 끝난다.
 */
export function fetchTodayOrders(): Promise<DmaOrderRow[]> {
  return authFetch<DmaOrderRow[]>("/api/orders");
}

/**
 * 복원 스냅샷 × 라이브 프레임 → 화면 행.
 *
 * ★ 병합 키는 `orderNo` **하나뿐**이다. `rid` 는 `order.new`/`order.cancel`/`order.result`
 *   세 타입에만 있고 `{t:"order"}` 푸시에도 `dma_orders` 에도 없다.
 *
 * ★ 라이브가 이긴다. `{t:"order"}` 는 접수·체결·취소확인·거부가 전부 통과하는 단일 통보
 *   경로이고 REST 스냅샷보다 언제나 나중이다.
 */
export function mergeTodayOrders(
  restored: readonly DmaOrderRow[],
  live: readonly RelayOrderMsg[],
): MergeTodayOrdersResult {
  /*
    ★ `no` 당 **첫 등장만** 취한다.
      `use-relay-socket.ts` 의 리듀서가 `[frame, ...state.orders]` 로 **앞에 붙이고 중복을
      제거하지 않는다** — 같은 `no` 가 A → E → C 로 여러 번 들어 있고 **index 0 이 가장
      최신**이다. 순회하며 무조건 `set` 하면 마지막 쓰기(=가장 오래된 프레임)가 남아
      「이미 취소된 주문이 접수로 보이는」 역전이 난다.
  */
  const latestByNo = new Map<string, RelayOrderMsg>();
  for (const frame of live) {
    if (frame.no === "") continue;
    if (!latestByNo.has(frame.no)) latestByNo.set(frame.no, frame);
  }

  const rows: TodayOrderRow[] = restored.map((row) => ({
    ...row,
    // `orderNo` 가 null 인 행(접수 전 거부·타임아웃)은 키가 없어 어떤 프레임과도 만나지 않는다.
    live: row.orderNo === null ? null : (latestByNo.get(row.orderNo) ?? null),
  }));

  const restoredNos = new Set(
    restored.map((row) => row.orderNo).filter((no): no is string => no !== null),
  );
  const unmatchedOrderNos = [...latestByNo.keys()].filter((no) => !restoredNos.has(no));

  // 정렬은 복원 순서(created_at DESC)를 그대로 보존한다 — 서버가 정본이다.
  return { rows, unmatchedOrderNos };
}

/** 표시 라벨 + 톤. 톤은 account-panel 이 쓰는 색 토큰 집합과 같은 축이다. */
export interface OrderDisplayStatus {
  label: string;
  tone: "normal" | "muted" | "danger";
}

/** 라이브 통보 1자(A/E/C/R) → 표시. 모르는 글자는 **해석하지 않는다**. */
const NOTICE_LABELS: Readonly<Record<string, OrderDisplayStatus>> = {
  A: { label: "접수", tone: "normal" },
  /*
    ★ "체결"까지만 말한다. `RelayOrderMsg` 에는 **체결수량이 없어** 전량인지 부분인지 알 수
      없다. 모르는 것을 지어내면 그 숫자로 매도 판단이 난다(account-panel 헤더 ⑤ 와 같은 규율).
  */
  E: { label: "체결", tone: "normal" },
  C: { label: "취소", tone: "muted" },
  R: { label: "거부", tone: "danger" },
};

/** 복원 행 status → 표시. `dma_orders.status` 7종을 전부 덮는다. */
const STATUS_LABELS: Readonly<Record<DmaOrderStatus, OrderDisplayStatus>> = {
  requested: { label: "요청", tone: "muted" },
  accepted: { label: "접수", tone: "normal" },
  rejected: { label: "거부", tone: "danger" },
  filled: { label: "체결", tone: "normal" },
  partially_filled: { label: "부분체결", tone: "normal" },
  cancelled: { label: "취소", tone: "muted" },
  // ★ timeout 은 "실패"가 아니라 **"결과를 모름"** 이다 (Pitfall 9) — 재주문을 유도하지 않는다.
  timeout: { label: "결과 확인 중", tone: "muted" },
};

/**
 * 그 행에 무엇이라고 쓸지 고른다.
 *
 * 라이브가 이기지만 **`DmaOrderStatus` 값을 라이브로 덮어쓰지는 않는다** — 표시만 바꾼다.
 * 상태값 자체는 서버가 같은 행에 쓰고, 다음 조회에서 정본으로 다시 온다.
 */
export function orderDisplayStatus(row: TodayOrderRow): OrderDisplayStatus {
  const byNotice = row.live === null ? undefined : NOTICE_LABELS[row.live.nt];
  return byNotice ?? STATUS_LABELS[row.status] ?? { label: row.status, tone: "muted" };
}
