/**
 * Phase 15 Plan 04 — RELAY-01. wss 인바운드 zod 스키마 + 아웃바운드 인코더.
 *
 * `server/src/schemas/chat.ts` 규약 이식 — **스키마 파일에는 zod 만** 두고 계약 타입은
 * `@gh-radar/shared` 에서 가져온다. wss 는 인터넷에 직접 노출되는 신뢰 경계이므로
 * 여기를 통과하지 않은 값은 어떤 핸들러에도 닿지 않는다.
 *
 * 결정 근거:
 *   D-11  브라우저가 보낼 수 있는 것은 아래 판별 유니온에 실린 **13종뿐**이다 — 시세 3종
 *         (`auth`/`sub`/`unsub`) + 전략 7종 + 주문 3종(신규·정정·취소 — 정정은 Phase 18 D-21). 그 외 형태는 프로토콜 위반이고
 *         close(4400) 로 끝난다 — 관대하게 무시하면 공격 표면이 늘어난다.
 *         Phase 27 이 전략 2종을 더했다 — `autosell.cmd`(41 자동매도 바로시작/중지 · 계좌 실림) ·
 *         `user.settings.set`(42 사용자 설정 11값 전체 교체 · 계좌 축 없음).
 *   D-01  전략 메시지(`lc.set`/`vi.set`/`vi.confirm`/`strategies.disable`)를 **이 소켓으로
 *         받는다**. relay 가 FlatBuffer 로 바꿔 그 사용자의 DMA 세션으로 보낸다.
 *   D-02  주문(`order.new`/`order.modify`/`order.cancel`)도 **이 소켓으로 받는다**. Phase 15 의
 *         `POST /api/orders` 는 16-16 에서 제거되고 `GET /api/orders` 만 남는다.
 *   D-33  구독 키는 `isin + exchange` 다. ISIN 은 12자 고정이라 길이·형식을 여기서 굳힌다.
 *   D-34  **와이어 계약은 전부 number** 다. 64비트 정수가 직렬화 경로까지 흘러오면 즉시
 *         throw 해 "브라우저에서만 깨지는" 사고를 서버에서 잡는다.
 *
 * 하지 않는 것:
 *   - 아웃바운드를 zod 로 검증하지 않는다. 아웃바운드는 relay 가 만든 값이고 타입이 이미
 *     계약이다 — 런타임 검증을 두 벌 두면 매 프레임 비용만 늘어난다(10Hz × 사용자 수).
 *   - **값의 의미**를 검증하지 않는다. 이 층의 책임은 형식과 범위까지다. 계좌 소유권 대조는
 *     세션을 쥔 핸들러가 `session.allowedAccounts` 로 한다 (T-16-01) — 여기를 통과했다고
 *     그 계좌에 대한 권한이 있는 것이 **아니다**. `accountNo` 를 형식만 보고 흘리는 이유가
 *     이것이고, 그래서 이 파일에는 화이트리스트가 없다.
 */
import { z } from "zod";
import { MAX_VI_ORDER_AMOUNT_KRW, USER_SETTINGS_RANGES } from "@gh-radar/shared";
import type {
  RelayExchange,
  RelayLimitChaserInput,
  RelayOutbound,
  RelayUserSettingsValues,
} from "@gh-radar/shared";
import type { LcSetCfg } from "../dma/envelope.js";

import { logger } from "../logger.js";

/**
 * ISIN 12자 (ISO 6166): 앞 2자 국가코드 + 영숫자 9자 + 체크디지트.
 * 체크디지트 산술 검증까지 하지 않는 이유는 게이트웨이가 정본이고, 여기서는 **형식**만
 * 걸러 파서·로그·키 공간을 보호하면 충분하기 때문이다.
 */
const IsinSchema = z
  .string()
  .length(12)
  .regex(/^[A-Z]{2}[A-Z0-9]{10}$/);

/** 거래소 (D-04). 계약(`RelayExchange`)과 같은 집합이다. */
const ExchangeSchema = z.enum(["KRX", "NXT"]);

/**
 * 구독 수준 (quick-260923-ge2). 계약(`RelaySubLevel`)과 같은 집합이다.
 *
 * 열거 밖 문자열은 `ex` 와 같은 규율로 **스키마 위반(close 4400)** 이다. 「모르는 값은 FULL 로
 * 접는다」 는 hub 가 업스트림 바이트를 만들 때의 규칙이고, 브라우저 표면에서는 유일한
 * 클라이언트(webapp) 가 어휘를 공유하므로 관대함이 곧 공격 표면이다.
 */
const SubLevelSchema = z.enum(["full", "price"]);

/**
 * 첫 메시지 (D-11). 상한 4096자는 Supabase 액세스 토큰(JWT)의 넉넉한 상한이다 —
 * 상한이 없으면 `maxPayload` 64KB 까지 통째로 검증 경로에 실린다.
 */
export const RelayAuthSchema = z.object({
  t: z.literal("auth"),
  token: z.string().min(1).max(4096),
});

export const RelaySubSchema = z.object({
  t: z.literal("sub"),
  isin: IsinSchema,
  ex: ExchangeSchema,
  /** 생략 = full. 기본값은 fanout 이 접는다(스키마는 생략을 그대로 둔다). */
  lv: SubLevelSchema.optional(),
});

