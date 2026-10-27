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
  type LaunchFire,
  type LaunchHeadRow,
  type LaunchMarket,
  type LaunchPlanChangeRow,
  type LaunchPlanEntry,
  type LaunchPlanResponse,
} from '@gh-radar/shared';

import { fmtUs } from './launch-format';
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
