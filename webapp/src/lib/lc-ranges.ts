/**
 * 상따 `lc.set` 필드 범위 표 — **순수 상수 모듈**(27-REVIEW IN-05).
 *
 * 행 정의(`components/trading/lc/lc-fields.ts`)와 순수 로직(`lib/limit-chaser.ts` 84 시딩 `fitsLcRange`)이 이 한 벌을
 * 같이 읽는다. 예전에는 범위가 lc-fields 행 안에만 있어 lib 가 UI 정의 모듈을 런타임 import 했다(계층 역전 —
 * lc-fields 가 lib 의 값 하나만 가져가도 초기화 순서 순환이 된다). 이 모듈은 런타임 import 가 없다.
 *
 * 필드 범위(포함) — relay `lc.set` 스키마(`relay/src/ws/protocol.ts` `RelayLcSetSchema`)가 범위를 두는
 * 필드만 적는다. **값은 relay 스키마와 같아야 한다** — relay 는 스키마 위반 프레임을 받으면 WebSocket
 * 연결을 통째로 끊는다(`fanout.ts` `#reject` → `ws.close(BAD_MESSAGE)`). 그러면 모든 카드의 시세·에코가
 * 멈추고 같은 소켓의 수동주문은 결과 모름 잠금에 걸린다(20-REVIEW CR-01).
 *   - `sellOrderRatio`    `z.number().int().min(1).max(100)`
 *   - `sellQtyTrackRatio` `z.number().int().min(1).max(90)`
 *   - `sweepMinTickCount` · `postBuyReentry` `UByteSchema` = `min(0).max(255)`
 *   - `postBuyReboundPct` `z.number().int().min(0).max(100)` + `.superRefine` 「후매수 ON 이면 1~100」
 *     (서버 §9-2 ⑤ 동형 — `lcRangeIssue` 가 같은 조건 규칙을 본다)
 *   - `autoSellStartCond` `z.number().int().min(0).max(9)` (Phase 27 · 늘)
 *   - `autoSellRatioPct` · `autoSellMethod` `UByteSchema` + `.superRefine` 「자동매도 ON 이면 비율 1~50 · 방법 1~3」
 *     (서버 §9-3 동형 — `lcRangeIssue` 가 같은 조건 규칙을 본다 · Pitfall 5)
 *   - 수량 임계 금액 8칸(`buyWatchAmount` · `buyMinTradeAmount` · `extraBuyMinAmount` · `extraBuyMaxAmount` ·
 *     `postBuyFloorAmount` · `sellWatchAmount` · `sellMinTradeAmount` · `cancelWatchAmount`) 0~999,999,999 — fbs 주석
 *     (만원 · Phase 31 · shared `LC_AMOUNT_MAX_MANWON`). relay `UIntSchema` 보다 좁다(키패드 9자리).
 * 나머지 값 필드(가격 · 주문 금액)는 `UIntSchema`(0 이상 정수) — 키패드가 음수·소수를 만들 수 없어 범위가 없다.
 * 자동매도 3칸(`autoSellStartCond` · `autoSellRatioPct` · `autoSellMethod`)의 숫자는 shared `LC_AUTO_SELL_RANGES` 가
 * 정본이다 — relay zod · superRefine 도 같은 상수를 읽는다(27-REVIEW IN-06).
 * 자동매도 방법(3택)은 범위가 아니라 옵션 값이다 — 화면 순서 정본은 shared `AUTO_SELL_METHOD_ORDER` 이고, 그 값 집합이
 * `LC_AUTO_SELL_RANGES.autoSellMethod`(1~3)와 같다는 것은 shared 테스트가 잠근다.
 */

import { LC_AMOUNT_MAX_MANWON, LC_AUTO_SELL_RANGES } from '@gh-radar/shared';

import type { LimitChaserFormValues } from '@/lib/limit-chaser';

export interface LcRange {
  min: number;
  max: number;
}

/** 범위 1칸 — `range` 는 전송 직전 전 cfg 방어선(relay 스키마 · CR-01), `inputRange` 는 시트 · 인라인 입력 범위. */
export interface LcFieldRange {
  range: LcRange;
  /** 없으면 `range`(후매수 반등 1~100 · UI-SPEC §4). */
  inputRange?: LcRange;
}

/** 수량 임계 금액(만원) 칸 — shared `LC_AMOUNT_MAX_MANWON`(키패드 9자리). */
const AMOUNT_MANWON: LcRange = { min: 0, max: LC_AMOUNT_MAX_MANWON };
/** relay `UByteSchema`(0~255) — 조건부 칸의 꺼진 cfg 범위. */
const UBYTE: LcRange = { min: 0, max: 255 };

/** 필드 → 범위. 행 정의는 `...LC_FIELD_RANGES.{필드}` 로 펼쳐 쓴다 — 숫자를 행에 다시 적지 않는다. */
export const LC_FIELD_RANGES = {
  sweepMinTickCount: { range: { min: 0, max: 255 } },
  postBuyReentry: { range: { min: 0, max: 255 } },
  postBuyReboundPct: { range: { min: 0, max: 100 }, inputRange: { min: 1, max: 100 } },
  sellOrderRatio: { range: { min: 1, max: 100 } },
  sellQtyTrackRatio: { range: { min: 1, max: 90 } },
  // 자동매도 3칸의 숫자는 shared `LC_AUTO_SELL_RANGES`(relay zod · superRefine 과 같은 원천 · 27-REVIEW IN-06).
  autoSellStartCond: { range: LC_AUTO_SELL_RANGES.autoSellStartCond },
  // 꺼진 옛 에코의 0 은 통과(relay UByte) — 켠 cfg 만 1~50(`lcRangeIssue` 조건 규칙 · Pitfall 5).
  autoSellRatioPct: { range: UBYTE, inputRange: LC_AUTO_SELL_RANGES.autoSellRatioPct },
  // 수량 임계 금액(만원) 8칸 — 0~999,999,999(fbs 주석 · Phase 31 D-01).
  buyWatchAmount: { range: AMOUNT_MANWON },
  buyMinTradeAmount: { range: AMOUNT_MANWON },
  extraBuyMinAmount: { range: AMOUNT_MANWON },
  extraBuyMaxAmount: { range: AMOUNT_MANWON },
  postBuyFloorAmount: { range: AMOUNT_MANWON },
  sellWatchAmount: { range: AMOUNT_MANWON },
  sellMinTradeAmount: { range: AMOUNT_MANWON },
  cancelWatchAmount: { range: AMOUNT_MANWON },
} as const satisfies Partial<Record<keyof LimitChaserFormValues, LcFieldRange>>;

/** 그 필드의 범위 — 표에 없으면(가격 · 주문 금액) `undefined`. */
export function lcFieldRangeOf(field: keyof LimitChaserFormValues): LcFieldRange | undefined {
  return (LC_FIELD_RANGES as Partial<Record<keyof LimitChaserFormValues, LcFieldRange>>)[field];
}
