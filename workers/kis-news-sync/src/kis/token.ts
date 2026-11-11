import type { AxiosInstance } from "axios";
import type { SupabaseClient } from "@supabase/supabase-js";
import { KIS_TOKEN_PATH, KisApiError } from "./client.js";

/**
 * Phase 41-13 — 한투 접근 토큰: DB 재사용 · 만료 1시간 전 재발급 · 61초 가드 · 임대 보유자만 발급.
 *
 * Pitfall 1(알림톡 폭탄 · 1분 1회): 한투는 `/oauth2/tokenP` 발급마다 사용자 휴대폰에 알림톡을 무조건 보내고,
 * 1분 안 두 번째 발급은 `EGW00133` 으로 거절한다. 그래서
 *   - 토큰은 표 `kis_access_tokens`(41-02 · 행 하나 `token_type='live'`)에서 재사용하고,
 *     남은 시간이 1시간(TOKEN_REUSE_MIN_MS) 이하일 때만 새로 받는다.
 *   - 발급은 수집 임대를 가진 실행(`canIssue`)만 한다. 임대 없는 실행은 DB 토큰이 아직 살아 있으면
 *     그것을 쓰고(경고), 없거나 만료면 오류로 끝낸다 — 발급 요청을 보내지 않는다. `force` 도 마찬가지.
 *   - 직전 발급(`fetched_at`)이 61초(TOKEN_ISSUE_GAP_MS) 안이면 `force` 여도 발급 요청을 보내지 않는다.
 *   - DB 를 못 읽으면 직전 발급 시각을 모르므로 발급하지 않는다.
 *
 * **토큰 값 · 앱키 · 시크릿은 어디에도 로그하지 않는다.** 로그에는 남은 시간 · 만료 시각 · 사유만 쓴다.
 * 시계는 인자 `now`(epoch ms)로 받는다(테스트 · 루프의 가짜 시계).
 */

export const KIS_TOKEN_TYPE = "live";
/** 남은 시간이 이보다 길면 DB 토큰 재사용 */
export const TOKEN_REUSE_MIN_MS = 3_600_000;
/** 한투 「1분당 1회 발급」 + 1초 여유 */
export const TOKEN_ISSUE_GAP_MS = 61_000;
/** 응답에 만료 시각 · expires_in 이 둘 다 없을 때 — 한투 토큰 수명 24시간(실측 expires_in 86400) */
const DEFAULT_TOKEN_LIFETIME_SEC = 86_400;
const TABLE = "kis_access_tokens";

export interface KisTokenLog {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

export interface GetKisAccessTokenArgs {
  supabase: SupabaseClient;
  http: Pick<AxiosInstance, "post">;
  appkey: string;
  appsecret: string;
  /** 수집 임대를 가진 실행만 true — false 면 발급 요청을 보내지 않는다 */
  canIssue: boolean;
  /** 토큰 무효(EGW00121 · EGW00123) 뒤 — 재사용 판정을 건너뛴다(61초 가드 · 임대 조건은 그대로) */
  force?: boolean;
  /** epoch ms */
  now: number;
  log: KisTokenLog;
}

export interface KisAccessToken {
  token: string;
  expiresAt: Date;
  /** 이번 호출에서 새로 발급했는가 */
  issued: boolean;
}

/**
 * 응답 `access_token_token_expired` `"YYYY-MM-DD HH:MM:SS"`(KST) → Date. 모양이나 값이 틀리면 null.
 */
export function parseKisExpiry(s: unknown): Date | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, se] = m.slice(1).map(Number);
  const ms = Date.UTC(y, mo - 1, d, h - 9, mi, se);
  // 13월 · 45일 · 99시처럼 넘친 값은 Date.UTC 가 다음 달 · 날로 넘기므로 되돌려 맞춰 본다
  const kst = new Date(ms + 9 * 3_600_000);
  const same =
    kst.getUTCFullYear() === y &&
    kst.getUTCMonth() === mo - 1 &&
    kst.getUTCDate() === d &&
    kst.getUTCHours() === h &&
    kst.getUTCMinutes() === mi &&
    kst.getUTCSeconds() === se;
  return same ? new Date(ms) : null;
}

interface TokenRow {
  access_token: string;
  expires_at: string;
  fetched_at: string;
}

