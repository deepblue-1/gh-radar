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
 *   D-02  **주문은 relay wss 단일 경로**다 (Phase 16). 브라우저가 `{t:"order.new"}` /
 *         `{t:"order.cancel"}` 을 보내고, 첫 접수/거부는 같은 `rid` 를 단
 *         `{t:"order.result"}` 로 최대 5초 안에 돌아온다. 이후 체결·취소확인은 relay 가
 *         주문자 wss 로 푸시한다(`{t:"order"}`). Phase 15 의 `POST /api/orders`(D-22)는
 *         16-16 에서 제거되고 `GET /api/orders`(오늘 주문 조회)만 남는다.
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
// 전략 상태 (상따 LimitChaser · VI) — 인바운드·아웃바운드 공용
// ============================================================

/** 상따 등록 구분 (D-06). `"C"`=등록·수정(upsert) / `"D"`=삭제. 게이트웨이는 **첫 글자만** 읽는다. */
export type RelayLcCrud = "C" | "D";

/** 상따 매수 감시 기준 호가. `"1"`=매수호가, 그 외(`"0"`)=매도호가. 역시 첫 글자만 읽힌다. */
export type RelayLcWatchSide = "0" | "1";

/**
 * 상따(LimitChaser) 전략 1건 — `SetLimitChaser` **활성 37필드**의 와이어 표현 + 파생 `key`.
 *
 * 필드명은 FlatBuffers 생성 코드 접근자와 같은 camelCase 다(`sell_order_ratio` →
 * `sellOrderRatio`). 게이트웨이의 deprecated 8슬롯은 접근자 자체가 없으므로 여기에도 없다 —
 * 보내지도 읽지도 않는다.
 *
 * ⚠️ **S→C 전용 4필드** — `sellOrderQty` · `sellQtyTrackBaseline` · `sellEntryLatched` ·
 *    `cancelQtyTrackBaseline`. 서버가 계산해 **에코로만** 내려주고 요청값은 무시한다.
 *    브라우저가 되보내면 "값이 왕복한다"는 착각이 생겨 에코-폼 비교 로직이 오염된다
 *    (Pitfall 6). 그래서 인바운드 `lc.set` 은 `RelayLimitChaserInput` 으로 이 4개를 뺀다.
 *
 * ⚠️ **에코의 `buyEnabled`/`sellEnabled` 는 설정값이 아니라 무장 상태**다 — 서버가
 *    `cfg.buyEnabled && buyArmed` 를 실어 보낸다. 발주가 나가 게이트가 소진되면 `false` 로
 *    온다. "내가 켰는데 서버가 껐다"가 아니라 **"발주가 나갔다"**는 뜻이므로 UI 배지는 이
 *    둘을 다른 문구로 구분해야 한다 (Pitfall 10). 같은 이유로 `cancelQtyEnabled` ·
 *    `cancelTradeEnabled` 도 `&& cancelArmed` 로 접힌 값이고, 반대로 `sellQtyTrackEnabled` ·
 *    `cancelQtyTrackEnabled` · `sellEntryLatched` 는 **접지 않은 원값**이다.
 *
 * ⚠️ **`buyOrderAmount === 0` 은 "서버가 모른다"**는 뜻이다(한 번도 실린 적 없거나 구 클라).
 *    0 이면 금액 칸을 건드리지 않는다 — 덮어쓰면 사용자 입력이 사라진다. 수량 x 가격 역산도
 *    금지다(나머지 손실로 왕복이 깨진다, Pitfall 11).
 *
 * 와이어는 전부 `number` 다 (D-34) — 64비트 정수를 계약에 넣지 않는다.
 */
