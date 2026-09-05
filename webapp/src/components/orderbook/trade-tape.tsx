'use client';

/**
 * TradeTape — 체결 테이프 (UI-SPEC C6 + C7).
 *
 * 무엇을 어디에: 호가주문 탭 그리드의 **두 번째 컬럼**(≥900px 220px). 좁은 폭에서는
 * 주문 패널 아래(M1 순서 ④)로 내려간다.
 *
 * 왜 전용 `<table>` + 스크롤 컨테이너인가: 200ms 배치 prepend 와 "사용자가 스크롤을
 * 내리면 자동 스크롤 정지" 규칙이 표 primitive 에 없다(UI-SPEC §신규 컴포넌트).
 *
 * ★ LOCKED 색 규칙 (UI-SPEC §Color 열거표):
 *   - 체결가 = 기준가(전일종가) 대비 `--up` / `--down` / `--flat`.
 *   - 매수/매도 구분은 `▲ 매수` / `▼ 매도` **부호 + 라벨 병기 필수**. 색만으로 구분하지
 *     않는다(WCAG 1.4.1, T-15-44). 급등 종목에서는 체결가가 전부 `--up` 이 되므로
 *     체결가 색으로는 매수/매도를 절대 알 수 없다.
 *   - 수량·시각은 `--fg` / `--muted-fg` 중립.
 *
 * ★ 구분(매수/매도)의 출처: 게이트웨이 `TradeTapeEntry` 에는 매수/매도 플래그가 없다
 *   (packages/shared `RelayTapeEntry` = t/p/cs/c/q/cv). 그래서 국내 HTS 관례대로
 *   **최우선호가 비교 → 직전 체결가 틱 규칙** 순으로 추정하고, 추정임을 화면에 밝힌다.
 *   서버가 주지 않는 값을 확정 사실처럼 그리지 않는다(오주문 유발 차단).
 *
 * ★ 갱신 피드백 규율 (UI-SPEC §실시간 갱신 시각 피드백, T-15-45):
 *   - 200ms 배치 단위로 **1회** 플래시. **행마다 개별 애니메이션 금지.**
 *   - 큐잉 금지 — 배치가 겹치면 진행 중 타이머를 끊고 최신 배치만 남긴다.
 *   - `prefers-reduced-motion: reduce` → `motion-safe:` 로 플래시 배경 자체를 걸어
 *     감속 선호 사용자에게는 값만 교체된다(`motion-reduce:` 로 전환도 제거).
 *
 * ★ 스크롤 규율 (UI-SPEC §체결 테이프 스크롤):
 *   `scrollTop <= 4px` 일 때만 자동으로 맨 위 유지. 사용자가 내리면 자동 스크롤을 멈추고
 *   상단에 `새 체결 N건 · 맨 위로` 핀 버튼을 띄운다. 링버퍼 상한 200건(relay 캐시와 동일).
 *
 * ★ 빈·stale 상태: 빈 배열이면 빈 상태 문구, 재접속 중이면 마지막 값 + `opacity:.55`.
 * ★ 밀도: `data-density="compact"`(32px) — 사다리와 시각적 baseline 을 맞춘다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RelayTapeEntry } from '@gh-radar/shared';

/** 링버퍼 상한 — relay 캐시와 같은 200건. 초과분은 하단부터 버린다. */
const MAX_TAPE = 200;
/** 배치 플래시 지속 시간 — UI-SPEC 상한 150ms 이내. */
const FLASH_MS = 140;
/** 이 값 이하면 "맨 위에 고정된 상태"로 본다(UI-SPEC 4px). */
const PIN_THRESHOLD_PX = 4;
/** 배치 플래시 배경 — 방향색이 아닌 중립 `--fg` 틴트. */
const FLASH_BG = 'motion-safe:bg-[color-mix(in_oklch,var(--fg)_14%,transparent)]';
/** 배경만 부드럽게 사라지게 한다. */
const FLASH_FADE =
  'motion-safe:transition-[background-color] motion-safe:duration-150 motion-reduce:transition-none';

export interface TradeTapeProps {
  /** 훅의 `tape`. **최신이 index 0** 이다. */
  entries: RelayTapeEntry[];
  /** 재접속 중(마지막 수신값 표시). true 면 `opacity:.55` 로 감쇠한다. */
  isStale: boolean;
  /** 기준가(전일 종가). 체결가 방향색의 기준이다. */
  basePrice: number;
  /** 매도 1호가. 있으면 구분 추정의 1차 근거가 된다. */
  bestAsk?: number;
  /** 매수 1호가. 있으면 구분 추정의 1차 근거가 된다. */
  bestBid?: number;
  className?: string;
}

/** 추정된 체결 구분. "B" = 매수 체결, "S" = 매도 체결. */
type TapeSide = 'B' | 'S';

