/**
 * Phase 19 Plan 05 — 관찰자 기록(저널) 도메인 타입 정본.
 *
 * 관찰자 연결(19-07 `JournalObserver`) · 와이어 코덱(19-09) · 기록기(`writer.ts`) · 매핑
 * (`access.ts`) 가 모두 이 파일의 타입에 붙는다. **와이어 계약(G1 — gh-trade 인계서)이
 * 확정돼도 이 타입은 유지되고 코덱이 매핑만 바꾼다 — 스왑 지점은 `JournalCodec` 하나다.**
 * FlatBuffers 생성 타입을 기록기·매핑이 직접 쓰지 않는 이유가 이것이다 — 스키마 필드명이
 * 바뀌어도 코덱 한 파일만 고치면 된다.
 *
 * 필드 의미의 정본은 `19-GH-TRADE-HANDOFF.md` 의 23필드 ↔ 이벤트 JSON 키 대응표다.
 * 값은 **게이트웨이 원문**이다 — relay 는 해석·보정·재정규화를 하지 않는다(투영은 DB RPC 정본).
 */
import type {
  TransportDownEvent,
  TransportFrameEvent,
  TransportReconnectingEvent,
  TransportUpEvent,
} from "../dma/dma-client.js";

/**
 * 게이트웨이 저널 레코드 1건 (camelCase 도메인 표현).
 *
 * `toApplyEvent` 가 이것을 `dma_journal_apply` 입력 키 23종(snake_case)으로 1:1 바꾼다.
 */
export type JournalRecord = {
  /** 게이트웨이 저널 seq — epoch 안에서 조밀(1 씩 증가)하다. 기록기의 연속성 판정 근거. */
  seq: number;
  /** KST 거래일 `YYYY-MM-DD`. */
  tradeDate: string;
  /** 게이트웨이 기록 시각(epoch ms). DB 의 `created_at`/`updated_at` 정본(재생 시각이 아니다). */
  gwTimeMs: number;
  /** 주문을 낸 DMA 사용자 id. **로그·프레임에 싣지 않는다**(T-19-08 · T-19-14). */
  dmaUserId: string;
  /** 계좌번호 — 게이트웨이 정규화값 그대로(재정규화 금지 · Pitfall 7). 로그는 `maskAccountNo`. */
  accountNo: string;
  isin: string;
  side: string;
  /** `side` 를 믿을 수 있는가(C/M 통보만 받은 행은 false). */
  sideTrusted: boolean;
  orderNo: string;
  orgOrderNo: string;
  noticeType: string;
  requestKind: string;
  requester: string;
  /** 발주 주체 원문. 해석은 DB(`dma_journal_origin`)가 한다. */
  origin: string;
  exchange: string;
  board: string;
  orderPrice: number;
  orderQty: number;
  execPrice: number;
  execQty: number;
  resultCode: number;
  message: string;
  /** 게이트웨이 로컬 거부(주문번호 없음) 레코드인가. */
  localReject: boolean;
};

/**
 * 게이트웨이 전략 이벤트 1건 (Phase 25 · camelCase 도메인 표현 — `.fbs` `table StrategyEvent` 43필드와 1:1).
 *
 * 관찰자 80 `JournalBatch.strategy_events` 가 원천이다 — 주문 저널과 **같은 epoch · 별도 seq 공간**(G1 (e)).
 * `toStrategyApplyEvent`(`strategy-stream.ts`)가 이것을 `dma_strategy_apply` 입력 키 43종(snake_case)으로
 * 1:1 바꾼다. 값은 게이트웨이 원문이다 — 없는 값은 0 / "" (와이어 규약). 64비트 칸은 파서 경계에서 number 로
 * 내렸다(`toNum` · D-34 — `gw_time_ms` 는 `long`, 누적류는 `ulong`/`long` 이지만 경계 뒤에서는 같다 · G1 ⓒ).
 */
