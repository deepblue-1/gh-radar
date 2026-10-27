/**
 * Phase 35 범위 7 (35-12) — 발사 계획 어드민 shared 계약 · 검증 · 「쐈다면」 판정.
 *
 * - 계약 핀: `LAUNCH_PLAN_CHANGE_COLUMNS` 12개 = `LaunchPlanChangeRow` 키 = 기록 RPC 반환 jsonb 키
 *   (pgTAP `supabase/tests/launch_plan_changes.test.sql` 이 같은 12개 이름을 단언한다).
 * - 「쐈다면」 판정 교차: 픽스처 `__fixtures__/launch-pieces-1012-1026.json`(첨부 pieces.json 196행 · launch.test.ts 와 같은 사본).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { LAUNCH_ORDER, launchDaysOf, launchRibbonAt, type LaunchCalcPiece } from "../launch";
import {
  LAUNCH_PLAN_CHANGE_COLUMNS,
  LAUNCH_PLAN_GATEWAYS,
  LAUNCH_PLAN_LIMITS,
  LAUNCH_PLAN_SERVER_MAX_PIECES,
  launchPlanEntryOf,
  launchPlanProfileOf,
  launchPlanUsText,
  launchPlanVerdictRows,
  validateLaunchPlanDraft,
  type LaunchPlanChangeRow,
  type LaunchPlanServer,
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

// ─────────────────────────────────────────────────────────────────────────────
// Task 3 — 검증 · 계획 칸 · 「쐈다면」 판정
// ─────────────────────────────────────────────────────────────────────────────

/** 첨부 pieces.json 한 원소(launch.test.ts 와 같은 어댑터). */
interface AttachRow {
  date: string;
  broker: string;
  market: string;
  wire: number;
  rel: number;
  result: string;
}
interface Piece extends LaunchCalcPiece {
  gateway: string;
  market: string;
}
const FIXTURE = fileURLToPath(new URL("../__fixtures__/launch-pieces-1012-1026.json", import.meta.url));
const RAW = JSON.parse(readFileSync(FIXTURE, "utf8")) as AttachRow[];
const GATEWAY: Record<string, string> = { KB: "KB120", 교보: "KYOBO119" };
const MARKET: Record<string, string> = { 코스피: "K", 코스닥: "Q" };
const PIECES: Piece[] = RAW.map((r) => ({
  trade_date: r.date,
  gateway: GATEWAY[r.broker]!,
  market: MARKET[r.market]!,
  wire: r.wire,
  sent_rel_us: r.rel,
  result: r.result,
}));
const panelDays = (gateway: string, market: string) =>
  launchDaysOf(PIECES.filter((p) => p.gateway === gateway && p.market === market));

describe("LAUNCH_PLAN_LIMITS · launchPlanUsText", () => {
  it("D-34 정식 노트 값 — q16 −3000~1000 · 1~10조각 · 폭 500 · n0930 ±2000 · 1조각(폭 해당 없음) · 서버 구조 상한 64", () => {
    expect(LAUNCH_PLAN_LIMITS).toEqual({
      q16: { minUs: -3000, maxUs: 1000, minPieces: 1, maxPieces: 10, maxSpanUs: 500 },
      n0930: { minUs: -2000, maxUs: 2000, minPieces: 1, maxPieces: 1, maxSpanUs: null },
    });
    expect(LAUNCH_PLAN_SERVER_MAX_PIECES).toBe(64);
  });

  it("음수는 U+2212 + 절댓값 · 0 · 양수는 그대로(쉼표 · + 없음)", () => {
    expect(launchPlanUsText(-3000)).toBe("−3000");
    expect(launchPlanUsText(0)).toBe("0");
    expect(launchPlanUsText(1000)).toBe("1000");
  });
});

