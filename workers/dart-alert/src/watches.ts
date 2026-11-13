import { EXCHANGE_POLL_MS, RIGHTS_REGULAR_POLL_MS, SLOW_POLL_MS } from "./cadence";
import type { DartRow } from "./dart/client";

/**
 * Phase 43-01 · 43-09 · 261113-iez — 감시 대상 목록(설정값) · 시장 거르기 · 행 판정.
 *
 * - 감시 대상 = 조회 인자(유형 코드 하나) · 이름 규칙(`rule`) · 조회 간격(`everyMs`)을 담은 데이터. 바퀴는 목록을 순서대로
 *   돌되 `everyMs` 가 있는 감시 대상은 그 시각 칸(07:00 기준 · cadence.ts `pollSlot`)마다 1번만 부른다.
 * - D-01: 공개매수(`D004`)는 보고서 이름으로 거르지 않는다(`rule.form = "any"`) — 신고서 · 설명서 · 의견표명서 ·
 *   결과보고서 · 정정 전부 보낸다.
 * - D-05: 상장 주식만 — `corp_cls` 가 Y(유가) · K(코스닥)이고 종목코드가 6자리. 비상장(E) · 코넥스(N)는
 *   넣지도 보내지도 않는다. 스팩은 K 라 그대로 통과. 모든 감시 대상 공통.
 * - 43-09 — 주요사항보고서(`B001`) 감시 대상(D-03 · D-04): 정정 꼬리표(`[기재정정]` 등)를 떼고
 *   「주요사항보고서(종류)」 괄호 안 종류명이 허용 목록(설정값 `rule.kinds`)과 **완전히 같을 때만** 보낸다. 글자 포함 규칙은
 *   「유무상증자결정」 을 놓친다(유-무-상-증-자 ⊅ 유상증자 · RESEARCH 확인 1). 목록 밖인데 「증자」 · 「합병」 이 든 이름은
 *   보내지 않고 `near_miss`(수집기가 종류명마다 실행당 1번 warn — 새 표기를 사람이 보고 목록에 더한다).
 * - 261113-iez — 감시 대상 넷 · 종류별 정정:
 *   · B001 허용 목록에 자기주식취득결정 · 주식교환ㆍ이전결정을 더했다. 이 두 종류는 **원본만**(`rule.originalOnly` —
 *     정정 스위치가 include 여도 맨 앞 꼬리표가 붙은 건은 보내지 않음). 기존 4종 · 공개매수는 지금처럼 정정 포함.
 *   · 거래소 수시공시(`I001`)와 임원ㆍ주요주주 거래계획(`D005`)은 `plain` 꼴 — 허용 이름과 **같은 종류**(`matchesKind`)이거나
 *     접두 목록(투자판단관련주요경영사항만)으로 시작하면 보낸다. 정정(맨 앞 꼬리표)은 늘 보내지 않는다. 근접 불일치 warn 은
 *     없다 — I001 은 비대상 이름이 수십 종이라 warn 이 쏟아진다.
 *   · id `rights_merger` 는 자기주식 · 주식교환도 담지만 바꾸지 않는다 — DB `dart_alerts.watch` · `last_ok` 키 ·
 *     운영 수치 `by_watch` 의 연속성.
 * - 261113-rn7(U-1) — 알릴 종류를 넓혔다(전부 원본만):
 *   · I001 에 「현금ㆍ현물배당결정」 · 「투자유의안내」. 「…주주명부폐쇄(기준일)결정」 · 「부동산투자회사금전배당결정」 은 넣지 않는다.
 *   · 새 감시 대상 거래소 시장조치(`I003` · `market_action`) — 「주권매매거래정지」 · 「주권매매거래정지해제」 ·
 *     「주권매매거래정지기간변경」 · 「기타시장안내(관리종목지정우려종목)」 · 「불성실공시법인지정」 만(`I003_KINDS`). 그 밖
 *     「기타시장안내 (…)」 · 「불성실공시법인지정예고」 · 「불성실공시법인미지정」 · IR · 배당락 · 소속부변경 등은 떨어진다.
 *   · 새 감시 대상 최대주주 소유주식 변동(`I004` · `largest_holder_change`) — 「최대주주등소유주식변동신고서」 만.
 *   · 이름 규칙(`matchesKind`): 꼬리표를 떼고 공백을 전부 뺀 이름(`compactName`)이 허용 이름(공백 제거)과 같거나
 *     「허용 이름(」 으로 시작하면 같은 종류다. 옛 규칙(첫 「(」 앞까지 자르기)은 「기타시장안내(관리종목지정우려종목) (…)」 와
 *     「기타시장안내 (주가 미달 …)」 를 둘 다 「기타시장안내」 로 만들어 구분하지 못했다. 괄호가 없는 허용 이름에는 옛 규칙과
 *     결과가 같다. 「주권매매거래정지해제」 는 「주권매매거래정지(」 로 시작하지 않아 「주권매매거래정지」 와 섞이지 않는다.
 *   · 제출인(D-07): I003 은 첫 줄에 제출인을 붙이지 않는다(`hideFiler` — 시장조치의 주체는 늘 거래소라 정보가 없다) ·
 *     I004 는 회사와 다를 때만 · D005 는 늘.
 * - 261113-rn7(U-2) — OpenDART 키 2개: 감시 대상마다 `key`(1 | 2)를 코드 상수로 박는다(아래 `buildWatches` 목록이
 *   정본 · 키 풀 · 동적 재분배 · 한 키 대체 없음). 키 1 = 공개매수 · 주요사항보고서, 키 2 = 그 밖. 사용량 · 예산 · 한도
 *   처리는 키마다 따로(collector.ts 키별 레인).
 * - 판정은 비교용 정리본으로만 한다. 표시는 DART 원문 `report_nm`(D-07 — 연속 공백만 1칸으로 보임 · message.ts).
 */

