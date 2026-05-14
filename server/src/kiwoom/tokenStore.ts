import axios from "axios";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../logger.js";

const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 만료 5분 전 refresh (D-27)

export type KiwoomToken = {
  accessToken: string;
  expiresAt: Date;
};

export type KiwoomTokenConfig = {
  kiwoomBaseUrl: string;
  kiwoomAppkey: string;
  kiwoomSecretkey: string;
  kiwoomTokenType?: string;
};

/**
 * 키움 OAuth2 token 발급 + Supabase kiwoom_tokens cache.
 * Phase 09.1 D-19/D-26/D-27 — worker (Plan 04) 와 동일 row 공유.
 *
 * race condition idempotent — upsert onConflict=token_type DO UPDATE.
 * worker + server 가 동일 row 사용, 만료 임박 시 먼저 refresh 한 쪽 새 토큰을 INSERT.
 *
 * Flow:
 *   1. SELECT from kiwoom_tokens (token_type)
 *   2. 만료 5분+ 남으면 그대로 재사용 (axios 미호출)
 *   3. 만료 임박 or 캐시 부재 → POST /oauth2/token → upsert
 */
export async function getKiwoomToken(
  supabase: SupabaseClient,
  config: KiwoomTokenConfig,
): Promise<KiwoomToken> {
  const tokenType = config.kiwoomTokenType ?? "live";

  // 1. 캐시 확인
  const { data: cached } = await supabase
    .from("kiwoom_tokens")
    .select("access_token, expires_at")
    .eq("token_type", tokenType)
    .maybeSingle();

  if (cached) {
    const expiresAt = new Date(cached.expires_at);
    const remainMs = expiresAt.getTime() - Date.now();
    if (remainMs > TOKEN_REFRESH_THRESHOLD_MS) {
      logger.info({ remainMs }, "reusing cached Kiwoom token");
      return { accessToken: cached.access_token, expiresAt };
    }
    logger.info({ remainMs }, "Kiwoom token expiring soon — refreshing");
  } else {
    logger.info("Kiwoom token cache empty — issuing new token");
  }

  // 2. 새 토큰 발급
  const res = await axios.post(
    `${config.kiwoomBaseUrl}/oauth2/token`,
    {
      grant_type: "client_credentials",
      appkey: config.kiwoomAppkey,
      secretkey: config.kiwoomSecretkey,
    },
    {
      timeout: 10_000,
      headers: { "content-type": "application/json;charset=utf-8" },
    },
  );

  if (res.data.return_code !== 0) {
    throw new Error(`Kiwoom OAuth issue failed: ${res.data.return_msg}`);
  }

  const accessToken: string = res.data.token;
  const expiresAt = parseKiwoomExpiresDt(res.data.expires_dt);

  // 3. UPSERT (race condition idempotent — 마지막 INSERT 승)
  const { error } = await supabase
    .from("kiwoom_tokens")
    .upsert(
      {
        token_type: tokenType,
        access_token: accessToken,
        expires_at: expiresAt.toISOString(),
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "token_type" },
    );

  if (error) {
    logger.warn(
      { error },
      "kiwoom_tokens upsert failed, continuing with fresh token",
    );
  }

  return { accessToken, expiresAt };
}

/**
 * 키움 expires_dt 형식 — "YYYYMMDDhhmmss" KST → Date (UTC).
 * 예: "20260515093013" → 2026-05-15 09:30:13 KST → 2026-05-15 00:30:13 UTC
 */
export function parseKiwoomExpiresDt(s: string): Date {
  if (!/^\d{14}$/.test(s)) throw new Error(`Invalid expires_dt: ${s}`);
  const y = Number(s.slice(0, 4));
  const mo = Number(s.slice(4, 6)) - 1;
  const d = Number(s.slice(6, 8));
  const h = Number(s.slice(8, 10));
  const mi = Number(s.slice(10, 12));
  const se = Number(s.slice(12, 14));
  return new Date(Date.UTC(y, mo, d, h - 9, mi, se));
}
