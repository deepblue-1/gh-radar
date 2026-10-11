---
phase: 09-daily-candle-data
plan: 02
type: execute
wave: 0
depends_on: []
files_modified:
  - workers/candle-sync/package.json
  - workers/candle-sync/tsconfig.json
  - workers/candle-sync/vitest.config.ts
  - workers/candle-sync/Dockerfile
  - workers/candle-sync/src/config.ts
  - workers/candle-sync/src/logger.ts
  - workers/candle-sync/src/retry.ts
  - workers/candle-sync/src/services/supabase.ts
  - workers/candle-sync/src/index.ts
  - pnpm-workspace.yaml
autonomous: true
requirements_addressed:
  - DATA-01

must_haves:
  truths:
    - "workers/candle-sync/ 워크스페이스가 pnpm-workspace.yaml 에 자동 등록되어 (workers/* 패턴) `pnpm -F @gh-radar/candle-sync ...` 로 호출 가능하다"
    - "package.json 이 master-sync 와 동일한 의존성 (axios/@supabase/supabase-js/pino/dotenv) + devDeps (tsx/typescript/vitest) 를 갖는다"
    - "tsconfig.json 이 master-sync 패턴 그대로 (commonjs/node, extends ../../tsconfig.base.json)"
    - "Dockerfile 이 멀티스테이지 (builder + production) + GIT_SHA build-arg 주입 + alpine 22 + pnpm 10"
    - "config.ts 가 KRX_AUTH_KEY/SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/KRX_BASE_URL 모두 필수 검증 + MODE/BACKFILL_FROM/BACKFILL_TO env 노출"
    - "candle-sync config.ts 의 krxBaseUrl default = 'https://data-dbg.krx.co.kr/svc/apis' (master-sync default 'https://openapi.krx.co.kr/svc' 와 의도적 차이 — RESEARCH §1.1 production 검증된 URL 직접 잠금)."
    - "logger.ts 가 pino + redact (krxAuthKey/supabaseServiceRoleKey)"
    - "retry.ts 가 withRetry 3회 exponential backoff (200·400ms) — master-sync 동일 시그니처"
    - "services/supabase.ts 가 createClient(supabaseUrl, serviceRoleKey) 단일 함수 export"
    - "src/index.ts 는 placeholder — MODE switch 골격만 (실제 dispatch 는 Plan 04)"
    - "pnpm -F @gh-radar/candle-sync typecheck exit 0 + pnpm -F @gh-radar/candle-sync test --run exit 0 (zero test 라도)"
  artifacts:
    - path: "workers/candle-sync/package.json"
      provides: "@gh-radar/candle-sync 워크스페이스 정의"
      contains: "@gh-radar/candle-sync"
    - path: "workers/candle-sync/Dockerfile"
      provides: "멀티스테이지 빌드 + GIT_SHA build-arg + alpine 22"
      contains: "FROM node:22-alpine AS builder"
    - path: "workers/candle-sync/src/config.ts"
      provides: "loadConfig() — env 로딩 + 필수 검증 + MODE 노출"
      contains: "krxAuthKey"
    - path: "workers/candle-sync/src/retry.ts"
      provides: "withRetry — 3회 exponential backoff"
      contains: "withRetry"
    - path: "workers/candle-sync/src/services/supabase.ts"
      provides: "createSupabaseClient — service_role 클라이언트"
      contains: "createSupabaseClient"
  key_links:
    - from: "workers/candle-sync/package.json"
      to: "pnpm-workspace.yaml"
      via: "workers/* 패턴 자동 등록"
      pattern: "workers/\\*"
    - from: "workers/candle-sync/src/config.ts"
      to: "Plan 03/04 krx/* + pipeline/* + modes/*"
      via: "Config 타입 import"
      pattern: "loadConfig"
---

<objective>
candle-sync 워커의 스캐폴드 — master-sync 의 워크스페이스 구조를 1:1 mirror 하여 신규 `workers/candle-sync/` 디렉터리 생성. Plan 03 (KRX 클라이언트 + 파이프라인) 과 Plan 04 (MODE dispatch) 가 본 plan 의 산출물 위에 구현된다.

