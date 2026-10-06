/**
 * Phase 29 Plan 03 — ADMIN-04 · D-09. DMA 서버 레지스트리 (`ServerRegistry`).
 *
 * relay 가 붙는 게이트웨이 서버 목록의 **한 원천**이다. 행 하나(키 · 증권사 · host · port · enabled · 증권사별 주문 서버 ·
 * 시세 주 서버)가 `ServerPipelines` 에서 관찰자 연결 한 벌이 된다. 원천은 두 가지뿐이다:
 *
 *   env  config 가 오늘의 `DMA_HOST`(기본 127.0.0.1) · `DMA_PORT` · `DMA_BROKER` 와 `DMA_KYOBO_HOST` 표로 합성한 1~2행
 *        (`RelayConfig.envServers`). 로컬 · 테스트 · e2e 전용이다. 키는 종전 `KB`/`KYOBO` 그대로다.
 *   db   `dma_servers` 표(29-01). **`NODE_ENV=production` 에서만** 켜진다 — config 가 그 밖의 조합을 기동 거부한다.
 *
 * 결정 근거:
 *   D-09  안전 기본값 — 개발 Mac 은 WireGuard 로 운영 게이트웨이 대역에 직결된다(RESEARCH Pattern 1). 로컬 · 테스트
 *         relay 가 운영 Supabase 의 레지스트리를 읽으면 실서버 관찰자 정원을 먹고 실계좌 서버에 붙는다. 그래서 db 원천은
 *         production 전용이고, 이 모듈에는 실서버 주소 리터럴이 없다(D-27).
 *   identities.ts 규율 복제 — 부팅 즉시 1회 + `REGISTRY_REFRESH_MS`(60초) 주기 재적재 · 겹침 금지(진행 중이면 같은
 *         Promise 를 공유) · 실패 · 불변식 위반이면 **직전 값 유지** + 사유 로그 · 첫 성공 전에는 `ready()` 가 풀리지
 *         않는다(fail closed — index 가 관찰자 · 세션 · quote 를 열지 않는다). 오류는 `safePgError` 로만 남긴다.
 *   불변식 — 증권사당 주문 서버 ≤ 1 · 시세 주 서버 ≤ 1 · 주문/시세 서버는 enabled · 키 중복 없음 · 키는 증권사 접두.
 *         DB 에도 같은 제약(부분 유니크 · CHECK)이 있지만 relay 는 그것을 믿지 않고 다시 본다 — 위반 스냅샷을 받으면
 *         세션 · quote 대상이 둘이 되는 순간이 생긴다.
 *   변경 통지 — 행이 실제로 바뀐 경우에만 `changed` 를 1회 낸다(added · removed · changed · roles). 같은 행 재적재는
 *         조용하다. 첫 적재는 전 키가 `added` 다. `reload()` 는 29-11 `/internal/admin/registry/reload` 가 부른다.
 *
 * 하지 않는 것:
 *   - 비밀을 다루지 않는다. 관찰자 비밀은 증권사 → env 키 고정 매핑(config `observerSecretOf`)이다(RESEARCH Pitfall 11).
 *   - 로그에 비밀 · 서비스롤 키를 싣지 않는다. 변경 로그는 키 · host · enabled 까지다.
 *   - 관찰자를 직접 만들지 않는다 — 결선(`changed` → `pipelines.sync`)은 index.ts 다.
 */
import { EventEmitter } from "node:events";
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "../logger.js";
import { safePgError } from "../store/pg-error.js";

/** 레지스트리 재적재 주기(ms) — 접근 맵 `APP_ACCESS_REFRESH_MS`(옛 identities.ts 60초)와 같은 눈금이다. */
export const REGISTRY_REFRESH_MS = 60_000;

/** 지원 증권사. 키 접두 · 관찰자 비밀 env 매핑의 정본 목록이다. */
export type DmaBroker = "KB" | "KYOBO";
export const DMA_BROKERS: readonly DmaBroker[] = ["KB", "KYOBO"];

export function isDmaBroker(v: unknown): v is DmaBroker {
  return v === "KB" || v === "KYOBO";
}