export const RelayUnsubSchema = z.object({
  t: z.literal("unsub"),
  isin: IsinSchema,
  ex: ExchangeSchema,
});

/**
 * 계좌번호. 게이트웨이가 12자 버퍼에 절단해 담으므로 그 상한을 그대로 쓴다.
 *
 * ⚠️ **형식만 본다.** 이 값이 요청자의 계좌인지는 여기서 알 수 없다 — 세션을 쥔 핸들러가
 *    `session.allowedAccounts` 로 대조한다 (T-16-01).
 */
const AccountNoSchema = z.string().min(1).max(12);

/** 게이트웨이 uint 필드(가격·수량·금액). 음수와 소수를 여기서 자른다. */
const UIntSchema = z.number().int().min(0);

/** 게이트웨이 ubyte 필드(0~255). 넘치면 서버에서 잘려 **다른 값**이 된다. */
const UByteSchema = z.number().int().min(0).max(255);

/** 요청 상관 키. 브라우저가 만들고 `order.result` 로 되돌아온다. 로그 키로도 쓰이므로 상한을 둔다. */
const RidSchema = z.string().min(1).max(64);

/*
  전략 키(`ISIN:accountNo:exchange`) 조각 판정 3종.

  **위 스키마를 그대로 재사용한다** — 정규식·상한·거래소 집합을 다른 파일에 다시 적으면
  가드가 두 벌이 되고, 한쪽만 고쳐지면 「한 경로로는 통과하고 다른 경로로는 막히는」
  비대칭이 조용히 생긴다. `lc.arm` 의 키는 필드 셋이 한 문자열에 붙어 오므로
  (`fanout.ts` 의 `#armLatchAccount`) 스키마 객체가 아니라 **술어**가 필요하다.
*/

/** ISIN 12자 형식인가 (`RelaySubSchema.isin` 과 **같은 판정**). */
export function isValidIsin(value: string): boolean {
  return IsinSchema.safeParse(value).success;
}

/** 계좌번호 형식인가 — 1~12자 (`lc.set`/`order.*` 의 `accountNo` 와 **같은 판정**). */
export function isValidAccountNo(value: string): boolean {
  return AccountNoSchema.safeParse(value).success;
}

/** 거래소 값인가 — `KRX`/`NXT` (계약 `RelayExchange` 와 **같은 집합**). */
export function isRelayExchange(value: string): value is RelayExchange {
  return ExchangeSchema.safeParse(value).success;
}

/**
 * 상따 설정 (`lc.set`, D-01/D-06). `cfg` 는 **32필드 전부**다 — 부분 갱신이 없다.
 *
 * 범위 경계를 게이트웨이 검증과 **같은 값**으로 잡는다. 서버는 범위를 벗어난 설정을 거부하는
 * 대신 **게이트를 눕혀서 저장**하고 `ServerMessage ERROR` 만 따로 보내기 때문이다(조용한 거부).
 * 여기서 먼저 자르지 않으면 "보냈는데 왜 안 켜지지"가 사용자 몫으로 남는다 (T-16-05).
 *
 * ⚠️ **S→C 전용 필드(`sellOrderQty`·`sellQtyTrackBaseline`·`sellEntryLatched`·
 *    `cancelQtyTrackBaseline`·`cancelEntryLatched` · Phase 24 의 `buy3Schema`·`extraBuyAbandoned`·
 *    `postBuyTriggerQty`·`postBuyReentryLeft`·`postBuyPhase` · quick-260930-fi4 의 `extraBuyAbandonQty` · quick-261002-fim 의 `postBuyUnlockQty` ·
 *    Phase 27 자동매도 에코 `autoSellState`·`autoSellSoldQty`·`autoSellBasis`·`autoSellBasisPrice`)를 두지 않는다** — `buy3Schema` 는
 *    relay 가 `postBuyAuto` · `extraBuyBurstRelease` · 자동매도 요청 4필드 존재로만 1 · 2 · 3 · 4 를 파생한다(브라우저가 0 을
 *    보내 구 클라 경로를 열 수 없다 · `lcBuy3SchemaOf`).
 *    나머지는 서버가 계산해 에코로만 주는 값이라, 받으면
 *    "값이 왕복한다"는 착각이 생기고 에코-폼 비교가 오염된다 (Pitfall 6). `z.object` 가 미지
 *    키를 떨어뜨리므로 실려 와도 통과하지 못한다.
 *
 * ⚠️ **`market` 도 두지 않는다** (WR-03 / D-28). 시장 구분의 소유자는 relay 다 —
 *    `fanout.ts` 의 `lc.set` 분기가 `symbols.lookup(cfg.isin)` 으로 풀어 조립 시점에 채운다.
 *    `order.new` 가 이미 그렇게 하고(`order-handler.ts` 게이트 ③-1) `lc.set` 만 예외였다.
 *    `z.enum(["K","Q"])` 는 **형식만** 볼 뿐 `SymbolMap` 과 대조하지 않으므로, 브라우저의
 *    `market === 'KOSDAQ' ? 'Q' : 'K'` 추측이 그대로 반복 발주 설정이 됐다. 위 4필드와 같은
 *    논리로 **필드를 지운다** — `z.object` 가 미지 키를 떨어뜨리므로 실려 와도 통과하지 못한다.
 *
 * ★ **Phase 24 신필드 12개는 선택이다 = 구 탭 관용(F-4).** 새로고침 전 옛 탭은 신필드 없이 보낸다 —
 *   필수로 두면 zod 위반 = 연결 종료라 옛 탭의 시세 · 에코 · 수동주문까지 멈춘다. 부재 판정은
 *   fanout 의 `buy3CfgOf` **한 곳**이다. 여기서 기본값을 채우지 않는다 — 채우면 옛 탭 프레임이
 *   조용히 새 클라 등록이 된다. 값이 **있으면** 범위 규칙은 그대로 적용된다.
 */
