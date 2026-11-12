---
phase: 43-tender-offer-telegram-alert
plan: 03
subsystem: workers/dart-alert
status: complete
tags: [env-contract, pino-redact, cadence, kst, api-usage, budget, tdd]
requires:
  - 43-01 (workers/dart-alert 골격 · watches.ts `DEFAULT_B001_KINDS`)
provides:
  - src/config.ts (DartAlertConfig · DartAlertMode · loadConfig · DART_DAILY_BUDGET_LIMIT · DART_DEFAULT_BASE_URL · TELEGRAM_DEFAULT_BASE_URL)
  - src/logger.ts (createLogger · REDACT_PATHS)
  - src/services/supabase.ts (createSupabaseClient)
  - src/cadence.ts (WINDOW_START_MIN · PREOPEN_END_MIN · WINDOW_END_MIN · PREOPEN_INTERVAL_MS · REGULAR_INTERVAL_MS · START_GRACE_MS · LATE_GAP_MS · kstMinuteOfDay · kstDayOfWeek · kstYmd · isInWindow · lapIntervalMs · windowStartMs · windowEndMs · coverPointMs · isLateAt · plannedDailyLaps · plannedDailyCalls)
  - src/apiUsage.ts (DART_USAGE_SERVICE · DART_QUOTA_STRIKE_SERVICE · BUDGET_WARN_RATIO · BudgetState · kstDateString · checkBudget · incrementUsage · readQuotaStrikes · recordQuotaStrike · budgetStateOf · UsageCounter)
affects: [43-05, 43-06, 43-07]
tech-stack:
  added: []
  patterns:
    - "시각 인자는 epoch ms number 로 통일 · +9h 뒤 getUTC* / Date.UTC 로만 계산(TZ 비의존)"
    - "D-12 커버 기준점 = 오늘 창 시작 이후 마지막 성공 조회, 없으면 07:00 + 120초 · 60초 초과면 늦은 알림"
    - "하루 호출 수는 lapIntervalMs 로 시작 대 시작을 걸어 센다(plannedDailyLaps) — 상수 산수가 아니라 간격 함수에 묶임"
    - "api_usage 카운터는 kis-news-sync 복제 · 서비스 키 두 개만 다름 · 10초 묶음 flush 실패 시 수 보존"
key-files:
  created:
    - workers/dart-alert/src/config.ts
    - workers/dart-alert/src/logger.ts
    - workers/dart-alert/src/services/supabase.ts
    - workers/dart-alert/src/cadence.ts
    - workers/dart-alert/src/apiUsage.ts
    - workers/dart-alert/tests/config.test.ts
    - workers/dart-alert/tests/logger.test.ts
    - workers/dart-alert/tests/cadence.test.ts
    - workers/dart-alert/tests/budget.test.ts
  modified: []
decisions:
  - "coverPointMs 는 lastOk 가 오늘 창 시작(07:00) 이상이면 그대로 쓴다 — 07:00 ~ 07:02 사이 성공이어도 07:02 로 올리지 않는다(정상 바퀴 5초 간격이라 늦음 오판 없음)"
  - "plannedDailyLaps 는 고정 기준 평일(2026-11-16 월)을 lapIntervalMs 로 걸어 센다 — 간격 규칙을 바꾸면 하루 호출 수가 저절로 따라온다"
  - "RED 임시 골격은 Task 1 과 같이 커밋하지 않고 GREEN 에서 실제 구현으로 대체했다"
metrics:
  duration: 약 25분(중단 · 재개 포함 — 첫 executor 시작 시각 미기록 · 커밋 기준 23:13 ~ 23:25)
  completed: 2026-11-12
estimate:
  tokens: 45000
actuals:
  tokens: 10800
  tasks: 2
  commits: 4
plan_head_before: 9ce64693b8f61375f2aa053ed1e546451d4494fb
plan_head_after: 3b1c67cb9f1aa059b02ea4150505f95acbb6b107
---

# Phase 43 Plan 03: 수집기 바탕 — env 계약 · 비밀 가림 로거 · 시간 규칙 · 호출 수 카운터 Summary

