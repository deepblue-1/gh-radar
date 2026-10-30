/**
 * Phase 36 — 계좌별 주문가능 금액 한 벌(Phase 31 D-02 「shared 한 벌」).
 *
 * 출처: gh-trade 41-CONTEXT D-11~D-14 · 인박스 `docs/inbox/from-gh-trade/261027-account-budget.md` 「계산식」 —
 * 클라 WinForms 와 같은 식(표시용 — 서버는 판정 · 차단하지 않는다).
 *
 *   주문가능(원) = budget_krw − Σ(잔고 avg_price × stock_qty) − Σ(매수 미체결 unfilled_qty × price)
 *
 * - 잔고는 **매입가(평단 × 수량)** 기준이다(현재가 아님).
 * - 매도 미체결은 빼지 않는다. 매수 미체결은 KRX · NXT · 예약 요약 · 접수대기 전부 포함 — `pending_cancel_sent` 만 제외.
 * - 매수 미체결 price 0(시장가 등)이면 그 종목 현재가, 현재가가 없으면 0(상한가를 쓰지 않는다).
 * - budget_krw 0 · 없음 = 미설정(`null` → 화면 「—」 · 경고 없음). 초과해도 막지 않는다(경고만).
 *
 * 소비자: webapp 계좌 패널 요약 줄(36-01) · 수동주문 · 상따 경고(36-06).
 *
 * 36-10 추가분(UI-SPEC 「숫자 표기 계약」 · D-02 · D-13 · D-18): 손익 표기 `formatPnlManwon` · `pnlToneOf` · `formatManwon1` ·
 * 비용률 % ↔ ppm `pctToPpm` · `ppmToPct` · 어드민 입력 파서 `parseCostPct` · `parseBudgetKrw` · 상따 매수 금액 합 `lcBuyAmountSumKrw`.
 *
 * 순환 금지 — `relay.ts` 는 `import type` 으로만 가져온다.
 */

import type { RelayAccountState } from "./relay";

/** ko-KR 천단위 콤마 — 매 호출마다 만들지 않는다. */
const KRW_NUM = new Intl.NumberFormat("ko-KR");
/** ko-KR 콤마 · 소수 1자리까지(끝 .0 생략). */
const KRW_NUM1 = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });

/** 비용률 상한 — 1% = 10,000ppm(D-02 · 수수료 · 매도세 각각). 범위는 클라가 막는다 — 서버측 범위 검사 없음. */
export const COST_PPM_MAX = 10_000;
/** 예수금 입력 상한 — 13자리 원(옛 9자리 만원 상한과 같은 자릿수 · ≈ 1e13원 · 안전 정수 범위 안). */
export const BUDGET_KRW_MAX = 9_999_999_999_999;

/**
 * 주문가능(원). 예수금 미설정(0 · 없음)이면 `null`.
 *
 * 결과는 **음수를 허용**한다(초과 = 화면 「0만」 `--destructive`) — 내림 · 0 바닥은 표시 단계(`formatManwonFloor`)에서만 한다.
 *
 * @param priceOf 시장가(price 0) 매수 미체결의 현재가 조회. 없거나 `undefined` 를 돌려주면 0 으로 센다.
 */
export function availableKrwOf(
  account: Pick<RelayAccountState, "hold" | "unf"> & { budgetKrw?: number },
  priceOf?: (isin: string) => number | undefined,
): number | null {
  const budget = account.budgetKrw ?? 0;
  if (!(budget > 0)) return null;

  let used = 0;
  for (const h of account.hold) used += h.avgPrice * h.qty;
  for (const u of account.unf) {
    if (u.side !== "B" || u.pendingCancelSent) continue;
    const px = u.price > 0 ? u.price : (priceOf?.(u.isin) ?? 0);
    used += u.unfilledQty * px;
  }
  return budget - used;
}

/**
 * 원 → 「N만」(만원 내림 · ko-KR 콤마 · 억 표기 없음). 음수는 0 으로 본다(호출부 `max(0, v)` 와 같은 결과).
 * 예: 12,345,678 → 「1,234만」 · 9,999 → 「0만」 · 0 → 「0만」 · 1,234,567,890,000 → 「123,456,789만」.
 */
export function formatManwonFloor(krw: number): string {
  return `${KRW_NUM.format(Math.floor(Math.max(0, krw) / 10_000))}만`;
}

/**
 * 손익(원) → 부호 + 「N만」 — **절댓값 내림 후 부호**(Pitfall 13 · 목업 포맷터 동형). > 0 「+」 · < 0 U+2212 「−」 · 0 부호 없음.
 * 부호는 원 값 기준이라 +5,000 은 「+0만」 이다(색도 `pnlToneOf` 로 원 값 부호를 따른다).
 * 예: +1,234,567 → 「+123만」 · −12,345 → 「−1만」(「−2만」 아님) · +5,000 → 「+0만」 · 0 → 「0만」.
 */