export const RelayLcSetSchema = z.object({
  t: z.literal("lc.set"),
  cfg: z.object({
    isin: IsinSchema,
    accountNo: AccountNoSchema,
    crud: z.enum(["C", "D"]),
    buyOrderPrice: UIntSchema,
    buyOrderQty: UIntSchema,
    buyWatchPrice: UIntSchema,
    buyWatchQty: UIntSchema,
    buyMinTradeQty: UIntSchema,
    // 옛 탭이 실은 감시대상 키는 `z.object` 가 떨어뜨린다(Phase 24 ⑤ · 새 서버는 읽지 않는다).
    buyTradeQtyEnabled: z.boolean(),
    buyEnabled: z.boolean(),
    sellOrderPrice: UIntSchema,
    sellWatchPrice: UIntSchema,
    sellWatchQty: UIntSchema,
    sellMinTradeQty: UIntSchema,
    sellEnabled: z.boolean(),
    sellTradeQtyEnabled: z.boolean(),
    sweepWatchPrice: UIntSchema,
    sweepEnabled: z.boolean(),
    sweepMinTickCount: UByteSchema,
    sweepRecalcEnabled: z.boolean(),
    sweepMinCount: UByteSchema,
    /** BasisPoints(2950 = 29.5%) — `vi.set.checkRate` 의 정수 % 와 단위가 다르다. */
    sweepMinRate: UIntSchema,
    exchange: ExchangeSchema,
    /** 매도 비율 % — 서버 검증과 같은 **1~100**. */
    sellOrderRatio: z.number().int().min(1).max(100),
    sellQtyTrackEnabled: z.boolean(),
    /** 잔량추적 비율 % — 서버 검증과 같은 **1~90**. 100 은 서버가 매도를 눕히므로 여기서 거부한다. */
    sellQtyTrackRatio: z.number().int().min(1).max(90),
    /** 단위 만원. */
    buyOrderAmount: UIntSchema,
    cancelQtyEnabled: z.boolean(),
    cancelWatchQty: UIntSchema,
    cancelTradeEnabled: z.boolean(),
    cancelQtyTrackEnabled: z.boolean(),
    // === Phase 24 매수 3종 C→S 12 (gh-trade D-17) — **선택**(구 탭 관용 · 24-03). 부재는
    //     fanout `buy3CfgOf` 가 판정한다 — 기본값을 여기서 채우지 않는다.
    preBuyEnabled: z.boolean().optional(),
    extraBuyEnabled: z.boolean().optional(),
    /** 추가매수 최소 매수잔량(주). 0 = 1주. 최소>최대는 여기서 막지 않는다 — 서버가 그 그룹만 눕힌다. */
    extraBuyMinQty: UIntSchema.optional(),
    /** 추가매수 최대 매수잔량(주). 0 = 무제한. */
    extraBuyMaxQty: UIntSchema.optional(),
    /** 단위 만원. */
    extraBuyOrderAmount: UIntSchema.optional(),
    extraBuyOrderQty: UIntSchema.optional(),
    postBuyEnabled: z.boolean().optional(),
    /**
     * 후매수 반등률 % — **0~100**. 레거시 에코 0 을 소켓 종료로 만들지 않는다 — RESEARCH Pitfall 4.
     * 「후매수 ON 이면 1~100」 은 아래 `superRefine` 한 규칙이 본다(서버 §9-2 ⑤ 동형).
     */
    postBuyReboundPct: z.number().int().min(0).max(100).optional(),
    postBuyFloorQty: UIntSchema.optional(),
    /** 후매수 최대 횟수(최초 포함). 0 = 사지 않음(gh-trade D-30)도 유효하다. */
    postBuyReentry: UByteSchema.optional(),
    /** 단위 만원. */
    postBuyOrderAmount: UIntSchema.optional(),
    postBuyOrderQty: UIntSchema.optional(),
    // === 후매수 ☐자동(양방향 · gh-trade dcaa78b1 · quick-260929-vzy) — 위 12필드 블록 **밖**이다.
    //   - 12필드 존재 판정(`buy3CfgOf`)에 들어가지 않는다 — 12개를 다 가진 옛 탭 cfg 는 이것 없이도 새 클라다.
    //   - 부재는 relay 가 buy3_schema 1 로 싣는다(서버 값 유지 — 옛 탭이 자동을 지우지 않는다).
    //   - superRefine 에 자동 완결성(수량 · 반등 · 매도비율) 검사를 넣지 않는다 — zod 위반은 소켓 종료이고,
    //     서버가 불완전한 자동을 ERROR 로 눕히는 백스톱이다. 웹이 켜기 전에 사전 검증한다(P-2).
    postBuyAuto: z.boolean().optional(),
    // === 추가매수 ☐버스트 시 해제(양방향 · gh-trade 3dabd6ff · quick-261003-rc4) — postBuyAuto 와 같이 12필드 블록 **밖**이다.
    //   - 12필드 존재 판정(`buy3CfgOf`)에 들어가지 않는다.
    //   - 부재는 relay 가 종전 schema(1/2)로 싣는다(서버 값 유지 — 옛 탭이 체크를 지우지 않는다). postBuyAuto 와 둘 다
    //     있을 때만 buy3_schema 3 이다(조립기 `lcBuy3SchemaOf`).
    //   - superRefine 완결성 검사를 넣지 않는다 — 아무것도 무장하지 않는 설정값이다.
    extraBuyBurstRelease: z.boolean().optional(),
    // === 자동매도 요청 4필드(양방향 · gh-trade 2404509b vtable 140~146 · Phase 27) — postBuyAuto 와 같이 12필드 블록 **밖**이다.
    //   - 12필드 존재 판정(`buy3CfgOf`)에 들어가지 않는다 — 값만 `LcSetCfg` 로 통과한다.
    //   - 넷 다 있고 postBuyAuto · extraBuyBurstRelease 도 있을 때만 buy3_schema 4(조립기 `lcBuy3SchemaOf`). 하나라도
    //     없으면 종전 schema 로 싣고 서버가 저장값을 유지한다(옛 탭이 자동매도를 지우지 않는다).
    //   - 에코 전용 4필드(`autoSellState` 등)는 두지 않는다 — `z.object` 가 미지 키로 떨어뜨린다.
    autoSellEnabled: z.boolean().optional(),
    /** 시작조건 0~9 — 0 = 기준가격 이탈 관측 뒤 다음 체결(서버 §6-6). */
    autoSellStartCond: z.number().int().min(0).max(9).optional(),
    /** 비율 % — 「켜면 1~50」 은 아래 `superRefine` 이 본다(꺼진 채 에코 0 은 통과). */
    autoSellRatioPct: UByteSchema.optional(),
    /** 방법 — 1 매도1호가 · 2 매수1호가 · 3 양쪽. 「켜면 1~3」 은 아래 `superRefine` 이 본다. */
    autoSellMethod: UByteSchema.optional(),
  }).superRefine((cfg, ctx) => {
    // 서버 §9-2 ⑤ 반등률 1~100 과 동형 — 켜는 쪽만 본다(끄는 쪽 0 은 통과).
    // 값이 **있을 때만** 본다 — 부재(구 탭)는 fanout 이 거부 프레임으로 답한다.
    if (
      cfg.postBuyEnabled === true &&
      cfg.postBuyReboundPct !== undefined &&
      cfg.postBuyReboundPct < 1
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["postBuyReboundPct"],
        message: "후매수 ON 이면 반등률은 1~100",
      });
    }
    // 서버 §9-3 ② 「켜는 요청만」 동형 — 자동매도 ON 이면 비율 1~50 · 방법 1~3(값이 실렸을 때만). 꺼진 채 0 은 통과한다
    // (옛 서버 · 미등록 키 에코 0 이 소켓 종료가 되지 않게).
    if (cfg.autoSellEnabled === true) {
      if (
        cfg.autoSellRatioPct !== undefined &&
        (cfg.autoSellRatioPct < 1 || cfg.autoSellRatioPct > 50)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["autoSellRatioPct"],
          message: "자동매도 ON 이면 비율은 1~50",
        });
      }
      if (cfg.autoSellMethod !== undefined && (cfg.autoSellMethod < 1 || cfg.autoSellMethod > 3)) {
        ctx.addIssue({
          code: "custom",
          path: ["autoSellMethod"],
          message: "자동매도 ON 이면 방법은 1~3",
        });
      }
    }
  }),
});

