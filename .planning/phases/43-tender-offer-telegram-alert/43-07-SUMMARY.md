---
phase: 43-tender-offer-telegram-alert
plan: 07
subsystem: ops/dart-alert
status: complete
tags: [deploy, cloud-run-job, scheduler, alert-policy, secrets, telegram, opendart, smoke]
requires:
  - 43-02 RPC 이름(dart_alert_ops_stats · incr_api_usage · api_usage service opendart_list)
  - 43-03 config.ts env 이름 · cadence.ts 창 상수(WINDOW_START_MIN · WINDOW_END_MIN · isInWindow)
  - 43-05 모드 probe · seed · test-send · 로그 문구 probe ok · seed done · CMD node dist/index.js
provides:
  - scripts/deploy-dart-alert.sh (--self-test · --help · --scheduler-paused · DART_SCHEDULERS · DART_ALERT_VPC_EGRESS · NOTIFICATION_CHANNEL_ID)
  - workers/dart-alert/Dockerfile
  - ops/alert-dart-alert-failure.yaml · ops/alert-dart-alert-error-log.yaml
  - workers/dart-alert/tests/schedule.test.ts
  - scripts/setup-dart-alert-iam.sh · setup-dart-alert-secrets.sh · telegram-find-chat.sh · smoke-dart-alert.sh · dart-alert-report.sh
affects: [43-08]
tech-stack:
  added: []
  patterns:
    - "비밀이 든 요청 주소 · 헤더는 printf 로 만든 curl 설정 줄을 파이프로 `curl -K -` 에 넘긴다(명령줄 · 프로세스 목록 노출 0)"
    - "배포 스크립트 배열을 테스트가 직접 읽어 1주일 × 1440분 정합 + config.ts 필수 env 이름 대조"
key-files:
  created:
    - scripts/deploy-dart-alert.sh
    - workers/dart-alert/Dockerfile
    - ops/alert-dart-alert-failure.yaml
    - ops/alert-dart-alert-error-log.yaml
    - workers/dart-alert/tests/schedule.test.ts
    - scripts/setup-dart-alert-iam.sh
    - scripts/setup-dart-alert-secrets.sh
    - scripts/telegram-find-chat.sh
    - scripts/smoke-dart-alert.sh
    - scripts/dart-alert-report.sh
  modified: []
key-decisions:
  - "배포는 --set-env-vars 라 따로 넣은 DART_ALERT_B001_KINDS · DART_ALERT_B001_CORRECTIONS 가 다음 배포에서 지워진다 — 배포 스크립트가 같은 이름의 env 를 받아 그대로 싣는다(없으면 config.ts 기본값)"
  - "--scheduler-paused 없이 배포했는데 Scheduler 가 PAUSED 면 재개하지 않고 경고만 낸다(사용자가 일부러 멈췄을 수 있다)"
  - "survey 는 오늘 한도 의심 표시(020)가 있거나 오늘 호출 + 200 이 15,000 을 넘으면 OpenDART 를 부르지 않는다 · 020 을 받으면 그 자리에서 멈춘다 · 호출 수는 조사가 멈춰도 incr_api_usage 로 더한다"
  - "schedule.test.ts 에 config.ts 필수 env 5개 ↔ 배포 스크립트 --set-secrets · --set-env-vars 대조를 더했다(key_link 를 테스트로 잠금)"
requirements-completed: [SC-4, SC-6, SC-7]
metrics:
  duration: 23m
  started: 2026-11-12T14:57:00Z
  completed: 2026-11-12
  tasks: 2
  files: 10
estimate:
  tokens: 58000
actuals:
  tokens: 19800
  tasks: 2
  commits: 2
