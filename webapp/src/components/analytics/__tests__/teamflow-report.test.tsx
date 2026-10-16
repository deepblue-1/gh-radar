import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

import type { TeamflowReportResponse } from '@gh-radar/shared';

/**
 * Phase 33 Plan 01 (트레이서 C4) — `/analytics/teamflow` 본문 · 목록 · 펼침 요약 (UI-SPEC T1 · T3 · T5 · D-08 · D-09 · D-10).
 *
 * 잠그는 것: 10/14 실측 34행이 team_net_val 큰 순(첫 행 한선엔지니어링 「+5.9억」)으로 · 기본 전부 접힘 · 한 번에 하나 ·
 * 펼친 행 아래 section#tf-{isin} 요약(<b> 짝만 strong) · 빈 상태 2종 · 오류 + 다시 시도 · 403 게이트 「팀 매집은」 ·
 * 형식 오류 ?d → replace · 문서 제목 · 허용 밖 태그 제거(HTML 주입 경로 없음).
 */

const replaceMock = vi.fn();
const pushMock = vi.fn();
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock, back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => '/analytics/teamflow',
}));

let mockGate: 'unauthenticated' | 'unmapped' | null = null;
vi.mock('@/components/trading/dma-gate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/trading/dma-gate')>();
  return { ...actual, useDmaGateReason: () => mockGate };
});

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }),
}));

const fetchReportMock = vi.fn();
vi.mock('@/lib/teamflow-api', () => ({
  fetchTeamflowReport: (d?: string) => fetchReportMock(d),
}));

import { ApiClientError } from '@/lib/api';
import {
  CHEONIL,
  DONGYANG,
  HANSUN,
  teamflowReportFixture,
  teamflowRows,
} from '@/test-fixtures/teamflow-export';

import { TeamflowReport } from '../teamflow-report';

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function open(query: string, resp?: TeamflowReportResponse | Error) {
  searchParams = new URLSearchParams(query);
  if (resp instanceof Error) fetchReportMock.mockRejectedValueOnce(resp);
  else if (resp !== undefined) fetchReportMock.mockResolvedValueOnce(resp);
  const r = render(<TeamflowReport />);
  await flush();
  return r;
}

const rowButtons = () =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('[data-slot="teamflow-list"] button[data-isin]'));
const rowBtn = (isin: string) => document.getElementById(`teamflow-row-${isin}`) as HTMLButtonElement;

beforeEach(() => {
  mockGate = null;
  replaceMock.mockReset();
  pushMock.mockReset();
  fetchReportMock.mockReset();
  document.title = '';
});