export type RelayLimitChaser = {
  /** 12자 ISIN. 서버가 12자로 절단하므로 클라도 12자여야 키가 일치한다. */
  isin: string;
  /** 계좌번호 (최대 12자). */
  accountNo: string;
  /** 시장 구분. 서버는 첫 글자만 읽어 `"Q"`=KOSDAQ, 그 외=KOSPI 로 본다. */
  market: OrderMarket;
  /**
   * 등록 구분. 매수·매도·취소 게이트가 **전부** 꺼지면 서버가 `"D"` 로 정규화한다.
   * 취소 게이트가 하나라도 켜져 있으면 매수·매도를 둘 다 꺼도 전략이 남으므로,
   * UI 의 "삭제됨" 판정은 스위치가 아니라 **에코의 `crud`** 를 봐야 한다 (Pitfall 7).
   */
  crud: RelayLcCrud;
  /** 매수 주문가(원). */
  buyOrderPrice: number;
  /** 매수 주문수량(주) — **발주 정본**. `floor(buyOrderAmount x 10000 / buyOrderPrice)`. */
  buyOrderQty: number;
  /** 매수 감시가(원). */
  buyWatchPrice: number;
  /** 매수 감시 잔량(주). */
  buyWatchQty: number;
  /** 매수 최소 체결수량(주). */
  buyMinTradeQty: number;
  /** 매수 감시 기준 호가. */
  buyWatchSide: RelayLcWatchSide;
  /** 매수 체결수량 조건 사용 여부. */
  buyTradeQtyEnabled: boolean;
  /** 매수 게이트. **에코는 설정값이 아니라 무장 상태**다 (위 주의 참조). */
  buyEnabled: boolean;
  /** 매도 주문가(원). */
  sellOrderPrice: number;
  /**
   * 매도 주문수량(주) — **S→C 전용**. 서버가 Set 시점에 `매도가능수량 x sellOrderRatio / 100`
   * 을 스냅샷해 넣는다. 요청에 실어도 무시된다.
   */
  sellOrderQty: number;
  /** 매도 감시가(원). */
  sellWatchPrice: number;
  /** 매도 감시 호가잔량(주). **0 이면 서버가 매도 활성화를 거부**(눕힘)한다. */
  sellWatchQty: number;
  /** 매도 체결 임계(주). **취소의 「체결」 항이 이 값을 재사용**한다. */
  sellMinTradeQty: number;
  /** 매도 게이트. 에코는 `&& sellArmed` 로 접힌 무장 상태다. */
  sellEnabled: boolean;
  /** 매도 체결수량 조건 사용 여부. */
  sellTradeQtyEnabled: boolean;
  /** 한방(sweep) 감시가(원). */
  sweepWatchPrice: number;
  /** 한방 게이트. */
  sweepEnabled: boolean;
  /** 한방 호가변경 횟수 (ubyte — 0~255). */
  sweepMinTickCount: number;
  /** 한방 재계산. 클라 고정값 `true` 로 보낸다. */
  sweepRecalcEnabled: boolean;
  /** 한방 최소 횟수 (ubyte). 클라 고정값 `0`(= Case3 비활성). */
  sweepMinCount: number;
  /**
   * 한방 최소 상승률 — **BasisPoints** 다(2950 = 29.5%). `RelayViTrigger.checkRate` 가
   * 정수 % 인 것과 **단위가 다르다** (Pitfall 5). 클라 고정값 `0` 이라 이 함정을 만나지 않는다.
   */
  sweepMinRate: number;
  /** 거래소. 화이트리스트 밖이면 **저장도 에코도 없다** — ERROR 통지만 온다. */
  exchange: RelayExchange;
  /** 매도 비율 % — **1~100**. 벗어나면 서버가 매도를 눕힌다. */
  sellOrderRatio: number;
  /** 매도 잔량추적(래칫) 사용 여부. **에코는 접지 않은 원값**이다. */
  sellQtyTrackEnabled: boolean;
  /** 잔량추적 비율 % — **1~90**(100 금지, 서버 검증). 취소 잔량추적이 같은 값을 재사용한다. */
  sellQtyTrackRatio: number;
  /** 잔량추적 기준선(주) — **S→C 전용**. */
  sellQtyTrackBaseline: number;
  /** 매수 주문금액 — **단위 만원**. 서버는 보관·에코만 한다. `0` 의 의미는 위 주의 참조. */
  buyOrderAmount: number;
  /** 매도 진입 확인 래치 — **S→C 전용**. 무장과 접지 않은 원값이다. */
  sellEntryLatched: boolean;
  /** 취소:잔량 게이트. 에코는 `&& cancelArmed`. */
  cancelQtyEnabled: boolean;
  /** 취소 감시 잔량(주). */
  cancelWatchQty: number;
  /** 취소:체결 게이트. 에코는 `&& cancelArmed`. */
  cancelTradeEnabled: boolean;
  /** 취소 잔량추적 사용 여부. **에코는 접지 않은 원값**. */
  cancelQtyTrackEnabled: boolean;
  /** 취소 잔량추적 기준선(주) — **S→C 전용**. */
  cancelQtyTrackBaseline: number;
  /**
   * 전략 키 `${isin}:${accountNo}:${exchange}` — 게이트웨이 `LimitChaser::MakeKey` 와 동형.
   * 와이어에 실려 오는 필드가 아니라 **relay 가 파싱하며 채우는 파생값**이다. 실제 최대 29B 이고
   * `strategies.disable` 의 서버 키 상한(WR-09)은 64B 다.
   */
  key: string;
};

