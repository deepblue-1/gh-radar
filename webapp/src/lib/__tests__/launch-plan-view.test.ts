import { describe, expect, it } from 'vitest';

import type { LaunchHeadRow, LaunchPlanChangeRow, LaunchPlanResponse, LaunchPlanServer } from '@gh-radar/shared';

import {
  LAUNCH_PLAN_HISTORY_MAX,
  changeOutcomeView,
  changeValuesText,
  fallbackLineText,
  lastChangeText,
  panelPlanOf,
  planLineText,
} from '../launch-plan-view';

/**
 * Phase 35 (35-14) — 「다음 발사 계획」 패널 모델 · 표기(D-24 · D-25 · D-29 · Pitfall S11).
 */

const M = '−';

function head(gateway: string, market: string, next: number | null, profile = 'Q16'): LaunchHeadRow {
  return {
    trade_date: '20261026',
    gateway,
    market,
    profile,
    fire_exchange: profile === 'Q16' ? 'KRX' : 'NXT',
    fire_base: profile === 'Q16' ? '16:00:00' : '09:00:30',
    next_offset_us: next,
  } as LaunchHeadRow;
}

const HEADS: LaunchHeadRow[] = [head('KB120', 'Q', -337), head('KYOBO119', 'Q', -526), head('KB120', 'Q', -245, 'N')];

const OK_KB: LaunchPlanServer = {
  status: 'ok',
  plan_rev: 7,
  updated_at: '2026-10-27T13:41:00Z',
  entries: [
    { profile: 'Q16', market: 'Q', offsets_us: [-350, -345, -325] },
    { profile: 'N', market: 'Q', offsets_us: [-245] },
  ],
};

let nextId = 1;
function row(over: Partial<LaunchPlanChangeRow>): LaunchPlanChangeRow {
  return {
    id: nextId++,
    at: '2026-10-27T13:41:00Z',
    admin_email: 'a@b.c',
    gateway: 'KB120',
    fire: 'q16',
    market: 'Q',
    before_us: [-355, -350, -330],
    after_us: [-350, -345, -325],
    outcome: 'ok',
    code: null,
    message: null,
    plan_rev: 7,
    ...over,
  };
}

function ready(servers: Record<string, LaunchPlanServer>, changes: LaunchPlanChangeRow[] = []): {
  kind: 'ready';
  resp: LaunchPlanResponse;
} {
  return { kind: 'ready', resp: { servers, changes } };
}

describe('panelPlanOf', () => {
  it('ready + 서버 ok + 칸 있음 → server · lines = 계획 조각', () => {
    const p = panelPlanOf(ready({ KB120: OK_KB }), HEADS, 'KB120', 'Q', 'q16');
    expect(p.source).toBe('server');
    expect(p.lines).toEqual([-350, -345, -325]);
    expect(p.fallbackUs).toBe(-337);
  });

  it.each([
    ['offline', { status: 'offline', message: 'x' } as LaunchPlanServer],
    ['failed', { status: 'failed', code: 1, message: '거부' } as LaunchPlanServer],
  ])('ready 인데 그 서버 %s → fallback · lines [머리 값]', (_, srv) => {
    const p = panelPlanOf(ready({ KB120: srv }), HEADS, 'KB120', 'Q', 'q16');
    expect(p.source).toBe('fallback');
    expect(p.lines).toEqual([-337]);
    expect(p.entry).toBeNull();
  });

  it('error → fallback · loading → loading 둘 다 lines [머리 값]', () => {
    expect(panelPlanOf({ kind: 'error' }, HEADS, 'KB120', 'Q', 'q16')).toMatchObject({ source: 'fallback', lines: [-337] });
    expect(panelPlanOf({ kind: 'loading' }, HEADS, 'KB120', 'Q', 'q16')).toMatchObject({
      source: 'loading',
      lines: [-337],
    });
  });

  it('머리 값 null(또는 머리 없음) → lines []', () => {
    expect(panelPlanOf({ kind: 'error' }, HEADS, 'KB120', 'K', 'q16').lines).toEqual([]);
    expect(panelPlanOf({ kind: 'loading' }, [head('KB120', 'Q', null)], 'KB120', 'Q', 'q16').lines).toEqual([]);
  });

  it('absent → source absent · lines [머리 값](35-08 그대로) · 이력 없음', () => {
    const p = panelPlanOf({ kind: 'absent' }, HEADS, 'KB120', 'Q', 'q16');
    expect(p).toMatchObject({ source: 'absent', lines: [-337], changes: [], lastChange: null });
  });

  it('n0930 → N 칸 · 머리 대신 값도 N 머리', () => {
    expect(panelPlanOf(ready({ KB120: OK_KB }), HEADS, 'KB120', 'Q', 'n0930').lines).toEqual([-245]);
    expect(panelPlanOf({ kind: 'error' }, HEADS, 'KB120', 'Q', 'n0930').lines).toEqual([-245]);
  });

  it('changes 는 다른 (서버, 발사, 시장) 행을 섞지 않고 at 내림차순 · lastChange = 최근 failed 3행 뒤의 ok 행', () => {
    const okOld = row({ at: '2026-10-26T13:00:00Z' });
    const f1 = row({ at: '2026-10-27T14:00:00Z', outcome: 'failed', code: 1, message: '순서' });
    const f2 = row({ at: '2026-10-27T14:05:00Z', outcome: 'failed', code: 1, message: '순서' });
    const f3 = row({ at: '2026-10-27T14:10:00Z', outcome: 'timeout' });
    const others = [
      row({ gateway: 'KYOBO119' }),
      row({ fire: 'n0930', after_us: [-240] }),
      row({ market: 'K' }),
    ];
    const p = panelPlanOf(ready({ KB120: OK_KB }, [okOld, f1, ...others, f3, f2]), HEADS, 'KB120', 'Q', 'q16');
    expect(p.changes.map((c) => c.id)).toEqual([f3.id, f2.id, f1.id, okOld.id]);
    expect(p.lastChange?.id).toBe(okOld.id);
  });

  it('ok 행이 없으면 lastChange null', () => {
    const p = panelPlanOf(ready({ KB120: OK_KB }, [row({ outcome: 'failed', code: 1, message: 'm' })]), HEADS, 'KB120', 'Q', 'q16');
    expect(p.lastChange).toBeNull();
    expect(p.changes).toHaveLength(1);
  });
});