export type WatchId =
  | "tender_offer"
  | "rights_merger"
  | "market_action"
  | "exchange_disclosure"
  | "largest_holder_change"
  | "insider_trade_plan";

/**
 * 보고서 이름 규칙 — 꼴마다 정정 규칙이 다르다.
 * - `any`: 이름으로 거르지 않고 정정도 보낸다(공개매수 · D-01).
 * - `b001`: 「주요사항보고서(종류)」 괄호 안 종류명이 `kinds` 와 완전 일치(env `DART_ALERT_B001_KINDS` 로 바꿀 수 있는
 *   목록). 정정은 `JudgeOptions.b001Corrections` 를 따르되 `originalOnly` 종류는 늘 원본만. 근접 불일치 warn 은 이 꼴에만.
 * - `plain`: 이름이 `exact` 중 하나와 같은 종류(`matchesKind`)이거나 `compactName` 이 `prefix` 로 시작하면 보낸다.
 *   정정은 늘 보내지 않는다.
 */
export type NameRule =
  | { form: "any" }
  | { form: "b001"; kinds: readonly string[]; originalOnly: ReadonlySet<string> }
  | { form: "plain"; exact: readonly string[]; prefix: readonly string[] };

/** OpenDART 인증키 번호 — 1 = `OPENDART_API_KEY` · 2 = `OPENDART_API_KEY_2`(261113-rn7 · 키 둘 고정) */
export type DartKeyId = 1 | 2;

