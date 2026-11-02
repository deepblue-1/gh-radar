/**
 * 세 보고서 → 틱 뷰어 「틱 보기 ›」 링크 (Phase 37 D-17).
 *
 * URL 은 뷰어 딥링크(D-18)와 같은 꼴 — `tickUrlOf` 정본을 그대로 쓴다. 거래소는 KRX 기본이고, `tickUrlOf` 는 기본값
 * KRX 를 뺀 짧은 URL 을 정본으로 둔다(`?isin&d` 와 `?isin&d&ex=KRX` 는 같은 화면 · 37-08 결정).
 * 시각 `t` 는 epoch ms → KST `HH:MM:SS.mmm`(shared `fmtTickTime` 과 같은 규칙 · 그 함수로 변환). 시각이 없으면 `t` 를
 * 빼고, 뷰어가 기본(과거 = 08:00 첫 틱)으로 연다. 시각의 KST 날짜가 `date` 와 다르면(예: 매집감지 이월 행의
 * `reg_time_ms` = 며칠 전 등록 시각) 그 시각은 이 날짜의 틱이 아니므로 역시 `t` 를 뺀다.
 *
 * 의미 있는 시각 규칙(D-17):
 * - 매집감지 = 마지막 사이클 등록 시각 `reg_time_ms`
 * - 팀 매집 = 상한가 도달 `payload.reach.t_ms` ?? `first_limit_ms` · 없으면 첫 20% 도달 `t20_ms`(RPC 가 entries 조인)
 * - 상한가 = 첫 상한 도달 `first_upper_ms` · 미도달이면 `t20_ms`
 */

import { fmtTickTime, type TeamflowRow, type TickExchange } from '@gh-radar/shared';

import { kstNowOf, tickUrlOf } from './tick-url';

const MS_NS = 1_000_000n;

/** 알약 모양 — 보고서 프리셋 알약과 같은 토큰 · 최소 터치 32px(min-h-8). */
export const TICK_LINK_PILL =
  'inline-flex min-h-8 shrink-0 items-center rounded-full bg-[var(--muted)] px-3 text-[length:var(--t-caption)] font-semibold whitespace-nowrap text-[var(--fg-2)] hover:bg-[var(--raised-2)]';

const isMs = (ms: number | null | undefined): ms is number => typeof ms === 'number' && Number.isFinite(ms);

/** 종목 · 날짜(`YYYYMMDD`) · 시각(epoch ms) · 거래소 → 뷰어 URL. 시각이 숫자가 아니거나 그 날짜(KST)가 아니면 `t` 없이. */
export function tickHrefOf({
  isin,
  date,
  ms,
  ex = 'KRX',
}: {
  isin: string;
  date: string;
  ms?: number | null;
  ex?: TickExchange;
}): string {
  const onDay = isMs(ms) && kstNowOf(new Date(ms)).ymd === date;
  const t = onDay ? fmtTickTime(BigInt(Math.trunc(ms)) * MS_NS) : null;
  return tickUrlOf({ isin, d: date, ex, t });
}

/** 매집감지 — 마지막 사이클 등록 시각. */
export function accumJumpMs(row: { reg_time_ms: number | null | undefined }): number | null {
  return isMs(row.reg_time_ms) ? row.reg_time_ms : null;
}

/** 팀 매집 — 상한가 도달(reach.t_ms ?? first_limit_ms) · 없으면 첫 20% 도달. */
export function teamflowJumpMs(row: Pick<TeamflowRow, 'payload' | 'first_limit_ms' | 't20_ms'>): number | null {
  for (const ms of [row.payload?.reach?.t_ms, row.first_limit_ms, row.t20_ms]) {
    if (isMs(ms)) return ms;
  }
  return null;
}

/** 상한가 — 첫 상한 도달 · 미도달이면 첫 20% 도달. */
export function limitupJumpMs(e: { first_upper_ms: number | null; t20_ms: number | null }): number | null {
  if (isMs(e.first_upper_ms)) return e.first_upper_ms;
  return isMs(e.t20_ms) ? e.t20_ms : null;
}
