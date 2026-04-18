import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * DiscussionRefreshButton — Phase 08 UI-SPEC §Component Inventory.
 *
 * Phase 7 NewsRefreshButton 구조 1:1 복제 — copy 만 토론방 용어로 교체.
 * 공통 추상화 (`RefreshButton + kind` prop) 는 Deferred (CONTEXT "섹션 컴포넌트 공통 추상화").
 *
 * 3 states:
 *  - idle: RefreshCw 아이콘 + `aria-label="토론방 새로고침"`
 *  - refreshing: 아이콘 `animate-spin` + `aria-busy=true` + `aria-label="토론방 새로고침 중"`
 *  - cooldown (`cooldownSeconds > 0`): `{N}s` 텍스트 + `aria-label="{N}초 후 새로고침 가능"`
 *
 * 서버 429 의 `retry_after_seconds` 는 호출자(StockDiscussionSection)에서 전달된 `cooldownSeconds`
 * prop 에 이미 반영된다.
 */
export interface DiscussionRefreshButtonProps {
  onRefresh: () => void;
  isRefreshing: boolean;
  cooldownSeconds: number;
}

export function DiscussionRefreshButton({
  onRefresh,
  isRefreshing,
  cooldownSeconds,
}: DiscussionRefreshButtonProps) {
  const isCooldown = cooldownSeconds > 0;
  const disabled = isRefreshing || isCooldown;
  const ariaLabel = isCooldown
    ? `${cooldownSeconds}초 후 새로고침 가능`
    : isRefreshing
      ? '토론방 새로고침 중'
      : '토론방 새로고침';

  return (
    <Button
      type="button"
      onClick={onRefresh}
      disabled={disabled}
      variant="outline"
      size="sm"
      className="size-8 p-0"
      aria-label={ariaLabel}
      aria-busy={isRefreshing}
      data-remaining-seconds={isCooldown ? cooldownSeconds : undefined}
      data-testid="discussion-refresh-button"
    >
      {isCooldown ? (
        <span className="mono text-[10px]">{cooldownSeconds}s</span>
      ) : (
        <RefreshCw
          className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`}
          aria-hidden="true"
        />
      )}
    </Button>
  );
}
