// workers/intraday-sync/src/pipeline/map.ts
//
// STEP 1 mapper — ka10027 응답 row 를 IntradayCloseUpdate 로 변환.
// RESEARCH §2.2 기준. CONTEXT D-09 (부호 prefix), D-10 (_AL strip), D-23 (tradeAmount 근사값).

import type { KiwoomKa10027Row, IntradayCloseUpdate } from "@gh-radar/shared";

/**
 * 키움 signed string price 를 절댓값 + 방향으로 분리.
 *
 * RESEARCH §1.4 / CONTEXT D-09:
 *   - "+6760"     → up
 *   - "-274250"   → down
 *   - "6760"      → flat (부호 없음)
 *   - "0"         → flat (보합)
 *   - "+1,234,567"→ up (천단위 콤마)
 *
 * 빈 문자열/undefined/잘못된 숫자는 throw — caller 가 정상 데이터 보장 못 하면 fail-fast.
 */
export function parseSignedPrice(
  s: string | undefined,
): { value: number; direction: "up" | "down" | "flat" } {
  if (!s) throw new Error("missing signed price");
  const trimmed = s.trim();
  if (trimmed === "") throw new Error("missing signed price");
  const sign = trimmed[0];
  const rest = sign === "+" || sign === "-" ? trimmed.slice(1) : trimmed;
  const abs = Number(rest.replace(/,/g, ""));
  if (!Number.isFinite(abs)) throw new Error(`invalid signed price: "${s}"`);
  return {
    value: abs,
    direction: sign === "+" ? "up" : sign === "-" ? "down" : "flat",
  };
}

/**
 * 키움 signed number (부호 유지) — pred_pre, flu_rt 처럼 부호를 그대로 DB 저장.
 * 빈/undefined → null (옵셔널 컬럼).
 */
export function parseOptionalSignedNumber(s: string | undefined): number | null {
  if (!s || s.trim() === "") return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * 부호 없는 옵셔널 number — now_trde_qty 처럼 양수만 예상.
 */
export function parseOptionalNumber(s: string | undefined): number | null {
  if (!s || s.trim() === "") return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * 키움 stk_cd "_AL" 접미사 strip.
 * CONTEXT D-10: "007460_AL" → "007460" (6자 단축코드).
 */
export function stripAlSuffix(stkCd: string): string {
  return stkCd.replace(/_AL$/, "");
}

/**
 * ka10027 1 row → IntradayCloseUpdate.
 *
 * CONTEXT D-23: tradeAmount = volume × price 근사값 (트레이딩 시그널 용도, 회계 아님).
 *   기존 workers/ingestion/src/pipeline/map.ts:5 의 "근사값은 허용하지 않음" 정책 반전 —
 *   ka10027/ka10001 응답에 KIS acml_tr_pbmn 동등 필드 부재로 근사값 채택.
 *
 * stk_cd 가 6자 숫자가 아니면 throw — caller pipeline 이 정상 응답 보장 가정.
 */
export function ka10027RowToCloseUpdate(
  row: KiwoomKa10027Row,
  dateIso: string,
): IntradayCloseUpdate {
  const code = stripAlSuffix(row.stk_cd);
  if (!/^\d{6}$/.test(code)) {
    throw new Error(`Invalid stk_cd after strip: "${row.stk_cd}" → "${code}"`);
  }

  const price = parseSignedPrice(row.cur_prc).value;
  const changeAmount = parseOptionalSignedNumber(row.pred_pre);
  const changeRate = parseOptionalSignedNumber(row.flu_rt);
  const volume = parseOptionalNumber(row.now_trde_qty) ?? 0;

  // D-23: tradeAmount 근사값 (volume × close)
  const tradeAmount = Math.round(volume * price);

  return {
    code,
    date: dateIso,
    name: row.stk_nm,
    price,
    changeAmount,
    changeRate,
    volume,
    tradeAmount,
  };
}