plan_head_before: 643441fc673adba31de419d0ea7480bd68748ca4
plan_head_after: 88a2a3bc55e7847b46b6dd3a6c452815e55ebe19
coverage:
  - deliverable: "Scheduler 하나 · 창 안만 · 창 안 5분마다 · 14h · 재시도 0"
    human_judgment: false
    verification:
      - kind: test
        ref: "workers/dart-alert/tests/schedule.test.ts (9 tests)"
        status: pass
      - kind: command
        ref: "bash scripts/deploy-dart-alert.sh --self-test"
        status: pass
  - deliverable: "예산 1 ~ 15,000 밖 거부"
    human_judgment: false
    verification:
      - kind: command
        ref: "DART_ALERT_DAILY_BUDGET=15001 bash scripts/deploy-dart-alert.sh (가짜 gcloud) → ERROR · exit 1, gcloud 호출 0"
        status: pass
  - deliverable: "비출력 비밀 등록 · 방 id 찾기 · survey · stats"
    human_judgment: false
    verification:
      - kind: command
        ref: "scratchpad 가짜 curl · gcloud 하네스 — 표지 문자열(키 · 토큰 · 서비스롤 · 글 본문) 출력 0 · curl argv 0"
        status: pass
  - deliverable: "실제 GCP · OpenDART · 텔레그램 · Supabase 대상 동작"
    human_judgment: true
    rationale: "executor 는 실행 금지(레인 규칙) — 43-08 메인 세션 · 사용자 `!` 가 확인한다"
---

# Phase 43 Plan 07: 운영 껍데기(배포 · 이미지 · 이메일 정책 · 사용자 스크립트 · 스모크 · 보고) Summary

**`gh-radar-dart-alert` Job(14h · 재시도 0 · 동시 1)과 Scheduler 하나(평일 `07:00` ~ `19:55` 5분), 이메일 알림 정책 2개를 한 줄로 배포하는 스크립트와 GCP 접촉 없는 `--self-test`, 1주일 × 1440분 Scheduler 정합 테스트를 만들고 — 사용자가 터미널 한 줄씩으로 봇 방 id 를 찾고 키 · 토큰 · 방 id 를 화면에 드러내지 않고 등록하는 스크립트, probe 스모크, 한 달 조사(survey) · 운영 수치(stats) 보고를 붙였다. 실제 실행은 하나도 하지 않았다(43-08 몫).**

## 수행 결과

| Task | 이름 | 커밋 | 파일 |
|------|------|------|------|
| 1 | 배포 스크립트 · Dockerfile · 정책 yaml 2 · Scheduler 정합 테스트 | 5b6ba1c4 | scripts/deploy-dart-alert.sh · workers/dart-alert/Dockerfile · ops/alert-dart-alert-failure.yaml · ops/alert-dart-alert-error-log.yaml · workers/dart-alert/tests/schedule.test.ts |
| 2 | 사용자 `!` 스크립트 · 스모크 · 보고 | 88a2a3bc | scripts/setup-dart-alert-iam.sh · setup-dart-alert-secrets.sh · telegram-find-chat.sh · smoke-dart-alert.sh · dart-alert-report.sh (+ deploy-dart-alert.sh 안내 위치) |

## 스크립트별 사용법 (한 줄씩)

| 스크립트 | 누가 | 한 줄 |
|----------|------|-------|
| `scripts/telegram-find-chat.sh` | 사용자 `!` | `! bash scripts/telegram-find-chat.sh` — env 파일의 토큰으로 방 id · 종류 · 이름만 표로 |
| `scripts/setup-dart-alert-iam.sh` | 사용자 `!` | `! GCP_PROJECT_ID=gh-radar bash scripts/setup-dart-alert-iam.sh` — SA · Secret 껍데기 3 · Accessor 4 |
| `scripts/setup-dart-alert-secrets.sh` | 사용자 `!` | `! bash scripts/setup-dart-alert-secrets.sh` — `~/.config/gh-radar/dart-alert.env`(600) 세 값 → Secret |
| `scripts/deploy-dart-alert.sh` | 메인 세션 | `GCP_PROJECT_ID=gh-radar SUPABASE_URL=… bash scripts/deploy-dart-alert.sh [--scheduler-paused]` · 점검만 `--self-test` |
| `scripts/smoke-dart-alert.sh` | 메인 세션(배포 끝에서 자동) | `bash scripts/smoke-dart-alert.sh` — INV-1 ~ 5 |
| `scripts/dart-alert-report.sh` | 메인 세션 | `SUPABASE_URL=… bash scripts/dart-alert-report.sh survey 30` · `… stats 1` |

