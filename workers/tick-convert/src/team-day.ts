/**
 * 격자 팀 값(quick 261103-j4d 결정 4) — 해제된 격자 바이트 → `tick_grids` 팀 3칸. 계산은 shared `teamDaySummaryOf` 한 벌
 * (웹 상세 「팀 거래정보」 끝 틱 KPI 와 같은 숫자 · webapp team-model.test 가 4개 픽스처로 잠근다).
 *
 * 행 값(마이그레이션 20261103230000 CHECK tick_grids_team_chk 와 같은 규칙):
 *   fills 0       → { team_fills: 0, net: null, pnl: null }   (팀 체결 없음 — 화면 「—」)
 *   fills > 0     → { team_fills: fills, net: dayNetVal, pnl: pnl.total_val }
 *   계산 실패     → 셋 다 null(미계산 — backfill-team 이 다시 고른다) + logger.error(date · ex · isin · mode · err)
 * 실패는 절대 throw 하지 않는다 — 격자 변환 · 업로드 · upsert 는 그대로 간다(결정 4). 조용히 삼키지도 않는다(무로그 fail-safe 금지).
 * net · pnl 이 안전한 정수가 아니면(bigint 칸 · NaN · 소수) 실패로 본다.
 */
import { teamDaySummaryOf, type TeamDaySummary, type TickExchange } from "@gh-radar/shared";
import { logger } from "./logger";

export type GridTeam = {
  team_fills: number | null;
  team_day_net_krw: number | null;
  team_day_pnl_krw: number | null;
};

/** 미계산(옛 행 · 계산 실패) — 셋 다 null. */
export const NO_TEAM: GridTeam = Object.freeze({ team_fills: null, team_day_net_krw: null, team_day_pnl_krw: null });

export type TeamCtx = { date: string; isin: string; mode: string };

/** 소요가 이보다 길면 info 한 줄(레코드 수 · ms) — 64만 레코드 규모 감시. */
const SLOW_MS = 1000;

const nowMs = (): number => performance.now();

function teamOfSummary(s: TeamDaySummary): GridTeam | string {
  if (!Number.isSafeInteger(s.fills) || s.fills < 0) return `fills ${s.fills}`;
  if (s.fills === 0) return { team_fills: 0, team_day_net_krw: null, team_day_pnl_krw: null };
  const net = s.dayNetVal;
  const pnl = s.pnl?.total_val;
  if (!Number.isSafeInteger(net)) return `dayNetVal ${net}`;
  if (pnl === undefined || !Number.isSafeInteger(pnl)) return `pnl.total_val ${pnl}`;
  return { team_fills: s.fills, team_day_net_krw: net, team_day_pnl_krw: pnl };
}

/**
 * 해제된 격자 바이트 → 팀 3칸. `ok` false = 계산 실패(NO_TEAM). `compute` 는 테스트 주입용(기본 shared teamDaySummaryOf).
 */
export function gridTeamOf(
  raw: Uint8Array,
  ex: TickExchange,
  ctx: TeamCtx,
  compute: (buf: Uint8Array, ex: TickExchange) => TeamDaySummary = teamDaySummaryOf,
): { team: GridTeam; ms: number; ok: boolean } {
  const t0 = nowMs();
  let out: GridTeam | string;
  try {
    out = teamOfSummary(compute(raw, ex));
  } catch (err) {
    const ms = Math.round(nowMs() - t0);
    logger.error({ ...ctx, ex, err, ms }, "tick-convert team summary failed — 그 행 팀 값만 null(변환은 계속)");
    return { team: { ...NO_TEAM }, ms, ok: false };
  }
  const ms = Math.round(nowMs() - t0);
  if (typeof out === "string") {
    logger.error({ ...ctx, ex, bad: out, ms }, "tick-convert team summary 이상값 — 그 행 팀 값만 null(변환은 계속)");
    return { team: { ...NO_TEAM }, ms, ok: false };
  }
  if (ms > SLOW_MS) logger.info({ ...ctx, ex, bytes: raw.length, ms }, "tick-convert team summary 느림");
  return { team: out, ms, ok: true };
}
