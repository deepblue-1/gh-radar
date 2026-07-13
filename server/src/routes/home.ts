import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HomeSnapshotResponse } from "@gh-radar/shared";
import { HomeQuery } from "../schemas/home.js";
import { ApiError } from "../errors.js";
import {
  mapSnapshot,
  mapIndexEntry,
  type HomeSnapshotRow,
  type HomeIndexRow,
} from "../mappers/home.js";

/**
 * Phase 13 — GET /api/home (HOME-01, RESEARCH §Pattern 6).
 *
 * home_theme_snapshots(워커 home-sync 가 :30 슬롯마다 append) 를 홈 화면에 노출하는
 * 읽기 전용 라우트. **객체** { snapshot, index } 로 반환한다 (HomeSnapshotResponse 계약 —
 * 배열 아님, limitUp 선례. comovement 드리프트 회피).
 *
 * 파라미터 조합으로 대상 스냅샷 선택:
 *   - 없음        → 오늘(최신 captured_at) 스냅샷
 *   - date 만     → 해당 거래일의 최신 captured_at 스냅샷
 *   - capturedAt  → 정확히 그 시점 스냅샷 (우선순위 최상 — date 는 무시)
 *
 * 정적 이력 — payload 는 저장 시점 값 verbatim 서빙(실시간 시세 재조인/재계산 없음,
 * T-13-03 / Pitfall 3: 과거 슬롯이 오늘 시세로 오염되면 안 됨). snapshot=null 은 빈 상태
 * (급등 없는 날/미생성). index 는 payload 제외 경량 네비게이션(최신 ~400 슬롯 (5분 슬롯 ~4일)).
 * 에러는 next(e) 로 위임(generic — error.message 미노출, T-13-09 Info Disclosure).
 */

const SNAPSHOT_COLS =
  "trade_date,captured_at,theme_count,stock_count,is_carried,payload";
const INDEX_COLS = "trade_date,captured_at,theme_count,stock_count,is_carried";

export const homeRouter: RouterT = Router();

homeRouter.get("/", async (req, res, next) => {
  try {
    const parsed = HomeQuery.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiError(
        400,
        "INVALID_QUERY_PARAM",
        `${issue.path.join(".")}: ${issue.message}`,
      );
    }
    const { date, capturedAt } = parsed.data;
    const supabase = req.app.locals.supabase as SupabaseClient;

    // 1. 대상 스냅샷 (payload 포함). capturedAt 우선 → date → 무필터(오늘 최신).
    let q = supabase.from("home_theme_snapshots").select(SNAPSHOT_COLS);
    if (capturedAt) q = q.eq("captured_at", capturedAt);
    else if (date) q = q.eq("trade_date", date);
    const { data: snap, error: snapErr } = await q
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (snapErr) throw snapErr;

    // 2. 네비게이션 인덱스 (payload 제외 — 경량, 최신 ~400 슬롯 (5분 슬롯 ~4일)).
    const { data: idx, error: idxErr } = await supabase
      .from("home_theme_snapshots")
      .select(INDEX_COLS)
      .order("captured_at", { ascending: false })
      .limit(400);
    if (idxErr) throw idxErr;

    res.setHeader("Cache-Control", "no-store");
    res.json({
      snapshot: snap ? mapSnapshot(snap as unknown as HomeSnapshotRow) : null,
      index: ((idx ?? []) as unknown as HomeIndexRow[]).map(mapIndexEntry),
    } satisfies HomeSnapshotResponse);
  } catch (e) {
    next(e);
  }
});
