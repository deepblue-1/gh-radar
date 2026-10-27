#!/usr/bin/env tsx
/**
 * Phase 35 Plan 03 — D-07 ~ D-10 발사 조각 · 머리 백필 CLI: 파일 → `launch_backfill_apply` RPC
 * (+ 원격 상태 `--status` · Wave B 재해석 `--reproject`).
 *
 * 파싱 · 계획(머리 = shared launchHeadOf) · RPC 청크 · 상태 · 재투영은 `relay/src/tools/launch-backfill.ts` 가 하고,
 * 이 스크립트는 인자 · env · 출력만 한다(export-accum-backfill.ts · migrate-dma-users.ts 패턴).
 *
 * 실행 (relay 워크스페이스로 — tsx · supabase-js 가 relay/node_modules 에만 있다. shared 는 dist 를 읽으니 먼저 빌드):
 *   pnpm --filter @gh-radar/relay exec tsx ../scripts/launch-backfill.ts --file <pieces.json|.ndjson>   # dry-run (기본 · env 불필요)
 *   bash scripts/launch-backfill.sh --file <경로> [--date YYYYMMDD …] --apply                          # 실제 적재(메인 세션)
 *   bash scripts/launch-backfill.sh --status                                                           # 원격 날짜 · 조각 · 머리 수(읽기 전용)
 *   bash scripts/launch-backfill.sh --reproject [--from YYYYMMDD] [--to YYYYMMDD] [--apply]            # Wave B 재해석
 *   필수 env(--apply · --status · --reproject): SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY
 *
 * 파일 dry-run 은 Supabase 클라이언트를 만들지 않는다 — 원격 접촉 0. 출력 = 파일별 행 · 거부 수, 묶음(날짜 × 서버 ×
 * 시장 × 발사 기준)별 조각 수, 끝 줄 「합계: 조각 n · 머리 h · 날짜 d · 중복 x · 거부 r」.
 * 쓰기는 `--apply` 뿐이다 — 파일 모드는 launch_backfill_apply, `--reproject --apply` 는 launch_reproject.
 * 출력 위생: 키 · URL 을 출력하지 않는다. 빠진 env 는 이름만 낸다. Supabase 오류는 code(우리 RAISE 만 메시지).
 * exit: 0 성공 · 1 오류 · 64 사용법(모드 섞기 포함).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  applyLaunchBackfill,
  launchStatusOf,
  parseLaunchFile,
  planLaunchBackfill,
  reprojectLaunch,
  type LaunchReject,
} from "../relay/src/tools/launch-backfill.js";
import { createRelaySupabase } from "../relay/src/store/supabase.js";
import type { LaunchPieceInput } from "@gh-radar/shared";

const USAGE = [
  "사용법:",
  "  launch-backfill.ts --file <경로> [--file <경로> …] [--date YYYYMMDD …] [--apply]   # 파일 백필(기본 dry-run)",
  "  launch-backfill.ts --status                                                        # 원격 상태(읽기 전용)",
  "  launch-backfill.ts --reproject [--from YYYYMMDD] [--to YYYYMMDD] [--apply]         # kind 17·18 재해석",
  "  --file <경로>      첨부 pieces.json(배열) 또는 gh-trade ndjson(.ndjson · .jsonl) — 여러 번 · 상대 경로는 호출 cwd 기준",
  "  --date YYYYMMDD    그 날짜 조각만(여러 번)",
  "  --apply            실제로 쓴다(파일 = launch_backfill_apply 500행 청크 · --reproject = launch_reproject)",
  "  --status           launch_map_for_admin(q16 · n0930, 전체)으로 원격 날짜 · 조각 · 머리 수",
  "  --reproject        dry-run 은 kind 17·18 원문 수만 센다 · --apply 와 함께일 때만 launch_reproject",
  "  --from / --to      --reproject 범위(YYYYMMDD · 포함)",
  "  --help             이 도움말",
  "env(--apply · --status · --reproject): SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY — 래퍼 scripts/launch-backfill.sh 가 주입",
  "모드(--file · --status · --reproject)는 섞지 않는다. 파일 dry-run 은 원격에 닿지 않는다.",
].join("\n");

const EXIT_USAGE = 64;

function fail(message: string, code = 1): never {
  console.error(`오류: ${message}`);
  process.exit(code);
}

function usage(message: string): never {
  fail(`${message}\n${USAGE}`, EXIT_USAGE);
}

/** 상대 `--file` 의 기준 — 래퍼는 `LAUNCH_BACKFILL_CWD`(사용자가 명령을 친 cwd), 직접 실행은 process.cwd(). */
const CALLER_CWD = process.env.LAUNCH_BACKFILL_CWD || process.cwd();

type Args = {
  files: string[];
  dates: string[];
  apply: boolean;
  status: boolean;
  reproject: boolean;
  from?: string;
  to?: string;
  help: boolean;
};

