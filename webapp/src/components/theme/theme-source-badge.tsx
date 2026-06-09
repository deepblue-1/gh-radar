import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ThemeStockSource } from '@gh-radar/shared';

/**
 * Phase 10 Plan 07 — 테마 출처 뱃지 (UI-SPEC §Color "출처 뱃지 도트").
 *
 * 시스템 테마는 다중 출처(naver/alphasquare/ai)를 가질 수 있어 sources[] 를 받아
 * 각 출처를 뱃지 1개 + 도트로 렌더한다. 유저 테마(source='user')는 표시하지 않는다.
 *
 * **토큰 규칙 (하드 룰):** globals.css 토큰만 사용 — 신규 토큰/하드코딩 색상 금지.
 * UI-SPEC 목업은 도트에 인라인 oklch(green/purple)를 썼으나, 프로젝트 하드 룰
 * (STATE decisions · MEMORY · 본 plan 제약)이 목업 리터럴보다 우선한다. 따라서
 * 세 출처를 **토큰 기반으로 시각 구분**한다:
 *   - naver       → outline 뱃지 + `--flat` 도트 (중립)
 *   - alphasquare → outline 뱃지 + `--down` 도트 (블루, 목업 정확 일치 oklch 0.63 0.18 250)
 *   - ai          → accent 뱃지 + `--primary` 도트 (Accent 는 UI-SPEC 에서 AI 출처 전용으로 예약됨)
 */

const SOURCE_LABEL: Record<Exclude<ThemeStockSource, 'user'>, string> = {
  naver: '네이버',
  alphasquare: '알파스퀘어',
  ai: 'AI',
};

/** 토큰 기반 도트 색 (신규 토큰 없음). */
const SOURCE_DOT: Record<Exclude<ThemeStockSource, 'user'>, string> = {
  naver: 'bg-[var(--flat)]',
  alphasquare: 'bg-[var(--down)]',
  ai: 'bg-[var(--primary)]',
};

export interface ThemeSourceBadgesProps {
  sources: ThemeStockSource[];
  className?: string;
}

/** 표시 가능한 시스템 출처만(naver/alphasquare/ai) — 'user' 는 제외. */
function displaySources(
  sources: ThemeStockSource[],
): Exclude<ThemeStockSource, 'user'>[] {
  return sources.filter(
    (s): s is Exclude<ThemeStockSource, 'user'> => s !== 'user',
  );
}

export function ThemeSourceBadges({ sources, className }: ThemeSourceBadgesProps) {
  const shown = displaySources(sources);
  if (shown.length === 0) return null;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {shown.map((src) => (
        <Badge
          key={src}
          variant={src === 'ai' ? 'default' : 'outline'}
          className={cn(
            'gap-1',
            src === 'ai' &&
              'bg-[var(--accent)] text-[var(--accent-fg)] border-transparent',
          )}
        >
          <span
            aria-hidden="true"
            className={cn('inline-block size-1.5 rounded-full', SOURCE_DOT[src])}
          />
          {SOURCE_LABEL[src]}
        </Badge>
      ))}
    </span>
  );
}
