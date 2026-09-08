/**
 * Phase 15 Plan 04 — RELAY-01. wss 인바운드 zod 스키마 + 아웃바운드 인코더.
 *
 * `server/src/schemas/chat.ts` 규약 이식 — **스키마 파일에는 zod 만** 두고 계약 타입은
 * `@gh-radar/shared` 에서 가져온다. wss 는 인터넷에 직접 노출되는 신뢰 경계이므로
 * 여기를 통과하지 않은 값은 어떤 핸들러에도 닿지 않는다.
 *
 * 결정 근거:
 *   D-11  브라우저가 보낼 수 있는 것은 아래 판별 유니온에 실린 **9종뿐**이다 — 시세 3종
 *         (`auth`/`sub`/`unsub`) + 전략 4종 + 주문 2종. 그 외 형태는 프로토콜 위반이고
 *         close(4400) 로 끝난다 — 관대하게 무시하면 공격 표면이 늘어난다.
 *   D-01  전략 메시지(`lc.set`/`vi.set`/`vi.confirm`/`strategies.disable`)를 **이 소켓으로
 *         받는다**. relay 가 FlatBuffer 로 바꿔 그 사용자의 DMA 세션으로 보낸다.
 *   D-02  주문(`order.new`/`order.cancel`)도 **이 소켓으로 받는다**. Phase 15 의
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
import type { RelayInbound, RelayOutbound } from "@gh-radar/shared";

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

/**
 * 상따 설정 (`lc.set`, D-01/D-06). `cfg` 는 **33필드 전부**다 — 부분 갱신이 없다.
 *
 * 범위 경계를 게이트웨이 검증과 **같은 값**으로 잡는다. 서버는 범위를 벗어난 설정을 거부하는
 * 대신 **게이트를 눕혀서 저장**하고 `ServerMessage ERROR` 만 따로 보내기 때문이다(조용한 거부).
 * 여기서 먼저 자르지 않으면 "보냈는데 왜 안 켜지지"가 사용자 몫으로 남는다 (T-16-05).
 *
 * ⚠️ **S→C 전용 4필드(`sellOrderQty`·`sellQtyTrackBaseline`·`sellEntryLatched`·
 *    `cancelQtyTrackBaseline`)를 두지 않는다** — 서버가 계산해 에코로만 주는 값이라, 받으면
 *    "값이 왕복한다"는 착각이 생기고 에코-폼 비교가 오염된다 (Pitfall 6). `z.object` 가 미지
 *    키를 떨어뜨리므로 실려 와도 통과하지 못한다.
 */
export const RelayLcSetSchema = z.object({
  t: z.literal("lc.set"),
  cfg: z.object({
    isin: IsinSchema,
    accountNo: AccountNoSchema,
    /** 서버는 첫 글자만 읽는다 — 빈 값이 오면 KOSPI 로 오인되므로 열거로 못박는다. */
    market: z.enum(["K", "Q"]),
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
  /** **원 단위**. UI 의 만원 입력을 x 10,000 한 값이다. */
  orderAmountKrw: UIntSchema,
  /** 발동 판정 상승률 — 정수 %. 하락 감시를 막지 않으려고 음수를 허용한다. */
  checkRate: z.number().int(),
  run: z.boolean(),
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
 * 전략 일괄 비활성화 (`strategies.disable`).
 *
 * `key` 생략·`""` 는 전체다. 상한 64자는 **서버 WR-09 와 같은 값**이라 relay 에서 먼저
 * 자른다 — 서버까지 보내고 거부당하는 왕복을 없애고 로그 폭도 함께 묶는다 (T-16-06).
 */
export const RelayStrategiesDisableSchema = z.object({
  t: z.literal("strategies.disable"),
  key: z.string().max(64).optional(),
});

/**
 * 신규 주문 (`order.new`, D-02).
 *
 * ⚠️ **`market` 을 받지 않는다.** relay 가 `SymbolMap` 으로 ISIN → 시장을 채운다 —
 *    브라우저가 시장 구분을 정하게 두면 엉뚱한 시장으로 주문이 나갈 수 있다 (D-28).
 *
 * `qty`/`price` 는 `positive()` 다. 수량 0 은 전량취소가 아니라 즉시 거부이므로(D-44)
 * 조립 단계까지 흘리지 않고 여기서 끝낸다.
 */
export const RelayOrderNewSchema = z.object({
  t: z.literal("order.new"),
  rid: RidSchema,
  isin: IsinSchema,
  exchange: ExchangeSchema,
  side: z.enum(["B", "S"]),
  qty: z.number().int().positive(),
  price: z.number().int().positive(),
  accountNo: AccountNoSchema,
});

/**
 * 취소 주문 (`order.cancel`, D-02).
 *
 * `orgOrderNo` 는 필수다 — 원주문번호 없는 취소는 조립 단계에서 어차피 실패한다.
 * `qty` 는 미체결 잔량 전부이고 `0` 은 거부다 (D-44).
 */
export const RelayOrderCancelSchema = z.object({
  t: z.literal("order.cancel"),
  rid: RidSchema,
  isin: IsinSchema,
  exchange: ExchangeSchema,
  orgOrderNo: z.string().min(1),
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
  RelayViSetSchema,
  RelayViConfirmSchema,
  RelayStrategiesDisableSchema,
  RelayOrderNewSchema,
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