/**
 * `lc.set` 이 실어 보내는 상따 설정 — **클라 입력 30 + 클라 고정 3 = 33필드**.
 *
 * `RelayLimitChaser` 에서 S→C 전용 4필드와 파생 `key` 를 뺀 것이다. 고정 3 은
 * `sweepRecalcEnabled: true` · `sweepMinCount: 0` · `sweepMinRate: 0` 으로 WinForms
 * `LimitChaserForm.Send()` 와 같은 값을 보낸다. CONTEXT 의 "29필드" 는 실측과 다르다 (Pitfall 6).
 */
export type RelayLimitChaserInput = Omit<
  RelayLimitChaser,
  | "sellOrderQty"
  | "sellQtyTrackBaseline"
  | "sellEntryLatched"
  | "cancelQtyTrackBaseline"
  | "key"
>;

/**
 * VI 발동 감시 전략 (`SetVITrigger`, 5필드). 계좌당 1건이다.
 *
 * 서버는 「거부」를 응답 코드로 주지 않는다 — `run` 인데 `orderAmountKrw === 0` 이면
 * **저장하되 `run` 을 내려서** 에코하고 `ServerMessage(level:"ERROR")` 를 따로 보낸다.
 * 계좌 화이트리스트 밖이면 아예 저장하지 않는다. 그래서 "보냈으니 됐다" 판정은 금지고
 * ERROR 통지를 반드시 사용자에게 보여야 한다 (Pitfall 8, PC-7 무로그 fail-safe 금지).
 */
export type RelayViTrigger = {
  /** 계좌번호 (최대 12자). */
  accountNo: string;
  /**
   * 주문금액 — **원 단위**다. UI 는 만원으로 입력받아 x 10,000 해서 보낸다.
   * 게이트웨이는 64비트 정수로 주지만 와이어 계약은 `number` 다 (D-34) — relay 가 좁힌다.
   */
  orderAmountKrw: number;
  /** 발동 판정 상승률 — **정수 %**(25 = 25% 이상). `sweepMinRate` 와 단위가 다르다. */
  checkRate: number;
  /** 가격 유형. 상한가(`"U"`) 고정이고 UI 에 노출하지 않는다 — relay 가 채운다. */
  priceType: "U";
  /** 가동 여부. */
  run: boolean;
};

/**
 * VI 주문 1건의 서버 상태 6종 (`VIOrderItem.state`).
 * **부분체결은 별도 상태가 아니라** `state === "Accepted" && filledQty > 0` 파생이다.
 */