export interface Watch {
  id: WatchId;
  /** 이 감시 대상을 부르는 OpenDART 키 — 사용량 · 예산 · 한도 처리도 이 키 몫 */
  key: DartKeyId;
  /** list.json `pblntf_detail_ty` — 유형 하나 */
  pblntfDetailTy: "D004" | "B001" | "I001" | "I003" | "I004" | "D005";
  /** 송신 우선순위(작을수록 먼저) — DB `priority` */
  priority: number;
  /** 보고서 이름 규칙 · 정정 규칙 */
  rule: NameRule;
  /** null = 바퀴마다 조회 · 숫자 = 07:00 기준 이 간격(ms)의 시각 칸마다 1번(cadence.ts `pollSlot`) */
  everyMs: number | null;
  /** 정의돼 있으면 `09:00` 앞은 이 간격(null = 바퀴마다 · cadence.ts `everyMsAt`) — 주요사항보고서 */
  preopenEveryMs?: number | null;
  /** 알림 첫 줄에 제출인을 항상 붙이나(공개매수 = 공개매수자 · 거래계획 = 임원 · 주요주주가 대상회사와 다르다) */
  alwaysShowFiler: boolean;
  /** 알림 첫 줄에 제출인을 붙이지 않음 — 거래소 시장조치(제출인이 늘 거래소라 정보가 없다 · D-07 · 261113-rn7) */
  hideFiler?: boolean;
}

/** D-04 주요사항보고서 허용 종류명 기본값(괄호 안 종류명 완전 일치) — 뒤 2종은 261113-iez 추가 · 원본만 */
export const DEFAULT_B001_KINDS: readonly string[] = [
  "유상증자결정",
  "유무상증자결정",
  "회사합병결정",
  "회사분할합병결정",
  "자기주식취득결정",
  "주식교환ㆍ이전결정",
];
/** 허용 목록에 있어도 원본만 보내는 B001 종류(정정 스위치와 무관) */
export const B001_ORIGINAL_ONLY_KINDS: ReadonlySet<string> = new Set(["자기주식취득결정", "주식교환ㆍ이전결정"]);
/** 거래소 수시공시(I001) — 같은 종류(`matchesKind`)면 보낼 이름 · 뒤 2종은 261113-rn7 */
export const I001_EXACT_KINDS: readonly string[] = [
  "최대주주변경",
  "최대주주변경을수반하는주식양수도계약체결",
  "경영권변경등에관한계약체결",
  "단일판매ㆍ공급계약체결",
  "주식소각결정",
  "현금ㆍ현물배당결정",
  "투자유의안내",
];
/** 거래소 수시공시(I001) — 접두 일치로 보낼 이름(괄호 꼬리 변형이 많다) */
export const I001_PREFIX_KINDS: readonly string[] = ["투자판단관련주요경영사항"];
/**
 * 거래소 시장조치(I003) — 보낼 이름(261113-rn7 U-1b). 「기타시장안내(관리종목지정우려종목)」 은 괄호까지 한 이름 —
 * 괄호 없는 「기타시장안내 (…)」 다른 안내는 떨어진다.
 */
export const I003_KINDS: readonly string[] = [
  "주권매매거래정지",
  "주권매매거래정지해제",
  "주권매매거래정지기간변경",
  "기타시장안내(관리종목지정우려종목)",
  "불성실공시법인지정",
];
/** 최대주주 소유주식 변동(I004) — 보낼 이름(261113-rn7 U-1c) */
export const I004_KINDS: readonly string[] = ["최대주주등소유주식변동신고서"];
/** 임원ㆍ주요주주 거래계획(D005) — 보낼 이름 */
export const D005_KINDS: readonly string[] = ["임원ㆍ주요주주특정증권등거래계획보고서", "임원ㆍ주요주주특정증권등거래계획철회보고서"];

/** D-05 상장 주식 시장 — Y 유가증권 · K 코스닥 */
export const ALLOWED_CORP_CLS: ReadonlySet<string> = new Set(["Y", "K"]);
/** 상장 종목코드 6자리(영문 대문자 포함 신형 코드 허용) */
export const STOCK_CODE_RE = /^[0-9A-Z]{6}$/;
const RCEPT_NO_RE = /^[0-9]{14}$/;

