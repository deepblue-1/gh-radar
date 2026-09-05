/**
 * Phase 15 — DMA 중계 서버(relay) 공유 계약 (RELAY-01 / RELAY-02).
 *
 * server · webapp · relay **3자**가 공유하는 wss 메시지 · 주문 DTO · 연결 상태 라벨의
 * 단일 진실 소스. 인터페이스-우선: 이후 relay(Wave 2~4) · server(주문 REST) ·
 * webapp(호가창 UI)이 서로를 탐색하지 않고 이 파일에 대해 병렬 구현한다.
 *
 * 결정 근거:
 *   D-11  브라우저 인증은 업그레이드 후 **첫 메시지** `{t:"auth", token}`. 5초 내
 *         미인증이면 close(4401). 인증 전 sub/unsub 은 close(4400). 토큰을 URL 에
 *         싣지 않는 이유가 이것이다(Caddy 액세스 로그에 남는다).
 *   D-22  주문 결과는 두 경로다 — `POST /api/orders` 동기 응답(첫 접수/거부, 최대 5초)
 *         + 이후 체결·취소확인은 relay 가 주문자 wss 로 푸시(`{t:"order"}`).
 *   D-33  시세 키는 `isin + exchange`. 스냅샷(58/69)과 증분(59/71)이 같은 슬롯을
 *         공유하므로 `snap` 플래그가 "전량 교체 vs 병합"을 가른다.
 *   D-34  게이트웨이의 가격·수량은 FlatBuffers `long` 이라 생성 코드가 64비트 정수를
 *         BigInt 로 낸다. **와이어(JSON) 계약은 전부 number** — relay 가 직렬화 직전
 *         Number 로 좁힌다(누적거래대금은 안전범위 확인 대상).
 *         `change_sign` 원문 1자가 부호의 정본이고, `exchange_time`("HHMMSSuuuuuu")이
 *         신선도의 원천이다. 둘 다 relay 가 해석하지 않고 그대로 흘린다.
 *   D-35  업스트림 100ms 코얼레싱은 그대로 통과, 체결 테이프만 200ms 배치.
 *   D-36  `ServerMessage(54)`는 해석 없이 `{t:"msg"}` 로 흘린다. 연결 상태도 상태
 *         프레임 하나로만 표현해 브라우저가 상태 분기를 중복 구현하지 않게 한다.
 *
 * DB 는 snake_case (`dma_credentials` · `dma_orders`), 게이트웨이 필드도 snake_case 다.
 * row/프레임 → 아래 타입 변환 책임은 **server·relay 의 순수함수**에 있다 (chat.ts 규약).
 * webapp 은 변환하지 않는다.
 *
 * 하지 않는 것:
 *   - `RELAY_MAX_FRAME_SIZE` 같은 relay 내부 상수는 여기 두지 않는다 — 코덱 모듈이
 *     단일 정본이다. 여기에는 **3자가 실제로 주고받는 것**만 둔다.
 *   - 정정(order_type "M") · 시장가 · IOC/FOK 는 v1 범위 밖이다 (D-21).
 */

// ============================================================
// 거래소 · 세션 상태
// ============================================================

/** 거래소 (D-04). 사용자가 토글하며, 시세 구독 키의 일부다. */
export type RelayExchange = "KRX" | "NXT";

/**
 * wss 상태 프레임의 세션 상태 9종.
 *
 * 앞 6종은 gh-trade `client/Services/DMA/EventArgs.cs` `SessionState` 이식이고,
 * `session_rejected` · `unauthorized` 는 relay 가 더한 **게이트 2종**이다
 * (각각 "로그인 거부로 재접속 중단" / "dma_credentials 미등록").
 * `manual_required` 는 재접속 10회 소진 상태다 (D-16 — 무한 재시도 금지).
 */
export type RelaySessionState =
  | "connecting"
  | "logging_in"
  | "declaring"
  | "ready"
  | "reconnecting"
  | "manual_required"
  | "failed"
  | "session_rejected"
  | "unauthorized";

/**
 * 연결 상태 배지 한글 라벨. 15-UI-SPEC.md §Copywriting Contract verbatim.
 *
 * 브라우저가 상태 → 문구 switch 를 중복 구현하지 않게 계약에 둔다
 * (`SPECIALIST_LABELS` 선례, D-36 사상). `ready` 는 계좌 수를,
 * `reconnecting` 은 시도 횟수를 UI 에서 덧붙인다.
 */
