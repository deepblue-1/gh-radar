import "dotenv/config";
import zlib from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ConfigError, loadConfig, type Config } from "./config";
import { logger } from "./logger";
import { createSupabaseClient } from "./services/supabase";
import { createSupabaseGridStore, type GridStore } from "./store";
import { UsageError, parseRequestArgs, runRequest, type JobDeps } from "./modes/request";
import { parseNightlyArgs, runNightly } from "./modes/nightly";
import { parsePromoteArgs, runPromote } from "./modes/promote";

/**
 * tick-convert entry — Cloud Run Job `gh-radar-tick-convert`. GCS 원본 아카이브(119 부하 0)를 종목·날짜 격자로 바꾸는
 * 유일한 생산자(D-03 · D-04 · D-19). limitup-sync 뼈대(config · logger · 실패 격리 · 종료 코드)를 따른다.
 *
 * CLI: `node dist/index.js <mode> [args]` — 모드 표 `MODES` 하나로 고른다:
 *   request --date YYYYMMDD --ex KRX|NXT   — 요청 변환(modes/request.ts)
 *   nightly [--date YYYYMMDD]               — 밤 변환(modes/nightly.ts · 이미지 기본 CMD)
 *   promote [--date YYYYMMDD]               — 20:00 승격(modes/promote.ts · tickgw 당일 캐시 → 승격 격자 · 37-12)
 * 이미지는 `ENTRYPOINT ["node", "dist/index.js"]` + `CMD ["nightly"]` 다 — Cloud Run args 오버라이드는 CMD 만 바꾸므로
 * 요청 변환 · 스모크 · 승격 Job 도 늘 `node dist/index.js <모드> …` 로 돈다(Dockerfile 머리 주석 · tests/entry.test.ts).
 *
 * 종료 코드: 0 정상(NO_RECORDS · NO_OBJECTS · 미룬 날짜 포함) · 1 실패 종목 · 실패 날짜 · purge 실패 · 예외 ·
 * 2 잘못된 인자 · 모르는 모드 · 설정 오류(ConfigError — 공인 TICKGW_URL · promote 에 TICKGW 설정 없음) · Node zstd 없음(Pitfall 4 —
 * 이미지가 22.15 미만이면 `zlib.zstdCompressSync` 가 없다. 기동 즉시 끝내 잘못된 이미지가 요청을 running 으로 붙잡지 않게).
 * vitest import 시에는 main() 미실행 — CLI 진입점만 동작.
 */

/** 모드 실행 결과 — `failed > 0` 이면 종료 1. */
export type ModeOutcome = { failed: number };

/** 모드 표 — 인자 파싱(UsageError → 종료 2) + 실행. */
export const MODES: Record<string, (deps: JobDeps, args: string[]) => Promise<ModeOutcome>> = {
  request: (deps, args) => runRequest(deps, parseRequestArgs(args)),
  nightly: (deps, args) => runNightly(deps, parseNightlyArgs(args)),
  promote: (deps, args) => runPromote(deps, parsePromoteArgs(args)),
};

/** 공통 플래그(값을 하나 받는다) — 모드별 검증은 각 모드 파서(parseRequestArgs · parseNightlyArgs)가 한다. */
const VALUE_FLAGS: Readonly<Record<string, "date" | "ex">> = { "--date": "date", "--ex": "ex" };

export type ParsedArgv = { mode: string; date?: string; ex?: string; rest: string[] };

/**
 * argv(`process.argv.slice(2)` — 모드부터) → 모드 + 공통 플래그. 모드가 없거나 `--` 로 시작(실행 파일 자리가 어긋난 argv)
 * · 값 없는 플래그 · 모르는 플래그면 UsageError(종료 2).
 */
export function parseArgv(argv: readonly string[]): ParsedArgv {
  const [mode, ...rest] = argv;
  if (mode === undefined || mode === "" || mode.startsWith("-")) throw new UsageError(`모드가 없다 (argv ${JSON.stringify(argv)})`);
  const out: ParsedArgv = { mode, rest };
  for (let i = 0; i < rest.length; i += 2) {
    const key = VALUE_FLAGS[rest[i]!];
    const val = rest[i + 1];
    if (key === undefined) throw new UsageError(`${mode}: 모르는 인자 ${rest[i]}`);
    if (val === undefined || val.startsWith("--")) throw new UsageError(`${mode}: ${rest[i]} 값이 없다`);
    out[key] = val;
  }
  return out;
}

/** Node zstd 지원 여부(Pitfall 4). */
export function hasZstd(z: { zstdCompressSync?: unknown; createZstdDecompress?: unknown } = zlib): boolean {
  return typeof z.zstdCompressSync === "function" && typeof z.createZstdDecompress === "function";
}

export type MainOptions = {
  now?: Date;
  /** 테스트 주입 — 없으면 env 로 만든다. */
  sb?: SupabaseClient;
  store?: GridStore;
  config?: Config;
  clock?: () => number;
  zlib?: { zstdCompressSync?: unknown; createZstdDecompress?: unknown };
};

/** argv = 모드부터(`process.argv.slice(2)`). 반환 = 종료 코드. */
export async function main(argv: string[] = process.argv.slice(2), opts: MainOptions = {}): Promise<number> {
  if (!hasZstd(opts.zlib)) {
    logger.error({ node: process.version }, "tick-convert: Node zstd 없음(zlib.zstdCompressSync) — node ≥ 22.15 이미지 필요");
    return 2;
  }
  let parsed: ParsedArgv;
  try {
    parsed = parseArgv(argv);
  } catch (err) {
    logger.error({ argv }, `tick-convert: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }
  const { mode, rest } = parsed;
  const run = MODES[mode];
  if (!run) {
    logger.error({ mode, modes: Object.keys(MODES) }, "tick-convert: 모르는 모드");
    return 2;
  }
  try {
    const config = opts.config ?? loadConfig({ mode });
    const sb = opts.sb ?? createSupabaseClient(config);
    const store = opts.store ?? createSupabaseGridStore(sb);
    const out = await run({ sb, store, config, now: opts.now ?? new Date(), clock: opts.clock }, rest);
    if (out.failed > 0) {
      logger.error({ mode, failed: out.failed }, "tick-convert: 실패가 있다(종목 · 날짜 · purge)");
      return 1;
    }
    return 0;
  } catch (err) {
    if (err instanceof UsageError || err instanceof ConfigError) {
      logger.error({ mode, argv: rest }, `tick-convert: ${err.message}`);
      return 2;
    }
    logger.error({ mode, err }, "tick-convert failed");
    return 1;
  }
}

// CLI 진입점 — node dist/index.js · tsx src/index.ts. vitest import 시에는 실행 안 함.
if (/index\.(js|ts)$/.test(process.argv[1] ?? "")) {
  void main().then((code) => process.exit(code));
}
