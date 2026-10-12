/**
 * Phase 31 — 상따 금액(만원)↔수량(주) §10 환산 한 벌.
 *
 * gh-trade `client/Forms/Trading/LimitChaserForm.cs` 5691~5757(`QtyFromAmount` · `QtyForSubmit` · `NarrowQty` ·
 * `AmountFromQty` · `AmountOrDerive`) 이식 — 소비자: webapp 행 · 시트 · 제출 · 검증 · 자동 체크 · 시딩, relay 테스트 픽스처.
 * 거부 문장은 여기 두지 않는다(webapp `armBlockedTextOf` 몫).
 *
 * - **제출은 내림(floor), 표시 역산은 반올림((주×가격+5000)÷10000 정수 나눗셈) 한 번뿐**이다 — 부동소수 반올림 함수를 쓰지 않는다.
 * - 화면에 보이는 주 · 무장 판정의 주 · cfg 에 실리는 주는 모두 `qtyForSubmit` 한 함수를 거친다(갈리면 오발주 표면).
 *
 * 순환 금지 — `relay.ts` 는 `import type` 으로만 가져온다.
 */

import type { RelayLimitChaser } from "./relay";

/** C# `NarrowQty` 가 자르는 상한 — `int.MaxValue`(2,147,483,647)다. uint32 가 아니다(서버가 int 로 좁혀 싣는다 · Pitfall 5). */
export const LC_QTY_WIRE_MAX = 2_147_483_647;

/** 금액(만원) 칸 상한 — fbs 주석 「0~999999999」 · 키패드 9자리. */
export const LC_AMOUNT_MAX_MANWON = 999_999_999;

/**
 * C# `QtyFromAmount` — 만원 → 주(내림). 비교가가 0 이하이면 0.
 * 분자는 최대 9.99e12 라 2^53 안이다(정밀도 손실 없음).
 */
export function qtyFromAmount(manwon: number, price: number): number {
  if (!(price > 0)) return 0;
  return Math.floor((manwon * 10_000) / price);
}

/** C# `NarrowQty` — 0 이하는 0, `LC_QTY_WIRE_MAX` 초과는 `LC_QTY_WIRE_MAX`. */
export function narrowQty(qtyRaw: number): number {
  if (!(qtyRaw > 0)) return 0;
  return qtyRaw > LC_QTY_WIRE_MAX ? LC_QTY_WIRE_MAX : qtyRaw;
}

/**
 * C# `AmountFromQty` — 주 → 만원(표시용 반올림 `(주×가격+5000)÷10000` 정수 나눗셈). 주 · 가격 어느 쪽이든 0 이하이면 0.
 * 주×가격 + 5000 이 2^53 을 넘으면(예: 2,147,483,647주 × 5,000,000원) BigInt 로 정확히 계산한다(C# long 동형 · Pitfall 14).
 * 판정은 더한 뒤의 값으로 한다 — 곱만 안전 정수여도 `+ 5000` 이 경계를 넘으면 그 합이 정확한 정수가 아닐 수 있다(IN-05).
 */
export function amountFromQty(qty: number, price: number): number {
  if (!(price > 0) || !(qty > 0)) return 0;
  const p = qty * price;
  if (Number.isSafeInteger(p + 5_000)) return Math.floor((p + 5_000) / 10_000);
  return Number((BigInt(qty) * BigInt(price) + 5_000n) / 10_000n);
}

/**
 * C# `AmountOrDerive` — 에코 금액 원값이 **이 주를 만든 값일 때만**(`floor(금액×10000÷가격) === 주`) 원값,
 * 아니면 주에서 역산한다. 가격 0 이면 대조할 수 없어 원값 그대로(원값 0 이면 역산 = 0).
 */
export function amountOrDerive(amount: number, qty: number, price: number): number {
  if (amount > 0 && (price === 0 || Math.floor((amount * 10_000) / price) === qty)) return amount;
  return amountFromQty(qty, price);
}

/** 수량 임계 금액 키(만원) 8개 — gh-trade SetLimitChaser vtable 158~172. */
export type LcAmountKey =
  | "buyWatchAmount"
  | "buyMinTradeAmount"
  | "extraBuyMinAmount"
  | "extraBuyMaxAmount"
  | "postBuyFloorAmount"
  | "sellWatchAmount"
  | "sellMinTradeAmount"
  | "cancelWatchAmount";

/** 금액 키의 짝 주 키(서버 비교 정본). */
export type LcAmountQtyKey =
  | "buyWatchQty"
  | "buyMinTradeQty"
  | "extraBuyMinQty"
  | "extraBuyMaxQty"
  | "postBuyFloorQty"
  | "sellWatchQty"
  | "sellMinTradeQty"
  | "cancelWatchQty";

