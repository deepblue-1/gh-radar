'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock, Layers, Search, Star, TrendingUp, X, type LucideIcon } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { useWatchlistSet } from '@/hooks/use-watchlist-set';
import { useNativeRefresh } from '@/lib/native/use-native-refresh';
import {
  clearRecentSearches,
  pushRecentSearch,
  readRecentSearches,
  removeRecentSearch,
  type RecentSearchItem,
} from '@/lib/recent-search';
import { fetchScannerStocks, type StockWithProximity } from '@/lib/scanner-api';
import { DEFAULT_SCANNER_STATE } from '@/lib/scanner-query';
import { fetchSystemThemes } from '@/lib/theme-api';
import { cn } from '@/lib/utils';

/**
 * SearchPageClient — `/search` 「탐색 허브」 (Phase 21 D-07 · D-07a, 스케치 005 B 채택안).
 *
 * 앱 「검색」 탭의 목적지이자 웹 신규 페이지다 — 앱 전용 분기 없이 같은 페이지를 두 클라이언트가 쓴다.
 * 수치 정본은 `.planning/sketches/005-search-page-me-account/README.md` 「결정」.
 *
 * ① 입력 빈칸 = 허브: 타일 3열(상승률 상위 · 테마 · 관심종목, 실데이터 보조 문구) → 최근 검색 →
 *    「지금 상승률 상위」 5행 + 「더보기 ›」.
 * ② 입력 중(공백 제외 1자↑) = 결과 카드만. 결과·문구·분기는 ⌘K GlobalSearch 와 **같은 데이터 경로**
 *    (`useDebouncedSearch` → `searchStocks` → `/api/stocks/search`)와 같은 문자열이다 — 새 검색 경로를
 *    만들지 않는다(서버 필터가 곧 두 표면의 필터다).
 * ③ 허브 데이터는 마운트 1회 + 네이티브 당김(D-04)으로만 읽는다 — 자동 폴링·타이머 없음(T-21-33).
 *    두 호출은 `Promise.allSettled` 라 한쪽 실패는 그 칸만 「—」/조용한 안내로 수렴한다. 이미 받은 값이
 *    있으면 재조회 실패가 그 값을 지우지 않는다.
 * ④ 최근 검색은 마운트 후에 읽는다(SSR 하이드레이션 일치). 저장 실패는 화면을 막지 않는다.
 * ⑤ 레이아웃은 셸 층 뷰포트 유틸만 쓴다 — 상따 화면의 §2.2b 컨테이너 밴드와 무관하다.
 */

const SURGE_THRESHOLD = 25;
const PREVIEW_COUNT = 5;

type Slot<T> = { status: 'loading' } | { status: 'ok'; value: T } | { status: 'error' };

interface ScannerPreview {
  top: StockWithProximity[];
  surge: number;
}

function settle<T>(prev: Slot<T>, result: PromiseSettledResult<T>): Slot<T> {
  if (result.status === 'fulfilled') return { status: 'ok', value: result.value };
  // 재조회 실패가 이미 보여 준 값을 지우지 않는다.
  return prev.status === 'ok' ? prev : { status: 'error' };
}

function rateClass(rate: number): string {
  if (rate > 0) return 'text-[var(--up)]';
  if (rate < 0) return 'text-[var(--down)]';
  return 'text-[var(--flat)]';
}

function formatRate(rate: number): string {
  return `${rate > 0 ? '+' : ''}${rate.toFixed(2)}%`;
}

const CARD = 'rounded-[16px] bg-[var(--card)]';
const SECTION_TITLE = 'text-[15px] font-semibold text-[var(--muted-fg)]';
const ROW_DIVIDER = '[&+&]:border-t [&+&]:border-[var(--border-subtle)]';