export type RelayViOrderState =
  | "Pending"
  | "Accepted"
  | "Cancelling"
  | "Cancelled"
  | "Filled"
  | "Rejected";

/** VI 주문 추적 1건 (`VIOrderItem`, 15필드 + relay 가 채우는 종목명). */
export type RelayViOrderItem = {
  /** 12자 ISIN. */
  isin: string;
  /** 시장 구분 — 취소 주문의 `market` 원천이다. */
  market: OrderMarket;
  /** 계좌번호. */
  accountNo: string;
  /**
   * 주문번호. **`""` 는 접수 전(Pending)** 이라 확인 체크를 열지 않는다 —
   * 빈 주문번호의 `vi.confirm` 은 서버가 응답 없이 드롭한다.
   */
  orderNo: string;
  /** 주문수량(주). */
  orderQty: number;
  /** 주문가(원) — 발주 시 상한가. */
  orderPrice: number;
  /** VI 발동가(원). */
  triggerPrice: number;
  /** 마스터 기준가(원) — 전일대비 % 계산의 분모다. */
  basePrice: number;
  /** VI 해제 예정시각 `"HHMMSSuuu"` 9자. 마감 알림(-10초)의 원천. */
  viEndTime: string;
  /** 110초 마감 epoch ms. 와이어는 `number` 다 (D-34). */
  deadline110Ms: number;
  /** 119초 마감 epoch ms. */
  deadline119Ms: number;
  /** 확인 체크 상태 — 서버 영속이다. */
  confirmed: boolean;
  /** 확인 잠금 — **서버 계산이다. 클라가 재계산하지 않는다.** */
  confirmLocked: boolean;
  /** 서버 상태 6종. 부분체결 파생은 위 주의 참조. */
  state: RelayViOrderState;
  /** 체결수량(주). `state === "Accepted" && filledQty > 0` 이 부분체결이다. */
  filledQty: number;
  /**
   * 종목명 — **게이트웨이가 주는 값이 아니다.** relay 가 `stocks.isin` 역매핑(SymbolMap)으로
   * 채운다. 마스터에 없으면 UI 가 `name ?? isin` 으로 폴백한다.
   */
  name?: string;
};

// ============================================================
// 인바운드 (브라우저 → relay)
// ============================================================

/** 첫 메시지 필수 (D-11). Supabase 액세스 토큰. */
export type RelayAuthMsg = { t: "auth"; token: string };

/** 시세+체결 구독. 키는 `isin + ex` (D-33). */
export type RelaySubMsg = { t: "sub"; isin: string; ex: RelayExchange };

/** 구독 해제. 마지막 구독자가 빠지면 relay 가 업스트림 `subscribe:false` 를 보낸다. */
export type RelayUnsubMsg = { t: "unsub"; isin: string; ex: RelayExchange };

/**
 * 상따 등록·수정·삭제 (`SetLimitChaserReq(10)`, D-01).
 *
 * D-06 「전체 필드를 현재 표시값으로 전송」이라 부분 갱신이 없다 — `cfg` 는 항상 33필드
 * 전부다. 반영 판정은 **60 에코 수신**이고, 에코가 오지 않는 것 자체가 거부 신호다
 * (Pitfall 8). 자동 재전송은 하지 않는다 — 사용자가 누르지 않은 두 번째 등록이 된다.
 */
export type RelayLcSetMsg = { t: "lc.set"; cfg: RelayLimitChaserInput };

/**
 * VI 전략 설정 (`SetVITriggerReq(11)`, D-01).
 * `priceType` 은 싣지 않는다 — 서버 규약상 `"U"` 고정이라 relay 가 채운다.
 */
export type RelayViSetMsg = {
  t: "vi.set";
  accountNo: string;
  /** **원 단위**. UI 의 만원 입력을 x 10,000 한 값이다. */
  orderAmountKrw: number;
  /** 정수 %. */
  checkRate: number;
  run: boolean;
};

