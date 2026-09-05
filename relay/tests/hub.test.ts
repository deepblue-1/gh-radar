/**
 * Phase 15 Plan 04 — RELAY-01. `SubscriptionHub` 단위 테스트.
 *
 * 검증 대상은 **구독 회계**다 — 탭이 늘어도 게이트웨이 구독은 1개, 사용자 간 구독이
 * 교차하지 않음, 스냅샷 캐시 즉시 응답(D-37), `ready` 전량 재구독(Pitfall 4),
 * 체결 200ms 배치와 링버퍼 상한(D-35).
 *
 * 세션은 **가짜 객체**를 쓴다. 세션 상태기계(로그인·재접속)는 15-03 이 소켓까지 붙여
 * 이미 증명했고, 여기서 다시 소켓을 세우면 검증 대상이 흐려진다. 대신 게이트웨이로 나간
 * 바이트를 **실제 FlatBuffers 로 되읽어** 단언한다 — "보냈다고 주장하는 것"이 아니라
 * "무엇을 보냈는가"를 본다.
 *
 * ⚠️ 나가는 프레임은 요청 대역(28/29/32)이라 `tryParseEnvelope` 로 읽을 수 없다.
 *    그 함수는 **수신(응답) 화이트리스트**라 요청 계열을 전부 드롭한다(15-02 규율).
 *    따라서 `Envelope.getRootAsEnvelope` 를 직접 쓴다.
 */
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as flatbuffers from "flatbuffers";

import type { RelayOutbound, RelayTape } from "@gh-radar/shared";

import {
  SubscriptionHub,
  TAPE_BATCH_MS,
  TAPE_RING_SIZE,
  type HubFanoutEvent,
  type HubSession,
} from "../src/hub/subscription-hub.js";
import { MSG } from "../src/dma/msg-type.js";
import { resetDroppedEnvelopeCount, tryParseEnvelope } from "../src/dma/envelope.js";
import { Envelope } from "../src/generated/stock-dma/envelope.js";
import type { TransportFrameEvent } from "../src/dma/dma-client.js";
import {
  SAMPLE_ISIN,
  buildQuoteStateFrame,
  buildServerMessageFrame,
  buildTradeTapeFrame,
  type FakeTapeEntryInput,
} from "./helpers/frames.js";

const OTHER_ISIN = "KR7000660001";

/** 게이트웨이로 나간 요청 프레임 1건을 되읽은 결과. */
type SentReq = {
  msgType: number;
  isin: string;
  exchange: string;
  subscribe: boolean | null;
  count: number | null;
};

function decodeReq(payload: Uint8Array): SentReq {
  const bb = new flatbuffers.ByteBuffer(payload);
  const env = Envelope.getRootAsEnvelope(bb);
  const msgType = env.msgType();

  if (msgType === MSG.GetQuoteReq) {
    const req = env.getQuoteReq();
    return {
      msgType,
      isin: req?.isin() ?? "",
      exchange: req?.exchange() ?? "",
      subscribe: null,
      count: null,
    };
  }
  if (msgType === MSG.SubscribeQuoteReq) {
    const req = env.subscribeQuoteReq();
    return {
      msgType,
      isin: req?.isin() ?? "",
      exchange: req?.exchange() ?? "",
      subscribe: req?.subscribe() ?? null,
      count: null,
    };
  }
  if (msgType === MSG.GetTradeTapeReq) {
    const req = env.getTradeTapeReq();
    return {
      msgType,
      isin: req?.isin() ?? "",
      exchange: req?.exchange() ?? "",
      subscribe: null,
      count: req?.count() ?? null,
    };
  }
  return { msgType, isin: "", exchange: "", subscribe: null, count: null };
}

/** `HubSession` 최소 구현. 보낸 바이트를 그대로 쌓아 둔다. */
class FakeSession extends EventEmitter implements HubSession {
  readonly sent: SentReq[] = [];
  isReady = true;

  constructor(readonly userId: string) {
    super();
  }

  send(payload: Uint8Array): boolean {
    this.sent.push(decodeReq(payload));
    return true;
  }

  /** 게이트웨이가 프레임을 밀어 넣는 상황을 재현한다. */
  pushFrame(payload: Uint8Array): void {
    const parsed = tryParseEnvelope(Buffer.from(payload));
    if (parsed === null) throw new Error("테스트 프레임이 수신 화이트리스트를 통과하지 못했습니다");
    const event: TransportFrameEvent = { ...parsed, generation: 1 };
    this.emit("frame", event);
  }

  /** Ready 재진입 (재접속 후 복귀). */
  emitReady(): void {
    this.isReady = true;
    this.emit("ready", { generation: 1, accounts: [] });
  }

