import axios, { isAxiosError, type AxiosAdapter, type AxiosInstance } from "axios";

/**
 * Phase 43-01 — OpenDART 공시검색(`list.json`) 클라이언트 · 오류 분류.
 *
 * - 오류는 HTTP 상태가 아니라 본문 `status` 로 가른다(OpenDART 는 오류도 HTTP 200 으로 준다).
 *   `000` 정상 · `013` 조회된 데이터 없음 = **성공 · 빈 목록**(43-RESEARCH Pitfall 2 — 장애로 세지 않는다).
 * - 인증키(`crtfc_key`)는 쿼리 인자라 요청 URL · axios 요청 설정에 그대로 실린다. 그래서
 *   `DartApiError` 의 message 는 상태 · 코드만 담고, axios 오류를 `cause` 로 붙이지 않는다(붙이면 로거가
 *   config.params 를 따라 내려간다). 네트워크 오류도 여기서 `DartApiError`(transient)로 바꿔 던진다.
 * - 분류 표 전부 · 쪽 넘김(`PageTracker` · `fetchWatchRows`)은 43-04 가 채운다.
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

const KIND_BY_STATUS: Readonly<Record<string, DartErrorKind>> = {
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

export function classifyDartStatus(code: string | null | undefined): DartErrorKind {
  return (code ? KIND_BY_STATUS[code] : undefined) ?? "unknown";
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
    this.kind = kind ?? classifyDartStatus(cd);
    this.description = str(description);
  }
}

/** baseURL · timeout 10초. `adapter` 는 테스트용(가짜 전송) */
export function createDartHttp(baseUrl: string, adapter?: AxiosAdapter): AxiosInstance {
  return axios.create({
    baseURL: baseUrl,
    timeout: 10_000,
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
    });
  } catch (err) {
    // 응답 없음(네트워크 · 타임아웃) — axios 오류(config 에 키가 있다)는 버리고 안전한 오류로 바꾼다
    const code = isAxiosError(err) ? str(err.code) : null;
    throw new DartApiError(0, null, "transient", code ?? "network error");
  }

  const body = res.data as
    | { status?: unknown; message?: unknown; total_count?: unknown; total_page?: unknown; list?: unknown }
    | undefined;
  if (res.status >= 500) throw new DartApiError(res.status, null, "transient");
  if (!body || typeof body !== "object") throw new DartApiError(res.status, null, "transient", "invalid body");
  if (body.status === "013") return { total: 0, totalPage: 0, rows: [] };
  if (body.status !== "000") {
    const code = typeof body.status === "string" ? body.status : null;
    throw new DartApiError(res.status, code, undefined, body.message);
  }
  return {
    total: Number(body.total_count ?? 0),
    totalPage: Number(body.total_page ?? 0),
    rows: Array.isArray(body.list) ? (body.list as DartRow[]) : [],
  };
}
