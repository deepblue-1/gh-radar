---
phase: 41-kis-news-and-disclosure-feed
plan: 08
subsystem: worker
status: complete
tags: [kis-news-sync, cloud-run-job, lease, token-bucket, rate-limit, budget, scheduler, vitest, fake-clock]

requires:
  - phase: 41-02
    provides: "kis_news_lease_acquire · kis_news_lease_release · kis_news_targets_list · kis_news_stock_meta · kis_news_cleanup · deploy-kis-news-sync.sh KIS_SCHEDULERS"
  - phase: 41-06
    provides: "KisNewsConfig · loadConfig · createLogger(redact) · createSupabaseClient(cfg) · Dockerfile CMD dist/index.js"
  - phase: 41-12
    provides: "toIngestRows(raw, { queriedCode?, meta }) · ingestRows(supabase, rows, via, code?) · shared isEtpProduct"
  - phase: 41-13
    provides: "createKisHttp · KisApiError · safeErrorFields · fetchNewsTitlePage · pageUntilSeen · getKisAccessToken"
provides:
  - "src/pipeline/cadence.ts — FAST_WINDOW_START_MIN(420) · FAST_WINDOW_END_MIN(1200) · kstMinuteOfDay · kstDayOfWeek · resolveCollectorMode · fastWindowEndOf · isCleanupDue · CollectorMode"
  - "src/pipeline/scheduler.ts — TokenBucket · TargetQueue(update · next · ordered · markCollected) · TargetInfo · STOCK_MIN_INTERVAL_MS(30_000)"
  - "src/apiUsage.ts — KIS_USAGE_SERVICE(kis_news_title) · KIS_QUOTA_STRIKE_SERVICE · kstDateString · checkBudget · incrementUsage · readQuotaStrikes · recordQuotaStrike · UsageCounter · budgetStateOf · BUDGET_WARN_RATIO(0.8)"
  - "src/pipeline/targets.ts — loadTargets · loadStockMeta"
  - "src/retention.ts — runCleanup"
  - "src/collector.ts — runCollector · CollectorDeps · CollectorExit · CollectorLog · 주기 상수 13개 + STEP_MS · TOKEN_RETRY_MS · TOKEN_CHECK_MS · BACKOFF_*"
  - "src/index.ts — main · buildDeps (CLI 진입 가드 · SIGTERM · 종료 코드)"
affects: [41-09, 41-11]

actuals:
  tokens: 30345   # chars/4 over 전체 diff(121381자 · 15파일 · RED 기록 2개 포함)
  tasks: 2
  commits: 4
plan_head_before: ce941c686b0b83e2d1952f09caef629303b06668
plan_head_after: 539e83369a0adc319fa74c2a8f3b04230a04ddb1

tech-stack:
  added: []
  patterns:
    - "장기 실행 루프는 시계 · sleep · DB · 한투를 전부 주입받는다 — 13시간 실행을 가짜 시계(sleep 이 시계를 앞당김)로 몇 ms 에 테스트"
    - "루프 어디서든 실행을 끝낼 때는 내부 StopRun(code, reason) 을 던지고 run() 이 종료 코드 · 마무리(flush · 임대 해제)를 한 곳에서"
    - "초당 상한은 용량 1 토큰 버킷 두 개(전체 · 종목) — 버스트가 없어 어느 1초 창에서도 maxRps 이하"
    - "느린 실행의 「한 바퀴」는 TargetQueue.ordered(now) 스냅샷을 한 번 돈다(next() 반복은 30초 재적격으로 끝나지 않는다)"

