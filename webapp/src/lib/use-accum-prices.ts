/**
 * 작업대 매집 패널 현재가 · 등락률 원천 훅 (quick-261104-nxs).
 *
 * ① 원천 = relay `accum.prices`(gh-trade 95 `AccumPriceBatch`)
 *   relay 가 quote 관찰자 연결 하나에서 95 를 받아 전역 캐시로 들고, **인증된 소켓 전부**에 흘린다 — 종목별 구독이
 *   없다(구독 예산 40 을 먹지 않는다). 웹 소켓은 그것을 시장 배치(`use-relay-socket` 규율 8)로 `accumPrices` 에
 *   담는다. 커버리지는 quote 주 서버의 매집 감시 집합이고, 구 서버 · 구 relay 면 늘 비어 있다(= 전부 구독 폴백).
 *
 * ② 「있다」 판정(`accumLivePriceOf`)
 *   원소가 있고 `p` 가 유한수 > 0 이고 `r` 이 유한수일 때만 값이 있다. 그 밖(0 원 · NaN)은 「모름」 이라 그 종목은
 *   구독 폴백으로 간다 — 0 원 현재가를 그리면 등락률 −100% 같은 거짓 값이 칩에 뜬다.
 *
 * ③ ≤5Hz 스로틀(`BREAKOUT_PRICE_THROTTLE_MS` — 간격 정본 하나)
 *   `useBreakoutQuotes` ⑤ 와 같은 방식이다 — 입력 isin 들의 값 서명(`isin:p:r`)이 바뀔 때만 마감을 걸고, 마감은
 *   **절대 시각**(마지막 적용 + 간격)이라 연속 갱신이 반영을 굶기지 않으며, 창이 닫힐 때 그 시점 최신 값을 읽으므로
 *   마지막 값은 반드시 도착한다. 첫 렌더는 동기 초기화라 빈 첫 화면이 없다. 95 는 300ms 주기 변경분이라 커밋 상한
 *   (≈10/s)은 시장 배치가 쥐고, 패널 views 재계산은 이 훅이 5Hz 이하로 묶는다(debug `trading-cpu-260923`).
 *
 * ④ `covered` 신원 안정
 *   표시 중인 `prices` 의 키 집합을 정렬 서명으로 memo 한다 — 서명이 같으면 같은 Set 이다. 소비처는 이것으로
 *   구독 후보를 거르므로, 값만 바뀐 갱신이 후보 배열을 새로 만들어 구독 diff 를 흔들지 않는다.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import type { RelayAccumPriceItem } from "@gh-radar/shared";

import { useRelayContext } from "@/lib/relay-provider";
import { BREAKOUT_PRICE_THROTTLE_MS } from "@/lib/use-breakout-quotes";

/** 패널이 읽는 95 값 — 현재가(원) · 등락률(%). */
export interface AccumLivePrice {
  p: number;
  r: number;
}

/** 시그니처 구분자 — ISIN 에는 쉼표가 없다. */
const SIG_SEP = ",";

/** ② — 95 값이 「있다」 고 볼 수 있을 때만 값, 아니면 undefined(모름). */
export function accumLivePriceOf(
  map: ReadonlyMap<string, RelayAccumPriceItem>,
  isin: string,
): AccumLivePrice | undefined {
  const item = map.get(isin);
  if (item === undefined) return undefined;
  if (!Number.isFinite(item.p) || item.p <= 0 || !Number.isFinite(item.r)) return undefined;
  return { p: item.p, r: item.r };
}

/** 입력 isin 들의 값 서명 — 값이 있는 것만 `isin:p:r` 로 싣는다(입력 순서 그대로). */
function priceSigOf(map: ReadonlyMap<string, RelayAccumPriceItem>, isins: readonly string[]): string {
  const parts: string[] = [];
  for (const isin of isins) {
    const live = accumLivePriceOf(map, isin);
    if (live !== undefined) parts.push(`${isin}:${live.p}:${live.r}`);
  }
  return parts.join(SIG_SEP);
}

function readPrices(
  map: ReadonlyMap<string, RelayAccumPriceItem>,
  isins: readonly string[],
): ReadonlyMap<string, AccumLivePrice> {
  const out = new Map<string, AccumLivePrice>();
  for (const isin of isins) {
    const live = accumLivePriceOf(map, isin);
    if (live !== undefined) out.set(isin, live);
  }
  return out;
}

/**
 * 매집 패널 행들의 95 현재가 · 등락률(≤5Hz) 과 95 가 덮는 isin 집합.
 *
 * @param isins 95 를 쓸 행의 ISIN(활성 KRX 행). 바뀌면 다음 스로틀 창에 반영된다.
 */
export function useAccumPrices(isins: readonly string[]): {
  prices: ReadonlyMap<string, AccumLivePrice>;
  covered: ReadonlySet<string>;
} {
  const { accumPrices } = useRelayContext();

  const currentSig = useMemo(() => priceSigOf(accumPrices, isins), [accumPrices, isins]);
  // 첫 렌더 값으로 동기 초기화 — 빈 첫 화면이 없다(③).
  const [shown, setShown] = useState(() => ({
    sig: currentSig,
    prices: readPrices(accumPrices, isins),
  }));
  const [mountedAt] = useState(() => Date.now());
  /** 마지막으로 표시 값을 적용한 시각. 마운트 시각에서 시작한다. */
  const appliedAtRef = useRef(mountedAt);
  /** 타이머가 적용할 최신 입력. 창이 닫힐 때 그 시점의 값을 읽는다(마지막 값 도착). */
  const latestRef = useRef({ accumPrices, isins });

  useEffect(() => {
    latestRef.current = { accumPrices, isins };
  });

  useEffect(() => {
    if (currentSig === shown.sig) return;
    // 마감은 **절대 시각**(마지막 적용 + 간격)이다 — 재예약돼도 연속 갱신이 반영을 굶기지 않는다.
    const delay = Math.max(0, appliedAtRef.current + BREAKOUT_PRICE_THROTTLE_MS - Date.now());
    const timer = setTimeout(() => {
      const latest = latestRef.current;
      appliedAtRef.current = Date.now();
      setShown({
        sig: priceSigOf(latest.accumPrices, latest.isins),
        prices: readPrices(latest.accumPrices, latest.isins),
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [currentSig, shown.sig]);

  // ④ — 키 집합 서명이 같으면 같은 Set 이다.
  const coveredSig = useMemo(() => [...shown.prices.keys()].sort().join(SIG_SEP), [shown.prices]);
  const covered = useMemo<ReadonlySet<string>>(
    () => new Set(coveredSig === "" ? [] : coveredSig.split(SIG_SEP)),
    [coveredSig],
  );

  return { prices: shown.prices, covered };
}
