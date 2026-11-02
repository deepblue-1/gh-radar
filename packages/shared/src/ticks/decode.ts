/**
 * Phase 37 (D-19) 시세 전문 디코더 — gh-trade tickana `packets.py` 필드 파서 · `pcap2parquet.py` 표/raw 행의 TS 번역.
 *
 * 출력 행의 키는 **파이썬 Parquet 열 이름 그대로**다(snake_case · time12 는 `<이름>`(원문 문자열) + `<이름>_ns`).
 * 공통 열: `recv_ns`(BigInt) · `exchange` · `market`. 레코드 프레이밍에 IP/포트가 없으므로 `dst_ip` · `dst_port` 는 없다.
 * (태그, 길이)가 LAYOUTS 와 정확히 맞지 않는 전문은 raw 행(tag · info_cat · length · recv_ns · exchange · market)으로
 * 낸다 — 아무것도 버리지 않는다. 중복 수신 전문도 제거하지 않는다(RESEARCH Pitfall 12 · teamflow 「중복 제거는 하지 않는다」).
 *
 * 값 규칙(정본 — 2026-11-02 원문):
 *   packets.py:285-302 `_digit_value`  숫자 바이트만 이어 붙인다(비숫자 건너뜀) · value22 는 '.' 에서 멈춘다 ·
 *                                     numpy int64 누적이라 넘치면 2^64 로 감긴다(→ BigInt.asIntN(64)).
 *   packets.py:313-316 `parse_price`   바이트0 '-' 면 음수 · 바이트1 미사용 · 2..10 숫자
 *   packets.py:323-331 `parse_dec6`    전체 숫자 정수 ÷ 10^(첫 '.' 뒤 숫자 수) · '-' 가 있으면 음수(float64)
 *   packets.py:334-348 `parse_time12`  날짜 = 수신 시각 KST 날짜 · 12자리 중 비숫자 하나라도 있으면 null
 *   packets.py:351-357 `parse_str`     128 이상 → '?' · NUL → 공백 · 오른쪽 공백 제거
 *   packets.py:383-386 euckr           오른쪽 공백/NUL 바이트 제거 → cp949 replace 디코딩
 *   packets.py:412-442 exchange/market 정보구분 첫 글자 '0'→KRX · '5'→NXT · 그 밖은 label 대문자 · 셋째 글자
 *   pcap2parquet.py:321 raw 머리 5B     태그 2 + 정보구분 3, 5B 보다 짧으면 공백 채움
 *   gh-trade analysis/README.md 「Parquet 표 스키마」
 *
 * 숫자는 Number 가 정확한 범위(≤ 2^53−1)면 number, 넘으면 bigint 다. recv_ns · `*_ns` 는 언제나 bigint.
 */
import { LAYOUTS, layoutKey, type Layout, type TickTable } from "./layouts";

export type FieldValue = number | string | bigint | null;

const NS_PER_SEC = 1_000_000_000n;
const KST_OFFSET_NS = 9n * 3600n * NS_PER_SEC; // 한국은 DST 가 없다 — 고정 +9h
const DAY_NS = 86400n * NS_PER_SEC;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const MAX_SAFE_BIG = BigInt(Number.MAX_SAFE_INTEGER);

function digitValue(b: Uint8Array, off: number, len: number, stopAtDot: boolean): number | bigint {
  let v = 0;
  let big: bigint | null = null;
  for (let i = 0; i < len; i++) {
    const c = b[off + i]!;
    if (stopAtDot && c === 46) break;
    if (c < 48 || c > 57) continue;
    const d = c - 48;
    if (big !== null) {
      big = big * 10n + BigInt(d);
    } else {
      const nv = v * 10 + d;
      if (nv > MAX_SAFE) big = BigInt(v) * 10n + BigInt(d);
      else v = nv;
    }
  }
  if (big === null) return v;
  const wrapped = BigInt.asIntN(64, big); // numpy int64 누적과 같은 감김
  return wrapped <= MAX_SAFE_BIG && wrapped >= -MAX_SAFE_BIG ? Number(wrapped) : wrapped;
}

