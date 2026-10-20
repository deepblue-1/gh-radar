import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

import type { AccumDetailResponse, AccumReportResponse } from '@gh-radar/shared';

/**
 * Phase 34 Plan 13 (트레이서 후반 C4) — `/analytics/accum` 목록 · 펼침 상세 지연 로드 (UI-SPEC A1 · A3 · A4 · A5 · D-06 · D-08 · D-19 · D-22).
 *
 * 잠그는 것: 10/14 실측 6행(34-01 워커 픽스처 원문) · 기본 전부 접힘 · 한 번에 하나 · 펼친 행 아래 section#ac-{isin} ·
 * 상세는 펼칠 때 1회만 요청(캐시 · 진행 중 합침 · 실패 비캐시) · KPI 줄 4항목 · 상세 실패/재시도 · row null · 상세 게이트 ·
 * 빈 상태 2종 · 머리 출처 칩(ACCUM_LOAD_HM) · 목록 403 게이트 「매집감지 보고서는」 · 형식 오류 ?d → replace · 문서 제목.
 *
 * `authFetch` 만 목 — `fetchAccumDetail` 의 캐시 · 합침 로직은 진짜로 돈다(요청 수 = authFetch 호출 수).
 */

const replaceMock = vi.fn();
const pushMock = vi.fn();
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock, back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => '/analytics/accum',
}));

let mockGate: 'unauthenticated' | 'unmapped' | null = null;
vi.mock('@/components/trading/dma-gate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/trading/dma-gate')>();
  return { ...actual, useDmaGateReason: () => mockGate };
});

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }),
}));

const authFetchMock = vi.fn();
vi.mock('@/lib/auth-fetch', () => ({
  authFetch: (path: string, init?: unknown) => authFetchMock(path, init),
}));

import { ApiClientError } from '@/lib/api';
import { clearQueryCache } from '@/lib/query-cache';
import {
  ACCUM_DATE,
  AC_CARRY,
  AC_DROP,
  AC_EXPIRE,
  AC_LIQ,
  AC_LIVE,
  AC_PARTIAL,
  AC_SELL,
  CHEONIL,
  CJSEAFOOD_PREF,
  CXI,
  DONGYANG,
  HANSUN,
  NAMELESS,
  accumDetailFixture,
  accumReportFixture,
  accumSyntheticListRows,
} from '@/test-fixtures/accum-export';

import { AccumReport } from '../accum-report';

type DetailImpl = (isin: string) => Promise<AccumDetailResponse>;

let listImpl: () => Promise<AccumReportResponse>;
let detailImpl: DetailImpl;

const DETAIL_RE = /^\/api\/accum\/report\/(\d{8})\/([A-Z0-9]{12})$/;

function routeFetch(path: string): Promise<unknown> {
  const m = DETAIL_RE.exec(path);
  if (m) return detailImpl(m[2]!);
  return listImpl();
}

const detailCalls = () => authFetchMock.mock.calls.filter(([p]) => DETAIL_RE.test(p as string));
const listCalls = () => authFetchMock.mock.calls.filter(([p]) => !DETAIL_RE.test(p as string));

async function flush() {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
}

async function open(query: string, resp?: AccumReportResponse | Error) {
  searchParams = new URLSearchParams(query);
  if (resp instanceof Error) listImpl = () => Promise.reject(resp);
  else if (resp !== undefined) listImpl = () => Promise.resolve(resp);
  const r = render(<AccumReport />);
  await flush();
  return r;
}

const rowButtons = () =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('[data-slot="accum-list"] button[data-isin]'));
const rowBtn = (isin: string) => document.getElementById(`accum-row-${isin}`) as HTMLButtonElement;
const klineTexts = (sec: HTMLElement) =>
  Array.from(sec.querySelectorAll('[data-slot="accum-kline-item"]')).map((el) =>
    Array.from(el.children)
      .map((c) => c.textContent)
      .join(' '),
  );

beforeEach(() => {
  mockGate = null;
  replaceMock.mockReset();
  pushMock.mockReset();
  authFetchMock.mockReset();
  authFetchMock.mockImplementation((path: string) => routeFetch(path));
  listImpl = () => Promise.resolve(accumReportFixture());
  detailImpl = (isin) => Promise.resolve(accumDetailFixture(isin));
  clearQueryCache();
  document.title = '';
});

