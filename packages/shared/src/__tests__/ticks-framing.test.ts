/**
 * Phase 37 (D-19 · D-21 ②) 틱 레코드 프레이밍 — `pcapns-rec+zstd/1`.
 * 정본: gh-trade tickana/pcap2parquet.py:34-43(`_REC` `<IIII>` · magic) · :281-330(레코드 루프 · 이더넷/IPv4/UDP 벗김).
 */
import { describe, it, expect } from "vitest";
import { zstdCompressSync, zstdDecompressSync } from "node:zlib";
import {
  REC_HDR,
  TICK_FMT,
  iterRecords,
  encodeRecord,
  concatBytes,
  PcapNsReader,
  PcapFormatError,
  splitZstdFrames,
} from "../ticks/framing";

const ascii = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));

function u8(buf: Buffer): Uint8Array {
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/** pcap-ns 전역 헤더 24B `<IHHiIII>`. */
function globalHeader(magic = 0xa1b23c4d, link = 1): Uint8Array {
  const b = new Uint8Array(24);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, magic, true);
  dv.setUint16(4, 2, true);
  dv.setUint16(6, 4, true);
  dv.setInt32(8, 0, true);
  dv.setUint32(12, 0, true);
  dv.setUint32(16, 65535, true);
  dv.setUint32(20, link, true);
  return b;
}

/** pcap 레코드(헤더 16B + 프레임). */
function pcapRecord(sec: number, nsec: number, frame: Uint8Array): Uint8Array {
  const h = new Uint8Array(16);
  const dv = new DataView(h.buffer);
  dv.setUint32(0, sec, true);
  dv.setUint32(4, nsec, true);
  dv.setUint32(8, frame.length, true);
  dv.setUint32(12, frame.length, true);
  return concatBytes([h, frame]);
}

/** 이더넷 + IPv4(ihl 5) + UDP + payload. */
function udpFrame(payload: Uint8Array, dport = 15001): Uint8Array {
  const eth = new Uint8Array(14);
  eth[12] = 0x08;
  eth[13] = 0x00;
  const ip = new Uint8Array(20);
  ip[0] = 0x45;
  const totalLen = 20 + 8 + payload.length;
  ip[2] = totalLen >> 8;
  ip[3] = totalLen & 0xff;
  ip[8] = 64;
  ip[9] = 17; // UDP
  ip.set([10, 0, 0, 1], 12);
  ip.set([233, 37, 54, 71], 16);
  const udp = new Uint8Array(8);
  const udv = new DataView(udp.buffer);
  udv.setUint16(0, 40000, false);
  udv.setUint16(2, dport, false);
  udv.setUint16(4, 8 + payload.length, false);
  return concatBytes([eth, ip, udp, payload]);
}

function arpFrame(): Uint8Array {
  const f = new Uint8Array(14 + 28);
  f[12] = 0x08;
  f[13] = 0x06;
  return f;
}

describe("레코드 프레이밍 iterRecords · encodeRecord", () => {
  it("형식 상수", () => {
    expect(REC_HDR).toBe(16);
    expect(TICK_FMT).toBe("pcapns-rec+zstd/1");
  });

  it("encodeRecord → iterRecords 왕복 — recvNs 가 2^53 을 넘어도 정확하다", () => {
    const recvNs = 1_792_000_000_123_456_789n;
    const payload = ascii("A301S00000001G1");
    const rec = encodeRecord(recvNs, payload);
    expect(rec.length).toBe(REC_HDR + payload.length);
    const refs = [...iterRecords(rec)];
    expect(refs).toHaveLength(1);
    expect(refs[0]!.recvNs).toBe(recvNs);
    expect(refs[0]!.off).toBe(REC_HDR);
    expect(rec.subarray(refs[0]!.off, refs[0]!.off + refs[0]!.len)).toEqual(payload);
  });

  it("잘린 꼬리에서 멈추고, 꼬리를 다음 청크 앞에 붙이면 이어 읽는다", () => {
    const a = encodeRecord(1n, ascii("AAAA"));
    const b = encodeRecord(2n, ascii("BBBBBB"));
    const all = concatBytes([a, b]);
    const cut = all.length - 3;
    const first = [...iterRecords(all.subarray(0, cut))];
    expect(first.map((r) => r.recvNs)).toEqual([1n]);
    const last = first[first.length - 1]!;
    const tail = all.subarray(last.off + last.len, cut);
    const rest = [...iterRecords(concatBytes([tail, all.subarray(cut)]))];
    expect(rest.map((r) => r.recvNs)).toEqual([2n]);
  });

  it("zstd 프레임 둘을 이어붙인 바이트를 프레임별로 풀면 레코드 수 = 합", () => {
    const part1 = concatBytes([encodeRecord(10n, ascii("X1")), encodeRecord(11n, ascii("X22"))]);
    const part2 = concatBytes([encodeRecord(12n, ascii("Y333")), encodeRecord(13n, ascii("Y4")), encodeRecord(14n, ascii("Y5"))]);
    const joined = concatBytes([u8(zstdCompressSync(part1)), u8(zstdCompressSync(part2))]);
    const frames = splitZstdFrames(joined);
    expect(frames).toHaveLength(2);
    const raw = concatBytes(frames.map((f) => u8(zstdDecompressSync(f))));
    expect([...iterRecords(raw)].map((r) => r.recvNs)).toEqual([10n, 11n, 12n, 13n, 14n]);
  });
});

