#!/usr/bin/env tsx
/**
 * Phase 35 Plan 03 — D-07 ~ D-10 발사 조각 · 머리 백필 CLI: 파일 → `launch_backfill_apply` RPC.
 *
 * 파싱 · 계획(머리 = shared launchHeadOf) · RPC 청크는 `relay/src/tools/launch-backfill.ts` 가 하고, 이 스크립트는
 * 인자 · env · 출력만 한다(export-accum-backfill.ts · migrate-dma-users.ts 패턴).
 *
 * 실행 (relay 워크스페이스로 — tsx · supabase-js 가 relay/node_modules 에만 있다. shared 는 dist 를 읽으니 먼저 빌드):
 *   pnpm --filter @gh-radar/relay exec tsx ../scripts/launch-backfill.ts --file <pieces.json|.ndjson>   # dry-run (기본 · env 불필요)
 *   bash scripts/launch-backfill.sh --file <경로> --apply                                             # 실제 적재(메인 세션)
 *   pnpm --filter @gh-radar/relay exec tsx ../scripts/launch-backfill.ts --help
 *
 * dry-run 은 Supabase 클라이언트를 만들지 않는다 — 원격 접촉 0. 출력 = 파일별 행 · 거부 수, 묶음(날짜 × 서버 × 시장 ×
 * 발사 기준)별 조각 수, 끝 줄 「합계: 조각 n · 머리 h · 날짜 d · 중복 x · 거부 r」.
 * 출력 위생: 키 · URL 을 출력하지 않는다. 빠진 env 는 이름만 낸다.
 * exit: 0 성공 · 1 오류 · 64 사용법.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseLaunchFile, planLaunchBackfill, type LaunchReject } from "../relay/src/tools/launch-backfill.js";
import type { LaunchPieceInput } from "@gh-radar/shared";

const USAGE = [
  "사용법: pnpm --filter @gh-radar/relay exec tsx ../scripts/launch-backfill.ts --file <경로> [--file <경로> …]",
  "  --file <경로>  첨부 pieces.json(배열) 또는 gh-trade ndjson(.ndjson · .jsonl) — 여러 번 · 상대 경로는 호출 cwd 기준",
  "  --help         이 도움말",
  "기본은 dry-run — 원격에 닿지 않고 계획만 찍는다.",
].join("\n");

const EXIT_USAGE = 64;

function fail(message: string, code = 1): never {
  console.error(`오류: ${message}`);
  process.exit(code);
}

/** 상대 `--file` 의 기준 — 래퍼는 `LAUNCH_BACKFILL_CWD`(사용자가 명령을 친 cwd), 직접 실행은 process.cwd(). */
const CALLER_CWD = process.env.LAUNCH_BACKFILL_CWD || process.cwd();

type Args = { files: string[]; help: boolean };

function parseArgs(argv: string[]): Args {
  const out: Args = { files: [], help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--file") {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) fail(`${a} 에 값이 없습니다\n${USAGE}`, EXIT_USAGE);
      i++;
      out.files.push(resolve(CALLER_CWD, v));
    } else fail(`알 수 없는 인자: ${a}\n${USAGE}`, EXIT_USAGE);
  }
  return out;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }
  if (args.files.length === 0) fail(`--file 이 최소 1개 필요합니다\n${USAGE}`, EXIT_USAGE);

  const pieces: LaunchPieceInput[] = [];
  const rejects: LaunchReject[] = [];
  for (const file of args.files) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      fail(`파일을 읽지 못했습니다: ${file}`);
    }
    const r = parseLaunchFile(file, text);
    console.log(`${file}: 행 ${r.pieces.length + r.rejects.length} · 거부 ${r.rejects.length}`);
    for (const rej of r.rejects) console.log(`  거부 ${rej.where}: ${rej.reason}`);
    pieces.push(...r.pieces);
    rejects.push(...r.rejects);
  }

  const plan = planLaunchBackfill(pieces);
  for (const g of plan.groups) {
    console.log(`${g.trade_date} ${g.gateway} ${g.market} ${g.profile} ${g.fire_exchange} ${g.fire_base} 조각 ${g.pieces}`);
  }
  const days = new Set(plan.pieces.map((p) => p.trade_date)).size;
  console.log(
    `합계: 조각 ${plan.pieces.length} · 머리 ${plan.heads.length} · 날짜 ${days} · 중복 ${plan.duplicates} · 거부 ${rejects.length}`,
  );
}

try {
  main();
} catch (err) {
  fail(err instanceof Error ? err.message : "예상하지 못한 실패");
}