/**
 * VI 주문 확인 체크 토글 (`ConfirmVIOrderReq(33)`).
 *
 * `orderNo` 가 비면 서버가 **응답 없이 드롭**하므로 애초에 보내지 않는다(스키마가 거부).
 * 반영되면 서버가 전 연결로 73(`vi.list` 델타)을 푸시한다 — 별도 확인 응답은 없으므로
 * 브라우저는 낙관 반영 후 73 으로 정정한다. 타임아웃 UI 를 만들지 않는다.
 */
export type RelayViConfirmMsg = { t: "vi.confirm"; orderNo: string; confirmed: boolean };

/**
 * 전략 일괄 비활성화 (`DisableStrategiesReq(14)`).
 *
 * `key` 생략·`""` 는 **세션의 상따 전부 + VI**, 값이 있으면 그 한 건이다. 어느 쪽이든
 * **등록은 유지하고 발주 게이트만 내린다**(삭제가 아니다). 서버 상한과 같은 64B 를
 * relay 에서 먼저 자른다 (T-16-06).
 */
export type RelayStrategiesDisableMsg = { t: "strategies.disable"; key?: string };

/**
 * 신규 주문 (`DirectOrderReq(2)` 신규, D-02).
 *
 * ⚠️ **`market` 은 브라우저가 보내지 않는다.** relay 가 `SymbolMap` 으로 ISIN → 단축코드·
 *    시장을 채운다 — 단축코드/시장을 클라가 정하면 D-28(산술 유도 금지)이 깨지고, 브라우저가
 *    보낸 시장 구분으로 엉뚱한 시장에 주문이 나갈 수 있다.
 * ⚠️ **`accountNo` 는 여기서 형식만 본다.** 소유권 대조(`session.allowedAccounts`)는 세션을
 *    쥔 핸들러의 책임이다 (T-16-01) — 스키마를 통과했다고 권한이 있는 것이 아니다.
 *
 * `rid` 는 브라우저가 만드는 상관 키다. 응답은 같은 `rid` 를 단 `order.result` 로 온다.
 */
export type RelayOrderNewMsg = {
  t: "order.new";
  /** 요청 상관 키 (브라우저 생성). `order.result.rid` 와 짝이다. */
  rid: string;
  /** 12자 ISIN — 게이트웨이 주문 키 (D-28). */
  isin: string;
  exchange: RelayExchange;
  side: OrderSide;
  qty: number;
  price: number;
  accountNo: string;
};

/**
 * 취소 주문 (`DirectOrderReq(2)` 취소, D-02).
 * `qty` 는 미체결 잔량 전부다 — `0` 은 조립 단계에서 거부된다 (D-21).
 * `market` 을 싣지 않는 이유와 `accountNo` 의 책임 경계는 `RelayOrderNewMsg` 와 같다.
 */
export type RelayOrderCancelMsg = {
  t: "order.cancel";
  rid: string;
  isin: string;
  exchange: RelayExchange;
  /** 원주문번호 — 취소는 필수다. */
  orgOrderNo: string;
  qty: number;
  price: number;
  accountNo: string;
};

/** 브라우저가 보내는 모든 메시지. `t` 로 분기하는 discriminated union. */
export type RelayInbound =
  | RelayAuthMsg
  | RelaySubMsg
  | RelayUnsubMsg
  | RelayLcSetMsg
  | RelayViSetMsg
  | RelayViConfirmMsg
  | RelayStrategiesDisableMsg
  | RelayOrderNewMsg
  | RelayOrderCancelMsg;

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
  /**
   * 종목명 — **게이트웨이가 주는 값이 아니다.** relay 가 `stocks.isin` 역매핑으로
   * 채운다(`store/symbols.ts`). 마스터에 없는 ISIN(신규 상장 직후 등)에서는 없다.
   * UI 는 `name ?? isin` 으로 폴백한다.
   */
  name?: string;
  /** 6자 단축코드. 같은 역매핑 산물이다. */
  code?: string;
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
  /** 종목명 — relay 가 `stocks.isin` 역매핑으로 채운다. 없으면 UI 가 ISIN 을 보여준다. */
  name?: string;
  /**
   * 6자 단축코드 — 표시용이다. D-02 이후 취소는 `RelayOrderCancelMsg` 가 **`isin` 을**
   * 키로 쓰므로(단축코드→ISIN 산술 유도 금지, D-28) 이 값이 없어도 취소할 수 있다.
   * 없으면 UI 가 ISIN 을 대신 보여준다.
   */
  code?: string;
};

