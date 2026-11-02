---
phase: 37-tick-viewer
plan: 18
subsystem: worker
tags: [tick-convert, cloud-run-job, nightly, zstd, staging, purge, dockerfile, deploy-scripts]
status: complete

requires:
  - phase: 37-tick-viewer (37-01)
    provides: "저장처: supabase-storage · D-19 범위: 승인 (precondition 통과)"
  - phase: 37-tick-viewer (37-02)
    provides: "DayRateTracker · hits15 · A3_LAYOUT · decodeFields · layoutOf · iterRecords · TICK_FMT · krxCalendar isKrxHoliday"
  - phase: 37-tick-viewer (37-04)
    provides: "tick_convert_candidates · tick_convert_runs_since · tick_convert_run_record · tick_grid_upsert('nightly') · tick_purge_old"
  - phase: 37-tick-viewer (37-06)
    provides: "워커 뼈대 — MODES · JobDeps · isDayReady · READY_GRACE_DAYS · kstYmdDaysAgo · scanObjects · RecordSink · buildGridFile · GridStore · createMeta"
provides:
  - "CLI `nightly [--date YYYYMMDD]` — runNightly · nightlyDatesOf · parseNightlyArgs (src/modes/nightly.ts)"
  - "실행 기록 코드 NO_OBJECTS · partial · 요약 로그 `deferred=n`"
  - "KeyStager (src/stage.ts) — 키별 64KB 원시 → zstd 1 청크 메모리 스테이징"
  - "selectTargets · sourcesOf (src/select.ts) — accum ∪ live16 ∪ (KRX G1 ∪ NXT G1 hits15)"
  - "purgeOld(sb, store, keepDays, now) (src/purge.ts) — RPC + Storage 날짜 폴더 단계 독립"
  - "GridStore.listDates() — grid/ 아래 날짜 폴더"
  - "parseArgv export (src/index.ts) — 모드 + 공통 플래그 --date · --ex"
  - "workers/tick-convert/Dockerfile — node:24-alpine · ENTRYPOINT [node, dist/index.js] + CMD [nightly]"
  - "scripts/setup-tick-convert-iam.sh · deploy-tick-convert.sh · smoke-tick-convert.sh · ops/alert-tick-convert-failure.yaml"
affects: [37-12, 37-16]

actuals:
  tokens: 22779      # chars/4 over git diff 657af817..fb821718 (91,117자)
  tasks: 2
  commits: 2         # MEASURED: git rev-list --count 657af817..HEAD (SUMMARY 커밋 제외)
plan_head_before: 657af8172ae3057d3931bf816b67a7b7aa941037
plan_head_after: fb821718e53fb7956581b7e4e94472087e2a16f3

tech-stack:
  added: []
  patterns:
    - "이미지 진입점 분리 — ENTRYPOINT = 실행 파일, CMD = 기본 모드(Cloud Run args 오버라이드는 CMD 만 바꾼다)"
    - "nightly 시간 예산 — 날짜를 시작하기 직전에만 경과를 본다(엄격한 >) · 시작한 날짜는 끝낸다"
    - "스테이징 청크는 따로따로 푼다 — 이어붙인 프레임을 한 번에 풀지 않는다(37-02 Node zstd 첫 프레임 함정 회피)"
    - "90일 purge 의 Storage 대상 = RPC dates ∪ cutoff 이전 폴더(메타 없는 고아 객체까지)"

key-files:
  created:
    - workers/tick-convert/src/stage.ts
    - workers/tick-convert/src/select.ts
    - workers/tick-convert/src/purge.ts
    - workers/tick-convert/src/modes/nightly.ts
    - workers/tick-convert/Dockerfile
    - workers/tick-convert/tests/nightly.test.ts
    - workers/tick-convert/tests/purge.test.ts
    - workers/tick-convert/tests/entry.test.ts
    - scripts/setup-tick-convert-iam.sh
    - scripts/deploy-tick-convert.sh
    - scripts/smoke-tick-convert.sh
    - ops/alert-tick-convert-failure.yaml
  modified:
    - workers/tick-convert/src/index.ts
    - workers/tick-convert/src/store.ts
    - workers/tick-convert/src/modes/request.ts

