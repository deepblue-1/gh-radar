/**
 * nightly 메모리 스테이징(D-02 · RESEARCH Pattern 11 · Pitfall 5) — 하루 통독 한 번에 모든 키(isin, 거래소)의 레코드를 모은다.
 *
 * 키마다 원시 버퍼(`RecordSink`)에 레코드를 붙이다가 `chunkBytes`(기본 64KB)를 넘으면 `zstdCompressSync(level 1)` 로
 * 압축 청크 하나를 만들어 목록에 붙이고 원시 버퍼를 비운다. 통독이 끝나면 대상 키만 `take` 로 풀어 격자 파일(zstd 9)로
 * 다시 압축하고, 나머지는 `drop` 한다 — Archive 클래스 꺼내기 요금을 두 번 내지 않으려고 원본을 다시 읽지 않는다.
 *
 * Cloud Run 파일시스템은 메모리라(Pitfall 5) 처음부터 메모리 압축 청크다. 10/14 KRX 전 종목 원시 23.4GB(키 2,840) →
 * level 1 청크 ≈ 7~10%(RESEARCH 실측) · 원시 꼬리는 키당 최대 2×chunkBytes.
 *
 * 청크는 따로따로 푼다 — 이어붙인 프레임을 한 번에 풀면 Node zstd 는 첫 프레임만 돌려준다(37-02 실측 · `splitZstdFrames`).
 * 청크를 하나의 버퍼로 이어붙이지 않으므로 프레임 경계를 다시 찾을 일이 없다.
 *
 * 바이트 계약: `take(key)` = 그 키에 `add` 한 레코드를 순서대로 `RecordSink.append` 한 바이트와 같다(request 모드와 같은 바이트).
 */
import zlib from "node:zlib";
import { RecordSink } from "./grid-file";

/** 비운 뒤 새 원시 버퍼의 시작 크기 — 대부분의 키는 하루 레코드가 적어 64KB 를 다 쓰지 않는다. */
const TAIL_INITIAL = 4096;

type Entry = { tail: RecordSink; chunks: Uint8Array[]; chunkBytes: number; rawBytes: number };

export class KeyStager {
  private readonly map = new Map<string, Entry>();
  private compressed = 0;
  private tails = 0;
  private raw = 0;
  private peak = 0;

  constructor(private readonly chunkBytes: number) {
    if (!Number.isInteger(chunkBytes) || chunkBytes <= 0) throw new RangeError(`KeyStager: chunkBytes ${chunkBytes}`);
  }

  /** 레코드 1건(`<IIII>` 헤더 + 페이로드 — RecordSink 와 같은 바이트). 원시 꼬리가 chunkBytes 이상이면 압축 청크로 옮긴다. */
  add(key: string, recvNs: bigint, payload: Uint8Array): void {
    let e = this.map.get(key);
    if (!e) {
      e = { tail: new RecordSink(TAIL_INITIAL), chunks: [], chunkBytes: 0, rawBytes: 0 };
      this.map.set(key, e);
    }
    const before = e.tail.byteLength;
    e.tail.append(recvNs, payload);
    const grew = e.tail.byteLength - before;
    this.tails += grew;
    this.raw += grew;
    e.rawBytes += grew;
    if (e.tail.byteLength >= this.chunkBytes) {
      // zstdCompressSync 결과는 출력 버퍼(64KB)의 slice 라 그대로 두면 청크마다 64KB 를 붙잡는다 —
      // 압축해도 메모리가 원시 크기만큼 늘어 10/30 실측이 8Gi 에서 OOM(signal 9)으로 죽었다. 제 길이로 복사해 둔다.
      const c = Uint8Array.prototype.slice.call(
        zlib.zstdCompressSync(e.tail.bytes(), { params: { [zlib.constants.ZSTD_c_compressionLevel]: 1 } }),
      );
      e.chunks.push(c);
      e.chunkBytes += c.length;
      this.compressed += c.length;
      this.tails -= e.tail.byteLength;
      e.tail = new RecordSink(TAIL_INITIAL);
    }
    const now = this.compressed + this.tails;
    if (now > this.peak) this.peak = now;
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  keys(): string[] {
    return [...this.map.keys()];
  }

  /**
   * 그 키의 원시 레코드 바이트(청크 해제 + 꼬리) — 꺼낸 키는 스테이저에서 빠진다. 없는 키면 빈 배열.
   * 청크는 하나씩 풀어 바로 복사하고 버린다 — 전부 푼 뒤 이어붙이면 순간 메모리가 원시 크기의 2배가 되어 11/06 삼성전자
   * NXT(원시 ≈1.4GB)에서 8Gi OOM(signal 9)으로 죽었다. 지금은 원시 1배 + 청크 하나(≈chunkBytes).
   */
  take(key: string): Uint8Array {
    const e = this.map.get(key);
    if (!e) return new Uint8Array(0);
    this.forget(key, e);
    const tail = e.tail.bytes();
    const out = new Uint8Array(e.rawBytes);
    let off = 0;
    for (const c of e.chunks) {
      const p = zlib.zstdDecompressSync(c);
      if (off + p.length > out.length) throw new Error(`KeyStager.take ${key}: 청크 해제 길이가 원시 ${e.rawBytes}B 를 넘는다`);
      out.set(p, off);
      off += p.length;
    }
    e.chunks.length = 0;
    out.set(tail, off);
    off += tail.length;
    if (off !== e.rawBytes) throw new Error(`KeyStager.take ${key}: ${off}/${e.rawBytes}B — 청크 해제 길이가 어긋난다`);
    return out;
  }

  /** 그 키를 버린다(대상이 아닌 키). */
  drop(key: string): void {
    const e = this.map.get(key);
    if (e) this.forget(key, e);
  }

  /** 지금 들고 있는 바이트(압축 청크 + 원시 꼬리). */
  stagedBytes(): number {
    return this.compressed + this.tails;
  }

  /** 들고 있던 최대 바이트(요약 로그 `staged=` — 메모리 실측 SC3). */
  peakBytes(): number {
    return this.peak;
  }

  /** 지금까지 add 한 원시 레코드 바이트 합(압축률 = peakBytes / rawBytes 근사). */
  rawBytes(): number {
    return this.raw;
  }

  private forget(key: string, e: Entry): void {
    this.map.delete(key);
    this.compressed -= e.chunkBytes;
    this.tails -= e.tail.byteLength;
  }
}