/** 계좌 상태 (`AccountState`) — 잔고·미체결 전량/델타. */
export type RelayAccountState = {
  t: "acct";
  /** 계좌번호. */
  a: string;
  /**
   * true=전량 교체, false=키 upsert + 0행/`rm` 제거.
   *
   * 서버가 0/0 원소를 맵에서 지우므로 **수량 0 행이 곧 삭제 신호**다
   * (gh-trade quick-260906-e8b): 델타의 `hold[].qty === 0` 은 그 종목 삭제,
   * `unf[].unfilledQty === 0` 은 그 주문 삭제다. 잔고에는 `rm` 에 해당하는
   * 삭제 표식이 없으므로 톰스톤 행이 유일한 통보 수단이다.
   */
  snap: boolean;
  hold: RelayHolding[];
  unf: RelayUnfilled[];
  /** 델타 전용 삭제 표식 — **미체결 주문번호 전용**이다(잔고는 톰스톤 행). 스냅샷에서는 빈 배열. */
  rm: string[];
  /** 갱신시각 (표시용). */
  st: string;
};

/**
 * 주문 통보 (`OrderResp` 파생, D-02).
 * 접수("A")는 요청의 상관 응답(`RelayOrderResultMsg`)으로도 나가지만, 체결("E")·
 * 취소확인("C")·거부("R")는 이 푸시가 유일 경로다.
 *
 * ⚠️ 판별자를 `"order"` 로 **유지**한다. 인바운드는 `order.new`/`order.cancel`, 상관 응답은
 *    `order.result` 로 접미사가 다르다 — 셋이 같은 `t` 를 쓰면 로그·테스트에서 구분이
 *    사라진다 (Pitfall 15).
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

/**
 * 상따 설정 에코 1건 (`SetLimitChaserResp(60)`).
 *
 * **반영의 유일한 증거**다 — 서버는 거부를 응답 코드로 주지 않으므로, 에코가 오지 않으면
 * 거부(계좌·거래소)이고 눕혀진 값으로 오면 부분 거부다 (Pitfall 8). `crud: "D"` 도 이 프레임으로
 * 온다 — 「삭제됨」은 스위치가 아니라 이 값으로 판정한다 (Pitfall 7).
 */
export type RelayLimitChaserMsg = { t: "lc"; item: RelayLimitChaser };

/**
 * 상따 전략 전량 스냅샷 (`LimitChaserList(64)`).
 * 원소는 60 에코와 **같은 바이트**라 두 경로가 갈리지 않는다. 새 탭이 붙었을 때 이 1프레임으로
 * 목록을 복원한다 — `RelayAccountState.snap === true` 와 같은 「전량 교체」 규약이다.
 */
export type RelayLimitChaserSnapMsg = { t: "lc.snap"; items: RelayLimitChaser[] };

/**
 * VI 전략 에코 (`SetVITriggerResp(61)`).
 * **`cfg: null` 은 미등록**이다(서버가 빈 응답을 보낸다 — 무응답이 아니다). 이때 UI 는
 * 입력값을 그대로 두고 가동 스위치만 내린다.
 *
 * ⚠️ 15:40 서버 자동 비활성화의 `run=false` 는 **Broadcast 라 드롭될 수 있다** (Pitfall 19).
 *    드롭되면 화면이 「가동」으로 남으므로 장 마감 표시로 오해를 막는다.
 */
export type RelayViTriggerMsg = { t: "vi"; cfg: RelayViTrigger | null };

