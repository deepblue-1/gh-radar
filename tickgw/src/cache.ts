/**
 * tickgw 캐시 — 119 가 준 zstd 프레임 원본 그대로 (Phase 37 · D-07).
 *
 * - 바이트를 풀지도 다시 압축하지도 않는다(radar-gw 공유 코어 · 주문 relay 와 같은 VM — Anti-Patterns).
 *   레코드 프레이밍이 전역 헤더 없는 pcap-ns 레코드라 응답 · 프레임을 이어붙여도 유효한 스트림이다.
 * - 키 = `${isin}|${ex}|${date}`(date = KST YYYYMMDD). 엔트리마다 epoch(UUID) — 재기동 · 삭제 뒤 새로 만들면 바뀌고,
 *   클라이언트는 epoch 불일치(409)를 보고 offset 0 부터 다시 받는다.
 * - 커서 = 바이트 offset. `slice(key, offset)` 는 offset 이후 바이트만.
 * - complete = 「08:00 KST 부터 시작 ∧ 이어받기 끊김 없음」. 폴러는 언제나 08:00 부터 시작하므로 만들 때 true,
 *   계약 위반(has_more 인데 커서 없음 등)으로 이어받기가 끊기거나, 인덱서가 20:00 압축 원본을 건너뛰었다고 알리면
 *   (`compressed_files_skipped` > 0 · CR-31) false.
 * - closed · closedThroughNs = 20:01 마감 마무리(poller.closeSweep)가 채운다 — export 는 closed 만 낸다.
 * - 상한: 전체 `limitBytes`(기본 128MB) 를 넘으면 lastAccess 가 가장 오래된 키부터 지운다(append 마다 · evict 마다).
 *   LRU 는 면제가 없다 — 밀려난 키는 closed 가 될 수 없어 export(승격)에 나오지 않는다(잘린 하루를 정본처럼 쓰지 않는다).
 * - 유휴: 마지막 touch 뒤 `idleMs`(15분)면 지운다. 단 「complete ∧ date = KST 오늘 ∧ KST < keepUntil(21:00)」 키는
 *   유휴 삭제에서 뺀다 — 20:01 마감 마무리 · 승격 Job 의 입력이라 브라우저가 닫혀도 21:00 까지 남겨 둔다.
 */

import { randomUUID } from "node:crypto";

import { kstHhmm, kstToday } from "./config.js";
import type { Exchange } from "./indexer.js";

export interface CacheEntry {
  key: string;
  isin: string;
  ex: Exchange;
  /** KST YYYYMMDD. */
  date: string;
  epoch: string;
  chunks: Buffer[];
  size: number;
  records: number;
  firstRecvNs: bigint | null;
  lastRecvNs: bigint | null;
  complete: boolean;
  closed: boolean;
  closedThroughNs: bigint | null;
  /** 마지막 server 요청(touch) 시각 ms — LRU · 유휴 판정. 폴링 append 는 갱신하지 않는다. */
  lastAccess: number;
}

export interface AppendMeta {
  records: number;
  firstRecvNs: bigint | null;
  lastRecvNs: bigint | null;
}

export function makeKey(isin: string, ex: Exchange, date: string): string {
  return `${isin}|${ex}|${date}`;
}

export function parseKey(key: string): { isin: string; ex: Exchange; date: string } {
  const [isin, ex, date] = key.split("|");
  if (!isin || (ex !== "KRX" && ex !== "NXT") || !date) throw new Error(`bad key: ${key}`);
  return { isin, ex, date };
}

export class TickCache {
  private readonly entries = new Map<string, CacheEntry>();
  private total = 0;

  constructor(
    readonly limitBytes: number,
    readonly idleMs: number,
    /** KST hhmm — 오늘 complete 키 유휴 면제 끝(TICKGW_KEEP_UNTIL). */
    readonly keepUntilHhmm = 2100,
  ) {}

  get(key: string): CacheEntry | undefined {
    return this.entries.get(key);
  }

  /** 있으면 그대로, 없으면 새 epoch 로 만든다. */
  ensure(key: string, now: number): CacheEntry {
    const hit = this.entries.get(key);
    if (hit) return hit;
    const { isin, ex, date } = parseKey(key);
    const e: CacheEntry = {
      key,
      isin,
      ex,
      date,
      epoch: randomUUID(),
      chunks: [],
      size: 0,
      records: 0,
      firstRecvNs: null,
      lastRecvNs: null,
      complete: true,
      closed: false,
      closedThroughNs: null,
      lastAccess: now,
    };
    this.entries.set(key, e);
    return e;
  }

  append(key: string, bytes: Buffer, meta: AppendMeta): void {
    const e = this.entries.get(key);
    if (!e) return;
    if (bytes.length > 0) {
      e.chunks.push(bytes);
      e.size += bytes.length;
      this.total += bytes.length;
    }
    e.records += meta.records;
    if (e.firstRecvNs === null && meta.firstRecvNs !== null) e.firstRecvNs = meta.firstRecvNs;
    if (meta.lastRecvNs !== null && (e.lastRecvNs === null || meta.lastRecvNs > e.lastRecvNs)) {
      e.lastRecvNs = meta.lastRecvNs;
    }
    this.enforceLimit();
  }

  /** 합계가 상한 이하가 될 때까지 lastAccess 가 가장 오래된 키부터 지운다(면제 없음). */
  private enforceLimit(): string[] {
    const removed: string[] = [];
    while (this.total > this.limitBytes && this.entries.size > 0) {
      let oldest: CacheEntry | null = null;
      for (const e of this.entries.values()) {
        if (!oldest || e.lastAccess < oldest.lastAccess) oldest = e;
      }
      this.delete(oldest!.key);
      removed.push(oldest!.key);
    }
    return removed;
  }

  /** offset 이후 바이트(최대 `end` 까지). offset 이 범위를 벗어나면 빈 버퍼. */
  slice(key: string, offset: number, end?: number): Buffer {
    const e = this.entries.get(key);
    if (!e) return Buffer.alloc(0);
    const stop = Math.min(end ?? e.size, e.size);
    if (offset >= stop) return Buffer.alloc(0);
    const out: Buffer[] = [];
    let pos = 0;
    for (const c of e.chunks) {
      const cEnd = pos + c.length;
      if (cEnd > offset && pos < stop) {
        out.push(c.subarray(Math.max(0, offset - pos), Math.min(c.length, stop - pos)));
      }
      pos = cEnd;
      if (pos >= stop) break;
    }
    return Buffer.concat(out);
  }

  delete(key: string): boolean {
    const e = this.entries.get(key);
    if (!e) return false;
    this.total -= e.size;
    this.entries.delete(key);
    return true;
  }

  /** 유휴 키(오늘 complete 는 keepUntil 전 면제)와 상한 초과분을 지운다. 지운 키 목록을 돌려준다(폴러가 그 키 상태를 버린다). */
  evict(now: number): string[] {
    const removed: string[] = [];
    const today = kstToday(now);
    const keep = kstHhmm(now) < this.keepUntilHhmm;
    for (const e of [...this.entries.values()]) {
      if (now - e.lastAccess < this.idleMs) continue;
      if (keep && e.complete && e.date === today) continue; // 승격 입력 — 21:00 까지 보존
      this.delete(e.key);
      removed.push(e.key);
    }
    removed.push(...this.enforceLimit());
    return removed;
  }

  totalBytes(): number {
    return this.total;
  }

  size(): number {
    return this.entries.size;
  }

  values(): CacheEntry[] {
    return [...this.entries.values()];
  }
}