### 사용자 `!` 명령 목록(순서)

1. BotFather 로 봇 생성 → `~/.config/gh-radar/dart-alert.env` 에 `OPENDART_API_KEY=` · `TELEGRAM_BOT_TOKEN=` 두 줄 · `chmod 600`
2. 봇과 1:1 대화에서 「시작」 · 팀 단체방에 봇 초대
3. `! bash scripts/telegram-find-chat.sh` → 개인 대화 id 를 env 파일 `TELEGRAM_CHAT_ID=` 에
4. `! GCP_PROJECT_ID=gh-radar bash scripts/setup-dart-alert-iam.sh`
5. `! bash scripts/setup-dart-alert-secrets.sh`
6. (메인 세션 배포 → test-send 로 개인 대화 시험 글 확인)
7. env 파일 `TELEGRAM_CHAT_ID` 를 단체방 id 로 바꾸고 `! bash scripts/setup-dart-alert-secrets.sh` 재실행(키 · 토큰은 SKIP)

### 알림 정책 표시 이름

- `gh-radar-dart-alert-failure` — Job 실행 실패 수 > 0 (`completed_execution_count` · `result = "failed"` · autoClose 1800s)
- `gh-radar-dart-alert-error-log` — `jsonPayload.level >= 50` 로그 일치 · `notificationRateLimit.period: 3600s`
- 채널: `NOTIFICATION_CHANNEL_ID` 가 없으면 `gh-radar-limitup-sync-failure` 정책의 첫 채널

## 검증 — 실제 출력

- **Task 1 플랜 `<verify>`** → `DEPLOY-OK`. self-test 출력:
  `SELF-TEST OK — schedulers=1 (gh-radar-dart-alert-wake|*/5 7-19 * * 1-5) · task-timeout=14h · max-retries=0 · parallelism=1 · DART_ALERT_DAILY_BUDGET=15000 (15001 거부) · alert policies=2`
  macOS 기본 `/bin/bash` 3.2.57 에서도 같은 출력.
