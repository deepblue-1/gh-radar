/**
 * 원본 통독 — 시간 객체를 차례로 스트리밍 해제해 UDP 페이로드마다 (종목 키, 수신 ns, 페이로드)를 넘긴다.
 *
 * `fs.createReadStream(path, {highWaterMark: 8 MiB}).pipe(zlib.createZstdDecompress())` → shared `PcapNsReader.push`
 * (전역 헤더 magic · linktype 검사 · 이더넷/IPv4/UDP 벗김) → shared `isinKeyOf`(태그별 ISIN 오프셋 · 길이 무관).
 *
 * D-19 범위(37-01 Task 2 「D-19 범위: 승인」): ISIN 오프셋이 없는 태그(IA · B2 · C0 · B0 · I2 · B5 · P0 · J0 · M4 등)는
 * 종목 격자에 넣지 않는다 — `isinKeyOf` 가 null 이면 버린다. 다섯 태그 + A0 는 길이가 레이아웃과 달라도 같은 오프셋으로
 * 걸러 raw 로 보존된다(격자 파일은 원본 페이로드 그대로).
 *
 * 다중 프레임 가드: Node zstd 스트림 해제는 이어붙인 프레임에서 뒤 프레임을 조용히 버릴 수 있다(37-02 실측). 원본
 * 아카이브는 한 프레임(실측)이지만, 해제기가 입력을 끝까지 먹지 않았으면(`bytesWritten` < 파일 크기) 조용히 넘기지 않고
 * throw 한다 — 무로그 데이터 손실 금지.
 *
 * 메모리: 이 함수는 아무것도 모으지 않는다 — 호출자(`onPacket`)가 필요한 키만 버퍼에 담는다(Cloud Run 파일시스템 =
 * 메모리 · Pitfall 5).
 */
import { createReadStream, statSync } from "node:fs";
import zlib from "node:zlib";
import { PcapNsReader, isinKeyOf } from "@gh-radar/shared";
import type { Label } from "./archive";

/** 원본 읽기 버퍼 — 8 MiB(RESEARCH Pattern 11 · 1시간 846만 패킷 6.4초 실측 조건). */
export const READ_HIGH_WATER = 8 << 20;

export type ScanStats = {
  /** 읽은 UDP 페이로드 수(종목 키 유무 무관). */
  packets: number;
  /** 종목 키가 붙어 onPacket 으로 넘긴 수. */
  keyed: number;
  /** 압축 파일 크기 합 — GCS 읽기 비용 실측(SC3). */
  bytesRead: number;
  /** 끝이 잘린 레코드가 남은 파일 수(pcap2parquet `truncated`). */
  truncatedFiles: number;
};

export type OnPacket = (key: string, recvNs: bigint, payload: Uint8Array) => void;

/** 종목 키 `${isin}|KRX` · `${isin}|NXT`. */
export function keyOf(isin: string, label: Label): string {
  return `${isin}|${label.toUpperCase()}`;
}

async function scanOne(path: string, label: Label, onPacket: OnPacket, stats: ScanStats): Promise<void> {
  const size = statSync(path).size;
  stats.bytesRead += size;
  const reader = new PcapNsReader();
  const dec = zlib.createZstdDecompress();
  const src = createReadStream(path, { highWaterMark: READ_HIGH_WATER });
  src.on("error", (e) => dec.destroy(e));
  src.pipe(dec);
  for await (const chunk of dec as AsyncIterable<Buffer>) {
    for (const pkt of reader.push(chunk)) {
      stats.packets += 1;
      const isin = isinKeyOf(pkt.payload);
      if (isin === null) continue;
      stats.keyed += 1;
      onPacket(keyOf(isin, label), pkt.recvNs, pkt.payload);
    }
  }
  if (dec.bytesWritten < size) {
    throw new Error(`zstd 해제가 ${path} 의 ${dec.bytesWritten}/${size}B 에서 멈췄다(다중 프레임?) — 뒤 데이터 손실`);
  }
  if (reader.pending > 0) stats.truncatedFiles += 1;
}

/** 객체를 주어진 순서대로 통독한다. 파일 하나라도 깨지면(magic · zstd · 다중 프레임) throw. */
export async function scanObjects(files: readonly string[], label: Label, onPacket: OnPacket): Promise<ScanStats> {
  const stats: ScanStats = { packets: 0, keyed: 0, bytesRead: 0, truncatedFiles: 0 };
  for (const f of files) await scanOne(f, label, onPacket, stats);
  return stats;
}
