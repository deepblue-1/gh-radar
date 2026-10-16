/**
 * Phase 29 Plan 20 — D-18 다중 세션 병합 규칙을 프레임별로 고정한다 (`SubscriptionHub` 단위).
 *
 * 한 사용자가 KB 세션(KB120)과 교보 세션(KYOBO119)을 함께 가진다. hub 는 세션 소유 키(`${userId}|${serverKey}`)로 결선하고:
 *   - **병합** — 주문 · 계좌(66/67) · 상따(64/60) · 83 진행률: 한 세션의 스냅샷 교체는 그 세션 몫 항목만 바꾼다(상대 세션 보존).
 *   - **primary 전용** — VI(61 · 72/73 · 56) · 사용자 설정(84) · 돌파 집합(76/78) · 예약 창(77): primary 세션(KB, 없으면
 *     처음 결선된 세션)만 원천이고, 그 밖 세션의 같은 프레임은 캐시 0 · 팬아웃 0 · debug 로그 1.
 *   - **세션 몫 교체/정리** — 같은 소유 키의 세션 재생성은 그 세션 몫 캐시만 버리고, KB 세션이 사라지면 교보가 primary 가 돼
 *     옛 KB 몫 사용자 단위 캐시는 정리된다.
 *
 * 세션은 `hub.test.ts` 와 같은 가짜 객체다(프레임은 수신 화이트리스트 파서를 거친다). 단일 세션 규칙은 `hub.test.ts` ·
 * `strategy-hub.test.ts` 가 그대로 지킨다 — 단일 세션은 「세션 1개짜리 병합」 이다.
 *
 * Phase 29-35 (G-1) — 같은 증권사 두 서버(KB120 · KB121) 세션이 함께 결선되고(옛 D-10 「같은 증권사 다른 서버 = 대체」 삭제),
 * 병합 프레임(66/67 · 60/64 · 83)은 그 세션 소유 뷰(`allowedAccounts`) 계좌만 캐시 · 팬아웃한다(gh-trade-84 ② · (나)).
 */
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as flatbuffers from "flatbuffers";
import type { RelayAccount, RelayOutbound } from "@gh-radar/shared";

import {
  HUB_ALL_STOP_COLLECT_MS,
  HUB_DISABLE_SENDER_MAX_AGE_MS,
  HUB_LEASE_DRAIN_MS,
  SubscriptionHub,
  ownerKey,
  type HubFanoutEvent,
  type HubSession,
} from "../src/hub/subscription-hub.js";
import { MSG } from "../src/dma/msg-type.js";
import { resetDroppedEnvelopeCount, tryParseEnvelope } from "../src/dma/envelope.js";
import { Envelope } from "../src/generated/stock-dma/envelope.js";
import type { TransportFrameEvent } from "../src/dma/dma-client.js";
import { readGetVITriggerExchange } from "./helpers/fake-gateway.js";
import {
  SAMPLE_ISIN,
  buildAccountStateFrame,
  buildDisableStrategiesRespFrame,
  buildLimitChaserListRespFrame,
  buildOrderRespFrame,
  buildQueueProgressFrame,
  buildQueuedWindowStateFrame,
  buildRateCrossAlertFrame,
  buildRateCrossSnapshotFrame,
  buildSetLimitChaserRespFrame,
  buildSetVITriggerRespFrame,
  buildUserSettingsFrame,
  buildViOrderListFrame,
  buildViOrderNoticeFrame,
} from "./helpers/frames.js";
import { logger } from "../src/logger.js";

const U = "3f1c2b7a-9d40-4a11-8e55-0000000020b1";
/** KB 계좌(A1) · 교보 계좌(B1) — 같은 계좌번호 두 증권사는 다루지 않는다(29-20 가정). */
const A1 = "1234567801";
const B1 = "7777777701";

/** `HubSession` 최소 구현 — 서버 키 · 증권사를 가진다(29-20). 보낸 요청은 msg_type 만 쌓는다. */
class FakeBrokerSession extends EventEmitter implements HubSession {
  readonly sentTypes: number[] = [];
  isReady = true;

  constructor(
    readonly userId: string,
    readonly serverKey: string,
    readonly broker: string,
    readonly allowedAccounts: RelayAccount[],
  ) {
    super();
  }

  send(payload: Uint8Array): boolean {
    this.sentTypes.push(Envelope.getRootAsEnvelope(new flatbuffers.ByteBuffer(payload)).msgType());
    return true;
  }

  pushFrame(payload: Uint8Array): void {
    const parsed = tryParseEnvelope(Buffer.from(payload));
    if (parsed === null) throw new Error("테스트 프레임이 수신 화이트리스트를 통과하지 못했습니다");
    const event: TransportFrameEvent = { ...parsed, generation: 1 };
    this.emit("frame", event);
  }

  emitReady(): void {
    this.isReady = true;
    this.emit("ready", { generation: 1, accounts: this.allowedAccounts });
  }
}

const kbSession = (): FakeBrokerSession => new FakeBrokerSession(U, "KB120", "KB", [{ accountNo: A1, name: "KB 위탁" }]);
const kyoboSession = (): FakeBrokerSession =>
  new FakeBrokerSession(U, "KYOBO119", "KYOBO", [{ accountNo: B1, name: "교보 위탁" }]);

