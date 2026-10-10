/**
 * Phase 29 Plan 06 — ADMIN-03 · ADMIN-11. 웹 사용자 접근 맵 적재기 (`AppAccess`).
 *
 * relay 의 「누가 DMA 를 쓸 수 있나」 판정 원천이다. 서비스롤 RPC `dma_app_access_map()`(29-01 — `auth.users ⨝ app_users`
 * → `(user_id, email, role, dma_user_id)`)을 통째로 읽어 메모리 사본을 쥔다. **역할 판정 원천은 DB 하나** — webapp
 * middleware(29-12 · `my_app_access()`)와 같은 표(`app_users`)를 본다. 두 표면이 서로 다른 표로 역할을 판정하지 않는다.
 *
 * 결정 근거:
 *   D-02  역할 3단 admin · trader · viewer. DMA 세션을 열 수 있는 것은 **admin · trader 이면서 DMA 연결(`dma_user_id`)이
 *         있는** 사용자뿐이다(`dmaUserIdOf`). viewer · 승인 대기(맵에 없음) · DMA 연결 없음은 wss 에서 `unauthorized` 다.
 *   D-04  강등 · 허용 해제는 즉시 — 60초 주기 재적재 + `reload()`(29-11 `/internal/admin/access/reload` 가 부른다).
 *   D-19  자격증명은 `dma_users.password_enc`(AAD = dma_user_id)에서 이 맵의 `dmaUserId` 로 찾는다 — 웹 user_id 로 찾지
 *         않는다(`store/credentials.ts` `createAccessCredentials`).
 *   「DMA id 는 모든 서버에 같은 문자열」(CONTEXT 확정) — 그래서 서버별 신원 표가 필요 없다. 이 객체 자체가
 *         `GatewayIdentityView`(`dmaUserIdOf`)를 만족해 **모든 서버 파이프라인의 푸시 신원**이 된다.
 *   identities.ts 규율 복제(29-03 registry 와 같다) — 부팅 즉시 1회 + `APP_ACCESS_REFRESH_MS`(60초) 주기 재적재 ·
 *         주기 = 공유 · 즉시 = 꼬리(WR-02 — `util/tail-reload.ts`: 주기 틱은 진행 중 적재를 공유하고, `reload()` 는 진행 중
 *         적재가 커밋 전 행을 읽었을 수 있으므로 그 뒤 한 번 더 읽는다) · 실패하면 **직전 맵 유지** + `safePgError` 로그 ·
 *         첫 성공 전에는 빈 맵이고 `loaded=false`(fail closed — wss 인증은 「권한 없음」 이 아니라 「조회 실패」 로 끝난다).
 *   미스 단발 재적재 — `lookup(userId)` 는 맵에 없는 사용자를 만나면 `reload()` 를 1회 걸고(최소 간격
 *         `APP_ACCESS_MISS_RELOAD_MIN_MS`) 다시 본다. 방금 승인된 사용자 · e2e 시드 직후 인증이 60초를 기다리지 않게 한다.
 *         간격 안의 미스는 재적재 없이 「없음」 이다 — 승인 대기 사용자의 재접속 폭주가 RPC 폭주가 되지 않게.
 *
 * 하지 않는 것:
 *   - 로그에 이메일 · dmaUserId · 사용자 id 를 싣지 않는다 — 행 수 · 역할별 수만(이전 phase 결정 · T-19-14).
 *     오류는 `safePgError` 로만(`details` 에 행 값이 실릴 수 있다).
 *   - 역할 규칙을 다시 구현하지 않는다 — RPC 가 돌려준 행을 그대로 쓴다(행 가드만).
 *   - 자격증명을 읽지 않는다. 비밀번호 복호는 `store/credentials.ts` 한 곳이다.
 */
import { EventEmitter } from "node:events";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppRole } from "@gh-radar/shared";

import { logger } from "../logger.js";
import { safePgError } from "../store/pg-error.js";
import { TailReload } from "../util/tail-reload.js";
import type { GatewayIdentityView } from "../journal/types.js";

/** 접근 맵 재적재 주기(ms) — identities · registry 와 같은 눈금. config `APP_ACCESS_REFRESH_MS` 가 비프로덕션에서만 바꾼다. */
export const APP_ACCESS_REFRESH_MS = 60_000;

/** `lookup` 미스 단발 재적재의 최소 간격(ms). 승인 대기 사용자의 재접속이 RPC 폭주가 되지 않게 한다. */
export const APP_ACCESS_MISS_RELOAD_MIN_MS = 2_000;

/** 접근 맵 1행 (RPC `dma_app_access_map` 의 camelCase). */
export type AppAccessEntry = {
  /** gh-radar(Supabase auth) user_id. */
  userId: string;
  /** `app_users.email`(정규화된 소문자). 로그 금지. */
  email: string;
  role: AppRole;
  /** 연결된 DMA 유저 id(모든 서버에 같은 문자열). 없으면 null. 로그 금지. */
  dmaUserId: string | null;
};

