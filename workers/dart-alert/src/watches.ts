import type { DartRow } from "./dart/client";

/**
 * Phase 43-01 · 43-09 — 감시 대상 목록(설정값) · 시장 거르기 · 행 판정.
 *
 * - 감시 대상 = 조회 인자(유형 코드 하나)와 거르기 규칙을 담은 데이터. 바퀴는 목록을 순서대로 돈다.
 * - D-01: 공개매수(`D004`)는 보고서 이름으로 거르지 않는다(`kinds: null`) — 신고서 · 설명서 · 의견표명서 ·
 *   결과보고서 · 정정 전부 보낸다.
 * - D-05: 상장 주식만 — `corp_cls` 가 Y(유가) · K(코스닥)이고 종목코드가 6자리. 비상장(E) · 코넥스(N)는
 *   넣지도 보내지도 않는다. 스팩은 K 라 그대로 통과.
 * - 43-09 — 주요사항보고서(`B001`) 감시 대상(D-03 · D-04): 정정 꼬리표(`[기재정정]` 등)를 떼고
 *   「주요사항보고서(종류)」 괄호 안 종류명이 허용 목록(설정값 `kinds`)과 **완전히 같을 때만** 보낸다. 글자 포함 규칙은
 *   「유무상증자결정」 을 놓친다(유-무-상-증-자 ⊅ 유상증자 · RESEARCH 확인 1). 목록 밖인데 「증자」 · 「합병」 이 든 이름은
 *   보내지 않고 `near_miss`(수집기가 종류명마다 실행당 1번 warn — 새 표기를 사람이 보고 목록에 더한다).
 * - 판정은 비교용 정리본으로만 한다. 표시는 DART 원문 `report_nm` 그대로(D-07).
 */

export type WatchId = "tender_offer" | "rights_merger";

export interface Watch {
  id: WatchId;
  /** list.json `pblntf_detail_ty` — 유형 하나 */
  pblntfDetailTy: "D004" | "B001";
  /** 송신 우선순위(작을수록 먼저) — DB `priority` */
  priority: number;
  /** null = 보고서 이름으로 거르지 않음(D-01). 배열 = 허용 종류명(괄호 안 종류명 완전 일치) */
  kinds: readonly string[] | null;
  /** 알림 첫 줄에 제출인을 항상 붙이나(공개매수 = 공개매수자가 대상회사와 다르다) */
  alwaysShowFiler: boolean;
}

/** D-04 주요사항보고서 허용 종류명 기본값(괄호 안 종류명 완전 일치) */
export const DEFAULT_B001_KINDS: readonly string[] = ["유상증자결정", "유무상증자결정", "회사합병결정", "회사분할합병결정"];

/** D-05 상장 주식 시장 — Y 유가증권 · K 코스닥 */
export const ALLOWED_CORP_CLS: ReadonlySet<string> = new Set(["Y", "K"]);
/** 상장 종목코드 6자리(영문 대문자 포함 신형 코드 허용) */
export const STOCK_CODE_RE = /^[0-9A-Z]{6}$/;
const RCEPT_NO_RE = /^[0-9]{14}$/;

export interface JudgeOptions {
  /** 주요사항보고서 정정 공시를 보낼지 — 공개매수 정정은 이 값과 무관하게 보낸다(D-01) */
  b001Corrections: "include" | "exclude";
}

/**
 * D-04 가 이름으로 **알리지 않기로 정한** 종류 — 허용 목록 밖이면 근접 불일치 warn 없이 조용히 `kind`.
 * 「무상증자결정」 은 「증자」 글자를 품지만 이미 아는 제외 종류라 사람이 볼 새 표기가 아니다.
 * (허용 목록에 더하면 그쪽이 먼저라 send 다.)
 */
export const KNOWN_EXCLUDED_B001_KINDS: ReadonlySet<string> = new Set([
  "무상증자결정",
  "회사분할결정",
  "주식교환ㆍ이전결정",
  "전환사채권발행결정",
  "자기주식취득결정",
  "영업양수결정",
]);