function parseArgs(argv: string[]): Args {
  const out: Args = { files: [], dates: [], apply: false, status: false, reproject: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--apply") out.apply = true;
    else if (a === "--status") out.status = true;
    else if (a === "--reproject") out.reproject = true;
    else if (a === "--file" || a === "--date" || a === "--from" || a === "--to") {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) usage(`${a} 에 값이 없습니다`);
      i++;
      if (a === "--file") out.files.push(resolve(CALLER_CWD, v));
      else {
        if (!/^\d{8}$/.test(v)) usage(`${a} 형식 오류: ${v} (YYYYMMDD)`);
        if (a === "--date") {
          if (!out.dates.includes(v)) out.dates.push(v);
        } else if (a === "--from") out.from = v;
        else out.to = v;
      }
    } else usage(`알 수 없는 인자: ${a}`);
  }
  return out;
}

function supabaseFromEnv() {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const missing = [url === "" ? "SUPABASE_URL" : "", key === "" ? "SUPABASE_SERVICE_ROLE_KEY" : ""].filter((s) => s !== "");
  // 이름만 — 값은 어떤 경로로도 찍지 않는다.
  if (missing.length > 0) fail(`env 가 비어 있습니다: ${missing.join(" · ")}`);
  return createRelaySupabase(url, key);
}

async function runFiles(args: Args): Promise<void> {
  const pieces: LaunchPieceInput[] = [];
  const rejects: LaunchReject[] = [];
  const unknownKeys = new Set<string>();
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
    for (const k of r.unknownKeys) unknownKeys.add(k);
    pieces.push(...r.pieces);
    rejects.push(...r.rejects);
  }
  if (unknownKeys.size > 0) console.log(`모르는 키: ${[...unknownKeys].sort().join(" · ")}`);

  const plan = planLaunchBackfill(pieces, { dates: args.dates });
  if (args.dates.length > 0) console.log(`날짜 필터: ${args.dates.join(" · ")}`);
  for (const g of plan.groups) {
    console.log(`${g.trade_date} ${g.gateway} ${g.market} ${g.profile} ${g.fire_exchange} ${g.fire_base} 조각 ${g.pieces}`);
  }
  const days = new Set(plan.pieces.map((p) => p.trade_date)).size;
  console.log(
    `합계: 조각 ${plan.pieces.length} · 머리 ${plan.heads.length} · 날짜 ${days} · 중복 ${plan.duplicates} · 거부 ${rejects.length}`,
  );

  if (!args.apply) {
    console.log("dry-run — 쓰지 않았습니다(--apply 로 적재)");
    return;
  }
  const sb = supabaseFromEnv();
  const res = await applyLaunchBackfill(sb, plan);
  console.log(`적재: 조각 ${res.pieces_written}/${plan.pieces.length} · 머리 ${res.heads_written}/${plan.heads.length} · RPC ${res.calls}회`);
}

async function runStatus(): Promise<void> {
  const sb = supabaseFromEnv();
  for (const s of await launchStatusOf(sb)) {
    console.log(`[${s.fire}] 날짜 ${s.days} · 조각 ${s.pieces} · 최신 머리 ${s.heads}`);
    for (const d of s.byDay) console.log(`  ${d.trade_date} ${d.gateway} ${d.market} 조각 ${d.pieces}`);
  }
}

async function runReproject(args: Args): Promise<void> {
  const sb = supabaseFromEnv();
  const range = `${args.from ?? "처음"} ~ ${args.to ?? "끝"}`;
  const res = await reprojectLaunch(sb, { from: args.from, to: args.to, apply: args.apply });
  if (res.mode === "dry") {
    console.log(`재해석 dry-run (${range}): kind 17·18 원문 ${res.events}건 — 쓰지 않았습니다(--apply 로 launch_reproject)`);
  } else {
    console.log(`재해석 (${range}): projected ${res.projected} · errors ${res.errors.length}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }
  const modes = [args.files.length > 0, args.status, args.reproject].filter(Boolean).length;
  if (modes === 0) usage("--file · --status · --reproject 중 하나가 필요합니다");
  if (modes > 1) usage("모드(--file · --status · --reproject)는 섞을 수 없습니다");
  if (!args.reproject && (args.from || args.to)) usage("--from · --to 는 --reproject 에서만 씁니다");
  if (args.files.length === 0 && args.dates.length > 0) usage("--date 는 --file 모드에서만 씁니다");
  if (args.status && args.apply) usage("--status 는 읽기 전용입니다(--apply 와 함께 쓸 수 없습니다)");

  if (args.status) await runStatus();
  else if (args.reproject) await runReproject(args);
  else await runFiles(args);
}

main().catch((err) => fail(err instanceof Error ? err.message : "예상하지 못한 실패"));
