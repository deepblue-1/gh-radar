import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { TICK_LIVE_HEADERS } from "@gh-radar/shared";

import { requireAuth } from "../middleware/require-auth.js";
import { TickConvertBodySchema, TickDayQuery, TickLiveQuery, TickOpenQuery } from "../schemas/ticks.js";
import { ApiError, DmaUnmapped, ValidationFailed } from "../errors.js";
import { logger } from "../logger.js";
import {
  cancelTickConvert,
  getTickDay,
  getTickOwn,
  getTickToday,
  openTick,
  requestTickConvert,
  TICK_REQUEST_DAILY_CAP_DEFAULT,
} from "../services/ticks.js";
import type { TickConvertTrigger } from "../services/tick-convert-trigger.js";
import type { TickgwClient, TickLiveHeaderKey } from "../services/tickgw-client.js";
import type { TickGateCache } from "../services/tick-gate-cache.js";

/**
 * Phase 37 — 틱 전문 뷰어 라우트. 과거 경로(D-03 · D-08 · D-09 · D-15) + 당일 바이트 경로 `/live`(37-15 · D-05 · D-07 · D-08 · D-22).
 *
 * - GET  /live?isin=&ex=&epoch=&offset= : tickgw(37-09) 바이트를 **그대로** 중계(풀지도 다시 압축하지도 않음).
 *                                    200 `application/octet-stream` + X-Tick-* 6종 그대로(`TICK_LIVE_HEADERS`) + `Cache-Control: no-store`.
 *                                    게이트는 사용자별 60초 캐시(`app.locals.tickGate` → RPC `tick_access_for_user`) — 미매핑 403 `DMA_UNMAPPED`.
 *                                    tickgw 409(epoch 변경) → 409 `{epoch}` · 닿지 못함 · 비정상 응답 → 502 `TICKS_LIVE_UNREACHABLE` ·
 *                                    `TICKGW_URL` 미설정 → 503 `TICKS_LIVE_UNAVAILABLE`(D-22 — 119 인덱서 배포 확인 뒤 37-17 이 켠다).
 *                                    offset 0 요청도 그대로 넘긴다 — `X-Tick-State` loading/queued · `X-Tick-Queue` 는 tickgw 값 그대로(D-05).
 *
 * - GET  /day?d=YYYYMMDD           : 그 날짜 격자 목록 + 요청 상태(`TickDayResponse`). `d` 생략 = 최신 격자 날짜.
 * - GET  /today                    : 오늘 매집감지 등록 ∪ +15% 목록 + `live`(당일 경로 결선 여부 · `TickTodayResponse`).
 * - GET  /open?isin=&d=&ex=        : 격자 서명 URL · 메타 · 요청 상태(stale) · 매집감지 누적 · eta(`TickOpenResponse`).
 * - GET  /own?isin=&d=&ex=         : 우리 체결 · 전략 주문 이벤트 · 보조 주문 · 켜진 서버(`TickOwnResponse` · Phase 38 D-14).
 *                                    RPC `tick_own_for_user` 1회 · 가시성 · 어드민 · 켜진 서버는 RPC 안 · `Cache-Control: no-store`
 *                                    · server 캐시 없음(과거 = 열 때 1회 · 당일 = 사용자 클릭 때 1회).
 * - POST /convert {isin, d, ex}     : 요청 변환 — RPC 가 should_trigger 를 준 호출에서만 Job 실행(`TickConvertResponse`).
 *                                    상한 429 `TICK_CONVERT_CAPPED` · 실행 실패 502 `TICK_CONVERT_TRIGGER_FAILED` ·
 *                                    `TICK_CONVERT_JOB` 미설정 503 `TICK_CONVERT_UNAVAILABLE`.
 * - POST /convert/cancel {isin, d, ex} : pending 요청에서 내 몫만 뺀다 · 마지막 요청자면 cancelled(`TickCancelResponse` · WR-02).
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
    // live = 당일 바이트 경로(tickgw) 결선 여부 — TICKGW_URL · TICKGW_SECRET 이 없으면 false(웹 「당일 자료 준비 중」 · D-22).
    const live = req.app.locals.tickgw !== undefined;
    res.json(await getTickToday(supabase, req.userId!, live));
  } catch (e) {
    next(e);
  }
});

// ── 당일 바이트 경로 (37-15) ─────────────────────────────────────────

/** `TICKGW_URL` · `TICKGW_SECRET` 미설정 — 당일 경로가 꺼져 있다(D-22 · 웹은 「당일 자료 준비 중」). */
export const TicksLiveUnavailable = () =>
  new ApiError(503, "TICKS_LIVE_UNAVAILABLE", "당일 틱 자료를 지금 쓸 수 없어요.");

