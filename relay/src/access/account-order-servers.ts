/**
 * Phase 29 Plan 33 — G-1 ③ (ADMIN-06). 계좌별 주문 서버 지정 적재기 (`AccountOrderServers`) · 유효 주문 서버 라우팅.
 *
 * G-1(사용자 변경 요청 2026-10-10 · D-10 「증권사당 주문 서버 1대」 대체): 계좌 a(증권사 b)의 **유효 주문 서버** =
 * a 의 지정 서버(레지스트리에서 enabled 이고 증권사가 b 일 때) → 아니면 b 의 기본 주문 서버(`dma_servers.is_order_server`).
 * 지정 서버가 꺼지면 기본값으로 간다(지정은 지우지 않는다 — 다시 켜면 돌아온다). 그 계좌의 주문 · 전략 · 계좌 · 83 프레임은
 * 유효 주문 서버 세션 **하나에서만** 오가고 보인다(세션 소유 뷰 — `DmaSession.allowedAccounts`).
 *
 * DB 계약(29-29 산출물 표): 서비스롤 RPC `dma_account_order_servers()` → `(dma_user_id, broker, account_no, server_key)` —
 * **지정된 계좌만**(지정 없음 = 기본값). 이 적재기는 그 표를 통째로 읽어 사본을 쥔다.
 *
 * 결정 근거:
 *   AppAccess 틀 복제(29-06 · 29-28) — 부팅 즉시 1회 + `ACCOUNT_ORDER_SERVERS_REFRESH_MS`(60초) 주기 · 주기 = 공유 · 즉시 =
 *         꼬리(`util/tail-reload.ts` — 커밋 뒤 요청한 `reload()` 는 늘 그 커밋 뒤 시작한 읽기의 결과) · 실패하면 **직전 사본 유지**
 *         + `safePgError` 로그.
 *   fail closed — 첫 적재 성공 전에는 `loaded=false` 이고 `serversFor` 가 null 이다. wss 인증은 「조회 실패」(failed + 1011)로
 *         끝난다 — 지정을 모른 채 기본 서버로 보내면 KB121 로 지정한 계좌의 주문이 KB120 으로 샌다.
 *   변경 이벤트 — 재적재가 DMA 유저별 지정을 바꾸면(추가 · 이동 · 해제) 교체 **뒤** `changed(dmaUserIds)` 1회. 첫 적재 · 무변화 ·
 *         실패에는 내지 않는다. 소비자(29-36 — 영향 사용자 세션 즉시 재수립)가 DMA 유저 단위로 고른다.
 *   지정 서버 미반영 — 지정 서버 매핑(79/87)에 그 계좌가 아직 없으면 그 계좌는 어느 세션도 소유하지 않는다(주문은 「허용 계좌
 *         아님」 거부 · 다른 서버로 새지 않는다). `serversFor` 는 그 서버 세션을 열지 않는다 — 87 이 반영하면
 *         `refreshUserSessions` 가 빠진 서버 세션을 연다.
 *   같은 증권사 두 서버 세션은 계좌들이 실제로 서로 다른 서버를 쓸 때만 연다 — 지정이 하나도 없는 사용자는 종전과 같은 세션
 *         (KB 기본 1개 + 교보 기본 매핑에 계좌가 있으면 교보 기본 1개).
 *
 * 하지 않는 것:
 *   - 로그에 DMA id · 계좌번호를 싣지 않는다(D-19 · T-16-09) — 행 수 · 건너뛴 수만. 오류는 `safePgError` 로만.
 *   - 전략을 끄지 않는다(14 · 11) — 옛 서버 전략 끄기는 29-43 · 29-36 몫이다(gh-trade-84 ②(가)).
 *   - 세션을 다시 세우지 않는다 — 지정 변경의 즉시 재수립은 29-36 몫이다.
 */
import { EventEmitter } from "node:events";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SERVER_KEY_RE } from "@gh-radar/shared";

import { logger } from "../logger.js";
import { safePgError } from "../store/pg-error.js";
import { TailReload } from "../util/tail-reload.js";
import { DMA_BROKERS, isDmaBroker, type DmaBroker, type DmaServerRow } from "../registry/registry.js";
import type { SessionTarget } from "../dma/session-manager.js";

/** 지정 재적재 주기(ms) — 접근 맵 · 레지스트리와 같은 눈금. */
export const ACCOUNT_ORDER_SERVERS_REFRESH_MS = 60_000;

/** 지정 1행 (RPC `dma_account_order_servers` 의 camelCase). 로그 금지(DMA id · 계좌번호). */
export type AccountOrderServerEntry = {
  dmaUserId: string;
  broker: DmaBroker;
  accountNo: string;
  serverKey: string;
};

