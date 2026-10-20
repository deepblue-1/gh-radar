'use client';

import { useEffect, useState } from 'react';

import type { AccumDetailResponse, AccumDetailRow } from '@gh-radar/shared';

import { DmaGate, type DmaGateReason } from '@/components/trading/dma-gate';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiClientError } from '@/lib/api';
import { accumDetailCacheKey, fetchAccumDetail } from '@/lib/accum-api';
import { detailKpisOf } from '@/lib/accum-report';
import { readQueryCache } from '@/lib/query-cache';
import { TONE_TEXT } from '@/lib/teamflow-report';
import { cn } from '@/lib/utils';

/**
 * 매집감지 펼친 상세 셸 (Phase 34 · UI-SPEC A4 상세 셸 · A5 KPI 줄 · D-06 · D-18 · D-19).
 *
 * - 루트 `section#ac-{isin}` · `aria-labelledby` = 행 버튼 id(`labelledBy` — 부모 DayGrid 가 `accumRowButtonId` 로 준다 ·
 *   import 순환을 피하려 prop 으로 받는다) · 열린 행 바로 아래에만 마운트된다(접으면 언마운트).
 * - **지연 로드(D-06):** 마운트 때 `fetchAccumDetail(date, isin)`. 캐시(`accum-detail:{date}:{isin}`)에 있으면 첫 렌더부터
 *   그 값으로 그린다(재펼침 = 요청 0 · 스켈레톤 깜빡임 없음). 언마운트 뒤 도착한 응답은 setState 하지 않는다(캐시에만 남는다).
 * - 상태: 로딩 = 실제 배치 높이 스켈레톤(KPI 줄 → 범례 → 프리셋 → 차트 472 · 사이 8px) + sr 전용 「상세 불러오는 중…」 /
 *   실패 = 「상세를 불러오지 못했어요」 + 「다시 시도」(재요청 · 실패는 캐시하지 않는다) / 401 · 403 · `{access:false}` = 상세 자리
 *   `DmaGate`(페이지 전체는 그대로) / `row: null` = 「이 종목 상세를 찾지 못했어요」(재시도 없음) / 준비 = 차트 블록.
 * - 차트 블록 `flex flex-col gap-2` = KPI 줄(이 파일) → 범례 · 프리셋 · 차트 · 캡션(34-06~08 이 이 블록 안에 붙인다).
 *   그 아래 사이클 표 · 손익 줄 · 판정 기준 · 출처 칩도 34-06~08 몫. 상세 안에서 `<i>` 를 쓰지 않는다(33-05 결정).
 */

type Phase =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'gate'; reason: DmaGateReason }
  | { kind: 'missing' }
  | { kind: 'ready'; row: AccumDetailRow };

function phaseOf(resp: AccumDetailResponse): Phase {
  if (!resp.access) return { kind: 'gate', reason: 'unmapped' };
  return resp.row === null ? { kind: 'missing' } : { kind: 'ready', row: resp.row };
}

/** 캐시에 있으면 첫 렌더부터 그 값 — 재펼침에 스켈레톤이 번쩍이지 않게. */
function initialPhase(date: string, isin: string): Phase {
  const hit = readQueryCache<AccumDetailResponse>(accumDetailCacheKey(date, isin), Number.POSITIVE_INFINITY);
  return hit === undefined ? { kind: 'loading' } : phaseOf(hit);
}

export function AccumDetail({ date, isin, labelledBy }: { date: string; isin: string; labelledBy: string }) {
  const [phase, setPhase] = useState<Phase>(() => initialPhase(date, isin));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchAccumDetail(date, isin).then(
      (resp) => {
        if (alive) setPhase(phaseOf(resp));
      },
      (err: unknown) => {
        if (!alive) return;
        if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
          setPhase({ kind: 'gate', reason: err.status === 401 ? 'unauthenticated' : 'unmapped' });
          return;
        }
        setPhase({ kind: 'error' });
      },
    );
    return () => {
      alive = false;
    };
  }, [date, isin, attempt]);

  const retry = () => {
    setPhase({ kind: 'loading' });
    setAttempt((n) => n + 1);
  };

  return (
    <section
      id={`ac-${isin}`}
      aria-labelledby={labelledBy}
      data-slot="accum-detail"
      className="flex flex-col gap-4 px-2 pt-1 pb-6"
    >
      {phase.kind === 'loading' && (
        <div data-slot="accum-detail-skeleton" className="flex flex-col gap-2">
          <p role="status" aria-live="polite" className="sr-only">
            상세 불러오는 중…
          </p>
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-[472px] w-full rounded-[var(--r)]" />
        </div>
      )}

      {phase.kind === 'error' && (
        <div role="alert" className="flex flex-col items-center gap-1 py-8 text-center">
          <p className="text-[length:var(--t-sm)] font-semibold break-keep text-[var(--fg)]">상세를 불러오지 못했어요</p>
          <button
            type="button"
            onClick={retry}
            className="min-h-8 text-[length:var(--t-caption)] font-semibold text-[var(--accent-fg)] hover:underline"
          >
            다시 시도
          </button>
        </div>
      )}

      {phase.kind === 'gate' && <DmaGate reason={phase.reason} surface="매집감지 보고서" />}

      {phase.kind === 'missing' && (
        <div data-slot="accum-detail-missing" className="flex flex-col items-center gap-1 py-8 text-center">
          <p className="text-[length:var(--t-sm)] font-semibold break-keep text-[var(--fg)]">
            이 종목 상세를 찾지 못했어요
          </p>
          <p className="text-[length:var(--t-caption)] break-keep text-[var(--muted-fg)]">
            보고서가 다시 올라왔을 수 있어요. 페이지를 새로고침해 주세요
          </p>
        </div>
      )}

      {phase.kind === 'ready' && (
        <div data-slot="accum-chart-block" className="flex flex-col gap-2">
          <div
            data-slot="accum-kline"
            className="flex flex-wrap gap-x-3 gap-y-1 text-[length:var(--t-caption)]"
          >
            {detailKpisOf(phase.row).map((k) => (
              <span key={k.label} data-slot="accum-kline-item" className="inline-flex items-baseline gap-1 whitespace-nowrap">
                <span className="text-[var(--muted-fg)]">{k.label}</span>
                <span className={cn('mono font-semibold', k.tone ? TONE_TEXT[k.tone] : 'text-[var(--fg)]')}>{k.text}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
