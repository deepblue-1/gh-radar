/**
 * Phase 15 Plan 16 — RELAY-01/RELAY-02. 계좌 상태 팬아웃 (25 / 66 / 67) 통합 테스트.
 *
 * 검증 대상은 **두 가지**다.
 *   ① 잔고·미체결이 그 계좌 주인에게만 간다 (T-15-02 — 이 파일의 존재 이유).
 *   ② 델타 병합·상한 클램프가 게이트웨이 계약대로 동작한다 (D-23 / T-15-07).
 *
 * `hub.test.ts` 와 같은 규율을 쓴다 — 세션은 가짜지만 **게이트웨이로 나간 바이트는
 * 실제 FlatBuffers 로 되읽어** 단언한다. "요청을 보냈다고 주장하는 것"이 아니라
 * "무엇을 보냈는가"를 본다.
 *
 * ⚠️ 나가는 `GetAccountStateReq(25)` 는 요청 대역이라 `tryParseEnvelope` 로 읽을 수 없다.
 *    그 함수는 수신(응답) 화이트리스트다 — `Envelope.getRootAsEnvelope` 를 직접 쓴다.
 */
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as flatbuffers from "flatbuffers";

import type { RelayAccountState, RelayOutbound } from "@gh-radar/shared";

import {
  SubscriptionHub,
  type HubFanoutEvent,
  type HubSession,
} from "../src/hub/subscription-hub.js";
import { MSG } from "../src/dma/msg-type.js";
import { resetDroppedEnvelopeCount, tryParseEnvelope } from "../src/dma/envelope.js";
import { Envelope } from "../src/generated/stock-dma/envelope.js";
import type { TransportFrameEvent } from "../src/dma/dma-client.js";
import {
  SAMPLE_ACCOUNT_NO,
  SAMPLE_ISIN,
  buildAccountStateFrame,
  type FakeHolding,
} from "./helpers/frames.js";

const OTHER_ACCOUNT_NO = "9876543210";
const OTHER_ISIN = "KR7000660001";

/** 게이트웨이로 나간 요청 1건을 되읽은 결과. */
type SentReq = { msgType: number; accountNo: string | null };

function decodeReq(payload: Uint8Array): SentReq {
  const bb = new flatbuffers.ByteBuffer(payload);
  const env = Envelope.getRootAsEnvelope(bb);
  const msgType = env.msgType();
  if (msgType === MSG.GetAccountStateReq) {
    return { msgType, accountNo: env.getAccountStateReq()?.accountNo() ?? null };
  }
  return { msgType, accountNo: null };
}

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

  pushFrame(payload: Uint8Array): void {
    const parsed = tryParseEnvelope(Buffer.from(payload));
    if (parsed === null) throw new Error("테스트 프레임이 수신 화이트리스트를 통과하지 못했습니다");
    const event: TransportFrameEvent = { ...parsed, generation: 1 };
    this.emit("frame", event);
  }

  emitReady(): void {
    this.isReady = true;
    this.emit("ready", { generation: 1, accounts: [] });
  }

  accountStateReqs(): SentReq[] {
    return this.sent.filter((s) => s.msgType === MSG.GetAccountStateReq);
  }
}

/** 팬아웃 중 계좌 프레임만. */
function acctFrames(events: HubFanoutEvent[]): RelayAccountState[] {
  return events
    .map((e) => e.msg)
    .filter((m: RelayOutbound): m is RelayAccountState => m.t === "acct");
}

