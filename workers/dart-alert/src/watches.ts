import type { DartRow } from "./dart/client";

/**
 * Phase 43-01 — 감시 대상 목록(설정값) · 시장 거르기 · 행 판정.
 *
 * - 감시 대상 = 조회 인자(유형 코드 하나)와 거르기 규칙을 담은 데이터. 바퀴는 목록을 순서대로 돈다.
 * - D-01: 공개매수(`D004`)는 보고서 이름으로 거르지 않는다(`kinds: null`) — 신고서 · 설명서 · 의견표명서 ·
 *   결과보고서 · 정정 전부 보낸다.
 * - D-05: 상장 주식만 — `corp_cls` 가 Y(유가) · K(코스닥)이고 종목코드가 6자리. 비상장(E) · 코넥스(N)는
 *   넣지도 보내지도 않는다. 스팩은 K 라 그대로 통과.
 * - 주요사항보고서(`B001`) 감시 대상 · 이름 규칙(`kinds` 완전 일치 · 정정 스위치 · 근접 불일치)은 43-09 가 채운다.
 *   여기서는 그 설정값의 기본값(`DEFAULT_B001_KINDS`)만 상수로 둔다 — 43-03 설정 기본값이 이 이름을 쓴다.
 */

export type WatchId = "tender_offer" | "rights_merger";

export interface Watch {
  id: WatchId;
  /** list.json `pblntf_detail_ty` — 유형 하나 */
  pblntfDetailTy: "D004" | "B001";
  /** 송신 우선순위(작을수록 먼저) — DB `priority` */
  priority: number;
  /** null = 보고서 이름으로 거르지 않음(D-01). 배열 = 허용 종류명(43-09) */
  kinds: readonly string[] | null;
  /** 알림 첫 줄에 제출인을 항상 붙이나(공개매수 = 공개매수자가 대상회사와 다르다) */
  alwaysShowFiler: boolean;
}

/** D-04 주요사항보고서 허용 종류명 기본값(괄호 안 종류명 완전 일치 — 판정은 43-09) */
export const DEFAULT_B001_KINDS: readonly string[] = ["유상증자결정", "유무상증자결정", "회사합병결정", "회사분할합병결정"];

/** D-05 상장 주식 시장 — Y 유가증권 · K 코스닥 */
export const ALLOWED_CORP_CLS: ReadonlySet<string> = new Set(["Y", "K"]);
/** 상장 종목코드 6자리(영문 대문자 포함 신형 코드 허용) */
export const STOCK_CODE_RE = /^[0-9A-Z]{6}$/;
const RCEPT_NO_RE = /^[0-9]{14}$/;

export interface JudgeOptions {
  /** 주요사항보고서 정정 공시를 보낼지(43-09) */
  b001Corrections: "include" | "exclude";
}

export type Verdict =
  | { send: true }
  | { send: false; reason: "invalid" | "market" | "kind" | "near_miss" | "correction" };

export function judgeRow(watch: Watch, row: DartRow, _opts: JudgeOptions): Verdict {
  if (typeof row.rcept_no !== "string" || !RCEPT_NO_RE.test(row.rcept_no)) return { send: false, reason: "invalid" };
  if (typeof row.corp_name !== "string" || row.corp_name.trim() === "") return { send: false, reason: "invalid" };
  if (!ALLOWED_CORP_CLS.has(row.corp_cls) || typeof row.stock_code !== "string" || !STOCK_CODE_RE.test(row.stock_code)) {
    return { send: false, reason: "market" };
  }
  if (watch.kinds === null) return { send: true };
  // 이름 규칙이 있는 감시 대상(주요사항보고서)의 판정은 43-09 가 채운다
  return { send: false, reason: "kind" };
}

/** 감시 대상 목록. 지금은 공개매수 하나 — 주요사항보고서 감시 대상(`opts.b001Kinds`)은 43-09 가 더한다 */
export function buildWatches(_opts: { b001Kinds: readonly string[] }): Watch[] {
  return [{ id: "tender_offer", pblntfDetailTy: "D004", priority: 0, kinds: null, alwaysShowFiler: true }];
}
