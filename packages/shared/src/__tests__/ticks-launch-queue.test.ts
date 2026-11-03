/**
 * quick 261103-pei — 발사 대기열 · 체결 런 순수 코어(바이트 없음). 실측 골든은 `ticks-launch-queue.golden.test.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  aggressorRunsOf,
  fifoReplay,
  matchQueuePieces,
  runValueOf,
  type AggressorRun,
  type QueueEvent,
  type RunRowIn,
} from "../ticks/launch-queue";

const B = (cur: number, betterQty = 0, betterAmt = 0): QueueEvent => ({ k: "B", cur, betterQty, betterAmt });
const A = (qty: number): QueueEvent => ({ k: "A", qty });

describe("fifoReplay", () => {
  it("증가 = 주문 추가(번호 1부터) · 직전 B6 잔량 · 더 좋은 단을 기억한다(첫 B6 은 0)", () => {
    const r = fifoReplay([B(10, 5, 500), B(30, 7, 700), B(31)]);
    expect(r.orders.map((o) => [o.n, o.qty, o.prevCur, o.prevBetterQty, o.prevBetterAmt])).toEqual([
      [1, 10, 0, 0, 0],
      [2, 20, 10, 5, 500],
      [3, 1, 30, 7, 700],
    ]);
    expect(r.stats).toEqual({ adds: 3, fills: 0, cancelExact: 0, cancelAmbig: 0, cancelNone: 0 });
    expect(r.b6).toBe(3);
  });

  it("체결은 쌓아 두었다가 감소 때 앞에서부터 소진한다(체결 이벤트 +1) · 0 이 된 주문은 fill", () => {
    const r = fifoReplay([B(10), B(30), A(15), B(15)]);
    expect(r.orders.map((o) => [o.rem, o.filled, o.zeroBy])).toEqual([
      [0, 10, "fill"],
      [15, 5, null],
    ]);
    expect(r.stats.fills).toBe(1);
  });

  it("체결 소진 뒤 남은 감소 = 정확취소(1개) · 모호취소(여럿 — 가장 뒤) · 설명불가(무시)", () => {
    // 주문 5 · 7 · 5 · 9 → 7 취소(정확) → 5 취소(모호 → 가장 뒤 = 3번) → 4 감소(설명불가)
    const r = fifoReplay([B(5), B(12), B(17), B(26), B(19), B(14), B(10)]);
    expect(r.orders.map((o) => [o.rem, o.zeroBy])).toEqual([
      [5, null],
      [0, "cancel"],
      [0, "cancel"],
      [9, null],
    ]);
    expect(r.stats).toEqual({ adds: 4, fills: 0, cancelExact: 1, cancelAmbig: 1, cancelNone: 1 });
  });

  it("체결과 취소가 한 감소에 섞이면 체결 먼저 · 남는 체결은 다음 감소로 넘긴다", () => {
    // 주문 10 · 4 · A3 3 → 감소 7(체결 3 + 취소 4 = 2번 정확) · A3 5(쌓임) → 감소 2(체결 2 · 3 남김)
    const r = fifoReplay([B(10), B(14), A(3), B(7), A(5), B(5)]);
    expect(r.orders.map((o) => [o.rem, o.filled, o.zeroBy])).toEqual([
      [5, 5, null],
      [0, 0, "cancel"],
    ]);
    expect(r.stats).toEqual({ adds: 2, fills: 2, cancelExact: 1, cancelAmbig: 0, cancelNone: 0 });
  });
});

describe("matchQueuePieces", () => {
  it("한 게이트웨이 — wire 순 부분열 · 직전 짝 뒤 · 못 찾으면 -1 이고 다음 조각은 직전 짝 위치에서 계속", () => {
    const m = matchQueuePieces([5, 7, 5, 9, 7], [{ gateway: "KB120", qtys: [5, 9, 3, 7] }]);
    expect(m.at).toEqual([[0, 3, -1, 4]]);
    expect(m.est).toBe(false);
  });

  it("수량 패턴이 달라 한 순서만 모두 짝지어지면 그 순서(추정 아님) — 실측 10/22 꼴", () => {
    // 교보 먼저면 KB 의 23333 이 교보 23333 뒤로 밀려 18691 이 없다
    const adds = [23333, 18691, 23333];
    const m = matchQueuePieces(adds, [
      { gateway: "KB120", qtys: [23333, 18691] },
      { gateway: "KYOBO119", qtys: [23333] },
    ]);
    expect(m.at).toEqual([[0, 1], [2]]);
    expect(m.est).toBe(false);
    // 게이트웨이 순서를 거꾸로 넣어도 LAUNCH_ORDER 가 아니라 성립성이 정한다
    const flip = matchQueuePieces([23333, 23333, 18691], [
      { gateway: "KB120", qtys: [23333, 18691] },
      { gateway: "KYOBO119", qtys: [23333] },
    ]);
    expect(flip.at).toEqual([[1, 2], [0]]);
    expect(flip.est).toBe(false);
  });

  it("두 순서 모두 성립하면 LAUNCH_ORDER(KB120 → KYOBO119) + est", () => {
    const m = matchQueuePieces([1, 1, 1, 1], [
      { gateway: "KYOBO119", qtys: [1, 1] },
      { gateway: "KB120", qtys: [1, 1] },
    ]);
    // 입력 groups 순서와 무관하게 KB120 이 먼저
    expect(m.at).toEqual([
      [2, 3],
      [0, 1],
    ]);
    expect(m.est).toBe(true);
  });

  it("어느 순서도 전부 못 맞추면 짝 수가 많은 순서", () => {
    const m = matchQueuePieces([7, 5], [
      { gateway: "KB120", qtys: [5] },
      { gateway: "KYOBO119", qtys: [7, 9] },
    ]);
    // KB 먼저: 5→1 · 7→없음 · 9→없음 = 1 / 교보 먼저: 7→0 · 9→없음 · 5→1 = 2
    expect(m.at).toEqual([[1], [0, -1]]);
    expect(m.est).toBe(false);
  });
});

const a3 = (seq: number, bs: string, px: number, qty: number, tNs: bigint): RunRowIn => ({
  a3: true,
  seq,
  bs: bs.charCodeAt(0),
  px,
  qty,
  tNs,
});
const b6 = (seq: number): RunRowIn => ({ a3: false, seq, bs: 32, px: 0, qty: 0, tNs: 0n });

describe("aggressorRunsOf", () => {
  it("직전도 A3 ∧ seq 연속 ∧ 같은 bs 면 한 런 · B6 · seq 틈 · bs 바뀜은 끊는다(µs 간격 기준 없음)", () => {
    const runs = aggressorRunsOf([
      a3(1, "2", 100, 1, 10n),
      a3(2, "2", 101, 2, 9_000_000_000n), // 시간 간격이 커도 같은 런
      b6(3),
      a3(4, "2", 101, 3, 30n),
      a3(6, "2", 101, 4, 40n), // seq 틈
      a3(7, "1", 99, 5, 50n), // bs 바뀜
    ]);
    expect(runs.map((r) => [r.bs, r.startNs, r.px, r.qty])).toEqual([
      [50, 10n, [100, 101], [1, 2]],
      [50, 30n, [101], [3]],
      [50, 40n, [101], [4]],
      [49, 50n, [99], [5]],
    ]);
  });
});

const run = (bs: string, startNs: bigint, fills: [number, number][]): AggressorRun => ({
  bs: bs.charCodeAt(0),
  startNs,
  px: fills.map((f) => f[0]),
  qty: fills.map((f) => f[1]),
});

describe("runValueOf", () => {
  const S = 1_000_000_000n;
  const runs = [
    run("2", 99n, [[100, 9]]), // 기준시각 전 — 후보 아님
    run("2", 100n, [[159000, 2]]),
    run("1", 101n, [[158000, 50]]), // 반대 방향
    run("2", 102n, [
      [159300, 1],
      [159400, 2],
    ]),
    run("2", 103n, [[160200, 7]]), // 한도 밖
    run("2", 100n + S, [[159000, 30]]), // 1초 창 밖
  ];

  it("체결 — (px, qty) 열이 같은 첫 미점유 런 · 앞 = 앞선 후보 런들의 한도 안 체결", () => {
    const taken = new Uint8Array(runs.length);
    const v = runValueOf(runs, taken, {
      side: "buy",
      baseNs: 100n,
      price: 160100,
      fills: [
        [159300, 1],
        [159400, 2],
      ],
    });
    expect(v).toMatchObject({
      kind: "run",
      matched: true,
      rank: 2,
      ahead_n: 1,
      ahead_qty: 2,
      ahead_amt: 318000,
      fill_qty: 3,
      fill_px_min: 159300,
      fill_px_max: 159400,
      end_state: null,
      order_est: false,
    });
    expect(taken[3]).toBe(1);
    // 같은 열 두 번째 조각은 점유된 런을 건너뛰어 못 찾는다
    const again = runValueOf(runs, taken, { side: "buy", baseNs: 100n, price: 160100, fills: [[159300, 1], [159400, 2]] });
    expect(again.matched).toBe(false);
    expect(again.rank).toBeNull();
  });

  it("미체결 — 순번 없음 · [기준, 기준 + 1초) 후보 런의 한도 안 합(매수 px ≤ 가격)", () => {
    const v = runValueOf(runs, new Uint8Array(runs.length), { side: "buy", baseNs: 100n, price: 160100, fills: [] });
    expect(v).toMatchObject({
      matched: true,
      rank: null,
      ahead_n: 2,
      ahead_qty: 5,
      ahead_amt: 2 * 159000 + 159300 + 2 * 159400,
      fill_qty: 0,
      fill_px_min: null,
      fill_px_max: null,
    });
  });

  it("미체결 매도 — 한도 안 = px ≥ 가격 · 한도 안 런이 없으면 0건", () => {
    const v = runValueOf(runs, new Uint8Array(runs.length), { side: "sell", baseNs: 100n, price: 158000, fills: [] });
    expect(v).toMatchObject({ ahead_n: 1, ahead_qty: 50, ahead_amt: 50 * 158000 });
    const none = runValueOf(runs, new Uint8Array(runs.length), { side: "sell", baseNs: 100n, price: 158500, fills: [] });
    expect(none).toMatchObject({ matched: true, ahead_n: 0, ahead_qty: 0, ahead_amt: 0 });
  });
});
