import axios, { isAxiosError, type AxiosAdapter, type AxiosInstance } from "axios";

/**
 * Phase 43-01 — OpenDART 공시검색(`list.json`) 클라이언트 · 오류 분류.
 *
 * - 오류는 HTTP 상태가 아니라 본문 `status` 로 가른다(OpenDART 는 오류도 HTTP 200 으로 준다). 예외 — HTTP 429 · 401 · 403
 *   (앞단 차단 신호)은 본문을 보기 전에 quota · key 로 가른다(리뷰 WR-03).
 *   `000` 정상 · `013` 조회된 데이터 없음 = **성공 · 빈 목록**(43-RESEARCH Pitfall 2 — 장애로 세지 않는다).
 * - 인증키(`crtfc_key`)는 쿼리 인자라 요청 URL · axios 요청 설정에 그대로 실린다. 그래서
 *   `DartApiError` 의 message 는 상태 · 코드만 담고, axios 오류를 `cause` 로 붙이지 않는다(붙이면 로거가
 *   config.params 를 따라 내려간다). 네트워크 오류도 여기서 `DartApiError`(transient)로 바꿔 던진다.
 * - 43-04: 분류 표 전부(`classifyDartStatus`) · 응답 없음 · 5xx · 깨진 본문 → transient ·
 *   100건 넘는 날 쪽 넘김(`PageTracker` · `fetchWatchRows` — 리서치 확인 5 · Pitfall 5).
 */

export const DART_LIST_PATH = "/api/list.json";
/** 한 쪽 최대 건수(문서 상한 100) */
export const DART_PAGE_COUNT = 100;

/** 공시검색 목록 한 행 — 응답에 실린 문자열 필드 그대로 */
export interface DartRow {
  corp_code: string;
  corp_name: string;
  /** 상장사만 값이 있다 */
  stock_code: string;
  /** Y 유가 · K 코스닥 · N 코넥스 · E 기타 */
  corp_cls: string;
  report_nm: string;
  /** 접수번호 14자리 */
  rcept_no: string;
  /** 제출인 */
  flr_nm: string;
  /** 접수일 YYYYMMDD */
  rcept_dt: string;
  rm: string;
}

export interface DartPage {
  total: number;
  totalPage: number;
  rows: DartRow[];
}

/**
 * quota = 요청 제한 초과(020) · key = 키 문제(010 · 011 · 012 · 901) · bug = 잘못된 값 · 부적절한 접근(100 · 101) ·
 * transient = 점검 · 정의되지 않은 오류 · 5xx · 네트워크(800 · 900) · unknown = 그 밖 모르는 코드
 */
export type DartErrorKind = "quota" | "key" | "bug" | "transient" | "unknown";

/** 본문 status 분류 — ok = 정상 · empty = 빈 목록(성공) · 그 밖은 오류 종류 */
export type DartStatusClass = "ok" | "empty" | DartErrorKind;

/** 43-RESEARCH 「API 계약 정리 — OpenDART」 상태 표 그대로 */
const CLASS_BY_STATUS: Readonly<Record<string, DartStatusClass>> = {
  "000": "ok",
  "013": "empty",
  "020": "quota",
  "010": "key",
  "011": "key",
  "012": "key",
  "901": "key",
  "100": "bug",
  "101": "bug",
  "800": "transient",
  "900": "transient",
};

/** 로그 한 줄이 끝없이 길어지지 않게 */
const TEXT_MAX = 200;

export function classifyDartStatus(code: string | null | undefined): DartStatusClass {
  return (code ? CLASS_BY_STATUS[code] : undefined) ?? "unknown";
}

/** 오류로 던질 때의 종류 — ok · empty 는 오류가 아니므로 여기 오면 unknown */
function errorKindOf(code: string | null | undefined): DartErrorKind {
  const c = classifyDartStatus(code);
  return c === "ok" || c === "empty" ? "unknown" : c;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v.slice(0, TEXT_MAX) : null;
}

export class DartApiError extends Error {
  readonly httpStatus: number;
  /** 본문 status(예 `020`) — 응답이 없거나 본문이 깨졌으면 null */
  readonly code: string | null;
  readonly kind: DartErrorKind;
  /** OpenDART 가 준 짧은 문구(본문 `message`) — 키 · URL 을 담지 않는다 */
  readonly description: string | null;
  /** 이 오류까지 쓴 호출 수(쪽 넘김 중 실패 — 43-04). 없으면 1 로 센다 */
  calls?: number;