describe("SubscriptionHub — 계좌 상태 (D-23)", () => {
  let hub: SubscriptionHub;
  let session: FakeSession;
  let fanout: HubFanoutEvent[];

  beforeEach(() => {
    // `setImmediate` 는 실제로 남겨 둔다 — 소켓 없는 테스트지만 규율을 통일한다.
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

  it("① Ready 진입 시 GetAccountStateReq 를 1건 보내며 accountNo 는 빈 문자열이다", () => {
    session.emitReady();

    const reqs = session.accountStateReqs();
    expect(reqs).toHaveLength(1);
    // 빈 문자열 = 전 계좌 스냅샷. 계좌를 하나씩 도는 왕복을 만들지 않는다 (D-23).
    expect(reqs[0]?.accountNo).toBe("");
  });

  it("② 66 수신 → snap:true 계좌 프레임이 그 사용자에게 팬아웃된다", () => {
    session.pushFrame(
      buildAccountStateFrame({
        snapshot: true,
        holdings: [{ isin: SAMPLE_ISIN, stockQty: 30, sellableQty: 20, avgPrice: 70_500.5 }],
        unfilled: [{ orderNo: "ORD0000001", unfilledQty: 7, side: "S" }],
      }),
    );

    expect(fanout).toHaveLength(1);
    expect(fanout[0]?.userId).toBe("user-1");
    const [frame] = acctFrames(fanout);
    expect(frame).toMatchObject({ t: "acct", a: SAMPLE_ACCOUNT_NO, snap: true });
    expect(frame?.hold).toEqual([
      { isin: SAMPLE_ISIN, qty: 30, sellableQty: 20, avgPrice: 70_500.5 },
    ]);
    // 미체결 잔량은 취소 수량의 원천이라 반드시 실려야 한다 (D-21).
    expect(frame?.unf[0]).toMatchObject({ orderNo: "ORD0000001", unfilledQty: 7, side: "S" });
  });

  it("③ 67 델타는 snap:false 로 그대로 흘러가고 캐시에는 upsert 된다", () => {
    session.pushFrame(
      buildAccountStateFrame({
        snapshot: true,
        holdings: [{ isin: SAMPLE_ISIN, stockQty: 10 }],
        unfilled: [{ orderNo: "ORD0000001", unfilledQty: 10 }],
      }),
    );
    session.pushFrame(
      buildAccountStateFrame({
        snapshot: false,
        holdings: [{ isin: OTHER_ISIN, stockQty: 5 }],
        unfilled: [{ orderNo: "ORD0000001", unfilledQty: 4 }],
      }),
    );

    // 와이어로는 델타 그대로 나간다 — 여기서 전량으로 부풀리지 않는다.
    const frames = acctFrames(fanout);
    expect(frames.map((f) => f.snap)).toEqual([true, false]);
    expect(frames[1]?.hold).toHaveLength(1);

    // 캐시는 병합된 전량 뷰다.
    const [cached] = hub.getAccountStates("user-1");
    expect(cached?.snap).toBe(true);
    expect(cached?.hold.map((h) => h.isin).sort()).toEqual([OTHER_ISIN, SAMPLE_ISIN].sort());
    expect(cached?.unf).toHaveLength(1);
    expect(cached?.unf[0]?.unfilledQty).toBe(4);
  });

  it("④ removed_order_nos 의 주문번호가 캐시 미체결 목록에서 사라진다", () => {
    session.pushFrame(
      buildAccountStateFrame({
        snapshot: true,
        unfilled: [{ orderNo: "ORD0000001" }, { orderNo: "ORD0000002" }],
      }),
    );
    session.pushFrame(
      buildAccountStateFrame({ snapshot: false, removedOrderNos: ["ORD0000001"] }),
    );

    const [cached] = hub.getAccountStates("user-1");
    expect(cached?.unf.map((u) => u.orderNo)).toEqual(["ORD0000002"]);
    // 삭제 표식은 브라우저도 적용해야 하므로 와이어로 그대로 나간다.
    expect(acctFrames(fanout)[1]?.rm).toEqual(["ORD0000001"]);
  });

  it("⑤ 잔고 600건은 500건으로 잘린다 (T-15-07 상한 클램프)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const holdings: FakeHolding[] = Array.from({ length: 600 }, (_, i) => ({
      // ISIN 은 12자여야 통과한다 — 상한 클램프만 시험하고 형식 가드에 걸리지 않게 만든다.
      isin: `KR7${String(i).padStart(9, "0")}`,
      stockQty: i,
    }));

    session.pushFrame(buildAccountStateFrame({ snapshot: true, holdings }));

    const [frame] = acctFrames(fanout);
    expect(frame?.hold).toHaveLength(500);
    // 앞의 N건을 남긴다 — 뒤를 남기면 화면 정렬이 프레임마다 뒤집힌다.
    expect(frame?.hold[0]?.qty).toBe(0);
    expect(frame?.hold[499]?.qty).toBe(499);
    warn.mockRestore();
  });

  it("⑥ 다른 사용자의 소켓에는 이 계좌 데이터가 가지 않는다 (T-15-02)", () => {
    const other = new FakeSession("user-2");
    hub.attach(other);

    session.pushFrame(
      buildAccountStateFrame({ accountNo: SAMPLE_ACCOUNT_NO, snapshot: true }),
    );
    other.pushFrame(buildAccountStateFrame({ accountNo: OTHER_ACCOUNT_NO, snapshot: true }));

    // 팬아웃 대상은 언제나 userId 하나다. 전역 브로드캐스트 경로가 없다.
    const byUser = fanout.map((e) => [e.userId, (e.msg as RelayAccountState).a]);
    expect(byUser).toEqual([
      ["user-1", SAMPLE_ACCOUNT_NO],
      ["user-2", OTHER_ACCOUNT_NO],
    ]);
    // 캐시도 사용자별로 갈린다.
    expect(hub.getAccountStates("user-1").map((s) => s.a)).toEqual([SAMPLE_ACCOUNT_NO]);
    expect(hub.getAccountStates("user-2").map((s) => s.a)).toEqual([OTHER_ACCOUNT_NO]);
  });

  it("⑦ 재접속 후 Ready 재진입마다 계좌 스냅샷을 다시 요청한다 (Pitfall 4)", () => {
    session.emitReady();
    expect(session.accountStateReqs()).toHaveLength(1);

    // 회선이 끊겼다 붙은 상황 — 같은 세션 객체가 다시 ready 를 낸다.
    session.emitReady();
    expect(session.accountStateReqs()).toHaveLength(2);

    // Ready 가 아니면 보내지 않는다(보낼 연결이 없다).
    session.isReady = false;
    hub.requestAccountState("user-1");
    expect(session.accountStateReqs()).toHaveLength(2);
  });

  it("⑧ 캐시가 있으면 게이트웨이 왕복 없이 즉시 스냅샷을 돌려준다 (D-37)", () => {
    session.pushFrame(
      buildAccountStateFrame({
        snapshot: true,
        holdings: [{ isin: SAMPLE_ISIN, stockQty: 12 }],
      }),
    );

    const before = session.sent.length;
    const states = hub.getAccountStates("user-1");

    expect(session.sent).toHaveLength(before); // 새 요청이 나가지 않았다
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({ t: "acct", snap: true, a: SAMPLE_ACCOUNT_NO });
    expect(states[0]?.hold[0]?.qty).toBe(12);
    expect(hub.stats().cachedAccountCount).toBe(1);
  });

  // ----------------------------------------------------------
  // 0 수량 = 삭제 신호 (gh-trade quick-260906-e8b)
  //
  // 서버 `AccountManager` 가 보유수량 0·매도가능수량 0 원소를 맵에서 지운다. 잔고에는
  // `removed_order_nos` 에 해당하는 삭제 표식이 없으므로 **0 수량 톰스톤 행**이 유일한
  // 통보 수단이다. 정본 규칙은 gh-trade `client/Services/DMA/AccountStateStore.cs`.
  // ----------------------------------------------------------

  it("⑨ 구버전 스냅샷에 섞여 온 0 잔고·0 미체결은 캐시에 남지 않는다", () => {
    // quick-260906-e8b 배포 이전 게이트웨이는 스냅샷(66)에 0 행을 그대로 싣는다.
    session.pushFrame(
      buildAccountStateFrame({
        snapshot: true,
        holdings: [
          { isin: SAMPLE_ISIN, stockQty: 30, sellableQty: 30 },
          { isin: OTHER_ISIN, stockQty: 0, sellableQty: 0, avgPrice: 0 },
        ],
        unfilled: [
          { orderNo: "ORD0000001", unfilledQty: 7 },
          { orderNo: "ORD0000002", unfilledQty: 0 },
        ],
      }),
    );

    const [cached] = hub.getAccountStates("user-1");
    expect(cached?.hold.map((h) => h.isin)).toEqual([SAMPLE_ISIN]);
    expect(cached?.unf.map((u) => u.orderNo)).toEqual(["ORD0000001"]);

    // 와이어는 가공하지 않는다 — 받은 그대로 흘려야 브라우저가 같은 판단을 한다.
    expect(acctFrames(fanout)[0]?.hold).toHaveLength(2);
  });

  it("⑩ 델타의 수량 0 톰스톤 잔고 행이 기존 보유 종목을 지운다", () => {
    session.pushFrame(
      buildAccountStateFrame({
        snapshot: true,
        holdings: [
          { isin: SAMPLE_ISIN, stockQty: 30, sellableQty: 30 },
          { isin: OTHER_ISIN, stockQty: 12, sellableQty: 12 },
        ],
      }),
    );
    // 전량 매도 → 서버가 맵에서 지우고 0/0/0 행으로 알린다.
    session.pushFrame(
      buildAccountStateFrame({
        snapshot: false,
        holdings: [{ isin: SAMPLE_ISIN, stockQty: 0, sellableQty: 0, avgPrice: 0 }],
      }),
    );

    const [cached] = hub.getAccountStates("user-1");
    expect(cached?.hold.map((h) => h.isin)).toEqual([OTHER_ISIN]);

    // 삭제 신호는 브라우저도 적용해야 하므로 델타 원본이 그대로 나간다.
    const delta = acctFrames(fanout)[1];
    expect(delta?.snap).toBe(false);
    expect(delta?.hold).toEqual([{ isin: SAMPLE_ISIN, qty: 0, sellableQty: 0, avgPrice: 0 }]);
  });

  it("⑪ 델타의 unfilled_qty 0 행은 rm 없이도 미체결에서 사라진다", () => {
    session.pushFrame(
      buildAccountStateFrame({
        snapshot: true,
        unfilled: [
          { orderNo: "ORD0000001", unfilledQty: 10 },
          { orderNo: "ORD0000002", unfilledQty: 5 },
        ],
      }),
    );
    session.pushFrame(
      buildAccountStateFrame({
        snapshot: false,
        unfilled: [
          { orderNo: "ORD0000001", unfilledQty: 0, orderQty: 10, filledQty: 10 },
          { orderNo: "ORD0000002", unfilledQty: 3, orderQty: 5, filledQty: 2 },
        ],
      }),
    );

    const [cached] = hub.getAccountStates("user-1");
    expect(cached?.unf.map((u) => u.orderNo)).toEqual(["ORD0000002"]);
    expect(cached?.unf[0]?.unfilledQty).toBe(3);
  });

  it("⑫ 같은 델타가 한 주문을 갱신하면서 rm 으로도 지우면 최종은 '없음'이다", () => {
    session.pushFrame(
      buildAccountStateFrame({
        snapshot: true,
        unfilled: [{ orderNo: "ORD0000001", unfilledQty: 10 }],
      }),
    );
    // upsert 와 삭제가 한 프레임에 실린 경우 — 삭제가 이긴다(순서: upsert → rm).
    session.pushFrame(
      buildAccountStateFrame({
        snapshot: false,
        unfilled: [{ orderNo: "ORD0000001", unfilledQty: 4 }],
        removedOrderNos: ["ORD0000001"],
      }),
    );

    const [cached] = hub.getAccountStates("user-1");
    expect(cached?.unf).toEqual([]);
  });

});