export type StrategyEventRecord = {
  /** 전략 스트림 seq — epoch 안에서 조밀하다(주문 저널과 별도 공간). 기록기의 연속성 판정 근거. */
  seq: number;
  tradeDate: string;
  gwTimeMs: number;
  kind: number;
  group: number;
  exchange: string;
  isin: string;
  cumVolume: number;
  /** 주문을 낸 DMA 사용자 id(시세 이벤트는 ""). **로그 · 프레임에 싣지 않는다**(T-19-08 · T-19-14). */
  dmaUserId: string;
  /** 주문 이벤트만(시세 이벤트는 ""). 게이트웨이 정규화값 그대로 — 로그는 `maskAccountNo`. */
  accountNo: string;
  orderNo: string;
  price: number;
  qty: number;
  orderCondition: string;
  reasonCode: string;
  condThreshold: number;
  condActual: number;
  condMetric: number;
  evKind: number;
  evPrice: number;
  evQtyBefore: number;
  evQtyAfter: number;
  evTradeQty: number;
  limitBidQty: number;
  bid1Price: number;
  bid1Qty: number;
  acceptLatencyUs: number;
  immediateFillQty: number;
  queueCase: number;
  baseCum: number;
  aheadQty: number;
  expectedCum: number;
  errorVolume: number;
  remainingVolume: number;
  hasRemaining: boolean;
  cancelReason: number;
  resultCode: number;
  message: string;
  entryRound: number;
  snapQty: number[];
  snapCum: number[];
  askQtyAtLimit: number;
  openAtLimit: boolean;
};

/** 관찰자 로그인 응답의 DMA 사용자 → 계좌 매핑 1행 (users.toml 평탄화 · D-06). */
export type ObserverAccountRow = {
  dmaUserId: string;
  accountNo: string;
  name: string;
  priority: number;
};

/** 관찰자 로그인 응답. */
export type ObserverLoginResult = {
  success: boolean;
  message: string;
  broker: string;
  /** 게이트웨이 저널 epoch — 저장소가 초기화되면 바뀐다(Pitfall 3). */
  epoch: string;
  /** 게이트웨이가 가진 마지막 seq. */
  headSeq: number;
  /** 게이트웨이가 아직 보관하는 가장 오래된 seq. */
  oldestSeq: number;
  /** `since_seq` 로 이어받을 수 없다(epoch 변경 · 보관 범위 밖) — 처음부터 다시 받는다. */
  resync: boolean;
  accounts: ObserverAccountRow[];
  /**
   * 전략 이벤트 스트림의 head · oldest · resync (Phase 25 — 같은 epoch · 별도 seq 공간). 주문 3필드와 같은 뜻을
   * 전략 스트림에 한 번 더 판정한 값이다(G1 ⓑ). 전략 저널이 없거나 구 게이트웨이면 0 / 0 / false.
   */
  strategyHeadSeq: number;
  strategyOldestSeq: number;
  strategyResync: boolean;
  /**
   * 게이트웨이가 수락한 관찰자 역할 에코 (Phase 26 · ed2e0240 · 슬롯 26). 0 = journal · 1 = quote.
   * 거부 응답과 구 게이트웨이(필드 없음)는 0 이다. 저널 관찰자는 role 을 싣지 않으므로 0 으로 로그인한다.
   */
  role: number;
};

/** 저널 배치 프레임 1건. */
export type JournalBatchFrame = {
  records: JournalRecord[];
  headSeq: number;
  /** 이 배치로 게이트웨이 head 까지 따라잡았는가(재생 → live 전이 신호). */
  caughtUp: boolean;
  /**
   * 같은 프레임의 두 번째 스트림 (Phase 25 · G1 ⓐ). 한쪽 0건이면 빈 벡터가 온다 — 구 게이트웨이(필드 없음)는
   * 파서가 `[]` · 0 · false 로 내린다. `strategyCaughtUp` 은 전략 스트림 커서 상태이고 live 전이는 두 caught_up
   * 이 모두 참일 때다.
   */
  strategyEvents: StrategyEventRecord[];
  strategyHeadSeq: number;
  strategyCaughtUp: boolean;
  /**
   * 전략 이벤트 필수 키 계약 위반 (WR-01). 적용 RPC 가 엄격 캐스트하는 키(`seq > 0` · `trade_date` YYYY-MM-DD)가
   * 깨진 이벤트를 만나면 파서가 **그 앞까지만** `strategyEvents` 에 담고 여기에 첫 위반을 적는다 — 그대로 올리면
   * 적용 RPC 가 배치 전체를 거부하고 기록기가 같은 배치를 영원히 재시도한다. 관찰자는 이것을 보고 전략 수신만
   * 멈춘다(주문 저널은 계속). 생략 · null = 위반 없음.
   */
  strategyContractViolation?: StrategyContractViolation | null;
};

