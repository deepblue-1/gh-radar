'use client';

import { useCallback, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';

import { SECTION_COUNT, SECTION_TITLE } from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import { useHomeQuery } from '@/hooks/use-home-query';
import { useNativeRefresh } from '@/lib/native/use-native-refresh';

import { CopyTextButton } from './copy-text-button';
import { HomeEmpty } from './home-empty';
import { formatSinglesSummary, formatThemesSummary } from './home-format';
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
 *   populated → HomeHeader + "주도 테마"(count-badge + 우측 '전체 복사' 버튼 — 보고 있는 스냅샷의
 *               모든 테마 요약을 일반 텍스트로 복사, quick-260914-jtj) ThemeCard
 *               + "개별 급등"(count-badge + 우측 '전체 복사' — 보고 있는 스냅샷의 개별 급등 전체,
 *                 quick-260923-cre) SoloCard(카드별 급등이유 복사 아이콘)
 *
 * 네비: selected {date, capturedAt} state. onSelectDate/onSelectSlot/onToday → useHomeQuery 재조회.
 * error.message 미노출 (T-13-09) — 고정 문구 + console.error 는 훅에서 분리.
 *
 * 이 컴포넌트는 Plan 05 가 `/` 루트에 마운트한다(현재는 미마운트, 프리뷰/검증 전용).
 */
export function HomeClient() {
  const [selected, setSelected] = useState<HomeSelection | null>(null);

  // 자동 갱신은 최신 보기에서만 — 과거 슬롯/날짜 탐색 중 폴링하면 화면이 점프한다.
  const { data, isLoading, isRefreshing, error, refresh } = useHomeQuery(
    selected
      ? { date: selected.date, capturedAt: selected.capturedAt }
      : {},
    { autoRefresh: selected === null },
  );
  // D-04 — 앱 당겨서 새로고침은 지금 보고 있는 스냅샷만 다시 읽는다(웹 브라우저에서는 등록만).
  useNativeRefresh(refresh);

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
          {/* snapshot null 이면 themes 도 비어 런타임 동일 — snapshot 타입 narrowing 용. */}
          {/*
            quick-260926-o2u D4 — 섹션 머리 = 15px 제목 + 평문 개수 + 복사. 카드는 1열 그대로.
            ★ 머리 행과 첫 카드 사이는 D4 의 8px 이 아니라 20px(`gap-5`)이다. 카드 복사 아이콘의 「복사됨」
              말풍선이 카드 위로 약 17.5px 떠서(copy-text-button bottom-full), 8px 이면 머리 행 「전체 복사」를
              약 9px 가린다(390 실측 · home.spec 「개별 급등 복사」 불변식). 20px 이면 2.5px 비켜 간다.
          */}
          {snapshot && themes.length > 0 && (
            <section aria-labelledby="home-themes-title" className="flex flex-col gap-5">
              <div className="flex items-center gap-1.5">
                <h2 id="home-themes-title" className={SECTION_TITLE}>
                  주도 테마
                </h2>
                <span className={SECTION_COUNT}>{themes.length}</span>
                {/* getText lazy — 과거 슬롯을 보고 있으면 그 스냅샷을 복사. */}
                <CopyTextButton
                  label="전체 복사"
                  ariaLabel="주도 테마 전체 복사"
                  getText={() => formatThemesSummary(snapshot, themes)}
                  className="ml-auto"
                />
              </div>
              <div className="flex flex-col gap-[var(--s-4)]">
                {themes.map((theme, i) => (
                  <ThemeCard key={`${theme.name}-${i}`} theme={theme} />
                ))}
              </div>
            </section>
          )}

          {/* snapshot null 이면 singles 도 비어 런타임 동일 — snapshot 타입 narrowing 용. */}
          {snapshot && singles.length > 0 && (
            <section aria-labelledby="home-singles-title" className="flex flex-col gap-5">
              <div className="flex items-center gap-1.5">
                <h2 id="home-singles-title" className={SECTION_TITLE}>
                  개별 급등
                </h2>
                <span className={SECTION_COUNT}>{singles.length}</span>
                {/* getText lazy — 과거 슬롯을 보고 있으면 그 스냅샷을 복사. */}
                <CopyTextButton
                  label="전체 복사"
                  ariaLabel="개별 급등 전체 복사"
                  getText={() => formatSinglesSummary(snapshot, singles)}
                  className="ml-auto"
                />
              </div>
              <div className="flex flex-col gap-[var(--s-4)]">
                {singles.map((single) => (
                  <SoloCard key={single.code} single={single} />
                ))}
              </div>
            </section>
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
        <p className="font-bold text-[var(--fg)]">불러오지 못했습니다</p>
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