Purpose: D-08 (단일 코드/이미지 + MODE 환경변수), D-12 (자원 = master-sync 패턴 따름), DATA-01 (분석 기반 데이터 레이어 워커 인프라).

Mirror 대상:
- `workers/master-sync/package.json` → `workers/candle-sync/package.json`
- `workers/master-sync/Dockerfile` → `workers/candle-sync/Dockerfile`
- `workers/master-sync/src/{config,logger,retry,services/supabase}.ts` → `workers/candle-sync/src/{config,logger,retry,services/supabase}.ts`
- `workers/master-sync/{tsconfig,vitest.config}.ts` → `workers/candle-sync/{tsconfig,vitest.config}.ts`

변경점 (master-sync 대비):
- 패키지명: `@gh-radar/master-sync` → `@gh-radar/candle-sync`
- config 추가: `MODE`, `BACKFILL_FROM`, `BACKFILL_TO`, `BACKFILL_LOOKBACK` env 노출 (Plan 04 가 사용)
- Dockerfile 의 `--filter=@gh-radar/master-sync` → `--filter=@gh-radar/candle-sync`
- src/index.ts 는 stub (Plan 04 의 MODE dispatch 가 채움)

Output:
- workers/candle-sync/ 11 파일 + pnpm-workspace.yaml 확인 (workers/* 패턴 이미 존재 — 무수정)
- `pnpm install` 성공 + `pnpm -F @gh-radar/candle-sync typecheck` 성공
- `pnpm -F @gh-radar/candle-sync test --run` 성공 (zero test 라도)
- docker build (Plan 05 까지 deferred — 본 plan 은 build 까지 검증하지 않음)
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/09-daily-candle-data/09-CONTEXT.md
@.planning/phases/09-daily-candle-data/09-RESEARCH.md

# Mirror 대상 — master-sync 패턴
@workers/master-sync/package.json
@workers/master-sync/tsconfig.json
@workers/master-sync/vitest.config.ts
@workers/master-sync/Dockerfile
@workers/master-sync/src/config.ts
@workers/master-sync/src/logger.ts
@workers/master-sync/src/retry.ts
@workers/master-sync/src/services/supabase.ts

# Workspace 등록 확인
@pnpm-workspace.yaml

<interfaces>
<!-- master-sync 의 Config (mirror 대상) -->
```typescript
type Config = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  krxAuthKey: string;
  krxBaseUrl: string;
  logLevel: string;
  appVersion: string;
  basDd?: string;
};
```

<!-- candle-sync 의 Config (확장) — Plan 04 가 사용 -->
```typescript
export type Mode = "backfill" | "daily" | "recover";

export type Config = {
  // master-sync 공통
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  krxAuthKey: string;
  krxBaseUrl: string;
  logLevel: string;
  appVersion: string;
  // candle-sync 신규
  mode: Mode;                  // MODE env, default "daily"
  backfillFrom?: string;       // BACKFILL_FROM env (YYYY-MM-DD) — backfill mode 만 사용
  backfillTo?: string;         // BACKFILL_TO env (YYYY-MM-DD) — backfill mode 만 사용
  recoverLookback: number;     // BACKFILL_LOOKBACK env (default 10) — recover mode 의 lookback 영업일 수
  recoverThreshold: number;    // RECOVER_THRESHOLD env (default 0.9) — recover mode 의 활성 비율 임계
  recoverMaxCalls: number;     // RECOVER_MAX_CALLS env (default 20) — recover mode 의 calls 상한
  minExpectedRows: number;     // MIN_EXPECTED_ROWS env (default 1400) — MIN_EXPECTED 가드 (RESEARCH §7 T-09-02)
};
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: package.json + tsconfig.json + vitest.config.ts 생성 + pnpm-workspace.yaml 확인</name>
  <files>
    workers/candle-sync/package.json,
    workers/candle-sync/tsconfig.json,
    workers/candle-sync/vitest.config.ts,
    pnpm-workspace.yaml
  </files>

  <read_first>
    - workers/master-sync/package.json (mirror 대상 — 의존성 버전 + scripts)
    - workers/master-sync/tsconfig.json (mirror 대상)
    - workers/master-sync/vitest.config.ts (mirror 대상)
    - pnpm-workspace.yaml (workers/* 패턴 존재 여부 — 이미 있어야 함)
  </read_first>

  <action>
1. **`workers/candle-sync/package.json`** 생성:
```json
{
  "name": "@gh-radar/candle-sync",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "tsx -r dotenv/config src/index.ts",
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@gh-radar/shared": "workspace:*",
    "@supabase/supabase-js": "^2.49.0",
    "axios": "^1.7.0",
    "dotenv": "^16.4.0",
    "pino": "^9.0.0"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "vitest": "^3.0.0",
    "@types/node": "^22.0.0"
  }
}
```

2. **`workers/candle-sync/tsconfig.json`** 생성 (master-sync 와 동일):
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "paths": {}
  },
  "include": ["src"]
}
```

3. **`workers/candle-sync/vitest.config.ts`** 생성 (master-sync 와 동일):
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
  },
});
```

4. **pnpm-workspace.yaml** 확인:
- `cat pnpm-workspace.yaml | grep -E "workers/\*"` 출력 1줄 (이미 있음 — 변경 불필요)
- 만약 없으면 add (현재 검증된 상태로 있음)

5. **`pnpm install`** 실행 — node_modules 생성:
```bash
pnpm install
```
exit 0 확인. lockfile (pnpm-lock.yaml) 갱신될 수 있음 — `git diff pnpm-lock.yaml` 가 의존성 추가 외 변경 없음 확인.
  </action>

  <verify>
    <automated>test -f workers/candle-sync/package.json && test -f workers/candle-sync/tsconfig.json && test -f workers/candle-sync/vitest.config.ts && grep -q "@gh-radar/candle-sync" workers/candle-sync/package.json && grep -q "workers/\*" pnpm-workspace.yaml && pnpm install --frozen-lockfile=false && pnpm -F @gh-radar/candle-sync exec node -e "console.log('workspace OK')"</automated>
  </verify>

  <acceptance_criteria>
    - `test -f workers/candle-sync/package.json` exit 0
    - `grep -c '"name": "@gh-radar/candle-sync"' workers/candle-sync/package.json` = 1
    - package.json 의 dependencies 에 `@gh-radar/shared`, `@supabase/supabase-js`, `axios`, `dotenv`, `pino` 모두 존재
    - package.json 의 scripts 에 `dev`, `build`, `typecheck`, `test` 모두 존재
    - `test -f workers/candle-sync/tsconfig.json` exit 0
    - tsconfig 가 `../../tsconfig.base.json` extends
    - `test -f workers/candle-sync/vitest.config.ts` exit 0
    - `grep -q "workers/\*" pnpm-workspace.yaml` exit 0 (이미 등록됨)
    - `pnpm install` exit 0 (frozen-lockfile=false 허용 — 신규 워크스페이스라 lockfile 갱신 필요)
    - `pnpm -F @gh-radar/candle-sync exec node -e "console.log(1)"` exit 0 (워크스페이스 인식 확인)
  </acceptance_criteria>

  <done>workspace 등록 + 의존성 설치 + 빈 워크스페이스 인식. typecheck/test 는 src 파일 작성 후.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: src/{config,logger,retry,services/supabase}.ts + Dockerfile 생성 + 빈 src/index.ts</name>
  <files>
    workers/candle-sync/src/config.ts,
    workers/candle-sync/src/logger.ts,
    workers/candle-sync/src/retry.ts,
    workers/candle-sync/src/services/supabase.ts,
    workers/candle-sync/src/index.ts,
    workers/candle-sync/Dockerfile
  </files>

  <read_first>
    - workers/master-sync/src/config.ts (mirror — Config 타입 + loadConfig)
    - workers/master-sync/src/logger.ts (mirror — pino + redact)
    - workers/master-sync/src/retry.ts (mirror — withRetry)
    - workers/master-sync/src/services/supabase.ts (mirror — createSupabaseClient)
    - workers/master-sync/Dockerfile (mirror — 멀티스테이지 + GIT_SHA)
    - workers/master-sync/src/index.ts (참고용 — 본 plan 의 candle-sync src/index.ts 는 placeholder)
  </read_first>

  <action>
1. **`workers/candle-sync/src/config.ts`** 생성 — master-sync 패턴 + candle-sync 신규 env (MODE/BACKFILL_*/RECOVER_*):
```typescript
export type Mode = "backfill" | "daily" | "recover";

export type Config = {
  // 공통 (master-sync 동일)
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  krxAuthKey: string;
  krxBaseUrl: string;
  logLevel: string;
  appVersion: string;

  // candle-sync 신규
  mode: Mode;                  // MODE env, default "daily"
  backfillFrom?: string;       // BACKFILL_FROM env (YYYY-MM-DD) — backfill mode 만 사용
  backfillTo?: string;         // BACKFILL_TO env (YYYY-MM-DD) — backfill mode 만 사용
  recoverLookback: number;     // BACKFILL_LOOKBACK env, default 10 — recover mode lookback 영업일 수
  recoverThreshold: number;    // RECOVER_THRESHOLD env, default 0.9 — 활성 비율 임계
  recoverMaxCalls: number;     // RECOVER_MAX_CALLS env, default 20 — calls 상한
  minExpectedRows: number;     // MIN_EXPECTED_ROWS env, default 1400 — MIN_EXPECTED 가드 (T-09-02)
};

function parseMode(raw: string | undefined): Mode {
  const m = (raw ?? "daily").toLowerCase();
  if (m !== "backfill" && m !== "daily" && m !== "recover") {
    throw new Error(`Unknown MODE: ${raw}. Expected: backfill | daily | recover`);
  }
  return m;
}

function parseNumberEnv(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid numeric env value: "${raw}"`);
  }
  return n;
}