describe('표기', () => {
  it('planLineText — q16 「3조각 −350 · −345 · −325µs」 · n0930 「−245µs」', () => {
    expect(planLineText({ offsets_us: [-350, -345, -325] }, 'q16')).toBe(`3조각 ${M}350 · ${M}345 · ${M}325µs`);
    expect(planLineText({ offsets_us: [-245] }, 'n0930')).toBe(`${M}245µs`);
  });

  it('fallbackLineText — 「서버 연결 안 됨 · 마지막 발사 값 −337µs」 · null 「—」', () => {
    expect(fallbackLineText(-337)).toBe(`서버 연결 안 됨 · 마지막 발사 값 ${M}337µs`);
    expect(fallbackLineText(null)).toBe('서버 연결 안 됨 · 마지막 발사 값 —');
  });

  it('lastChangeText — 같은 KST 날 「22:41 · a@b.c」 · 다른 날 「10/27 22:41 · a@b.c」', () => {
    const r = row({ at: '2026-10-27T13:41:00Z' });
    expect(lastChangeText(r, new Date('2026-10-27T15:00:00Z'))).toBe('22:41 · a@b.c');
    expect(lastChangeText(r, new Date('2026-10-28T01:00:00Z'))).toBe('10/27 22:41 · a@b.c');
  });

  it('lastChangeText — KST 자정 넘김 경계(UTC 같은 날 · KST 다른 날)', () => {
    const r = row({ at: '2026-10-27T14:30:00Z' }); // KST 10/27 23:30
    expect(lastChangeText(r, new Date('2026-10-27T15:10:00Z'))).toBe('10/27 23:30 · a@b.c'); // KST 10/28 00:10
  });

  it('changeValuesText — 「−350 · −345 · −325 → −340 · −335 · −322」 · before null 「— → …」', () => {
    expect(changeValuesText([-350, -345, -325], [-340, -335, -322])).toBe(
      `${M}350 · ${M}345 · ${M}325 → ${M}340 · ${M}335 · ${M}322`,
    );
    expect(changeValuesText(null, [-340, -335, -322])).toBe(`— → ${M}340 · ${M}335 · ${M}322`);
  });

  it('changeOutcomeView — ok 저장됨 · failed 실패(title) · timeout 응답 없음 · offline 서버 연결 안 됨 · skipped 꺼진 서버', () => {
    expect(changeOutcomeView(row({ outcome: 'ok' }))).toEqual({ tone: 'ok', text: '저장됨' });
    expect(changeOutcomeView(row({ outcome: 'failed', code: 1, message: '순서 위반' }))).toEqual({
      tone: 'err',
      text: '실패',
      title: '순서 위반',
    });
    expect(changeOutcomeView(row({ outcome: 'timeout' }))).toEqual({ tone: 'err', text: '응답 없음' });
    expect(changeOutcomeView(row({ outcome: 'offline' }))).toEqual({ tone: 'warn', text: '서버 연결 안 됨' });
    expect(changeOutcomeView(row({ outcome: 'skipped' }))).toEqual({ tone: 'warn', text: '꺼진 서버' });
  });

  it('LAUNCH_PLAN_HISTORY_MAX = 10', () => {
    expect(LAUNCH_PLAN_HISTORY_MAX).toBe(10);
  });
});