export type AccountOrderServersDeps = {
  /** 서비스롤 클라이언트 — RPC 는 service_role 전용이다. */
  supabase: SupabaseClient;
  /** 재적재 주기(ms). 기본 `ACCOUNT_ORDER_SERVERS_REFRESH_MS`. */
  refreshMs?: number;
};

/** `reload()` 결과 — 이번 적재 성공 여부. */
export type AccountOrderServersReloadResult = { ok: boolean };

type ChosenRow = { dma_user_id: unknown; broker: unknown; account_no: unknown; server_key: unknown };

/** 사본의 계좌 키 — `${broker}|${accountNo}`. 계좌번호에 `|` 가 없다(서버 정규화 숫자열). */
function acctKey(broker: string, accountNo: string): string {
  return `${broker}|${accountNo}`;
}

/** 두 계좌 → 서버 사본이 같은가(DMA 유저 1명 몫). */
function sameChoices(a: ReadonlyMap<string, string> | undefined, b: ReadonlyMap<string, string> | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

export interface AccountOrderServers {
  /** 재적재가 지정을 바꾼 DMA 유저 id 들(교체 뒤 1회). 첫 적재 · 무변화 · 실패에는 내지 않는다. 로그 금지(D-19). */
  on(event: "changed", listener: (dmaUserIds: string[]) => void): this;
  off(event: "changed", listener: (dmaUserIds: string[]) => void): this;
  emit(event: "changed", dmaUserIds: string[]): boolean;
}

export class AccountOrderServers extends EventEmitter {
  readonly #supabase: SupabaseClient;
  readonly #refreshMs: number;

  /** dmaUserId → `${broker}|${accountNo}` → 지정 서버 키. 성공한 적재마다 통째로 교체한다. */
  #map = new Map<string, Map<string, string>>();
  /** 지정 행 사본(적재 순서) — `entries()` 원천. */
  #entries: AccountOrderServerEntry[] = [];
  #loaded = false;
  /** 주기 = `shared()` · 즉시 = `now()`(29-28 꼬리). */
  readonly #reloader = new TailReload<AccountOrderServersReloadResult>(() => this.#load());
  #timer: NodeJS.Timeout | null = null;
  #started = false;
  #closed = false;
  #failures = 0;
  /** 마지막으로 info 로그에 남긴 집계(바뀔 때만 다시 남긴다). */
  #lastSummary: string | null = null;

  #resolveReady: () => void = () => undefined;
  readonly #ready: Promise<void>;

  constructor(deps: AccountOrderServersDeps) {
    super();
    this.#supabase = deps.supabase;
    this.#refreshMs = deps.refreshMs ?? ACCOUNT_ORDER_SERVERS_REFRESH_MS;
    this.#ready = new Promise<void>((resolve) => {
      this.#resolveReady = resolve;
    });
  }

  /** 첫 적재가 성공했는가. false 면 라우팅은 「모름」 이다(fail closed). */
  get loaded(): boolean {
    return this.#loaded;
  }

  /** 즉시 1회 적재 + 주기 재적재를 건다. 두 번 불러도 타이머는 하나다. */
  start(): void {
    if (this.#closed || this.#started) return;
    this.#started = true;
    void this.#reloader.shared();
    this.#timer = setInterval(() => void this.#reloader.shared(), this.#refreshMs);
    this.#timer.unref?.();
  }

  /** 첫 적재 성공 시 풀린다. 실패가 이어지면 풀리지 않는다(fail closed). 거부하지 않는다. */
  ready(): Promise<void> {
    return this.#ready;
  }

  /**
   * 지금 다시 읽는다(즉시 재적재 — Admin 지정 변경 뒤 · 29-37). 진행 중 적재가 있으면 그것이 끝난 **뒤 한 번 더** 읽은 꼬리의
   * 결과를 돌려준다(29-28 두 슬롯 의미 — 커밋 뒤 요청은 커밋 뒤 읽기).
   */
  reload(): Promise<AccountOrderServersReloadResult> {
    if (this.#closed) return Promise.resolve({ ok: false });
    return this.#reloader.now();
  }

  /** 타이머를 해제한다. 진행 중 조회는 끝까지 가지만 결과를 쓰지 않고, 이후 적재는 없다. */
  close(): void {
    this.#closed = true;
    this.#reloader.close();
    if (this.#timer !== null) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  /** 그 계좌의 지정 서버 키(사본 그대로 — enabled · 증권사 일치 판정은 라우팅 몫). 지정 없음 · 첫 적재 전이면 undefined. */
  chosenOf(dmaUserId: string, broker: string, accountNo: string): string | undefined {
    return this.#map.get(dmaUserId)?.get(acctKey(broker, accountNo));
  }

  /** 지금 사본의 지정 행 전부(사본 · 29-36 healthz 용). 첫 적재 전이면 빈 배열. 로그 · 프레임에 그대로 싣지 않는다. */
  entries(): AccountOrderServerEntry[] {
    return this.#entries.map((e) => ({ ...e }));
  }

  async #load(): Promise<AccountOrderServersReloadResult> {
    try {
      const { data, error } = await this.#supabase.rpc("dma_account_order_servers");
      if (error) throw error;
      if (this.#closed) return { ok: false };
      if (data !== null && !Array.isArray(data)) throw new Error("dma_account_order_servers 반환 형식 위반 — 배열이 아니다");
      this.#replace((data ?? []) as ChosenRow[]);
      return { ok: true };
    } catch (err) {
      this.#failures += 1;
      logger.error(
        { pgError: safePgError(err), attempt: this.#failures, loaded: this.#loaded },
        this.#loaded
          ? "[order-servers] 계좌별 주문 서버 적재 실패 — 직전 값 유지"
          : "[order-servers] 계좌별 주문 서버 첫 적재 실패 — wss 인증은 조회 실패로 끝난다(fail closed)",
      );
      return { ok: false };
    }
  }

  /** 사본을 통째로 교체한다. 형식이 어긋난 행은 건너뛰고 수만 센다. */
  #replace(rows: readonly ChosenRow[]): void {
    const next = new Map<string, Map<string, string>>();
    const entries: AccountOrderServerEntry[] = [];
    let skipped = 0;
    for (const row of rows) {
      const { dma_user_id: dma, broker, account_no: acct, server_key: key } = row;
      if (
        typeof dma !== "string" ||
        dma === "" ||
        !isDmaBroker(broker) ||
        typeof acct !== "string" ||
        acct === "" ||
        typeof key !== "string" ||
        !SERVER_KEY_RE.test(key)
      ) {
        skipped += 1;
        continue;
      }
      let byAcct = next.get(dma);
      if (byAcct === undefined) {
        byAcct = new Map();
        next.set(dma, byAcct);
      }
      const k = acctKey(broker, acct);
      if (byAcct.has(k)) {
        // 같은 계좌 중복 행(DB PK 상 불가) — 첫 행만 쓴다.
        skipped += 1;
        continue;
      }
      byAcct.set(k, key);
      entries.push({ dmaUserId: dma, broker, accountNo: acct, serverKey: key });
    }
    const firstLoad = !this.#loaded;
    const changed: string[] = [];
    if (!firstLoad) {
      for (const dma of new Set([...this.#map.keys(), ...next.keys()])) {
        if (!sameChoices(this.#map.get(dma), next.get(dma))) changed.push(dma);
      }
    }
    this.#map = next;
    this.#entries = entries;
    this.#loaded = true;
    if (firstLoad) this.#resolveReady();
    this.#logSummary({ users: next.size, accounts: entries.length, skipped }, firstLoad);
    if (changed.length > 0) {
      // 수만 싣는다 — DMA id 는 로그 금지(D-19).
      logger.info({ users: changed.length }, "[order-servers] 계좌별 주문 서버 지정 변경 — 영향 DMA 유저 알림");
      this.emit("changed", changed);
    }
  }

  /** 집계가 바뀌었거나 첫 적재 · 복구일 때만 info 1줄. 식별자는 싣지 않는다. */
  #logSummary(summary: { users: number; accounts: number; skipped: number }, firstLoad: boolean): void {
    const key = JSON.stringify(summary);
    const recovered = this.#failures > 0;
    this.#failures = 0;
    if (firstLoad || recovered || key !== this.#lastSummary) {
      logger.info(
        summary,
        firstLoad
          ? "[order-servers] 계좌별 주문 서버 첫 적재"
          : recovered
            ? "[order-servers] 계좌별 주문 서버 적재 복구"
            : "[order-servers] 계좌별 주문 서버 변경",
      );
    }
    this.#lastSummary = key;
  }
}

// ============================================================
// 유효 주문 서버 라우팅 (index 결선 · 테스트가 같은 함수를 쓴다)
// ============================================================

/** 레지스트리 중 라우팅이 읽는 부분 — `ServerRegistry` 가 구조적으로 만족한다. */
export type OrderServerRegistryView = {
  get(key: string): DmaServerRow | undefined;
  /** enabled 행(정렬 순). */
  enabled(): DmaServerRow[];
  /** 그 증권사 기본 주문 서버(enabled). */
  orderServerOf(broker: DmaBroker): DmaServerRow | undefined;
};

export type OrderServerRoutingDeps = {
  /** 지정 첫 적재 성공 여부 — false 면 `serversFor` 가 null(fail closed). */
  loaded: () => boolean;
  /** 계좌의 지정 서버 키(`AccountOrderServers.chosenOf`). */
  chosenOf: (dmaUserId: string, broker: DmaBroker, accountNo: string) => string | undefined;
  registry: OrderServerRegistryView;
  /** 그 서버 매핑(79/87)의 그 DMA id 계좌 — 그 서버 users.toml 에 등록된 계좌다. 매핑 없음 = undefined. */
  accountsOf: (serverKey: string, dmaUserId: string) => ReadonlySet<string> | undefined;
};

export type OrderServerRouting = {
  /** 계좌의 유효 주문 서버 키 = 지정(enabled · 같은 증권사) ?? 증권사 기본 주문 서버. 둘 다 없으면 undefined. */
  effectiveOrderServer(dmaUserId: string, broker: DmaBroker, accountNo: string): string | undefined;
  /** 세션 소유 판정 원천(`SessionManager` `ownerOf`) — 증권사 문자열을 받는다(세션 `broker`). */
  ownerOf(dmaUserId: string, broker: string, accountNo: string): string | undefined;
  /**
   * wss 인증 · `refreshUserSessions` 가 열 (유저, 서버) 대상. 지정 첫 적재 전이면 null(조회 실패 갈래). 증권사마다 그 증권사
   * enabled 서버 매핑들의 계좌 합집합 → 계좌마다 유효 서버(그 서버 매핑에 그 계좌가 있을 때만) → 서버 집합. KB 가 먼저이고
   * 증권사 안에서는 기본 주문 서버가 먼저다. KB 집합이 비면 KB 기본 주문 서버 1개(종전 「KB 는 늘 연다」), 교보는 비면 열지 않는다.
   */
  serversFor(dmaUserId: string): SessionTarget[] | null;
};

export function createOrderServerRouting(deps: OrderServerRoutingDeps): OrderServerRouting {
  const { registry } = deps;

  function effectiveOrderServer(dmaUserId: string, broker: DmaBroker, accountNo: string): string | undefined {
    const chosen = deps.chosenOf(dmaUserId, broker, accountNo);
    if (chosen !== undefined) {
      const row = registry.get(chosen);
      // 꺼진 서버 · 다른 증권사 키(비정상 행)는 지정이 없는 것으로 본다 — 지정 자체는 지우지 않는다(다시 켜면 돌아온다).
      if (row !== undefined && row.enabled && row.broker === broker) return row.key;
    }
    return registry.orderServerOf(broker)?.key;
  }

  function serversFor(dmaUserId: string): SessionTarget[] | null {
    if (!deps.loaded()) return null;
    const enabled = registry.enabled();
    const out: SessionTarget[] = [];
    for (const broker of DMA_BROKERS) {
      const servers = enabled.filter((s) => s.broker === broker);
      const accounts = new Set<string>();
      for (const s of servers) for (const a of deps.accountsOf(s.key, dmaUserId) ?? []) accounts.add(a);
      const keys = new Set<string>();
      for (const a of accounts) {
        const eff = effectiveOrderServer(dmaUserId, broker, a);
        // 지정 서버가 그 계좌를 아직 모르면(매핑 미반영) 그 서버 세션을 열지 않는다 — 열어도 그 계좌는 서버가 거부한다.
        if (eff !== undefined && deps.accountsOf(eff, dmaUserId)?.has(a) === true) keys.add(eff);
      }
      const def = registry.orderServerOf(broker);
      if (broker === "KB" && keys.size === 0 && def !== undefined) keys.add(def.key);
      const rank = (key: string): number => (key === def?.key ? -1 : servers.findIndex((s) => s.key === key));
      for (const key of [...keys].sort((x, y) => rank(x) - rank(y))) {
        const s = servers.find((r) => r.key === key);
        if (s !== undefined) out.push({ serverKey: s.key, host: s.host, port: s.port, broker: s.broker });
      }
    }
    return out;
  }

  return {
    effectiveOrderServer,
    ownerOf: (dmaUserId, broker, accountNo) =>
      isDmaBroker(broker) ? effectiveOrderServer(dmaUserId, broker, accountNo) : undefined,
    serversFor,
  };
}
