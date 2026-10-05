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

import { MAX_VI_ORDER_AMOUNT_KRW, USER_SETTINGS_RANGES } from "@gh-radar/shared";

import {
  LC_LEGACY_SET_REJECT_TEXT,
  buy3CfgOf,
  parseInbound,
  withNeutralBuy3,
} from "../src/ws/protocol.js";
import { OrderBuildError, buildSetVITriggerReq } from "../src/dma/envelope.js";
import { logger } from "../src/logger.js";

const ISIN = "KR7005930003";
const ACCOUNT_NO = "1234567890";

/**
 * 유효한 `lc.set` cfg 43필드(31 + Phase 24 C→S 12 — 감시대상은 Phase 24 ⑤ 로 빠졌다). 값은 WinForms 기본값(`LimitChaserForm`)을 따른다 —
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
    // Phase 24 C→S 12 — 스키마에서는 선택(구 탭 관용 · 24-03). 부재는 fanout 이 거부한다.
    preBuyEnabled: false,
    extraBuyEnabled: false,
    extraBuyMinQty: 0,
    extraBuyMaxQty: 0,
    extraBuyOrderAmount: 4000,
    extraBuyOrderQty: 0,
    postBuyEnabled: false,
    postBuyReboundPct: 30,
    postBuyFloorQty: 100_000,
    postBuyReentry: 3,
    postBuyOrderAmount: 4000,
    postBuyOrderQty: 0,
    ...overrides,
  };
}

/** Phase 24 C→S 12 — 구 탭 cfg 를 만들 때 뺄 키. */
const BUY3_KEYS = [
  "preBuyEnabled",
  "extraBuyEnabled",
  "extraBuyMinQty",
  "extraBuyMaxQty",
  "extraBuyOrderAmount",
  "extraBuyOrderQty",
  "postBuyEnabled",
  "postBuyReboundPct",
  "postBuyFloorQty",
  "postBuyReentry",
  "postBuyOrderAmount",
  "postBuyOrderQty",
] as const;

/**
 * 새로고침 전 옛 탭이 보내는 cfg — 신필드 12개가 없고 감시대상(`"1"` = 매수잔량)을 싣는다(F-4).
 */
