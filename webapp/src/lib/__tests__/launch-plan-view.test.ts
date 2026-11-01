import { describe, expect, it } from 'vitest';

import type { LaunchHeadRow, LaunchPlanChangeRow, LaunchPlanResponse, LaunchPlanServer } from '@gh-radar/shared';

import {
  LAUNCH_PLAN_HISTORY_MAX,
  LAUNCH_PLAN_UNKNOWN_OP_MESSAGE,
  changeOutcomeView,
  changeValuesText,
  fallbackLineText,
  lastChangeText,
  panelPlanOf,
  planEditOf,
  planEditWithDraft,
  planLineText,
  planNeedsReload,
  planRereadOf,
  planStateWithReload,
  planStateWithSave,
  planStateWithSentEntry,
  rejectedSaveResultOf,
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

  it('saveResultViewOf failed code 1 · 서버 고정 거부 문구(범위 · 순서 · 조각 수 · 폭) → 일반 실패 줄 · 서버 미지원 아님', () => {
    const span = '시각 목록 폭 상한 밖(마지막 − 첫 ≤ 500µs)';
    expect(saveResultViewOf({ server: 'KB120', outcome: 'failed', code: 1, message: span }, 'q16', AT)).toEqual({
      chip: { tone: 'err', text: 'KB120 · 실패', title: span },
      line: { tone: 'err', text: `KB120 실패: ${span}` },
    });
    for (const m of [
      '발사 시각 범위 밖(-3000~1000µs)',
      '조각 수 범위 밖(1~10)',
      '시각 목록은 같거나 커지는 순서(서버가 정렬하지 않음)',
      'N 은 시각 한 값',
    ]) {
      expect(saveResultViewOf({ server: 'KB120', outcome: 'failed', code: 1, message: m }, 'q16', AT).line.text).toBe(`KB120 실패: ${m}`);
    }
    // message 없는 code 1 은 서버 미지원으로 단정하지 않는다
    expect(saveResultViewOf({ server: 'KB120', outcome: 'failed', code: 1 }, 'q16', AT).line.text).toBe('KB120 실패: 실패');
    expect(LAUNCH_PLAN_UNKNOWN_OP_MESSAGE).toBe('알 수 없는 명령입니다');
  });

  it('saveResultViewOf failed code 10 「발사 계획 저장 경로 없음 …」(fix 노트) → 일반 실패 줄', () => {
    const m = '발사 계획 저장 경로 없음 — 서버 plan_file 설정을 확인하세요';
    expect(saveResultViewOf({ server: 'KYOBO119', outcome: 'failed', code: 10, message: m }, 'q16', AT)).toEqual({
      chip: { tone: 'err', text: 'KYOBO119 · 실패', title: m },
      line: { tone: 'err', text: `KYOBO119 실패: ${m}` },
    });
  });

  it('saveResultViewOf 서버 미지원은 outcome failed · code 1 · 「알 수 없는 명령입니다」 셋 다일 때만', () => {
    // 같은 문장이어도 code 가 1 이 아니면 서버 미지원이 아니다
    expect(
      saveResultViewOf({ server: 'KB120', outcome: 'failed', code: 2, message: '알 수 없는 명령입니다' }, 'q16', AT).line.text,
    ).toBe('KB120 실패: 알 수 없는 명령입니다');
    expect(saveResultViewOf({ server: 'KB120', outcome: 'skipped', code: 1, message: '꺼진 서버' }, 'q16', AT).line.text).toBe(
      'KB120 미반영: 꺼진 서버',
    );
  });

  it('saveResultViewOf timeout · offline · skipped', () => {
    // timeout = 결과 모름(CR-01) — 「실패」 · 「미반영」 으로 단정하지 않는다 · message 는 칩 title
    expect(saveResultViewOf({ server: 'KB120', outcome: 'timeout' }, 'q16', AT)).toEqual({
      chip: { tone: 'err', text: 'KB120 · 응답 없음', title: null },
      line: { tone: 'err', text: 'KB120 응답 없음: 반영됐는지 몰라요 — 다시 읽은 계획으로 확인' },
    });
    expect(saveResultViewOf({ server: 'KB120', outcome: 'timeout', message: '반영됐을 수 있어요' }, 'q16', AT).chip.title).toBe(
      '반영됐을 수 있어요',
    );
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

  it('saveResultViewOf timeout 줄 꼬리 = 다시 읽기 결과(R3-WR-01) — 확인은 대상 서버를 다시 읽어 반영했을 때만', () => {
    const t = (reread?: 'pending' | 'ok' | 'superseded' | 'failed') =>
      saveResultViewOf({ server: 'KB120', outcome: 'timeout' }, 'q16', AT, reread).line;
    const lead = 'KB120 응답 없음: 반영됐는지 몰라요 — ';
    expect(t()).toEqual({ tone: 'err', text: `${lead}다시 읽은 계획으로 확인` });
    expect(t('ok')).toEqual({ tone: 'err', text: `${lead}다시 읽은 계획으로 확인` });
    expect(t('pending')).toEqual({ tone: 'err', text: `${lead}계획을 다시 읽는 중이에요` });
    expect(t('failed')).toEqual({
      tone: 'err',
      text: `${lead}계획을 다시 읽지 못했어요(보이는 값은 저장 전 값일 수 있어요) · 잠시 뒤 새로고침`,
    });
    expect(t('superseded').text).toBe(
      `${lead}그 뒤 새 저장이 있어 다시 읽은 값을 쓰지 않았어요(보이는 값은 이 저장 결과가 아닐 수 있어요) · 잠시 뒤 새로고침`,
    );
    // timeout 이 아닌 줄은 다시 읽기 결과와 무관(ok · plan null 은 보낸 값으로 이미 맞췄다 — WR-01)
    expect(saveResultViewOf({ server: 'KB120', outcome: 'ok' }, 'q16', AT, 'failed').line.text).toMatch(/^저장됨 · /);
    expect(saveResultViewOf({ server: 'KB120', outcome: 'offline' }, 'q16', AT, 'failed').line.text).toBe(
      'KB120 미반영: 서버 연결 안 됨',
    );
  });

  it('planRereadOf — take 에 들면 ok · 그 서버 ok 인데 take 밖이면 superseded · 그 밖(non-ok · 응답에 없음)은 failed', () => {
    const ok: LaunchPlanServer = { status: 'ok', plan_rev: 1, updated_at: null, entries: [] };
    const resp = (kb?: LaunchPlanServer): LaunchPlanResponse => ({
      servers: kb === undefined ? { KYOBO119: ok } : { KB120: kb, KYOBO119: ok },
      changes: [],
    });
    expect(planRereadOf(resp(ok), 'KB120', new Set(['KB120', 'KYOBO119']))).toBe('ok');
    expect(planRereadOf(resp(ok), 'KB120', new Set(['KYOBO119']))).toBe('superseded');
    expect(planRereadOf(resp({ status: 'timeout' }), 'KB120', new Set(['KYOBO119']))).toBe('failed');
    expect(planRereadOf(resp({ status: 'offline' }), 'KB120', new Set(['KYOBO119']))).toBe('failed');
    expect(planRereadOf(resp({ status: 'failed', code: 10, message: 'x' }), 'KB120', new Set(['KYOBO119']))).toBe('failed');
    expect(planRereadOf(resp(), 'KB120', new Set(['KYOBO119']))).toBe('failed');
  });

  it('planNeedsReload — plan null 이고 결과 모름(timeout · CR-01) · 저장 ok(WR-01)일 때만 다시 읽는다', () => {
    const r = (outcome: 'ok' | 'failed' | 'timeout' | 'offline' | 'skipped') => ({ server: 'KB120', outcome }) as const;
    expect(planNeedsReload({ result: r('timeout'), plan: null })).toBe(true);
    expect(planNeedsReload({ result: r('ok'), plan: null })).toBe(true);
    expect(planNeedsReload({ result: r('ok'), plan: { status: 'ok', plan_rev: 4, updated_at: null, entries: [] } })).toBe(false);
    expect(planNeedsReload({ result: r('failed'), plan: null })).toBe(false);
    expect(planNeedsReload({ result: r('offline'), plan: null })).toBe(false);
    expect(planNeedsReload({ result: r('skipped'), plan: null })).toBe(false);
    expect(planNeedsReload({ result: r('timeout'), plan: { status: 'timeout' } })).toBe(false);
  });

  it('planStateWithSentEntry — 그 서버 (fire, market) 칸만 보낸 값으로 · 칸이 없으면 덧붙임 · 서버 ok 아님 · ready 아님은 그대로(WR-01)', () => {
    const okKb: LaunchPlanServer = {
      status: 'ok',
      plan_rev: 3,
      updated_at: null,
      entries: [
        { profile: 'Q16', market: 'K', offsets_us: [-340] },
        { profile: 'Q16', market: 'Q', offsets_us: [-350, -345, -325] },
      ],
    };
    const s0 = { kind: 'ready' as const, resp: { servers: { KB120: okKb, KYOBO119: { status: 'offline' as const } }, changes: [] } };
    const s1 = planStateWithSentEntry(s0, 'KB120', 'q16', 'Q', [-350, -340, -325]);
    expect(s1.kind === 'ready' && s1.resp.servers.KB120).toEqual({
      ...okKb,
      entries: [
        { profile: 'Q16', market: 'K', offsets_us: [-340] },
        { profile: 'Q16', market: 'Q', offsets_us: [-350, -340, -325] },
      ],
    });
    expect(okKb.entries[1]!.offsets_us).toEqual([-350, -345, -325]); // 원본 불변
    const s2 = planStateWithSentEntry(s0, 'KB120', 'n0930', 'Q', [-245]);
    expect(s2.kind === 'ready' && s2.resp.servers.KB120!.status === 'ok' && s2.resp.servers.KB120!.entries.at(-1)).toEqual({
      profile: 'N',
      market: 'Q',
      offsets_us: [-245],
    });
    expect(planStateWithSentEntry(s0, 'KYOBO119', 'q16', 'Q', [-1])).toBe(s0);
    expect(planStateWithSentEntry({ kind: 'error' }, 'KB120', 'q16', 'Q', [-1])).toEqual({ kind: 'error' });
  });

  it('planStateWithReload — take 안 · status ok 인 서버만 바꾼다 · 실패 모양은 마지막 값 유지 · 이력은 id 로 합침 · ready 아니면 응답 그대로(R2-WR-01)', () => {
    const NEW_KB: LaunchPlanServer = { ...OK_KB, plan_rev: 8, entries: [{ profile: 'Q16', market: 'Q', offsets_us: [-350, -340, -325] }] };
    const OK_KY: LaunchPlanServer = { status: 'ok', plan_rev: 2, updated_at: null, entries: [{ profile: 'Q16', market: 'Q', offsets_us: [-530] }] };
    const OLD_KY: LaunchPlanServer = { ...OK_KY, plan_rev: 1, entries: [{ profile: 'Q16', market: 'Q', offsets_us: [-500] }] };
    const mine = row({ gateway: 'KYOBO119' }); // 그 뒤 저장 응답으로 넣은 행
    const shared = row({});
    const s0 = ready({ KB120: OK_KB, KYOBO119: OK_KY }, [mine, shared]);

    // 실패 모양(relay 실패 → 두 서버 offline 200) — take 에 있어도 ok 가 아니면 바꾸지 않는다.
    const offline = { servers: { KB120: { status: 'offline' as const }, KYOBO119: { status: 'offline' as const } }, changes: [] };
    const s1 = planStateWithReload(s0, offline, new Set(['KB120', 'KYOBO119']));
    expect(s1.kind === 'ready' && s1.resp.servers).toEqual({ KB120: OK_KB, KYOBO119: OK_KY });
    expect(s1.kind === 'ready' && s1.resp.changes).toEqual([mine, shared]);

    // 늦게 온 응답 — KYOBO119 는 take 밖(더 최신 저장이 반영됨)이라 옛 값으로 되돌리지 않는다 · KB120 만 새 값.
    const added = row({});
    const late = { servers: { KB120: NEW_KB, KYOBO119: OLD_KY }, changes: [added, shared] };
    const s2 = planStateWithReload(s0, late, new Set(['KB120']));
    expect(s2.kind === 'ready' && s2.resp.servers).toEqual({ KB120: NEW_KB, KYOBO119: OK_KY });
    expect(s2.kind === 'ready' && s2.resp.changes.map((c) => c.id)).toEqual([mine.id, shared.id, added.id]);

    // 지킬 마지막 값이 없으면 응답 그대로.
    expect(planStateWithReload({ kind: 'error' }, late, new Set())).toEqual({ kind: 'ready', resp: late });
  });

  it('rejectedSaveResultOf — 4xx 거부는 failed(확정 실패) · 401 · 403 고정 문구 · 그 밖은 「요청 거부(status) · 문구」(R2-IN-01)', () => {
    const at = new Date('2026-10-27T13:41:00Z');
    const line = (status: number, message: string) =>
      saveResultViewOf(rejectedSaveResultOf('KB120', status, message), 'q16', at).line;
    expect(rejectedSaveResultOf('KB120', 401, '로그인이 필요합니다.')).toEqual({
      server: 'KB120',
      outcome: 'failed',
      message: '로그인이 만료됐어요 — 다시 로그인한 뒤 저장하세요',
    });
    expect(line(401, 'x')).toEqual({ tone: 'err', text: 'KB120 실패: 로그인이 만료됐어요 — 다시 로그인한 뒤 저장하세요' });
    expect(line(403, 'x').text).toBe('KB120 실패: 권한이 없어요');
    expect(line(400, 'offsets_us: 비었음').text).toBe('KB120 실패: 요청 거부(400) · offsets_us: 비었음');
    expect(line(404, '').text).toBe('KB120 실패: 요청 거부(404)');
    for (const s of [401, 400]) expect(line(s, 'x').text).not.toContain('몰라요');
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