function negate(v: number | bigint): number | bigint {
  if (typeof v === "bigint") return BigInt.asIntN(64, -v);
  return v === 0 ? 0 : -v;
}

/** uint — 숫자 바이트만 이어 붙인 정수(비숫자 건너뜀). */
export function parseUint(b: Uint8Array, off: number, len: number): number | bigint {
  return digitValue(b, off, len, false);
}

/** price 11B — 바이트0 '-' 면 음수 · 바이트1 미사용 · 2..10 숫자. */
export function parsePrice(b: Uint8Array, off: number): number | bigint {
  const v = digitValue(b, off + 2, 9, false);
  return b[off] === 45 ? negate(v) : v;
}

/** value22 22B — '.' 에서 멈춘 정수부. Number 로 정확하지 않으면 bigint. */
export function parseValue22(b: Uint8Array, off: number, len = 22): number | bigint {
  return digitValue(b, off, len, true);
}

/** dec6 — 전체 숫자 정수 ÷ 10^(첫 '.' 뒤 숫자 수) · '-' 가 하나라도 있으면 음수(-0 포함, float64 그대로). */
export function parseDec6(b: Uint8Array, off: number, len: number): number {
  const ival = digitValue(b, off, len, false);
  let frac = 0;
  let afterDot = false;
  let neg = false;
  for (let i = 0; i < len; i++) {
    const c = b[off + i]!;
    if (c === 46) {
      afterDot = true;
      continue;
    }
    if (c === 45) neg = true;
    if (afterDot && c >= 48 && c <= 57) frac += 1;
  }
  const val = Number(ival) / 10 ** frac;
  return neg ? -val : val;
}

/**
 * time12 `HHMMSSuuuuuu`(KST) → epoch ns. 날짜는 수신 시각 + 9h 의 KST 날짜(내림). 12자리 중 비숫자가 하나라도
 * 있으면 null. 전부 BigInt 산술.
 */
export function parseTime12Ns(b: Uint8Array, off: number, recvNs: bigint): bigint | null {
  const d: number[] = [];
  for (let i = 0; i < 12; i++) {
    const c = b[off + i]!;
    if (c < 48 || c > 57) return null;
    d.push(c - 48);
  }
  const hh = d[0]! * 10 + d[1]!;
  const mm = d[2]! * 10 + d[3]!;
  const ss = d[4]! * 10 + d[5]!;
  const us = d[6]! * 100000 + d[7]! * 10000 + d[8]! * 1000 + d[9]! * 100 + d[10]! * 10 + d[11]!;
  const shifted = recvNs + KST_OFFSET_NS;
  // 파이썬 // 는 내림 — 음수 시각(1970 이전)은 없지만 의미를 맞춘다
  let kstDay = shifted / DAY_NS;
  if (shifted < 0n && shifted % DAY_NS !== 0n) kstDay -= 1n;
  const midnightUtc = kstDay * DAY_NS - KST_OFFSET_NS;
  return midnightUtc + BigInt(hh * 3600 + mm * 60 + ss) * NS_PER_SEC + BigInt(us) * 1000n;
}

/** str — 128 이상 → '?' · NUL → 공백 · 오른쪽 공백만 제거. */
export function parseStr(b: Uint8Array, off: number, len: number): string {
  let end = len;
  const codeAt = (i: number): number => {
    const c = i + off < b.length ? b[off + i]! : 32;
    return c >= 128 ? 63 : c === 0 ? 32 : c;
  };
  while (end > 0 && codeAt(end - 1) === 32) end -= 1;
  let s = "";
  for (let i = 0; i < end; i++) s += String.fromCharCode(codeAt(i));
  return s;
}

