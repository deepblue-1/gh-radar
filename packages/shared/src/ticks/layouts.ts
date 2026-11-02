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

function b6(): Layout {
  const b = quoteHeader(new Builder());
  b.add("session_id", 15, 2, "str").add("isin", 17, 12, "str").add("issue_idx", 29, 6, "uint");
  b.add("proc_time", 35, 12, "time12");
  for (let i = 1; i <= 10; i++) {
    // 단계 i 시작 = 47 + 46·(i−1)
    const s = 47 + 46 * (i - 1);
    b.add(`ask${i}_px`, s, 11, "price");
    b.add(`bid${i}_px`, s + 11, 11, "price");
    b.add(`ask${i}_qty`, s + 22, 12, "uint");
    b.add(`bid${i}_qty`, s + 34, 12, "uint");
  }
  b.add("total_ask_qty", 507, 12, "uint")
    .add("total_bid_qty", 519, 12, "uint")
    .add("est_price", 531, 11, "price")
    .add("est_qty", 542, 12, "uint")
    .add("mid_price", 554, 11, "price")
    .add("mid_ask_qty", 565, 12, "uint")
    .add("mid_bid_qty", 577, 12, "uint")
    .add("eot", 589, 1, "skip");
  return { table: "b6", tag: "B6", size: 590, fields: b.fields };
}

function r8(): Layout {
  const b = quoteHeader(new Builder());
  b.add("isin", 15, 12, "str")
    .add("issue_idx", 27, 6, "uint")
    .add("proc_time", 33, 12, "time12")
    .add("vi_end_time", 45, 9, "str") // 원문만 — 발동 전문은 공백
    .add("vi_status", 54, 1, "str") // '1' 발동, '2' 해제
    .add("vi_type", 55, 1, "str") // '1' 정적, '2' 동적, '3' 정적+동적, '4' NXT VI연장
    .add("base_price_svi", 56, 11, "price")
    .add("base_price_dvi", 67, 11, "price")
    .add("trigger_price", 78, 11, "price")
    .add("disparity_svi", 89, 13, "dec6")
    .add("disparity_dvi", 102, 13, "dec6")
    .add("eot", 115, 1, "skip");
  return { table: "r8", tag: "R8", size: 116, fields: b.fields };
}

/** B9 · C3 헤더 23B — QuoteHeader 가 아니다(일련번호 · 보드 없음). packets.py `_info_header`. */
function infoHeader(b: Builder): Builder {
  return b
    .add("data_cat", 0, 2, "skip")
    .add("info_cat", 2, 3, "str")
    .add("isin", 5, 12, "str")
    .add("issue_idx", 17, 6, "uint");
}

function b9(): Layout {
  const b = infoHeader(new Builder());
  for (let i = 1; i <= 5; i++) {
    // 단계 i 시작 = 23 + 78·(i−1). 프리/정규/애프터 보드 합산 누적값
    const s = 23 + 78 * (i - 1);
    b.add(`lv${i}_sell_member`, s, 5, "str");
    b.add(`lv${i}_sell_qty`, s + 5, 12, "uint");
    b.add(`lv${i}_sell_value`, s + 17, 22, "value22");
    b.add(`lv${i}_buy_member`, s + 39, 5, "str");
    b.add(`lv${i}_buy_qty`, s + 44, 12, "uint");
    b.add(`lv${i}_buy_value`, s + 56, 22, "value22");
  }
  b.add("eot", 413, 1, "skip");
  return { table: "b9", tag: "B9", size: 414, fields: b.fields };
}

function c3(): Layout {
  // 출처: KRX 접속표준서 v2.012 IFMSSTD0009 프로그램매매 종목별집계(C301S/C301Q) = NXT 설계서 v2.00 IFMDOS305(C351S/C351Q)
  const b = infoHeader(new Builder());
  b.add("sell_arb_rem", 23, 15, "uint") // 매도차익거래잔량
    .add("buy_arb_rem", 38, 15, "uint")
    .add("sell_nonarb_rem", 53, 15, "uint")
    .add("buy_nonarb_rem", 68, 15, "uint")
    .add("sell_arb_qty", 83, 15, "uint") // 매도차익수량
    .add("buy_arb_qty", 98, 15, "uint")
    .add("sell_nonarb_qty", 113, 15, "uint")
    .add("buy_nonarb_qty", 128, 15, "uint")
    .add("cons_sell_arb_exec_qty", 143, 10, "uint") // 위탁매도차익체결수량
    .add("prop_sell_arb_exec_qty", 153, 10, "uint") // 자기
    .add("cons_buy_arb_exec_qty", 163, 10, "uint")
    .add("prop_buy_arb_exec_qty", 173, 10, "uint")
    .add("cons_sell_nonarb_exec_qty", 183, 10, "uint")
    .add("prop_sell_nonarb_exec_qty", 193, 10, "uint")
    .add("cons_buy_nonarb_exec_qty", 203, 10, "uint")
    .add("prop_buy_nonarb_exec_qty", 213, 10, "uint")
    .add("cons_sell_arb_value", 223, 22, "value22")
    .add("prop_sell_arb_value", 245, 22, "value22")
    .add("cons_buy_arb_value", 267, 22, "value22")
    .add("prop_buy_arb_value", 289, 22, "value22")
    .add("cons_sell_nonarb_value", 311, 22, "value22")
    .add("prop_sell_nonarb_value", 333, 22, "value22")
    .add("cons_buy_nonarb_value", 355, 22, "value22")
    .add("prop_buy_nonarb_value", 377, 22, "value22")
    .add("eot", 399, 1, "skip");
  return { table: "c3", tag: "C3", size: 400, fields: b.fields };
}

