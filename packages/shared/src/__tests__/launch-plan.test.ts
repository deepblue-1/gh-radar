/**
 * Phase 35 범위 7 (35-12) — 발사 계획 어드민 shared 계약 · 검증 · 「쐈다면」 판정.
 *
 * - 계약 핀: `LAUNCH_PLAN_CHANGE_COLUMNS` 12개 = `LaunchPlanChangeRow` 키 = 기록 RPC 반환 jsonb 키
 *   (pgTAP `supabase/tests/launch_plan_changes.test.sql` 이 같은 12개 이름을 단언한다).
 */
import { describe, expect, it } from "vitest";

import { LAUNCH_ORDER } from "../launch";
import {
  LAUNCH_PLAN_CHANGE_COLUMNS,
  LAUNCH_PLAN_GATEWAYS,
  launchPlanProfileOf,
  type LaunchPlanChangeRow,
} from "../launch-plan";

/** 기록 RPC 반환 jsonb 의 키 — pgTAP 과 같은 목록(순서 그대로). */
const EXPECTED_COLUMNS = [
  "id",
  "at",
  "admin_email",
  "gateway",
  "fire",
  "market",
  "before_us",
  "after_us",
  "outcome",
  "code",
  "message",
  "plan_rev",
] as const;

// 타입 단언 — 열 목록과 행 타입 키가 서로 빠짐없이 같다(어느 한쪽만 늘면 typecheck 가 깨진다).
type Cols = (typeof LAUNCH_PLAN_CHANGE_COLUMNS)[number];
const colsCoverRow: [Exclude<keyof LaunchPlanChangeRow, Cols>] extends [never] ? true : false = true;
const rowCoversCols: [Exclude<Cols, keyof LaunchPlanChangeRow>] extends [never] ? true : false = true;

describe("launch-plan 계약", () => {
  it("LAUNCH_PLAN_CHANGE_COLUMNS = 이력 행 12키(순서 그대로)", () => {
    expect([...LAUNCH_PLAN_CHANGE_COLUMNS]).toEqual([...EXPECTED_COLUMNS]);
    expect(LAUNCH_PLAN_CHANGE_COLUMNS).toHaveLength(12);
    expect(colsCoverRow && rowCoversCols).toBe(true);
  });

  it("행 예시의 키 집합이 열 목록과 같다", () => {
    const row: LaunchPlanChangeRow = {
      id: 1,
      at: "2026-10-28T13:41:00+00:00",
      admin_email: "admin@example.com",
      gateway: "KB120",
      fire: "q16",
      market: "Q",
      before_us: [-350, -345, -325],
      after_us: [-340, -335, -322],
      outcome: "ok",
      code: null,
      message: null,
      plan_rev: 7,
    };
    expect(Object.keys(row).sort()).toEqual([...EXPECTED_COLUMNS].sort());
  });

  it("launchPlanProfileOf — q16 → Q16 · n0930 → N", () => {
    expect(launchPlanProfileOf("q16")).toBe("Q16");
    expect(launchPlanProfileOf("n0930")).toBe("N");
  });

  it("LAUNCH_PLAN_GATEWAYS = LAUNCH_ORDER 의 서버 키 순서 그대로(KB120 · KYOBO119)", () => {
    expect([...LAUNCH_PLAN_GATEWAYS]).toEqual(["KB120", "KYOBO119"]);
    expect([...LAUNCH_PLAN_GATEWAYS]).toEqual([...new Set(LAUNCH_ORDER.map(([g]) => g))]);
  });
});
