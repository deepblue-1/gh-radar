import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { dispatch } from "../src/index";
import { EXPORT_TABLES } from "../src/load";
import type { Manifest } from "../src/manifest";

/**
 * 28-03 · 28-06 dry-run 게이트의 자동화판 — 실데이터(~/ticks) 합계 리터럴 대신 불변식을 잠근다:
 *   dispatch dry-run totals == 선택된 날짜 manifest files[*].rows 의 표별 합.
 * 커밋된 픽스처를 두 날짜(보존 창 안)로 복사하고, 창 밖 옛 날짜 1개를 더 둬서 「선택된 날짜만」 합산됨을 같이 잠근다.
 */
const FIXTURE = join(__dirname, "fixtures", "export");
const SRC = "20261002";
const NOW = new Date("2026-10-05T12:20:00Z"); // 2026-10-05 21:20 KST — 보존 창(90일) 안: 20261001 · 20261002
const OLD = "20260101"; // since(≈2026-07-07) 이전 — 선택되면 안 된다
const ORIG = { ...process.env };

let dir: string;

function addDay(date: string) {
  cpSync(join(FIXTURE, SRC), join(dir, date), { recursive: true });
  const mp = join(dir, date, "manifest.json");
  const m = { ...(JSON.parse(readFileSync(mp, "utf8")) as Manifest), date };
  if (date !== SRC) {
    for (const f of m.files.filter((x) => x.name.startsWith("grid/"))) {
      const gp = join(dir, date, f.name);
      const g = JSON.parse(gunzipSync(readFileSync(gp)).toString("utf8")) as { date: string };
      const bytes = gzipSync(JSON.stringify({ ...g, date }));
      writeFileSync(gp, bytes);
      f.sha256 = createHash("sha256").update(bytes).digest("hex");
    }
  }
  writeFileSync(mp, JSON.stringify(m, null, 1));
}

const manifestRows = (date: string, tbl: string): number =>
  (JSON.parse(readFileSync(join(dir, date, "manifest.json"), "utf8")) as Manifest).files
    .filter((f) => f.name === `${tbl}.ndjson.gz`)
    .reduce((s, f) => s + (f.rows ?? 0), 0);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "limitup-dryrun-totals-"));
  process.env.LIMITUP_EXPORT_DIR = dir;
  process.env.LOG_LEVEL = "silent";
  delete process.env.LIMITUP_KEEP_DAYS;
  delete process.env.LIMITUP_SKIP_DATES;
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  process.env = { ...ORIG };
});

describe("dispatch dry-run — 합계 == manifest rows 합 (28-03 · 28-06 게이트)", () => {
  it("선택된 날짜들의 6 export 표 합계가 manifest files[*].rows 의 표별 합과 같다 (창 밖 날짜 제외)", async () => {
    addDay("20261001");
    addDay(SRC);
    addDay(OLD);

    const out = await dispatch({ dryRun: true, now: NOW });

    expect(out.dryRun).toBe(true);
    expect(out.dates).toEqual(["20261001", SRC]);
    expect(out.skipped).toEqual({ schema: [], sha: [], manifest: [], unchanged: [] });
    expect(out.failed).toEqual([]);
    expect(out.freshness.stale).toBe(false);
    expect(Object.keys(out.rows).sort()).toEqual(["20261001", SRC]); // dry-run 은 loaded 를 채우지 않고 rows 만 낸다
    for (const tbl of EXPORT_TABLES) {
      const expected = out.dates.reduce((s, d) => s + manifestRows(d, tbl), 0);
      expect(expected, `${tbl} 픽스처 manifest 합이 0 이면 단언이 공허하다`).toBeGreaterThan(0);
      expect(out.totals[tbl], `totals.${tbl}`).toBe(expected);
      // 날짜별 행 수도 그 날짜 manifest 와 같다
      for (const d of out.dates) expect(out.rows[d][tbl], `rows[${d}].${tbl}`).toBe(manifestRows(d, tbl));
    }
    // 창 밖 날짜는 합계에 안 섞인다 — 단일 날짜 합의 정확히 2배(두 날짜가 같은 픽스처 사본)
    expect(out.totals.entries).toBe(2 * manifestRows(SRC, "entries"));
  });
});
