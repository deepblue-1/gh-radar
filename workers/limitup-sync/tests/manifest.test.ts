import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  KNOWN_SCHEMA_VERSIONS,
  filesSig,
  listExportDates,
  readManifest,
  sha256File,
  verifyFiles,
  type Manifest,
} from "../src/manifest";

const FIXTURE = join(__dirname, "fixtures", "export");
const DATE = "20261002";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "limitup-manifest-"));
  cpSync(join(FIXTURE, DATE), join(dir, DATE), { recursive: true });
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function fixtureManifest(): Manifest {
  return JSON.parse(readFileSync(join(FIXTURE, DATE, "manifest.json"), "utf8")) as Manifest;
}

describe("listExportDates", () => {
  it("manifest 있는 YYYYMMDD 디렉터리만 오름차순 — .tmp · manifest 없음 · 다른 이름 무시", () => {
    mkdirSync(join(dir, "20261005.tmp"));
    writeFileSync(join(dir, "20261005.tmp", "manifest.json"), "{}");
    mkdirSync(join(dir, "20261003")); // manifest 없음 — 쓰는 중
    mkdirSync(join(dir, "20260930"));
    writeFileSync(join(dir, "20260930", "manifest.json"), "{}");
    mkdirSync(join(dir, "notes"));
    writeFileSync(join(dir, "20261004"), "file, not dir");
    expect(listExportDates(dir, "00000000")).toEqual(["20260930", DATE]);
  });

  it("sinceYmd 이전 날짜(보존 창 밖)는 제외", () => {
    mkdirSync(join(dir, "20260601"));
    writeFileSync(join(dir, "20260601", "manifest.json"), "{}");
    expect(listExportDates(dir, "20260701")).toEqual([DATE]);
  });
});

describe("KNOWN_SCHEMA_VERSIONS — 판 1 · 2 수용(quick-261006-ide)", () => {
  it("1 · 2 는 알고 0 · 3 은 모른다", () => {
    expect([...KNOWN_SCHEMA_VERSIONS]).toEqual([1, 2]);
    expect(KNOWN_SCHEMA_VERSIONS.has(3)).toBe(false);
    expect(KNOWN_SCHEMA_VERSIONS.has(0)).toBe(false);
  });
});

describe("readManifest", () => {
  it("픽스처 manifest — ok · schema_version 1 · 파일 바이트 sha256", () => {
    const r = readManifest(dir, DATE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.manifest.schema_version).toBe(1);
    expect(KNOWN_SCHEMA_VERSIONS.has(r.manifest.schema_version)).toBe(true);
    expect(r.manifest.files).toHaveLength(9);
    const bytes = readFileSync(join(dir, DATE, "manifest.json"));
    expect(r.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
  });

  it.each([
    ["깨진 JSON", "{not json", /manifest json/],
    ["files 없음", JSON.stringify({ schema_version: 1, date: DATE }), /files missing/],
    ["date 불일치", JSON.stringify({ schema_version: 1, date: "20261001", files: [] }), /date 20261001 != dir/],
    [
      "경로 탈출 이름",
      JSON.stringify({ schema_version: 1, date: DATE, files: [{ name: "../x.gz", rows: 1, sha256: "a".repeat(64) }] }),
      /bad file entry/,
    ],
  ])("%s → { ok: false, reason }(throw 아님)", (_label, body, re) => {
    writeFileSync(join(dir, DATE, "manifest.json"), body);
    const r = readManifest(dir, DATE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(re);
  });

  it("manifest 파일이 없으면 { ok: false }", () => {
    rmSync(join(dir, DATE, "manifest.json"));
    expect(readManifest(dir, DATE).ok).toBe(false);
  });
});

describe("filesSig", () => {
  it("finished_at 을 바꿔도 같다(Pitfall 9)", () => {
    const m = fixtureManifest();
    expect(filesSig({ ...m, finished_at: "2099-01-01T00:00:00" })).toBe(filesSig(m));
  });

  it("files 순서를 섞어도 같다", () => {
    const m = fixtureManifest();
    expect(filesSig({ files: [...m.files].reverse() })).toBe(filesSig(m));
  });

  it("파일 sha 하나가 바뀌면 달라진다", () => {
    const m = fixtureManifest();
    const files = m.files.map((f, i) => (i === 0 ? { ...f, sha256: "0".repeat(64) } : f));
    expect(filesSig({ files })).not.toBe(filesSig(m));
  });

  it("정의 = name 정렬 `name:sha256\\n` 연결의 sha256", () => {
    const files = [
      { name: "b.ndjson.gz", rows: 1, sha256: "b".repeat(64) },
      { name: "a.ndjson.gz", rows: 2, sha256: "a".repeat(64) },
    ];
    const expected = createHash("sha256")
      .update(`a.ndjson.gz:${"a".repeat(64)}\nb.ndjson.gz:${"b".repeat(64)}\n`)
      .digest("hex");
    expect(filesSig({ files })).toBe(expected);
  });
});

describe("verifyFiles", () => {
  it("픽스처 그대로면 빈 배열", async () => {
    expect(await verifyFiles(dir, DATE, fixtureManifest())).toEqual([]);
  });

  it("파일 1바이트 변조 → 그 이름", async () => {
    const p = join(dir, DATE, "locks.ndjson.gz");
    const buf = readFileSync(p);
    buf[buf.length - 1] ^= 0xff;
    writeFileSync(p, buf);
    expect(await verifyFiles(dir, DATE, fixtureManifest())).toEqual(["locks.ndjson.gz"]);
  });

  it("격자 파일이 없으면 그 이름", async () => {
    const m = fixtureManifest();
    const grid = m.files.find((f) => f.name.startsWith("grid/"))!;
    rmSync(join(dir, DATE, grid.name));
    expect(await verifyFiles(dir, DATE, m)).toEqual([grid.name]);
  });

  it("sha256File = 파일 바이트 sha256", async () => {
    const p = join(dir, DATE, "entries.ndjson.gz");
    expect(await sha256File(p)).toBe(createHash("sha256").update(readFileSync(p)).digest("hex"));
  });
});
