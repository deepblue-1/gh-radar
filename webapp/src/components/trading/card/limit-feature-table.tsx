"use client";

/**
 * LimitFeatureTable — 상따 카드 탭 「상한가」 본문: 3줄 9칸 표 (Phase 28 · 28-01/28-07 · UI-SPEC ①-2 · WinForms `tblLimitFeature` 동형).
 *
 * - 행 「지금 · 10초 · 창구」 × 값 3칸. 칸 문구 · 색 축 · 폰 문구 · 툴팁은 shared `limitFeatureCells` ·
 *   `limitFeatureTooltip` 한 곳에서 나온다(WinForms `BuildLimitFeatureCells` · `ApplyLimitFeatureTable` 동형 —
 *   웹은 문구를 만들지 않는다). 85 가 없으면 9칸 모두 「—」(`--faint`) · title 없음.
 * - 폰 밴드 축약(D-03): 카드 컨테이너 `lc` 가 첫 경계(§2.2b — globals.css 머리 주석이 정본) 미만이면 잠김 중 10초 행
 *   칸 2 · 3 만 「신규 +1.2만」 · 「취소 -2,300」. 같은 칸 안 두 span 을 **CSS 컨테이너 쿼리로만** 가른다 —
 *   뷰포트 · 폭 측정 JS 없음(QuoteGrid10 규율). 그 밖 넘침은 말줄임 + 표 `title`(늘 넓은 밴드 문구).
 * - 카드 높이 불변(D-02) — 3행이 탭 본문 공통 고정 높이(`CARD_TABS_BODY_H` · 정보 탭 3줄)를 정확히 채운다.
 * - 1초마다 값만 바뀐다 — 강조 · 깜빡임 · 전환 애니메이션 없음. 칸은 `memo` 라 바뀐 칸만 다시 그린다. `title` 은
 *   React 가 같은 문자열이면 DOM 에 다시 쓰지 않는다(떠 있는 툴팁 깜빡임 방지).
 * - 접속 끊김(`isStale`): 값을 지우지 않고 `opacity .55` + `data-stale`(체결 테이프 문법).
 */

import { memo, useMemo } from "react";
import {
  LIMIT_FEATURE_ROW_HEADERS,
  limitFeatureCells,
  limitFeatureTooltip,
  type LimitFeatureCell,
  type LimitFeatureTone,
  type RelayLimitFeatureMsg,
} from "@gh-radar/shared";

import { cn } from "@/lib/utils";

/** 칸 tone → 글자색 (UI-SPEC Color 「의미 색 축」 — 새 토큰 0). `fg` 는 기본색이라 클래스가 없다. */
const TONE_CLASS: Record<LimitFeatureTone, string> = {
  up: "text-[var(--up)]",
  down: "text-[var(--down)]",
  fg: "",
  muted: "text-[var(--muted-fg)]",
  faint: "text-[var(--faint)]",
};

/** 칸 1개 — 문구 · 색 · 굵기 · 폰 문구가 같으면 다시 그리지 않는다(1초 갱신에 바뀐 칸만). */
const LimitFeatureCellView = memo(
  function LimitFeatureCellView({ cell }: { cell: LimitFeatureCell }) {
    return (
      <td
        data-slot="lc-limit-feature-cell"
        className={cn(
          "overflow-hidden px-2 py-0 text-left text-[12px] text-ellipsis whitespace-nowrap",
          cell.strong ? "font-semibold" : "font-normal",
          TONE_CLASS[cell.tone],
        )}
      >
        {cell.narrow === null ? (
          cell.text
        ) : (
          <>
            <span data-band="narrow" className="@min-[685px]/lc:hidden">
              {cell.narrow}
            </span>
            <span data-band="wide" className="hidden @min-[685px]/lc:inline">
              {cell.text}
            </span>
          </>
        )}
      </td>
    );
  },
  (a, b) =>
    a.cell.text === b.cell.text &&
    a.cell.tone === b.cell.tone &&
    a.cell.strong === b.cell.strong &&
    a.cell.narrow === b.cell.narrow,
);

export function LimitFeatureTable({
  feature,
  isStale = false,
}: {
  feature: RelayLimitFeatureMsg | null;
  /** relay 접속 끊김 — 값은 유지하고 감쇠만 한다. */
  isStale?: boolean;
}) {
  const cells = useMemo(() => limitFeatureCells(feature), [feature]);
  const tooltip = useMemo(() => limitFeatureTooltip(feature), [feature]);

  return (
    <table
      data-slot="lc-limit-feature"
      aria-label="상한가 특징"
      title={tooltip || undefined}
      data-stale={isStale ? "true" : undefined}
      className={cn("h-full w-full table-fixed border-collapse", isStale && "opacity-[.55]")}
    >
      <colgroup>
        <col className="w-11" />
        <col />
        <col />
        <col />
      </colgroup>
      <tbody>
        {LIMIT_FEATURE_ROW_HEADERS.map((head, row) => (
          <tr
            key={head}
            className={cn(row < LIMIT_FEATURE_ROW_HEADERS.length - 1 && "border-b border-[var(--border-subtle)]")}
          >
            <th
              scope="row"
              className="bg-[var(--muted)] px-2 py-0 text-left text-[11px] font-semibold whitespace-nowrap text-[var(--muted-fg)]"
            >
              {head}
            </th>
            {cells.slice(row * 3, row * 3 + 3).map((c, col) => (
              <LimitFeatureCellView key={col} cell={c} />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