**한 줄 요약:** 예산 상한 15,000 을 설정 단계에서 막는 env 계약 · `crtfc_key`/봇 토큰/방 id 를 가리는 pino 로거와, 평일 `07:00` ~ `20:00` 5초/10초 바퀴 = 하루 5,400바퀴 × 2 = 10,800회 · D-12 늦은 알림 기준점 · `api_usage` `opendart_list` 카운터를 순수 함수와 테스트로 고정했다.

## 진행 경위

- Task 1(env 계약 · 로거 · supabase 클라이언트)은 첫 executor 가 RED `308e50e0` → GREEN `d15d65b0` 로 끝냈다. 재개 시 커밋 존재와 테스트(43/43 통과)를 확인만 했고 다시 쓰지 않았다.
- 첫 executor 는 Task 2 의 RED 단계에서 인증 만료로 끊겼다. 남아 있던 것: 완성된 테스트 2개(미추적) · 임시 골격 2개(미추적) · 비어 있는 RED 보고서 `.gsd/red/t2.xml`(0바이트).
- 비어 있던 원인: 골격 `lapIntervalMs` 가 `1` 을 돌려줘 하루 걷기 테스트가 1ms 씩 약 4,680만 번 돌았다(사실상 무한 루프). 재개 후 같은 실행이 120초를 넘겨 그 vitest 프로세스만 골라 멈췄다.

## Task 별 결과

| Task | 이름 | RED | GREEN | 파일 |
|------|------|-----|-------|------|
| 1 | env 계약 · 비밀 가림 로거 · supabase 클라이언트 | `308e50e0` | `d15d65b0` | src/config.ts · src/logger.ts · src/services/supabase.ts · tests/config.test.ts · tests/logger.test.ts |
| 2 | 시간대 · 바퀴 간격 · 늦은 알림 기준점 · 호출 수 카운터 | `3e0e12c2` | `3b1c67cb` | src/cadence.ts · src/apiUsage.ts · tests/cadence.test.ts · tests/budget.test.ts |

## env 표 (43-07 배포 스크립트와 같은 계약)

| 이름 | 필수 | 기본값 | 범위 · 검사 |
|------|------|--------|-------------|
| `SUPABASE_URL` | 예 | — | 없으면 이름만 담은 오류 |
| `SUPABASE_SERVICE_ROLE_KEY` | 예(Secret) | — | 없으면 이름만 담은 오류 |
| `OPENDART_API_KEY` | 예(Secret) | — | 없으면 이름만 담은 오류 |
| `TELEGRAM_BOT_TOKEN` | 예(Secret) | — | 없으면 이름만 담은 오류 |
| `TELEGRAM_CHAT_ID` | 예(Secret) | — | `^-?[0-9]+$` · 아니면 이름만 담은 오류(값 안 실음) |
| `DART_BASE_URL` | 아니오 | `https://opendart.fss.or.kr` | — |
| `TELEGRAM_BASE_URL` | 아니오 | `https://api.telegram.org` | — |
| `DART_ALERT_DAILY_BUDGET` | 아니오 | `15000` | 정수 1 ~ 15,000(공식 20,000 의 75%) · 밖이면 시작 안 함 |
| `DART_ALERT_MODE` | 아니오 | `auto` | `auto` · `probe` · `seed` · `test-send` |
| `DART_ALERT_B001_KINDS` | 아니오 | 유상증자결정 · 유무상증자결정 · 회사합병결정 · 회사분할합병결정 | 쉼표 목록 · trim · 빈 항목 제거 · 결과 비면 오류 · 최대 20개 |
| `DART_ALERT_B001_CORRECTIONS` | 아니오 | `include` | `include` · `exclude` |
| `LOG_LEVEL` | 아니오 | `info` | — |
| `APP_VERSION` | 아니오 | `dev` | — |

로거 가림(`[redacted]`): `crtfc_key` · `token` · `botToken` · `authorization` · `url` · `params` · `chat_id` · `dartApiKey` · `telegramBotToken` · `telegramChatId` · `supabaseServiceRoleKey` 와 컨테이너 `headers` · `config` · `request` — 맨 위와 `*.` 한 단계.

