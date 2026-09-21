/**
 * Phase 18 Plan 01 — TRADE-07. 주문 인바운드 스키마의 Phase 18 계약 경계 (D-21 / D-22 / D-23).
 *
 * 이 파일이 증명해야 하는 것은 셋이다:
 *   - 정정(`order.modify`)이 wss 경계를 **한 경로로** 통과하고, 원주문번호 없는 정정은
 *     여기서 끝난다(조립기가 한 번 더 막지만 그것에 기대지 않는다).
 *   - 예약 조각 수(`pieceCount`)와 시간외종가 세션(`krxSession`)이 fbs 허용 범위로 **먼저**
 *     좁혀진다 — 게이트웨이가 브로커 전에 거부한다는 사실에 기대지 않는다 (T-18-05).
 *   - `price 0` 은 `krxSession` G2/G3 한 경로로만 열린다 (T-18-04). 무조건 열리면 가격 0 인
 *     지정가가 게이트웨이까지 가서 5초 왕복을 태운다.
 *
 * `relay/tests/protocol.test.ts` 가 Phase 16 의 경계(전략·주문 6종 · 정보 노출)를 잠그고,
 * 이 파일은 Phase 18 이 연 계약만 다룬다. 전부 순수 함수(`parseInbound`) 호출이다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "../../logger.js";
import { parseInbound } from "../protocol.js";

const ISIN = "KR7005930003";
const ACCOUNT_NO = "1234567890";

function modifyFrame(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    t: "order.modify",
    rid: "r-modify-1",
    isin: ISIN,
    exchange: "KRX",
    orgOrderNo: "0000135742",
    side: "B",
    qty: 10,
    price: 71_000,
    accountNo: ACCOUNT_NO,
    ...overrides,
  });
}

// 스키마 위반은 warn 로그를 남긴다 — 테스트 출력을 더럽히지 않게 가린다.
beforeEach(() => {
  vi.spyOn(logger, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseInbound — order.modify (Phase 18 D-21)", () => {
  it("① 정정 프레임이 판별 유니온을 통과하고 필드가 그대로 나온다", () => {
    const msg = parseInbound(modifyFrame());
    if (msg?.t !== "order.modify") throw new Error("order.modify 로 좁혀지지 않았습니다");
    expect(msg).toEqual({
      t: "order.modify",
      rid: "r-modify-1",
      isin: ISIN,
      exchange: "KRX",
      orgOrderNo: "0000135742",
      side: "B",
      qty: 10,
      price: 71_000,
      accountNo: ACCOUNT_NO,
    });
  });

  it("② 원주문번호가 빈 문자열이거나 없으면 거부된다", () => {
    expect(parseInbound(modifyFrame({ orgOrderNo: "" }))).toBeNull();
    expect(parseInbound(modifyFrame({ orgOrderNo: undefined }))).toBeNull();
  });

  it("③ side 가 없거나 B/S 밖이면 거부된다 — 정정은 방향을 실어 온다", () => {
    expect(parseInbound(modifyFrame({ side: undefined }))).toBeNull();
    expect(parseInbound(modifyFrame({ side: "BUY" }))).toBeNull();
  });

  it("④ 수량·가격은 양의 정수만 — 0·음수·소수는 거부된다", () => {
    for (const bad of [{ qty: 0 }, { qty: -1 }, { qty: 1.5 }, { price: 0 }, { price: -1 }, { price: 70_000.5 }]) {
      expect(parseInbound(modifyFrame(bad))).toBeNull();
    }
  });

  it("⑤ 정정에 실린 pieceCount/krxSession 은 조용히 버려진다 — 정정은 조각·세션을 바꾸지 않는다", () => {
    const msg = parseInbound(modifyFrame({ pieceCount: 5, krxSession: "G3" }));
    expect(msg).not.toBeNull();
    expect(msg).not.toHaveProperty("pieceCount");
    expect(msg).not.toHaveProperty("krxSession");
  });
});
