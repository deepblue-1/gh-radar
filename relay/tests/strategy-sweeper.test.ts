/**
 * Phase 29-43 — G-1 (가) 옛 주문 서버 계좌 전략 끄기 (`StrategySweeper`).
 *
 * gh-trade-84 ② 추가 확정(29-29-SUMMARY §후속): 주문 서버를 바꾸면 옛 서버에 남은 그 계좌의 활성 전략(상따 · VI · 자동매도)을
 * 꺼야 한다 — 경고로는 부족. 이 파일은 그 프로토콜 모듈 하나를 스텁 게이트웨이 1대(KB120 역할) · 실 SessionManager · 실 DmaSession
 * 위에서 끝에서 끝으로 고정한다:
 *   24 · 21(KRX) · 21(NXT) 순차 조회 → 대상 계좌의 켜진 상따마다 14(그 키) · 대상 계좌 VI 거래소마다 11 run:false
 *   → 60/61 에코 · 65 → 24 · 21 × 2 재조회로 0 확인 → ok.
 *
 * 타이머 · 대기 규율은 `session-routing.test.ts` 와 같다(setImmediate 는 진짜, 조건 폴링).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionManager, type DmaCredentials, type SessionTarget } from "../src/dma/session-manager.js";
import { StrategySweeper, isActiveLimitChaser, type StrategySweepResult } from "../src/dma/strategy-sweeper.js";
import { resetDroppedEnvelopeCount } from "../src/dma/envelope.js";
import { MSG } from "../src/dma/msg-type.js";
import {
  readDisableStrategiesKey,
  readGetVITriggerExchange,
  readViSetRequest,
  startFakeGateway,
  type FakeGateway,
} from "./helpers/fake-gateway.js";
import type { FakeLimitChaserInput } from "./helpers/frames.js";

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

  function sweeper(): StrategySweeper {
    return new StrategySweeper({ sessions: m, targetOf: (k) => (k === "KB120" ? target : undefined) });
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

    expect(result).toEqual({ ok: true, disabledLimitChasers: 2, viDisabled: 1, sessionCreated: false });
    // 스텁 수신 순서: 24 → 21(KRX) → 21(NXT) → 14 × 2 → 11 × 1 → 24 · 21(KRX) · 21(NXT).
    expect(sweepTypes()).toEqual([
      MSG.GetLimitChaserListReq,
      MSG.GetVITriggerReq,
      MSG.GetVITriggerReq,
      MSG.DisableStrategiesReq,
      MSG.DisableStrategiesReq,
      MSG.SetVITriggerReq,
      MSG.GetLimitChaserListReq,
      MSG.GetVITriggerReq,
      MSG.GetVITriggerReq,
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

    expect(result).toEqual({ ok: true, disabledLimitChasers: 0, viDisabled: 1, sessionCreated: false });
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

    expect(result).toEqual({ ok: true, disabledLimitChasers: 0, viDisabled: 2, sessionCreated: false });
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

    expect(result).toEqual({ ok: true, disabledLimitChasers: 1, viDisabled: 0, sessionCreated: false });
    expect(viSets()).toHaveLength(0);
    expect(gw.viTriggerSlot("KRX")).toMatchObject({ accountNo: B, run: true });
    expect(gw.viTriggerSlot("NXT")).toMatchObject({ accountNo: B, run: true });
  });

  it("⑤ autoSellState 3(매도중) · 5스위치 전부 false → 14 대상(서버 IsActive 동형) · 재조회 0 → ok", async () => {
    await readySessionOf(U1);
    gw.respondLimitChaserList([{ isin: ISIN1, accountNo: A, exchange: "KRX", autoSellState: 3 }]);

    const result = await sweeper().sweep({ userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A] }, CREDS);

    expect(result).toEqual({ ok: true, disabledLimitChasers: 1, viDisabled: 0, sessionCreated: false });
    expect(disabledKeys()).toEqual([keyOf(ISIN1, A)]);
    expect(gw.limitChaserSeed()[0]?.autoSellState).toBe(0);
  });

  it("⑥ 세션이 없던 사용자 → acquireOn 이 새 세션(LoginReq 1) · Ready 뒤 같은 순서 · sessionCreated true · release 1", async () => {
    gw.respondLimitChaserList([on(ISIN1, A)]);
    const releaseSpy = vi.spyOn(m, "release");

    const result = await sweeper().sweep({ userId: U2, serverKey: "KB120", broker: "KB", accountNos: [A] }, CREDS);

    expect(result).toEqual({ ok: true, disabledLimitChasers: 1, viDisabled: 0, sessionCreated: true });
    expect(received.filter((r) => r.msgType === MSG.LoginReq)).toHaveLength(1);
    expect(sweepTypes()).toEqual([
      MSG.GetLimitChaserListReq,
      MSG.GetVITriggerReq,
      MSG.GetVITriggerReq,
      MSG.DisableStrategiesReq,
      MSG.GetLimitChaserListReq,
      MSG.GetVITriggerReq,
      MSG.GetVITriggerReq,
    ]);
    expect(releaseSpy).toHaveBeenCalledTimes(1);
    expect(releaseSpy).toHaveBeenCalledWith(U2, "KB120");
  });

  it("⑦ 켜진 전략 0 · VI 미등록(두 거래소 빈 61) → 14 · 11 0건 · ok 0 0 · 21 은 두 거래소", async () => {
    await readySessionOf(U1);
    gw.respondLimitChaserList([off(ISIN1, A), on(ISIN2, B)]);

    const result = await sweeper().sweep({ userId: U1, serverKey: "KB120", broker: "KB", accountNos: [A] }, CREDS);

    expect(result).toEqual({ ok: true, disabledLimitChasers: 0, viDisabled: 0, sessionCreated: false });
    expect(sweepTypes()).toEqual([
      MSG.GetLimitChaserListReq,
      MSG.GetVITriggerReq,
      MSG.GetVITriggerReq,
      MSG.GetLimitChaserListReq,
      MSG.GetVITriggerReq,
      MSG.GetVITriggerReq,
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

    expect(result).toEqual({ ok: true, disabledLimitChasers: 2, viDisabled: 1, sessionCreated: false });
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
