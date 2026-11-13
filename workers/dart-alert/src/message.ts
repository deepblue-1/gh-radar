/**
 * Phase 43-01 — 공시 알림 두 줄 문구(D-06 · D-07 · D-08).
 *
 *   📢 {(늦은 알림) }{보고서명 DART 표기 그대로 · 연속 공백만 1칸} — {회사명}({종목코드}) · 제출인 {제출인}
 *   <a href="https://dart.fss.or.kr/dsaf001/main.do?rcpNo={접수번호}">DART 원문</a> · 금융감독원 전자공시
 *
 * - 본문 숫자(가격 · 기간 · 규모)는 없다 — 목록 정보와 원문 링크만(D-06).
 * - 링크는 데스크톱 원문 뷰어 하나(리서치 미결 4 의 답 · D-08). 모바일 전용 주소는 두지 않는다.
 * - parse_mode HTML 이라 모든 값은 `htmlEscape`(회사명에 `&` 가 실제로 있다 — 예 F&F).
 * - 43-09: 제출인 생략(주요사항보고서 · 제출인 = 회사 자신) · 평문(`plainAlertText` — 서식 오류 대비) ·
 *   장애 글 2종(`outageText` · `recoveredText` · D-16) · 시험 글(`testSendText` · D-15). 시각은 컨테이너 시간대와
 *   무관하게 KST(`kstLabel`).
 * - 261113-rn7: 거래소 시장조치(I003 · `hideFiler`)는 제출인을 붙이지 않는다 — 제출인이 늘 거래소(유가증권시장본부 ·
 *   코스닥시장본부 꼴)라 회사와 달라 매번 붙고 정보가 없다.
 * - 261113-iez: 보고서명은 앞뒤 공백을 떼고 연속 공백을 1칸으로 보인다(「투자판단관련주요경영사항              (…)」 이
 *   잠금화면 미리보기 첫 줄을 밀어내지 않게 · D-07). DB · 판정 값은 원문 그대로.
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

/** 회사 표기 정리 — 공백 · 「(주)」 · 「주식회사」 · 「㈜」 를 뗀다 */
function companyKey(name: string): string {
  return name.replace(/\s+/g, "").replace(/\(주\)|주식회사|㈜/g, "");
}

/** 제출인과 회사가 같은 회사인가(표기 차이 무시) — 빈 이름끼리는 같지 않다 */
export function sameCompany(a: string, b: string): boolean {
  const ka = companyKey(a);
  return ka !== "" && ka === companyKey(b);
}

/** 첫 줄 제출인 규칙 — hideFiler 가 참이면 붙이지 않고(거래소 시장조치), 아니면 alwaysShowFiler 또는 회사와 다를 때 */
export interface FilerOptions {
  alwaysShowFiler: boolean;
  hideFiler?: boolean;
}

/**
 * 첫 줄 — 공개매수(alwaysShowFiler)는 제출인을 항상 붙이고, 주요사항보고서는 제출인이 회사 자신이면 생략한다(D-07).
 * 거래소 시장조치(hideFiler)는 붙이지 않는다. `esc` = HTML 본문은 htmlEscape, 평문은 그대로.
 */
function firstLine(a: AlertFields, opts: FilerOptions, esc: (s: string) => string): string {
  const late = a.late ? `${LATE_LABEL} ` : "";
  const filerName = a.flr_nm.trim();
  const showFiler = opts.hideFiler !== true && filerName !== "" && (opts.alwaysShowFiler || !sameCompany(filerName, a.corp_name));
  const filer = showFiler ? ` · 제출인 ${esc(filerName)}` : "";
  const reportName = a.report_nm.trim().replace(/\s+/g, " ");
  return `📢 ${late}${esc(reportName)} — ${esc(a.corp_name)}(${esc(a.stock_code)})${filer}`;
}

export function alertText(a: AlertFields, opts: FilerOptions): string {
  const second = `<a href="${DART_VIEWER_URL}${htmlEscape(a.rcept_no)}">DART 원문</a> · ${SOURCE_LABEL}`;
  return `${firstLine(a, opts, htmlEscape)}\n${second}`;
}

/** 서식 오류(parse_mode HTML 거부) 대비 평문 — 태그 · 엔티티 없이 원문 주소를 그대로 싣는다(43-06 재송신) */
export function plainAlertText(a: AlertFields, opts: FilerOptions): string {
  const second = `DART 원문 ${DART_VIEWER_URL}${a.rcept_no} · ${SOURCE_LABEL}`;
  return `${firstLine(a, opts, (s) => s)}\n${second}`;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST 시각 표기 — `HH:MM` 또는 `M/D HH:MM`. +9시간 뒤 UTC 필드를 읽어 컨테이너 TZ 와 무관하다 */
export function kstLabel(ms: number, withDate: boolean): string {
  const d = new Date(ms + KST_OFFSET_MS);
  const hhmm = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return withDate ? `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${hhmm}` : hhmm;
}

/** KST 날짜 키 YYYY-MM-DD */
function kstDay(ms: number): string {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** D-16 장애 글 — 「⚠ 공시 알림이 멈췄습니다 — HH:MM 부터 DART 조회 실패(사유). 복구되면 알려 드립니다.」 */
export function outageText(sinceMs: number, reason: string): string {
  const why = htmlEscape(reason.replace(/\s+/g, " ").trim());
  return `⚠ 공시 알림이 멈췄습니다 — ${kstLabel(sinceMs, false)} 부터 DART 조회 실패(${why}). 복구되면 알려 드립니다.`;
}

/** D-16 복구 글 — 같은 KST 날이면 멈춘 구간, 날이 바뀌었으면 멈춘 시작 날짜 · 시각과 「오늘 접수된 공시」 */
export function recoveredText(sinceMs: number, nowMs: number): string {
  if (kstDay(sinceMs) === kstDay(nowMs)) {
    return `✅ 공시 알림 다시 동작 — ${kstLabel(sinceMs, false)} ~ ${kstLabel(nowMs, false)} 사이 공시는 「${LATE_LABEL}」 으로 보냅니다.`;
  }
  return `✅ 공시 알림 다시 동작(${kstLabel(sinceMs, true)} 부터 멈춤) — 오늘 접수된 공시는 「${LATE_LABEL}」 으로 보냅니다.`;
}

/** D-15 시험 글 두 줄 */
export function testSendText(nowMs: number): string {
  return `🔔 공시 알림 시험 — 공개매수 · 주요사항보고서 · 거래소 시장조치 · 거래소 수시공시 · 최대주주 소유주식 변동 · 임원ㆍ주요주주 거래계획 공시를 이 방으로 보냅니다\n${kstLabel(nowMs, false)} KST · ${SOURCE_LABEL}`;
}