key-files:
  created:
    - workers/kis-news-sync/src/pipeline/cadence.ts
    - workers/kis-news-sync/src/pipeline/scheduler.ts
    - workers/kis-news-sync/src/apiUsage.ts
    - workers/kis-news-sync/src/pipeline/targets.ts
    - workers/kis-news-sync/src/retention.ts
    - workers/kis-news-sync/src/collector.ts
    - workers/kis-news-sync/src/index.ts
    - workers/kis-news-sync/tests/cadence.test.ts
    - workers/kis-news-sync/tests/scheduler.test.ts
    - workers/kis-news-sync/tests/budget.test.ts
    - workers/kis-news-sync/tests/schedule.test.ts
    - workers/kis-news-sync/tests/collector.test.ts
    - workers/kis-news-sync/tests/targets.test.ts
    - .planning/phases/41-kis-news-and-disclosure-feed/tdd-red/41-08-T1-red.json
    - .planning/phases/41-kis-news-and-disclosure-feed/tdd-red/41-08-T2-red.json
  modified: []

key-decisions:
  - "두 토큰 버킷 모두 용량 1 — 계획의 「어느 1초 창에서도 ≤ 5」 를 버스트 없이 지킨다(TokenBucket 클래스는 용량을 인자로 받아 단위 테스트의 용량 5 동작도 그대로)"
  - "kis.page 시그니처는 page(query, token) — 토큰은 루프가 들고 있다가 무효 시 강제 재발급으로 바꾼다"
  - "호출 수는 실패한 호출도 센다(한투가 받은 요청) · 예산 판정은 호출 직전(다다르면 부르지 않고 종료 1) · 80% 경고는 호출 직후 1번"
  - "한투 응답이 아닌 실패(DB · 분류)는 그 흐름만 물러선다 — 모르는 오류 연속 수(한도 의심)에 세지 않는다"
  - "시작 토큰 실패는 종류와 무관하게 61초 뒤 1번만 다시(임대 있을 때만) — EGW00133 · 61초 가드 · 일시 장애를 한 규칙으로. 기다리는 동안 임대 연장 · flush 는 계속"
  - "임대 연장 DB 오류는 5초 뒤 다시 · 60초(TTL − 연장 주기) 넘게 확인 못 하면 남이 넘겨받기 전에 종료 0"
  - "공시 F · G 안전망도 via 'feed' 로 들여온다 — DB last_srno 가 몇 초 앞설 수 있으나 실행 중 되감기 기준은 메모리의 전체 최신 일련번호"
  - "강제 fast(KIS_NEWS_MODE=fast)라도 그날 KST 20:00 이 이미 지났으면 아무것도 하지 않고 종료 0(fast_window_over)"
  - "TargetQueue 상한 초과 시 급등 · 관심(순위 오름)을 등록보다 먼저 남긴다 · dropped 수가 바뀔 때만 warn(10초마다 같은 경고 반복 방지)"

patterns-established:
  - "수집기 실패 로그 = safeErrorFields 네 필드 + flow(+ 한투 밖 실패는 source: worker) — 토큰 · 앱키는 deps.cfg 에도 들어오지 않는다(Pick)"

requirements-completed: [SC-1, SC-4, SC-5]

