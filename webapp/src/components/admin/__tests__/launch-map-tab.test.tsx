import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import type {
  LaunchHeadRow,
  LaunchMapPiece,
  LaunchMapResponse,
  LaunchPlanResponse,
  LaunchPlanServer,
} from '@gh-radar/shared';

import { LaunchMapView, type LaunchMapViewProps } from '../launch-map-tab';

/**
 * Phase 35 (35-08) — 경계 지도 탭 순수 렌더 `LaunchMapView` (D-15 ~ D-18 · 채택 목업 프리셋 칩 · 09:00:30 합패널).
 *
 * 입력 = shared 픽스처(gh-trade 첨부 pieces.json 사본)를 지도 조각으로 옮긴 「전체」 응답 + 첨부 NEXT 머리(합성).
 * 잠그는 것: 칩 3개 · 선택 칩 · 범위 글 · 요약 카드 4장 순서 · 패널 4개 · 범례(16:00 / 09:00:30 · 구분 없음(백필)) ·
 * 마름모 1 · 빈 상태 · 빈 패널 · 다음 오프셋 없음 「—」 · 오류 · 칩/세그먼트 콜백.
 */

const M = '−';

interface AttachRow {
  date: string;
  broker: string;
  market: string;
  wire: number;
  j: number;
  rel: number;
  result: string;
}

const RAW = JSON.parse(
  readFileSync(
    path.resolve(__dirname, '../../../../../packages/shared/src/__fixtures__/launch-pieces-1012-1026.json'),
    'utf8',
  ),
) as AttachRow[];

const GATEWAY: Record<string, string> = { KB: 'KB120', 교보: 'KYOBO119' };
const MARKET: Record<string, string> = { 코스피: 'K', 코스닥: 'Q' };

const Q16_PIECES: LaunchMapPiece[] = RAW.map((r) => ({
  trade_date: r.date.replaceAll('-', ''),
  gateway: GATEWAY[r.broker]!,
  market: MARKET[r.market]!,
  profile: 'Q16',
  fire_exchange: 'KRX',
  side: null,
  wire: r.wire,
  piece_idx: r.j,
  sent_rel_us: r.rel,
  result: r.result,
  retry: null,
}));

const DAYS = [...new Set(Q16_PIECES.map((p) => p.trade_date))].sort().reverse();

function head(over: Partial<LaunchHeadRow> & Pick<LaunchHeadRow, 'gateway' | 'market'>): LaunchHeadRow {
  return {
    trade_date: '20261026',
    profile: 'Q16',
    fire_exchange: 'KRX',
    fire_base: '16:00:00',
    offset_used_us: null,
    fire_at_us: null,
    n_pieces: null,
    n_accepted: null,
    n_reject: null,
    n_other: null,
    first_accept_idx: null,
    retries: null,
    abandoned: null,
    gate_lo_us: null,
    gate_hi_us: null,
    nonmono: null,
    correction_before_us: null,
    correction_after_us: null,
    step_us: null,
    last_dir: null,
    bracketed: null,
    same_dir_run: null,
    reject_span_us: null,
    jump: null,
    one_way_us: null,
    rtt_min_us: null,
    next_offset_us: null,
    source: 'backfill',
    journal_epoch: null,
    seq: null,
    gw_time_ms: null,
    ...over,
  };
}

const Q16_HEADS: LaunchHeadRow[] = [
  head({ gateway: 'KB120', market: 'Q', next_offset_us: -337 }),
  head({ gateway: 'KB120', market: 'K', next_offset_us: -285 }),
  head({ gateway: 'KYOBO119', market: 'Q', next_offset_us: -526 }),
  head({ gateway: 'KYOBO119', market: 'K', next_offset_us: -400 }),
];

const Q16_ALL: LaunchMapResponse = { days: DAYS, heads: Q16_HEADS, pieces: Q16_PIECES };

function nPiece(over: Partial<LaunchMapPiece> & Pick<LaunchMapPiece, 'gateway' | 'market' | 'wire' | 'sent_rel_us' | 'result'>): LaunchMapPiece {
  return {
    trade_date: '20261026',
    profile: 'N',
    fire_exchange: 'NXT',
    side: 'buy',
    piece_idx: over.wire,
    retry: 0,
    ...over,
  };
}

