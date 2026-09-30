/**
 * Phase 26 Plan 10 — 재구독 페이싱 (RESEARCH Pattern 7 · Pitfall 3). `SubscribePacer` 단위 테스트.
 *
 * 서버는 연결당 Notice 송신 큐가 1024 프레임 / 4MB 를 넘으면 연결을 끊는다(gh-trade Gateway.h:72-73). 28 의 응답 58 과
 * 32 의 응답 69(기본 200건)가 Notice 라서, quote 연결 재접속 뒤 최대 2000 키를 한꺼번에 재구독하면 끊김 → 재접속 →
 * 같은 burst 루프가 된다. 페이서는 한 번에 `PACER_WINDOW` 키만 요청을 내보내고, 그 키의 응답(FULL=69 · PRICE=58)이나
 * `PACER_TIMEOUT_MS` 가 지나야 다음 키를 보낸다. 응답이 없는 29(해제 · 강등)는 창을 점유하지 않는다.
 *
 * `send` 는 가짜다 — 보낸 바이트를 실제 FlatBuffers 로 되읽어(hub.test 의 `decodeReq` 와 같은 방식) 「무엇을 보냈는가」 를 본다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as flatbuffers from "flatbuffers";

import {
  PACER_TIMEOUT_MS,
  PACER_WINDOW,
  SubscribePacer,
} from "../src/hub/subscribe-pacer.js";
import { MSG } from "../src/dma/msg-type.js";
import { QUOTE_LEVEL, buildSubscribeQuoteReq } from "../src/dma/envelope.js";
import { Envelope } from "../src/generated/stock-dma/envelope.js";

type SentReq = {
  msgType: number;
  isin: string;
  exchange: string;
  subscribe: boolean | null;
  level: number | null;
  count: number | null;
};

/** 요청 대역(28/29/32)은 수신 화이트리스트(`tryParseEnvelope`)를 통과하지 못하므로 Envelope 를 직접 읽는다. */
function decodeReq(payload: Uint8Array): SentReq {
  const env = Envelope.getRootAsEnvelope(new flatbuffers.ByteBuffer(payload));
  const msgType = env.msgType();
  if (msgType === MSG.GetQuoteReq) {
    const req = env.getQuoteReq();
    return { msgType, isin: req?.isin() ?? "", exchange: req?.exchange() ?? "", subscribe: null, level: null, count: null };
  }
  if (msgType === MSG.SubscribeQuoteReq) {
    const req = env.subscribeQuoteReq();
    return {
      msgType,
      isin: req?.isin() ?? "",
      exchange: req?.exchange() ?? "",
      subscribe: req?.subscribe() ?? null,
      level: req?.level() ?? null,
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
      level: null,
      count: req?.count() ?? null,
    };
  }
  return { msgType, isin: "", exchange: "", subscribe: null, level: null, count: null };
}

const Q = MSG.GetQuoteReq;
const S = MSG.SubscribeQuoteReq;
const T = MSG.GetTradeTapeReq;

/** 합성 ISIN — `KR7` + 0 채움 숫자 9자리(12자). */
const isinOf = (n: number): string => `KR7${String(n).padStart(9, "0")}`;
const keyOf = (n: number): string => `${isinOf(n)}|KRX`;

