'use client';

import type { TeamflowRow } from '@gh-radar/shared';

import { factLineOf, summaryPartsOf } from '@/lib/teamflow-report';

/**
 * 팀 매집 펼친 상세 (Phase 33 · UI-SPEC T5 — 요약 블록 · D-14).
 *
 * - 루트 `section#tf-{isin}` · `aria-labelledby` = 행 버튼 id(`labelledBy` — 부모 DayGrid 가 `teamflowRowButtonId` 로 준다 ·
 *   import 순환을 피하려 prop 으로 받는다) · 열린 행 바로 아래에만 마운트된다(접으면 언마운트).
 * - 요약 상자: `summary_lines` 번호 목록(1~N · export 순서 · 개수 제한 없음 — 상자가 세로로 늘어난다) → 사실 줄.
 *   문장은 HTML 문자열을 주입하지 않고 `summaryPartsOf` 조각 배열을 React 요소로 그린다(`<b>` 짝만 strong).
 *   summary_lines 가 비면 번호 목록 없이 사실 줄만, 사실 줄도 없으면 상자를 그리지 않는다.
 * - 뒤 플랜(33-05 · 33-06)이 구간 차트 · 거래원 · 10분 흐름 · 판정 기준 블록을 아래에 덧붙인다(세로 블록 사이 16px).
 */
export function TeamflowDetail({ row, labelledBy }: { row: TeamflowRow; labelledBy: string }) {
  const lines = row.payload?.summary_lines ?? [];
  const fact = factLineOf(row);
  const hasSummary = lines.length > 0 || fact !== null;

  return (
    <section
      id={`tf-${row.isin}`}
      aria-labelledby={labelledBy}
      data-slot="teamflow-detail"
      className="flex flex-col gap-4 px-2 pt-1 pb-6"
    >
      {hasSummary && (
        <div
          data-slot="teamflow-summary"
          className="rounded-[var(--r)] bg-[color-mix(in_oklab,var(--muted)_55%,transparent)] px-3.5 py-3 break-keep"
        >
          {lines.length > 0 && (
            <ol className="m-0 flex list-none flex-col gap-1 p-0">
              {lines.map((line, i) => (
                <li key={i} className="grid grid-cols-[20px_minmax(0,1fr)] gap-2">
                  <span
                    aria-hidden="true"
                    className="mono mt-0.5 grid size-5 place-items-center rounded-full bg-[var(--muted)] text-[11px] font-semibold text-[var(--fg-2)]"
                  >
                    {i + 1}
                  </span>
                  <p className="m-0 text-[length:var(--t-sm)] text-[var(--fg-2)]">
                    {summaryPartsOf(line).map((p, k) =>
                      p.strong ? (
                        <strong key={k} className="font-semibold text-[var(--fg)]">
                          {p.text}
                        </strong>
                      ) : (
                        <span key={k}>{p.text}</span>
                      ),
                    )}
                  </p>
                </li>
              ))}
            </ol>
          )}
          {fact !== null && (
            <p
              data-slot="teamflow-fact"
              className={`mono m-0 text-[length:var(--t-caption)] text-[var(--muted-fg)]${lines.length > 0 ? ' mt-1' : ''}`}
            >
              {fact}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
