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
 * 소비자: webapp 계좌 패널 요약 줄(36-01) · 수동주문 · 상따 경고(36-06). 표기 · 파서 · `lcBuyAmountSumKrw` 는 36-10 이 이 파일에 더한다.
 *
 * 순환 금지 — `relay.ts` 는 `import type` 으로만 가져온다.
 */

import type { RelayAccountState } from "./relay";

/** ko-KR 천단위 콤마 — 매 호출마다 만들지 않는다. */
const KRW_NUM = new Intl.NumberFormat("ko-KR");

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