coverage:
  - id: D1
    description: "빠른 창 판정(평일 07:00 이상 20:00 미만 fast · 그 밖 · 주말 slow · 설정 강제 · 20:00 끝 · 정리 날짜)과 배포 Scheduler 배열의 분 단위 정합"
    requirement: SC-1
    verification:
      - kind: unit
        ref: "workers/kis-news-sync/tests/cadence.test.ts (15 tests)"
        status: pass
      - kind: unit
        ref: "workers/kis-news-sync/tests/schedule.test.ts (7 tests — scripts/deploy-kis-news-sync.sh KIS_SCHEDULERS 1주일 × 1440분)"
        status: pass
    human_judgment: false
  - id: D2
    description: "초당 상한 토큰 버킷 · 종목 대상 순서(수집 전 등록 최신순 → 오래전 수집순 · 30초 건너뜀 · 상한 dropped · 한 바퀴 스냅샷)"
    requirement: SC-1
    verification:
      - kind: unit
        ref: "workers/kis-news-sync/tests/scheduler.test.ts (15 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "호출 수 카운터 kis_news_title(KST 날짜) · 10초 묶음 flush(실패 시 되돌림) · 80% warn · 100% exhausted · 한도 의심 표시 서비스"
    requirement: SC-4
    verification:
      - kind: unit
        ref: "workers/kis-news-sync/tests/budget.test.ts (11 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "장기 실행 루프 — 임대 · 시작 예산 · 한도 의심 탐침 · probe · fast 30초 흐름별 호출 · 초당 상한 · 새 등록 먼저 · 20:00 끝 · 임대 연장 거절 · 오류 규칙(초당 초과 · 토큰 무효 · 모르는 코드 · 일시 장애) · 80% · 100% · slow 한 바퀴 · 정리 · 로그에 토큰 없음"
    requirement: SC-5
    verification:
      - kind: unit
        ref: "workers/kis-news-sync/tests/collector.test.ts (30 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "대상 · 종목 정보 · 정리 RPC 결선(kis_news_targets_list(100, 10, 200) · ETP 제외 · 시각 변환 · kis_news_cleanup(90, 1))"
    requirement: SC-1
    verification:
      - kind: unit
        ref: "workers/kis-news-sync/tests/targets.test.ts (7 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Job 진입점(dist/index.js) — 실제 의존성 결선 · SIGTERM · 종료 코드"
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/kis-news-sync run build && test -f dist/index.js · 비밀 없이 node dist/index.js → 「kis-news-sync config error」 · exit 1"
        status: pass
    human_judgment: true
    rationale: "실제 Supabase · 한투에 붙은 동작(임대 RPC · 토큰 · probe ok 로그 · 13시간 루프)은 41-09 배포 스모크와 첫 운영일에서만 확인된다 — 이 플랜은 실제 호출 금지"

duration: 18min
completed: 2026-11-12
---

# Phase 41 Plan 08: 수집기 B — 빠른 창 · 초당 상한 · 대상 순서 · 예산 · 장기 실행 루프 Summary

**임대(90초 · 30초 연장)를 가진 한 실행이 평일 KST 07:00 ~ 20:00 동안 200ms 걸음으로 전체 최신(5초 · 최대 5쪽) · 공시 F · G(60초) · 종목별(초당 2.5 · 수집 전 먼저)을 용량 1 토큰 버킷 두 개 아래에서 돌고, 초당 초과 · 토큰 무효 · 모르는 코드 · 일시 장애 · 예산을 운영 기준 ④ 대로 처리하는 수집기를 가짜 시계 테스트 30건으로 잠갔다(워커 전체 188/188 · dist/index.js).**

## Performance

- **Duration:** 약 18분(문맥 읽기 뒤 기록 시작 기준)
- **Started:** 2026-11-11T15:39:34Z
- **Completed:** 2026-11-11T15:57:43Z
- **Tasks:** 2 (둘 다 TDD · RED → GREEN)
- **Files modified:** 15 (생성 15)

## Accomplishments

- `cadence` · `scheduler` · `apiUsage` — 빠른 창 · 초당 상한 · 대상 순서 · 예산을 순수 단위로 잠그고, 배포 스크립트 `KIS_SCHEDULERS` 를 직접 읽어 Scheduler 와 모드 판정이 분 단위로 어긋나면 깨지는 테스트를 세웠다.
- `collector` — 임대 → 예산 → 탐침 → 토큰 → 모드 → 루프/한 번 → 정리 → 해제를 한 클래스로. 모든 종료 경로가 사용량 flush · 임대 해제를 거친다.
- `index` — 실제 Supabase(41-02 RPC · 41-12 들여오기) · 한투(41-13 토큰 · 한 쪽 호출) 결선 · `CLOUD_RUN_EXECUTION:임의8자` holder · SIGTERM → 다음 걸음에서 종료.

## 주기 · 상한 상수

