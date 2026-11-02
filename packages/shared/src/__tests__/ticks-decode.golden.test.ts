/**
 * Phase 37 (D-19) 디코더 골든 — 같은 pcap 조각을 gh-trade `pcap2parquet`(파이썬 정본)와 TS 디코더로 돌려
 * 표별 행 수 · 열마다 정규화 문자열의 sha256 · 앞 30행이 같은지 본다.
 *
 * 픽스처(`src/__fixtures__/ticks/` · 생성 `bash scripts/tick-oracle/gen-fixtures.sh decode` · README 참고):
 *   cut1300-krx · cut1300-nxt — 에코앤드림 KR7101360006 10/16 13시 컷(A3 · B6)
 *   raw20k-0900               — 10/14 09시 무필터 첫 20,000 프레임(모든 태그 + raw)
 * dst_ip · dst_port 는 레코드 프레이밍에 없어 오라클이 뺐다.
 */
import { describe, it, expect } from "vitest";
import { iterRecords } from "../ticks/framing";
import { LAYOUTS, type TickTable } from "../ticks/layouts";
import { decodeAny, parseDec6, parseTime12Ns, parseValue22, type FieldValue } from "../ticks/decode";
import {
  canonOf,
  columnDigest,
  readTicksZst,
  readTickJson,
  type DecodeGolden,
} from "./helpers/tick-digest";

const FIXTURES = ["cut1300-krx", "cut1300-nxt", "raw20k-0900"] as const;
/** 대조하는 표 — pcap2parquet ALL_TABLES 순서. 픽스처 JSON 에 없는 표는 TS 쪽도 0행이어야 한다. */
const TABLES_UNDER_TEST: readonly (TickTable | "raw")[] = ["a3", "b6", "r8", "b9", "c3", "a0", "raw"];

/** 부동소수(dec6) 열 이름 — 파이썬 float64 열은 `.6f` 로 정규화한다. */
const FLOAT_COLUMNS: ReadonlySet<string> = new Set(
  [...LAYOUTS.values()].flatMap((l) => l.fields.filter((f) => f.kind === "dec6").map((f) => f.name)),
);

function decodeFixture(name: string): { label: string; golden: DecodeGolden; byTable: Map<string, Record<string, FieldValue>[]>; records: number } {
  const golden = readTickJson<DecodeGolden>(`${name}.decode.json`);
  const bytes = readTicksZst(`${name}.ticks.zst`);
  const byTable = new Map<string, Record<string, FieldValue>[]>();
  let records = 0;
  for (const r of iterRecords(bytes)) {
    records += 1;
    const { table, row } = decodeAny(bytes.subarray(r.off, r.off + r.len), r.recvNs, golden.source.label);
    let rows = byTable.get(table);
    if (!rows) byTable.set(table, (rows = []));
    rows.push(row);
  }
  return { label: golden.source.label, golden, byTable, records };
}

describe.each(FIXTURES)("디코더 골든 %s", (name) => {
  const fx = decodeFixture(name);

  it("레코드 수 = 오라클 추출 레코드 수", () => {
    expect(fx.records).toBe(fx.golden.source.records);
  });

  it("오라클 JSON 의 표는 모두 대조 대상이고, TS 가 낸 표는 모두 JSON 에 있다", () => {
    for (const t of Object.keys(fx.golden.tables)) expect(TABLES_UNDER_TEST).toContain(t);
    expect([...fx.byTable.keys()].sort()).toEqual(Object.keys(fx.golden.tables).sort());
  });

  describe.each(TABLES_UNDER_TEST)("표 %s", (table) => {
    const want = fx.golden.tables[table];
    const got = fx.byTable.get(table) ?? [];

    it(want ? `행 수 ${want.rows}` : "오라클에 행이 없다 → TS 도 0행", () => {
      expect(got.length).toBe(want?.rows ?? 0);
    });

    if (!want) return; // 행이 없는 표는 열 대조가 없다(위 0행 단언이 대신한다)

    it("열 이름 집합 · 열마다 sha256 · null 수", () => {
      const cols = Object.keys(want.columns).sort();
      expect(Object.keys(got[0]!).sort()).toEqual(cols);
      for (const col of cols) {
        const vals = got.map((row) => canonOf(row[col], FLOAT_COLUMNS.has(col)));
        expect({ col, sha256: columnDigest(vals), nulls: vals.filter((v) => v === "~").length }).toEqual({
          col,
          ...want.columns[col],
        });
      }
    });

    it("앞 30행 (canon)", () => {
      const head = got.slice(0, want.head.length).map((row) =>
        Object.fromEntries(Object.entries(row).map(([k, v]) => [k, canonOf(v, FLOAT_COLUMNS.has(k))])),
      );
      expect(head).toEqual(want.head);
    });
  });
});

describe("decodeAny raw 보존 · 값 경계(합성 전문)", () => {
  const ascii = (s: string, len = s.length): Uint8Array => {
    const b = new Uint8Array(len).fill(32);
    for (let i = 0; i < s.length && i < len; i++) b[i] = s.charCodeAt(i);
    return b;
  };
  const recv = 1_792_000_000_123_456_789n;

  it("길이가 186 이 아닌 A3 는 raw — tag · info_cat · length · exchange · market", () => {
    const { table, row } = decodeAny(ascii("A301S", 190), recv, "krx");
    expect(table).toBe("raw");
    expect(row).toEqual({ recv_ns: recv, exchange: "KRX", market: "S", tag: "A3", info_cat: "01S", length: 190 });
  });

  it("A0 631B(옛 레이아웃)는 raw", () => {
    expect(decodeAny(ascii("A001Q", 631), recv, "krx").table).toBe("raw");
  });

  it("모르는 태그 · 5B 보다 짧은 전문도 버리지 않는다(공백 채움 · 라벨 폴백)", () => {
    expect(decodeAny(ascii("IA000", 40), recv, "nxt").row).toEqual({
      recv_ns: recv,
      exchange: "KRX",
      market: "0",
      tag: "IA",
      info_cat: "000",
      length: 40,
    });
    expect(decodeAny(ascii("Z9"), recv, "nxt").row).toEqual({
      recv_ns: recv,
      exchange: "NXT",
      market: "",
      tag: "Z9",
      info_cat: "",
      length: 2,
    });
  });

  it("value22 정수부가 2^53 을 넘으면 bigint · dec6 '-' 는 음수(-0 포함)", () => {
    expect(parseValue22(ascii("123456789012345678.000"), 0)).toBe(123456789012345678n);
    expect(parseValue22(ascii("000000001234567890.000"), 0)).toBe(1234567890);
    expect(parseDec6(ascii("-0000.123450"), 0, 12)).toBeCloseTo(-0.12345, 12);
    expect(Object.is(parseDec6(ascii("-0000.000000"), 0, 12), -0)).toBe(true);
    expect(canonOf(-0, true)).toBe("-0.000000");
    expect(canonOf(0, true)).toBe("0.000000");
  });

  it("time12 — 날짜는 수신 시각의 KST 날짜 · 비숫자가 있으면 null", () => {
    // 2026-10-16 13:00:00 KST = 04:00:00 UTC
    const recvNs = BigInt(Date.UTC(2026, 9, 16, 4, 0, 1)) * 1_000_000n;
    expect(parseTime12Ns(ascii("130000123456"), 0, recvNs)).toBe(
      BigInt(Date.UTC(2026, 9, 16, 4, 0, 0)) * 1_000_000n + 123_456_000n,
    );
    expect(parseTime12Ns(ascii("1300001234 6"), 0, recvNs)).toBeNull();
  });
});
