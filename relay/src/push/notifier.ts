/**
 * Phase 40 — 체결 앱 푸시 송신 조율기 (`PushNotifier`).
 *
 * 기록기(`JournalWriter` · 전략 기록기)가 적용을 확정한 행(`applied`)을 받아 **언제 묻고 어디로 보낼지** 만 쥔다.
 * 판정(단계 · 멱등 · 기기 고르기)은 DB 판정 RPC `dma_push_claim`(40-05)이 하고, 문안은 shared `pushMessageOf`(40-02)가
 * 만들고, 실제 송신은 `PushSender`(APNs · FCM — 40-09)가 한다. 결과는 `dma_push_report`(40-01) 한 번으로 돌려준다.
 *
 *   applied 행 → 1차 거름(`isPushCandidate` · `isAutoSellPushEvent`) → 게이트웨이 큐(정착 400ms · 단일 비행)
 *     → 수신자(계좌 → 그 서버 매핑의 DMA id → `userIdsOf` 권한 사용자 전부) → `dma_push_claim`
 *     → send 마다 문안(`pushMessageOf` · 탭 경로 · 묶음 키 · collapseId = log_id) → 기기마다 그 플랫폼 송신기
 *     → `dma_push_report` 1회 → `[push] 송신` info 1줄(건수만)
 *
 * 결정 근거:
 *   D-06  받는 사람 = 그 서버 매핑에서 그 계좌를 가진 **모든** DMA id 의 권한 사용자 전부(`AppAccess.userIdsOf` —
 *         admin/trader). 공유 계좌의 다른 사용자도 받고 viewer · 매핑 밖은 받지 않는다(웹 토스트 범위와 같다).
 *   D-07  「보낸 것」 은 DB 체인 표가 정본이다 — relay 재기동으로 같은 행이 다시 enqueue 돼도 RPC 가 `sends: []` 를 준다(SC-2).
 *   D-09  게이트웨이마다 큐 하나 · 정착 `PUSH_SETTLE_MS` · 단일 비행 — 진행 중에 들어온 행은 다음 묶음에 합쳐진다(같은
 *         주문은 한 번만 판정 RPC 에 들어간다).
 *   D-03  `deferred`(짝 이벤트를 아직 못 본 주문)는 `PUSH_DEFER_MS` 뒤 `p_allow_fallback: true` 로 한 번만 다시 부른다.
 *   D-25  자동매도 시작은 relay 계좌 캐시(`holdingOf`)에 값이 있을 때만 보유 수량 · 평단을 사실에 얹는다.
 *   SC-3  리스너는 동기 enqueue 만 하고 자기 try/catch 로 예외를 삼킨다(로그는 남긴다) — writer 는 emit 전체를 한 번만
 *         감싸므로(앞 리스너가 throw 하면 뒤 리스너가 안 불린다) 푸시 쪽이 스스로 격리해야 한다(RESEARCH Pitfall 1).
 *         RPC · 송신 실패는 저널 적용 · 팬아웃 · 다음 배치를 막지 않는다.
 *   공식 API 운영 기준 4 — 송신기가 `stopRun`(429 등 한도 신호)을 주면 그 묶음의 그 플랫폼 남은 송신을 멈춘다(두드리지 않는다).
 *
 * 하지 않는 것:
 *   - 「보낸 것」 을 메모리에 들지 않는다(D-07 — DB 가 정본).
 *   - 단계를 판정하지 않는다 — 상태 · 유형 1차 거름만(DB 판정의 부분집합). 문안도 조립하지 않는다(shared 한 곳).
 *   - 로그에 계좌번호 · 토큰 · 사용자 id · DMA id 를 싣지 않는다(T-19-14) — 건수 · 게이트웨이 · 단계 · 결과 코드만.
 *     PostgREST 오류는 `safePgError` 로만.
 *   - writer · fanout · 주문 · 전략 코드를 바꾸지 않는다(SC-3) — `wirePipeline` 의 fanout 줄 **뒤**에 리스너로만 붙는다.
 */
import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { pushMessageOf, pushTapPathOf, pushThreadIdOf } from "@gh-radar/shared";
import type { JournalOrderRow, JournalOrderStatus, PushFacts, PushPlatform, PushStage, StrategyEventRow } from "@gh-radar/shared";

import { logger } from "../logger.js";
import { safePgError } from "../store/pg-error.js";