/**
 * VI 주문 추적 목록 (`VIOrderList` 72 스냅샷 / 73 델타).
 * `snap` 규약은 `RelayAccountState.snap` 과 **동형**이다 — true=전량 교체,
 * false=`orderNo` 키 upsert. 0건도 길이 0 배열로 온다.
 */
export type RelayViListMsg = { t: "vi.list"; snap: boolean; items: RelayViOrderItem[] };

/**
 * VI 발동 통지 (`VIOrderNotice(56)`) — 발주 세션의 전 연결로 온다.
 * 해석 없이 그대로 흘린다. 전일대비 %는 `basePrice` 로 브라우저가 계산한다.
 */
export type RelayViNoticeMsg = {
  t: "vi.notice";
  /** 발동 종목 12자 ISIN. */
  isin: string;
  /** 발주 계좌. */
  accountNo: string;
  /** VI 발동가(원). */
  triggerPrice: number;
  /** 마스터 기준가(원) — 전일대비 % 계산의 분모다. */
  basePrice: number;
  /** 서버 판정에 쓴 상승률 — **정수 %**(내림). */
  changeRate: number;
  /** 주문가(원) = 상한가(`priceType: "U"`). */
  orderPrice: number;
  /** 주문수량(주) — 상한수량 클램프 후 값. */
  orderQty: number;
  /** 시장 구분 — 취소 주문의 `market` 원천이다. */
  market: OrderMarket;
  /** 발동당 주문 순번. 현재 항상 1이고 장래 확장 슬롯이다. */
  orderSeq: number;
  /** VI 해제 예정시각 `"HHMMSSuuu"` 9자. */
  viEndTime: string;
  /** 종목명 — relay 가 `stocks.isin` 역매핑으로 채운다. 없으면 UI 가 ISIN 을 보여준다. */
  name?: string;
};

/**
 * 전략 일괄 비활성화 집계 (`DisableStrategiesResp(65)`).
 *
 * ⚠️ **완료 신호로만 쓴다.** 서버가 키별 60/61 에코를 세션 전 연결에 먼저 보낸 뒤 이 집계를
 *    요청 연결에만 보내므로, 이 프레임을 받은 시점에는 이미 모든 행이 에코로 갱신돼 있다.
 *    여기 담긴 숫자로 화면 상태를 만들면 에코와 두 벌이 갈린다.
 */
export type RelayStrategiesDisabledMsg = {
  t: "strategies.disabled";
  /** 내려간 상따 개수. `StrategyManager` 가 없어도 `0` 으로 정상 응답한다. */
  count: number;
  /** VI 도 함께 내려갔는지. */
  viDisabled: boolean;
};

/**
 * 주문 요청의 상관 응답 (D-02) — `order.new`/`order.cancel` 의 `rid` 를 그대로 되돌린다.
 *
 * 첫 `OrderResp(51)` 까지 최대 5초 기다린 결과다. 5초를 넘기면 `status: "timeout"` 인데
 * 이는 **"실패"가 아니라 "결과를 모름"** 이다 — 주문이 이미 나갔을 수 있으므로 UI 는
 * 미체결 목록 확인을 안내하고 재주문을 유도하지 않는다 (Pitfall 9).
 *
 * 이후 체결·취소확인은 이 프레임이 아니라 `RelayOrderMsg`(`t: "order"`) 푸시로 온다.
 */
export type RelayOrderResultMsg = {
  t: "order.result";
  /** 요청의 `rid` 를 그대로 되돌린다. */
  rid: string;
  /** 주문번호. 접수 전 거부·타임아웃이면 "". */
  orderNo: string;
  /** 결과코드 (0=성공, 그 외=거부코드). */
  resultCode: number;
  message: string;
  /** `"timeout"` 을 포함한 수명주기 상태. 위 주의 참조. */
  status: DmaOrderStatus;
};