export interface JudgeOptions {
  /**
   * 주요사항보고서 정정 공시를 보낼지 — 공개매수 정정은 이 값과 무관하게 보낸다(D-01).
   * B001 원본만 종류(자기주식취득결정 · 주식교환ㆍ이전결정) · I001 · D005 는 이 값과 무관하게 원본만.
   */
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
  "전환사채권발행결정",
  "영업양수결정",
]);

/** 근접 불일치 — 목록 밖인데 이 글자가 들면 warn(가정 1) · b001 꼴 전용 */
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

/**
 * `plain` 꼴 비교용 이름 — 꼬리표를 떼고(stripReportTags) 공백을 전부 뗀다.
 * 「기타시장안내(관리종목지정우려종목)              (시가총액 200억원 미달)」 → 「기타시장안내(관리종목지정우려종목)(시가총액200억원미달)」.
 */
export function compactName(name: string): string {
  return stripReportTags(name).replace(/\s+/g, "");
}

/**
 * 같은 종류인가 — `compactName(name)` 이 허용 이름(공백 제거)과 같거나 「허용 이름(」 으로 시작한다(끝 괄호 꼬리
 * 「(분기배당)」 · 「(자회사의 주요경영사항)」 · 「(사유)」 는 같은 종류). 「주권매매거래정지해제」 는 「주권매매거래정지」 와 다르다.
 */
export function matchesKind(name: string, kind: string): boolean {
  const n = compactName(name);
  const k = kind.replace(/\s+/g, "");
  return n === k || n.startsWith(`${k}(`);
}

export type Verdict =
  | { send: true }
  | { send: false; reason: "invalid" | "market" | "kind" | "correction" }
  /** `kind` = 괄호 안 종류명(괄호 꼴이 아니면 꼬리표 뗀 이름) — 수집기 warn 의 중복 제거 키 */
  | { send: false; reason: "near_miss"; kind: string };

/**
 * 판정 순서: invalid → market → 이름 규칙(`rule.form`).
 * - any(공개매수) → send — D-01 정정도 항상 보낸다.
 * - b001 → 정정 스위치 exclude 면 correction → 괄호 종류명 완전 일치(원본만 종류의 정정이면 correction · 그 밖 send) →
 *   알려진 제외 종류 kind → 근접 불일치 near_miss → kind.
 * - plain → 정정이면 correction → exact 중 하나와 같은 종류(`matchesKind`) · `compactName` 이 prefix 로 시작하면 send →
 *   kind(근접 불일치 없음).
 */
export function judgeRow(watch: Watch, row: DartRow, opts: JudgeOptions): Verdict {
  if (typeof row.rcept_no !== "string" || !RCEPT_NO_RE.test(row.rcept_no)) return { send: false, reason: "invalid" };
  if (typeof row.corp_name !== "string" || row.corp_name.trim() === "") return { send: false, reason: "invalid" };
  if (typeof row.report_nm !== "string" || row.report_nm.trim() === "") return { send: false, reason: "invalid" };
  if (!ALLOWED_CORP_CLS.has(row.corp_cls) || typeof row.stock_code !== "string" || !STOCK_CODE_RE.test(row.stock_code)) {
    return { send: false, reason: "market" };
  }
  const rule = watch.rule;
  if (rule.form === "any") return { send: true };
  if (rule.form === "plain") {
    if (isCorrection(row.report_nm)) return { send: false, reason: "correction" };
    const name = compactName(row.report_nm);
    if (rule.exact.some((k) => matchesKind(row.report_nm, k)) || rule.prefix.some((p) => name.startsWith(p))) return { send: true };
    return { send: false, reason: "kind" };
  }
  if (opts.b001Corrections === "exclude" && isCorrection(row.report_nm)) return { send: false, reason: "correction" };
  const kind = b001Kind(row.report_nm);
  if (kind !== null && rule.kinds.some((k) => k.replace(/\s+/g, "") === kind)) {
    if (rule.originalOnly.has(kind) && isCorrection(row.report_nm)) return { send: false, reason: "correction" };
    return { send: true };
  }
  if (kind !== null && KNOWN_EXCLUDED_B001_KINDS.has(kind)) return { send: false, reason: "kind" };
  const label = kind ?? stripReportTags(row.report_nm);
  if (NEAR_MISS_RE.test(label)) return { send: false, reason: "near_miss", kind: label };
  return { send: false, reason: "kind" };
}

