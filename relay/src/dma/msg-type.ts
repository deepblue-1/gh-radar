/**
 * Phase 15 Plan 02 — RELAY-01. DMA `Envelope.msg_type` 상수 단일 정본 + 수신 화이트리스트.
 * Phase 16 Plan 04 — TRADE-03. 상따/VI 전략 14종(요청 7 · 응답 7) 확장.
 *
 * relay 가 실제로 주고받는 메시지 번호만 명시 상수 객체로 둔다. 생성 코드의
 * `MsgType` enum 을 재export 하지 않는 이유는 두 가지다 — ① enum 전체(47종)에는
 * 거래원·종목마스터·NXT 상따 등 relay 가 다루지 않는 값이 섞여 있어 화이트리스트로
 * 쓸 수 없고, ② "이 phase 가 무엇을 처리하는가"가 코드 한 곳에서 눈으로 읽혀야 한다.
 * 값이 생성 코드와 어긋나면 `__tests__/codec.test.ts` 의 대조 테스트가 즉시 깨진다.
 *
 * 결정 근거:
 *   D-30  루트는 `Envelope` 하나이고 `msg_type` 으로 분기한다.
 *   D-31  알 수 없는 번호는 파싱 시도 없이 드롭한다 — `INBOUND_MSG_TYPES` 가 그 관문이다.
 *   D-33  58/59(quote_state) · 66/67(account_state) · 69/71(trade_tape) 은 Envelope 슬롯
 *         **하나를** 공유한다. 스냅샷/증분 구분은 msg_type(과 본문 `is_snapshot`)이다.
 *         16-04 에서 72/73(`vi_order_list`)이 같은 규약으로 합류한다.
 *   D-01  상따/VI 전략 메시지를 relay 가 중계한다 — 아래 「유입 집합」이 그 대가다.
 *
 * 화이트리스트 확장의 대가 (PC-12 — 필터를 완화할 때는 유입 집합을 먼저 센다):
 *   16-04 에서 `INBOUND_MSG_TYPES` 에 **56 · 60 · 61 · 64 · 65 · 72 · 73** 7종을 새로 넣는다.
 *   지금까지 `drop("unknown-msg-type")` 으로 조용히 떨어지던 이 7종이 이제 파서까지 도달한다.
 *   그래서 7종은 **전부** `SubscriptionHub.#onFrame` 에 명시 `case` 를 갖고(16-06), 파싱 실패는
 *   `envelope.ts` 의 `drop`/`dropField` 가 사유·카운터를 남긴다. `default:` 로 조용히 사라지는
 *   프레임은 확장 후에도 여전히 0이다.
 *
 * 하지 않는 것:  ← **이 목록이 `OUT_OF_SCOPE_INBOUND_MSG_TYPES` 의 정본이다.**
 *   - 74/75 (MemberStatsResp/Push — 거래원) 는 본 phase 범위 밖이라 넣지 않는다.
 *     화이트리스트에 없으면 수신 시 드롭되며, 그것이 의도된 동작이다.
 *   - 27/57 (GetSymbolMasterReq/SymbolMasterResp — 종목마스터) 도 같은 이유로 제외한다.
 *     종목 메타는 Supabase `stocks` 가 정본이라 게이트웨이에서 받아올 이유가 없다.
 *   - 20 (`GetLimitChaserReq` 단건 조회) 은 24 목록 조회로 갈음한다 — 왕복이 하나면 충분하다.
 *   - 26/68 (Reconcile) · 30/31/70 (NXT 전용 상따) 도 v1 범위 밖이다.
 *
 *   ★ **이 목록이 바뀌면 아래 `OUT_OF_SCOPE_INBOUND_MSG_TYPES` 도 같이 바꾼다.** 주석과 상수가
 *     어긋나면 로그 레벨이 조용히 틀어지고, 그 틀어짐은 「경고가 안 뜬다」로만 드러나
 *     아무도 눈치채지 못한다. 서로를 가리키게 두는 것이 유일한 방어다.
 *
 *   ★ 그 상수에는 **응답 대역(S→C)만** 담는다. 위 목록의 요청 번호(20 · 26 · 27 · 30 · 31)는
 *     **C→S** 라, 수신 경로로 들어오는 것 자체가 이상 신호다 — 아래 `INBOUND_MSG_TYPES`
 *     주석이 이미 못박아 둔 규율이고, 그 번호까지 debug 로 내리면 이번 강등이 없애려던
 *     실명(失明)을 새로 만든다.
 */