const N_HEAD = { profile: 'N', fire_exchange: 'NXT', fire_base: '09:00:30' } as const;

/** 10/26 09:00:30 — KB 코스닥 N 3 + A 매도 1 · 교보 코스닥 N 2(교보 코스피 · KB 코스피 조각 없음). */
function n0930(side: string | null = 'buy'): LaunchMapResponse {
  return {
    days: ['20261026'],
    heads: [
      head({ ...N_HEAD, gateway: 'KB120', market: 'Q', next_offset_us: -245 }),
      head({ ...N_HEAD, gateway: 'KYOBO119', market: 'Q', next_offset_us: -200 }),
    ],
    pieces: [
      nPiece({ gateway: 'KB120', market: 'Q', wire: 0, sent_rel_us: -20148, result: '101', retry: 2, side }),
      nPiece({ gateway: 'KB120', market: 'Q', wire: 1, sent_rel_us: -20143, result: '101', side }),
      nPiece({ gateway: 'KB120', market: 'Q', wire: 2, sent_rel_us: -20141, result: '101', side }),
      nPiece({ gateway: 'KB120', market: 'Q', profile: 'A', wire: 0, side: 'sell', sent_rel_us: -20139, result: '101' }),
      nPiece({ gateway: 'KYOBO119', market: 'Q', wire: 0, sent_rel_us: -20149, result: '기타', side }),
      nPiece({ gateway: 'KYOBO119', market: 'Q', wire: 1, sent_rel_us: -20140, result: '기타', side }),
    ],
  };
}

function view(over: Partial<LaunchMapViewProps> = {}) {
  const props: LaunchMapViewProps = {
    resp: Q16_ALL,
    fire: 'q16',
    range: 'all',
    onFire: vi.fn(),
    onRange: vi.fn(),
    ...over,
  };
  const r = render(<LaunchMapView {...props} />);
  return { ...r, props };
}

const slots = (c: HTMLElement, slot: string) => Array.from(c.querySelectorAll<HTMLElement>(`[data-slot="${slot}"]`));
const one = (c: HTMLElement, sel: string) => c.querySelector<HTMLElement>(sel)!;

