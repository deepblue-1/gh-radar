/**
 * export 날짜 디렉터리 · manifest 읽기(gh-trade 인박스 「(C)」 계약).
 *
 * `<dir>/<YYYYMMDD>/manifest.json` = `{ schema_version, date, finished_at, files: [{ name, rows, sha256 }], … }`.
 * manifest 는 119 가 마지막에 rename 으로 놓는 완료 표시다 — manifest 없는 날짜 · `.tmp` 디렉터리는 보지 않는다.
 *
 * 「바뀐 날짜」 판정 값은 manifest 파일 sha 가 아니라 `filesSig` 다 — manifest 에는 `finished_at`(실행 시각)이
 * 있어 같은 데이터의 재처리마다 파일 sha 가 바뀐다(RESEARCH Pitfall 9).
 */
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** 아는 export schema_version — 다른 값이면 그 날짜를 적재하지 않는다(28-16 이 skip 으로 바꾼다). */
export const KNOWN_SCHEMA_VERSION = 1;

export type ManifestFile = { name: string; rows: number; sha256: string };

export type Manifest = {
  schema_version: number;
  date: string;
  finished_at?: string;
  files: ManifestFile[];
  [key: string]: unknown;
};

export type ManifestRead =
  | { ok: true; manifest: Manifest; sha256: string }
  | { ok: false; reason: string };

const DATE_RE = /^\d{8}$/;
const SHA_RE = /^[0-9a-f]{64}$/;
// files[].name 은 날짜 디렉터리 안 상대 경로만(`grid/<isin>.json.gz` 포함) — `..` · 절대 경로 거부.
const NAME_RE = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/;

/** manifest 가 있는 `YYYYMMDD` 디렉터리 중 `>= sinceYmd` 인 것, 오름차순. `.tmp` · 다른 이름은 무시. */
export function listExportDates(dir: string, sinceYmd: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && DATE_RE.test(e.name) && e.name >= sinceYmd)
    .map((e) => e.name)
    .filter((name) => existsSync(join(dir, name, "manifest.json")))
    .sort();
}

/** manifest 파싱 + 필수 키 검사. 깨진 manifest 는 throw 가 아니라 `{ ok: false, reason }`. */
export function readManifest(dir: string, date: string): ManifestRead {
  let bytes: Buffer;
  try {
    bytes = readFileSync(join(dir, date, "manifest.json"));
  } catch (err) {
    return { ok: false, reason: `manifest unreadable: ${(err as Error).message}` };
  }
  let m: unknown;
  try {
    m = JSON.parse(bytes.toString("utf8"));
  } catch (err) {
    return { ok: false, reason: `manifest json: ${(err as Error).message}` };
  }
  if (typeof m !== "object" || m === null || Array.isArray(m)) return { ok: false, reason: "manifest not an object" };
  const o = m as Record<string, unknown>;
  if (typeof o.schema_version !== "number") return { ok: false, reason: "manifest schema_version missing" };
  if (o.date !== date) return { ok: false, reason: `manifest date ${String(o.date)} != dir ${date}` };
  if (!Array.isArray(o.files)) return { ok: false, reason: "manifest files missing" };
  for (const f of o.files as unknown[]) {
    const ff = f as Record<string, unknown> | null;
    if (
      !ff ||
      typeof ff.name !== "string" ||
      !NAME_RE.test(ff.name) ||
      ff.name.split("/").includes("..") ||
      !Number.isInteger(ff.rows) ||
      (ff.rows as number) < 0 ||
      typeof ff.sha256 !== "string" ||
      !SHA_RE.test(ff.sha256)
    ) {
      return { ok: false, reason: `manifest bad file entry: ${JSON.stringify(f)}` };
    }
  }
  return { ok: true, manifest: o as Manifest, sha256: createHash("sha256").update(bytes).digest("hex") };
}

/** files[] 를 name 정렬 → `name:sha256\n` 연결 → sha256 hex. finished_at · files 순서와 무관. */
export function filesSig(m: Pick<Manifest, "files">): string {
  const lines = [...m.files]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((f) => `${f.name}:${f.sha256}\n`)
    .join("");
  return createHash("sha256").update(lines).digest("hex");
}

/** 파일 sha256 hex(스트림 — 큰 파일도 메모리에 다 올리지 않는다). */
export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(path)
      .on("error", reject)
      .on("data", (chunk) => h.update(chunk))
      .on("end", () => resolve(h.digest("hex")));
  });
}

/** manifest files[] 중 없는 파일 · sha256 불일치 파일 이름(빈 배열 = 전부 일치). */
export async function verifyFiles(dir: string, date: string, m: Pick<Manifest, "files">): Promise<string[]> {
  const bad: string[] = [];
  for (const f of m.files) {
    const p = join(dir, date, f.name);
    if (!existsSync(p)) {
      bad.push(f.name);
      continue;
    }
    if ((await sha256File(p)) !== f.sha256) bad.push(f.name);
  }
  return bad;
}
