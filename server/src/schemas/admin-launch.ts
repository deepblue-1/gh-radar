import { z } from "zod";
import {
  LAUNCH_FIRE_KEYS,
  LAUNCH_PLAN_GATEWAYS,
  LAUNCH_PLAN_SERVER_MAX_PIECES,
  LAUNCH_TAIL_PROBE_FIRES,
} from "@gh-radar/shared";

import { Ymd } from "./limitup-report.js";

/**
 * Phase 35 D-20 — 발사 경계 지도 어드민 입력 검증 (`GET /api/admin/launch/orders` · `GET /api/admin/launch/map`).
 *
 * - `d` = `YYYYMMDD` — 상한가 · 매집 보고서와 같은 규칙(`Ymd` · 형식 + 실재 날짜). 어긋나면 400 · RPC 0회.
 *   `d` 생략 = 조각이 있는 최신 거래일(RPC 가 정한다).
 * - `fire` = 발사 기준(shared `LAUNCH_FIRE_KEYS` — q16 = KRX 16:00:00 · n0930 = NXT 09:00:30 · g0830 = KRX 08:30:00 G2
 *   · quick-261125-c2i) · 기본 q16(D-15).
 * - `range` = 최근 거래일 수(10d · 20d · all) · 기본 10d — RPC `p_days` 는 shared `LAUNCH_RANGE_DAYS` 로 옮긴다(10 · 20 · null).
 *   그 밖 값은 400 · RPC 0회.
 */
export const LaunchOrdersQuery = z.object({ d: Ymd.optional() });
export type LaunchOrdersQueryT = z.infer<typeof LaunchOrdersQuery>;

export const LaunchMapQuery = z.object({
  fire: z.enum(LAUNCH_FIRE_KEYS).default("q16"),
  range: z.enum(["10d", "20d", "all"]).default("10d"),
});
export type LaunchMapQueryT = z.infer<typeof LaunchMapQuery>;

/**
 * Phase 35 범위 7 (35-13) — `PUT /api/admin/launch/plan/:gateway/:fire/:market` 입력. 어긋나면 400 · relay 0회 · RPC 0회.
 *
 * - **구조만 본다** — gateway ∈ `LAUNCH_PLAN_GATEWAYS` · fire ∈ q16 | n0930 | g0830(08:30 KRX G2 · shared `LAUNCH_FIRE_KEYS`) · market ∈ K|Q · offsets_us 는 int32 정수 1~64칸 · 추가 키 거부.
 * - 순서 · 범위(D-34)는 웹 편집 칸(D-26 · shared `validateLaunchPlanDraft`)과 gh-trade 서버(code 1 문구)가 말한다 — server 가 막으면
 *   서버 거부 문구 경로가 죽는다.
 * - KB121 은 계획 대상이 아니다(gh-trade 43 D-02) — 대상 = shared 발사 서버 한 벌(KB120 · KYOBO119 · KYOBO112 ·
 *   quick-261107-iep). `ServerKeySchema` 대신 enum 으로 좁힌다.
 */
export const LaunchPlanParams = z.object({
  gateway: z.enum(LAUNCH_PLAN_GATEWAYS),
  fire: z.enum(LAUNCH_FIRE_KEYS),
  market: z.enum(["K", "Q"]),
});
export type LaunchPlanParamsT = z.infer<typeof LaunchPlanParams>;

/**
 * quick-261125-lju — `PUT /api/admin/launch/tail-probe/:gateway/:fire` 입력. 어긋나면 400 · relay 0회 · RPC 0회.
 * **구조만** — gateway ∈ `LAUNCH_PLAN_GATEWAYS` · fire ∈ q16 | n0930(shared `LAUNCH_TAIL_PROBE_FIRES` — G2 는 탐침 대상 아님 ·
 * 인박스 261125-sigan-ttaeng-g2 ⓑ · g0830 은 400) · 바디 { market: K|Q, offsets_us: int32[0..64] }(옛 count · step_us · 추가 키 거부).
 * 범위 · 발 수 10 · 순서는 웹 편집 칸(shared `validateLaunchTailProbeDraft`)과 gh-trade 86 code 1 이 말한다 — server 가 막으면
 * 서버 거부 문구 경로가 죽는다. 교보 N 공통은 웹이 K 로 1건 보낸다(gh-trade 가 두 행을 맞춘다).
 */
export const LaunchTailProbeParams = z.object({
  gateway: z.enum(LAUNCH_PLAN_GATEWAYS),
  fire: z.enum(LAUNCH_TAIL_PROBE_FIRES),
});
export type LaunchTailProbeParamsT = z.infer<typeof LaunchTailProbeParams>;

const Int32 = z.number().int().min(-2147483648).max(2147483647);

export const LaunchTailProbeSaveBodySchema = z
  .object({
    market: z.enum(["K", "Q"]),
    offsets_us: z.array(Int32).max(LAUNCH_PLAN_SERVER_MAX_PIECES),
  })
  .strict();

export const LaunchPlanSaveBodySchema = z
  .object({
    offsets_us: z
      .array(z.number().int().min(-2147483648).max(2147483647))
      .min(1)
      .max(LAUNCH_PLAN_SERVER_MAX_PIECES),
  })
  .strict();
