/**
 * nightly 대상 판정(D-02) — 그날 매집감지 등록(`tick_convert_candidates` 의 accum ∪ live16) ∪ 그날 +15% 이상 상승.
 *
 * 15% = 체결 단위 정수식(shared `hits15` — 119 배치 탐지 tickana/batch.py detect_isins 와 같은 식)이 그 ISIN 의 A3 ∧ 보드 G1
 * 체결 중 하나라도 참. **KRX G1 ∪ NXT G1** — 어느 거래소든 한 번이라도 참이면 그 ISIN 이 대상이다(37-01 「가정」 A7 ·
 * RESEARCH Open Question 4 RESOLVED). 이견이 오면 이 함수의 집합만 바꾼다.
 *
 * 반환 = isin → 출처 칩 집합(accum · up15). 대상 ISIN 은 호출자가 레코드가 있는 거래소마다 격자를 만든다.
 *
 * 발사 종목(quick 261103-pei design_decisions 7): `cands.launch`(그날 접수 발사 조각 ISIN)도 대상이다 — 출처 칩을 새로
 * 만들지 않고 빈 집합으로 넣는다(행 `sources: []` · CHECK `sources <@ …` 통과 · 목록은 칩 없이 보인다). 이미 있으면 그대로.
 */
import type { DayRateTracker } from "@gh-radar/shared";
import type { Candidates } from "./meta";

export type NightlySource = "accum" | "up15";

/** 출처 칩 순서 — 행 `sources` 배열이 늘 같은 순서가 되게. */
export const SOURCE_ORDER: readonly NightlySource[] = ["accum", "up15"];

/** `rates` 키 = `${isin}|KRX` · `${isin}|NXT`(scan.ts keyOf). */
export function selectTargets(
  cands: Candidates,
  rates: ReadonlyMap<string, DayRateTracker>,
): Map<string, Set<NightlySource>> {
  const out = new Map<string, Set<NightlySource>>();
  const put = (isin: string, s: NightlySource) => {
    let set = out.get(isin);
    if (!set) out.set(isin, (set = new Set()));
    set.add(s);
  };
  for (const isin of cands.accum) put(isin, "accum");
  for (const isin of cands.live16) put(isin, "accum");
  for (const isin of cands.launch) if (!out.has(isin)) out.set(isin, new Set());
  for (const [key, tr] of rates) {
    if (!tr.hit15) continue;
    const bar = key.indexOf("|");
    put(bar < 0 ? key : key.slice(0, bar), "up15");
  }
  return out;
}

/** 출처 집합 → 행 `sources` 배열(SOURCE_ORDER 순). */
export function sourcesOf(set: ReadonlySet<NightlySource>): NightlySource[] {
  return SOURCE_ORDER.filter((s) => set.has(s));
}