/**
 * relay 가 사용하는 `msg_type` 값. 생성 코드 `stock-dma/msg-type.ts` 의 부분집합이다.
 *
 * 요청(C→S)은 1~34, 응답/푸시(S→C)는 50~73 대역이다.
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
  /** 상따 설정 upsert/삭제 (`set_limit_chaser` 슬롯, 33필드). 응답은 60 에코. */
  SetLimitChaserReq: 10,
  /** VI 발동 감시 설정 (`set_vi_trigger` 슬롯, 5필드). 응답은 61 에코. */
  SetVITriggerReq: 11,
  /** 전략 일괄/단건 비활성화 (`disable_strategies_req` 슬롯). 응답은 60/61 에코 뒤 65. */
  DisableStrategiesReq: 14,
  /** VI 전략 조회. **요청 본문 없음** — 서버가 `get_strategy_req` 를 파싱하되 무시한다. */
  GetVITriggerReq: 21,
  /** 상따 목록 조회. **요청 테이블 자체가 없다 — 빈 Envelope**. 응답은 64. */
  GetLimitChaserListReq: 24,
  /** 계좌 상태 조회. D-25 게이트 뒤 plan 소관. */
  GetAccountStateReq: 25,
  /** 호가 스냅샷 조회. */
  GetQuoteReq: 28,
  /** 호가 구독/해제. */
  SubscribeQuoteReq: 29,
  /** 체결 테이프 스냅샷 조회. */
  GetTradeTapeReq: 32,
  /** VI 주문 확인 체크 on/off (`confirm_vi_order_req` 슬롯). 반영되면 73 푸시로만 돌아온다. */
  ConfirmVIOrderReq: 33,
  /** VI 주문 목록 조회. **요청 테이블 없음 — 빈 Envelope**. 응답은 72. */
  GetVIOrderListReq: 34,

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
  /** VI 발주 통보 (`vi_order_notice` 슬롯). **Notice** — 발주 세션의 전 연결. */
  VIOrderNotice: 56,
  /** 호가 스냅샷 응답 (`quote_state` 슬롯, is_snapshot=true). */
  GetQuoteResp: 58,
  /** 호가 증분 푸시 (`quote_state` 슬롯, is_snapshot=false). */
  QuoteUpdate: 59,
  /**
   * 상따 에코 (`set_limit_chaser` 슬롯).
   * **Set 에코는 Notice**(`SendToSession` 2인자), 300ms 런타임 푸시만 Broadcast 다.
   */
  SetLimitChaserResp: 60,
  /**
   * VI 에코 (`set_vi_trigger` 슬롯).
   * **Set 에코는 Notice**, 15:40 서버 자동중지 푸시만 Broadcast 다(드롭 가능 — Pitfall 19).
   */
  SetVITriggerResp: 61,
  /** 상따 목록 응답 (`limit_chaser_list` 슬롯). Notice — **요청 연결에만** 온다. */
  GetLimitChaserListResp: 64,
  /**
   * 전략 비활성화 집계 (`disable_strategies_resp` 슬롯). Notice — **요청 연결에만**.
   * 60/61 에코가 **먼저** 나간 뒤라 웹은 이것을 「완료 신호」로만 쓴다.
   */
  DisableStrategiesResp: 65,
  /** 계좌 상태 스냅샷 (`account_state` 슬롯). */
  GetAccountStateResp: 66,
  /** 계좌 상태 증분 (`account_state` 슬롯). */
  AccountStateDelta: 67,
  /** 체결 테이프 스냅샷 (`trade_tape` 슬롯, is_snapshot=true). */
  TradeTapeResp: 69,
  /** 체결 테이프 증분 (`trade_tape` 슬롯, is_snapshot=false). */
  TradeTapePush: 71,
  /** VI 주문 목록 스냅샷 (`vi_order_list` 슬롯, is_snapshot=true). Notice — **요청 연결에만**. */
  GetVIOrderListResp: 72,
  /** VI 주문 목록 증분 (`vi_order_list` 슬롯, is_snapshot=false). **Notice** — 세션 전 연결. */
  VIOrderListPush: 73,
} as const;

