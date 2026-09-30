"use client";

/**
 * ISIN → 종목명 **폴백** — relay 스냅샷이 이름을 모르는 종목만 종목 마스터(`stocks`)에서 채운다.
 *
 * ① 왜 필요한가
 *   `useIsinLabels` 는 relay 가 지금 들고 있는 잔고·미체결·VI 주문·상따 전략에서만 이름을 만든다.
 *   오늘 주문에는 **이미 전량 매도했거나 · 취소·거부돼 지금은 어디에도 없는 종목**이 남는다.
 *   그 행은 이름을 몰라 코드로만 떴다. 이 훅은 그 종목만 골라 마스터에서 이름을 읽는다.
 *
 * ② 호출량 — ISIN 마다 세션당 한 번
 *   모듈 캐시(`names`)가 결과를 들고, 없는 종목도 `null` 로 기억해 다시 묻지 않는다.
 *   모르는 ISIN 들은 isin `.in()` 한 번 — 그래도 못 찾은 보통주가 있을 때만 코드 `.in()` 한 번 더.
 *   `tick-rule.ts` 와 같은 읽기 전용 마스터 조회이고 공식 쿼터가 걸린 외부 API 가 아니다.
 *
 * ③ 우선순위는 relay 가 먼저다
 *   소비자는 relay 라벨의 이름이 있으면 그것을 쓰고, 없을 때만 이 값을 쓴다. 이 훅에는
 *   relay 가 이름을 모르는 ISIN 만 넘긴다.
 *
 * ④ 신규 상장 — 코드 폴백
 *   오늘 상장한 종목은 master-sync(평일 08:10, 전 영업일 KRX 기준) 전이라 `stocks.isin` 이 비어
 *   있다(intraday-sync bootstrap 이 code·name 만 넣는다). isin 으로 못 찾은 보통주 모양 ISIN 만
 *   단축코드로 다시 찾는다. 우선주는 ISIN 6자가 단축코드와 달라(005931 → 005935) 떼지 않는다 —
 *   틀린 코드가 틀린 이름을 만들면 안 된다.
 */

import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

/** ISIN → 이름. `null` = 마스터에도 없다(다시 묻지 않는다). */
const names = new Map<string, string | null>();
const inflight = new Set<string>();

/** 보통주 ISIN — 6자가 단축코드다. 우선주(KR7005931001 → 005935)는 달라서 떼지 않는다. */
const COMMON_ISIN_RE = /^KR7([0-9A-Z]{5}0)00\d$/;

/** 테스트 전용 — 모듈 캐시를 비운다. */
export function clearStockNameCache(): void {
  names.clear();
  inflight.clear();
}

/** 마스터에서 ISIN 묶음의 이름을 읽는다(isin → 없으면 보통주는 단축코드). 오류는 던진다. */
export async function fetchStockNames(isins: readonly string[]): Promise<Map<string, string>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("stocks")
    .select("isin,name")
    .in("isin", [...isins]);
  if (error) throw error;
  const out = new Map<string, string>();
  for (const row of (data ?? []) as { isin: string | null; name: string | null }[]) {
    if (row.isin && row.name) out.set(row.isin, row.name);
  }

  const byCode = new Map<string, string>();
  for (const isin of isins) {
    const m = out.has(isin) ? null : COMMON_ISIN_RE.exec(isin);
    if (m) byCode.set(m[1]!, isin);
  }
  if (byCode.size === 0) return out;

  const res = await supabase
    .from("stocks")
    .select("code,name")
    .in("code", [...byCode.keys()]);
  if (res.error) throw res.error;
  for (const row of (res.data ?? []) as { code: string; name: string | null }[]) {
    const isin = byCode.get(row.code);
    if (isin && row.name) out.set(isin, row.name);
  }
  return out;
}

/**
 * relay 가 이름을 모르는 ISIN 들의 마스터 이름. 조회 전·실패·마스터에 없음은 Map 에 없다
 * (소비자는 기존 코드 폴백을 그대로 쓴다).
 */
export function useStockNames(isins: readonly string[]): ReadonlyMap<string, string> {
  const [version, setVersion] = useState(0);
  const key = [...new Set(isins)].sort().join(",");

  useEffect(() => {
    if (key === "") return;
    const missing = key.split(",").filter((i) => !names.has(i) && !inflight.has(i));
    if (missing.length === 0) return;
    for (const i of missing) inflight.add(i);
    let alive = true;
    fetchStockNames(missing).then(
      (found) => {
        for (const i of missing) {
          names.set(i, found.get(i) ?? null);
          inflight.delete(i);
        }
        if (alive) setVersion((v) => v + 1);
      },
      (err: unknown) => {
        // 캐시하지 않는다 — 다음에 목록이 바뀌면 다시 묻는다. 화면은 코드 폴백 그대로다.
        for (const i of missing) inflight.delete(i);
        console.warn("[stock-names] 종목명 조회 실패 — 코드로 표시한다", missing, err);
      },
    );
    return () => {
      alive = false;
    };
  }, [key]);

  return useMemo(() => {
    const out = new Map<string, string>();
    if (key === "") return out;
    for (const i of key.split(",")) {
      const n = names.get(i);
      if (n) out.set(i, n);
    }
    return out;
    // `version` 은 조회 완료 신호다 — 모듈 캐시는 React 가 모르므로 이것으로 다시 계산한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);
}
