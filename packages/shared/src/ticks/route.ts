/**
 * Phase 37 변환 Job 라우팅 프리미티브 — 전문 → (ISIN 키 · 거래소 라벨) · 15% 판정 · 종목·일 등락률 추적.
 *
 * 정본(2026-11-02 원문):
 *   37-RESEARCH Pattern 11 — 태그별 ISIN 오프셋 = packets.py 레이아웃의 isin 필드 오프셋. **길이가 레이아웃과 달라도
 *     같은 태그면 같은 오프셋으로 거른다**(규격이 바뀌어도 종목 격자의 「기타」 행으로 남기 위해).
 *   gh-trade tickana/batch.py:209-247 detect_isins — base = px − chg · pct ∈ {'1' 상한, '2' 상승} · 임계는 정수 곱셈.
 *   gh-trade tickana/teamflow.py:246-258 prepare_frame — 기준가 = px − 부호×chg 의 최빈값(pandas mode().iat[0]).
 *   gh-trade docs/analysis/team-flow.md §5 — 정수 경계(부동소수 비교 금지).
 *
 * D-19 범위 경계: 이 모듈은 범위 결정을 담지 않는다. 모르는 태그 → null 은 프리미티브일 뿐이고, 「ISIN 이 없는 태그를
 * 종목 격자 · 당일 캐시에 넣지 않는다」 는 걸러내기는 Job(37-06 · 37-18)이 한다. 회신으로 종목 단위 태그가 늘면
 * `ISIN_OFFSET` 표에 한 줄 더하는 것으로 끝난다.
 */

/** 태그 → ISIN 12자 시작 오프셋. A3/B6 17 · R8 15 · B9/C3 5 · A0 27. */
export const ISIN_OFFSET: Readonly<Record<string, number>> = Object.freeze({
  A3: 17,
  B6: 17,
  R8: 15,
  B9: 5,
  C3: 5,
  A0: 27,
});

const ISIN_LEN = 12;

/** 전문 앞 2바이트 ASCII(데이터구분). 2바이트보다 짧으면 있는 만큼. */
export function tagOf(payload: Uint8Array): string {
  let s = "";
  for (let i = 0; i < 2 && i < payload.length; i++) s += String.fromCharCode(payload[i]!);
  return s;
}

function isIsinByte(c: number): boolean {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90);
}

/**
 * 종목 키(ISIN 12자). 태그 오프셋에서 길이와 무관하게 읽는다. 모르는 태그 · 오프셋+12 가 길이를 넘음 ·
 * `^[A-Z0-9]{12}$` 가 아님 → null.
 */
export function isinKeyOf(payload: Uint8Array): string | null {
  const off = ISIN_OFFSET[tagOf(payload)];
  if (off === undefined || off + ISIN_LEN > payload.length) return null;
  let s = "";
  for (let i = 0; i < ISIN_LEN; i++) {
    const c = payload[off + i]!;
    if (!isIsinByte(c)) return null;
    s += String.fromCharCode(c);
  }
  return s;
}

/** 정보구분 첫 글자(오프셋 2) '0' → KRX · '5' → NXT · 그 밖 null (packets.py exchange_of 의 라벨 폴백 없는 판). */
export function exchangeLabelOf(payload: Uint8Array): "KRX" | "NXT" | null {
  const c = payload[2];
  if (c === 48) return "KRX";
  if (c === 53) return "NXT";
  return null;
}

/**
 * A3 체결 1건이 기준가 대비 +pctThreshold% 이상인가 — 119 배치 탐지와 같은 정수식.
 * `pct ∈ {'1','2'} ∧ base = px − chg > 0 ∧ chg·100 ≥ base·pctThreshold` (정확히 +15% 포함).
 */
export function hits15(pct: string, px: number, chg: number, pctThreshold = 15): boolean {
  if (pct !== "1" && pct !== "2") return false;
  const base = px - chg;
  return base > 0 && chg * 100 >= base * pctThreshold;
}

/** 등락 부호 — '1'/'2' 상승 +1 · '4'/'5' 하락 −1 · 그 밖 0 (teamflow.prepare_frame). */
function signOf(pct: string): number {
  if (pct === "1" || pct === "2") return 1;
  if (pct === "4" || pct === "5") return -1;
  return 0;
}

/**
 * 종목·일 등락률 추적 — A3 체결을 넣는 순서대로 `add`. 기준가는 `px − 부호×chg` 의 최빈값(동률이면 더 작은 값 —
 * pandas `mode().iat[0]` 은 정렬된 첫 값). 등락률은 `(px / base − 1)·100` 퍼센트 원값(반올림 없음 · 표시용).
 * `hit15` 는 add 한 체결 중 하나라도 hits15 였는가(기준가 최빈값과 무관한 체결 단위 판정).
 */
export class DayRateTracker {
  hit15 = false;
  private readonly counts = new Map<number, number>();
  private maxPx: number | null = null;
  private lastPx: number | null = null;

  constructor(private readonly pctThreshold = 15) {}

  add(pct: string, chg: number, px: number): void {
    const b = px - signOf(pct) * chg;
    this.counts.set(b, (this.counts.get(b) ?? 0) + 1);
    if (this.maxPx === null || px > this.maxPx) this.maxPx = px;
    this.lastPx = px;
    if (!this.hit15 && hits15(pct, px, chg, this.pctThreshold)) this.hit15 = true;
  }

  base(): number | null {
    let best: number | null = null;
    let bestN = 0;
    for (const [v, n] of this.counts) {
      if (n > bestN || (n === bestN && best !== null && v < best)) {
        best = v;
        bestN = n;
      }
    }
    return best;
  }

  private rateOf(px: number | null): number | null {
    const base = this.base();
    if (px === null || base === null || base <= 0) return null;
    return (px / base - 1) * 100;
  }

  /** 최고 체결가의 등락률(기준가 > 0 이면 등락률이 체결가에 단조). */
  highRate(): number | null {
    return this.rateOf(this.maxPx);
  }

  /** 마지막 체결가의 등락률. */
  lastRate(): number | null {
    return this.rateOf(this.lastPx);
  }
}
