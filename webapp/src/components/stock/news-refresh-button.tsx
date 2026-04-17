import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * NewsRefreshButton — Phase 07 UI-SPEC §Component Inventory.
 *
 * 3 states:
 *  - idle: RefreshCw 아이콘 + `aria-label="뉴스 새로고침"`
 *  - refreshing: 아이콘 `animate-spin` + `aria-busy=true` + `aria-label="뉴스 새로고침 중"`
 *  - cooldown (`cooldownSeconds > 0`): `{N}s` 텍스트 + `aria-label="{N}초 후 새로고침 가능"`
 *
 * 서버 429 의 `retry_after_seconds` 는 호출자(StockNewsSection)에서 전달된 `cooldownSeconds`
 * prop 에 이미 반영된다.
 */
export interface NewsRefreshButtonProps {
  onRefresh: () => void;
  isRefreshing: boolean;
  cooldownSeconds: number;
}

export function NewsRefreshButton({
  onRefresh,
  isRefreshing,
  cooldownSeconds,
}: NewsRefreshButtonProps) {
  const isCooldown = cooldownSeconds > 0;
  const disabled = isRefreshing || isCooldown;
  const ariaLabel = isCooldown
    ? `${cooldownSeconds}초 후 새로고침 가능`
    : isRefreshing
      ? '뉴스 새로고침 중'
      : '뉴스 새로고침';

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
      data-testid="news-refresh-button"
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