/** 전략 이벤트 필수 키 계약 위반 1건 — 식별자 없이 seq 와 칸 이름만(T-19-07). */
export type StrategyContractViolation = { seq: number; field: "seq" | "trade_date" };

/**
 * 관찰자가 전략 수신을 멈춘 사유 (WR-01). 주문 저널과 소켓을 공유하므로 전략 쪽 장애로 소켓을 끊지 않고
 * 전략분만 버린다(since 는 전진하지 않는다 · 다음 재로그인이 이어받는다).
 *   - `overflow` — 전략 기록기 큐 상한(적용 RPC 지속 실패 · DB 지연). 큐가 비면 관찰자가 한 번 재로그인해 이어받는다.
 *   - `contract` — 필수 키 계약 위반 이벤트(`StrategyContractViolation`). 자동 재개하지 않는다 — 재로그인해도 같은
 *     이벤트가 재생되므로 게이트웨이 쪽 수정이 필요하다.
 *   - `cursor` — 전략 커서(`dma_journal_cursor` 전략 칸) 읽기 실패(19-REVIEW WR-01). 주문 커서만으로 연결하고 전략
 *     커서는 백오프로 따로 다시 읽는다. 읽히면 한 번 재로그인해 전략 since 로 이어받는다. 재로그인으로 풀리지 않는다 —
 *     커서를 읽어야만 풀린다(since 를 모른 채 받으면 갭 판정이 무너진다).
 */
export type StrategyPauseReason = "overflow" | "contract" | "cursor";

/** 코덱이 수신 프레임 1건을 해석한 결과. */
export type ObserverFrame =
  | { k: "login"; result: ObserverLoginResult }
  | { k: "batch"; batch: JournalBatchFrame }
  /** 관찰자와 무관한 브로드캐스트(76 `RateCrossAlert` 등) — 조용히 버린다. */
  | { k: "ignore"; msgType: number }
  /** 관찰자 연결에 오면 안 되는 종류 — warn 후 버린다. */
  | { k: "unexpected"; msgType: number }
  /** 디코드 실패 — warn 후 버린다. */
  | { k: "malformed"; msgType: number };

/** 와이어 코덱 — 19-09 가 FlatBuffers 로 구현한다. **스왑 지점은 여기 하나다.** */
export type JournalCodec = {
  buildLoginReq(input: {
    secret: string;
    sinceSeq: number;
    epoch: string;
    client: string;
    /** 전략 스트림 since (Phase 25). 0 = 보관분 처음부터. */
    strategySinceSeq: number;
  }): Uint8Array;
  decode(e: TransportFrameEvent): ObserverFrame;
};

/**
 * `DmaClient` 중 관찰자가 쓰는 부분. `DmaClient` 가 구조적으로 그대로 만족한다 —
 * 테스트는 이 표면만 흉내 낸 스텁을 넣는다.
 */