export function loadConfig(): Config {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const krxAuthKey = process.env.KRX_AUTH_KEY;
  // RESEARCH §1.1 — production 은 data-dbg.krx.co.kr/svc/apis (master-sync 와 동일)
  const krxBaseUrl =
    process.env.KRX_BASE_URL ?? "https://data-dbg.krx.co.kr/svc/apis";

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  if (!krxAuthKey) {
    throw new Error("KRX_AUTH_KEY must be set");
  }

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    krxAuthKey,
    krxBaseUrl,
    logLevel: process.env.LOG_LEVEL ?? "info",
    appVersion: process.env.APP_VERSION ?? "0.0.0",
    mode: parseMode(process.env.MODE),
    backfillFrom: process.env.BACKFILL_FROM,
    backfillTo: process.env.BACKFILL_TO,
    recoverLookback: parseNumberEnv(process.env.RECOVER_LOOKBACK, 10),
    recoverThreshold: parseNumberEnv(process.env.RECOVER_THRESHOLD, 0.9),
    recoverMaxCalls: parseNumberEnv(process.env.RECOVER_MAX_CALLS, 20),
    minExpectedRows: parseNumberEnv(process.env.MIN_EXPECTED_ROWS, 1400),
  };
}
```

2. **`workers/candle-sync/src/logger.ts`** 생성 — master-sync 동일:
```typescript
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "*.krxAuthKey",
      "*.supabaseServiceRoleKey",
    ],
    censor: "[REDACTED]",
  },
});
```

3. **`workers/candle-sync/src/retry.ts`** 생성 — master-sync 와 동일 시그니처:
```typescript
import { logger } from "./logger";

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  attempts = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts) break;
      const waitMs = 200 * Math.pow(2, i - 1);
      logger.warn({ label, attempt: i, waitMs, err: (err as Error).message }, "retry");
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}
```

4. **`workers/candle-sync/src/services/supabase.ts`** 생성 — master-sync 동일:
```typescript
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Config } from "../config";