// lib 가 ES2022(DOM 없음)라 전역 TextDecoder 는 값으로만 보인다 — 인스턴스 타입으로 쓴다(브라우저 · Node 모두 전역에 있다).
let eucKrDecoder: InstanceType<typeof TextDecoder> | null = null;

/** euckr — 오른쪽 공백/NUL 바이트를 떼고 EUC-KR(cp949) 로 디코딩(잘못된 바이트는 U+FFFD). */
export function parseEuckr(b: Uint8Array, off: number, len: number): string {
  let end = off + len;
  while (end > off && (b[end - 1] === 32 || b[end - 1] === 0)) end -= 1;
  eucKrDecoder ??= new TextDecoder("euc-kr");
  return eucKrDecoder.decode(b.subarray(off, end));
}

/** 정보구분 첫 글자(바이트) '0' → KRX · '5' → NXT · 그 밖은 입력 라벨 대문자. */
export function exchangeOf(firstByte: number | undefined, label: string): string {
  if (firstByte === 48) return "KRX";
  if (firstByte === 53) return "NXT";
  return label.toUpperCase();
}

/** 정보구분 셋째 글자(S 코스피 · Q 코스닥 · X …) — 전문 오프셋 4 의 바이트를 str 규칙으로(공백이면 ""). */
export function marketOf(payload: Uint8Array): string {
  return parseStr(payload, 4, 1);
}

/** 레이아웃에 맞는 전문 1건 → 파이썬 열 이름 행. */
export function decodeFields(
  layout: Layout,
  payload: Uint8Array,
  recvNs: bigint,
  label: string,
): Record<string, FieldValue> {
  const row: Record<string, FieldValue> = {
    recv_ns: recvNs,
    exchange: exchangeOf(payload[2], label),
    market: marketOf(payload),
  };
  for (const f of layout.fields) {
    switch (f.kind) {
      case "skip":
        break;
      case "str":
        row[f.name] = parseStr(payload, f.offset, f.length);
        break;
      case "uint":
        row[f.name] = parseUint(payload, f.offset, f.length);
        break;
      case "price":
        row[f.name] = parsePrice(payload, f.offset);
        break;
      case "value22":
        row[f.name] = parseValue22(payload, f.offset, f.length);
        break;
      case "dec6":
        row[f.name] = parseDec6(payload, f.offset, f.length);
        break;
      case "time12":
        row[f.name] = parseStr(payload, f.offset, f.length);
        row[`${f.name}_ns`] = parseTime12Ns(payload, f.offset, recvNs);
        break;
      case "euckr":
        row[f.name] = parseEuckr(payload, f.offset, f.length);
        break;
    }
  }
  return row;
}

/** raw 행 — 태그 · 정보구분(5B 미만이면 공백 채움) · 길이 · 시각 · 거래소 · 시장. 버리지 않는다. */
export function rawHeadOf(payload: Uint8Array, recvNs: bigint, label: string): Record<string, FieldValue> {
  const h = new Uint8Array(5).fill(32);
  h.set(payload.subarray(0, 5));
  return {
    recv_ns: recvNs,
    exchange: exchangeOf(h[2], label),
    market: marketOf(h),
    tag: parseStr(h, 0, 2),
    info_cat: parseStr(h, 2, 3),
    length: payload.length,
  };
}

/** 전문 1건 → (표, 행). (태그, 길이)가 정확히 맞지 않으면 raw. */
export function decodeAny(
  payload: Uint8Array,
  recvNs: bigint,
  label: string,
): { table: TickTable | "raw"; row: Record<string, FieldValue> } {
  const layout =
    payload.length >= 2
      ? LAYOUTS.get(layoutKey(String.fromCharCode(payload[0]!, payload[1]!), payload.length))
      : undefined;
  if (layout) return { table: layout.table, row: decodeFields(layout, payload, recvNs, label) };
  return { table: "raw", row: rawHeadOf(payload, recvNs, label) };
}
