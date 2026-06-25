'use client';

/**
 * StockComovementSection — UI-SPEC §Component Structure (Phase 11 COMV-01, 채택안 변형 C).
 *
 * 종목 상세(/stocks/[code]) StockThemeChips 바로 다음에 마운트되는 신규 클라이언트 컴포넌트.
 * apiFetch<CoMovementResponse> (comovement-api) 로 동반상승 후보를 mount fetch 하고,
 * theme-chips(근거칩) 패턴을 재사용해 후보 행을 렌더한다 (강도바 제거 — 점수 근거 명시로 대체).
 *
 * 행 카드 = 근거칩(공유 테마 / 동반급등) + 동반율(중립색) + 실시간 등락률(방향색) + 후행형 배지
 *           + "근거 보기" 아코디언(점수 분해: 연결 경로·동반급등 횟수·발화일 동반율·표본·선후행).
 *           초기 3행 + 더보기(useState expanded). 행별 근거 펼침은 CandidateRow 로컬 state.
 *
 * ★ LOCKED 색 규칙 (UI-SPEC):
 *   - 동반율(confD0) 등 확률/비율 = 중립 --fg (빨강/파랑 금지).
 *   - 실시간 등락률만 방향색 (--up/--down/--flat).
 *   - 후행형 배지 = --down 톤. 공유 테마 칩 도트 = --flat. 근거 미니바(동반율) = --primary.
 *   - 모든 색은 globals.css oklch 토큰만 (차트 아님 → 직접 사용). 신규 토큰/하드코딩 0.
 *
 * 빈 상태(후보 0) → "동반상승 데이터 부족" 박스. 에러 → 섹션 조용히 숨김(null, error.message
 * 미노출 — theme-chips/daily-chart quiet fallback 선례, T-11-18).
 *
 * co-surge 전용 후보(sharedThemes=[]) 의 동반율 = "—" (confD0=0 의 "0%" 오표시 방지 —
 * 테마무관 동반상승이 가장 약한 신호로 오해되는 것을 차단, UI-SPEC §우측 메트릭 규칙).
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Waypoints, ArrowUpRight, History, CircleOff, ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { fetchStockComovement } from '@/lib/comovement-api';
import type { CoMovementCandidate } from '@gh-radar/shared';

const INITIAL_VISIBLE = 3;

export interface StockComovementSectionProps {
  stockCode: string;
}

/** 실시간 등락률 포맷 (theme-rank-row fmtPct 선례, null → em-dash). */
function fmtLive(v: number | null): string {
  if (v == null) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

/** 실시간 등락률 방향색 (한국 관례: 상승 빨강 / 하락 파랑 / 보합 중립). */
function liveColor(v: number | null): string {
  if (v == null || v === 0) return 'text-[var(--flat)]';
  return v > 0 ? 'text-[var(--up)]' : 'text-[var(--down)]';
}

/** 근거 미니바 width % (동반율 시각화, min 4% / max 100%). */
function barPct(ratio: number): number {
  return Math.max(4, Math.min(100, ratio * 100));
}

/** ISO 날짜("2026-06-18") → "06/18" (최근 동반급등 히스토리 칩). */
function fmtMD(iso: string): string {
  return `${iso.slice(5, 7)}/${iso.slice(8, 10)}`;
}

/** 근거 상세 1줄 — <dl> 내부 (dt/dd 그룹, HTML5 div 래퍼 허용). */
function DetailItem({
  label,
  value,
  mono,
  bar,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  /** 0~1 비율 → 미니바 (동반율 전용). */
  bar?: number;
  tone?: 'down';
}) {
  return (
    <div className="flex flex-col gap-[3px]">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--muted-fg)]">
        {label}
      </dt>
      <dd className="flex flex-col gap-[3px]">
        <span
          className={cn(
            'text-[length:var(--t-sm)] font-semibold leading-none',
            mono && 'mono',
            tone === 'down' ? 'text-[var(--down)]' : 'text-[var(--fg)]',
          )}
        >
          {value}
        </span>
        {bar != null && (
          <span
            aria-hidden="true"
            className="block h-[5px] overflow-hidden rounded-full bg-[var(--muted)]"
          >
            <span
              className="block h-full rounded-full bg-[var(--primary)]"
              style={{ width: `${barPct(bar)}%` }}
            />
          </span>
        )}
      </dd>
    </div>
  );
}

/**
 * 단일 후보 행 — 메인 영역은 /stocks/[code] Link(전역 double-ring focus),
 * 하단 "근거 보기" 아코디언으로 점수 분해 노출. 토글 버튼은 Link 바깥 형제
 * (중첩 인터랙티브 <button> in <a> 금지). 펼침은 행 로컬 state.
 */