describe('LaunchMapView — 16:00 「전체」', () => {
  it('칩 3개 · 「전체」 선택 · 범위 글 「10/12 ~ 10/26 · 11거래일」', () => {
    const { container } = view();
    const chips = within(one(container, '[data-slot="launch-range"]')).getAllByRole('button');
    expect(chips.map((b) => b.textContent)).toEqual(['최근 10일', '20일', '전체']);
    expect(chips.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);
    expect(one(container, '[data-slot="launch-range-text"]').textContent).toBe('10/12 ~ 10/26 · 11거래일');
  });

  it('시작 · 끝 날짜 입력이 없다(프리셋 칩만)', () => {
    const { container } = view();
    expect(container.querySelectorAll('input')).toHaveLength(0);
  });

  it('요약 카드 4장 LAUNCH_ORDER 순 · KB 코스닥 = 10일 · −347 · −322 · −337', () => {
    const { container } = view();
    const kpis = slots(container, 'launch-kpi');
    expect(kpis.map((k) => `${k.dataset.gateway}|${k.dataset.market}`)).toEqual([
      'KB120|Q',
      'KB120|K',
      'KYOBO119|Q',
      'KYOBO119|K',
    ]);
    const kb = kpis[0]!;
    expect(kb.textContent).toContain('KB 코스닥 · 10일');
    expect(one(kb, '[data-kpi="min-accept"]').textContent).toBe(`${M}347µs`);
    expect(one(kb, '[data-kpi="max-reject"]').textContent).toBe(`${M}322µs`);
    expect(one(kb, '[data-kpi="next"]').textContent).toBe(`${M}337µs`);
  });

  it('패널 4개 · 점 합 196 · 16:00 범례 · 푸터', () => {
    const { container } = view();
    expect(slots(container, 'launch-panel')).toHaveLength(4);
    expect(container.querySelectorAll('[data-slot="launch-chart"] circle')).toHaveLength(196);
    const legend = one(container, '[data-slot="launch-legend"]');
    expect(legend.textContent).toContain('101 거부(너무 이름)');
    expect(legend.textContent).not.toContain('마름모');
    expect(one(container, '[data-slot="launch-foot"]').textContent).toContain('조각 간격은 10/12부터');
  });

  it('오른쪽 끝 눈금 글은 오른쪽 맞춤 — SVG 밖으로 잘리지 않는다(09:00:30 「−20,136」)', () => {
    const { container } = view({ resp: n0930(), fire: 'n0930', range: '10d' });
    const edge = Array.from(container.querySelectorAll('[data-slot="launch-ticks"] text')).filter(
      (t) => Number(t.getAttribute('x')) > 640 - 14 - 24,
    );
    expect(edge.length).toBeGreaterThan(0);
    for (const t of edge) expect(t.getAttribute('text-anchor')).toBe('end');
  });

  it('다음 오프셋 머리가 없으면 카드 「—」 · 점선 없음', () => {
    const { container } = view({ resp: { ...Q16_ALL, heads: [] } });
    for (const k of slots(container, 'launch-kpi')) {
      expect(one(k, '[data-kpi="next"]').textContent).toBe('—');
    }
    expect(container.querySelectorAll('[data-slot="launch-next"]')).toHaveLength(0);
  });

  it('칩 클릭 → onRange · 이미 선택된 칩은 부르지 않는다 · 세그먼트 → onFire', () => {
    const { props } = view();
    fireEvent.click(screen.getByRole('button', { name: '20일' }));
    fireEvent.click(screen.getByRole('button', { name: '전체' }));
    expect(props.onRange).toHaveBeenCalledTimes(1);
    expect(props.onRange).toHaveBeenCalledWith('20d');
    fireEvent.click(screen.getByRole('button', { name: '09:00:30 개장차익' }));
    expect(props.onFire).toHaveBeenCalledWith('n0930');
  });
});

describe('LaunchMapView — 09:00:30 합패널', () => {
  it('범례 「마름모 = A 매도 · 동그라미 = N 매수」 · 패널 안 마름모 1 · side 가 다 있으면 「구분 없음(백필)」 없음', () => {
    // N wire 0 과 A 매도 wire 0 이 한 행에 있다 — React 키가 겹치면 안 된다.
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = view({ resp: n0930('buy'), fire: 'n0930', range: '10d' });
    expect(err.mock.calls.filter((c) => String(c[0]).includes('same key'))).toHaveLength(0);
    err.mockRestore();
    const legend = one(container, '[data-slot="launch-legend"]');
    expect(legend.textContent).toContain('마름모 = A 매도 · 동그라미 = N 매수');
    expect(legend.textContent).toContain('101·515 거부');
    expect(legend.textContent).not.toContain('구분 없음(백필)');
    expect(container.querySelectorAll('[data-slot="launch-chart"] path[data-shape="diamond"]')).toHaveLength(1);
    expect(one(container, '[data-slot="launch-range-text"]').textContent).toBe('10/26 · 1거래일');
    expect(one(container, '[data-slot="launch-foot"]').textContent).toBe(
      'N 오프셋은 고정값 — 선은 최신 N 머리 값 · 재전송은 첫 발만 점 · 횟수는 툴팁',
    );
  });

  it('side null 조각이 있으면 범례에 「구분 없음(백필)」', () => {
    const { container } = view({ resp: n0930(null), fire: 'n0930', range: '10d' });
    expect(one(container, '[data-slot="launch-legend"]').textContent).toContain('구분 없음(백필)');
  });

  it('다음 첫 조각 = 최신 N 머리 값(KB 코스닥 −245 · 교보 코스닥 −200) · 머리 없는 조합 「—」', () => {
    const { container } = view({ resp: n0930(), fire: 'n0930', range: '10d' });
    const next = (g: string, m: string) =>
      one(container, `[data-slot="launch-kpi"][data-gateway="${g}"][data-market="${m}"] [data-kpi="next"]`).textContent;
    expect(next('KB120', 'Q')).toBe(`${M}245µs`);
    expect(next('KYOBO119', 'Q')).toBe(`${M}200µs`);
    expect(next('KB120', 'K')).toBe('—');
  });

  it('조각 0 인 조합은 패널 머리 + 「이 범위에 발사 없음」', () => {
    const { container } = view({ resp: n0930(), fire: 'n0930', range: '10d' });
    const kbk = one(container, '[data-slot="launch-panel"][data-gateway="KB120"][data-market="K"]');
    expect(kbk.textContent).toContain('KB 코스피');
    expect(kbk.textContent).toContain('이 범위에 발사 없음');
    expect(kbk.querySelectorAll('svg')).toHaveLength(0);
  });
});