export function createSupabaseClient(config: Config): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey);
}
```

5. **`workers/candle-sync/src/index.ts`** 생성 — placeholder (Plan 04 가 실제 MODE dispatch 구현):
```typescript
import "dotenv/config";
import { loadConfig } from "./config";
import { logger } from "./logger";

// NOTE: 실제 MODE dispatch (runBackfill / runDaily / runRecover) 는 Plan 04 에서 구현.
// 본 placeholder 는 Plan 02 가 typecheck/test 통과를 위해 작성.

async function main(): Promise<void> {
  const config = loadConfig();
  const log = logger.child({ app: "candle-sync", version: config.appVersion, mode: config.mode });
  log.info("candle-sync placeholder — Plan 04 에서 MODE dispatch 구현 예정");
  process.exit(0);
}

// CLI 진입점 (vitest import 시에는 실행 안 함) — master-sync 패턴 그대로
if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  main().catch((err) => {
    logger.error({ err }, "candle-sync placeholder failed");
    process.exit(1);
  });
}
```

6. **`workers/candle-sync/Dockerfile`** 생성 — master-sync 와 동일 구조, `--filter=@gh-radar/candle-sync` 만 다름:
```dockerfile
# === Builder Stage ===
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY workers/candle-sync/package.json ./workers/candle-sync/