const KRW = new Intl.NumberFormat('ko-KR');

function fmt(n: number): string {
  return KRW.format(n);
}

/** 기준가 대비 방향색. 보합(=기준가)과 기준가 부재는 `--flat`. */
function priceTone(price: number, basePrice: number): string {
  if (!basePrice || price === basePrice) return 'text-[var(--flat)]';
  return price > basePrice ? 'text-[var(--up)]' : 'text-[var(--down)]';
}

/**
 * 거래소 원문 체결시각 → `HH:MM:SS`.
 * 게이트웨이는 "HHMMSSuuuuuu"(12자)를 주고, 마이크로초는 절삭한다(UI-SPEC §Typography).
 */
export function formatTapeTime(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 6) return raw;
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}:${digits.slice(4, 6)}`;
}

/**
 * 체결 구분 추정 — **오래된 것부터** 훑어 zero-tick 을 직전 판정에서 상속한다.
 *
 *   1순위 최우선호가 비교: 체결가 ≥ 매도1 이면 매수 체결, ≤ 매수1 이면 매도 체결.
 *   2순위 틱 규칙: 직전 체결가보다 올랐으면 매수, 내렸으면 매도, 같으면 직전 판정 유지.
 *
 * 반환 배열은 입력과 같은 순서(최신이 index 0)다.
 */
export function deriveTapeSides(
  entries: RelayTapeEntry[],
  bestAsk?: number,
  bestBid?: number,
): TapeSide[] {
  const sides = new Array<TapeSide>(entries.length);
  let carried: TapeSide = 'B';
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const price = entries[i].p;
    const older = entries[i + 1];
    let side: TapeSide;
    if (bestAsk && price >= bestAsk) {
      side = 'B';
    } else if (bestBid && price <= bestBid) {
      side = 'S';
    } else if (older && price > older.p) {
      side = 'B';
    } else if (older && price < older.p) {
      side = 'S';
    } else {
      side = carried;
    }
    sides[i] = side;
    carried = side;
  }
  return sides;
}

/** 배치 경계 판정용 콘텐츠 키 — 스냅샷 교체(객체 신원 변경)에도 견딘다. */
function entryKey(e: RelayTapeEntry): string {
  return `${e.t}|${e.p}|${e.q}|${e.cv}`;
}

export function TradeTape({
  entries,
  isStale,
  basePrice,
  bestAsk,
  bestBid,
  className,
}: TradeTapeProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  /** 자동으로 맨 위를 유지할지. 사용자가 스크롤을 내리면 false 가 된다. */
  const pinnedRef = useRef(true);
  const [pinned, setPinned] = useState(true);
  /** 핀 해제 상태에서 쌓인 신규 체결 수 — 핀 버튼 라벨의 N. */
  const [pendingCount, setPendingCount] = useState(0);
  /** 이번 배치에서 새로 들어온 행 수. 상단 N행에 1회 플래시한다. */
  const [flashCount, setFlashCount] = useState(0);
  const prevHeadKeyRef = useRef<string | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 링버퍼 상한을 컴포넌트에서도 강제한다 — 훅이 이미 자르지만 이 표면의 계약이기도 하다.
  const rows = useMemo(() => entries.slice(0, MAX_TAPE), [entries]);
  const sides = useMemo(
    () => deriveTapeSides(rows, bestAsk, bestBid),
    [rows, bestAsk, bestBid],
  );

  /**
   * 배치 도착 처리 — 신규 행 수 계산 → 배치 1회 플래시 → 핀 상태에 따라 스크롤/카운터.
   * 스냅샷 전량 교체(이전 헤드를 찾을 수 없음)는 플래시하지 않는다.
   */
  useEffect(() => {
    const head = rows.length > 0 ? entryKey(rows[0]) : null;
    const prevHead = prevHeadKeyRef.current;
    prevHeadKeyRef.current = head;
    if (head === null || head === prevHead) return;

    let added = 0;
    if (prevHead === null) {
      // 첫 수신 — 전체가 "신규"라 플래시가 무의미하다.
      added = 0;
    } else {
      const idx = rows.findIndex((e) => entryKey(e) === prevHead);
      added = idx > 0 ? idx : 0;
    }

    if (added > 0) {
      // 큐잉 금지 — 진행 중이던 배치 플래시를 끊고 최신 배치만 남긴다.
      if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current);
      setFlashCount(added);
      flashTimerRef.current = setTimeout(() => {
        flashTimerRef.current = null;
        setFlashCount(0);
      }, FLASH_MS);
    }

    const el = scrollRef.current;
    if (pinnedRef.current) {
      if (el) el.scrollTop = 0;
      setPendingCount(0);
    } else if (added > 0) {
      setPendingCount((n) => Math.min(n + added, MAX_TAPE));
    }
  }, [rows]);

  useEffect(
    () => () => {
      if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current);
    },
    [],
  );

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atTop = el.scrollTop <= PIN_THRESHOLD_PX;
    if (atTop === pinnedRef.current) return;
    pinnedRef.current = atTop;
    setPinned(atTop);
    if (atTop) setPendingCount(0);
  }, []);

  const scrollToTop = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
    pinnedRef.current = true;
    setPinned(true);
    setPendingCount(0);
  }, []);

  if (rows.length === 0) {
    return (
      <div
        data-density="compact"
        data-slot="trade-tape"
        className={cn(
          'flex flex-col items-center justify-center gap-1 rounded-[var(--r-md)] border border-dashed border-[var(--border)] px-[var(--s-4)] py-[var(--s-5)] text-center',
          className,
        )}
      >
        <p className="text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
          아직 체결이 없어요
        </p>
        <p className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
          장 시작(09:00) 이후 체결이 발생하면 위에서부터 쌓여요.
        </p>
      </div>
    );
  }

  return (
    <div
      data-density="compact"
      data-slot="trade-tape"
      data-stale={isStale ? 'true' : undefined}
      className={cn('flex min-w-0 flex-col', isStale && 'opacity-[.55]', className)}
    >
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative max-h-[320px] overflow-y-auto min-[900px]:max-h-[664px]"
      >
        {/* 핀 버튼 — 사용자가 스크롤을 내린 동안에만. scrollTop<=4 면 자동으로 사라진다. */}
        {!pinned && pendingCount > 0 && (
          <div className="sticky top-0 z-10 flex justify-center py-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={scrollToTop}
              className="h-7 bg-[var(--card)] text-[length:var(--t-caption)]"
            >
              새 체결 {pendingCount}건 · 맨 위로
            </Button>
          </div>
        )}

        <table className="w-full table-fixed border-collapse" aria-label="체결 테이프">
          <thead className="sticky top-0 z-[1]">
            <tr>
              <th
                scope="col"
                className="border-b border-[var(--border)] bg-[var(--muted)] px-[var(--s-2)] py-1.5 text-left text-[11px] font-semibold text-[var(--muted-fg)]"
              >
                시각
              </th>
              <th
                scope="col"
                className="num border-b border-[var(--border)] bg-[var(--muted)] px-[var(--s-2)] py-1.5 text-[11px] font-semibold text-[var(--muted-fg)]"
              >
                체결가
              </th>
              <th
                scope="col"
                className="num border-b border-[var(--border)] bg-[var(--muted)] px-[var(--s-2)] py-1.5 text-[11px] font-semibold text-[var(--muted-fg)]"
              >
                수량
              </th>
              <th
                scope="col"
                className="border-b border-[var(--border)] bg-[var(--muted)] px-[var(--s-2)] py-1.5 text-right text-[11px] font-semibold text-[var(--muted-fg)]"
              >
                구분
              </th>
            </tr>
          </thead>
          <tbody className="[&>tr+tr>td]:border-t [&>tr+tr>td]:border-[var(--border-subtle)]">
            {rows.map((entry, index) => {
              const isBuy = sides[index] === 'B';
              const flashed = index < flashCount;
              return (
                <tr
                  // 행은 순수 텍스트라 index 키가 안전하다. prepend 마다 콘텐츠만 갈리고
                  // 플래시 대상도 "상단 N행"이라 인덱스 기준이 정확하다.
                  key={index}
                  data-side={isBuy ? 'B' : 'S'}
                  className={cn(
                    '[&>td]:h-[var(--row-h)] [&>td]:px-[var(--s-2)] [&>td]:align-middle [&>td]:text-[length:var(--t-caption)]',
                    FLASH_FADE,
                    flashed && FLASH_BG,
                  )}
                >
                  <td className="mono text-left text-[var(--muted-fg)]">
                    {formatTapeTime(entry.t)}
                  </td>
                  <td className={cn('mono num font-semibold', priceTone(entry.p, basePrice))}>
                    {fmt(entry.p)}
                  </td>
                  <td className="mono num text-[var(--fg)]">{fmt(entry.q)}</td>
                  <td
                    className={cn(
                      'text-right font-semibold',
                      isBuy ? 'text-[var(--up)]' : 'text-[var(--down)]',
                    )}
                  >
                    {isBuy ? '▲ 매수' : '▼ 매도'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/*
        추정임을 밝히는 마이크로 라벨(11px). 게이트웨이 체결 레코드에 매수/매도 플래그가
        없으므로 확정 사실로 그리면 안 된다 — 근거를 함께 노출해 오독을 막는다.
      */}
      <p className="border-t border-[var(--border-subtle)] px-[var(--s-2)] pt-1 text-[11px] text-[var(--muted-fg)]">
        구분은 최우선호가·직전 체결가 기준 추정이에요
      </p>
    </div>
  );
}
