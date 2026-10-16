/**
 * Phase 29-43 — G-1 (가) 옛 주문 서버 계좌 전략 끄기 (`StrategySweeper`).
 *
 * gh-trade-84 ② 추가 확정(29-29-SUMMARY §후속): 주문 서버를 바꾸면 옛 서버에 남은 그 계좌의 활성 전략(상따 · VI · 자동매도)을
 * 꺼야 한다 — 경고로는 부족. 이 파일은 그 프로토콜 모듈 하나를 스텁 게이트웨이 1대(KB120 역할) · 실 SessionManager · 실 DmaSession
 * 위에서 끝에서 끝으로 고정한다:
 *   21(KRX) · 21(NXT) · 24 조회(64 = 두 21 답의 끝 · 32-14) → 대상 계좌의 켜진 상따마다 14(그 키) · 대상 계좌 VI 슬롯마다 11 run:false
 *   → 60/61 에코 · 65 → 21 × 2 · 24 재조회로 0 확인 → ok.
 *
 * 타이머 · 대기 규율은 `session-routing.test.ts` 와 같다(setImmediate 는 진짜, 조건 폴링).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RelayOutbound } from "@gh-radar/shared";

import { SessionManager, type DmaCredentials, type SessionTarget } from "../src/dma/session-manager.js";
import { SubscriptionHub } from "../src/hub/subscription-hub.js";
import {
  STALE_RETRY_MAX_ATTEMPTS,
  STALE_RETRY_MAX_DELAY_MS,
  StaleStrategyRegister,
  StrategySweeper,
  isActiveLimitChaser,
  staleRetryDelayMs,
  type StrategySweepResult,
} from "../src/dma/strategy-sweeper.js";
import { resetDroppedEnvelopeCount } from "../src/dma/envelope.js";
import { MSG } from "../src/dma/msg-type.js";
import {
  readDisableStrategiesKey,
  readGetVITriggerExchange,
  readViSetRequest,
  startFakeGateway,
  type FakeGateway,
} from "./helpers/fake-gateway.js";
import {
  buildDisableStrategiesRespFrame,
  buildLimitChaserListRespFrame,
  buildSetLimitChaserRespFrame,
  buildSetVITriggerRespFrame,
  type FakeLimitChaserInput,
} from "./helpers/frames.js";

const CREDS: DmaCredentials = { dmaUserId: "dma-sweep-login-id", password: "p@ss-절대노출금지" };
const U1 = "3f1c2b7a-9d40-4a11-8e55-0000000000c1";
const U2 = "3f1c2b7a-9d40-4a11-8e55-0000000000c2";

const A = "1111111101";
const B = "2222222201";
const C = "3333333301";
const ISIN1 = "KR7005930003";
const ISIN2 = "KR7000660001";
const ISIN3 = "KR7035420009";

/** 전략 키 — relay `strategyKey` 와 같은 `isin:accountNo:exchange`. */
const keyOf = (isin: string, accountNo: string, exchange = "KRX") => `${isin}:${accountNo}:${exchange}`;

/** 조회 · 명령 msg_type 만 — 로그인 · 계좌 선언 · 핑은 순서 단언에서 뺀다. */
const SWEEP_TYPES = new Set<number>([
  MSG.GetLimitChaserListReq,
  MSG.GetVITriggerReq,
  MSG.DisableStrategiesReq,
  MSG.SetVITriggerReq,
  MSG.DirectOrderReq,
]);

async function flushIo(turns = 4): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

async function waitFor(predicate: () => boolean, label: string, turns = 400): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    if (predicate()) return;
    await flushIo(1);
  }
  throw new Error(`조건이 서지 않았습니다: ${label}`);
}

/** 켜진 상따 1건(매수 스위치만). */
function on(isin: string, accountNo: string, extra: FakeLimitChaserInput = {}): FakeLimitChaserInput {
  return { isin, accountNo, exchange: "KRX", buyEnabled: true, ...extra };
}

/** 스위치가 전부 꺼진 상따 1건(비활성 — 등록만 남음). */
function off(isin: string, accountNo: string): FakeLimitChaserInput {
  return { isin, accountNo, exchange: "KRX" };
}

type Received = { msgType: number; payload: Buffer };

type ViFrame = Extract<RelayOutbound, { t: "vi.slot" }>;
/** VI 슬롯 프레임 (Phase 32 D-17 slot-only — 구 거래소 병합 `vi` 는 더 나가지 않는다). */
const isVi = (f: RelayOutbound): f is ViFrame => f.t === "vi.slot";