  subscribeReqs(): SentReq[] {
    return this.sent.filter((s) => s.msgType === MSG.SubscribeQuoteReq);
  }
}

function tapeEntries(times: string[]): FakeTapeEntryInput[] {
  return times.map((t) => ({ tradeTime: t }));
}

describe("SubscriptionHub", () => {
  let hub: SubscriptionHub;
  let session: FakeSession;
  let fanout: HubFanoutEvent[];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    resetDroppedEnvelopeCount();
    hub = new SubscriptionHub();
    fanout = [];
    hub.on("fanout", (e) => fanout.push(e));
    session = new FakeSession("user-1");
    hub.attach(session);
  });

  afterEach(() => {
    hub.closeAll();
    vi.useRealTimers();
  });

  it("① 같은 (user,isin,ex) 를 두 번 구독해도 게이트웨이 구독은 1건이다 (탭 공유)", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");

    const subs = session.subscribeReqs();
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ isin: SAMPLE_ISIN, exchange: "KRX", subscribe: true });
    // 0→1 전이의 3프레임이 순서대로 나간다 (D-33).
    expect(session.sent.map((s) => s.msgType)).toEqual([
      MSG.GetQuoteReq,
      MSG.SubscribeQuoteReq,
      MSG.GetTradeTapeReq,
    ]);
    expect(session.sent[2]?.count).toBe(TAPE_RING_SIZE);
    expect(hub.refCount("user-1", SAMPLE_ISIN, "KRX")).toBe(2);
  });

  it("② 해제는 마지막 1건에서만 subscribe:false 를 보낸다", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");

    hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX");
    expect(session.subscribeReqs().filter((s) => s.subscribe === false)).toHaveLength(0);
    expect(hub.refCount("user-1", SAMPLE_ISIN, "KRX")).toBe(1);

    hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX");
    const releases = session.subscribeReqs().filter((s) => s.subscribe === false);
    expect(releases).toHaveLength(1);
    expect(releases[0]).toMatchObject({ isin: SAMPLE_ISIN, exchange: "KRX" });
    expect(hub.refCount("user-1", SAMPLE_ISIN, "KRX")).toBe(0);
  });

  it("③ 다른 사용자의 해제가 첫 사용자의 구독을 끊지 않는다 (D-13 키 격리)", () => {
    const other = new FakeSession("user-2");
    hub.attach(other);

    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");
    hub.subscribe("user-2", SAMPLE_ISIN, "KRX");
    hub.unsubscribe("user-2", SAMPLE_ISIN, "KRX");

    expect(hub.refCount("user-1", SAMPLE_ISIN, "KRX")).toBe(1);
    expect(session.subscribeReqs().filter((s) => s.subscribe === false)).toHaveLength(0);
    expect(other.subscribeReqs().filter((s) => s.subscribe === false)).toHaveLength(1);
  });

  it("④ 스냅샷 캐시가 채워지면 게이트웨이 송신 없이 즉시 반환한다 (D-37)", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");
    session.pushFrame(buildQuoteStateFrame({ snapshot: true, lastPrice: 70_950n }));

    const before = session.sent.length;
    const snapshot = hub.getSnapshot("user-1", SAMPLE_ISIN, "KRX");

    expect(snapshot?.p).toBe(70_950);
    expect(snapshot?.snap).toBe(true);
    // 캐시 조회는 업스트림을 건드리지 않는다.
    expect(session.sent).toHaveLength(before);
    // 다른 사용자의 캐시는 비어 있다 (키에 userId 가 들어 있으므로).
    expect(hub.getSnapshot("user-2", SAMPLE_ISIN, "KRX")).toBeUndefined();
  });

  it("⑤ ready 재발행이 보유 키를 전량 재구독한다 (Pitfall 4)", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");
    hub.subscribe("user-1", OTHER_ISIN, "NXT");
    session.sent.length = 0;

    session.emitReady();

    const resubscribed = session
      .subscribeReqs()
      .filter((s) => s.subscribe === true)
      .map((s) => `${s.isin}|${s.exchange}`);
    expect(resubscribed.sort()).toEqual([`${OTHER_ISIN}|NXT`, `${SAMPLE_ISIN}|KRX`]);
    // 재구독도 3프레임 세트다 — 스냅샷 없이 구독만 걸면 첫 화면이 비어 있다.
    expect(session.sent.filter((s) => s.msgType === MSG.GetQuoteReq)).toHaveLength(2);
    expect(session.sent.filter((s) => s.msgType === MSG.GetTradeTapeReq)).toHaveLength(2);
  });

  it("⑥ 체결은 200ms 배치로 1회만 나간다 (100ms 안의 3건 → entry 3개)", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");

    session.pushFrame(
      buildTradeTapeFrame({ snapshot: false, entries: tapeEntries(["090000000001"]) }),
    );
    vi.advanceTimersByTime(50);
    session.pushFrame(
      buildTradeTapeFrame({ snapshot: false, entries: tapeEntries(["090000000002"]) }),
    );
    vi.advanceTimersByTime(50);
    session.pushFrame(
      buildTradeTapeFrame({ snapshot: false, entries: tapeEntries(["090000000003"]) }),
    );

    // 배치 창이 아직 닫히지 않았다 — 한 건도 나가지 않는다.
    expect(fanout.filter((e) => e.msg.t === "tape")).toHaveLength(0);

    vi.advanceTimersByTime(TAPE_BATCH_MS);

    const tapes = fanout.map((e) => e.msg).filter((m): m is RelayTape => m.t === "tape");
    expect(tapes).toHaveLength(1);
    expect(tapes[0]?.e.map((entry) => entry.t)).toEqual([
      "090000000001",
      "090000000002",
      "090000000003",
    ]);
    expect(tapes[0]?.snap).toBe(false);
  });

  it("⑦ 체결 링버퍼는 상한을 넘으면 오래된 것부터 버린다", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");

    const full = Array.from({ length: TAPE_RING_SIZE }, (_, i) =>
      `0900000${String(i).padStart(5, "0")}`,
    );
    session.pushFrame(buildTradeTapeFrame({ snapshot: true, entries: tapeEntries(full) }));
    session.pushFrame(
      buildTradeTapeFrame({
        snapshot: false,
        entries: tapeEntries(["091000000001", "091000000002", "091000000003"]),
      }),
    );

    const ring = hub.getTape("user-1", SAMPLE_ISIN, "KRX");
    expect(ring).toHaveLength(TAPE_RING_SIZE);
    // 앞의 3건이 밀려났다.
    expect(ring?.[0]?.t).toBe(full[3]);
    expect(ring?.[TAPE_RING_SIZE - 1]?.t).toBe("091000000003");
  });

  it("⑧ 시세는 배치하지 않고 그대로 통과시킨다 (D-35 — 추가 코얼레싱 없음)", () => {
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");

    session.pushFrame(buildQuoteStateFrame({ snapshot: false, lastPrice: 71_000n }));
    session.pushFrame(buildQuoteStateFrame({ snapshot: false, lastPrice: 71_100n }));

    const quotes = fanout.map((e) => e.msg).filter((m) => m.t === "q");
    expect(quotes).toHaveLength(2);
    expect(fanout.every((e) => e.userId === "user-1")).toBe(true);
  });

  it("⑨ 팬아웃 대상은 언제나 프레임을 보낸 세션의 userId 하나다 (T-15-02)", () => {
    const other = new FakeSession("user-2");
    hub.attach(other);
    hub.subscribe("user-1", SAMPLE_ISIN, "KRX");
    hub.subscribe("user-2", SAMPLE_ISIN, "KRX");

    other.pushFrame(buildQuoteStateFrame({ snapshot: true }));

    expect(fanout).toHaveLength(1);
    expect(fanout[0]?.userId).toBe("user-2");
  });

  it("⑩ ServerMessage(54)는 해석 없이 그대로 흘린다 (D-36)", () => {
    session.pushFrame(
      buildServerMessageFrame({ level: "WARN", message: "세션 정리", kind: "Purge" }),
    );

    const msgs = fanout.map((e) => e.msg).filter((m: RelayOutbound) => m.t === "msg");
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ lv: "WARN", m: "세션 정리", kind: "Purge" });
  });

  it("⑪ Ready 이전 구독은 프레임을 보내지 않고 ready 에서 복원된다", () => {
    const late = new FakeSession("user-3");
    late.isReady = false;
    hub.attach(late);

    hub.subscribe("user-3", SAMPLE_ISIN, "KRX");
    expect(late.sent).toHaveLength(0);
    expect(hub.refCount("user-3", SAMPLE_ISIN, "KRX")).toBe(1);

    late.emitReady();
    expect(late.subscribeReqs().filter((s) => s.subscribe === true)).toHaveLength(1);
  });

  it("⑫ 참조계수 없는 해제는 무시한다 (이중 해제 방어)", () => {
    hub.unsubscribe("user-1", SAMPLE_ISIN, "KRX");
    expect(session.sent).toHaveLength(0);
    expect(hub.refCount("user-1", SAMPLE_ISIN, "KRX")).toBe(0);
  });
});