/**
 * VI 전략 설정 (`vi.set`, D-01).
 *
 * `priceType` 은 **받지 않는다** — 서버 규약상 상한가(`"U"`) 고정이라 relay 가 채운다.
 * 브라우저가 정할 수 있게 두면 하한가 발주 경로가 열린다.
 */
export const RelayViSetSchema = z.object({
  t: z.literal("vi.set"),
  accountNo: AccountNoSchema,
  /**
   * **원 단위**. UI 의 만원 입력을 x 10,000 한 값이다.
   *
   * ★ `UIntSchema` 를 쓰지 않는다 — 그것은 상한이 없고, 이 필드는 fbs 상 **`ulong`** 이라
   *   상한 없이 통과하면 `setBigUint64` 가 **modulo 2^64 로 감싸** 전혀 다른 금액이 나간다
   *   (WR-07). 상한값은 `@gh-radar/shared` 의 `MAX_VI_ORDER_AMOUNT_KRW` 하나가 정본이고
   *   envelope 조립기·UI 가 같은 상수를 본다 — 여기에 숫자를 다시 적으면 갈라진다.
   *   (`UIntSchema` 자체는 그대로 둔다. 그것을 공유하는 상따 필드는 `toWireUint` 가 지킨다.)
   */
  orderAmountKrw: z.number().int().min(0).max(MAX_VI_ORDER_AMOUNT_KRW),
  /** 발동 판정 상승률 — 정수 %. 하락 감시를 막지 않으려고 음수를 허용한다. */
  checkRate: z.number().int(),
  run: z.boolean(),
  /**
   * 발주 거래소 (17-05 / D-06). VI 전략은 서버가 **거래소별 1건**으로 관리한다.
   *
   * `optional` 인 이유는 기존 브라우저가 이 값을 싣지 않기 때문이다 — **기본값을 여기 두지
   * 않는다.** 「생략 = KRX」는 `fanout.ts` 의 `vi.set` 분기 한 곳에서만 채운다(조립기에 두면
   * 호출 경로마다 다른 기본값이 생긴다 — T-17-17).
   *
   * ★ 기존 `ExchangeSchema` 를 **재사용한다**. 새 enum 을 만들면 `sub`/`order.new` 와 어휘가
   *   갈려 한쪽만 넓혀지는 날이 온다 (T-17-19). 거래소가 발주 시장을 가르므로 미지 값은
   *   접지 않고 **거부한다** — 조회(21)와 달리 이 요청은 실제로 주문을 낸다.
   */
  exchange: ExchangeSchema.optional(),
});

