/**
 * Phase 40 Plan 06 — relay `PushNotifier`(적용 행 → 판정 RPC → 문안 → 송신기 → 결과 보고).
 *
 * 잠그는 것:
 *   - 한 길: `enqueueOrders` → 정착 400ms → 수신자(`userIdsOf` · D-06) → `dma_push_claim`(6 인자 + p_claim_id) → `pushMessageOf` 문안 ·
 *     탭 경로 · 묶음 키 · collapseId = log_id → 가짜 송신기 → `dma_push_report` 1회
 *   - 꺼짐(config off · 송신기 0) → RPC 0
 *   - 자동매도(kind 11 · 13 완료) → p_strategy · 보유 조각(D-25) · 짝 대기 1.5초 재호출(D-03) · 단일 비행(D-09)
 *   - 예외 격리(SC-3 — 실제 `JournalWriter` 로 다음 배치 · fanout 무영향) · 재기동 재생(SC-2) · claim 재시도 1회 · 429 중단
 *   - 로그에 계좌 · 토큰 · 사용자 id · DMA id 없음(T-19-14)
 *
 * 가짜 supabase 는 `rpc(fn, args)` 를 기록하고 `dma_push_claim` 응답을 스크립트로 돌려준다(성공 · 오류 · throw · 보류).
 * 가짜 송신기는 호출을 기록한다. 시간은 `vi.useFakeTimers()` 로 당긴다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pushMessageOf } from "@gh-radar/shared";
import type { JournalOrderDbRow, JournalOrderRow, PushFacts, PushPlatform, StrategyEventRow } from "@gh-radar/shared";

import { logger } from "../src/logger.js";
import { JournalWriter, type JournalApplyEvent } from "../src/journal/writer.js";
import type { JournalRecord } from "../src/journal/types.js";
import {
  PUSH_DEFER_MS,
  PUSH_RPC_TIMEOUT_MS,
  PUSH_SETTLE_MS,
  PushNotifier,
  isAutoSellPushEvent,
  isPushCandidate,
  type PushNotifierDeps,
  type PushPipelineView,
  type PushSendMessage,
  type PushSendResult,
  type PushSender,
} from "../src/push/notifier.js";

const GATEWAY = "KB120";
const ACCOUNT = "9900006001";
const ACCOUNT_B = "9900006002";
const ORDER_ID = "00000000-0000-4000-8000-00000000a001";
const ORDER_ID_B = "00000000-0000-4000-8000-00000000a002";
const LOG_ID = "00000000-0000-4000-8000-0000000c0001";
const DEVICE_IOS = "00000000-0000-4000-8000-0000000d0001";
const DEVICE_IOS_2 = "00000000-0000-4000-8000-0000000d0002";
const DEVICE_AND = "00000000-0000-4000-8000-0000000d0003";
const TOKEN_IOS = "ios-token-aaaaaaaaaaaaaaaaaaaaaaaa";
const TOKEN_IOS_2 = "ios-token-bbbbbbbbbbbbbbbbbbbbbbbb";
const TOKEN_AND = "android-token-cccccccccccccccccccccc";
const U1 = "6b1c2b7a-9d40-4a11-8e55-0000000000a1";
const U2 = "6b1c2b7a-9d40-4a11-8e55-0000000000a2";

/** KST 벽시계 → epoch ms. */
const kst = (hms: string, day = "2026-11-06") => Date.parse(`${day}T${hms}+09:00`);

/** 금양그린파워 3,120 × 500주 선매수 접수 행(KB120 · 계좌 9900006001). */
function orderRow(over: Partial<JournalOrderRow> = {}): JournalOrderRow {
  return {
    id: ORDER_ID,
    tradeDate: "2026-11-06",
    accountNo: ACCOUNT,
    isin: "KR7282720005",
    stockCode: "282720",
    exchange: "KRX",
    board: null,
    side: "B",
    orderType: "N",
    orgOrderNo: null,
    qty: 500,
    price: 3120,
    orderNo: "0000100001",
    filledQty: 0,
    modifiedQty: 0,
    status: "accepted",
    resultCode: 0,
    noticeType: "A",
    message: null,
    origin: "limit_chaser",
    requester: null,
    requestKind: null,
    lastSeq: 1,
    createdAt: "2026-11-06T00:00:31.000Z",
    updatedAt: "2026-11-06T00:00:31.000Z",
    ...over,
  };
}

/** 판정 RPC 가 돌려줄 사실(스케치 029 금양그린파워 접수). 계좌 칸 없음. */
function facts(over: Partial<PushFacts> = {}): PushFacts {
  return {
    stage: "accepted",
    isin: "KR7282720005",
    stockName: "금양그린파워",
    stockCode: "282720",
    exchange: "KRX",
    tradeDate: "2026-11-06",
    gwTimeMs: kst("09:00:31"),
    side: "B",
    group: 1,
    origin: "limit_chaser",
    qty: 500,
    price: 3120,
    filledQty: 0,
    lastFillPrice: null,
    avgFillPrice: null,
    cancelledQty: null,
    cancelReason: null,
    message: null,
    autosell: null,
    ...over,
  };
}

