import type { AxiosInstance } from "axios";

export interface NaverNewsItem {
  title: string;
  originallink: string;
  link: string;
  description: string;
  pubDate: string;
}

/** 네이버 오픈 API JSON 오류 본문의 필드 (errorCode · errorMessage). */
export interface NaverErrorDetail {
  errorCode?: string;
  errorMessage?: string;
}

function withDetail(base: string, detail: NaverErrorDetail): string {
  const parts: string[] = [];
  if (detail.errorCode !== undefined) parts.push(`errorCode=${detail.errorCode}`);
  if (detail.errorMessage !== undefined) parts.push(`errorMessage=${detail.errorMessage}`);
  return parts.length > 0 ? `${base} ${parts.join(" ")})` : `${base})`;
}

export class NaverAuthError extends Error {
  constructor() {
    super("Naver auth failed");
    this.name = "NaverAuthError";
  }
}

/**
 * Phase 07.2: Naver Search API 순간 rate-limit (HTTP 429).
 * NaverBudgetExhaustedError (일일 quota exhausted) 와 **분리**된 클래스.
 * per-stock 수준에서 exponential backoff retry 후 최종 실패 시 해당 종목만 skip.
 * cycle 전체는 계속 진행 (stopAll 미발동) — 단, index.ts 의 연속 429 휴리스틱이 보완한다.
 * quick-260915-h3p: 응답 본문의 errorCode/errorMessage 를 보존한다(원문 로깅용).
 */
export class NaverRateLimitError extends Error {
  readonly errorCode?: string;
  readonly errorMessage?: string;
  constructor(detail: NaverErrorDetail = {}) {
    super(withDetail("Naver rate-limited (HTTP 429", detail));
    this.name = "NaverRateLimitError";
    this.errorCode = detail.errorCode;
    this.errorMessage = detail.errorMessage;
  }
}

/** 네이버 일일 호출 한도 소진 (HTTP 429 + 소진 본문). run 즉시 중단 대상. */
export class NaverBudgetExhaustedError extends Error {
  readonly errorCode?: string;
  readonly errorMessage?: string;
  constructor(detail: NaverErrorDetail = {}) {
    super(withDetail("Naver daily query quota exhausted (HTTP 429", detail));
    this.name = "NaverBudgetExhaustedError";
    this.errorCode = detail.errorCode;
    this.errorMessage = detail.errorMessage;
  }
}

export class NaverBadRequestError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "NaverBadRequestError";
  }
}

/**
 * R7: Naver Search API `display` 파라미터 최대값. 페이지당 최대 100 건.
 */
export const NAVER_MAX_DISPLAY = 100;

/**
 * R7: Naver Search API `start` 파라미터 하드 상한. 초과 시 400 반환.
 */
export const NAVER_MAX_START = 1000;

const MAX_ERROR_TEXT = 200;

function pickDetail(obj: Record<string, unknown>): NaverErrorDetail {
  const out: NaverErrorDetail = {};
  const code = obj.errorCode;
  if (typeof code === "string" || typeof code === "number") {
    out.errorCode = String(code);
  }
  const msg = obj.errorMessage;
  if (typeof msg === "string") out.errorMessage = msg.slice(0, MAX_ERROR_TEXT);
  return out;
}

/**
 * 429 응답 본문(axios response.data) → {errorCode?, errorMessage?}.
 * 객체면 필드를 그대로 읽고, 문자열이면 JSON.parse 를 시도하며 실패하면 원문(최대 200자)을
 * errorMessage 로 둔다. 외부 입력이므로 어떤 형태여도 throw 하지 않는다.
 */
export function extractNaverError(data: unknown): NaverErrorDetail {
  if (typeof data === "string") {
    try {
      const parsed: unknown = JSON.parse(data);
      if (parsed !== null && typeof parsed === "object") {
        return pickDetail(parsed as Record<string, unknown>);
      }
    } catch {
      // 비 JSON 본문 — 아래에서 원문으로 보존
    }
    return data.length > 0 ? { errorMessage: data.slice(0, MAX_ERROR_TEXT) } : {};
  }
  if (data !== null && typeof data === "object") {
    return pickDetail(data as Record<string, unknown>);
  }
  return {};
}

/**
 * 일일 한도 소진 판정: errorCode "010" 또는 errorMessage 에 (대소문자 무시) "query limit exceeded".
 *
 * 근거: 네이버 공식 오류 코드 문서(developers.naver.com/docs/common/openapiguide/errorcode.md)는
 * 429 를 "오픈 API 호출 시 일 허용량 초과" 로만 적고 errorCode 값은 명시하지 않는다.
 * 010/"Query limit exceeded"(일일) 와 012/"Rate limit exceeded"(초당) 는 커뮤니티 관측 형태다 [ASSUMED].
 * 초당 제한 429 도 실재한다(2026-09-15 동분 중복 발화 429 가 당일 회복됨) — 그래서 본문으로 구분한다.
 * 미확인 본문은 초당 제한으로 취급하고, index.ts 의 연속 429 휴리스틱이 보완한다.
 */
export function isDailyQuotaExhausted(detail: NaverErrorDetail): boolean {
  if (detail.errorCode === "010") return true;
  return /query limit exceeded/i.test(detail.errorMessage ?? "");
}

/**
 * Phase 07 — 단일 page 호출. page loop 은 `collectStockNews` 가 담당 (R7).
 *
 * Error mapping:
 *  - 401 → NaverAuthError (retry 안 함 — secret 만료/오타)
 *  - 429 + 소진 본문 → NaverBudgetExhaustedError (retry 안 함 — run 즉시 중단, quick-260915-h3p)
 *  - 429 그 외 → NaverRateLimitError (Phase 07.2 — per-stock backoff retry, cycle 은 계속)
 *  - 400/403 → NaverBadRequestError (per-stock skip — query 특성)
 *  - 5xx/네트워크 → 1회 재시도 후 propagate
 */
export async function searchNews(
  client: AxiosInstance,
  query: string,
  opts: { start?: number; display?: number } = {},
): Promise<NaverNewsItem[]> {
  const start = opts.start ?? 1;
  const display = opts.display ?? NAVER_MAX_DISPLAY;
  const params = { query, display, sort: "date", start };
  try {
    const res = await client.get<{ items: NaverNewsItem[] }>(
      "/v1/search/news.json",
      { params },
    );
    return res.data.items ?? [];
  } catch (err: unknown) {
    const status =
      typeof err === "object" && err !== null && "response" in err
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ((err as any).response?.status as number | undefined)
        : undefined;
    if (status === 401) throw new NaverAuthError();
    if (status === 429) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = extractNaverError((err as any)?.response?.data);
      if (isDailyQuotaExhausted(detail)) throw new NaverBudgetExhaustedError(detail);
      throw new NaverRateLimitError(detail);
    }
    if (status === 400 || status === 403) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msg = (err as any)?.response?.data?.errorMessage ?? "bad request";
      throw new NaverBadRequestError(String(msg));
    }
    if (status === undefined || status >= 500) {
      await new Promise((r) => setTimeout(r, 1000));
      const res2 = await client.get<{ items: NaverNewsItem[] }>(
        "/v1/search/news.json",
        { params },
      );
      return res2.data.items ?? [];
    }
    throw err;
  }
}
