import type { AxiosInstance } from "axios";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "../config.js";
import { createKiwoomClient } from "../kiwoom/client.js";
import { getKiwoomToken } from "../kiwoom/tokenStore.js";
import { logger } from "../logger.js";

/**
 * server 측 키움 runtime — Phase 09.1 D-17/D-18.
 *
 * 부팅 시 1회 토큰 발급 (sanity check) + axios client 생성.
 * 매 inquirePrice 호출 시 getToken() 재호출 — getKiwoomToken 가 캐시 hit 시
 * Supabase SELECT 한 번만 하고 axios 미호출. 만료 5분 전이면 자동 refresh.
 * (Plan 04/05 의 stateless pattern mirror)
 */
export type KiwoomRuntime = {
  client: AxiosInstance;
  getToken: () => Promise<string>;
};

export async function createKiwoomRuntime(
  config: AppConfig,
  supabase: SupabaseClient,
): Promise<KiwoomRuntime> {
  // 부팅 시 sanity check — 토큰 발급 시도
  const initial = await getKiwoomToken(supabase, config);
  logger.info(
    {
      tokenLen: initial.accessToken.length,
      expiresAt: initial.expiresAt.toISOString(),
    },
    "Kiwoom runtime ready",
  );

  const client = createKiwoomClient(config.kiwoomBaseUrl);

  // 매 요청 시 토큰 재조회 (캐시 hit 시 axios 미호출, 만료 임박 시 refresh)
  const getToken = async (): Promise<string> => {
    const t = await getKiwoomToken(supabase, config);
    return t.accessToken;
  };

  return { client, getToken };
}
