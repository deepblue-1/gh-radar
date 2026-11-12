/**
 * Phase 42 봉 차트 카드 아래 캡션 줄(D-17 · UI-SPEC S9) — 구간 합계 줄 아래 · 데스크톱 안내 줄 위.
 *
 * 항목(있는 것만 · 이 순서): 폰 우리 범례(「◆ 우리 체결」 · 「○ 조건 근거」 — 선 차트 범례 견본 모양 그대로 · 폰 제목 줄에서 옮김)
 * → `items`(누적 캡션 → 선을 못 그림 안내 — `candleCaptionOf` 가 순서를 정한다). 넘치면 아래 줄로(`flex-wrap`) · 잘리지 않는다.
 * 보일 것이 하나도 없으면 줄 자체가 없다(null).
 */

export interface CandleChartCaptionProps {
  phone: boolean;
  /** 우리 점이 하루에 하나라도 있나 — 폰에서만 이 줄에 범례를 둔다(데스크톱은 제목 줄). */
  ownLegend: boolean;
  /** 캡션 글자(`candleCaptionOf`). */
  items: readonly string[];
}

export function CandleChartCaption({ phone, ownLegend, items }: CandleChartCaptionProps) {
  const legend = phone && ownLegend;
  if (!legend && items.length === 0) return null;
  return (
    <div
      data-slot="candle-chart-caption"
      className="flex flex-wrap gap-x-3 gap-y-1 border-t border-[var(--border-subtle)] px-3 py-2 text-[11px] text-[var(--muted-fg)]"
    >
      {legend && (
        <>
          <span data-slot="candle-caption-own" className="inline-flex items-center gap-1 whitespace-nowrap text-[var(--mine-fg)]">
            <i aria-hidden="true" className="inline-block size-[7px] rotate-45 rounded-[1px] bg-[var(--mine)]" />
            우리 체결
          </span>
          <span data-slot="candle-caption-own" className="inline-flex items-center gap-1 whitespace-nowrap text-[var(--mine-fg)]">
            <i aria-hidden="true" className="inline-block size-2 rounded-full border-[1.5px] border-[var(--mine)]" />
            조건 근거
          </span>
        </>
      )}
      {items.map((text) => (
        <span key={text} data-slot="candle-caption-item">
          {text}
        </span>
      ))}
    </div>
  );
}