/**
 * VI 주문 확인 체크 (`vi.confirm`).
 *
 * `orderNo` 가 비면 **서버가 응답 없이 드롭**하므로 애초에 거부한다 — 보내고 기다리는 경로를
 * 만들면 영원히 오지 않는 응답을 기다리게 된다. 상한 10자는 서버 주문번호 폭이다.
 */
export const RelayViConfirmSchema = z.object({
  t: z.literal("vi.confirm"),
  orderNo: z.string().min(1).max(10),
  confirmed: z.boolean(),
});

/**
 * 구 탭 `lc.arm { latch: "buy" }` 에 relay 가 돌려주는 거부 문구(24-UI-SPEC Copywriting 원문).
 *
 * 매수 진입 래치는 gh-trade Phase 24 에서 폐기됐다(38 봉인). 새로고침 전 옛 JS 만 이 값을 보낸다 —
 * 소켓을 끊지 않고(F-4) 이 문구 한 건으로 답한다.
 */
export const LC_LEGACY_ARM_REJECT_TEXT = "매수 진입 래치는 없어졌어요 — 화면을 새로고침해 주세요";

/**
 * 상따 래치 수동 점등 (`lc.arm`, D-04). `latch` 가 `ArmSellLatchReq(36)` ·
 * `ArmCancelLatchReq(37)` 중 하나를 고른다.
 *
 * ★ `latch` enum 의 `"buy"` 는 **한시 관용**이다 — 새로고침 전 옛 탭이 보내면 fanout 이 게이트웨이로
 *   0바이트를 보내고 거부 프레임(`LC_LEGACY_ARM_REJECT_TEXT`)으로 답한다(소켓 유지 · F-4). 여기서
 *   빼면 zod 위반 = 연결 종료라 옛 탭의 시세 · 에코 · 수동주문까지 멈춘다. shared 계약
 *   `RelayLcArmMsg.latch` 는 `"sell" | "cancel"` 로 이미 좁혀졌다. gh-trade `buy_watch_side` 봉인
 *   후속과 함께 걷는다.
 *
 * ⚠️ **`key` 는 빈 문자열을 거부한다.** 서버는 빈 키를 「등록된 상따 전략이 없습니다」로
 *    거부하므로 보내는 것 자체가 낭비이고, C# 정본도 송신을 취소한다
 *    (`client/Services/DMA/Client.cs` `SendArmSellLatch` — "키가 없으면 서버 왕복을 만들지
 *    않는다"). 「보냈는데 사유만 돌아오는」 왕복을 relay 가 먼저 끊는다.
 *
 * ⚠️ **여기서는 형식의 하한만 본다.** 키가 `ISIN:accountNo:exchange` 3토막인지와 그 안의
 *    `accountNo` 가 요청자의 계좌인지는 여기서 알 수 없다 — 세션을 쥔 핸들러가 분해해
 *    `session.allowedAccounts` 로 대조한다 (T-17-11). 이 파일에 화이트리스트가 없는 이유와
 *    같은 논리다.
 *
 * 상한 64자는 **서버 WR-09 와 같은 값**이고 `strategies.disable` 과도 같다(실제 최대 29B).
 * 상한을 두는 목적은 왕복 절약이 아니라 로그 폭 봉쇄다 (T-16-06).
 */
export const RelayLcArmSchema = z.object({
  t: z.literal("lc.arm"),
  key: z.string().min(1).max(64),
  latch: z.enum(["sell", "cancel", "buy"]),
});

/**
 * 자동매도 바로시작 / 중지 (`autosell.cmd` → `AutoSellCommandReq(41)` · Phase 27 — gh-trade `limit-chaser.md` §9-3).
 *
 * `action` 은 문자열이다 — fanout 이 `AUTO_SELL_ACTION_WIRE` 로 1/2 로 바꾼다(`lc.arm` `latch` 선례 · 브라우저는
 * 와이어 숫자를 모른다). `isin` · `accountNo` · `exchange` 는 `lc.set` 과 **같은 스키마**를 재사용한다 — 새로 적으면
 * 어휘가 갈린다. 계좌 소유권은 여기서 보지 않는다(`#accountAllowed` 몫 — 이 파일에 화이트리스트가 없는 이유).
 */
