'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import type {
  TickConvertRequest,
  TickDayResponse,
  TickExchange,
  TickOpenResponse,
  TickTodayResponse,
} from '@gh-radar/shared';

import { CARD } from '@/components/layout/page-layout';
import { DmaGate, useDmaGateReason, type DmaGateReason } from '@/components/trading/dma-gate';
import { ApiClientError } from '@/lib/api';
import { dateNavOf, fmtYmdLabel, fmtYmdShort } from '@/lib/limitup-report';
import { fetchTickDay, fetchTickOpen, fetchTickToday, postTickCancel, postTickConvert } from '@/lib/ticks/tick-api';
import { fmtBytes, fmtQty } from '@/lib/ticks/tick-format';
import { defaultTickDateOf, nodataReasonOf, parseTickUrl, tickUrlOf, type NodataReason } from '@/lib/ticks/tick-url';
import { cn } from '@/lib/utils';

import { TickEntry, type TickEntrySort } from './tick-entry';
import { TickHeader } from './tick-header';
import { TickStateCard } from './tick-state-card';
import { TickStockPicker } from './tick-stock-picker';

/**
 * 틱 전문 뷰어 페이지 본문 (Phase 37 D-03 · D-08 · D-15 · D-16 · D-18 · D-22).
 *
 * ① URL 정본 = `?isin&d&ex&t`(`parseTickUrl` — 잘못된 값은 기본값). 종목 고르기 · 날짜 · 거래소 이동 = `router.push`
 *   (뒤로 = 목록). 틱 이동 `replaceState` 는 37-10.
 * ② 게이트: `useDmaGateReason()` · server 401/403 → 본문 대신 `DmaGate surface="틱 전문 뷰어"` 만. 표시 장치일 뿐 권한은
 *   server RPC(`tick_*_for_user`)다.
 * ③ 기본 날짜(D-15): d 없음 → KST 거래일 08:00~20:00 이면 오늘(`/api/ticks/today` 목록 · 「라이브」) · 그 밖에는 격자가 있는
 *   최근 날짜(`/api/ticks/day` 를 d 없이 — 응답 date). URL 은 건드리지 않고 화면만 그 날짜다.
 * ④ isin 없음 = 진입(그날 격자 목록 · 행 없고 「자료 없음」 사유가 있으면 상태 카드). isin 있음 = 열기 — `/api/ticks/open` 한 번 →
 *   - grid → 열림(머리 + 본문 자리 · 37-10 이 `TickViewer` 를 넣는다)
 *   - request pending/running → 「변환 중」 + 5초 폴링(stale 이면 convert 1회 — server should_trigger 가 Job 을 하나만 깨운다)
 *   - request failed ∧ `NOT_UPLOADED` → convert 1회 → `not_uploaded` 면 「업로드 전」 카드(상한 소모 0) · triggered 면 「변환 중」
 *   - request failed(그 밖) → 「변환에 실패했어요 · 다시 시도」(convert 는 사람이 누를 때만)
 *   - 없음 → `nodataReasonOf` 사유가 있으면 「자료 없음」(90일 밖은 「이 종목만 변환」 도) · 오늘이면 today.live(아니면 「당일
 *     자료 준비 중」) · 그 밖에는 convert 1회 → 「변환 중」. 429 · 503 · 502 는 카드 문구.
 * ⑤ 폴링(`useConvertPolling`): 5초 · 탭이 숨으면 멈추고 보이면 즉시 1회 · 화면을 떠나면 정리. 폴링 중 `NOT_UPLOADED` 가 오면
 *   멈추고 「업로드 전」(재시도 루프 없음).
 */

/** 변환 상태 폴링 간격 — 5초(D-03). */
export const TICK_POLL_MS = 5_000;

type OpenView =
  | { kind: 'loading' }
  | { kind: 'leaving' }
  | { kind: 'error' }
  | { kind: 'loaded'; resp: TickOpenResponse }
  | { kind: 'converting'; resp: TickOpenResponse; eta_s: number }
  | { kind: 'nodata'; resp: TickOpenResponse; reason: NodataReason }
  | { kind: 'failed'; resp: TickOpenResponse }
  | { kind: 'blocked'; resp: TickOpenResponse; message: string; retry: boolean }
  | { kind: 'live-unavailable'; resp: TickOpenResponse }
  | { kind: 'live-loading'; resp: TickOpenResponse };

type Load<T> = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; resp: T };

/** 한 번의 열기 실행 — 날짜 · 종목 · 거래소가 바뀌거나 화면을 떠나면 alive=false(늦은 응답 무시). */
interface Run {
  alive: boolean;
  converting: boolean;
}

/** 401 · 403 → 게이트 사유(그 밖 null). */
function gateOf(err: unknown): DmaGateReason | null {
  if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
    return err.status === 401 ? 'unauthenticated' : 'unmapped';
  }
  return null;
}

