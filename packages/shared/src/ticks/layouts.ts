/**
 * Phase 37 (D-19) KRX · NXT 시세 전문의 선언형 레이아웃 — gh-trade tickana `packets.py` LAYOUTS 의 TS 번역.
 *
 * 레이아웃 = (열 이름, 0-기준 시작 오프셋, 길이, 종류) 목록. 열 이름은 **파이썬 Parquet 열 이름 그대로**(snake_case)다.
 * (태그 2자, 전문 길이)가 정확히 맞는 전문만 디코딩하고, 나머지는 raw 로 남긴다(버리지 않는다).
 * 숫자를 손으로 펼치지 않는다 — 파이썬 `_Builder` 와 같은 빌더 · 같은 루프(B6 `s = 47 + 46·(i−1)` ·
 * B9 `s = 23 + 78·(i−1)`)로 만든다. 모듈 import 때 checkLayout 자체검사를 돈다(서버 헤더 static_assert 대응).
 * 파이썬 덤프 `__fixtures__/ticks/layouts.json` 과의 동일성은 `ticks-layouts.test.ts` 가 잠근다.
 *
 * 정본(2026-11-02 원문 기준): gh-trade server/tools/analysis/tickana/packets.py:34-90(LayoutError · Field · Layout ·
 * check_layout · _Builder) · :90-275(레이아웃 6종 · LAYOUTS) · 37-RESEARCH Pattern 2.
 */

/** 필드 종류 — packets.py `KINDS`. */
export type FieldKind = "skip" | "str" | "uint" | "price" | "value22" | "dec6" | "time12" | "euckr";

const KINDS: ReadonlySet<string> = new Set<FieldKind>([
  "str",
  "uint",
  "price",
  "value22",
  "dec6",
  "time12",
  "euckr",
  "skip",
]);

export interface LayoutField {
  name: string;
  offset: number;
  length: number;
  kind: FieldKind;
}

/** 출력 표 이름 — pcap2parquet 표 디렉터리 이름과 같다. */
export type TickTable = "a3" | "b6" | "r8" | "b9" | "c3" | "a0";

export interface Layout {
  table: TickTable;
  tag: string;
  size: number;
  fields: readonly LayoutField[];
}

/** 레이아웃 필드가 빈틈 · 겹침 없이 이어지지 않거나 합이 크기와 다르다 — packets.py `LayoutError`. */
export class LayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LayoutError";
  }
}

/** packets.py `check_layout` 동형. 어긋나면 LayoutError. */
export function checkLayout(layout: Layout): void {
  let pos = 0;
  const names = new Set<string>();
  for (const f of layout.fields) {
    if (!KINDS.has(f.kind)) throw new LayoutError(`${layout.table}.${f.name}: 알 수 없는 종류 '${f.kind}'`);
    if (f.length <= 0) throw new LayoutError(`${layout.table}.${f.name}: 길이 ${f.length}`);
    if (f.offset !== pos) {
      const what = f.offset < pos ? "겹침" : "빈틈";
      throw new LayoutError(`${layout.table}.${f.name}: 오프셋 ${f.offset} ≠ 기대 ${pos} (${what})`);
    }
    if (f.kind !== "skip") {
      if (names.has(f.name)) throw new LayoutError(`${layout.table}.${f.name}: 컬럼명 중복`);
      names.add(f.name);
    }
    if (f.kind === "price" && f.length !== 11) throw new LayoutError(`${layout.table}.${f.name}: price 는 11B`);
    if (f.kind === "time12" && f.length !== 12) throw new LayoutError(`${layout.table}.${f.name}: time12 는 12B`);
    pos += f.length;
  }
  if (pos !== layout.size) throw new LayoutError(`${layout.table}: 필드 합 ${pos} ≠ 크기 ${layout.size}`);
}

/** packets.py `_Builder` — 선언한 시작 오프셋과 누적 위치가 다르면 checkLayout 이 잡는다. */
class Builder {
  readonly fields: LayoutField[] = [];
  add(name: string, offset: number, length: number, kind: FieldKind): this {
    this.fields.push({ name, offset, length, kind });
    return this;
  }
}

/** QuoteHeader 15B (A3 · B6 · R8 공통) — packets.py `_quote_header`. */
function quoteHeader(b: Builder): Builder {
  return b
    .add("data_cat", 0, 2, "skip")
    .add("info_cat", 2, 3, "str")
    .add("msg_seq", 5, 8, "uint")
    .add("board_id", 13, 2, "str");
}

function a3(): Layout {
  const b = quoteHeader(new Builder());
  b.add("session_id", 15, 2, "str")
    .add("isin", 17, 12, "str")
    .add("issue_idx", 29, 6, "uint")
    .add("trade_time", 35, 12, "time12")
    .add("price_change_type", 47, 1, "str")
    .add("price_change", 48, 11, "price")
    .add("trade_price", 59, 11, "price")
    .add("trade_qty", 70, 10, "uint")
    .add("open_price", 80, 11, "price")
    .add("high_price", 91, 11, "price")
    .add("low_price", 102, 11, "price")
    .add("cum_volume", 113, 12, "uint")
    .add("cum_value", 125, 22, "value22")
    .add("final_bs_code", 147, 1, "str") // '1' 매도, '2' 매수
    .add("lp_hold_qty", 148, 15, "uint")
    .add("ask1_px", 163, 11, "price")
    .add("bid1_px", 174, 11, "price")
    .add("eot", 185, 1, "skip");
  return { table: "a3", tag: "A3", size: 186, fields: b.fields };
}

/** A3 체결 186B (22필드). */
export const A3_LAYOUT: Layout = a3();

/** 레이아웃 키 — `${tag}:${size}`(layouts.json 키와 같다). */
export function layoutKey(tag: string, size: number): string {
  return `${tag}:${size}`;
}

const ALL_LAYOUTS: readonly Layout[] = [A3_LAYOUT];

/** (태그:길이) → 레이아웃. 키가 정확히 맞는 전문만 디코딩한다. import 때 전 레이아웃 자체검사. */
export const LAYOUTS: ReadonlyMap<string, Layout> = (() => {
  const m = new Map<string, Layout>();
  for (const l of ALL_LAYOUTS) {
    checkLayout(l);
    m.set(layoutKey(l.tag, l.size), l);
  }
  return m;
})();

/** 전문의 (태그 2자, 길이)가 정확히 맞는 레이아웃. 없으면 null(→ raw). */
export function layoutOf(payload: Uint8Array): Layout | null {
  if (payload.length < 2) return null;
  const tag = String.fromCharCode(payload[0]!, payload[1]!);
  return LAYOUTS.get(layoutKey(tag, payload.length)) ?? null;
}
