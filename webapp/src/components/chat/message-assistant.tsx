"use client";

/**
 * Phase 14 Plan 09 — assistant 메시지 (C4, CHAT-01, D-09).
 *
 * 좌측 full-width, AI 아바타(`--primary`) + "팀장 애널리스트" 라벨(caption). 본문은
 * `react-markdown` + `remark-gfm` 로 렌더 — 표/리스트/헤딩/강조/코드 지원(D-09).
 *
 * ## XSS 방어 (T-14-10 mitigate)
 * react-markdown 은 기본적으로 raw HTML 을 렌더하지 않는다(rehype-raw 미사용) — LLM 이
 * 생성한 마크다운 안의 `<script>` 등 HTML 은 텍스트로 이스케이프되어 DOM 주입이 차단된다.
 * 링크(`<a>`)는 rel=noreferrer + target=_blank 로만 노출.
 * 예외(Phase 39 D-04): 진단문의 「틱 보기」 `/analytics/ticks?…` 는 내부 경로라 `next/link` 같은 탭으로 연다. 그 밖
 * `/` 로 시작하는 내부 경로(`//host` 포함)는 링크를 풀고 글자만 둔다 — 답변이 임의 내부 화면으로 보내지 못하게.
 *
 * ## blocks (D-07/08/10)
 * SSE 로 수신한 부가물(stock_card/citation/chart)은 본문 아래에 렌더 — 각 하위 컴포넌트
 * (MiniStockCard/Citation/MiniChart)에 위임. citation 은 "근거 뉴스" 그룹으로 묶는다.
 *
 * 스트리밍 중(streaming=true)에는 blocks 를 숨기고 부분 마크다운만 append 렌더한다
 * (완성 시점에 확정 — Phase 13 레이아웃 shift 최소화 교훈).
 *
 * 면책 문구는 사용자 결정(2026-07-02, 14-11 checkpoint)으로 전면 제거.
 */

import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MessageBlock } from "@gh-radar/shared";

import { TICKS_BASE } from "@/lib/ticks/tick-url";

import { MiniStockCard } from "./mini-stock-card";
import { Citation } from "./citation";
import { MiniChart } from "./mini-chart";

export interface MessageAssistantProps {
  content: string;
  /** SSE 부가물(카드/차트/인용). null/미전달이면 본문만 렌더. */
  blocks?: MessageBlock[] | null;
  /** 스트리밍 중 여부 — true 면 blocks 숨김(완성 시 확정). */
  streaming?: boolean;
}

const LINK_CLASS = "text-[var(--primary)] underline underline-offset-2";

/** 진단문 틱뷰어 딥링크(`/analytics/ticks?…`) — 같은 탭 내부 이동을 허용하는 유일한 내부 경로(D-04). */
function isTickViewerHref(href: string): boolean {
  return href.startsWith(`${TICKS_BASE}?`);
}

/** react-markdown 요소 → globals.css 토큰 스타일 매핑(채택 목업 기준). */
const MARKDOWN_COMPONENTS: Components = {
  h1: ({ children }) => (
    <h3 className="mb-[var(--s-2)] mt-[var(--s-3)] text-[length:var(--t-base)] font-semibold leading-[var(--lh-tight)]">
      {children}
    </h3>
  ),
  h2: ({ children }) => (
    <h3 className="mb-[var(--s-2)] mt-[var(--s-3)] text-[length:var(--t-base)] font-semibold leading-[var(--lh-tight)]">
      {children}
    </h3>
  ),
  h3: ({ children }) => (
    <h3 className="mb-[var(--s-2)] mt-[var(--s-3)] text-[length:var(--t-base)] font-semibold leading-[var(--lh-tight)]">
      {children}
    </h3>
  ),
  p: ({ children }) => <p className="my-[var(--s-2)]">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-[var(--s-2)] list-disc pl-[var(--s-4)]">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-[var(--s-2)] list-decimal pl-[var(--s-4)]">{children}</ol>
  ),
  li: ({ children }) => <li className="my-[2px]">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  a: ({ href, children }) => {
    if (typeof href === "string" && href.startsWith("/")) {
      return isTickViewerHref(href) ? (
        <Link href={href} className={LINK_CLASS}>
          {children}
        </Link>
      ) : (
        <span>{children}</span>
      );
    }
    return (
      <a href={href} target="_blank" rel="noreferrer" className={LINK_CLASS}>
        {children}
      </a>
    );
  },
  code: ({ children }) => (
    <code className="mono rounded-[var(--r-sm)] bg-[var(--muted)] px-1 py-0.5 text-[length:11px]">
      {children}
    </code>
  ),
  table: ({ children }) => (
    <div className="my-[var(--s-2)] overflow-x-auto">
      <table className="w-full border-collapse text-[length:var(--t-caption)]">
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-[var(--border)] bg-[var(--muted)] px-2 py-1.5 text-left font-semibold text-[var(--muted-fg)]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-[var(--border)] px-2 py-1.5 text-left">
      {children}
    </td>
  ),
};

export function MessageAssistant({
  content,
  blocks,
  streaming = false,
}: MessageAssistantProps) {
  const cards = blocks?.filter((b) => b.type === "stock_card") ?? [];
  const charts = blocks?.filter((b) => b.type === "chart") ?? [];
  const citations = blocks?.filter((b) => b.type === "citation") ?? [];

  return (
    <div className="flex flex-col gap-[var(--s-1)]">
      <div className="flex items-center gap-[var(--s-2)]">
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[length:11px] font-semibold text-[var(--primary-fg)]"
          aria-hidden="true"
        >
          AI
        </span>
        <span className="text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)]">
          팀장 애널리스트
        </span>
      </div>

      <div className="text-[length:var(--t-sm)] leading-relaxed text-[var(--fg)]">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={MARKDOWN_COMPONENTS}
        >
          {content}
        </ReactMarkdown>
      </div>

      {!streaming && (
        <>
          {cards.map((b, i) =>
            b.type === "stock_card" ? (
              <MiniStockCard
                key={`card-${i}`}
                code={b.code}
                name={b.name}
                price={b.price}
                changeRate={b.changeRate}
              />
            ) : null,
          )}

          {charts.map((b, i) =>
            b.type === "chart" ? (
              <MiniChart key={`chart-${i}`} code={b.code} />
            ) : null,
          )}

          {citations.length > 0 && (
            <div className="mt-[var(--s-2)]">
              <div className="mb-[var(--s-1)] text-[length:11px] font-semibold text-[var(--muted-fg)]">
                근거 뉴스
              </div>
              {citations.map((b, i) =>
                b.type === "citation" ? (
                  <Citation
                    key={`cite-${i}`}
                    title={b.title}
                    source={b.source}
                    url={b.url}
                    kind={b.kind}
                  />
                ) : null,
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
