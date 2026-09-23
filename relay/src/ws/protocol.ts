/**
 * Phase 15 Plan 04 — RELAY-01. wss 인바운드 zod 스키마 + 아웃바운드 인코더.
 *
 * `server/src/schemas/chat.ts` 규약 이식 — **스키마 파일에는 zod 만** 두고 계약 타입은
 * `@gh-radar/shared` 에서 가져온다. wss 는 인터넷에 직접 노출되는 신뢰 경계이므로
 * 여기를 통과하지 않은 값은 어떤 핸들러에도 닿지 않는다.
 *
 * 결정 근거:
 *   D-11  브라우저가 보낼 수 있는 것은 아래 판별 유니온에 실린 **11종뿐**이다 — 시세 3종
 *         (`auth`/`sub`/`unsub`) + 전략 5종 + 주문 3종(신규·정정·취소 — 정정은 Phase 18 D-21). 그 외 형태는 프로토콜 위반이고
 *         close(4400) 로 끝난다 — 관대하게 무시하면 공격 표면이 늘어난다.
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
import { MAX_VI_ORDER_AMOUNT_KRW } from "@gh-radar/shared";
import type { RelayExchange, RelayInbound, RelayOutbound } from "@gh-radar/shared";

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
 * ⚠️ **S→C 전용 4필드(`sellOrderQty`·`sellQtyTrackBaseline`·`sellEntryLatched`·
 *    `cancelQtyTrackBaseline`)를 두지 않는다** — 서버가 계산해 에코로만 주는 값이라, 받으면
 *    "값이 왕복한다"는 착각이 생기고 에코-폼 비교가 오염된다 (Pitfall 6). `z.object` 가 미지
 *    키를 떨어뜨리므로 실려 와도 통과하지 못한다.
 *
 * ⚠️ **`market` 도 두지 않는다** (WR-03 / D-28). 시장 구분의 소유자는 relay 다 —
 *    `fanout.ts` 의 `lc.set` 분기가 `symbols.lookup(cfg.isin)` 으로 풀어 조립 시점에 채운다.
 *    `order.new` 가 이미 그렇게 하고(`order-handler.ts` 게이트 ③-1) `lc.set` 만 예외였다.
 *    `z.enum(["K","Q"])` 는 **형식만** 볼 뿐 `SymbolMap` 과 대조하지 않으므로, 브라우저의
 *    `market === 'KOSDAQ' ? 'Q' : 'K'` 추측이 그대로 반복 발주 설정이 됐다. 위 4필드와 같은
 *    논리로 **필드를 지운다** — `z.object` 가 미지 키를 떨어뜨리므로 실려 와도 통과하지 못한다.
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
    buyWatchSide: z.enum(["0", "1"]),
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
 * 상따 래치 수동 점등 (`lc.arm`, D-04). `latch` 가 `ArmSellLatchReq(36)` ·
 * `ArmCancelLatchReq(37)` · `ArmBuyLatchReq(38)` 중 하나를 고른다.
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
  RelayViSetSchema,
  RelayViConfirmSchema,
  RelayStrategiesDisableSchema,
  RelayOrderNewSchema,
  RelayOrderModifySchema,
  RelayOrderCancelSchema,
]);

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
export function parseInbound(raw: string): RelayInbound | null {
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
