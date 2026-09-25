/**
 * Phase 20 D-15 · D-17 — KRX 호가 단위 헬퍼 (저장소의 **유일한** 호가 단위 표).
 *
 * 출처: KRX 2023-01-25 개정 통합 호가가격단위(코스피·코스닥 공통) · NXT 동일
 * (증권사 안내 · MEDIUM — 20-RESEARCH A3).
 *
 * | 가격 구간          | 호가 단위 |
 * |--------------------|-----------|
 * | 2,000원 미만       | 1         |
 * | 5,000원 미만       | 5         |
 * | 20,000원 미만      | 10        |
 * | 50,000원 미만      | 50        |
 * | 200,000원 미만     | 100       |
 * | 500,000원 미만     | 500       |
 * | 500,000원 이상     | 1,000     |
 *
 * 소비처: `limitUpPrice`(상한가 산출 · intraday-sync 도 소비) · webapp `deriveTickSize` 폴백 ·
 * webapp 키패드(±1호가 칩 · 가격 검증 · ↑↓ 스텝). 새 표를 만들지 말고 이 함수를 부른다.
 *
 * ★ 입력 보조일 뿐 서버 판정을 대체하지 않는다(D-15 · D-27) — 어긋나면 게이트웨이가 거부하고
 *   그 문구가 그대로 보인다. ETF/ETN 예외 단위는 다루지 않는다(20-RESEARCH A4 · deferred).
 */

/** 가격 입력 검증 결과 — 이유와 가까운 값만 담는다. 보정 값을 만들지 않는다(D-15). */
export type PriceIssue =
  | { kind: "overUpper"; upper: number }
  | { kind: "offTick"; tick: number; lower: number; upper: number };

/** 호가 단위. 비유한수·2,000 미만(0·음수 포함) → 1. */
export function krxTickSize(price: number): number {
  if (!Number.isFinite(price) || price < 2_000) return 1;
  if (price < 5_000) return 5;
  if (price < 20_000) return 10;
  if (price < 50_000) return 50;
  if (price < 200_000) return 100;
  if (price < 500_000) return 500;
  return 1_000;
}

/** +1호가 — v 기준 단위를 더한다(1,999 → 2,000 · 2,000 → 2,005). */
export function tickUp(v: number): number {
  return v + krxTickSize(v);
}

/**
 * −1호가 — **한 칸 아래 가격대**의 단위를 뺀다(2,000 → 1,999 · 5,000 → 4,995).
 * v 기준 단위를 빼면 구간 경계에서 한 칸을 건너뛴다. 0 아래로 내려가지 않는다.
 */
export function tickDown(v: number): number {
  return Math.max(0, v - krxTickSize(v - 1));
}

/**
 * 가격 입력 검증 — ① 상한가 초과(upperLimit > 0 일 때만) ② 호가 단위 불일치 순.
 * 빈 값·0·음수는 검증하지 않는다(null). 값을 바꾸지 않는다 — 자동 보정 없음(D-15).
 */
export function priceInputIssue(v: number, upperLimit: number): PriceIssue | null {
  if (!Number.isFinite(v) || v <= 0) return null;
  if (upperLimit > 0 && v > upperLimit) return { kind: "overUpper", upper: upperLimit };
  const tick = krxTickSize(v);
  if (v % tick !== 0) {
    const lower = Math.floor(v / tick) * tick;
    return { kind: "offTick", tick, lower, upper: lower + tick };
  }
  return null;
}