describe("SubscriptionHub — D-18 다중 세션 병합 규칙 (29-20)", () => {
  let hub: SubscriptionHub;
  let fanned: HubFanoutEvent[];
  let kb: FakeBrokerSession;
  let ky: FakeBrokerSession;

  /** 그 사용자에게 나간 프레임 중 t 가 일치하는 것. */
  function framesOf<T extends RelayOutbound["t"]>(t: T): Extract<RelayOutbound, { t: T }>[] {
    return fanned
      .filter((e) => e.userId === U && e.msg.t === t)
      .map((e) => e.msg as Extract<RelayOutbound, { t: T }>);
  }

  beforeEach(() => {
    resetDroppedEnvelopeCount();
    hub = new SubscriptionHub();
    fanned = [];
    hub.on("fanout", (e: HubFanoutEvent) => fanned.push(e));
    kb = kbSession();
    ky = kyoboSession();
    hub.attach(kb);
    hub.attach(ky);
  });

  afterEach(() => {
    hub.closeAll();
    vi.restoreAllMocks();
  });

  it("ownerKey 는 `${userId}|${serverKey}` — 두 세션이 각자 결선된다(교보 결선이 KB 를 교체하지 않는다)", () => {
    expect(ownerKey(U, "KB120")).toBe(`${U}|KB120`);
    expect(hub.stats().sessionCount).toBe(2);
  });

  describe("병합 — 상따 64/60", () => {
    it("64 는 그 세션 몫만 전량 교체 · 조회와 lc.snap 은 합집합 · 빈 64 는 그 세션 항목만 지운다", () => {
      kb.pushFrame(buildLimitChaserListRespFrame([{ isin: SAMPLE_ISIN, accountNo: A1 }]));
      ky.pushFrame(buildLimitChaserListRespFrame([{ isin: SAMPLE_ISIN, accountNo: B1 }]));
      expect(
        hub
          .getLimitChasers(U)
          .map((i) => i.accountNo)
          .sort(),
      ).toEqual([A1, B1]);

      // 64 수신마다 lc.snap(합집합) 팬아웃.
      const snaps = framesOf("lc.snap");
      expect(snaps).toHaveLength(2);
      expect(snaps[0]?.items.map((i) => i.accountNo)).toEqual([A1]);
      expect(snaps[1]?.items.map((i) => i.accountNo).sort()).toEqual([A1, B1]);

      // KB 빈 64 → A1 전략만 사라지고 B1 유지.
      kb.pushFrame(buildLimitChaserListRespFrame([]));
      expect(hub.getLimitChasers(U).map((i) => i.accountNo)).toEqual([B1]);
      expect(framesOf("lc.snap").at(-1)?.items.map((i) => i.accountNo)).toEqual([B1]);
    });

    it("hasLimitChaserList 는 어느 세션이든 64 를 받았으면 true", () => {
      expect(hub.hasLimitChaserList(U)).toBe(false);
      ky.pushFrame(buildLimitChaserListRespFrame([]));
      expect(hub.hasLimitChaserList(U)).toBe(true);
    });

    it("60 에코는 그 세션 몫 upsert/삭제 — 상대 세션 항목 보존", () => {
      kb.pushFrame(buildLimitChaserListRespFrame([{ isin: SAMPLE_ISIN, accountNo: A1 }]));
      ky.pushFrame(buildSetLimitChaserRespFrame({ isin: SAMPLE_ISIN, accountNo: B1 }));
      expect(
        hub
          .getLimitChasers(U)
          .map((i) => i.accountNo)
          .sort(),
      ).toEqual([A1, B1]);
      // 교보 세션의 64(빈) 는 교보 몫만 비운다 — 60 으로 들어온 B1 이 사라지고 A1 은 남는다.
      ky.pushFrame(buildLimitChaserListRespFrame([]));
      expect(hub.getLimitChasers(U).map((i) => i.accountNo)).toEqual([A1]);
    });
  });

  describe("병합 — 계좌 66/67 · 세션 몫 교체", () => {
    it("교보 세션 재생성(같은 소유 키 다른 객체) → B1 캐시만 비고 A1 · KB 상따 · VI 는 유지", () => {
      kb.pushFrame(buildAccountStateFrame({ accountNo: A1, holdings: [{ isin: SAMPLE_ISIN, stockQty: 3 }] }));
      ky.pushFrame(buildAccountStateFrame({ accountNo: B1, holdings: [{ isin: SAMPLE_ISIN, stockQty: 7 }] }));
      ky.pushFrame(buildAccountStateFrame({ accountNo: B1, snapshot: false, holdings: [{ isin: SAMPLE_ISIN, stockQty: 8 }] }));
      kb.pushFrame(buildLimitChaserListRespFrame([{ isin: SAMPLE_ISIN, accountNo: A1 }]));
      kb.pushFrame(buildSetVITriggerRespFrame({ accountNo: A1, exchange: "KRX" }));
      expect(
        hub
          .getAccountStates(U)
          .map((s) => s.a)
          .sort(),
      ).toEqual([A1, B1]);
      expect(hub.getAccountStates(U).find((s) => s.a === B1)?.hold[0]?.qty).toBe(8);

      const reborn = kyoboSession();
      hub.attach(reborn);
      expect(hub.getAccountStates(U).map((s) => s.a)).toEqual([A1]);
      expect(hub.getLimitChasers(U).map((i) => i.accountNo)).toEqual([A1]);
      expect(hub.hasLimitChaserList(U)).toBe(true);
      expect(hub.getViTrigger(U, "KRX")).not.toBeUndefined();
      expect(hub.stats().sessionCount).toBe(2);

      // 옛 교보 객체의 늦은 프레임은 침묵한다.
      ky.pushFrame(buildAccountStateFrame({ accountNo: B1 }));
      expect(hub.getAccountStates(U).map((s) => s.a)).toEqual([A1]);
      reborn.pushFrame(buildAccountStateFrame({ accountNo: B1 }));
      expect(
        hub
          .getAccountStates(U)
          .map((s) => s.a)
          .sort(),
      ).toEqual([A1, B1]);
    });

    it("KB 세션 재생성(primary) → KB 몫 계좌 · 상따 · 사용자 단위 원천이 비고 교보 몫은 유지", () => {
      kb.pushFrame(buildAccountStateFrame({ accountNo: A1 }));
      ky.pushFrame(buildAccountStateFrame({ accountNo: B1 }));
      ky.pushFrame(buildLimitChaserListRespFrame([{ isin: SAMPLE_ISIN, accountNo: B1 }]));
      kb.pushFrame(buildUserSettingsFrame({ present: true }));

      hub.attach(kbSession());
      expect(hub.getAccountStates(U).map((s) => s.a)).toEqual([B1]);
      expect(hub.getLimitChasers(U).map((i) => i.accountNo)).toEqual([B1]);
      expect(hub.getUserSettings(U)).toBeUndefined();
    });
  });

  describe("병합 — 83 잔량진행률", () => {
    it("각 세션 83 은 그 세션 허용 계좌로만 거른다 · 조회는 합집합 · 한 세션 교체가 다른 세션 항목을 지우지 않는다", () => {
      // 교보 세션 83 에 A1(KB 계좌) 항목이 섞여 와도 교보 허용 계좌가 아니라 버린다.
      ky.pushFrame(
        buildQueueProgressFrame({
          exchange: "KRX",
          items: [
            { orderNo: "B-1", accountNo: B1 },
            { orderNo: "A-x", accountNo: A1 },
          ],
        }),
      );
      kb.pushFrame(buildQueueProgressFrame({ exchange: "KRX", items: [{ orderNo: "A-1", accountNo: A1 }] }));

      const entries = hub.getQueueProgressEntries(U);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.items.map((i) => i.orderNo).sort()).toEqual(["A-1", "B-1"]);

      // 라이브 팬아웃도 그 (isin, exchange) 의 합집합이다(브라우저는 키 전량 교체).
      const live = framesOf("unf.progress").filter((m) => m.snap === false);
      expect(live.at(-1)?.snap === false ? live.at(-1)?.items.map((i) => i.orderNo).sort() : null).toEqual(["A-1", "B-1"]);

      // KB 세션의 같은 키 빈 83 — KB 몫만 지운다. 팬아웃은 남은 합집합(교보 B-1).
      kb.pushFrame(buildQueueProgressFrame({ exchange: "KRX", items: [] }));
      expect(hub.getQueueProgressEntries(U)[0]?.items.map((i) => i.orderNo)).toEqual(["B-1"]);
      const after = framesOf("unf.progress").at(-1);
      expect(after?.snap === false ? after.items.map((i) => i.orderNo) : null).toEqual(["B-1"]);
    });

    it("교보 세션 재생성은 교보 몫 진행률만 비우고, 초기화 스냅은 남은 합집합(KB 몫)을 싣는다", () => {
      kb.pushFrame(buildQueueProgressFrame({ exchange: "KRX", items: [{ orderNo: "A-1", accountNo: A1 }] }));
      ky.pushFrame(buildQueueProgressFrame({ exchange: "NXT", items: [{ orderNo: "B-1", accountNo: B1 }] }));

      hub.attach(kyoboSession());
      const snap = framesOf("unf.progress").at(-1);
      expect(snap?.snap).toBe(true);
      expect(snap?.snap === true ? snap.entries.map((e) => e.x) : null).toEqual(["KRX"]);
      expect(hub.getQueueProgressEntries(U).map((e) => e.x)).toEqual(["KRX"]);
    });
  });

  describe("primary 전용 — VI 61 · 72/73 · 84 · 76/78 · 77", () => {
    it("KB(primary) 세션 프레임은 캐시 · 팬아웃된다", () => {
      kb.pushFrame(buildSetVITriggerRespFrame({ accountNo: A1, exchange: "KRX" }));
      kb.pushFrame(buildUserSettingsFrame({ present: true, preBuyAmount: 1_000_000 }));
      kb.pushFrame(buildRateCrossSnapshotFrame([{ isin: SAMPLE_ISIN }]));
      kb.pushFrame(buildRateCrossAlertFrame({ isin: SAMPLE_ISIN }));
      kb.pushFrame(buildQueuedWindowStateFrame({ open: true, maxPieces: 3 }));
      kb.pushFrame(buildViOrderListFrame([{ orderNo: "V-1", accountNo: A1 }], true));

      expect(hub.getViTrigger(U, "KRX")).not.toBeUndefined();
      expect(hub.getUserSettings(U)).toMatchObject({ present: true });
      expect(hub.getRateCrossItems(U)).toHaveLength(1);
      expect(hub.getQueuedWindow(U)).toMatchObject({ open: true, maxPieces: 3 });
      expect(hub.getViOrders(U)).toHaveLength(1);
      expect(framesOf("vi")).toHaveLength(1);
      expect(framesOf("user.settings")).toHaveLength(1);
      expect(framesOf("rate.cross.snap")).toHaveLength(1);
      expect(framesOf("rate.cross")).toHaveLength(1);
      expect(framesOf("queued.window")).toHaveLength(1);
      expect(framesOf("vi.list")).toHaveLength(1);
    });

    it("교보(primary 아님) 세션의 같은 프레임은 캐시 0 · 팬아웃 0 · 프레임마다 debug 로그 1 · default 계수 0", () => {
      const debugs: unknown[][] = [];
      vi.spyOn(logger, "debug").mockImplementation(((...args: unknown[]) => {
        debugs.push(args);
      }) as never);

      ky.pushFrame(buildSetVITriggerRespFrame({ accountNo: B1, exchange: "KRX" }));
      ky.pushFrame(buildUserSettingsFrame({ present: true }));
      ky.pushFrame(buildRateCrossSnapshotFrame([{ isin: SAMPLE_ISIN }]));
      ky.pushFrame(buildRateCrossAlertFrame({ isin: SAMPLE_ISIN }));
      ky.pushFrame(buildQueuedWindowStateFrame({ open: true }));
      ky.pushFrame(buildViOrderListFrame([{ orderNo: "V-9", accountNo: B1 }], true));

      expect(hub.getViTrigger(U, "KRX")).toBeUndefined();
      expect(hub.getUserSettings(U)).toBeUndefined();
      expect(hub.getRateCrossItems(U)).toEqual([]);
      expect(hub.getQueuedWindow(U)).toBeUndefined();
      expect(hub.getViOrders(U)).toEqual([]);
      expect(fanned.filter((e) => e.userId === U)).toEqual([]);

      const drops = debugs.filter((c) => typeof c[1] === "string" && c[1].includes("primary 아닌 세션"));
      expect(drops).toHaveLength(6);
      expect(drops.map((c) => (c[0] as { msgType: number }).msgType)).toEqual([
        MSG.SetVITriggerResp,
        MSG.UserSettingsResp,
        MSG.RateCrossSnapshot,
        MSG.RateCrossAlert,
        MSG.QueuedWindowState,
        MSG.GetVIOrderListResp,
      ]);
      expect(hub.unhandledFrameCount()).toBe(0);
    });

    it("KB 세션이 없는 사용자(교보만) → 교보가 primary 라 반영된다", () => {
      const solo = new SubscriptionHub();
      const events: HubFanoutEvent[] = [];
      solo.on("fanout", (e: HubFanoutEvent) => events.push(e));
      const only = new FakeBrokerSession("solo-user", "KYOBO119", "KYOBO", [{ accountNo: B1, name: "교보" }]);
      solo.attach(only);
      only.pushFrame(buildUserSettingsFrame({ present: true }));
      only.pushFrame(buildSetVITriggerRespFrame({ accountNo: B1, exchange: "NXT" }));
      expect(solo.getUserSettings("solo-user")).toMatchObject({ present: true });
      expect(solo.getViTrigger("solo-user", "NXT")).not.toBeUndefined();
      expect(events.map((e) => e.msg.t)).toEqual(["user.settings", "vi"]);
      solo.closeAll();
    });

    it("Ready 프리페치 — 24 · 25 는 세션마다, 21 · 34 · 43 은 primary 만", () => {
      kb.emitReady();
      ky.emitReady();
      expect(kb.sentTypes).toEqual([
        MSG.GetAccountStateReq,
        MSG.GetLimitChaserListReq,
        MSG.GetVITriggerReq,
        MSG.GetVITriggerReq,
        MSG.GetVIOrderListReq,
        MSG.GetUserSettingsReq,
      ]);
      expect(ky.sentTypes).toEqual([MSG.GetAccountStateReq, MSG.GetLimitChaserListReq]);
    });
  });

  describe("primary 변경 — KB 세션이 사라지면 교보가 primary", () => {
    it("KB 분리 → primary = 교보 · 옛 KB 몫 VI · 84 · 계좌 정리 · Ready 교보로 21 · 34 · 43 요청", () => {
      kb.pushFrame(buildAccountStateFrame({ accountNo: A1 }));
      ky.pushFrame(buildAccountStateFrame({ accountNo: B1 }));
      kb.pushFrame(buildSetVITriggerRespFrame({ accountNo: A1, exchange: "KRX" }));
      kb.pushFrame(buildUserSettingsFrame({ present: true }));
      expect(hub.getViTrigger(U, "KRX")).not.toBeUndefined();

      hub.retainSessions(U, new Set(["KYOBO119"]));
      expect(hub.stats().sessionCount).toBe(1);
      expect(hub.getViTrigger(U, "KRX")).toBeUndefined();
      expect(hub.getUserSettings(U)).toBeUndefined();
      expect(hub.getAccountStates(U).map((s) => s.a)).toEqual([B1]);
      expect(ky.sentTypes).toEqual([
        MSG.GetVITriggerReq,
        MSG.GetVITriggerReq,
        MSG.GetVIOrderListReq,
        MSG.GetUserSettingsReq,
      ]);

      // 이제 교보 프레임이 사용자 단위 원천이다 · 떼어 낸 KB 의 늦은 프레임은 침묵한다.
      ky.pushFrame(buildUserSettingsFrame({ present: true, preBuyAmount: 7 }));
      kb.pushFrame(buildSetVITriggerRespFrame({ accountNo: A1, exchange: "NXT" }));
      expect(hub.getUserSettings(U)).toMatchObject({ present: true });
      expect(hub.getViTrigger(U, "NXT")).toBeUndefined();
    });

    it("교보만 있던 사용자에게 KB 가 결선되면 primary = KB · 교보 몫 사용자 단위 캐시는 정리", () => {
      const solo = new SubscriptionHub();
      const only = new FakeBrokerSession("solo-user", "KYOBO119", "KYOBO", [{ accountNo: B1, name: "교보" }]);
      solo.attach(only);
      only.pushFrame(buildUserSettingsFrame({ present: true }));
      expect(solo.getUserSettings("solo-user")).toBeDefined();

      const kbLate = new FakeBrokerSession("solo-user", "KB120", "KB", [{ accountNo: A1, name: "KB" }]);
      kbLate.isReady = false;
      solo.attach(kbLate);
      expect(solo.getUserSettings("solo-user")).toBeUndefined();
      // 교보 84 는 이제 primary 가 아니라 버린다.
      only.pushFrame(buildUserSettingsFrame({ present: true }));
      expect(solo.getUserSettings("solo-user")).toBeUndefined();
      kbLate.pushFrame(buildUserSettingsFrame({ present: true }));
      expect(solo.getUserSettings("solo-user")).toMatchObject({ present: true });
      solo.closeAll();
    });
  });
});