| 상수 | 값 | 뜻 |
|---|---|---|
| `LEASE_TTL_S` · `LEASE_RENEW_MS` | 90 · 30,000 | 임대 TTL · 연장 주기 |
| `FEED_INTERVAL_MS` | 5,000 | 전체 최신 1쪽(마지막 본 글까지) |
| `FEED_MAX_PAGES_FAST` · `FEED_MAX_PAGES_SLOW` | 5 · 30 | 되감기 쪽 상한(넘으면 「page cap reached」 warn) |
| `DISCLOSURE_SAFETY_MS` | 60,000 | 공시 F · G 각 1쪽 |
| `TARGET_RELOAD_MS` | 10,000 | 대상 다시 읽기 |
| `USAGE_FLUSH_MS` | 10,000 | `incr_api_usage` 묶음 |
| `META_RELOAD_MS` | 600,000 | 종목 정보(ETP 판정) 다시 읽기 |
| `TOKEN_CHECK_MS` · `TOKEN_RETRY_MS` | 600,000 · 61,000 | DB 토큰 남은 시간 확인 · 발급 실패 뒤 1번 더 |
| `STOCK_MIN_INTERVAL_MS` | 30,000 | 같은 종목 재조회 최소 간격 |
| `STOCK_RATE_SHARE` | 0.5 | 종목별 = maxRps × 0.5 (기본 2.5/s) |
| `RATE_LIMIT_STRIKES` · `RATE_LIMIT_PAUSE_MS` | 5 · 60,000 | 초당 초과 1분 안 5번 → 60초 전면 정지 |
| `UNKNOWN_ERROR_STRIKES` | 5 | 모르는 코드 연속 5번 → 한도 의심 표시 · 종료 1 |
| `BACKOFF_BASE_MS` · `BACKOFF_MAX_MS` | 1,000 · 60,000 | 일시 장애 흐름별 1 · 2 · 4 … 60초 |
| `STEP_MS` | 200 | 루프 한 걸음 |
| `BUDGET_WARN_RATIO` | 0.8 | 자체 상한(기본 200,000 — 공식 한도 아님) 80% 경고 |

## 가짜 시계 30초 결과 (fast · 월 KST 10:00 · 대상 200 · maxRps 5)

| 흐름 | 호출 수 |
|---|---|
| 전체 최신 | 6 (0 · 5 · 10 · 15 · 20 · 25초) |
| 공시 F · G | 각 1 |
| 종목별 | 71 (간격 ≥ 400ms) |
| 합계 | 79 (≈ 2.6/s · 어느 1초 창 최대 4) |
| 대상 다시 읽기 | 3 |
| 사용량 flush | 3 (10초 · 20초 · 종료) |

평상시 ≈ 2.6/s × 빠른 창 46,800초 ≈ 12.3만 + 느린 실행 ≈ 1.3만 → 평일 ≈ 14만(41-RESEARCH 추정과 같음 · 자체 상한 200,000 의 70%).

## 오류 처리

| 신호 | 판정 | 처리 | 종료 |
|---|---|---|---|
| 임대 못 잡음(fast · slow) | — | 한투 호출 0 · info 「lease held by another run」 | 0 |
| 임대 연장 거절 | — | warn · 해제 안 함(남의 임대) | 0 |
| 임대 연장 DB 오류 | — | 5초 뒤 다시 · 60초 넘게 확인 못 하면 warn | 0 |
| 시작 사용량 ≥ 상한 | `budgetStateOf` | 한투 호출 0 · warn | 0 |
| 호출 중 사용량 80% | 〃 | warn 1번 | — |
| 호출 직전 사용량 ≥ 상한 | 〃 | error · 부르지 않음 | 1 |
| 오늘 한도 의심 표시 > 0 | `strikes.read` | 전체 최신 1쪽 탐침 → 실패 warn · 성공 info 「quota probe ok」 | 실패 1 |
| `EGW00201` · 429 | rate_limit | 그 흐름 1초 쉼 · 1분 안 5번이면 error 1번 + 60초 전면 정지 | — |
| `EGW00121` · `EGW00123` | token_invalid | 강제 재발급 1번 · 같은 실행에서 또 무효면 error | 1 |
| 시작 토큰 실패(EGW00133 · 61초 가드 · 장애) | — | 임대 있으면 61초 뒤 1번 더 · 또 실패 error · 임대 없으면 바로 error | 1 |
| 0 · 5xx · DB · 분류 실패 | transient | 그 흐름만 1 · 2 · 4 … 60초 · 다른 흐름 계속 | — |
| 모르는 `msg_cd` 연속 5번(성공 시 0) | unknown | `kis_news_title_quota_strike` 기록 · error | 1 |
| SIGTERM | abort | 다음 걸음에서 끝 | 0 |
| KST 20:00 | `fastWindowEndOf` | info | 0 |