- **self-test 음성 검사**(scratchpad 사본 변조): `--max-retries=1` → `FAIL: 배포 명령에 --max-retries=0 줄이 없다` · cron `*/5 * * * *` → FAIL · 정책 파일 하나 삭제 → `FAIL: 알림 정책 파일 없음` · `DART_ALERT_DAILY_BUDGET=15001 --self-test` → `SELF-TEST FAIL (1)`. 실제 배포 경로도 `DART_ALERT_DAILY_BUDGET=15001` 이면 gcloud 를 부르기 전에 `ERROR … 정수 1 ~ 15000` · exit 1.
- **schedule.test.ts** 9 passed. 헛통과 점검: 배열 cron 을 `*/5 6-19 * * 1-5` 로 임시 변조하면 ① ② ③ 이 실패(원복 후 `cmp` 로 같음 확인).
- **Task 2 플랜 `<verify>`** → `OPS-OK`. 수용 기준 grep: IAM Secret 이름 5 · `dart-alert.env` 5 / 4 · `^-?[0-9]+$` 2 · `dart_alert_ops_stats` 5 · `incr_api_usage` 3 · `curl[^|]*crtfc_key` 출력 없음 · `-K -` 3. 다섯 스크립트 모두 `bash -n` · 실행 비트(100755 커밋) · `/bin/bash` 3.2 `--help` exit 0.
- **YAML**: 저장소의 js-yaml 4.1.1 로 두 정책 파일 파싱 — `conditionThreshold` / `conditionMatchedLog` · alertStrategy 확인.
- **전체 dart-alert 테스트**: `Test Files 13 passed (13) · Tests 275 passed (275)`(기존 12 파일 266 + schedule 9) · `pnpm run build`(tsc) 통과 · 끝난 뒤 vitest 프로세스 없음.
- **가짜 `curl` · `gcloud` · `docker` 하네스(scratchpad · 네트워크 접촉 0 · 가짜 표지 값만)**:
  - `telegram-find-chat.sh`: 개인 · 일반 그룹 두 방을 중복 없이 표로, 일반 그룹 안내 출력 · `ok:false` 면 description 만 · 결과 없음 3줄 안내.
  - `setup-dart-alert-secrets.sh`: 1차 키 · 토큰 OK + 방 id 「SKIP — 파일에 없음」 → 2차 둘 다 「이미 같은 값」 SKIP → 방 id 개인 → 단체방 음수(`-1001234567890`)로 바꾸면 방 id 만 새 버전 · 따옴표 벗겨 정확히 저장 · `@mygroup` · 짧은 키 · 권한 644 는 ERROR.
  - `dart-alert-report.sh stats`: 표 출력. `survey 5`: ⑴ ~ ⑹ 출력 · 100 초과 날 · 정정 포함/제외 · 근접 불일치(무상증자결정) · 호출 3 → `incr_api_usage` 본문 `{"p_service":"opendart_list","p_date":"2026-11-13","p_amount":3}`. 2쪽에서 `020` → 그 자리에서 멈추고 exit 1 · 그래도 +2 더함. 한도 의심 표시 1 이면 OpenDART 호출 0 으로 거부. Secret 이 없으면 env 파일 키로 대체.
  - **비밀 노출 점검**: 표지 `TESTDARTKEYDONOTLOG` · `TESTBOTTOKENDONOTLOG` · `SBKEYDONOTLOG` · 글 본문 `SECRET-MESSAGE-TEXT` 가 모든 출력에 0건 · curl 명령줄(argv 기록)에 0건 — 키는 표준입력 설정(URL 기록)에만 있었다.
  - `smoke-dart-alert.sh`: 가짜 응답으로 6 PASS · `timeoutSeconds 3600` 이면 INV-2 FAIL · exit 1. 기대 일정은 배포 스크립트 배열에서 읽음(`*/5 7-19 * * 1-5`).
  - `deploy-dart-alert.sh --scheduler-paused` 전체 경로: docker build 인자(`--platform=linux/amd64 --build-arg GIT_SHA=…`) · `run jobs deploy … --task-timeout=14h --max-retries=0 --parallelism=1 --tasks=1` · `--set-env-vars=^@^SUPABASE_URL=…@DART_ALERT_DAILY_BUDGET=15000@APP_VERSION=<sha>@LOG_LEVEL=info@DART_ALERT_B001_KINDS=유상증자결정,회사합병결정` · `--set-secrets` 4개 · Scheduler create → pause · limitup 정책 채널 대체 · 정책 2개 create 순서를 확인했다(INV-5b 실패는 가짜 쪽이 두 번째 정책을 돌려주지 않게 짠 탓).
- `shellcheck` 는 설치돼 있지 않아 돌리지 않았다.

## 실제 서비스 없이는 확인하지 못한 것 (43-08 점검 목록)

