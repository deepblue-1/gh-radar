/**
 * Phase 40 Plan 06 — relay `PushNotifier`(적용 행 → 판정 RPC → 문안 → 송신기 → 결과 보고).
 *
 * 잠그는 것:
 *   - 한 길: `enqueueOrders` → 정착 400ms → 수신자(`userIdsOf` · D-06) → `dma_push_claim`(6 인자) → `pushMessageOf` 문안 ·
 *     탭 경로 · 묶음 키 · collapseId = log_id → 가짜 송신기 → `dma_push_report` 1회
 *   - 꺼짐(config off · 송신기 0) → RPC 0
 *
 * 가짜 supabase 는 `rpc(fn, args)` 를 기록하고 `dma_push_claim` 응답을 스크립트로 돌려준다(성공 · 오류 · throw · 보류).
 * 가짜 송신기는 호출을 기록한다. 시간은 `vi.useFakeTimers()` 로 당긴다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pushMessageOf } from "@gh-radar/shared";
import type { JournalOrderRow, PushFacts, PushPlatform } from "@gh-radar/shared";

import { logger } from "../src/logger.js";
import {
  PUSH_DEFER_MS,
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
type ClaimData = { sends: Send[]; deferred: string[] };
type ClaimStep = { data: ClaimData } | "error" | "throw" | { hold: Promise<ClaimData> };
type RpcCall = { fn: string; args: Record<string, unknown> };

const PG_ERROR = { code: "57014", message: "canceling statement due to statement timeout", details: `row ${ACCOUNT}` };

function fakeDb(opts: { reportThrows?: boolean } = {}) {
  const calls: RpcCall[] = [];
  const claimScript: ClaimStep[] = [];
  const supabase = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args: structuredClone(args) });
      if (fn === "dma_push_claim") {
        const step = claimScript.shift() ?? { data: { sends: [], deferred: [] } };
        if (step === "error") return { data: null, error: PG_ERROR };
        if (step === "throw") throw new Error("fetch failed");
        if ("hold" in step) return { data: await step.hold, error: null };
        return { data: step.data, error: null };
      }
      if (fn === "dma_push_report") {
        if (opts.reportThrows) throw new Error("report fetch failed");
        return { data: { recorded: (args.p_results as unknown[]).length, removed: 0 }, error: null };
      }
      throw new Error(`unexpected rpc ${fn}`);
    },
  } as unknown as Pick<SupabaseClient, "rpc">;
  return {
    supabase,
    calls,
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
