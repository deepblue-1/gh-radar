/**
 * Phase 37 (D-19 · D-21 ②) 틱 레코드 프레이밍 — 격자 파일 · tickgw 응답 · 브라우저가 같이 쓰는 바이트 형식.
 *
 * 형식 `pcapns-rec+zstd/1`: 레코드마다 16B 헤더 `<IIII`(ts_sec · ts_nsec · incl_len · orig_len · 리틀엔디언 —
 * pcap-ns 레코드 헤더와 같다) 뒤에 **원본 UDP 페이로드**(전문 1건). 전역 헤더 24B 는 넣지 않는다 — 그래서 여러
 * 응답 · 여러 zstd 프레임을 이어붙여도 그대로 유효한 스트림이다. 압축은 바깥(zstd)이 맡는다.
 *
 * 정본(2026-11-02 원문 기준):
 *   gh-trade server/tools/analysis/tickana/pcap2parquet.py:34-43 `PCAP_MAGIC_NS` · `_REC = "<IIII"` · `_GHDR = "<IHHiIII"`
 *   gh-trade server/tools/analysis/tickana/pcap2parquet.py:281-330 레코드 루프 · 이더넷 → IPv4 → UDP 벗김 · 카운터
 *   37-RESEARCH Pattern 1
 *
 * recv_ns 는 언제나 BigInt 다 — epoch ns ≈ 1.79e18 > 2^53 이라 Number 로 만들면 256ns 단위로 뭉개진다
 * (gh-trade nxt_runs.py:50 주석 · RESEARCH Anti-Patterns).
 */

/** 레코드 헤더 길이 `<IIII>`. */
export const REC_HDR = 16;
/** 격자 파일 형식 문자열 — 표 메타(`tick_grids.fmt`)에 남겨 형식을 버전으로 갈아탈 길을 둔다. */
export const TICK_FMT = "pcapns-rec+zstd/1";

const NS_PER_SEC = 1_000_000_000n;
const PCAP_MAGIC_NS = 0xa1b23c4d;
const LINKTYPE_ETHERNET = 1;
const PCAP_GLOBAL_HDR = 24;

/** 레코드 1건의 위치 — `off` = 페이로드 시작(헤더 뒤) · `len` = 페이로드 길이(incl_len). */
export interface RecRef {
  recvNs: bigint;
  off: number;
  len: number;
}

function recvNsOf(sec: number, nsec: number): bigint {
  return BigInt(sec) * NS_PER_SEC + BigInt(nsec);
}

function viewOf(buf: Uint8Array): DataView {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
}

/**
 * 레코드 프레이밍 바이트를 앞에서부터 순회한다. 끝이 잘린 레코드에서 멈춘다 — 이어 읽기는 호출자가
 * 마지막 레코드 끝(`off + len`) 뒤의 꼬리를 다음 청크 앞에 붙여 다시 부른다.
 */
export function* iterRecords(buf: Uint8Array): Generator<RecRef> {
  const dv = viewOf(buf);
  for (let p = 0; p + REC_HDR <= buf.length; ) {
    const s = dv.getUint32(p, true);
    const ns = dv.getUint32(p + 4, true);
    const incl = dv.getUint32(p + 8, true);
    const end = p + REC_HDR + incl;
    if (end > buf.length) break; // 잘린 꼬리 — 다음 청크와 이어 읽는다
    yield { recvNs: recvNsOf(s, ns), off: p + REC_HDR, len: incl };
    p = end;
  }
}

