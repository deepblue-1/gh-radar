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

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  availableKrwOf,
  type RelayAccountState,
  type RelayExchange,
  type RelayQuote,
} from "@gh-radar/shared";

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

/**
 * 현재가가 필요한 ISIN(36 WR-02 R2) — 보유 전부(잔고 평가) + 시장가(price 0) 매수 미체결(취소 보냄 제외 · 주문가능 D-11).
 * 지정가 매수 · 매도 미체결은 현재가를 쓰지 않으므로 넣지 않는다(`availableKrwOf` 와 같은 거르기). 중복 없음 · 정렬(구독 키 서명이 순서에
 * 흔들리지 않게).
 */
export function priceIsinsOf(account: Pick<RelayAccountState, "hold" | "unf"> | null): string[] {
  if (account == null) return [];
  const set = new Set<string>();
  for (const h of account.hold) if (h.isin) set.add(h.isin);
  for (const u of account.unf) {
    if (u.side === "B" && !u.pendingCancelSent && !(u.price > 0) && u.isin) set.add(u.isin);
  }
  return [...set].sort();
}

const PRICE_EXCHANGES: readonly RelayExchange[] = ["KRX", "NXT"];

interface HeldPriceKey {
  isin: string;
  exchange: RelayExchange;
  /** 구독을 잡은 순간 맵에 있던 시세 객체 — 이것과 같은 객체면 구독 전부터 있던(굳었을 수 있는) 값이다. */
  base: RelayQuote | undefined;
}

/**
 * 작업대 밖 표면(/me 잔고 탭)의 현재가(36 WR-02 R2). 주어진 ISIN 마다 KRX · NXT 를 `level: "price"` 로 구독하고(작업대 접힌 카드와
 * 같은 레벨 · 59 가격 섹션만), **구독을 잡은 뒤 새로 온 시세만** `holdingQuotePrice`(KRX → NXT) 규칙으로 돌려준다.
 *
 * 왜 「구독 뒤 새 값만」 인가: relay 컨텍스트의 `quotes` 맵은 해제된 키를 지우지 않는다. 작업대에서 SPA 로 넘어오면 카드가 놓은 키의
 * 마지막 시세가 굳은 채 남아 있어, 그대로 읽으면 옛 가격으로 평가 · 손익 · 주문가능을 현재 값처럼 그린다. 구독하면 relay 가 마지막
 * 스냅샷을 곧바로 내리므로(hub `getSnapshot`) 보통 한 박자 안에 새 값으로 바뀐다 — 그 전 · 연결이 끊겨 안 오는 동안은 undefined
 * (평가 「—」 · 시장가 매수 미체결 0 — 시세가 없을 때의 종전 규칙)다.
 *
 * 키 집합이 바뀌면 **새 키를 먼저 잡고 빠진 키만 놓는다**(남는 키는 0 을 지나지 않아 와이어 `unsub`/`sub` 왕복이 없다 —
 * `useRelaySubscription` 의 level 전환과 같은 규율). `enabled` false · 언마운트면 전부 놓는다.
 */
export function useSubscribedPriceOf(
  isins: readonly string[],
  enabled: boolean,
): (isin: string) => number | undefined {
  const { quotes, subscribe, unsubscribe } = useRelayContext();
  // 구독을 잡는 순간의 맵 — 효과 안에서 「구독 전부터 있던 값」 의 기준으로 쓴다(키 수명 효과 deps 에 quotes 를 넣지 않는다).
  const quotesRef = useRef(quotes);
  quotesRef.current = quotes;
  const heldRef = useRef(new Map<string, HeldPriceKey>());
  const sig = enabled ? isins.join(",") : "";

  useEffect(() => {
    const held = heldRef.current;
    const want = new Set<string>();
    for (const isin of sig === "" ? [] : sig.split(",")) {
      for (const exchange of PRICE_EXCHANGES) {
        const key = relayQuoteKey(isin, exchange);
        want.add(key);
        if (held.has(key)) continue;
        subscribe(isin, exchange, "price");
        held.set(key, { isin, exchange, base: quotesRef.current.get(key) });
      }
    }
    for (const [key, h] of held) {
      if (want.has(key)) continue;
      unsubscribe(h.isin, h.exchange, "price");
      held.delete(key);
    }
  }, [sig, subscribe, unsubscribe]);

  // 언마운트(또는 relay 함수 교체) — 잡은 키 전부를 놓는다. 위 효과가 다음 실행에서 다시 잡는다.
  useEffect(() => {
    const held = heldRef.current;
    return () => {
      for (const h of held.values()) unsubscribe(h.isin, h.exchange, "price");
      held.clear();
    };
  }, [unsubscribe]);

  return useCallback(
    (isin: string) => {
      const live = new Map<string, RelayQuote>();
      for (const exchange of PRICE_EXCHANGES) {
        const key = relayQuoteKey(isin, exchange);
        const h = heldRef.current.get(key);
        const q = quotes.get(key);
        if (h !== undefined && q !== undefined && q !== h.base) live.set(key, q);
      }
      return holdingQuotePrice(live, isin);
    },
    [quotes],
  );
}