/** 정착 시간(ms) — 적용 행이 이만큼 조용해지면 한 묶음으로 판정 RPC 를 부른다(D-09). */
export const PUSH_SETTLE_MS = 400;
/** 짝 대기(deferred) 재호출 지연(ms) — 이 뒤 `p_allow_fallback: true` 로 한 번만(D-03). */
export const PUSH_DEFER_MS = 1_500;
/**
 * 판정 RPC 오류 재시도 지연(ms) — 1회만. 판정은 멱등이라 재시도가 중복 송신을 만들지 않고, 첫 호출이 커밋된 뒤 응답만
 * 끊긴 경우는 같은 `p_claim_id` 로 그 호출이 기록한 사건을 되돌려받는다(40-REVIEW WR-01).
 */
export const PUSH_CLAIM_RETRY_MS = 1_000;
/**
 * 판정 · 보고 RPC 한 번의 시간 상한(ms · 40-REVIEW WR-03). 게이트웨이 큐는 단일 비행이라 상한 없는 RPC(undici 기본 300초)
 * 하나가 그 게이트웨이 푸시를 수 분 멈춘다. 넘기면 끊고 실패로 본다 — 판정은 1회 재시도(같은 `p_claim_id`)로 이어진다.
 */
export const PUSH_RPC_TIMEOUT_MS = 3_000;
/** 결과 보고 `reason` 상한 — 40-01 `dma_push_deliveries.reason` CHECK(200자)와 같다. */
const REPORT_REASON_MAX = 200;

/** 송신기에 넘기는 메시지 한 건. 계좌 칸 없음(SC-4). */
export type PushSendMessage = {
  title: string;
  body: string;
  /** 탭 착지 경로(D-21 · `pushTapPathOf`). */
  path: string;
  /** 묶음 키(D-18 · iOS thread-id · `pushThreadIdOf`). */
  threadId: string;
  /** 기기에서 중복을 합치는 키 = 판정 RPC 의 `log_id`(같은 사건 재시도가 한 알림으로). */
  collapseId: string;
};

/** 송신기 한 건 결과. */
export type PushSendResult = {
  result: "ok" | "failed" | "token_removed";
  httpStatus: number;
  reason?: string;
  /** 429 등 한도 신호 — 그 묶음의 그 플랫폼 남은 송신을 멈춘다(공식 API 운영 기준 4). */
  stopRun?: boolean;
};

/** 플랫폼 송신기(APNs · FCM — 40-09 가 구현). 토큰을 로그에 싣지 않는다. */
export interface PushSender {
  readonly platform: PushPlatform;
  send(token: string, msg: PushSendMessage): Promise<PushSendResult>;
  close?(): void;
}

/** 파이프라인에서 notifier 가 보는 부분(`ServerPipeline` 이 구조적으로 만족한다). */
export type PushPipelineView = {
  server: { key: string };
  access: { accountsOf(dmaUserId: string): ReadonlySet<string> | undefined; dmaUserIds(): string[] };
};

export type PushNotifierDeps = {
  /** 서비스롤 클라이언트 — 판정 · 보고 RPC 는 service_role 전용. */
  supabase: Pick<SupabaseClient, "rpc">;
  /** DMA id → 권한 사용자 전부(`AppAccess.userIdsOf` · D-06). */
  identities: { userIdsOf(dmaUserId: string): string[] };
  /** 켜진 송신기들. 0 개면 notifier 는 꺼진다(RPC 0). */
  senders: readonly PushSender[];
  /** config `pushNotify`(env `PUSH_NOTIFY`). */
  enabled: boolean;
  /** D-25 보유 조회(`SubscriptionHub.holdingOf`). 없으면 보유 조각을 얹지 않는다. */
  holdingOf?: (serverKey: string, accountNo: string, isin: string) => { qty: number; avgPrice: number } | null;
  /** 정착 시간(ms). 기본 `PUSH_SETTLE_MS`. */
  settleMs?: number;
  /** 짝 대기 재호출 지연(ms). 기본 `PUSH_DEFER_MS`. */
  deferMs?: number;
  /** 판정 · 보고 RPC 시간 상한(ms). 기본 `PUSH_RPC_TIMEOUT_MS`. */
  rpcTimeoutMs?: number;
};

const ORDER_N_STATUSES: ReadonlySet<JournalOrderStatus> = new Set(["accepted", "partially_filled", "filled", "rejected", "cancelled"]);
const ORDER_M_STATUSES: ReadonlySet<JournalOrderStatus> = new Set(["accepted", "partially_filled", "filled", "cancelled"]);

