/**
 * order-notices — 주문 통보의 **행위 단어**와 **묶기** 순수함수 (17-10 / D-15 · D-16).
 *
 * ⚠️ RED 스텁 — 시그니처만 있다. 판정은 GREEN 커밋이 넣는다.
 */

/** 매매구분. `null` = 모른다(지어내지 않는다). */
export type NoticeSide = "B" | "S" | null;

/**
 * 행위 판정의 입력. **문구 키가 없다** — 받을 수 있게 두면 언젠가 읽는다 (T-17-33 / D-08).
 */
export interface OrderActionFacts {
  /** 게이트웨이 통보 원문 1자 (`"A"`·`"E"`·`"C"`·`"M"`·`"R"`). 구 서버는 `""`. */
  noticeType: string;
  /** 요청 종류 (`"New"`·`"Modify"`·`"Cancel"`). 구 서버는 `""`. */
  requestKind: string;
  side: NoticeSide;
}

export function orderActionWord(_facts: OrderActionFacts): string {
  return "";
}

export function orderActionSide(facts: OrderActionFacts): NoticeSide {
  return facts.side;
}

/** 표시 조립의 입력 — 행위 판정 + 표시 전용 2필드. */
export interface OrderNoticeFacts extends OrderActionFacts {
  /** `OrderResp.requester` — `"Manual"` 뿐이다. 표시 전용. */
  requester: string;
  /** `OrderResp.board` — `"G2"`·`"G3"` 만 시간외종가다. */
  board: string;
}

export interface OrderNoticeLabel {
  /** 화면에 쓸 행위 단어(「시간외종가」 접두 포함). */
  text: string;
  /** 방향색 원천. 취소·정정이면 `null`. */
  side: NoticeSide;
  /** 「수동」 메타. 아니면 `""`. */
  meta: string;
}

export function orderNoticeLabel(facts: OrderNoticeFacts): OrderNoticeLabel {
  return { text: "", side: facts.side, meta: "" };
}