describe('AccumReport — 목록 (A1 · A3 · D-08)', () => {
  it('(a) 10/14 픽스처 → 6행 · 모의 줄은 state · pos 가 같아 isin 순 · 기본 전부 접힘 · 상세 요청 0', async () => {
    await open('d=20261014');
    expect(screen.getByRole('heading', { level: 1, name: '매집감지 보고서' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: '매집감지 종목' })).toBeTruthy();
    const btns = rowButtons();
    expect(btns.map((b) => b.getAttribute('data-isin'))).toEqual([CHEONIL, CJSEAFOOD_PREF, DONGYANG, HANSUN, NAMELESS, CXI]);
    expect(btns.every((b) => b.getAttribute('aria-expanded') === 'false')).toBe(true);
    expect(btns.every((b) => !b.hasAttribute('aria-controls'))).toBe(true);
    expect(document.querySelector('[data-slot="accum-detail"]')).toBeNull();
    expect(rowBtn(CHEONIL).getAttribute('aria-label')).toBe('천일고속 000650 — 매집감지 상세');
    // name null → 종목 칸 · 접근 이름이 short_code 로 대체
    expect(rowBtn(NAMELESS).getAttribute('aria-label')).toBe('011332 — 매집감지 상세');
    expect(within(rowBtn(CHEONIL)).getByText('000650 · KOSPI')).toBeTruthy();
    expect(within(rowBtn(CHEONIL)).getByText('매집중').getAttribute('data-slot')).toBe('accum-state');
    expect(listCalls()).toEqual([['/api/accum/report?d=20261014', undefined]]);
    expect(detailCalls()).toHaveLength(0);
    expect(document.title).toBe('매집감지 보고서 · 10/14');
  });

  it('(a2) 정렬 — 매집중 → 매도중 → 종료 · 그 안 pos_net_krw 큰 순(null 맨 뒤) · 같으면 isin', async () => {
    const base = accumReportFixture().rows;
    const rows = [
      { ...base[0]!, state: 3, pos_net_krw: 9e9 },
      { ...base[1]!, state: 2, pos_net_krw: 1 },
      { ...base[2]!, state: 1, pos_net_krw: null },
      { ...base[3]!, state: 1, pos_net_krw: 5 },
      { ...base[4]!, state: 1, pos_net_krw: 5 },
      { ...base[5]!, state: 2, pos_net_krw: 7 },
    ];
    await open('d=20261014', accumReportFixture({ rows }));
    expect(rowButtons().map((b) => b.getAttribute('data-isin'))).toEqual([HANSUN, NAMELESS, DONGYANG, CXI, CJSEAFOOD_PREF, CHEONIL]);
    expect(within(rowBtn(CHEONIL)).getByText('종료')).toBeTruthy();
    expect(within(rowBtn(CXI)).getByText('매도중')).toBeTruthy();
  });

  it('(h) 머리 출처 칩 「KYOBO119 판정 기준 · 20:30 적재」 + 장중 패널 안내 — 로딩 중에도 머리를 그린다', async () => {
    let resolve!: (v: AccumReportResponse) => void;
    listImpl = () => new Promise((r) => (resolve = r));
    await open('d=20261014');
    const chip = document.querySelector('[data-slot="accum-source"]')!;
    expect(chip.textContent).toBe('KYOBO119 판정 기준 · 20:30 적재');
    expect(chip.parentElement!.textContent).toBe('KYOBO119 판정 기준 · 20:30 적재 장중에는 트레이딩 「매집」 패널이 실시간으로 보여줘요');
    expect(screen.getByText('불러오는 중…')).toBeTruthy();
    expect(rowButtons()).toHaveLength(0);
    resolve(accumReportFixture());
    await flush();
    expect(screen.queryByText('불러오는 중…')).toBeNull();
    expect(rowButtons()).toHaveLength(6);
  });

  it('(g) 빈 상태 — 이력 0 「아직 올라온 …」 · 행 없는 날 「이 날은 …」 + 「최신 보고서 보기」 → dates[0]', async () => {
    const a = await open('', { access: true, dates: [], date: null, rows: [] });
    const empty = document.querySelector('[data-slot="accum-empty"]')!;
    expect(within(empty as HTMLElement).getByText('아직 올라온 매집감지 보고서가 없어요')).toBeTruthy();
    expect(within(empty as HTMLElement).getByText('첫 보고서는 평일 밤 20:30쯤 올라와요')).toBeTruthy();
    expect(document.querySelector('[data-slot="accum-list"]')).toBeNull();
    expect(document.title).toBe('매집감지 보고서');
    a.unmount();

    await open('d=20261012', accumReportFixture({ date: '20261012', rows: [] }));
    expect(screen.getByText('이 날은 매집감지 데이터가 없어요')).toBeTruthy();
    expect(screen.getByText('매집감지 보고서는 평일 밤 20:30쯤 올라와요. 최신 보고서는 10/14예요')).toBeTruthy();
    expect(document.querySelector('[data-slot="accum-list"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '최신 보고서 보기' }));
    expect(pushMock).toHaveBeenCalledWith(`/analytics/accum?d=${ACCUM_DATE}`);
  });

  it('(i) 목록 403 → DmaGate 「매집감지 보고서는 …」 · 401 → 로그인 문구', async () => {
    const a = await open('', new ApiClientError({ code: 'DMA_UNMAPPED', message: 'x', status: 403 }));
    expect(
      screen.getByText('매집감지 보고서는 증권사 계정이 연결된 사용자만 이용할 수 있어요. 관리자에게 연결을 요청하세요.'),
    ).toBeTruthy();
    expect(document.querySelector('[data-slot="accum-report"]')).toBeNull();
    a.unmount();

    await open('', new ApiClientError({ code: 'UNAUTHENTICATED', message: 'x', status: 401 }));
    expect(screen.getByText('매집감지 보고서는 로그인한 뒤 이용할 수 있어요.')).toBeTruthy();
  });

  it('(i2) 목록 실패 → 「보고서를 불러오지 못했어요」 + 「다시 시도」(재요청)', async () => {
    await open('d=20261014', new Error('network'));
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('보고서를 불러오지 못했어요')).toBeTruthy();
    listImpl = () => Promise.resolve(accumReportFixture());
    fireEvent.click(within(alert).getByRole('button', { name: '다시 시도' }));
    await flush();
    expect(listCalls()).toHaveLength(2);
    expect(rowButtons()).toHaveLength(6);
  });

  it('(i3) 형식 오류 ?d → router.replace("/analytics/accum") · ?d 없음 = 최신(d 생략 요청)', async () => {
    await open('d=2026-10-14');
    expect(replaceMock).toHaveBeenCalledWith('/analytics/accum');
    expect(listCalls()[0]).toEqual(['/api/accum/report', undefined]);
  });
});

/** KPI 칸 → 「라벨 | 값 | 보조」 글자(보조 없으면 2칸). */
const kpiTiles = () =>
  Array.from(document.querySelectorAll('[data-slot="accum-kpis"] [data-kpi]')).map((tile) => {
    const dt = tile.querySelector('dt')!.textContent;
    const dd = tile.querySelector('dd')!;
    return [dt, ...Array.from(dd.children).map((c) => c.textContent)];
  });

describe('AccumKpiStrip — KPI 4칸 (A2 · D-09)', () => {
  it('(k1) 실측 6행 → 라벨 4개 · 보조 「이월 0」 · 「매집중 6 · 매도중 0」 · 「청산 0 · 탈락 0 · 만료 0」 · 합 부호 색', async () => {
    await open('d=20261014');
    const strip = document.querySelector('[data-slot="accum-kpis"]')!;
    expect(strip).toBeTruthy();
    expect(kpiTiles()).toEqual([
      ['등록 종목', '6', '이월 0'],
      ['장 마감 보유', '6', '매집중 6 · 매도중 0'],
      ['종료', '0', '청산 0 · 탈락 0 · 만료 0'],
      ['팀 순매수 합(등록 후)', '+9.7억'],
    ]);
    const sum = strip.querySelector('[data-kpi="팀 순매수 합(등록 후)"] dd > span')!;
    expect(sum.className).toContain('text-[var(--up)]');
    const total = strip.querySelector('[data-kpi="등록 종목"] dd > span')!;
    expect(total.className).toContain('text-[var(--fg)]');
    // 세로 순서 — 머리 다음 · 목록 카드 앞
    const list = document.querySelector('[data-slot="accum-list"]')!;
    expect(strip.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('(k2) 합성 7행 → 등록 7(이월 3) · 보유 4(매집중 3 · 매도중 1) · 종료 3(청산 1 · 탈락 1 · 만료 1) · 합 +4.2억', async () => {
    await open('d=20261014', accumReportFixture({ rows: accumSyntheticListRows() }));
    expect(kpiTiles()).toEqual([
      ['등록 종목', '7', '이월 3'],
      ['장 마감 보유', '4', '매집중 3 · 매도중 1'],
      ['종료', '3', '청산 1 · 탈락 1 · 만료 1'],
      ['팀 순매수 합(등록 후)', '+4.2억'],
    ]);
  });

  it('(k3) pos 합 null(전부 결측) → 「—」 --faint(0 이라 말하지 않는다 · 34 UI 리뷰) · rows [] 이면 accum-kpis 없음', async () => {
    const rows = accumReportFixture().rows.map((r) => ({ ...r, pos_net_krw: null }));
    const a = await open('d=20261014', accumReportFixture({ rows }));
    const sum = document.querySelector('[data-kpi="팀 순매수 합(등록 후)"] dd > span')!;
    expect(sum.textContent).toBe('—');
    expect(sum.className).toContain('text-[var(--faint)]');
    a.unmount();

    await open('d=20261012', accumReportFixture({ date: '20261012', rows: [] }));
    expect(document.querySelector('[data-slot="accum-kpis"]')).toBeNull();
  });
});

const slotText = (isin: string, slot: string) =>
  rowBtn(isin).querySelector(`[data-slot="${slot}"]`)?.textContent ?? null;

describe('AccumDayGrid — 행 완성 (A3 · D-08 · D-10 ~ D-13)', () => {
  const openSyn = () => open('d=20261014', accumReportFixture({ rows: accumSyntheticListRows() }));

  it('(r1) 정렬 — 매집중들(pos 큰 순 · null 맨 뒤) → 매도중 → 종료들(pos 큰 순)', async () => {
    await openSyn();
    expect(rowButtons().map((b) => b.getAttribute('data-isin'))).toEqual([
      AC_LIVE,
      AC_CARRY,
      AC_PARTIAL,
      AC_SELL,
      AC_DROP,
      AC_EXPIRE,
      AC_LIQ,
    ]);
  });

  it('(r2) 흐림 — 종료 이월 탈락 · 만료 행만 data-dim="true" + 종목 · 결과 · 금액 칸 opacity-60(배지 · 사유 줄은 정상 농도) · 장중 청산 · 살아 있는 행은 정상 농도', async () => {
    await openSyn();
    const nameCell = (isin: string) => rowBtn(isin).firstElementChild as HTMLElement;
    const dimmed = (isin: string) => Array.from(rowBtn(isin).querySelectorAll<HTMLElement>('.opacity-60'));
    for (const isin of [AC_DROP, AC_EXPIRE]) {
      expect(rowBtn(isin).getAttribute('data-dim')).toBe('true');
      expect(rowBtn(isin).className).not.toMatch(/(^|\s)opacity-60(\s|$)/);
      expect(nameCell(isin).className).toContain('opacity-60');
      expect(nameCell(isin).className).toContain('group-hover:opacity-100');
      expect(nameCell(isin).className).toContain('group-focus-visible:opacity-100');
      const pos = rowBtn(isin).querySelector('[data-slot="accum-pos"]')!;
      expect(dimmed(isin).some((el) => el.contains(pos))).toBe(true);
      for (const slot of ['accum-badges', 'accum-reason']) {
        const el = rowBtn(isin).querySelector(`[data-slot="${slot}"]`)!;
        expect(dimmed(isin).some((d) => d.contains(el))).toBe(false);
      }
    }
    for (const isin of [AC_LIQ, AC_LIVE, AC_SELL, AC_CARRY, AC_PARTIAL]) {
      expect(rowBtn(isin).hasAttribute('data-dim')).toBe(false);
      expect(dimmed(isin)).toHaveLength(0);
    }
    // 열면 불투명도 1 — 상세는 흐리지 않는다
    fireEvent.click(rowBtn(AC_DROP));
    expect(dimmed(AC_DROP)).toHaveLength(0);
  });

  it('(r3) 배지 묶음 — 상태 → 「이월 D+2」 → 「사이클 2」 순 · carry 0 · cycle 1 이면 배지 없음', async () => {
    await openSyn();
    const badges = (isin: string) =>
      Array.from(rowBtn(isin).querySelectorAll('[data-slot="accum-badges"] > span')).map((b) => [
        b.getAttribute('data-slot'),
        b.textContent,
      ]);
    expect(badges(AC_CARRY)).toEqual([
      ['accum-state', '매집중'],
      ['accum-carry', '이월 D+2'],
      ['accum-cycle', '사이클 2'],
    ]);
    expect(badges(AC_LIVE)).toEqual([['accum-state', '매집중']]);
    expect(badges(AC_SELL)).toEqual([['accum-state', '매도중']]);
    expect(badges(AC_EXPIRE)).toEqual([
      ['accum-state', '종료'],
      ['accum-carry', '이월 D+5'],
    ]);
  });

  it('(r4) 사유 줄 — 종료 행만 · 사유 2 줄에 title · 청산은 title 없음', async () => {
    await openSyn();
    const reason = (isin: string) => rowBtn(isin).querySelector('[data-slot="accum-reason"]');
    expect(reason(AC_DROP)!.textContent).toBe('이월 탈락(복원 안 됨) · 06:00');
    expect(reason(AC_DROP)!.getAttribute('title')).toBe(
      '06:00 이월 판정에서 탈락했거나 서버 재기동 때 복원되지 않은 종목이에요',
    );
    expect(reason(AC_EXPIRE)!.textContent).toBe('이월 만료 · 06:00');
    expect(reason(AC_LIQ)!.textContent).toBe('청산 · 11:32');
    expect(reason(AC_LIQ)!.hasAttribute('title')).toBe(false);
    expect(reason(AC_LIVE)).toBeNull();
  });

  it('(r5) 결과 태그 — 천일고속 limit 「상한가 +29.8%」(보조줄 없음) · 동양고속 rate 「+22.1%」 + 「고가 +29.3%」', async () => {
    await open('d=20261014');
    const tag = rowBtn(CHEONIL).querySelector('[data-slot="accum-tag"]')!;
    expect(tag.getAttribute('data-kind')).toBe('limit');
    expect(tag.textContent).toBe('상한가 +29.8%');
    expect(tag.className).toContain('text-[var(--up)]');
    expect(rowBtn(CHEONIL).querySelector('[data-slot="accum-high"]')).toBeNull();
    const dy = rowBtn(DONGYANG).querySelector('[data-slot="accum-tag"]')!;
    expect(dy.getAttribute('data-kind')).toBe('rate');
    expect(dy.textContent).toBe('+22.1%');
    expect(slotText(DONGYANG, 'accum-high')).toBe('고가 +29.3%');
  });

  it('(r6) 금액 · 등록·종료 칸 — 팀 순매수 + 평단/등록가 · 하루 0 = 「0.0억」 --fg-2 · 이월 「MM/DD 등록」', async () => {
    await openSyn();
    expect(slotText(AC_LIVE, 'accum-pos')).toBe('+9.3억');
    expect(rowBtn(AC_LIVE).querySelector('[data-slot="accum-pos"]')!.className).toContain('text-[var(--up)]');
    expect(slotText(AC_LIVE, 'accum-avg')).toBe('평단 12,680 · 등록가 11,410');
    expect(rowBtn(AC_LIVE).querySelector('[data-slot="accum-avg"]')!.getAttribute('title')).toBe(
      '평단 12,680 · 등록가 11,410',
    );
    expect(slotText(AC_SELL, 'accum-pos')).toBe('−2.4억');
    const day = rowBtn(AC_DROP).querySelector('[data-slot="accum-day"]')!;
    expect(day.textContent).toBe('0.0억');
    expect(day.className).toContain('text-[var(--fg-2)]');
    const reg = (isin: string) =>
      Array.from(rowBtn(isin).querySelectorAll('[data-slot="accum-reg"] > span')).map((s) => s.textContent);
    expect(reg(AC_LIVE)).toEqual(['09:12', '장 마감까지']);
    expect(reg(AC_CARRY)).toEqual(['10/10 등록', '오늘 이월']);
    expect(reg(AC_LIQ)).toEqual(['09:05', '11:32 청산']);
    expect(reg(AC_DROP)).toEqual(['10/13 등록', '06:00 탈락']);
    expect(reg(AC_PARTIAL)).toEqual(['—', '장 마감까지']);
    expect(slotText(AC_LIQ, 'accum-meta-reg')).toBe('등록 09:05 → 11:32');
    expect(slotText(AC_DROP, 'accum-meta-reg')).toBe('10/13 등록 → 06:00');
  });

  it('(r7) 결측 행 — 접근 이름 short_code · 태그 「—」 · 금액 「—」 · 사유 줄 없음', async () => {
    await openSyn();
    expect(rowBtn(AC_PARTIAL).getAttribute('aria-label')).toBe('AC0007 — 매집감지 상세');
    const tag = rowBtn(AC_PARTIAL).querySelector('[data-slot="accum-tag"]')!;
    expect(tag.getAttribute('data-kind')).toBe('none');
    expect(tag.textContent).toBe('—');
    expect(slotText(AC_PARTIAL, 'accum-pos')).toBe('—');
    expect(slotText(AC_PARTIAL, 'accum-avg')).toBe('평단 — · 등록가 —');
    // name null → 이름 자리 = 코드 · market null → 둘째 줄 = 코드만(「 · 시장」 없음)
    expect(within(rowBtn(AC_PARTIAL)).getAllByText('AC0007')).toHaveLength(2);
  });

  it('(r8) sr 설명 — aria-describedby="accum-row-desc-{isin}" · 1문장', async () => {
    await openSyn();
    const btn = rowBtn(AC_CARRY);
    expect(btn.getAttribute('aria-describedby')).toBe(`accum-row-desc-${AC_CARRY}`);
    expect(document.getElementById(`accum-row-desc-${AC_CARRY}`)!.textContent).toBe(
      '매집중, 이월 D+2, 사이클 2, 결과 +13.8%, 고가 +29.8%, 팀 순매수 등록 후 +3.6억, 하루 순매수 +0.4억, 등록 10/10',
    );
  });

  it('(r9) 카드 머리 — 소제목 캡션 · xl 열 머리 aria-hidden 2줄(「(등록 후)」 · 「(등록 전 포함)」)', async () => {
    await openSyn();
    expect(screen.getByText('매집중 → 매도중 → 종료 · 그 안 팀 순매수(등록 후) 큰 순')).toBeTruthy();
    const head = document.querySelector('[data-slot="accum-list-head"]')!;
    expect(head.getAttribute('aria-hidden')).toBe('true');
    expect(Array.from(head.children).map((c) => c.textContent)).toEqual([
      '종목',
      '상태',
      '결과',
      '팀 순매수(등록 후)',
      '하루 순매수(등록 전 포함)',
      '등록 · 종료',
      '',
    ]);
    const sec = screen.getByRole('heading', { level: 2, name: '매집감지 종목' }).closest('section')!;
    expect(sec.getAttribute('aria-labelledby')).toBe('accum-list-title');
  });
});

describe('AccumDetail — 펼침 지연 로드 (A4 · A5 · D-06 · D-19)', () => {
  it('(b) 천일고속 행 클릭 → 상세 요청 1회(15초) · section#ac-{isin} · KPI 줄 4항목', async () => {
    await open('d=20261014');
    fireEvent.click(rowBtn(CHEONIL));
    const btn = rowBtn(CHEONIL);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(btn.getAttribute('aria-controls')).toBe(`ac-${CHEONIL}`);
    const sec = document.getElementById(`ac-${CHEONIL}`)!;
    expect(sec.tagName).toBe('SECTION');
    expect(sec.getAttribute('aria-labelledby')).toBe(`accum-row-${CHEONIL}`);
    // 응답 전 = 스켈레톤 + sr 전용 상태 문구
    expect(within(sec).getByRole('status').textContent).toBe('상세 불러오는 중…');
    // 실제 배치 자리(34 UI 리뷰) — KPI 줄 1 · 범례 8칸 · 프리셋 3칸 · 차트 1
    expect(sec.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(13);
    await flush();
    expect(detailCalls()).toEqual([[`/api/accum/report/20261014/${CHEONIL}`, { timeoutMs: 15_000 }]]);
    expect(sec.querySelector('[data-slot="skeleton"]')).toBeNull();
    const kline = sec.querySelector('[data-slot="accum-kline"]')!;
    expect(kline).toBeTruthy();
    expect(klineTexts(sec)).toEqual(['등록가 205,500', '평단 200,407', '등록 후 순매수 +1.6억', '최고 순매수 +1.7억']);
    // 등록 후 순매수만 부호 색
    const values = Array.from(kline.querySelectorAll('[data-slot="accum-kline-item"] > span:last-child'));
    expect(values[2]!.className).toContain('text-[var(--up)]');
    expect(values[0]!.className).toContain('text-[var(--fg)]');
    expect(sec.querySelector('i')).toBeNull();
  });

  it('(c) 접고 다시 펼침 → 상세 요청 여전히 1회 · 재펼침은 첫 렌더부터 KPI 줄(스켈레톤 없음)', async () => {
    await open('d=20261014');
    fireEvent.click(rowBtn(CHEONIL));
    await flush();
    fireEvent.click(rowBtn(CHEONIL));
    expect(rowBtn(CHEONIL).getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(`ac-${CHEONIL}`)).toBeNull();
    fireEvent.click(rowBtn(CHEONIL));
    const sec = document.getElementById(`ac-${CHEONIL}`)!;
    expect(sec.querySelector('[data-slot="skeleton"]')).toBeNull();
    expect(sec.querySelector('[data-slot="accum-kline"]')).toBeTruthy();
    await flush();
    expect(detailCalls()).toHaveLength(1);
  });

  it('(c2) 응답 전 빠르게 접고 다시 펼침 → 진행 중 요청 합침(1회) · 언마운트 뒤 응답은 캐시에만', async () => {
    let resolve!: (v: AccumDetailResponse) => void;
    detailImpl = () => new Promise((r) => (resolve = r));
    await open('d=20261014');
    fireEvent.click(rowBtn(CHEONIL));
    fireEvent.click(rowBtn(CHEONIL));
    fireEvent.click(rowBtn(CHEONIL));
    expect(detailCalls()).toHaveLength(1);
    fireEvent.click(rowBtn(CHEONIL)); // 접은 채로 응답 도착
    resolve(accumDetailFixture(CHEONIL));
    await flush();
    fireEvent.click(rowBtn(CHEONIL));
    expect(document.getElementById(`ac-${CHEONIL}`)!.querySelector('[data-slot="accum-kline"]')).toBeTruthy();
    await flush();
    expect(detailCalls()).toHaveLength(1);
  });

  it('(c3) 상세 캐시는 30분 — 그 뒤 재펼침은 다시 요청한다(재적재 반영 · WR-03)', async () => {
    const t0 = Date.now();
    const now = vi.spyOn(Date, 'now').mockReturnValue(t0);
    try {
      await open('d=20261014');
      fireEvent.click(rowBtn(CHEONIL));
      await flush();
      fireEvent.click(rowBtn(CHEONIL));
      now.mockReturnValue(t0 + 29 * 60_000);
      fireEvent.click(rowBtn(CHEONIL));
      await flush();
      expect(detailCalls()).toHaveLength(1);
      fireEvent.click(rowBtn(CHEONIL));
      now.mockReturnValue(t0 + 31 * 60_000);
      fireEvent.click(rowBtn(CHEONIL));
      // 만료 = 첫 렌더부터 스켈레톤(옛 값을 그리지 않는다)
      expect(document.getElementById(`ac-${CHEONIL}`)!.querySelector('[data-slot="skeleton"]')).toBeTruthy();
      await flush();
      expect(detailCalls()).toHaveLength(2);
    } finally {
      now.mockRestore();
    }
  });

  it('(c4) 캐시를 비우기(사용자 전환) 전에 시작한 요청 — 새 요청과 합치지 않고 · 그 응답은 캐시에 쓰지 않는다(WR-03)', async () => {
    const pending: ((v: AccumDetailResponse) => void)[] = [];
    detailImpl = () => new Promise((r) => pending.push(r));
    await open('d=20261014');
    fireEvent.click(rowBtn(CHEONIL)); // 옛 사용자 요청
    fireEvent.click(rowBtn(CHEONIL));
    clearQueryCache(); // AuthProvider — 사용자 전환
    fireEvent.click(rowBtn(CHEONIL)); // 새 사용자 요청 — 합치지 않는다
    expect(detailCalls()).toHaveLength(2);
    fireEvent.click(rowBtn(CHEONIL));
    pending[0]!(accumDetailFixture(CHEONIL)); // 옛 요청이 늦게 도착
    await flush();
    fireEvent.click(rowBtn(CHEONIL));
    expect(document.getElementById(`ac-${CHEONIL}`)!.querySelector('[data-slot="skeleton"]')).toBeTruthy();
    expect(detailCalls()).toHaveLength(2); // 새 세대 진행 중 요청과는 합친다
    pending[1]!(accumDetailFixture(CHEONIL));
    await flush();
    expect(document.getElementById(`ac-${CHEONIL}`)!.querySelector('[data-slot="accum-kline"]')).toBeTruthy();
  });

  it('(d) 다른 행 클릭 → 앞 section 언마운트 · 새 요청 1회 · 동시에 열린 상세 1개', async () => {
    await open('d=20261014');
    fireEvent.click(rowBtn(CHEONIL));
    await flush();
    fireEvent.click(rowBtn(DONGYANG));
    expect(document.getElementById(`ac-${CHEONIL}`)).toBeNull();
    expect(rowBtn(CHEONIL).getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(`ac-${DONGYANG}`)).toBeTruthy();
    expect(document.querySelectorAll('[data-slot="accum-detail"]')).toHaveLength(1);
    await flush();
    expect(detailCalls().map(([p]) => p)).toEqual([
      `/api/accum/report/20261014/${CHEONIL}`,
      `/api/accum/report/20261014/${DONGYANG}`,
    ]);
  });

  it('(e) 상세 실패 → 「상세를 불러오지 못했어요」(role=alert) → 「다시 시도」 → 재요청 · 행은 열린 채', async () => {
    detailImpl = () => Promise.reject(new Error('timeout'));
    await open('d=20261014');
    fireEvent.click(rowBtn(HANSUN));
    await flush();
    const sec = document.getElementById(`ac-${HANSUN}`)!;
    const alert = within(sec).getByRole('alert');
    expect(within(alert).getByText('상세를 불러오지 못했어요')).toBeTruthy();
    expect(rowBtn(HANSUN).getAttribute('aria-expanded')).toBe('true');
    detailImpl = (isin) => Promise.resolve(accumDetailFixture(isin));
    fireEvent.click(within(alert).getByRole('button', { name: '다시 시도' }));
    await flush();
    expect(detailCalls()).toHaveLength(2);
    expect(sec.querySelector('[data-slot="accum-kline"]')).toBeTruthy();
  });

  it('(f) 상세 row: null → 「이 종목 상세를 찾지 못했어요」 + 새로고침 안내 · 재시도 버튼 없음', async () => {
    detailImpl = () => Promise.resolve({ access: true, row: null });
    await open('d=20261014');
    fireEvent.click(rowBtn(CXI));
    await flush();
    const sec = document.getElementById(`ac-${CXI}`)!;
    expect(within(sec).getByText('이 종목 상세를 찾지 못했어요')).toBeTruthy();
    expect(within(sec).getByText('보고서가 다시 올라왔을 수 있어요. 페이지를 새로고침해 주세요')).toBeTruthy();
    expect(within(sec).queryByRole('button')).toBeNull();
    // row: null 은 캐시하지 않는다 — 재적재 뒤 접고 다시 펼치면 새로 묻는다(WR-03)
    detailImpl = (isin) => Promise.resolve(accumDetailFixture(isin));
    fireEvent.click(rowBtn(CXI));
    fireEvent.click(rowBtn(CXI));
    await flush();
    expect(detailCalls()).toHaveLength(2);
    expect(within(document.getElementById(`ac-${CXI}`)!).queryByText('이 종목 상세를 찾지 못했어요')).toBeNull();
  });

  it('(f2) 상세 403 → 상세 자리 DmaGate · 페이지 목록은 그대로', async () => {
    detailImpl = () => Promise.reject(new ApiClientError({ code: 'DMA_UNMAPPED', message: 'x', status: 403 }));
    await open('d=20261014');
    fireEvent.click(rowBtn(DONGYANG));
    await flush();
    const sec = document.getElementById(`ac-${DONGYANG}`)!;
    expect(sec.querySelector('[data-slot="dma-gate"]')).toBeTruthy();
    expect(rowButtons()).toHaveLength(6);
  });

  it('(f3) payload 결측(CJ씨푸드1우 orders 빔 · pnl null)에도 상세 셸이 KPI 줄까지 그린다', async () => {
    await open('d=20261014');
    fireEvent.click(rowBtn(CJSEAFOOD_PREF));
    await flush();
    const sec = document.getElementById(`ac-${CJSEAFOOD_PREF}`)!;
    expect(klineTexts(sec)).toHaveLength(4);
  });
});