/**
 * Phase 29-35 (G-1 ④) — 같은 사용자의 KB120 · KB121 세션. 두 서버 users.toml 모두에 A · B 가 있지만 소유는 갈린다:
 * A → KB121(지정) · B → KB120(기본). 가짜 세션의 `allowedAccounts` 가 곧 소유 뷰다(`DmaSession` 29-33 과 같은 모양).
 */
describe("SubscriptionHub — G-1 같은 증권사 두 서버 · 계좌 소유 필터 (29-35)", () => {
  const A = "1234567801";
  const B = "1234567802";
  const ISIN2 = "KR7000660001";
  let hub: SubscriptionHub;
  let fanned: HubFanoutEvent[];
  let kb120: FakeBrokerSession;
  let kb121: FakeBrokerSession;

  function framesOf<T extends RelayOutbound["t"]>(t: T): Extract<RelayOutbound, { t: T }>[] {
    return fanned
      .filter((e) => e.userId === U && e.msg.t === t)
      .map((e) => e.msg as Extract<RelayOutbound, { t: T }>);
  }

  beforeEach(() => {
    resetDroppedEnvelopeCount();
    hub = new SubscriptionHub();
    fanned = [];
    hub.on("fanout", (e: HubFanoutEvent) => fanned.push(e));
    kb120 = new FakeBrokerSession(U, "KB120", "KB", [{ accountNo: B, name: "계좌B" }]);
    kb121 = new FakeBrokerSession(U, "KB121", "KB", [{ accountNo: A, name: "계좌A" }]);
  });

  afterEach(() => {
    hub.closeAll();
    vi.restoreAllMocks();
  });

  it("같은 증권사 두 세션 결선 공존 — KB121 결선이 KB120 을 대체하지 않는다 · retainSessions 로 뗀 서버 몫만 빈다", () => {
    hub.attach(kb120);
    kb120.pushFrame(buildAccountStateFrame({ accountNo: B, holdings: [{ isin: SAMPLE_ISIN, stockQty: 2 }] }));
    hub.attach(kb121);
    expect(hub.stats().sessionCount).toBe(2);
    // KB120 몫 캐시가 남는다(옛 「같은 증권사 다른 서버 대체」 였다면 여기서 비었다).
    expect(hub.getAccountStates(U).map((s) => s.a)).toEqual([B]);

    kb121.pushFrame(buildAccountStateFrame({ accountNo: A, holdings: [{ isin: SAMPLE_ISIN, stockQty: 5 }] }));
    // KB120 의 늦은 프레임도 침묵하지 않는다(결선 유지).
    kb120.pushFrame(buildAccountStateFrame({ accountNo: B, snapshot: false, holdings: [{ isin: SAMPLE_ISIN, stockQty: 3 }] }));
    expect(
      hub
        .getAccountStates(U)
        .map((s) => s.a)
        .sort(),
    ).toEqual([A, B]);
    expect(hub.getAccountStates(U).find((s) => s.a === B)?.hold[0]?.qty).toBe(3);

    hub.retainSessions(U, new Set(["KB121"]));
    expect(hub.stats().sessionCount).toBe(1);
    expect(hub.getAccountStates(U).map((s) => s.a)).toEqual([A]);
  });

  it("소유 필터 — KB120 이 보낸 A 의 66/67 · 60 · 64 항목은 캐시 0 · 브라우저 0, KB121 것만 간다 · B 는 반대", () => {
    hub.attach(kb120);
    hub.attach(kb121);

    // KB120(A 의 주문 서버 아님)이 A 프레임을 보낸다 — 전부 버린다.
    kb120.pushFrame(buildAccountStateFrame({ accountNo: A, holdings: [{ isin: SAMPLE_ISIN, stockQty: 99 }] }));
    kb120.pushFrame(buildAccountStateFrame({ accountNo: A, snapshot: false, holdings: [{ isin: SAMPLE_ISIN, stockQty: 98 }] }));
    kb120.pushFrame(buildSetLimitChaserRespFrame({ isin: SAMPLE_ISIN, accountNo: A }));
    expect(hub.getAccountStates(U)).toEqual([]);
    expect(hub.getLimitChasers(U)).toEqual([]);
    expect(framesOf("acct")).toEqual([]);
    expect(framesOf("lc")).toEqual([]);

    // KB121(A 의 주문 서버)의 A 는 간다.
    kb121.pushFrame(buildAccountStateFrame({ accountNo: A, holdings: [{ isin: SAMPLE_ISIN, stockQty: 5 }] }));
    kb121.pushFrame(buildSetLimitChaserRespFrame({ isin: SAMPLE_ISIN, accountNo: A }));
    expect(framesOf("acct").map((m) => [m.a, m.hold[0]?.qty])).toEqual([[A, 5]]);
    expect(framesOf("lc").map((m) => m.item.accountNo)).toEqual([A]);

    // B 는 반대 — KB121 의 B 는 버리고 KB120 의 B 는 간다.
    kb121.pushFrame(buildAccountStateFrame({ accountNo: B, holdings: [{ isin: SAMPLE_ISIN, stockQty: 77 }] }));
    kb121.pushFrame(buildSetLimitChaserRespFrame({ isin: ISIN2, accountNo: B }));
    kb120.pushFrame(buildAccountStateFrame({ accountNo: B, holdings: [{ isin: SAMPLE_ISIN, stockQty: 1 }] }));
    expect(framesOf("acct").map((m) => [m.a, m.hold[0]?.qty])).toEqual([
      [A, 5],
      [B, 1],
    ]);
    expect(framesOf("lc").map((m) => m.item.accountNo)).toEqual([A]);
    expect(hub.getAccountStates(U).find((s) => s.a === A)?.hold[0]?.qty).toBe(5);
    expect(hub.getAccountStates(U).find((s) => s.a === B)?.hold[0]?.qty).toBe(1);
    expect(hub.unhandledFrameCount()).toBe(0);
  });

  it("소유 필터 — 64 가 A · B 항목을 섞어 오면 그 세션 소유 항목만 그 세션 몫으로 교체된다", () => {
    hub.attach(kb120);
    hub.attach(kb121);
    kb120.pushFrame(
      buildLimitChaserListRespFrame([
        { isin: SAMPLE_ISIN, accountNo: B },
        { isin: ISIN2, accountNo: A },
      ]),
    );
    expect(hub.getLimitChasers(U).map((i) => i.accountNo)).toEqual([B]);
    expect(framesOf("lc.snap").at(-1)?.items.map((i) => i.accountNo)).toEqual([B]);
  });

  it("51 주문 통보는 와이어에 계좌 칸이 없어 소유 필터 밖 — 종전 「병합(통과)」 그대로", () => {
    hub.attach(kb120);
    hub.attach(kb121);
    kb120.pushFrame(buildOrderRespFrame({ orderNo: "N-120" }));
    kb121.pushFrame(buildOrderRespFrame({ orderNo: "N-121" }));
    expect(framesOf("order").map((m) => m.no)).toEqual(["N-120", "N-121"]);
  });

  it("(나) 83 item 단위 — 섞인 83 에서 소유 항목만 (프레임을 버리지 않고 항목을 거른다)", () => {
    hub.attach(kb120);
    hub.attach(kb121);
    kb120.pushFrame(
      buildQueueProgressFrame({
        exchange: "KRX",
        items: [
          { orderNo: "A-x", accountNo: A },
          { orderNo: "B-1", accountNo: B },
        ],
      }),
    );
    expect(hub.getQueueProgressEntries(U).map((e) => e.items.map((i) => i.orderNo))).toEqual([["B-1"]]);
    const live = framesOf("unf.progress").at(-1);
    expect(live?.snap === false ? live.items.map((i) => i.orderNo) : null).toEqual(["B-1"]);
  });

  it("(나) 빈 83 — 다른 서버 몫 항목 유지 · unf.progress 합집합", () => {
    hub.attach(kb120);
    hub.attach(kb121);
    kb121.pushFrame(buildQueueProgressFrame({ exchange: "KRX", items: [{ orderNo: "A-1", accountNo: A }] }));
    kb120.pushFrame(buildQueueProgressFrame({ exchange: "KRX", items: [{ orderNo: "B-1", accountNo: B }] }));
    expect(hub.getQueueProgressEntries(U)[0]?.items.map((i) => i.orderNo).sort()).toEqual(["A-1", "B-1"]);

    // KB120 의 빈 83(X, KRX) — KB120 몫(B-1)만 지운다. 브라우저 unf.progress 는 남은 합집합(KB121 몫 A-1).
    kb120.pushFrame(buildQueueProgressFrame({ exchange: "KRX", items: [] }));
    expect(hub.getQueueProgressEntries(U)[0]?.items.map((i) => i.orderNo)).toEqual(["A-1"]);
    const afterKb120 = framesOf("unf.progress").at(-1);
    expect(afterKb120?.snap === false ? [afterKb120.i, afterKb120.items.map((i) => i.orderNo)] : null).toEqual([
      SAMPLE_ISIN,
      ["A-1"],
    ]);

    // 반대 — KB120 몫을 다시 채우고 KB121 의 빈 83 → KB121 몫(A-1)만 지워진다.
    kb120.pushFrame(buildQueueProgressFrame({ exchange: "KRX", items: [{ orderNo: "B-1", accountNo: B }] }));
    kb121.pushFrame(buildQueueProgressFrame({ exchange: "KRX", items: [] }));
    expect(hub.getQueueProgressEntries(U)[0]?.items.map((i) => i.orderNo)).toEqual(["B-1"]);
    const afterKb121 = framesOf("unf.progress").at(-1);
    expect(afterKb121?.snap === false ? afterKb121.items.map((i) => i.orderNo) : null).toEqual(["B-1"]);
  });

  it("(나) 64 서버별 합침 — 한 서버 교체가 다른 서버 몫을 지우지 않음 · lc.snap 합집합", () => {
    hub.attach(kb120);
    hub.attach(kb121);
    kb120.pushFrame(
      buildLimitChaserListRespFrame([
        { isin: SAMPLE_ISIN, accountNo: B },
        { isin: ISIN2, accountNo: B },
      ]),
    );
    kb121.pushFrame(buildLimitChaserListRespFrame([{ isin: SAMPLE_ISIN, accountNo: A }]));
    // lc.snap = 두 서버 몫 합집합(소유 필터 뒤) · 순서는 세션 결선 순(KB120 몫 → KB121 몫).
    expect(framesOf("lc.snap").at(-1)?.items.map((i) => [i.accountNo, i.isin])).toEqual([
      [B, SAMPLE_ISIN],
      [B, ISIN2],
      [A, SAMPLE_ISIN],
    ]);

    // KB120 의 다음 64 = [B1] — KB120 몫만 교체된다. KB121 몫 A1 은 그대로.
    kb120.pushFrame(buildLimitChaserListRespFrame([{ isin: SAMPLE_ISIN, accountNo: B }]));
    expect(framesOf("lc.snap").at(-1)?.items.map((i) => [i.accountNo, i.isin])).toEqual([
      [B, SAMPLE_ISIN],
      [A, SAMPLE_ISIN],
    ]);
    expect(hub.getLimitChasers(U).map((i) => i.accountNo)).toEqual([B, A]);
  });
});