/** `MSG` 의 값 유니온. */
export type MsgTypeValue = (typeof MSG)[keyof typeof MSG];

/**
 * 수신 허용 목록 (D-31). 여기에 없는 `msg_type` 은 파싱 시도 없이 드롭한다.
 *
 * JS 런타임에 FlatBuffers Verifier 가 없어 잘린 버퍼가 예외 없이 깨진 값을 반환하므로,
 * "알려진 번호인가"가 구조 레벨의 실질 방어선이다. 요청 계열(1~34)이 수신 경로로
 * 들어오는 것 자체가 이상 신호이므로 응답 대역만 담는다.
 *
 * 16-04 에서 56/60/61/64/65/72/73 을 더해 **19종**이 됐다. 파일 상단 「유입 집합」 주석이
 * 이 7종의 하류 처리 책임을 명시한다 — 넓힌 만큼 명시 `case` 로 받는 것이 조건이다.
 */
export const INBOUND_MSG_TYPES: ReadonlySet<number> = new Set<number>([
  MSG.LoginResp,
  MSG.OrderResp,
  MSG.OrderConfirm,
  MSG.TradeExecution,
  MSG.ServerMessage,
  MSG.UpdateAccountNoResp,
  MSG.VIOrderNotice,
  MSG.GetQuoteResp,
  MSG.QuoteUpdate,
  MSG.SetLimitChaserResp,
  MSG.SetVITriggerResp,
  MSG.GetLimitChaserListResp,
  MSG.DisableStrategiesResp,
  MSG.GetAccountStateResp,
  MSG.AccountStateDelta,
  MSG.TradeTapeResp,
  MSG.TradeTapePush,
  MSG.GetVIOrderListResp,
  MSG.VIOrderListPush,
]);

/**
 * 「범위 밖인 줄 알면서 받는」 유입 번호 (quick-260910-jce).
 *
 * `INBOUND_MSG_TYPES` 에 없다는 점에서는 정체불명 번호와 같지만, **왜 없는지를 우리가
 * 알고 있다**는 점이 다르다(위 「하지 않는 것」). 게이트웨이는 74/75(MemberStats)를
 * 25~55초마다 밀어 넣으므로, 이것을 정체불명과 같은 WARNING 으로 쌓으면 진짜 이상 신호가
 * 그 사이에 묻힌다. 드롭 자체는 설계대로 옳다 — 틀린 것은 로그 레벨 하나였다.
 *
 * 원소는 **응답 대역 5종뿐**이다(생성 코드 `stock-dma/msg-type.ts` 의 enum 이름을 인용한다.
 * 리터럴을 지어내지 않는다):
 *   - `SymbolMasterResp` = 57
 *   - `ReconcileAccountStateResp` = 68
 *   - `SetLimitChaserNXTResp` = 70
 *   - `MemberStatsResp` = 74
 *   - `MemberStatsPush` = 75
 *
 * 요청 대역(20 · 26 · 27 · 30 · 31)은 **의도적으로 뺐다** — 위 주석의 ★ 참조.
 */
export const OUT_OF_SCOPE_INBOUND_MSG_TYPES: ReadonlySet<number> = new Set<number>([
  57, 68, 70, 74, 75,
]);
