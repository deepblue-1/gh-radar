import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeFakeSupabase } from "./helpers/fake-supabase";
import { GRID_BUCKET, GRID_NAME_RE, gridObjectPath, readGridGz, uploadGrids } from "../src/grid";

const DAY = join(__dirname, "fixtures", "export", "20261002");
const ISINS = ["KR7069920007", "KR7263600009", "KR7308100007"];

describe("readGridGz", () => {
  it("원 바이트 그대로 + 해제 · 파싱 결과", () => {
    const p = join(DAY, "grid", `${ISINS[0]}.json.gz`);
    const { bytes, json } = readGridGz(p);
    expect(bytes.equals(readFileSync(p))).toBe(true);
    expect(json).toMatchObject({ date: "20261002", isin: ISINS[0], coarse: { step_s: 10 } });
  });
});

describe("GRID_NAME_RE · gridObjectPath", () => {
  it("manifest 격자 이름만 잡는다 · 객체 경로 grid/<date>/<isin>.json.gz", () => {
    expect(GRID_NAME_RE.exec("grid/KR7069920007.json.gz")?.[1]).toBe("KR7069920007");
    expect(GRID_NAME_RE.test("entries.ndjson.gz")).toBe(false);
    expect(GRID_NAME_RE.test("grid/../x.json.gz")).toBe(false);
    expect(gridObjectPath("20261002", "KR7069920007")).toBe("grid/20261002/KR7069920007.json.gz");
  });
});

describe("uploadGrids", () => {
  const grids = ISINS.map((isin) => ({ isin, bytes: readGridGz(join(DAY, "grid", `${isin}.json.gz`)).bytes }));

  it("버킷 limitup-grid · 경로 · contentType application/gzip · upsert true · 바이트 동일 · 순서대로", async () => {
    const fake = makeFakeSupabase();
    expect(await uploadGrids(fake.sb, "20261002", grids)).toBe(3);
    expect(fake.calls).toHaveLength(3);
    for (const [i, c] of fake.calls.entries()) {
      if (c.kind !== "storage") throw new Error("storage 호출이 아니다");
      expect(c.bucket).toBe(GRID_BUCKET);
      expect(c.op).toBe("upload");
      const [path, body, options] = c.args as [string, Buffer, Record<string, unknown>];
      expect(path).toBe(`grid/20261002/${ISINS[i]}.json.gz`);
      expect(Buffer.compare(body, grids[i].bytes)).toBe(0);
      expect(options).toEqual({ contentType: "application/gzip", upsert: true });
    }
  });

  it("업로드 error → 경로 · 메시지를 담아 throw · 뒤 파일은 올리지 않는다", async () => {
    const fake = makeFakeSupabase({
      storage: (_b, op, args) => (op === "upload" && String(args[0]).includes(ISINS[1]) ? { error: { message: "quota" } } : undefined),
    });
    await expect(uploadGrids(fake.sb, "20261002", grids)).rejects.toThrow(
      `storage upload limitup-grid/grid/20261002/${ISINS[1]}.json.gz: quota`,
    );
    expect(fake.calls).toHaveLength(2);
  });
});
