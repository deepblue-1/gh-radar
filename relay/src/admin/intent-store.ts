/**
 * Phase 29 Plan 11 — ADMIN-05. DMA 의도 RPC 래퍼 (`AdminIntentStore`).
 *
 * 29-05 의 service_role 전용 RPC 를 **1:1 로** 감싼다 — 판정(LAST_ACCOUNT · SERVER_BROKER_MISMATCH …)은 DB 가 하고 여기서
 * 다시 하지 않는다. relay 는 이 결과를 받아 서버별 op 로 옮길 뿐이다(dispatcher).
 *
 * 오류 규약(29-05):
 *   - 업무 거부 = PostgREST 오류 `code === "P0001"` · `message === "<CODE>"` → `IntentError(code)`. 허용 목록 밖의 P0001 문구
 *     (apply · record 의 입력 형식 오류 등 한국어 문장)는 `IntentError("INTERNAL")` 로 접는다 — 문구를 호출자에게 흘리지 않는다.
 *   - 그 밖(네트워크 · 23514 · 23503 …)은 `safePgError` 로 로그 후 그대로 throw — 라우터가 500 으로 끝낸다(S-5).
 *
 * 로그 위생(이전 phase D-19 · T-16-45): dmaUserId · 계좌번호 · 암호문 · 오류 `details`/`hint` 를 어떤 로그 인자에도 싣지 않는다.
 * RPC 이름과 `safePgError`(code · message 200자)까지만 남긴다.
 *
 * `dma_credentials`(옛 표 · AAD = 웹 user_id) 읽기/쓰기 2종은 D-19 dual-write 전용이다 — 롤백 시 옛 relay 가 그 표를 읽는다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccountInput, AdminIntentRow, AdminOutcome, DmaBroker } from "@gh-radar/shared";

import { logger } from "../logger.js";
import { safePgError } from "../store/pg-error.js";

/** 29-05 · 29-27 RPC 가 내는 업무 거부 코드(MESSAGE) + 허용 목록 밖 P0001 을 접은 `INTERNAL`. */
export const INTENT_ERROR_CODES = [
  "NO_APP_USER",
  "DMA_USER_EXISTS",
  "NO_DMA_USER",
  "NO_SUCH_ACCOUNT",
  "LAST_ACCOUNT",
  "SERVER_BROKER_MISMATCH",
  "NO_SERVERS",
  "SERVERS_REMAIN",
  // 29-27 CR-01 — 이미 DMA 가 연결된 웹 사용자(app_users.dma_user_id)로 다시 생성. 정본 가드 = DB(20261010200000).
  "DMA_LINKED",
] as const;

export type IntentErrorCode = (typeof INTENT_ERROR_CODES)[number] | "INTERNAL";

const KNOWN = new Set<string>(INTENT_ERROR_CODES);

/** DB 업무 거부 — 라우터가 409(INTERNAL 은 500)로 옮긴다. message 에 식별자를 싣지 않는다. */
export class IntentError extends Error {
  constructor(readonly code: IntentErrorCode) {
    super(code);
    this.name = "IntentError";
  }
}

/** `dma_admin_record_results` 1행 — 서버 결과 배열 그대로(usersRev 는 싣지 않는다 · 표에 칸이 없다). */
export type IntentResultInput = { server: string; outcome: AdminOutcome; code?: number; message?: string };

type PgErrorLike = { code?: unknown; message?: unknown };

export class AdminIntentStore {
  readonly #supabase: SupabaseClient;

  constructor(deps: { supabase: SupabaseClient }) {
    this.#supabase = deps.supabase;
  }