/**
 * 1차 거름 — 판정 RPC 에 넣을 주문 행인가(D-02). 신규(N)는 접수 · 체결 · 거부 · 취소, 정정확인(M)은 체인 체결 · 취소,
 * 취소확인(C)은 취소만. **정정/취소 요청 거부(M/C rejected)는 넣지 않는다** — 원주문은 그대로 살아 있다.
 */
export function isPushCandidate(row: Pick<JournalOrderRow, "orderType" | "status">): boolean {
  switch (row.orderType) {
    case "N":
      return ORDER_N_STATUSES.has(row.status);
    case "M":
      return ORDER_M_STATUSES.has(row.status);
    case "C":
      return row.status === "cancelled";
    default:
      return false;
  }
}

/** 1차 거름 — 자동매도 사건인가: kind 11(시작) · kind 13 완료(cond_actual 4 ∧ cond_threshold ≠ 4 — 재방송 제외). */
export function isAutoSellPushEvent(ev: Pick<StrategyEventRow, "kind" | "condActual" | "condThreshold">): boolean {
  return ev.kind === 11 || (ev.kind === 13 && ev.condActual === 4 && ev.condThreshold !== 4);
}

type ClaimDevice = { device_id: string; platform: PushPlatform; token: string };
type ClaimSend = { log_id: string; stage: PushStage; chain_key: string; facts: PushFacts; devices: ClaimDevice[] };
type ClaimResult = { sends: ClaimSend[]; deferred: string[] };
type ClaimArgs = {
  p_gateway: string;
  p_orders: string[];
  p_strategy: { journal_epoch: string; seq: number }[];
  p_recipients: Record<string, string[]>;
  p_platforms: PushPlatform[];
  p_allow_fallback: boolean;
  /**
   * 호출 멱등 키(40-REVIEW WR-01 · 마이그레이션 20261109300000). 한 묶음의 판정 시도(첫 호출 · 재시도)는 같은 값을 쓴다 —
   * 응답 유실 재시도가 이미 기록된 sent 사건을 다시 받는다. 옛 DB(이 인자 없는 함수)면 빼고 다시 부른다.
   */
  p_claim_id?: string;
};
type ReportRow = {
  log_id: string;
  device_id: string;
  platform: PushPlatform;
  token: string;
  result: PushSendResult["result"];
  http_status: number;
  reason: string;
};

/** 자동매도 사건 한 건 — 판정 RPC 인자(epoch · seq) + 수신자 · 보유 조회 키(계좌 · 종목). */
type StrategyItem = { accountNo: string; isin: string; journalEpoch: string; seq: number };

/** 게이트웨이 큐 한 개(D-09). */
type GatewayQueue = {
  gateway: string;
  /** 가장 최근 enqueue 한 파이프라인(같은 키 재생성 뒤에도 지금 매핑을 본다). */
  view: PushPipelineView;
  /** 주문 id → 계좌번호. */
  orders: Map<string, string>;
  /** `${journalEpoch}:${seq}` → 자동매도 사건. */
  strategy: Map<string, StrategyItem>;
  timer: NodeJS.Timeout | null;
  inFlight: boolean;
};

const strategyKeyOf = (journalEpoch: string, seq: number): string => `${journalEpoch}:${seq}`;
/** 자동매도 send 의 체인 키 접두(40-05 — `'AS:'||journal_epoch||':'||seq`). */
const AUTOSELL_CHAIN_PREFIX = "AS:";

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** PostgREST PGRST202 — 그 이름 · 인자 조합의 함수가 스키마 캐시에 없다(새 인자를 모르는 옛 함수). */
function isMissingFunction(error: unknown): boolean {
  return isObject(error) && error.code === "PGRST202";
}

/** 판정 RPC 반환 가드 — 모양이 어긋난 send · 기기는 건너뛴다(한 원소 때문에 묶음 전체를 버리지 않게). */
function parseClaim(data: unknown): ClaimResult | null {
  if (!isObject(data) || !Array.isArray(data.sends)) return null;
  const sends: ClaimSend[] = [];
  for (const s of data.sends) {
    if (!isObject(s) || typeof s.log_id !== "string" || !isObject(s.facts) || !Array.isArray(s.devices)) continue;
    const devices: ClaimDevice[] = [];
    for (const d of s.devices) {
      if (!isObject(d) || typeof d.device_id !== "string" || typeof d.token !== "string") continue;
      if (d.platform !== "ios" && d.platform !== "android") continue;
      devices.push({ device_id: d.device_id, platform: d.platform, token: d.token });
    }
    sends.push({
      log_id: s.log_id,
      stage: s.stage as PushStage,
      chain_key: typeof s.chain_key === "string" ? s.chain_key : "",
      facts: s.facts as unknown as PushFacts,
      devices,
    });
  }
  const deferred = Array.isArray(data.deferred) ? data.deferred.filter((x): x is string => typeof x === "string") : [];
  return { sends, deferred };
}

