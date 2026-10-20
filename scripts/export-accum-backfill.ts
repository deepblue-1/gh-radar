#!/usr/bin/env tsx
/**
 * Phase 34 Plan 02 — D-23 매집감지 소급 내보내기: `dma_strategy_events` kind 16(KYOBO119) → `<out>/<YYYYMMDD>.jsonl`.
 *
 * 한 줄 = gh-trade 인박스 261020 「소급 목록 파일 형식」 23키(`teamflow_accum.EVENT_KEYS_REQUIRED`). 매핑 · 조회 · 파일 쓰기는
 * `relay/src/store/accum-backfill.ts` 가 하고, 이 스크립트는 인자 · env · 출력만 한다(migrate-dma-users.ts 패턴).
 *
 * 실행 (relay 워크스페이스로 — tsx · supabase-js 가 relay/node_modules 에만 있다):
 *   bash scripts/export-accum-backfill.sh --date 20261019 --date 20261020             # 래퍼 — env 파일을 비출력으로 주입
 *   pnpm --filter @gh-radar/relay exec tsx ../scripts/export-accum-backfill.ts --help  # 사용법(env 불필요)
 *   필수 env: SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY (kind 16 은 서비스롤로 읽는다)
 *
 * 읽기 전용: select 만 한다 — insert/update/delete/upsert/rpc 호출 0.
 * 출력 위생: 키 · URL · 행 값을 출력하지 않는다. Supabase 오류는 code 만(PostgREST details 에 행 값이 실릴 수 있다).
 *   빠진 env 는 이름만 낸다. 출력 = 날짜마다 미리보기 count 한 줄 + 「경로 · 행 · isin · since/reg 결측」 한 줄.
 * exit: 0 = 모든 날짜 성공 · 1 = 인자/env 오류 또는 한 날짜라도 실패(실패해도 다음 날짜는 계속한다).
 *
 * 전달(메인 세션 · 34-11): 경로 + 행 수를 gh-trade 세션에 SendMessage → gh-trade 가 119 `~/ticks/accum-backfill/<D>.jsonl`
 * 로 옮겨 `tickana.batch --date D --accum-events <file> --ticks ~/ticks` 실행(확인 문자열 `stage=accum_flow reason=backfill`).
 */
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { exportAccumBackfillDay } from "../relay/src/store/accum-backfill.js";
import { createRelaySupabase } from "../relay/src/store/supabase.js";

const DEFAULT_OUT = join(homedir(), "ticks", "accum-backfill");

const USAGE = [
  "사용법: pnpm --filter @gh-radar/relay exec tsx ../scripts/export-accum-backfill.ts --date YYYYMMDD [--date YYYYMMDD …] [--out <dir>] [--force]",
  "  --date YYYYMMDD  내보낼 KST 거래일(여러 번 · 최소 1 · 중복은 한 번만)",
  `  --out <dir>      출력 디렉터리(기본 ${DEFAULT_OUT}) — 파일은 <dir>/<YYYYMMDD>.jsonl · 상대 경로는 호출한 cwd 기준`,
  "  --force          같은 이름 파일이 있으면 덮어쓴다(없으면 거부)",
  "  --help           이 도움말",
  "env: SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY (필수 · 래퍼 scripts/export-accum-backfill.sh 가 주입)",
  "읽기 전용 — dma_strategy_events kind 16 · gateway KYOBO119 를 select 만 한다.",
].join("\n");

function fail(message: string): never {
  console.error(`오류: ${message}`);
  process.exit(1);
}

type Args = { dates: string[]; out: string; force: boolean; help: boolean };

/**
 * 상대 `--out` 의 기준 = 사용자가 명령을 친 cwd(34 WR-04). `pnpm --filter … exec` 는 relay/ 에서 돌아 process.cwd() 가
 * relay/ 다 — 래퍼는 `ACCUM_BACKFILL_CWD`, pnpm 직접 실행은 `INIT_CWD`(pnpm 이 호출 cwd 를 넣는다)를 쓴다.
 */
const CALLER_CWD = process.env.ACCUM_BACKFILL_CWD || process.env.INIT_CWD || process.cwd();

function parseArgs(argv: string[]): Args {
  const out: Args = { dates: [], out: DEFAULT_OUT, force: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--force") out.force = true;
    else if (a === "--date" || a === "--out") {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) fail(`${a} 에 값이 없습니다\n${USAGE}`);
      i++;
      if (a === "--out") out.out = resolve(CALLER_CWD, v);
      else {
        if (!/^\d{8}$/.test(v)) fail(`--date 형식 오류: ${v} (YYYYMMDD)`);
        if (!out.dates.includes(v)) out.dates.push(v);
      }
    } else fail(`알 수 없는 인자: ${a}\n${USAGE}`);
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }
  if (args.dates.length === 0) fail(`--date 가 최소 1개 필요합니다\n${USAGE}`);

  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const missing = [url === "" ? "SUPABASE_URL" : "", key === "" ? "SUPABASE_SERVICE_ROLE_KEY" : ""].filter((s) => s !== "");
  if (missing.length > 0) fail(`env 가 비어 있습니다: ${missing.join(" · ")}`);

  const sb = createRelaySupabase(url, key);
  let failed = 0;
  for (const date of args.dates) {
    try {
      const res = await exportAccumBackfillDay({
        sb,
        date,
        outDir: args.out,
        force: args.force,
        onPreview: (n) => console.log(`${date}: 미리보기 ${n}행 (kind 16 · KYOBO119)`),
      });
      console.log(
        `${date}: ${res.path} · 행 ${res.rows} · isin ${res.isins} · since 결측 ${res.missingSince} · reg 결측 ${res.missingReg}`,
      );
    } catch (err) {
      failed++;
      // exportAccumBackfillDay 의 메시지는 날짜 · 계수 · 경로 · code 만 담는다(행 값 · 키 없음).
      console.error(`오류: ${date}: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }
  if (failed > 0) {
    console.error(`오류: ${failed}/${args.dates.length} 날짜 실패`);
    process.exit(1);
  }
}

main().catch(() => fail("예상하지 못한 실패"));