  constructor(httpStatus: number, code: string | null | undefined, kind?: DartErrorKind, description?: unknown) {
    const cd = str(code);
    // message 에는 상태 · 코드만 — 요청 URL · 쿼리 인자(crtfc_key)는 넣지 않는다
    super(`DART API error status=${httpStatus} code=${cd ?? "-"}`);
    this.name = "DartApiError";
    this.httpStatus = httpStatus;
    this.code = cd;
    this.kind = kind ?? errorKindOf(cd);
    this.description = str(description);
  }
}

/**
 * 요청 하나의 전체 시간 상한. axios `timeout` 은 Node 에서 `req.setTimeout` — 소켓이 연결된 **뒤** 유휴 시간만 재서
 * DNS · TCP 연결(SYN 손실이면 OS 상한 약 127초)과 조금씩 흘러드는 응답을 끊지 못한다. 그래서 요청마다
 * `AbortSignal.timeout` 도 함께 건다(리뷰 WR-04 — 끊긴 오류는 ERR_CANCELED transient · 키를 싣지 않는 경로 그대로).
 */
export const DART_REQUEST_TIMEOUT_MS = 10_000;

/** baseURL · timeout 10초. `adapter` 는 테스트용(가짜 전송) */
export function createDartHttp(baseUrl: string, adapter?: AxiosAdapter): AxiosInstance {
  return axios.create({
    baseURL: baseUrl,
    timeout: DART_REQUEST_TIMEOUT_MS,
    ...(adapter ? { adapter } : {}),
  });
}

/**
 * 공시검색 한 쪽. 기간은 그날 하루(`bgn_de` = `end_de` = day) · 유형 하나 · 정정 전 원본 포함(`last_reprt_at: N`).
 * 성공(`000`) · 빈 목록(`013`) 밖은 전부 `DartApiError` 로 던진다 — 키는 오류 어디에도 싣지 않는다.
 */