key-decisions:
  - "partial · NO_OBJECTS 는 ok true 로 기록한다 — 다음 실행이 같은 날짜를 다시 고르지 않는다(Archive 꺼내기 요금을 매일 다시 내지 않는다). request 모드의 partial 과 같은 규칙"
  - "실행 기록 ok 는 거래소별(그 거래소 실패 0 ∧ 날짜 단위 예외 없음) — 날짜를 다시 고르는 조건은 두 거래소 모두 ok"
  - "live16(실시간 매집감지 kind 16) 출처 칩도 accum — 칩은 accum · up15 두 가지뿐(sources CHECK)"
  - "purge 실패도 실패 1로 세어 종료 1(limitup-sync 동형 — 알림 정책이 정리 실패를 잡는다)"
  - "--date 도 준비 판정은 그대로 한다(기록 · 요일 · 휴장만 무시) — 업로드 전 날짜를 스모크해도 잘린 격자를 쓰지 않는다"
  - "Scheduler 두 개는 매일(주말 포함) — 날짜 고르기가 평일 ∧ 휴장 아님만 고르므로 주말 실행은 purge 만 하고 끝난다"

patterns-established:
  - "가짜 시계 시간 예산 시험 — candidates RPC 응답 함수가 시계를 stepMin 분 진행(날짜마다 한 번 불린다)"
  - "Dockerfile 을 읽어 Cloud Run 합성 규칙(args → CMD 대체)으로 argv 를 만들어 parseArgv 에 넣는 진입점 시험"

requirements-completed: [D-02, D-04, D-21, D-22]

coverage:
  - id: D1
    description: "nightly 트레이서 — 등록 1 · NXT 단독 +15% 1 · 비대상 1(G4 +20%) → 대상 두 종목의 KRX · NXT 격자 4개만 · sources accum/up15 · upsert('nightly') · 거래소별 실행 기록 · 끝에 purge 한 번 · 격자 바이트 = request 모드 바이트"
    requirement: D-02
    verification:
      - kind: unit
        ref: "workers/tick-convert/tests/nightly.test.ts"
        status: pass
  - id: D2
    description: "날짜 고르기 — 평일 · 휴장 제외 · ok 두 거래소 기록 제외 · 최신부터 · --date 단일 · 준비 판정 wait/NO_OBJECTS/partial · 날짜 격리 · 시간 예산 15/20/25분"
    requirement: D-02
    verification:
      - kind: unit
        ref: "workers/tick-convert/tests/nightly.test.ts"
        status: pass
  - id: D3
    description: "90일 purge — RPC dates ∪ cutoff 이전 Storage 폴더 · 단계 독립 · 오류 모아 한 번 throw"
    requirement: D-04
    verification:
      - kind: unit
        ref: "workers/tick-convert/tests/purge.test.ts"
        status: pass
  - id: D4
    description: "이미지 진입점 — ENTRYPOINT [node, dist/index.js] + CMD [nightly] · 세 오버라이드(없음 · request · nightly --date) argv → 모드 파싱"
    requirement: D-22
    verification:
      - kind: unit
        ref: "workers/tick-convert/tests/entry.test.ts"
        status: pass
  - id: D5
    description: "IAM · 배포 · 스모크 스크립트 — 버킷 단위 objectViewer(프로젝트 IAM 0) · 8Gi · 읽기 전용 볼륨 · Scheduler 23:30/01:30 · Job 단위 jobsExecutorWithOverrides"
    requirement: D-21
    verification:
      - kind: static
        ref: "bash -n scripts/{setup-tick-convert-iam,deploy-tick-convert,smoke-tick-convert}.sh + grep"
        status: pass

duration: 15
completed: 2026-11-02
---

# Phase 37 Plan 18: 과거 변환 Job nightly 모드 + 이미지 · 배포 스크립트 Summary

**nightly 모드를 만들었다. 하루 원본을 한 번만 통독하면서 모든 키를 메모리 압축 청크(zstd 1)로 스테이징하고, 매집감지 등록 ∪ KRX/NXT G1 +15% 종목만 두 거래소 격자(zstd 9)로 올린다. 날짜는 평일 · 휴장 아님 · 최신부터 고르고, 40분 예산이 지나면 남은 날짜를 미룬다. 실행 끝에는 90일 purge 를 한다. 이미지는 `node:24-alpine`, ENTRYPOINT/CMD 를 분리했다. IAM · 배포 · 스모크 스크립트는 작성만 했다.**

