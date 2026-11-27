import { describe, expect, it } from 'vitest';

import type {
  LaunchHeadRow,
  LaunchPlanChangeRow,
  LaunchPlanResponse,
  LaunchPlanServer,
  LaunchTailProbeChangeRow,
} from '@gh-radar/shared';

import {
  LAUNCH_PLAN_G2_UNKNOWN,
  LAUNCH_PLAN_HISTORY_MAX,
  LAUNCH_PLAN_UNKNOWN_OP_MESSAGE,
  changeOutcomeView,
  changeValuesText,
  fallbackLineText,
  lastChangeText,
  maxChangeIdOf,
  panelPlanOf,
  planDraftCheck,
  planEditOf,
  planEditWithDraft,
  planLineText,
  planNeedsReload,
  planRereadOf,
  planSaveMarketsOf,
  planStateWithReload,
  planStateWithSave,
  planStateWithSentEntry,
  rejectedSaveResultOf,
  saveResultViewOf,
  saveRowSeenIn,
  TAIL_PROBE_UNKNOWN_TEXT,
  TAIL_PROBE_UNSUPPORTED_TEXT,
  tailProbeAddChipOf,
  tailProbeChangeText,
  tailProbeChangesOf,
  tailProbeCombinedOn,
  tailProbeCombinedSetOf,
  tailProbeCombinedTitleOf,
  tailProbeGroupText,
  tailProbeLegacyText,
  tailProbeSummaryParts,
  tailProbeSummaryText,
  maxTailProbeChangeIdOf,
  tailProbeEditOf,
  tailProbeEditWithDraft,
  tailProbeSaveMarketOf,
  tailProbeSaveRowSeenIn,
  tailProbeStateWithSave,
  tailProbeStateWithSent,
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
    // R3-IN-02 — offline 사유(relay 거부 · 연결 실패 원인)는 title 로
    expect(changeOutcomeView(row({ outcome: 'offline', message: 'relay 가 거부했어요(401 UNAUTHORIZED). relay 설정 · 배포를 확인하세요.' }))).toEqual({
      tone: 'warn',
      text: '서버 연결 안 됨',
      title: 'relay 가 거부했어요(401 UNAUTHORIZED). relay 설정 · 배포를 확인하세요.',
    });
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
    // R3-IN-02 — 사유(server 가 실은 relay 거부 · 연결 실패 원인)가 있으면 줄에 원문 그대로(gh-trade 서버 연결 문제로 읽히지 않게)
    expect(saveResultViewOf({ server: 'KB120', outcome: 'offline', message: 'relay 응답이 없어요' }, 'q16', AT)).toEqual({
      chip: { tone: 'warn', text: 'KB120 · 서버 연결 안 됨', title: 'relay 응답이 없어요' },
      line: { tone: 'warn', text: 'KB120 미반영: relay 응답이 없어요' },
    });
    expect(saveResultViewOf({ server: 'KB120', outcome: 'skipped', message: '꺼진 서버' }, 'q16', AT)).toEqual({
      chip: { tone: 'warn', text: 'KB120 · 미반영', title: '꺼진 서버' },
      line: { tone: 'warn', text: 'KB120 미반영: 꺼진 서버' },
    });
    // skipped 사유가 비면 이력 알약 낱말(「꺼진 서버」 · 35-14 changeOutcomeView 와 같은 말)
    expect(saveResultViewOf({ server: 'KB120', outcome: 'skipped' }, 'q16', AT).line.text).toBe('KB120 미반영: 꺼진 서버');
  });

  it('saveResultViewOf timeout 줄 꼬리 = 다시 읽기 결과(R3-WR-01) — 확인은 대상 서버를 다시 읽어 반영했을 때만', () => {
    const t = (reread?: 'pending' | 'ok' | 'superseded' | 'failed' | 'unproven') =>
      saveResultViewOf({ server: 'KB120', outcome: 'timeout' }, 'q16', AT, reread).line;
    const lead = 'KB120 응답 없음: 반영됐는지 몰라요 — ';
    expect(t()).toEqual({ tone: 'err', text: `${lead}다시 읽은 계획으로 확인` });
    expect(t('ok')).toEqual({ tone: 'err', text: `${lead}다시 읽은 계획으로 확인` });
    expect(t('pending')).toEqual({ tone: 'err', text: `${lead}계획을 다시 읽는 중이에요` });
    expect(t('failed')).toEqual({
      tone: 'err',
      text: `${lead}계획을 다시 읽지 못했어요(보이는 값은 저장 전 값일 수 있어요) · 잠시 뒤 새로고침`,
    });
    // R3-IN-01 — 다시 읽었지만 저장 처리 뒤에 읽었는지 모름(요청 throw 경로 · 이력에 이 저장 행 없음)
    expect(t('unproven').text).toBe(`${lead}다시 읽었지만 서버가 이 저장을 처리하기 전 값일 수 있어요 · 잠시 뒤 새로고침`);
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
    // R3-IN-01 — 저장 처리 뒤에 읽었는지 모르면(ordered false) 반영했어도 ok 가 아니다. 반영 못 한 경우는 그대로.
    expect(planRereadOf(resp(ok), 'KB120', new Set(['KB120']), false)).toBe('unproven');
    expect(planRereadOf(resp(ok), 'KB120', new Set(['KYOBO119']), false)).toBe('superseded');
    expect(planRereadOf(resp({ status: 'timeout' }), 'KB120', new Set(['KYOBO119']), false)).toBe('failed');
  });

  it('R3-IN-01 maxChangeIdOf · saveRowSeenIn — 같은 칸 · 같은 보낸 값 · 저장 전 id 보다 새 행만 증거', () => {
    expect(maxChangeIdOf({ kind: 'loading' })).toBe(0);
    expect(maxChangeIdOf(ready({}, []))).toBe(0);
    expect(maxChangeIdOf(ready({}, [row({ id: 3 }), row({ id: 9 }), row({ id: 4 })]))).toBe(9);
    const save = { gateway: 'KB120', fire: 'q16', market: 'Q', offsets: [-350, -345, -325], afterId: 9 } as const;
    expect(saveRowSeenIn([row({ id: 10 })], save)).toBe(true);
    expect(saveRowSeenIn([], save)).toBe(false);
    expect(saveRowSeenIn([row({ id: 9 })], save)).toBe(false); // 저장 전에 알던 행
    expect(saveRowSeenIn([row({ id: 10, gateway: 'KYOBO119' })], save)).toBe(false);
    expect(saveRowSeenIn([row({ id: 10, fire: 'n0930' })], save)).toBe(false);
    expect(saveRowSeenIn([row({ id: 10, market: 'K' })], save)).toBe(false);
    expect(saveRowSeenIn([row({ id: 10, after_us: [-350, -345] })], save)).toBe(false);
    // 결과와 무관 — server 가 처리를 마쳤다는 신호다(timeout · failed 행도 증거).
    expect(saveRowSeenIn([row({ id: 10, outcome: 'timeout' })], save)).toBe(true);
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

  it('planEditWithDraft — 칩 원문(숫자만 = 정각 앞 · + = 정각 뒤) · 검증 통과일 때만 valid 를 바꾼다(S9)', () => {
    const e0 = planEditOf('KB120', 'Q', 'q16', [-350, -345, -325]);
    expect(e0.draft).toEqual(['350', '345', '325']);
    const e1 = planEditWithDraft(e0, ['350', '340', '325']);
    expect(e1.valid).toEqual([-350, -340, -325]);
    const e2 = planEditWithDraft(e1, ['350', '3500', '325']);
    expect(e2.draft).toEqual(['350', '3500', '325']);
    expect(e2.valid).toEqual([-350, -340, -325]);
    // 순서가 뒤섞인 초안 — 칸은 입력 그대로 · valid(저장 · 지도 선)는 이른 시각부터 정렬(fast-261125)
    const e3 = planEditWithDraft(e2, ['325', '345', '400']);
    expect(e3.draft).toEqual(['325', '345', '400']);
    expect(e3.valid).toEqual([-400, -345, -325]);
    // + = 정각 뒤 · 0 은 「0」
    expect(planEditOf('KB120', 'Q', 'q16', [-10, 0, 20]).draft).toEqual(['10', '0', '+20']);
    expect(planEditWithDraft(e3, ['10', '0', '+20']).valid).toEqual([-10, 0, 20]);
  });

  it('planDraftCheck — 칩으로 못 읽는 칸(빈 칸 · 「+」 만)은 숫자 문구 · 범위 · 폭은 shared 문구 그대로', () => {
    expect(planDraftCheck('q16', ['+'])).toMatchObject({ ok: false, kind: 'int', badIdx: 0, message: '조각 시각은 숫자만 써요 — 정각 뒤는 앞에 + (1번)' });
    expect(planDraftCheck('n0930', ['350', ''])).toMatchObject({ ok: false, kind: 'count' });
    expect(planDraftCheck('n0930', [''])).toMatchObject({ ok: false, kind: 'int', message: '발사 시각은 숫자만 써요 — 정각 뒤는 앞에 + (1번)' });
    expect(planDraftCheck('q16', ['3500'])).toMatchObject({ ok: false, kind: 'range', message: '조각 시각은 \u22123000 ~ 1000µs 사이여야 해요' });
    expect(planDraftCheck('q16', ['345', '+0'])).toEqual({ ok: true, values: [-345, 0] });
    // 부호 있는 원문(「-5」)은 칩이 아니다 — 정수 위반(−5 로 통과시키지 않는다)
    expect(planDraftCheck('q16', ['-5'])).toMatchObject({ ok: false, kind: 'int' });
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

// ─────────────────────────────────────────────────────────────────────────────
// quick-261125-lju — 탐침(정각 기준 시장별 목록) 표기 · 상태 보존 · ⇄
// ─────────────────────────────────────────────────────────────────────────────

let tpId = 100;
/** 목록 행 기본 — KB120 · q16 · K · [−210] → [−220, −210]. */
function tpRow(over: Partial<LaunchTailProbeChangeRow>): LaunchTailProbeChangeRow {
  return {
    id: tpId++,
    at: '2026-11-07T06:00:00Z',
    admin_email: 'a@b.c',
    gateway: 'KB120',
    fire: 'q16',
    market: 'K',
    before_count: null,
    before_step_us: null,
    after_count: null,
    after_step_us: null,
    before_offsets_us: [-210],
    after_offsets_us: [-220, -210],
    outcome: 'ok',
    code: null,
    message: null,
    plan_rev: 8,
    ...over,
  };
}

/** 옛 개수 · 간격 행 — market null · 목록 칸 null. */
function tpLegacyRow(over: Partial<LaunchTailProbeChangeRow>): LaunchTailProbeChangeRow {
  return tpRow({
    market: null,
    before_offsets_us: null,
    after_offsets_us: null,
    before_count: 3,
    before_step_us: 10,
    after_count: 5,
    after_step_us: 10,
    ...over,
  });
}

describe('탐침 표기(quick-261125-lju)', () => {
  it('tailProbeSummaryParts — [−210, −200] → 「2발」 + 묶음 · [−270, −270, −200] → −270×2 · [] → 꺼짐 + 「 · 0발」', () => {
    expect(tailProbeSummaryParts([-210, -200])).toEqual({
      strong: '2발',
      groups: [
        { us: -210, n: 1 },
        { us: -200, n: 1 },
      ],
      rest: '',
    });
    expect(tailProbeSummaryParts([-200, -270, -270]).groups).toEqual([
      { us: -270, n: 2 },
      { us: -200, n: 1 },
    ]);
    expect(tailProbeSummaryParts([])).toEqual({ strong: '꺼짐', groups: [], rest: ' · 0발' });
  });

  it('tailProbeSummaryText — 「5발 · −210 · −200 · −190 · −180 · −170µs」 · 「3발 · −270×2 · −200µs」 · 「꺼짐 · 0발」 · 정각 뒤 +', () => {
    expect(tailProbeSummaryText([-210, -200, -190, -180, -170])).toBe(`5발 · ${M}210 · ${M}200 · ${M}190 · ${M}180 · ${M}170µs`);
    expect(tailProbeSummaryText([-270, -270, -200])).toBe(`3발 · ${M}270×2 · ${M}200µs`);
    expect(tailProbeSummaryText([])).toBe('꺼짐 · 0발');
    expect(tailProbeSummaryText([30, 0, -10])).toBe(`3발 · ${M}10 · 0 · +30µs`);
    expect(tailProbeGroupText({ us: -1500, n: 3 })).toBe(`${M}1,500×3`);
  });

  it('tailProbeLegacyText — 「뒤탐침 5발 10µs 간격」 · step 0 「뒤탐침 5발」 · count 0 「뒤탐침 꺼짐」', () => {
    expect(tailProbeLegacyText({ count: 5, step_us: 10 })).toBe('뒤탐침 5발 10µs 간격');
    expect(tailProbeLegacyText({ count: 5, step_us: 0 })).toBe('뒤탐침 5발');
    expect(tailProbeLegacyText({ count: 0, step_us: 10 })).toBe('뒤탐침 꺼짐');
  });

  it('tailProbeChangeText — 목록 행 · before null · 옛 행', () => {
    expect(tailProbeChangeText(tpRow({ before_offsets_us: [-210], after_offsets_us: [] }))).toBe(`1발 ${M}210µs → 꺼짐`);
    expect(tailProbeChangeText(tpRow({ before_offsets_us: null, after_offsets_us: [-270, -270, -200] }))).toBe(
      `— → 3발 ${M}270×2 · ${M}200µs`,
    );
    expect(tailProbeChangeText(tpLegacyRow({}))).toBe('뒤탐침 3발 10µs 간격 → 뒤탐침 5발 10µs 간격');
    expect(tailProbeChangeText(tpLegacyRow({ before_count: null, before_step_us: null }))).toBe('— → 뒤탐침 5발 10µs 간격');
    // 구 server 응답 — 목록 칸 키 자체가 없다(undefined) → 옛 행으로 읽는다(배포 순서 무관 · 터지지 않음)
    const bare = tpLegacyRow({}) as unknown as Record<string, unknown>;
    delete bare.market;
    delete bare.before_offsets_us;
    delete bare.after_offsets_us;
    expect(tailProbeChangeText(bare as unknown as LaunchTailProbeChangeRow)).toBe('뒤탐침 3발 10µs 간격 → 뒤탐침 5발 10µs 간격');
  });

  it('문구 상수 원문', () => {
    expect(TAIL_PROBE_UNSUPPORTED_TEXT).toBe('이 서버 버전은 시장별 탐침을 몰라요 — gh-trade 업데이트 뒤 바꿀 수 있어요');
    expect(TAIL_PROBE_UNKNOWN_TEXT).toBe('탐침 값을 읽지 못했어요');
  });

  it('tailProbeChangesOf — 그 서버 · 발사 · 시장(+ 옛 행 market null)만 · at 내림차순 · ready 아니면 · 키 없으면 []', () => {
    const a = tpRow({ at: '2026-11-07T05:00:00Z' });
    const b = tpRow({ at: '2026-11-07T06:00:00Z' });
    const c = tpRow({ at: '2026-11-07T06:00:00Z' });
    const q = tpRow({ market: 'Q' });
    const legacy = tpLegacyRow({ at: '2026-11-01T06:00:00Z' });
    const other = tpRow({ fire: 'n0930' });
    const ky = tpRow({ gateway: 'KYOBO119' });
    const st = {
      kind: 'ready' as const,
      resp: { servers: {}, changes: [], tail_probe_changes: [a, other, q, b, legacy, ky, c] },
    };
    expect(tailProbeChangesOf(st, 'KB120', 'q16', 'K').map((r) => r.id)).toEqual([c.id, b.id, a.id, legacy.id]);
    expect(tailProbeChangesOf(st, 'KB120', 'q16', 'Q').map((r) => r.id)).toEqual([q.id, legacy.id]);
    expect(tailProbeChangesOf(st, 'KB120', 'n0930', 'K')).toEqual([other]);
    // 구 server 이력 행 — market 키 없음(undefined) → 옛 행으로 두 시장 모두에 보인다
    const bareRow = tpLegacyRow({ at: '2026-10-01T06:00:00Z' }) as unknown as Record<string, unknown>;
    delete bareRow.market;
    const bare = bareRow as unknown as LaunchTailProbeChangeRow;
    const st2 = { kind: 'ready' as const, resp: { servers: {}, changes: [], tail_probe_changes: [bare] } };
    expect(tailProbeChangesOf(st2, 'KB120', 'q16', 'K')).toEqual([bare]);
    expect(tailProbeChangesOf(st2, 'KB120', 'q16', 'Q')).toEqual([bare]);
    expect(tailProbeChangesOf({ kind: 'loading' }, 'KB120', 'q16', 'K')).toEqual([]);
    expect(tailProbeChangesOf({ kind: 'ready', resp: { servers: {}, changes: [] } }, 'KB120', 'q16', 'K')).toEqual([]);
  });

  it('tailProbeAddChipOf — 가장 늦은 유효 칩 + 10 · 유효 칩 없으면 계획 마지막 + 10 · 상한에서 멈춤', () => {
    expect(tailProbeAddChipOf('q16', ['210', 'x'], [-260, -220])).toBe('200');
    expect(tailProbeAddChipOf('q16', ['x'], [-260, -220])).toBe('210');
    expect(tailProbeAddChipOf('q16', [], [-260, -220])).toBe('210');
    expect(tailProbeAddChipOf('q16', ['+995'], [])).toBe('+1000');
    expect(tailProbeAddChipOf('q16', ['+1000'], [])).toBe('+1000');
    expect(tailProbeAddChipOf('q16', ['4000', '300'], [])).toBe('290');
    expect(tailProbeAddChipOf('n0930', ['+1995'], [-40])).toBe('+2000');
    expect(tailProbeAddChipOf('q16', ['5'], [])).toBe('+5');
  });

  it('planStateWithSave — tail_probe_changes 등 나머지 키를 보존한다', () => {
    const t = tpRow({});
    const s0 = { kind: 'ready' as const, resp: { servers: { KB120: OK_KB }, changes: [], tail_probe_changes: [t] } };
    const s1 = planStateWithSave(s0, 'KB120', { plan: null, change: row({ id: 50 }) });
    expect(s1.kind === 'ready' && s1.resp.tail_probe_changes).toEqual([t]);
  });

  it('planStateWithReload — tail_probe_changes 를 id 로 합친다(지운 행 없음) · 구 server 응답(키 없음)도 그대로 유지', () => {
    const mine = tpRow({});
    const shared = tpRow({});
    const added = tpRow({});
    const s0 = { kind: 'ready' as const, resp: { servers: { KB120: OK_KB }, changes: [], tail_probe_changes: [mine, shared] } };
    const s1 = planStateWithReload(s0, { servers: {}, changes: [], tail_probe_changes: [added, shared] }, new Set());
    expect(s1.kind === 'ready' && s1.resp.tail_probe_changes?.map((r) => r.id)).toEqual([mine.id, shared.id, added.id]);
    const s2 = planStateWithReload(s0, { servers: {}, changes: [] }, new Set());
    expect(s2.kind === 'ready' && s2.resp.tail_probe_changes).toEqual([mine, shared]);
  });
});

describe('탐침 편집 · 저장 반영(quick-261125-lju)', () => {
  const FOUR = [
    { profile: 'Q16' as const, count: 2, step_us: 0, market: 'K' as const, offsets_us: [-210, -200] },
    { profile: 'N' as const, count: 0, step_us: 0, market: 'K' as const, offsets_us: [] },
    { profile: 'Q16' as const, count: 1, step_us: 0, market: 'Q' as const, offsets_us: [-300] },
    { profile: 'N' as const, count: 0, step_us: 0, market: 'Q' as const, offsets_us: [] },
  ];
  const TP_KB: LaunchPlanServer = { ...OK_KB, tail_probes: FOUR };

  it('tailProbeEditOf — 서버 값 정렬 · 칩 원문(− 기본 · + 정각 뒤) · valid 복사', () => {
    const e0 = tailProbeEditOf('KB120', 'q16', 'Q', [30, -210, 0]);
    expect(e0).toEqual({ gateway: 'KB120', fire: 'q16', market: 'Q', base: [-210, 0, 30], draft: ['210', '0', '+30'], valid: [-210, 0, 30] });
  });

  it('tailProbeEditWithDraft — 유효면 valid = 정렬 값 · 위반이면 valid 유지 · 칩 자리는 그대로', () => {
    const e0 = tailProbeEditOf('KB120', 'q16', 'K', [-210, -200]);
    const e1 = tailProbeEditWithDraft(e0, ['+30', '210']);
    expect(e1).toMatchObject({ draft: ['+30', '210'], valid: [-210, 30] });
    const e2 = tailProbeEditWithDraft(e1, ['+30', '4000']);
    expect(e2).toMatchObject({ draft: ['+30', '4000'], valid: [-210, 30] });
    expect(tailProbeEditWithDraft(e1, []).valid).toEqual([]);
  });

  it('tailProbeSaveMarketOf — 교보 N 공통 = K · 그 밖 = 패널 시장', () => {
    expect(tailProbeSaveMarketOf('KYOBO119', 'n0930', 'Q')).toBe('K');
    expect(tailProbeSaveMarketOf('KYOBO119', 'q16', 'Q')).toBe('Q');
    expect(tailProbeSaveMarketOf('KB120', 'n0930', 'Q')).toBe('Q');
  });

  it('tailProbeStateWithSave — plan 으로 그 서버 교체 · change 는 tail_probe_changes 맨 앞 · 계획 이력은 그대로', () => {
    const t0 = tpRow({});
    const pc = row({});
    const s0 = { kind: 'ready' as const, resp: { servers: { KB120: TP_KB }, changes: [pc], tail_probe_changes: [t0] } };
    const next: LaunchPlanServer = { ...TP_KB, plan_rev: 9 };
    const t1 = tpRow({});
    const s1 = tailProbeStateWithSave(s0, 'KB120', { plan: next, change: t1 });
    expect(s1.kind === 'ready' && s1.resp.servers.KB120).toBe(next);
    expect(s1.kind === 'ready' && s1.resp.tail_probe_changes?.map((r) => r.id)).toEqual([t1.id, t0.id]);
    expect(s1.kind === 'ready' && s1.resp.changes).toEqual([pc]);
    expect(tailProbeStateWithSave(s0, 'KB120', { plan: null, change: null })).toEqual(s0);
    expect(tailProbeStateWithSave({ kind: 'error' }, 'KB120', { plan: next, change: t1 })).toEqual({ kind: 'error' });
  });

  it('tailProbeStateWithSent — 그 (profile, market) 행만 · 공통이면 K · Q 두 행 · 없으면 덧붙임 · 서버 non-ok 면 그대로', () => {
    const s0 = {
      kind: 'ready' as const,
      resp: { servers: { KB120: TP_KB, KYOBO119: OK_KB, KYOBO112: { status: 'offline' as const } }, changes: [] },
    };
    const s1 = tailProbeStateWithSent(s0, 'KB120', 'q16', ['Q'], [-320, -310]);
    const rows1 = s1.kind === 'ready' && s1.resp.servers.KB120?.status === 'ok' ? s1.resp.servers.KB120.tail_probes : null;
    expect(rows1).toEqual([
      FOUR[0],
      FOUR[1],
      { profile: 'Q16', count: 2, step_us: 0, market: 'Q', offsets_us: [-320, -310] },
      FOUR[3],
    ]);
    const s2 = tailProbeStateWithSent(s0, 'KYOBO119', 'n0930', ['K', 'Q'], [-30]);
    expect(s2.kind === 'ready' && s2.resp.servers.KYOBO119?.status === 'ok' && s2.resp.servers.KYOBO119.tail_probes).toEqual([
      { profile: 'N', count: 1, step_us: 0, market: 'K', offsets_us: [-30] },
      { profile: 'N', count: 1, step_us: 0, market: 'Q', offsets_us: [-30] },
    ]);
    expect(tailProbeStateWithSent(s0, 'KYOBO112', 'q16', ['K'], [-1])).toBe(s0);
  });

  it('maxTailProbeChangeIdOf · tailProbeSaveRowSeenIn — 같은 (서버, 발사, 시장) · 같은 목록 · afterId 보다 새 행만', () => {
    const a = tpRow({ id: 40 });
    const b = tpRow({ id: 41 });
    expect(maxTailProbeChangeIdOf({ kind: 'ready', resp: { servers: {}, changes: [], tail_probe_changes: [b, a] } })).toBe(41);
    expect(maxTailProbeChangeIdOf({ kind: 'loading' })).toBe(0);
    const save = { gateway: 'KB120', fire: 'q16' as const, market: 'K' as const, offsets: [-220, -210], afterId: 41 };
    expect(tailProbeSaveRowSeenIn([tpRow({ id: 42 })], save)).toBe(true);
    expect(tailProbeSaveRowSeenIn([tpRow({ id: 41 })], save)).toBe(false);
    expect(tailProbeSaveRowSeenIn([tpRow({ id: 42, fire: 'n0930' })], save)).toBe(false);
    expect(tailProbeSaveRowSeenIn([tpRow({ id: 42, market: 'Q' })], save)).toBe(false);
    expect(tailProbeSaveRowSeenIn([tpRow({ id: 42, after_offsets_us: [-220] })], save)).toBe(false);
    expect(tailProbeSaveRowSeenIn([tpLegacyRow({ id: 42 })], save)).toBe(false);
  });
});

describe('⇄ 다른 시장과 한 번에 쏨(quick-261125-lju · kyobo_q16_combined true 일 때만)', () => {
  const KY: LaunchPlanServer = {
    status: 'ok',
    plan_rev: 3,
    updated_at: null,
    entries: [
      { profile: 'Q16', market: 'K', offsets_us: [-350, -340] },
      { profile: 'Q16', market: 'Q', offsets_us: [-345, -335] },
    ],
  };

  it('tailProbeCombinedOn — 교보 · q16 · true 만 참 · false · 칸 없음 · n0930 · non-ok · KB(true 여도) 는 거짓', () => {
    expect(tailProbeCombinedOn({ ...KY, kyobo_q16_combined: true }, 'KYOBO119', 'q16')).toBe(true);
    expect(tailProbeCombinedOn({ ...KY, kyobo_q16_combined: true }, 'KYOBO112', 'q16')).toBe(true);
    expect(tailProbeCombinedOn({ ...KY, kyobo_q16_combined: false }, 'KYOBO119', 'q16')).toBe(false);
    expect(tailProbeCombinedOn(KY, 'KYOBO119', 'q16')).toBe(false);
    expect(tailProbeCombinedOn({ ...KY, kyobo_q16_combined: true }, 'KYOBO119', 'n0930')).toBe(false);
    expect(tailProbeCombinedOn({ ...KY, kyobo_q16_combined: true }, 'KB120', 'q16')).toBe(false);
    expect(tailProbeCombinedOn({ status: 'offline' }, 'KYOBO119', 'q16')).toBe(false);
    expect(tailProbeCombinedOn(undefined, 'KYOBO119', 'q16')).toBe(false);
  });

  it('tailProbeCombinedSetOf — 다른 시장 계획 조각 + 다른 시장 보이는 탐침', () => {
    expect([...tailProbeCombinedSetOf(KY, 'q16', 'K', [-300])].sort((a, b) => a - b)).toEqual([-345, -335, -300]);
    expect([...tailProbeCombinedSetOf(KY, 'q16', 'Q', [])].sort((a, b) => a - b)).toEqual([-350, -340]);
  });

  it('tailProbeCombinedTitleOf — 코스피 패널 → 「코스닥과 …」 · 코스닥 패널 → 「코스피와 …」', () => {
    expect(tailProbeCombinedTitleOf('K')).toBe('코스닥과 같은 시각 — 한 번에 쏨');
    expect(tailProbeCombinedTitleOf('Q')).toBe('코스피와 같은 시각 — 한 번에 쏨');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// quick-261125-c2i — 08:30 G2 계획 칸 · 「이 서버는 08:30 발사를 모름」
// ─────────────────────────────────────────────────────────────────────────────

describe('08:30 G2 계획(quick-261125-c2i)', () => {
  const FOUR: LaunchPlanServer = {
    status: 'ok',
    plan_rev: 1,
    updated_at: null,
    entries: [
      { profile: 'Q16', market: 'K', offsets_us: [-200, -190, -170] },
      { profile: 'Q16', market: 'Q', offsets_us: [-200, -190, -170] },
      { profile: 'N', market: 'K', offsets_us: [-245] },
      { profile: 'N', market: 'Q', offsets_us: [-245] },
    ],
  };
  // 인박스 261125-sigan-ttaeng-g2 ⓑ 켬 예시 — 말미 G2/K [12000] · G2/Q [0].
  const SIX: LaunchPlanServer = {
    ...FOUR,
    entries: [
      ...(FOUR.status === 'ok' ? FOUR.entries : []),
      { profile: 'G2', market: 'K', offsets_us: [12000] },
      { profile: 'G2', market: 'Q', offsets_us: [0] },
    ],
  };
  const G2_HEADS: LaunchHeadRow[] = [
    { ...head('KB120', 'K', 9000), profile: 'G2', fire_exchange: 'KRX', fire_base: '08:30:00' },
  ];

  it('문구 = 인박스 ⓑ 그대로', () => {
    expect(LAUNCH_PLAN_G2_UNKNOWN).toBe('이 서버는 08:30 발사를 모름');
  });

  it('서버 ok 4행(G2 행 없음) → unsupported · lines [] · entry null(대신 값으로 빠지지 않는다)', () => {
    const p = panelPlanOf(ready({ KB120: FOUR }), G2_HEADS, 'KB120', 'K', 'g0830');
    expect(p).toMatchObject({ source: 'unsupported', lines: [], entry: null });
  });

  it('서버 ok 6행 → server · lines [12000]', () => {
    const p = panelPlanOf(ready({ KB120: SIX }), G2_HEADS, 'KB120', 'K', 'g0830');
    expect(p).toMatchObject({ source: 'server', lines: [12000], entry: { profile: 'G2', market: 'K', offsets_us: [12000] } });
  });

  it('서버 offline · 조회 실패 → fallback(종전 · G2 머리 대신 값)', () => {
    expect(panelPlanOf(ready({ KB120: { status: 'offline' } }), G2_HEADS, 'KB120', 'K', 'g0830')).toMatchObject({
      source: 'fallback',
      lines: [9000],
    });
    expect(panelPlanOf({ kind: 'error' }, G2_HEADS, 'KB120', 'K', 'g0830').source).toBe('fallback');
  });

  it('q16 · n0930 은 ok 인데 칸이 없어도 여전히 fallback', () => {
    const empty: LaunchPlanServer = { ...FOUR, entries: [] };
    expect(panelPlanOf(ready({ KB120: empty }), HEADS, 'KB120', 'Q', 'q16').source).toBe('fallback');
    expect(panelPlanOf(ready({ KB120: empty }), HEADS, 'KB120', 'Q', 'n0930').source).toBe('fallback');
  });

  it('planLineText(g0830) — 한 값(조각 수 접두 없음)', () => {
    expect(planLineText({ offsets_us: [12000] }, 'g0830')).toBe('+12,000µs');
    expect(planLineText({ offsets_us: [-2500] }, 'g0830')).toBe(`${M}2,500µs`);
  });

  it('planSaveMarketsOf — G2 는 그 패널 시장 하나(교보도 K 를 같이 보내지 않는다 · 인박스 ⓐ)', () => {
    expect(planSaveMarketsOf('KYOBO119', 'g0830', 'Q')).toEqual(['Q']);
    expect(planSaveMarketsOf('KB120', 'g0830', 'K')).toEqual(['K']);
    expect(planSaveMarketsOf('KYOBO119', 'n0930', 'Q')).toEqual(['K', 'Q']);
  });

  it('저장 ok 결과 줄 — 「다음 08:30 발사부터」', () => {
    const v = saveResultViewOf({ server: 'KB120', outcome: 'ok' }, 'g0830', new Date('2026-11-25T00:00:00Z'));
    expect(v.line.text).toBe('저장됨 · 09:00 · 다음 08:30 발사부터');
  });

  it('편집 검증 — 한도 −3000 ~ 20000 · 한 값', () => {
    const e = planEditOf('KB120', 'K', 'g0830', [0]);
    expect(planEditWithDraft(e, ['+20000']).valid).toEqual([20000]);
    expect(planEditWithDraft(e, ['+20001']).valid).toEqual([0]);
    expect(planEditWithDraft(e, ['1', '2']).valid).toEqual([0]);
  });
});
