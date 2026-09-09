/**
 * Phase 16 Plan 06 — TRADE-03. `SubscriptionHub` 전략 캐시 단위 테스트.
 *
 * 검증 대상은 **전략 회계**다 — Ready 프리페치 24/21/34 각 1회(D-12)와 그 이후의 재조회
 * 0건(D-13), 60 의 `crud:"D"` 삭제(Pitfall 7), 64/72 전량 교체 vs 73 항목 upsert,
 * 65 가 캐시를 고치지 않는다는 것, 세션 교체 시 3맵 폐기, 그리고 사용자 간 누출 0(T-16-02).
 *
 * `hub.test.ts` 의 규율을 그대로 승계한다:
 *   - 세션은 **가짜 객체**다. 세션 상태기계는 15-03 이 소켓까지 붙여 이미 증명했다.
 *   - 게이트웨이로 나간 바이트를 **실제 FlatBuffers 로 되읽어** 단언한다 — "보냈다고
 *     주장하는 것"이 아니라 "무엇을 보냈는가"를 본다. 전략 조회 3종(24/21/34)은 본문이
 *     없는 빈 Envelope 라 `msg_type` 이 검증할 수 있는 전부이고, 그래서 더더욱 문자열
 *     매칭이 아니라 디코드로 확인해야 한다.
 *
 * ⚠️ 나가는 프레임은 요청 대역(21/24/34)이라 `tryParseEnvelope` 로 읽을 수 없다
 *    (그 함수는 **수신** 화이트리스트다). `Envelope.getRootAsEnvelope` 를 직접 쓴다.
 */
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as flatbuffers from "flatbuffers";

import type {
  RelayLimitChaser,
  RelayLimitChaserMsg,
  RelayLimitChaserSnapMsg,
  RelayOutbound,
  RelayViListMsg,
  RelayViNoticeMsg,
  RelayStrategiesDisabledMsg,
  RelayViTriggerMsg,
} from "@gh-radar/shared";

import {
  SubscriptionHub,
  type HubFanoutEvent,
  type HubSession,
} from "../src/hub/subscription-hub.js";
import { MSG } from "../src/dma/msg-type.js";
import { resetDroppedEnvelopeCount, strategyKey, tryParseEnvelope } from "../src/dma/envelope.js";
import { Envelope } from "../src/generated/stock-dma/envelope.js";
import type { TransportFrameEvent } from "../src/dma/dma-client.js";
import type { SymbolInfo, SymbolLookup } from "../src/store/symbols.js";
import {
  SAMPLE_ACCOUNT_NO,
  SAMPLE_ISIN,
  buildDisableStrategiesRespFrame,
  buildLimitChaserListRespFrame,
  buildSetLimitChaserRespFrame,
  buildSetVITriggerRespFrame,
  buildViOrderListFrame,
  buildViOrderNoticeFrame,
} from "./helpers/frames.js";

const OTHER_ISIN = "KR7000660001";
const USER_A = "user-a";
const USER_B = "user-b";

/** 기본 픽스처가 만드는 전략 키. **직접 조립하지 않고 정본 함수를 부른다.** */
const KEY_A = strategyKey(SAMPLE_ISIN, SAMPLE_ACCOUNT_NO, "KRX");

/** `HubSession` 최소 구현. 보낸 프레임은 **디코드해서** msg_type 만 남긴다. */
class FakeSession extends EventEmitter implements HubSession {
  /** 게이트웨이가 받은 요청의 msg_type 순서대로. */
  readonly sentMsgTypes: number[] = [];
  isReady = true;

  constructor(readonly userId: string) {
    super();
  }

  send(payload: Uint8Array): boolean {
    const bb = new flatbuffers.ByteBuffer(payload);
    this.sentMsgTypes.push(Envelope.getRootAsEnvelope(bb).msgType());
    return true;
  }

  /** 게이트웨이가 프레임을 밀어 넣는 상황을 재현한다(수신 화이트리스트를 실제로 통과시킨다). */
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

