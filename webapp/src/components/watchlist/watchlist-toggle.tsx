'use client';

import { Star } from 'lucide-react';
import {
  useEffect,
  useState,
  useTransition,
  type MouseEvent,
} from 'react';

import { Toggle } from '@/components/ui/toggle';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { useWatchlistSet } from '@/hooks/use-watchlist-set';
import { cn } from '@/lib/utils';

/**
 * Phase 06.2 Plan 07 Task 2 — WatchlistToggle (Ghost variant).
 *
 * 관심종목 ⭐ 토글. 5개 위치(StockHero, Scanner Table, Scanner Card, Watchlist Table,
 * Watchlist Card)에서 동일 컴포넌트로 재사용된다.
 *
 * UI 규칙 (UI-SPEC §5 Ghost variant):
 * - pressed 시 배경색 변화 없음 (hover/on 배경 transparent 오버라이드)
 * - unset: outline star (muted-fg/70) → hover primary
 * - set: filled star + text-primary
 * - loading (optimistic 진행중): `aria-busy` + `animate-pulse`
 * - disabled (50 limit + unset): `title` 툴팁 + opacity-40
 * - aria-label: 상태별 "{종목명} 관심종목 추가/해제"
 *
 * 에러 처리:
 * - P0001 `watchlist_limit_exceeded` → 롤백 + "관심종목은 최대 50개까지 저장할 수 있습니다."
 * - 23505 unique_violation → silent (이미 존재하는 row — set 상태 유지)
 * - 기타 → 롤백 + "관심종목 변경에 실패했습니다." 2초 후 자동 소거
 *
 * 이벤트 격리:
 * - 최상위 `<span>` 에 stopPropagation — Scanner Table 의 행 Link 또는
 *   InfoStockCard 의 Link 내부에서 토글 클릭이 상세 페이지 이동을 유발하지 않도록 방어.
 *
 * 비로그인:
 * - `user` 없으면 `null` 반환 — 로그인 사용자에게만 노출.
 */

export interface WatchlistToggleProps {
  /** 관심종목 대상 stock_code. Watchlist PK 일부. */
  stockCode: string;
  /** 스크린 리더용 — aria-label 템플릿 "{stockName} 관심종목 추가/해제". */
  stockName: string;
  /** 테스트/명시적 override 를 위한 옵션. 기본값은 useWatchlistSet 의 set 기반. */
  initialPressed?: boolean;
  /** Toggle size prop 전달 (Hero 는 default, 표 셀 내부도 default 36×36). */
  size?: 'default' | 'sm' | 'lg';
}

const LIMIT_MESSAGE = '관심종목은 최대 50개까지 저장할 수 있습니다.';
const FAIL_MESSAGE = '관심종목 변경에 실패했습니다.';

function isLimitError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === 'P0001') return true;
  // 에러 코드 누락 시 메시지 기반 폴백 — 서버가 반환하는 RAISE 메시지는 고정.
  if (err.message && err.message.includes('watchlist_limit_exceeded')) return true;
  return false;
}

export function WatchlistToggle({
  stockCode,
  stockName,
  initialPressed,
  size = 'default',
}: WatchlistToggleProps) {
  const { user } = useAuth();
  const ws = useWatchlistSet();
  const [localPressed, setLocalPressed] = useState<boolean | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const pressedFromSet = ws.set.has(stockCode);
  const pressed = localPressed ?? initialPressed ?? pressedFromSet;

  // 에러는 2초 후 자동 소거 (UI-SPEC "rollback 알림 2초 후 자동 소거")
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 2000);
    return () => clearTimeout(t);
  }, [error]);

  // ws.set 이 서버 동기화 후 변한 경우, localPressed 는 이제 불필요 — null 로 복귀
  useEffect(() => {
    if (localPressed !== null && localPressed === pressedFromSet) {
      setLocalPressed(null);
    }
  }, [localPressed, pressedFromSet]);

  if (!user) return null;

  const isLimitDisabled = !pressed && ws.isAtLimit;

  const handlePressedChange = (next: boolean) => {
    // optimistic UI — 즉시 반전
    setLocalPressed(next);
    setError(null);

    startTransition(async () => {
      const supabase = createClient();
      if (next) {
        ws.optimisticAdd(stockCode);
        const { error: err } = await supabase
          .from('watchlists')
          .insert({ user_id: user.id, stock_code: stockCode });
        if (err) {
          if (err.code === '23505') {
            // 이미 존재 — set 상태 유지 (silent)
          } else if (isLimitError(err)) {
            ws.optimisticRemove(stockCode);
            setLocalPressed(false);
            setError(LIMIT_MESSAGE);
          } else {
            ws.optimisticRemove(stockCode);
            setLocalPressed(false);
            setError(FAIL_MESSAGE);
          }
        } else {
          void ws.refresh();
        }
      } else {
        ws.optimisticRemove(stockCode);
        const { error: err } = await supabase
          .from('watchlists')
          .delete()
          .eq('user_id', user.id)
          .eq('stock_code', stockCode);
        if (err) {
          ws.optimisticAdd(stockCode);
          setLocalPressed(true);
          setError(FAIL_MESSAGE);
        } else {
          void ws.refresh();
        }
      }
    });
  };

  const stopPropagation = (e: MouseEvent) => {
    // Scanner Table 의 행 Link / InfoStockCard 의 Link 중첩 차단
    e.stopPropagation();
  };

  return (
    <span
      className="inline-flex flex-col items-end gap-0.5"
      onClick={stopPropagation}
    >
      <Toggle
        pressed={pressed}
        onPressedChange={handlePressedChange}
        disabled={isPending || isLimitDisabled}
        aria-label={
          pressed
            ? `${stockName} 관심종목 해제`
            : `${stockName} 관심종목 추가`
        }
        aria-busy={isPending || undefined}
        size={size}
        className={cn(
          // Ghost variant: pressed 시에도 배경 없음
          'data-[state=on]:bg-transparent hover:bg-transparent',
          size === 'default' && 'size-9',
          pressed
            ? 'text-[var(--primary)]'
            : 'text-[var(--muted-fg)]/70 hover:text-[var(--primary)]',
          isPending && 'animate-pulse',
          isLimitDisabled && 'opacity-40',
        )}
        title={isLimitDisabled ? LIMIT_MESSAGE : undefined}
      >
        <Star
          className={cn('size-4', pressed && 'fill-[var(--primary)]')}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </Toggle>
      {error && (
        <span
          role="alert"
          className="text-[11px] text-[var(--destructive)]"
        >
          {error}
        </span>
      )}
    </span>
  );
}
