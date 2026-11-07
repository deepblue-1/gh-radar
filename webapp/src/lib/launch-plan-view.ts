/**
 * launch-plan-view — 경계 지도 패널의 「다음 발사 계획」 모델 · 표기 (Phase 35 범위 7 · D-24 · D-25 · D-29 · D-35).
 *
 * 화면 정본 = 채택 목업 `reference/mockup-launch-plan-place.html`(자리 B — 패널 머리 아래 「다음 발사 계획」 줄).
 * 순수 함수만 둔다(React 없음).
 *
 * 계획 상태 4가지(지도 탭이 `GET /api/admin/launch/plan` 을 탭 진입 때 1번 부른 결과):
 * - `ready`  — 응답이 왔다. 그 서버가 ok 이고 칸이 있으면 **서버 계획**(조각마다 점선), 아니면 **대신 값**.
 * - `error`  — 5xx · 네트워크 · 타임아웃(Pitfall S11). 모든 패널이 **대신 값**.
 * - `loading` — 아직 묻는 중. 점선은 대신 값으로 먼저 그리고 줄은 스켈레톤.
 * - `absent` — 404(gh-radar server 가 라우트를 모름 = 배포 전 · D-35). 계획 기능을 숨긴다 — 줄 · 이력 없음 ·
 *   점선은 최신 머리 값(35-08 그대로).
 *
 * 대신 값 = 최신 머리 `next_offset_us`(`mapNextOffsetOf`) 하나뿐이다 — 머리에 조각 목록이 없어 Q16 도 첫 조각 1개.
 * 계획 줄 · 점선 값을 상수로 박지 않는다(서버 계획 또는 머리 값에서만 온다).
 */

import {
  launchPlanEntryOf,
  launchPlanProfileOf,
  validateLaunchPlanDraft,
  validateLaunchTailProbeDraft,
  type AdminServerResult,
  type LaunchFire,
  type LaunchHeadRow,
  type LaunchMarket,
  type LaunchPlanChangeRow,
  type LaunchPlanEntry,
  type LaunchPlanResponse,
  type LaunchPlanSaveResponse,
  type LaunchRibbonCell,
  type LaunchTailProbe,
  type LaunchTailProbeChangeRow,
  type LaunchTailProbeSaveResponse,
  type LaunchTailProbeValue,
} from '@gh-radar/shared';

import { DASH, fmtUs } from './launch-format';
import { mapNextOffsetOf } from './launch-map';

/** 지도 탭의 계획 조회 상태. */
export type LaunchPlanState =
  | { kind: 'loading' }
  | { kind: 'absent' }
  | { kind: 'error' }
  | { kind: 'ready'; resp: LaunchPlanResponse };

/** 패널 하나의 계획 모델 — `lines` 가 지도 점선(µs · 0번 = 첫 조각)이다. */
export interface PanelPlan {
  source: 'server' | 'fallback' | 'loading' | 'absent';
  /** 점선으로 그릴 값 — server = 계획 조각 전부 · 그 밖 = 대신 값 1개(없으면 빈 배열). */
  lines: number[];
  /** 서버 계획 칸(source server 일 때만). */
  entry: LaunchPlanEntry | null;
  /** 최신 머리 next_offset_us(대신 값) — 없으면 null. */
  fallbackUs: number | null;
  /** 이 (서버, 발사, 시장)의 마지막 성공 변경 — 없으면 null. */
  lastChange: LaunchPlanChangeRow | null;
  /** 이 (서버, 발사, 시장)의 이력 — at 내림차순. */
  changes: LaunchPlanChangeRow[];
}

const byAtDesc = (a: LaunchPlanChangeRow, b: LaunchPlanChangeRow): number =>
  a.at < b.at ? 1 : a.at > b.at ? -1 : b.id - a.id;

/** 상태 · 머리 → 패널 계획 모델(D-25 · Pitfall S11). */
export function panelPlanOf(
  state: LaunchPlanState,
  heads: readonly LaunchHeadRow[],
  gateway: string,
  market: string,
  fire: LaunchFire,
): PanelPlan {
  const fallbackUs = mapNextOffsetOf(heads, gateway, market, fire);
  const fallbackLines = fallbackUs === null ? [] : [fallbackUs];

  if (state.kind !== 'ready') {
    const source = state.kind === 'error' ? 'fallback' : state.kind;
    return { source, lines: fallbackLines, entry: null, fallbackUs, lastChange: null, changes: [] };
  }

  const changes = state.resp.changes
    .filter((c) => c.gateway === gateway && c.fire === fire && c.market === market)
    .sort(byAtDesc);
  const lastChange = changes.find((c) => c.outcome === 'ok') ?? null;
  const entry = launchPlanEntryOf(state.resp.servers[gateway], fire, market as LaunchMarket);

  if (entry !== null) {
    return { source: 'server', lines: [...entry.offsets_us], entry, fallbackUs, lastChange, changes };
  }
  return { source: 'fallback', lines: fallbackLines, entry: null, fallbackUs, lastChange, changes };
}