/** 레지스트리 행 1개 (29-01 `dma_servers` 열의 camelCase). */
export type DmaServerRow = {
  /** relay 쪽 서버 키 — 커서 PK · 적용 RPC `p_gateway` · 매핑 교체 범위. 79 의 broker 와 무관하다(Pitfall 12). */
  key: string;
  broker: DmaBroker;
  host: string;
  port: number;
  enabled: boolean;
  /** 그 증권사의 사용자 세션 대상(증권사당 1대). */
  isOrderServer: boolean;
  /** quote 연결 대상(전체 1대). */
  isQuotePrimary: boolean;
  sortOrder: number;
};

/** `changed` 이벤트 본문. 키 목록 · 역할 변경 여부뿐이다. */
export type RegistryChange = {
  added: string[];
  removed: string[];
  /** host · port · enabled · broker 중 하나라도 바뀐 키. */
  changed: string[];
  /** 주문 서버 · 시세 주 서버 · 정렬 중 하나라도 바뀌었는가. */
  roles: boolean;
};

export type ServerRegistryOptions =
  | { source: "env"; rows: readonly DmaServerRow[] }
  | { source: "db"; supabase: SupabaseClient; refreshMs?: number };

export interface ServerRegistry {
  on(event: "changed", listener: (change: RegistryChange) => void): this;
  off(event: "changed", listener: (change: RegistryChange) => void): this;
  emit(event: "changed", change: RegistryChange): boolean;
}

/** `dma_servers` select 칸 — 29-01 열 이름 그대로다. */
const SELECT_COLUMNS = "key, broker, host, port, enabled, is_order_server, is_quote_primary, sort_order";

type DbRow = {
  key: unknown;
  broker: unknown;
  host: unknown;
  port: unknown;
  enabled: unknown;
  is_order_server: unknown;
  is_quote_primary: unknown;
  sort_order: unknown;
};

/** DB 행 1개를 가드한다. 형식이 어긋나면 사유를 던진다(값은 키까지만 싣는다). */
function parseDbRow(row: DbRow, index: number): DmaServerRow {
  const key = row.key;
  if (typeof key !== "string" || key === "") throw new Error(`dma_servers[${index}] 키가 비었다`);
  if (!isDmaBroker(row.broker)) throw new Error(`dma_servers ${key}: broker 가 KB · KYOBO 가 아니다`);
  if (!key.startsWith(row.broker)) throw new Error(`dma_servers ${key}: 키가 증권사 접두(${row.broker})로 시작하지 않는다`);
  if (typeof row.host !== "string" || row.host.trim() === "") throw new Error(`dma_servers ${key}: host 가 비었다`);
  const port = row.port;
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`dma_servers ${key}: port 가 1~65535 정수가 아니다`);
  }
  if (
    typeof row.enabled !== "boolean" ||
    typeof row.is_order_server !== "boolean" ||
    typeof row.is_quote_primary !== "boolean"
  ) {
    throw new Error(`dma_servers ${key}: enabled · is_order_server · is_quote_primary 가 boolean 이 아니다`);
  }
  const sortOrder = typeof row.sort_order === "number" && Number.isFinite(row.sort_order) ? row.sort_order : 0;
  return {
    key,
    broker: row.broker,
    host: row.host.trim(),
    port,
    enabled: row.enabled,
    isOrderServer: row.is_order_server,
    isQuotePrimary: row.is_quote_primary,
    sortOrder,
  };
}

/**
 * 레지스트리 불변식. 위반이면 사유를 던진다 — db 적재는 직전 값을 유지하고, env 합성은 기동을 거부한다.
 */