/** 근접 불일치 — 목록 밖인데 이 글자가 들면 warn(가정 1) */
const NEAR_MISS_RE = /증자|합병/;
/** 맨 앞 대괄호 꼬리표 반복 — 기재정정 · 첨부정정 · 첨부추가 · 변경등록 · 연장결정 · 발행조건확정 · 정정명령부과 · 정정제출요구 */
const LEADING_TAGS_RE = /^(\[[^\]]*\]\s*)+/;
const B001_NAME_RE = /^주요사항보고서\s*\((.+)\)$/;

/** 비교용 정리 — trim · 연속 공백 1칸 */
function squash(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** 맨 앞 대괄호 꼬리표를 반복해서 뗀 비교용 이름(표시에는 쓰지 않는다) */
export function stripReportTags(name: string): string {
  return squash(name).replace(LEADING_TAGS_RE, "").trim();
}

/** 맨 앞에 대괄호 꼬리표가 있으면 정정(및 첨부 · 변경 등) 공시로 본다 */
export function isCorrection(name: string): boolean {
  return LEADING_TAGS_RE.test(squash(name));
}

/** 「주요사항보고서(종류)」 꼴이면 괄호 안 종류명(공백 제거), 아니면 null */
export function b001Kind(name: string): string | null {
  const m = B001_NAME_RE.exec(stripReportTags(name));
  return m ? m[1].replace(/\s+/g, "") : null;
}

export type Verdict =
  | { send: true }
  | { send: false; reason: "invalid" | "market" | "kind" | "correction" }
  /** `kind` = 괄호 안 종류명(괄호 꼴이 아니면 꼬리표 뗀 이름) — 수집기 warn 의 중복 제거 키 */
  | { send: false; reason: "near_miss"; kind: string };

/**
 * 판정 순서: invalid → market → (이름 규칙 없음 = 공개매수 → send) → 정정 스위치 → 허용 목록 완전 일치 → 근접 불일치 → kind.
 * 공개매수(D004)는 정정 스위치 단계 전에 send 로 끝난다 — D-01 정정도 항상 보낸다.
 */
export function judgeRow(watch: Watch, row: DartRow, opts: JudgeOptions): Verdict {
  if (typeof row.rcept_no !== "string" || !RCEPT_NO_RE.test(row.rcept_no)) return { send: false, reason: "invalid" };
  if (typeof row.corp_name !== "string" || row.corp_name.trim() === "") return { send: false, reason: "invalid" };
  if (typeof row.report_nm !== "string" || row.report_nm.trim() === "") return { send: false, reason: "invalid" };
  if (!ALLOWED_CORP_CLS.has(row.corp_cls) || typeof row.stock_code !== "string" || !STOCK_CODE_RE.test(row.stock_code)) {
    return { send: false, reason: "market" };
  }
  if (watch.kinds === null) return { send: true };
  if (opts.b001Corrections === "exclude" && isCorrection(row.report_nm)) return { send: false, reason: "correction" };
  const kind = b001Kind(row.report_nm);
  if (kind !== null && watch.kinds.some((k) => k.replace(/\s+/g, "") === kind)) return { send: true };
  if (kind !== null && KNOWN_EXCLUDED_B001_KINDS.has(kind)) return { send: false, reason: "kind" };
  const label = kind ?? stripReportTags(row.report_nm);
  if (NEAR_MISS_RE.test(label)) return { send: false, reason: "near_miss", kind: label };
  return { send: false, reason: "kind" };
}

/** 감시 대상 목록 — 공개매수(D004 · 먼저) · 유상증자 · 합병 주요사항보고서(B001 · 허용 목록 = `opts.b001Kinds`) */
export function buildWatches(opts: { b001Kinds: readonly string[] }): Watch[] {
  return [
    { id: "tender_offer", pblntfDetailTy: "D004", priority: 0, kinds: null, alwaysShowFiler: true },
    { id: "rights_merger", pblntfDetailTy: "B001", priority: 1, kinds: opts.b001Kinds, alwaysShowFiler: false },
  ];
}
