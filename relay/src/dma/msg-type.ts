/**
 * Phase 15 Plan 02 — RELAY-01. DMA `Envelope.msg_type` 상수 단일 정본 + 수신 화이트리스트.
 *
 * relay 가 실제로 주고받는 메시지 번호만 명시 상수 객체로 둔다. 생성 코드의
 * `MsgType` enum 을 재export 하지 않는 이유는 두 가지다 — ① enum 전체(47종)에는
 * 상따/VI/거래원 등 relay 가 다루지 않는 값이 섞여 있어 화이트리스트로 쓸 수 없고,
 * ② "이 phase 가 무엇을 처리하는가"가 코드 한 곳에서 눈으로 읽혀야 한다.
 * 값이 생성 코드와 어긋나면 `__tests__/codec.test.ts` 의 대조 테스트가 즉시 깨진다.
 *
 * 결정 근거:
 *   D-30  루트는 `Envelope` 하나이고 `msg_type` 으로 분기한다.
 *   D-31  알 수 없는 번호는 파싱 시도 없이 드롭한다 — `INBOUND_MSG_TYPES` 가 그 관문이다.
 *   D-33  58/59(quote_state) · 66/67(account_state) · 69/71(trade_tape) 은 Envelope 슬롯
 *         **하나를** 공유한다. 스냅샷/증분 구분은 msg_type(과 본문 `is_snapshot`)이다.
 *
 * 하지 않는 것:
 *   - 74/75 (MemberStatsResp/Push — 거래원) 는 본 phase 범위 밖이라 넣지 않는다.
 *     화이트리스트에 없으면 수신 시 드롭되며, 그것이 의도된 동작이다.
 *   - 상따/VI/종목마스터 계열(10·11·27·33·57·72·73 등)도 같은 이유로 제외한다.
 */

/**
 * relay 가 사용하는 `msg_type` 값. 생성 코드 `stock-dma/msg-type.ts` 의 부분집합이다.
 *
 * 요청(C→S)은 1~32, 응답/푸시(S→C)는 50~71 대역이다.
 */
export const MSG = {
  // --- 요청 (relay → 게이트웨이) ---
  /** 로그인. 세션 수립의 첫 프레임. */
  LoginReq: 1,
  /** 직접 주문 (신규/취소). D-25 게이트 뒤 plan 소관. */
  DirectOrderReq: 2,
  /** 계좌번호 선언. D-25 게이트 뒤 plan 소관. */
  UpdateAccountNoReq: 3,
  /** 30초 주기 핑. */
  LivePing: 4,
  /** 계좌 상태 조회. D-25 게이트 뒤 plan 소관. */
  GetAccountStateReq: 25,
  /** 호가 스냅샷 조회. */
  GetQuoteReq: 28,
  /** 호가 구독/해제. */
  SubscribeQuoteReq: 29,
  /** 체결 테이프 스냅샷 조회. */
  GetTradeTapeReq: 32,

  // --- 응답 · 푸시 (게이트웨이 → relay) ---
  /** 로그인 응답. */
  LoginResp: 50,
  /** 주문 통보 (접수/체결/취소확인/거부). */
  OrderResp: 51,
  /** 주문 확인. */
  OrderConfirm: 52,
  /** 체결 통보. */
  TradeExecution: 53,
  /** 서버 통지 — 해석 없이 브라우저로 흘린다 (D-36). */
  ServerMessage: 54,
  /** 계좌번호 선언 응답. */
  UpdateAccountNoResp: 55,
  /** 호가 스냅샷 응답 (`quote_state` 슬롯, is_snapshot=true). */
  GetQuoteResp: 58,
  /** 호가 증분 푸시 (`quote_state` 슬롯, is_snapshot=false). */
  QuoteUpdate: 59,
  /** 계좌 상태 스냅샷 (`account_state` 슬롯). */
  GetAccountStateResp: 66,
  /** 계좌 상태 증분 (`account_state` 슬롯). */
  AccountStateDelta: 67,
  /** 체결 테이프 스냅샷 (`trade_tape` 슬롯, is_snapshot=true). */
  TradeTapeResp: 69,
  /** 체결 테이프 증분 (`trade_tape` 슬롯, is_snapshot=false). */
  TradeTapePush: 71,
} as const;

/** `MSG` 의 값 유니온. */
export type MsgTypeValue = (typeof MSG)[keyof typeof MSG];

/**
 * 수신 허용 목록 (D-31). 여기에 없는 `msg_type` 은 파싱 시도 없이 드롭한다.
 *
 * JS 런타임에 FlatBuffers Verifier 가 없어 잘린 버퍼가 예외 없이 깨진 값을 반환하므로,
 * "알려진 번호인가"가 구조 레벨의 실질 방어선이다. 요청 계열(1~32)이 수신 경로로
 * 들어오는 것 자체가 이상 신호이므로 응답 대역만 담는다.
 */
export const INBOUND_MSG_TYPES: ReadonlySet<number> = new Set<number>([
  MSG.LoginResp,
  MSG.OrderResp,
  MSG.OrderConfirm,
  MSG.TradeExecution,
  MSG.ServerMessage,
  MSG.UpdateAccountNoResp,
  MSG.GetQuoteResp,
  MSG.QuoteUpdate,
  MSG.GetAccountStateResp,
  MSG.AccountStateDelta,
  MSG.TradeTapeResp,
  MSG.TradeTapePush,
]);