/** 레코드 1건을 만든다 — `<IIII>`(sec, nsec, len, len) + payload. */
export function encodeRecord(recvNs: bigint, payload: Uint8Array): Uint8Array {
  if (recvNs < 0n) throw new RangeError(`encodeRecord: recvNs ${recvNs} < 0`);
  const sec = recvNs / NS_PER_SEC;
  const nsec = recvNs % NS_PER_SEC;
  if (sec > 0xffffffffn) throw new RangeError(`encodeRecord: sec ${sec} 가 u32 를 넘는다`);
  const out = new Uint8Array(REC_HDR + payload.length);
  const dv = viewOf(out);
  dv.setUint32(0, Number(sec), true);
  dv.setUint32(4, Number(nsec), true);
  dv.setUint32(8, payload.length, true);
  dv.setUint32(12, payload.length, true);
  out.set(payload, REC_HDR);
  return out;
}

/** 바이트 조각들을 하나로 잇는다. */
export function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  let n = 0;
  for (const c of chunks) n += c.length;
  const out = new Uint8Array(n);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

const ZSTD_MAGIC = 0xfd2fb528;

/**
 * 이어붙인 zstd 바이트를 프레임 단위로 나눈다(스킵 가능 프레임은 버린다 · RFC 8878 §3.1).
 *
 * 왜 필요한가: Node 24 `zlib.zstdDecompressSync` · `createZstdDecompress` 는 **첫 프레임에서 멈추고 뒤 프레임을
 * 조용히 버린다**(2026-11-02 실측 · gunzip 은 멤버를 모두 푼다). 레코드 프레이밍은 「여러 zstd 프레임을 이어붙여도 그대로
 * 유효한 스트림」 이 핵심 성질이므로, 이어붙인 바이트는 이 함수로 나눠 프레임마다 풀고 결과를 `concatBytes` 로 잇는다.
 * 순수 함수라 브라우저 · Node 공용이다. 잘리거나 깨진 프레임이면 RangeError.
 */
export function splitZstdFrames(buf: Uint8Array): Uint8Array[] {
  const dv = viewOf(buf);
  const out: Uint8Array[] = [];
  let p = 0;
  const need = (n: number): void => {
    if (p + n > buf.length) throw new RangeError(`zstd: ${p} 에서 ${n}B 가 필요한데 바이트가 끝났다(잘린 프레임)`);
  };
  while (p < buf.length) {
    need(4);
    const magic = dv.getUint32(p, true);
    const start = p;
    if ((magic & 0xfffffff0) === 0x184d2a50) {
      // 스킵 가능 프레임 — magic 4B + 크기 4B + 내용
      need(8);
      const size = dv.getUint32(p + 4, true);
      p += 8;
      need(size);
      p += size;
      continue;
    }
    if (magic !== ZSTD_MAGIC) throw new RangeError(`zstd: ${p} 의 magic 0x${magic.toString(16)} 가 프레임 시작이 아니다`);
    p += 4;
    need(1);
    const fhd = buf[p]!;
    p += 1;
    const fcsFlag = fhd >> 6;
    const singleSegment = (fhd >> 5) & 1;
    const checksum = (fhd >> 2) & 1;
    const didFlag = fhd & 3;
    const headerRest =
      (singleSegment ? 0 : 1) + [0, 1, 2, 4][didFlag]! + (fcsFlag === 0 ? singleSegment : [0, 2, 4, 8][fcsFlag]!);
    need(headerRest);
    p += headerRest;
    for (;;) {
      need(3);
      const bh = buf[p]! | (buf[p + 1]! << 8) | (buf[p + 2]! << 16);
      p += 3;
      const last = bh & 1;
      const type = (bh >> 1) & 3;
      const size = bh >>> 3;
      if (type === 3) throw new RangeError(`zstd: ${p - 3} 의 블록 종류 3(예약)`);
      const content = type === 1 ? 1 : size; // RLE 는 바이트 1개
      need(content);
      p += content;
      if (last) break;
    }
    if (checksum) {
      need(4);
      p += 4;
    }
    out.push(buf.subarray(start, p));
  }
  return out;
}

/** pcap-ns 전역 헤더가 형식에 맞지 않다(magic · linktype). pcap2parquet `PcapFormatError` 동형. */
export class PcapFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PcapFormatError";
  }
}