## Performance

- **Duration:** 약 15분
- **Completed:** 2026-11-02
- **Tasks:** 2/2
- **Files:** 새로 만든 파일 12 · 고친 파일 3

## Accomplishments

- `runNightly`: 날짜 고르기 → 준비 판정 → 단일 통독 스테이징 → 대상 선별 → 두 거래소 격자 업로드 → `tick_grid_upsert('nightly')` → 거래소별 실행 기록 → 90일 purge 를 한 경로로 잇는다.
- 실패는 날짜 단위로 격리한다. 실패 날짜나 purge 실패가 하나라도 있으면 종료 1 이고, NO_OBJECTS · 미룬 날짜 · 유예 안에서 건너뛴 날짜는 종료 0 이다.
- Dockerfile 은 두 단 모두 `node:24-alpine` 이다. ENTRYPOINT 는 실행 파일, CMD 는 기본 모드로 나눴다.
- 스크립트 4개를 썼다: IAM(버킷 단위 objectViewer), 배포(Job · Scheduler 2 · overrides 권한 · 알림), 스모크, 알림 YAML.

## Dockerfile ENTRYPOINT/CMD (원문)

```
ENTRYPOINT ["node", "dist/index.js"]
CMD ["nightly"]
```

## 테스트

- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/tick-convert run typecheck && pnpm --filter @gh-radar/tick-convert exec vitest run --maxWorkers=2` 가 exit 0 으로 끝났다. **6 파일 82 테스트가 통과했다.**
  - 새 시험: nightly 15 · purge 4 · entry 5
  - 37-06 회귀: request 24 · archive 23 · config 11, 회귀 0
- 돌연변이 확인(스크래치에서 하고 원복했다):
  - 예산 비교 `>` → `>=` 는 20분 경계 시험이 잡았다.
  - G1 필터 제거는 트레이서 등 3건이 잡았다.
  - 휴장 필터 제거는 휴장 시험이 잡았다.
- Task 2 verify 는 `bash -n` 세 스크립트와 grep 8건으로 확인했고 exit 0 이다. `gcloud projects add-iam-policy-binding` 은 0건이다.
- 스모크 스크립트는 인자 검증 경로만 직접 돌렸다. 인자가 없거나, 거래소가 틀리거나, 날짜 형식이 틀리면 rc 2 가 나온다. 모두 gcloud 를 부르기 전 단계다.

## 합성 아카이브 크기 · 스테이징 압축률

- 트레이서 아카이브는 37-06 기본 시각 집합(10/30 실측 · 라벨당 00~23시 24파일)을 쓴다. 두 라벨 48파일, 압축 합계 **3,751B** 다.
- 스크래치 실측은 대상 R 종목 KRX 21레코드(원시 4,646B)로 했다.
  - `stageChunkBytes=512`: 최대 스테이징 983B, **압축률 0.212**
  - `65536`: 청크가 생기지 않아 1.000
  - 합성 페이로드는 반복이 많아 실제보다 잘 눌린다. 실제 값은 RESEARCH 추정(7~10%)을 SC3 실측(37-16)에서 확인해야 한다.

## 날짜 고르기 예시

- now = 2026-11-02(월) 23:30 KST, CATCHUP 10 → 후보 `20261102 · 20261030 · 20261029 · 20261028 · 20261027 · 20261026`. 주말 10/24 · 25 · 31 · 11/01 은 빠진다.
- now = 2026-10-13(화) 23:30 → `20261013 · 20261012 · 20261008 · 20261007 · 20261006`. 휴장일 10/09 한글날과 10/05 개천절 대체가 빠진다.
- 미룸(후보 6일 · 예산 40분):

  | 날짜당 소요 | 처리한 날짜 | `deferred` |
  |---|---|---|
  | 15분 | 3 | 3 |
  | 20분 | 3 (경계 — 세 번째는 경과 정확히 40분에 시작) | 3 |
  | 25분 | 2 | 4 |

- 준비 판정(now 11/02 23:30 기준):
  - 11/02 처럼 업로드 중인 날은 기록 없이 건너뛴다(wait).
  - 10/29 · 10/26 처럼 객체가 0개인 날은 `NO_OBJECTS` 를 ok 로 기록한다.
  - 10/28 처럼 일부 시각만 있는 날은 있는 객체로 변환하고 `partial` 을 ok 로 기록한다.
  - 10/27 처럼 candidates RPC 가 실패한 날은 ok false 로 기록한다. 다음 날짜 처리와 purge 는 계속 돈다.

## 스크립트 목록 (작성만 · 실행 안 함)

- `scripts/setup-tick-convert-iam.sh`:
  - SA `gh-radar-tick-convert-sa` 를 멱등으로 만든다.
  - `gh-radar-supabase-service-role` accessor 를 바인딩한다.
  - `gs://gh-trade-tick-archive` 버킷이 있는지 확인만 한다.
  - 그 버킷 단위로 `roles/storage.objectViewer` 를 준다.