/** 금액↔주 한 쌍 — 그룹 비교가 · (매도 · 취소만) 잔량추적 토글 · 기준선. */
export type LcAmountPair = {
  readonly amount: LcAmountKey;
  readonly qty: LcAmountQtyKey;
  readonly price: "buyWatchPrice" | "sellWatchPrice";
  readonly track?: "sellQtyTrackEnabled" | "cancelQtyTrackEnabled";
  readonly baseline?: "sellQtyTrackBaseline" | "cancelQtyTrackBaseline";
};

/**
 * 금액↔주 쌍 표 한 벌 — webapp 행 · 제출 · 검증 · 성공 판정 · relay 테스트가 같이 읽는다.
 * 순서는 표시 · 판정 우선순위가 아니다(등록 차단 순서는 UI-SPEC 표).
 */
export const LC_AMOUNT_PAIRS = [
  // 매수 그룹 — 매수 비교가(`buyWatchPrice`): 선매수 매도잔량 · 체결량 → 줄매수 최소 · 최대 → 후매수 최소
  { amount: "buyWatchAmount", qty: "buyWatchQty", price: "buyWatchPrice" },
  { amount: "buyMinTradeAmount", qty: "buyMinTradeQty", price: "buyWatchPrice" },
  { amount: "extraBuyMinAmount", qty: "extraBuyMinQty", price: "buyWatchPrice" },
  { amount: "extraBuyMaxAmount", qty: "extraBuyMaxQty", price: "buyWatchPrice" },
  { amount: "postBuyFloorAmount", qty: "postBuyFloorQty", price: "buyWatchPrice" },
  // 매도 · 취소 그룹 — 매도 비교가(`sellWatchPrice` · 취소 비교가 = 매도 비교가): 매도 매수잔량 · 체결 → 취소 매수잔량
  {
    amount: "sellWatchAmount",
    qty: "sellWatchQty",
    price: "sellWatchPrice",
    track: "sellQtyTrackEnabled",
    baseline: "sellQtyTrackBaseline",
  },
  { amount: "sellMinTradeAmount", qty: "sellMinTradeQty", price: "sellWatchPrice" },
  {
    amount: "cancelWatchAmount",
    qty: "cancelWatchQty",
    price: "sellWatchPrice",
    track: "cancelQtyTrackEnabled",
    baseline: "cancelQtyTrackBaseline",
  },
] as const satisfies readonly LcAmountPair[];

/** 금액 키 또는 짝 주 키로 쌍을 찾는다. 없으면 `undefined`. */
export function lcAmountPairOf(key: string): LcAmountPair | undefined {
  return (LC_AMOUNT_PAIRS as readonly LcAmountPair[]).find((p) => p.amount === key || p.qty === key);
}

/** 에코가 그 칸에 쓴 값 — 보인 만원(Clamp 뒤) · 서버 주(추적 ON 이면 기준선) · 그 그룹 비교가. */
export type LcEchoAmount = { shown: number; qty: number; price: number };

/**
 * 에코 적용 = C# `ApplyServerConfig` + `RememberEchoQty`(LimitChaserForm.cs 6240~6357).
 * 추적 ON(매도 · 취소)이면 칸 = 기준선 역산 · 메모 주 = 기준선(재제출이 래칫을 되돌리지 않는다 · Pitfall 6),
 * 아니면 칸 = `amountOrDerive(에코 금액, 에코 주, 비교가)` · 메모 주 = 에코 주.
 * `shown` 은 C# `Clamp(Maximum)` 동형으로 `LC_AMOUNT_MAX_MANWON` 에서 멈춘다(메모 Item1 = Clamp 뒤 칸 값).
 */
export function echoAmountOf(server: RelayLimitChaser, pair: LcAmountPair): LcEchoAmount {
  const price = server[pair.price];
  const tracking = pair.track !== undefined && pair.baseline !== undefined && server[pair.track] === true;
  const qty = tracking ? server[pair.baseline!] : server[pair.qty];
  const shown = tracking ? amountFromQty(qty, price) : amountOrDerive(server[pair.amount], server[pair.qty], price);
  return { shown: Math.min(shown, LC_AMOUNT_MAX_MANWON), qty, price };
}

/**
 * C# `QtyForSubmit` + `NarrowQty` — 칸 값 · 비교가가 에코가 쓴 그대로면 서버 주(추적 ON 은 기준선), 아니면 내림 환산.
 *
 * C# 의 `_echoQtyMemo` 를 상태로 두지 않고 server 에코에서 매번 다시 계산한다 — 폼 기준값이 늘 `formFromServer(server)`
 * 라 같은 불변식이다. 미등록(echo null)이면 메모 없음 = 내림 — C# 이 키 변경 · 기본값 · 시딩 때 메모를 지우는 것과 같은 결과.
 */
export function qtyForSubmit(amount: number, price: number, echo: LcEchoAmount | null): number {
  if (echo !== null && amount === echo.shown && price === echo.price) return narrowQty(echo.qty);
  return narrowQty(qtyFromAmount(amount, price));
}