export interface ObserverTransport {
  on(event: "up", listener: (e: TransportUpEvent) => void): unknown;
  on(event: "down", listener: (e: TransportDownEvent) => void): unknown;
  on(event: "frame", listener: (e: TransportFrameEvent) => void): unknown;
  on(event: "reconnecting", listener: (e: TransportReconnectingEvent) => void): unknown;
  /** 리스너 해제 — `JournalObserver.stop()` 이 붙인 리스너를 같은 참조로 뗀다(19-07). */
  off(event: "up", listener: (e: TransportUpEvent) => void): unknown;
  off(event: "down", listener: (e: TransportDownEvent) => void): unknown;
  off(event: "frame", listener: (e: TransportFrameEvent) => void): unknown;
  connect(): void;
  send(payload: Uint8Array): boolean;
  stopReconnect(reason: string): void;
  dropTransport(reason: string): void;
  resetReconnectAttempts(): void;
  destroy(): void;
  readonly generation: number;
}

/** DB 커서(`dma_journal_cursor`) 사본. 행이 없으면 `{ epoch: "", lastSeq: 0 }`. */
export type JournalCursor = { epoch: string; lastSeq: number };

/** 관찰자 연결 상태 (19-07 상태기계 · `/healthz` 노출). */
export type JournalObserverState =
  | "disabled"
  | "connecting"
  | "logging_in"
  | "replaying"
  | "live"
  | "rejected";

/** 푸시 라우팅이 보는 매핑 읽기 표면 — `JournalAccess` 가 만족한다. */
export type JournalAccessView = {
  accountsOf(dmaUserId: string): ReadonlySet<string> | undefined;
};

/**
 * 추가 게이트웨이 신원 읽기 표면 (quick-260929-sas) — `GatewayIdentities.viewOf(gateway)` 가 돌려준다.
 *
 * 키는 **gh-radar user_id** 이고 값은 그 게이트웨이의 `dma_user_id`(users.toml user_id)다. 원천은 DB 뷰
 * `dma_visibility_identities` 의 명시 연결 갈래다 — 자격증명 문자열(`dma_credentials.dma_user_id`)이 아니다.
 * 게이트웨이당 사용자 신원은 1개다(연결 테이블 PK (user_id, gateway) · 뷰 구성이 보장). 모르면 undefined —
 * 그 사용자는 그 게이트웨이 푸시 대상이 아니다(fail closed).
 */
export type GatewayIdentityView = {
  dmaUserIdOf(userId: string): string | undefined;
};

/**
 * 추가 게이트웨이 푸시 경로 (quick-260929-sas) — `WsFanout.deliverJournalRows` · `deliverStrategyEvents` 의 둘째 인자.
 * 사용자 → `identities` 로 그 게이트웨이 신원 → `access` 로 그 신원의 계좌 집합. REST 조회 RPC 의
 * `dma_visible_accounts` 와 같은 규칙이다.
 */
export type ExtraGatewayRoute = {
  access: JournalAccessView;
  identities: GatewayIdentityView;
};

/**
 * `JournalWriter.push` 결과.
 *   - `ok`       — 전부 적재(중복은 건너뜀)
 *   - `gap`      — seq 건너뜀 발견. 앞부분만 적재됐다 — 호출자는 연결을 끊고 `since_seq` 로 다시 받는다
 *   - `overflow` — 큐 상한 초과. 아무것도 적재하지 않았다 — 호출자는 연결을 끊는다(T-19-09)
 */
export type JournalPushResult = "ok" | "gap" | "overflow";

/** 기록기 관측값 (`/healthz` · `health` 이벤트). 식별자·계좌를 담지 않는다. */
export type JournalWriterHealth = {
  /** 큐에 남은 레코드 수(진행 중 배치 포함). */
  queueDepth: number;
  /** 연속 적용 실패 횟수. 성공하면 0. */
  consecutiveFailures: number;
  /** 연속 실패가 임계(`dbErrorAfter`) 이상인가 — 관찰자 상태 `db_error` 의 원천. */
  dbError: boolean;
  /** 마지막으로 DB 커서가 확인해 준 seq. 아직 모르면 null. */
  lastAppliedSeq: number | null;
  /** 마지막 적용 성공 시각(epoch ms). 아직 없으면 null. */
  lastAppliedAtMs: number | null;
  /**
   * 부팅 뒤 관측한 seq 역행 횟수 — 같은 epoch 인데 로그인 응답 head 가 마지막 수신 seq 보다 작았다
   * (게이트웨이가 같은 epoch 를 되살렸지만 최신 기록을 잃음 · gh-trade Phase 23 합의). 0 이면 없음.
   */
  seqRegressions: number;
  /** 마지막 seq 역행 관측 시각(epoch ms). 없으면 null. */
  lastSeqRegressionAtMs: number | null;
};

