#!/usr/bin/env node
/**
 * limitup-sync accum_flow 테스트 픽스처 생성기 — 10/14 맥 샘플 34행에서 6행만 고른 축소본(Phase 34 D-05).
 *
 * 원천: gh-trade 모델 판정 샘플(`~/ticks/accum-flow-sample/20261014/accum_flow-34.ndjson.gz` ·
 *   sha256 1f633270df99b15d59dafc8ec91762e9cea4c174e6502c9f1f82faaba74d2a5e — 인박스 261020-accum-flow-export.md 「샘플」).
 * 실행(저장소 루트에서, 한 번):
 *   node workers/limitup-sync/tests/fixtures/make-accum-fixture.mjs [원천 .ndjson.gz]
 * 출력: workers/limitup-sync/tests/fixtures/accum_flow/20261014/accum_flow.ndjson.gz (6행)
 *   — 워커 dispatch 테스트 · 웹 · E2E 픽스처의 공용 원천. `tests/fixtures/export/` 아래에는 아무것도 쓰지 않는다
 *   (load.test 가 그 디렉터리를 훑는다).
 * **CI 에서 돌리지 않는다** — 결과 파일을 커밋하고 테스트는 그 파일만 읽는다. 끝에 rows · sha256 을 출력한다
 *   (그 sha256 = dispatch.test.ts 의 AF_SHA).
 *
 * 고르는 종목(원천 순서 = isin 오름차순 유지):
 *   - KR7000650002 천일고속         — 상한가 · orders 45 · first 1(인박스 샘플 행)
 *   - KR7011151008 CJ씨푸드1우      — orders 0 · pnl null(빈 자료 경로)
 *   - KR7084670009 동양고속         — 미도달
 *   - KR7452280001 한선엔지니어링   — 최대 행(json ≈ 224KB · price 3,648 · orders 501 · day_cum_net 6,513)
 *   - KRA0113321F5 (name null)      — name null
 *   - KYG2114A1094 씨엑스아이       — 비 KR ISIN
 *
 * 규칙: 줄 원문을 **재직렬화 없이** 그대로 고른다(JSON.parse 는 isin 판별에만 — 원문 바이트 · 키 순서 · 숫자 표기 보존).
 *   줄 끝마다 "\n" 으로 잇고 gzip level 9(헤더 mtime 0)로 쓴다. 6개가 다 없으면 exit 1.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

const ISINS = ["KR7000650002", "KR7011151008", "KR7084670009", "KR7452280001", "KRA0113321F5", "KYG2114A1094"];
const DEFAULT_SRC = join(homedir(), "ticks/accum-flow-sample/20261014/accum_flow-34.ndjson.gz");

const src = process.argv[2] ?? DEFAULT_SRC;
const out = join(dirname(fileURLToPath(import.meta.url)), "accum_flow", "20261014", "accum_flow.ndjson.gz");

const want = new Set(ISINS);
const lines = gunzipSync(readFileSync(src))
  .toString("utf8")
  .split("\n")
  .filter((l) => l.trim() !== "");
const picked = lines.filter((l) => want.has(JSON.parse(l).isin));
const got = picked.map((l) => JSON.parse(l).isin);
const missing = ISINS.filter((i) => !got.includes(i));
if (missing.length > 0 || picked.length !== ISINS.length) {
  console.error(`missing isin: ${missing.join(", ") || "(dup)"} — picked ${picked.length}/${ISINS.length}`);
  process.exit(1);
}

const text = picked.map((l) => l + "\n").join("");
const gz = gzipSync(Buffer.from(text, "utf8"), { level: 9 });
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, gz);

const sha256 = createHash("sha256").update(gz).digest("hex");
console.log(JSON.stringify({ out, rows: picked.length, isins: got, sha256 }));