export const RelayAutoSellCmdSchema = z.object({
  t: z.literal("autosell.cmd"),
  isin: IsinSchema,
  accountNo: AccountNoSchema,
  exchange: ExchangeSchema,
  action: z.enum(["start", "stop"]),
});

/** 사용자 설정 1칸 — 정수 · 범위는 shared `USER_SETTINGS_RANGES` 에서 읽는다(리터럴을 다시 쓰지 않는다). */
function userSettingInt(k: keyof RelayUserSettingsValues) {
  return z.number().int().min(USER_SETTINGS_RANGES[k].min).max(USER_SETTINGS_RANGES[k].max);
}

/**
 * 사용자 설정 저장 (`user.settings.set` → `SetUserSettingsReq(42)` · Phase 27).
 *
 * 11값 **전체**가 필수다(서버 42 는 전체 교체 — 빠진 칸을 0 으로 보내면 저장값이 지워진다). 범위는 서버 42 검증
 * 범위 그대로(fbs 주석 = `USER_SETTINGS_RANGES`)이고, 위반은 close(4400) 이라 웹이 같은 상수로 먼저 막는다.
 * `present`(84 전용)는 스키마에 없다 — 실려 와도 zod 기본 strip 으로 버려진다(엄격 모드 금지 · T-18-07).
 */
export const RelayUserSettingsSetSchema = z.object({
  t: z.literal("user.settings.set"),
  s: z.object({
    preBuyAmount: userSettingInt("preBuyAmount"),
    addBuyAmount: userSettingInt("addBuyAmount"),
    postBuyAmount: userSettingInt("postBuyAmount"),
    postBuyMaxCount: userSettingInt("postBuyMaxCount"),
    postBuyFloorQty: userSettingInt("postBuyFloorQty"),
    postBuyReboundPct: userSettingInt("postBuyReboundPct"),
    sellQtyTrackRatio: userSettingInt("sellQtyTrackRatio"),
    autoSellPeriodSec: userSettingInt("autoSellPeriodSec"),
    auctionSellRatioPct: userSettingInt("auctionSellRatioPct"),
    autoSellRatioDefaultPct: userSettingInt("autoSellRatioDefaultPct"),
    autoSellMethodDefault: userSettingInt("autoSellMethodDefault"),
  }),
});

/**
 * 전략 일괄 비활성화 (`strategies.disable`).
 *
 * `key` 생략·`""` 는 전체다. 상한 64자는 **서버 WR-09 와 같은 값**이라 relay 에서 먼저
 * 자른다 — 서버까지 보내고 거부당하는 왕복을 없애고 로그 폭도 함께 묶는다 (T-16-06).
 */
export const RelayStrategiesDisableSchema = z.object({
  t: z.literal("strategies.disable"),
  key: z.string().max(64).optional(),
});

/** 매매구분. 신규·정정이 **같은 스키마**를 쓴다 — 어휘가 둘로 갈리면 한쪽만 넓어진다. */
const OrderSideSchema = z.enum(["B", "S"]);

/**
 * 신규 주문 (`order.new`, D-02).
 *
 * ⚠️ **`market` 을 받지 않는다.** relay 가 `SymbolMap` 으로 ISIN → 시장을 채운다 —
 *    브라우저가 시장 구분을 정하게 두면 엉뚱한 시장으로 주문이 나갈 수 있다 (D-28).
 *
 * `qty` 는 `positive()` 다. 수량 0 은 전량취소가 아니라 즉시 거부이므로(D-44)
 * 조립 단계까지 흘리지 않고 여기서 끝낸다.
 *
 * Phase 18 확장 (D-22 / D-23 / T-18-04 / T-18-05):
 *   - `pieceCount` 정수 1..64(fbs 허용 범위), `krxSession` `"G2"`/`"G3"` 둘뿐. 둘 다 optional —
 *     부재가 곧 기존 수동주문이다. 게이트웨이가 브로커 전에 거부한다는 사실에 기대지 않고 여기서 먼저 좁힌다.
 *   - `price` 는 `nonnegative()` 이고 **0 은 `krxSession` G2/G3 일 때만** `superRefine` 이 통과시킨다.
 *     무조건 열면 가격 0 인 지정가가 게이트웨이까지 가서 거부 왕복 5초를 태운다.
 *
 * ⚠️ **`.strict()` 로 만들지 않는다.** 미지의 키를 조용히 버리는 zod 기본 동작에 기존 smoke 프로브와
 *    구 클라이언트가 기대고 있다 — strict 로 바꾸면 그쪽이 조용히 close(4400) 로 끊긴다(T-18-07).
 *    그 대가로 필드 소실이 **무성**이므로 핸들러가 조립 직전에 두 값을 로그로 남긴다.
 */
