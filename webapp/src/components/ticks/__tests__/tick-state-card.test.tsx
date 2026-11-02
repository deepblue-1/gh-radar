import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

import type {
  TickConvertRequest,
  TickConvertResponse,
  TickDayResponse,
  TickOpenGrid,
  TickOpenResponse,
  TickTodayResponse,
} from '@gh-radar/shared';

/**
 * Phase 37 Plan 08 Task 2 — 상태 카드 5 variant(D-16) + 요청 변환 흐름(D-03) · 업로드 전(NOT_UPLOADED) · 당일 · 기본 날짜(D-15).
 *
 * ① 카드 단위: 문구 · 버튼 콜백 · 진행 바 · 동작 줄이기(`motion-reduce:animate-none`).
 * ② 페이지 흐름: `TickViewerPage` 를 가짜 tick-api(vi.mock) · 가짜 타이머로 그려 「convert 1회 → 5초 open 폴링 → 격자 생기면
 *   자동 열림」 · stale 재요청 1회 · 취소 · 429/503 · 숨김 탭 정지/복귀 즉시 1회 · NOT_UPLOADED → 정지 + 업로드 전 카드 ·
 *   failed → 「변환에 실패했어요」 + 사람이 누를 때만 convert · 90일 밖 두 버튼 · 당일 live=false 카드 · 언마운트 정리를 단언한다.
 * 시각은 KST(`+09:00`) — 기본 지금 = 2026-11-02(월) 21:00.
 */

const pushMock = vi.fn();
const replaceMock = vi.fn();
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => '/analytics/ticks',
}));

vi.mock('@/components/trading/dma-gate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/trading/dma-gate')>();
  return { ...actual, useDmaGateReason: () => null };
});

vi.mock('@/hooks/use-debounced-search', () => ({
  useDebouncedSearch: () => ({ results: [], loading: false, error: undefined, resultsQuery: '' }),
}));

const api = vi.hoisted(() => ({
  fetchTickDay: vi.fn(),
  fetchTickToday: vi.fn(),
  fetchTickOpen: vi.fn(),
  postTickConvert: vi.fn(),
  postTickCancel: vi.fn(),
}));
vi.mock('@/lib/ticks/tick-api', () => api);

import { ApiClientError } from '@/lib/api';

import { TickStateCard } from '../tick-state-card';
import { TickViewerPage } from '../tick-viewer-page';

const kst = (iso: string) => new Date(`${iso}+09:00`);
const ISIN = 'KR7000660001';
const D = '20261030';

const GRID: TickOpenGrid = {
  url: 'https://example.test/grid',
  expiresIn: 600,
  bytes: 2_097_152,
  records: 12_345,
  a3_count: 100,
  mode: 'request',
  sources: ['request'],
  fmt: 'pcapns-rec+zstd/1',
  first_recv_ms: null,
  last_recv_ms: null,
  created_at: '2026-10-30T15:00:00Z',
};

function req(over: Partial<TickConvertRequest> = {}): TickConvertRequest {
  return {
    exchange: 'KRX',
    isin: ISIN,
    status: 'pending',
    requested_at: '2026-11-02T12:00:00Z',
    triggered_at: '2026-11-02T12:00:00Z',
    started_at: null,
    finished_at: null,
    error: null,
    stale: false,
    ...over,
  };
}

function openResp(over: Partial<TickOpenResponse> = {}): TickOpenResponse {
  return {
    access: true,
    date: D,
    exchange: 'KRX',
    isin: ISIN,
    stock: { code: '000660', name: 'SK하이닉스' },
    grid: null,
    request: null,
    accum: null,
    eta_s: 240,
    ...over,
  };
}

function convertResp(over: Partial<TickConvertResponse> = {}): TickConvertResponse {
  return {
    access: true,
    grid_ready: false,
    capped: false,
    triggered: true,
    not_uploaded: false,
    retry_after: null,
    request: req(),
    eta_s: 240,
    ...over,
  };
}

const DAY: TickDayResponse = {
  access: true,
  dates: ['20261030', '20261029'],
  date: D,
  rows: [],
  requests: [],
  eta_s: { KRX: 240, NXT: 120 },
};

async function flush() {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}

async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