/** 계획 줄 값 — q16 「3조각 −350 · −345 · −325µs」 · n0930 「−245µs」. */
export function planLineText(entry: Pick<LaunchPlanEntry, 'offsets_us'>, fire: LaunchFire): string {
  const xs = entry.offsets_us;
  if (fire === 'n0930') return `${fmtUs(xs[0])}µs`;
  return `${xs.length}조각 ${xs.map((v) => fmtUs(v)).join(' · ')}µs`;
}

/** 패널 「변경 이력」 접힘 안 최대 행 수(D-29). */
export const LAUNCH_PLAN_HISTORY_MAX = 10;

/** 대신 값 줄(D-25 · Pitfall S11) — 「서버 연결 안 됨 · 마지막 발사 값 −337µs」 · 값 없으면 「—」. */
export function fallbackLineText(us: number | null): string {
  return `서버 연결 안 됨 · 마지막 발사 값 ${us === null ? DASH : `${fmtUs(us)}µs`}`;
}

const KST_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function kstPartsOf(d: Date): { ymd: string; md: string; hm: string } {
  const p = Object.fromEntries(KST_PARTS.formatToParts(d).map((x) => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, md: `${p.month}/${p.day}`, hm: `${p.hour}:${p.minute}` };
}

/** 이력 행 시각(KST · 24시간) — `now` 와 같은 KST 날이면 「HH:MM」, 아니면 「MM/DD HH:MM」. */
export function changeAtText(at: string, now: Date): string {
  const t = kstPartsOf(new Date(at));
  return t.ymd === kstPartsOf(now).ymd ? t.hm : `${t.md} ${t.hm}`;
}

/** 마지막 변경 — 「22:41 · a@b.c」 · 오늘(KST)이 아니면 「10/27 22:41 · a@b.c」. */
export function lastChangeText(row: Pick<LaunchPlanChangeRow, 'at' | 'admin_email'>, now: Date): string {
  return `${changeAtText(row.at, now)} · ${row.admin_email}`;
}

const usList = (xs: readonly number[]): string => xs.map((v) => fmtUs(v)).join(' · ');

/** 전 → 후 — 「−350 · −345 · −325 → −340 · −335 · −322」 · 전이 null 이면 「— → …」. */
export function changeValuesText(before: readonly number[] | null, after: readonly number[]): string {
  return `${before === null ? DASH : usList(before)} → ${usList(after)}`;
}

export type ChangeOutcomeTone = 'ok' | 'warn' | 'err';

export interface ChangeOutcomeView {
  tone: ChangeOutcomeTone;
  text: string;
  /** 상세 — failed 서버 거부 원문 · offline 사유(35 R3-IN-02). 그 밖엔 없음. */
  title?: string;
}

/**
 * 이력 결과 알약 — ok 저장됨 · failed 실패(title = message) · timeout 응답 없음 · offline 서버 연결 안 됨(title = message · relay 거부 ·
 * 연결 실패 원인 · 35 R3-IN-02) · skipped 꺼진 서버.
 */
export function changeOutcomeView(row: Pick<LaunchPlanChangeRow, 'outcome' | 'message'>): ChangeOutcomeView {
  switch (row.outcome) {
    case 'ok':
      return { tone: 'ok', text: '저장됨' };
    case 'failed':
      return row.message ? { tone: 'err', text: '실패', title: row.message } : { tone: 'err', text: '실패' };
    case 'timeout':
      return { tone: 'err', text: '응답 없음' };
    case 'offline':
      return row.message ? { tone: 'warn', text: '서버 연결 안 됨', title: row.message } : { tone: 'warn', text: '서버 연결 안 됨' };
    case 'skipped':
      return { tone: 'warn', text: '꺼진 서버' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 편집 · 저장(35-15 · D-26 · D-27 · Pitfall S6 · S9)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 열린 편집 칸 하나(한 번에 한 패널 · D-24). 상태는 지도 탭이 쥔다.
 * - `draft` = 칸마다 입력 원문 문자열(숫자로 바꾸지 않는다 — 「-」 만 친 칸도 그대로 둔다).
 * - `valid` = 마지막으로 검증을 통과한 값(Pitfall S9) — 오류 동안에도 미리보기 선 · 표는 이 값을 그린다.
 */
export interface LaunchPlanEdit {
  gateway: string;
  market: LaunchMarket;
  fire: LaunchFire;
  draft: string[];
  valid: number[];
}

/** 「계획 고치기」 — 서버 값으로 칸을 채운다. */
export function planEditOf(gateway: string, market: LaunchMarket, fire: LaunchFire, offsets: readonly number[]): LaunchPlanEdit {
  return { gateway, market, fire, draft: offsets.map(String), valid: [...offsets] };
}

/** 입력 하나 반영 — 검증이 통과할 때만 `valid` 를 바꾼다(S9 · 검증은 shared 한 벌). */
export function planEditWithDraft(edit: LaunchPlanEdit, draft: string[]): LaunchPlanEdit {
  const check = validateLaunchPlanDraft(edit.fire, draft);
  return { ...edit, draft, valid: check.ok ? check.values : edit.valid };
}

/** 같은 µs 목록인가. */
export function sameOffsets(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * 저장 응답 → 계획 상태(Pitfall S6 — 응답 plan 이 있으면 재조회 없음 · 없을 때는 `planNeedsReload`). 응답 plan 이 있으면 그 서버 계획을 통째로 바꾸고(실패여도 relay 가 다시
 * 읽은 값이면 그것이 지금 값), change 가 있으면 이력 맨 앞에 넣는다(null = 기록 실패 · 늘리지 않는다). ready 가 아니면 그대로.
 */
export function planStateWithSave(
  state: LaunchPlanState,
  gateway: string,
  resp: Pick<LaunchPlanSaveResponse, 'plan' | 'change'>,
): LaunchPlanState {
  if (state.kind !== 'ready') return state;
  const servers = resp.plan === null ? state.resp.servers : { ...state.resp.servers, [gateway]: resp.plan };
  const changes = resp.change === null ? state.resp.changes : [resp.change, ...state.resp.changes];
  // 나머지 키(tail_probe_changes 등 · quick-261107-l7w)는 그대로 둔다 — 계획 저장이 뒤탐침 이력을 지우지 않게.
  return { kind: 'ready', resp: { ...state.resp, servers, changes } };
}

/**
 * 저장 응답 뒤 계획을 다시 읽어야 하나 — 응답 plan 이 없는데
 * - 결과를 모를 때(timeout · 35 CR-01): relay 가 op 8 을 보냈는지 모르니 서버 값을 다시 읽어 화면을 맞춘다.
 * - 저장 ok 일 때(35 WR-01): relay 가 마감 · 후 조회 실패로 새 값을 못 실었다(D-27 「성공 뒤 다시 조회」).
 * failed · offline · skipped 는 바뀐 것이 없어 읽지 않는다. 요청 자체가 실패(throw)한 경우는 지도 탭이 다시 읽는다(4xx 거부는
 * 확정 미반영이라 빼고 · 35 R2-IN-01 `rejectedSaveResultOf`).
 */
export function planNeedsReload(resp: Pick<LaunchPlanSaveResponse, 'result' | 'plan'>): boolean {
  return resp.plan === null && (resp.result.outcome === 'timeout' || resp.result.outcome === 'ok');
}

/**
 * 저장 ok · 응답 plan 없음(35 WR-01) — 그 서버 계획의 (fire, market) 칸만 보낸 값으로 바꾼다(code 0 = 그 값이 들어갔다).
 * 다시 읽기가 오기 전에도 점선 · 계획 줄 · 편집 칸 기준이 저장 전 값으로 남지 않게 한다. ready 가 아니거나 그 서버가 ok 가
 * 아니면 그대로(그 칸 기준이 없다).
 */
export function planStateWithSentEntry(
  state: LaunchPlanState,
  gateway: string,
  fire: LaunchFire,
  market: LaunchMarket,
  offsets: readonly number[],
): LaunchPlanState {
  if (state.kind !== 'ready') return state;
  const server = state.resp.servers[gateway];
  if (server === undefined || server.status !== 'ok') return state;
  const profile = launchPlanProfileOf(fire);
  const entry: LaunchPlanEntry = { profile, market, offsets_us: [...offsets] };
  const hit = (e: LaunchPlanEntry) => e.profile === profile && e.market === market;
  const entries = server.entries.some(hit) ? server.entries.map((e) => (hit(e) ? entry : e)) : [...server.entries, entry];
  return { kind: 'ready', resp: { ...state.resp, servers: { ...state.resp.servers, [gateway]: { ...server, entries } } } };
}

/**
 * 저장 뒤 다시 읽은 응답 → 계획 상태(35 R2-WR-01). 통째로 덮어쓰지 않는다:
 * - 서버 값은 `take` 에 든 서버만 바꾼다. 지도 탭이 「그 서버 status ok · 이 다시 읽기를 보낸 뒤 그 서버에 더 최신 값(저장 응답 ·
 *   더 늦게 보낸 다시 읽기)이 반영되지 않았음」 으로 고른다. 실패 모양(relay 실패 → 두 서버 offline 200 · timeout · failed)이나
 *   늦게 온 응답은 마지막으로 알던 계획 · 편집 칸 기준을 지우거나 되돌리지 않는다.
 * - 이력은 id 로 합친다(행은 바뀌지 않는다) — 늦게 온 응답이 그 뒤 저장 응답으로 넣은 행을 지우지 않는다. 순서는 `panelPlanOf` 가
 *   at 내림차순으로 맞춘다.
 * ready 가 아니면(지킬 마지막 값이 없다) 응답 그대로.
 */
export function planStateWithReload(
  state: LaunchPlanState,
  resp: LaunchPlanResponse,
  take: ReadonlySet<string>,
): LaunchPlanState {
  if (state.kind !== 'ready') return { kind: 'ready', resp };
  const servers = { ...state.resp.servers };
  for (const g of take) {
    const v = resp.servers[g];
    if (v !== undefined && v.status === 'ok') servers[g] = v;
  }
  const seen = new Set(state.resp.changes.map((c) => c.id));
  const changes = [...state.resp.changes, ...resp.changes.filter((c) => !seen.has(c.id))];
  // 뒤탐침 이력도 같은 규칙(id 로 합침 · quick-261107-l7w). 구 server 응답(키 없음)은 [] 로 읽는다.
  const tpMine = state.resp.tail_probe_changes ?? [];
  const tpSeen = new Set(tpMine.map((c) => c.id));
  const tail_probe_changes = [...tpMine, ...(resp.tail_probe_changes ?? []).filter((c) => !tpSeen.has(c.id))];
  return { kind: 'ready', resp: { ...state.resp, servers, changes, tail_probe_changes } };
}

/**
 * 결과를 모르는 저장 뒤 다시 읽기가 대상 서버에 대해 어떻게 끝났나(35 R3-WR-01) — 결과 줄이 「지금 보이는 계획이 다시 읽은
 * 값인가」 를 말하게 한다.
 * - `pending` — 다시 읽는 중.
 * - `ok` — 대상 서버 값을 다시 읽어 반영했다(`take` 에 듦).
 * - `superseded` — 대상 서버는 ok 로 왔지만 이 다시 읽기를 보낸 뒤 그 서버에 더 새 세대(그 뒤 저장 · 더 늦게 보낸 다시 읽기)가
 *   있어 버렸다. 더 새 세대는 값 없이 「바뀌었을 수 있음」 만 표시한 저장일 수도 있어 확인으로 치지 않는다.
 * - `failed` — 대상 서버 값을 못 가져왔다(그 서버 timeout · offline · failed · 응답에 없음 · 404 · 요청 실패). 보이는 값은
 *   마지막으로 알던 값 = 저장 전 값일 수 있다.
 * - `unproven` — 대상 서버 값을 반영했지만 그 값이 server 가 이 저장을 처리한 **뒤** 읽은 값인지 모른다(35 R3-IN-01). 저장
 *   요청이 throw 한 경로에서만 생긴다 — 요청이 server 에 닿아 아직 처리 중이면 다시 읽기의 조회가 저장보다 먼저 그 서버 FIFO 에
 *   들어가 저장 전 값을 받을 수 있다. 응답 이력에 이 저장의 행이 보이면(`saveRowSeenIn`) 처리가 끝났다는 뜻이라 `ok` 다.
 */
export type LaunchPlanReread = 'pending' | 'ok' | 'superseded' | 'failed' | 'unproven';

/**
 * 다시 읽은 응답 · 반영한 서버(`take`) → 대상 서버의 다시 읽기 결과(R3-WR-01). 요청 실패 · 404 는 지도 탭이 `failed` 로 둔다.
 * `ordered` = 이 다시 읽기가 저장 처리 뒤에 읽은 것이 확실한가(35 R3-IN-01) — 저장 응답을 받은 경로는 항상 참(server 가 relay
 * 저장을 마친 뒤 답한다), 요청 throw 경로는 `saveRowSeenIn` 결과. 거짓이면 반영했어도 `ok` 가 아니라 `unproven`.
 */
export function planRereadOf(
  resp: LaunchPlanResponse,
  gateway: string,
  take: ReadonlySet<string>,
  ordered = true,
): LaunchPlanReread {
  if (take.has(gateway)) return ordered ? 'ok' : 'unproven';
  return resp.servers[gateway]?.status === 'ok' ? 'superseded' : 'failed';
}

/** 계획 상태가 아는 이력 행 id 의 최댓값 — 없으면 0. 저장 직전에 재 두고 `saveRowSeenIn` 의 기준으로 쓴다(35 R3-IN-01). */
export function maxChangeIdOf(state: LaunchPlanState): number {
  if (state.kind !== 'ready') return 0;
  return state.resp.changes.reduce((m, c) => (c.id > m ? c.id : m), 0);
}

/**
 * 다시 읽은 이력에 이 저장의 행이 보이나(35 R3-IN-01) — 같은 (서버, 발사, 시장) · 같은 보낸 값 · 저장 직전에 알던 id(`afterId`)보다
 * 새 행. server 는 relay 저장이 끝난 뒤에 이력 행을 쓰고, `GET /plan` 은 relay 조회와 이력 읽기를 함께 보내므로 이 행이 보이면
 * 다시 읽기의 조회는 그 저장 처리 뒤에 나갔다. 같은 값을 그 사이 다시 보낸 다른 저장의 행이어도 보이는 값은 같다.
 * 이력 기록이 실패한 저장(change null)은 행이 없어 늘 거짓 — 「확인」 이라고 말하지 않는 쪽으로 틀린다.
 */
export function saveRowSeenIn(
  changes: readonly LaunchPlanChangeRow[],
  save: { gateway: string; fire: LaunchFire; market: LaunchMarket; offsets: readonly number[]; afterId: number },
): boolean {
  return changes.some(
    (c) =>
      c.id > save.afterId &&
      c.gateway === save.gateway &&
      c.fire === save.fire &&
      c.market === save.market &&
      sameOffsets(c.after_us, save.offsets),
  );
}

/**
 * 저장 요청을 server 가 4xx 로 거부했다(35 R2-IN-01) — 인증(401 세션 만료) · 인가(403) · 검증(400) 등은 relay 호출 · 이력 기록
 * **전에** 막혀 확정 미반영이다. 「반영됐는지 몰라요」(timeout)가 아니라 「실패」 로 보이고, 지도 탭은 다시 읽지 않는다.
 * 401 · 403 은 고정 문구, 그 밖은 「요청 거부(<status>) · <server 문구>」.
 */
export function rejectedSaveResultOf(gateway: string, status: number, message: string): AdminServerResult {
  const why =
    status === 401
      ? '로그인이 만료됐어요 — 다시 로그인한 뒤 저장하세요'
      : status === 403
        ? '권한이 없어요'
        : `요청 거부(${status})${message ? ` · ${message}` : ''}`;
  return { server: gateway, outcome: 'failed', message: why };
}

export type SaveTone = 'ok' | 'err' | 'warn';

/** 저장 결과 그림 — 칩(Admin 칩 한 벌 · title = 상세) + 결과 줄. */
export interface SaveResultView {
  chip: { tone: SaveTone; text: string; title: string | null };
  line: { tone: SaveTone; text: string };
}

const FIRE_CLOCK: Record<LaunchFire, string> = { q16: '16:00', n0930: '09:00:30' };

/**
 * timeout 결과 줄 꼬리 — 다시 읽기 결과별(35 R3-WR-01). 못 읽었거나(failed) 더 새 저장에 밀렸으면(superseded) 지금 보이는
 * 계획이 다시 읽은 값이 아니다 — 저장 전 값일 수 있음을 드러내고 새로고침을 권한다(탭 진입 때 계획을 새로 읽는다).
 * 다시 읽었어도 저장 처리 뒤에 읽었는지 모르면(unproven · 요청 throw 경로 · 35 R3-IN-01) 「확인」 이라고 말하지 않는다.
 */
export const TIMEOUT_REREAD_TAIL: Record<LaunchPlanReread, string> = {
  pending: '계획을 다시 읽는 중이에요',
  ok: '다시 읽은 계획으로 확인',
  superseded: '그 뒤 새 저장이 있어 다시 읽은 값을 쓰지 않았어요(보이는 값은 이 저장 결과가 아닐 수 있어요) · 잠시 뒤 새로고침',
  failed: '계획을 다시 읽지 못했어요(보이는 값은 저장 전 값일 수 있어요) · 잠시 뒤 새로고침',
  unproven: '다시 읽었지만 서버가 이 저장을 처리하기 전 값일 수 있어요 · 잠시 뒤 새로고침',
};

/**
 * gh-trade 86 code 1 고정 문구 중 「op 모름」(구 서버가 44 op 8 · 9 를 모름) — 바이트 그대로 대조한다.
 * 정본: 인박스 `261028-launch-plan-contract.md` ⓒ 86 표. 같은 code 1 의 나머지 고정 문구(대상 밖 · 조각 수 범위 밖 ·
 * N 은 시각 한 값 · 발사 시각 범위 밖 2종 · 같거나 커지는 순서 · fix 노트의 「시각 목록 폭 상한 밖(마지막 − 첫 ≤ 500µs)」)는
 * 새 서버의 입력 거부라 일반 실패 줄로 원문을 보인다.
 */
export const LAUNCH_PLAN_UNKNOWN_OP_MESSAGE = '알 수 없는 명령입니다';

/**
 * 저장 결과(D-27) — 분기는 outcome · code 로 하고, code 1 만 「op 모름」 고정 문구 하나를 바이트 대조한다
 * (`LAUNCH_PLAN_UNKNOWN_OP_MESSAGE`). 서버 message 는 원문 그대로 싣는다.
 *
 * | outcome | 칩 | 줄 |
 * |---|---|---|
 * | ok | 「KB120」 | 「저장됨 · HH:MM(KST) · 다음 16:00 발사부터」(09:00:30 은 「다음 09:00:30 발사부터」) |
 * | failed · code 1 · 「알 수 없는 명령입니다」 | 「KB120 · 실패」 title 「서버 미지원 · <message>」 | 「KB120 실패: 서버 미지원 · <message> — 서버 업데이트 뒤 다시 저장」 |
 * | failed(그 밖 — code 1 입력 거부 고정 문구 · 10 · 11 …) | 「KB120 · 실패」 title message | 「KB120 실패: <message · 없으면 실패>」 |
 * | timeout · 요청 실패(타임아웃 · 네트워크 · 5xx) | 「KB120 · 응답 없음」 title message | 「KB120 응답 없음: 반영됐는지 몰라요 — <다시 읽기 꼬리>」(`TIMEOUT_REREAD_TAIL`) |
 * | 요청 4xx 거부(`rejectedSaveResultOf` — failed) | 「KB120 · 실패」 title 문구 | 「KB120 실패: 로그인이 만료됐어요 — …」 · 「KB120 실패: 요청 거부(400) · …」 |
 * | offline | 「KB120 · 서버 연결 안 됨」 title message | 「KB120 미반영: <message · 없으면 서버 연결 안 됨>」 |
 *
 * timeout = 요청은 나갔는데 응답을 못 받음(결과 모름 · 35 CR-01) — 반영됐을 수 있어 「실패」 · 「미반영」 으로 단정하지 않는다
 * (지도 탭이 계획을 다시 읽는다). 줄 꼬리는 그 다시 읽기가 대상 서버를 어떻게 끝냈는지(`reread` · 35 R3-WR-01) — 「다시 읽은
 * 계획으로 확인」 은 대상 서버 값을 실제로 다시 읽어 반영했을 때(또는 `reread` 없음)만이다. offline = 요청이 서버에 닿기 전에
 * 막힘(확정 미반영). offline 사유가 있으면 줄에 원문을 싣는다(35 R3-IN-02 — server 가 relay 거부 · 연결 실패 원인을 message 에
 * 싣는다 · Admin 계좌 편집 「<서버> 미반영: <사유 · 없으면 서버 연결 안 됨>」 과 같은 말). 사유 없음 = relay 가 본 gh-trade 서버 연결
 * 없음.
 * | skipped | 「KB120 · 미반영」 title message | 「KB120 미반영: <message · 없으면 꺼진 서버>」 |
 *
 * 서버 미지원 = 구 서버가 44 op 8 을 모름(code 1 「알 수 없는 명령입니다」) — 서버 업데이트 전까지 저장이 안 된다.
 * 새 서버(gh-trade 43)는 범위 · 순서 · 조각 수 · 폭 거부도 code 1 이라 code 만으로는 가를 수 없다.
 */
export function saveResultViewOf(
  result: AdminServerResult,
  fire: LaunchFire,
  at: Date,
  reread?: LaunchPlanReread,
): SaveResultView {
  const s = result.server;
  const msg = result.message || null;
  switch (result.outcome) {
    case 'ok':
      return {
        chip: { tone: 'ok', text: s, title: null },
        line: { tone: 'ok', text: `저장됨 · ${kstPartsOf(at).hm} · 다음 ${FIRE_CLOCK[fire]} 발사부터` },
      };
    case 'failed': {
      if (result.code === 1 && msg === LAUNCH_PLAN_UNKNOWN_OP_MESSAGE) {
        const detail = `서버 미지원 · ${msg}`;
        return {
          chip: { tone: 'err', text: `${s} · 실패`, title: detail },
          line: { tone: 'err', text: `${s} 실패: ${detail} — 서버 업데이트 뒤 다시 저장` },
        };
      }
      return { chip: { tone: 'err', text: `${s} · 실패`, title: msg }, line: { tone: 'err', text: `${s} 실패: ${msg ?? '실패'}` } };
    }
    case 'timeout':
      return {
        chip: { tone: 'err', text: `${s} · 응답 없음`, title: msg },
        line: { tone: 'err', text: `${s} 응답 없음: 반영됐는지 몰라요 — ${TIMEOUT_REREAD_TAIL[reread ?? 'ok']}` },
      };
    case 'offline':
      return {
        chip: { tone: 'warn', text: `${s} · 서버 연결 안 됨`, title: msg },
        line: { tone: 'warn', text: `${s} 미반영: ${msg ?? '서버 연결 안 됨'}` },
      };
    case 'skipped':
      return {
        chip: { tone: 'warn', text: `${s} · 미반영`, title: msg },
        line: { tone: 'warn', text: `${s} 미반영: ${msg ?? '꺼진 서버'}` },
      };
  }
}

/** 미리보기 표 셀(D-28) — 「접수 a · 모름 b · 거부 c」(날 수 · shared `launchPlanVerdictRows` 셀 그대로). */
export function verdictCellText(cell: LaunchRibbonCell): string {
  return `접수 ${cell.ok} · 모름 ${cell.unknown} · 거부 ${cell.bad}`;
}

/** 지도 탭 범례 아래 공용 적용 안내(D-27 · 계획을 읽었을 때만). */
export const LAUNCH_PLAN_APPLY_NOTE =
  '저장하면 서버 재기동 없이 다음 발사부터 적용돼요. 발사 1초 전(15:59:59 · 09:00:29) 이후에 저장하면 그다음 발사부터 적용돼요.';

// ─────────────────────────────────────────────────────────────────────────────
// 뒤탐침(quick-261107-l7w) — 「<서버> 뒤탐침」 줄 · 이력 표기
// ─────────────────────────────────────────────────────────────────────────────

/** 구 서버 · relay 와이어 대기(ok 인데 tail_probes 없음) — 경고색 한 줄 · 고치기 버튼 없음. */
export const TAIL_PROBE_UNSUPPORTED_TEXT = '이 서버 버전은 뒤탐침 설정을 몰라요 — gh-trade 업데이트 뒤 바꿀 수 있어요';

/** 계획을 못 읽음(서버 non-ok · 조회 실패) — muted 한 줄 · 고치기 버튼 없음. */
export const TAIL_PROBE_UNKNOWN_TEXT = '뒤탐침 값을 읽지 못했어요';

/**
 * 뒤탐침 값 줄 — 굵게(`strong`) + 나머지(`rest`). 숫자는 양수 그대로(「+10」 · fmtUs 를 쓰지 않는다 — 늘 마지막 조각 뒤).
 * - count 0 → 「꺼짐」 + 「 · 0발」
 * - count 1 → 「1발 · 10µs 간격」 + 「 · 마지막 조각 뒤 +10µs」
 * - 그 밖 → 「5발 · 10µs 간격」 + 「 · 마지막 조각 뒤 +10 ~ +50µs」
 */
export function tailProbeSummaryParts(v: LaunchTailProbeValue): { strong: string; rest: string } {
  if (v.count <= 0) return { strong: '꺼짐', rest: ' · 0발' };
  const first = v.step_us;
  const last = v.count * v.step_us;
  const span = v.count === 1 ? `+${first}µs` : `+${first} ~ +${last}µs`;
  return { strong: `${v.count}발 · ${v.step_us}µs 간격`, rest: ` · 마지막 조각 뒤 ${span}` };
}

/** 뒤탐침 값 줄 전체 문구(`tailProbeSummaryParts` 를 이은 것). */
export function tailProbeSummaryText(v: LaunchTailProbeValue): string {
  const p = tailProbeSummaryParts(v);
  return `${p.strong}${p.rest}`;
}

/** 이력 전 · 후 값 — 「5발 · 10µs」 · 모르면(null) 「—」. */
export function tailProbeValueText(v: LaunchTailProbeValue | null): string {
  return v === null ? DASH : `${v.count}발 · ${v.step_us}µs`;
}

const tpByAtDesc = (a: LaunchTailProbeChangeRow, b: LaunchTailProbeChangeRow): number =>
  a.at < b.at ? 1 : a.at > b.at ? -1 : b.id - a.id;

/** 이 (서버, 발사)의 뒤탐침 이력 — at 내림차순. ready 가 아니거나 구 server(키 없음)면 []. */
export function tailProbeChangesOf(state: LaunchPlanState, gateway: string, fire: LaunchFire): LaunchTailProbeChangeRow[] {
  if (state.kind !== 'ready') return [];
  return (state.resp.tail_probe_changes ?? []).filter((c) => c.gateway === gateway && c.fire === fire).sort(tpByAtDesc);
}

// ─────────────────────────────────────────────────────────────────────────────
// 뒤탐침 편집 · 저장(quick-261107-l7w) — 계획 편집 칸(35-15)과 같은 규칙
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 열린 뒤탐침 편집 칸(고른 서버 · 고른 발사 하나). 상태는 지도 탭이 쥔다.
 * - `count` = 스테퍼 숫자 · `stepRaw` = 간격 입력 원문(숫자로 바꾸지 않는다).
 * - `valid` = 마지막으로 검증을 통과한 값(S9 결) — 오류 동안에도 예정 칩 · 지도 초안 표식은 이 값을 그린다.
 * - `error` = 지금 초안의 첫 위반(shared `validateLaunchTailProbeDraft` 문구 원문) · 없으면 null.
 * - `base` = 칸을 열 때(또는 저장 뒤 다시 열 때)의 서버 값.
 */
export interface LaunchTailProbeEdit {
  gateway: string;
  fire: LaunchFire;
  base: LaunchTailProbeValue;
  count: number;
  stepRaw: string;
  valid: LaunchTailProbeValue;
  error: { field: 'count' | 'step'; message: string } | null;
}

/** 「뒤탐침 고치기」 — 서버 값으로 칸을 채운다. */
export function tailProbeEditOf(gateway: string, fire: LaunchFire, base: LaunchTailProbeValue): LaunchTailProbeEdit {
  return {
    gateway,
    fire,
    base: { ...base },
    count: base.count,
    stepRaw: String(base.step_us),
    valid: { ...base },
    error: null,
  };
}

/** 입력 반영 — 검증이 통과할 때만 `valid` 를 바꾸고, 아니면 `valid` 유지 + error(검증은 shared 한 벌). */
export function tailProbeEditWithDraft(edit: LaunchTailProbeEdit, count: number, stepRaw: string): LaunchTailProbeEdit {
  const check = validateLaunchTailProbeDraft(count, stepRaw);
  return check.ok
    ? { ...edit, count, stepRaw, valid: check.value, error: null }
    : { ...edit, count, stepRaw, error: { field: check.field, message: check.message } };
}

/** 같은 뒤탐침 값인가. */
export function sameTailProbe(a: LaunchTailProbeValue, b: LaunchTailProbeValue): boolean {
  return a.count === b.count && a.step_us === b.step_us;
}

/**
 * 뒤탐침 저장 응답 → 계획 상태. 응답 plan 이 있으면 그 서버를 통째로 바꾸고(실패여도 relay 가 다시 읽은 값이면 그것이 지금 값),
 * change 가 있으면 `tail_probe_changes` 맨 앞에 넣는다(null = 기록 실패 · 늘리지 않는다). ready 가 아니면 그대로.
 */
export function tailProbeStateWithSave(
  state: LaunchPlanState,
  gateway: string,
  resp: Pick<LaunchTailProbeSaveResponse, 'plan' | 'change'>,
): LaunchPlanState {
  if (state.kind !== 'ready') return state;
  const servers = resp.plan === null ? state.resp.servers : { ...state.resp.servers, [gateway]: resp.plan };
  const mine = state.resp.tail_probe_changes ?? [];
  const tail_probe_changes = resp.change === null ? mine : [resp.change, ...mine];
  return { kind: 'ready', resp: { ...state.resp, servers, tail_probe_changes } };
}

/**
 * 뒤탐침 저장 ok · 응답 plan 없음 — 그 서버 `tail_probes` 의 그 profile 행만 보낸 값으로(code 0 = 그 값이 들어갔다). 배열이 없으면
 * 그 행 하나로 만든다. ready 가 아니거나 그 서버가 ok 가 아니면 그대로.
 */
export function tailProbeStateWithSent(
  state: LaunchPlanState,
  gateway: string,
  fire: LaunchFire,
  value: LaunchTailProbeValue,
): LaunchPlanState {
  if (state.kind !== 'ready') return state;
  const server = state.resp.servers[gateway];
  if (server === undefined || server.status !== 'ok') return state;
  const profile = launchPlanProfileOf(fire);
  const row: LaunchTailProbe = { profile, count: value.count, step_us: value.step_us };
  const rows = server.tail_probes ?? [];
  const tail_probes = rows.some((t) => t.profile === profile)
    ? rows.map((t) => (t.profile === profile ? row : t))
    : [...rows, row];
  return { kind: 'ready', resp: { ...state.resp, servers: { ...state.resp.servers, [gateway]: { ...server, tail_probes } } } };
}

/** 계획 상태가 아는 뒤탐침 이력 id 최댓값 — 없으면 0(`tailProbeSaveRowSeenIn` 기준 · 35 R3-IN-01 결). */
export function maxTailProbeChangeIdOf(state: LaunchPlanState): number {
  if (state.kind !== 'ready') return 0;
  return (state.resp.tail_probe_changes ?? []).reduce((m, c) => (c.id > m ? c.id : m), 0);
}

/**
 * 다시 읽은 뒤탐침 이력에 이 저장의 행이 보이나 — 같은 (서버, 발사) · 같은 보낸 값 · 저장 직전에 알던 id(`afterId`)보다 새 행.
 * 보이면 다시 읽기의 조회가 그 저장 처리 뒤에 나갔다(`saveRowSeenIn` 과 같은 근거).
 */
export function tailProbeSaveRowSeenIn(
  rows: readonly LaunchTailProbeChangeRow[],
  save: { gateway: string; fire: LaunchFire; value: LaunchTailProbeValue; afterId: number },
): boolean {
  return rows.some(
    (c) =>
      c.id > save.afterId &&
      c.gateway === save.gateway &&
      c.fire === save.fire &&
      c.after_count === save.value.count &&
      c.after_step_us === save.value.step_us,
  );
}

/**
 * 시장 패널 「다음 발사 계획」 줄 꼬리(목업 변형 C `.plan .pr`) — count > 0 「+ 뒤탐침 5발 · 10µs」 · 0 「· 뒤탐침 꺼짐」.
 * 구 서버 · 계획 대신 값이면 지도 탭이 꼬리를 주지 않는다.
 */
export function tailProbePlanSuffixText(v: LaunchTailProbeValue): string {
  return v.count > 0 ? `+ 뒤탐침 ${v.count}발 · ${v.step_us}µs` : '· 뒤탐침 꺼짐';
}