export const RELAY_STATE_LABELS: Record<RelaySessionState, string> = {
  connecting: "시세 서버 연결 중…",
  logging_in: "DMA 로그인 중…",
  declaring: "계좌 확인 중…",
  ready: "실시간",
  reconnecting: "재접속 중",
  manual_required: "다시 연결하지 못했어요",
  failed: "회선 단절",
  session_rejected: "로그인 거부",
  unauthorized: "권한 없음",
};

/**
 * wss close 코드 (D-11). 4000~4999 는 애플리케이션 정의 구간이다.
 * 브라우저는 이 코드로 "재접속할 가치가 있는가"를 판정한다 — 둘 다 재시도 무의미.
 */
export const RELAY_WS_CLOSE = {
  /** 5초 내 `{t:"auth"}` 미수신, 또는 토큰 검증 실패. */
  AUTH_TIMEOUT: 4401,
  /** 파싱 불가 / 인증 전 sub·unsub / 스키마 위반 메시지. */
  BAD_MESSAGE: 4400,
} as const;

// ============================================================
// 인바운드 (브라우저 → relay)
// ============================================================

/** 첫 메시지 필수 (D-11). Supabase 액세스 토큰. */
export type RelayAuthMsg = { t: "auth"; token: string };

/** 시세+체결 구독. 키는 `isin + ex` (D-33). */
export type RelaySubMsg = { t: "sub"; isin: string; ex: RelayExchange };

/** 구독 해제. 마지막 구독자가 빠지면 relay 가 업스트림 `subscribe:false` 를 보낸다. */
export type RelayUnsubMsg = { t: "unsub"; isin: string; ex: RelayExchange };

/** 브라우저가 보내는 모든 메시지. `t` 로 분기하는 discriminated union. */
export type RelayInbound = RelayAuthMsg | RelaySubMsg | RelayUnsubMsg;

// ============================================================
// 아웃바운드 (relay → 브라우저)
// ============================================================

/**
 * 로그인 응답으로 받은 허용 계좌 1건 (`AccountEntry{account_no,name}`).
 * 주문 패널 계좌 선택의 원천이다 (D-14).
 *
 * gh-trade 17 재동기화(D-25 게이트 통과)로 **실제 계좌 목록이 온다**. relay 는 이
 * 목록을 전부 `UpdateAccountNoReq` 로 선언하고 서버 목록과 대조한 뒤에만 `ready` 로
 * 간다 — 따라서 `ready` 상태의 `accounts` 는 **항상 1건 이상**이다.
 *
 * ⚠️ 계좌 0건은 정상 상태가 아니라 세션 실패다 (17 D-12). relay 가
 *    `session_rejected` + `서버에 등록된 계좌가 없습니다` 로 확정하므로 UI 는
 *    "ready 인데 계좌가 없는" 경우를 다룰 필요가 없다.
 * ⚠️ 다만 `ready` 이전 상태(`connecting`/`logging_in`/`declaring`)와 실패 상태에서는
 *    빈 배열이 정상이다 — UI 는 빈 배열을 오류로 렌더하지 않는다.
 *
 * 계좌번호는 **화면에 전체 표시**한다. 마스킹은 relay 로그에서만 한다 (UI-SPEC D2).
 */
export type RelayAccount = {
  accountNo: string;
  name: string;
};

/** 상태 프레임 — 배지·상태 문구·계좌 목록의 원천 (D-36). */
export type RelayStateMsg = {
  t: "state";
  s: RelaySessionState;
  /** 보조 문구. 게이트웨이 원문(거부 사유 등)이 있을 때만. */
  msg?: string;
  /** `reconnecting` 의 시도 회차 (1-based). */
  attempt?: number;
  /**
   * 허용 계좌 목록. `ready` 에서는 **비지 않는다**(비면 세션이 실패한다).
   * 주문 패널 계좌 선택의 원천이다. 위 `RelayAccount` 주의 참조.
   */
  accounts?: RelayAccount[];
};