export async function fetchListPage(
  http: AxiosInstance,
  key: string,
  q: { detailTy: string; day: string; pageNo: number },
): Promise<DartPage> {
  let res;
  try {
    res = await http.get(DART_LIST_PATH, {
      params: {
        crtfc_key: key,
        bgn_de: q.day,
        end_de: q.day,
        pblntf_detail_ty: q.detailTy,
        last_reprt_at: "N",
        page_no: q.pageNo,
        page_count: DART_PAGE_COUNT,
      },
      validateStatus: () => true,
      signal: AbortSignal.timeout(DART_REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    // 응답 없음(네트워크 · 타임아웃 · 전체 시간 상한) — axios 오류(config 에 키가 있다)는 버리고 안전한 오류로 바꾼다
    const code = isAxiosError(err) ? str(err.code) : null;
    throw new DartApiError(0, null, "transient", code ?? "network error");
  }

  // HTTP 차단 신호는 본문 분류 전에 먼저 가른다 — 앞단(게이트웨이 · WAF)이 주는 429 · 401 · 403 은 OpenDART JSON 이 아니라
  // 「깨진 본문 → 일시 장애」 로 흘러 바퀴마다 계속 두드리게 된다(공식 API 운영 기준 ④ · 리뷰 WR-03).
  // 429 → quota(한도 의심 표시 + 종료 1 → 다음 실행은 단독 탐침 1건) · 401 · 403 → key(종료 1). code 는 `HTTP 429` 꼴.
  if (res.status === 429) throw new DartApiError(429, "HTTP 429", "quota", "too many requests");
  if (res.status === 401 || res.status === 403) {
    throw new DartApiError(res.status, `HTTP ${res.status}`, "key", res.status === 401 ? "unauthorized" : "forbidden");
  }
  if (res.status === 0 || res.status >= 500) throw new DartApiError(res.status, null, "transient");
  const body = res.data as
    | { status?: unknown; message?: unknown; total_count?: unknown; total_page?: unknown; list?: unknown }
    | undefined;
  // HTML · 깨진 JSON(axios 가 문자열 그대로 넘긴다) · status 없는 본문 — 일시 장애로 본다
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.status !== "string") {
    throw new DartApiError(res.status, null, "transient", "invalid body");
  }
  const cls = classifyDartStatus(body.status);
  if (cls === "empty") return { total: 0, totalPage: 0, rows: [] };
  if (cls !== "ok") throw new DartApiError(res.status, body.status, cls, body.message);

  const rows = Array.isArray(body.list) ? (body.list as DartRow[]) : [];
  const total = toCount(body.total_count, rows.length);
  return { total, totalPage: toCount(body.total_page, Math.ceil(total / DART_PAGE_COUNT)), rows };
}

function toCount(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** 늘지 않았어도 전 쪽을 다시 읽는 주기 — 삭제 1 + 신규 1 이 같은 바퀴에 겹쳐 수가 그대로인 경우의 그물 */
export const FULL_REREAD_MS = 60_000;
/**
 * 건수가 늘어 전 쪽을 다시 읽을 때의 하한 — 마지막 전 쪽 읽기에서 이만큼 지나야 한다(리뷰 WR-03). 그래서 전 쪽 읽기는 30초에
 * 많아야 1번 → 추가 쪽 하루 상한 = 46,800 ÷ 30 × (쪽 수 − 1) = 1,560 × (쪽 수 − 1)(cadence.ts 머리 주석 · tests/cadence.test.ts).
 */
export const GREW_REREAD_MIN_MS = 30_000;

/**
 * 감시 대상(유형) 하나의 쪽 넘김 기억 — 수집기가 감시 대상마다 하나씩 둔다(43-05 buildDeps).
 * 성공한 전체 읽기 뒤에만 갱신한다 — 중간 실패면 그대로 두어 다음 바퀴가 다시 전 쪽을 읽는다.
 */
export class PageTracker {
  /** 마지막 성공한 전체 읽기 때의 total_count */
  lastTotal = 0;
  /** 마지막 성공한 전체 읽기 시각(epoch ms) — 처음엔 아주 먼 과거 */
  lastFullAt = Number.NEGATIVE_INFINITY;
}

/**
 * 오늘 · 유형 하나의 행 — 리서치 확인 5 규칙.
 *
 *   1. 매 바퀴 1쪽(100건)을 읽는다.
 *   2. `total_count ≤ 100` 이면 그날 목록 전체가 손에 있다 — 끝.
 *   3. 100 초과면 (`total_count` 가 마지막 전체 읽기 때보다 늘었고 그로부터 30초가 지났거나) 또는 60초가 지났을 때만
 *      같은 바퀴에서 2쪽 ~ `total_page` 를 마저 읽는다. 아니면 1쪽 행만 돌려준다. 늘어남은 직전 조회가 아니라 **마지막 전체
 *      읽기 때의 total** 과 견준다 — 하한 30초 때문에 건너뛴 증가도 다음 기회에 반드시 읽힌다(리뷰 WR-03 · 그 사이 2쪽 이후
 *      새 건은 최대 30초 늦게 보인다 · 1쪽은 매 조회).
 *
 * 같은 날짜 안 정렬 순서는 문서에 없다(가정 A3) — 「1쪽에 새 건이 다 있다」 에 기대지 않는다.
 * 추가 쪽 호출도 `calls` 로 세어 api_usage 에 올린다(하루 상한 1,560 × (쪽 수 − 1) — `GREW_REREAD_MIN_MS`).
 * 아침 전날 확인(`fullRead`)은 그 호출만의 새 기억이라 늘 전 쪽이다(하한과 무관).
 * 중간 실패면 던지는 `DartApiError` 의 `calls` 에 실패한 호출까지 그때까지의 호출 수를 싣는다.
 */
export async function fetchWatchRows(
  http: AxiosInstance,
  key: string,
  watch: { detailTy: string; day: string },
  tracker: PageTracker,
  nowMs: number,
): Promise<{ rows: DartRow[]; calls: number }> {
  let calls = 0;
  const page = async (pageNo: number): Promise<DartPage> => {
    calls += 1;
    try {
      return await fetchListPage(http, key, { ...watch, pageNo });
    } catch (err) {
      if (err instanceof DartApiError) err.calls = calls;
      throw err;
    }
  };

  const first = await page(1);
  if (first.total <= DART_PAGE_COUNT) {
    tracker.lastTotal = first.total;
    tracker.lastFullAt = nowMs;
    return { rows: first.rows, calls };
  }

  // lastTotal 은 마지막 전체 읽기 때의 수 — 하한으로 건너뛴 증가는 그대로 남아 30초 뒤 읽힌다
  const sinceFull = nowMs - tracker.lastFullAt;
  const grew = first.total > tracker.lastTotal && sinceFull >= GREW_REREAD_MIN_MS;
  const stale = sinceFull >= FULL_REREAD_MS;
  if (!grew && !stale) return { rows: first.rows, calls };

  const rows = [...first.rows];
  const lastPage = Math.max(first.totalPage, Math.ceil(first.total / DART_PAGE_COUNT));
  for (let no = 2; no <= lastPage; no++) rows.push(...(await page(no)).rows);
  tracker.lastTotal = first.total;
  tracker.lastFullAt = nowMs;
  return { rows, calls };
}