  /** 생성 — 허용 표 이메일에 DMA 유저 + 첫 계좌 + 등록 서버를 한 트랜잭션으로. 비밀번호는 **암호문**만 받는다. */
  async createDmaUser(input: {
    email: string;
    dmaUserId: string;
    passwordEnc: string;
    account: AdminAccountInput;
    servers: string[];
  }): Promise<void> {
    await this.#rpc("dma_admin_create_dma_user", {
      p_email: input.email,
      p_dma_user_id: input.dmaUserId,
      p_password_enc: input.passwordEnc,
      p_account: input.account,
      p_servers: input.servers,
    });
  }

  /** 암호문 교체(D-08 — 열린 세션은 그대로). */
  async setPassword(dmaUserId: string, passwordEnc: string): Promise<void> {
    await this.#rpc("dma_admin_set_password", { p_dma_user_id: dmaUserId, p_password_enc: passwordEnc });
  }

  /** 계좌 upsert · 등록 서버 집합 교체(빠진 서버 = removing). */
  async putAccount(
    dmaUserId: string,
    account: AdminAccountInput,
    servers: string[],
  ): Promise<{ activated: string[]; removing: string[] }> {
    const data = (await this.#rpc("dma_admin_put_account", {
      p_dma_user_id: dmaUserId,
      p_account: account,
      p_servers: servers,
    })) as { activated?: unknown; removing?: unknown } | null;
    return { activated: stringList(data?.activated), removing: stringList(data?.removing) };
  }

  /** 계좌 제거 의도(그 계좌의 등록 행 전부 removing). 마지막 active 계좌면 `LAST_ACCOUNT`. */
  async markAccountRemoved(dmaUserId: string, broker: DmaBroker, accountNo: string): Promise<void> {
    await this.#rpc("dma_admin_mark_account_removed", {
      p_dma_user_id: dmaUserId,
      p_broker: broker,
      p_account_no: accountNo,
    });
  }

  /** 서버 반영 확인 뒤 정리 — op 4 ok(0 · 8) 계좌 · 87 에 이미 없는 removing 계좌, 또는 op 2 ok(0 · 4)면 그 서버 행 전부. */
  async settleServer(
    dmaUserId: string,
    serverKey: string,
    removedAccounts: string[],
    userRemoved: boolean,
  ): Promise<{ deletedRows: number; deletedAccounts: number }> {
    const data = (await this.#rpc("dma_admin_settle_server", {
      p_dma_user_id: dmaUserId,
      p_server_key: serverKey,
      p_removed_accounts: removedAccounts,
      p_user_removed: userRemoved,
    })) as { deletedRows?: unknown; deletedAccounts?: unknown } | null;
    return { deletedRows: Number(data?.deletedRows ?? 0), deletedAccounts: Number(data?.deletedAccounts ?? 0) };
  }

  /** DMA 유저 삭제 — 등록 행이 남았으면 `SERVERS_REMAIN`. */
  async deleteDmaUser(dmaUserId: string): Promise<void> {
    await this.#rpc("dma_admin_delete_dma_user", { p_dma_user_id: dmaUserId });
  }

  /** 의도 (계좌 × 등록 서버) 행 — planner 입력. 유저가 없으면 빈 배열. */
  async intent(dmaUserId: string): Promise<AdminIntentRow[]> {
    const data = await this.#rpc("dma_admin_intent", { p_dma_user_id: dmaUserId });
    if (data === null || data === undefined) return [];
    if (!Array.isArray(data)) throw new Error("dma_admin_intent 반환 형식 위반 — 배열이 아니다");
    return data as AdminIntentRow[];
  }

  /** 서버별 최근 결과 기록 — 기록한 행 수. */
  async recordResults(dmaUserId: string, results: readonly IntentResultInput[]): Promise<number> {
    const data = await this.#rpc("dma_admin_record_results", { p_dma_user_id: dmaUserId, p_results: results });
    return Number(data ?? 0);
  }

  /** `dma_users.password_enc`(AAD = dmaUserId). 행이 없으면 null. */
  async passwordEncOf(dmaUserId: string): Promise<string | null> {
    const { data, error } = await this.#supabase
      .from("dma_users")
      .select("password_enc")
      .eq("dma_user_id", dmaUserId)
      .maybeSingle<{ password_enc: string }>();
    if (error) {
      logger.error({ pgError: safePgError(error) }, "[admin-intent] dma_users 암호문 조회 실패");
      throw error;
    }
    return data?.password_enc ?? null;
  }

  /** D-19 dual-write — 그 DMA id 를 가진 옛 `dma_credentials` 행의 웹 user_id 목록. */
  async legacyCredentialUserIds(dmaUserId: string): Promise<string[]> {
    const { data, error } = await this.#supabase.from("dma_credentials").select("user_id").eq("dma_user_id", dmaUserId);
    if (error) {
      logger.error({ pgError: safePgError(error) }, "[admin-intent] dma_credentials 조회 실패(dual-write)");
      throw error;
    }
    return ((data ?? []) as { user_id: unknown }[])
      .map((r) => r.user_id)
      .filter((u): u is string => typeof u === "string" && u !== "");
  }

  /** D-19 dual-write — 옛 행의 암호문만 갈아 끼운다(AAD = 웹 user_id 로 만든 값을 받는다). */
  async updateLegacyCredential(userId: string, dmaUserId: string, passwordEnc: string): Promise<void> {
    const { error } = await this.#supabase
      .from("dma_credentials")
      .update({ dma_password_enc: passwordEnc })
      .eq("user_id", userId)
      .eq("dma_user_id", dmaUserId);
    if (error) {
      logger.error({ pgError: safePgError(error) }, "[admin-intent] dma_credentials 갱신 실패(dual-write)");
      throw error;
    }
  }

  /**
   * 시세 주 서버 지정(D-11 · 29-23) — relay 가 break-then-make 전환에 **성공한 뒤에만** 부른다(Express 는 DB 를 먼저 바꾸지
   * 않는다). 레지스트리 보정 실패 때는 지금 연결 서버로 되돌리는 데도 쓴다. 없는 키(P0002) · 꺼진 서버(P0001 `server disabled`)는
   * 던진다 — 호출자가 연결을 되돌린다.
   */
  async setQuotePrimary(key: string): Promise<void> {
    await this.#rpc("dma_admin_set_quote_primary", { p_key: key });
  }

  async #rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await this.#supabase.rpc(name, args);
    if (error) {
      const e = error as PgErrorLike;
      if (e.code === "P0001") {
        const code = typeof e.message === "string" && KNOWN.has(e.message) ? (e.message as IntentErrorCode) : "INTERNAL";
        if (code === "INTERNAL") logger.error({ rpc: name, pgError: safePgError(error) }, "[admin-intent] 알 수 없는 업무 거부");
        throw new IntentError(code);
      }
      logger.error({ rpc: name, pgError: safePgError(error) }, "[admin-intent] RPC 실패");
      throw error;
    }
    return data;
  }
}

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