function legacyCfg(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const cfg = lcCfg({ buyWatchSide: "1", ...overrides });
  for (const k of BUY3_KEYS) {
    if (!(k in overrides)) delete cfg[k];
  }
  return cfg;
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

  it("① `lc.set` 43필드가 파싱되고 S→C 전용 필드는 떨어져 나간다", () => {
    // S→C 전용 필드를 일부러 실어 보낸다. 서버가 계산하는 값이라 여기서 걸러지지 않으면
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
          cancelEntryLatched: true,
          // Phase 24 S→C 5 — 전부 떨어져야 한다.
          buy3Schema: 0,
          extraBuyAbandoned: true,
          postBuyTriggerQty: 330_000,
          postBuyReentryLeft: 2,
          postBuyPhase: 2,
          // quick-261002-fim — 후매수 잠금 해제선도 S→C 전용이다. 떨어져야 한다.
          postBuyUnlockQty: 264_000,
        },
      }),
    );

    if (msg?.t !== "lc.set") throw new Error("lc.set 으로 좁혀지지 않았습니다");
    expect(msg.cfg.isin).toBe(ISIN);
    expect(msg.cfg.accountNo).toBe(ACCOUNT_NO);
    expect(msg.cfg.sweepRecalcEnabled).toBe(true);
    // 43필드 정확히 — 미지 키가 통과하면 개수가 늘어난다.
    expect(Object.keys(msg.cfg)).toHaveLength(43);
    expect(msg.cfg).not.toHaveProperty("sellOrderQty");
    expect(msg.cfg).not.toHaveProperty("sellQtyTrackBaseline");
    expect(msg.cfg).not.toHaveProperty("sellEntryLatched");
    expect(msg.cfg).not.toHaveProperty("cancelQtyTrackBaseline");
    expect(msg.cfg).not.toHaveProperty("cancelEntryLatched");
    // buy3Schema 는 relay 가 못박는다 — 브라우저가 0 을 실어도 스키마가 떨어뜨린다(T-24-01).
    for (const k of [
      "buy3Schema",
      "extraBuyAbandoned",
      "postBuyTriggerQty",
      "postBuyReentryLeft",
      "postBuyPhase",
      "postBuyUnlockQty",
    ]) {
      expect(msg.cfg).not.toHaveProperty(k);
    }
  });

  it("①-buy3 후매수 반등률 · 최대 횟수 범위 (Phase 24 · T-24-03)", () => {
    // 끄는 쪽 0 은 통과 — 레거시 에코 0 이 소켓 종료가 되지 않게(RESEARCH Pitfall 4).
    expect(parseInbound(lcSet({ postBuyReboundPct: 0, postBuyEnabled: false }))).not.toBeNull();
    // 켜는 쪽은 1~100(서버 §9-2 ⑤ 동형).
    expect(parseInbound(lcSet({ postBuyReboundPct: 0, postBuyEnabled: true }))).toBeNull();
    expect(parseInbound(lcSet({ postBuyReboundPct: 1, postBuyEnabled: true }))).not.toBeNull();
    expect(parseInbound(lcSet({ postBuyReboundPct: 100, postBuyEnabled: true }))).not.toBeNull();
    expect(parseInbound(lcSet({ postBuyReboundPct: 101 }))).toBeNull();
    // 최대 횟수 — 0(사지 않음, gh-trade D-30) · 255 통과, 256 거부.
    expect(parseInbound(lcSet({ postBuyReentry: 0 }))).not.toBeNull();
    expect(parseInbound(lcSet({ postBuyReentry: 255 }))).not.toBeNull();
    expect(parseInbound(lcSet({ postBuyReentry: 256 }))).toBeNull();
    // 최소 > 최대는 zod 로 막지 않는다 — 서버가 그 그룹만 눕힌다(zod 위반은 소켓을 끊는다).
    expect(parseInbound(lcSet({ extraBuyMinQty: 200_000, extraBuyMaxQty: 100_000 }))).not.toBeNull();
  });

  /*
    24-03 구 탭 관용 (RESEARCH F-4 · Pitfall 3). 신필드는 스키마에서 **선택**이다 — 부재 판정은
    fanout 의 `buy3CfgOf` 한 곳이고, 스키마는 기본값을 채우지 않는다(채우면 옛 탭 프레임이 조용히
    새 클라 등록이 된다). 소켓을 끊는 zod 위반이 되지 않게 하는 것이 목적이다.
  */
  it("①-legacy 신필드 12개가 없는 옛 cfg 도 스키마는 통과하고 buy3CfgOf 는 null 이다 (Phase 24 F-4)", () => {
    const msg = parseInbound(JSON.stringify({ t: "lc.set", cfg: legacyCfg() }));
    if (msg?.t !== "lc.set") throw new Error("옛 cfg 가 스키마에서 떨어졌습니다 — 소켓 종료 경로");
    expect(buy3CfgOf(msg.cfg)).toBeNull();
    expect(LC_LEGACY_SET_REJECT_TEXT).toBe("매수 설정 방식이 바뀌었어요 — 화면을 새로고침해 주세요");
  });

  it("①-legacy-b 12개가 다 있으면 buy3CfgOf 가 같은 값의 cfg 를, 하나만 빠져도 null 을 돌려준다", () => {
    const full = parseInbound(lcSet({ preBuyEnabled: true, postBuyReentry: 7 }));
    if (full?.t !== "lc.set") throw new Error("lc.set 으로 좁혀지지 않았습니다");
    expect(buy3CfgOf(full.cfg)).toEqual(full.cfg);

    for (const k of BUY3_KEYS) {
      const cfg = lcCfg();
      delete cfg[k];
      const msg = parseInbound(JSON.stringify({ t: "lc.set", cfg }));
      if (msg?.t !== "lc.set") throw new Error(`${k} 하나 빠진 cfg 가 스키마에서 떨어졌습니다`);
      expect(buy3CfgOf(msg.cfg), k).toBeNull();
    }
  });

  it("①-legacy-c 옛 cfg 라도 신필드가 **있는데** 범위 밖이면 여전히 스키마 위반이다", () => {
    expect(parseInbound(JSON.stringify({ t: "lc.set", cfg: legacyCfg({ postBuyReentry: 256 }) }))).toBeNull();
    expect(
      parseInbound(JSON.stringify({ t: "lc.set", cfg: legacyCfg({ postBuyReboundPct: 101 }) })),
    ).toBeNull();
    // 반등률 규칙은 값이 있을 때만 본다 — 후매수 ON 이면서 반등률 0 은 여전히 위반.
    expect(
      parseInbound(
        JSON.stringify({
          t: "lc.set",
          cfg: legacyCfg({ postBuyEnabled: true, postBuyReboundPct: 0 }),
        }),
      ),
    ).toBeNull();
    // 반등률이 없으면 superRefine 은 판정하지 않는다(부재는 fanout 이 거부한다).
    expect(
      parseInbound(JSON.stringify({ t: "lc.set", cfg: legacyCfg({ postBuyEnabled: true }) })),
    ).not.toBeNull();
  });

  it("①-watch 감시대상 키는 입력 계약에 없다 — 옛 탭이 \"1\" 을 실어도 통과하고 파싱 결과에 없다 (Phase 24 ⑤ · T-24-13)", () => {
    for (const side of ["0", "1", "2"]) {
      const msg = parseInbound(lcSet({ buyWatchSide: side }));
      if (msg?.t !== "lc.set") throw new Error(`감시대상 ${side} 가 스키마에서 떨어졌습니다 — 소켓 종료 경로`);
      expect(msg.cfg).not.toHaveProperty("buyWatchSide");
      expect(Object.keys(msg.cfg)).toHaveLength(43);
    }
  });

  it("①-legacy-d withNeutralBuy3 는 12키를 false/0 으로 채운다 — 철거 프레임 전용", () => {
    const msg = parseInbound(JSON.stringify({ t: "lc.set", cfg: legacyCfg({ buyEnabled: false }) }));
    if (msg?.t !== "lc.set") throw new Error("lc.set 으로 좁혀지지 않았습니다");
    const cfg = withNeutralBuy3(msg.cfg);
    expect(cfg).toMatchObject({
      preBuyEnabled: false,
      extraBuyEnabled: false,
      extraBuyMinQty: 0,
      extraBuyMaxQty: 0,
      extraBuyOrderAmount: 0,
      extraBuyOrderQty: 0,
      postBuyEnabled: false,
      postBuyReboundPct: 0,
      postBuyFloorQty: 0,
      postBuyReentry: 0,
      postBuyOrderAmount: 0,
      postBuyOrderQty: 0,
    });
    expect(cfg.isin).toBe(ISIN);
    expect(buy3CfgOf(cfg)).not.toBeNull();
  });

  /*
    quick-260929-vzy — 후매수 ☐자동. `postBuyAuto` 는 선택이고 12필드 존재 판정(`buy3CfgOf`) 밖이다(D-02).
    브라우저는 buy3_schema 를 고를 수 없다 — 조립기가 `postBuyAuto` 존재로만 파생한다(T-vzy-01).
  */
  it("①-auto 새 탭 cfg(12 + postBuyAuto)는 통과하고 44키 · 12 만 있고 자동이 없어도 새 클라 · 자동이 12를 대신하지 않는다 (D-02)", () => {
    const full = parseInbound(lcSet({ postBuyAuto: true, buy3Schema: 2 }));
    if (full?.t !== "lc.set") throw new Error("lc.set 으로 좁혀지지 않았습니다");
    expect(full.cfg.postBuyAuto).toBe(true);
    expect(Object.keys(full.cfg)).toHaveLength(44);
    // 브라우저가 실은 buy3Schema 는 파싱 결과에 없다.
    expect(full.cfg).not.toHaveProperty("buy3Schema");
    expect(buy3CfgOf(full.cfg)).not.toBeNull();

    // 12 는 있고 postBuyAuto 가 없는 cfg(옛 새 탭) — 여전히 새 클라다.
    const noAuto = parseInbound(lcSet());
    if (noAuto?.t !== "lc.set") throw new Error("lc.set 으로 좁혀지지 않았습니다");
    expect(noAuto.cfg).not.toHaveProperty("postBuyAuto");
    expect(buy3CfgOf(noAuto.cfg)).not.toBeNull();

    // postBuyAuto 는 있고 12 중 하나가 빠진 cfg — 구 탭(null).
    for (const k of BUY3_KEYS) {
      const cfg = lcCfg({ postBuyAuto: true });
      delete cfg[k];
      const msg = parseInbound(JSON.stringify({ t: "lc.set", cfg }));
      if (msg?.t !== "lc.set") throw new Error(`${k} 하나 빠진 cfg 가 스키마에서 떨어졌습니다`);
      expect(buy3CfgOf(msg.cfg), k).toBeNull();
    }

    // 형식 위반은 스키마 위반이다.
    expect(parseInbound(lcSet({ postBuyAuto: "true" }))).toBeNull();
  });

  /*
    quick-261003-rc4 — 추가매수 ☐버스트 시 해제. `extraBuyBurstRelease` 도 선택이고 12필드 존재 판정 밖이다.
    buy3_schema 3 은 조립기가 필드 존재로만 파생한다(D-01 · T-rc4-01).
  */
  it("①-burst 새 탭 cfg(12 + postBuyAuto + extraBuyBurstRelease)는 통과하고 45키 · 없어도 통과(구 탭) · buy3Schema 는 떨어진다 (B7)", () => {
    const full = parseInbound(lcSet({ postBuyAuto: false, extraBuyBurstRelease: true, buy3Schema: 3 }));
    if (full?.t !== "lc.set") throw new Error("lc.set 으로 좁혀지지 않았습니다");
    expect(full.cfg.extraBuyBurstRelease).toBe(true);
    expect(full.cfg.postBuyAuto).toBe(false);
    expect(Object.keys(full.cfg)).toHaveLength(45);
    expect(full.cfg).not.toHaveProperty("buy3Schema");
    expect(buy3CfgOf(full.cfg)).not.toBeNull();

    // 구 탭 — 필드 없음도 통과 · 키를 만들지 않는다.
    const old = parseInbound(lcSet({ postBuyAuto: true }));
    if (old?.t !== "lc.set") throw new Error("lc.set 으로 좁혀지지 않았습니다");
    expect(old.cfg).not.toHaveProperty("extraBuyBurstRelease");
    expect(Object.keys(old.cfg)).toHaveLength(44);

    // withNeutralBuy3 는 extraBuyBurstRelease 를 채우지도 지우지도 않는다.
    expect(withNeutralBuy3(old.cfg)).not.toHaveProperty("extraBuyBurstRelease");
    expect(withNeutralBuy3(full.cfg).extraBuyBurstRelease).toBe(true);

    // 형식 위반은 스키마 위반이다.
    expect(parseInbound(lcSet({ extraBuyBurstRelease: "true" }))).toBeNull();
  });

  it("①-auto-b withNeutralBuy3 는 입력에 없는 postBuyAuto 를 만들지 않는다 · 있으면 그대로 둔다", () => {
    const legacy = parseInbound(JSON.stringify({ t: "lc.set", cfg: legacyCfg({ buyEnabled: false }) }));
    if (legacy?.t !== "lc.set") throw new Error("lc.set 으로 좁혀지지 않았습니다");
    expect(withNeutralBuy3(legacy.cfg)).not.toHaveProperty("postBuyAuto");

    const withAuto = parseInbound(
      JSON.stringify({ t: "lc.set", cfg: legacyCfg({ buyEnabled: false, postBuyAuto: false }) }),
    );
    if (withAuto?.t !== "lc.set") throw new Error("lc.set 으로 좁혀지지 않았습니다");
    expect(withNeutralBuy3(withAuto.cfg).postBuyAuto).toBe(false);
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
    expect(Object.keys(msg.cfg)).toHaveLength(43); // 31 + Phase 24 C→S 12
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

  it("①-vi `vi.set` 은 거래소를 optional 로 받고 미지 값은 거부한다 (17-05 / D-06 / T-17-19)", () => {
    // ① NXT 를 실으면 그대로 좁혀진다 — 거래소가 발주 시장을 가르므로 값이 살아야 한다.
    const nxt = parseInbound(viSet({ exchange: "NXT" }));
    if (nxt?.t !== "vi.set") throw new Error("vi.set 으로 좁혀지지 않았습니다");
    expect(nxt.exchange).toBe("NXT");

    // ② 생략은 정상이다(기존 브라우저가 싣지 않던 값). 기본값은 **조립기가 아니라 호출부**가
    //    채운다 — 스키마 단계에서는 `undefined` 그대로여야 그 구분이 유지된다.
    const omitted = parseInbound(viSet());
    if (omitted?.t !== "vi.set") throw new Error("vi.set 으로 좁혀지지 않았습니다");
    expect(omitted.exchange).toBeUndefined();

    // ③ 미지 값은 끊는다. 새 enum 을 만들지 않고 기존 `ExchangeSchema` 를 재사용하므로
    //    `sub`/`order.new` 와 어휘가 갈릴 수 없다.
    expect(parseInbound(viSet({ exchange: "KOSPI" }))).toBeNull();
    expect(parseInbound(viSet({ exchange: "" }))).toBeNull();
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

  it("② 예약주문 Q-ID 주문번호(`Q`+숫자 9자 = 10자)가 취소 경로를 통과한다 (17-02 / D-07)", () => {
    // 예약 요약 행의 취소는 **원주문번호 = Q-ID** 로 나간다. 지금 zod 는 형식 제한이 없어
    // 통과하지만(`min(1)`), 이 단언은 앞으로 형식 제한이 들어올 때 **깨지라고 두는 회귀
    // 그물**이다 — 깨지면 예약 취소가 relay 에서 조용히 막혔다는 뜻이다.
    const qid = "Q091533123";
    expect(qid).toHaveLength(10);

    const msg = parseInbound(orderCancel({ orgOrderNo: qid }));
    if (msg?.t !== "order.cancel") throw new Error("Q-ID 취소가 relay 가드에 막혔습니다");
    expect(msg.orgOrderNo).toBe(qid);

    // `vi.confirm` 의 `orderNo` 가드(`min(1).max(10)`)도 같은 10자를 거부하지 않는다.
    const confirm = parseInbound(
      JSON.stringify({ t: "vi.confirm", orderNo: qid, confirmed: true }),
    );
    if (confirm?.t !== "vi.confirm") throw new Error("Q-ID 가 vi.confirm 가드에 막혔습니다");
    expect(confirm.orderNo).toBe(qid);
  });

  it("기존 시세 3종(`auth`/`sub`/`unsub`)은 그대로 파싱된다", () => {
    expect(parseInbound(JSON.stringify({ t: "auth", token: "jwt" }))?.t).toBe("auth");
    expect(parseInbound(JSON.stringify({ t: "sub", isin: ISIN, ex: "KRX" }))?.t).toBe("sub");
    expect(parseInbound(JSON.stringify({ t: "unsub", isin: ISIN, ex: "NXT" }))?.t).toBe("unsub");
  });
});

describe("parseInbound — sub 의 lv (quick-260923-ge2)", () => {
  beforeEach(() => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("`lv:\"price\"` 는 그대로 통과한다", () => {
    const msg = parseInbound(JSON.stringify({ t: "sub", isin: ISIN, ex: "KRX", lv: "price" }));
    if (msg?.t !== "sub") throw new Error("sub 가 파싱되지 않았습니다");
    expect(msg.lv).toBe("price");
  });

  it("`lv` 생략은 undefined 다 — 기본 full 은 fanout 이 접는다", () => {
    const msg = parseInbound(JSON.stringify({ t: "sub", isin: ISIN, ex: "KRX" }));
    if (msg?.t !== "sub") throw new Error("sub 가 파싱되지 않았습니다");
    expect(msg.lv).toBeUndefined();
  });

  it("열거 밖 `lv` 는 스키마 위반(null)이다", () => {
    expect(
      parseInbound(JSON.stringify({ t: "sub", isin: ISIN, ex: "KRX", lv: "turbo" })),
    ).toBeNull();
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
    exchange: "KRX" as const,
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

describe("Phase 27 lc.set 자동매도 4필드 — 선택 · 켜면 범위 · 에코 전용 키 strip", () => {
  const AUTO = { autoSellStartCond: 2, autoSellRatioPct: 10, autoSellMethod: 3 };

  it("자동매도 ON + 비율 0 · 51 / 방법 0 · 4 는 위반(close 4400 경로) · ON + 1~50 · 1~3 은 통과", () => {
    expect(parseInbound(lcSet({ ...AUTO, autoSellEnabled: true, autoSellRatioPct: 0 }))).toBeNull();
    expect(parseInbound(lcSet({ ...AUTO, autoSellEnabled: true, autoSellRatioPct: 51 }))).toBeNull();
    expect(parseInbound(lcSet({ ...AUTO, autoSellEnabled: true, autoSellMethod: 0 }))).toBeNull();
    expect(parseInbound(lcSet({ ...AUTO, autoSellEnabled: true, autoSellMethod: 4 }))).toBeNull();
    expect(parseInbound(lcSet({ ...AUTO, autoSellEnabled: true, autoSellRatioPct: 1, autoSellMethod: 1 }))).not.toBeNull();
    expect(parseInbound(lcSet({ ...AUTO, autoSellEnabled: true, autoSellRatioPct: 50, autoSellMethod: 3 }))).not.toBeNull();
  });

  it("자동매도 OFF + 비율 0 · 방법 0 은 통과한다(옛 서버 · 미등록 키 에코 0 이 소켓 종료가 되지 않게)", () => {
    expect(
      parseInbound(lcSet({ autoSellEnabled: false, autoSellStartCond: 0, autoSellRatioPct: 0, autoSellMethod: 0 })),
    ).not.toBeNull();
  });

  it("시작조건은 0~9 — 10 · -1 은 위반 · 형식 위반(문자열)도 위반", () => {
    expect(parseInbound(lcSet({ ...AUTO, autoSellEnabled: false, autoSellStartCond: 10 }))).toBeNull();
    expect(parseInbound(lcSet({ ...AUTO, autoSellEnabled: false, autoSellStartCond: -1 }))).toBeNull();
    expect(parseInbound(lcSet({ ...AUTO, autoSellEnabled: false, autoSellStartCond: 9 }))).not.toBeNull();
    expect(parseInbound(lcSet({ ...AUTO, autoSellEnabled: "true" }))).toBeNull();
  });

  it("에코 전용 4키를 실어 보내면 strip — cfg 에 남지 않고 12필드 존재 판정(buy3CfgOf)에도 무관", () => {
    const msg = parseInbound(
      lcSet({
        postBuyAuto: false,
        extraBuyBurstRelease: false,
        ...AUTO,
        autoSellEnabled: true,
        autoSellState: 3,
        autoSellSoldQty: 6000,
        autoSellBasis: 1,
        autoSellBasisPrice: 13_000,
      }),
    );
    if (msg?.t !== "lc.set") throw new Error("lc.set 으로 좁혀지지 않았습니다");
    for (const k of ["autoSellState", "autoSellSoldQty", "autoSellBasis", "autoSellBasisPrice"]) {
      expect(msg.cfg, k).not.toHaveProperty(k);
    }
    expect(msg.cfg).toMatchObject({ autoSellEnabled: true, ...AUTO });
    expect(Object.keys(msg.cfg)).toHaveLength(49);
    expect(buy3CfgOf(msg.cfg)).not.toBeNull();

    // 구 탭 — 4필드 없음도 통과 · 키를 만들지 않는다(withNeutralBuy3 도 채우지 않는다).
    const old = parseInbound(lcSet({ postBuyAuto: false, extraBuyBurstRelease: false }));
    if (old?.t !== "lc.set") throw new Error("lc.set 으로 좁혀지지 않았습니다");
    expect(old.cfg).not.toHaveProperty("autoSellEnabled");
    expect(withNeutralBuy3(old.cfg)).not.toHaveProperty("autoSellEnabled");
  });
});

describe("Phase 27 autosell.cmd · user.settings.set 인바운드 스키마", () => {
  beforeEach(() => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const cmd = (overrides: Record<string, unknown> = {}): string =>
    JSON.stringify({ t: "autosell.cmd", isin: ISIN, accountNo: ACCOUNT_NO, exchange: "KRX", action: "start", ...overrides });

  /** 서버 내장 기본값(fbs 주석 · 84 present=false 값) — 11값 모두 범위 안. */
  const SETTINGS = {
    preBuyAmount: 4000,
    addBuyAmount: 4000,
    postBuyAmount: 4000,
    postBuyMaxCount: 3,
    postBuyFloorQty: 100_000,
    postBuyReboundPct: 30,
    sellQtyTrackRatio: 55,
    autoSellPeriodSec: 3,
    auctionSellRatioPct: 20,
    autoSellRatioDefaultPct: 10,
    autoSellMethodDefault: 3,
  };
  const set = (s: Record<string, unknown>): string => JSON.stringify({ t: "user.settings.set", s });

  it("autosell.cmd start · stop · NXT 는 통과 — 계약 모양 그대로", () => {
    expect(parseInbound(cmd())).toEqual({
      t: "autosell.cmd",
      isin: ISIN,
      accountNo: ACCOUNT_NO,
      exchange: "KRX",
      action: "start",
    });
    expect(parseInbound(cmd({ action: "stop", exchange: "NXT" }))).toMatchObject({ action: "stop", exchange: "NXT" });
  });

  it("autosell.cmd 위반 — action \"pause\" · 와이어 숫자 1 · ISIN 11자 · 빈 계좌 · 13자 계좌 · 거래소 밖", () => {
    expect(parseInbound(cmd({ action: "pause" }))).toBeNull();
    expect(parseInbound(cmd({ action: 1 }))).toBeNull();
    expect(parseInbound(cmd({ isin: ISIN.slice(0, 11) }))).toBeNull();
    expect(parseInbound(cmd({ accountNo: "" }))).toBeNull();
    expect(parseInbound(cmd({ accountNo: "1234567890123" }))).toBeNull();
    expect(parseInbound(cmd({ exchange: "NYSE" }))).toBeNull();
  });

  it("user.settings.set 11값 범위 안 통과 · 경계값(min · max)도 통과", () => {
    expect(parseInbound(set(SETTINGS))).toEqual({ t: "user.settings.set", s: SETTINGS });
    const mins = Object.fromEntries(Object.entries(USER_SETTINGS_RANGES).map(([k, r]) => [k, r.min]));
    const maxs = Object.fromEntries(Object.entries(USER_SETTINGS_RANGES).map(([k, r]) => [k, r.max]));
    expect(parseInbound(set(mins))).not.toBeNull();
    expect(parseInbound(set(maxs))).not.toBeNull();
  });

  it("user.settings.set 위반 — 매도 주기 0 · 61 · 방법 4 · 동시호가 비율 0 · 소수 · 키 누락", () => {
    expect(parseInbound(set({ ...SETTINGS, autoSellPeriodSec: 0 }))).toBeNull();
    expect(parseInbound(set({ ...SETTINGS, autoSellPeriodSec: 61 }))).toBeNull();
    expect(parseInbound(set({ ...SETTINGS, autoSellMethodDefault: 4 }))).toBeNull();
    expect(parseInbound(set({ ...SETTINGS, auctionSellRatioPct: 0 }))).toBeNull();
    expect(parseInbound(set({ ...SETTINGS, preBuyAmount: 1.5 }))).toBeNull();
    const { postBuyFloorQty: _drop, ...missing } = SETTINGS;
    expect(parseInbound(set(missing))).toBeNull();
  });

  it("범위 밖 하나마다 위반이다 — 11키 전부 max+1 (shared 상수가 zod 의 정본)", () => {
    for (const [k, r] of Object.entries(USER_SETTINGS_RANGES)) {
      expect(parseInbound(set({ ...SETTINGS, [k]: r.max + 1 }))).toBeNull();
      expect(parseInbound(set({ ...SETTINGS, [k]: r.min - 1 }))).toBeNull();
    }
  });

  it("모르는 키(present · 바깥 extra)는 strip — 소켓을 끊지 않는다(.strict() 금지 · T-18-07)", () => {
    const msg = parseInbound(JSON.stringify({ t: "user.settings.set", s: { ...SETTINGS, present: true }, extra: 1 }));
    if (msg?.t !== "user.settings.set") throw new Error("user.settings.set 으로 좁혀지지 않았습니다");
    expect(msg.s).not.toHaveProperty("present");
    expect(msg).not.toHaveProperty("extra");
    expect(msg.s).toEqual(SETTINGS);
  });
});
