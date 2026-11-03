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
 * - asOfMs = 이 엔트리를 마지막으로 끝까지(has_more 없이) 읽은 인덱서 호출의 시작 시각(tickgw 벽시계 ms) —
 *   live 응답 헤더 X-Tick-As-Of-Ms. 새 엔트리(새 epoch)는 null 부터.
 * - 상한: 전체 `limitBytes`(기본 96MB — 컨테이너 256MB 의 ≤ 40% · WR-31). 합계는 상한을 **넘지 않는다**(WR-33):
 *   append 가 상한을 넘기려 하면 먼저 lastAccess 가 가장 오래된 **보호되지 않은** 다른 키부터 지워 자리를 만든다.
 *   보호 = `setProtect` 술어(폴러가 「리스가 살아 있는 키」 로 건다) — 폴링 중인 키를 지우고 08:00 부터 다시 받는 고리를 막는다.
 *   자리를 못 만들면 붙이지 않고 `full`, 키 하나가 혼자 상한을 넘으면 `too_large` 를 돌려준다(폴러가 백오프 · 「너무 큼」 처리).
 *   밀려난 키는 closed 가 될 수 없어 export(승격)에 나오지 않는다(잘린 하루를 정본처럼 쓰지 않는다).
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
  /**
   * 이 엔트리를 마지막으로 끝까지(has_more 없이) 읽은 인덱서 호출의 시작 시각(tickgw 벽시계 epoch ms).
   * 캐시는 이 시각에서 기록 지연(약 1초 + 전송)을 뺀 시각까지 다 받았다. 엔트리를 새로 만들면(새 epoch) 다시 null.
   */
  asOfMs: number | null;
  /** 마지막 server 요청(touch) 시각 ms — LRU · 유휴 판정. 폴링 append 는 갱신하지 않는다. */
  lastAccess: number;
}

/** append 결과(WR-33) — ok 만 바이트 · 메타를 붙였다. */
export type AppendResult = "ok" | "full" | "too_large";

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
  /** LRU 후보에서 뺄 엔트리(WR-33) — 기본은 없음. */
  private protect: (e: CacheEntry) => boolean = () => false;

  constructor(
    readonly limitBytes: number,
    readonly idleMs: number,
    /** KST hhmm — 오늘 complete 키 유휴 면제 끝(TICKGW_KEEP_UNTIL). */
    readonly keepUntilHhmm = 2100,
  ) {}

  /** LRU 보호 술어를 건다(폴러 — 리스가 살아 있는 키). */
  setProtect(fn: (e: CacheEntry) => boolean): void {
    this.protect = fn;
  }

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
      asOfMs: null,
      lastAccess: now,
    };
    this.entries.set(key, e);
    return e;
  }

  /**
   * 바이트 · 메타를 붙인다. 상한을 넘기면 보호되지 않은 다른 키를 LRU 로 지워 자리를 만든 뒤 붙인다(WR-33).
   * 그 키 혼자 상한을 넘으면 `too_large` · 자리를 못 만들면 `full` — 둘 다 아무것도 바꾸지 않는다(커서도 그대로).
   */
  append(key: string, bytes: Buffer, meta: AppendMeta): AppendResult {
    const e = this.entries.get(key);
    if (!e) return "ok";
    if (bytes.length > 0) {
      if (e.size + bytes.length > this.limitBytes) return "too_large";
      const over = this.total + bytes.length - this.limitBytes;
      if (over > 0) {
        // 지울 수 있는 몫이 모자라면 아무것도 지우지 않는다(헛삭제 금지)
        let freeable = 0;
        for (const o of this.entries.values()) if (o !== e && !this.protect(o)) freeable += o.size;
        if (freeable < over) return "full";
        this.enforceLimit(bytes.length, e);
      }
      e.chunks.push(bytes);
      e.size += bytes.length;
      this.total += bytes.length;
    }
    e.records += meta.records;
    if (e.firstRecvNs === null && meta.firstRecvNs !== null) e.firstRecvNs = meta.firstRecvNs;
    if (meta.lastRecvNs !== null && (e.lastRecvNs === null || meta.lastRecvNs > e.lastRecvNs)) {
      e.lastRecvNs = meta.lastRecvNs;
    }
    return "ok";
  }

  /**
   * 합계 + `need` 가 상한 이하가 될 때까지 lastAccess 가 가장 오래된 **보호되지 않은** 키부터 지운다(`keep` 은 제외).
   * 후보가 없으면 멈춘다(보호 키는 지우지 않는다 — WR-33).
   */
  private enforceLimit(need = 0, keep: CacheEntry | null = null): string[] {
    const removed: string[] = [];
    while (this.total + need > this.limitBytes) {
      let oldest: CacheEntry | null = null;
      for (const e of this.entries.values()) {
        if (e === keep || this.protect(e)) continue;
        if (!oldest || e.lastAccess < oldest.lastAccess) oldest = e;
      }
      if (!oldest) break;
      this.delete(oldest.key);
      removed.push(oldest.key);
    }
    return removed;
  }

  /**
   * offset 이후 바이트(최대 `end` 까지)를 **복사 없이** 청크 subarray 목록으로(WR-31 — 256MB 컨테이너에서 키 전체를
   * `Buffer.concat` 으로 다시 복사하지 않는다). offset 이 범위를 벗어나면 빈 목록.
   */
  parts(key: string, offset: number, end?: number): Buffer[] {
    const e = this.entries.get(key);
    if (!e) return [];
    const stop = Math.min(end ?? e.size, e.size);
    if (offset >= stop) return [];
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
    return out;
  }

  /**
   * offset 에서 시작해 `maxBytes` 안에 드는 **마지막 청크 경계**(WR-32 — 한 응답 상한). 청크 = 119 응답 하나 = zstd 프레임
   * 하나라 경계에서 끊어야 받는 쪽이 온전한 프레임만 푼다. 첫 청크 하나는 상한을 넘어도 싣는다(계약상 한 프레임 ≤ 16MB)
   * — 그래서 한 응답은 max(maxBytes, 한 프레임) 를 넘지 않는다. 끝이면 entry.size.
   */
  boundedEnd(key: string, offset: number, maxBytes: number): number {
    const e = this.entries.get(key);
    if (!e) return 0;
    if (offset >= e.size) return e.size;
    let pos = 0;
    let stop = -1;
    for (const c of e.chunks) {
      const cEnd = pos + c.length;
      pos = cEnd;
      if (cEnd <= offset) continue;
      if (stop < 0) stop = cEnd; // 첫 청크(또는 offset 이 걸친 청크의 끝)는 언제나
      else if (cEnd - offset <= maxBytes) stop = cEnd;
      else break;
    }
    return stop < 0 ? e.size : stop;
  }

  /** offset 이후 바이트(최대 `end` 까지)를 한 버퍼로(복사 — 시험 · 작은 응답용. HTTP 응답은 `parts` 를 쓴다). */
  slice(key: string, offset: number, end?: number): Buffer {
    return Buffer.concat(this.parts(key, offset, end));
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
