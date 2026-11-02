/**
 * Phase 37 (D-19) 틱 디코더 골든 대조 헬퍼 — 오라클 생성기 `scripts/tick-oracle/oracle.py` 의 `canon` · `column_digest`
 * 와 한 글자도 다르지 않아야 한다.
 *
 * canon: null/undefined → "~" · bool → "1"/"0" · bigint · 정수 number → 10진 문자열 · 부동소수 열(dec6) → `.6f`
 * (파이썬 `format(v, ".6f")` — -0 은 "-0.000000") · 문자열 → 그대로.
 * 부동소수 여부는 값이 아니라 **열 종류**로 정한다 — 파이썬 float64 열의 0.0 은 "0.000000" 인데 JS 에서는 정수 0 과
 * 구별되지 않기 때문이다(`float` 인자).
 * 열 digest = 행 순서대로 canon 값을 "\n" 으로 이은 UTF-8 의 sha256 hex.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { zstdDecompressSync } from "node:zlib";
import { decodeAny, type FieldValue } from "../../ticks/decode";
import { iterRecords } from "../../ticks/framing";
import { a3TradeOf, type A3Trade } from "../../ticks/orders-krx";

const FIXTURE_DIR = new URL("../../__fixtures__/ticks/", import.meta.url);

/** 픽스처 경로(`src/__fixtures__/ticks/<name>`). */
export function tickFixturePath(name: string): string {
  return fileURLToPath(new URL(name, FIXTURE_DIR));
}

/** `<name>`(.ticks.zst) 를 읽어 zstd 를 푼 레코드 프레이밍 바이트. */
export function readTicksZst(name: string): Uint8Array {
  const buf = zstdDecompressSync(readFileSync(tickFixturePath(name)));
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/** `<name>`(.ticks.zst) → 원본 순서(수신순) A3Trade 배열. `rec` = 레코드 색인(모든 태그 포함). */
export function readA3Trades(name: string, label: string): A3Trade[] {
  const bytes = readTicksZst(name);
  const out: A3Trade[] = [];
  let rec = 0;
  for (const r of iterRecords(bytes)) {
    const { table, row } = decodeAny(bytes.subarray(r.off, r.off + r.len), r.recvNs, label);
    if (table === "a3") out.push(a3TradeOf(rec, row));
    rec += 1;
  }
  return out;
}

/** `<name>`(.json) 을 읽는다. */
export function readTickJson<T>(name: string): T {
  return JSON.parse(readFileSync(tickFixturePath(name), "utf8")) as T;
}

export function canonOf(v: FieldValue | boolean | undefined, float = false): string {
  if (v === null || v === undefined) return "~";
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number") {
    if (Number.isNaN(v)) return "~";
    if (float) return Object.is(v, -0) ? "-0.000000" : v.toFixed(6);
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(6);
  }
  return v;
}

export function columnDigest(values: readonly string[]): string {
  return createHash("sha256").update(values.join("\n"), "utf8").digest("hex");
}

/** 오라클 `decode.json` 모양. */
export interface DecodeGolden {
  source: {
    file: string;
    label: string;
    limit: number | null;
    frames: number;
    records: number;
    counters: { non_ipv4: number; non_udp: number; bad_frame: number; truncated: number };
  };
  tables: Record<
    string,
    {
      rows: number;
      columns: Record<string, { sha256: string; nulls: number }>;
      head: Record<string, string>[];
    }
  >;
}
