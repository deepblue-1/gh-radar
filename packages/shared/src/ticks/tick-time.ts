/**
 * Phase 37 (D-18) 틱 시각 — URL `t=HH:MM:SS.mmm`(KST) ↔ epoch ns(BigInt) · 수신순 lower_bound.
 *
 * RESEARCH Pattern 7 「t 점프」: `HH:MM:SS.mmm` → epoch ns → 수신순 recv 배열(로드 때 안정 정렬 · 이미 단조면 생략)에서
 * lower_bound(≥ t) → 그 레코드를 현재 모드(거래소순 · 수신순)의 표시 자리로 옮긴다(`inversePerm`).
 * 날짜 규약: `YYYYMMDD` 또는 `YYYY-MM-DD`(krxCalendar `kstDateIso`) 둘 다 받는다. 한국은 DST 가 없다 — 고정 +9h.
 * 전부 BigInt 산술이다(epoch ns > 2^53 · Anti-Patterns).
 */

/** KST = UTC + 9h (ns). */
export const KST_OFFSET_NS = 32_400_000_000_000n;
const MS_NS = 1_000_000n;
const SEC_NS = 1_000_000_000n;
const DAY_NS = 86_400n * SEC_NS;

const YMD_RE = /^(\d{4})-?(\d{2})-?(\d{2})$/;
const HMS_RE = /^(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/;
const HHMM_RE = /^(\d{2}):?(\d{2})$/;

/** 날짜 → 그날 KST 자정의 epoch ns. 형식 · 달력이 틀리면 null. */
function kstMidnightNs(ymd: string): bigint | null {
  const m = YMD_RE.exec(ymd);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return BigInt(ms) * MS_NS - KST_OFFSET_NS;
}

/** 그날(KST) `hhmm`(기본 08:00 — 슬라이더 시작) 의 epoch ns. 날짜 · 시각이 틀리면 RangeError. */
export function dayStartNs(ymd: string, hhmm = "0800"): bigint {
  const mid = kstMidnightNs(ymd);
  const t = HHMM_RE.exec(hhmm);
  if (mid === null) throw new RangeError(`dayStartNs: 날짜 '${ymd}' 가 YYYYMMDD 가 아니다`);
  if (!t || Number(t[1]) > 23 || Number(t[2]) > 59) throw new RangeError(`dayStartNs: 시각 '${hhmm}' 가 HHMM 이 아니다`);
  return mid + BigInt(Number(t[1]) * 3600 + Number(t[2]) * 60) * SEC_NS;
}

/**
 * `HH:MM:SS(.m{1,3})`(KST) + 날짜 → epoch ns. 밀리초는 소수 자리(".1" = 100ms). 시 0~23 · 분/초 0~59 밖이거나
 * 형식이 틀리면 null.
 */
export function parseTickTime(hms: string, ymd: string): bigint | null {
  const m = HMS_RE.exec(hms);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  const s = Number(m[3]);
  if (h > 23 || mi > 59 || s > 59) return null;
  const mid = kstMidnightNs(ymd);
  if (mid === null) return null;
  const ms = m[4] === undefined ? 0 : Number(m[4].padEnd(3, "0"));
  return mid + BigInt(h * 3600 + mi * 60 + s) * SEC_NS + BigInt(ms) * MS_NS;
}

/** epoch ns → KST `HH:MM:SS.mmm`(밀리초 아래는 버린다). */
export function fmtTickTime(ns: bigint): string {
  let d = (ns + KST_OFFSET_NS) % DAY_NS;
  if (d < 0n) d += DAY_NS;
  const msOfDay = Number(d / MS_NS);
  const h = Math.floor(msOfDay / 3_600_000);
  const mi = Math.floor(msOfDay / 60_000) % 60;
  const s = Math.floor(msOfDay / 1000) % 60;
  const ms = msOfDay % 1000;
  const p2 = (v: number): string => String(v).padStart(2, "0");
  return `${p2(h)}:${p2(mi)}:${p2(s)}.${String(ms).padStart(3, "0")}`;
}

/** 수신순 자리 중 recv ≥ t 인 첫 자리(이진 탐색 · lower_bound). 모두 t 보다 이르면 n. */
export function lowerBoundRecv(recvNs: BigInt64Array, recvOrder: Int32Array, t: bigint): number {
  let lo = 0;
  let hi = recvOrder.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (recvNs[recvOrder[mid]!]! < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
