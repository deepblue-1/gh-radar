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
 *   (`compressed_files_skipped` > 0 · CR-31) 또는 싣지 못한 레코드가 있다고 알리면(`skipped_records` > 0) false.
 * - closed · closedThroughNs = 20:01 마감 마무리(poller.closeSweep)가 채운다 — export 는 closed 만 낸다.
 * - asOfMs = 이 엔트리를 마지막으로 끝까지(has_more 없이) 읽은 인덱서 호출의 시작 시각(tickgw 벽시계 ms) —
 *   live 응답 헤더 X-Tick-As-Of-Ms. 새 엔트리(새 epoch)는 null 부터.
 * - 상한: 전체 `limitBytes`(기본 96MB — 컨테이너 256MB 의 ≤ 40% · WR-31). 합계는 상한을 **넘지 않는다**(WR-33):
 *   append 가 상한을 넘기려 하면 먼저 **보호되지 않은** 다른 키를 지워 자리를 만든다. 지우는 순서(R2-WR-01):
 *   ① 승격 입력이 아닌 키(complete 아님 · 다른 날짜) ② 오늘 complete 키 — 각 안에서 lastAccess 오름차순. 지울 때마다
 *   `cache evict` warn 로그(무로그 삭제 금지).
 *   보호 = `setProtect` 술어(폴러가 「리스가 살아 있는 키」 + 「19:55 따라잡기 ~ 20:01 마감 마무리 동안의 오늘 complete ∧
 *   closed 아닌 키」 로 건다) — 폴링 중인 키를 지우고 08:00 부터 다시 받는 고리와, 승격 입력끼리 서로 지우는 것을 막는다.
 *   자리를 못 만들면 붙이지 않고 `full`, 키 하나가 혼자 상한을 넘으면 `too_large` 를 돌려준다(폴러가 백오프 · 「너무 큼」 처리).
 *   보호 단계(R3-WR-01): 술어가 `true` = 강(리스가 살아 있는 키 — 누구도 못 지움) · `"pinned"` = 약(승격 입력 — 보통 · 따라잡기
 *   append 는 못 지우지만 **지금 보는 키(live)** append 는 마지막 순서로 지운다). 따라잡기 append 는 상한의 `CATCHUP_RESERVE`
 *   (25%)를 지금 보는 키 몫으로 남겨 두고, 그 안으로만 붙인다 — 아무도 안 보던 키가 자리를 다 채워 보던 키가 멈추는 역전을 막는다.
 *   밀려난 키는 closed 가 될 수 없어 export(승격)에 나오지 않는다(잘린 하루를 정본처럼 쓰지 않는다).
 * - 유휴: 마지막 touch 뒤 `idleMs`(15분)면 지운다. 단 「complete ∧ date = KST 오늘 ∧ KST < keepUntil(21:00)」 키는
 *   유휴 삭제에서 뺀다 — 20:01 마감 마무리 · 승격 Job 의 입력이라 브라우저가 닫혀도 21:00 까지 남겨 둔다.
 */

import { randomUUID } from "node:crypto";

import { kstHhmm, kstToday } from "./config.js";
import type { Exchange } from "./indexer.js";
import { log } from "./log.js";

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

/** 보호 단계 — false 없음 · "pinned" 약(승격 입력) · true 강(리스 살아 있음). */
export type ProtectLevel = boolean | "pinned";
/** append 우선순위 — live(리스 살아 있는 키 · 약 보호 키도 지울 수 있음) · normal · catchup(예비분을 남기고 붙임). */
export type AppendPriority = "live" | "normal" | "catchup";
/** 따라잡기 append 가 남겨 두는 몫 — 상한의 25%(지금 보는 키 증분 · 마감 마무리 몫 · R3-WR-01). */
export const CATCHUP_RESERVE = 0.25;

export class TickCache {
  private readonly entries = new Map<string, CacheEntry>();
  private total = 0;
  /** LRU 후보에서 뺄 엔트리(WR-33) — 기본은 없음. */
  private protect: (e: CacheEntry) => ProtectLevel = () => false;