export class PushNotifier {
  readonly #supabase: Pick<SupabaseClient, "rpc">;
  readonly #identities: PushNotifierDeps["identities"];
  readonly #senders: readonly PushSender[];
  readonly #senderOf = new Map<PushPlatform, PushSender>();
  readonly #platforms: PushPlatform[];
  readonly #enabled: boolean;
  readonly #settleMs: number;
  readonly #deferMs: number;
  readonly #rpcTimeoutMs: number;
  readonly #holdingOf: PushNotifierDeps["holdingOf"];
  /** 짝 대기 재호출 타이머 → 그 재호출. `drain()` 은 당겨 실행하고 `close()` 는 해제한다. */
  readonly #deferTimers = new Map<NodeJS.Timeout, () => void>();
  /** 진행 중인 묶음(정착 flush · 짝 대기 재호출) — `drain()` 이 끝나기를 기다린다(40-REVIEW WR-02). */
  readonly #inflight = new Set<Promise<void>>();
  readonly #queues = new Map<string, GatewayQueue>();
  /** 재시도 대기 중인 지연들 — `close()` 가 풀어 준다. */
  readonly #waits = new Set<{ timer: NodeJS.Timeout; resolve: () => void }>();
  #closed = false;
  /** `drain()` 중 — 정착 · 짝 대기 시간을 기다리지 않고 바로 판정한다. */
  #draining = false;
  /** 옛 판정 RPC 시그니처 경고를 한 번만 남겼는가(WR-01 하위 호환). */
  #legacyClaimWarned = false;

