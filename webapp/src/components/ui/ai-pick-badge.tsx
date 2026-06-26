import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * AiPickBadge — 종목 행에 붙는 "AI 선정" 표식.
 *
 * theme_stocks.source === 'ai' 인 종목(네이버/알파스퀘어 큐레이션엔 없던, AI 가 추가로
 * 선정한 종목)을 리스트에서 구분하기 위한 인라인 칩. 테마 상세 헤더의 출처 뱃지
 * (ThemeSourceBadges 의 'ai' 분기)와 동일 시각 언어 — accent 칩 + primary 도트.
 *
 * **토큰 규칙(하드 룰):** globals.css 토큰만 — 신규 토큰/하드코딩 색상 금지.
 * accent 는 UI-SPEC 에서 AI 출처 전용으로 예약된 색.
 */
export function AiPickBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="default"
      aria-label="AI 선정 종목"
      title="AI 선정 종목"
      className={cn(
        'shrink-0 gap-1 border-transparent bg-[var(--accent)] text-[var(--accent-fg)]',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="inline-block size-1.5 rounded-full bg-[var(--primary)]"
      />
      AI
    </Badge>
  );
}