/** tickgw 에 닿지 못함(네트워크 · 타임아웃) 또는 tickgw 가 계약 밖 응답을 줌 — 웹은 다음 폴링에서 다시 시도한다. */
export const TicksLiveUnreachable = (cause?: unknown) =>
  new ApiError(502, "TICKS_LIVE_UNREACHABLE", "당일 틱 자료를 받지 못했어요. 잠시 후 다시 시도해 주세요.", cause);

/** tickgw 409 본문 `{epoch}` — 문자열 epoch 가 없으면 null(계약 위반 → 502). */
function parseEpochBody(body: Buffer | null): string | null {
  if (!body) return null;
  try {
    const v = JSON.parse(body.toString("utf8")) as { epoch?: unknown };
    return typeof v?.epoch === "string" && v.epoch.length > 0 && v.epoch.length <= 64 ? v.epoch : null;
  } catch {
    return null;
  }
}

ticksRouter.get("/live", requireAuth(), async (req, res, next) => {
  try {
    const q = parseOr400(TickLiveQuery, req.query);
    const tickgw = req.app.locals.tickgw as TickgwClient | undefined;
    if (!tickgw) throw TicksLiveUnavailable();

    // D-08 게이트 — 사용자별 60초 캐시(폴링마다 Supabase 왕복을 하지 않는다).
    const supabase = req.app.locals.supabase as SupabaseClient;
    const gate = req.app.locals.tickGate as TickGateCache;
    if (!(await gate.check(supabase, req.userId!))) throw DmaUnmapped();

    const r = await tickgw.live({ isin: q.isin, ex: q.ex, epoch: q.epoch, offset: q.offset });
    if (r.status === 0) throw TicksLiveUnreachable({ netCode: r.netCode });

    if (r.status === 409) {
      const epoch = parseEpochBody(r.body);
      if (epoch === null) throw TicksLiveUnreachable({ upstreamStatus: 409, reason: "409 본문에 epoch 없음" });
      res.set("Cache-Control", "no-store");
      res.status(409).json({ epoch });
      return;
    }

    // 200 이 아니면 계약 밖(401 = 비밀 불일치 · 503 = tickgw 캐시 못 잡음 · 400 = 검사 어긋남) — 상태만 남기고 502.
    if (r.status !== 200 || !r.body || r.headers.epoch === undefined || r.headers.offsetEnd === undefined) {
      if (r.status === 401) logger.error({ tickgw: { status: 401 } }, "[tickgw] 공유 비밀 불일치 — TICKGW_SECRET 확인");
      throw TicksLiveUnreachable({ upstreamStatus: r.status });
    }

    // D-07 — 바이트 · 헤더 그대로. res.send 대신 end — ETag 계산(수 MB 해시) · 304 분기를 타지 않는다.
    // compression 은 app.ts 필터가 application/octet-stream 을 뺀다(이미 zstd 라 다시 압축해도 이득 0 · 「그대로」 가 깨진다).
    for (const [key, name] of Object.entries(TICK_LIVE_HEADERS) as [TickLiveHeaderKey, string][]) {
      const v = r.headers[key];
      if (v !== undefined) res.setHeader(name, v);
    }
    res.status(200);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Length", String(r.body.length));
    res.end(r.body);
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

ticksRouter.get("/own", requireAuth(), async (req, res, next) => {
  try {
    const q = parseOr400(TickOpenQuery, req.query);
    const supabase = req.app.locals.supabase as SupabaseClient;
    res.set("Cache-Control", "no-store");
    res.json(await getTickOwn(supabase, req.userId!, q));
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