/** 원본 pcap 에서 벗겨 낸 UDP 페이로드 1건. */
export interface RawPacket {
  recvNs: bigint;
  payload: Uint8Array;
}

/** 프레임 분류 카운터 — pcap2parquet `convert_file` 의 `packets` · `non_ipv4` · `non_udp` · `bad_frame` 동형. */
export interface PcapCounters {
  packets: number;
  nonIpv4: number;
  nonUdp: number;
  badFrame: number;
}

/**
 * 원본 pcap-ns(이더넷) 스트림 → UDP 페이로드. 청크 경계와 무관하게 같은 결과를 낸다(`push` 를 몇 번에 나눠
 * 불러도). 첫 24B 전역 헤더에서 magic `0xA1B23C4D`(리틀엔디언 ns) · linktype 1(EN10MB)이 아니면
 * `PcapFormatError`. 비 IPv4 · 비 UDP · 깨진 프레임은 건너뛰고 `counters` 에 센다(pcap2parquet.py:289-308 과 같은 조건).
 */
export class PcapNsReader {
  readonly counters: PcapCounters = { packets: 0, nonIpv4: 0, nonUdp: 0, badFrame: 0 };
  private tail: Uint8Array = new Uint8Array(0);
  private headerSeen = false;

  push(chunk: Uint8Array): RawPacket[] {
    let buf = this.tail.length > 0 ? concatBytes([this.tail, chunk]) : chunk;
    if (!this.headerSeen) {
      if (buf.length < PCAP_GLOBAL_HDR) {
        this.tail = buf.slice();
        return [];
      }
      const hv = viewOf(buf);
      const magic = hv.getUint32(0, true);
      const link = hv.getUint32(20, true);
      if (magic !== PCAP_MAGIC_NS) {
        throw new PcapFormatError(
          `magic 0x${magic.toString(16).padStart(8, "0")} ≠ 0xa1b23c4d(pcap-ns little-endian)`,
        );
      }
      if (link !== LINKTYPE_ETHERNET) throw new PcapFormatError(`링크타입 ${link} ≠ 1(EN10MB)`);
      this.headerSeen = true;
      buf = buf.subarray(PCAP_GLOBAL_HDR);
    }
    const out: RawPacket[] = [];
    const dv = viewOf(buf);
    const n = buf.length;
    let pos = 0;
    while (pos + REC_HDR <= n) {
      const tsS = dv.getUint32(pos, true);
      const tsNs = dv.getUint32(pos + 4, true);
      const incl = dv.getUint32(pos + 8, true);
      const fr = pos + REC_HDR;
      const end = fr + incl;
      if (end > n) break;
      pos = end;
      this.counters.packets += 1;
      if (incl < 14 || buf[fr + 12] !== 0x08 || buf[fr + 13] !== 0x00) {
        this.counters.nonIpv4 += 1;
        continue;
      }
      if (incl < 34 || buf[fr + 23] !== 17) {
        if (incl < 34) this.counters.badFrame += 1;
        else this.counters.nonUdp += 1;
        continue;
      }
      const ihl = (buf[fr + 14]! & 0x0f) * 4;
      const udp = fr + 14 + ihl;
      if (ihl < 20 || udp + 8 > end) {
        this.counters.badFrame += 1;
        continue;
      }
      const ulen = dv.getUint16(udp + 4, false);
      const p = udp + 8;
      const q = udp + ulen;
      if (ulen < 8 || q > end) {
        this.counters.badFrame += 1;
        continue;
      }
      out.push({ recvNs: recvNsOf(tsS, tsNs), payload: buf.slice(p, q) });
    }
    this.tail = buf.slice(pos);
    return out;
  }

  /** 아직 레코드가 되지 못한 꼬리 바이트 수 — 스트림 끝에서 0 이 아니면 잘린 레코드다(pcap2parquet `truncated`). */
  get pending(): number {
    return this.tail.length;
  }
}