/**
 * 호가 10단 스냅샷/증분 (`QuoteState`, D-33/D-34).
 * 배열 4종은 **길이 10 고정**(1~10단계). 가격·수량은 전부 number.
 */
export type RelayQuote = {
  t: "q";
  /** 12자 ISIN. */
  i: string;
  x: RelayExchange;
  /** true=전량 교체(58 스냅샷), false=증분 병합(59 푸시). */
  snap: boolean;
  /** 현재가. */
  p: number;
  /** 시가 / 고가 / 저가. */
  o: number;
  h: number;
  l: number;
  /** 전일대비 (부호 판정은 `cs` 가 정본). */
  c: number;
  /** 전일대비구분 원문 1자 — relay 가 해석하지 않는다 (D-34). */
  cs: string;
  /** 등락률 (%). */
  cr: number;
  /** 누적거래량(주) / 누적거래대금(원). 대금은 값이 커 Number 안전범위 확인 대상. */
  v: number;
  va: number;
  /** 매도호가 1~10단계 가격 / 잔량. */
  ap: number[];
  aq: number[];
  /** 매수호가 1~10단계 가격 / 잔량. */
  bp: number[];
  bq: number[];
  /** 총 매도잔량 / 총 매수잔량. */
  ta: number;
  tb: number;
  /** 상한가 / 하한가 / 기준가(전일 종가). */
  ul: number;
  ll: number;
  base: number;
  /** VI 발동예상가 (상승/하락). */
  viu: number;
  vid: number;
  /** 상장주식수. */
  ls: number;
  /** 거래소 체결·처리시각 "HHMMSSuuuuuu" 12자 — 신선도 원천 (D-34). */
  et: string;
};

/** 체결 테이프 1건 (`TradeTapeEntry`). */
export type RelayTapeEntry = {
  /** 체결시각 (거래소 원문). */
  t: string;
  /** 체결가. */
  p: number;
  /** 전일대비구분 원문 1자. */
  cs: string;
  /** 전일대비. */
  c: number;
  /** 체결수량(주). */
  q: number;
  /** 누적거래량(주). */
  cv: number;
};

/**
 * 체결 테이프 배치 (`TradeTape`, D-35).
 * 200ms 배치로 묶어 보낸다 — 시세 구독에 편승하며 별도 구독이 없다 (D-33).
 */
export type RelayTape = {
  t: "tape";
  i: string;
  x: RelayExchange;
  /** true=전량 교체(69 스냅샷), false=뒤에 이어붙임(71 증분). */
  snap: boolean;
  e: RelayTapeEntry[];
};

/** 보유 종목 1건 (`HoldingState`). 평단가는 double 이라 내림하지 않는다. */
export type RelayHolding = {
  isin: string;
  /** 보유수량 / 매도가능수량. */
  qty: number;
  sellableQty: number;
  /** 평단가. */
  avgPrice: number;
};

/** 미체결 주문 1건 (`UnfilledState`). 취소 대상의 원천이다. */
export type RelayUnfilled = {
  orderNo: string;
  /** 원주문번호 (정정·취소 승계). 신규는 "". */
  orgOrderNo: string;
  isin: string;
  side: OrderSide;
  price: number;
  orderQty: number;
  filledQty: number;
  /** 미체결 잔량 — 취소 수량이 곧 이 값이다 (D-21, 0 은 즉시 거부). */
  unfilledQty: number;
  /** 거래소. 구 서버의 미지정은 relay 가 "KRX" 로 정규화한다. */
  exchange: RelayExchange;
};

/** 계좌 상태 (`AccountState`) — 잔고·미체결 전량/델타. */
export type RelayAccountState = {
  t: "acct";
  /** 계좌번호. */
  a: string;
  /** true=전량 교체, false=키 upsert + `rm` 행 제거. */
  snap: boolean;
  hold: RelayHolding[];
  unf: RelayUnfilled[];
  /** 델타 전용 삭제 표식(주문번호). 스냅샷에서는 빈 배열. */
  rm: string[];
  /** 갱신시각 (표시용). */
  st: string;
};

/**
 * 주문 통보 (`OrderResp` 파생, D-22).
 * 접수("A")는 `POST /api/orders` 동기 응답으로도 나가지만, 체결("E")·취소확인("C")·
 * 거부("R")는 이 푸시가 유일 경로다.
 */