describe("StrategySweeper — 옛 서버 계좌 전략 끄기 (29-43)", () => {
  let gw: FakeGateway;
  let m: SessionManager;
  let received: Received[];
  let target: SessionTarget;

  beforeEach(async () => {
    resetDroppedEnvelopeCount();
    gw = await startFakeGateway({
      autoLogin: true,
      loginResp: {
        success: true,
        accounts: [
          { accountNo: A, name: "위탁 A" },
          { accountNo: B, name: "위탁 B" },
          { accountNo: C, name: "위탁 C" },
        ],
      },
    });
    received = [];
    gw.onFrame((msgType, payload) => received.push({ msgType, payload: Buffer.from(payload) }));
    gw.handleDisableStrategies({});
    gw.respondViTriggerFor("KRX", null);
    gw.respondViTriggerFor("NXT", null);
    target = { serverKey: "KB120", host: "127.0.0.1", port: gw.port, broker: "KB" };
    m = new SessionManager({ host: "127.0.0.1", port: 1, broker: "KB" });
  });

  afterEach(async () => {
    await m.closeAll();
    await gw.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function sweeper(opts: { stepTimeoutMs?: number; totalTimeoutMs?: number } = {}): StrategySweeper {
    return new StrategySweeper({ sessions: m, targetOf: (k) => (k === "KB120" ? target : undefined), ...opts });
  }

  /** u1 의 KB120 세션을 미리 쥐고 Ready 까지 기다린다(브라우저가 쥔 세션 역할). */
  async function readySessionOf(userId: string) {
    const s = m.acquireOn(userId, target, CREDS);
    await waitFor(() => s.isReady, "세션 ready");
    received.length = 0;
    return s;
  }

  function sweepTypes(): number[] {
    return received.filter((r) => SWEEP_TYPES.has(r.msgType)).map((r) => r.msgType);
  }

  function viGetExchanges(): string[] {
    return received
      .filter((r) => r.msgType === MSG.GetVITriggerReq)
      .map((r) => readGetVITriggerExchange(r.msgType, r.payload) ?? "<bare>");
  }

  function disabledKeys(): string[] {
    return received
      .filter((r) => r.msgType === MSG.DisableStrategiesReq)
      .map((r) => readDisableStrategiesKey(r.msgType, r.payload) ?? "<none>");
  }

  function viSets() {
    return received
      .filter((r) => r.msgType === MSG.SetVITriggerReq)
      .map((r) => readViSetRequest(r.msgType, r.payload));
  }

  function activeOf(accountNo: string): number {
    return gw
      .limitChaserSeed()
      .filter((c) => c.accountNo === accountNo)
      .filter(
        (c) =>
          c.buyEnabled === true ||
          c.sellEnabled === true ||
          c.cancelQtyEnabled === true ||
          c.postBuyAuto === true ||
          c.autoSellEnabled === true ||
          (c.autoSellState ?? 0) !== 0,
      ).length;
  }

  it("① 트레이서 — A 의 켜진 상따 2건 · VI(KRX) 를 끄고 두 거래소 재조회 0 → ok · B 전략 무영향", async () => {
    await readySessionOf(U1);
    gw.respondLimitChaserList([
      on(ISIN1, A),
      on(ISIN2, A, { buyEnabled: false, sellEnabled: true }),
      on(ISIN1, B),
      off(ISIN3, A),
    ]);
    gw.respondViTriggerFor("KRX", { accountNo: A, run: true, orderAmountKrw: 3_000_000n, checkRate: 20 });

    const result: StrategySweepResult = await sweeper().sweep(
      { userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A] },
      CREDS,
    );

    expect(result).toEqual({ ok: true, disabledLimitChasers: 2, viDisabled: 1, sessionCreated: false, skippedAccounts: [] });
    // 스텁 수신 순서: 21(KRX) → 21(NXT) → 24 → 14 × 2 → 11 × 1 → 21(KRX) · 21(NXT) · 24 (32-14 — 64 가 21 답의 끝).
    expect(sweepTypes()).toEqual([
      MSG.GetVITriggerReq,
      MSG.GetVITriggerReq,
      MSG.GetLimitChaserListReq,
      MSG.DisableStrategiesReq,
      MSG.DisableStrategiesReq,
      MSG.SetVITriggerReq,
      MSG.GetVITriggerReq,
      MSG.GetVITriggerReq,
      MSG.GetLimitChaserListReq,
    ]);
    expect(viGetExchanges()).toEqual(["KRX", "NXT", "KRX", "NXT"]);
    // 14 는 A 의 켜진 키만 — 비활성 1건 · B 키 · 빈 키 없음.
    expect(disabledKeys().sort()).toEqual([keyOf(ISIN1, A), keyOf(ISIN2, A)].sort());
    // 11 은 같은 값 · 그 거래소 · run:false.
    expect(viSets()).toEqual([
      { accountNo: A, orderAmountKrw: 3_000_000, checkRate: 20, priceType: "U", run: false, exchange: "KRX" },
    ]);
    // 미체결은 건드리지 않는다 — 2 DirectOrderReq 0건.
    expect(received.filter((r) => r.msgType === MSG.DirectOrderReq)).toHaveLength(0);
    // 스텁 상태: A 켜진 상따 0 · B 그대로 · VI(KRX) run false · VI(NXT) 미등록 그대로.
    expect(activeOf(A)).toBe(0);
    expect(activeOf(B)).toBe(1);
    expect(gw.viTriggerSlot("KRX")).toMatchObject({ accountNo: A, run: false, exchange: "KRX" });
    expect(gw.viTriggerSlot("NXT")).toBeNull();
  });

  it("② NXT 에만 켜진 VI → 11 × 1(NXT · run:false) · viDisabled 1 · 두 거래소 재조회 뒤 ok", async () => {
    await readySessionOf(U1);
    gw.respondLimitChaserList([]);
    gw.respondViTriggerFor("NXT", { accountNo: A, run: true, orderAmountKrw: 2_000_000n, checkRate: 15 });

    const result = await sweeper().sweep({ userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A] }, CREDS);

    expect(result).toEqual({ ok: true, disabledLimitChasers: 0, viDisabled: 1, sessionCreated: false, skippedAccounts: [] });
    expect(viSets()).toEqual([
      { accountNo: A, orderAmountKrw: 2_000_000, checkRate: 15, priceType: "U", run: false, exchange: "NXT" },
    ]);
    expect(viGetExchanges()).toEqual(["KRX", "NXT", "KRX", "NXT"]);
    expect(gw.viTriggerSlot("NXT")).toMatchObject({ run: false, exchange: "NXT" });
    expect(gw.viTriggerSlot("KRX")).toBeNull();
  });

  it("③ 두 거래소 모두 켜진 VI → 11 × 2(각자 거래소) · viDisabled 2 · 재조회 둘 다 run false", async () => {
    await readySessionOf(U1);
    gw.respondLimitChaserList([]);
    gw.respondViTriggerFor("KRX", { accountNo: A, run: true, orderAmountKrw: 1_000_000n, checkRate: 25 });
    gw.respondViTriggerFor("NXT", { accountNo: A, run: true, orderAmountKrw: 4_000_000n, checkRate: 10 });

    const result = await sweeper().sweep({ userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A] }, CREDS);

    expect(result).toEqual({ ok: true, disabledLimitChasers: 0, viDisabled: 2, sessionCreated: false, skippedAccounts: [] });
    expect(viSets()).toEqual([
      { accountNo: A, orderAmountKrw: 1_000_000, checkRate: 25, priceType: "U", run: false, exchange: "KRX" },
      { accountNo: A, orderAmountKrw: 4_000_000, checkRate: 10, priceType: "U", run: false, exchange: "NXT" },
    ]);
    expect(gw.viTriggerSlot("KRX")).toMatchObject({ run: false });
    expect(gw.viTriggerSlot("NXT")).toMatchObject({ run: false });
  });

  it("④ VI 가 B 계좌(대상 아님 — 두 거래소) → 11 0건 · viDisabled 0 · 상따만 끈다", async () => {
    await readySessionOf(U1);
    gw.respondLimitChaserList([on(ISIN1, A)]);
    gw.respondViTriggerFor("KRX", { accountNo: B, run: true, orderAmountKrw: 1_000_000n, checkRate: 25 });
    gw.respondViTriggerFor("NXT", { accountNo: B, run: true, orderAmountKrw: 1_000_000n, checkRate: 25 });

    const result = await sweeper().sweep({ userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A] }, CREDS);

    expect(result).toEqual({ ok: true, disabledLimitChasers: 1, viDisabled: 0, sessionCreated: false, skippedAccounts: [] });
    expect(viSets()).toHaveLength(0);
    expect(gw.viTriggerSlot("KRX")).toMatchObject({ accountNo: B, run: true });
    expect(gw.viTriggerSlot("NXT")).toMatchObject({ accountNo: B, run: true });
  });

  it("⑤ autoSellState 3(매도중) · 5스위치 전부 false → 14 대상(서버 IsActive 동형) · 재조회 0 → ok", async () => {
    await readySessionOf(U1);
    gw.respondLimitChaserList([{ isin: ISIN1, accountNo: A, exchange: "KRX", autoSellState: 3 }]);

    const result = await sweeper().sweep({ userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A] }, CREDS);

    expect(result).toEqual({ ok: true, disabledLimitChasers: 1, viDisabled: 0, sessionCreated: false, skippedAccounts: [] });
    expect(disabledKeys()).toEqual([keyOf(ISIN1, A)]);
    expect(gw.limitChaserSeed()[0]?.autoSellState).toBe(0);
  });

  it("⑥ 세션이 없던 사용자 → acquireOn 이 새 세션(LoginReq 1) · Ready 뒤 같은 순서 · sessionCreated true · release 1", async () => {
    gw.respondLimitChaserList([on(ISIN1, A)]);
    const releaseSpy = vi.spyOn(m, "releaseSession");

    const result = await sweeper().sweep({ userId: U2, serverKey: "KB120", broker: "KB", accountNos: [A] }, CREDS);

    expect(result).toEqual({ ok: true, disabledLimitChasers: 1, viDisabled: 0, sessionCreated: true, skippedAccounts: [] });
    expect(received.filter((r) => r.msgType === MSG.LoginReq)).toHaveLength(1);
    expect(sweepTypes()).toEqual([
      MSG.GetVITriggerReq,
      MSG.GetVITriggerReq,
      MSG.GetLimitChaserListReq,
      MSG.DisableStrategiesReq,
      MSG.GetVITriggerReq,
      MSG.GetVITriggerReq,
      MSG.GetLimitChaserListReq,
    ]);
    expect(releaseSpy).toHaveBeenCalledTimes(1);
    // 얻은 세션 객체로 반납한다(GC-01 — 키 반납 아님). 반납 뒤에도 유예 중이라 맵에 같은 객체가 있다.
    expect(releaseSpy).toHaveBeenCalledWith(U2, m.sessionsOf(U2)[0]);
    expect(releaseSpy).toHaveReturnedWith(true);
  });

  it("⑦ 켜진 전략 0 · VI 미등록(두 거래소 빈 61) → 14 · 11 0건 · ok 0 0 · 21 은 두 거래소", async () => {
    await readySessionOf(U1);
    gw.respondLimitChaserList([off(ISIN1, A), on(ISIN2, B)]);

    const result = await sweeper().sweep({ userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A] }, CREDS);

    expect(result).toEqual({ ok: true, disabledLimitChasers: 0, viDisabled: 0, sessionCreated: false, skippedAccounts: [] });
    expect(sweepTypes()).toEqual([
      MSG.GetVITriggerReq,
      MSG.GetVITriggerReq,
      MSG.GetLimitChaserListReq,
      MSG.GetVITriggerReq,
      MSG.GetVITriggerReq,
      MSG.GetLimitChaserListReq,
    ]);
    expect(viGetExchanges()).toEqual(["KRX", "NXT", "KRX", "NXT"]);
  });

  it("⑧ accountNos 가 둘(A · C) → 둘의 켜진 상따 전부 · VI 는 그 거래소 61 계좌가 둘 중 하나일 때만", async () => {
    await readySessionOf(U1);
    gw.respondLimitChaserList([on(ISIN1, A), on(ISIN2, C), on(ISIN3, B)]);
    gw.respondViTriggerFor("KRX", { accountNo: C, run: true, orderAmountKrw: 1_000_000n, checkRate: 25 });
    gw.respondViTriggerFor("NXT", { accountNo: B, run: true, orderAmountKrw: 1_000_000n, checkRate: 25 });

    const result = await sweeper().sweep(
      { userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A, C] },
      CREDS,
    );

    expect(result).toEqual({ ok: true, disabledLimitChasers: 2, viDisabled: 1, sessionCreated: false, skippedAccounts: [] });
    expect(disabledKeys().sort()).toEqual([keyOf(ISIN1, A), keyOf(ISIN2, C)].sort());
    expect(viSets().map((v) => v?.exchange)).toEqual(["KRX"]);
    expect(activeOf(B)).toBe(1);
  });

  it("⑨ 로그에 DMA id · 계좌번호 · 전략 키가 없다(수 · 서버 키만)", async () => {
    const { logger } = await import("../src/logger.js");
    const lines: string[] = [];
    const keep = ((...args: unknown[]) => {
      lines.push(JSON.stringify(args));
    }) as never;
    vi.spyOn(logger, "info").mockImplementation(keep);
    vi.spyOn(logger, "warn").mockImplementation(keep);
    vi.spyOn(logger, "error").mockImplementation(keep);
    await readySessionOf(U1);
    gw.respondLimitChaserList([on(ISIN1, A), on(ISIN2, B)]);
    gw.respondViTriggerFor("KRX", { accountNo: A, run: true, orderAmountKrw: 1_000_000n, checkRate: 25 });
    lines.length = 0;

    const result = await sweeper().sweep({ userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A] }, CREDS);

    expect(result.ok).toBe(true);
    const all = lines.join("\n");
    expect(lines.some((l) => l.includes("KB120"))).toBe(true);
    for (const secret of [CREDS.dmaUserId, A, B, keyOf(ISIN1, A)]) {
      expect(all).not.toContain(secret);
    }
  });

  // ── Task 2 — 미확인 다섯 갈래 · 전체 시한 ────────────────────────────────────────────

  it("⑩ no-session — targetOf 에 없는 서버 키 · acquireOn null → remaining null · 송신 0 · release 0", async () => {
    const releaseSpy = vi.spyOn(m, "releaseSession");
    const r1 = await sweeper().sweep({ userId: U1, serverKey: "KB999", broker: "KB", accountNos: [A] }, CREDS);
    expect(r1).toEqual({ ok: false, reason: "no-session", remaining: null, disabledLimitChasers: 0, viDisabled: 0, skippedAccounts: [] });

    const nullSessions = new StrategySweeper({
      sessions: { acquireOn: () => null, releaseSession: () => false, sessionsOf: () => [] },
      targetOf: () => target,
    });
    const r2 = await nullSessions.sweep({ userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A] }, CREDS);
    expect(r2).toEqual({ ok: false, reason: "no-session", remaining: null, disabledLimitChasers: 0, viDisabled: 0, skippedAccounts: [] });
    expect(sweepTypes()).toHaveLength(0);
    expect(releaseSpy).not.toHaveBeenCalled();
  });

  it("⑪ not-ready — 스텁이 LoginReq 에 답하지 않으면 단계 시한 뒤 not-ready · release 1 · 조회 0", async () => {
    gw.silenceLogin();
    const releaseSpy = vi.spyOn(m, "releaseSession");

    const result = await sweeper({ stepTimeoutMs: 200 }).sweep(
      { userId: U2, serverKey: "KB120", broker: "KB", accountNos: [A] },
      CREDS,
    );

    expect(result).toEqual({ ok: false, reason: "not-ready", remaining: null, disabledLimitChasers: 0, viDisabled: 0, skippedAccounts: [] });
    expect(releaseSpy).toHaveBeenCalledTimes(1);
    expect(sweepTypes()).toHaveLength(0);
  });

  it("⑫ timeout — 65 가 오지 않으면(60 에코만) 그 14 뒤 단계 시한 → timeout · remaining = 마지막으로 읽은 켜진 수", async () => {
    await readySessionOf(U1);
    gw.handleDisableStrategies({ respond65: false });
    gw.respondLimitChaserList([on(ISIN1, A), on(ISIN2, A)]);

    const result = await sweeper({ stepTimeoutMs: 200 }).sweep(
      { userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A] },
      CREDS,
    );

    expect(result).toEqual({ ok: false, reason: "timeout", remaining: 2, disabledLimitChasers: 0, viDisabled: 0, skippedAccounts: [] });
    expect(disabledKeys()).toHaveLength(1);
  });

  it("⑬ timeout — 21(NXT) 에 답하지 않으면(KRX 61 · 64 는 옴) 조회 미완 → remaining null · 14 · 11 0건", async () => {
    await readySessionOf(U1);
    gw.respondLimitChaserList([on(ISIN1, A)]);
    gw.respondViTriggerFor("KRX", { accountNo: A, run: true, orderAmountKrw: 1_000_000n, checkRate: 25 });
    gw.respondViTriggerFor("NXT", "silent");

    const result = await sweeper({ stepTimeoutMs: 200 }).sweep(
      { userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A] },
      CREDS,
    );

    expect(result).toEqual({ ok: false, reason: "timeout", remaining: null, disabledLimitChasers: 0, viDisabled: 0, skippedAccounts: [] });
    expect(viGetExchanges()).toEqual(["KRX", "NXT"]);
    expect(disabledKeys()).toHaveLength(0);
    expect(viSets()).toHaveLength(0);
  });

  it("⑭ 21(KRX) 가 답하지 않으면(NXT 본문 61 · 64 는 옴) 64 를 끝으로 접지 않는다 → timeout · remaining null · 11 0건 (32-14)", async () => {
    await readySessionOf(U1);
    gw.respondViTriggerFor("KRX", "silent");
    gw.respondViTriggerFor("NXT", { accountNo: A, run: true, orderAmountKrw: 1_000_000n, checkRate: 25 });

    const result = await sweeper({ stepTimeoutMs: 200 }).sweep(
      { userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A] },
      CREDS,
    );

    expect(result).toMatchObject({ ok: false, reason: "timeout", remaining: null });
    expect(viGetExchanges()).toEqual(["KRX", "NXT"]);
    expect(viSets()).toHaveLength(0);
  });

  it("⑮ remaining — 14 를 받아도 스위치를 내리지 않는 서버 → 65 뒤 재조회에 켜진 2 → remaining 2", async () => {
    await readySessionOf(U1);
    gw.handleDisableStrategies({ apply: false });
    gw.respondLimitChaserList([on(ISIN1, A), on(ISIN2, A)]);

    const result = await sweeper().sweep({ userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A] }, CREDS);

    expect(result).toEqual({ ok: false, reason: "remaining", remaining: 2, disabledLimitChasers: 2, viDisabled: 0, skippedAccounts: [] });
  });

  it("⑯ send-failed — 세션이 도중에 Ready 를 잃어 send 가 false → send-failed · 기다리지 않는다", async () => {
    const s = await readySessionOf(U1);
    gw.respondLimitChaserList([on(ISIN1, A)]);
    vi.spyOn(s, "send").mockReturnValue(false);

    const result = await sweeper({ stepTimeoutMs: 5_000 }).sweep(
      { userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A] },
      CREDS,
    );

    expect(result).toEqual({ ok: false, reason: "send-failed", remaining: null, disabledLimitChasers: 0, viDisabled: 0, skippedAccounts: [] });
  });

  it("⑰ 전체 시한(가짜 타이머 20초) 초과 → timeout · 프레임 리스너 해제 · release 1", async () => {
    const s = await readySessionOf(U1);
    const baseline = s.listenerCount("frame");
    gw.silenceQuery(MSG.GetLimitChaserListReq);
    const releaseSpy = vi.spyOn(m, "releaseSession");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const pending = sweeper({ stepTimeoutMs: 60_000 }).sweep(
      { userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A] },
      CREDS,
    );
    await waitFor(() => sweepTypes().length === 3, "21 · 21 · 24 송신");
    await vi.advanceTimersByTimeAsync(19_999);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await flushIo();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;

    expect(result).toEqual({ ok: false, reason: "timeout", remaining: null, disabledLimitChasers: 0, viDisabled: 0, skippedAccounts: [] });
    expect(s.listenerCount("frame")).toBe(baseline);
    expect(releaseSpy).toHaveBeenCalledTimes(1);
    expect(releaseSpy).toHaveBeenCalledWith(U1, s);
  });

  it("GC-01 (29-45) — 반납은 얻은 세션 객체로: send-failed · 예외 갈래도 releaseSession 정확히 1회 · 키 반납(release) 0", async () => {
    const s = await readySessionOf(U1);
    gw.respondLimitChaserList([on(ISIN1, A)]);
    const byObject = vi.spyOn(m, "releaseSession");
    const byKey = vi.spyOn(m, "release");

    const send = vi.spyOn(s, "send").mockReturnValue(false);
    const failed = await sweeper().sweep({ userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A] }, CREDS);
    expect(failed).toMatchObject({ ok: false, reason: "send-failed" });
    expect(byObject).toHaveBeenCalledTimes(1);
    expect(byObject).toHaveBeenLastCalledWith(U1, s);

    send.mockImplementation(() => {
      throw new Error("소켓 쓰기 예외");
    });
    await expect(
      sweeper().sweep({ userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A] }, CREDS),
    ).rejects.toThrow("소켓 쓰기 예외");
    expect(byObject).toHaveBeenCalledTimes(2);
    expect(byObject).toHaveBeenLastCalledWith(U1, s);
    // releaseSession 이 같은 객체라 release 에 위임한 2회뿐 — sweeper 가 키로 직접 반납하지 않는다.
    expect(byKey).toHaveBeenCalledTimes(2);
  });

  it("⑱ 실패 로그는 warn 1줄 — reason · remaining · 서버 키만", async () => {
    const { logger } = await import("../src/logger.js");
    const warns: unknown[][] = [];
    vi.spyOn(logger, "warn").mockImplementation(((...args: unknown[]) => {
      warns.push(args);
    }) as never);
    await readySessionOf(U1);
    gw.handleDisableStrategies({ apply: false });
    gw.respondLimitChaserList([on(ISIN1, A)]);
    warns.length = 0;

    await sweeper().sweep({ userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A] }, CREDS);

    const mine = warns.filter((w) => String(w[1]).includes("전략 끄기"));
    expect(mine).toHaveLength(1);
    expect(Object.keys(mine[0]?.[0] as object).sort()).toEqual(["reason", "remaining", "serverKey"]);
    expect(mine[0]?.[0]).toEqual({ serverKey: "KB120", reason: "remaining", remaining: 1 });
  });

  it("GC-04 (29-45) — 14 확인은 그 키의 60 에코와 짝: 남의 65 만 오고 그 키 에코가 없으면 다음 키로 넘어가지 않는다 → 단계 시한 timeout · 14 1건", async () => {
    await readySessionOf(U1);
    gw.respondLimitChaserList([on(ISIN1, A), on(ISIN2, A)]);
    // 서버는 14 를 기록만 하고(에코 · 65 없음), 다른 갈래의 65 하나가 그 자리에 온다.
    gw.handleDisableStrategies(null);
    gw.onFrame((msgType, _payload, sock) => {
      if (msgType === MSG.DisableStrategiesReq) {
        gw.sendFrame(sock, buildDisableStrategiesRespFrame({ disabledCount: 0, viDisabled: false }));
      }
    });

    const result = await sweeper({ stepTimeoutMs: 200 }).sweep(
      { userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A] },
      CREDS,
    );

    expect(result).toMatchObject({ ok: false, reason: "timeout", remaining: 2, disabledLimitChasers: 0 });
    expect(disabledKeys()).toEqual([expect.any(String)]);
  });

  it("GC-04 (29-45) — 남의 65 가 그 키 에코보다 먼저 와도 그 키 에코 → 65 를 받고서야 다음 키로 · ok 2", async () => {
    await readySessionOf(U1);
    let list: FakeLimitChaserInput[] = [on(ISIN1, A), on(ISIN2, A)];
    gw.respondLimitChaserList(list);
    gw.handleDisableStrategies(null);
    gw.onFrame((msgType, payload, sock) => {
      if (msgType !== MSG.DisableStrategiesReq) return;
      const key = readDisableStrategiesKey(msgType, Buffer.from(payload));
      gw.sendFrame(sock, buildDisableStrategiesRespFrame({ disabledCount: 0, viDisabled: false })); // 남의 65 먼저
      list = list.map((c) => (keyOf(c.isin ?? "", c.accountNo ?? "") === key ? off(c.isin ?? "", c.accountNo ?? "") : c));
      gw.respondLimitChaserList(list);
      const echoed = list.find((c) => keyOf(c.isin ?? "", c.accountNo ?? "") === key);
      if (echoed !== undefined) gw.sendFrame(sock, buildSetLimitChaserRespFrame(echoed));
      gw.sendFrame(sock, buildDisableStrategiesRespFrame({ disabledCount: 1, viDisabled: false }));
    });

    const result = await sweeper({ stepTimeoutMs: 200 }).sweep(
      { userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A] },
      CREDS,
    );

    expect(result).toMatchObject({ ok: true, disabledLimitChasers: 2 });
    expect(disabledKeys().sort()).toEqual([keyOf(ISIN1, A), keyOf(ISIN2, A)].sort());
    expect(activeOf(A)).toBe(0);
  });

  it("GC-14 (29-45) — stillStale(A) 거짓 → A 의 14 · 11 송신 0 · 재조회 남은 수에서 A 제외 · ok · skippedAccounts [A] · 참인 B 는 그대로 끔", async () => {
    await readySessionOf(U1);
    gw.respondLimitChaserList([on(ISIN1, A), on(ISIN2, B)]);
    gw.respondViTriggerFor("KRX", { accountNo: A, run: true, orderAmountKrw: 1_000_000n, checkRate: 25 });
    const asked: string[] = [];

    const result = await sweeper().sweep({ userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A, B] }, CREDS, {
      stillStale: (accountNo) => {
        asked.push(accountNo);
        return accountNo !== A;
      },
    });

    expect(result).toEqual({ ok: true, disabledLimitChasers: 1, viDisabled: 0, sessionCreated: false, skippedAccounts: [A] });
    expect(disabledKeys()).toEqual([keyOf(ISIN2, B)]);
    expect(viSets()).toEqual([]);
    expect(activeOf(A)).toBe(1); // 되돌아온 서버의 A 전략은 그대로
    expect(activeOf(B)).toBe(0);
    expect(gw.viTriggerSlot("KRX")).toMatchObject({ accountNo: A, run: true });
    expect(asked).toContain(A);
    expect(asked).toContain(B);
  });

  it("GC-14 (29-45) — 송신 직전마다 묻는다: 첫 14 뒤 A 가 거짓으로 바뀌면 A 의 남은 14 · 11 은 보내지 않는다(보낸 것은 되돌리지 않음) · ok · skippedAccounts [A]", async () => {
    await readySessionOf(U1);
    gw.respondLimitChaserList([on(ISIN1, A), on(ISIN2, A), on(ISIN3, A)]);
    gw.respondViTriggerFor("NXT", { accountNo: A, run: true, orderAmountKrw: 1_000_000n, checkRate: 25 });
    let stale = true;
    gw.onFrame((msgType) => {
      if (msgType === MSG.DisableStrategiesReq) stale = false;
    });

    const result = await sweeper().sweep({ userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A] }, CREDS, {
      stillStale: () => stale,
    });

    expect(result).toEqual({ ok: true, disabledLimitChasers: 1, viDisabled: 0, sessionCreated: false, skippedAccounts: [A] });
    expect(disabledKeys()).toHaveLength(1);
    expect(viSets()).toEqual([]);
    expect(activeOf(A)).toBe(2);
  });

  it("GC-14 (29-45) — stillStale 미주입 → 종전(대상 계좌 전부 끔 · skippedAccounts [])", async () => {
    await readySessionOf(U1);
    gw.respondLimitChaserList([on(ISIN1, A), on(ISIN2, B)]);

    const result = await sweeper().sweep({ userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A, B] }, CREDS);

    expect(result).toEqual({ ok: true, disabledLimitChasers: 2, viDisabled: 0, sessionCreated: false, skippedAccounts: [] });
    expect(disabledKeys().sort()).toEqual([keyOf(ISIN1, A), keyOf(ISIN2, B)].sort());
  });

  // ── 29-49 — hub 세션 대여 (GC-03 · GC-04 hub 쪽) ─────────────────────────────────────────

  /**
   * 실 hub 결선 — u1 의 KB120 세션(브라우저가 쥔 세션 역할 · 유일 세션이라 primary)을 hub 에 붙이고 Ready 프리페치
   * (24 · 21(KRX) · 21(NXT) · 34 · 43)의 61 이 두 거래소에 귀속될 때까지 기다린다. 그 뒤 수신 기록 · 팬아웃 기록을 비운다.
   */
  async function hubWiredSessionOf(userId: string) {
    const hub = new SubscriptionHub();
    const out: RelayOutbound[] = [];
    hub.on("fanout", (e: { userId: string; msg: RelayOutbound }) => {
      if (e.userId === userId) out.push(e.msg);
    });
    const s = m.acquireOn(userId, target, CREDS);
    hub.attach(s);
    await waitFor(() => s.isReady, "세션 ready");
    // 프리페치 21 두 거래소의 답이 그 세션 소유 계좌(A · B · C) × 두 거래소 슬롯 6칸으로 귀속된다(P32 D-17).
    await waitFor(() => hub.getViSlotsAll(userId).length === 6, "hub 프리페치 61 슬롯 귀속");
    await flushIo();
    received.length = 0;
    out.length = 0;
    return { hub, out, s };
  }

  it("GC-03 · GC-04 (29-49) 트레이서 — 실 hub 결선: sweeper 가 hub 에 세션을 빌려 X 를 끄는 동안 strategies.disabled 0 · 빈 61 vi 0 · hub 21 0 · 반납 뒤 재요청 0 · 대여 아닌 65 는 종전 팬아웃", async () => {
    gw.respondLimitChaserList([on(ISIN1, A)]);
    gw.respondViTriggerFor("NXT", { accountNo: A, run: true, orderAmountKrw: 2_000_000n, checkRate: 15 });
    const { hub, out } = await hubWiredSessionOf(U1);
    const lend = vi.spyOn(hub, "lendSession");

    const result = await sweeper().sweep({ userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A] }, CREDS, {
      lend: (s) => hub.lendSession(s),
    });
    await flushIo(8);

    expect(result).toEqual({ ok: true, disabledLimitChasers: 1, viDisabled: 1, sessionCreated: false, skippedAccounts: [] });
    // GC-03 — sweeper 가 보낸 14 의 65 는 브라우저에 「전부 정지가 반영됐어요」 로 가지 않는다.
    expect(out.filter((f) => f.t === "strategies.disabled")).toHaveLength(0);
    expect(lend).toHaveBeenCalledTimes(1);
    // GC-04 — sweeper 의 빈 61(KRX 미등록 · 조회 · 재조회)로 생긴 vi.slot 0. NXT 슬롯 61 은 서버 사실이라 그대로 간다.
    const vis = out.filter(isVi);
    expect(vis.filter((f) => f.cfg === null)).toHaveLength(0);
    expect(vis.filter((f) => f.x === "KRX")).toHaveLength(0);
    expect(vis.some((f) => f.x === "NXT" && f.cfg?.run === false)).toBe(true);
    // 끈 상따의 60 에코도 서버 사실 — 카드에서 꺼진다.
    expect(out.some((f) => f.t === "lc" && f.item.accountNo === A && !f.item.buyEnabled)).toBe(true);
    // 21 은 sweeper 의 조회 · 재조회 4건뿐 — 대여 중 hub 21 0 · 반납 뒤 재요청 0(프리페치를 미루지 않았다).
    expect(viGetExchanges()).toEqual(["KRX", "NXT", "KRX", "NXT"]);
    // hub VI 캐시 — KRX 는 프리페치 그대로 미등록 · NXT 는 끈 값.
    expect(hub.getViSlot(U1, A, "KRX")).toBeNull();
    expect(hub.getViSlot(U1, A, "NXT")).toMatchObject({ run: false });

    // 대여가 끝난 세션의 65(브라우저 전부 정지 · 서버 발 비활성화)는 종전대로 팬아웃한다.
    const sock = gw.sockets.at(-1);
    if (sock === undefined) throw new Error("게이트웨이 연결 없음");
    gw.sendFrame(sock, buildDisableStrategiesRespFrame({ disabledCount: 3, viDisabled: true }));
    await waitFor(() => out.some((f) => f.t === "strategies.disabled"), "대여 아닌 65 팬아웃");
    expect(out.filter((f) => f.t === "strategies.disabled")).toEqual([
      { t: "strategies.disabled", count: 3, viDisabled: true },
    ]);
    hub.closeAll();
  });

  it("GC-03 (29-49) — lend 1회 · 반납 1회 · 반납은 releaseSession 보다 먼저: ok · timeout · send-failed · not-ready · 예외 갈래 / acquireOn 이 세션을 주지 않으면 lend 0", async () => {
    const order: string[] = [];
    const releaseSession = m.releaseSession.bind(m);
    vi.spyOn(m, "releaseSession").mockImplementation((userId, session) => {
      order.push("releaseSession");
      return releaseSession(userId, session);
    });
    const lend = vi.fn(async () => {
      order.push("lend");
      return {
        release: () => {
          order.push("release");
        },
      };
    });
    const run = (userId: string, opts: { stepTimeoutMs?: number } = {}, serverKey = "KB120") =>
      sweeper(opts).sweep({ userId, serverKey, broker: "KB", accountNos: [A] }, CREDS, { lend });
    const expectOneRound = () => {
      expect(order).toEqual(["lend", "release", "releaseSession"]);
      order.length = 0;
    };

    const s = await readySessionOf(U1);
    gw.respondLimitChaserList([on(ISIN1, A)]);
    expect(await run(U1)).toMatchObject({ ok: true });
    expectOneRound();

    gw.respondLimitChaserList([on(ISIN2, A)]);
    gw.handleDisableStrategies({ respond65: false });
    expect(await run(U1, { stepTimeoutMs: 200 })).toMatchObject({ ok: false, reason: "timeout" });
    expectOneRound();
    gw.handleDisableStrategies({});

    const send = vi.spyOn(s, "send").mockReturnValue(false);
    expect(await run(U1)).toMatchObject({ ok: false, reason: "send-failed" });
    expectOneRound();
    send.mockImplementation(() => {
      throw new Error("소켓 쓰기 예외");
    });
    await expect(run(U1)).rejects.toThrow("소켓 쓰기 예외");
    expectOneRound();
    send.mockRestore();

    gw.silenceLogin();
    expect(await run(U2, { stepTimeoutMs: 200 })).toMatchObject({ ok: false, reason: "not-ready" });
    expectOneRound();

    expect(await run(U1, {}, "KB999")).toMatchObject({ ok: false, reason: "no-session" });
    expect(order).toEqual([]);
    expect(lend).toHaveBeenCalledTimes(5);
  });

  it("N-01 (29-54) — 14 송신 성공마다 lease.noteDisableSent 1회(송신 직후) · 송신 실패면 0 · 대여 반환에 noteDisableSent 가 없어도 종전", async () => {
    const noteDisableSent = vi.fn();
    const lend = vi.fn(async () => ({ release: () => undefined, noteDisableSent }));
    const run = () => sweeper().sweep({ userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A] }, CREDS, { lend });

    const s = await readySessionOf(U1);
    gw.respondLimitChaserList([on(ISIN1, A), on(ISIN2, A)]);
    expect(await run()).toMatchObject({ ok: true, disabledLimitChasers: 2 });
    expect(noteDisableSent).toHaveBeenCalledTimes(2);

    // 14 만 송신 실패(조회 24 · 21 은 나간다) → send-failed · 꼬리표 0.
    noteDisableSent.mockClear();
    gw.respondLimitChaserList([on(ISIN3, A)]);
    const realSend = s.send.bind(s);
    const send = vi
      .spyOn(s, "send")
      .mockImplementation((payload: Uint8Array) =>
        readDisableStrategiesKey(MSG.DisableStrategiesReq, Buffer.from(payload)) === null ? realSend(payload) : false,
      );
    expect(await run()).toMatchObject({ ok: false, reason: "send-failed" });
    expect(noteDisableSent).not.toHaveBeenCalled();
    send.mockRestore();

    // 대여가 noteDisableSent 를 주지 않아도(29-49 모양) 종전대로 끝난다.
    const plainLend = vi.fn(async () => ({ release: () => undefined }));
    gw.respondLimitChaserList([on(ISIN3, A)]);
    expect(
      await sweeper().sweep({ userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A] }, CREDS, { lend: plainLend }),
    ).toMatchObject({ ok: true, disabledLimitChasers: 1 });
  });

  // ── 32-14 — 21 답 n 프레임(gh-trade Phase 33 · 인박스 261016). 선언 계좌 A · B · C(로그인 응답 순)마다 61 1프레임 + 선언 밖 등록 슬롯.
  //    슬롯 모드(`respondViSlots`)로 새 서버를 흉내 낸다. 구 서버(거래소당 61 1프레임)는 ①~⑧ · 아래 32-14 (c) 가 고정한다.

  it("32-14 (a) 새 서버 — 끌 대상 B 가 둘째 선언 계좌 · B 의 VI(KRX) 가동 → B 슬롯 11 run:false · viDisabled 1 · A 슬롯 무영향", async () => {
    await readySessionOf(U1);
    gw.respondLimitChaserList([]);
    gw.respondViSlots([
      { accountNo: A, exchange: "KRX", run: true, orderAmountKrw: 1_000_000n, checkRate: 25 },
      { accountNo: B, exchange: "KRX", run: true, orderAmountKrw: 3_000_000n, checkRate: 20 },
    ]);

    const result = await sweeper().sweep({ userId: U1, serverKey: "KB120", broker: "KB", accountNos: [B] }, CREDS);

    expect(result).toEqual({ ok: true, disabledLimitChasers: 0, viDisabled: 1, sessionCreated: false, skippedAccounts: [] });
    expect(viSets()).toEqual([
      { accountNo: B, orderAmountKrw: 3_000_000, checkRate: 20, priceType: "U", run: false, exchange: "KRX" },
    ]);
    expect(gw.viSlot(B, "KRX")).toMatchObject({ run: false });
    expect(gw.viSlot(A, "KRX")).toMatchObject({ run: true });
  });

  it("32-14 (b) 새 서버 — 21(KRX) 답의 남은 프레임(C 미등록 · cfg null)을 21(NXT) 의 답으로 읽지 않는다 → 첫 선언 계좌 A 의 VI(NXT) 를 끈다", async () => {
    await readySessionOf(U1);
    gw.respondLimitChaserList([]);
    // KRX 는 세 계좌 모두 미등록 프레임 · NXT 는 A 만 가동 — 21(KRX) 답 3프레임 중 첫 프레임만 접으면 남은 B · C 미등록 프레임이
    // 21(NXT) 대기에 「빈 61 = 미등록」 으로 잡혀 A 의 NXT 가동을 놓친다.
    gw.respondViSlots([{ accountNo: A, exchange: "NXT", run: true, orderAmountKrw: 2_000_000n, checkRate: 15 }]);

    const result = await sweeper().sweep({ userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A] }, CREDS);

    expect(result).toEqual({ ok: true, disabledLimitChasers: 0, viDisabled: 1, sessionCreated: false, skippedAccounts: [] });
    expect(viSets()).toEqual([
      { accountNo: A, orderAmountKrw: 2_000_000, checkRate: 15, priceType: "U", run: false, exchange: "NXT" },
    ]);
    expect(gw.viSlot(A, "NXT")).toMatchObject({ run: false });
  });

  it("32-14 (a') 새 서버 — 대상 둘(B · C) · 두 거래소 · 선언 밖 등록 슬롯까지 → 대상 슬롯마다 11 run:false · 재조회 0 → ok", async () => {
    await readySessionOf(U1);
    gw.respondLimitChaserList([]);
    const D = "4444444401"; // 선언 밖 등록 슬롯(복원본) — 초집합 꼬리로 온다.
    gw.respondViSlots([
      { accountNo: A, exchange: "KRX", run: true, orderAmountKrw: 1_000_000n, checkRate: 25 },
      { accountNo: C, exchange: "KRX", run: true, orderAmountKrw: 5_000_000n, checkRate: 30 },
      { accountNo: B, exchange: "NXT", run: true, orderAmountKrw: 2_000_000n, checkRate: 15 },
      { accountNo: D, exchange: "NXT", run: true, orderAmountKrw: 7_000_000n, checkRate: 12 },
    ]);

    const result = await sweeper().sweep(
      { userId: U1, serverKey: "KB120", broker: "KB", accountNos: [B, C, D] },
      CREDS,
    );

    expect(result).toEqual({ ok: true, disabledLimitChasers: 0, viDisabled: 3, sessionCreated: false, skippedAccounts: [] });
    expect(
      viSets()
        .map((v) => `${v?.accountNo}|${v?.exchange}|${v?.run}`)
        .sort(),
    ).toEqual([`${B}|NXT|false`, `${C}|KRX|false`, `${D}|NXT|false`].sort());
    expect(gw.viSlot(A, "KRX")).toMatchObject({ run: true });
  });

  it("32-14 (c) 구 서버(거래소당 61 1프레임) — 본문 61(KRX · 대상 A 가동) + 빈 61(NXT) → 종전대로 KRX 만 끈다 · ok", async () => {
    await readySessionOf(U1);
    gw.respondLimitChaserList([]);
    gw.respondViTriggerFor("KRX", { accountNo: A, run: true, orderAmountKrw: 3_000_000n, checkRate: 20 });
    gw.respondViTriggerFor("NXT", null);

    const result = await sweeper().sweep({ userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A] }, CREDS);

    expect(result).toEqual({ ok: true, disabledLimitChasers: 0, viDisabled: 1, sessionCreated: false, skippedAccounts: [] });
    expect(viSets()).toEqual([
      { accountNo: A, orderAmountKrw: 3_000_000, checkRate: 20, priceType: "U", run: false, exchange: "KRX" },
    ]);
    expect(gw.viTriggerSlot("KRX")).toMatchObject({ run: false });
  });

  it("32-14 (d) 21 답 사이에 남의 64 가 끼어도 그것을 21 답의 끝으로 쓰지 않는다 → NXT 답까지 읽고 대상 A 의 VI(NXT) 를 끈다", async () => {
    await readySessionOf(U1);
    gw.respondLimitChaserList([]);
    gw.respondViSlots([{ accountNo: A, exchange: "NXT", run: true, orderAmountKrw: 2_000_000n, checkRate: 15 }]);
    // 21(KRX) 답 바로 뒤에 남의 64(예: hub Ready 프리페치 24 의 답)를 하나 끼운다.
    gw.onFrame((msgType, payload, sock) => {
      if (msgType === MSG.GetVITriggerReq && readGetVITriggerExchange(msgType, Buffer.from(payload)) === "KRX") {
        gw.sendFrame(sock, buildLimitChaserListRespFrame([]));
      }
    });

    const result = await sweeper().sweep({ userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A] }, CREDS);

    expect(result).toEqual({ ok: true, disabledLimitChasers: 0, viDisabled: 1, sessionCreated: false, skippedAccounts: [] });
    expect(gw.viSlot(A, "NXT")).toMatchObject({ run: false });
  });

  it("32-14 (e) 새 서버 — 21 이 답하지 않으면(64 는 옴) 「끌 것 없음」 으로 접지 않는다 → timeout · remaining null · 11 0건", async () => {
    await readySessionOf(U1);
    gw.respondLimitChaserList([]);
    gw.respondViSlots([{ accountNo: B, exchange: "KRX", run: true, orderAmountKrw: 1_000_000n, checkRate: 25 }]);
    gw.silenceQuery(MSG.GetVITriggerReq);

    const result = await sweeper({ stepTimeoutMs: 200 }).sweep(
      { userId: U1, serverKey: "KB120", broker: "KB", accountNos: [B] },
      CREDS,
    );

    expect(result).toEqual({ ok: false, reason: "timeout", remaining: null, disabledLimitChasers: 0, viDisabled: 0, skippedAccounts: [] });
    expect(viSets()).toHaveLength(0);
    expect(gw.viSlot(B, "KRX")).toMatchObject({ run: true });
  });

  it("32-14 (f) 21 답 창에 파손 61(계좌번호 불량)이 섞이면 그 슬롯을 알 수 없다 → 64 를 끝으로 접지 않는다 → timeout · 11 0건", async () => {
    await readySessionOf(U1);
    gw.respondLimitChaserList([]);
    gw.respondViSlots([]);
    gw.onFrame((msgType, payload, sock) => {
      if (msgType === MSG.GetVITriggerReq && readGetVITriggerExchange(msgType, Buffer.from(payload)) === "KRX") {
        gw.sendFrame(sock, buildSetVITriggerRespFrame({ accountNo: "", exchange: "KRX", run: true }));
      }
    });

    const result = await sweeper({ stepTimeoutMs: 200 }).sweep(
      { userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A] },
      CREDS,
    );

    expect(result).toEqual({ ok: false, reason: "timeout", remaining: null, disabledLimitChasers: 0, viDisabled: 0, skippedAccounts: [] });
    expect(viSets()).toHaveLength(0);
  });

  it("isActiveLimitChaser — 5스위치 OR autoSellState !== 0", () => {
    const base = {
      buyEnabled: false,
      sellEnabled: false,
      cancelQtyEnabled: false,
      postBuyAuto: false,
      autoSellEnabled: false,
      autoSellState: 0,
    };
    const item = (patch: Partial<typeof base>) => ({ ...base, ...patch }) as never;
    expect(isActiveLimitChaser(item({}))).toBe(false);
    expect(isActiveLimitChaser(item({ buyEnabled: true }))).toBe(true);
    expect(isActiveLimitChaser(item({ sellEnabled: true }))).toBe(true);
    expect(isActiveLimitChaser(item({ cancelQtyEnabled: true }))).toBe(true);
    expect(isActiveLimitChaser(item({ postBuyAuto: true }))).toBe(true);
    expect(isActiveLimitChaser(item({ autoSellEnabled: true }))).toBe(true);
    expect(isActiveLimitChaser(item({ autoSellState: 1 }))).toBe(true);
    expect(isActiveLimitChaser(item({ autoSellState: 4 }))).toBe(true);
  });
});