export type AppAccessDeps = {
  /** 서비스롤 클라이언트 — RPC 는 service_role 전용이다. */
  supabase: SupabaseClient;
  /** 재적재 주기(ms). 기본 `APP_ACCESS_REFRESH_MS`. */
  refreshMs?: number;
  /** 미스 단발 재적재 최소 간격(ms). 기본 `APP_ACCESS_MISS_RELOAD_MIN_MS`. 테스트가 바꾼다. */
  missReloadMinMs?: number;
};

/** `reload()` 결과 — 이번 적재 성공 여부 · 이번 적재로 권한을 잃은 userId. */
export type AppAccessReloadResult = { ok: boolean; revoked: string[] };

type AccessRow = { user_id: unknown; email: unknown; role: unknown; dma_user_id: unknown };

function isAppRole(v: unknown): v is AppRole {
  return v === "admin" || v === "trader" || v === "viewer";
}

/** DMA 세션을 열 수 있는 행인가 — admin · trader 이면서 DMA 연결이 있다(D-02). */
export function isDmaGranted(entry: AppAccessEntry | undefined): entry is AppAccessEntry & { dmaUserId: string } {
  return entry !== undefined && (entry.role === "admin" || entry.role === "trader") && entry.dmaUserId !== null;
}

/**
 * 재적재 전후 비교로 「권한을 잃은」 사용자인가 (D-04). 직전 행이 있었고:
 *   - 새 맵에서 사라졌거나(허용 해제)
 *   - viewer 로 내려갔거나(강등)
 *   - DMA 연결이 끊기거나 다른 DMA id 로 바뀌었다(열린 세션이 옛 자격증명을 쥐고 있다).
 * admin ↔ trader 이동 · 승격 · 새 연결은 해당하지 않는다(relay 의 DMA 권한은 그대로이거나 늘어난다).
 */
function lostAccess(prev: AppAccessEntry, next: AppAccessEntry | undefined): boolean {
  if (next === undefined) return true;
  if (next.role === "viewer" && prev.role !== "viewer") return true;
  return prev.dmaUserId !== null && next.dmaUserId !== prev.dmaUserId;
}

export interface AppAccess {
  /** 재적재가 권한을 잃은 사용자를 찾았을 때 1회(배열). 첫 적재 · 무변화 · 실패에는 내지 않는다. */
  on(event: "revoked", listener: (userIds: string[]) => void): this;
  off(event: "revoked", listener: (userIds: string[]) => void): this;
  emit(event: "revoked", userIds: string[]): boolean;
}

export class AppAccess extends EventEmitter implements GatewayIdentityView {
  readonly #supabase: SupabaseClient;
  readonly #refreshMs: number;
  readonly #missReloadMinMs: number;

  /** userId → 행. 성공한 적재마다 통째로 교체한다. */
  #map = new Map<string, AppAccessEntry>();
  #loaded = false;
  /** 주기 = `shared()` · 즉시 = `now()`(WR-02 꼬리). */
  readonly #reloader = new TailReload<AppAccessReloadResult>(() => this.#load());
  #timer: NodeJS.Timeout | null = null;
  #started = false;
  #closed = false;
  #failures = 0;
  /** 마지막 미스 단발 재적재 시각(epoch ms). */
  #lastMissReloadAt = Number.NEGATIVE_INFINITY;
  /** 마지막으로 info 로그에 남긴 집계(바뀔 때만 다시 남긴다). */
  #lastSummary: string | null = null;

  #resolveReady: () => void = () => undefined;
  readonly #ready: Promise<void>;