export type RelayOrderMsg = {
  t: "order";
  /** 주문번호. */
  no: string;
  /** 통보 종류 "A"=접수 "E"=체결 "C"=취소확인 "R"=거부. */
  nt: string;
  /** 결과코드 (0=성공, 그 외=거부코드). */
  rc: number;
  /** 결과 메시지 (거부 사유 등). */
  msg: string;
  /** 원주문번호. 신규 통보는 "". */
  org: string;
  /** 주문가격 / 주문수량. */
  p: number;
  q: number;
  x: RelayExchange;
};

/**
 * 서버 통지 (`ServerMessage(54)`) — 해석 없이 그대로 흘린다 (D-36).
 * UI 는 상태 영역에 최근 N개를 누적한다.
 */
export type RelayServerMsg = {
  t: "msg";
  /** "INFO" / "WARN" / "ERROR". */
  lv: string;
  m: string;
  /** 관련 종목 ISIN. **비면 브로드캐스트**(종목 미지정). */
  i: string;
  /** 관련 계좌번호. */
  a: string;
  /** 발신 맥락 "Account" / "System" 등. */
  src: string;
  /** 사건 종류 "SessionJoin" / "Restore" / "Purge". 그 외 빈 값. */
  kind: string;
};

/** relay 가 브라우저로 보내는 모든 메시지. `t` 로 분기한다. */
export type RelayOutbound =
  | RelayStateMsg
  | RelayQuote
  | RelayTape
  | RelayAccountState
  | RelayOrderMsg
  | RelayServerMsg;

// ============================================================
// 주문 DTO (webapp → server → relay)
// ============================================================

/** 매매 구분 ("B"=매수, "S"=매도). */
export type OrderSide = "B" | "S";

/** 주문 유형 ("N"=신규, "C"=취소). 정정("M")은 v1 범위 밖 (D-21). */
export type OrderType = "N" | "C";

/** 시장 구분 ("K"=KOSPI, "Q"=KOSDAQ). server 가 `stocks.market` 으로 채운다 (D-21). */
export type OrderMarket = "K" | "Q";

/**
 * 주문조건 "0"(보통) 고정 (D-21). 시장가·IOC("1")·FOK("2")는 v1 범위 밖이다.
 * 단일 문자 필드 변환은 한 함수에서만 한다 — 이 상수가 그 함수의 유일한 입력이다.
 */
export const ORDER_CONDITION_NORMAL = "0";

/**
 * `POST /api/orders` 요청 바디 (webapp → server).
 *
 * `code` 는 사용자에게 보이는 6자 단축코드다 — server 가 `stocks` 에서 ISIN·market 을
 * 채워 relay 로 넘긴다(D-28: 단축코드→ISIN 산술 유도 금지).
 * 취소는 `orderType:"C"` + `orgOrderNo` 필수이며 `qty` 는 미체결 잔량 전부다(0 은 거부).
 */
export type CreateOrderRequest = {
  /** 6자 단축코드. */
  code: string;
  accountNo: string;
  exchange: RelayExchange;
  side: OrderSide;
  orderType: OrderType;
  /** `orderType:"C"` 일 때 필수. */
  orgOrderNo?: string;
  qty: number;
  price: number;
};

/** DMA 주문의 수명주기 상태 (`dma_orders.status`). */
export type DmaOrderStatus =
  | "requested"
  | "accepted"
  | "rejected"
  | "filled"
  | "partially_filled"
  | "cancelled"
  | "timeout";

/**
 * `POST /api/orders` 응답 (server → webapp).
 *
 * 첫 `OrderResp(51)` 까지 최대 5초 대기한 결과다 (D-22). 5초를 넘기면
 * `status:"timeout"` 으로 응답한다 — **"실패"가 아니다**. 주문이 이미 나갔을 수
 * 있으므로 UI 는 미체결 목록 확인을 안내한다 (UI-SPEC §주문 CTA · 결과).
 */
export type CreateOrderResponse = {
  /** 주문번호. 접수 전 거부·타임아웃이면 "". */
  orderNo: string;
  /** 결과코드 (0=성공, 그 외=거부코드). */
  resultCode: number;
  message: string;
  status: DmaOrderStatus;
};
