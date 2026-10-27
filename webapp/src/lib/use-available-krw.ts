/**
 * Phase 36 D-11 — 작업대 주문 표면(수동주문 폼 · 상따 카드)의 주문가능(원).
 *
 * 계산식은 shared `availableKrwOf` 한 벌이다(WinForms 와 같은 식 — 표면에서 다시 셈하지 않는다). 이 파일은
 * 그 입력 두 개만 웹 쪽에서 모은다 — ① relay 컨텍스트의 그 계좌 상태(66/67 · `budgetKrw` · 잔고 · 미체결)
 * ② 시장가(price 0) 매수 미체결의 현재가(`holdingQuotePrice` · KRX → NXT).
 *
 * 1초 타이머 없음 — `accountStates` · `quotes` 가 바뀌면 컨텍스트 값이 바뀌고 그 렌더가 재계산을 부른다
 * (WinForms 1초 재계산과 동형인 React 반응형).
 */

import { useCallback, useMemo } from "react";
import { availableKrwOf, type RelayQuote } from "@gh-radar/shared";

import { useRelayContext } from "@/lib/relay-provider";
import { relayQuoteKey } from "@/lib/use-relay-socket";

/**
 * 잔고 평가 가격 (**순수 함수** · 18-REVIEW-R2 GC-IN-04) — KRX 시세가 유한·양수면 그 값, 아니면 NXT
 * 시세가 같은 조건이면 그 값, 아니면 `undefined`(평가손익 「—」).
 *
 * 근거: 잔고 행에는 거래소 축이 없다(게이트웨이 `HoldingState` · `RelayHolding` 은 ISIN · 수량 ·
 * 매도가능 · 평단뿐이다). KRX 는 기본 거래소다. NXT
 * 폴백은 NXT 카드만 있는 종목의 평가를 비우지 않기 위해서다. 카드 집합을 읽지 않는다 — 예전에는
 * 그 ISIN 의 **첫 카드** 거래소를 골라 같은 종목 KRX·NXT 카드의 순서에 따라 평가 가격이 바뀌었다.
 *
 * Phase 36: 작업대(`trading-workbench.tsx` — 재수출)에서 옮겼다. 잔고 평가와 주문가능의 시장가 매수
 * 미체결 현재가가 같은 규칙 한 벌을 쓴다(두 벌 금지).
 */
export function holdingQuotePrice(
  quotes: ReadonlyMap<string, RelayQuote>,
  isin: string,
): number | undefined {
  for (const exchange of ["KRX", "NXT"] as const) {
    const p = quotes.get(relayQuoteKey(isin, exchange))?.p;
    if (p !== undefined && Number.isFinite(p) && p > 0) return p;
  }
  return undefined;
}

/**
 * 그 계좌의 주문가능(원 · 음수 허용 — 표시는 `formatManwonFloor`). `null` = 예수금 미설정이거나
 * 계좌 상태 미수신(계좌 `""` 포함) — 화면은 「—」 · 판정 없음.
 */
export function useAvailableKrw(accountNo: string): number | null {
  const { accountStates, quotes } = useRelayContext();
  const account = accountNo !== "" ? (accountStates.get(accountNo) ?? null) : null;
  const priceOf = useCallback((isin: string) => holdingQuotePrice(quotes, isin), [quotes]);
  return useMemo(() => (account ? availableKrwOf(account, priceOf) : null), [account, priceOf]);
}
