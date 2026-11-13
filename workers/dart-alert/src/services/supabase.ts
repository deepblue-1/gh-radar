import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DartAlertConfig } from "../config";

/**
 * Phase 43-03 — dart-alert 는 서비스롤 키로 Supabase 클라이언트를 만든다.
 * 새 표(`dart_alert*`)는 RLS 켜고 정책 0 · RPC 는 service_role 에만 EXECUTE(43-02) — 서비스롤이어야
 * 넣기 · 임대 · 차례 · 기록이 동작한다. 세션은 저장하지 않는다(워커).
 *
 * 요청마다 전체 시간 상한(`DB_REQUEST_TIMEOUT_MS`)을 건다(리뷰 WR-04) — 기본 fetch(undici)는 응답 머리를 최대 300초
 * 기다려, DB 가 멈추면 임대 연장 호출 자체가 걸려 「연장 확인 못 하면 60초 안에 스스로 멈춤」(collector `lease_unconfirmed`)
 * 판정이 돌지 않는다. 끊긴 요청은 supabase-js 가 `{ error }` 로 돌려주고 db.ts 가 `DbError` 로 바꾼다(요청 정보 없음).
 */

/** Supabase 요청 하나의 전체 시간 상한(연결 · 응답 머리 · 본문 포함) */
export const DB_REQUEST_TIMEOUT_MS = 10_000;

type Fetch = typeof fetch;

/** 요청마다 `AbortSignal.timeout(ms)` 를 거는 fetch — 부르는 쪽 signal 이 있으면 둘 중 먼저 끊긴 쪽으로 */
export function fetchWithTimeout(ms: number, base: Fetch = fetch): Fetch {
  return (input, init) => {
    const timeout = AbortSignal.timeout(ms);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return base(input, { ...init, signal });
  };
}

export function createSupabaseClient(
  cfg: Pick<DartAlertConfig, "supabaseUrl" | "supabaseServiceRoleKey">,
  /** 테스트용 — 기본 전역 fetch · `DB_REQUEST_TIMEOUT_MS` */
  opts: { fetch?: Fetch; timeoutMs?: number } = {},
): SupabaseClient {
  return createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchWithTimeout(opts.timeoutMs ?? DB_REQUEST_TIMEOUT_MS, opts.fetch) },
  });
}
