/**
 * Phase 15 Plan 04 — RELAY-01. wss 인바운드 zod 스키마 + 아웃바운드 인코더.
 *
 * `server/src/schemas/chat.ts` 규약 이식 — **스키마 파일에는 zod 만** 두고 계약 타입은
 * `@gh-radar/shared` 에서 가져온다. wss 는 인터넷에 직접 노출되는 신뢰 경계이므로
 * 여기를 통과하지 않은 값은 어떤 핸들러에도 닿지 않는다.
 *
 * 결정 근거:
 *   D-11  브라우저가 보낼 수 있는 것은 `auth`/`sub`/`unsub` 3종뿐이다. 그 외 형태는
 *         프로토콜 위반이고 close(4400) 로 끝난다 — 관대하게 무시하면 공격 표면이 늘어난다.
 *   D-33  구독 키는 `isin + exchange` 다. ISIN 은 12자 고정이라 길이·형식을 여기서 굳힌다.
 *   D-34  **와이어 계약은 전부 number** 다. 64비트 정수가 직렬화 경로까지 흘러오면 즉시
 *         throw 해 "브라우저에서만 깨지는" 사고를 서버에서 잡는다.
 *
 * 하지 않는 것:
 *   - 아웃바운드를 zod 로 검증하지 않는다. 아웃바운드는 relay 가 만든 값이고 타입이 이미
 *     계약이다 — 런타임 검증을 두 벌 두면 매 프레임 비용만 늘어난다(10Hz × 사용자 수).
 *   - 주문 메시지를 받지 않는다. 주문은 `POST /api/orders` 전용이다 (D-08).
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

/** 브라우저가 보낼 수 있는 전부. `t` 로 분기하는 discriminated union 이다. */
export const RelayInboundSchema = z.discriminatedUnion("t", [
  RelayAuthSchema,
  RelaySubSchema,
  RelayUnsubSchema,
]);

/**
 * 수신 문자열을 계약 타입으로 좁힌다. **total 하다** — 어떤 입력에도 throw 하지 않고
 * `null` 로 수렴하며, 호출자는 `null` 을 close(4400) 로 처리한다.
 *
 * 실패 사유는 로그에만 남긴다(브라우저에 스키마 오류를 되돌려주지 않는다 — 정보 노출).
 * **원문을 로그에 싣지 않는다** — 첫 메시지에는 액세스 토큰이 들어 있다 (T-15-04).
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
