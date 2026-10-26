import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

import type { TeamflowReportResponse, TeamflowRow } from '@gh-radar/shared';

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

import { CJSEAFOOD_PREF, teamflowRowsWithNewKeys } from '@/test-fixtures/teamflow-new-keys';

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
    expect(screen.getByText('평일 밤 21시쯤 그날 보고서가 올라와요 · 팀 = 교보 · 한국 · 유진 · 신한 · NH')).toBeTruthy();
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
    expect(screen.getByText('첫 보고서는 평일 밤 21시쯤 올라와요')).toBeTruthy();
    expect(document.querySelector('[data-slot="teamflow-empty"]')).toBeTruthy();
    expect(document.querySelector('[data-slot="teamflow-list"]')).toBeNull();
    expect((screen.getByRole('button', { name: '이전 보고서' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '다음 보고서' }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.title).toBe('팀 매집');
  });

  it('(e) 행 없는 날짜 → 「이 날은 팀 매집 데이터가 없어요」 · 「최신 보고서 보기」 → push', async () => {
    await open('d=20261011', teamflowReportFixture({ date: '20261011', rows: [] }));
    expect(screen.getByText('이 날은 팀 매집 데이터가 없어요')).toBeTruthy();
    expect(screen.getByText('팀 매집 보고서는 평일 밤 21시쯤 올라와요. 최신 보고서는 10/14예요')).toBeTruthy();
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
    // 보조기기에 로딩을 알린다(오류 상자 role=alert 와 짝 · IN-06)
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('불러오는 중…');
    expect(status.getAttribute('aria-live')).toBe('polite');
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

  it('(k) KPI 4칸 = 34 · 9 · 9 · 「−26.3억」(4번째만 --down) · 캡션 · 머리 → KPI → 캡션 → 카드 순서', async () => {
    await open('d=20261014', teamflowReportFixture());
    const kpis = document.querySelector('[data-slot="teamflow-kpis"]')!;
    expect(kpis).toBeTruthy();
    const val = (label: string) => kpis.querySelector(`[data-kpi="${label}"] dd`)!;
    expect(val('탐지 종목').textContent).toBe('34');
    expect(val('팀 순매수 종목').textContent).toBe('9');
    expect(val('상한가 도달').textContent).toBe('9');
    expect(val('팀 순매수 합').textContent).toBe('−26.3억');
    expect(val('팀 순매수 합').className).toContain('text-[var(--down)]');
    expect(val('탐지 종목').className).toContain('text-[var(--fg)]');
    expect(Array.from(kpis.querySelectorAll('dt')).map((d) => d.textContent)).toEqual([
      '탐지 종목',
      '팀 순매수 종목',
      '상한가 도달',
      '팀 순매수 합',
    ]);
    const caption = screen.getByText('탐지 = 20%↑ 또는 상한가 체결 종목 · 팀 수치는 들어와서 친 체결만 센 최소치예요');
    const list = document.querySelector('section[aria-labelledby="teamflow-list-title"]')!;
    // DOM 순서: KPI → 캡션 → 탐지 종목 카드
    expect(kpis.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(caption.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('(l) 상위 5행 순서(행 버튼 접근 이름) = 한선엔지니어링 · 제주항공 · 천일고속 · 도우인시스 · 동양고속', async () => {
    await open('d=20261014', teamflowReportFixture());
    const names = rowButtons()
      .slice(0, 5)
      .map((b) => b.getAttribute('aria-label')!.split(' ')[0]);
    expect(names).toEqual(['한선엔지니어링', '제주항공', '천일고속', '도우인시스', '동양고속']);
  });

  it('(m) 행 0 인 날 → KPI 띠 · 캡션 없음', async () => {
    await open('d=20261011', teamflowReportFixture({ date: '20261011', rows: [] }));
    expect(document.querySelector('[data-slot="teamflow-kpis"]')).toBeNull();
    expect(screen.queryByText(/최소치예요/)).toBeNull();
  });

  it('(o) 행 완성 — 열 머리(aria-hidden) · 행마다 9칸 미니막대 · 20% 칸 · 고가 보조줄 · sr 설명 전문', async () => {
    await open('d=20261014', teamflowReportFixture());
    const head = document.querySelector('[data-slot="teamflow-list-head"]')!;
    expect(head.getAttribute('aria-hidden')).toBe('true');
    expect(Array.from(head.children).map((c) => c.textContent)).toEqual([
      '종목',
      '결과',
      '팀 순매수',
      '팀 손익',
      '20% 아래 / 위',
      '매수 중 팀',
      '구간별 순매수',
      '',
    ]);
    expect(document.querySelectorAll('[data-slot="teamflow-list"] [data-slot="teamflow-strip"]')).toHaveLength(34);
    const strip = rowBtn(CHEONIL).querySelector('svg[data-slot="teamflow-strip"]')!;
    expect(strip.getAttribute('viewBox')).toBe('0 0 178 28');
    expect(strip.querySelectorAll('rect')).toHaveLength(9);
    // 천일고속 「0% 미만」 없음 → 그 칸은 빈 선 + 「체결 없음」 툴팁
    expect(strip.querySelector('g title')!.textContent).toBe('0% 미만 · 체결 없음');

    const dy = rowBtn(DONGYANG);
    expect(dy.querySelector('[data-slot="teamflow-high"]')!.textContent).toBe('고가 +29.3%');
    expect(dy.querySelector('[data-slot="teamflow-below20"]')!.textContent).toBe('−0.1억');
    expect(dy.querySelector('[data-slot="teamflow-above20"]')!.textContent).toBe('+2.3억');
    expect(dy.querySelector('[data-slot="teamflow-share"]')!.textContent).toBe('2%');
    expect(document.getElementById(`teamflow-row-desc-${DONGYANG}`)!.textContent).toBe(
      '결과 +22.1%, 고가 +29.3%, 팀 순매수 +2.2억, 20% 아래 −0.1억, 20%~상한 +2.3억, 매수 중 팀 2%',
    );
    // 상한가 행은 고가 보조줄 없음
    expect(rowBtn(CHEONIL).querySelector('[data-slot="teamflow-high"]')).toBeNull();
  });

  it('(o2) high_rate 키 없음(undefined) · NaN → 고가 보조줄 없음 · sr 설명에도 고가 없음(같은 판정 · IN-04)', async () => {
    const base = teamflowRows();
    const noHigh: Partial<TeamflowRow> = { ...base.find((r) => r.isin === DONGYANG)! };
    delete noHigh.high_rate; // 키 자체가 없는 행(undefined)
    const rows = [noHigh as TeamflowRow, { ...base.find((r) => r.isin === CHEONIL)!, status: 'below' as const, high_rate: Number.NaN }];
    await open('d=20261014', teamflowReportFixture({ rows }));
    expect(rowBtn(DONGYANG).querySelector('[data-slot="teamflow-high"]')).toBeNull();
    expect(document.getElementById(`teamflow-row-desc-${DONGYANG}`)!.textContent).not.toContain('고가');
    expect(rowBtn(CHEONIL).querySelector('[data-slot="teamflow-high"]')).toBeNull();
    expect(document.getElementById(`teamflow-row-desc-${CHEONIL}`)!.textContent).not.toContain('고가');
  });

  it('(p) 매수 중 팀 ≥ 30% = --team 600 · null = 「—」 --faint · name null = short_code', async () => {
    const base = teamflowRows();
    const rows = [
      { ...base.find((r) => r.isin === DONGYANG)!, team_buy_share: 0.37 },
      { ...base.find((r) => r.isin === CHEONIL)!, team_buy_share: null, name: null },
    ];
    await open('d=20261014', teamflowReportFixture({ rows }));
    const hot = rowBtn(DONGYANG).querySelector('[data-slot="teamflow-share"]')!;
    expect(hot.textContent).toBe('37%');
    expect(hot.className).toContain('text-[var(--team)]');
    expect(hot.className).toContain('font-semibold');
    const none = rowBtn(CHEONIL).querySelector('[data-slot="teamflow-share"]')!;
    expect(none.textContent).toBe('—');
    expect(none.className).toContain('text-[var(--faint)]');
    expect(rowBtn(CHEONIL).textContent).toContain('000650');
  });

  it('(n) 합이 반올림 0 이면 「0.0억」 --fg · team_net_val null 행은 합에서 빠진다', async () => {
    const base = teamflowRows();
    const rows = [
      { ...base[0]!, team_net_val: 4_000_000 },
      { ...base[1]!, team_net_val: null },
    ];
    await open('d=20261014', teamflowReportFixture({ rows }));
    const sum = document.querySelector('[data-kpi="팀 순매수 합"] dd')!;
    expect(sum.textContent).toBe('0.0억');
    expect(sum.className).toContain('text-[var(--fg)]');
    expect(document.querySelector('[data-kpi="팀 순매수 종목"] dd')!.textContent).toBe('1');
  });
  it('(q) 팀 손익(quick 261018-j17) — xl 칸 · < xl 메타 · pnl null · 옛 행 「—」 · 정렬 그대로', async () => {
    await open('d=20261014', teamflowReportFixture({ rows: teamflowRowsWithNewKeys() }));
    const cell = (isin: string) => rowBtn(isin).querySelector('[data-slot="teamflow-pnl-cell"]') as HTMLElement;
    const total = (isin: string) => cell(isin).querySelector('[data-slot="teamflow-pnl-total"]') as HTMLElement;
    const ret = (isin: string) => cell(isin).querySelector('[data-slot="teamflow-pnl-ret"]') as HTMLElement;
    expect(total(CHEONIL).textContent).toBe('+0.30억');
    expect(total(CHEONIL).className).toContain('text-[var(--up)]');
    expect(ret(CHEONIL).textContent).toBe('+1.1%');
    expect(total(DONGYANG).textContent).toBe('−0.08억');
    expect(total(DONGYANG).className).toContain('text-[var(--down)]');
    expect(ret(DONGYANG).textContent).toBe('−1.3%');
    expect(cell(CJSEAFOOD_PREF).textContent).toBe('—');
    expect(cell(HANSUN).textContent).toBe('—');
    const meta = (isin: string) => rowBtn(isin).querySelector('[data-slot="teamflow-pnl-meta"]');
    expect(meta(CHEONIL)!.textContent).toBe('손익+0.30억(+1.1%)');
    expect(meta(CJSEAFOOD_PREF)).toBeNull();
    expect(meta(HANSUN)).toBeNull();
    const names = rowButtons()
      .slice(0, 5)
      .map((b) => b.getAttribute('aria-label')!.split(' ')[0]);
    expect(names).toEqual(['한선엔지니어링', '제주항공', '천일고속', '도우인시스', '동양고속']);
  });
});
