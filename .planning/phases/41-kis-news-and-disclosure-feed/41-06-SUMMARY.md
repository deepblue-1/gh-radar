---
phase: 41-kis-news-and-disclosure-feed
plan: 06
subsystem: worker
status: complete
tags: [kis-news-sync, worker, config, logger, redact, fixture]
requires:
  - 41-01 (kis_news 표 · 들여오기 RPC 계약)
provides:
  - "워크스페이스 @gh-radar/kis-news-sync (package · tsconfig · vitest.config · Dockerfile)"
  - "KisNewsTitleRow (src/kis/types.ts)"
  - "loadConfig · KisNewsConfig · KisNewsMode (src/config.ts)"
  - "createLogger · REDACT_PATHS (src/logger.ts)"
  - "createSupabaseClient (src/services/supabase.ts)"
  - "tests/fixtures/kis-news-title-sample.json (2026-11-11 실측 표본)"
affects: [41-12, 41-13, 41-08, 41-02]
tech-stack:
  added: []
  patterns:
    - "news-sync 워커 골격 복제(의존성 · 버전 범위 동일, p-limit 제외)"
    - "pino redact 경로 = 비밀 키 이름 + 한 단계 아래(*.) · headers/config 통째"
    - "createLogger(level, destination?) — 테스트가 실제 로거를 메모리 스트림에 연결"
key-files:
  created:
    - workers/kis-news-sync/package.json
    - workers/kis-news-sync/tsconfig.json
    - workers/kis-news-sync/vitest.config.ts
    - workers/kis-news-sync/Dockerfile
    - workers/kis-news-sync/src/kis/types.ts
    - workers/kis-news-sync/src/config.ts
    - workers/kis-news-sync/src/logger.ts
    - workers/kis-news-sync/src/services/supabase.ts
    - workers/kis-news-sync/tests/config.test.ts
    - workers/kis-news-sync/tests/logger.test.ts
    - workers/kis-news-sync/tests/fixtures/kis-news-title-sample.json
    - .planning/phases/41-kis-news-and-disclosure-feed/tdd-red/41-06-T2-red.json
  modified:
    - pnpm-lock.yaml
decisions:
  - "KisNewsConfig 필드 이름: supabaseUrl · supabaseServiceRoleKey · kisAppKey · kisAppSecret · kisBaseUrl · maxRps · dailyBudget · mode · targetCap · logLevel · appVersion (41-08 은 cfg.maxRps 를 쓴다)"
  - "KIS_NEWS_TARGET_CAP 도 양의 정수 검증(0 · 비정수 → 시작하지 않음)"
  - "REDACT_PATHS 에 cfg 비밀 필드(kisAppKey · kisAppSecret · supabaseServiceRoleKey)도 포함 — cfg 를 통째로 로그해도 새지 않게"
  - "createSupabaseClient 는 cfg(Pick<supabaseUrl, supabaseServiceRoleKey>)를 받는다 — news-sync 의 (url, key) 두 인자와 다름"
metrics:
  duration: "약 20분"
  completed: 2026-11-12
actuals:
  tokens: 102798   # chars/4 over 전체 diff(411192자). 바이트 복사한 표본 픽스처를 빼면 7937(31749자)
  tasks: 2
  commits: 3
plan_head_before: 4f55f5e1adcef51a9a58ec26b64944079fd3e2a3
plan_head_after: ab712e6cd44c5a06f696cea465da1f2d45a02f47
---

# Phase 41 Plan 06: kis-news-sync 골격 · env 계약 · 비밀 가림 로거 Summary

새 워크스페이스 `@gh-radar/kis-news-sync` 를 news-sync 와 같은 의존성으로 세우고(새 외부 패키지 0), 2026-11-11 실측 표본 필드 그대로의 `KisNewsTitleRow` · 픽스처 · `loadConfig`(초당 상한 1 ~ 15 기본 5) · 앱키/시크릿/토큰/헤더/axios 설정을 `[redacted]` 로 가리는 pino 로거를 테스트 26건으로 잠갔다.

## 커밋