describe("StaleStrategyRegister — 끄지 못한 계좌 (29-43)", () => {
  const entry = (patch: Partial<Parameters<StaleStrategyRegister["set"]>[0]> = {}) => ({
    userId: U1,
    dmaUserId: "dma-1",
    serverKey: "KB120",
    accountNo: A,
    remaining: 2 as number | null,
    reason: "timeout" as const,
    at: 1_000,
    ...patch,
  });

  it("같은 (userId, serverKey, accountNo) 두 번 → 항목 1 · attempts 2 · since 첫 값 유지 · 마지막 값 갱신", () => {
    const reg = new StaleStrategyRegister();
    reg.set(entry());
    reg.set(entry({ at: 2_000, remaining: 1, reason: "remaining" }));
    expect(reg.all()).toEqual([
      {
        userId: U1,
        dmaUserId: "dma-1",
        serverKey: "KB120",
        accountNo: A,
        remaining: 1,
        reason: "remaining",
        since: 1_000,
        attempts: 2,
        lastAttemptAt: 2_000,
      },
    ]);
  });

  it("confirm → 사라짐 · pendingFor 는 그 사용자 것만 · byServer 는 서버별 끄지 못한 계좌 수", () => {
    const reg = new StaleStrategyRegister();
    reg.set(entry());
    reg.set(entry({ accountNo: B }));
    reg.set(entry({ userId: U2, serverKey: "KB121", accountNo: C }));
    expect(reg.byServer()).toEqual(new Map([["KB120", 2], ["KB121", 1]]));
    expect(reg.pendingFor(U1).map((e) => e.accountNo).sort()).toEqual([A, B].sort());
    expect(reg.pendingFor(U2).map((e) => e.accountNo)).toEqual([C]);

    expect(reg.confirm(U1, "KB120", A)).toBe(true);
    expect(reg.confirm(U1, "KB120", A)).toBe(false);
    expect(reg.byServer()).toEqual(new Map([["KB120", 1], ["KB121", 1]]));
    expect(reg.pendingFor(U1).map((e) => e.accountNo)).toEqual([B]);
  });

  it("GC-09 (29-52) discard — 해소 불가 항목 지우기: 있었으면 true · 두 번째 false · byServer · pendingFor 에서 사라짐 · 다른 항목 무영향", () => {
    const reg = new StaleStrategyRegister();
    reg.set(entry());
    reg.set(entry({ userId: U2, serverKey: "KB121", accountNo: C }));
    expect(reg.discard(U1, "KB120", A)).toBe(true);
    expect(reg.discard(U1, "KB120", A)).toBe(false);
    expect(reg.pendingFor(U1)).toEqual([]);
    expect(reg.byServer()).toEqual(new Map([["KB121", 1]]));
    expect(reg.all().map((e) => e.accountNo)).toEqual([C]);
  });

  it("GC-09 (29-52) staleRetryDelayMs 표 — 60 · 120 · 240 · 480 · 960 · 1800 · 1800 …초(최대 30분) · attempts 0 은 1 과 같다 · baseMs 주입 · 상한 상수", () => {
    expect(STALE_RETRY_MAX_ATTEMPTS).toBe(12);
    expect(STALE_RETRY_MAX_DELAY_MS).toBe(1_800_000);
    const table = [0, 1, 2, 3, 4, 5, 6, 7, 12, 40].map((n) => staleRetryDelayMs(n));
    expect(table).toEqual([
      60_000, 60_000, 120_000, 240_000, 480_000, 960_000, 1_800_000, 1_800_000, 1_800_000, 1_800_000,
    ]);
    expect(staleRetryDelayMs(3, 1_000)).toBe(4_000);
    expect(staleRetryDelayMs(40, 1_000)).toBe(1_800_000);
  });
});

describe("StrategySweeper.knowsServer — 레지스트리에 있는 서버인가 (29-52 GC-09)", () => {
  it("GC-09 targetOf 가 아는 서버 키만 true — 레지스트리에서 지운 서버는 false", () => {
    const sessions = new SessionManager({ host: "127.0.0.1", port: 1, broker: "KB" });
    const target: SessionTarget = { serverKey: "KB120", host: "127.0.0.1", port: 1, broker: "KB" };
    const sw = new StrategySweeper({ sessions, targetOf: (k) => (k === "KB120" ? target : undefined) });
    expect(sw.knowsServer("KB120")).toBe(true);
    expect(sw.knowsServer("KB122")).toBe(false);
  });
});