type Device = { device_id: string; platform: PushPlatform; token: string };
type Send = { log_id: string; stage: string; chain_key: string; facts: PushFacts; devices: Device[] };
type ClaimData = { sends: Send[]; deferred: string[]; deferred_strategy?: { journal_epoch: string; seq: number }[] };
type ClaimStep = { data: ClaimData } | "error" | "throw" | "missing" | "hangUntilAbort" | { hold: Promise<ClaimData> };
type RpcCall = { fn: string; args: Record<string, unknown> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const PG_ERROR = { code: "57014", message: "canceling statement due to statement timeout", details: `row ${ACCOUNT}` };

/**
 * 가짜 supabase — 실제 supabase-js 처럼 `rpc(...)` 가 빌더를 주고 `.abortSignal(signal)` 뒤에 await 한다(WR-03).
 * 받은 신호는 `signals` 에 남는다. `hangUntilAbort` 는 신호가 끊길 때까지 응답하지 않는다(끊기면 supabase-js 처럼 error).
 */
function fakeDb(opts: { reportThrows?: boolean } = {}) {
  const calls: RpcCall[] = [];
  const signals: AbortSignal[] = [];
  const claimScript: ClaimStep[] = [];
  const run = async (fn: string, args: Record<string, unknown>, signal: AbortSignal) => {
    calls.push({ fn, args: structuredClone(args) });
    if (fn === "dma_push_claim") {
      const step = claimScript.shift() ?? { data: { sends: [], deferred: [] } };
      if (step === "hangUntilAbort") {
        return new Promise<{ data: null; error: { code: string; message: string } }>((resolve) =>
          signal.addEventListener("abort", () => resolve({ data: null, error: { code: "", message: "AbortError" } })),
        );
      }
      if (step === "error") return { data: null, error: PG_ERROR };
      // 옛 DB(p_claim_id 를 모르는 함수) — PostgREST 가 이름 · 인자 조합을 못 찾는다.
      if (step === "missing") return { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
      if (step === "throw") throw new Error("fetch failed");
      if ("hold" in step) return { data: await step.hold, error: null };
      return { data: step.data, error: null };
    }
    if (fn === "dma_push_report") {
      if (opts.reportThrows) throw new Error("report fetch failed");
      return { data: { recorded: (args.p_results as unknown[]).length, removed: 0 }, error: null };
    }
    throw new Error(`unexpected rpc ${fn}`);
  };
  const supabase = {
    rpc: (fn: string, args: Record<string, unknown>) => ({
      abortSignal: (signal: AbortSignal) => {
        signals.push(signal);
        return run(fn, args, signal);
      },
    }),
  } as unknown as Pick<SupabaseClient, "rpc">;
  return {
    supabase,
    calls,
    signals,
    claimScript,
    claims: () => calls.filter((c) => c.fn === "dma_push_claim"),
    reports: () => calls.filter((c) => c.fn === "dma_push_report"),
  };
}

type SentCall = { token: string; msg: PushSendMessage };

function fakeSender(platform: PushPlatform, resultOf: (token: string) => PushSendResult | Promise<PushSendResult> = () => ({ result: "ok", httpStatus: 200 })) {
  const sent: SentCall[] = [];
  let closed = 0;
  const sender: PushSender = {
    platform,
    send: async (token, msg) => {
      sent.push({ token, msg });
      return resultOf(token);
    },
    close: () => {
      closed += 1;
    },
  };
  return {
    sender,
    sent,
    get closed() {
      return closed;
    },
  };
}

/** 가짜 서버 매핑 — DMA id → 계좌 집합. */
function pipeline(map: Record<string, string[]>, key = GATEWAY): PushPipelineView {
  const m = new Map(Object.entries(map).map(([k, v]) => [k, new Set(v)]));
  return {
    server: { key },
    access: {
      accountsOf: (dma) => m.get(dma),
      dmaUserIds: () => [...m.keys()],
    },
  };
}

function identities(map: Record<string, string[]>): PushNotifierDeps["identities"] {
  return { userIdsOf: (dma) => [...(map[dma] ?? [])] };
}

async function flush(turns = 30): Promise<void> {
  for (let i = 0; i < turns; i += 1) await Promise.resolve();
}

/** 정착 타이머를 지나 묶음 하나가 끝날 때까지. */
async function settle(ms = PUSH_SETTLE_MS): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await flush();
}

type LogCall = { level: string; args: unknown[] };

function captureLogs(): LogCall[] {
  const out: LogCall[] = [];
  for (const level of ["info", "warn", "error"] as const) {
    vi.spyOn(logger, level).mockImplementation(((...args: unknown[]) => {
      out.push({ level, args });
    }) as never);
  }
  return out;
}

const pushLogs = (logs: LogCall[]) => logs.filter((l) => l.args.some((a) => typeof a === "string" && a.startsWith("[push]")));

describe("PushNotifier — 한 길(Task 1 tracer)", () => {
  const notifiers: PushNotifier[] = [];
  const make = (deps: PushNotifierDeps): PushNotifier => {
    const n = new PushNotifier(deps);
    notifiers.push(n);
    return n;
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    for (const n of notifiers.splice(0)) n.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("상수 — 정착 400ms · 짝 대기 1.5초", () => {
    expect(PUSH_SETTLE_MS).toBe(400);
    expect(PUSH_DEFER_MS).toBe(1_500);
  });

  it("적용 행 → 정착 400ms → dma_push_claim(공유 DMA id 의 두 사용자) → 문안 · 탭 경로 · 묶음 키 · collapseId → 송신기 → dma_push_report 1회", async () => {
    captureLogs();
    const db = fakeDb();
    const ios = fakeSender("ios");
    db.claimScript.push({
      data: {
        sends: [
          {
            log_id: LOG_ID,
            stage: "accepted",
            chain_key: "0000100001",
            facts: facts(),
            devices: [{ device_id: DEVICE_IOS, platform: "ios", token: TOKEN_IOS }],
          },
        ],
        deferred: [],
      },
    });
    const n = make({ supabase: db.supabase, identities: identities({ "dma-a": [U1, U2] }), senders: [ios.sender], enabled: true });
    expect(n.enabled).toBe(true);
    const p = pipeline({ "dma-a": [ACCOUNT] });

    n.enqueueOrders(p, [orderRow()]);
    await vi.advanceTimersByTimeAsync(PUSH_SETTLE_MS - 1);
    expect(db.claims()).toHaveLength(0); // 정착 전
    await settle(1);

    expect(db.claims()).toHaveLength(1);
    expect(db.claims()[0]!.args).toEqual({
      p_gateway: GATEWAY,
      p_orders: [ORDER_ID],
      p_strategy: [],
      p_recipients: { [ACCOUNT]: [U1, U2] },
      p_platforms: ["ios"],
      p_allow_fallback: false,
      p_claim_id: expect.stringMatching(UUID_RE),
      p_defer_strategy: true,
    });

    const expected = pushMessageOf(facts());
    expect(ios.sent).toEqual([
      {
        token: TOKEN_IOS,
        msg: {
          title: expected.title,
          body: expected.body,
          path: "/trading/order-log?stock=KR7282720005&date=2026-11-06",
          threadId: "KR7282720005",
          collapseId: LOG_ID,
        },
      },
    ]);
    expect(expected.title).toBe("금양그린파워 · 선매수 접수");

    expect(db.reports()).toHaveLength(1);
    expect(db.reports()[0]!.args).toEqual({
      p_results: [
        { log_id: LOG_ID, device_id: DEVICE_IOS, platform: "ios", token: TOKEN_IOS, result: "ok", http_status: 200, reason: "" },
      ],
    });
  });

  it("꺼짐 — config off 또는 송신기 0 이면 enabled false · RPC 0 · 부팅 로그 1줄", async () => {
    const logs = captureLogs();
    const db = fakeDb();
    const off = make({ supabase: db.supabase, identities: identities({ "dma-a": [U1] }), senders: [fakeSender("ios").sender], enabled: false });
    const noSender = make({ supabase: db.supabase, identities: identities({ "dma-a": [U1] }), senders: [], enabled: true });
    expect(off.enabled).toBe(false);
    expect(noSender.enabled).toBe(false);
    const p = pipeline({ "dma-a": [ACCOUNT] });
    off.enqueueOrders(p, [orderRow()]);
    noSender.enqueueOrders(p, [orderRow()]);
    await settle(10_000);
    expect(db.calls).toHaveLength(0);
    const boot = pushLogs(logs).map((l) => l.args[1]);
    expect(boot).toEqual(["[push] 꺼짐 — PUSH_NOTIFY off", "[push] 꺼짐 — 송신기 없음"]);
  });

  it("수신자 — 매핑 밖 계좌는 빠지고, 받는 사람이 전부 없으면 RPC 없이 끝난다", async () => {
    captureLogs();
    const db = fakeDb();
    const n = make({ supabase: db.supabase, identities: identities({ "dma-a": [U1] }), senders: [fakeSender("ios").sender], enabled: true });
    const p = pipeline({ "dma-a": [ACCOUNT], "dma-viewer-only": [ACCOUNT_B] }); // dma-viewer-only 는 권한 사용자 0
    n.enqueueOrders(p, [orderRow({ id: ORDER_ID_B, accountNo: ACCOUNT_B })]);
    await settle();
    expect(db.calls).toHaveLength(0);

    n.enqueueOrders(p, [orderRow(), orderRow({ id: ORDER_ID_B, accountNo: ACCOUNT_B })]);
    await settle();
    expect(db.claims()).toHaveLength(1);
    expect(db.claims()[0]!.args.p_orders).toEqual([ORDER_ID]);
    expect(db.claims()[0]!.args.p_recipients).toEqual({ [ACCOUNT]: [U1] });
  });
});

describe("1차 거름 (D-02)", () => {
  it("isPushCandidate — N 5상태 · M 체결/취소 · C 취소만 · M/C 거부(요청 거부)와 modified 는 아님", () => {
    const c = (orderType: JournalOrderRow["orderType"], status: JournalOrderRow["status"]) => isPushCandidate({ orderType, status });
    for (const s of ["accepted", "partially_filled", "filled", "rejected", "cancelled"] as const) expect(c("N", s)).toBe(true);
    expect(c("N", "modified")).toBe(false);
    for (const s of ["accepted", "partially_filled", "filled", "cancelled"] as const) expect(c("M", s)).toBe(true);
    expect(c("M", "rejected")).toBe(false);
    expect(c("C", "cancelled")).toBe(true);
    expect(c("C", "rejected")).toBe(false);
    expect(c("C", "accepted")).toBe(false);
  });

  it("isAutoSellPushEvent — kind 11 · kind 13 완료(cond_actual 4 ∧ threshold ≠ 4)만", () => {
    const e = (kind: number, condActual = 0, condThreshold = 0) => isAutoSellPushEvent({ kind, condActual, condThreshold });
    expect(e(11)).toBe(true);
    expect(e(13, 4, 0)).toBe(true);
    expect(e(13, 4, 4)).toBe(false); // 재방송
    expect(e(13, 3, 0)).toBe(false);
    expect(e(12)).toBe(false);
    expect(e(3)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Task 3 — 자동매도 사건 · 보유 조각(D-25) · 짝 대기 재호출(D-03) · 단일 비행(D-09) · 예외 격리(SC-3) · 재생(SC-2) · 429 중단
// ---------------------------------------------------------------------------------------------------------------------

const EPOCH = "ep-20261106";

/** 전략 이벤트 행 — 기본은 금양그린파워 자동매도 시작(kind 11 · 상한가 기준). */
function strategyRow(over: Partial<StrategyEventRow> = {}): StrategyEventRow {
  return {
    gateway: GATEWAY,
    journalEpoch: EPOCH,
    seq: 77,
    tradeDate: "2026-11-06",
    gwTimeMs: kst("09:40:00"),
    kind: 11,
    group: 9,
    exchange: "KRX",
    isin: "KR7282720005",
    stockCode: "282720",
    cumVolume: 0,
    accountNo: ACCOUNT,
    orderNo: "",
    price: 3050,
    qty: 0,
    orderCondition: "",
    reasonCode: "",
    condThreshold: 0,
    condActual: 0,
    condMetric: 0,
    evKind: 0,
    evPrice: 0,
    evQtyBefore: 0,
    evQtyAfter: 0,
    evTradeQty: 0,
    limitBidQty: 0,
    bid1Price: 3120,
    bid1Qty: 0,
    acceptLatencyUs: 0,
    immediateFillQty: 0,
    queueCase: 1,
    baseCum: 0,
    aheadQty: 0,
    expectedCum: 0,
    errorVolume: 0,
    remainingVolume: 0,
    hasRemaining: false,
    cancelReason: 0,
    resultCode: 0,
    message: "",
    entryRound: 0,
    snapQty: [],
    snapCum: [],
    askQtyAtLimit: 0,
    openAtLimit: false,
    ...over,
  };
}

/** 자동매도 시작 사실(판정 RPC 반환 — 보유 칸 없음 · relay 가 얹는다). */
function autoStartFacts(): PushFacts {
  return facts({
    stage: "autosell_start",
    group: 9,
    side: "S",
    qty: null,
    price: null,
    gwTimeMs: kst("09:40:00"),
    autosell: { basis: 1, basePrice: 3120, triggerPrice: 3050, soldQty: 0, avgSellPrice: null, pnlPct: null },
  });
}

function send(over: Partial<Send> = {}): Send {
  return {
    log_id: LOG_ID,
    stage: "accepted",
    chain_key: "0000100001",
    facts: facts(),
    devices: [{ device_id: DEVICE_IOS, platform: "ios", token: TOKEN_IOS }],
    ...over,
  };
}

describe("PushNotifier — 자동매도 · 대기 · 단일 비행 · 격리 · 재생 · 중단(Task 3)", () => {
  const notifiers: PushNotifier[] = [];
  const make = (deps: PushNotifierDeps): PushNotifier => {
    const n = new PushNotifier(deps);
    notifiers.push(n);
    return n;
  };
  const p = pipeline({ "dma-a": [ACCOUNT, ACCOUNT_B] });
  const ids = identities({ "dma-a": [U1] });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    for (const n of notifiers.splice(0)) n.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("enqueueStrategy — kind 11 → p_strategy [{journal_epoch, seq}] · 그 행 계좌로 수신자 · holdingOf 값이 있으면 보유 조각(D-25)", async () => {
    captureLogs();
    const db = fakeDb();
    const ios = fakeSender("ios");
    db.claimScript.push({ data: { sends: [send({ stage: "autosell_start", chain_key: `AS:${EPOCH}:77`, facts: autoStartFacts() })], deferred: [] } });
    const holdingCalls: string[][] = [];
    const n = make({
      supabase: db.supabase,
      identities: ids,
      senders: [ios.sender],
      enabled: true,
      holdingOf: (k, a, i) => {
        holdingCalls.push([k, a, i]);
        return { qty: 500, avgPrice: 3120 };
      },
    });

    n.enqueueStrategy(p, [strategyRow()]);
    await settle();

    expect(db.claims()).toHaveLength(1);
    expect(db.claims()[0]!.args).toEqual({
      p_gateway: GATEWAY,
      p_orders: [],
      p_strategy: [{ journal_epoch: EPOCH, seq: 77 }],
      p_recipients: { [ACCOUNT]: [U1] },
      p_platforms: ["ios"],
      p_allow_fallback: false,
      p_claim_id: expect.stringMatching(UUID_RE),
      p_defer_strategy: true,
    });
    expect(holdingCalls).toEqual([[GATEWAY, ACCOUNT, "KR7282720005"]]);
    expect(ios.sent).toHaveLength(1);
    expect(ios.sent[0]!.msg.title).toBe("금양그린파워 · 자동매도 시작");
    expect(ios.sent[0]!.msg.body).toBe("보유 500주 (156만) · 기준 상한가 · 09:40:00");
  });

  it("enqueueStrategy — holdingOf 가 null 이면 보유 조각 없이 기준 · 발동가(문안은 shared)", async () => {
    captureLogs();
    const db = fakeDb();
    const ios = fakeSender("ios");
    db.claimScript.push({ data: { sends: [send({ stage: "autosell_start", chain_key: `AS:${EPOCH}:77`, facts: autoStartFacts() })], deferred: [] } });
    const n = make({ supabase: db.supabase, identities: ids, senders: [ios.sender], enabled: true, holdingOf: () => null });
    n.enqueueStrategy(p, [strategyRow()]);
    await settle();
    expect(ios.sent).toHaveLength(1);
    expect(ios.sent[0]!.msg.body).toBe(pushMessageOf(autoStartFacts()).body);
    expect(ios.sent[0]!.msg.body).toBe("기준 상한가 3,120 · 발동가 3,050 · 09:40:00");
  });

  it("enqueueStrategy — kind 3 · 12 · 13(cond_actual 3) · 재방송(threshold 4)은 큐에 안 들어간다(RPC 0)", async () => {
    captureLogs();
    const db = fakeDb();
    const n = make({ supabase: db.supabase, identities: ids, senders: [fakeSender("ios").sender], enabled: true });
    n.enqueueStrategy(p, [
      strategyRow({ kind: 3, seq: 1 }),
      strategyRow({ kind: 12, seq: 2 }),
      strategyRow({ kind: 13, seq: 3, condActual: 3 }),
      strategyRow({ kind: 13, seq: 4, condActual: 4, condThreshold: 4 }),
    ]);
    await settle();
    expect(db.calls).toHaveLength(0);
  });

  it("deferred(D-03) — 첫 응답 deferred [id] → 1500ms 뒤 그 id 만 p_allow_fallback true 로 1회 · 두 번째 deferred 는 다시 부르지 않는다", async () => {
    captureLogs();
    const db = fakeDb();
    const ios = fakeSender("ios");
    db.claimScript.push({ data: { sends: [], deferred: [ORDER_ID] } }, { data: { sends: [], deferred: [ORDER_ID] } });
    const n = make({ supabase: db.supabase, identities: ids, senders: [ios.sender], enabled: true });
    n.enqueueOrders(p, [orderRow(), orderRow({ id: ORDER_ID_B, accountNo: ACCOUNT_B })]);
    await settle();
    expect(db.claims()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(PUSH_DEFER_MS - 1);
    expect(db.claims()).toHaveLength(1);
    await settle(1);
    expect(db.claims()).toHaveLength(2);
    expect(db.claims()[1]!.args).toEqual({
      p_gateway: GATEWAY,
      p_orders: [ORDER_ID],
      p_strategy: [],
      p_recipients: { [ACCOUNT]: [U1] },
      p_platforms: ["ios"],
      p_allow_fallback: true,
      p_claim_id: expect.stringMatching(UUID_RE),
      p_defer_strategy: true,
    });
    await settle(10_000);
    expect(db.claims()).toHaveLength(2); // 두 번째 deferred 는 끝
  });

  it("WR-05 — deferred_strategy(체결 기록 대기 자동매도 완료) → 1500ms 뒤 그 전략 항목만 폴백 허용으로 1회", async () => {
    captureLogs();
    const db = fakeDb();
    const done = strategyRow({ kind: 13, seq: 78, condActual: 4, condThreshold: 3, qty: 500 });
    db.claimScript.push(
      { data: { sends: [], deferred: [], deferred_strategy: [{ journal_epoch: EPOCH, seq: 78 }] } },
      { data: { sends: [], deferred: [] } },
    );
    const n = make({ supabase: db.supabase, identities: ids, senders: [fakeSender("ios").sender], enabled: true });
    n.enqueueStrategy(p, [strategyRow(), done]);
    await settle();
    expect(db.claims()).toHaveLength(1);
    expect(db.claims()[0]!.args.p_defer_strategy).toBe(true);
    await settle(PUSH_DEFER_MS);
    expect(db.claims()).toHaveLength(2);
    expect(db.claims()[1]!.args).toEqual({
      p_gateway: GATEWAY,
      p_orders: [],
      p_strategy: [{ journal_epoch: EPOCH, seq: 78 }],
      p_recipients: { [ACCOUNT]: [U1] },
      p_platforms: ["ios"],
      p_allow_fallback: true,
      p_claim_id: expect.stringMatching(UUID_RE),
      p_defer_strategy: true,
    });
    await settle(10_000);
    expect(db.claims()).toHaveLength(2);
  });

  it("단일 비행(D-09) — claim 이 걸린 동안 같은 id 를 두 번 enqueue → 끝난 뒤 정착 400ms 뒤 한 번만 더(p_orders 에 그 id 1개)", async () => {
    captureLogs();
    const db = fakeDb();
    let release: (d: ClaimData) => void = () => undefined;
    db.claimScript.push({ hold: new Promise<ClaimData>((r) => (release = r)) });
    const n = make({ supabase: db.supabase, identities: ids, senders: [fakeSender("ios").sender], enabled: true });
    n.enqueueOrders(p, [orderRow()]);
    await settle();
    expect(db.claims()).toHaveLength(1);

    n.enqueueOrders(p, [orderRow({ status: "partially_filled", lastSeq: 2 })]);
    n.enqueueOrders(p, [orderRow({ status: "filled", lastSeq: 3 })]);
    await settle(5_000);
    expect(db.claims()).toHaveLength(1); // 비행 중 — 두 번째 호출 없음

    release({ sends: [], deferred: [] });
    await flush();
    await vi.advanceTimersByTimeAsync(PUSH_SETTLE_MS - 1);
    expect(db.claims()).toHaveLength(1);
    await settle(1);
    expect(db.claims()).toHaveLength(2);
    expect(db.claims()[1]!.args.p_orders).toEqual([ORDER_ID]);
    await settle(10_000);
    expect(db.claims()).toHaveLength(2);
  });

  it("재기동 재생(SC-2) — 새 notifier 에 같은 행 · claim {sends: [], deferred: []} → 송신 0 · report 0", async () => {
    captureLogs();
    const db = fakeDb();
    const ios = fakeSender("ios");
    db.claimScript.push({ data: { sends: [], deferred: [] } });
    const n = make({ supabase: db.supabase, identities: ids, senders: [ios.sender], enabled: true });
    n.enqueueOrders(p, [orderRow({ status: "filled", filledQty: 500 })]);
    await settle();
    expect(db.claims()).toHaveLength(1);
    expect(ios.sent).toHaveLength(0);
    expect(db.reports()).toHaveLength(0);
  });

  it("claim 오류 1회 → 1초 뒤 재시도 1회 → 성공이면 송신", async () => {
    captureLogs();
    const db = fakeDb();
    const ios = fakeSender("ios");
    db.claimScript.push("error", { data: { sends: [send()], deferred: [] } });
    const n = make({ supabase: db.supabase, identities: ids, senders: [ios.sender], enabled: true });
    n.enqueueOrders(p, [orderRow()]);
    await settle();
    expect(db.claims()).toHaveLength(1);
    expect(ios.sent).toHaveLength(0);
    await settle(1_000);
    expect(db.claims()).toHaveLength(2);
    expect(db.claims()[1]!.args).toEqual(db.claims()[0]!.args); // 같은 인자 — 같은 p_claim_id(WR-01 응답 유실 재생 키)
    expect(ios.sent).toHaveLength(1);
    expect(db.reports()).toHaveLength(1);
  });

  it("WR-02 drain — 정착 대기 중인 행을 바로 판정 · 송신 · 보고까지 마치고 true(정착 400ms 를 기다리지 않는다)", async () => {
    captureLogs();
    const db = fakeDb();
    const ios = fakeSender("ios");
    db.claimScript.push({ data: { sends: [send()], deferred: [] } });
    const n = make({ supabase: db.supabase, identities: ids, senders: [ios.sender], enabled: true });
    n.enqueueOrders(p, [orderRow()]);
    const done = n.drain(1_500);
    await flush();
    expect(db.claims()).toHaveLength(1); // 타이머를 당기지 않았다
    await expect(done).resolves.toBe(true);
    expect(ios.sent).toHaveLength(1);
    expect(db.reports()).toHaveLength(1);
  });

  it("WR-02 drain — 짝 대기(deferred) 재호출을 1.5초 기다리지 않고 폴백 허용으로 바로", async () => {
    captureLogs();
    const db = fakeDb();
    const ios = fakeSender("ios");
    db.claimScript.push({ data: { sends: [], deferred: [ORDER_ID] } }, { data: { sends: [send()], deferred: [] } });
    const n = make({ supabase: db.supabase, identities: ids, senders: [ios.sender], enabled: true });
    n.enqueueOrders(p, [orderRow()]);
    await settle();
    expect(db.claims()).toHaveLength(1);
    await expect(n.drain(1_500)).resolves.toBe(true);
    expect(db.claims()).toHaveLength(2);
    expect(db.claims()[1]!.args.p_allow_fallback).toBe(true);
    expect(ios.sent).toHaveLength(1);
    await settle(10_000);
    expect(db.claims()).toHaveLength(2); // 해제된 타이머가 다시 부르지 않는다
  });

  it("WR-02 drain — 비행 중 판정이 끝나면 그 사이 들어온 행도 정착 없이 이어서 판정한다", async () => {
    captureLogs();
    const db = fakeDb();
    let release: (d: ClaimData) => void = () => undefined;
    db.claimScript.push({ hold: new Promise<ClaimData>((r) => (release = r)) }, { data: { sends: [send()], deferred: [] } });
    const ios = fakeSender("ios");
    const n = make({ supabase: db.supabase, identities: ids, senders: [ios.sender], enabled: true });
    n.enqueueOrders(p, [orderRow()]);
    await settle();
    n.enqueueOrders(p, [orderRow({ status: "filled", filledQty: 500 })]);
    const done = n.drain(1_500);
    await flush();
    expect(db.claims()).toHaveLength(1);
    release({ sends: [], deferred: [] });
    await expect(done).resolves.toBe(true);
    expect(db.claims()).toHaveLength(2);
    expect(ios.sent).toHaveLength(1);
  });

  it("WR-02 drain — 판정이 상한 안에 안 끝나면 false · warn 1줄(종료를 막지 않는다)", async () => {
    const logs = captureLogs();
    const db = fakeDb();
    db.claimScript.push({ hold: new Promise<ClaimData>(() => undefined) });
    const n = make({ supabase: db.supabase, identities: ids, senders: [fakeSender("ios").sender], enabled: true });
    n.enqueueOrders(p, [orderRow()]);
    const done = n.drain(1_500);
    await vi.advanceTimersByTimeAsync(1_500);
    await expect(done).resolves.toBe(false);
    expect(pushLogs(logs).filter((l) => l.level === "warn" && String(l.args[1]).includes("drain 시간 초과"))).toHaveLength(1);
  });

  it("WR-03 — 판정 · 보고 RPC 마다 끊기 신호 · 판정이 3초 안에 안 오면 끊고 1초 뒤 같은 키로 재시도", async () => {
    captureLogs();
    const db = fakeDb();
    const ios = fakeSender("ios");
    db.claimScript.push("hangUntilAbort", { data: { sends: [send()], deferred: [] } });
    const n = make({ supabase: db.supabase, identities: ids, senders: [ios.sender], enabled: true });
    expect(PUSH_RPC_TIMEOUT_MS).toBe(3_000);
    n.enqueueOrders(p, [orderRow()]);
    await settle();
    expect(db.claims()).toHaveLength(1);
    expect(db.signals[0]!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(PUSH_RPC_TIMEOUT_MS - 1);
    expect(db.signals[0]!.aborted).toBe(false);
    await settle(1);
    expect(db.signals[0]!.aborted).toBe(true); // 상한에서 끊김
    expect(db.claims()).toHaveLength(1);
    await settle(1_000);
    expect(db.claims()).toHaveLength(2);
    expect(db.claims()[1]!.args.p_claim_id).toBe(db.claims()[0]!.args.p_claim_id);
    expect(ios.sent).toHaveLength(1);
    expect(db.reports()).toHaveLength(1);
    expect(db.signals).toHaveLength(3); // claim 2 + report 1 — 전부 신호를 단다
  });

  it("WR-03 — 플랫폼끼리 병렬: iOS 송신이 걸려 있어도 Android 는 바로 간다 · 플랫폼 안은 순차", async () => {
    captureLogs();
    const db = fakeDb();
    let releaseIos: (r: PushSendResult) => void = () => undefined;
    const ios = fakeSender("ios", () => new Promise<PushSendResult>((r) => (releaseIos = r)));
    const android = fakeSender("android");
    db.claimScript.push({
      data: {
        sends: [
          send({
            devices: [
              { device_id: DEVICE_IOS, platform: "ios", token: TOKEN_IOS },
              { device_id: DEVICE_IOS_2, platform: "ios", token: TOKEN_IOS_2 },
              { device_id: DEVICE_AND, platform: "android", token: TOKEN_AND },
            ],
          }),
        ],
        deferred: [],
      },
    });
    const n = make({ supabase: db.supabase, identities: ids, senders: [ios.sender, android.sender], enabled: true });
    n.enqueueOrders(p, [orderRow()]);
    await settle();
    expect(android.sent.map((s) => s.token)).toEqual([TOKEN_AND]); // iOS 를 기다리지 않음
    expect(ios.sent.map((s) => s.token)).toEqual([TOKEN_IOS]); // iOS 둘째는 첫째가 끝난 뒤
    expect(db.reports()).toHaveLength(0);
    releaseIos({ result: "ok", httpStatus: 200 });
    await flush();
    expect(ios.sent.map((s) => s.token)).toEqual([TOKEN_IOS, TOKEN_IOS_2]);
    releaseIos({ result: "ok", httpStatus: 200 });
    await flush();
    const rows = (db.reports()[0]!.args.p_results as Array<{ device_id: string }>).map((r) => r.device_id);
    expect(rows).toEqual([DEVICE_IOS, DEVICE_IOS_2, DEVICE_AND]);
  });

  it("WR-01 — p_claim_id 는 묶음마다 새 uuid · 같은 묶음의 재시도는 같은 값", async () => {
    captureLogs();
    const db = fakeDb();
    db.claimScript.push("throw", { data: { sends: [], deferred: [] } }, { data: { sends: [], deferred: [] } });
    const n = make({ supabase: db.supabase, identities: ids, senders: [fakeSender("ios").sender], enabled: true });
    n.enqueueOrders(p, [orderRow()]);
    await settle();
    await settle(1_000);
    n.enqueueOrders(p, [orderRow({ status: "filled", filledQty: 500 })]);
    await settle();
    const keys = db.claims().map((c) => c.args.p_claim_id);
    expect(keys).toHaveLength(3);
    for (const k of keys) expect(k).toMatch(UUID_RE);
    expect(keys[1]).toBe(keys[0]); // 재시도 = 같은 키
    expect(keys[2]).not.toBe(keys[0]); // 다음 묶음 = 새 키
  });

  it("WR-01 하위 호환 — 옛 DB(PGRST202)면 p_claim_id 없이 바로 다시 불러 송신 · 경고는 한 번만", async () => {
    const logs = captureLogs();
    const db = fakeDb();
    const ios = fakeSender("ios");
    db.claimScript.push("missing", { data: { sends: [send()], deferred: [] } }, "missing", { data: { sends: [], deferred: [] } });
    const n = make({ supabase: db.supabase, identities: ids, senders: [ios.sender], enabled: true });
    n.enqueueOrders(p, [orderRow()]);
    await settle();
    expect(db.claims()).toHaveLength(2); // 재시도 지연(1초) 없이 바로
    expect(db.claims()[0]!.args).toHaveProperty("p_claim_id");
    expect(db.claims()[1]!.args).not.toHaveProperty("p_claim_id");
    expect(db.claims()[1]!.args).not.toHaveProperty("p_defer_strategy");
    const { p_claim_id: _k, p_defer_strategy: _d, ...legacy } = db.claims()[0]!.args;
    expect(db.claims()[1]!.args).toEqual(legacy);
    expect(ios.sent).toHaveLength(1);
    n.enqueueOrders(p, [orderRow({ status: "filled", filledQty: 500 })]);
    await settle();
    expect(db.claims()).toHaveLength(4);
    const warns = pushLogs(logs).filter((l) => l.level === "warn" && String(l.args[1]).includes("옛 시그니처"));
    expect(warns).toHaveLength(1);
    expect(pushLogs(logs).filter((l) => l.level === "error")).toHaveLength(0);
  });

  it("claim 두 번 다 오류 → 송신 0 · [push] error 로그 1줄", async () => {
    const logs = captureLogs();
    const db = fakeDb();
    const ios = fakeSender("ios");
    db.claimScript.push("throw", "error");
    const n = make({ supabase: db.supabase, identities: ids, senders: [ios.sender], enabled: true });
    n.enqueueOrders(p, [orderRow()]);
    await settle();
    await settle(1_000);
    await settle(10_000);
    expect(db.claims()).toHaveLength(2);
    expect(ios.sent).toHaveLength(0);
    expect(db.reports()).toHaveLength(0);
    const errors = pushLogs(logs).filter((l) => l.level === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]!.args[1]).toBe("[push] dma_push_claim 실패 — 이 묶음 건너뜀");
  });

  it("stopRun(429) — 그 플랫폼 남은 기기 송신 0 · 다른 플랫폼은 계속 · report 는 실제 보낸 것만", async () => {
    captureLogs();
    const db = fakeDb();
    const ios = fakeSender("ios", () => ({ result: "failed", httpStatus: 429, reason: "TooManyRequests", stopRun: true }));
    const android = fakeSender("android");
    db.claimScript.push({
      data: {
        sends: [
          send({
            devices: [
              { device_id: DEVICE_IOS, platform: "ios", token: TOKEN_IOS },
              { device_id: DEVICE_IOS_2, platform: "ios", token: TOKEN_IOS_2 },
              { device_id: DEVICE_AND, platform: "android", token: TOKEN_AND },
            ],
          }),
        ],
        deferred: [],
      },
    });
    const n = make({ supabase: db.supabase, identities: ids, senders: [ios.sender, android.sender], enabled: true });
    n.enqueueOrders(p, [orderRow()]);
    await settle();
    expect(db.claims()[0]!.args.p_platforms).toEqual(["ios", "android"]);
    expect(ios.sent.map((s) => s.token)).toEqual([TOKEN_IOS]);
    expect(android.sent.map((s) => s.token)).toEqual([TOKEN_AND]);
    const results = (db.reports()[0]!.args.p_results as Array<{ device_id: string; result: string; http_status: number }>).map(
      (r) => [r.device_id, r.result, r.http_status],
    );
    expect(results).toEqual([
      [DEVICE_IOS, "failed", 429],
      [DEVICE_AND, "ok", 200],
    ]);
  });

  it("enqueue 예외는 던지지 않고 [push] error 로그만(리스너 안 예외 — SC-3)", () => {
    const logs = captureLogs();
    const db = fakeDb();
    const n = make({ supabase: db.supabase, identities: ids, senders: [fakeSender("ios").sender], enabled: true });
    expect(() => n.enqueueOrders(p, null as unknown as JournalOrderRow[])).not.toThrow();
    expect(() => n.enqueueStrategy(p, null as unknown as StrategyEventRow[])).not.toThrow();
    expect(pushLogs(logs).filter((l) => l.level === "error")).toHaveLength(2);
  });

  it("예외 격리(SC-3) — 실제 JournalWriter 에 fanout 가짜 → notifier 순으로 붙이고 notifier rpc · 송신기가 throw 해도 writer 는 다음 배치를 적용하고 fanout 은 두 배치를 다 받는다", async () => {
    const logs = captureLogs();
    const journal = fakeJournalDb();
    const w = new JournalWriter({ supabase: journal.supabase, gateway: GATEWAY });
    const pushDb = fakeDb();
    pushDb.claimScript.push("throw", "throw", { data: { sends: [send()], deferred: [] } });
    const throwing = fakeSender("ios", (token) => {
      throw new Error(`apns boom ${token}`);
    });
    const n = make({ supabase: pushDb.supabase, identities: ids, senders: [throwing.sender], enabled: true });
    const fanoutGot: number[][] = [];
    w.on("applied", (rows) => fanoutGot.push(rows.map((r) => r.lastSeq)));
    w.on("applied", (rows) => n.enqueueOrders(p, rows));
    w.beginEpoch("ep-1", { resync: false, headSeq: 0 });

    w.push([journalRecord(1)]);
    await flush();
    await settle(); // 판정 RPC throw → 1초 뒤 재시도도 throw
    await settle(1_000);
    w.push([journalRecord(2)]);
    await flush();
    await settle(); // 판정 성공 → 송신기 throw → failed 로 보고

    expect(journal.calls.map((c) => c.fn)).toEqual(["dma_journal_apply", "dma_journal_apply"]); // 다음 배치 적용
    expect(fanoutGot).toEqual([[1], [2]]);
    expect(w.lastAppliedSeq).toBe(2);
    expect(throwing.sent).toHaveLength(1);
    expect(pushDb.reports()).toHaveLength(1);
    expect((pushDb.reports()[0]!.args.p_results as Array<Record<string, unknown>>)[0]).toMatchObject({
      result: "failed",
      http_status: 0,
      reason: "exception",
    });
    expect(pushLogs(logs).filter((l) => l.level === "error").length).toBeGreaterThanOrEqual(1);
    w.close();
  });

  it("T-19-14 — 모든 [push] 로그 인자에 계좌번호 · 토큰 · 사용자 id · DMA id 문자열이 없다(송신기 예외 문자열의 토큰도 지운다)", async () => {
    const logs = captureLogs();
    const db = fakeDb({ reportThrows: true });
    const ios = fakeSender("ios", (token) => {
      throw new Error(`apns boom ${token}`);
    });
    const android = fakeSender("android", () => ({ result: "token_removed", httpStatus: 404, reason: "UNREGISTERED" }));
    db.claimScript.push("error", {
      data: {
        sends: [
          send({
            devices: [
              { device_id: DEVICE_IOS, platform: "ios", token: TOKEN_IOS },
              { device_id: DEVICE_AND, platform: "android", token: TOKEN_AND },
            ],
          }),
          send({ log_id: "bad", facts: facts({ stage: "unknown" as never }) }),
        ],
        deferred: [ORDER_ID_B],
      },
    });
    const n = make({
      supabase: db.supabase,
      identities: identities({ "dma-a": [U1, U2] }),
      senders: [ios.sender, android.sender],
      enabled: true,
    });
    n.enqueueOrders(p, [orderRow(), orderRow({ id: ORDER_ID_B, accountNo: ACCOUNT_B })]);
    await settle();
    await settle(1_000);
    await settle(PUSH_DEFER_MS);
    const all = pushLogs(logs);
    expect(all.length).toBeGreaterThanOrEqual(5); // 켜짐 · claim warn · 문안 실패 · 송신기 예외 · report 실패 · 송신
    const text = JSON.stringify(all.map((l) => l.args));
    for (const secret of [ACCOUNT, ACCOUNT_B, TOKEN_IOS, TOKEN_AND, U1, U2, "dma-a"]) expect(text).not.toContain(secret);
  });
});

// --- 실제 JournalWriter 용 가짜 supabase(journal-writer.test.ts 꼴 축약) ---------------------------------------------------

type JournalRpcCall = { fn: string; args: { p_events: JournalApplyEvent[] } };

function journalDbRow(seq: number): JournalOrderDbRow {
  return {
    id: ORDER_ID,
    trade_date: "2026-11-06",
    account_no: ACCOUNT,
    isin: "KR7282720005",
    stock_code: "282720",
    exchange: "KRX",
    board: null,
    side: "B",
    order_type: "N",
    org_order_no: null,
    qty: 500,
    price: 3120,
    order_no: "0000100001",
    filled_qty: 0,
    modified_qty: 0,
    status: "accepted",
    result_code: 0,
    notice_type: "A",
    message: null,
    origin: "limit_chaser",
    requester: null,
    request_kind: null,
    last_seq: seq,
    created_at: "2026-11-06T00:00:31+00:00",
    updated_at: "2026-11-06T00:00:31+00:00",
  };
}

function fakeJournalDb() {
  const calls: JournalRpcCall[] = [];
  const supabase = {
    rpc: async (fn: string, args: JournalRpcCall["args"]) => {
      calls.push({ fn, args: { ...args, p_events: [...args.p_events] } });
      const events = args.p_events;
      return {
        data: {
          applied: events.length,
          skipped: 0,
          errors: [],
          last_seq: String(Math.max(...events.map((e) => e.seq))),
          rows: events.map((e) => journalDbRow(e.seq)),
        },
        error: null,
      };
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
    }),
  } as unknown as SupabaseClient;
  return { supabase, calls };
}

function journalRecord(seq: number): JournalRecord {
  return {
    seq,
    tradeDate: "2026-11-06",
    gwTimeMs: kst("09:00:31") + seq,
    dmaUserId: "dma-a",
    accountNo: ACCOUNT,
    isin: "KR7282720005",
    side: "2",
    sideTrusted: true,
    orderNo: "0000100001",
    orgOrderNo: "",
    noticeType: "A",
    requestKind: "new",
    requester: "web",
    origin: "limit_chaser",
    exchange: "KRX",
    board: "",
    orderPrice: 3120,
    orderQty: 500,
    execPrice: 0,
    execQty: 0,
    resultCode: 0,
    message: "",
    localReject: false,
    avgPrice: 0,
    feeKrw: 0,
    taxKrw: 0,
    realizedPnlKrw: 0,
  };
}