| Task | 이름 | 커밋 | 파일 |
|---|---|---|---|
| 1 | 골격 · KisNewsTitleRow · 실측 표본 픽스처 | e0406a5e | package.json · tsconfig.json · vitest.config.ts · Dockerfile · src/kis/types.ts · tests/fixtures/kis-news-title-sample.json · pnpm-lock.yaml |
| 2 RED | env 계약 · 비밀 가림 로거 실패 테스트 | 06838dff | tests/config.test.ts · tests/logger.test.ts · src/config.ts(스텁) · src/logger.ts(스텁) · tdd-red/41-06-T2-red.json |
| 2 GREEN | loadConfig · REDACT_PATHS · createSupabaseClient | ab712e6c | src/config.ts · src/logger.ts · src/services/supabase.ts |

REFACTOR 커밋 없음(정리할 것 없음).

## env 계약 (`loadConfig` — 41-02 배포 스크립트와 같은 이름)

| env | 필드 | 기본 | 검증 |
|---|---|---|---|
| `SUPABASE_URL` | `supabaseUrl` | — | 필수 · 없으면 `missing env: SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | `supabaseServiceRoleKey` | — | 필수 · 오류에 이름만 |
| `KIS_APPKEY` | `kisAppKey` | — | 필수 · 오류에 이름만 |
| `KIS_APPSECRET` | `kisAppSecret` | — | 필수 · 오류에 이름만 |
| `KIS_BASE_URL` | `kisBaseUrl` | `https://openapi.koreainvestment.com:9443` | — |
| `KIS_NEWS_MAX_RPS` | `maxRps` | 5 | 정수 1 ~ 15(공식 초당 20건의 75%) · 밖이면 시작 안 함 |
| `KIS_NEWS_DAILY_BUDGET` | `dailyBudget` | 200000 | 양의 정수 |
| `KIS_NEWS_MODE` | `mode` (`KisNewsMode`) | `auto` | `auto` · `fast` · `slow` · `probe` |
| `KIS_NEWS_TARGET_CAP` | `targetCap` | 450 | 양의 정수 |
| `LOG_LEVEL` | `logLevel` | `info` | — |
| `APP_VERSION` | `appVersion` | `dev` | — |

빈 문자열 env 는 「없음」 과 같이 다룬다(필수면 오류 · 선택이면 기본값).

## `KisNewsTitleRow` 필드 (27개 · 모두 string)

`cntt_usiq_srno` · `news_ofer_entp_code` · `data_dt` · `data_tm` · `hts_pbnt_titl_cntt` · `news_lrdv_code` · `dorg` · `iscd1` ~ `iscd10` · `kor_isnm1` ~ `kor_isnm10` — 표본 `steps.<이름>.output[]` 전 행의 키 합집합(27개)과 일치. 종목코드는 기사당 `iscd1` 하나만 차 오고 나머지는 `""`, 이름 칸은 `" "` 일 수 있다(머리 주석).

## 로거 가림 (`REDACT_PATHS`)

`appkey` · `appsecret` · `access_token` · `authorization` · `token` · `kisAppKey` · `kisAppSecret` · `supabaseServiceRoleKey` · `headers` · `config` — 각각 맨 위와 `*.` 한 단계 아래 · censor `[redacted]`. `createLogger(level, destination?)`.

## 표본 이동 확인

- 비밀 검사: `grep -ciE 'appsecret|"access_token"'` = 0 (메인 체크아웃 원본 · 픽스처 둘 다). 넓은 검사(`appkey|authorization|bearer|secret|token"`)의 1건은 단계 이름 `"token"` 키(값은 status · ms · expires_in 뿐)라 비밀 아님.
- `cmp` 로 원본과 픽스처 바이트 동일 확인(364512 바이트).
- 이 worktree 에는 reference 원본 경로가 없어 `test ! -e` 통과. 메인 체크아웃 원본은 건드리지 않았다(아래 이탈 참고).

## 테스트

- `tests/config.test.ts` 21건(it 11 · it.each 포함 전개 21) · `tests/logger.test.ts` 5건 — 합 26건 통과.
- 검증 명령:
  - `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/kis-news-sync exec vitest run tests/config.test.ts tests/logger.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/kis-news-sync run typecheck` → 2 files · 26 passed · tsc 오류 0
  - Task 1 자동 검증 → `SKELETON-OK`
  - `pnpm install` → `downloaded 0` · lockfile 차이는 `workers/kis-news-sync` importer 31줄뿐

## TDD 기록 (Task 2)