export const RelayOrderNewSchema = z
  .object({
    t: z.literal("order.new"),
    rid: RidSchema,
    isin: IsinSchema,
    exchange: ExchangeSchema,
    side: OrderSideSchema,
    qty: z.number().int().positive(),
    price: z.number().int().nonnegative(),
    accountNo: AccountNoSchema,
    pieceCount: z.number().int().min(1).max(64).optional(),
    krxSession: z.enum(["G2", "G3"]).optional(),
  })
  .superRefine((msg, ctx) => {
    if (msg.price === 0 && msg.krxSession === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["price"],
        message: "가격 0 은 시간외종가(krxSession G2/G3)에서만 허용된다",
      });
    }
  });

/**
 * 취소 주문 (`order.cancel`, D-02).
 *
 * `orgOrderNo` 는 필수다 — 원주문번호 없는 취소는 조립 단계에서 어차피 실패한다.
 * `qty` 는 미체결 잔량 전부이고 `0` 은 거부다 (D-44).
 *
 * `price` 는 `nonnegative()` 다 (18-REVIEW CR-01). 취소의 가격은 주문 조건이 아니라 **원주문 가격의
 * 사본**이고 게이트웨이는 취소를 가격으로 판정하지 않는다. 시간외종가(G2/G3) `close_price_mode="zero"`
 * 원주문은 가격 0 으로 접수되므로, 양수만 받으면 그 취소가 close(4400) 로 소켓째 끊긴다 — D-21 이
 * 정정을 잠그고 「취소 후 재등록」을 유일한 조치로 안내하는 바로 그 경로다. 음수·비정수는 여전히
 * 위반이다. 신규·정정 스키마의 가격 규칙은 바꾸지 않는다(D-23). `.strict()` 로 만들지 않는다(T-18-07).
 */
export const RelayOrderCancelSchema = z.object({
  t: z.literal("order.cancel"),
  rid: RidSchema,
  isin: IsinSchema,
  exchange: ExchangeSchema,
  orgOrderNo: z.string().min(1),
  qty: z.number().int().positive(),
  price: z.number().int().nonnegative(),
  accountNo: AccountNoSchema,
});

/**
 * 정정 주문 (`order.modify`, Phase 18 D-21).
 *
 * `RelayOrderCancelSchema` 와 같은 모양에 `side` 를 더한 것이다 — 정정은 원주문번호로
 * 대상을 가리키고(취소와 같다), 정정 후 방향·수량·가격을 싣는다(신규와 같다).
 * `orgOrderNo` 빈 값은 여기서 거부한다. 조립기(`buildDirectOrderReq`)도 같은 조건으로
 * 한 번 더 막는다 — 원주문번호 없는 정정은 어느 층도 통과하지 못한다.
 *
 * `pieceCount`/`krxSession` 을 받지 않는다 — 정정은 조각 수·세션을 바꾸지 않는다.
 * 실려 오더라도 zod 기본 strip 으로 버려진다(`.strict()` 로 만들지 않는 이유는 신규와 같다).
 */
export const RelayOrderModifySchema = z.object({
  t: z.literal("order.modify"),
  rid: RidSchema,
  isin: IsinSchema,
  exchange: ExchangeSchema,
  orgOrderNo: z.string().min(1),
  side: OrderSideSchema,
  qty: z.number().int().positive(),
  price: z.number().int().positive(),
  accountNo: AccountNoSchema,
});

/** 브라우저가 보낼 수 있는 전부. `t` 로 분기하는 discriminated union 이다. */
export const RelayInboundSchema = z.discriminatedUnion("t", [
  RelayAuthSchema,
  RelaySubSchema,
  RelayUnsubSchema,
  RelayLcSetSchema,
  RelayLcArmSchema,
  RelayAutoSellCmdSchema,
  RelayUserSettingsSetSchema,
  RelayViSetSchema,
  RelayViConfirmSchema,
  RelayStrategiesDisableSchema,
  RelayOrderNewSchema,
  RelayOrderModifySchema,
  RelayOrderCancelSchema,
]);

/**
 * 구 탭 `lc.set`(신필드 12개 없음 · 게이트가 하나라도 켜짐)에 relay 가 돌려주는 거부 문구
 * (24-UI-SPEC Copywriting 원문). 소켓을 끊지 않고(F-4) 이 문구 한 건으로 답한다.
 */
export const LC_LEGACY_SET_REJECT_TEXT = "매수 설정 방식이 바뀌었어요 — 화면을 새로고침해 주세요";

/**
 * Phase 24 매수 3종 C→S 12 의 **중립값** — 옛 모양 **철거** 프레임에만 쓴다(`withNeutralBuy3`).
 *
 * ★ 이 객체의 키가 곧 신필드 목록의 **유일한 정본**이다(`LC_BUY3_INPUT_KEYS` 가 여기서 파생된다) —
 *   목록을 두 벌 두면 한쪽만 늘어난다. `withNeutralBuy3` 의 반환 타입이 `LcSetCfg` 라
 *   키가 빠지면 컴파일이 짚는다.
 */
const LC_BUY3_NEUTRAL = {
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
} as const satisfies Partial<RelayLimitChaserInput>;

type LcBuy3InputKey = keyof typeof LC_BUY3_NEUTRAL;