1. `docker build` 실제 이미지 빌드(로컬 docker build 도 하지 않았다) · Artifact Registry push.
2. `setup-dart-alert-iam.sh` 실제 SA · Secret 껍데기 · Accessor 바인딩(+ `monitoring` · `logging` API enable).
3. `setup-dart-alert-secrets.sh` 실제 Secret Manager 쓰기 · 같은 값 SKIP(실제 `versions access` 동작).
4. `telegram-find-chat.sh` 실제 `getUpdates` 응답 · `curl -K -` 설정 줄로 실제 텔레그램 HTTPS 호출.
5. `gcloud run jobs deploy` 가 `--set-env-vars` `^@^` 구분자 · 한글 값(`DART_ALERT_B001_KINDS`)을 실제로 받아들이는지.
6. Scheduler create · `pause` · 이미 있을 때 update · PAUSED 상태 판독(`value(state)`).
7. `gcloud alpha monitoring policies list --format='value(notificationChannels[0])'` 가 limitup 정책 채널 전체 이름을 돌려주는지 · 두 정책 create/update 가 YAML 을 받아들이는지(`conditionMatchedLog` + `notificationRateLimit`).
8. 스모크 INV-1(probe 실제 실행 · `probe ok` 로그) ~ INV-5 · Job describe JSON 의 timeout · retries 필드 위치.
9. `dart-alert-report.sh survey` 실제 OpenDART 응답(`total_page` · `013` · 날짜 범위 90일 상한) · `incr_api_usage` 실제 RPC · `stats` 의 `dart_alert_ops_stats` 실제 응답(43-02 마이그레이션 적용 뒤).
10. error 로그 정책이 pino `jsonPayload.level` 숫자 필드로 실제 일치하는지(43-06 의 `dart outage opened` 등 문구는 43-06 몫 — 이 플랜은 문서에 이름만 적었다).
11. 첫 배포 날 절차(seed 를 `--wait` 없이 → `seed done` → resume) 실제 순서.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] survey 호출 수가 0 으로 집계됨**
- **Found during:** Task 2 가짜 하네스 검증
- **Issue:** `fetch_page` 를 `line="$(fetch_page …)"` 명령 치환(하위 셸)으로 불러 그 안의 `CALLS` 증가가 사라졌다 — `incr_api_usage` 를 건너뛰어 수집기 예산 카운터에서 조사 호출이 빠질 뻔했다.
- **Fix:** 호출 수를 호출부(`survey_type`)에서 센다(실패 호출 포함). 수정 뒤 3 · 020 경로 2 로 정확히 더함.
- **Files modified:** scripts/dart-alert-report.sh
- **Commit:** 88a2a3bc

**2. [Rule 2 - 정확성] `--set-env-vars` 가 따로 넣은 종류 목록 env 를 지움**
- **Found during:** Task 1
- **Issue:** 머리 주석의 「쉼표 값은 `gcloud run jobs update --update-env-vars='^@^…'` 로」 요령대로 넣은 `DART_ALERT_B001_KINDS` 가 다음 배포의 `--set-env-vars` 에 덮여 조용히 기본값으로 돌아간다.
- **Fix:** 배포 스크립트가 같은 이름의 env(`DART_ALERT_B001_KINDS` · `DART_ALERT_B001_CORRECTIONS`)를 받아 검증(`@` 금지 · include|exclude) 후 그대로 싣고, 머리 주석에 경고를 적었다.
- **Files modified:** scripts/deploy-dart-alert.sh
- **Commit:** 5b6ba1c4

**3. [Rule 2 - 운영 기준 ①·④] survey 의 예산 · 한도 신호 문**
- **Found during:** Task 2
- **Issue:** 조사는 한 번에 20 ~ 40회를 더 부른다 — 오늘 이미 `020` 을 받았거나 예산에 가까우면 두드림이 된다.
- **Fix:** `dart_alert_ops_stats` 로 오늘 호출 · 한도 의심 표시를 먼저 보고, 표시 > 0 또는 호출 + 200 > 15,000 이면 OpenDART 0 회로 거부(RPC 가 없으면 경고 후 진행). `020` 을 받으면 그 자리에서 멈춘다.
- **Files modified:** scripts/dart-alert-report.sh
- **Commit:** 88a2a3bc

