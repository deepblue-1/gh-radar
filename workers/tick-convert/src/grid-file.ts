/**
 * 종목 격자 파일(D-19) — `pcapns-rec+zstd/1`: 레코드마다 16B `<IIII>` 헤더 + 원본 UDP 페이로드를 이어붙이고 zstd 한 프레임.
 *
 * `RecordSink` 는 키 하나의 원시 레코드 바이트를 담는 늘어나는 버퍼다 — 레코드마다 작은 배열을 만들지 않아 객체 수 ·
 * 메모리 오버헤드가 없다(요청 모드는 claim 된 종목 키만 담는다 · Pitfall 5).
 */
import zlib from "node:zlib";
import { REC_HDR, iterRecords, tagOf } from "@gh-radar/shared";

const NS_PER_MS = 1_000_000n;
const NS_PER_SEC = 1_000_000_000n;

export class RecordSink {
  private buf: Uint8Array;
  private len = 0;
  count = 0;

  constructor(initial = 64 * 1024) {
    this.buf = new Uint8Array(initial);
  }

  /** 레코드 1건 — shared `encodeRecord` 와 같은 바이트(`<IIII>` sec · nsec · len · len + payload). */
  append(recvNs: bigint, payload: Uint8Array): void {
    const need = this.len + REC_HDR + payload.length;
    if (need > this.buf.length) {
      let cap = this.buf.length * 2;
      while (cap < need) cap *= 2;
      const next = new Uint8Array(cap);
      next.set(this.buf.subarray(0, this.len));
      this.buf = next;
    }
    const dv = new DataView(this.buf.buffer, this.buf.byteOffset + this.len, REC_HDR);
    dv.setUint32(0, Number(recvNs / NS_PER_SEC), true);
    dv.setUint32(4, Number(recvNs % NS_PER_SEC), true);
    dv.setUint32(8, payload.length, true);
    dv.setUint32(12, payload.length, true);
    this.buf.set(payload, this.len + REC_HDR);
    this.len = need;
    this.count += 1;
  }

  get byteLength(): number {
    return this.len;
  }

  /** 지금까지 담은 레코드 바이트(복사 없음 — 이후 append 하면 무효). */
  bytes(): Uint8Array {
    return this.buf.subarray(0, this.len);
  }
}

export type GridFile = {
  bytes: Uint8Array;
  records: number;
  a3Count: number;
  firstRecvMs: number;
  lastRecvMs: number;
};

/** 레코드 바이트 → 격자 파일(zstd 한 프레임) + 메타 수치. 레코드 0 이면 RangeError(호출자는 NO_RECORDS 로 먼저 거른다). */
export function buildGridFile(records: Uint8Array, level: number): GridFile {
  let n = 0;
  let a3 = 0;
  let first: bigint | null = null;
  let last: bigint | null = null;
  for (const r of iterRecords(records)) {
    n += 1;
    if (tagOf(records.subarray(r.off, r.off + r.len)) === "A3") a3 += 1;
    if (first === null) first = r.recvNs;
    last = r.recvNs;
  }
  if (n === 0 || first === null || last === null) throw new RangeError("buildGridFile: 레코드 0");
  const bytes = zlib.zstdCompressSync(records, { params: { [zlib.constants.ZSTD_c_compressionLevel]: level } });
  return {
    bytes,
    records: n,
    a3Count: a3,
    firstRecvMs: Number(first / NS_PER_MS),
    lastRecvMs: Number(last / NS_PER_MS),
  };
}
