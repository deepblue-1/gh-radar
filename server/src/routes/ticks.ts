import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";

import { requireAuth } from "../middleware/require-auth.js";
import { TickConvertBodySchema, TickDayQuery, TickOpenQuery } from "../schemas/ticks.js";
import { ValidationFailed } from "../errors.js";
import {
  cancelTickConvert,
  getTickDay,
  getTickToday,
  openTick,
  requestTickConvert,
  TICK_REQUEST_DAILY_CAP_DEFAULT,
} from "../services/ticks.js";
import type { TickConvertTrigger } from "../services/tick-convert-trigger.js";

/**
 * Phase 37 — 틱 전문 뷰어 **과거 경로** 라우트 (D-03 · D-08 · D-09 · D-15). 당일 바이트 경로(`/live`)는 37-15.
 *
 * - GET  /day?d=YYYYMMDD           : 그 날짜 격자 목록 + 요청 상태(`TickDayResponse`). `d` 생략 = 최신 격자 날짜.
 * - GET  /today                    : 오늘 매집감지 등록 ∪ +15% 목록 + `live`(당일 경로 결선 여부 · `TickTodayResponse`).
 * - GET  /open?isin=&d=&ex=        : 격자 서명 URL · 메타 · 요청 상태(stale) · 매집감지 누적 · eta(`TickOpenResponse`).
 * - POST /convert {isin, d, ex}     : 요청 변환 — RPC 가 should_trigger 를 준 호출에서만 Job 실행(`TickConvertResponse`).
 *                                    상한 429 `TICK_CONVERT_CAPPED` · 실행 실패 502 `TICK_CONVERT_TRIGGER_FAILED` ·
 *                                    `TICK_CONVERT_JOB` 미설정 503 `TICK_CONVERT_UNAVAILABLE`.
 * - POST /convert/cancel {isin, d, ex} : 본인이 요청한 pending 만 취소(`TickCancelResponse`).
 *
 * ── 방어선 ──────────────────────────────────────────────────
 *   T-15-03  `requireAuth()` — 미인증 401. 미들웨어는 이것 하나다 — DMA 매핑 미들웨어를 겹치지 않는다
 *            (게이트는 RPC 안 · 왕복 1회 · D-08).
 *   T-19-01  RPC EXECUTE 는 service_role 전용 — 브라우저가 PostgREST 로 남의 `p_user_id` 를 넣어 부를 수 없다
 *   T-19-17  `p_user_id` = `req.userId`(requireAuth 확정값) 하나. 쿼리 · 본문의 `user_id` 같은 값은 읽지 않는다
 *   D-03     호출량은 사용자 수와 독립 — Job 실행은 (날짜, 거래소)당 1회(should_trigger) · 전역 하루 상한(TICK_REQUEST_DAILY_CAP)
 *   D-08     게이트는 RPC(`dma_visible_accounts`)다 — 미매핑 403 `DMA_UNMAPPED`(RPC 가 `access:false` 를 줄 때만).
 *            표 `tick_grids` · `tick_convert_requests` 는 접근 규칙 0 · anon/authenticated 권한 0 — 읽기 경로는 이 라우트 → RPC 뿐.
 *   입력     `d` 는 zod `^\d{8}$` + 실재 날짜 · `isin` 은 `^[A-Z0-9]{12}$`(KR 로 좁히지 않는다) · `ex` 는 KRX|NXT → 아니면 400(RPC 0회)
 *   T-15-07  에러는 전부 `next(e)` — `errorHandler` 가 프로덕션에서 원문을 감춘다
 */

export const ticksRouter: RouterT = Router();

/** zod 실패 → 400 VALIDATION_FAILED(첫 이슈만 · `routes/admin.ts` parseOrThrow 와 같은 꼴 — 라우터끼리 import 하지 않는다). */
function parseOr400<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw ValidationFailed(`${issue.path.join(".")}: ${issue.message}`);
  }
  return parsed.data;
}

ticksRouter.get("/day", requireAuth(), async (req, res, next) => {
  try {
    const q = parseOr400(TickDayQuery, req.query);
    const supabase = req.app.locals.supabase as SupabaseClient;
    res.json(await getTickDay(supabase, req.userId!, q.d));
  } catch (e) {
    next(e);
  }
});

ticksRouter.get("/today", requireAuth(), async (req, res, next) => {
  try {
    const supabase = req.app.locals.supabase as SupabaseClient;
    // 당일 바이트 경로(tickgw)는 37-15 가 app.locals.tickgw 로 결선한다 — 그 전엔 false(웹 「당일 자료 준비 중」).
    const live = req.app.locals.tickgw !== undefined;
    res.json(await getTickToday(supabase, req.userId!, live));
  } catch (e) {
    next(e);
  }
});

ticksRouter.get("/open", requireAuth(), async (req, res, next) => {
  try {
    const q = parseOr400(TickOpenQuery, req.query);
    const supabase = req.app.locals.supabase as SupabaseClient;
    res.json(await openTick(supabase, req.userId!, q));
  } catch (e) {
    next(e);
  }
});

ticksRouter.post("/convert", requireAuth(), async (req, res, next) => {
  try {
    const body = parseOr400(TickConvertBodySchema, req.body);
    const supabase = req.app.locals.supabase as SupabaseClient;
    const trigger = req.app.locals.tickConvertTrigger as TickConvertTrigger | undefined;
    const dailyCap = (req.app.locals.tickRequestDailyCap as number | undefined) ?? TICK_REQUEST_DAILY_CAP_DEFAULT;
    res.json(await requestTickConvert(supabase, req.userId!, body, { trigger, dailyCap }));
  } catch (e) {
    next(e);
  }
});

ticksRouter.post("/convert/cancel", requireAuth(), async (req, res, next) => {
  try {
    const body = parseOr400(TickConvertBodySchema, req.body);
    const supabase = req.app.locals.supabase as SupabaseClient;
    res.json(await cancelTickConvert(supabase, req.userId!, body));
  } catch (e) {
    next(e);
  }
});