function CandidateRow({ c }: { c: CoMovementCandidate }) {
  // 기본 펼침 — 점수 근거를 항상 노출(사용자 요청). 토글로 접기 가능.
  const [open, setOpen] = useState(true);

  // co-surge 전용 후보(공유 테마 없음)는 confD0=0 의 "0%" 대신 "—" (UI-SPEC 규칙).
  const isCoSurgeOnly = c.sharedThemes.length === 0;
  const confLabel = isCoSurgeOnly ? '—' : `${Math.round(c.confD0 * 100)}%`;
  const hasCoSurge = c.coSurgeCount != null && c.coSurgeCount > 0;
  // 구버전 서버 응답(recentCoSurge 미포함) 방어 — 배포 스큐 윈도우에서 .length 크래시 방지.
  const recentCoSurge = c.recentCoSurge ?? [];

  // 연결 경로 — 테마 / 동반급등 / 둘 다 (근거 상세 첫 행, "왜 후보인가"의 근원).
  const pathLabel =
    !isCoSurgeOnly && hasCoSurge
      ? '테마 + 동반급등'
      : !isCoSurgeOnly
        ? '테마'
        : '동반급등 (테마무관)';

  return (
    <div
      className={cn(
        'overflow-hidden rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)]',
        'transition-colors hover:border-[color-mix(in_oklch,var(--primary)_30%,var(--border))]',
      )}
    >
      <Link
        href={`/stocks/${c.code}`}
        aria-label={`${c.name} 종목 상세 보기`}
        className="grid grid-cols-[1fr_auto] items-center gap-[var(--s-3)] px-[var(--s-4)] pb-[var(--s-2)] pt-[var(--s-3)]"
      >
        {/* 좌측: 종목명/코드 + 근거칩 + 후행형 배지 */}
        <span className="flex min-w-0 flex-col gap-[5px]">
          <span className="flex items-baseline gap-2">
            <b className="truncate text-[length:var(--t-base)] font-bold text-[var(--fg)]">
              {c.name}
            </b>
            <span className="mono shrink-0 text-[length:var(--t-caption)] text-[var(--muted-fg)]">
              {c.code}
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-2">
            {/* 근거 칩 — 테마 먼저 → 동반급등 (D-03) */}
            {c.sharedThemes.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-[5px] rounded-full border border-[var(--border)] px-[9px] py-px text-[length:var(--t-caption)] text-[var(--fg)]"
              >
                <span
                  aria-hidden="true"
                  className="inline-block size-[5px] rounded-full bg-[var(--flat)]"
                />
                {t.name}
              </span>
            ))}
            {c.coSurgeCount != null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-[9px] py-px text-[length:var(--t-caption)] font-semibold text-[var(--accent-fg)]">
                <ArrowUpRight aria-hidden="true" className="size-[11px]" />
                동반급등 {c.coSurgeCount}회
              </span>
            )}
            {c.isTrailing && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_oklch,var(--down)_35%,var(--border))] bg-[var(--down-bg)] px-2 text-[11px] font-bold text-[var(--down)]">
                <History aria-hidden="true" className="size-[10px]" />
                후행형
              </span>
            )}
          </span>
        </span>

        {/* 우측 메트릭: 동반율(중립) + 실시간(방향색) */}
        <span className="flex items-end gap-[var(--s-3)]">
          <span className="mono text-right text-[length:var(--t-h3)] font-extrabold leading-none text-[var(--fg)]">
            <small className="mb-[3px] block font-sans text-[10px] font-semibold tracking-[0.04em] text-[var(--muted-fg)]">
              동반율
            </small>
            {confLabel}
          </span>
          <span
            className={cn(
              'mono min-w-[62px] text-right text-[length:var(--t-sm)] font-bold leading-none',
              liveColor(c.liveChangeRate),
            )}
          >
            <small className="mb-[3px] block font-sans text-[10px] font-semibold tracking-[0.04em] text-[var(--muted-fg)]">
              실시간
            </small>
            {fmtLive(c.liveChangeRate)}
          </span>
        </span>
      </Link>

      {/* 근거 아코디언 — Link 바깥(중첩 인터랙티브 방지), 점수 분해 노출 */}
      <div className="px-[var(--s-4)] pb-[var(--s-3)]">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)] transition-colors hover:text-[var(--fg)]"
        >
          <ChevronDown
            aria-hidden="true"
            className={cn('size-3 transition-transform', open && 'rotate-180')}
          />
          {open ? '근거 접기' : '근거 보기'}
        </button>

        {open && (
          <dl className="mt-[var(--s-3)] grid grid-cols-2 gap-x-[var(--s-4)] gap-y-[var(--s-3)] border-t border-[var(--border-subtle)] pt-[var(--s-3)]">
            <DetailItem label="연결 경로" value={pathLabel} />
            {hasCoSurge && (
              <DetailItem label="동반급등" value={`${c.coSurgeCount}회`} mono />
            )}
            {!isCoSurgeOnly && (
              <DetailItem label="테마 발화일 동반율" value={confLabel} mono bar={c.confD0} />
            )}
            <DetailItem
              label="표본 신뢰도"
              value={c.sampleConfidence === 'high' ? '충분' : '적음'}
            />
            <DetailItem
              label="선·후행"
              value={c.isTrailing ? '후행형 (다음날 ↑)' : '동행형'}
              tone={c.isTrailing ? 'down' : undefined}
            />
            {c.sharedThemes.length > 0 && (
              <DetailItem
                label="공유 테마"
                value={c.sharedThemes.map((t) => t.name).join(' · ')}
              />
            )}
            {recentCoSurge.length > 0 && (
              <div className="col-span-2 flex flex-col gap-[5px]">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--muted-fg)]">
                  최근 동반급등
                </dt>
                <dd className="flex flex-wrap gap-[6px]">
                  {recentCoSurge.slice(0, 3).map((h) => (
                    <span
                      key={h.date}
                      title={`${fmtMD(h.date)} · 본종목 +${Math.round(h.anchorRate)}% · ${c.name} +${Math.round(h.candidateRate)}%`}
                      className="inline-flex items-center gap-[5px] rounded-full bg-[var(--up-bg)] px-[9px] py-px text-[length:var(--t-caption)]"
                    >
                      <span className="mono text-[var(--muted-fg)]">{fmtMD(h.date)}</span>
                      <span className="mono font-semibold text-[var(--up)]">
                        +{Math.round(h.candidateRate)}%
                      </span>
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        )}
      </div>
    </div>
  );
}

export function StockComovementSection({ stockCode }: StockComovementSectionProps) {
  const [candidates, setCandidates] = useState<CoMovementCandidate[]>([]);
  const [loaded, setLoaded] = useState(false);
  // 에러 시 섹션 조용히 숨김 — error.message 절대 미노출(quiet fallback, T-11-18).
  const [hasError, setHasError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // 종목 간 내비게이션(같은 동적 라우트 → remount 없이 props 갱신)에서 state sticky 방지 (WR-04):
    //   - hasError 리셋 없으면 한 번 실패 후 모든 종목에서 섹션 영구 숨김.
    //   - candidates/expanded 리셋 없으면 새 fetch 완료 전 이전 종목 후보 stale 노출.
    setLoaded(false);
    setHasError(false);
    setExpanded(false);
    setCandidates([]);
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetchStockComovement(stockCode, 8, controller.signal);
        if (controller.signal.aborted) return;
        setCandidates(res.candidates);
        setLoaded(true);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        // 디버그는 console, 사용자 노출은 0 (섹션 숨김).
        console.error('[StockComovementSection] fetch failed', err);
        setHasError(true);
        setLoaded(true);
      }
    })();
    return () => controller.abort();
  }, [stockCode]);

  // 표시 정렬 — 선정(TOP-K)은 서버 strength 기준(가장 강한 동반상승 후보 풀 유지),
  // 표시 순서만 "지금 실시간 등락률 desc"(사용자 요청). 시세 없음(null)은 맨 뒤로.
  const sorted = useMemo(
    () =>
      [...candidates].sort((a, b) => {
        const av = a.liveChangeRate ?? Number.NEGATIVE_INFINITY;
        const bv = b.liveChangeRate ?? Number.NEGATIVE_INFINITY;
        return bv - av;
      }),
    [candidates],
  );

  // 로딩 전에는 레이아웃 점프 방지를 위해 아무것도 렌더하지 않음 (theme-chips 선례).
  if (!loaded) return null;
  // 에러 → 섹션 조용히 숨김 (quiet fallback).
  if (hasError) return null;

  return (
    <section aria-label="동반상승 후보" className="flex flex-col gap-[var(--s-3)]">
      <h2 className="flex items-center gap-1.5 text-[length:var(--t-caption)] font-semibold uppercase tracking-wide text-[var(--muted-fg)]">
        <Waypoints className="size-3.5" aria-hidden="true" />
        동반상승 후보
        <span className="ml-auto font-medium normal-case tracking-normal">
          급등 시 동반 ↑ · 실시간 등락률 순
        </span>
      </h2>

      {candidates.length === 0 ? (
        <div className="rounded-[var(--r-md)] border border-dashed border-[var(--border)] px-[var(--s-4)] py-[var(--s-5)] text-center">
          <CircleOff
            aria-hidden="true"
            className="mx-auto mb-2 size-[22px] text-[var(--muted-fg)]"
          />
          <p className="text-[length:var(--t-base)] font-bold">동반상승 데이터 부족</p>
          <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">
            아직 이 종목과 함께 움직인 패턴을 찾지 못했습니다. 테마·동반 급등 이력이 쌓이면
            표시됩니다.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-[var(--s-2)]">
            {(expanded ? sorted : sorted.slice(0, INITIAL_VISIBLE)).map((c) => (
              <CandidateRow key={c.code} c={c} />
            ))}
          </div>
          {candidates.length > INITIAL_VISIBLE && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-[var(--s-2)] w-full rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] px-[var(--s-3)] py-[var(--s-2)] text-[length:var(--t-sm)] font-semibold text-[var(--muted-fg)] transition-colors hover:border-[color-mix(in_oklch,var(--primary)_30%,var(--border))] hover:text-[var(--fg)]"
            >
              {expanded
                ? '접기'
                : `동반상승 후보 ${candidates.length - INITIAL_VISIBLE}개 더 보기`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
