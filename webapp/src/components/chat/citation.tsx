"use client";

/**
 * Phase 14 Plan 09 — 출처 인용 블록 (C7, CHAT-01, D-08).
 *
 * 답변 근거를 좌측 border-left 3px + `--muted` 배경 블록으로 렌더. DB 뉴스(kind:"news")는
 * 제목 + 출처(매체명) + 원본 URL 을 verbatim 링크로, 웹서치(kind:"web")는 검색 인용을 표시.
 *
 * ## URL verbatim (D-08 / CLAUDE.md 5원칙 #5 출처 표기)
 * url 은 원본 그대로(verbatim) href 에 넣는다 — 요약/재작성 없이 출처를 항상 함께 노출.
 * source 는 매체명(없으면 web search), origin 은 hostname 힌트.
 */

export interface CitationProps {
  title: string;
  /** 매체명(뉴스) — 웹서치는 생략 가능. */
  source?: string;
  /** 원본 URL(verbatim). */
  url: string;
  kind: "news" | "web";
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function Citation({ title, source, url, kind }: CitationProps) {
  const origin = kind === "web" ? "web search" : hostnameOf(url);
  const meta = [source, origin].filter(Boolean).join(" · ");

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="my-[var(--s-1)] block rounded-[0_var(--r)_var(--r)_0] border-l-[3px] border-[var(--border)] bg-[var(--muted)] px-[var(--s-3)] py-[var(--s-2)] text-[var(--fg)] no-underline"
    >
      <span className="block text-[length:var(--t-caption)] font-semibold">
        {title}
      </span>
      {meta && (
        <span className="block text-[length:11px] text-[var(--muted-fg)]">
          {meta}
        </span>
      )}
    </a>
  );
}
