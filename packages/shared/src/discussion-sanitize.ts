/**
 * Phase 08 — Naver 종목토론방 스크래핑 결과 sanitize 모듈.
 *
 * server + worker 양쪽이 import. sanitize-html 의존성은 **server + worker 내부 구현**에서만
 * 도입하고, packages/shared 는 regex 기반 best-effort 를 제공하여 번들 크기 유지.
 *
 * V-20 guardrail: sanitize-html / striptags / dompurify / date-fns-tz import 금지.
 *
 * POC-RESULTS.md §4 확정 사항:
 *  - parseNaverBoardDate 입력은 Naver JSON API `writtenAt` — ISO 8601 KST (offset 없음).
 *    예: '2026-04-17T14:32:29' → '2026-04-17T14:32:29+09:00' (offset 보강).
 *    이미 offset/Z 가 있으면 그대로 반환. 레거시 HTML dot 포맷도 tolerant 하게 파싱.
 *  - extractNid 는 레거시 HTML URL 공유 시나리오 대비 유지 (JSON API 경로에서는 `post.id` 사용).
 */

const HTML_TAG_RE = /<\/?[a-z][a-z0-9]*\b[^>]*>/gi;
const NAMED_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&nbsp;": " ",
};
const NUMERIC_ENTITY_RE = /&#(\d+);/g;
const HEX_ENTITY_RE = /&#x([0-9a-f]+);/gi;
const WHITESPACE_RE = /\s+/g;

/**
 * 전체 HTML 을 plaintext 로 변환.
 * 순서: 엔티티 디코드(named → numeric → hex) → 태그 제거 → 공백 정규화 → trim.
 * T-01 mitigation: shared 레이어의 1차 XSS 방어.
 */
export function stripHtmlToPlaintext(input: string): string {
  if (!input) return "";
  let s = input;
  // 1. Named entities
  for (const [k, v] of Object.entries(NAMED_ENTITIES)) s = s.replaceAll(k, v);
  // 2. Numeric entities
  s = s.replace(NUMERIC_ENTITY_RE, (_, n) => {
    try {
      return String.fromCodePoint(Number(n));
    } catch {
      return "";
    }
  });
  // 3. Hex entities
  s = s.replace(HEX_ENTITY_RE, (_, h) => {
    try {
      return String.fromCodePoint(parseInt(h, 16));
    } catch {
      return "";
    }
  });
  // 4. Tags 제거
  s = s.replace(HTML_TAG_RE, "");
  // 5. 공백 정규화 (multiple whitespace → single space + trim)
  s = s.replace(WHITESPACE_RE, " ").trim();
  return s;
}

// nid / articleId 6~12자리 숫자 sanity (RESEARCH Pitfall 4 — fallback 포함)
const NID_RE = /[?&]nid=(\d{6,12})(?:&|$)/;
const ARTICLE_ID_RE = /[?&]articleId=(\d{6,12})(?:&|$)/;

/**
 * 네이버 게시글 URL 의 nid 쿼리 파라미터 추출.
 * JSON API 경로에서는 post.id 를 직접 사용하므로 이 함수는 레거시 HTML URL 공유 시나리오 전용.
 * 6~12자리 숫자가 아니면 null (안전장치).
 * articleId= 형식(구 모바일 URL)도 fallback 으로 지원.
 */
export function extractNid(hrefOrUrl: string): string | null {
  if (!hrefOrUrl) return null;
  const m = hrefOrUrl.match(NID_RE);
  if (m) return m[1];
  const m2 = hrefOrUrl.match(ARTICLE_ID_RE);
  if (m2) return m2[1];
  return null;
}

// Naver JSON API writtenAt — ISO 8601 KST (offset 없음).
// 예: '2026-04-17T14:32:29', '2026-04-17T14:32:29.123'
const ISO_NO_OFFSET_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?$/;
// 레거시 HTML dot 포맷 — '2026.04.17 14:32'
const LEGACY_DOT_RE = /^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})$/;

function inRange(
  Y: number,
  M: number,
  D: number,
  H: number,
  Mi: number,
  S: number,
): boolean {
  if (M < 1 || M > 12) return false;
  if (D < 1 || D > 31) return false;
  if (H > 23) return false;
  if (Mi > 59) return false;
  if (S > 59) return false;
  if (Y < 1970 || Y > 9999) return false;
  return true;
}

/**
 * Naver 종목토론방 날짜를 ISO 8601 (`+09:00` offset 보강) 으로 정규화.
 *
 * 입력 포맷:
 *  1) ISO no-offset (JSON API):     '2026-04-17T14:32:29'         → '...+09:00' 보강
 *  2) ISO with offset/Z (안전):     '2026-04-17T14:32:29+09:00'   → 그대로
 *  3) Legacy HTML dot:               '2026.04.17 14:32'            → '2026-04-17T14:32:00+09:00'
 *  4) Multi-space tolerant:          '2026.04.17  14:32'           → 동일
 *
 * 실패 시 null. Range sanity (월 1~12, 시 0~23 등) 강제.
 *
 * V-20: date-fns-tz 금지 — 수동 regex + 문자열 조합만 사용.
 */
export function parseNaverBoardDate(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Case 2: 이미 offset/Z 포함 — 통과 (best-effort validation via ISO_NO_OFFSET 부분 매치 후 suffix 확인).
  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})$/.test(
      trimmed,
    )
  ) {
    // 최소 sanity: 기본 구조 확인 후 그대로 반환. Date.parse 로 최종 검증.
    if (!Number.isNaN(Date.parse(trimmed))) return trimmed;
    return null;
  }

  // Case 1: ISO no-offset
  const mIso = trimmed.match(ISO_NO_OFFSET_RE);
  if (mIso) {
    const [, y, mo, d, h, mi, s = "00", ms] = mIso;
    const Y = Number(y);
    const M = Number(mo);
    const D = Number(d);
    const H = Number(h);
    const Mi = Number(mi);
    const S = Number(s);
    if (!inRange(Y, M, D, H, Mi, S)) return null;
    const msPart = ms ? `.${ms}` : "";
    return `${y}-${mo}-${d}T${h}:${mi}:${s}${msPart}+09:00`;
  }

  // Case 3/4: Legacy dot format (공백 수축)
  const collapsed = trimmed.replace(/\s+/g, " ");
  const mDot = collapsed.match(LEGACY_DOT_RE);
  if (mDot) {
    const [, y, mo, d, h, mi] = mDot;
    const Y = Number(y);
    const M = Number(mo);
    const D = Number(d);
    const H = Number(h);
    const Mi = Number(mi);
    if (!inRange(Y, M, D, H, Mi, 0)) return null;
    return `${y}-${mo}-${d}T${h}:${mi}:00+09:00`;
  }

  return null;
}
