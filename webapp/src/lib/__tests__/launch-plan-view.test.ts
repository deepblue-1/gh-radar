import { describe, expect, it } from 'vitest';

import type { LaunchHeadRow, LaunchPlanChangeRow, LaunchPlanResponse, LaunchPlanServer } from '@gh-radar/shared';

import {
  LAUNCH_PLAN_HISTORY_MAX,
  changeOutcomeView,
  changeValuesText,
  fallbackLineText,
  lastChangeText,
  panelPlanOf,
  planEditOf,
  planEditWithDraft,
  planLineText,
  planStateWithSave,
  saveResultViewOf,
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
    // 계획 behavior 예시의 now 15:00Z 는 KST 10/28 00:00(다른 날)이라 같은 날 예시로 14:50Z(KST 10/27 23:50)를 쓴다.
    expect(lastChangeText(r, new Date('2026-10-27T14:50:00Z'))).toBe('22:41 · a@b.c');
    expect(lastChangeText(r, new Date('2026-10-27T15:00:00Z'))).toBe('10/27 22:41 · a@b.c');
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

describe('편집 · 저장(35-15)', () => {
  const AT = new Date('2026-10-27T13:41:00Z'); // KST 22:41

  it('saveResultViewOf ok — 칩 「KB120」 · 「저장됨 · 22:41 · 다음 16:00 발사부터」 / n0930 「다음 09:00:30 발사부터」', () => {
    expect(saveResultViewOf({ server: 'KB120', outcome: 'ok' }, 'q16', AT)).toEqual({
      chip: { tone: 'ok', text: 'KB120', title: null },
      line: { tone: 'ok', text: '저장됨 · 22:41 · 다음 16:00 발사부터' },
    });
    expect(saveResultViewOf({ server: 'KB120', outcome: 'ok' }, 'n0930', AT).line.text).toBe(
      '저장됨 · 22:41 · 다음 09:00:30 발사부터',
    );
  });

  it('saveResultViewOf failed code 1 — 서버 미지원 · 원문 · 「— 서버 업데이트 뒤 다시 저장」', () => {
    expect(
      saveResultViewOf({ server: 'KB120', outcome: 'failed', code: 1, message: '알 수 없는 명령입니다' }, 'q16', AT),
    ).toEqual({
      chip: { tone: 'err', text: 'KB120 · 실패', title: '서버 미지원 · 알 수 없는 명령입니다' },
      line: { tone: 'err', text: 'KB120 실패: 서버 미지원 · 알 수 없는 명령입니다 — 서버 업데이트 뒤 다시 저장' },
    });
  });

  it('saveResultViewOf failed code 10 — 「KB120 실패: 저장 실패」 · message 없으면 칩 낱말', () => {
    expect(saveResultViewOf({ server: 'KB120', outcome: 'failed', code: 10, message: '저장 실패' }, 'q16', AT)).toEqual({
      chip: { tone: 'err', text: 'KB120 · 실패', title: '저장 실패' },
      line: { tone: 'err', text: 'KB120 실패: 저장 실패' },
    });
    expect(saveResultViewOf({ server: 'KB120', outcome: 'failed', code: 10 }, 'q16', AT).line.text).toBe('KB120 실패: 실패');
  });

  it('saveResultViewOf code 1 판정은 outcome failed 일 때만 — message 문장은 보지 않는다', () => {
    // 같은 문장이어도 code 가 1 이 아니면 서버 미지원이 아니다
    expect(
      saveResultViewOf({ server: 'KB120', outcome: 'failed', code: 2, message: '알 수 없는 명령입니다' }, 'q16', AT).line.text,
    ).toBe('KB120 실패: 알 수 없는 명령입니다');
    expect(saveResultViewOf({ server: 'KB120', outcome: 'skipped', code: 1, message: '꺼진 서버' }, 'q16', AT).line.text).toBe(
      'KB120 미반영: 꺼진 서버',
    );
  });

  it('saveResultViewOf timeout · offline · skipped', () => {
    expect(saveResultViewOf({ server: 'KB120', outcome: 'timeout' }, 'q16', AT)).toEqual({
      chip: { tone: 'err', text: 'KB120 · 응답 없음', title: null },
      line: { tone: 'err', text: 'KB120 실패: 응답 없음' },
    });
    expect(saveResultViewOf({ server: 'KB120', outcome: 'offline' }, 'q16', AT)).toEqual({
      chip: { tone: 'warn', text: 'KB120 · 서버 연결 안 됨', title: null },
      line: { tone: 'warn', text: 'KB120 미반영: 서버 연결 안 됨' },
    });
    expect(saveResultViewOf({ server: 'KB120', outcome: 'offline', message: 'relay 응답이 없어요' }, 'q16', AT)).toEqual({
      chip: { tone: 'warn', text: 'KB120 · 서버 연결 안 됨', title: 'relay 응답이 없어요' },
      line: { tone: 'warn', text: 'KB120 미반영: 서버 연결 안 됨' },
    });
    expect(saveResultViewOf({ server: 'KB120', outcome: 'skipped', message: '꺼진 서버' }, 'q16', AT)).toEqual({
      chip: { tone: 'warn', text: 'KB120 · 미반영', title: '꺼진 서버' },
      line: { tone: 'warn', text: 'KB120 미반영: 꺼진 서버' },
    });
    // skipped 사유가 비면 이력 알약 낱말(「꺼진 서버」 · 35-14 changeOutcomeView 와 같은 말)
    expect(saveResultViewOf({ server: 'KB120', outcome: 'skipped' }, 'q16', AT).line.text).toBe('KB120 미반영: 꺼진 서버');
  });

  it('planEditWithDraft — 검증 통과일 때만 valid 를 바꾼다(S9)', () => {
    const e0 = planEditOf('KB120', 'Q', 'q16', [-350, -345, -325]);
    expect(e0.draft).toEqual(['-350', '-345', '-325']);
    const e1 = planEditWithDraft(e0, ['-350', '-340', '-325']);
    expect(e1.valid).toEqual([-350, -340, -325]);
    const e2 = planEditWithDraft(e1, ['-350', '-360', '-325']);
    expect(e2.draft).toEqual(['-350', '-360', '-325']);
    expect(e2.valid).toEqual([-350, -340, -325]);
  });

  it('planStateWithSave — plan 으로 그 서버만 교체 · change 는 맨 앞 · null 이면 그대로 · ready 아니면 그대로', () => {
    const s0 = ready({ KB120: OK_KB, KYOBO119: { status: 'offline' } }, [row({ id: 1 })]);
    const nextPlan: LaunchPlanServer = { ...OK_KB, plan_rev: 8, entries: [{ profile: 'Q16', market: 'Q', offsets_us: [-340] }] };
    const s1 = planStateWithSave(s0, 'KB120', { plan: nextPlan, change: row({ id: 9 }) });
    expect(s1.kind).toBe('ready');
    if (s1.kind !== 'ready') return;
    expect(s1.resp.servers.KB120).toBe(nextPlan);
    expect(s1.resp.servers.KYOBO119).toEqual({ status: 'offline' });
    expect(s1.resp.changes.map((c) => c.id)).toEqual([9, 1]);

    const s2 = planStateWithSave(s0, 'KB120', { plan: null, change: null });
    expect(s2).toEqual(s0);
    expect(planStateWithSave({ kind: 'absent' }, 'KB120', { plan: nextPlan, change: null })).toEqual({ kind: 'absent' });
  });
});
