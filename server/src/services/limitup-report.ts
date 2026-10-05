import type { SupabaseClient } from "@supabase/supabase-js";
import type { LimitupGridUrlsResponse, LimitupReportResponse } from "@gh-radar/shared";

import { ApiError } from "../errors.js";

/**
 * Phase 28 Plan 10 — 상한가 보고서 **조회 전용** 서비스 (D-10 · D-11 · D-15 · D-17).
 *
 * 서비스롤 `SupabaseClient` 를 인자로 받는 순수 함수 모듈(`dma-orders.ts` 규약).
 *
 * ── 방어선 ──────────────────────────────────────────────────
 *   D-10     게이트는 RPC 안의 `dma_visible_accounts(p_user_id)` 존재 검사가 정본이다(작업대 tradingVisible 과 같은
 *            「DMA 매핑 사용자」 판정). RPC 가 `{access:false}` 를 주면 403 `DMA_UNMAPPED` — 웹은 `DmaGate` 로 바꾼다.
 *   T-19-17  인증된 `userId` 하나만 RPC 에 넘긴다(라우트가 requireAuth 로 확정한 값).
 *   T-19-01  두 RPC 의 EXECUTE 는 service_role 전용(anon · authenticated 명시 REVOKE).
 *   T-15-07  DB · Storage 오류 원문은 응답에 싣지 않는다(고정 문구 DB_ERROR). 원문은 `cause` 로 실어 errorHandler 가
 *            warn 로그에만 남긴다(WR-B03 — 57014 timeout · 42883 함수 없음 같은 원인을 운영자가 볼 수 있게).
 *
 * ★ Cloud Run → Supabase 왕복이 지연을 지배하므로 보고서 = RPC **1회**(jsonb 스칼라 — max_rows 무관),
 *   격자 = 게이트 RPC 1회 + `createSignedUrls` **1회**.
 */

const DbError = (msg: string, cause: unknown) => new ApiError(500, "DB_ERROR", msg, cause);

/** PostgREST · Storage 오류에서 로그에 남길 필드만 — 객체 통째로 싣지 않는다. */
const causeOf = (e: { message?: string; code?: string; details?: string | null; hint?: string | null }) => ({
  code: e.code,
  message: e.message,
  details: e.details ?? undefined,
  hint: e.hint ?? undefined,
});
/** 응답 모양 위반 — 무엇이 왔는지(타입)만. */
const shapeCause = (what: string, v: unknown) => ({
  reason: `${what} 모양 위반`,
  type: Array.isArray(v) ? "array" : v === null ? "null" : typeof v,
});
const DmaUnmapped = () => new ApiError(403, "DMA_UNMAPPED", "DMA 계정이 연결되지 않았습니다.");

/** 비공개 버킷 · 객체 경로 `grid/<D>/<isin>.json.gz`(28-06 적재 워커가 올린다). */
export const LIMITUP_GRID_BUCKET = "limitup-grid";
/** 서명 URL 수명(초) — 웹은 만료 전까지 캐시하고 실패 시 「다시 시도」 로 새로 받는다. */
export const LIMITUP_GRID_URL_TTL_S = 600;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * 보고서 한 장. `d` 생략 = 최신 적재 날짜. 적재 안 된 날짜는 200 `loaded:false`(빈 상태) 그대로 돌려준다.
 * 행은 RPC 가 `to_jsonb(row)` 로 실은 export 열 이름 그대로라 매퍼가 없다.
 */
export async function getLimitupReport(
  supabase: SupabaseClient,
  userId: string,
  d?: string,
): Promise<LimitupReportResponse> {
  const { data, error } = await supabase.rpc("limitup_report_for_user", {
    p_user_id: userId,
    p_date: d ?? null,
  });
  if (error) throw DbError("상한가 보고서 조회에 실패했습니다.", causeOf(error));
  if (!isObject(data)) throw DbError("상한가 보고서 조회에 실패했습니다.", shapeCause("limitup_report_for_user", data));
  if (data.access !== true) throw DmaUnmapped();
  return data as unknown as LimitupReportResponse;
}

/** 그날 격자 서명 URL 전부 — `{ [isin]: url }`. 서명이 실패한 항목(객체 없음 등)은 빠진다. */
export async function getLimitupGridUrls(
  supabase: SupabaseClient,
  userId: string,
  d: string,
): Promise<LimitupGridUrlsResponse> {
  const { data, error } = await supabase.rpc("limitup_grid_isins_for_user", {
    p_user_id: userId,
    p_date: d,
  });
  if (error) throw DbError("상한가 격자 조회에 실패했습니다.", causeOf(error));
  if (!isObject(data)) throw DbError("상한가 격자 조회에 실패했습니다.", shapeCause("limitup_grid_isins_for_user", data));
  if (data.access !== true) throw DmaUnmapped();
  const isins = data.isins;
  if (!Array.isArray(isins) || !isins.every((x) => typeof x === "string")) {
    throw DbError("상한가 격자 조회에 실패했습니다.", shapeCause("limitup_grid_isins_for_user.isins", isins));
  }

  const urls: Record<string, string> = {};
  if (isins.length > 0) {
    const byPath = new Map<string, string>(isins.map((isin) => [`grid/${d}/${isin}.json.gz`, isin]));
    const signed = await supabase.storage
      .from(LIMITUP_GRID_BUCKET)
      .createSignedUrls([...byPath.keys()], LIMITUP_GRID_URL_TTL_S);
    if (signed.error || !Array.isArray(signed.data)) {
      throw DbError(
        "상한가 격자 주소 발급에 실패했습니다.",
        signed.error ? { storage: signed.error.message, count: byPath.size } : shapeCause("createSignedUrls", signed.data),
      );
    }
    for (const item of signed.data) {
      const isin = item.path ? byPath.get(item.path) : undefined;
      if (isin && !item.error && item.signedUrl) urls[isin] = item.signedUrl;
    }
  }
  return { date: d, expiresIn: LIMITUP_GRID_URL_TTL_S, urls };
}