export function SearchPageClient() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const trimmed = query.trim();
  const typing = trimmed.length > 0;
  const { results, loading, error } = useDebouncedSearch(query, 300);

  /*
    「응답이 도착한 검색어」 — 입력 직후 디바운스 300ms 동안은 아직 요청 전이라 hook 이
    loading=false · results=[] 를 돌려준다. 그 틈에 「해당하는 종목이 없습니다」가 번쩍이지 않게
    응답(성공·실패·비움)이 올 때마다 그 순간의 검색어를 기록하고, 다르면 「검색 중…」으로 본다.
  */
  const [settledQuery, setSettledQuery] = useState('');
  const trimmedRef = useRef(trimmed);
  trimmedRef.current = trimmed;
  useEffect(() => {
    if (!loading) setSettledQuery(trimmedRef.current);
  }, [loading, results, error]);
  const pending = typing && trimmed !== settledQuery;
  const showLoading = loading || pending;
  const showEmpty = typing && !showLoading && !error && results.length === 0;

  const [recent, setRecent] = useState<RecentSearchItem[]>([]);
  useEffect(() => {
    setRecent(readRecentSearches());
  }, []);

  const { count: watchCount } = useWatchlistSet();
  const [scanner, setScanner] = useState<Slot<ScannerPreview>>({ status: 'loading' });
  const [themeCount, setThemeCount] = useState<Slot<number>>({ status: 'loading' });
  const hubAbortRef = useRef<AbortController | null>(null);

  const loadHub = useCallback(async () => {
    hubAbortRef.current?.abort();
    const controller = new AbortController();
    hubAbortRef.current = controller;
    const [scan, themes] = await Promise.allSettled([
      fetchScannerStocks(DEFAULT_SCANNER_STATE, controller.signal).then(({ stocks }) => ({
        top: stocks.slice(0, PREVIEW_COUNT),
        surge: stocks.filter((s) => s.changeRate >= SURGE_THRESHOLD).length,
      })),
      fetchSystemThemes().then((list) => list.length),
    ]);
    if (controller.signal.aborted) return;
    setScanner((prev) => settle(prev, scan));
    setThemeCount((prev) => settle(prev, themes));
  }, []);

  useEffect(() => {
    void loadHub();
    return () => hubAbortRef.current?.abort();
  }, [loadHub]);

  // D-04 — 앱 당김은 허브(미리보기·카운트)를 다시 읽는다. 웹 브라우저에서는 등록만 된다.
  useNativeRefresh(loadHub);

  const selectResult = useCallback(
    (item: { code: string; name: string; market?: string }) => {
      setRecent(pushRecentSearch({ code: item.code, name: item.name, market: item.market }));
      router.push(`/stocks/${item.code}`);
    },
    [router],
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const first = results[0];
    if (typing && !showLoading && first) selectResult(first);
  };

  const clearQuery = () => {
    setQuery('');
    inputRef.current?.focus();
  };

  const surgeLabel =
    scanner.status === 'ok' ? `${SURGE_THRESHOLD}%↑ ${scanner.value.surge}종목` : scanner.status === 'error' ? '—' : '…';
  const themeLabel =
    themeCount.status === 'ok' ? `오늘 ${themeCount.value}개` : themeCount.status === 'error' ? '—' : '…';

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4">
      <h1 className="mt-1.5 text-[22px] font-bold tracking-[-0.02em] text-[var(--fg)]">검색</h1>

      <form role="search" onSubmit={handleSubmit} className="-mt-1">
        <div className="flex h-12 items-center gap-2.5 rounded-[14px] bg-[var(--muted)] pl-3.5 pr-2 text-[var(--muted-fg)] focus-within:ring-2 focus-within:ring-[var(--ring)]">
          <Search className="size-5 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="종목 검색"
            placeholder="종목명 또는 코드"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-[var(--fg)] outline-none placeholder:text-[var(--muted-fg)] [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query.length > 0 && (
            <button
              type="button"
              aria-label="검색어 지우기"
              onClick={clearQuery}
              className="flex size-8 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <span className="flex size-[18px] items-center justify-center rounded-full bg-[var(--raised-2)] text-[var(--fg)]">
                <X className="size-3" strokeWidth={2.6} aria-hidden="true" />
              </span>
            </button>
          )}
        </div>
      </form>

      {typing ? (
        <section aria-label="검색 결과" className={cn(CARD, 'px-4 py-1')}>
          {showLoading && (
            <p className="py-3 text-[length:var(--t-sm)] text-[var(--muted-fg)]">검색 중…</p>
          )}
          {error && !showLoading && (
            <p className="py-3 text-[length:var(--t-sm)] text-[var(--destructive)]">
              검색에 실패했습니다. 잠시 후 다시 시도해 주세요.
            </p>
          )}
          {showEmpty && (
            <p className="py-3 text-[length:var(--t-sm)] text-[var(--muted-fg)]">
              &quot;{query}&quot; 에 해당하는 종목이 없습니다
            </p>
          )}
          {results.length > 0 && (
            <ul className="m-0 list-none p-0">
              {results.map((s) => (
                <li key={s.code} className={ROW_DIVIDER}>
                  <button
                    type="button"
                    onClick={() => selectResult(s)}
                    className="flex h-[52px] w-full min-w-0 items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                      <span className="truncate text-[15px] font-semibold text-[var(--fg)]">
                        {s.name}
                      </span>
                      <span className="mono shrink-0 text-[12.5px] text-[var(--muted-fg)]">
                        {s.code}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-[6px] bg-[var(--muted)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--muted-fg)]">
                      {s.market}
                    </span>
                    <span className="mono flex shrink-0 flex-col items-end text-[14px] font-semibold leading-tight">
                      <span className="text-[var(--fg)]">{s.price.toLocaleString('ko-KR')}</span>
                      <span className={cn('text-[12.5px]', rateClass(s.changeRate))}>
                        {formatRate(s.changeRate)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <>
          <nav aria-label="바로가기" className="grid grid-cols-3 gap-2">
            <HubTile
              href="/scanner"
              title="상승률 상위"
              sub={surgeLabel}
              icon={TrendingUp}
              tint="bg-[var(--up-bg)] text-[var(--up)]"
            />
            <HubTile
              href="/themes"
              title="테마"
              sub={themeLabel}
              icon={Layers}
              tint="bg-[var(--down-bg)] text-[var(--primary)]"
            />
            <HubTile
              href="/watchlist"
              title="관심종목"
              sub={`${watchCount}종목`}
              icon={Star}
              tint="bg-[rgba(250,204,21,.16)] text-[#eab308]"
            />
          </nav>

          {recent.length > 0 && (
            <section aria-labelledby="search-recent-title" className="flex flex-col gap-2">
              <div className="mt-0.5 flex items-center justify-between">
                <h2 id="search-recent-title" className={SECTION_TITLE}>
                  최근 검색
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    clearRecentSearches();
                    setRecent([]);
                  }}
                  className="rounded-[var(--r-sm)] text-[13px] font-semibold text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  지우기
                </button>
              </div>
              <ul className={cn(CARD, 'm-0 list-none px-4 py-0.5')}>
                {recent.map((item) => (
                  <li key={item.code} className={cn('flex h-11 items-center gap-2.5', ROW_DIVIDER)}>
                    <Link
                      href={`/stocks/${item.code}`}
                      onClick={() => setRecent(pushRecentSearch(item))}
                      className="flex h-full min-w-0 flex-1 items-center gap-2.5 text-[15px] text-[var(--fg)] no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    >
                      <Clock className="size-4 shrink-0 text-[var(--faint)]" aria-hidden="true" />
                      <span className="truncate">{item.name}</span>
                    </Link>
                    <button
                      type="button"
                      aria-label={`${item.name} 최근 검색에서 삭제`}
                      onClick={() => setRecent(removeRecentSearch(item.code))}
                      className="-mr-2 flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--faint)] hover:text-[var(--muted-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="search-preview-title" className="flex flex-col gap-2">
            <div className="mt-0.5 flex items-center justify-between">
              <h2 id="search-preview-title" className={SECTION_TITLE}>
                지금 상승률 상위
              </h2>
              <Link
                href="/scanner"
                className="rounded-[var(--r-sm)] text-[13px] font-semibold text-[var(--primary)] no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                더보기 ›
              </Link>
            </div>
            <div className={cn(CARD, 'px-4 py-0.5')}>
              {scanner.status === 'loading' && (
                <div aria-hidden="true">
                  {Array.from({ length: PREVIEW_COUNT }, (_, i) => (
                    <div key={i} className="flex h-11 items-center">
                      <Skeleton className="h-4 w-full" />
                    </div>
                  ))}
                </div>
              )}
              {scanner.status === 'error' && (
                <p className="py-3 text-[length:var(--t-sm)] text-[var(--muted-fg)]">
                  상승률 상위를 불러오지 못했어요
                </p>
              )}
              {scanner.status === 'ok' && scanner.value.top.length === 0 && (
                <p className="py-3 text-[length:var(--t-sm)] text-[var(--muted-fg)]">
                  지금 표시할 종목이 없어요
                </p>
              )}
              {scanner.status === 'ok' && scanner.value.top.length > 0 && (
                <ol className="m-0 list-none p-0">
                  {scanner.value.top.map((s, i) => (
                    <li key={s.code} className={ROW_DIVIDER}>
                      <Link
                        href={`/stocks/${s.code}`}
                        className="flex h-11 min-w-0 items-center gap-2.5 text-[14.5px] no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                      >
                        <span className="mono w-[18px] shrink-0 text-[13px] text-[var(--muted-fg)]">
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-semibold text-[var(--fg)]">
                          {s.name}
                        </span>
                        <span className={cn('mono shrink-0 font-semibold', rateClass(s.changeRate))}>
                          {formatRate(s.changeRate)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function HubTile({
  href,
  title,
  sub,
  icon: Icon,
  tint,
}: {
  href: string;
  title: string;
  sub: string;
  icon: LucideIcon;
  tint: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        CARD,
        'flex min-w-0 flex-col gap-2.5 px-3 py-3.5 no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
      )}
    >
      <span className={cn('flex size-9 items-center justify-center rounded-[12px]', tint)}>
        <Icon className="size-[18px]" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[14px] font-bold text-[var(--fg)]">{title}</span>
        <span className="truncate text-[12px] text-[var(--muted-fg)]">{sub}</span>
      </span>
    </Link>
  );
}
