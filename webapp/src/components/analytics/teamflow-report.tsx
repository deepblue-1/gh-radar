'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import type { LimitupDate, TeamflowReportResponse } from '@gh-radar/shared';

import { PageHeader } from '@/components/layout/page-header';
import { CARD } from '@/components/layout/page-layout';
import { DmaGate, useDmaGateReason, type DmaGateReason } from '@/components/trading/dma-gate';
import { Button } from '@/components/ui/button';
import { ApiClientError } from '@/lib/api';
import { dateNavOf, fmtYmdShort, parseYmdParam } from '@/lib/limitup-report';
import { fetchTeamflowReport } from '@/lib/teamflow-api';
import { sortRows } from '@/lib/teamflow-report';
import { cn } from '@/lib/utils';

import { LimitupDateNav } from './limitup-date-nav';
import { TeamflowDayGrid } from './teamflow-day-grid';

/**
 * 팀 매집 보고서 본문 (Phase 33 · UI-SPEC T1 페이지 셸 · T3 목록 · D-07 · D-08).
 *
 * `limitup-report.tsx` 의 상태기계(loading · error · gate · ready)를 옮긴다.
 * ① URL 정본 = `?d=YYYYMMDD`. 쿼리 없음 = 최신(URL 을 쓰지 않는다 — server 가 정한다). 형식 오류 → `router.replace(BASE)`.
 *   날짜 이동 = `router.push`.
 * ② 게이트: `useDmaGateReason()` 사유 · server 401/403 · `{access:false}` → 본문 대신 `DmaGate surface="팀 매집"` 만.
 *   웹 게이트는 표시 장치일 뿐 — 실제 권한은 server + RPC(teamflow_report_for_user)다.
 * ③ 머리(제목 + 설명 + 날짜 알약)는 로딩 · 오류 중에도 그린다. 알약 글자는 `?d` 에서 즉시 · ‹ › 는 마지막으로 받은
 *   `dates[]`(행 있는 날짜만 — D-07)로 판정한다. `?d` 가 dates 밖(행 없는 날)이면 `dateNavOf` 가 앞뒤 행 있는 날로 보낸다.
 * ④ 빈 상태 2종: 이력 0(`dates` 빔) · 행 없는 날(`dates > 0 ∧ rows []`) — 둘 다 목록 카드 없음(`data-slot="teamflow-empty"`).
 * ⑤ 행이 있으면 탐지 종목 카드(행 = team_net_val 큰 순 · 기본 전부 접힘). KPI 띠 · 미니막대는 33-03 이 덧붙인다.
 */

type Ready = Exclude<TeamflowReportResponse, { access: false }>;
type Phase =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'gate'; reason: DmaGateReason }
  | { kind: 'ready'; resp: Ready };

const BASE = '/analytics/teamflow';

export function TeamflowReport() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams.get('d');
  const d = parseYmdParam(raw);
  const invalid = raw !== null && d === null;
  const gate = useDmaGateReason();

  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [dates, setDates] = useState<readonly LimitupDate[]>([]);

  // ① 형식 오류 → 최신으로 정본화.
  useEffect(() => {
    if (invalid) router.replace(BASE);
  }, [invalid, router]);

  useEffect(() => {
    if (gate !== null) return;
    let alive = true;
    setPhase({ kind: 'loading' });
    fetchTeamflowReport(d ?? undefined).then(
      (resp) => {
        if (!alive) return;
        if (!resp.access) {
          setPhase({ kind: 'gate', reason: 'unmapped' });
          return;
        }
        setDates(resp.dates);
        setPhase({ kind: 'ready', resp });
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
  }, [d, attempt, gate]);

  const resp = phase.kind === 'ready' ? phase.resp : null;
  const shown: LimitupDate | null = d ?? resp?.date ?? null;

  useEffect(() => {
    document.title = shown === null ? '팀 매집' : `팀 매집 · ${fmtYmdShort(shown)}`;
  }, [shown]);

  const nav = dateNavOf(dates, shown);
  const go = (to: LimitupDate) => router.push(`${BASE}?d=${to}`);

  const rows = useMemo(() => (resp !== null && resp.rows.length > 0 ? sortRows(resp.rows) : null), [resp]);

  const gateReason = gate ?? (phase.kind === 'gate' ? phase.reason : null);
  if (gateReason !== null) {
    return (
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4">
        <DmaGate reason={gateReason} surface="팀 매집" />
      </div>
    );
  }

  return (
    <div data-slot="teamflow-report" className="mx-auto flex w-full max-w-[1120px] flex-col gap-4">
      <PageHeader
        title="팀 매집"
        description="평일 밤 21:20쯤 그날 보고서가 올라와요 · 팀 = 교보 · 한국 · 유진 · 신한 · NH"
        actions={<LimitupDateNav date={shown} prev={nav.prev} next={nav.next} onGo={go} />}
      />

      {phase.kind === 'loading' && (
        <p className="text-[length:var(--t-caption)] text-[var(--faint)]">불러오는 중…</p>
      )}

      {phase.kind === 'error' && (
        <div role="alert" className={cn(CARD, 'flex flex-col items-center gap-2 px-4 py-12 text-center')}>
          <p className="text-[length:var(--t-sm)] font-semibold break-keep text-[var(--fg)]">보고서를 불러오지 못했어요</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="text-[length:var(--t-caption)] font-semibold text-[var(--accent-fg)] hover:underline"
          >
            다시 시도
          </button>
        </div>
      )}

      {resp !== null && resp.dates.length === 0 && (
        <EmptyBox title="아직 올라온 팀 매집 보고서가 없어요" body="첫 보고서는 평일 밤 21:20쯤 올라와요" />
      )}

      {resp !== null && resp.dates.length > 0 && resp.rows.length === 0 && (
        <EmptyBox
          title="이 날은 팀 매집 데이터가 없어요"
          body={`팀 매집 보고서는 평일 밤 21:20쯤 올라와요. 최신 보고서는 ${fmtYmdShort(resp.dates[0]!)}예요`}
        >
          <Button className="mt-2" onClick={() => go(resp.dates[0]!)}>
            최신 보고서 보기
          </Button>
        </EmptyBox>
      )}

      {resp !== null && rows !== null && (
        <section aria-labelledby="teamflow-list-title" className={cn(CARD, 'p-4')}>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h2 id="teamflow-list-title" className="text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
              탐지 종목
            </h2>
            <span className="text-[length:var(--t-caption)] break-keep text-[var(--muted-fg)]">
              팀 순매수 큰 순 · 막대 = 구간별 팀 순매수(0% 미만 → 상한가 가격 · 점선 = 20%)
            </span>
          </div>
          <TeamflowDayGrid key={resp.date ?? ''} rows={rows} />
        </section>
      )}
    </div>
  );
}

function EmptyBox({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div
      data-slot="teamflow-empty"
      className={cn(CARD, 'flex flex-col items-center gap-1 px-4 py-12 text-center')}
    >
      <p className="text-[length:var(--t-sm)] font-semibold break-keep text-[var(--fg)]">{title}</p>
      <p className="text-[length:var(--t-caption)] break-keep text-[var(--muted-fg)]">{body}</p>
      {children}
    </div>
  );
}
