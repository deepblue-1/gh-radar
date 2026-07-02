'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import type {
  HomeSnapshotIndexEntry,
  HomeThemeSnapshot,
} from '@gh-radar/shared';

/**
 * HomeHeader — 홈 헤더 (13-UI-SPEC §Component Inventory · home-top).
 *
 * 세로 stack:
 *   타이틀행 = "오늘의 급등 테마"(--t-h2 24/800) + 날짜 네비
 *     날짜 네비 = prev/next icon-btn(32×32, aria-label "이전 날짜"/"다음 날짜")
 *                + mono 날짜 라벨(YYYY-MM-DD 14/800) + "오늘" reset pill.
 *                next 는 최신 날짜에서 disabled, prev 는 더 과거 날짜 없으면 disabled.
 *   시점 슬라이더 행 = 선택 날짜의 슬롯들을 range 슬라이더로 탐색(10분 슬롯 하루 최대
 *                 ~40개라 pill 나열 대신 슬라이더). 좌우 min/max HH:MM 라벨 + 선택 라벨
 *                 pill(--primary fill 800, 최신 슬롯 --up dot). 마감(15:30) "HH:MM · 마감".
 *
 * 모든 날짜/시간 = `.mono`. 색상 globals 토큰만.
 */

export interface HomeSelection {
  /** 선택 거래일 (YYYY-MM-DD). */
  date: string;
  /** 선택 시점 (ISO). */
  capturedAt: string;
}

export interface HomeHeaderProps {
  /** 현재 표시 스냅샷 (선택 날짜/시점 파생용). */
  snapshot: HomeThemeSnapshot | null;
  /** 날짜/시점 네비 인덱스 (최신순). */
  index: HomeSnapshotIndexEntry[];
  /** 현재 선택 (date/capturedAt). null 이면 최신(무필터). */
  selected: HomeSelection | null;
  /** 다른 거래일 선택 (그 날짜의 최신 슬롯으로). */
  onSelectDate: (date: string) => void;
  /** 같은 날짜 내 다른 시점 선택. */
  onSelectSlot: (capturedAt: string) => void;
  /** "오늘"(최신 스냅샷)으로 리셋. */
  onToday: () => void;
}

/** KST(Asia/Seoul) HH:MM 라벨. */
function toKstHhmm(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

/** 정규장 마감 슬롯(15:30) 판별. */
function isCloseSlot(iso: string): boolean {
  return toKstHhmm(iso) === '15:30';
}

/** 거래일 오름차순 유니크 목록 (오래된 → 최신). */
function uniqueDatesAsc(index: HomeSnapshotIndexEntry[]): string[] {
  const set = new Set(index.map((e) => e.tradeDate));
  return Array.from(set).sort();
}

export function HomeHeader({
  snapshot,
  index,
  selected,
  onSelectDate,
  onSelectSlot,
  onToday,
}: HomeHeaderProps) {
  const dates = uniqueDatesAsc(index);
  // 현재 날짜 = 선택값 우선, 없으면 스냅샷 날짜, 그마저 없으면 최신 인덱스 날짜.
  const currentDate =
    selected?.date ?? snapshot?.tradeDate ?? dates[dates.length - 1] ?? '';
  const currentCapturedAt = selected?.capturedAt ?? snapshot?.capturedAt ?? '';

  const dateIdx = dates.indexOf(currentDate);
  const hasPrev = dateIdx > 0;
  const hasNext = dateIdx >= 0 && dateIdx < dates.length - 1;
  const latestDate = dates[dates.length - 1] ?? '';
  const latestCapturedAt = index[0]?.capturedAt ?? '';

  // 선택 날짜의 슬롯 (오름차순 — 이른 시점 → 늦은 시점). 최신 슬롯 = 마감/현재 dot.
  const slots = index
    .filter((e) => e.tradeDate === currentDate)
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  const liveCapturedAt = slots[slots.length - 1]?.capturedAt ?? '';

  const goPrev = () => {
    if (hasPrev) onSelectDate(dates[dateIdx - 1]);
  };
  const goNext = () => {
    if (hasNext) onSelectDate(dates[dateIdx + 1]);
  };

  // "오늘" pill 활성 여부 — 최신 날짜의 최신 슬롯을 보고 있으면 이미 오늘.
  const isViewingToday =
    currentDate === latestDate && currentCapturedAt === latestCapturedAt;

  return (
    <div className="flex flex-col gap-[var(--s-3)]">
      {/* 타이틀 + 날짜 네비 */}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-[length:var(--t-h2)] font-extrabold tracking-[-0.02em] text-[var(--fg)]">
          오늘의 급등 테마
        </h1>
        <div className="flex items-center gap-[6px]">
          <button
            type="button"
            aria-label="이전 날짜"
            onClick={goPrev}
            disabled={!hasPrev}
            className="inline-flex size-8 items-center justify-center rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] text-[var(--fg)] disabled:opacity-40"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </button>
          <span className="mono text-[length:var(--t-sm)] font-extrabold text-[var(--fg)]">
            {currentDate || '—'}
          </span>
          <button
            type="button"
            aria-label="다음 날짜"
            onClick={goNext}
            disabled={!hasNext}
            className="inline-flex size-8 items-center justify-center rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] text-[var(--fg)] disabled:opacity-40"
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            onClick={onToday}
            disabled={isViewingToday}
            className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] px-3 py-[5px] text-[length:var(--t-sm)] font-extrabold text-[var(--fg)] disabled:opacity-40"
          >
            오늘
          </button>
        </div>
      </div>

      {/* 시점 슬라이더 행 — 10분 슬롯(하루 최대 ~40개)이라 pill 나열 대신 range 슬라이더 */}
      {slots.length > 0 &&
        (() => {
          const foundIdx = slots.findIndex(
            (s) => s.capturedAt === currentCapturedAt,
          );
          const currentIdx = foundIdx >= 0 ? foundIdx : slots.length - 1;
          const current = slots[currentIdx];
          const live = current.capturedAt === liveCapturedAt;
          const close = isCloseSlot(current.capturedAt);
          const hhmm = toKstHhmm(current.capturedAt);
          const label = close ? `${hhmm} · 마감` : hhmm;
          return (
            <div className="flex items-center gap-3">
              <span className="mono flex-none text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                {toKstHhmm(slots[0].capturedAt)}
              </span>
              <input
                type="range"
                min={0}
                max={slots.length - 1}
                step={1}
                value={currentIdx}
                aria-label="시점 선택"
                aria-valuetext={label}
                disabled={slots.length === 1}
                onChange={(e) =>
                  onSelectSlot(slots[Number(e.target.value)].capturedAt)
                }
                className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--border)] accent-[var(--primary)] disabled:cursor-default"
              />
              <span className="mono flex-none text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                {toKstHhmm(slots[slots.length - 1].capturedAt)}
              </span>
              <span className="relative mono flex-none rounded-full border border-[var(--primary)] bg-[var(--primary)] py-[5px] pl-3 pr-[18px] text-[length:var(--t-sm)] font-extrabold text-[var(--primary-fg)]">
                {label}
                {live && (
                  <span
                    aria-hidden="true"
                    className="absolute right-[7px] top-[6px] size-[6px] rounded-full bg-[var(--up)]"
                  />
                )}
              </span>
            </div>
          );
        })()}
    </div>
  );
}