/** open 응답을 차례로 준다(마지막 값은 계속). */
function openSeq(...resps: (TickOpenResponse | Error)[]) {
  let i = 0;
  api.fetchTickOpen.mockImplementation(() => {
    const r = resps[Math.min(i, resps.length - 1)]!;
    i += 1;
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  });
}

async function mount(query: string) {
  searchParams = new URLSearchParams(query);
  const utils = render(<TickViewerPage />);
  await flush();
  return utils;
}

// ---------------------------------------------------------------------------
// ① 카드 단위
// ---------------------------------------------------------------------------

describe('TickStateCard', () => {
  it('converting — 주황 · 진행 바 · 「약 N분 · 끝나면 자동으로 열려요」 · 취소', () => {
    const onCancel = vi.fn();
    render(<TickStateCard variant="converting" subject="SK하이닉스 · 10/30" etaMin={4} onCancel={onCancel} />);
    expect(screen.getByText('SK하이닉스 · 10/30 변환 중')).toBeInTheDocument();
    expect(screen.getByText(/약 4분 · 끝나면 자동으로 열려요/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="tick-state"]')).toHaveAttribute('data-variant', 'converting');
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('live-loading — 빨강 · 「08:00~지금 하루치 받는 중 · 대기 k건」 · 취소', () => {
    const onCancel = vi.fn();
    render(<TickStateCard variant="live-loading" subject="삼성전자" queued={2} progress={null} onCancel={onCancel} />);
    expect(screen.getByText('삼성전자 · 오늘 · 08:00~지금 하루치 받는 중')).toBeInTheDocument();
    expect(screen.getByText(/대기 2건/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('nodata holiday — 「자료가 없어요」 · 「최근 거래일로」 · 변환 버튼 없음', () => {
    const onLatest = vi.fn();
    render(<TickStateCard variant="nodata" reason="holiday" dateLabel="10/31 (토)" onLatest={onLatest} />);
    expect(screen.getByText('10/31 (토) 자료가 없어요')).toBeInTheDocument();
    expect(screen.getByText(/거래일이 아니에요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '최근 거래일로' }));
    expect(onLatest).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /이 종목만 변환/ })).toBeNull();
  });

  it('nodata retention — 「최근 거래일로」 + 「이 종목만 변환(약 N분)」', () => {
    const onConvert = vi.fn();
    render(<TickStateCard variant="nodata" reason="retention" onLatest={vi.fn()} onConvert={onConvert} etaMin={3} />);
    expect(screen.getByText(/보관 기간\(90일\) 밖/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '이 종목만 변환(약 3분)' }));
    expect(onConvert).toHaveBeenCalledTimes(1);
  });

  it('nodata not-uploaded — 「업로드 전」 문구 · 재시도 버튼 없음', () => {
    render(<TickStateCard variant="nodata" reason="not-uploaded" dateLabel="11/02 (월)" onLatest={vi.fn()} />);
    expect(screen.getByText('11/02 (월) 자료 없음 · 원본 업로드 전')).toBeInTheDocument();
    expect(
      screen.getByText('원본이 아직 올라오지 않았어요 · 매일 22:00 업로드 · 23:30 뒤 다시 열면 변환돼요'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
  });

  it('최근 거래일이 없으면(onLatest null) 버튼을 그리지 않는다', () => {
    render(<TickStateCard variant="nodata" reason="future" onLatest={null} />);
    expect(screen.queryByRole('button', { name: '최근 거래일로' })).toBeNull();
  });

  it('live-unavailable — 「당일 자료 준비 중」 · 「최근 거래일로」', () => {
    const onLatest = vi.fn();
    render(<TickStateCard variant="live-unavailable" onLatest={onLatest} />);
    expect(screen.getByText('당일 자료 준비 중')).toBeInTheDocument();
    expect(screen.getByText('119 당일 경로가 켜지면 여기서 바로 열려요 · 과거 날짜는 지금 볼 수 있어요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '최근 거래일로' }));
    expect(onLatest).toHaveBeenCalledTimes(1);
  });

  it('error — 문구 · 「다시 시도」', () => {
    const onRetry = vi.fn();
    render(<TickStateCard variant="error" message="변환에 실패했어요" onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('변환에 실패했어요');
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('진행 바는 동작 줄이기에서 멈춘다(motion-reduce:animate-none)', () => {
    render(<TickStateCard variant="converting" etaMin={1} onCancel={vi.fn()} />);
    const bar = screen.getByRole('progressbar').firstElementChild!;
    expect(bar.className).toContain('tick-indeterminate');
    expect(bar.className).toContain('motion-reduce:animate-none');
  });
});

// ---------------------------------------------------------------------------
// ② 페이지 흐름
// ---------------------------------------------------------------------------

describe('TickViewerPage — 요청 변환 흐름 (D-03)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(kst('2026-11-02T21:00:00'));
    for (const f of Object.values(api)) f.mockReset();
    pushMock.mockReset();
    api.fetchTickDay.mockResolvedValue(DAY);
    api.fetchTickToday.mockResolvedValue({ access: true, date: '20261102', rows: [], live: false } satisfies TickTodayResponse);
    api.postTickConvert.mockResolvedValue(convertResp());
    api.postTickCancel.mockResolvedValue({ access: true, cancelled: true, request: null });
    setHidden(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('격자 없음 → convert 1회 → 「변환 중」 → 5초 폴링에서 grid → 자동으로 열린다', async () => {
    openSeq(openResp(), openResp({ request: req({ status: 'running' }) }), openResp({ grid: GRID }));
    await mount(`isin=${ISIN}&d=${D}`);
    expect(api.postTickConvert).toHaveBeenCalledTimes(1);
    expect(api.postTickConvert).toHaveBeenCalledWith({ isin: ISIN, d: D, ex: 'KRX' });
    expect(screen.getByText(/SK하이닉스 · 10\/30 변환 중/)).toBeInTheDocument();
    expect(screen.getByText(/약 4분/)).toBeInTheDocument();

    await tick(5000);
    expect(api.fetchTickOpen).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/변환 중/)).toBeInTheDocument();

    await tick(5000);
    expect(api.fetchTickOpen).toHaveBeenCalledTimes(3);
    expect(screen.queryByText(/변환 중/)).toBeNull();
    expect(document.querySelector('[data-slot="tick-body"]')).not.toBeNull();
    // 「격자 받는 중 · 레코드 n건」 줄은 다운로드가 끝나면 사라지는 순간 상태라 단언하지 않는다(부하 시 경합).

    await tick(20_000);
    expect(api.fetchTickOpen).toHaveBeenCalledTimes(3); // 열린 뒤 폴링 없음
    expect(api.postTickConvert).toHaveBeenCalledTimes(1);
  });

  it('진행 중 요청(pending)이면 convert 없이 폴링 · stale 이 보이면 convert 를 1회 다시 부른다', async () => {
    openSeq(
      openResp({ request: req() }),
      openResp({ request: req({ stale: true }) }),
      openResp({ request: req({ status: 'running' }) }),
    );
    await mount(`isin=${ISIN}&d=${D}`);
    expect(api.postTickConvert).toHaveBeenCalledTimes(0);
    expect(screen.getByText(/변환 중/)).toBeInTheDocument();
    await tick(5000);
    expect(api.postTickConvert).toHaveBeenCalledTimes(1);
    await tick(5000);
    await tick(5000);
    expect(api.postTickConvert).toHaveBeenCalledTimes(1);
    expect(api.fetchTickOpen).toHaveBeenCalledTimes(4);
  });

  it('취소 = postTickCancel 후 목록으로', async () => {
    openSeq(openResp({ request: req() }));
    await mount(`isin=${ISIN}&d=${D}`);
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    await flush();
    expect(api.postTickCancel).toHaveBeenCalledWith({ isin: ISIN, d: D, ex: 'KRX' });
    expect(pushMock).toHaveBeenCalledWith(`/analytics/ticks?d=${D}`);
    await tick(15_000);
    expect(api.fetchTickOpen).toHaveBeenCalledTimes(1);
  });

  it('429 → 「오늘 요청 변환 한도에 도달했어요」', async () => {
    openSeq(openResp());
    api.postTickConvert.mockRejectedValue(
      new ApiClientError({ code: 'TICK_CONVERT_CAPPED', message: 'cap', status: 429 }),
    );
    await mount(`isin=${ISIN}&d=${D}`);
    expect(screen.getByText('오늘 요청 변환 한도에 도달했어요')).toBeInTheDocument();
    expect(screen.queryByText(/변환 중/)).toBeNull();
  });

  it('503 → 「요청 변환을 지금 쓸 수 없어요」', async () => {
    openSeq(openResp());
    api.postTickConvert.mockRejectedValue(
      new ApiClientError({ code: 'TICK_CONVERT_UNAVAILABLE', message: 'off', status: 503 }),
    );
    await mount(`isin=${ISIN}&d=${D}`);
    expect(screen.getByText('요청 변환을 지금 쓸 수 없어요')).toBeInTheDocument();
  });

  it('탭이 숨으면 폴링이 멈추고, 보이면 즉시 1회 재개한다', async () => {
    openSeq(openResp({ request: req() }));
    await mount(`isin=${ISIN}&d=${D}`);
    expect(api.fetchTickOpen).toHaveBeenCalledTimes(1);
    act(() => setHidden(true));
    await tick(20_000);
    expect(api.fetchTickOpen).toHaveBeenCalledTimes(1);
    act(() => setHidden(false));
    await flush();
    expect(api.fetchTickOpen).toHaveBeenCalledTimes(2);
    await tick(5000);
    expect(api.fetchTickOpen).toHaveBeenCalledTimes(3);
  });

  it('폴링 중 failed NOT_UPLOADED → 폴링 정지 · 「업로드 전」 카드 · 실패 문구 0 · convert 누계 1', async () => {
    openSeq(openResp(), openResp({ request: req({ status: 'failed', error: 'NOT_UPLOADED' }) }));
    await mount(`isin=${ISIN}&d=${D}`);
    expect(api.postTickConvert).toHaveBeenCalledTimes(1);
    await tick(5000);
    expect(screen.getByText(/원본 업로드 전/)).toBeInTheDocument();
    expect(screen.queryByText(/변환에 실패했어요/)).toBeNull();
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
    await tick(30_000);
    expect(api.fetchTickOpen).toHaveBeenCalledTimes(2);
    expect(api.postTickConvert).toHaveBeenCalledTimes(1);
  });

  it('TOO_LARGE(격자 50MB 초과) → convert 0 · 「너무 많아」 카드 · 재시도 없음', async () => {
    openSeq(openResp({ request: req({ status: 'failed', error: 'TOO_LARGE' }) }));
    await mount(`isin=${ISIN}&d=${D}`);
    expect(screen.getByText(/전문이 너무 많아 뷰어로 열 수 없어요/)).toBeInTheDocument();
    expect(screen.queryByText(/변환에 실패했어요/)).toBeNull();
    expect(screen.queryByRole('button', { name: /다시 시도/ })).toBeNull();
    await tick(30_000);
    expect(api.postTickConvert).toHaveBeenCalledTimes(0);
    expect(api.fetchTickOpen).toHaveBeenCalledTimes(1);
  });

  it('NOT_UPLOADED 상태로 다시 열면 convert 1회 → not_uploaded → 같은 카드(누계 1 · 실패 문구 0)', async () => {
    openSeq(openResp({ request: req({ status: 'failed', error: 'NOT_UPLOADED' }) }));
    api.postTickConvert.mockResolvedValue(
      convertResp({ triggered: false, not_uploaded: true, retry_after: '2026-11-02T14:30:00Z', request: null }),
    );
    await mount(`isin=${ISIN}&d=${D}`);
    expect(api.postTickConvert).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/원본 업로드 전/)).toBeInTheDocument();
    expect(screen.queryByText(/변환에 실패했어요/)).toBeNull();
    await tick(30_000);
    expect(api.postTickConvert).toHaveBeenCalledTimes(1);
    expect(api.fetchTickOpen).toHaveBeenCalledTimes(1);
  });

  it('NOT_UPLOADED 로 다시 열었는데 이번엔 triggered 면 변환 카드', async () => {
    openSeq(openResp({ request: req({ status: 'failed', error: 'NOT_UPLOADED' }) }));
    await mount(`isin=${ISIN}&d=${D}`);
    expect(api.postTickConvert).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/변환 중/)).toBeInTheDocument();
  });

  it('failed(그 밖) → 「변환에 실패했어요」 · convert 는 사람이 누를 때만', async () => {
    openSeq(openResp({ request: req({ status: 'failed', error: 'NO_RECORDS' }) }));
    await mount(`isin=${ISIN}&d=${D}`);
    expect(screen.getByText('변환에 실패했어요')).toBeInTheDocument();
    expect(api.postTickConvert).toHaveBeenCalledTimes(0);
    await tick(15_000);
    expect(api.postTickConvert).toHaveBeenCalledTimes(0);
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await flush();
    expect(api.postTickConvert).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/변환 중/)).toBeInTheDocument();
  });

  it('90일 밖 → 「최근 거래일로」 + 「이 종목만 변환」 · 누르기 전 convert 0', async () => {
    openSeq(openResp({ date: '20260701' }));
    await mount(`isin=${ISIN}&d=20260701`);
    expect(screen.getByText(/보관 기간\(90일\) 밖/)).toBeInTheDocument();
    expect(api.postTickConvert).toHaveBeenCalledTimes(0);
    fireEvent.click(screen.getByRole('button', { name: '최근 거래일로' }));
    expect(pushMock).toHaveBeenCalledWith('/analytics/ticks?d=20261030');
    fireEvent.click(screen.getByRole('button', { name: /이 종목만 변환\(약 4분\)/ }));
    await flush();
    expect(api.postTickConvert).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/변환 중/)).toBeInTheDocument();
  });

  it('토요일 → 휴장 카드 · convert 0', async () => {
    openSeq(openResp({ date: '20261031' }));
    await mount(`isin=${ISIN}&d=20261031`);
    expect(screen.getByText(/거래일이 아니에요/)).toBeInTheDocument();
    expect(api.postTickConvert).toHaveBeenCalledTimes(0);
  });

  it('화면을 떠나면 타이머를 정리한다', async () => {
    openSeq(openResp({ request: req() }));
    const { unmount } = await mount(`isin=${ISIN}&d=${D}`);
    unmount();
    await tick(30_000);
    expect(api.fetchTickOpen).toHaveBeenCalledTimes(1);
  });
});

