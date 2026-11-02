/**
 * 원본 아카이브 목록 — tick-archive 가 GCS 에 올린 시간 단위 pcap-ns(zstd) 객체.
 *
 * 경로 `<root>/<krx|nxt>/<YYYYMMDD>/<YYYYMMDD>-HHMM[-N].pcap.zst`(Cloud Run = GCS 볼륨 마운트 ro).
 * 읽는 범위 = 05~20시(05~06시 A0 배치 포함 · 21~23시 제외 — RESEARCH Pattern 11).
 * 같은 HHMM 에 `-N` 접미 파일이 있으면(기록기 재기동) 첫 레코드 수신 시각순으로 둔다 — 격자 파일이 시각순이 되게.
 */
import { closeSync, existsSync, openSync, readdirSync, readSync } from "node:fs";
import { join } from "node:path";
import zlib from "node:zlib";

export type Label = "krx" | "nxt";

/** 통독 범위 — 05~20시(포함). */
export const SCAN_FIRST_HOUR = 5;
export const SCAN_LAST_HOUR = 20;

const NAME_RE = /^(\d{8})-(\d{2})(\d{2})(?:-(\d+))?\.pcap\.zst$/;
const PCAP_GLOBAL_HDR = 24;
/** 첫 레코드 시각을 읽으려고 앞에서 읽는 압축 바이트 — 전역 헤더 24B + 레코드 헤더 16B 를 풀기에 넉넉하다. */
const HEAD_PROBE_BYTES = 256 * 1024;

type Obj = { path: string; hhmm: string; hour: number; n: number };

function parseName(name: string, ymd: string): Omit<Obj, "path"> | null {
  const m = NAME_RE.exec(name);
  if (!m || m[1] !== ymd) return null;
  const hour = Number(m[2]);
  const minute = Number(m[3]);
  if (hour > 23 || minute > 59) return null;
  return { hhmm: `${m[2]}${m[3]}`, hour, n: m[4] === undefined ? 0 : Number(m[4]) };
}

/**
 * 파일 앞부분만 풀어 첫 pcap 레코드의 수신 시각(ns)을 읽는다. 못 읽으면 null(빈 파일 · 깨진 헤더).
 * 잘린 입력은 `finishFlush: ZSTD_e_flush` 로 푼다(기본 ZSTD_e_end 는 「unexpected end of file」 로 throw).
 */
export function firstRecordNs(path: string): bigint | null {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(HEAD_PROBE_BYTES);
    const got = readSync(fd, buf, 0, HEAD_PROBE_BYTES, 0);
    if (got === 0) return null;
    let raw: Buffer;
    try {
      raw = zlib.zstdDecompressSync(buf.subarray(0, got), { finishFlush: zlib.constants.ZSTD_e_flush });
    } catch {
      return null;
    }
    if (raw.length < PCAP_GLOBAL_HDR + 8) return null;
    const sec = raw.readUInt32LE(PCAP_GLOBAL_HDR);
    const nsec = raw.readUInt32LE(PCAP_GLOBAL_HDR + 4);
    return BigInt(sec) * 1_000_000_000n + BigInt(nsec);
  } finally {
    closeSync(fd);
  }
}

/** 그 날짜 · 라벨의 시각 객체 전부(00~23시) — 정렬 (HHMM, N). 디렉터리가 없으면 []. */
function listAll(root: string, label: Label, ymd: string): Obj[] {
  const dir = join(root, label, ymd);
  if (!existsSync(dir)) return [];
  const out: Obj[] = [];
  for (const name of readdirSync(dir)) {
    const p = parseName(name, ymd);
    if (p) out.push({ path: join(dir, name), ...p });
  }
  out.sort((a, b) => (a.hhmm === b.hhmm ? a.n - b.n : a.hhmm < b.hhmm ? -1 : 1));
  return out;
}

/** 그 날짜 · 라벨에 객체가 있는 시(0~23) 집합 — 업로드 판정(isLabelReady)이 쓴다. */
export function presentHours(root: string, label: Label, ymd: string): Set<number> {
  return new Set(listAll(root, label, ymd).map((o) => o.hour));
}

/**
 * 통독 대상 객체 경로 — 05~20시만 · (HHMM, N) 순 · 같은 HHMM 에 파일이 둘 이상이면 첫 레코드 시각순
 * (못 읽는 파일은 그 HHMM 묶음의 뒤 · 서로는 N 순).
 */
export function listDayObjects(root: string, label: Label, ymd: string): string[] {
  const objs = listAll(root, label, ymd).filter((o) => o.hour >= SCAN_FIRST_HOUR && o.hour <= SCAN_LAST_HOUR);
  const out: string[] = [];
  for (let i = 0; i < objs.length; ) {
    let j = i + 1;
    while (j < objs.length && objs[j]!.hhmm === objs[i]!.hhmm) j += 1;
    const group = objs.slice(i, j);
    if (group.length > 1) {
      const keyed = group.map((o) => ({ o, t: firstRecordNs(o.path) }));
      keyed.sort((a, b) => {
        if (a.t === null || b.t === null) return a.t === b.t ? a.o.n - b.o.n : a.t === null ? 1 : -1;
        return a.t === b.t ? a.o.n - b.o.n : a.t < b.t ? -1 : 1;
      });
      for (const k of keyed) out.push(k.o.path);
    } else {
      out.push(group[0]!.path);
    }
    i = j;
  }
  return out;
}