RUN pnpm install --frozen-lockfile

COPY packages/shared/ ./packages/shared/
COPY workers/candle-sync/ ./workers/candle-sync/

RUN pnpm -F @gh-radar/shared build
RUN pnpm -F @gh-radar/candle-sync build

# pnpm deploy: isolated prod node_modules
RUN pnpm --filter=@gh-radar/candle-sync --prod --legacy deploy /out
RUN cp -r /app/workers/candle-sync/dist /out/dist

# === Production Image ===
FROM node:22-alpine
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /out/dist ./dist
COPY --from=builder /out/package.json ./
COPY --from=builder /out/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./node_modules/@gh-radar/shared/dist

ARG GIT_SHA=dev
ENV APP_VERSION=${GIT_SHA}

USER app
CMD ["node", "dist/index.js"]
```

7. 검증:
```bash
pnpm -F @gh-radar/candle-sync typecheck   # exit 0
pnpm -F @gh-radar/candle-sync test --run  # exit 0 (zero test 라도 vitest 가 0 으로 종료)
pnpm -F @gh-radar/candle-sync build       # exit 0 — dist/ 생성
```
  </action>

  <verify>
    <automated>test -f workers/candle-sync/src/config.ts && test -f workers/candle-sync/src/logger.ts && test -f workers/candle-sync/src/retry.ts && test -f workers/candle-sync/src/services/supabase.ts && test -f workers/candle-sync/src/index.ts && test -f workers/candle-sync/Dockerfile && grep -q "parseMode" workers/candle-sync/src/config.ts && grep -q "withRetry" workers/candle-sync/src/retry.ts && grep -q "FROM node:22-alpine AS builder" workers/candle-sync/Dockerfile && grep -q "@gh-radar/candle-sync" workers/candle-sync/Dockerfile && pnpm -F @gh-radar/candle-sync typecheck && pnpm -F @gh-radar/candle-sync test --run && pnpm -F @gh-radar/candle-sync build</automated>
  </verify>

  <acceptance_criteria>
    - `workers/candle-sync/src/config.ts` 가 `loadConfig()` export + `Mode` 타입 export
    - config 가 `mode`, `backfillFrom`, `backfillTo`, `recoverLookback`, `recoverThreshold`, `recoverMaxCalls`, `minExpectedRows` 필드 모두 포함
    - config 의 default 값: `mode="daily"`, `recoverLookback=10`, `recoverThreshold=0.9`, `recoverMaxCalls=20`, `minExpectedRows=1400`
    - `krxBaseUrl` default = `"https://data-dbg.krx.co.kr/svc/apis"` (RESEARCH §1.1 — production 검증된 URL)
    - `workers/candle-sync/src/logger.ts` 가 pino + redact (`*.krxAuthKey`, `*.supabaseServiceRoleKey`) 패턴
    - `workers/candle-sync/src/retry.ts` 가 `export async function withRetry<T>(...)` (시그니처 master-sync 동일)
    - `workers/candle-sync/src/services/supabase.ts` 가 `createSupabaseClient(config: Config): SupabaseClient` export
    - `workers/candle-sync/src/index.ts` 가 placeholder — `loadConfig()` 호출 후 log + exit 0
    - `workers/candle-sync/Dockerfile` 가 멀티스테이지 (`FROM node:22-alpine AS builder` + 두 번째 `FROM node:22-alpine`)
    - Dockerfile 에 `pnpm -F @gh-radar/candle-sync build` + `--filter=@gh-radar/candle-sync --prod --legacy deploy /out` 매치
    - Dockerfile 의 `ARG GIT_SHA=dev` + `ENV APP_VERSION=${GIT_SHA}` 매치
    - `pnpm -F @gh-radar/candle-sync typecheck` exit 0
    - `pnpm -F @gh-radar/candle-sync test --run` exit 0 (no tests 라도 OK)
    - `pnpm -F @gh-radar/candle-sync build` exit 0 — `workers/candle-sync/dist/index.js` 생성
  </acceptance_criteria>

  <done>candle-sync 워크스페이스 + 인프라 4 파일 + Dockerfile + placeholder entry. Plan 03/04 가 본 plan 의 산출물 위에 구현.</done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| process.env → Config | KRX_AUTH_KEY/SUPABASE_SERVICE_ROLE_KEY 등 시크릿 origin |
| Dockerfile build context → Production image | 시크릿 base image 노출 위험 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-09-SCAF-01 | INFORMATION DISCLOSURE | logger.ts redact 누락 | mitigate | logger.ts 에서 `*.krxAuthKey` + `*.supabaseServiceRoleKey` 명시 redact. master-sync 패턴 그대로 (이미 production 검증). |
| T-09-SCAF-02 | TAMPERING (env mismatch) | config.ts MODE 검증 | mitigate | parseMode() 가 unknown MODE 시 즉시 throw. Plan 04 dispatch 전에 입력 검증. |
| T-09-SCAF-03 | INFORMATION DISCLOSURE | Dockerfile 빌드 시 시크릿 leak | mitigate | Dockerfile 에 env/secret 정의 없음 — Cloud Run Job 가 deploy 시점에 secret 마운트 (Plan 05). build context 에 .env 파일 미포함 (master-sync 패턴). |

</threat_model>

<verification>
- `workers/candle-sync/` 디렉터리 + 11 파일 생성됨
- `pnpm -F @gh-radar/candle-sync typecheck` PASS
- `pnpm -F @gh-radar/candle-sync test --run` PASS
- `pnpm -F @gh-radar/candle-sync build` PASS (dist/index.js 생성)
- pnpm-workspace.yaml 의 `workers/*` 패턴이 자동 등록
- Plan 03 (KRX 클라이언트 + 파이프라인) 과 Plan 04 (MODE dispatch) 가 본 plan 의 src/{config,logger,retry,services/supabase}.ts 를 import 가능
</verification>

<success_criteria>
- candle-sync 워크스페이스가 master-sync 와 동일한 구조 + 의존성으로 생성
- typecheck + test + build 3종 모두 PASS
- Dockerfile 멀티스테이지 + GIT_SHA build-arg 정의
- Plan 03/04 의 src 파일이 본 plan 의 인프라 4종을 import 가능
</success_criteria>

<output>
After completion, create `.planning/phases/09-daily-candle-data/09-02-SUMMARY.md`
</output>
</content>
</invoke>