모든 경로에서 끝날 때 사용량 flush · 임대를 가졌으면 해제. 실패 로그는 `safeErrorFields`(status · msgCd · msg1 · kind) + `flow`.

## Task Commits

1. **Task 1: 시간대 · 속도 상한 · 대상 순서 · 예산 + Scheduler 정합** — RED `21108da7` (test) → GREEN `ee58aa79` (feat)
2. **Task 2: 장기 실행 루프 · 임대 · 오류 처리 · 진입점** — RED `b1c6004a` (test) → GREEN `539e8336` (feat)

REFACTOR 커밋 없음.

## Files Created/Modified

- `workers/kis-news-sync/src/pipeline/cadence.ts` — 빠른 창 판정(순수)
- `workers/kis-news-sync/src/pipeline/scheduler.ts` — TokenBucket · TargetQueue
- `workers/kis-news-sync/src/apiUsage.ts` — news-sync 사본 + UsageCounter · budgetStateOf
- `workers/kis-news-sync/src/pipeline/targets.ts` — 대상 · 종목 정보 RPC
- `workers/kis-news-sync/src/retention.ts` — 정리 RPC
- `workers/kis-news-sync/src/collector.ts` — 수집 루프
- `workers/kis-news-sync/src/index.ts` — Job 진입점
- `workers/kis-news-sync/tests/` — cadence 15 · scheduler 15 · budget 11 · schedule 7 · collector 30 · targets 7
- `.planning/phases/41-kis-news-and-disclosure-feed/tdd-red/41-08-T1-red.json` · `41-08-T2-red.json`

## 테스트

- 이 플랜 6파일 85건 · 워커 전체 13파일 188건 통과.
- 검증 명령:
  - Task 1: `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/kis-news-sync exec vitest run tests/cadence.test.ts tests/scheduler.test.ts tests/budget.test.ts tests/schedule.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/kis-news-sync run typecheck` → 47 passed(GREEN 시점) · tsc 0
  - Task 2: `… vitest run tests/collector.test.ts tests/targets.test.ts --maxWorkers=2 && … vitest run --maxWorkers=2 && … typecheck && … build && test -f workers/kis-news-sync/dist/index.js` → 37 · 188 passed · tsc 0 · DIST-OK
  - 진입점: 비밀 없는 셸에서 `node dist/index.js` → `{"msg1":"missing env: SUPABASE_SERVICE_ROLE_KEY","msg":"kis-news-sync config error"}` · exit 1 (네트워크 호출 0)
- 수용 기준: `FAST_WINDOW_START_MIN = 420` · `FAST_WINDOW_END_MIN = 1200` 선언 줄 · `kis_news_title` 4 · `deploy-kis-news-sync.sh` 4 · Task 1 `it(` 45(≥ 20) · `export async function runCollector` 1 · `LEASE_TTL_S = 90` 선언 줄 · index `SIGTERM` 2 · `probe ok` 3 · collector `it(` 30(≥ 15)

## TDD Gate Compliance