export async function getKisAccessToken(args: GetKisAccessTokenArgs): Promise<KisAccessToken> {
  const { supabase, http, appkey, appsecret, canIssue, force = false, now, log } = args;

  const { data, error } = await supabase
    .from(TABLE)
    .select("access_token, expires_at, fetched_at")
    .eq("token_type", KIS_TOKEN_TYPE)
    .maybeSingle();
  if (error) {
    throw new Error(`kis token: ${TABLE} 읽기 실패 — 발급하지 않는다 (${pgMessage(error)})`);
  }

  const row = data as TokenRow | null;
  const cached = row
    ? {
        token: row.access_token,
        expiresAt: new Date(row.expires_at),
        fetchedAt: Date.parse(row.fetched_at),
      }
    : null;
  const remainMs = cached ? cached.expiresAt.getTime() - now : Number.NaN;

  // ① 재사용 — 남은 시간이 1시간보다 길다
  if (cached && !force && remainMs > TOKEN_REUSE_MIN_MS) {
    return { token: cached.token, expiresAt: cached.expiresAt, issued: false };
  }

  // ② 임대 없음 — 발급 요청을 보내지 않는다
  if (!canIssue) {
    if (cached && remainMs > 0) {
      log.warn({ remainMs, force }, "kis token: no lease — using DB token without issuing");
      return { token: cached.token, expiresAt: cached.expiresAt, issued: false };
    }
    throw new Error("kis token: 임대가 없어 발급할 수 없고 DB 토큰이 없거나 만료됐다");
  }

  // ③ 61초 가드 — force 여도 지킨다
  if (cached && Number.isFinite(cached.fetchedAt) && now - cached.fetchedAt < TOKEN_ISSUE_GAP_MS) {
    const agoSec = Math.round((now - cached.fetchedAt) / 1000);
    throw new Error(
      `kis token: 직전 발급 ${agoSec}초 전 — ${TOKEN_ISSUE_GAP_MS / 1000}초 가드로 발급하지 않는다`,
    );
  }

  // ④ 발급
  const reason = !cached ? "missing" : force ? "force" : remainMs > 0 ? "expiring" : "expired";
  log.info({ reason, remainMs: cached ? remainMs : null }, "kis token: issuing");
  let res;
  try {
    res = await http.post(
      KIS_TOKEN_PATH,
      { grant_type: "client_credentials", appkey, appsecret },
      { validateStatus: () => true },
    );
  } catch (err) {
    // 네트워크 · 타임아웃 — 원래 오류(요청 본문의 앱키 · 시크릿 포함)는 버리고 코드만
    const code = (err as { code?: unknown } | null)?.code;
    throw new KisApiError(0, null, typeof code === "string" ? code : "network error");
  }

  const body = (res.data && typeof res.data === "object" ? res.data : {}) as Record<string, unknown>;
  const token = typeof body.access_token === "string" && body.access_token.length > 0 ? body.access_token : null;
  if (res.status !== 200 || token === null) {
    // 발급 오류 본문은 error_code · error_description(예 EGW00133) — 일반 응답 꼴(msg_cd · msg1)도 받는다
    throw new KisApiError(
      res.status,
      strOrNull(body.error_code) ?? strOrNull(body.msg_cd),
      strOrNull(body.error_description) ?? strOrNull(body.msg1),
    );
  }

  const expiresInSec = Number(body.expires_in);
  const expiresAt =
    parseKisExpiry(body.access_token_token_expired) ??
    new Date(now + (Number.isFinite(expiresInSec) && expiresInSec > 0 ? expiresInSec : DEFAULT_TOKEN_LIFETIME_SEC) * 1000);

  const { error: upsertError } = await supabase.from(TABLE).upsert(
    {
      token_type: KIS_TOKEN_TYPE,
      access_token: token,
      expires_at: expiresAt.toISOString(),
      fetched_at: new Date(now).toISOString(),
    },
    { onConflict: "token_type" },
  );
  if (upsertError) {
    // 다음 실행이 다시 발급하게 되지만(6시간 안이면 한투가 같은 토큰을 준다) 이번 실행은 새 토큰으로 계속
    log.warn({ err: pgMessage(upsertError) }, "kis token: DB save failed — continuing with issued token");
  }
  log.info({ expiresAt: expiresAt.toISOString() }, "kis token: issued");
  return { token, expiresAt, issued: true };
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** PostgREST 오류에서 code · message 만 — details 는 「Failing row contains (...)」 처럼 행 값을 담을 수 있다 */
function pgMessage(e: unknown): string {
  const o = (e ?? {}) as { code?: unknown; message?: unknown };
  const code = typeof o.code === "string" ? `${o.code} ` : "";
  return `${code}${typeof o.message === "string" ? o.message : "unknown"}`.slice(0, 200);
}
