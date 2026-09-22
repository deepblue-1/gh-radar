/**
 * Phase 16 Plan 08 — 주문 통보(51) → `dma_orders` 상태 판정. **HTTP·wss 공용**이다.
 *
 * 이 세 값은 원래 `order-api.ts`(REST 주문 라우트) 안에 있었다. D-02 로 주문 경로가
 * wss 로 이관되면서 두 경로가 **같은 판정**을 써야 하는데, REST 파일은 16-16 에서
 * 통째로 지워진다 — 거기에 두면 삭제와 함께 wss 경로가 무너진다. 그래서 어느 표면에도
 * 속하지 않는 중립 모듈로 옮겼다. **이동일 뿐 로직 변경은 0 이다.**
 *
 * 하지 않는 것:
 *   - 여기서 프레임을 만들지 않는다. 판정만 하고 전송·기록은 호출자가 한다.
 *   - `noticeType` 을 해석해 새 상태를 발명하지 않는다. `dma_orders.status` CHECK 에
 *     있는 7종 밖으로 나가면 그 행의 갱신이 통째로 사라진다.
 */
import type { DmaOrderStatus } from "@gh-radar/shared";

import type { ParsedOrderResp } from "../dma/envelope.js";

/**
 * 첫 `OrderResp(51)` 대기 상한(ms) = 5초 (D-22).
 *
 * 이 시간을 넘긴 것은 **실패가 아니라 "결과를 모름"** 이다 (Pitfall 9). 주문은 이미
 * 나갔을 수 있으므로 여기서 "실패"라고 말하면 사용자가 재주문해 중복 체결이 난다.
 */
export const ORDER_RESP_TIMEOUT_MS = 5000;

/**
 * 통보 → `dma_orders.status`.
 *
 * @param requestedQty 주문수량. **모르면 `null`** 이다 — 접수 이후에 도착하는 통보는
 *                     대기 항목이 이미 사라져 원주문 수량을 알 수 없다.
 *
 * `notice_type` 이 비어 있는 구 서버 응답은 `result_code` 로만 판정한다 — 필드 부재를
 * 오류로 다루지 않는다 (fbs D-04).
 *
 * 체결("E")은 주문수량을 알 때만 상태를 정한다. 모르는 채로 "부분체결"이라고 적으면
 * **전량 체결된 주문이 화면에 부분체결로 남는다** — 지어내는 대신 `undefined` 를 돌려
 * `filled_qty` 만 갱신하고, 전량/부분 판정은 행의 `qty` 를 쥔 쪽(server·UI)에 맡긴다.
 */
export function statusOf(
  notice: ParsedOrderResp,
  requestedQty: number | null,
): DmaOrderStatus | undefined {
  switch (notice.noticeType) {
    case "R":
      return "rejected";
    case "A":
      return "accepted";
    case "C":
      return "cancelled";
    case "M":
      // 정정확인은 자기 정정(Phase 18 D-21) 또는 세션에 합류한 다른 단말 정정의 결과다 — 접수로 읽는다.
      return "accepted";
    case "E":
      // 체결 통보의 `quantity` 는 체결수량이다 (서버 `useExecuted` 분기).
      if (requestedQty === null) return undefined;
      return notice.quantity >= requestedQty ? "filled" : "partially_filled";
    default:
      return notice.resultCode === 0 ? "accepted" : "rejected";
  }
}

/**
 * 통보에서 읽어야 할 체결수량. **체결 통보에서만** 의미가 있다.
 *
 * 접수·거부·취소확인의 `quantity` 는 **주문**수량이라(fbs 주석) 그것을 `filled_qty` 로
 * 쓰면 접수 즉시 "전량 체결"로 기록된다.
 */
export function filledQtyOf(notice: ParsedOrderResp): number | undefined {
  return notice.noticeType === "E" ? notice.quantity : undefined;
}

/**
 * `dma_orders.status` 순위 (Phase 18 Plan 33 / R3-WR-01 · D-27). **7종 전부를 화이트리스트로
 * 적는다** — 모르는 값을 지어내지 않는 이 모듈의 규율이다. `Record<DmaOrderStatus, …>` 라 상태가
 * 늘면 여기서 컴파일이 깨진다.
 *
 *   - `requested`·`timeout` 0 — `timeout` 은 실패가 아니라 **「결과 모름」** 이다(Pitfall 9).
 *     그래서 늦게 온 접수가 그것을 풀 수 있어야 한다(`timeout → accepted`).
 *   - `accepted` 1 < `partially_filled` 2 < 종결 3(`filled`·`cancelled`·`rejected`).
 */
const STATUS_RANK: Readonly<Record<DmaOrderStatus, number>> = {
  requested: 0,
  timeout: 0,
  accepted: 1,
  partially_filled: 2,
  filled: 3,
  cancelled: 3,
  rejected: 3,
};

/** 종결 상태. 종결 사이의 이동(`cancelled → filled` 등)은 금지 — 같은 값 재기록만 허용한다. */
const TERMINAL: ReadonlySet<DmaOrderStatus> = new Set<DmaOrderStatus>(["filled", "cancelled", "rejected"]);

/**
 * 「이 상태(`next`)로 갱신해도 되는 **기존** 상태 집합」 — 상태 단조성 판정의 **유일 지점**이다
 * (Phase 18 Plan 33 / R3-WR-01).
 *
 * = `next` 자신 ∪ (종결이 아니고 순위가 `next` 이하인 상태).
 *
 * 왜 필요한가: 18-25(GC-WR-01)가 「체결 E(Modify)가 정정 대기를 **먼저** 정산」 하는 경로를
 * 열었다. 그 뒤 지연된 정정확인 M 은 대기가 없어 `recordUnmatched` 수동 분기로 가고, 방금
 * 체결로 채운 행을 찾아 `statusOf(M) = "accepted"` 로 덮는다 — 전량 체결된 정정이 감사 기록에
 * 영구히 「접수」 로 남는다. 통보 순서는 게이트웨이 타이밍이 정하므로 relay 가 도착 순서로
 * 막을 수 없다. 그래서 **행이 이미 더 진행됐으면 되돌리지 않는다** 를 쓰기 경로의 규칙으로 둔다.
 *
 * 이 집합은 `supabaseOrderSink` 가 UPDATE 의 조건부 `status IN (…)` 필터로 쓴다 — 판정은
 * Postgres 가 UPDATE 한 문장 안에서 원자적으로 한다(읽고 판정하면 큐에 먼저 들어간 갱신과 경합).
 */
export function replaceableStatusesOf(next: DmaOrderStatus): readonly DmaOrderStatus[] {
  const rank = STATUS_RANK[next];
  return (Object.keys(STATUS_RANK) as DmaOrderStatus[]).filter(
    (cur) => cur === next || (!TERMINAL.has(cur) && STATUS_RANK[cur] <= rank),
  );
}