const etaMinOf = (s: number | undefined) => Math.max(1, Math.ceil((s ?? 0) / 60));
const isActive = (r: TickConvertRequest | null) => r !== null && (r.status === 'pending' || r.status === 'running');
const isNotUploaded = (r: TickConvertRequest | null) => r !== null && r.status === 'failed' && r.error === 'NOT_UPLOADED';

/** 변환 상태 폴링 — `active` 동안 `intervalMs` 마다 `tick`. 숨은 탭은 멈추고, 다시 보이면 즉시 1회. */
function useConvertPolling(active: boolean, tick: () => Promise<void>, intervalMs: number) {
  const tickRef = useRef(tick);
  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    let stopped = false;
    const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';
    const clear = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    const schedule = () => {
      if (stopped || hidden() || timer !== null) return;
      timer = setTimeout(run, intervalMs);
    };
    async function run() {
      timer = null;
      if (stopped || running) return;
      running = true;
      try {
        await tickRef.current();
      } finally {
        running = false;
      }
      schedule();
    }
    const onVisibility = () => {
      if (hidden()) clear();
      else if (timer === null && !running) void run();
    };
    schedule();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      clear();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active, intervalMs]);
}

export function TickViewerPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const spKey = sp.toString();
  const url = useMemo(() => parseTickUrl(new URLSearchParams(spKey)), [spKey]);
  const { isin, d, ex } = url;
  const gate = useDmaGateReason();
  const [boot] = useState(() => defaultTickDateOf(new Date()));
  const today = boot.today;

  const [serverGate, setServerGate] = useState<DmaGateReason | null>(null);
  const [day, setDay] = useState<Load<TickDayResponse>>({ kind: 'loading' });
  const [todayList, setTodayList] = useState<Load<TickTodayResponse> | null>(null);
  const [view, setView] = useState<OpenView | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sort, setSort] = useState<TickEntrySort>('rate');
  const runRef = useRef<Run>({ alive: false, converting: false });

  const fail = useCallback((err: unknown, set: () => void) => {
    const g = gateOf(err);
    if (g !== null) setServerGate(g);
    else set();
  }, []);

  // 그날(또는 최근) 목록 — 진입 목록 · 날짜 알약 · 격자 isin · 예상 대기의 원천.
  const dayArg = d ?? (boot.mode === 'today' ? today : undefined);
  useEffect(() => {
    if (gate !== null) return;
    let alive = true;
    setDay({ kind: 'loading' });
    fetchTickDay(dayArg).then(
      (resp) => alive && setDay({ kind: 'ready', resp }),
      (err: unknown) => alive && fail(err, () => setDay({ kind: 'error' })),
    );
    return () => {
      alive = false;
    };
  }, [dayArg, gate, attempt, fail]);

  const dayResp = day.kind === 'ready' ? day.resp : null;
  const shown = dayArg ?? dayResp?.date ?? null;
  const isToday = shown === today;
  const latest = dayResp?.dates.find((x) => x < today) ?? dayResp?.dates[0] ?? null;

  // 오늘 목록(D-15) — 진입 화면에서 오늘을 볼 때만.
  useEffect(() => {
    if (gate !== null || isin !== null || !isToday) {
      setTodayList(null);
      return;
    }
    let alive = true;
    setTodayList({ kind: 'loading' });
    fetchTickToday().then(
      (resp) => alive && setTodayList({ kind: 'ready', resp }),
      (err: unknown) => alive && fail(err, () => setTodayList({ kind: 'error' })),
    );
    return () => {
      alive = false;
    };
  }, [isin, isToday, gate, attempt, fail]);

  /** 요청 변환 1회 — 결과에 따라 변환 중 · 업로드 전 · 다시 열기 · 카드 문구. `quiet` = 폴링 중 stale 재요청(화면 유지). */
  const convert = useCallback(
    async (run: Run, resp: TickOpenResponse, quiet = false) => {
      if (run.converting) return;
      run.converting = true;
      try {
        const c = await postTickConvert({ isin: resp.isin, d: resp.date, ex: resp.exchange });
        if (!run.alive) return;
        if (c.grid_ready) {
          setAttempt((n) => n + 1);
          return;
        }
        if (c.not_uploaded) {
          setView({ kind: 'nodata', resp, reason: 'not-uploaded' });
          return;
        }
        if (!quiet) setView({ kind: 'converting', resp, eta_s: c.eta_s ?? resp.eta_s });
      } catch (err) {
        if (!run.alive) return;
        const g = gateOf(err);
        if (g !== null) {
          setServerGate(g);
          return;
        }
        const status = err instanceof ApiClientError ? err.status : 0;
        if (status === 429) setView({ kind: 'blocked', resp, message: '오늘 요청 변환 한도에 도달했어요', retry: false });
        else if (status === 503) setView({ kind: 'blocked', resp, message: '요청 변환을 지금 쓸 수 없어요', retry: false });
        else setView({ kind: 'blocked', resp, message: '변환을 시작하지 못했어요', retry: true });
      } finally {
        run.converting = false;
      }
    },
    [],
  );

  // 한 종목 열기 — open 1회 → 분기(머리 주석 ④).
  useEffect(() => {
    if (gate !== null || isin === null || shown === null) {
      setView(null);
      return;
    }
    const run: Run = { alive: true, converting: false };
    runRef.current = run;
    setView({ kind: 'loading' });
    (async () => {
      let resp: TickOpenResponse;
      try {
        resp = await fetchTickOpen({ isin, d: shown, ex });
      } catch (err) {
        if (run.alive) fail(err, () => setView({ kind: 'error' }));
        return;
      }
      if (!run.alive) return;
      const r = resp.request;
      if (resp.grid !== null) return setView({ kind: 'loaded', resp });
      if (isActive(r)) {
        setView({ kind: 'converting', resp, eta_s: resp.eta_s });
        if (r!.stale) void convert(run, resp, true);
        return;
      }
      if (isNotUploaded(r)) return void convert(run, resp);
      if (r !== null && r.status === 'failed') return setView({ kind: 'failed', resp });
      const reason = nodataReasonOf(shown, new Date());
      if (reason !== null) return setView({ kind: 'nodata', resp, reason });
      if (shown === today) {
        try {
          const t = await fetchTickToday();
          if (!run.alive) return;
          setView({ kind: t.live ? 'live-loading' : 'live-unavailable', resp });
        } catch (err) {
          if (run.alive) fail(err, () => setView({ kind: 'error' }));
        }
        return;
      }
      void convert(run, resp);
    })();
    return () => {
      run.alive = false;
    };
  }, [isin, shown, ex, gate, attempt, today, convert, fail]);

  // 변환 중 폴링(머리 주석 ⑤).
  const pollTick = useCallback(async () => {
    const run = runRef.current;
    if (!run.alive || isin === null || shown === null) return;
    let resp: TickOpenResponse;
    try {
      resp = await fetchTickOpen({ isin, d: shown, ex });
    } catch (err) {
      const g = gateOf(err);
      if (g !== null && run.alive) setServerGate(g);
      return; // 일시 오류는 다음 주기에 다시 본다
    }
    if (!run.alive) return;
    const r = resp.request;
    if (resp.grid !== null) return setView({ kind: 'loaded', resp });
    if (isNotUploaded(r)) return setView({ kind: 'nodata', resp, reason: 'not-uploaded' });
    if (r !== null && (r.status === 'failed' || r.status === 'cancelled' || r.status === 'done')) {
      return setView({ kind: 'failed', resp });
    }
    if (r !== null && r.stale) void convert(run, resp, true);
  }, [isin, shown, ex, convert]);

  useConvertPolling(view?.kind === 'converting', pollTick, TICK_POLL_MS);

  useEffect(() => {
    const name = view !== null && 'resp' in view ? view.resp.stock?.name : undefined;
    document.title = name ? `${name} · 틱 전문 뷰어` : '틱 전문 뷰어';
  }, [view]);

  const gateReason = gate ?? serverGate;
  if (gateReason !== null) {
    return (
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4">
        <DmaGate reason={gateReason} surface="틱 전문 뷰어" />
      </div>
    );
  }

  const navDates =
    boot.mode === 'today' ? [today, ...(dayResp?.dates ?? []).filter((x) => x !== today)] : (dayResp?.dates ?? []);
  const nav = dateNavOf(navDates, shown);
  const go = (next: { isin?: string | null; d?: string | null; ex?: TickExchange }) =>
    router.push(
      tickUrlOf({
        isin: next.isin === undefined ? isin : next.isin,
        d: next.d === undefined ? shown : next.d,
        ex: next.ex ?? ex,
      }),
    );
  const goLatest = latest !== null && latest !== shown ? () => go({ isin: null, d: latest }) : null;
  const openResp = view !== null && 'resp' in view ? view.resp : null;
  const gridIsins = new Set(
    dayResp !== null && dayResp.date === shown ? dayResp.rows.filter((r) => r.exchange === ex).map((r) => r.isin) : [],
  );

  const cancel = async () => {
    if (openResp === null) return;
    runRef.current.alive = false;
    setView({ kind: 'leaving' });
    try {
      await postTickCancel({ isin: openResp.isin, d: openResp.date, ex: openResp.exchange });
    } catch {
      /* 취소 실패(이미 실행 중 · 다른 사용자 요청)여도 목록으로 — Job 은 끝까지 돌고 격자는 남는다 */
    }
    go({ isin: null });
  };

  return (
    <div data-slot="tick-viewer" className="mx-auto flex w-full max-w-[1280px] flex-col gap-3">
      <TickHeader
        mode={isin !== null ? 'loaded' : 'entry'}
        stock={openResp?.stock ?? null}
        date={shown}
        ex={ex}
        supply={shown === null ? null : isToday ? 'live' : 'grid'}
        prev={nav.prev}
        next={nav.next}
        onDate={(to) => go({ d: to })}
        onEx={(x) => go({ ex: x })}
        picker={
          <TickStockPicker
            date={shown}
            ex={ex}
            gridIsins={gridIsins}
            isToday={isToday}
            etaS={dayResp?.eta_s ?? { KRX: 0, NXT: 0 }}
            onSelect={(s) => go({ isin: s.isin })}
          />
        }
      />

      {isin === null ? renderEntry() : renderOpen()}
    </div>
  );

  function retry(text: string) {
    return <TickStateCard variant="error" message={text} onRetry={() => setAttempt((n) => n + 1)} />;
  }

  function renderEntry() {
    if (day.kind === 'loading') return <Loading />;
    if (day.kind === 'error') return retry('불러오지 못했어요');
    const resp = day.resp;
    if (isToday && todayList !== null) {
      if (todayList.kind === 'loading') return <Loading />;
      if (todayList.kind === 'error') return retry('불러오지 못했어요');
      return (
        <TickEntry
          date={today}
          rows={[]}
          todayRows={todayList.resp.rows}
          sort={sort}
          onSort={setSort}
          onOpen={(i) => go({ isin: i, ex: 'KRX' })}
          etaMin={etaMinOf(resp.eta_s[ex])}
        />
      );
    }
    const reason = shown !== null && resp.rows.length === 0 ? nodataReasonOf(shown, new Date()) : null;
    if (reason !== null && shown !== null) {
      return <TickStateCard variant="nodata" reason={reason} dateLabel={fmtYmdLabel(shown)} onLatest={goLatest} />;
    }
    return (
      <TickEntry
        date={shown ?? ''}
        rows={resp.rows}
        sort={sort}
        onSort={setSort}
        onOpen={(i, x) => go({ isin: i, ex: x })}
        etaMin={etaMinOf(resp.eta_s[ex])}
      />
    );
  }

  function renderOpen() {
    if (view === null || view.kind === 'loading' || view.kind === 'leaving') return <Loading />;
    if (view.kind === 'error') return retry('불러오지 못했어요');
    const subject = `${view.resp.stock?.name ?? view.resp.isin} · ${fmtYmdShort(view.resp.date)}`;
    const run = runRef.current;
    switch (view.kind) {
      case 'converting':
        return <TickStateCard variant="converting" subject={subject} etaMin={etaMinOf(view.eta_s)} onCancel={cancel} />;
      case 'nodata':
        return (
          <TickStateCard
            variant="nodata"
            reason={view.reason}
            dateLabel={fmtYmdLabel(view.resp.date)}
            onLatest={goLatest}
            onConvert={view.reason === 'retention' ? () => void convert(run, view.resp) : undefined}
            etaMin={etaMinOf(view.resp.eta_s)}
          />
        );
      case 'failed':
        return (
          <TickStateCard
            variant="error"
            message="변환에 실패했어요"
            onBack={() => go({ isin: null })}
            onRetry={() => void convert(run, view.resp)}
          />
        );
      case 'blocked':
        return (
          <TickStateCard
            variant="error"
            message={view.message}
            onBack={() => go({ isin: null })}
            onRetry={view.retry ? () => void convert(run, view.resp) : undefined}
          />
        );
      case 'live-unavailable':
        return <TickStateCard variant="live-unavailable" onLatest={goLatest} />;
      case 'live-loading':
        // 37-19 가 당일 하루치 요청 · 대기열을 결선한다 — 그 전에는 live=true 가 오지 않는다(server 37-15).
        return (
          <TickStateCard
            variant="live-loading"
            subject={view.resp.stock?.name ?? view.resp.isin}
            queued={0}
            progress={null}
            onCancel={() => go({ isin: null })}
          />
        );
      case 'loaded': {
        const grid = view.resp.grid!;
        // 37-10 이 이 자리에 `TickViewer`(슬라이더 · 호가 · 목록 · 차트)를 넣는다.
        return (
          <section data-slot="tick-body" className={cn(CARD, 'px-4 py-3 text-[12.5px] text-[var(--muted-fg)]')}>
            격자 준비됨 · 레코드 {fmtQty(grid.records)}건 · 크기 {fmtBytes(grid.bytes)}
          </section>
        );
      }
    }
  }
}

function Loading() {
  return (
    <p role="status" aria-live="polite" className="m-0 text-[length:var(--t-caption)] text-[var(--muted-fg)]">
      불러오는 중…
    </p>
  );
}
