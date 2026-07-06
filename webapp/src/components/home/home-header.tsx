'use client';

import { useEffect, useRef, useState } from 'react';
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

/** 장전 프리마켓 슬롯(08시대, NXT) 판별. */
function isPremarketSlot(iso: string): boolean {
  const hh = toKstHhmm(iso).slice(0, 2);
  return hh === '08';
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

  // 슬라이더 debounce — 드래그 중 라벨/썸은 즉시(pendingIdx), fetch(onSelectSlot)는
  // 500ms 안정화 후 1회 (틱마다 재조회 방지 + in-flight 레이스 축소).
  //
  // 오실레이션 방지: 드래그(pointer down) 중에는 pendingIdx 를 절대 클리어하지 않는다.
  // 과거엔 mid-drag 에 타이머가 발화하며 pendingIdx=null → controlled value 가 확정값으로
  // 되돌아가 썸이 커서 위치와 확정 위치를 좌우로 반복 점프했다(특히 fetch 응답의 무거운
  // 리렌더와 겹칠 때). 드래그 중 커밋은 fetch 만 하고(pending 유지), 릴리즈 시 즉시 커밋.
  const [pendingIdx, setPendingIdx] = useState<number | null>(null);
  const pendingRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // 날짜 전환 시 pending 은 이전 날짜의 슬롯 인덱스라 무효 — 리셋 + 타이머 해제.
    setPendingIdx(null);
    pendingRef.current = null;
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, [currentDate]);
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

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
          // 표시 인덱스 = 드래그 중이면 pending(즉시), 아니면 확정 선택.
          const displayIdx = Math.min(
            pendingIdx ?? currentIdx,
            slots.length - 1,
          );
          const current = slots[displayIdx];
          const live = current.capturedAt === liveCapturedAt;
          const close = isCloseSlot(current.capturedAt);
          const premarket = isPremarketSlot(current.capturedAt);
          const hhmm = toKstHhmm(current.capturedAt);
          const label = close
            ? `${hhmm} · 마감`
            : premarket
              ? `${hhmm} · 프리마켓`
              : hhmm;
          const handleSlide = (idx: number) => {
            setPendingIdx(idx);
            pendingRef.current = idx;
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
              onSelectSlot(slots[idx].capturedAt);
              // 드래그 중이면 pending 유지 (클리어 시 controlled value 가 확정값으로
              // 되돌아가 썸이 좌우로 점프). 릴리즈 시 endDrag 가 정리한다.
              if (!draggingRef.current) {
                setPendingIdx(null);
                pendingRef.current = null;
              }
            }, 500);
          };
          const endDrag = () => {
            draggingRef.current = false;
            const p = pendingRef.current;
            if (p !== null) {
              // 릴리즈 즉시 커밋 — setSelected 와 같은 배치라 썸 이동 없음.
              if (debounceRef.current) clearTimeout(debounceRef.current);
              onSelectSlot(slots[Math.min(p, slots.length - 1)].capturedAt);
              setPendingIdx(null);
              pendingRef.current = null;
            }
          };
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
                value={displayIdx}
                aria-label="시점 선택"
                aria-valuetext={label}
                disabled={slots.length === 1}
                onChange={(e) => handleSlide(Number(e.target.value))}
                onPointerDown={() => {
                  draggingRef.current = true;
                }}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--border)] accent-[var(--primary)] disabled:cursor-default"
              />
              <span className="mono flex-none text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                {toKstHhmm(slots[slots.length - 1].capturedAt)}
              </span>
              {/* 고정 폭 — 라벨이 "15:30 · 마감" 으로 길어질 때 트랙(flex-1)이 리사이즈되며
                  커서 밑에서 값이 재매핑 → 좌우 반복 점프하는 레이아웃 피드백 루프 방지. */}
              <span className="relative mono flex-none w-[116px] rounded-full border border-[var(--primary)] bg-[var(--primary)] py-[5px] text-center text-[length:var(--t-sm)] font-extrabold text-[var(--primary-fg)]">
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