- **T1 RED (`21108da7`):** 타입만 맞춘 스텁으로 47건 중 39건 단언 실패. 판정기 `gsd-tools check tdd-red-evidence` → `RED_EVIDENCE_OK`(target `tests/cadence.test.ts > resolveCollectorMode (auto) > 월 07:00 KST → fast`, expected `fast` · actual `probe`). 의미 판정: 대상이 실행돼 단언에서 실패 · 로드 오류 없음. 통과 8건은 스텁과 무관한 구조 검사(배포 스크립트 배열 · cron 판정기 · 14h)와 우연히 맞는 값.
- **T1 GREEN (`ee58aa79`):** 47/47.
- **T2 RED (`b1c6004a`):** 스텁 `{ code: 1 }` 로 37건 중 35건 단언 실패. 판정기 → `RED_EVIDENCE_OK`(target `임대 못 잡음(fast) → 종료 0 …`, expected code 0 · actual 1). 통과 2건은 「정리 0번 · 로그에 토큰 없음」 같은 부정형 단언(GREEN 에서 같은 단언으로 다시 검증).
- **T2 GREEN (`539e8336`):** 37/37 · 전체 188/188.
- 순서: 두 태스크 모두 `test(41-08)` 다음 그 후손인 `feat(41-08)`.

## Decisions Made

frontmatter `key-decisions` 9건. 핵심: 버킷 용량 1(버스트 없음) · 실패한 호출도 센다 · 한투 밖 실패는 한도 의심에 세지 않는다 · 시작 토큰 실패는 61초 뒤 1번만 · F · G 도 via feed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 느린 실행의 대상 한 바퀴가 끝나지 않던 문제**
- **Found during:** Task 2 GREEN
- **Issue:** slow 를 `queue.next()` 반복으로 돌면, 대상이 많아 한 바퀴가 30초(STOCK_MIN_INTERVAL_MS)를 넘을 때 먼저 모은 종목이 다시 적격이 돼 끝나지 않는다(300종목 테스트가 자체 상한 200,000 까지 호출).
- **Fix:** `TargetQueue.ordered(now)` 를 더해 시작 시점 순서 스냅샷을 각 1번 돈다 · 한 바퀴 중에도 걸음마다 임대 연장 · flush. 테스트 2건(ordered 단위 · slow 300종목 120초 동안 임대 연장 4번 이상).
- **Files modified:** src/pipeline/scheduler.ts · src/collector.ts · tests/scheduler.test.ts · tests/collector.test.ts
- **Committed in:** 539e8336

**2. [Rule 1 - Bug] 테스트 버그 — 「토큰 무효 → 계속」 의 호출 수 기대**
- 대상이 없는 하네스라 10초 동안 호출이 5건뿐이어서 `> 5` 가 깨졌다. 대상 10종목을 줘 「계속 돈다」 를 실제로 보이게 했다. 커밋 539e8336.

**3. [Rule 2 - 핵심 기능 보완] 계획 behavior 밖의 안전 장치**
- 장기 실행 중 10분마다 DB 토큰 확인(13시간 안에 토큰 남은 시간이 1시간 아래로 내려가도 41-13 이 재발급) · 실패해도 지금 토큰으로 계속.
- 시작 토큰 실패 61초 대기 · slow 의 긴 한 바퀴 동안에도 임대 연장 · 사용량 flush(대기 중 TTL 90초 만료 방지).
- 임대 연장 DB 오류는 5초 뒤 다시, 60초 넘게 확인 못 하면 종료 0(중복 실행 방지).
- slow 에서 종목별 일시 장애가 5번 이어지면 그 바퀴를 접는다(60초 물러섬 × 450종목으로 늘어지는 것 방지).
- 강제 fast 인데 그날 20:00 이 지났으면 아무것도 안 하고 종료 0.
- **Committed in:** 539e8336

### 계약 메모(변경 아님)

- `CollectorDeps.kis.page(query, token)` — 계획 문구는 `page(query)` 였지만 토큰을 루프가 들고 바꾸므로 두 번째 인자로 넘긴다. `CollectorDeps.cfg` 는 비밀 필드 없는 `Pick<…, "maxRps" | "dailyBudget" | "mode" | "targetCap">`.
- `TargetQueue.markCollected` 는 성공 · 실패 모두 부른다(실패한 종목을 매 걸음 다시 두드리지 않게).