/**
 * 에코가 금액을 아는 서버의 것인가 — 금액 8필드 중 하나라도 0 보다 크면 그렇다. 구 gh-trade 서버는 vtable 158~172 를
 * 읽지 않아 8필드가 늘 0(부재)으로 온다. 8필드가 모두 0 인 새 서버 에코는 구분할 수 없어 「모름」 쪽(관용 유지)으로 둔다.
 */
function echoKnowsAmounts(server: RelayLimitChaser): boolean {
  return LC_AMOUNT_PAIRS.some((p) => server[p.amount] > 0);
}

/**
 * 금액 필드 확정의 성공 판정(짝) — 에코 주 = 보낸 주 ∧ (에코 금액 = 보낸 금액 ∨ (에코 금액 = 0 ∧ 금액을 모르는 서버)).
 * 에코 금액 0 = 구 gh-trade 서버(vtable 158~172 무시) 또는 0 을 보냄 — 주가 같으면 성공이다(Pitfall 1 · RESEARCH A6).
 * 금액을 아는 서버(`echoKnowsAmounts`)의 에코 금액 0 은 「이 칸의 저장 금액이 0」 이라는 사실이라 관용하지 않는다 — 답보다
 * 먼저 온 옛 푸시(금액 0 · 같은 주)를 보낸 확정의 성공으로 읽지 않는다(IN-02). 0 을 보낸 확정은 첫 갈래로 그대로 성공이다.
 * 역산 표시만 보면 1,001만 → 777주 → 1,000만처럼 어긋나므로 주 대조를 반드시 함께 둔다.
 */
export function amountEchoMatches(
  server: RelayLimitChaser,
  pair: LcAmountPair,
  sent: { amount: number; qty: number },
): boolean {
  if (server[pair.qty] !== sent.qty) return false;
  if (server[pair.amount] === sent.amount) return true;
  return server[pair.amount] === 0 && !echoKnowsAmounts(server);
}

// ── 주문로그 ⑦ 서식(D-19 · gh-trade StrategyEventFormatter.cs 595~760 이식) ─────────────────────────────
// 폼 두 줄 행의 「1,000만」(천단위 구분 · 억 없음 · D-07)과 다른 함수다. 폼에 쓰지 않는다.

/** 천단위 구분(C# `N0` · InvariantCulture 동형). */
const QTY_NUM = new Intl.NumberFormat("ko-KR");

/**
 * C# `FormatManwon` — 만원 → 「N만」/「X.Y억」. 만원 < 10000 이면 「3999만」(천단위 구분 없음),
 * 아니면 억 소수 한 자리 반올림 · 끝 .0 생략 — 십분위 = (만원 + 500) ÷ 1000 정수 나눗셈(서버 FormatQtyAmtImpl 억 갈래 동형).
 * 예: 9999 → 「9999만」 · 10000 → 「1억」 · 104975 → 「10.5억」 · 100000 → 「10억」.
 */
export function formatManwon(manwon: number): string {
  if (manwon < 10_000) return `${manwon}만`;
  const tenths = Math.floor((manwon + 500) / 1_000);
  const whole = Math.floor(tenths / 10);
  const frac = tenths % 10;
  return frac === 0 ? `${whole}억` : `${whole}.${frac}억`;
}

/**
 * C# `FormatQtyAmt(qty, price)` — 수량 → 「N만(M주)」/「X.Y억(M주)」(만원 = `amountFromQty` 반올림 역산 · 2^53 초과는 BigInt),
 * 가격 0 이하(모름)면 「M주」. 서버 54 사유 문장 · C# 공용 규칙이라 0 은 「0만(0주)」 다(주문로그는 `qtyAmt` 가 거른다).
 * 예: (15000, 1000) → 「1500만(15,000주)」 · (10000, 0) → 「10,000주」 · (85000, 12350) → 「10.5억(85,000주)」.
 */
export function formatQtyAmt(qty: number, price: number): string {
  if (price > 0) return `${formatManwon(amountFromQty(qty, price))}(${QTY_NUM.format(qty)}주)`;
  return `${QTY_NUM.format(qty)}주`;
}

/**
 * C# `QtyAmt` — 주문로그 전용 수량 토큰. 0 이면 「0주」, 아니면 `formatQtyAmt`.
 * 공용 `formatQtyAmt` 의 「0만(0주)」 는 54 서버 문장과 바이트 동일성 때문에 그대로 두고 주문로그에서만 거른다(C# DC-11).
 * 예: (300, 12350) → 「371만(300주)」 · (30000, 12350) → 「3.7억(30,000주)」 · (0, 12350) → 「0주」.
 */
export function qtyAmt(qty: number, price: number): string {
  if (qty === 0) return "0주";
  return formatQtyAmt(qty, price);
}