/**
 * Phase 29-35 Task 2 — primary = 주입된 선호 서버(운영 = KB 기본 주문 서버) 세션 → 첫 KB → 첫 세션. SessionManager · fanout 과 같은 주입.
 */
describe("SubscriptionHub — primary 선호 서버 (29-35)", () => {
  const A = "1234567801";
  const B = "1234567802";
  let preferred: string | undefined;
  let hub: SubscriptionHub;
  let fanned: HubFanoutEvent[];
  let kb120: FakeBrokerSession;
  let kb121: FakeBrokerSession;

  beforeEach(() => {
    resetDroppedEnvelopeCount();
    preferred = "KB120";
    hub = new SubscriptionHub({ preferredPrimaryServerKey: () => preferred });
    fanned = [];
    hub.on("fanout", (e: HubFanoutEvent) => fanned.push(e));
    kb120 = new FakeBrokerSession(U, "KB120", "KB", [{ accountNo: B, name: "계좌B" }]);
    kb121 = new FakeBrokerSession(U, "KB121", "KB", [{ accountNo: A, name: "계좌A" }]);
  });

  afterEach(() => {
    hub.closeAll();
    vi.restoreAllMocks();
  });

  it("생성 순서와 무관하게 primary = KB 기본 주문 서버 세션 — KB121 먼저 결선해도 43 은 KB120 으로만 · 21 · 34 는 KB 세션 각각 · VI 61 은 소유 뷰 안이면 그 세션 것도 원천 (GC-05)", () => {
    // 결선 시점에는 둘 다 아직 Ready 전이다(처음 결선 — Ready 프리페치는 곧 오는 `ready` 가 한다).
    kb121.isReady = false;
    kb120.isReady = false;
    hub.attach(kb121);
    hub.attach(kb120);
    kb121.emitReady();
    kb120.emitReady();
    expect(kb120.sentTypes).toEqual([
      MSG.GetAccountStateReq,
      MSG.GetLimitChaserListReq,
      MSG.GetVITriggerReq,
      MSG.GetVITriggerReq,
      MSG.GetVIOrderListReq,
      MSG.GetUserSettingsReq,
    ]);
    // 29-51 (GC-05) — VI 원천은 사용자의 KB 세션 각각이다(21 · 34). 43(사용자 설정)은 primary 그대로.
    expect(kb121.sentTypes).toEqual([
      MSG.GetAccountStateReq,
      MSG.GetLimitChaserListReq,
      MSG.GetVITriggerReq,
      MSG.GetVITriggerReq,
      MSG.GetVIOrderListReq,
    ]);

    // 소유 뷰 안 61 은 그 세션 것도 원천(KB121 의 A) · 소유 뷰 밖(KB121 의 B)은 여전히 0.
    kb121.pushFrame(buildSetVITriggerRespFrame({ accountNo: B, exchange: "KRX", run: true }));
    kb121.pushFrame(buildSetVITriggerRespFrame({ accountNo: A, exchange: "NXT" }));
    kb120.pushFrame(buildSetVITriggerRespFrame({ accountNo: B, exchange: "KRX" }));
    expect(hub.getViTrigger(U, "NXT")).toMatchObject({ accountNo: A });
    expect(hub.getViTrigger(U, "KRX")).toMatchObject({ accountNo: B });
    expect(
      fanned
        .filter((e) => e.msg.t === "vi")
        .map((e) => (e.msg.t === "vi" ? [e.msg.x, e.msg.cfg?.accountNo] : null)),
    ).toEqual([
      ["NXT", A],
      ["KRX", B],
    ]);
  });

  it("KB 기본 서버 세션이 없으면(계좌 전부 KB121 지정) primary = KB121", () => {
    hub.attach(kb121);
    kb121.pushFrame(buildUserSettingsFrame({ present: true }));
    expect(hub.getUserSettings(U)).toMatchObject({ present: true });
  });

  it("선호 주입이 없으면 종전 — 처음 결선된 KB 세션(KB121)", () => {
    const plain = new SubscriptionHub();
    plain.attach(kb121);
    plain.attach(kb120);
    kb121.pushFrame(buildUserSettingsFrame({ present: true }));
    kb120.pushFrame(buildUserSettingsFrame({ present: false }));
    expect(plain.getUserSettings(U)).toMatchObject({ present: true });
    plain.closeAll();
  });

  it("기본 서버가 바뀌면 다음 결선(retainSessions)에서 primary 교체 — 옛 primary 몫 사용자 단위 캐시 정리 · 새 primary 로 43 (VI 는 두 KB 세션 모두 원천이라 유지 · GC-05)", () => {
    hub.attach(kb120);
    hub.attach(kb121);
    kb120.pushFrame(buildUserSettingsFrame({ present: true }));
    kb121.pushFrame(buildSetVITriggerRespFrame({ accountNo: A, exchange: "KRX", run: true }));
    expect(hub.getUserSettings(U)).toMatchObject({ present: true });
    expect(hub.getViTrigger(U, "KRX")).toMatchObject({ accountNo: A });
    kb121.sentTypes.length = 0;

    preferred = "KB121";
    hub.retainSessions(U, new Set(["KB120", "KB121"]));
    expect(hub.stats().sessionCount).toBe(2);
    expect(hub.getUserSettings(U)).toBeUndefined();
    // 29-51 (GC-05) — primary 교체는 primary 몫(43 · 84 · 76/78 · 77)만이다. VI 원천(KB 세션 각각)은 그대로라 21 · 34 재요청 0 ·
    // VI 캐시 유지.
    expect(kb121.sentTypes).toEqual([MSG.GetUserSettingsReq]);
    expect(hub.getViTrigger(U, "KRX")).toMatchObject({ accountNo: A });
    kb121.pushFrame(buildUserSettingsFrame({ present: true }));
    expect(hub.getUserSettings(U)).toMatchObject({ present: true });
  });
});

/**
 * Phase 29-49 Task 2 — sweep 대여(GC-03 · GC-04 hub 쪽). sweeper 가 hub 가 듣는 세션을 쓰는 동안 그 세션의 미해결 21 은 늘 한 주인의
 * 것이다: 대여 전에 hub 가 보낸 21 은 그 61 이 다 오거나 5초가 지날 때까지 대여를 미루고(넘으면 hub 대기열을 비우고 반납 때 다시 요청),
 * Ready 앞 대여는 hub 프리페치 21 을 반납까지 미룬다. 결선 안 된 세션 대여는 무동작이고, 교체 · 분리 · closeAll 은 표식을 정리한다.
 */