  constructor(deps: AppAccessDeps) {
    super();
    this.#supabase = deps.supabase;
    this.#refreshMs = deps.refreshMs ?? APP_ACCESS_REFRESH_MS;
    this.#missReloadMinMs = deps.missReloadMinMs ?? APP_ACCESS_MISS_RELOAD_MIN_MS;
    this.#ready = new Promise<void>((resolve) => {
      this.#resolveReady = resolve;
    });
  }

  /** 첫 적재가 성공했는가. */
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
   * 지금 다시 읽는다(즉시 재적재 — 29-11 `/internal/admin/access/reload`). 진행 중 적재가 있으면 그것이 끝난 **뒤 한 번 더**
   * 읽은 꼬리의 결과를 돌려준다(WR-02) — 그 적재가 강등 커밋 전에 시작돼 옛 행을 읽고 있어도 `revoked` 는 커밋 뒤 값이다.
   * 꼬리 시작 전에 겹친 호출들은 같은 꼬리를 공유한다(동시 RPC 는 진행 1 + 대기 1).
   */
  reload(): Promise<AppAccessReloadResult> {
    if (this.#closed) return Promise.resolve({ ok: false, revoked: [] });
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

  /** 지금 사본의 그 사용자 행(사본). 첫 적재 전 · 맵에 없으면 undefined. */
  entryOf(userId: string): AppAccessEntry | undefined {
    const e = this.#map.get(userId);
    return e === undefined ? undefined : { ...e };
  }

  /**
   * 푸시 신원(`GatewayIdentityView`) — admin · trader 이면서 DMA 연결이 있을 때만 그 DMA id. 그 밖(viewer · 연결 없음 ·
   * 맵에 없음 · 첫 적재 전)은 undefined — 그 사용자는 어느 서버 푸시 대상도 아니다(fail closed).
   */
  dmaUserIdOf(userId: string): string | undefined {
    const e = this.#map.get(userId);
    return isDmaGranted(e) ? e.dmaUserId : undefined;
  }

  /**
   * wss 인증용 조회. 맵에 있으면 바로, 없으면 단발 재적재 1회(최소 간격 `missReloadMinMs` · 진행 중이면 그것을 기다린다)
   * 뒤 다시 본다. 첫 적재 전이면 진행 중 적재를 기다린다 — 그래도 미적재면 undefined(호출자가 `loaded` 로 가른다).
   */
  async lookup(userId: string): Promise<AppAccessEntry | undefined> {
    const hit = this.entryOf(userId);
    if (hit !== undefined || this.#closed) return hit;
    if (this.#reloader.inFlight) {
      await this.#reloader.shared();
    } else if (Date.now() - this.#lastMissReloadAt >= this.#missReloadMinMs) {
      this.#lastMissReloadAt = Date.now();
      await this.reload();
    }
    return this.entryOf(userId);
  }

  async #load(): Promise<AppAccessReloadResult> {
    try {
      const { data, error } = await this.#supabase.rpc("dma_app_access_map");
      if (error) throw error;
      if (this.#closed) return { ok: false, revoked: [] };
      if (data !== null && !Array.isArray(data)) throw new Error("dma_app_access_map 반환 형식 위반 — 배열이 아니다");
      return { ok: true, revoked: this.#replace((data ?? []) as AccessRow[]) };
    } catch (err) {
      this.#failures += 1;
      logger.error(
        { pgError: safePgError(err), attempt: this.#failures, loaded: this.#loaded },
        this.#loaded
          ? "[access] 접근 맵 적재 실패 — 직전 값 유지"
          : "[access] 접근 맵 첫 적재 실패 — wss 인증은 조회 실패로 끝난다(fail closed)",
      );
      return { ok: false, revoked: [] };
    }
  }

  /** 맵을 통째로 교체하고, 권한을 잃은 userId 를 돌려준다(있으면 교체 **뒤** `revoked` 1회 — 리스너는 새 맵을 본다). */
  #replace(rows: readonly AccessRow[]): string[] {
    const next = new Map<string, AppAccessEntry>();
    let skipped = 0;
    for (const row of rows) {
      if (typeof row.user_id !== "string" || row.user_id === "" || typeof row.email !== "string" || !isAppRole(row.role)) {
        skipped += 1;
        continue;
      }
      const dma = typeof row.dma_user_id === "string" && row.dma_user_id !== "" ? row.dma_user_id : null;
      next.set(row.user_id, { userId: row.user_id, email: row.email, role: row.role, dmaUserId: dma });
    }
    const firstLoad = !this.#loaded;
    const revoked: string[] = [];
    if (!firstLoad) {
      for (const [userId, prev] of this.#map) {
        if (lostAccess(prev, next.get(userId))) revoked.push(userId);
      }
    }
    this.#map = next;
    this.#loaded = true;
    if (firstLoad) this.#resolveReady();
    this.#logSummary(next, skipped, firstLoad);
    if (revoked.length > 0) {
      // 수만 싣는다 — 사용자 id 는 fanout.revokeUser 가 연결 단위로 남긴다.
      logger.info({ revoked: revoked.length }, "[access] 권한 회수 — 해당 사용자 relay 연결을 끊는다(D-04)");
      this.emit("revoked", revoked);
    }
    return revoked;
  }

  /** 집계가 바뀌었거나 첫 적재 · 복구일 때만 info 1줄. 식별자는 싣지 않는다. */
  #logSummary(map: ReadonlyMap<string, AppAccessEntry>, skipped: number, firstLoad: boolean): void {
    const roles = { admin: 0, trader: 0, viewer: 0 };
    let dmaGranted = 0;
    for (const e of map.values()) {
      roles[e.role] += 1;
      if (isDmaGranted(e)) dmaGranted += 1;
    }
    const summary = { users: map.size, roles, dmaGranted, skipped };
    const key = JSON.stringify(summary);
    const recovered = this.#failures > 0;
    this.#failures = 0;
    if (firstLoad || recovered || key !== this.#lastSummary) {
      logger.info(
        summary,
        firstLoad ? "[access] 접근 맵 첫 적재" : recovered ? "[access] 접근 맵 적재 복구" : "[access] 접근 맵 변경",
      );
    }
    this.#lastSummary = key;
  }
}