describe("SubscribePacer — in-flight 창 · 응답/타임아웃 · 대기 병합 (Pitfall 3)", () => {
  let sent: SentReq[];
  let ready: boolean;
  let idle: number;
  let pacer: SubscribePacer;

  const quoteReqs = (): SentReq[] => sent.filter((s) => s.msgType === Q);
  const sentFor = (n: number): Array<[number, boolean | null, number | null]> =>
    sent.filter((s) => s.isin === isinOf(n)).map((s) => [s.msgType, s.subscribe, s.level]);

  /** 키 n..n+count-1 을 level 로 구독 요청한다. */
  function subscribeRange(from: number, count: number, level: "full" | "price" = "full"): void {
    for (let n = from; n < from + count; n += 1) pacer.subscribe(keyOf(n), isinOf(n), "KRX", level);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    sent = [];
    ready = true;
    idle = 0;
    pacer = new SubscribePacer({
      isReady: () => ready,
      send: (payload) => {
        sent.push(decodeReq(payload));
        return true;
      },
      onIdle: () => {
        idle += 1;
      },
    });
  });

  afterEach(() => {
    pacer.reset();
    vi.useRealTimers();
  });

  it("P1 상수는 A5 가정값이다 — 창 32 키 · 타임아웃 3초", () => {
    expect(PACER_WINDOW).toBe(32);
    expect(PACER_TIMEOUT_MS).toBe(3_000);
  });

  it("P2 창 32 — 키 100 개 구독이면 28 은 32 개만 나가고, FULL 키는 58 로는 슬롯이 안 풀리고 69 에 풀려 33번째 키 28 · 29 · 32 가 나간다", () => {
    subscribeRange(0, 100);

    expect(quoteReqs()).toHaveLength(PACER_WINDOW);
    expect(sent).toHaveLength(PACER_WINDOW * 3);
    expect(pacer.stats()).toEqual({ queued: 100 - PACER_WINDOW, inFlight: PACER_WINDOW, timeouts: 0 });
    // 첫 키는 FULL 한 벌 — 순서가 계약이다(28 → 29(level=0) → 32).
    expect(sentFor(0)).toEqual([
      [Q, null, null],
      [S, true, QUOTE_LEVEL.FULL],
      [T, null, null],
    ]);
    expect(sent.find((s) => s.msgType === T)?.count).toBeGreaterThan(0);

    // 58 만으로는 FULL 키 슬롯이 풀리지 않는다 — 69(체결 테이프 스냅샷, 큰 Notice)가 와야 한다.
    pacer.onResponse(keyOf(0), MSG.GetQuoteResp);
    expect(quoteReqs()).toHaveLength(PACER_WINDOW);

    pacer.onResponse(keyOf(0), MSG.TradeTapeResp);
    expect(quoteReqs()).toHaveLength(PACER_WINDOW + 1);
    expect(sentFor(PACER_WINDOW)).toEqual([
      [Q, null, null],
      [S, true, QUOTE_LEVEL.FULL],
      [T, null, null],
    ]);
    expect(pacer.stats()).toMatchObject({ queued: 100 - PACER_WINDOW - 1, inFlight: PACER_WINDOW });

    // 창 밖(아직 안 보낸) 키의 늦은 응답 · 모르는 키 · 이미 끝난 키의 응답은 무시한다.
    pacer.onResponse(keyOf(99), MSG.TradeTapeResp);
    pacer.onResponse("KR7NOPE|KRX", MSG.TradeTapeResp);
    pacer.onResponse(keyOf(0), MSG.TradeTapeResp);
    expect(quoteReqs()).toHaveLength(PACER_WINDOW + 1);
  });

  it("P3 PRICE 키는 58 에 슬롯이 풀린다 — 28 · 29(level=1) 만 나가고 32 는 없다", () => {
    subscribeRange(0, PACER_WINDOW + 1, "price");

    expect(quoteReqs()).toHaveLength(PACER_WINDOW);
    expect(sent.filter((s) => s.msgType === T)).toHaveLength(0);
    expect(sentFor(0)).toEqual([
      [Q, null, null],
      [S, true, QUOTE_LEVEL.PRICE],
    ]);

    // PRICE 키에 69 는 오지 않는다 — 기다리는 번호가 아니면 무시.
    pacer.onResponse(keyOf(0), MSG.TradeTapeResp);
    expect(quoteReqs()).toHaveLength(PACER_WINDOW);

    pacer.onResponse(keyOf(0), MSG.GetQuoteResp);
    expect(quoteReqs()).toHaveLength(PACER_WINDOW + 1);
    expect(sentFor(PACER_WINDOW)).toEqual([
      [Q, null, null],
      [S, true, QUOTE_LEVEL.PRICE],
    ]);
  });

  it("P4 응답 없이 3초가 지나면 그 키 슬롯을 풀고 다음 키를 보낸다 — stats().timeouts +1", () => {
    subscribeRange(0, PACER_WINDOW);
    vi.advanceTimersByTime(1_000);
    subscribeRange(PACER_WINDOW, 1);
    expect(quoteReqs()).toHaveLength(PACER_WINDOW);

    vi.advanceTimersByTime(PACER_TIMEOUT_MS - 1_000 - 1);
    expect(quoteReqs()).toHaveLength(PACER_WINDOW);
    expect(pacer.stats().timeouts).toBe(0);

    // 첫 32 키가 3초에 한꺼번에 만료 — 대기 1개가 나가고 창에는 그 1개만 남는다.
    vi.advanceTimersByTime(1);
    expect(quoteReqs()).toHaveLength(PACER_WINDOW + 1);
    expect(pacer.stats()).toEqual({ queued: 0, inFlight: 1, timeouts: PACER_WINDOW });

    // 기다리는 쪽(대기열)이 없으면 타이머를 걸지 않는다 — 평시 구독이 키마다 3초 타이머를 쌓지 않는다.
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(PACER_TIMEOUT_MS);
    expect(pacer.stats()).toEqual({ queued: 0, inFlight: 1, timeouts: PACER_WINDOW });

    // 기한이 지난 in-flight 는 다음 subscribe 가 먼저 쓸어낸다 — 새 키는 지연 없이 곧바로 나간다.
    subscribeRange(200, 1);
    expect(sentFor(200)).toHaveLength(3);
    expect(pacer.stats()).toEqual({ queued: 0, inFlight: 1, timeouts: PACER_WINDOW + 1 });
    expect(idle).toBe(0);
  });

  it("P4b trackUntilIdle — 대기열이 비어도 in-flight 기한을 타이머로 재어 응답이 끝내 없으면 타임아웃으로 idle 을 확정한다", () => {
    subscribeRange(0, 2);
    expect(vi.getTimerCount()).toBe(0);
    pacer.trackUntilIdle();
    expect(vi.getTimerCount()).toBe(1); // 가장 이른 기한에 1개 — 키 수만큼 쌓지 않는다

    pacer.onResponse(keyOf(0), MSG.TradeTapeResp);
    expect(idle).toBe(0);
    vi.advanceTimersByTime(PACER_TIMEOUT_MS);
    expect(idle).toBe(1);
    expect(pacer.stats()).toEqual({ queued: 0, inFlight: 0, timeouts: 1 });
    expect(vi.getTimerCount()).toBe(0);

    // idle 뒤에는 추적이 풀린다 — 다음 평시 구독은 다시 타이머 0.
    subscribeRange(10, 1);
    expect(vi.getTimerCount()).toBe(0);

    // 이미 idle 이면 그 자리에서 onIdle.
    pacer.reset();
    pacer.trackUntilIdle();
    expect(idle).toBe(2);
  });

  it("P5 대기 중(미송신) 키 — 해제는 송신 0 · 대기열에서 빠진다 / price→full 재요청은 level 만 full / 강등은 level 만 price", () => {
    subscribeRange(0, PACER_WINDOW);
    pacer.subscribe(keyOf(100), isinOf(100), "KRX", "price");
    pacer.subscribe(keyOf(101), isinOf(101), "KRX", "full");
    pacer.subscribe(keyOf(102), isinOf(102), "KRX", "full");
    expect(pacer.stats()).toMatchObject({ queued: 3, inFlight: PACER_WINDOW });
    const before = sent.length;

    pacer.control(keyOf(102), buildSubscribeQuoteReq(isinOf(102), "KRX", false), "unsubscribe");
    pacer.subscribe(keyOf(100), isinOf(100), "KRX", "full"); // 승격 — 대기 항목 level 만 바꾼다
    pacer.control(
      keyOf(101),
      buildSubscribeQuoteReq(isinOf(101), "KRX", true, QUOTE_LEVEL.PRICE),
      "demote",
    );
    expect(sent).toHaveLength(before); // 대기 중 키의 제어는 아무 프레임도 내지 않는다
    expect(pacer.stats()).toMatchObject({ queued: 2, inFlight: PACER_WINDOW });

    // 창을 비우면 대기 순서 그대로(FIFO) 바뀐 level 한 벌씩 나간다. 해제된 102 는 끝까지 0건.
    for (let n = 0; n < PACER_WINDOW; n += 1) pacer.onResponse(keyOf(n), MSG.TradeTapeResp);
    expect(sent.slice(before).map((s) => [s.msgType, s.isin, s.level])).toEqual([
      [Q, isinOf(100), null],
      [S, isinOf(100), QUOTE_LEVEL.FULL],
      [T, isinOf(100), null],
      [Q, isinOf(101), null],
      [S, isinOf(101), QUOTE_LEVEL.PRICE],
    ]);
    expect(sentFor(102)).toEqual([]);
  });

  it("P6 in-flight · 이미 구독된 키의 해제 29(false) · 강등 29(1)은 즉시 나가고 창을 점유하지 않는다 — in-flight 해제면 슬롯도 풀린다", () => {
    subscribeRange(0, PACER_WINDOW + 2);
    pacer.onResponse(keyOf(0), MSG.TradeTapeResp); // 0 은 구독 완료 → 32 가 창에 들어온다
    const before = sent.length;

    // 이미 구독된 키(0) 강등 — 즉시 29(1) 1건, 창 · 대기열 불변.
    pacer.control(keyOf(0), buildSubscribeQuoteReq(isinOf(0), "KRX", true, QUOTE_LEVEL.PRICE), "demote");
    expect(sent.slice(before).map((s) => [s.msgType, s.isin, s.subscribe, s.level])).toEqual([
      [S, isinOf(0), true, QUOTE_LEVEL.PRICE],
    ]);
    expect(pacer.stats()).toMatchObject({ queued: 1, inFlight: PACER_WINDOW });

    // 이미 구독된 키(0) 해제 — 즉시 29(false), 창 불변.
    pacer.control(keyOf(0), buildSubscribeQuoteReq(isinOf(0), "KRX", false), "unsubscribe");
    expect(sent.at(-1)).toMatchObject({ msgType: S, isin: isinOf(0), subscribe: false });
    expect(pacer.stats()).toMatchObject({ queued: 1, inFlight: PACER_WINDOW });

    // in-flight 키(1) 해제 — 즉시 29(false) 뒤 슬롯이 풀려 대기 키(33)가 나간다.
    const mark = sent.length;
    pacer.control(keyOf(1), buildSubscribeQuoteReq(isinOf(1), "KRX", false), "unsubscribe");
    expect(sent.slice(mark).map((s) => [s.msgType, s.isin, s.subscribe])).toEqual([
      [S, isinOf(1), false],
      [Q, isinOf(PACER_WINDOW + 1), null],
      [S, isinOf(PACER_WINDOW + 1), true],
      [T, isinOf(PACER_WINDOW + 1), null],
    ]);
    expect(pacer.stats()).toMatchObject({ queued: 0, inFlight: PACER_WINDOW });

    // 풀린 키의 늦은 69 · 옛 타이머는 아무것도 풀지 않는다.
    pacer.onResponse(keyOf(1), MSG.TradeTapeResp);
    expect(pacer.stats()).toMatchObject({ inFlight: PACER_WINDOW });
  });

  it("P7 in-flight 키의 PRICE→FULL 승격은 같은 슬롯에서 곧바로 28 · 29(0) · 32 를 다시 보내고 69 를 기다린다", () => {
    subscribeRange(0, PACER_WINDOW, "price");
    subscribeRange(PACER_WINDOW, 1);
    const before = sent.length;

    pacer.subscribe(keyOf(0), isinOf(0), "KRX", "full");
    expect(sent.slice(before).map((s) => [s.msgType, s.isin, s.level])).toEqual([
      [Q, isinOf(0), null],
      [S, isinOf(0), QUOTE_LEVEL.FULL],
      [T, isinOf(0), null],
    ]);
    expect(pacer.stats()).toMatchObject({ queued: 1, inFlight: PACER_WINDOW });

    // 이제 0 은 69 를 기다린다 — 58 로는 풀리지 않는다.
    pacer.onResponse(keyOf(0), MSG.GetQuoteResp);
    expect(pacer.stats()).toMatchObject({ queued: 1, inFlight: PACER_WINDOW });
    pacer.onResponse(keyOf(0), MSG.TradeTapeResp);
    expect(pacer.stats()).toMatchObject({ queued: 0, inFlight: PACER_WINDOW });
  });

  it("P8 isReady 가 거짓이면 펌프가 멈추고 항목은 남는다 · reset() 은 대기열 · in-flight · 타이머를 비운다", () => {
    ready = false;
    subscribeRange(0, 3);
    expect(sent).toHaveLength(0);
    expect(pacer.stats()).toEqual({ queued: 3, inFlight: 0, timeouts: 0 });

    // 준비되면 다음 요청이 펌프를 돌려 대기 순서 그대로 나간다.
    ready = true;
    subscribeRange(3, 1);
    expect(quoteReqs().map((s) => s.isin)).toEqual([isinOf(0), isinOf(1), isinOf(2), isinOf(3)]);

    subscribeRange(10, PACER_WINDOW); // 창 32 를 넘겨 대기열도 만든다
    expect(pacer.stats()).toMatchObject({ queued: 4, inFlight: PACER_WINDOW });
    pacer.reset();
    expect(pacer.stats()).toEqual({ queued: 0, inFlight: 0, timeouts: 0 });

    // 타이머도 지워졌다 — 3초가 지나도 타임아웃 · 송신 0.
    const after = sent.length;
    vi.advanceTimersByTime(PACER_TIMEOUT_MS * 3);
    expect(pacer.stats()).toEqual({ queued: 0, inFlight: 0, timeouts: 0 });
    expect(sent).toHaveLength(after);
  });

  it("P9 onIdle — 대기열과 창이 모두 비는 순간(응답 · 타임아웃 · 대기 해제) 1회씩 부른다", () => {
    subscribeRange(0, 2);
    pacer.onResponse(keyOf(0), MSG.TradeTapeResp);
    expect(idle).toBe(0);
    pacer.onResponse(keyOf(1), MSG.TradeTapeResp);
    expect(idle).toBe(1);

    ready = false;
    subscribeRange(5, 1);
    pacer.control(keyOf(5), buildSubscribeQuoteReq(isinOf(5), "KRX", false), "unsubscribe");
    expect(idle).toBe(2);
    expect(sent.filter((s) => s.isin === isinOf(5))).toHaveLength(0);
  });
});
