/**
 * 틱 전문 뷰어 숫자 표기 (Phase 37 · 스케치 010 C 축약 채택본).
 *
 * - `fmtAmountC` — 금액(원). 1억 미만 = 만 단위 반올림 정수 「3,000만」 · 1억~100억 = 유효 3자리 「7.96억」 「19.5억」 ·
 *   100억 이상 = 억 반올림 정수 「1,326억」. 만 반올림이 1억에 닿으면(9,999.5만 이상) 억 쪽으로 올라간다.
 *   1만 미만(호가 한 틱 잔량 등)은 원 정수 「4,000원」 — 「0만」 을 피한다. 음수는 「−」(U+2212) 를 붙인다.
 * - `fmtSignedAmountC` — 부호 붙인 금액(목록 팀 열 · 상세 팀 패널 한 벌 · quick 261103-j4d). 모름(null · NaN) 「—」 · 0 「0」 ·
 *   양수 「+」 + fmtAmountC · 음수 fmtAmountC 그대로(「−」).
 * - `fmtRate` — 등락률 % 그대로(30.0 = +30%). 소수 1자리 · 양수 「+」 · 음수 「−」 · null 「—」.
 * - `fmtRet` — 팀 수익률 비율(0.0118 = +1.18%). 소수 2자리 · 팀 패널 · 봉 차트 값 띠 공용.
 * - `fmtQty` — 수량 콤마.
 * - `fmtBytes` — 격자 크기(KB · MB 소수 1자리).
 */

export const MINUS = '−';
const DASH = '—';
const INT = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });

const MAN = 10_000;

function amountAbs(won: number): string {
  const man = Math.round(won / MAN);
  if (won < MAN) return `${INT.format(Math.round(won))}원`;
  if (man < MAN) return `${INT.format(man)}만`;
  // 만 반올림 값에서 억으로 — 9,999.5만 이상이 「0.99억」 으로 떨어지지 않게.
  const eok = man / MAN;
  // 유효 3자리 — 반올림이 100억에 닿으면 정수 쪽으로.
  if (eok < 10) {
    const v = Math.round(eok * 100) / 100;
    if (v < 10) return `${v.toFixed(2)}억`;
  }
  if (eok < 100) {
    const v = Math.round(eok * 10) / 10;
    if (v < 100) return `${v.toFixed(1)}억`;
  }
  return `${INT.format(Math.round(eok))}억`;
}

export function fmtAmountC(won: number): string {
  if (!Number.isFinite(won)) return DASH;
  if (won === 0) return '0';
  const s = amountAbs(Math.abs(won));
  return won < 0 ? `${MINUS}${s}` : s;
}

export function fmtSignedAmountC(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return v > 0 ? `+${fmtAmountC(v)}` : fmtAmountC(v);
}

export function fmtRate(r: number | null | undefined): string {
  if (r == null || !Number.isFinite(r)) return DASH;
  const v = Math.round(r * 10) / 10;
  if (v === 0) return '0.0%';
  return `${v > 0 ? '+' : MINUS}${Math.abs(v).toFixed(1)}%`;
}

/**
 * 팀 수익률(비율 0.0118 → 「+1.18%」) — 소수 2자리 · 양수 「+」 · 음수 「−」 · 반올림이 0(음의 0 포함)이면 「0.00%」 · null · NaN 「—」.
 * 팀 거래정보 패널 「평단 대비 수익률」 과 봉 차트 값 띠가 이 한 함수를 같이 쓴다(SC-4 — 두 글자가 비트까지 같다).
 */
export function fmtRet(r: number | null | undefined): string {
  if (r == null || !Number.isFinite(r)) return DASH;
  const v = Math.round(r * 10000) / 100;
  if (v === 0) return '0.00%';
  return v > 0 ? `+${v.toFixed(2)}%` : `${MINUS}${Math.abs(v).toFixed(2)}%`;
}

export function fmtQty(n: number): string {
  return INT.format(n);
}

export function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}
