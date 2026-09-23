/**
 * 카드별 계좌 슬라이스 — 순수 함수 (quick-260923-onn · 목업 ①A · ②A).
 *
 * 작업대 카드 1장이 보는 미체결·잔고는 relay 계좌 상태(`accountStates.get(accountNo)`)를
 * **이 카드 종목·거래소로 자른 것**이다. 접힌 헤더 요약 칩 · 카드 탭 배지 · 카드 탭 본문이
 * **같은 이 파생값**을 읽는다 — 두 표면이 따로 세면 「미체결 2」 칩과 탭 안 1행이 엇갈리는
 * 순간이 생긴다(두 진실 금지). 새 조회 경로는 없다(T-16-02) — 이미 받은 상태를 자르기만 한다.
 *
 * 필터 규칙은 작업대 `cardForUnfilled`(trading-workbench.tsx) 와 같다 — 같은 ISIN ∧ 행의
 * 거래소. 계좌 축은 호출부가 `accountStates.get(card.accountNo)` 로 이미 골랐다.
 */

import type {
  RelayAccountState,
  RelayExchange,
  RelayHolding,
  RelayUnfilled,
} from "@gh-radar/shared";

export interface CardAccountSlice {
  /**
   * 이 카드 종목·거래소로 잘린 계좌 상태 — `unf`/`hold` 만 잘렸고 나머지 필드는 원본 그대로다.
   * `AccountPanel` 임베드에 그대로 넘긴다(필터는 `account` 를 만드는 호출부의 몫 — 그 파일 규율).
   */
  account: RelayAccountState | null;
  unfilled: RelayUnfilled[];
  holding: RelayHolding | null;
}

/** 같은 ISIN ∧ 같은 거래소 미체결 — 입력 순서 유지. */
export function cardUnfilledOf(
  unf: readonly RelayUnfilled[],
  isin: string,
  exchange: RelayExchange,
): RelayUnfilled[] {
  return unf.filter((row) => row.isin === isin && row.exchange === exchange);
}

/**
 * 이 종목 보유 1행. 잔고엔 거래소가 없다 — KRX/NXT 카드가 같은 잔고를 본다.
 * `qty 0` 은 톰스톤(삭제 신호)이라 보유가 아니다.
 */
export function cardHoldingOf(hold: readonly RelayHolding[], isin: string): RelayHolding | null {
  return hold.find((row) => row.isin === isin && row.qty > 0) ?? null;
}

/** 계좌 상태 → 이 카드 슬라이스. 입력은 건드리지 않는다(스프레드). */
export function cardAccountSliceOf(
  account: RelayAccountState | null,
  isin: string,
  exchange: RelayExchange,
): CardAccountSlice {
  if (account === null) return { account: null, unfilled: [], holding: null };
  const unfilled = cardUnfilledOf(account.unf, isin, exchange);
  const holding = cardHoldingOf(account.hold, isin);
  return {
    account: { ...account, unf: unfilled, hold: holding === null ? [] : [holding] },
    unfilled,
    holding,
  };
}