export function assertRegistryInvariants(rows: readonly DmaServerRow[]): void {
  const keys = new Set<string>();
  const orderByBroker = new Map<DmaBroker, string>();
  let quote: string | null = null;
  for (const r of rows) {
    if (keys.has(r.key)) throw new Error(`서버 키 "${r.key}" 가 중복이다 — 커서 · epoch · 매핑이 섞인다`);
    keys.add(r.key);
    if (r.isOrderServer) {
      if (!r.enabled) throw new Error(`${r.key}: 주문 서버인데 enabled 가 아니다`);
      const prev = orderByBroker.get(r.broker);
      if (prev !== undefined) throw new Error(`${r.broker} 주문 서버가 둘이다(${prev} · ${r.key})`);
      orderByBroker.set(r.broker, r.key);
    }
    if (r.isQuotePrimary) {
      if (!r.enabled) throw new Error(`${r.key}: 시세 주 서버인데 enabled 가 아니다`);
      if (quote !== null) throw new Error(`시세 주 서버가 둘이다(${quote} · ${r.key})`);
      quote = r.key;
    }
  }
}

function sortRows(rows: readonly DmaServerRow[]): DmaServerRow[] {
  return rows
    .map((r) => ({ ...r }))
    .sort((a, b) => a.sortOrder - b.sortOrder || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

function diff(prev: ReadonlyMap<string, DmaServerRow>, next: ReadonlyMap<string, DmaServerRow>): RegistryChange {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  let roles = false;
  for (const [key, row] of next) {
    const old = prev.get(key);
    if (old === undefined) {
      added.push(key);
      continue;
    }
    if (old.host !== row.host || old.port !== row.port || old.enabled !== row.enabled || old.broker !== row.broker) {
      changed.push(key);
    }
    if (
      old.isOrderServer !== row.isOrderServer ||
      old.isQuotePrimary !== row.isQuotePrimary ||
      old.sortOrder !== row.sortOrder
    ) {
      roles = true;
    }
  }
  for (const key of prev.keys()) if (!next.has(key)) removed.push(key);
  return { added, removed, changed, roles };
}

export class ServerRegistry extends EventEmitter {
  readonly #opts: ServerRegistryOptions;
  readonly #refreshMs: number;

  /** 정렬된 현재 행(성공한 적재마다 통째 교체). */
  #rows: DmaServerRow[] = [];
  #byKey = new Map<string, DmaServerRow>();
  #loaded = false;
  #inFlight: Promise<{ ok: boolean; changed: boolean }> | null = null;
  #timer: NodeJS.Timeout | null = null;
  #started = false;
  #closed = false;
  #failures = 0;

  #resolveReady: () => void = () => undefined;
  readonly #ready: Promise<void>;

  constructor(opts: ServerRegistryOptions) {
    super();
    this.#opts = opts;
    this.#refreshMs = opts.source === "db" ? (opts.refreshMs ?? REGISTRY_REFRESH_MS) : REGISTRY_REFRESH_MS;
    this.#ready = new Promise<void>((resolve) => {
      this.#resolveReady = resolve;
    });
  }

  /** 원천. 부팅 로그 · 테스트용. */
  get source(): "env" | "db" {
    return this.#opts.source;
  }

  /** 첫 적재가 성공했는가. */
  get loaded(): boolean {
    return this.#loaded;
  }

  /**
   * 즉시 1회 적재(env 는 동기 · db 는 비동기) + db 면 주기 재적재를 건다. 두 번 불러도 타이머는 하나다.
   * env 행이 불변식을 어기면 여기서 던진다(config 단계에서 이미 막히지만 이중 방어).
   */
  start(): void {
    if (this.#closed || this.#started) return;
    this.#started = true;
    if (this.#opts.source === "env") {
      const rows = sortRows(this.#opts.rows);
      assertRegistryInvariants(rows);
      this.#apply(rows);
      return;
    }
    void this.reload();
    this.#timer = setInterval(() => void this.reload(), this.#refreshMs);
    this.#timer.unref?.();
  }

  /** 첫 적재 성공 시 풀린다. 실패가 이어지면 풀리지 않는다(fail closed). 거부하지 않는다. */
  ready(): Promise<void> {
    return this.#ready;
  }

  /**
   * 지금 다시 읽는다(db). 진행 중이면 그 Promise 를 공유한다(겹침 금지 — select 는 한 번). env 는 바뀌는 것이 없다.
   * `ok` = 이번 적재가 성공했는가 · `changed` = 행이 바뀌어 `changed` 이벤트를 냈는가.
   */
  reload(): Promise<{ ok: boolean; changed: boolean }> {
    if (this.#closed) return Promise.resolve({ ok: false, changed: false });
    if (this.#opts.source === "env") return Promise.resolve({ ok: this.#loaded, changed: false });
    if (this.#inFlight !== null) return this.#inFlight;
    const p = this.#loadDb(this.#opts.supabase).finally(() => {
      this.#inFlight = null;
    });
    this.#inFlight = p;
    return p;
  }

  /** 타이머를 해제한다. 진행 중 조회는 끝까지 가지만 결과를 쓰지 않는다. */
  close(): void {
    this.#closed = true;
    if (this.#timer !== null) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  /** 전 행(정렬 순 · 사본). */
  all(): DmaServerRow[] {
    return this.#rows.map((r) => ({ ...r }));
  }

  /** enabled 행(정렬 순 · 사본). */
  enabled(): DmaServerRow[] {
    return this.#rows.filter((r) => r.enabled).map((r) => ({ ...r }));
  }

  get(key: string): DmaServerRow | undefined {
    const r = this.#byKey.get(key);
    return r === undefined ? undefined : { ...r };
  }

  /** 그 증권사의 주문 서버(enabled). 없으면 undefined. */
  orderServerOf(broker: DmaBroker): DmaServerRow | undefined {
    const r = this.#rows.find((x) => x.broker === broker && x.isOrderServer && x.enabled);
    return r === undefined ? undefined : { ...r };
  }

  /** 시세 주 서버(enabled). 없으면 undefined. */
  quotePrimary(): DmaServerRow | undefined {
    const r = this.#rows.find((x) => x.isQuotePrimary && x.enabled);
    return r === undefined ? undefined : { ...r };
  }

  async #loadDb(supabase: SupabaseClient): Promise<{ ok: boolean; changed: boolean }> {
    try {
      const { data, error } = await supabase.from("dma_servers").select(SELECT_COLUMNS).order("sort_order");
      if (error) throw error;
      if (this.#closed) return { ok: false, changed: false };
      const rows = sortRows(((data ?? []) as DbRow[]).map((row, i) => parseDbRow(row, i)));
      assertRegistryInvariants(rows);
      const recovered = this.#failures > 0;
      this.#failures = 0;
      const changed = this.#apply(rows);
      if (recovered && !changed) logger.info({ servers: rows.length }, "[registry] 서버 레지스트리 적재 복구");
      return { ok: true, changed };
    } catch (err) {
      this.#failures += 1;
      logger.error(
        { pgError: safePgError(err), attempt: this.#failures, loaded: this.#loaded },
        this.#loaded
          ? "[registry] 서버 레지스트리 적재 실패 — 직전 값 유지"
          : "[registry] 서버 레지스트리 첫 적재 실패 — 관찰자 · 세션 · quote 를 열지 않는다(fail closed)",
      );
      return { ok: false, changed: false };
    }
  }

  /** 행을 통째로 교체하고, 바뀌었으면 info 1줄 + `changed` 1회. 바뀌었는가를 돌려준다. */
  #apply(rows: DmaServerRow[]): boolean {
    const next = new Map(rows.map((r) => [r.key, r] as const));
    const change = diff(this.#byKey, next);
    const firstLoad = !this.#loaded;
    this.#rows = rows;
    this.#byKey = next;
    this.#loaded = true;
    if (firstLoad) this.#resolveReady();
    const isChanged =
      change.added.length > 0 || change.removed.length > 0 || change.changed.length > 0 || change.roles;
    if (!isChanged) return false;
    logger.info(
      {
        source: this.#opts.source,
        // 키 · host · enabled 까지만 — 비밀은 이 모듈에 없다.
        servers: rows.map((r) => ({ key: r.key, host: r.host, enabled: r.enabled })),
        added: change.added,
        removed: change.removed,
        changed: change.changed,
        roles: change.roles,
      },
      firstLoad ? "[registry] 서버 레지스트리 첫 적재" : "[registry] 서버 레지스트리 변경",
    );
    this.emit("changed", change);
    return true;
  }
}
