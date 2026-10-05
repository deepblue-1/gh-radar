"use client";

/**
 * LimitFeatureTable — 상따 카드 탭 「상한가」 본문: 3줄 9칸 표 (Phase 28 · 28-01 · UI-SPEC ①-2 · WinForms `tblLimitFeature` 동형).
 *
 * - 행 「지금 · 10초 · 창구」 × 값 3칸. 칸 문구 · 색 축은 shared `limitFeatureCells` 한 곳에서 나온다(WinForms
 *   `BuildLimitFeatureCells` 동형 — 서버 값 그대로 · 단위 변환만). 85 가 없으면 9칸 모두 「—」(`--faint`).
 * - 카드 높이 불변(D-02) — 3행이 탭 본문 공통 고정 높이(`CARD_TABS_BODY_H` · 정보 탭 3줄)를 정확히 채운다.
 *   스크롤이 생기지 않는다.
 * - 1초마다 값만 바뀐다 — 강조 · 깜빡임 · 전환 애니메이션 없음.
 * - 툴팁 · 폰 밴드 축약 · 접속 끊김(`isStale`) 표기 · 10초/창구 행 문구는 28-07 이 채운다.
 */

import { useMemo } from "react";
import { limitFeatureCells, type LimitFeatureTone, type RelayLimitFeatureMsg } from "@gh-radar/shared";

import { cn } from "@/lib/utils";

const ROW_HEADS = ["지금", "10초", "창구"] as const;

/** 칸 tone → 글자색 (UI-SPEC Color 「의미 색 축」 — 새 토큰 0). `fg` 는 기본색이라 클래스가 없다. */
const TONE_CLASS: Record<LimitFeatureTone, string> = {
  up: "text-[var(--up)]",
  down: "text-[var(--down)]",
  fg: "",
  muted: "text-[var(--muted-fg)]",
  faint: "text-[var(--faint)]",
};

export function LimitFeatureTable({ feature }: { feature: RelayLimitFeatureMsg | null }) {
  const cells = useMemo(() => limitFeatureCells(feature), [feature]);

  return (
    <table
      data-slot="lc-limit-feature"
      aria-label="상한가 특징"
      className="h-full w-full table-fixed border-collapse"
    >
      <colgroup>
        <col className="w-11" />
        <col />
        <col />
        <col />
      </colgroup>
      <tbody>
        {ROW_HEADS.map((head, row) => (
          <tr key={head} className={cn(row < ROW_HEADS.length - 1 && "border-b border-[var(--border-subtle)]")}>
            <th
              scope="row"
              className="bg-[var(--muted)] px-2 py-0 text-left text-[11px] font-semibold whitespace-nowrap text-[var(--muted-fg)]"
            >
              {head}
            </th>
            {cells.slice(row * 3, row * 3 + 3).map((c, col) => (
              <td
                key={col}
                data-slot="lc-limit-feature-cell"
                className={cn(
                  "overflow-hidden px-2 py-0 text-left text-[12px] text-ellipsis whitespace-nowrap",
                  c.strong ? "font-semibold" : "font-normal",
                  TONE_CLASS[c.tone],
                )}
              >
                {c.text}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