- `scripts/deploy-tick-convert.sh`:
  - 이미지를 amd64 로 빌드하고 push 한다.
  - Job `gh-radar-tick-convert` 를 배포한다(gen2 · cpu 4 · 8Gi · 3600s · `/mnt/tick` 읽기 전용 볼륨 · env `TICK_*`).
  - scheduler SA 에 `run.invoker` 를 준다.
  - server SA(`${PROJECT_NUMBER}-compute@…`)에 Job 단위 `roles/run.jobsExecutorWithOverrides` 를 준다. 그 역할이 없으면 `roles/run.developer` 로 대신하고 경고를 낸다.
  - Scheduler `gh-radar-tick-convert-nightly`(`30 23 * * *`)와 `gh-radar-tick-convert-nightly-late`(`30 1 * * *`)를 만든다.
  - 알림 정책 `gh-radar-tick-convert-failure` 를 만들거나 갱신한다.
- `scripts/smoke-tick-convert.sh <YYYYMMDD> [nightly|request <EX>]`: `execute --args=… --wait` 를 돌린 뒤 실행 이름 · 소요 · `[tick-convert]` 요약 줄을 출력한다. 로그는 최대 90초 다시 조회한다.
- `ops/alert-tick-convert-failure.yaml`: Cloud Run Job 실패 실행 수가 0 을 넘으면 울린다.
- **실행 안 함:** 이 플랜은 `gcloud` · `docker` · `supabase db push` · `git push` 를 하나도 실행하지 않았다. 실행(배포 · IAM · 스모크)은 37-16 메인 세션 몫이다.

## Task Commits

1. **Task 1 (tracer): nightly 끝까지 · Dockerfile** — `c1e48ecc` (feat)
   - 트레이서 게이트는 interactive · end-of-phase · 자동 verify 만 있는 경우다. verify 를 다시 돌려 exit 0(82/82)이 나와 확장으로 넘어갔다.
2. **Task 2: IAM · 배포 · 스모크 스크립트 · 알림 YAML** — `fb821718` (chore)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 고아 객체 정리] purge 의 Storage 대상에 cutoff 이전 폴더 목록을 더함**
- **Found during:** Task 1
- **Issue:** 계획은 `tick_purge_old` 의 `dates` 만 `store.removeDates` 로 넘겼다. 하지만 store.ts 순서 계약상 「업로드 뒤 메타 upsert 실패」면 메타 행 없는 객체가 남는다. 그 날짜는 RPC `dates` 에 나오지 않으므로 영영 지워지지 않는다(store.ts 주석은 「90일 purge 가 날짜 폴더째 지운다」고 약속한다). RPC 가 실패하면 Storage 단계가 할 일도 없어진다.
- **Fix:** `GridStore.listDates()`(`grid/` 아래 `YYYYMMDD` 폴더)를 더했다. purge 는 「RPC dates ∪ cutoff 이전 폴더」를 지우고, RPC · 목록 · 삭제 세 단계를 서로 독립으로 돌린다. cutoff 는 RPC 와 같은 식(`kstYmdDaysAgo(now, keepDays)`)이다.
- **Files modified:** workers/tick-convert/src/store.ts · src/purge.ts
- **Commit:** `c1e48ecc`

