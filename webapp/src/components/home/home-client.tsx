'use client';

import { useCallback, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useHomeQuery } from '@/hooks/use-home-query';

import { HomeEmpty } from './home-empty';
import { HomeHeader, type HomeSelection } from './home-header';
import { HomeSkeleton } from './home-skeleton';
import { SoloCard } from './solo-card';
import { ThemeCard } from './theme-card';

/**
 * HomeClient — 홈 최상위 배선 + 상태 머신 (13-UI-SPEC §States, HOME-01).
 *
 * 상태:
 *   loading (초기) → HomeSkeleton
 *   error (이전 data 없음) → 인라인 에러 카드("불러오지 못했습니다" / "다시 불러오기")
 *   error (이전 data 있음) → stale-but-visible + 하단 에러 카드 병기
 *   empty (snapshot null 또는 themes+singles 모두 비어있음) → HomeEmpty
 *   populated → HomeHeader + "주도 테마"(count-badge) ThemeCard + "개별 급등"(count-badge) SoloCard
 *
 * 네비: selected {date, capturedAt} state. onSelectDate/onSelectSlot/onToday → useHomeQuery 재조회.
 * error.message 미노출 (T-13-09) — 고정 문구 + console.error 는 훅에서 분리.
 *
 * 이 컴포넌트는 Plan 05 가 `/` 루트에 마운트한다(현재는 미마운트, 프리뷰/검증 전용).
 */
export function HomeClient() {
  const [selected, setSelected] = useState<HomeSelection | null>(null);

  const { data, isLoading, isRefreshing, error, refresh } = useHomeQuery(
    selected
      ? { date: selected.date, capturedAt: selected.capturedAt }
      : {},
  );

  const snapshot = data?.snapshot ?? null;
  // useMemo — index 안정 identity 로 아래 useCallback 재생성 방지 (data 불변 시 동일 참조).
  const index = useMemo(() => data?.index ?? [], [data]);

  // 날짜 전환 → 그 날짜의 최신(첫) 슬롯 capturedAt 선택.
  const handleSelectDate = useCallback(
    (date: string) => {
      const slot = index.find((e) => e.tradeDate === date);
      setSelected({ date, capturedAt: slot?.capturedAt ?? '' });
    },
    [index],
  );

  const handleSelectSlot = useCallback(
    (capturedAt: string) => {
      const entry = index.find((e) => e.capturedAt === capturedAt);
      if (entry) setSelected({ date: entry.tradeDate, capturedAt });
    },
    [index],
  );

  const handleToday = useCallback(() => {
    setSelected(null); // 무필터 → 최신 스냅샷
  }, []);

  const handleRetry = useCallback(() => {
    void refresh();
  }, [refresh]);

  // ── 초기 로딩 ──────────────────────────────────────────────
  if (isLoading) {
    return <HomeSkeleton />;
  }

  // ── 초기 에러 (이전 data 없음) ────────────────────────────
  if (error && !data) {
    return <HomeErrorCard onRetry={handleRetry} retrying={isRefreshing} />;
  }

  // populated 판정 — snapshot 있고 themes 또는 singles 존재.
  const payload = snapshot?.payload;
  const themes = payload?.themes ?? [];
  const singles = payload?.singles ?? [];
  const isEmpty = !snapshot || (themes.length === 0 && singles.length === 0);

  return (
    <div className="flex flex-col gap-[var(--s-4)]">
      <HomeHeader
        snapshot={snapshot}
        index={index}
        selected={selected}
        onSelectDate={handleSelectDate}
        onSelectSlot={handleSelectSlot}
        onToday={handleToday}
      />

      {isEmpty ? (
        <HomeEmpty />
      ) : (
        <>
          {themes.length > 0 && (
            <>
              <div className="mt-[var(--s-2)] flex items-center gap-2">
                <h2 className="text-[length:var(--t-h4)] font-extrabold text-[var(--fg)]">
                  주도 테마
                </h2>
                <span className="mono rounded-full bg-[var(--muted)] px-2 py-[2px] text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                  {themes.length}
                </span>
              </div>
              {themes.map((theme, i) => (
                <ThemeCard key={`${theme.name}-${i}`} theme={theme} />
              ))}
            </>
          )}

          {singles.length > 0 && (
            <>
              <div className="mt-[var(--s-2)] flex items-center gap-2">
                <h2 className="text-[length:var(--t-h4)] font-extrabold text-[var(--fg)]">
                  개별 급등
                </h2>
                <span className="mono rounded-full bg-[var(--muted)] px-2 py-[2px] text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                  {singles.length}
                </span>
              </div>
              {singles.map((single) => (
                <SoloCard key={single.code} single={single} />
              ))}
            </>
          )}
        </>
      )}

      {/* stale-but-visible: 이전 data 가 있는데 갱신 실패 시 하단 에러 카드 병기 */}
      {error && data && (
        <HomeErrorCard onRetry={handleRetry} retrying={isRefreshing} />
      )}
    </div>
  );
}

/**
 * 인라인 에러 카드 (scanner-error 패턴, T-13-09).
 * 고정 카피 — error.message 미노출. heading "불러오지 못했습니다".
 */
function HomeErrorCard({
  onRetry,
  retrying,
}: {
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-[var(--r-lg)] bg-[var(--card)] p-6"
      style={{
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: 'color-mix(in oklch, var(--destructive) 40%, var(--border))',
      }}
    >
      <div className="flex flex-col gap-1 text-[length:var(--t-sm)]">
        <p className="font-extrabold text-[var(--fg)]">불러오지 못했습니다</p>
        <p className="text-[var(--muted-fg)]">잠시 후 다시 시도해 주세요.</p>
      </div>
      <div>
        <Button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          aria-label="홈 데이터 다시 불러오기"
        >
          <RefreshCw
            aria-hidden="true"
            className={retrying ? 'size-4 animate-spin' : 'size-4'}
          />
          {retrying ? '다시 불러오는 중...' : '다시 불러오기'}
        </Button>
      </div>
    </div>
  );
}
