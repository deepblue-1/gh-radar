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
import { decodeAny, type FieldValue } from "../ticks/decode";
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

    it("행 수", () => {
      expect(got.length).toBe(want?.rows ?? 0);
    });

    it.runIf(want !== undefined)("열 이름 집합 · 열마다 sha256 · null 수", () => {
      const cols = Object.keys(want!.columns).sort();
      expect(Object.keys(got[0]!).sort()).toEqual(cols);
      for (const col of cols) {
        const vals = got.map((row) => canonOf(row[col], FLOAT_COLUMNS.has(col)));
        expect({ col, sha256: columnDigest(vals), nulls: vals.filter((v) => v === "~").length }).toEqual({
          col,
          ...want!.columns[col],
        });
      }
    });

    it.runIf(want !== undefined)("앞 30행 (canon)", () => {
      const head = got.slice(0, want!.head.length).map((row) =>
        Object.fromEntries(Object.entries(row).map(([k, v]) => [k, canonOf(v, FLOAT_COLUMNS.has(k))])),
      );
      expect(head).toEqual(want!.head);
    });
  });
});
