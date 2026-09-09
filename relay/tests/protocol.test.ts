/**
 * Phase 16 Plan 03 — TRADE-03. wss 인바운드 스키마 경계 테스트.
 *
 * 검증 대상은 **경계에서 확정적으로 거부되는가**다. 이 층을 통과한 값은 어떤 핸들러에도
 * 그대로 닿으므로(브라우저는 인증됐어도 바디는 신뢰 대상이 아니다), "대충 통과시키고
 * 나중에 서버가 걸러 주겠지"가 성립하지 않는다.
 *
 * 특히 게이트웨이는 **거부를 응답 코드로 주지 않는다** — 범위를 벗어난 설정을 받으면
 * 게이트를 눕혀 저장하고 `ServerMessage ERROR` 만 따로 보낸다. 그래서 relay 의 범위 경계가
 * 서버 검증과 어긋나면 "보냈는데 왜 안 켜지지"가 그대로 사용자 몫이 된다 (T-16-05).
 *
 * 하지 않는 것:
 *   - 계좌 소유권을 검증하지 않는다. 이 층은 **형식만** 본다 — `session.allowedAccounts`
 *     대조는 세션을 쥔 핸들러의 책임이다 (T-16-01). 여기 통과가 곧 권한이 아니다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_VI_ORDER_AMOUNT_KRW } from "@gh-radar/shared";

import { parseInbound } from "../src/ws/protocol.js";
import { OrderBuildError, buildSetVITriggerReq } from "../src/dma/envelope.js";
import { logger } from "../src/logger.js";

const ISIN = "KR7005930003";
const ACCOUNT_NO = "1234567890";

/**
 * 유효한 `lc.set` cfg 32필드. 값은 WinForms 기본값(`LimitChaserForm`)을 따른다 —
 * 고정 3(`sweepRecalcEnabled:true` · `sweepMinCount:0` · `sweepMinRate:0`) 포함.
 *
 * ★ `market` 이 없다 (WR-03 / D-28). 시장 구분은 relay 가 `SymbolMap` 으로 푼다.
 */
function lcCfg(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    isin: ISIN,
    accountNo: ACCOUNT_NO,
    crud: "C",
    buyOrderPrice: 70_000,
    buyOrderQty: 10,
    buyWatchPrice: 70_000,
    buyWatchQty: 10_000,
    buyMinTradeQty: 30_000,
    buyWatchSide: "0",
    buyTradeQtyEnabled: false,
    buyEnabled: false,
    sellOrderPrice: 70_000,
    sellWatchPrice: 70_000,
    sellWatchQty: 10,
    sellMinTradeQty: 30_000,
    sellEnabled: false,
    sellTradeQtyEnabled: false,
    sweepWatchPrice: 70_000,
    sweepEnabled: false,
    sweepMinTickCount: 3,
    sweepRecalcEnabled: true,
    sweepMinCount: 0,
    sweepMinRate: 0,
    exchange: "KRX",
    sellOrderRatio: 100,
    sellQtyTrackEnabled: false,
    sellQtyTrackRatio: 50,
    buyOrderAmount: 10,
    cancelQtyEnabled: false,
    cancelWatchQty: 10,
    cancelTradeEnabled: false,
    cancelQtyTrackEnabled: false,
    ...overrides,
  };
}

function lcSet(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ t: "lc.set", cfg: lcCfg(overrides) });
}

function viSet(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    t: "vi.set",
    accountNo: ACCOUNT_NO,
    orderAmountKrw: 10_000_000,
    checkRate: 22,
    run: true,
    ...overrides,
  });
}

function orderNew(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    t: "order.new",
    rid: "rid-1",
    isin: ISIN,
    exchange: "KRX",
    side: "B",
    qty: 10,
    price: 70_000,
    accountNo: ACCOUNT_NO,
    ...overrides,
  });
}

function orderCancel(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    t: "order.cancel",
    rid: "rid-2",
    isin: ISIN,
    exchange: "KRX",
    orgOrderNo: "ORD0000001",
    qty: 10,
    price: 70_000,
    accountNo: ACCOUNT_NO,
    ...overrides,
  });
}