export function formatPnlManwon(krw: number): string {
  const sign = krw > 0 ? "+" : krw < 0 ? "\u2212" : "";
  return `${sign}${KRW_NUM.format(Math.floor(Math.abs(krw) / 10_000))}만`;
}

/** 손익 색 톤 — > 0 up(`--up`) · < 0 down(`--down`) · 0 flat(`--fg-2`). */
export function pnlToneOf(krw: number): "up" | "down" | "flat" {
  return krw > 0 ? "up" : krw < 0 ? "down" : "flat";
}

/**
 * 원 → 「N.N만」(소수 1자리 내림 · 끝 .0 생략 · 부호 없음 — 음수는 절댓값). 수수료 · 세금 칸.
 * 예: 16,400 → 「1.6만」 · 10,000 → 「1만」 · 800 → 「0만」 · 12,345,600 → 「1,234.5만」.
 */
export function formatManwon1(krw: number): string {
  return `${KRW_NUM1.format(Math.floor(Math.abs(krw) / 1_000) / 10)}만`;
}

/** 비용률 % → ppm(반올림). 예: 0.01 → 100 · 0.05 → 500 · 0.2 → 2000 · 1 → 10000. */
export function pctToPpm(pct: number): number {
  return Math.round(pct * 10_000);
}

/**
 * ppm → % 문자열(소수 4자리까지 · 끝 0 없음). 부동소수 오차를 피하려고 정수 자릿수를 문자열로 자른다.
 * 예: 100 → "0.01" · 2000 → "0.2" · 125 → "0.0125" · 0 → "0" · 10000 → "1".
 */
export function ppmToPct(ppm: number): string {
  const n = Math.round(ppm);
  const digits = String(Math.abs(n)).padStart(5, "0");
  const int = String(Number(digits.slice(0, -4)));
  const frac = digits.slice(-4).replace(/0+$/, "");
  return `${n < 0 ? "-" : ""}${frac ? `${int}.${frac}` : int}`;
}

/**
 * 어드민 비용률 입력(%) → ppm. 앞뒤 공백 제거 · 빈 칸 = 0 · 소수 넷째 자리까지 · 0 ≤ ppm ≤ `COST_PPM_MAX`(1%).
 * 예: "" → 0 · "0.2" → 2000 · "1" → 10000 · "1.5" · "-0.1" · "0.00001" · "abc" → 실패.
 */
export function parseCostPct(text: string): { ok: true; ppm: number } | { ok: false } {
  const t = text.trim();
  if (t === "") return { ok: true, ppm: 0 };
  if (!/^\d+(\.\d{1,4})?$/.test(t)) return { ok: false };
  const ppm = pctToPpm(Number(t));
  return ppm >= 0 && ppm <= COST_PPM_MAX ? { ok: true, ppm } : { ok: false };
}

/**
 * 어드민 예수금 입력(원) → 원. 콤마 · 공백 제거 · 빈 칸 = 0(해제) · 숫자 1~13자리만(`BUDGET_KRW_MAX`).
 * 예: "10,000,000" → 10,000,000 · "" · "0" → 0 · "9,999,999,999,999" → ok · "12345678901234" · "12a" · "-5" → 실패.
 */
export function parseBudgetKrw(text: string): { ok: true; krw: number } | { ok: false } {
  const t = text.replace(/[,\s]/g, "");
  if (t === "") return { ok: true, krw: 0 };
  if (!/^\d{1,13}$/.test(t)) return { ok: false };
  return { ok: true, krw: Number(t) };
}

/**
 * 상따 한 행의 매수 금액 합(원) — D-13 경고 비교값(36-06 이 이 한 벌만 읽는다). 금액 필드는 만원(Phase 31 `lc-amount`).
 * 선매수 금액은 늘 더하고, 줄매수 · 후매수 금액은 켜짐(Enabled ∨ Auto)일 때만 더한다 — 자동 무장 그룹도 돈을 쓴다
 * (UI-SPEC ④ researcher decision 12 · webapp `buyGroupOpenOf` 와 같은 「켜짐」 식). 폼 값 · 에코(`RelayLimitChaser`) 둘 다 받는다.
 */
export function lcBuyAmountSumKrw(v: {
  buyOrderAmount: number;
  extraBuyOrderAmount: number;
  postBuyOrderAmount: number;
  extraBuyEnabled: boolean;
  extraBuyAuto: boolean;
  postBuyEnabled: boolean;
  postBuyAuto: boolean;
}): number {
  const extra = v.extraBuyEnabled || v.extraBuyAuto ? v.extraBuyOrderAmount : 0;
  const post = v.postBuyEnabled || v.postBuyAuto ? v.postBuyOrderAmount : 0;
  return (v.buyOrderAmount + extra + post) * 10_000;
}