describe("SubscriptionHub — sweep 대여 (29-49 · GC-03 · GC-04)", () => {
  const A = "1234567801";
  const B = "1234567802";

  /** 21 의 요청 거래소까지 쌓는 가짜 세션. */
  class LeaseSession extends FakeBrokerSession {
    readonly viGets: string[] = [];

    override send(payload: Uint8Array): boolean {
      const env = Envelope.getRootAsEnvelope(new flatbuffers.ByteBuffer(payload));
      if (env.msgType() === MSG.GetVITriggerReq) {
        this.viGets.push(readGetVITriggerExchange(MSG.GetVITriggerReq, Buffer.from(payload)) ?? "<bare>");
      }
      return super.send(payload);
    }
  }

  let hub: SubscriptionHub;
  let fanned: HubFanoutEvent[];
  let kb120: LeaseSession;
  let kb121: LeaseSession;

  function framesOf<T extends RelayOutbound["t"]>(t: T): Extract<RelayOutbound, { t: T }>[] {
    return fanned
      .filter((e) => e.userId === U && e.msg.t === t)
      .map((e) => e.msg as Extract<RelayOutbound, { t: T }>);
  }

  /** 프로미스 해결 여부를 동기적으로 들여다본다. */
  function track<T>(p: Promise<T>): { done: boolean; value: T | undefined } {
    const st: { done: boolean; value: T | undefined } = { done: false, value: undefined };
    void p.then((v) => {
      st.done = true;
      st.value = v;
    });
    return st;
  }

  async function flush(): Promise<void> {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  }

  const empty61 = () => buildSetVITriggerRespFrame(null);
  const disable65 = () => buildDisableStrategiesRespFrame({ disabledCount: 1, viDisabled: false });

  /** KB120 을 Ready 로 결선해 Ready 프리페치(21 KRX · NXT)를 보낸 직후(61 아직) 상태를 만든다. */
  function primaryPrefetched(): void {
    kb120.isReady = false;
    hub.attach(kb120);
    kb120.emitReady();
    expect(kb120.viGets).toEqual(["KRX", "NXT"]);
    kb120.viGets.length = 0;
    kb120.sentTypes.length = 0;
  }

  beforeEach(() => {
    resetDroppedEnvelopeCount();
    hub = new SubscriptionHub({ preferredPrimaryServerKey: () => "KB120" });
    fanned = [];
    hub.on("fanout", (e: HubFanoutEvent) => fanned.push(e));
    kb120 = new LeaseSession(U, "KB120", "KB", [{ accountNo: B, name: "계좌B" }]);
    kb121 = new LeaseSession(U, "KB121", "KB", [{ accountNo: A, name: "계좌A" }]);
  });

  afterEach(() => {
    hub.closeAll();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("GC-04 배수 뒤 해결 — hub 의 21 두 개가 미해결이면 대여는 그 61 이 다 올 때까지 미해결 · 빈 61 은 KRX · NXT 순 귀속(종전) · 그 뒤 sweeper 의 빈 61 은 귀속 0 · 반납 때 재요청 0", async () => {
    primaryPrefetched();
    const lease = track(hub.lendSession(kb120));
    await flush();
    expect(lease.done).toBe(false);

    kb120.pushFrame(empty61());
    await flush();
    expect(lease.done).toBe(false);
    kb120.pushFrame(empty61());
    await flush();
    expect(lease.done).toBe(true);
    expect(framesOf("vi")).toEqual([
      { t: "vi", x: "KRX", cfg: null },
      { t: "vi", x: "NXT", cfg: null },
    ]);

    // 대여 중 — sweeper 의 빈 61(21 답)은 hub 대기열 머리로 귀속하지 않는다 · 65 는 팬아웃하지 않는다.
    kb120.pushFrame(empty61());
    kb120.pushFrame(disable65());
    expect(framesOf("vi")).toHaveLength(2);
    expect(framesOf("strategies.disabled")).toHaveLength(0);
    // 본문 있는 61 은 서버 사실 — 대여 중에도 캐시 · 팬아웃.
    kb120.pushFrame(buildSetVITriggerRespFrame({ accountNo: B, exchange: "NXT", run: false }));
    expect(framesOf("vi").at(-1)).toMatchObject({ x: "NXT", cfg: { run: false } });

    lease.value?.release();
    expect(kb120.viGets).toEqual([]);
    // 반납 뒤 65 는 종전대로 팬아웃.
    kb120.pushFrame(disable65());
    expect(framesOf("strategies.disabled")).toHaveLength(1);
  });

  it("GC-04 5초 상한 — 61 이 오지 않으면 HUB_LEASE_DRAIN_MS 뒤 해결 · hub 대기열 비움 · warn 1줄 · 반납 때 21 두 거래소 재요청 → 빈 61 이 각 거래소에 귀속", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const warns: unknown[][] = [];
    vi.spyOn(logger, "warn").mockImplementation(((...args: unknown[]) => {
      warns.push(args);
    }) as never);
    primaryPrefetched();

    const lease = track(hub.lendSession(kb120));
    await vi.advanceTimersByTimeAsync(HUB_LEASE_DRAIN_MS - 1);
    expect(lease.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(lease.done).toBe(true);
    const mine = warns.filter((w) => String(w[1]).includes("대여"));
    expect(mine).toHaveLength(1);
    expect(mine[0]?.[0]).toEqual({ userId: U, serverKey: "KB120", remaining: 2 });

    // 대여 중 늦게 온 hub 의 빈 61 · sweeper 의 빈 61 — 비운 대기열이라 귀속 0.
    kb120.pushFrame(empty61());
    expect(framesOf("vi")).toHaveLength(0);

    lease.value?.release();
    expect(kb120.viGets).toEqual(["KRX", "NXT"]);
    kb120.pushFrame(empty61());
    kb120.pushFrame(empty61());
    expect(framesOf("vi")).toEqual([
      { t: "vi", x: "KRX", cfg: null },
      { t: "vi", x: "NXT", cfg: null },
    ]);
  });

  it("GC-04 Ready 앞 대여 — Ready 에서 hub 는 25 · 24 · 34 · 43 만(21 미룸) · 대여 중 빈 61 · 65 억제 · 반납 때 21(KRX → NXT) → 빈 61 이 각 거래소에 귀속", async () => {
    kb120.isReady = false;
    hub.attach(kb120);
    const lease = track(hub.lendSession(kb120));
    await flush();
    expect(lease.done).toBe(true);

    kb120.emitReady();
    expect(kb120.sentTypes).toEqual([
      MSG.GetAccountStateReq,
      MSG.GetLimitChaserListReq,
      MSG.GetVIOrderListReq,
      MSG.GetUserSettingsReq,
    ]);
    expect(kb120.viGets).toEqual([]);
    kb120.pushFrame(empty61());
    kb120.pushFrame(disable65());
    expect(framesOf("vi")).toHaveLength(0);
    expect(framesOf("strategies.disabled")).toHaveLength(0);

    lease.value?.release();
    expect(kb120.viGets).toEqual(["KRX", "NXT"]);
    kb120.pushFrame(empty61());
    kb120.pushFrame(empty61());
    expect(framesOf("vi")).toEqual([
      { t: "vi", x: "KRX", cfg: null },
      { t: "vi", x: "NXT", cfg: null },
    ]);
    // 두 번째 반납은 무동작(멱등).
    lease.value?.release();
    expect(kb120.viGets).toEqual(["KRX", "NXT"]);
  });

  it("GC-04 결선 안 된 세션 무동작 — attach 안 한 객체의 대여는 즉시 해결 · 결선 세션 표식 0(65 종전 팬아웃) · 반납 무동작", async () => {
    hub.attach(kb120);
    const stray = new LeaseSession(U, "KB120", "KB", [{ accountNo: B, name: "계좌B" }]);
    const lease = track(hub.lendSession(stray));
    await flush();
    expect(lease.done).toBe(true);

    kb120.pushFrame(disable65());
    expect(framesOf("strategies.disabled")).toHaveLength(1);
    lease.value?.release();
    expect(stray.sentTypes).toEqual([]);
    expect(kb120.sentTypes).toEqual([]);
  });

  it("GC-04 primary 아닌 세션 대여 — KB121 의 65 억제 · KB120(primary)의 65 는 종전 팬아웃 · primary 의 21 · 61 귀속 무영향 · 반납 때 21 0", async () => {
    primaryPrefetched();
    hub.attach(kb121);
    const lease = track(hub.lendSession(kb121));
    await flush();
    expect(lease.done).toBe(true); // primary 아님 — hub 의 21 은 KB120 몫이라 기다리지 않는다.

    kb120.pushFrame(empty61());
    kb120.pushFrame(empty61());
    expect(framesOf("vi")).toEqual([
      { t: "vi", x: "KRX", cfg: null },
      { t: "vi", x: "NXT", cfg: null },
    ]);
    kb121.pushFrame(disable65());
    expect(framesOf("strategies.disabled")).toHaveLength(0);
    kb120.pushFrame(disable65());
    expect(framesOf("strategies.disabled")).toHaveLength(1);

    lease.value?.release();
    expect(kb120.viGets).toEqual([]);
    expect(kb121.viGets).toEqual([]);
  });

  it("GC-04 같은 세션의 두 번째 대여는 앞 대여 반납까지 미해결(방어)", async () => {
    hub.attach(kb120);
    const first = track(hub.lendSession(kb120));
    await flush();
    const second = track(hub.lendSession(kb120));
    await flush();
    expect(first.done).toBe(true);
    expect(second.done).toBe(false);

    first.value?.release();
    await flush();
    expect(second.done).toBe(true);
    // 두 번째 대여가 쥐고 있다 — 65 억제.
    kb120.pushFrame(disable65());
    expect(framesOf("strategies.disabled")).toHaveLength(0);
    second.value?.release();
    kb120.pushFrame(disable65());
    expect(framesOf("strategies.disabled")).toHaveLength(1);
  });

  it("GC-04 교체 · 분리 · closeAll 정리 — 대여 중 같은 소유 키 교체 · retainSessions 분리 · closeAll 이 표식을 지우고 반납은 옛 세션으로 21 을 보내지 않는다", async () => {
    // (1) 교체 — 대여 중 hub 가 21 을 미룬 뒤(사용자 단위 스냅샷 요청) 같은 소유 키의 새 세션이 결선된다.
    hub.attach(kb120);
    const replaced = await hub.lendSession(kb120);
    hub.requestStrategySnapshot(U);
    expect(kb120.viGets).toEqual([]);
    const kb120b = new LeaseSession(U, "KB120", "KB", [{ accountNo: B, name: "계좌B" }]);
    hub.attach(kb120b);
    kb120b.pushFrame(disable65());
    expect(framesOf("strategies.disabled")).toHaveLength(1); // 새 세션은 대여 아님
    replaced.release();
    expect(kb120.viGets).toEqual([]); // 옛 세션으로 21 을 보내지 않는다
    expect(kb120b.viGets).toEqual([]); // 새 세션 몫은 그 세션 Ready 가 한다

    // (2) 분리 — KB121 대여 중 retainSessions 로 떼어지면 표식이 지워진다(같은 객체가 다시 붙어도 대여 아님).
    hub.attach(kb121);
    const detached = await hub.lendSession(kb121);
    hub.retainSessions(U, new Set(["KB120"]));
    hub.attach(kb121);
    // 29-51 (GC-05) — KB121 도 VI 원천(사용자의 KB 세션 각각)이라 되돌아온 Ready 세션은 자기 Ready 프리페치 21 을 보낸다(대여 아님).
    expect(kb121.viGets).toEqual(["KRX", "NXT"]);
    kb121.pushFrame(empty61());
    kb121.pushFrame(empty61());
    kb121.pushFrame(disable65());
    expect(framesOf("strategies.disabled")).toHaveLength(2);
    detached.release();
    expect(kb121.viGets).toEqual(["KRX", "NXT"]); // 반납은 옛 대여 몫 — 21 을 더 보내지 않는다

    // (3) closeAll — 표식 0 · 배수 대기 중인 대여도 즉시 해결(무동작).
    const kept = await hub.lendSession(kb121);
    kb120b.isReady = true;
    hub.requestStrategySnapshot(U); // KB120b(primary) 로 21 두 개 — 미해결
    expect(kb120b.viGets).toEqual(["KRX", "NXT"]);
    const draining = track(hub.lendSession(kb120b));
    await flush();
    expect(draining.done).toBe(false);
    hub.closeAll();
    await flush();
    expect(draining.done).toBe(true);
    kept.release();
    hub.attach(kb121);
    kb121.pushFrame(disable65());
    expect(framesOf("strategies.disabled")).toHaveLength(3);
    draining.value?.release();
    expect(kb120b.viGets).toEqual(["KRX", "NXT"]);
  });
});

/**
 * Phase 29-51 (GC-05) — VI 원천 = 사용자의 **KB 세션 각각**(소유 키 단위 · 소유 뷰 필터 · 거래소 병합). G-1 로 계좌 A 를 KB121 로
 * 지정한 사용자의 VI 설정 · 결과가 primary(KB120) 밖에서도 VI 카드에 보인다. 증권사 축은 KB 그대로(교보 세션은 원천 아님).
 * 84 · 76/78 · 77 은 primary 그대로(D-18).
 */
describe("SubscriptionHub — VI 계좌 소유 세션 원천 (GC-05 · 29-51)", () => {
  const A = "1234567801";
  const B = "1234567802";
  let hub: SubscriptionHub;
  let fanned: HubFanoutEvent[];
  let kb120: FakeBrokerSession;
  let kb121: FakeBrokerSession;

  /** 브라우저로 나간 `vi` 프레임 — [거래소, 계좌(미등록 = null), run]. */
  function viSeen(): [string, string | null, boolean | null][] {
    return fanned
      .filter((e) => e.userId === U && e.msg.t === "vi")
      .map((e) => {
        const m = e.msg as Extract<RelayOutbound, { t: "vi" }>;
        return [m.x, m.cfg?.accountNo ?? null, m.cfg?.run ?? null];
      });
  }

  beforeEach(() => {
    resetDroppedEnvelopeCount();
    hub = new SubscriptionHub({ preferredPrimaryServerKey: () => "KB120" });
    fanned = [];
    hub.on("fanout", (e: HubFanoutEvent) => fanned.push(e));
    kb120 = new FakeBrokerSession(U, "KB120", "KB", [{ accountNo: B, name: "계좌B" }]);
    kb121 = new FakeBrokerSession(U, "KB121", "KB", [{ accountNo: A, name: "계좌A" }]);
    kb120.isReady = false;
    kb121.isReady = false;
    hub.attach(kb120);
    hub.attach(kb121);
  });

  afterEach(() => {
    hub.closeAll();
    vi.restoreAllMocks();
  });

  it("GC-05 Ready 프리페치 — KB 세션 각각 21(KRX · NXT) · 34 · 43 은 primary(KB120)만 · 교보 세션은 24 만 · 교보 61 은 원천 아님", () => {
    const ky = new FakeBrokerSession(U, "KYOBO119", "KYOBO", [{ accountNo: B1, name: "교보" }]);
    ky.isReady = false;
    hub.attach(ky);
    kb120.emitReady();
    kb121.emitReady();
    ky.emitReady();
    expect(kb120.sentTypes).toEqual([
      MSG.GetAccountStateReq,
      MSG.GetLimitChaserListReq,
      MSG.GetVITriggerReq,
      MSG.GetVITriggerReq,
      MSG.GetVIOrderListReq,
      MSG.GetUserSettingsReq,
    ]);
    expect(kb121.sentTypes).toEqual([
      MSG.GetAccountStateReq,
      MSG.GetLimitChaserListReq,
      MSG.GetVITriggerReq,
      MSG.GetVITriggerReq,
      MSG.GetVIOrderListReq,
    ]);
    expect(ky.sentTypes).toEqual([MSG.GetAccountStateReq, MSG.GetLimitChaserListReq]);

    ky.pushFrame(buildSetVITriggerRespFrame({ accountNo: B1, exchange: "KRX", run: true }));
    expect(hub.getViTrigger(U, "KRX")).toBeUndefined();
    expect(viSeen()).toEqual([]);
  });

  it("GC-05 소유 뷰 밖 61 은 원천 아님 — KB121 의 { B, KRX, run } (옛 서버 잔여) → 캐시 · 팬아웃 0 · 같은 세션 { A, NXT } → NXT = A", () => {
    kb121.pushFrame(buildSetVITriggerRespFrame({ accountNo: B, exchange: "KRX", run: true }));
    expect(hub.getViTrigger(U, "KRX")).toBeUndefined();
    expect(viSeen()).toEqual([]);

    kb121.pushFrame(buildSetVITriggerRespFrame({ accountNo: A, exchange: "NXT" }));
    expect(hub.getViTrigger(U, "NXT")).toMatchObject({ accountNo: A, exchange: "NXT" });
    expect(viSeen()).toEqual([["NXT", A, false]]);
  });

  it("GC-05 거래소 병합 3상태 — 두 세션 모두 KRX 빈 61 이어야 KRX null 1회 · 한 세션만 등록본이면 그 값 즉시 · 늦은 미등록은 등록본을 덮지 않는다", () => {
    kb120.emitReady();
    kb121.emitReady();

    // KRX — KB120 만 답했다(KB121 미응답) → 아직 모름.
    kb120.pushFrame(buildSetVITriggerRespFrame(null));
    expect(hub.getViTrigger(U, "KRX")).toBeUndefined();
    expect(viSeen()).toEqual([]);
    // KB121 도 미등록 → 전부 미등록 null 1회.
    kb121.pushFrame(buildSetVITriggerRespFrame(null));
    expect(hub.getViTrigger(U, "KRX")).toBeNull();
    expect(viSeen()).toEqual([["KRX", null, null]]);

    // NXT — KB121 이 등록본으로 먼저 답했다 → 다른 세션 미응답이어도 그 값으로 즉시.
    kb121.pushFrame(buildSetVITriggerRespFrame({ accountNo: A, exchange: "NXT" }));
    expect(viSeen()).toEqual([
      ["KRX", null, null],
      ["NXT", A, false],
    ]);
    // KB120 의 늦은 미등록(NXT) 은 병합값(A)을 바꾸지 않는다 — 프레임 0.
    kb120.pushFrame(buildSetVITriggerRespFrame(null));
    expect(hub.getViTrigger(U, "NXT")).toMatchObject({ accountNo: A });
    expect(viSeen()).toHaveLength(2);
  });

  it("GC-05 병합 — 켜진 등록본 우선 · 둘 다 꺼짐이면 마지막으로 에코가 온 세션의 등록본 · 병합값이 그대로면 다른 세션 에코는 팬아웃 0", () => {
    // 둘 다 꺼짐 — 마지막 에코(KB121 의 A)가 병합값.
    kb120.pushFrame(buildSetVITriggerRespFrame({ accountNo: B, exchange: "KRX", run: false }));
    kb121.pushFrame(buildSetVITriggerRespFrame({ accountNo: A, exchange: "KRX", run: false }));
    expect(hub.getViTrigger(U, "KRX")).toMatchObject({ accountNo: A, run: false });
    expect(viSeen()).toEqual([
      ["KRX", B, false],
      ["KRX", A, false],
    ]);
    // KB120 이 다시 에코하면 그것이 마지막 — B.
    kb120.pushFrame(buildSetVITriggerRespFrame({ accountNo: B, exchange: "KRX", run: false }));
    expect(hub.getViTrigger(U, "KRX")).toMatchObject({ accountNo: B });
    expect(viSeen().at(-1)).toEqual(["KRX", B, false]);

    // 켜진 것 우선 — KB121 의 A 가 켜지면 A · 그 뒤 KB120 의 꺼진 B 에코는 병합값을 바꾸지 않아 팬아웃 0.
    kb121.pushFrame(buildSetVITriggerRespFrame({ accountNo: A, exchange: "KRX", run: true }));
    expect(viSeen().at(-1)).toEqual(["KRX", A, true]);
    const n = viSeen().length;
    kb120.pushFrame(buildSetVITriggerRespFrame({ accountNo: B, exchange: "KRX", run: false }));
    expect(hub.getViTrigger(U, "KRX")).toMatchObject({ accountNo: A, run: true });
    expect(viSeen()).toHaveLength(n);
  });

  it("GC-05 병합 — 두 세션 모두 켜짐(가드 밖에서 생긴 충돌)이면 primary(KB120) 것 + warn 1줄(서버 키 · 거래소만 · 계좌 없음)", () => {
    // KB121 을 먼저 결선한 hub — 결선 순이 아니라 primary 가 이긴다.
    const other = new SubscriptionHub({ preferredPrimaryServerKey: () => "KB120" });
    const events: HubFanoutEvent[] = [];
    other.on("fanout", (e: HubFanoutEvent) => events.push(e));
    const s121 = new FakeBrokerSession(U, "KB121", "KB", [{ accountNo: A, name: "계좌A" }]);
    const s120 = new FakeBrokerSession(U, "KB120", "KB", [{ accountNo: B, name: "계좌B" }]);
    other.attach(s121);
    other.attach(s120);
    const warns: unknown[][] = [];
    vi.spyOn(logger, "warn").mockImplementation(((...args: unknown[]) => {
      warns.push(args);
    }) as never);

    s121.pushFrame(buildSetVITriggerRespFrame({ accountNo: A, exchange: "KRX", run: true }));
    s120.pushFrame(buildSetVITriggerRespFrame({ accountNo: B, exchange: "KRX", run: true }));
    expect(other.getViTrigger(U, "KRX")).toMatchObject({ accountNo: B, run: true });
    const last = events.filter((e) => e.msg.t === "vi").at(-1)?.msg;
    expect(last?.t === "vi" ? last.cfg?.accountNo : null).toBe(B);

    const conflicts = warns.filter((c) => typeof c[1] === "string" && c[1].includes("켜진 VI"));
    expect(conflicts).toHaveLength(1);
    const ctx = conflicts[0]?.[0] as Record<string, unknown>;
    expect(ctx).toMatchObject({ exchange: "KRX", serverKeys: ["KB121", "KB120"] });
    expect(JSON.stringify(ctx)).not.toContain(A);
    expect(JSON.stringify(ctx)).not.toContain(B);
    other.closeAll();
  });

  it("GC-05 viRunningElsewhere — 다른 VI 원천 세션의 그 거래소 켜진 VI · 같은 세션 · 꺼짐 · 다른 거래소는 undefined", () => {
    kb120.pushFrame(buildSetVITriggerRespFrame({ accountNo: B, exchange: "KRX", run: true, checkRate: 21 }));
    const hit = hub.viRunningElsewhere(U, "KRX", kb121);
    expect(hit?.session).toBe(kb120);
    expect(hit?.cfg).toMatchObject({ accountNo: B, exchange: "KRX", run: true, checkRate: 21 });
    expect(hub.viRunningElsewhere(U, "KRX", kb120)).toBeUndefined();
    expect(hub.viRunningElsewhere(U, "NXT", kb121)).toBeUndefined();
    kb120.pushFrame(buildSetVITriggerRespFrame({ accountNo: B, exchange: "KRX", run: false }));
    expect(hub.viRunningElsewhere(U, "KRX", kb121)).toBeUndefined();
  });

  it("GC-05 72/73 — 소유 세션별 캐시의 합집합 · vi.list 스냅샷 = 합집합 · 73 은 증분 그대로 · 소유 뷰 밖 항목 버림 · viOrderSessionOf", () => {
    kb120.pushFrame(buildViOrderListFrame([{ orderNo: "O1", accountNo: B }], true));
    kb121.pushFrame(buildViOrderListFrame([{ orderNo: "O2", accountNo: A }], true));
    const lists = (): Extract<RelayOutbound, { t: "vi.list" }>[] =>
      fanned.filter((e) => e.userId === U && e.msg.t === "vi.list").map((e) => e.msg as Extract<RelayOutbound, { t: "vi.list" }>);
    expect(lists().at(-1)?.snap).toBe(true);
    expect(lists().at(-1)?.items.map((i) => i.orderNo)).toEqual(["O1", "O2"]);
    expect(hub.getViOrders(U).map((i) => i.orderNo)).toEqual(["O1", "O2"]);

    // 73 — 그 세션 몫 증분 그대로.
    kb121.pushFrame(buildViOrderListFrame([{ orderNo: "O2", accountNo: A, confirmed: true }], false));
    expect(lists().at(-1)).toMatchObject({ snap: false });
    expect(lists().at(-1)?.items.map((i) => [i.orderNo, i.confirmed])).toEqual([["O2", true]]);

    // KB120 72 에 A 항목(소유 밖 — 옛 서버 잔여) → 버림. KB120 몫만 교체 · KB121 몫 유지.
    kb120.pushFrame(
      buildViOrderListFrame(
        [
          { orderNo: "O3", accountNo: A },
          { orderNo: "O1", accountNo: B },
        ],
        true,
      ),
    );
    expect(hub.getViOrders(U).map((i) => i.orderNo)).toEqual(["O1", "O2"]);
    expect(lists().at(-1)?.items.map((i) => i.orderNo)).toEqual(["O1", "O2"]);
    // 소유 밖 항목만 실린 73 은 팬아웃 0.
    const n = lists().length;
    kb120.pushFrame(buildViOrderListFrame([{ orderNo: "O3", accountNo: A }], false));
    expect(lists()).toHaveLength(n);

    expect(hub.viOrderSessionOf(U, "O2")).toBe(kb121);
    expect(hub.viOrderSessionOf(U, "O1")).toBe(kb120);
    expect(hub.viOrderSessionOf(U, "O3")).toBeUndefined();
  });

  it("GC-05 56 — VI 발동 통보는 그 계좌의 소유 세션 것만 팬아웃", () => {
    // 발동가로 출처를 가른다 — KB121 의 A(1001) · B(1002) · KB120 의 A(1003) · B(1004).
    kb121.pushFrame(buildViOrderNoticeFrame({ accountNo: A, triggerPrice: 1001 }));
    kb121.pushFrame(buildViOrderNoticeFrame({ accountNo: B, triggerPrice: 1002 }));
    kb120.pushFrame(buildViOrderNoticeFrame({ accountNo: A, triggerPrice: 1003 }));
    kb120.pushFrame(buildViOrderNoticeFrame({ accountNo: B, triggerPrice: 1004 }));
    const notices = fanned.filter((e) => e.userId === U && e.msg.t === "vi.notice").map((e) => e.msg);
    expect(notices.map((m) => (m.t === "vi.notice" ? [m.accountNo, m.triggerPrice] : null))).toEqual([
      [A, 1001],
      [B, 1004],
    ]);
  });

  it("GC-05 KB121 분리(retainSessions) — KB121 몫 VI 설정 · 주문 · 대기열 0 · 남은 원천 기준 병합 재팬아웃 · primary(KB120) 몫은 그대로", () => {
    kb120.emitReady();
    kb121.emitReady();
    kb120.pushFrame(buildSetVITriggerRespFrame({ accountNo: B, exchange: "KRX", run: false }));
    kb121.pushFrame(buildSetVITriggerRespFrame({ accountNo: A, exchange: "KRX", run: true }));
    kb120.pushFrame(buildViOrderListFrame([{ orderNo: "O1", accountNo: B }], true));
    kb121.pushFrame(buildViOrderListFrame([{ orderNo: "O2", accountNo: A }], true));
    kb120.pushFrame(buildUserSettingsFrame({ present: true }));
    expect(hub.getViTrigger(U, "KRX")).toMatchObject({ accountNo: A, run: true });

    hub.retainSessions(U, new Set(["KB120"]));
    expect(hub.getViTrigger(U, "KRX")).toMatchObject({ accountNo: B, run: false });
    expect(viSeen().at(-1)).toEqual(["KRX", B, false]);
    expect(hub.getViOrders(U).map((i) => i.orderNo)).toEqual(["O1"]);
    const last = fanned.filter((e) => e.userId === U && e.msg.t === "vi.list").at(-1)?.msg;
    expect(last?.t === "vi.list" ? [last.snap, last.items.map((i) => i.orderNo)] : null).toEqual([true, ["O1"]]);
    expect(hub.viOrderSessionOf(U, "O2")).toBeUndefined();
    // KB121 의 늦은 빈 61 은 침묵한다(떼어진 세션 · 대기열 없음).
    kb121.pushFrame(buildSetVITriggerRespFrame(null));
    expect(viSeen().at(-1)).toEqual(["KRX", B, false]);
    // primary 몫(84)은 그대로.
    expect(hub.getUserSettings(U)).toMatchObject({ present: true });
  });
});

/**
 * Phase 29-54 (N-01) — 「전부 정지」 집계 · 14 송신자 꼬리표. fanout 이 대상(primary 증권사 세션 전부)마다 14 를 보내고 `sent` 를 부르면
 * hub 가 그 소유 키 FIFO 에 집계 꼬리표를 넣고, 세션별 65 를 모아 `strategies.disabled` 1건을 낸다. sweeper 14(대여 · `noteDisableSent`) ·
 * 사용자 14(`noteUserDisable`) · 꼬리표 없는 65(서버 발 — 29-49 규칙)는 송신 순서로 갈린다.
 */
describe("SubscriptionHub — 전부 정지 집계 (29-54 · N-01)", () => {
  const A = "1234567801";
  const B = "1234567802";
  let hub: SubscriptionHub;
  let fanned: HubFanoutEvent[];
  let kb120: FakeBrokerSession;
  let kb121: FakeBrokerSession;
  let infos: unknown[][];
  let warns: unknown[][];

  const r65 = (disabledCount: number, viDisabled = false) => buildDisableStrategiesRespFrame({ disabledCount, viDisabled });

  function disabled(): RelayOutbound[] {
    return fanned.filter((e) => e.userId === U && e.msg.t === "strategies.disabled").map((e) => e.msg);
  }

  function track<T>(p: Promise<T>): { done: boolean; value: T | undefined } {
    const st: { done: boolean; value: T | undefined } = { done: false, value: undefined };
    void p.then((v) => {
      st.done = true;
      st.value = v;
    });
    return st;
  }

  async function flush(): Promise<void> {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    resetDroppedEnvelopeCount();
    infos = [];
    warns = [];
    vi.spyOn(logger, "info").mockImplementation(((...args: unknown[]) => {
      infos.push(args);
    }) as never);
    vi.spyOn(logger, "warn").mockImplementation(((...args: unknown[]) => {
      warns.push(args);
    }) as never);
    hub = new SubscriptionHub({ preferredPrimaryServerKey: () => "KB120" });
    fanned = [];
    hub.on("fanout", (e: HubFanoutEvent) => fanned.push(e));
    kb120 = new FakeBrokerSession(U, "KB120", "KB", [{ accountNo: B, name: "계좌B" }]);
    kb121 = new FakeBrokerSession(U, "KB121", "KB", [{ accountNo: A, name: "계좌A" }]);
    hub.attach(kb120);
    hub.attach(kb121);
  });

  afterEach(() => {
    hub.closeAll();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("N-01 두 65 뒤에만 1건 · 합 · OR — KB120 65 만으로는 0 · KB121 65 뒤 { count 3, viDisabled true } · done answered [KB120, KB121]", async () => {
    const all = hub.beginAllStop(U, [kb120, kb121]);
    const done = track(all.done);
    all.sent(kb120);
    all.sent(kb121);
    kb120.pushFrame(r65(1));
    await flush();
    expect(disabled()).toEqual([]);
    expect(done.done).toBe(false);

    kb121.pushFrame(r65(2, true));
    await flush();
    expect(disabled()).toEqual([{ t: "strategies.disabled", count: 3, viDisabled: true }]);
    expect(done.value).toEqual({ count: 3, viDisabled: true, answered: ["KB120", "KB121"], failed: [] });
  });

  it("N-01 시한 → 답한 몫 1건 · 늦은 65 팬아웃 0 · info 1줄", async () => {
    const all = hub.beginAllStop(U, [kb120, kb121]);
    const done = track(all.done);
    all.sent(kb120);
    all.sent(kb121);
    kb120.pushFrame(r65(1));
    vi.advanceTimersByTime(HUB_ALL_STOP_COLLECT_MS - 1);
    await flush();
    expect(disabled()).toEqual([]);
    vi.advanceTimersByTime(1);
    await flush();
    expect(disabled()).toEqual([{ t: "strategies.disabled", count: 1, viDisabled: false }]);
    expect(done.value).toEqual({ count: 1, viDisabled: false, answered: ["KB120"], failed: [{ serverKey: "KB121", reason: "timeout" }] });

    kb121.pushFrame(r65(2));
    expect(disabled()).toHaveLength(1);
    const late = infos.filter((i) => String(i[1]).includes("늦게 온 65"));
    expect(late).toHaveLength(1);
    expect(late[0]?.[0]).toEqual({ userId: U, serverKey: "KB121", count: 2 });
  });

  it("N-01 답 0 → strategies.disabled 0 · done 즉시 해결(시한을 기다리지 않음) · 실패 2건", async () => {
    const all = hub.beginAllStop(U, [kb120, kb121]);
    const done = track(all.done);
    all.failed(kb120, "send-failed");
    all.failed(kb121, "not-ready");
    await flush();
    expect(done.value).toEqual({
      count: 0,
      viDisabled: false,
      answered: [],
      failed: [
        { serverKey: "KB120", reason: "send-failed" },
        { serverKey: "KB121", reason: "not-ready" },
      ],
    });
    expect(disabled()).toEqual([]);
    // 꼬리표를 넣지 않았다 — 뒤의 서버 발 65 는 종전대로 팬아웃.
    kb120.pushFrame(r65(4));
    expect(disabled()).toEqual([{ t: "strategies.disabled", count: 4, viDisabled: false }]);
  });

  it("N-01 대여 중 sweeper 65 는 집계 0 · 사용자 65 는 집계 — sweeper 14 먼저 / 전부 정지 14 먼저 두 순서", async () => {
    // (1) sweeper 가 KB121 로 14 를 먼저 보냈다 → 첫 65 는 sweeper 몫(억제) · 둘째 65 가 KB121 의 답.
    const lease = await hub.lendSession(kb121);
    lease.noteDisableSent();
    const first = hub.beginAllStop(U, [kb120, kb121]);
    const firstDone = track(first.done);
    first.sent(kb120);
    first.sent(kb121);
    kb120.pushFrame(r65(1));
    kb121.pushFrame(r65(5));
    await flush();
    expect(disabled()).toEqual([]);
    expect(firstDone.done).toBe(false);
    kb121.pushFrame(r65(2));
    await flush();
    expect(disabled()).toEqual([{ t: "strategies.disabled", count: 3, viDisabled: false }]);

    // (2) 전부 정지 14 가 먼저, sweeper 14 가 뒤 → 첫 65 = 집계 · 둘째 65 = 억제.
    const second = hub.beginAllStop(U, [kb120, kb121]);
    const secondDone = track(second.done);
    second.sent(kb120);
    second.sent(kb121);
    lease.noteDisableSent();
    kb121.pushFrame(r65(2));
    kb120.pushFrame(r65(1));
    await flush();
    expect(secondDone.value).toMatchObject({ count: 3, answered: ["KB120", "KB121"] });
    kb121.pushFrame(r65(7));
    expect(disabled()).toEqual([
      { t: "strategies.disabled", count: 3, viDisabled: false },
      { t: "strategies.disabled", count: 3, viDisabled: false },
    ]);
    lease.release();
  });

  it("N-01 대여 중 user 꼬리표 65 → 팬아웃 1(29-49 수용 거둠) · 대여 중 꼬리표 없는 65 → 0(29-49 그대로) · 대여 아님 꼬리표 없는 65 → 1(종전)", async () => {
    const lease = await hub.lendSession(kb121);
    hub.noteUserDisable(kb121);
    kb121.pushFrame(r65(2));
    expect(disabled()).toEqual([{ t: "strategies.disabled", count: 2, viDisabled: false }]);
    kb121.pushFrame(r65(9));
    expect(disabled()).toHaveLength(1);
    lease.release();
    kb121.pushFrame(r65(3));
    expect(disabled()).toEqual([
      { t: "strategies.disabled", count: 2, viDisabled: false },
      { t: "strategies.disabled", count: 3, viDisabled: false },
    ]);
  });

  it("N-01 결선 안 된 세션 — noteUserDisable · 무동작 대여의 noteDisableSent 는 꼬리표를 넣지 않는다", async () => {
    const stray = new FakeBrokerSession(U, "KB121", "KB", [{ accountNo: A, name: "계좌A" }]);
    hub.noteUserDisable(stray);
    const noop = await hub.lendSession(stray);
    noop.noteDisableSent();
    const lease = await hub.lendSession(kb121);
    kb121.pushFrame(r65(1));
    expect(disabled()).toEqual([]); // 꼬리표 없음 + 대여 중 → 29-49 억제
    lease.release();
  });

  it("N-01 분리 · 교체 · closeAll 정리 — 대상 detached · 그 소유 키 FIFO 비움 · closeAll 은 타이머 0 · done 해결 · 팬아웃 0", async () => {
    // (1) 분리 — KB121 이 retainSessions 로 떼어진다 → KB121 detached · KB120 답으로 끝 · 되돌아온 KB121 의 65 는 꼬리표 없음(종전 팬아웃).
    const detach = hub.beginAllStop(U, [kb120, kb121]);
    const detachDone = track(detach.done);
    detach.sent(kb120);
    detach.sent(kb121);
    hub.retainSessions(U, new Set(["KB120"]));
    kb120.pushFrame(r65(1));
    await flush();
    expect(detachDone.value).toEqual({
      count: 1,
      viDisabled: false,
      answered: ["KB120"],
      failed: [{ serverKey: "KB121", reason: "detached" }],
    });
    hub.attach(kb121);
    kb121.pushFrame(r65(6));
    expect(disabled()).toEqual([
      { t: "strategies.disabled", count: 1, viDisabled: false },
      { t: "strategies.disabled", count: 6, viDisabled: false },
    ]);

    // (2) 교체 — 같은 소유 키 새 객체 결선 → KB121 detached · 새 세션의 65 는 꼬리표 없음.
    const replace = hub.beginAllStop(U, [kb120, kb121]);
    const replaceDone = track(replace.done);
    replace.sent(kb120);
    replace.sent(kb121);
    const kb121b = new FakeBrokerSession(U, "KB121", "KB", [{ accountNo: A, name: "계좌A" }]);
    hub.attach(kb121b);
    kb120.pushFrame(r65(1));
    await flush();
    expect(replaceDone.value?.failed).toEqual([{ serverKey: "KB121", reason: "detached" }]);
    kb121b.pushFrame(r65(8));
    expect(disabled()).toHaveLength(4);

    // (3) closeAll — 진행 중 집계의 done 이 해결되고 팬아웃 0 · 남은 타이머 0.
    const closing = hub.beginAllStop(U, [kb120, kb121b]);
    const closingDone = track(closing.done);
    closing.sent(kb120);
    closing.sent(kb121b);
    hub.closeAll();
    await flush();
    expect(closingDone.done).toBe(true);
    expect(closingDone.value?.answered).toEqual([]);
    expect(disabled()).toHaveLength(4);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("N-01 30초 넘은 꼬리표 버림 — warn 1줄(서버 키 · 버린 수) · 그 65 는 다음 꼬리표(없으면 꼬리표 없음 규칙)로", async () => {
    const lease = await hub.lendSession(kb121);
    // (1) 오래된 user 꼬리표 → 버림 → 꼬리표 없음 + 대여 중 → 억제(버리지 않았다면 user 라 팬아웃했다).
    hub.noteUserDisable(kb121);
    vi.advanceTimersByTime(HUB_DISABLE_SENDER_MAX_AGE_MS + 1);
    kb121.pushFrame(r65(1));
    expect(disabled()).toEqual([]);
    const dropped = warns.filter((w) => String(w[1]).includes("꼬리표 버림"));
    expect(dropped).toHaveLength(1);
    expect(dropped[0]?.[0]).toEqual({ userId: U, serverKey: "KB121", dropped: 1 });

    // (2) 오래된 sweeper 꼬리표 뒤 새 user 꼬리표 → 그 65 는 user 몫(팬아웃 1).
    lease.noteDisableSent();
    vi.advanceTimersByTime(HUB_DISABLE_SENDER_MAX_AGE_MS + 1);
    hub.noteUserDisable(kb121);
    kb121.pushFrame(r65(2));
    expect(disabled()).toEqual([{ t: "strategies.disabled", count: 2, viDisabled: false }]);
    lease.release();
  });
});

describe("SubscriptionHub — P32 beginAccountStop 집계 (D-09 보정)", () => {
  const A = "1234567801";
  const B = "1234567802";
  let hub: SubscriptionHub;
  let fanned: HubFanoutEvent[];
  let kb120: FakeBrokerSession;
  let kb121: FakeBrokerSession;
  let infos: unknown[][];

  const r65 = (disabledCount: number) => buildDisableStrategiesRespFrame({ disabledCount, viDisabled: false });
  /** KB121(A 소유) 의 61 에코 — 기본은 A · KRX · run:false(끄기 에코). */
  const vi61 = (over: NonNullable<Parameters<typeof buildSetVITriggerRespFrame>[0]> = {}) =>
    buildSetVITriggerRespFrame({ accountNo: A, exchange: "KRX", orderAmountKrw: 5_000_000n, checkRate: 25, run: false, ...over });

  function disabled(): RelayOutbound[] {
    return fanned.filter((e) => e.userId === U && e.msg.t === "strategies.disabled").map((e) => e.msg);
  }

  function track<T>(p: Promise<T>): { done: boolean; value: T | undefined } {
    const st: { done: boolean; value: T | undefined } = { done: false, value: undefined };
    void p.then((v) => {
      st.done = true;
      st.value = v;
    });
    return st;
  }

  async function flush(): Promise<void> {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    resetDroppedEnvelopeCount();
    infos = [];
    vi.spyOn(logger, "info").mockImplementation(((...args: unknown[]) => {
      infos.push(args);
    }) as never);
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    hub = new SubscriptionHub({ preferredPrimaryServerKey: () => "KB120" });
    fanned = [];
    hub.on("fanout", (e: HubFanoutEvent) => fanned.push(e));
    kb120 = new FakeBrokerSession(U, "KB120", "KB", [{ accountNo: B, name: "계좌B" }]);
    kb121 = new FakeBrokerSession(U, "KB121", "KB", [{ accountNo: A, name: "계좌A" }]);
    hub.attach(kb120);
    hub.attach(kb121);
  });

  afterEach(() => {
    hub.closeAll();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("65 k건 — 2건 다 받은 뒤에만 1건 { count 합 } · 개별 65 팬아웃 0 · done complete", async () => {
    const stop = hub.beginAccountStop(U, kb121, { accountNo: A, keys: 2, viExchanges: [] });
    const done = track(stop.done);
    stop.sent();
    stop.sent();
    kb121.pushFrame(r65(1));
    await flush();
    expect(disabled()).toEqual([]);
    expect(done.done).toBe(false);
    kb121.pushFrame(r65(1));
    await flush();
    expect(disabled()).toEqual([{ t: "strategies.disabled", count: 2, viDisabled: false }]);
    expect(done.value).toEqual({ count: 2, viDisabled: false, answered: 2, expected: 2, ended: "complete" });
  });

  it("VI — 14 1건 + KRX 11: 65 만으로는 0 · run:true · 다른 거래소 에코는 세지 않는다 · 그 계좌 KRX 61 run:false 에코 뒤 1건 { viDisabled: true }", async () => {
    const stop = hub.beginAccountStop(U, kb121, { accountNo: A, keys: 1, viExchanges: ["KRX"] });
    const done = track(stop.done);
    stop.sent();
    kb121.pushFrame(r65(1));
    await flush();
    expect(disabled()).toEqual([]);
    kb121.pushFrame(vi61({ run: true }));
    kb121.pushFrame(vi61({ exchange: "NXT" }));
    await flush();
    expect(disabled()).toEqual([]);
    expect(done.done).toBe(false);

    kb121.pushFrame(vi61());
    await flush();
    expect(disabled()).toEqual([{ t: "strategies.disabled", count: 1, viDisabled: true }]);
    expect(done.value).toMatchObject({ count: 1, viDisabled: true, ended: "complete" });
  });

  it("VI 만 — 켜진 전략 0 ∧ VI 가동: 65 없이 61 run:false 에코를 근거로 { count 0, viDisabled true } 1건(A4)", async () => {
    const stop = hub.beginAccountStop(U, kb121, { accountNo: A, keys: 0, viExchanges: ["KRX"] });
    const done = track(stop.done);
    await flush();
    expect(done.done).toBe(false);
    expect(disabled()).toEqual([]);
    kb121.pushFrame(vi61());
    await flush();
    expect(disabled()).toEqual([{ t: "strategies.disabled", count: 0, viDisabled: true }]);
    expect(done.value).toMatchObject({ count: 0, viDisabled: true, answered: 0, expected: 0, ended: "complete" });
  });

  it("시한 — 65 하나가 안 오면 시한 뒤 받은 만큼 1건 · ended timeout · 늦은 65 는 팬아웃 0 + info 1줄", async () => {
    const stop = hub.beginAccountStop(U, kb121, { accountNo: A, keys: 2, viExchanges: [] });
    const done = track(stop.done);
    stop.sent();
    stop.sent();
    kb121.pushFrame(r65(1));
    vi.advanceTimersByTime(HUB_ALL_STOP_COLLECT_MS - 1);
    await flush();
    expect(disabled()).toEqual([]);
    vi.advanceTimersByTime(1);
    await flush();
    expect(disabled()).toEqual([{ t: "strategies.disabled", count: 1, viDisabled: false }]);
    expect(done.value).toEqual({ count: 1, viDisabled: false, answered: 1, expected: 2, ended: "timeout" });

    kb121.pushFrame(r65(1));
    await flush();
    expect(disabled()).toHaveLength(1);
    expect(infos.filter((i) => String(i[1]).includes("계좌 끄기 집계가 끝난 뒤 늦게 온 65"))).toHaveLength(1);
  });

  it("시한 — VI 에코가 끝내 안 오면 받은 65 로 1건 · viDisabled false", async () => {
    const stop = hub.beginAccountStop(U, kb121, { accountNo: A, keys: 1, viExchanges: ["KRX"] });
    const done = track(stop.done);
    stop.sent();
    kb121.pushFrame(r65(1));
    await flush();
    expect(disabled()).toEqual([]);
    vi.advanceTimersByTime(HUB_ALL_STOP_COLLECT_MS);
    await flush();
    expect(disabled()).toEqual([{ t: "strategies.disabled", count: 1, viDisabled: false }]);
    expect(done.value).toMatchObject({ ended: "timeout", viDisabled: false });
  });

  it("송신 실패 — failed · viFailed 는 기다리지 않는다 · 받은 것 0 이면 strategies.disabled 0 · done 즉시", async () => {
    const stop = hub.beginAccountStop(U, kb121, { accountNo: A, keys: 2, viExchanges: ["KRX"] });
    const done = track(stop.done);
    stop.failed();
    stop.failed();
    stop.viFailed("KRX");
    await flush();
    expect(done.value).toEqual({ count: 0, viDisabled: false, answered: 0, expected: 0, ended: "complete" });
    expect(disabled()).toEqual([]);
    // 꼬리표를 넣지 않았다 — 뒤의 서버 발 65 는 종전대로 팬아웃.
    kb121.pushFrame(r65(4));
    expect(disabled()).toEqual([{ t: "strategies.disabled", count: 4, viDisabled: false }]);
  });

  it("분리 — 집계 중 소유 세션이 떼어지면 받은 만큼 1건 즉시 · ended detached · 받은 것 0 이면 0건 · 꼬리표 정리", async () => {
    // (1) 하나 받고 분리 → 그 1건으로 즉시 끝.
    const first = hub.beginAccountStop(U, kb121, { accountNo: A, keys: 2, viExchanges: [] });
    const firstDone = track(first.done);
    first.sent();
    first.sent();
    kb121.pushFrame(r65(1));
    hub.retainSessions(U, new Set(["KB120"]));
    await flush();
    expect(firstDone.value).toEqual({ count: 1, viDisabled: false, answered: 1, expected: 2, ended: "detached" });
    expect(disabled()).toEqual([{ t: "strategies.disabled", count: 1, viDisabled: false }]);
    // 되돌아온 세션의 65 는 꼬리표가 비었으므로 서버 발 65 규칙(종전 팬아웃).
    hub.attach(kb121);
    kb121.pushFrame(r65(6));
    expect(disabled()).toHaveLength(2);

    // (2) 받은 것 0 에서 분리 → 0건.
    const second = hub.beginAccountStop(U, kb121, { accountNo: A, keys: 1, viExchanges: ["KRX"] });
    const secondDone = track(second.done);
    second.sent();
    hub.retainSessions(U, new Set(["KB120"]));
    await flush();
    expect(secondDone.value).toMatchObject({ answered: 0, ended: "detached" });
    expect(disabled()).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("closeAll — 진행 중 집계의 done 해결 · 팬아웃 0 · 남은 타이머 0", async () => {
    const stop = hub.beginAccountStop(U, kb121, { accountNo: A, keys: 1, viExchanges: ["KRX"] });
    const done = track(stop.done);
    stop.sent();
    hub.closeAll();
    await flush();
    expect(done.value).toMatchObject({ ended: "closed" });
    expect(disabled()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