**4. [Rule 1 - 안내 누락] `--scheduler-paused` 「다음 할 일」 이 스모크 실패 시 안 보임**
- **Found during:** Task 2 가짜 배포 경로 검증
- **Fix:** 안내를 스모크 호출 앞으로 옮겼다(`set -e` 라 스모크 실패면 뒤가 안 찍혔다). smoke `--help` 도 `gcloud config get-value` 앞으로.
- **Files modified:** scripts/deploy-dart-alert.sh · scripts/smoke-dart-alert.sh
- **Commit:** 88a2a3bc

**5. [Rule 1 - 문서 명령] 실패 정책 문서의 로그 조회 필터**
- **Found during:** Task 1
- **Issue:** pino 로그에는 `severity` 필드가 없어(logger.ts) `severity>=WARNING` 필터로는 아무것도 안 걸린다.
- **Fix:** `jsonPayload.level>=40` 으로 쓰고 이유를 한 줄 적었다.
- **Files modified:** ops/alert-dart-alert-failure.yaml
- **Commit:** 5b6ba1c4

### 플랜 문구와 다르게 정한 것

- `telegram-find-chat.sh` 는 텔레그램 주소 덮어쓰기 env 를 두지 않았다(토큰을 다른 호스트로 보낼 경로를 만들지 않음 · 검증은 가짜 curl 로).
- `schedule.test.ts` 에 config.ts 필수 env 5개 ↔ 배포 스크립트 대조 4 it 를 더했다(key_link 잠금 · config.ts 를 import 하지 않고 글자로 읽어 dotenv 부작용 없음).
- `setup-dart-alert-iam.sh` 의 API enable 에 `monitoring` · `logging` 을 더했다(알림 정책 · 스모크 로그 조회).

**Total deviations:** 5 auto-fixed(Rule 1 3 · Rule 2 2). **Impact:** 범위는 `files_modified` 10개 그대로 · `workers/dart-alert/src/*` 변경 없음 · 운영 기준 ④ 쪽으로 더 엄격해졌다.

## 43-08 에 넘기는 것(이음새)

- 배포 순서: 사용자 `!` 1 ~ 5 → `bash scripts/deploy-dart-alert.sh --self-test` → (창 안이면 `--scheduler-paused`) 배포 → 스모크 자동 → test-send(`--update-env-vars=DART_ALERT_MODE=test-send --wait`) → 방 id 교체 → survey 1회 → `stats`.
- 메모리 규칙: 이 플랜의 배포 · 비밀 · IAM 명령은 서브에이전트에서 분류기에 막힌다 — 메인 세션 · 사용자 `!` 로.
- 43-06 이 error 로그 문구(`dart outage opened` · `telegram chat migrated` · `telegram token invalid` · `telegram chat unavailable` · `alert unsent over 120s` · `alert mark failed`)를 실제로 `level >= 50` 으로 남기는지 43-08 에서 맞춰 본다(정책 문서가 그 이름을 쓴다).

## Known Stubs

없음.

## Threat Flags

없음 — 새 네트워크 끝점 없음. 스크립트가 다루는 비밀(OpenDART 키 · 봇 토큰 · 방 id · 서비스롤 키)은 변수에만 두고 화면 · 명령줄 · 파일에 남기지 않으며(가짜 하네스로 확인), survey 의 조회 결과는 실행 동안만 권한 700 임시 디렉터리에 두고 지운다.

## Self-Check: PASSED

- FOUND: scripts/deploy-dart-alert.sh · workers/dart-alert/Dockerfile · ops/alert-dart-alert-failure.yaml · ops/alert-dart-alert-error-log.yaml · workers/dart-alert/tests/schedule.test.ts · scripts/setup-dart-alert-iam.sh · scripts/setup-dart-alert-secrets.sh · scripts/telegram-find-chat.sh · scripts/smoke-dart-alert.sh · scripts/dart-alert-report.sh
- FOUND 커밋: 5b6ba1c4 · 88a2a3bc (모두 HEAD 조상)
- 배포 · push · 실제 서비스 호출 0 · STATE.md · ROADMAP.md 변경 없음
