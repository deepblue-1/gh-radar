/**
 * Phase 07 — Naver Search API 응답 sanitize 모듈.
 * server + worker 양쪽이 import 해서 single source of truth 를 유지한다.
 * 신규 의존성(sanitize-html, striptags, dompurify) 도입 금지 (Phase 07 UI-SPEC guardrail §2).
 *
 * T-03 mitigation (Stored XSS): HTML 태그 + entity 제거 → React 기본 text escape 와
 * 함께 2중 방어. unit test 최소 8 case 로 <b>/nested/entity/한글 보존 검증 (V-04).
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

/**
 * 정규식 기반 HTML 태그 제거 + 엔티티 디코드. 순수 함수.
 */
export function stripHtml(input: string): string {
  if (!input) return "";
  let s = input.replace(HTML_TAG_RE, "");
  s = s.replace(NUMERIC_ENTITY_RE, (_, n) => {
    try {
      return String.fromCodePoint(Number(n));
    } catch {
      return "";
    }
  });
  s = s.replace(HEX_ENTITY_RE, (_, h) => {
    try {
      return String.fromCodePoint(parseInt(h, 16));
    } catch {
      return "";
    }
  });
  for (const [k, v] of Object.entries(NAMED_ENTITIES)) s = s.replaceAll(k, v);
  return s.trim();
}

/**
 * RFC 822 (e.g., 'Fri, 17 Apr 2026 14:32:00 +0900') → ISO-8601 UTC string 또는 null.
 * 잘못된 포맷 시 null 반환.
 */
export function parsePubDate(rfc822: string): string | null {
  if (!rfc822) return null;
  const t = Date.parse(rfc822);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

const NAVER_HOSTS = new Set([
  "news.naver.com",
  "n.news.naver.com",
  "m.news.naver.com",
]);
const SUBDOMAIN_STRIP_RE = /^(www|m|mobile|biz|news|n)\./i;

/**
 * URL host 에서 TLD 제거 후 첫 토큰을 짧은 도메인 prefix 로 반환.
 * naver 도메인은 항상 'naver' 로 special-case.
 * http/https 외 프로토콜은 null (T-02 defense — javascript: / ftp: 등 차단).
 */
export function extractSourcePrefix(url: string): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  const host = parsed.host.toLowerCase();
  if (NAVER_HOSTS.has(host)) return "naver";
  // subdomain 1단계 strip (www./m./news./biz./n. 등)
  const stripped = host.replace(SUBDOMAIN_STRIP_RE, "");
  // 첫 토큰만 (TLD 이전)
  const first = stripped.split(".")[0];
  return first && first.length > 0 ? first : null;
}