describe("splitZstdFrames — Node zstd 가 첫 프레임에서 멈추는 것을 메운다", () => {
  const a = u8(zstdCompressSync(Buffer.from("hello ")));
  const b = u8(zstdCompressSync(Buffer.alloc(300_000, 7))); // RLE · 큰 블록
  const c = u8(zstdCompressSync(Buffer.from(Array.from({ length: 200_000 }, (_, i) => (i * 7919) % 251))));

  it("Node zstdDecompressSync 는 이어붙인 프레임의 첫 프레임만 푼다(이 함수가 필요한 이유 — 바뀌면 이 단언이 알린다)", () => {
    expect(u8(zstdDecompressSync(concatBytes([a, b]))).length).toBe(6);
  });

  it("프레임 경계를 정확히 나누고 스킵 가능 프레임은 버린다", () => {
    const skippable = new Uint8Array([0x5a, 0x2a, 0x4d, 0x18, 3, 0, 0, 0, 9, 9, 9]);
    const frames = splitZstdFrames(concatBytes([a, skippable, b, c]));
    expect(frames.map((f) => f.length)).toEqual([a.length, b.length, c.length]);
    const out = concatBytes(frames.map((f) => u8(zstdDecompressSync(f))));
    expect(out.length).toBe(6 + 300_000 + 200_000);
  });

  it("잘린 프레임 · 엉뚱한 magic 은 RangeError", () => {
    expect(() => splitZstdFrames(concatBytes([a, b.subarray(0, b.length - 2)]))).toThrow(RangeError);
    expect(() => splitZstdFrames(ascii("not zstd"))).toThrow(RangeError);
  });

  it("오라클 픽스처(파이썬 compression.zstd · level 19)도 한 프레임으로 읽힌다", async () => {
    const { readFileSync } = await import("node:fs");
    const { tickFixturePath } = await import("./helpers/tick-digest");
    const file = new Uint8Array(readFileSync(tickFixturePath("cut1300-krx.ticks.zst")));
    const frames = splitZstdFrames(file);
    expect(frames.reduce((n, f) => n + f.length, 0)).toBe(file.length);
  });
});

describe("PcapNsReader — 원본 pcap-ns(이더넷) → UDP 페이로드", () => {
  const payloads = [ascii("A301S1111"), ascii("B601Q22222222"), ascii("R801S3")];
  const pcap = concatBytes([
    globalHeader(),
    pcapRecord(1_792_000_000, 1, udpFrame(payloads[0]!)),
    pcapRecord(1_792_000_000, 999_999_999, arpFrame()),
    pcapRecord(1_792_000_001, 2, udpFrame(payloads[1]!)),
    pcapRecord(1_792_000_002, 3, udpFrame(payloads[2]!)),
  ]);

  function readIn(step: number): { got: { recvNs: bigint; payload: Uint8Array }[]; reader: PcapNsReader } {
    const reader = new PcapNsReader();
    const got: { recvNs: bigint; payload: Uint8Array }[] = [];
    for (let p = 0; p < pcap.length; p += step) got.push(...reader.push(pcap.subarray(p, p + step)));
    return { got, reader };
  }

  it.each([7, 1, pcap.length])("청크 %d B 로 나눠 넣어도 같은 페이로드 3개 · ARP 는 non_ipv4", (step) => {
    const { got, reader } = readIn(step);
    expect(got.map((g) => g.payload)).toEqual(payloads);
    expect(got.map((g) => g.recvNs)).toEqual([
      1_792_000_000_000_000_001n,
      1_792_000_001_000_000_002n,
      1_792_000_002_000_000_003n,
    ]);
    expect(reader.counters).toEqual({ packets: 4, nonIpv4: 1, nonUdp: 0, badFrame: 0 });
    expect(reader.pending).toBe(0);
  });

  it("비 UDP · 깨진 프레임 분기 — pcap2parquet.py:289-307 과 같은 조건으로 세고 건너뛴 뒤 다음 프레임을 읽는다(IN-03)", () => {
    const tcp = udpFrame(payloads[0]!);
    tcp[14 + 9] = 6; // IPv4 프로토콜 TCP
    const short = udpFrame(payloads[0]!).subarray(0, 20); // 이더넷 IPv4 이지만 incl 20 < 34
    const longUlen = udpFrame(payloads[0]!);
    new DataView(longUlen.buffer, longUlen.byteOffset).setUint16(14 + 20 + 4, 8 + payloads[0]!.length + 1, false); // ulen 이 프레임을 넘음
    const badIhl = udpFrame(payloads[0]!);
    badIhl[14] = 0x44; // ihl 4 × 4 = 16 < 20
    const r = new PcapNsReader();
    const got = r.push(
      concatBytes([
        globalHeader(),
        pcapRecord(1, 1, tcp),
        pcapRecord(1, 2, short),
        pcapRecord(1, 3, longUlen),
        pcapRecord(1, 4, badIhl),
        pcapRecord(1, 5, udpFrame(payloads[1]!)),
      ]),
    );
    expect(got.map((g) => g.payload)).toEqual([payloads[1]]);
    expect(r.counters).toEqual({ packets: 5, nonIpv4: 0, nonUdp: 1, badFrame: 3 });
    expect(r.pending).toBe(0);
  });

  it("magic 이 다르면 PcapFormatError", () => {
    const r = new PcapNsReader();
    expect(() => r.push(concatBytes([globalHeader(0xa1b2c3d4), pcapRecord(1, 1, arpFrame())]))).toThrow(PcapFormatError);
  });

  it("linktype 이 1 이 아니면 PcapFormatError", () => {
    const r = new PcapNsReader();
    expect(() => r.push(globalHeader(0xa1b23c4d, 147))).toThrow(PcapFormatError);
  });
});
