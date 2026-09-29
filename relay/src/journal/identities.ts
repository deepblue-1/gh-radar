/**
 * quick-260929-sas — 추가 게이트웨이 신원 적재기 (`GatewayIdentities`). gh-radar 사용자 → 그 게이트웨이의 dma_user_id.
 *
 * 정본 규칙은 DB 뷰 `dma_visibility_identities` 하나다(D-03 — 자격증명 신원 UNION ALL 명시 연결 신원, 연결은
 * 자격증명이 있고 자격증명과 다른 게이트웨이일 때만). 이 모듈은 그 뷰를 **추가 게이트웨이 키로만** 읽어 relay
 * 푸시 라우팅용 사본을 쥔다 — REST 조회 RPC(`dma_visible_accounts`)와 relay 추가 게이트웨이 푸시가 같은 규칙을
 * 따르게 하는 것이 목적이다(D-05).
 *
 * 결정 근거:
 *   - 부팅 즉시 1회 + `refreshMs`(기본 `IDENTITY_REFRESH_MS` 60초) 주기 재적재. 성공하면 맵을 **통째로 교체**한다 —
 *     삭제된 연결이 다음 주기에 사라진다. 연결 변경은 최대 `refreshMs` 뒤 푸시에 반영되고, REST 는 즉시다(T-sas-07).
 *   - **fail closed** — 첫 성공 전에는 빈 맵이다(추가 게이트웨이 푸시 없음). 브라우저 REST 새로고침이 행을 복원한다.
 *     실패하면 직전 맵을 유지하고 error 로그를 남긴다(T-sas-06).
 *   - 조회가 진행 중이면 다음 주기를 건너뛴다(겹침 금지 — 느린 DB 에 조회가 쌓이지 않게).
 *   - 로그에는 행 수만 싣는다(T-19-14). 사용자 id · dma id 는 어떤 로그에도 없다. 오류는 `safePgError` 로만
 *     (`details` 에 행 값이 실릴 수 있다).
 *
 * 하지 않는 것:
 *   - 주 게이트웨이는 이 모듈을 쓰지 않는다(D-05) — 주 게이트웨이 푸시는 종전대로 자격증명 문자열
 *     (`WsFanout` 의 `entry.dmaUserId`)로 라우팅한다. 추가 게이트웨이가 없는 relay 는 이 객체를 만들지 않는다
 *     (신원 조회 0건).
 *   - 규칙을 다시 구현하지 않는다 — 뷰가 돌려준 행을 그대로 쓴다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "../logger.js";
import { safePgError } from "../store/pg-error.js";
import type { GatewayIdentityView } from "./types.js";

/** 신원 재적재 주기(ms). README 「신원 연결 추가 · 제거」 의 반영 시점(최대 60초)과 같은 값이다. */
export const IDENTITY_REFRESH_MS = 60_000;

export type GatewayIdentitiesDeps = {
  /** 서비스롤 클라이언트 — 뷰는 service_role 전용이다. */
  supabase: SupabaseClient;
  /** 추가 게이트웨이 키 목록(config 가 정한다 — 코드에 리터럴 없음). */
  gateways: readonly string[];
  /** 재적재 주기(ms). 기본 `IDENTITY_REFRESH_MS`. 테스트가 작게 주입한다. */
  refreshMs?: number;
};

type IdentityRow = { user_id: unknown; gateway: unknown; dma_user_id: unknown };

export class GatewayIdentities {
  readonly #supabase: SupabaseClient;
  readonly #gateways: readonly string[];
  readonly #refreshMs: number;

  /** gateway → (gh-radar user_id → dma_user_id). 성공한 적재마다 통째로 교체한다. */
  #map = new Map<string, Map<string, string>>();
  #loaded = false;
  #inFlight = false;
  #timer: NodeJS.Timeout | null = null;
  #closed = false;
  #failures = 0;
  /** 마지막으로 info 로그에 남긴 게이트웨이별 행 수(바뀔 때만 다시 남긴다). */
  #lastCounts: string | null = null;

  constructor(deps: GatewayIdentitiesDeps) {
    this.#supabase = deps.supabase;
    this.#gateways = [...deps.gateways];
    this.#refreshMs = deps.refreshMs ?? IDENTITY_REFRESH_MS;
  }

  /** 첫 적재가 성공했는가. */
  get loaded(): boolean {
    return this.#loaded;
  }

  /** 즉시 1회 적재 + 주기 재적재를 건다. 두 번 불러도 타이머는 하나다. */
  start(): void {
    if (this.#closed || this.#timer !== null) return;
    void this.#load();
    this.#timer = setInterval(() => void this.#load(), this.#refreshMs);
    this.#timer.unref?.();
  }

  /**
   * 그 게이트웨이의 신원 읽기 뷰. 호출 시점의 최신 맵을 읽는다 — 재적재로 맵이 교체돼도 같은 뷰 객체가 새 값을 본다.
   * 목록 밖 게이트웨이는 늘 undefined 다.
   */
  viewOf(gateway: string): GatewayIdentityView {
    return { dmaUserIdOf: (userId: string) => this.#map.get(gateway)?.get(userId) };
  }

  /** 타이머를 해제한다. 진행 중 조회는 끝까지 가지만 결과를 쓰지 않고, 이후 적재는 없다. */
  close(): void {
    this.#closed = true;
    if (this.#timer !== null) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  async #load(): Promise<void> {
    if (this.#closed || this.#inFlight) return;
    this.#inFlight = true;
    try {
      const { data, error } = await this.#supabase
        .from("dma_visibility_identities")
        .select("user_id, gateway, dma_user_id")
        .in("gateway", [...this.#gateways]);
      if (error) throw error;
      if (this.#closed) return;
      this.#replace((data ?? []) as IdentityRow[]);
    } catch (err) {
      this.#failures += 1;
      logger.error(
        { gateways: this.#gateways, pgError: safePgError(err), attempt: this.#failures },
        "[journal] 신원 연결 적재 실패 — 직전 값 유지(첫 적재 전이면 추가 게이트웨이 푸시 없음)",
      );
    } finally {
      this.#inFlight = false;
    }
  }

  #replace(rows: readonly IdentityRow[]): void {
    const next = new Map<string, Map<string, string>>();
    for (const gw of this.#gateways) next.set(gw, new Map());
    for (const row of rows) {
      if (typeof row.user_id !== "string" || typeof row.gateway !== "string" || typeof row.dma_user_id !== "string") {
        continue;
      }
      if (row.user_id === "" || row.dma_user_id === "") continue;
      // 목록 밖 게이트웨이 행은 쓰지 않는다(조회 필터가 이미 거르지만 사본은 목록에 묶는다).
      next.get(row.gateway)?.set(row.user_id, row.dma_user_id);
    }
    this.#map = next;

    const counts: Record<string, number> = {};
    for (const [gw, users] of next) counts[gw] = users.size;
    const key = JSON.stringify(counts);
    const recovered = this.#failures > 0;
    this.#failures = 0;
    if (!this.#loaded || key !== this.#lastCounts || recovered) {
      logger.info(
        { rows: counts },
        !this.#loaded ? "[journal] 신원 연결 첫 적재" : recovered ? "[journal] 신원 연결 적재 복구" : "[journal] 신원 연결 변경",
      );
    }
    this.#loaded = true;
    this.#lastCounts = key;
  }
}