- **RED (06838dff):** 타입만 맞춘 스텁(`loadConfig` 는 throw · 로거는 가림 없음)으로 26건 중 25건 실패. 판정기 `check tdd-red-evidence` → `RED_EVIDENCE_OK`(target `tests/config.test.ts > loadConfig (41-06 env 계약) > 필수 넷만 있으면 기본값으로 채운다`). 처음 두 파일을 `pnpm exec` 로 함께 돌린 tap 보고는 pnpm 오류 줄과 pino 출력의 줄바꿈 때문에 `invalid_record` 로 판정돼, vitest 바이너리를 직접 config 파일 하나로 다시 돌린 기록을 썼다. 의미 판정: target 이 실제로 실행되어 기본값 설정이 없어서 실패(로드 · 문법 오류 없음). logger 4건은 같은 RED 커밋에서 `expected ... not to contain 'SECRET-AAA'` 단언으로 실패(의도된 실패). 기록: `.planning/phases/41-kis-news-and-disclosure-feed/tdd-red/41-06-T2-red.json`.
- **GREEN (ab712e6c):** 26건 통과 · typecheck 통과.
- **REFACTOR:** 없음.

## Deviations from Plan

### 오케스트레이터 지시 이탈

**1. 표본은 `mv` 대신 `cp`**
- **이유:** 표본 원본은 추적되지 않는 파일이라 메인 체크아웃에만 있고 이 worktree 에는 없다.
- **조치:** 메인 체크아웃 절대경로 `/Users/alex/repos/gh-radar/.planning/phases/41-kis-news-and-disclosure-feed/reference/kis-news-title-probe-result.json` 을 `workers/kis-news-sync/tests/fixtures/kis-news-title-sample.json` 으로 바이트 동일하게 복사해 픽스처만 커밋. 원본은 그대로 두었다 — 브랜치를 합친 뒤 바이트 비교 후 오케스트레이터가 지운다(그때까지 「저장소에 한 벌만」 금지 조항은 오케스트레이터 몫으로 열려 있다).
- **커밋:** e0406a5e

### 자동 보완

**2. [Rule 2 - 핵심 기능 보완] cfg 비밀 필드도 가림 경로에 추가**
- **발견:** Task 2
- **문제:** 계획의 `REDACT_PATHS` 는 한투 원어 키 이름(`appkey` 등)만 덮어, `KisNewsConfig` 를 통째로 로그하면 `kisAppKey` · `kisAppSecret` · `supabaseServiceRoleKey` 가 그대로 나간다(SC-5 위반 소지).
- **조치:** 세 필드와 `*.` 경로를 `REDACT_PATHS` 에 추가 · 테스트 1건(cfg 통째 로그)으로 잠금. 계획이 요구한 14개 경로는 모두 그대로 있다.
- **커밋:** ab712e6c

**3. [Rule 2] `KIS_NEWS_TARGET_CAP` 도 양의 정수 검증** — 계획은 기본 450 만 정했다. `Number()` 그대로면 `abc` → NaN 이 루프 상한으로 흘러간다. 다른 정수 env 와 같은 검증을 걸었다(커밋 ab712e6c).

**4. `createLogger` 에 선택 인자 `destination` 추가** — news-sync 테스트는 redact 설정을 테스트 안에 복제해 실제 로거를 검사하지 못했다. 실제 `createLogger` 를 메모리 스트림에 연결하려고 둘째 인자를 열었다(기본은 stdout · 호출부 영향 없음).

## 계약 메모 (뒤 플랜이 읽을 것)

- `createSupabaseClient(cfg)` 는 news-sync 의 `(url, key)` 와 달리 cfg 객체 하나를 받는다(계획의 `createSupabaseClient(cfg)` 그대로).
- `src/index.ts` 는 아직 없다 — `dev` 스크립트와 Dockerfile `CMD` 는 41-08 이 index 를 만들면 동작한다. 그 전에는 `pnpm build` 결과에 `dist/index.js` 가 없다.

## Known Stubs

없음 — RED 스텁은 GREEN 커밋에서 실제 구현으로 바뀌었다.

## Self-Check: PASSED

- FOUND: workers/kis-news-sync/package.json · tsconfig.json · vitest.config.ts · Dockerfile · src/kis/types.ts · src/config.ts · src/logger.ts · src/services/supabase.ts · tests/config.test.ts · tests/logger.test.ts · tests/fixtures/kis-news-title-sample.json
- FOUND: e0406a5e · 06838dff · ab712e6c (HEAD 조상)
- STATE.md · ROADMAP.md 변경 없음