### 작은 시그니처 조정

- `KeyStager.add(key, recvNs, payload)`: 계획은 `add(key, rec: Uint8Array)` 였다. 레코드마다 인코딩 배열을 만들지 않으려고 37-06 `RecordSink.append` 와 같은 인자로 바꿨다. 바이트는 같고 시험이 확인한다. `has` · `peakBytes` · `rawBytes` 도 더했다(요약 로그 `staged=` · 압축률).
- `runNightly` 반환: 계획은 `RunResult[]` 였는데 `NightlyOutcome { dates, days, deferred, failed, purgeError }` 로 바꿨다. MODES 의 `{ failed }` 계약을 만족해야 해서다.
- `purgeOld(sb, store, keepDays, now)`: cutoff 계산에 `now` 가 필요해 인자를 하나 더했다.
- `parseArgv` 를 main 이 실제로 쓴다(모드 식별). 모드가 없거나 `-` 로 시작하는 argv(실행 파일 자리가 어긋난 모양)는 종료 2 다. 공통 플래그는 `--date` · `--ex` 이고, 37-12 가 promote 플래그를 `VALUE_FLAGS` 에 더한다.
- request.ts `validYmd` 를 export 해 nightly 파서와 함께 쓴다.

### TDD 순서

- 계획은 「nightlyDatesOf · select 시험을 먼저 빨갛게」였지만 구현을 먼저 쓰고 시험을 붙였다(태스크 속성은 tracer · `tdd="true"` 아님). 대신 RED 를 소급해서 확인했다. 돌연변이 3건이 해당 시험을 빨갛게 만들었다(위 「테스트」). 별도 RED 커밋은 없다.

---

**Total deviations:** 자동 수정 1건(Rule 2) + 시그니처 조정. 범위 확대는 없다.

## Known Stubs

없다(TODO · placeholder grep 0건).

## Issues Encountered

- 워크트리 격리 쉘이 복합 git 명령(`$(git rev-parse …)` 포함)을 거부했다. 그래서 플랜 커밋 원장 파일을 쓰지 못했고, 대신 base `657af817` 을 직접 원장 값으로 썼다(`git rev-list --count 657af817..HEAD` = 2).
- `python3 yaml` 모듈이 없어 알림 YAML 을 파싱 검증하지 못했다. 구조는 `ops/alert-limitup-sync-failure.yaml` 을 그대로 따랐다.

## Next Phase Readiness

- **37-12 (promote):** `MODES` 에 한 줄을 더하고, promote 플래그를 `VALUE_FLAGS` 에 더한다. `entry.test.ts` 에 promote 오버라이드 케이스를 하나 넣는다. tickgw 에 닿으려면 Direct VPC egress 를 deploy 스크립트에 더해야 한다.
- **37-16 (메인 세션):** 다음 순서로 진행한다.
  1. `GCP_PROJECT_ID=gh-radar bash scripts/setup-tick-convert-iam.sh`
  2. `SUPABASE_URL=… NOTIFICATION_CHANNEL_ID=… bash scripts/deploy-tick-convert.sh`(SUPABASE_URL 은 라이브 Cloud Run env 에서 가져온다)
  3. `bash scripts/smoke-tick-convert.sh 20261030`
  4. SC3 실측: 통독 시간 · `bytes_read` · `staged=` 피크 메모리로 8Gi 와 예산 40분이 맞는지 본다.
  - 이때 `roles/run.jobsExecutorWithOverrides` 존재 여부(A5)도 확인된다.

## Self-Check: PASSED

- FOUND: workers/tick-convert/src/{stage,select,purge}.ts · src/modes/nightly.ts · Dockerfile · tests/{nightly,purge,entry}.test.ts
- FOUND: scripts/{setup-tick-convert-iam,deploy-tick-convert,smoke-tick-convert}.sh · ops/alert-tick-convert-failure.yaml
- FOUND: 커밋 `c1e48ecc` · `fb821718` (HEAD 조상)
- 워커 전체 vitest 82/82 통과 · typecheck 통과