describe("validateLaunchPlanDraft — 개수 → 칸마다(정수 → 범위) → 순서 → 폭", () => {
  it("ok — 값 배열 · 같은 값 허용 · 앞뒤 공백은 잘라서 본다", () => {
    expect(validateLaunchPlanDraft("q16", ["-350", "-345", "-325"])).toEqual({ ok: true, values: [-350, -345, -325] });
    expect(validateLaunchPlanDraft("q16", ["-350", "-345", "-345"])).toEqual({ ok: true, values: [-350, -345, -345] });
    expect(validateLaunchPlanDraft("q16", [" -350 ", "-345"])).toEqual({ ok: true, values: [-350, -345] });
    expect(validateLaunchPlanDraft("n0930", ["-245"])).toEqual({ ok: true, values: [-245] });
  });

  it("순서 위반 — badIdx 1 · 문구 원문(U+2212 · 쉼표 없음)", () => {
    expect(validateLaunchPlanDraft("q16", ["-350", "-360", "-325"])).toEqual({
      ok: false,
      badIdx: 1,
      kind: "order",
      message: "조각 시각은 앞 조각과 같거나 늦어야 해요 — 2번 −360µs 가 1번 −350µs 보다 이릅니다",
    });
  });

  it("범위 위반 — 16:00 · 09:00:30 문구 원문", () => {
    expect(validateLaunchPlanDraft("q16", ["-3500"])).toEqual({
      ok: false,
      badIdx: 0,
      kind: "range",
      message: "조각 시각은 −3000 ~ 1000µs 사이여야 해요",
    });
    expect(validateLaunchPlanDraft("q16", ["-350", "1001"])).toMatchObject({ ok: false, badIdx: 1, kind: "range" });
    expect(validateLaunchPlanDraft("n0930", ["2500"])).toEqual({
      ok: false,
      badIdx: 0,
      kind: "range",
      message: "발사 시각은 −2000 ~ 2000µs 사이여야 해요",
    });
  });

  it("경계값 −3000 · 1000 · −2000 · 2000 은 ok", () => {
    expect(validateLaunchPlanDraft("q16", ["-3000"])).toEqual({ ok: true, values: [-3000] });
    expect(validateLaunchPlanDraft("q16", ["1000"])).toEqual({ ok: true, values: [1000] });
    expect(validateLaunchPlanDraft("q16", ["-3000", "-2500"])).toEqual({ ok: true, values: [-3000, -2500] });
    expect(validateLaunchPlanDraft("q16", ["500", "1000"])).toEqual({ ok: true, values: [500, 1000] });
    expect(validateLaunchPlanDraft("n0930", ["-2000"])).toEqual({ ok: true, values: [-2000] });
    expect(validateLaunchPlanDraft("n0930", ["2000"])).toEqual({ ok: true, values: [2000] });
  });

  it("정수 위반 — 소수 · 빈 칸 · '-' · '+5' → badIdx 1 · 「조각 시각은 정수 µs 여야 해요 — 2번」", () => {
    for (const bad of ["-34.5", "", "-", "+5", "  ", "1e3"]) {
      expect(validateLaunchPlanDraft("q16", ["-350", bad])).toEqual({
        ok: false,
        badIdx: 1,
        kind: "int",
        message: "조각 시각은 정수 µs 여야 해요 — 2번",
      });
    }
    expect(validateLaunchPlanDraft("n0930", ["x"])).toEqual({
      ok: false,
      badIdx: 0,
      kind: "int",
      message: "발사 시각은 정수 µs 여야 해요 — 1번",
    });
  });

  it("폭 위반(fix 노트 · 마지막 − 첫 ≤ 500) — badIdx = 마지막 칸 · 문구 원문 · 경계 500 은 ok", () => {
    expect(validateLaunchPlanDraft("q16", ["-350", "-345", "151"])).toEqual({
      ok: false,
      badIdx: 2,
      kind: "span",
      message: "조각 시각은 첫 조각과 마지막 조각 차이가 500µs 이하여야 해요 — 지금 501µs",
    });
    expect(validateLaunchPlanDraft("q16", ["-350", "-345", "150"])).toEqual({ ok: true, values: [-350, -345, 150] });
    expect(validateLaunchPlanDraft("q16", ["-3000", "1000"])).toMatchObject({ ok: false, badIdx: 1, kind: "span" });
  });

  it("폭 검사는 순서 검사 뒤 — 순서 위반이 먼저 · 한 칸이면 폭 없음", () => {
    expect(validateLaunchPlanDraft("q16", ["-350", "-360", "500"])).toMatchObject({ badIdx: 1, kind: "order" });
    expect(validateLaunchPlanDraft("q16", ["-350", "5000"])).toMatchObject({ badIdx: 1, kind: "range" });
    expect(validateLaunchPlanDraft("q16", ["-3000"])).toEqual({ ok: true, values: [-3000] });
  });

  it("첫 위반 하나만 — 칸 순서대로 정수 → 범위 · 순서는 칸 검사가 다 통과한 뒤", () => {
    // 1번 범위 위반이 2번 정수 위반보다 먼저
    expect(validateLaunchPlanDraft("q16", ["-3500", "-34.5"])).toMatchObject({ badIdx: 0, kind: "range" });
    // 순서 위반(2번)이 있어도 3번 범위 위반이 먼저
    expect(validateLaunchPlanDraft("q16", ["-350", "-360", "5000"])).toMatchObject({ badIdx: 2, kind: "range" });
    // 순서 위반 둘이면 첫 번째
    expect(validateLaunchPlanDraft("q16", ["-300", "-310", "-320"])).toMatchObject({ badIdx: 1, kind: "order" });
  });

  it("개수 위반 — q16 0칸 · 11칸 · n0930 두 칸 → badIdx -1", () => {
    const count = { ok: false, badIdx: -1, kind: "count", message: "조각 수는 1 ~ 10 사이여야 해요" };
    expect(validateLaunchPlanDraft("q16", [])).toEqual(count);
    expect(validateLaunchPlanDraft("q16", Array.from({ length: 11 }, (_, i) => String(-400 + i)))).toEqual(count);
    expect(validateLaunchPlanDraft("q16", Array.from({ length: 10 }, (_, i) => String(-400 + i)))).toMatchObject({
      ok: true,
    });
    expect(validateLaunchPlanDraft("n0930", ["-245", "-240"])).toEqual({
      ok: false,
      badIdx: -1,
      kind: "count",
      message: "발사 시각은 한 값이에요",
    });
    expect(validateLaunchPlanDraft("n0930", [])).toMatchObject({ kind: "count", message: "발사 시각은 한 값이에요" });
  });
});

