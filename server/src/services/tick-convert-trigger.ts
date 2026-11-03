import { logger } from "../logger.js";

/**
 * Phase 37 D-03 — 요청 변환 트리거: Cloud Run Admin API v2 `jobs:run` + overrides 로 변환 Job(`gh-radar-tick-convert`)을
 * 그 (날짜, 거래소) 인자로 한 번 깨운다. 부르는 쪽은 `services/ticks.ts requestTickConvert` 하나 — RPC 가
 * `should_trigger: true` 를 준 호출에서만 부른다(사용자 N 명이 같은 (날짜, 거래소)를 요청해도 Job 실행 1회).
 *
 * ── 계약 ──────────────────────────────────────────────────────────
 *   요청   POST `https://run.googleapis.com/v2/<job>:run` · `Authorization: Bearer <메타데이터 서버 토큰>`
 *          본문 `{overrides: {containerOverrides: [{args: ["request","--date",D,"--ex",EX]}], taskCount: 1, timeout: "1200s"}}`
 *          — args 는 Job 컨테이너 인자를 통째로 바꾼다(Job 기본 인자 = nightly). 대상 isin 은 인자로 넘기지 않는다:
 *            Job 이 `tick_request_claim(D, EX)` 로 그 (날짜, 거래소) pending 전부를 가져간다(37-04 · Pitfall 10).
 *   권한   server 실행 SA 에 그 Job 단위 `run.jobs.runWithOverrides`(Job 단위 IAM — 37-18 deploy 스크립트가 준다).
 *          프로젝트 단위 run.developer 를 주지 않는다.
 *   상한   `TICK_REQUEST_TIMEOUT = "1200s"` — 요청 실행 하나의 상한(Job 기본 3600s 는 nightly 용). 37-04 의 running 회수
 *          25분(= 1200s + 5분 여유)이 이 값을 전제로 한다 — 하나를 바꾸면 다른 하나도 바꾼다.
 *   결과   **throw 하지 않는다** — `{ok:true, execution}` 또는 `{ok:false, status, error}`. status 0 = Admin API 에 닿지 못함
 *          (네트워크 · 타임아웃 · 토큰 실패 — relay-admin-client 의 status 0 규약과 같다). 2xx 의 본문은 장기 실행 Operation 이라
 *          실행 이름은 `metadata.name`(없으면 `name`).
 *   타임아웃 기본 10초(AbortController) — 브라우저가 convert 응답을 기다리는 동안 Cloud Run 요청을 오래 붙잡지 않는다.
 *
 * ── 로그 위생 ──────────────────────────────────────────────────────
 *   토큰 · Authorization 헤더 · 요청 객체를 로그에 넣지 않는다. 남기는 것은 job · 날짜 · 거래소 · status · 응답 본문 앞 200자뿐.
 */

/** 요청 변환 실행 하나의 상한 — 37-04 running 회수 25분(= 이 값 + 5분)의 근거. */
export const TICK_REQUEST_TIMEOUT = "1200s";

const METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
/** 만료 이 초 전부터는 캐시를 버리고 새로 받는다. */
const TOKEN_SKEW_S = 60;
const TOKEN_TIMEOUT_MS = 5_000;
const ERR_SNIPPET = 200;

let tokenCache: { token: string; expiresAt: number } | null = null;

/** 테스트 전용 — 모듈 토큰 캐시를 비운다. */
export function resetMetadataTokenCache(): void {
  tokenCache = null;
}

/**
 * 메타데이터 서버에서 실행 SA 의 액세스 토큰을 받는다(Cloud Run 안에서만 닿는다). `expires_in − 60초` 까지 모듈 캐시.
 * 실패는 throw — 메시지에 토큰 원문을 싣지 않는다(트리거가 받아 status 0 으로 접는다).
 */
export async function metadataAccessToken(fetchImpl: typeof fetch = fetch): Promise<string> {
  const now = Date.now();
  if (tokenCache && now < tokenCache.expiresAt) return tokenCache.token;

  const res = await fetchImpl(METADATA_TOKEN_URL, {
    headers: { "Metadata-Flavor": "Google" },
    signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`metadata token HTTP ${res.status}`);
  const body = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== "string" || body.access_token === "") {
    throw new Error("metadata token 응답에 access_token 이 없다");
  }
  const ttl = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : 0;
  tokenCache = { token: body.access_token, expiresAt: now + Math.max(0, ttl - TOKEN_SKEW_S) * 1000 };
  return body.access_token;
}

export type TickConvertRunResult = { ok: true; execution: string | null } | { ok: false; status: number; error: string };

/**
 * 응답을 기다리다 끊은 실패의 error 값(status 0). Admin API 가 실행을 이미 만들었을 수 있다 — 호출자는 이 경우
 * 되돌리지 않는다(IN-31 · services/ticks.ts requestTickConvert).
 */
export const TRIGGER_TIMEOUT = "TIMEOUT";

/** 실행이 시작됐는지 모르는 실패인가(타임아웃). */
export function isAmbiguousTriggerFailure(r: TickConvertRunResult): boolean {
  return !r.ok && r.status === 0 && r.error === TRIGGER_TIMEOUT;
}

export interface TickConvertTrigger {
  run(date: string, ex: "KRX" | "NXT"): Promise<TickConvertRunResult>;
}

export function createTickConvertTrigger(opts: {
  /** `projects/<p>/locations/<r>/jobs/<j>` — config 가 형식을 검증한다. */
  job: string;
  fetchImpl?: typeof fetch;
  tokenFn?: () => Promise<string>;
  timeoutMs?: number;
}): TickConvertTrigger {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const tokenFn = opts.tokenFn ?? (() => metadataAccessToken(fetchImpl));
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const url = `https://run.googleapis.com/v2/${opts.job}:run`;

  return {
    async run(date, ex) {
      const ctx = { job: opts.job, date, ex };
      let token: string;
      try {
        token = await tokenFn();
      } catch (e) {
        const error = `TOKEN: ${e instanceof Error ? e.message : String(e)}`.slice(0, ERR_SNIPPET);
        logger.warn({ ...ctx, status: 0, error }, "tick convert trigger: 토큰 실패");
        return { ok: false, status: 0, error };
      }

      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      try {
        const res = await fetchImpl(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            overrides: {
              containerOverrides: [{ args: ["request", "--date", date, "--ex", ex] }],
              taskCount: 1,
              timeout: TICK_REQUEST_TIMEOUT,
            },
          }),
          signal: ac.signal,
        });
        const text = await res.text().catch(() => "");
        if (!res.ok) {
          const error = text.slice(0, ERR_SNIPPET);
          logger.warn({ ...ctx, status: res.status, error }, "tick convert trigger: Admin API 거부");
          return { ok: false, status: res.status, error };
        }
        let execution: string | null = null;
        try {
          const op = JSON.parse(text) as { name?: unknown; metadata?: { name?: unknown } };
          const n = op.metadata?.name ?? op.name;
          execution = typeof n === "string" ? n : null;
        } catch {
          execution = null;
        }
        logger.info({ ...ctx, execution }, "tick convert trigger: Job 실행");
        return { ok: true, execution };
      } catch (e) {
        const aborted = ac.signal.aborted;
        const error = aborted ? TRIGGER_TIMEOUT : `${e instanceof Error ? e.message : String(e)}`.slice(0, ERR_SNIPPET);
        logger.warn({ ...ctx, status: 0, error }, "tick convert trigger: Admin API 에 닿지 못함");
        return { ok: false, status: 0, error };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