**Total deviations:** 2 auto-fixed (Rule 1) + 안전 장치 보완(Rule 2)
**Impact on plan:** Artifacts 표의 이름 · 상수 값은 그대로. `TargetQueue.ordered` 만 추가.

## Issues Encountered

- 하네스가 `git` · `env -i` · heredoc 이 섞인 복합 명령을 막아 명령을 단계별로 나눠 돌렸다.
- 가짜 시계 측정용 임시 테스트(`tests/zz-measure.test.ts`)는 수치만 뽑고 지웠다(커밋 안 함).

## Known Stubs

없음 — RED 스텁은 두 GREEN 커밋에서 모두 실제 구현으로 바뀌었다(`grep 스텁|TODO|FIXME|not implemented src/` 빈 출력).

## 41-09 배포가 알아둘 것

- 마이그레이션 두 개(`20261112100000_kis_news_feed.sql` · `20261112200000_kis_news_collector.sql`)가 원격에 먼저 있어야 한다 — 수집기는 `kis_news_state` 표를 직접 읽는다(`last_srno, cleanup_date` · id=1).
- probe 스모크: `KIS_NEWS_MODE=probe` 실행은 로그 메시지 정확히 `probe ok`(필드 fetched · rows · inserted · revisions · linked · lease)를 남기고 종료 0. 임대를 못 잡으면 토큰을 발급하지 않고 DB 토큰을 쓴다 — **첫 배포에서 `kis_access_tokens` 가 비어 있고 다른 실행이 임대를 들고 있으면 probe 는 「no lease」 error · 종료 1** 이다. 첫 probe 는 다른 실행이 없을 때(Scheduler 만들기 전 · 또는 20:00 뒤) 돌리면 임대를 잡고 토큰을 1번 발급한다(알림톡 1통).
- 종료 코드 1 은 Cloud Run 실행 실패로 보인다 — 토큰 · 예산 · 한도 의심 · 예외. 0 은 임대 없음 · 창 끝 · 한 바퀴 끝 · probe · SIGTERM.
- 장중 재배포 시 도는 실행은 옛 이미지로 20:00 까지 간다(41-02 스크립트 머리 주석). 강제로 바꾸려면 실행을 취소 → SIGTERM → 다음 걸음에서 flush · 임대 해제(늦어도 90초 뒤 다음 깨움이 넘겨받는다).
- 로그 키: 「collector start」(mode · endAt · maxRps · targetCap) · 「collector stop」(reason · calls · feed · F · G · stock · inserted · linked · errors · usedToday · durationMs) — 첫 운영일 확인에 쓴다.
- 이 플랜은 실제 한투 · Supabase 를 부르지 않았다 — 모든 동작은 목 기반이다.

## User Setup Required

None — 외부 설정은 41-09(배포 · 비밀 주입)에서.

## Next Phase Readiness

- 41-09 가 `scripts/deploy-kis-news-sync.sh` 로 이 워커를 빌드 · 배포할 수 있다(Dockerfile `CMD node dist/index.js` 충족).
- 41-11 운영 수치(`kis-news-report.sh stats`)가 `kis_news_title` 카운터 · strike 를 읽는다.

## Self-Check: PASSED

- FOUND: src/pipeline/cadence.ts · src/pipeline/scheduler.ts · src/apiUsage.ts · src/pipeline/targets.ts · src/retention.ts · src/collector.ts · src/index.ts · tests 6개 · tdd-red 2개
- FOUND: 21108da7 · ee58aa79 · b1c6004a · 539e8336 (HEAD 조상)
- 플랜 verification: `pnpm --filter @gh-radar/kis-news-sync exec vitest run --maxWorkers=2` 13 files · 188 passed · typecheck · build(dist/index.js) 통과
- STATE.md · ROADMAP.md 수정 없음

---
*Phase: 41-kis-news-and-disclosure-feed*
*Completed: 2026-11-12*