/**
 * `/healthz` · `journal.state` 가 보는 파생 상태 (19-07 `JournalStatus`).
 * 관찰자 상태에 기록기의 `db_error`(적용 RPC 연속 실패)를 겹친 것이다.
 */
export type JournalDerivedState = JournalObserverState | "db_error";

/**
 * `/healthz` 의 `journal` 필드 (Phase 19 D-04 (b)). **공개 경로다** — 키 이름·값에 계좌·사용자
 * 식별자를 싣지 않는다(T-19-07 · smoke `health_probe` 가 `accountNo|userId|account_no|user_id` 키를 grep).
 * seq 는 계수라 수용한다(거래량 신호 수준 — D-04 가 명시한 필드).
 */
export type JournalHealth = {
  state: JournalDerivedState;
  /** 기록기가 DB 커서로 확인한 마지막 seq. 모르면 null. */
  lastSeq: number | null;
  /** 게이트웨이가 알려 준 마지막 seq(로그인 응답 · 배치). 모르면 null. */
  headSeq: number | null;
  /** `headSeq − lastSeq`(0 이상). 둘 중 하나라도 모르면 null. */
  lagSeq: number | null;
  /** live 를 벗어난 지 몇 초인가. live · disabled 면 null. */
  disconnectedSec: number | null;
  /** 마지막 적용 성공 뒤 몇 초인가. 아직 없으면 null. */
  lastAppliedAgeSec: number | null;
  /**
   * 부팅 뒤 seq 역행 관측 횟수(`JournalWriterHealth.seqRegressions`). **503 판정에 쓰지 않는다** —
   * 기록기가 마지막 수신 seq 를 유지해 스트림은 정상으로 이어지므로 알림이 아니라 표시 신호다.
   */
  seqRegressions: number;
  /** 마지막 seq 역행 관측 뒤 몇 초인가. 없으면 null. */
  lastSeqRegressionAgeSec: number | null;
  /**
   * 전략 스트림 관측값 (Phase 25) — **표시 신호, 503 판정에 쓰지 않는다 · 식별자 없음**(계수 · 불리언만 — T-19-07).
   * 전략 적용 연속 실패(`dbError`)나 큐 적체(`queueDepth`)는 여기서만 드러나고 `state`(주문 스트림 기준)는 바꾸지 않는다.
   * 전략 기록기를 주입하지 않은 상태 요약이면 null(키는 늘 있다).
   */
  strategy: JournalStrategyHealth | null;
};

/** `JournalHealth.strategy` — 전략 스트림 한 칸. */
export type JournalStrategyHealth = {
  /** 전략 기록기가 DB 커서로 확인한 마지막 seq. 모르면 null. */
  lastSeq: number | null;
  /** 게이트웨이가 알려 준 전략 스트림 마지막 seq. 모르면 null. */
  headSeq: number | null;
  /** `headSeq − lastSeq`(0 이상). 둘 중 하나라도 모르면 null. */
  lagSeq: number | null;
  /** 전략 적용 RPC(`dma_strategy_apply`) 연속 실패. 파생 상태 `db_error` 와 무관하다. */
  dbError: boolean;
  /** 전략 기록기 큐 깊이 — 상한에 닿으면 관찰자가 전략 수신만 멈춘다(`paused: "overflow"` · 주문 기록은 계속 · WR-01). */
  queueDepth: number;
  /** 관찰자가 전략 수신을 멈춘 사유. null = 받는 중. 503 판정 밖(표시 신호 · WR-01). */
  paused: StrategyPauseReason | null;
};