describe('TickViewerPage — 당일 · 기본 날짜 (D-15 · D-22)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    for (const f of Object.values(api)) f.mockReset();
    pushMock.mockReset();
    api.fetchTickDay.mockResolvedValue(DAY);
    api.fetchTickToday.mockResolvedValue({
      access: true,
      date: '20261102',
      rows: [{ isin: ISIN, code: '000660', name: 'SK하이닉스', sources: ['up15'], rate: 16, high_rate: 18 }],
      live: false,
    } satisfies TickTodayResponse);
    setHidden(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('장중(평일 10:00) d 없음 → 오늘 목록(/today) · 「라이브」 칩', async () => {
    vi.setSystemTime(kst('2026-11-02T10:00:00'));
    await mount('');
    expect(api.fetchTickToday).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: '오늘 종목' })).toBeInTheDocument();
    expect(screen.getByText('라이브')).toBeInTheDocument();
  });

  it('장 밖(21:00) d 없음 → 최근 격자 날짜(/day 를 d 없이) · /today 0', async () => {
    vi.setSystemTime(kst('2026-11-02T21:00:00'));
    await mount('');
    expect(api.fetchTickDay).toHaveBeenCalledWith(undefined);
    expect(api.fetchTickToday).toHaveBeenCalledTimes(0);
    expect(screen.getByRole('heading', { name: '10/30 격자 종목' })).toBeInTheDocument();
  });

  it('오늘 종목을 열었는데 live=false → 「당일 자료 준비 중」 · convert 0', async () => {
    vi.setSystemTime(kst('2026-11-02T10:00:00'));
    openSeq(openResp({ date: '20261102' }));
    await mount(`isin=${ISIN}&d=20261102`);
    expect(screen.getByText('당일 자료 준비 중')).toBeInTheDocument();
    expect(api.postTickConvert).toHaveBeenCalledTimes(0);
    fireEvent.click(screen.getByRole('button', { name: '최근 거래일로' }));
    expect(pushMock).toHaveBeenCalledWith('/analytics/ticks?d=20261030');
  });
});
