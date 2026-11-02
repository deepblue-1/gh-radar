/**
 * 합성 원본 아카이브 — 임시 디렉터리에 `<root>/<krx|nxt>/<D>/<D>-HHMM[-N].pcap.zst`(이더넷 pcap-ns · zstd 한 프레임)를 만든다.
 *
 * 기본 시각 집합 = 10/30 실측(RESEARCH Pattern 11 · `gcloud storage ls` 2026-11-02): 라벨마다 `0000`~`2300` 매시 1개 ·
 * `-N` 없음. 시각 파일마다 레코드가 1개 이상이다(기록기는 게으른 열기라 빈 파일은 실제로 없다) — 채움 레코드는 ISIN 오프셋이
 * 없는 `IA` 태그(D-19 범위 밖 → 격자에서 빠져야 한다).
 *
 * 전문 페이로드는 shared 레이아웃 오프셋에 ASCII 고정폭 숫자로 쓴다(A3 186B · B6 590B · B9 414B).
 */
import { mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import zlib from "node:zlib";

export type Label = "krx" | "nxt";

export type SynthPacket = {
  label: Label;
  /** 이 패킷을 담을 파일 시각 `HHMM`(파일 이름) — `n` 이 있으면 `-N` 접미 파일. */
  hhmm: string;
  n?: number;
  recvNs: bigint;
  payload: Uint8Array;
};

export type SynthOptions = {
  date: string;
  /** 라벨별 파일 시각 `HHMM` 목록. 기본 = 10/30 실측(`0000`~`2300` 매시). 빈 배열이면 그 라벨 디렉터리를 만들지 않는다. */
  hours?: Partial<Record<Label, string[]>>;
  /** `-N` 접미 파일 등 추가 파일 이름(`<D>-HHMM-N.pcap.zst`) — 채움 레코드 1개(또는 packets 의 n 일치분). */
  extra?: { label: Label; name: string; firstRecvNs?: bigint }[];
  packets?: SynthPacket[];
  root?: string;
};

export type SynthArchive = { root: string; files: string[]; bytes: number; cleanup: () => void };

export const ALL_HOURS: readonly string[] = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}00`);

/** 10/30 실측 객체 이름 목록(라벨마다 24개 — RESEARCH Pattern 11 「10/30 시각 집합」). */
export function oct30Names(date = "20261030"): string[] {
  return ALL_HOURS.map((h) => `${date}-${h}.pcap.zst`);
}

/** KST `YYYYMMDD` + `HHMM` + 초 오프셋 → epoch ns. */
export function kstNs(date: string, hhmm: string, offsetSec = 0, nsec = 0): bigint {
  const ms = Date.parse(
    `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}:00+09:00`,
  );
  return (BigInt(ms) / 1000n + BigInt(offsetSec)) * 1_000_000_000n + BigInt(nsec);
}

// ── 페이로드 ──────────────────────────────────────────────

function ascii(buf: Uint8Array, off: number, s: string): void {
  for (let i = 0; i < s.length; i++) buf[off + i] = s.charCodeAt(i);
}

function num(v: number, width: number): string {
  return String(Math.abs(v)).padStart(width, "0");
}

/** price 11B — 바이트0 부호(' ' | '-') · 바이트1 미사용 · 2..10 숫자. */
function price(v: number): string {
  return `${v < 0 ? "-" : " "}0${num(v, 9)}`;
}

/** 정보구분 3자 — KRX '0..' · NXT '5..'. */
function infoOf(label: Label): string {
  return label === "krx" ? "01S" : "51S";
}

export type A3Opts = {
  isin: string;
  label: Label;
  board?: string;
  pct?: string;
  chg?: number;
  px?: number;
  qty?: number;
  seq?: number;
  time?: string;
};

export function a3Payload(o: A3Opts): Uint8Array {
  const b = new Uint8Array(186).fill(48);
  ascii(b, 0, "A3");
  ascii(b, 2, infoOf(o.label));
  ascii(b, 5, num(o.seq ?? 1, 8));
  ascii(b, 13, o.board ?? "G1");
  ascii(b, 15, "40");
  ascii(b, 17, o.isin);
  ascii(b, 35, o.time ?? "090000000000");
  ascii(b, 47, o.pct ?? "2");
  ascii(b, 48, price(o.chg ?? 0));
  ascii(b, 59, price(o.px ?? 10000));
  ascii(b, 70, num(o.qty ?? 1, 10));
  b[185] = 0xff;
  return b;
}

export function b6Payload(o: { isin: string; label: Label; seq?: number }): Uint8Array {
  const b = new Uint8Array(590).fill(48);
  ascii(b, 0, "B6");
  ascii(b, 2, infoOf(o.label));
  ascii(b, 5, num(o.seq ?? 1, 8));
  ascii(b, 13, "G1");
  ascii(b, 15, "40");
  ascii(b, 17, o.isin);
  b[589] = 0xff;
  return b;
}

export function b9Payload(o: { isin: string; label: Label }): Uint8Array {
  const b = new Uint8Array(414).fill(48);
  ascii(b, 0, "B9");
  ascii(b, 2, infoOf(o.label));
  ascii(b, 5, o.isin);
  b[413] = 0xff;
  return b;
}

/** ISIN 오프셋이 없는 태그(D-19 범위 밖) — 채움 레코드. */
export function iaPayload(label: Label): Uint8Array {
  const b = new Uint8Array(40).fill(48);
  ascii(b, 0, "IA");
  ascii(b, 2, infoOf(label));
  return b;
}

// ── pcap-ns ───────────────────────────────────────────────

function globalHeader(): Uint8Array {
  const b = new Uint8Array(24);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, 0xa1b23c4d, true);
  dv.setUint16(4, 2, true);
  dv.setUint16(6, 4, true);
  dv.setUint32(16, 65535, true);
  dv.setUint32(20, 1, true); // EN10MB
  return b;
}

/** 이더넷 + IPv4(20B) + UDP 프레임을 담은 pcap-ns 레코드. */
export function pcapRecord(recvNs: bigint, payload: Uint8Array): Uint8Array {
  const frameLen = 14 + 20 + 8 + payload.length;
  const out = new Uint8Array(16 + frameLen);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, Number(recvNs / 1_000_000_000n), true);
  dv.setUint32(4, Number(recvNs % 1_000_000_000n), true);
  dv.setUint32(8, frameLen, true);
  dv.setUint32(12, frameLen, true);
  const f = 16;
  out[f + 12] = 0x08; // ethertype IPv4
  out[f + 13] = 0x00;
  const ip = f + 14;
  out[ip] = 0x45; // v4 · IHL 5
  dv.setUint16(ip + 2, 20 + 8 + payload.length, false);
  out[ip + 8] = 64;
  out[ip + 9] = 17; // UDP
  const udp = ip + 20;
  dv.setUint16(udp, 15000, false);
  dv.setUint16(udp + 2, 15000, false);
  dv.setUint16(udp + 4, 8 + payload.length, false);
  out.set(payload, udp + 8);
  return out;
}

function writePcapZst(path: string, recs: { recvNs: bigint; payload: Uint8Array }[]): number {
  const parts = [globalHeader(), ...recs.map((r) => pcapRecord(r.recvNs, r.payload))];
  const raw = Buffer.concat(parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength)));
  writeFileSync(path, zlib.zstdCompressSync(raw));
  return statSync(path).size;
}

/** 합성 아카이브를 만든다. 반환 `files` = 만든 파일 전체 경로(만든 순서). */
export function makeSynthArchive(opts: SynthOptions): SynthArchive {
  const root = opts.root ?? mkdtempSync(join(tmpdir(), "tick-synth-"));
  const files: string[] = [];
  let bytes = 0;
  const packets = opts.packets ?? [];
  for (const label of ["krx", "nxt"] as const) {
    const hours = opts.hours?.[label] ?? ALL_HOURS;
    const extra = (opts.extra ?? []).filter((e) => e.label === label);
    if (hours.length === 0 && extra.length === 0) continue;
    const dir = join(root, label, opts.date);
    mkdirSync(dir, { recursive: true });
    const one = (name: string, hhmm: string, n: number | undefined, fillerNs: bigint) => {
      const mine = packets.filter((p) => p.label === label && p.hhmm === hhmm && (p.n ?? undefined) === n);
      const recs = [{ recvNs: fillerNs, payload: iaPayload(label) }, ...mine];
      const path = join(dir, name);
      bytes += writePcapZst(path, recs);
      files.push(path);
    };
    for (const h of hours) one(`${opts.date}-${h}.pcap.zst`, h, undefined, kstNs(opts.date, h, 0));
    for (const e of extra) {
      const m = /-(\d{4})-(\d+)\.pcap\.zst$/.exec(e.name);
      const hhmm = m ? m[1]! : "0000";
      const n = m ? Number(m[2]) : undefined;
      one(e.name, hhmm, n, e.firstRecvNs ?? kstNs(opts.date, hhmm, 1800));
    }
  }
  return { root, files, bytes, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