  constructor(
    readonly limitBytes: number,
    readonly idleMs: number,
    /** KST hhmm — 오늘 complete 키 유휴 면제 끝(TICKGW_KEEP_UNTIL). */
    readonly keepUntilHhmm = 2100,
  ) {}

  /** LRU 보호 술어를 건다(폴러 — 리스가 살아 있는 키). */
  setProtect(fn: (e: CacheEntry) => ProtectLevel): void {
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
  append(
    key: string,
    bytes: Buffer,
    meta: AppendMeta,
    now: number = Date.now(),
    priority: AppendPriority = "normal",
  ): AppendResult {
    const e = this.entries.get(key);
    if (!e) return "ok";
    if (bytes.length > 0) {
      if (e.size + bytes.length > this.limitBytes) return "too_large";
      // 따라잡기는 예비분을 남긴 자리 안으로만(R3-WR-01) — 남은 자리 + 지울 수 있는 몫에서 예비분을 뺀다
      const reserve = priority === "catchup" ? Math.floor(this.limitBytes * CATCHUP_RESERVE) : 0;
      if (this.total + bytes.length > this.limitBytes - reserve) {
        // 지울 수 있는 몫이 모자라면 아무것도 지우지 않는다(헛삭제 금지)
        if (this.headroom(key, priority) - reserve < bytes.length) return "full";
        this.enforceLimit(bytes.length + reserve, e, now, priority);
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
   * 지금 이 키에 붙일 수 있는 최대 바이트 — 남은 자리 + 지울 수 있는(보호되지 않은 다른 키) 몫(R2-IN-03 사전 판정 · append 의 full 판정).
   */
  headroom(key: string, priority: AppendPriority = "normal"): number {
    let freeable = 0;
    for (const o of this.entries.values()) if (o.key !== key && this.evictable(o, priority)) freeable += o.size;
    return this.limitBytes - this.total + freeable;
  }

  /** 이 우선순위의 append 가 지울 수 있는 키인가 — 강 보호는 아무도 · 약 보호(승격 입력)는 live 만(R3-WR-01). */
  private evictable(e: CacheEntry, priority: AppendPriority): boolean {
    const level = this.protect(e);
    if (level === false) return true;
    return level === "pinned" && priority === "live";
  }

  /** LRU 후보 순위(R2-WR-01) — 0 = 승격 입력 아님(complete 아님 · 다른 날짜) · 1 = 오늘 complete(마지막에 지운다). */
  private victimRank(e: CacheEntry, today: string): number {
    if (this.protect(e) === "pinned") return 2; // 승격 입력(약 보호) — live append 만, 맨 마지막에
    return e.complete && e.date === today ? 1 : 0;
  }

  /**
   * 합계 + `need` 가 상한 이하가 될 때까지 **보호되지 않은** 키를 (순위, lastAccess) 오름차순으로 지운다(`keep` 은 제외).
   * 후보가 없으면 멈춘다(보호 키는 지우지 않는다 — WR-33). 지울 때마다 warn 로그(R2-WR-01 — 무로그 삭제 금지).
   */
  private enforceLimit(
    need = 0,
    keep: CacheEntry | null = null,
    now: number = Date.now(),
    priority: AppendPriority = "normal",
  ): string[] {
    const removed: string[] = [];
    const today = kstToday(now);
    while (this.total + need > this.limitBytes) {
      let victim: CacheEntry | null = null;
      let victimRank = 0;
      for (const e of this.entries.values()) {
        if (e === keep || !this.evictable(e, priority)) continue;
        const rank = this.victimRank(e, today);
        if (!victim || rank < victimRank || (rank === victimRank && e.lastAccess < victim.lastAccess)) {
          victim = e;
          victimRank = rank;
        }
      }
      if (!victim) break;
      log("warn", "cache evict", {
        key: victim.key,
        size: victim.size,
        complete: victim.complete,
        closed: victim.closed,
        reason: this.protect(victim) === "pinned" ? "lru-live" : "lru",
        for_key: keep?.key,
      });
      this.delete(victim.key);
      removed.push(victim.key);
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
    removed.push(...this.enforceLimit(0, null, now));
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