## 시각 경계 단언 목록 (tests/cadence.test.ts)

- 상수: `WINDOW_START_MIN = 420` · `PREOPEN_END_MIN = 540` · `WINDOW_END_MIN = 1200` · 5,000ms · 10,000ms · 여유 120,000ms · 늦음 60,000ms
- `lapIntervalMs`: 월 06:59:59 null · 07:00:00 5000 · 08:59:59 5000 · 09:00:00 10000 · 19:59:59 10000 · 20:00:00 null · 23:59:59 null · 토 · 일 10:00 null · 금 공휴일 2026-12-25 10:00 10000(휴장일 달력 없음)
- TZ `America/New_York` · `UTC` · `Asia/Seoul` 에서 같은 답
- `windowStartMs` / `windowEndMs`: 그날 KST 07:00 / 20:00 · KST 화 00:30(= 월 UTC 15:30)은 화요일 기준
- `kstYmd`: UTC 14:59:59 → 그날 · UTC 15:00:00 → 다음 날 · `kstDateString` 도 같은 경계
- `coverPointMs`: lastOk null → 07:02 · 어제 → 07:02 · 오늘 08:10:00 → 08:10:00
- `isLateAt`: 정상 아침 07:00:35 false · 전날 저녁 서류 07:30:05(직전 성공 07:29:55) false · 09:30 첫 기동 true · 10:01:10(70초) true · 10:00:55(55초) false · 정확히 60초 false · 60.001초 true

## 하루 호출 수 계산 결과

| 구간 | 초 | 간격 | 바퀴 |
|------|----|------|------|
| 장전 `07:00` ~ `09:00` | 7,200 | 5초 | 1,440 |
| 정규 `09:00` ~ `20:00` | 39,600 | 10초 | 3,960 |
| 합 | 46,800 | — | **5,400** |

- `plannedDailyCalls(2)` = **10,800**(공식 20,000 의 54%) ≤ 예산 상한 15,000 — 시작 대 시작 걷기와 86,400초 1초 단위 걷기 두 방식으로 고정
- `plannedDailyCalls(3)` = 16,200 > 15,000 — 감시 대상을 늘릴 때 목록 · 예산을 같이 점검해야 한다는 근거
- 주말 이틀 172,800초 전부 null

## api_usage 카운터

- 서비스 키 `opendart_list`(KST 날짜 키) · 한도 의심 표시 `opendart_list_quota_strike` · 경고 비율 0.8
- `budgetStateOf(11999, 15000)` ok · `12000` warn · `15000` · `15001` exhausted
- `UsageCounter`: 모은 수를 flush 때 `incr_api_usage(p_service "opendart_list", p_date, p_amount)` 1회 · pending 0 이면 RPC 없음(null) · 실패하면 수를 되돌려 다음 flush 에 다시 실음

## 검증

- `pnpm exec vitest run tests/cadence.test.ts tests/budget.test.ts --maxWorkers=2` → 2 files · 44 passed
- `pnpm exec vitest run tests/config.test.ts tests/logger.test.ts --maxWorkers=2` → 2 files · 43 passed
- `pnpm exec vitest run --maxWorkers=2`(dart-alert 전체) → 6 files · 97 passed
- `pnpm run typecheck`(`tsc --noEmit`) → 오류 0
- acceptance grep: cadence.test `10800|10_800` 2 · `15000|15_000` 1 · cadence.ts 창 상수 3 · apiUsage `"opendart_list"` 1 · `"opendart_list_quota_strike"` 1 · config env 이름 14 · `15_000` 1 · logger 키 3 — 모두 기준 충족

## TDD Gate Compliance