describe("parseInbound — 전략·주문 인바운드 6종", () => {
  beforeEach(() => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("① `lc.set` 32필드가 파싱되고 S→C 전용 4필드는 떨어져 나간다", () => {
    // S→C 전용 4개를 일부러 실어 보낸다. 서버가 계산하는 값이라 여기서 걸러지지 않으면
    // "값이 왕복한다"는 착각이 생기고 에코-폼 비교가 오염된다 (Pitfall 6).
    const msg = parseInbound(
      JSON.stringify({
        t: "lc.set",
        cfg: {
          ...lcCfg(),
          sellOrderQty: 999,
          sellQtyTrackBaseline: 888,
          sellEntryLatched: true,
          cancelQtyTrackBaseline: 777,
        },
      }),
    );

    if (msg?.t !== "lc.set") throw new Error("lc.set 으로 좁혀지지 않았습니다");
    expect(msg.cfg.isin).toBe(ISIN);
    expect(msg.cfg.accountNo).toBe(ACCOUNT_NO);
    expect(msg.cfg.sweepRecalcEnabled).toBe(true);
    // 32필드 정확히 — 미지 키가 통과하면 개수가 늘어난다.
    expect(Object.keys(msg.cfg)).toHaveLength(32);
    expect(msg.cfg).not.toHaveProperty("sellOrderQty");
    expect(msg.cfg).not.toHaveProperty("sellQtyTrackBaseline");
    expect(msg.cfg).not.toHaveProperty("sellEntryLatched");
    expect(msg.cfg).not.toHaveProperty("cancelQtyTrackBaseline");
  });

  /*
    WR-03 / D-28 — 시장 구분의 소유자는 relay 다. 브라우저가 `market` 을 실어 보내도 스키마가
    떨어뜨려야 한다. `order.new` 가 이미 같은 규율이고 `lc.set` 만 예외였다: 형식만 보는
    `z.enum(["K","Q"])` 는 `row.market === 'KOSDAQ' ? 'Q' : 'K'` 라는 브라우저의 **추측**을
    통과시켰고, 그 추측이 실계좌 반복 발주 설정으로 굳었다.
  */
  it("① `lc.set` 이 `market` 을 실어 보내도 파싱 결과에 없다 (WR-03 — relay 가 ISIN 으로 푼다)", () => {
    const msg = parseInbound(lcSet({ market: "Q" }));

    if (msg?.t !== "lc.set") throw new Error("lc.set 으로 좁혀지지 않았습니다");
    expect(msg.cfg).not.toHaveProperty("market");
    expect(Object.keys(msg.cfg)).toHaveLength(32);
  });

  it("① `market` 없이 보낸 정상 `lc.set` 은 그대로 통과한다", () => {
    const msg = parseInbound(lcSet());

    if (msg?.t !== "lc.set") throw new Error("lc.set 으로 좁혀지지 않았습니다");
    expect(msg.cfg.isin).toBe(ISIN);
    expect(msg.cfg).not.toHaveProperty("market");
  });

  it("① `lc.set` 은 삭제(`crud:\"D\"`)도 같은 스키마로 받는다", () => {
    const msg = parseInbound(lcSet({ crud: "D" }));

    if (msg?.t !== "lc.set") throw new Error("lc.set 으로 좁혀지지 않았습니다");
    expect(msg.cfg.crud).toBe("D");
  });

  it("① `vi.set` 이 파싱되고 `priceType` 은 받지 않는다", () => {
    // priceType 을 실어 보내도 통과하지 않아야 한다 — 서버 규약 "U" 고정이라 relay 가 채운다.
    // 브라우저가 정할 수 있게 두면 하한가 발주 경로가 열린다.
    const msg = parseInbound(
      JSON.stringify({
        t: "vi.set",
        accountNo: ACCOUNT_NO,
        orderAmountKrw: 1_000_000,
        checkRate: 25,
        run: true,
        priceType: "L",
      }),
    );

    if (msg?.t !== "vi.set") throw new Error("vi.set 으로 좁혀지지 않았습니다");
    expect(msg.orderAmountKrw).toBe(1_000_000);
    expect(msg.checkRate).toBe(25);
    expect(msg.run).toBe(true);
    expect(msg).not.toHaveProperty("priceType");
  });

  it("① `vi.confirm` 이 파싱된다", () => {
    const msg = parseInbound(
      JSON.stringify({ t: "vi.confirm", orderNo: "ORD0000001", confirmed: true }),
    );

    if (msg?.t !== "vi.confirm") throw new Error("vi.confirm 으로 좁혀지지 않았습니다");
    expect(msg.orderNo).toBe("ORD0000001");
    expect(msg.confirmed).toBe(true);
  });

  it("① `strategies.disable` 은 key 생략(전체)과 지정(단건)을 둘 다 받는다", () => {
    const all = parseInbound(JSON.stringify({ t: "strategies.disable" }));
    if (all?.t !== "strategies.disable") throw new Error("strategies.disable 로 좁혀지지 않았습니다");
    expect(all.key).toBeUndefined();

    const one = parseInbound(
      JSON.stringify({ t: "strategies.disable", key: `${ISIN}:${ACCOUNT_NO}:KRX` }),
    );
    if (one?.t !== "strategies.disable") throw new Error("strategies.disable 로 좁혀지지 않았습니다");
    expect(one.key).toBe(`${ISIN}:${ACCOUNT_NO}:KRX`);
  });

  it("① `order.new` 가 파싱되고 `market` 은 받지 않는다", () => {
    // 시장 구분은 relay 가 SymbolMap 으로 채운다 — 브라우저가 실어 보내도 통과하면 안 된다.
    const msg = parseInbound(orderNew({ market: "Q" }));

    if (msg?.t !== "order.new") throw new Error("order.new 로 좁혀지지 않았습니다");
    expect(msg.rid).toBe("rid-1");
    expect(msg.side).toBe("B");
    expect(msg.qty).toBe(10);
    expect(msg).not.toHaveProperty("market");
  });

  it("① `order.cancel` 이 파싱된다", () => {
    const msg = parseInbound(orderCancel());

    if (msg?.t !== "order.cancel") throw new Error("order.cancel 로 좁혀지지 않았습니다");
    expect(msg.orgOrderNo).toBe("ORD0000001");
    expect(msg.qty).toBe(10);
  });

  it("기존 시세 3종(`auth`/`sub`/`unsub`)은 그대로 파싱된다", () => {
    expect(parseInbound(JSON.stringify({ t: "auth", token: "jwt" }))?.t).toBe("auth");
    expect(parseInbound(JSON.stringify({ t: "sub", isin: ISIN, ex: "KRX" }))?.t).toBe("sub");
    expect(parseInbound(JSON.stringify({ t: "unsub", isin: ISIN, ex: "NXT" }))?.t).toBe("unsub");
  });
});

describe("parseInbound — 경계값 거부 (T-16-05)", () => {
  beforeEach(() => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("② `sellQtyTrackRatio: 100` 은 거부된다 (서버 검증 1~90)", () => {
    expect(parseInbound(lcSet({ sellQtyTrackRatio: 100 }))).toBeNull();
    // 경계 안쪽은 통과해야 한다 — 과잉 차단도 조용한 거부다.
    expect(parseInbound(lcSet({ sellQtyTrackRatio: 90 }))).not.toBeNull();
    expect(parseInbound(lcSet({ sellQtyTrackRatio: 1 }))).not.toBeNull();
    expect(parseInbound(lcSet({ sellQtyTrackRatio: 0 }))).toBeNull();
  });

  it("`sellOrderRatio` 는 1~100 밖을 거부한다 (서버 검증과 같은 경계)", () => {
    expect(parseInbound(lcSet({ sellOrderRatio: 0 }))).toBeNull();
    expect(parseInbound(lcSet({ sellOrderRatio: 101 }))).toBeNull();
    expect(parseInbound(lcSet({ sellOrderRatio: 100 }))).not.toBeNull();
  });

  it("ubyte 필드는 255 를 넘기면 거부한다 (서버에서 잘려 다른 값이 되는 것 방지)", () => {
    expect(parseInbound(lcSet({ sweepMinTickCount: 256 }))).toBeNull();
    expect(parseInbound(lcSet({ sweepMinCount: 256 }))).toBeNull();
    expect(parseInbound(lcSet({ sweepMinTickCount: 255 }))).not.toBeNull();
  });

  it("가격·수량은 음수와 소수를 거부한다", () => {
    expect(parseInbound(lcSet({ buyOrderPrice: -1 }))).toBeNull();
    expect(parseInbound(lcSet({ buyOrderQty: 1.5 }))).toBeNull();
  });

  it("ISIN 형식과 계좌번호 길이를 거부한다", () => {
    expect(parseInbound(lcSet({ isin: "005930" }))).toBeNull();
    expect(parseInbound(lcSet({ isin: "kr7005930003" }))).toBeNull();
    expect(parseInbound(lcSet({ accountNo: "" }))).toBeNull();
    expect(parseInbound(lcSet({ accountNo: "1234567890123" }))).toBeNull();
  });

  it("단일 문자 필드는 열거 밖 값을 거부한다 (서버가 첫 글자만 읽어 기본값으로 오인)", () => {
    // `market` 은 이 목록에 없다 — 값을 검증하는 대신 **필드 자체를 받지 않는다**(WR-03).
    expect(parseInbound(lcSet({ crud: "U" }))).toBeNull();
    expect(parseInbound(lcSet({ buyWatchSide: "2" }))).toBeNull();
    expect(parseInbound(lcSet({ exchange: "KOSPI" }))).toBeNull();
  });

  it("③ `vi.confirm` 의 빈 `orderNo` 는 거부된다 (서버가 응답 없이 드롭)", () => {
    expect(
      parseInbound(JSON.stringify({ t: "vi.confirm", orderNo: "", confirmed: true })),
    ).toBeNull();
    expect(
      parseInbound(JSON.stringify({ t: "vi.confirm", orderNo: "12345678901", confirmed: true })),
    ).toBeNull();
  });

  /*
    WR-07 — `vi.set.orderAmountKrw` 는 fbs 상 `ulong` 이다. 상한 없이 통과하면
    `setBigUint64` 가 modulo 2^64 로 감싸 **전혀 다른 금액**이 게이트웨이로 나간다.
    상한값은 `MAX_VI_ORDER_AMOUNT_KRW` 하나가 정본이므로 테스트도 그 상수를 본다 —
    숫자를 다시 적으면 상한을 바꿀 때 테스트가 먼저 거짓말을 한다.
  */
  it("⑥ `vi.set.orderAmountKrw` 는 상한을 넘으면 거부된다 (WR-07 — ulong 감김 차단)", () => {
    expect(parseInbound(viSet({ orderAmountKrw: MAX_VI_ORDER_AMOUNT_KRW + 1 }))).toBeNull();
    expect(parseInbound(viSet({ orderAmountKrw: 1e21 }))).toBeNull();
    expect(logger.warn).toHaveBeenCalled(); // 조용한 드롭 금지 (S-5)
  });

  it("⑥ 상한값 자체와 0 은 통과한다 (과잉 차단도 조용한 거부다)", () => {
    const atLimit = parseInbound(viSet({ orderAmountKrw: MAX_VI_ORDER_AMOUNT_KRW }));
    if (atLimit?.t !== "vi.set") throw new Error("상한값이 거부됐습니다");
    expect(atLimit.orderAmountKrw).toBe(MAX_VI_ORDER_AMOUNT_KRW);
    expect(parseInbound(viSet({ orderAmountKrw: 0 }))).not.toBeNull();
    expect(parseInbound(viSet({ orderAmountKrw: -1 }))).toBeNull();
    expect(parseInbound(viSet({ orderAmountKrw: 1.5 }))).toBeNull();
  });

  it("④ `strategies.disable` 의 65자 key 는 거부된다 (서버 WR-09 상한 64B)", () => {
    expect(
      parseInbound(JSON.stringify({ t: "strategies.disable", key: "k".repeat(65) })),
    ).toBeNull();
    expect(
      parseInbound(JSON.stringify({ t: "strategies.disable", key: "k".repeat(64) })),
    ).not.toBeNull();
  });

  it("⑤ `order.new` 의 `qty: 0` 은 거부된다 (0 은 전량취소가 아니라 즉시 거부)", () => {
    expect(parseInbound(orderNew({ qty: 0 }))).toBeNull();
    expect(parseInbound(orderNew({ price: 0 }))).toBeNull();
    expect(parseInbound(orderNew({ qty: -1 }))).toBeNull();
    expect(parseInbound(orderNew({ side: "X" }))).toBeNull();
    expect(parseInbound(orderNew({ rid: "" }))).toBeNull();
  });

  it("`order.cancel` 은 원주문번호 없이 거부된다", () => {
    expect(parseInbound(orderCancel({ orgOrderNo: "" }))).toBeNull();
    expect(parseInbound(JSON.stringify({ t: "order.cancel", rid: "r", isin: ISIN }))).toBeNull();
  });

  it("`lc.set` 은 필드가 하나라도 빠지면 거부된다 (D-06 전량 전송)", () => {
    const partial = lcCfg();
    delete partial.cancelQtyTrackEnabled;
    expect(parseInbound(JSON.stringify({ t: "lc.set", cfg: partial }))).toBeNull();
  });
});

/**
 * 조립기 자체의 상한 (WR-07 / T-16-38).
 *
 * 스키마가 먼저 막지만 **조립 단계가 모든 호출 경로의 마지막 관문**이어야 한다 — 스키마를
 * 타지 않는 내부 호출이 생겨도 `ulong` 감김은 여기서 끝난다. 세 층(zod·envelope·UI)이
 * 같은 상수를 보는지도 여기서 함께 잠근다.
 */
describe("buildSetVITriggerReq — 금액 상한 (WR-07)", () => {
  const cfg = (orderAmountKrw: number) => ({
    accountNo: ACCOUNT_NO,
    orderAmountKrw,
    checkRate: 22,
    run: true,
  });

  it("스키마를 우회해 조립기를 직접 불러도 상한 초과는 BAD_ORDER_AMOUNT 다", () => {
    expect(() => buildSetVITriggerReq(cfg(MAX_VI_ORDER_AMOUNT_KRW + 1))).toThrow(OrderBuildError);
    try {
      buildSetVITriggerReq(cfg(MAX_VI_ORDER_AMOUNT_KRW + 1));
      throw new Error("상한 초과가 통과했습니다");
    } catch (err) {
      expect(err).toBeInstanceOf(OrderBuildError);
      expect((err as OrderBuildError).code).toBe("BAD_ORDER_AMOUNT");
    }
    // `Number.MAX_SAFE_INTEGER` 초과는 이 상한에 이미 포함된다 — 별도 분기가 없어도 막힌다.
    expect(() => buildSetVITriggerReq(cfg(1e21))).toThrow(OrderBuildError);
  });

  it("상한값 자체는 조립된다 (과잉 차단 금지)", () => {
    expect(buildSetVITriggerReq(cfg(MAX_VI_ORDER_AMOUNT_KRW)).length).toBeGreaterThan(0);
    expect(buildSetVITriggerReq(cfg(0)).length).toBeGreaterThan(0);
  });
});

describe("parseInbound — 정보 노출 방지 (T-16-09)", () => {
  /** 전 레벨 로그 인자를 모은다 — 마스킹 검증은 레벨을 가리지 않는다. */
  let logged: unknown[] = [];

  beforeEach(() => {
    logged = [];
    for (const level of ["info", "warn", "error"] as const) {
      vi.spyOn(logger, level).mockImplementation((...args: unknown[]) => {
        logged.push(args);
        return undefined;
      });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("⑥ 스키마 위반 로그에 인바운드 원문·계좌번호가 실리지 않는다", () => {
    const secretAccount = "9876543210";
    const raw = lcSet({ accountNo: secretAccount, sellQtyTrackRatio: 100 });

    expect(parseInbound(raw)).toBeNull();

    const dump = JSON.stringify(logged);
    expect(dump).not.toContain(secretAccount);
    expect(dump).not.toContain(raw);
    expect(dump).not.toContain("lc.set");
    // 남기는 것은 위반 위치와 코드뿐 — `path` 는 필드 이름이지 값이 아니다.
    expect(dump).toContain("cfg.sellQtyTrackRatio");
    expect(logged).toHaveLength(1);
  });

  it("⑥ 첫 메시지(`auth`)의 토큰도 로그에 실리지 않는다", () => {
    const token = "eyJhbGciOi-절대노출금지-토큰";

    expect(parseInbound(JSON.stringify({ t: "auth", token, extra: 1, token2: null }))).not.toBeNull();
    expect(parseInbound(JSON.stringify({ t: "auth", token: "" }))).toBeNull();
    expect(parseInbound(`{"t":"auth","token":"${token}"`)).toBeNull();

    expect(JSON.stringify(logged)).not.toContain(token);
  });

  it("⑥ 주문 메시지의 계좌번호도 로그에 실리지 않는다", () => {
    const secretAccount = "1111222233";

    expect(parseInbound(orderNew({ accountNo: secretAccount, qty: 0 }))).toBeNull();

    expect(JSON.stringify(logged)).not.toContain(secretAccount);
  });
});

describe("parseInbound — 알 수 없는 입력", () => {
  beforeEach(() => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("⑦ 알 수 없는 `t` 는 `null` 이다 (관대한 무시 금지)", () => {
    expect(parseInbound(JSON.stringify({ t: "order", no: "1" }))).toBeNull();
    expect(parseInbound(JSON.stringify({ t: "lc" }))).toBeNull();
    expect(parseInbound(JSON.stringify({ t: "lc.get" }))).toBeNull();
    expect(parseInbound(JSON.stringify({ t: "order.result", rid: "r" }))).toBeNull();
    expect(parseInbound(JSON.stringify({ no: "t 없음" }))).toBeNull();
  });

  it("JSON 이 아니거나 객체가 아니면 `null` 이다", () => {
    expect(parseInbound("보낸적없는쓰레기")).toBeNull();
    expect(parseInbound("[]")).toBeNull();
    expect(parseInbound("null")).toBeNull();
    expect(parseInbound('"lc.set"')).toBeNull();
  });
});
