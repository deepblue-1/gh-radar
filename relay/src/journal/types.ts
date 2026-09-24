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
};

/** 저널 배치 프레임 1건. */
export type JournalBatchFrame = {
  records: JournalRecord[];
  headSeq: number;
  /** 이 배치로 게이트웨이 head 까지 따라잡았는가(재생 → live 전이 신호). */
  caughtUp: boolean;
};

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
  buildLoginReq(input: { secret: string; sinceSeq: number; epoch: string; client: string }): Uint8Array;
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
};