describe("launchPlanEntryOf", () => {
  const server: LaunchPlanServer = {
    status: "ok",
    plan_rev: 7,
    updated_at: "2026-10-27T13:41:00Z",
    entries: [
      { profile: "Q16", market: "K", offsets_us: [-300, -290] },
      { profile: "Q16", market: "Q", offsets_us: [-350, -345, -325] },
      { profile: "N", market: "K", offsets_us: [-245] },
      { profile: "N", market: "Q", offsets_us: [-250] },
    ],
  };

  it("(fire, market) → 그 프로파일 · 시장 칸", () => {
    expect(launchPlanEntryOf(server, "q16", "Q")).toEqual({ profile: "Q16", market: "Q", offsets_us: [-350, -345, -325] });
    expect(launchPlanEntryOf(server, "n0930", "K")).toEqual({ profile: "N", market: "K", offsets_us: [-245] });
  });

  it("status 가 ok 가 아니거나 undefined · 칸이 없으면 null", () => {
    expect(launchPlanEntryOf(undefined, "q16", "Q")).toBeNull();
    expect(launchPlanEntryOf({ status: "offline" }, "q16", "Q")).toBeNull();
    expect(launchPlanEntryOf({ status: "failed", code: 1, message: "x" }, "q16", "Q")).toBeNull();
    expect(launchPlanEntryOf({ ...server, entries: [] }, "q16", "Q")).toBeNull();
  });
});

describe("launchPlanVerdictRows — 셀 = launchRibbonAt 그대로(D-28)", () => {
  const days = panelDays("KB120", "Q");

  it("KB120 코스닥 픽스처 — 4행 · 각 셀 = launchRibbonAt · 없는 쪽 null", () => {
    const cur = [-350, -345, -325];
    const next = [-340, -335, -322, -320];
    const rows = launchPlanVerdictRows(days, cur, next);
    expect(rows).toHaveLength(4);
    rows.forEach((r, i) => {
      expect(r.idx).toBe(i);
      expect(r.cur).toBe(cur[i] ?? null);
      expect(r.next).toBe(next[i] ?? null);
      expect(r.cur_cell).toEqual(cur[i] !== undefined ? launchRibbonAt(days, cur[i]!) : null);
      expect(r.next_cell).toEqual(launchRibbonAt(days, next[i]!));
    });
    expect(rows[3]).toMatchObject({ cur: null, cur_cell: null, next: -320 });
  });

  it("첨부 리본 표본(KB120 코스닥 −337 → 접수 5 · 거부 3 · 모름 2)과 같다", () => {
    const [row] = launchPlanVerdictRows(days, [-337], []);
    expect(row).toEqual({ idx: 0, cur: -337, next: null, cur_cell: { ok: 5, bad: 3, unknown: 2 }, next_cell: null });
  });

  it("둘 다 비면 빈 배열", () => {
    expect(launchPlanVerdictRows(days, [], [])).toEqual([]);
  });
});