/**
 * 감시 대상 목록(이 순서로 돈다 · 순서 = 송신 우선순위) · 감시 대상 → 키 대응(코드 상수 · 261113-rn7 U-2):
 * - 공개매수 D004 · 키 1 · 우선 0 · 바퀴마다(종일 5초) · 이름 거르지 않음 · 제출인 항상.
 * - 주요사항보고서 B001 · 키 1 · 우선 1 · `09:00` 전 매 바퀴 · 뒤 10초 칸 · 허용 목록 = `opts.b001Kinds` · 제출인은 회사와
 *   다를 때만.
 * - 거래소 시장조치 I003 · 키 2 · 우선 2(거래정지 · 관리종목 우려 · 불성실공시 — 장중 거래 가능 여부가 바뀐다) · 30초 칸 ·
 *   제출인 없음(늘 거래소).
 * - 거래소 수시공시 I001 · 키 2 · 우선 3 · 10초 칸 · 회사가 내는 공시라 제출인은 회사와 다를 때만.
 * - 최대주주 소유주식 변동 I004 · 키 2 · 우선 4(이미 일어난 지분 변동의 사후 신고) · 30초 칸 · 제출인은 회사와 다를 때만.
 * - 임원ㆍ주요주주 거래계획 D005 · 키 2 · 우선 5(매매를 미리 알리는 사전 공시라 몰릴 때 가장 뒤) · 30초 칸 · 제출인 항상 —
 *   목록의 회사 · 종목코드는 발행회사라 제출인(임원 · 주요주주)을 빼면 「누가」 가 사라진다.
 */
export function buildWatches(opts: { b001Kinds: readonly string[] }): Watch[] {
  return [
    { id: "tender_offer", key: 1, pblntfDetailTy: "D004", priority: 0, everyMs: null, rule: { form: "any" }, alwaysShowFiler: true },
    {
      id: "rights_merger",
      key: 1,
      pblntfDetailTy: "B001",
      priority: 1,
      everyMs: RIGHTS_REGULAR_POLL_MS,
      preopenEveryMs: null,
      rule: { form: "b001", kinds: opts.b001Kinds, originalOnly: B001_ORIGINAL_ONLY_KINDS },
      alwaysShowFiler: false,
    },
    {
      id: "market_action",
      key: 2,
      pblntfDetailTy: "I003",
      priority: 2,
      everyMs: SLOW_POLL_MS,
      rule: { form: "plain", exact: I003_KINDS, prefix: [] },
      alwaysShowFiler: false,
      hideFiler: true,
    },
    {
      id: "exchange_disclosure",
      key: 2,
      pblntfDetailTy: "I001",
      priority: 3,
      everyMs: EXCHANGE_POLL_MS,
      rule: { form: "plain", exact: I001_EXACT_KINDS, prefix: I001_PREFIX_KINDS },
      alwaysShowFiler: false,
    },
    {
      id: "largest_holder_change",
      key: 2,
      pblntfDetailTy: "I004",
      priority: 4,
      everyMs: SLOW_POLL_MS,
      rule: { form: "plain", exact: I004_KINDS, prefix: [] },
      alwaysShowFiler: false,
    },
    {
      id: "insider_trade_plan",
      key: 2,
      pblntfDetailTy: "D005",
      priority: 5,
      everyMs: SLOW_POLL_MS,
      rule: { form: "plain", exact: D005_KINDS, prefix: [] },
      alwaysShowFiler: true,
    },
  ];
}