/** 신필드 12개 키 — `LC_BUY3_NEUTRAL` 에서 파생한다(목록 한 벌). */
const LC_BUY3_INPUT_KEYS = Object.keys(LC_BUY3_NEUTRAL) as readonly LcBuy3InputKey[];

/** relay 가 받은 `lc.set` cfg — 신필드 12개가 선택이다(구 탭 관용). */
export type RelayInboundWireLcSetCfg = z.infer<typeof RelayLcSetSchema>["cfg"];

type LcSetCfgWithBuy3 = RelayInboundWireLcSetCfg &
  Required<Pick<RelayInboundWireLcSetCfg, LcBuy3InputKey>>;

function hasAllBuy3(cfg: RelayInboundWireLcSetCfg): cfg is LcSetCfgWithBuy3 {
  return LC_BUY3_INPUT_KEYS.every((k) => cfg[k] !== undefined);
}

/**
 * 새 클라 cfg 인가 — 신필드 12개가 **전부** 있으면 `LcSetCfg` 로 좁혀 돌려주고,
 * 하나라도 없으면 `null`(구 탭). 부재 판정의 **유일한** 자리다 — fanout `lc.set` 분기가 부른다.
 * `postBuyAuto` · `extraBuyBurstRelease` · 자동매도 4필드는 판정에 들어가지 않는다(선택 · 존재 여부는 조립기의 buy3_schema
 * 파생만 가른다).
 */
export function buy3CfgOf(cfg: RelayInboundWireLcSetCfg): LcSetCfg | null {
  return hasAllBuy3(cfg) ? cfg : null;
}

/**
 * 옛 모양 **철거** 프레임에만 — 신필드 12개를 false/0 으로 채운다(있어도 덮는다).
 *
 * ⚠️ 게이트 4종이 **전부 OFF** 일 때만 부른다(T-24-42). 켜는 프레임을 채우면 옛 탭이 조용히 새 클라
 *    등록이 된다. 철거는 설정값과 무관하므로 중립값으로 충분하다 — 철거를 막으면 사용자가 무장을
 *    풀 수 없게 된다(T-16-44 「끄기는 언제나 허용」).
 * `postBuyAuto` 는 채우지도 지우지도 않는다 — 입력에 있으면 그대로, 없으면 없는 채(buy3_schema 1).
 * `extraBuyBurstRelease` 도 채우지도 지우지도 않는다(quick-261003-rc4) — 파생 스키마는 조립기가 정한다.
 */
export function withNeutralBuy3(cfg: RelayInboundWireLcSetCfg): LcSetCfg {
  return { ...cfg, ...LC_BUY3_NEUTRAL };
}

/**
 * relay 가 실제로 받는 인바운드 타입(zod 출력). **relay 내부 전용** — shared 에 두지 않는다.
 *
 * shared `RelayInbound` 보다 넓은 곳은 구 탭 관용 두 곳뿐이다 — `lc.arm` 의 `latch: "buy"` 와
 * `lc.set` cfg 의 신필드 부재. fanout 이 그 두 분기에서 좁혀서 쓴다.
 */
export type RelayInboundWire = z.infer<typeof RelayInboundSchema>;

/**
 * 수신 문자열을 계약 타입으로 좁힌다. **total 하다** — 어떤 입력에도 throw 하지 않고
 * `null` 로 수렴하며, 호출자는 `null` 을 close(4400) 로 처리한다.
 *
 * 실패 사유는 로그에만 남긴다(브라우저에 스키마 오류를 되돌려주지 않는다 — 정보 노출).
 * **원문을 로그에 싣지 않는다** — 첫 메시지에는 액세스 토큰이 들어 있고, `lc.set`/`vi.set`/
 * `order.*` 바디에는 계좌번호가 들어 있다 (T-15-04 / T-16-09). 남기는 것은 첫 issue 의
 * `path`/`code` 뿐이며 `path` 는 **필드 이름이지 값이 아니다**. 전략 스키마가 붙었다고
 * 이 규율을 느슨하게 하지 않는다.
 */
export function parseInbound(raw: string): RelayInboundWire | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    logger.warn({ bytes: raw.length }, "[WS] JSON 파싱 실패 — 프로토콜 위반");
    return null;
  }

  const parsed = RelayInboundSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    logger.warn(
      { path: issue?.path.join("."), code: issue?.code },
      "[WS] 인바운드 스키마 위반 — 프로토콜 위반",
    );
    return null;
  }
  return parsed.data;
}

/**
 * 아웃바운드 1건을 wire JSON 으로 만든다.
 *
 * 64비트 정수가 섞이면 **즉시 throw** 한다 (D-34). `JSON.stringify` 도 자체적으로
 * TypeError 를 내지만 어느 필드인지 알려 주지 않는다 — 필드 이름을 붙여 던지는 것이
 * 이 가드의 값이다. 파서(`envelope.ts`)가 이미 Number 로 좁히므로 여기 걸리면
 * **변환을 빠뜨린 새 필드**가 있다는 뜻이다.
 */
export function encode(msg: RelayOutbound): string {
  return JSON.stringify(msg, (key: string, value: unknown) => {
    if (typeof value === "bigint") {
      throw new TypeError(`wss 아웃바운드에 64비트 정수가 섞였습니다: ${key} (D-34 위반)`);
    }
    return value;
  });
}