  constructor(deps: PushNotifierDeps) {
    this.#supabase = deps.supabase;
    this.#identities = deps.identities;
    this.#senders = deps.senders;
    for (const s of deps.senders) if (!this.#senderOf.has(s.platform)) this.#senderOf.set(s.platform, s);
    this.#platforms = [...this.#senderOf.keys()];
    this.#enabled = deps.enabled && this.#platforms.length > 0;
    this.#settleMs = deps.settleMs ?? PUSH_SETTLE_MS;
    this.#deferMs = deps.deferMs ?? PUSH_DEFER_MS;
    this.#rpcTimeoutMs = deps.rpcTimeoutMs ?? PUSH_RPC_TIMEOUT_MS;
    this.#holdingOf = deps.holdingOf;
    if (this.#enabled) {
      logger.info({ platforms: this.#platforms.join(",") }, `[push] 켜짐 platforms=${this.#platforms.join(",")}`);
    } else {
      logger.info(
        { reason: deps.enabled ? "no-sender" : "off" },
        deps.enabled ? "[push] 꺼짐 — 송신기 없음" : "[push] 꺼짐 — PUSH_NOTIFY off",
      );
    }
  }

  /** 켜짐 = config on ∧ 송신기 1개 이상. 꺼져 있으면 enqueue 는 즉시 돌아가고 RPC 는 0 이다. */
  get enabled(): boolean {
    return this.#enabled;
  }

  /**
   * 주문 기록기 `applied` 리스너(동기 · 예외를 던지지 않는다 — SC-3). 후보 행만 게이트웨이 큐에 넣고 정착 타이머를 건다.
   */
  enqueueOrders(p: PushPipelineView, rows: readonly JournalOrderRow[]): void {
    try {
      if (!this.#enabled || this.#closed) return;
      const q = this.#queueOf(p);
      let added = false;
      for (const r of rows) {
        if (!isPushCandidate(r)) continue;
        q.orders.set(r.id, r.accountNo);
        added = true;
      }
      if (added) this.#schedule(q);
    } catch (err) {
      logger.error({ gateway: p?.server?.key, err: String(err) }, "[push] enqueue 예외 — 적용 · 팬아웃 무영향");
    }
  }

  /**
   * 전략 기록기 `applied` 리스너(동기 · 예외를 던지지 않는다 — SC-3). 자동매도 사건(kind 11 · kind 13 완료)만 거른다.
   */
  enqueueStrategy(p: PushPipelineView, rows: readonly StrategyEventRow[]): void {
    try {
      if (!this.#enabled || this.#closed) return;
      const q = this.#queueOf(p);
      let added = false;
      for (const r of rows) {
        // 계좌번호가 빈 행(시세 이벤트 · 형식 이상)은 받을 사람을 정할 수 없다.
        if (!isAutoSellPushEvent(r) || r.accountNo === "") continue;
        q.strategy.set(strategyKeyOf(r.journalEpoch, r.seq), {
          accountNo: r.accountNo,
          isin: r.isin,
          journalEpoch: r.journalEpoch,
          seq: r.seq,
        });
        added = true;
      }
      if (added) this.#schedule(q);
    } catch (err) {
      logger.error({ gateway: p?.server?.key, err: String(err) }, "[push] enqueue 예외 — 적용 · 팬아웃 무영향");
    }
  }

  /**
   * 종료 전 비우기(40-REVIEW WR-02) — 정착 대기 중인 큐와 짝 대기 재호출(폴백 허용)을 지금 바로 판정 · 송신하고, 진행 중인
   * 묶음까지 `timeoutMs` 안에서 기다린다. 저널 커서는 적용 트랜잭션에서 이미 전진했으므로 여기서 버린 행은 다음 부팅의
   * 재생으로도 돌아오지 않는다 — 그래서 `close()` 전에 부른다. 다 끝났으면 true · 시간 초과면 false(남은 것은 `close()` 가 끊는다).
   * drain 중에 새로 들어온 행도 정착 없이 바로 판정한다.
   */
  async drain(timeoutMs: number): Promise<boolean> {
    if (!this.#enabled || this.#closed) return true;
    this.#draining = true;
    for (const [timer, run] of this.#deferTimers) {
      clearTimeout(timer);
      run();
    }
    this.#deferTimers.clear();
    for (const q of this.#queues.values()) {
      if (q.timer !== null) clearTimeout(q.timer);
      q.timer = null;
      this.#track(this.#flush(q));
    }
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    });
    const done = await Promise.race([this.#idle().then(() => true as const), timedOut]);
    clearTimeout(timer);
    if (!done) logger.warn({ timeoutMs, inflight: this.#inflight.size }, "[push] drain 시간 초과 — 남은 송신은 close 가 끊는다");
    return done;
  }

  /** 타이머 해제 · 이후 송신 없음 · 송신기 정리. 진행 중 송신은 끊긴다 — 종료 경로는 먼저 `drain()` 으로 비운다(WR-02). */
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const q of this.#queues.values()) {
      if (q.timer !== null) clearTimeout(q.timer);
      q.timer = null;
      q.orders.clear();
      q.strategy.clear();
    }
    for (const t of this.#deferTimers.keys()) clearTimeout(t);
    this.#deferTimers.clear();
    for (const w of this.#waits) {
      clearTimeout(w.timer);
      w.resolve();
    }
    this.#waits.clear();
    for (const s of this.#senders) {
      try {
        s.close?.();
      } catch (err) {
        logger.warn({ platform: s.platform, err: String(err) }, "[push] 송신기 close 예외");
      }
    }
  }

  #queueOf(p: PushPipelineView): GatewayQueue {
    const key = p.server.key;
    let q = this.#queues.get(key);
    if (q === undefined) {
      q = { gateway: key, view: p, orders: new Map(), strategy: new Map(), timer: null, inFlight: false };
      this.#queues.set(key, q);
    }
    q.view = p;
    return q;
  }

  /**
   * 비행 중이 아니고 타이머가 없을 때만 정착 타이머를 건다 — 비행 중에 들어온 행은 끝난 뒤 다음 묶음으로(D-09).
   * `drain()` 중이면 정착을 기다리지 않고 바로 판정한다.
   */
  #schedule(q: GatewayQueue): void {
    if (this.#closed || q.inFlight || q.timer !== null) return;
    if (q.orders.size === 0 && q.strategy.size === 0) return;
    if (this.#draining) {
      this.#track(this.#flush(q));
      return;
    }
    q.timer = setTimeout(() => {
      q.timer = null;
      this.#track(this.#flush(q));
    }, this.#settleMs);
    q.timer.unref?.();
  }

  /** 진행 중 묶음으로 등록(끝나면 빠진다). 등록하는 약속은 reject 하지 않는다(#flush · 재호출 모두 자기 catch). */
  #track(p: Promise<void>): void {
    this.#inflight.add(p);
    const done = (): void => {
      this.#inflight.delete(p);
    };
    p.then(done, done);
  }

  /** 진행 중 묶음이 0 이 될 때까지(기다리는 동안 새로 생긴 묶음 포함). */
  async #idle(): Promise<void> {
    while (this.#inflight.size > 0) await Promise.allSettled([...this.#inflight]);
  }

  async #flush(q: GatewayQueue): Promise<void> {
    if (this.#closed || q.inFlight) return;
    const orders = new Map(q.orders);
    const strategy = new Map(q.strategy);
    q.orders.clear();
    q.strategy.clear();
    if (orders.size === 0 && strategy.size === 0) return;
    q.inFlight = true;
    try {
      await this.#claimAndSend(q, orders, strategy, false);
    } catch (err) {
      logger.error({ gateway: q.gateway, err: String(err) }, "[push] 묶음 예외 — 적용 · 팬아웃 무영향");
    } finally {
      q.inFlight = false;
      this.#schedule(q);
    }
  }

  /** 계좌 → 받는 사용자(D-06): 그 서버 매핑에서 그 계좌를 가진 DMA id 마다 권한 사용자 전부의 합집합. 빈 계좌는 뺀다. */
  #recipientsOf(view: PushPipelineView, accounts: Iterable<string>): Map<string, string[]> {
    const out = new Map<string, string[]>();
    const dmaIds = view.access.dmaUserIds();
    for (const account of new Set(accounts)) {
      const users = new Set<string>();
      for (const dma of dmaIds) {
        if (!view.access.accountsOf(dma)?.has(account)) continue;
        for (const u of this.#identities.userIdsOf(dma)) users.add(u);
      }
      if (users.size > 0) out.set(account, [...users]);
    }
    return out;
  }

  async #claimAndSend(
    q: GatewayQueue,
    orders: ReadonlyMap<string, string>,
    strategy: ReadonlyMap<string, StrategyItem>,
    allowFallback: boolean,
  ): Promise<void> {
    const recipients = this.#recipientsOf(q.view, [...orders.values(), ...[...strategy.values()].map((s) => s.accountNo)]);
    const orderIds = [...orders].filter(([, account]) => recipients.has(account)).map(([id]) => id);
    const strategyItems = [...strategy.values()].filter((s) => recipients.has(s.accountNo));
    if (orderIds.length === 0 && strategyItems.length === 0) return;
    const args: ClaimArgs = {
      p_gateway: q.gateway,
      p_orders: orderIds,
      p_strategy: strategyItems.map((s) => ({ journal_epoch: s.journalEpoch, seq: s.seq })),
      p_recipients: Object.fromEntries(recipients),
      p_platforms: [...this.#platforms],
      p_allow_fallback: allowFallback,
      p_claim_id: randomUUID(),
    };
    const claim = await this.#claim(q.gateway, args);
    if (claim === null || this.#closed) return;
    // D-03 — 짝 이벤트를 아직 못 본 주문은 잠시 뒤 폴백 허용으로 한 번만 다시 묻는다(폴백 호출의 deferred 는 끝).
    if (!allowFallback && claim.deferred.length > 0) this.#scheduleDeferred(q, orders, claim.deferred);
    const results = await this.#deliver(q.gateway, claim.sends, strategy);
    if (results.length > 0) await this.#report(q.gateway, results);
    if (claim.sends.length > 0 || claim.deferred.length > 0) {
      logger.info(
        {
          gateway: q.gateway,
          sends: claim.sends.length,
          devices: results.length,
          ok: results.filter((r) => r.result === "ok").length,
          failed: results.filter((r) => r.result === "failed").length,
          removed: results.filter((r) => r.result === "token_removed").length,
          deferred: claim.deferred.length,
          fallback: allowFallback,
        },
        "[push] 송신",
      );
    }
  }

  /**
   * `deferMs` 뒤 deferred id 만 `p_allow_fallback: true` 로 한 번 더(D-03). 그 시점 매핑으로 수신자를 다시 계산한다. 정착 큐와
   * 따로 돈다 — 판정은 DB 체인 표의 단조 upsert 라 같은 주문이 정착 묶음과 겹쳐도 한 단계는 한 번만 나간다.
   */
  #scheduleDeferred(q: GatewayQueue, orders: ReadonlyMap<string, string>, deferred: readonly string[]): void {
    const retry = new Map<string, string>();
    for (const id of deferred) {
      const account = orders.get(id);
      if (account !== undefined) retry.set(id, account);
    }
    if (retry.size === 0 || this.#closed) return;
    const run = (): void => {
      if (this.#closed) return;
      this.#track(
        this.#claimAndSend(q, retry, new Map(), true).catch((err: unknown) =>
          logger.error({ gateway: q.gateway, err: String(err) }, "[push] 짝 대기 재호출 예외 — 적용 · 팬아웃 무영향"),
        ),
      );
    };
    // drain 중이면 짝을 더 기다리지 않는다 — 종료 전에 폴백으로 보낸다(WR-02).
    if (this.#draining) {
      run();
      return;
    }
    const timer = setTimeout(() => {
      this.#deferTimers.delete(timer);
      run();
    }, this.#deferMs);
    timer.unref?.();
    this.#deferTimers.set(timer, run);
  }

  /**
   * 판정 RPC — 오류(error · throw · 형식 위반)면 `PUSH_CLAIM_RETRY_MS` 뒤 **같은 인자**(같은 `p_claim_id`)로 1회만 다시.
   * 그래도 실패면 null.
   */
  async #claim(gateway: string, args: ClaimArgs): Promise<ClaimResult | null> {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      let failure: unknown;
      try {
        const { data, error } = await this.#callClaim(gateway, args);
        if (error) {
          failure = error;
        } else {
          const parsed = parseClaim(data);
          if (parsed !== null) return parsed;
          failure = new Error("dma_push_claim 반환 형식 위반");
        }
      } catch (err) {
        failure = err;
      }
      if (this.#closed) return null;
      if (attempt === 1) {
        logger.warn({ gateway, err: safePgError(failure) }, "[push] dma_push_claim 실패 — 1회 재시도");
        await this.#wait(PUSH_CLAIM_RETRY_MS);
        if (this.#closed) return null;
        continue;
      }
      logger.error({ gateway, err: safePgError(failure) }, "[push] dma_push_claim 실패 — 이 묶음 건너뜀");
    }
    return null;
  }

  /**
   * 판정 RPC 한 번. 새 인자(`p_claim_id`)를 모르는 옛 함수(마이그레이션 20261109300000 적용 전)면 PostgREST 가
   * PGRST202(함수 없음)를 준다 — 그때만 새 인자를 빼고 바로 한 번 더 부른다(배포 순서 무관 · 재시도 횟수에 안 셈).
   */
  async #callClaim(gateway: string, args: ClaimArgs): Promise<{ data: unknown; error: unknown }> {
    const res = await this.#rpc("dma_push_claim", args);
    if (args.p_claim_id === undefined || !isMissingFunction(res.error)) return res;
    if (!this.#legacyClaimWarned) {
      this.#legacyClaimWarned = true;
      logger.warn({ gateway }, "[push] dma_push_claim 옛 시그니처 — p_claim_id 없이 호출(DB 마이그레이션 적용 전)");
    }
    const { p_claim_id: _claimId, ...legacy } = args;
    return this.#rpc("dma_push_claim", legacy);
  }

  /** RPC 한 번 — `rpcTimeoutMs` 가 지나면 요청을 끊는다(WR-03). 끊긴 요청은 supabase-js 가 error 로 주거나 throw 한다. */
  async #rpc(fn: string, args: object): Promise<{ data: unknown; error: unknown }> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.#rpcTimeoutMs);
    try {
      return await this.#supabase.rpc(fn, args).abortSignal(ac.signal);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * send 마다 문안을 한 번 만들고 기기마다 그 플랫폼 송신기로 보낸다. **플랫폼끼리는 병렬 · 플랫폼 안은 순차**(40-REVIEW
   * WR-03) — 한 플랫폼의 느린 응답 · 재시도가 다른 플랫폼 송신을 붙잡지 않는다. `stopRun` 뒤 그 플랫폼 남은 기기는 건너뛴다.
   * 결과는 플랫폼이 처음 나온 순서로 이어 붙인다.
   */
  async #deliver(gateway: string, sends: readonly ClaimSend[], strategy: ReadonlyMap<string, StrategyItem>): Promise<ReportRow[]> {
    const lanes = new Map<PushPlatform, { sender: PushSender; jobs: { s: ClaimSend; msg: PushSendMessage; d: ClaimDevice }[] }>();
    for (const s of sends) {
      let msg: PushSendMessage;
      try {
        const facts = this.#withHolding(gateway, s, strategy);
        const { title, body } = pushMessageOf(facts);
        msg = { title, body, path: pushTapPathOf(facts), threadId: pushThreadIdOf(facts), collapseId: s.log_id };
      } catch (err) {
        logger.error({ gateway, stage: String(s.stage), err: String(err) }, "[push] 문안 실패 — 이 건 건너뜀");
        continue;
      }
      for (const d of s.devices) {
        const sender = this.#senderOf.get(d.platform);
        if (sender === undefined) continue;
        let lane = lanes.get(d.platform);
        if (lane === undefined) {
          lane = { sender, jobs: [] };
          lanes.set(d.platform, lane);
        }
        lane.jobs.push({ s, msg, d });
      }
    }
    const perLane = await Promise.all([...lanes.values()].map((lane) => this.#deliverLane(gateway, lane.sender, lane.jobs)));
    return perLane.flat();
  }

  /** 한 플랫폼 송신 줄 — 순차 · `stopRun` 이면 남은 기기 건너뜀 · 송신기 예외는 failed 로 기록. */
  async #deliverLane(
    gateway: string,
    sender: PushSender,
    jobs: readonly { s: ClaimSend; msg: PushSendMessage; d: ClaimDevice }[],
  ): Promise<ReportRow[]> {
    const results: ReportRow[] = [];
    for (const { s, msg, d } of jobs) {
      if (this.#closed) break;
      let r: PushSendResult;
      try {
        r = await sender.send(d.token, msg);
      } catch (err) {
        // 송신기 예외 문자열에 토큰이 섞여도 로그로 새지 않게 지운다(T-19-14).
        const safeErr = String(err).split(d.token).join("[token]");
        logger.error({ gateway, platform: d.platform, stage: String(s.stage), err: safeErr }, "[push] 송신기 예외 — failed 로 기록");
        r = { result: "failed", httpStatus: 0, reason: "exception" };
      }
      results.push({
        log_id: s.log_id,
        device_id: d.device_id,
        platform: d.platform,
        token: d.token,
        result: r.result,
        http_status: Number.isFinite(r.httpStatus) ? r.httpStatus : 0,
        reason: (r.reason ?? "").slice(0, REPORT_REASON_MAX),
      });
      if (r.stopRun === true) {
        logger.warn({ gateway, platform: d.platform, httpStatus: r.httpStatus }, "[push] 송신 중단 신호 — 이 묶음의 이 플랫폼 남은 송신 건너뜀");
        break;
      }
    }
    return results;
  }

  /**
   * D-25 — 자동매도 시작 send 에 relay 계좌 캐시의 보유 수량 · 평단을 얹는다. 체인 키 `AS:epoch:seq` 를 이 묶음의 전략 항목
   * (계좌 · 종목)으로 되짚는다. 값이 없거나 qty 0 이면 그대로(문안이 보유 조각을 뺀다). 원본 사실은 바꾸지 않는다(사본).
   */
  #withHolding(gateway: string, s: ClaimSend, strategy: ReadonlyMap<string, StrategyItem>): PushFacts {
    const facts = s.facts;
    if (facts.stage !== "autosell_start" || facts.autosell == null || this.#holdingOf === undefined) return facts;
    if (!s.chain_key.startsWith(AUTOSELL_CHAIN_PREFIX)) return facts;
    const item = strategy.get(s.chain_key.slice(AUTOSELL_CHAIN_PREFIX.length));
    if (item === undefined) return facts;
    let holding: { qty: number; avgPrice: number } | null = null;
    try {
      holding = this.#holdingOf(gateway, item.accountNo, item.isin);
    } catch (err) {
      logger.warn({ gateway, err: String(err) }, "[push] 보유 조회 예외 — 보유 조각 없이 보낸다");
    }
    if (holding === null || !(holding.qty > 0)) return facts;
    return {
      ...facts,
      autosell: {
        ...facts.autosell,
        holdingQty: holding.qty,
        ...(holding.avgPrice > 0 ? { holdingAvgPrice: holding.avgPrice } : {}),
      },
    };
  }

  /** 결과 보고 1회 — 오류는 로그만(전달 기록이 빠질 뿐 송신 · 적용에는 영향 없다). */
  async #report(gateway: string, results: ReportRow[]): Promise<void> {
    try {
      const { error } = await this.#rpc("dma_push_report", { p_results: results });
      if (error) logger.error({ gateway, err: safePgError(error), results: results.length }, "[push] dma_push_report 실패");
    } catch (err) {
      logger.error({ gateway, err: safePgError(err), results: results.length }, "[push] dma_push_report 실패");
    }
  }

  /** `close()` 가 풀어 주는 지연(unref). */
  #wait(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const entry = {
        timer: setTimeout(() => {
          this.#waits.delete(entry);
          resolve();
        }, ms),
        resolve,
      };
      entry.timer.unref?.();
      this.#waits.add(entry);
    });
  }
}