describe('TeamflowReport', () => {
  it('(a) 10/14 픽스처 → 34행 · team_net_val 큰 순(첫 행 한선엔지니어링 「+5.9억」) · 기본 전부 접힘', async () => {
    await open('d=20261014', teamflowReportFixture());
    expect(screen.getByRole('heading', { level: 1, name: '팀 매집' })).toBeTruthy();
    expect(screen.getByText('평일 밤 21:20쯤 그날 보고서가 올라와요 · 팀 = 교보 · 한국 · 유진 · 신한 · NH')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: '탐지 종목' })).toBeTruthy();
    const btns = rowButtons();
    expect(btns).toHaveLength(34);
    expect(btns[0]!.getAttribute('data-isin')).toBe(HANSUN);
    expect(btns[0]!.getAttribute('aria-label')).toContain('한선엔지니어링');
    expect(btns[0]!.getAttribute('aria-label')).toMatch(/— 팀 매집 상세$/);
    expect(within(btns[0]!).getByText('+5.9억')).toBeTruthy();
    expect(btns.every((b) => b.getAttribute('aria-expanded') === 'false')).toBe(true);
    expect(btns.every((b) => !b.hasAttribute('aria-controls'))).toBe(true);
    expect(document.querySelector('[data-slot="teamflow-detail"]')).toBeNull();
    // D-09 결과 태그 — 상한가 = 「상한가 HH:MM」 · 미도달 = 등락률
    expect(rowBtn(CHEONIL).textContent).toContain('상한가 11:50');
    expect(rowBtn(DONGYANG).textContent).toContain('+22.1%');
    expect(fetchReportMock).toHaveBeenCalledWith('20261014');
  });

  it('(b) 천일고속 행 클릭 → aria-expanded true · aria-controls · section#tf-{isin} 요약 strong 「+1.1억」', async () => {
    await open('d=20261014', teamflowReportFixture());
    fireEvent.click(rowBtn(CHEONIL));
    const btn = rowBtn(CHEONIL);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(btn.getAttribute('aria-controls')).toBe(`tf-${CHEONIL}`);
    const sec = document.getElementById(`tf-${CHEONIL}`)!;
    expect(sec).toBeTruthy();
    expect(sec.tagName).toBe('SECTION');
    expect(sec.getAttribute('aria-labelledby')).toBe(`teamflow-row-${CHEONIL}`);
    const strongs = Array.from(sec.querySelectorAll('strong')).map((s) => s.textContent);
    expect(strongs).toContain('+1.1억');
    // 번호 목록 = summary_lines 수 · 사실 줄
    const lines = teamflowRows().find((r) => r.isin === CHEONIL)!.payload!.summary_lines;
    expect(sec.querySelectorAll('[data-slot="teamflow-summary"] ol > li')).toHaveLength(lines.length);
    expect(sec.querySelector('[data-slot="teamflow-fact"]')!.textContent).toMatch(/^기준가 172,600 · 상한가 224,000 · /);
  });

  it('(c) 다른 행(동양고속) 클릭 → 천일고속 상세 언마운트 · 같은 행 다시 클릭 → 접힘', async () => {
    await open('d=20261014', teamflowReportFixture());
    fireEvent.click(rowBtn(CHEONIL));
    expect(document.getElementById(`tf-${CHEONIL}`)).toBeTruthy();
    fireEvent.click(rowBtn(DONGYANG));
    expect(document.getElementById(`tf-${CHEONIL}`)).toBeNull();
    expect(document.getElementById(`tf-${DONGYANG}`)).toBeTruthy();
    expect(rowBtn(CHEONIL).getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(rowBtn(DONGYANG));
    expect(document.getElementById(`tf-${DONGYANG}`)).toBeNull();
    expect(rowButtons().every((b) => b.getAttribute('aria-expanded') === 'false')).toBe(true);
  });

  it('(d) 적재 이력 0 → 「아직 올라온 팀 매집 보고서가 없어요」 · 목록 없음', async () => {
    await open('', { access: true, dates: [], date: null, rows: [] });
    expect(screen.getByText('아직 올라온 팀 매집 보고서가 없어요')).toBeTruthy();
    expect(screen.getByText('첫 보고서는 평일 밤 21:20쯤 올라와요')).toBeTruthy();
    expect(document.querySelector('[data-slot="teamflow-empty"]')).toBeTruthy();
    expect(document.querySelector('[data-slot="teamflow-list"]')).toBeNull();
    expect((screen.getByRole('button', { name: '이전 보고서' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '다음 보고서' }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.title).toBe('팀 매집');
  });

  it('(e) 행 없는 날짜 → 「이 날은 팀 매집 데이터가 없어요」 · 「최신 보고서 보기」 → push', async () => {
    await open('d=20261011', teamflowReportFixture({ date: '20261011', rows: [] }));
    expect(screen.getByText('이 날은 팀 매집 데이터가 없어요')).toBeTruthy();
    expect(screen.getByText('팀 매집 보고서는 평일 밤 21:20쯤 올라와요. 최신 보고서는 10/14예요')).toBeTruthy();
    expect(document.querySelector('[data-slot="teamflow-list"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '최신 보고서 보기' }));
    expect(pushMock).toHaveBeenCalledWith('/analytics/teamflow?d=20261014');
    // dates 밖(행 없는 날) — ‹ 없음 · › = 그 뒤 행 있는 날
    expect((screen.getByRole('button', { name: '이전 보고서' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '다음 보고서' }));
    expect(pushMock).toHaveBeenLastCalledWith('/analytics/teamflow?d=20261013');
  });

  it('(f) fetch 실패 → role=alert 「보고서를 불러오지 못했어요」 · 「다시 시도」 → 재요청', async () => {
    await open('d=20261014', new Error('network'));
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('보고서를 불러오지 못했어요')).toBeTruthy();
    fetchReportMock.mockResolvedValueOnce(teamflowReportFixture());
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await flush();
    expect(fetchReportMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(rowButtons()).toHaveLength(34);
  });

  it('(g) 403 DMA_UNMAPPED → DmaGate 「팀 매집은 …」 · 머리 없음', async () => {
    await open('', new ApiClientError({ code: 'DMA_UNMAPPED', message: 'x', status: 403 }));
    expect(screen.getByText(/^팀 매집은 증권사 계정이 연결된 사용자만 이용할 수 있어요/)).toBeTruthy();
    expect(document.querySelector('[data-slot="dma-gate"]')!.getAttribute('data-reason')).toBe('unmapped');
    expect(document.querySelector('[data-slot="teamflow-report"]')).toBeNull();
  });

  it('(h) 형식 오류 ?d=2026 → router.replace("/analytics/teamflow")', async () => {
    fetchReportMock.mockReturnValue(new Promise(() => {}));
    await open('d=2026');
    expect(replaceMock).toHaveBeenCalledWith('/analytics/teamflow');
  });

  it('(i) 문서 제목 「팀 매집 · 10/14」 · 로딩 중에도 알약은 ?d 로 즉시', async () => {
    fetchReportMock.mockReturnValueOnce(new Promise(() => {}));
    await open('d=20261014');
    expect(screen.getByText('불러오는 중…')).toBeTruthy();
    expect(screen.getByText('10/14 (수)')).toBeTruthy();
    expect(document.title).toBe('팀 매집 · 10/14');
  });

  it('(j) 요약에 허용 밖 태그(<i>x</i>) · 짝 없는 <b> → 꺾쇠 글자 없음 · 텍스트만', async () => {
    const base = teamflowRows().find((r) => r.isin === CHEONIL)!;
    const row = {
      ...base,
      payload: { ...base.payload!, summary_lines: ['허용 밖 <i>x</i> 태그 &amp; <b>굵게</b> 끝', '짝 없는 <b>열림만'] },
    };
    await open('d=20261014', teamflowReportFixture({ rows: [row] }));
    fireEvent.click(rowBtn(CHEONIL));
    const sec = document.getElementById(`tf-${CHEONIL}`)!;
    const text = sec.querySelector('[data-slot="teamflow-summary"] ol')!.textContent!;
    expect(text).not.toMatch(/[<>]/);
    expect(text).toContain('허용 밖 x 태그 & 굵게 끝');
    expect(text).toContain('짝 없는 열림만');
    expect(sec.querySelector('i')).toBeNull();
    expect(Array.from(sec.querySelectorAll('strong')).map((s) => s.textContent)).toEqual(['굵게']);
  });
});
