/**
 * Phase 43-01 — 공시 알림 두 줄 문구(D-06 · D-07 · D-08).
 *
 *   📢 {(늦은 알림) }{보고서명 DART 표기 그대로} — {회사명}({종목코드}) · 제출인 {제출인}
 *   <a href="https://dart.fss.or.kr/dsaf001/main.do?rcpNo={접수번호}">DART 원문</a> · 금융감독원 전자공시
 *
 * - 본문 숫자(가격 · 기간 · 규모)는 없다 — 목록 정보와 원문 링크만(D-06).
 * - 링크는 데스크톱 원문 뷰어 하나(리서치 미결 4 의 답 · D-08). 모바일 전용 주소는 두지 않는다.
 * - parse_mode HTML 이라 모든 값은 `htmlEscape`(회사명에 `&` 가 실제로 있다 — 예 F&F).
 * - 제출인 생략 규칙 · 평문 · 장애 글 · 시험 글은 43-09 가 더한다.
 */

export const DART_VIEWER_URL = "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=";
export const SOURCE_LABEL = "금융감독원 전자공시";
export const LATE_LABEL = "(늦은 알림)";

/** `&` 를 먼저 바꿔야 `&lt;` 가 `&amp;lt;` 로 두 번 바뀌지 않는다 */
export function htmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface AlertFields {
  rcept_no: string;
  report_nm: string;
  corp_name: string;
  stock_code: string;
  flr_nm: string;
  late: boolean;
}

export function alertText(a: AlertFields, opts: { alwaysShowFiler: boolean }): string {
  const late = a.late ? `${LATE_LABEL} ` : "";
  const filerName = a.flr_nm.trim();
  // 공개매수(alwaysShowFiler)는 항상 제출인을 붙인다. 그 밖(주요사항보고서)의 「회사명과 같으면 생략」 규칙은
  // 43-09 가 `!opts.alwaysShowFiler` 갈래로 더한다 — 그 전까지는 감시 대상과 무관하게 이름이 있으면 붙인다.
  const showFiler = filerName !== "";
  const filer = showFiler ? ` · 제출인 ${htmlEscape(filerName)}` : "";
  const first = `📢 ${late}${htmlEscape(a.report_nm)} — ${htmlEscape(a.corp_name)}(${htmlEscape(a.stock_code)})${filer}`;
  const second = `<a href="${DART_VIEWER_URL}${htmlEscape(a.rcept_no)}">DART 원문</a> · ${SOURCE_LABEL}`;
  return `${first}\n${second}`;
}
