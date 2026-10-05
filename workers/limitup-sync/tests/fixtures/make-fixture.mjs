#!/usr/bin/env node
/**
 * limitup-sync 테스트 픽스처 생성기 — 실 export 하루를 종목 3개로 줄인 축소본.
 *
 * 원천: gh-trade 119 밤 export(로컬 사본 `~/ticks/research/export/<YYYYMMDD>` — 공개 시세 파생물).
 * 실행(저장소 루트에서, 한 번):
 *   node workers/limitup-sync/tests/fixtures/make-fixture.mjs ~/ticks/research/export/20261002
 * 출력: workers/limitup-sync/tests/fixtures/export/<날짜>/ (manifest.json · 6 ndjson.gz · grid/<isin>.json.gz 3개)
 * **CI 에서 돌리지 않는다** — 결과 파일을 커밋하고 테스트는 그 파일만 읽는다.
 *
 * 고르는 종목(20261002 기준 기본값 — 각 범주에서 격자 파일이 가장 작은 종목):
 *   - KR7263600009 덕우전자     — 깨진 잠김이 있다(locks.broke = true)
 *   - KR7069920007 엑시온그룹   — 깨짐 없이 잠김 유지(locks 전부 broke = false)
 *   - KR7308100007 형지글로벌   — 미도달(entries.reached = false)
 * 다른 종목을 쓰려면 원천 경로 뒤에 ISIN 3개를 인자로 준다(범주 검사는 그대로).
 *
 * 규칙: 6표를 그 isin 으로 거르고(행 순서 유지) gzip level 9(헤더 mtime 0)로 쓴다. manifest 는 원본 키를 그대로 두고
 * files 만 [6표 + 고른 격자 3개] 로 바꿔 rows · sha256 을 다시 계산한다(격자 rows = 원본 manifest 값 — 파일은 바이트 복사).
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

const TABLES = ["entries", "locks", "jumps", "member_alloc", "facts", "touches"];
const DEFAULT_ISINS = ["KR7263600009", "KR7069920007", "KR7308100007"];

const [src, ...isinArgs] = process.argv.slice(2);
if (!src) {
  console.error("usage: make-fixture.mjs <export-date-dir> [isin_broke isin_held isin_unreached]");
  process.exit(2);
}
const isins = isinArgs.length === 3 ? isinArgs : DEFAULT_ISINS;
const date = basename(src.replace(/\/+$/, ""));
const out = join(dirname(fileURLToPath(import.meta.url)), "export", date);

const read = (t) =>
  gunzipSync(readFileSync(join(src, `${t}.ndjson.gz`)))
    .toString("utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l));
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

const all = Object.fromEntries(TABLES.map((t) => [t, read(t)]));
const [broke, held, unreached] = isins;
const locksOf = (i) => all.locks.filter((r) => r.isin === i);
const entryOf = (i) => all.entries.find((r) => r.isin === i);
if (!locksOf(broke).some((r) => r.broke === true)) throw new Error(`${broke}: 깨진 잠김 없음`);
if (locksOf(held).length === 0 || locksOf(held).some((r) => r.broke === true)) throw new Error(`${held}: 유지 잠김 아님`);
if (!entryOf(unreached) || entryOf(unreached).reached !== false) throw new Error(`${unreached}: 미도달 아님`);

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "grid"), { recursive: true });

const want = new Set(isins);
const files = [];
for (const t of TABLES) {
  const rows = all[t].filter((r) => want.has(r.isin));
  const text = rows.map((r) => JSON.stringify(r) + "\n").join("");
  const gz = gzipSync(Buffer.from(text, "utf8"), { level: 9 });
  writeFileSync(join(out, `${t}.ndjson.gz`), gz);
  files.push({ name: `${t}.ndjson.gz`, rows: rows.length, sha256: sha(gz) });
}

const manifest = JSON.parse(readFileSync(join(src, "manifest.json"), "utf8"));
for (const isin of [...isins].sort()) {
  const name = `grid/${isin}.json.gz`;
  const orig = manifest.files.find((f) => f.name === name);
  if (!orig) throw new Error(`${name}: 원본 manifest 에 없음`);
  copyFileSync(join(src, name), join(out, name));
  files.push({ name, rows: orig.rows, sha256: sha(readFileSync(join(out, name))) });
}
manifest.files = files;
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");

console.log(JSON.stringify({ out, isins, files: files.map((f) => [f.name, f.rows]) }));
