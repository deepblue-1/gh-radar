import { describe, it, expectTypeOf } from "vitest";
import type {
  KiwoomKa10027Row,
  KiwoomKa10001Row,
  IntradayCloseUpdate,
  IntradayOhlcUpdate,
} from "../kiwoom.js";

/**
 * Phase 09.1 — Plan 02 (Wave 0).
 *
 * 키움 raw + intraday cycle update 4 타입의 컴파일 sanity test.
 * 런타임 assertion 보다 `expectTypeOf` 로 타입 도메인 (nullable, 필수 필드) 을 명시 검증.
 *
 * Wave 1 worker pipeline / Wave 2 server kiwoom client 가 `@gh-radar/shared` 에서
 * 동일 타입을 import 하므로 본 test 가 type contract 의 single-source-of-truth.
 */

describe("kiwoom shared types", () => {
  it("KiwoomKa10027Row 필수 필드만 채워서 컴파일", () => {
    const row: KiwoomKa10027Row = {
      stk_cd: "007460_AL",
      cur_prc: "+6760",
    };
    expectTypeOf(row).toEqualTypeOf<KiwoomKa10027Row>();
  });

  it("KiwoomKa10027Row 모든 옵셔널 필드 채워서 컴파일", () => {
    const row: KiwoomKa10027Row = {
      stk_cd: "007460_AL",
      stk_nm: "광림",
      cur_prc: "+6760",
      pred_pre: "+100",
      flu_rt: "+1.50",
      now_trde_qty: "1234567",
      pred_pre_sig: "2",
      sel_req: "0",
      buy_req: "0",
      cntr_str: "0",
      cnt: "0",
    };
    expectTypeOf(row).toEqualTypeOf<KiwoomKa10027Row>();
  });

  it("KiwoomKa10001Row 필수 필드 (stk_cd + cur_prc + open/high/low_pric)", () => {
    const row: KiwoomKa10001Row = {
      stk_cd: "005930",
      cur_prc: "+70500",
      open_pric: "+70000",
      high_pric: "+71000",
      low_pric: "+69500",
    };
    expectTypeOf(row).toEqualTypeOf<KiwoomKa10001Row>();
  });

  it("IntradayCloseUpdate.changeAmount/changeRate 가 null 허용", () => {
    const u: IntradayCloseUpdate = {
      code: "005930",
      date: "2026-05-14",
      price: 70500,
      changeAmount: null,
      changeRate: null,
      volume: 0,
      tradeAmount: 0,
    };
    expectTypeOf(u.changeAmount).toEqualTypeOf<number | null>();
    expectTypeOf(u.changeRate).toEqualTypeOf<number | null>();
  });

  it("IntradayOhlcUpdate.upperLimit/lowerLimit/marketCap 가 null 허용", () => {
    const u: IntradayOhlcUpdate = {
      code: "005930",
      date: "2026-05-14",
      open: 70000,
      high: 71000,
      low: 69500,
      upperLimit: null,
      lowerLimit: null,
      marketCap: null,
    };
    expectTypeOf(u.upperLimit).toEqualTypeOf<number | null>();
    expectTypeOf(u.lowerLimit).toEqualTypeOf<number | null>();
    expectTypeOf(u.marketCap).toEqualTypeOf<number | null>();
  });
});