describe('LaunchMapView — 빈 상태 · 오류', () => {
  it('days [] → 「아직 적재된 발사가 없어요 · 첫 적재는 16:00:01」 · 카드 · 패널 없음', () => {
    const { container } = view({ resp: { days: [], heads: [], pieces: [] } });
    expect(one(container, '[data-slot="launch-empty"]').textContent).toBe('아직 적재된 발사가 없어요 · 첫 적재는 16:00:01');
    expect(slots(container, 'launch-kpi')).toHaveLength(0);
    expect(slots(container, 'launch-panel')).toHaveLength(0);
    expect(one(container, '[data-slot="launch-range-text"]').textContent).toBe('');
  });

  it('오류 → 「발사 기록을 불러오지 못했어요」 + 「다시 시도」', () => {
    const onRetry = vi.fn();
    view({ resp: null, status: 'error', onRetry });
    expect(screen.getByRole('alert').textContent).toContain('발사 기록을 불러오지 못했어요');
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 35-14 — 다음 발사 계획(D-24 · D-25 · D-35)
// ─────────────────────────────────────────────────────────────────────────────

function okServer(q16K: number[], q16Q: number[], n: number): LaunchPlanServer {
  return {
    status: 'ok',
    plan_rev: 7,
    updated_at: '2026-10-27T13:41:00Z',
    entries: [
      { profile: 'Q16', market: 'K', offsets_us: q16K },
      { profile: 'Q16', market: 'Q', offsets_us: q16Q },
      { profile: 'N', market: 'K', offsets_us: [n] },
      { profile: 'N', market: 'Q', offsets_us: [n] },
    ],
  };
}

function planResp(over: Partial<Record<'KB120' | 'KYOBO119', LaunchPlanServer>> = {}): LaunchPlanResponse {
  return {
    servers: {
      KB120: over.KB120 ?? okServer([-340, -335, -320], [-350, -345, -325], -245),
      KYOBO119: over.KYOBO119 ?? okServer([-410, -400, -380], [-530, -520, -500], -200),
    },
    changes: [],
  };
}

const panelOf = (c: HTMLElement, g: string, m: string) =>
  one(c, `[data-slot="launch-panel"][data-gateway="${g}"][data-market="${m}"]`);
const kpiNextOf = (c: HTMLElement, g: string, m: string) =>
  one(c, `[data-slot="launch-kpi"][data-gateway="${g}"][data-market="${m}"] [data-kpi="next"]`).textContent;

describe('LaunchMapView — 다음 발사 계획(서버 ok)', () => {
  it('plan ready → KB 코스닥 줄 「3조각 −350 · −345 · −325µs」 · 그 패널 점선 3개 · KPI 「−350µs」', () => {
    const { container } = view({ plan: { kind: 'ready', resp: planResp() } });
    const kbq = panelOf(container, 'KB120', 'Q');
    expect(one(kbq, '[data-slot="launch-plan-line"]').textContent).toBe(`3조각 ${M}350 · ${M}345 · ${M}325µs`);
    expect(slots(kbq, 'launch-next').map((l) => l.getAttribute('data-idx'))).toEqual(['0', '1', '2']);
    expect(kpiNextOf(container, 'KB120', 'Q')).toBe(`${M}350µs`);
  });
});