  /** 전략 조회 3종만 센다 — 시세·계좌 요청은 이 파일의 관심사가 아니다. */
  strategyReqCount(msgType: number): number {
    return this.sentMsgTypes.filter((m) => m === msgType).length;
  }
}

/** ISIN → 종목명 역매핑 스텁. 게이트웨이가 주지 않는 값을 Hub 가 채우는지 본다. */
class FakeSymbols implements SymbolLookup {
  constructor(private readonly rows: Record<string, SymbolInfo>) {}
  lookup(isin: string): SymbolInfo | undefined {
    return this.rows[isin];
  }
}

function msgsOf<T extends RelayOutbound["t"]>(
  fanout: HubFanoutEvent[],
  t: T,
): Extract<RelayOutbound, { t: T }>[] {
  return fanout
    .map((e) => e.msg)
    .filter((m): m is Extract<RelayOutbound, { t: T }> => m.t === t);
}

describe("SubscriptionHub — 전략 캐시 (D-12/D-13)", () => {
  let hub: SubscriptionHub;
  let session: FakeSession;
  let fanout: HubFanoutEvent[];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    resetDroppedEnvelopeCount();
    hub = new SubscriptionHub();
    fanout = [];
    hub.on("fanout", (e) => fanout.push(e));
    session = new FakeSession(USER_A);
    hub.attach(session);
  });

  afterEach(() => {
    hub.closeAll();
    vi.useRealTimers();
  });

  it("① Ready 직후 24·21·34 를 각각 1회 보낸다 (D-12 프리페치)", () => {
    session.emitReady();

    // 디코드한 msg_type 으로 단언한다 — 요청 본문이 없어 이것이 계약의 전부다.
    expect(session.strategyReqCount(MSG.GetLimitChaserListReq)).toBe(1);
    expect(session.strategyReqCount(MSG.GetVITriggerReq)).toBe(1);
    expect(session.strategyReqCount(MSG.GetVIOrderListReq)).toBe(1);
    // 순서는 계약이 아니지만 3종이 **연속으로** 나간다(중간에 다른 왕복이 끼지 않는다).
    const strategyOnly = session.sentMsgTypes.filter((m) =>
      [MSG.GetLimitChaserListReq, MSG.GetVITriggerReq, MSG.GetVIOrderListReq].includes(
        m as (typeof MSG)["GetLimitChaserListReq"],
      ),
    );
    expect(strategyOnly).toHaveLength(3);
  });

  it("② 재조회는 재접속 때만 — ready 유지 중 10분이 흘러도 추가 요청 0건이다 (D-13)", () => {
    session.emitReady();
    const after = session.sentMsgTypes.length;

    // 주기 타이머가 있다면 여기서 드러난다. 가짜 타이머라 10분이 즉시 흐른다.
    vi.advanceTimersByTime(10 * 60_000);

    expect(session.sentMsgTypes).toHaveLength(after);
    expect(session.strategyReqCount(MSG.GetLimitChaserListReq)).toBe(1);

    // 재접속(세션 교체) 후 ready 가 다시 오면 다시 3건이다.
    const next = new FakeSession(USER_A);
    hub.attach(next);
    next.emitReady();
    expect(next.strategyReqCount(MSG.GetLimitChaserListReq)).toBe(1);
    expect(next.strategyReqCount(MSG.GetVITriggerReq)).toBe(1);
    expect(next.strategyReqCount(MSG.GetVIOrderListReq)).toBe(1);
  });

  it("③ 60 에코가 캐시에 upsert 되고 {t:'lc'} 1프레임으로 나간다", () => {
    session.pushFrame(buildSetLimitChaserRespFrame({ buyEnabled: true }));

    const lc = msgsOf(fanout, "lc") as RelayLimitChaserMsg[];
    expect(lc).toHaveLength(1);
    expect(lc[0]?.item.key).toBe(KEY_A);
    expect(lc[0]?.item.buyEnabled).toBe(true);

    const cached = hub.getLimitChasers(USER_A);
    expect(cached).toHaveLength(1);
    // 캐시 키는 `item.key` 를 그대로 쓴다(재조립 금지) — 값도 그 키여야 한다.
    expect(cached[0]?.key).toBe(KEY_A);
  });

  it("④ 60 의 crud 'D' 는 캐시에서 지우되 프레임은 그대로 내린다 (Pitfall 7)", () => {
    session.pushFrame(buildSetLimitChaserRespFrame({ crud: "C" }));
    expect(hub.getLimitChasers(USER_A)).toHaveLength(1);

    session.pushFrame(buildSetLimitChaserRespFrame({ crud: "D" }));

    expect(hub.getLimitChasers(USER_A)).toHaveLength(0);
    // 삭제도 브라우저에 알려야 이미 열린 탭의 목록에서 사라진다.
    const lc = msgsOf(fanout, "lc") as RelayLimitChaserMsg[];
    expect(lc).toHaveLength(2);
    expect(lc[1]?.item.crud).toBe("D");
  });

  it("⑤ 64 는 전량 교체다 — 2건이 있어도 1건짜리 목록을 받으면 1건만 남는다", () => {
    session.pushFrame(buildSetLimitChaserRespFrame({ isin: SAMPLE_ISIN }));
    session.pushFrame(buildSetLimitChaserRespFrame({ isin: OTHER_ISIN }));
    expect(hub.getLimitChasers(USER_A)).toHaveLength(2);

    session.pushFrame(buildLimitChaserListRespFrame([{ isin: OTHER_ISIN }]));

    const cached = hub.getLimitChasers(USER_A);
    expect(cached).toHaveLength(1);
    expect(cached[0]?.isin).toBe(OTHER_ISIN);

    const snap = msgsOf(fanout, "lc.snap") as RelayLimitChaserSnapMsg[];
    expect(snap).toHaveLength(1);
    expect(snap[0]?.items.map((i: RelayLimitChaser) => i.isin)).toEqual([OTHER_ISIN]);
  });

  it("⑥ 빈 61 은 파손이 아니라 미등록이다 — cfg:null 을 저장하고 그대로 내린다", () => {
    // 조회 전에는 「모른다」(undefined) 이고, 이때는 프레임을 지어내지 않는다.
    expect(hub.getViTrigger(USER_A)).toBeUndefined();

    session.pushFrame(buildSetVITriggerRespFrame(null));

    expect(hub.getViTrigger(USER_A)).toBeNull();
    const vi = msgsOf(fanout, "vi") as RelayViTriggerMsg[];
    expect(vi).toHaveLength(1);
    expect(vi[0]?.cfg).toBeNull();

    // 등록본이 오면 덮인다.
    session.pushFrame(buildSetVITriggerRespFrame({ run: true, checkRate: 25 }));
    expect(hub.getViTrigger(USER_A)).toMatchObject({ run: true, checkRate: 25, priceType: "U" });
  });

  it("⑦ 72 는 전량 교체, 73 은 항목 upsert 다 — 중복 누적 0", () => {
    session.pushFrame(
      buildViOrderListFrame(
        [
          { orderNo: "0001", state: "Accepted" },
          { orderNo: "0002", state: "Accepted" },
          { orderNo: "0003", state: "Pending" },
        ],
        true,
      ),
    );
    expect(hub.getViOrders(USER_A)).toHaveLength(3);

    session.pushFrame(
      buildViOrderListFrame([{ orderNo: "0002", state: "Filled", filledQty: 51 }], false),
    );

    const cached = hub.getViOrders(USER_A);
    expect(cached).toHaveLength(3);
    expect(cached.find((i) => i.orderNo === "0002")).toMatchObject({
      state: "Filled",
      filledQty: 51,
    });

    const lists = msgsOf(fanout, "vi.list") as RelayViListMsg[];
    expect(lists.map((l) => l.snap)).toEqual([true, false]);
    expect(lists[1]?.items).toHaveLength(1);
  });

  it("⑦-b 접수 전(orderNo:'') 항목은 주문번호가 붙으면 자리표시 행을 대체한다", () => {
    session.pushFrame(buildViOrderListFrame([{ orderNo: "", state: "Pending" }], false));
    expect(hub.getViOrders(USER_A)).toHaveLength(1);

    // 같은 접수 전 항목이 다시 밀려와도 쌓이지 않는다.
    session.pushFrame(buildViOrderListFrame([{ orderNo: "", state: "Pending" }], false));
    expect(hub.getViOrders(USER_A)).toHaveLength(1);

    // 접수되어 주문번호가 붙으면 **한 줄**로 이어진다(두 줄이 되면 사용자가 이중 발주로 읽는다).
    session.pushFrame(buildViOrderListFrame([{ orderNo: "0009", state: "Accepted" }], false));
    const cached = hub.getViOrders(USER_A);
    expect(cached).toHaveLength(1);
    expect(cached[0]?.orderNo).toBe("0009");
  });

  it("⑧ 65 는 완료 신호일 뿐 캐시를 고치지 않는다", () => {
    session.pushFrame(buildSetLimitChaserRespFrame({ buyEnabled: false, crud: "C" }));
    const before = hub.getLimitChasers(USER_A);
    expect(before).toHaveLength(1);

    session.pushFrame(buildDisableStrategiesRespFrame({ disabledCount: 3, viDisabled: true }));

    // 캐시 내용이 한 글자도 바뀌지 않는다 — 상태는 60/61 에코가 이미 옮겼다.
    expect(hub.getLimitChasers(USER_A)).toEqual(before);
    const done = msgsOf(fanout, "strategies.disabled") as RelayStrategiesDisabledMsg[];
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ count: 3, viDisabled: true });
  });

  it("⑨ 세션 교체 시 전략 3맵이 폐기된다 (재로그인 후 옛 전략이 남지 않는다)", () => {
    session.pushFrame(buildSetLimitChaserRespFrame({}));
    session.pushFrame(buildSetVITriggerRespFrame({ run: true }));
    session.pushFrame(buildViOrderListFrame([{ orderNo: "0001" }], true));
    expect(hub.getLimitChasers(USER_A)).toHaveLength(1);
    expect(hub.getViTrigger(USER_A)).not.toBeNull();
    expect(hub.getViOrders(USER_A)).toHaveLength(1);

    hub.attach(new FakeSession(USER_A));

    expect(hub.getLimitChasers(USER_A)).toHaveLength(0);
    expect(hub.getViOrders(USER_A)).toHaveLength(0);
    // 「미등록(null)」이 아니라 「모름(undefined)」으로 돌아가야 한다 —
    // null 로 남으면 새 세션의 61 이 오기 전에 사용자 입력이 지워진다.
    expect(hub.getViTrigger(USER_A)).toBeUndefined();
  });

  it("⑩ 전략 팬아웃·캐시는 사용자 간 교차하지 않는다 (T-16-02)", () => {
    const other = new FakeSession(USER_B);
    hub.attach(other);

    // **일부러 같은 전략 키**(같은 ISIN·계좌·거래소)를 양쪽에 넣는다. 캐시 키에 userId 가
    // 빠지면 여기서 두 사람의 전략이 한 칸을 두고 덮어쓴다 — 그것이 이 테스트의 표적이다.
    session.pushFrame(buildSetLimitChaserRespFrame({ buyOrderPrice: 71_000 }));
    other.pushFrame(buildSetLimitChaserRespFrame({ buyOrderPrice: 80_000 }));
    session.pushFrame(buildViOrderListFrame([{ orderNo: "0007" }], true));

    const aChasers = hub.getLimitChasers(USER_A);
    const bChasers = hub.getLimitChasers(USER_B);
    expect(aChasers).toHaveLength(1);
    expect(bChasers).toHaveLength(1);
    expect(aChasers[0]?.buyOrderPrice).toBe(71_000);
    expect(bChasers[0]?.buyOrderPrice).toBe(80_000);
    // 같은 `orderNo` 가 아니어도, VI 주문 캐시는 애초에 상대 쪽에서 보이지 않아야 한다.
    expect(hub.getViOrders(USER_A)).toHaveLength(1);
    expect(hub.getViOrders(USER_B)).toHaveLength(0);

    // 팬아웃 대상도 언제나 프레임을 보낸 세션의 userId 하나다.
    expect(fanout.filter((e) => e.msg.t === "lc").map((e) => e.userId)).toEqual([USER_A, USER_B]);
    expect(fanout.filter((e) => e.msg.t === "vi.list").map((e) => e.userId)).toEqual([USER_A]);
  });

  it("⑪ 파싱 실패는 예외 없이 무해하다 — 캐시도 팬아웃도 그대로다", () => {
    session.pushFrame(buildSetLimitChaserRespFrame({}));
    const before = hub.getLimitChasers(USER_A);
    const fanoutBefore = fanout.length;

    // (a) 슬롯이 통째로 빈 60 — `parseLimitChaserEcho` 가 `null` 을 돌려준다.
    const bare = buildSetLimitChaserRespFrame({});
    const bb = new flatbuffers.Builder(64);
    Envelope.startEnvelope(bb);
    Envelope.addMsgType(bb, MSG.SetLimitChaserResp);
    bb.finish(Envelope.endEnvelope(bb));
    expect(() => session.pushFrame(bb.asUint8Array())).not.toThrow();

    // (b) 뒤가 잘린 60 — 문자열·중첩 테이블이 사라진 버퍼.
    expect(() => session.pushFrame(bare.subarray(0, Math.floor(bare.length / 2)))).not.toThrow();

    // (c) ISIN 형식이 깨진 60 — 전략 키의 첫 마디라 파서가 드롭한다.
    expect(() => session.pushFrame(buildSetLimitChaserRespFrame({ isin: "SHORT" }))).not.toThrow();

    expect(hub.getLimitChasers(USER_A)).toEqual(before);
    expect(fanout).toHaveLength(fanoutBefore);

    // 대조군: 정상 프레임은 여전히 통과한다(위 단언이 공허하지 않다).
    session.pushFrame(buildSetLimitChaserRespFrame({ isin: OTHER_ISIN }));
    expect(hub.getLimitChasers(USER_A)).toHaveLength(2);
  });

  it("⑫ 56 통보와 72/73 행에 종목명을 채운다 (게이트웨이가 주지 않는 값)", () => {
    const named = new SubscriptionHub({
      symbols: new FakeSymbols({ [SAMPLE_ISIN]: { code: "005930", name: "삼성전자", market: "K" } }),
    });
    const events: HubFanoutEvent[] = [];
    named.on("fanout", (e) => events.push(e));
    const s = new FakeSession(USER_A);
    named.attach(s);

    s.pushFrame(buildViOrderNoticeFrame({}));
    s.pushFrame(buildViOrderListFrame([{ orderNo: "0001" }, { isin: OTHER_ISIN }], true));

    const notice = (events.map((e) => e.msg).find((m) => m.t === "vi.notice") ??
      null) as RelayViNoticeMsg | null;
    expect(notice?.name).toBe("삼성전자");

    const list = events.map((e) => e.msg).find((m) => m.t === "vi.list") as RelayViListMsg;
    expect(list.items[0]?.name).toBe("삼성전자");
    // 맵에 없는 ISIN 은 **비워 둔다** — ISIN 을 이름 자리에 넣지 않는다.
    expect(list.items[1]?.name).toBeUndefined();

    named.closeAll();
  });

  it("⑬ 60 에코와 64 스냅샷에 종목명·단축코드가 붙는다 — 캐시 복사본에도 (갭 4)", () => {
    const named = new SubscriptionHub({
      symbols: new FakeSymbols({ [SAMPLE_ISIN]: { code: "005930", name: "삼성전자", market: "K" } }),
    });
    const events: HubFanoutEvent[] = [];
    named.on("fanout", (e) => events.push(e));
    const s = new FakeSession(USER_A);
    named.attach(s);

    // (a) 60 에코 — 팬아웃 프레임에 이름이 붙는다.
    s.pushFrame(buildSetLimitChaserRespFrame({ isin: SAMPLE_ISIN }));
    const lc = msgsOf(events, "lc") as RelayLimitChaserMsg[];
    expect(lc).toHaveLength(1);
    expect(lc[0]?.item.name).toBe("삼성전자");
    expect(lc[0]?.item.code).toBe("005930");

    // (b) 캐시 복사본에도 붙어 있다 — 이것이 재접속 복원(`lc.snap`, fanout.ts:554)의 잠금이다.
    //     캐시에 원본을 넣으면 「지금 화면」은 이름이 있고 「새로 연 탭」은 ISIN 이 된다.
    const cachedAfterEcho = named.getLimitChasers(USER_A);
    expect(cachedAfterEcho).toHaveLength(1);
    expect(cachedAfterEcho[0]?.name).toBe("삼성전자");
    expect(cachedAfterEcho[0]?.code).toBe("005930");

    // (c) 64 전량 스냅샷도 같은 보강을 거친다.
    s.pushFrame(buildLimitChaserListRespFrame([{ isin: SAMPLE_ISIN }]));
    const snap = msgsOf(events, "lc.snap") as RelayLimitChaserSnapMsg[];
    expect(snap).toHaveLength(1);
    expect(snap[0]?.items).toHaveLength(1);
    expect(snap[0]?.items[0]?.name).toBe("삼성전자");
    expect(snap[0]?.items[0]?.code).toBe("005930");

    const cachedAfterSnap = named.getLimitChasers(USER_A);
    expect(cachedAfterSnap[0]?.name).toBe("삼성전자");
    expect(cachedAfterSnap[0]?.code).toBe("005930");

    named.closeAll();
  });

  it("⑭ SymbolMap 이 모르는 ISIN 은 필드를 비워 둔다 — ISIN 을 이름 자리에 넣지 않는다", () => {
    const named = new SubscriptionHub({
      symbols: new FakeSymbols({ [SAMPLE_ISIN]: { code: "005930", name: "삼성전자", market: "K" } }),
    });
    const events: HubFanoutEvent[] = [];
    named.on("fanout", (e) => events.push(e));
    const s = new FakeSession(USER_A);
    named.attach(s);

    s.pushFrame(buildSetLimitChaserRespFrame({ isin: OTHER_ISIN }));

    const lc = msgsOf(events, "lc") as RelayLimitChaserMsg[];
    expect(lc).toHaveLength(1);
    // 「이름이 없다」와 「이름이 ISIN 이다」는 다른 사실이다 — 후자를 만들면 UI 가 둘을
    // 구분하지 못한다. 서버는 **비워 두고**, 「모르면 ISIN 을 그대로」 폴백은 UI 의 몫이다.
    expect(lc[0]?.item.name).toBeUndefined();
    expect(lc[0]?.item.code).toBeUndefined();
    expect(lc[0]?.item.name).not.toBe(OTHER_ISIN);
    expect(lc[0]?.item.isin).toBe(OTHER_ISIN);

    // 캐시도 같다 — 스냅샷 경로로 지어낸 이름이 새지 않는다.
    const cached = named.getLimitChasers(USER_A);
    expect(cached[0]?.name).toBeUndefined();
    expect(cached[0]?.name).not.toBe(OTHER_ISIN);

    named.closeAll();
  });

  it("⑮ symbols 를 주입하지 않은 Hub 도 무해하다 — 60/64 가 흐르고 이름만 없다", () => {
    // `hub` 는 beforeEach 가 만든 **기본 구성**이다(`#symbols === undefined`).
    session.pushFrame(buildSetLimitChaserRespFrame({ isin: SAMPLE_ISIN }));
    session.pushFrame(buildLimitChaserListRespFrame([{ isin: SAMPLE_ISIN }]));

    const lc = msgsOf(fanout, "lc") as RelayLimitChaserMsg[];
    expect(lc).toHaveLength(1);
    expect(lc[0]?.item.name).toBeUndefined();

    const snap = msgsOf(fanout, "lc.snap") as RelayLimitChaserSnapMsg[];
    expect(snap).toHaveLength(1);
    expect(snap[0]?.items[0]?.name).toBeUndefined();

    // 캐시 규율은 보강 유무와 무관하게 그대로다.
    const cached = hub.getLimitChasers(USER_A);
    expect(cached).toHaveLength(1);
    expect(cached[0]?.key).toBe(KEY_A);
  });
});