/**
 * A0 종목정보 632B (v2.012) — 05~06시 배치로만 온다. QuoteHeader 가 아니다(보드 없음).
 * 631B 옛 레이아웃은 등록하지 않는다 — 그 전문은 raw 로 남는다. 사이 필드는 skip 으로 채운다(packets.py `_a0`).
 */
function a0(): Layout {
  const b = new Builder();
  b.add("data_cat", 0, 2, "skip")
    .add("info_cat", 2, 3, "str")
    .add("msg_seq", 5, 8, "uint")
    .add("total_instr", 13, 6, "uint") // 정보구분총종목수
    .add("biz_date", 19, 8, "str")
    .add("isin", 27, 12, "str")
    .add("issue_idx", 39, 6, "uint")
    .add("short_code", 45, 9, "str") // 'A' + 6자리 + 공백 2
    .add("name", 54, 40, "euckr") // 종목약명 — EUC-KR 원문
    .add("name_eng", 94, 40, "str")
    .add("group_num", 134, 5, "skip") // 정보분배그룹번호
    .add("market_prod_id", 139, 3, "str") // 장운영상품그룹ID
    .add("sec_group_id", 142, 2, "str") // 증권그룹ID (ST/FS/DR …)
    .add("skip_144", 144, 14, "skip") // 단위매매체결여부 … 지배구조우량여부
    .add("admin_flag", 158, 1, "str") // 관리종목여부
    .add("skip_159", 159, 2, "skip") // 불성실공시여부 · 우회상장여부
    .add("halt_flag", 161, 1, "str") // 거래정지여부
    .add("skip_162", 162, 13, "skip") // 업종ID · 중소기업여부 · 소속부구분코드 · 투자기구구분코드
    .add("base_px", 175, 11, "price") // 기준가격
    .add("close_type", 186, 1, "skip") // 전일종가구분코드
    .add("prev_close", 187, 11, "price") // 전일종가
    .add("skip_198", 198, 34, "skip") // 전일누적거래량 · 전일누적거래대금
    .add("upper_px", 232, 11, "price") // 상한가
    .add("lower_px", 243, 11, "price") // 하한가
    .add("skip_254", 254, 41, "skip") // 대용가격 · 액면가 · 발행가격 · 상장일자
    .add("list_shares", 295, 16, "uint") // 상장주식수
    .add("skip_311", 311, 227, "skip") // 정리매매여부 … 상장폐지일자
    .add("short_term_overheat", 538, 1, "str") // 단기과열종목구분코드
    .add("skip_539", 539, 62, "skip") // ETF복제방법구분코드 … 저유동성여부
    .add("abnormal_rise", 601, 1, "str") // 이상급등여부
    .add("skip_602", 602, 29, "skip") // 상한수량 … 프리마켓가능여부(629 · 630)
    .add("eot", 631, 1, "skip");
  return { table: "a0", tag: "A0", size: 632, fields: b.fields };
}

/** A3 체결 186B (22필드). */
export const A3_LAYOUT: Layout = a3();
/** B6 호가 590B (56필드 · 10단계). */
export const B6_LAYOUT: Layout = b6();
/** R8 VI 116B (16필드). */
export const R8_LAYOUT: Layout = r8();
/** B9 거래원 414B (35필드 · 5단계 · 보드 합산 누적값). */
export const B9_LAYOUT: Layout = b9();
/** C3 프로그램매매 종목별집계 400B (29필드). */
export const C3_LAYOUT: Layout = c3();
/** A0 종목정보 632B (32필드 · v2.012). */
export const A0_LAYOUT: Layout = a0();

/** 레이아웃 키 — `${tag}:${size}`(layouts.json 키와 같다). */
export function layoutKey(tag: string, size: number): string {
  return `${tag}:${size}`;
}

/** packets.py `_all_layouts` 순서. */
const ALL_LAYOUTS: readonly Layout[] = [A3_LAYOUT, B6_LAYOUT, R8_LAYOUT, B9_LAYOUT, C3_LAYOUT, A0_LAYOUT];

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