/** relay 가 브라우저로 보내는 모든 메시지. `t` 로 분기한다. */
export type RelayOutbound =
  | RelayStateMsg
  | RelayQuote
  | RelayTape
  | RelayAccountState
  | RelayOrderMsg
  | RelayServerMsg
  | RelayLimitChaserMsg
  | RelayLimitChaserSnapMsg
  | RelayViTriggerMsg
  | RelayViListMsg
  | RelayViNoticeMsg
  | RelayStrategiesDisabledMsg
  | RelayOrderResultMsg;

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
 * Phase 15 의 `POST /api/orders` 요청 바디 (webapp → server).
 *
 * ⚠️ **D-02 로 대체됐다** — 주문은 relay wss 단일 경로(`RelayOrderNewMsg` /
 *    `RelayOrderCancelMsg`)로 올린다. 이 타입은 라우트가 살아 있는 동안만 남는 잔여물이고
 *    16-16 에서 라우트와 함께 제거된다. **새 코드는 참조하지 않는다.**
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
 * Phase 15 의 `POST /api/orders` 응답 (server → webapp).
 *
 * ⚠️ **D-02 로 대체됐다** — 같은 내용이 `RelayOrderResultMsg` 로 wss 를 통해 온다.
 *    16-16 에서 라우트와 함께 제거된다. **새 코드는 참조하지 않는다.**
 *
 * 첫 `OrderResp(51)` 까지 최대 5초 대기한 결과다. 5초를 넘기면 `status:"timeout"` 으로
 * 응답한다 — **"실패"가 아니다**. 주문이 이미 나갔을 수 있으므로 UI 는 미체결 목록 확인을
 * 안내한다 (UI-SPEC §주문 CTA · 결과).
 */
export type CreateOrderResponse = {
  /** 주문번호. 접수 전 거부·타임아웃이면 "". */
  orderNo: string;
  /** 결과코드 (0=성공, 그 외=거부코드). */
  resultCode: number;
  message: string;
  status: DmaOrderStatus;
};

/**
 * `GET /api/orders` 응답 1건 (server → webapp) — `dma_orders` 한 행의 camelCase 뷰.
 *
 * 한 행이 주문 하나의 **수명주기 전체**를 담는다 (D-24): server 가 요청을 insert 하고,
 * 접수/거부 응답으로 1차 갱신하고, 이후 체결·취소확인 통보를 relay 가 같은 행에 쓴다.
 * 그래서 새로고침 후에도 오늘 주문 목록을 이 조회 하나로 복원할 수 있다.
 *
 * `userId` 는 담지 않는다 — 항상 요청자 본인의 행만 나가므로 실을 이유가 없다.
 *
 * ⚠️ `status:"timeout"` 은 **"실패"가 아니라 "결과를 모름"** 이다. UI 는 "결과 확인 중 —
 * 미체결 목록을 확인하세요"를 표시하고 재주문을 유도하지 않는다 (Pitfall 9).
 */
export type DmaOrderRow = {
  id: string;
  accountNo: string;
  /** 12자 KRX 표준코드. 게이트웨이 주문 키 (D-28). */
  isin: string;
  /** 6자 단축코드. 상장폐지로 마스터에서 빠지면 null (기록은 남는다). */
  stockCode: string | null;
  exchange: RelayExchange;
  market: OrderMarket;
  side: OrderSide;
  orderType: OrderType;
  /** 취소 주문의 원주문번호. 신규는 null. */
  orgOrderNo: string | null;
  qty: number;
  price: number;
  /** 접수 후 부여. 접수 전 거부·타임아웃이면 null. */
  orderNo: string | null;
  status: DmaOrderStatus;
  /** 0=성공, 그 외 거부코드. 통보 전이면 null. */
  resultCode: number | null;
  /** 게이트웨이 통보 원문 1자 (A/E/C/R). 해석하지 않는다. */
  noticeType: string | null;
  message: string | null;
  filledQty: number;
  createdAt: string;
  updatedAt: string;
};
