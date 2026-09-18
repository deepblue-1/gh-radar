/**
 * Phase 17 Plan 01 — 전략 표시 헬퍼 (TRADE-04 / D-13 · D-17).
 *
 * 미체결 '매매' 열 표기와 서버 통지 출처 배지를 만드는 **순수함수 둘**. 정본은 gh-trade
 * `client/Services/DMA/NotificationHub.cs` 이고, 이 파일은 그 규칙을 옮긴 것이지 새로
 * 설계한 것이 아니다.
 *
 * 이 두 함수가 존재하는 이유는 하나다 — **표면마다 인라인 접미를 만들지 않기 위해서**다.
 * `account-panel` · `vi-client` · 전략 로그가 각자 문자열을 조립하면 같은 행이 화면마다
 * 다르게 보이고, 어느 쪽이 맞는지 아무도 모르게 된다 (C# 이 네 그리드를 함수 하나로
 * 그리는 것과 같은 이유, Pitfall 12).
 *
 * 공통 규율: **서버 값의 형식·공백 여부·동등 비교만** 본다. 문구 내용을 읽는 분기는 서버가
 * 문구를 바꾸는 순간 조용히 틀어지므로 만들지 않는다 (gh-trade 교훈 24).
 */

import type { OrderSide } from "./relay";

/** Q-ID 주문번호 길이 — `Q` 1자 + 숫자 9자(HHMMSS + 3자리). */
const QUEUED_ORDER_NO_LEN = 10;

/**
 * 예약 ID(Q-ID) 형식인가 — `'Q'` + 숫자 9자리, 총 10자.
 * 서버 `trade::queued::IsQueuedId` · C# `NotificationHub.IsQueuedOrderNo` 와 같은 형식이다.
 *
 * **형식 통과일 뿐 판정이 아니다** — 그 ID 가 살아 있는 예약인지·발사됐는지·취소 가능한지는
 * 서버가 정한다. 거래소 주문번호는 숫자뿐이라 첫 글자 `'Q'` 로 갈린다.
 * 소문자 `'q'` 는 통과하지 않는다 — 대소문자를 접으면 와이어 계약이 아니라 추측이 된다.
 */
function isQueuedOrderNo(orderNo: string): boolean {
  if (orderNo.length !== QUEUED_ORDER_NO_LEN || orderNo[0] !== "Q") return false;
  for (let i = 1; i < QUEUED_ORDER_NO_LEN; i += 1) {
    const ch = orderNo[i]!;
    if (ch < "0" || ch > "9") return false;
  }
  return true;
}

/**
 * 미체결 '매매' 열 표기 — C# `NotificationHub.SideDisplayText`(:172) 동형.
 *
 * 방향 단어(`매수`/`매도`)에 접미 셋을 **누적**으로 붙인다:
 *   1. `Q`     — 주문번호가 Q-ID 형식이다(예약 요약 행).
 *   2. `P`     — `pendingStatus` 가 **비어 있지 않다**(증권사 접수대기 행).
 *   3. `/종가` — `board` 가 `"G2"` 또는 `"G3"` 다(시간외종가 행).
 *
 * ⚠️ **접미는 배타가 아니다.** C# 정본이 세 `if` 를 연달아 적용하므로 Q-ID 이면서 접수대기인
 *    행은 `매수QP` 다. 하나만 붙이면 같은 주문이 WinForms 와 웹에서 다르게 보인다.
 * ⚠️ `pendingStatus` 는 **비어 있는지만** 본다. 문구(`증권사 보관 · 09:00 처리` 등)를 비교해
 *    분기를 만들지 않는다 — 서버가 문구를 교체하면 그 분기는 조용히 죽는다 (D-14 · 교훈 24).
 * ⚠️ 이 문자열은 **표시 전용**이다. 색·취소 라우팅은 이것을 읽지 않는다 — 회색·취소 제외의
 *    근거는 `RelayUnfilled.pendingCancelSent` bool 하나다.
 *
 * @param side          매매 구분. `"B"`=매수 · `"S"`=매도.
 * @param orderNo       주문번호(거래소 10자 또는 Q-ID).
 * @param pendingStatus 접수대기 문구. `""` 면 접미 없음.
 * @param board         시간외종가 구분. `"G2"`/`"G3"` 만 접미가 붙는다.
 */
export function sideDisplayText(
  side: OrderSide,
  orderNo: string,
  pendingStatus: string,
  board: string,
): string {
  let text = side === "B" ? "매수" : "매도";
  if (isQueuedOrderNo(orderNo)) text += "Q";
  if (pendingStatus !== "") text += "P";
  if (board === "G2" || board === "G3") text += "/종가";
  return text;
}

/**
 * 서버 통지(`ServerMessage(54)`) 출처 배지 — D-17.
 *
 * `RelayServerMsg.src` 어휘에 상따·VI 런타임 사유 줄이 더해졌다. 그 둘만 각자의 배지를
 * 받고, 기존 어휘(`SetLimitChaser` · `SetVITrigger` · `Account` · `System`)와 빈 값·미상은
 * 전부 `[서버]` 로 떨어진다.
 *
 * ⚠️ **동등 비교만** 한다. `includes()` · `startsWith()` · `toLowerCase()` · 정규식은 쓰지
 *    않는다 — `"SetLimitChaserResp"` 가 부분일치로 `[상따]` 가 되거나 `"limitchaser"` 가
 *    대소문자 접기로 통과하면, 서버 어휘가 늘어날 때마다 배지가 조용히 틀어진다. 모르는
 *    출처는 모른다고 말하는 `[서버]` 가 유일하게 안전한 방향이다.
 */
export function serverMsgBadge(src: string): string {
  if (src === "LimitChaser") return "[상따]";
  if (src === "VITrigger") return "[VI]";
  return "[서버]";
}