- Task 1: RED `308e50e0` → GREEN `d15d65b0`(첫 executor · RED 증거 `.gsd/red/t1.json` 은 gitignore 스크래치).
- Task 2: RED `3e0e12c2` → GREEN `3b1c67cb`.
  - RED 증거: `pnpm exec vitest run tests/cadence.test.ts tests/budget.test.ts --maxWorkers=2 --reporter=junit` JUnit XML → `gsd_run check tdd-red-evidence` = `RED_EVIDENCE_OK`(reason `target_test_failed` · 44 tests · 9 pass · 35 fail).
  - 대상 테스트: 「하루 호출 수 > 평일 하루를 바퀴 시작 대 시작으로 걸으면 5,400바퀴 × 감시 대상 2 = 10,800회 ≤ 15,000」 — 골격 `lapIntervalMs` 가 null 을 돌려 `expected null not to be null` 단언으로 실패.
  - semanticAssessment: 대상 테스트가 실제로 실행돼 계획된 단언에서 실패했다. 수집 · import · 문법 · 픽스처 오류 0(errors="0"). 통과한 9개는 골격의 null · false · "ok" 반환이 우연히 기대와 같은 경우(창 밖 null · 늦지 않음 · 11,999 ok · 주말 0바퀴)이고 GREEN 에서도 유지된다.
  - 임시 골격(`src/cadence.ts` · `src/apiUsage.ts` 의 no-op)은 RED 커밋에 넣지 않았다 — RED 커밋은 테스트 두 파일뿐.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 하루 걷기 테스트의 무한 루프 위험 가드**
- **Found during:** Task 2 RED 재실행
- **Issue:** 구현(또는 골격)이 0 · 아주 작은 간격을 돌려주면 `for (t …; t += iv)` 걷기가 사실상 끝나지 않는다(첫 executor 의 RED 실행이 이것으로 멈춤).
- **Fix:** 걷기 안에 `expect(iv!).toBeGreaterThanOrEqual(PREOPEN_INTERVAL_MS)` 와 바퀴 20,000 상한 throw 를 넣었다. 골격 `lapIntervalMs` 는 RED 실행용으로 null 을 돌리게 바꿨다(커밋 안 함).
- **Files modified:** workers/dart-alert/tests/cadence.test.ts
- **Commit:** `3e0e12c2`

**2. [Rule 1 - Bug] `it.each` 테스트 이름이 기대값 대신 시각 숫자를 찍던 표시 결함**
- **Found during:** Task 2 RED 보고서 확인
- **Issue:** 튜플 `[label, at, want]` 에 `"%s → %s"` 라 이름이 「월 07:00:00 → 1794780000000」 으로 나왔다.
- **Fix:** 튜플을 `[label, want, at]` 로 바꿔 「월 07:00:00 → 5000」 으로 읽히게 했다(단언 내용 동일).
- **Files modified:** workers/dart-alert/tests/cadence.test.ts
- **Commit:** `3e0e12c2`

## 다음 플랜에 넘길 것

- 43-05 수집기: `lapIntervalMs(clock.now())` 가 null 이면 루프 종료 · `coverPointMs(now, lastOkMs)` + `isLateAt` 로 처음 본 건의 늦음 판정 · `new Date(clock.now())` 로 `kstDateString` 호출 · `UsageCounter` 10초 flush.
- 43-07 Scheduler 정합 테스트: `WINDOW_START_MIN` · `WINDOW_END_MIN` · `isInWindow` 를 읽는다. 시각 인자가 `Date` 가 아니라 epoch ms number 임에 유의.
- 이 플랜은 43-04 · 43-09 소유 파일(`src/dart/client.ts` · `src/telegram/client.ts` · `src/safeError.ts` · `src/watches.ts` · `src/lap.ts` · `src/message.ts`)을 건드리지 않았다.

## 확인하지 못한 것

- 실제 OpenDART · Telegram · 원격 Supabase 호출은 하지 않았다(가짜 supabase 만). `incr_api_usage` RPC 의 실제 응답 형은 기존 kis-news-sync 와 같다고 보고 복제했다.
- 첫 executor 의 Task 1 시작 시각이 기록되지 않아 duration 은 커밋 시각 기준 추정이다.

## Self-Check: PASSED

- 파일 9개 존재 확인 · 커밋 `308e50e0` · `d15d65b0` · `3e0e12c2` · `3b1c67cb` 모두 HEAD 조상
