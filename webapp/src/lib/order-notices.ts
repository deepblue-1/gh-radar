/**
 * order-notices — 주문 통보의 **행위 단어** 순수함수 (17-10 / D-08 · D-15).
 *
 * ① 왜 문구를 받지 않는가
 *   정정·취소 거부(804)에서 게이트웨이는 `OrderResp.message` 를 「이미 체결·취소돼
 *   취소(정정)할 잔량 없음」 으로 **교체한다**. 문구 매칭으로 만든 분기는 서버가 말을
 *   바꾸는 순간 조용히 틀어지고, 틀어진 줄은 「취소」를 「매수」로 읽히게 한다.
 *   그래서 이 파일의 어떤 함수도 문구를 **인자로 받지 않는다** — 받을 수 있게 두면
 *   언젠가 읽는다(T-17-33). 판정은 `notice_type`·`request_kind` **동등 비교**뿐이다.
 *
 * ② 왜 취소·정정에 방향이 없는가
 *   취소·정정 요청에는 매매구분이 없다. 서버 `DirectOrderReq` 에 side 칸이 있어 클라가
 *   채워 보내지만 서버는 그 값을 쓰지 않고 **그대로 에코할 뿐**이다 — 그래서 side 를
 *   그리면 **매도 주문의 취소도 「매수」** 로 보인다(gh-trade `NotificationHub.ActionWord`
 *   :466 주석). 취소·정정 행은 방향색을 쓰지 않는다.
 *
 * ③ 정본
 *   `/Users/alex/repos/gh-trade/client/Services/DMA/NotificationHub.cs`
 *   — `ActionWord`(:466) · `ActionSide`(:478) · `BuildOrderScreen`(:500 부근 board 접두).
 */

/** 매매구분. `null` = 모른다(지어내지 않는다). */
export type NoticeSide = "B" | "S" | null;

/**
 * 행위 판정의 입력. **문구 키가 없다** (위 ①).
 */
export interface OrderActionFacts {
  /** 게이트웨이 통보 원문 1자 (`"A"`·`"E"`·`"C"`·`"M"`·`"R"`). 구 서버는 `""`. */
  noticeType: string;
  /** 요청 종류 (`"New"`·`"Modify"`·`"Cancel"`). 구 서버는 `""`. */
  requestKind: string;
  side: NoticeSide;
}

/** 시간외종가 보드 — 이 둘만이다. 벽시계로 판정하지 않는다 (D-11 과 같은 규율). */
const AFTER_HOURS_BOARDS: ReadonlySet<string> = new Set(["G2", "G3"]);

/** `requester` 의 유일한 유의미 값. 그 밖(빈 값 포함)은 메타를 붙이지 않는다. */
const MANUAL_REQUESTER = "Manual";

/**
 * 그 통보가 **무엇을 한 통보인지**. 순서가 곧 우선순위다.
 *
 * 통보 종류가 있으면 그것이 정답이다. 거부(`"R"`)·불명은 통보 종류가 행위를 말하지
 * 않으므로 서버가 실은 요청 종류(브로커 수신 전문의 정정취소구분)로 가른다.
 * 둘 다 없을 때만(신규·체결·구 서버) 매매구분으로 떨어진다.
 */
export function orderActionWord(facts: OrderActionFacts): string {
  if (facts.noticeType === "C") return "취소";
  if (facts.noticeType === "M") return "정정";
  if (facts.requestKind === "Cancel") return "취소";
  if (facts.requestKind === "Modify") return "정정";
  if (facts.side === "B") return "매수";
  if (facts.side === "S") return "매도";
  // side 를 모르고 위 분기에도 안 걸리면 **비운다**. 모르는 행위를 지어내지 않는다.
  return "";
}

/**
 * 방향색의 원천 — `orderActionWord` 가 매수/매도를 낼 때만 방향이 있다.
 * 두 함수는 같은 갈래이고 **함께 고친다**(gh-trade `ActionSide` 와 같은 규율).
 */
export function orderActionSide(facts: OrderActionFacts): NoticeSide {
  if (facts.noticeType === "C" || facts.noticeType === "M") return null;
  if (facts.requestKind === "Cancel" || facts.requestKind === "Modify") return null;
  return facts.side;
}

/** 표시 조립의 입력 — 행위 판정 + 표시 전용 2필드. */
export interface OrderNoticeFacts extends OrderActionFacts {
  /** `OrderResp.requester` — `"Manual"` 뿐이다. **표시 전용**(D-08). */
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

/**
 * 화면 한 줄의 행위 표기를 조립한다.
 *
 * ★ 시간외종가 접두는 **접수·체결·거부**에만 side 단어와 함께 붙고, 취소·정정 확인에는
 *   「시간외종가」 만 붙는다(D-15 · 사용자 결정 2026-09-17). 정본 C# 에서 취소·정정 확인
 *   줄의 Lead 는 비어 있고 행위는 배지·본문(`확인`)이 말한다 — 이 표에서는 **상태 칸**이
 *   그 자리를 대신한다(`orderDisplayStatus` 가 `취소`/`정정`을 낸다).
 */
export function orderNoticeLabel(facts: OrderNoticeFacts): OrderNoticeLabel {
  const side = orderActionSide(facts);
  const action = orderActionWord(facts);
  // 접두가 붙을 자리 — 취소·정정 확인(방향 없음)은 비어 있다(위 ★).
  const lead = side === null ? "" : action;
  const text = AFTER_HOURS_BOARDS.has(facts.board)
    ? lead.length === 0
      ? "시간외종가"
      : `시간외종가 ${lead}`
    : action;
  return {
    text,
    side,
    meta: facts.requester === MANUAL_REQUESTER ? "수동" : "",
  };
}
