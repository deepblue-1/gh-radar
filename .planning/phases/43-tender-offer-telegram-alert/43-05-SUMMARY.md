---
phase: 43-tender-offer-telegram-alert
plan: 05
subsystem: workers/dart-alert
status: complete
tags: [collector, lease, fake-clock, opendart, telegram, cloud-run-job]
requires:
  - 43-01 lap.ts(collectOnce · deliverPending · LapDeps)
  - 43-02 db.ts(createDartAlertDb · DartAlertDb · LeaseLostError)
  - 43-03 cadence.ts · apiUsage.ts · config.ts · logger.ts · services/supabase.ts
  - 43-04 dart/client.ts(fetchWatchRows · PageTracker · fetchListPage) · telegram/client.ts · safeError.ts
  - 43-09 watches.ts(buildWatches) · message.ts(testSendText)
provides:
  - src/collector.ts (runCollector · CollectorDeps · CollectorLog · CollectorExit · StopRun · LEASE_TTL_S · LEASE_RENEW_MS · USAGE_FLUSH_MS · UNKNOWN_STREAK · DELIVER_LIMIT)
  - src/index.ts (buildDeps · Transports · main · MainOptions · CLI 가드)
  - tests/helpers/fakes.ts (fakeClock · fakeDb · fakeDart · fakeTelegram · logRecorder · timeline · harness · tenderRow · rightsRow · dbRow · itemOf · kst · MON · SAT)
affects: [43-06, 43-07, 43-08]
tech-stack:
  added: []
  patterns:
    - "「다음 바퀴 시각」 고정 간격 루프 — 시작 대 시작 · 이미 지났으면 곧바로(몰아서 부르지 않음)"
    - "dart.list 를 수집기가 감싸 호출 수를 실패 포함 즉시 집계 · 치명 신호 뒤 같은 바퀴 남은 조회 생략"
    - "임대 연장 점검을 기다리는 걸음 · 바퀴 시작 · 송신 직전 세 곳에서(30초 시간 문)"
    - "seed 바퀴는 넣기를 모아 두었다가 모든 감시 대상 성공 때만 한 번에 넣는다"
key-files:
  created:
    - workers/dart-alert/src/collector.ts
    - workers/dart-alert/src/index.ts
    - workers/dart-alert/tests/helpers/fakes.ts
    - workers/dart-alert/tests/collector.test.ts
    - workers/dart-alert/tests/modes.test.ts
  modified: []
key-decisions:
  - "치명 DART 신호(020 · 010 계열 · 100 계열 · 모르는 코드 연속 5번)를 받은 바퀴는 남은 감시 대상 조회를 건너뛰고(호출 0) 이미 넣은 건을 보낸 뒤 종료 1 — 「그 뒤 DART 호출 0」 을 문자 그대로 지키고 넣은 건이 그날 유실되지 않게"
  - "예산 문은 바퀴 시작 · 기다리는 걸음에서만 닫는다 — 송신 직전에는 닫지 않아 이미 넣은 건은 OpenDART 호출 없이 보낸다"
  - "seed 는 모든 감시 대상이 성공했을 때만 seeded 로 넣는다(하나라도 실패면 넣기 0 · seed_failed) — 부분 seed 를 남기지 않는다"
  - "probe 모드도 시작 예산 문을 지난다(소진이면 budget_at_start · 종료 0) · probe 에서 020 을 받으면 한도 의심 표시를 남긴다"
  - "늦은 알림 판정 시각은 각 감시 대상 조회 직전의 clock.now() — collectOnce 의 isLate 호출 시점"
requirements-completed: [SC-1, SC-2, SC-3, SC-4]
metrics:
  duration: 17m
  started: 2026-11-12T14:45:16Z
  completed: 2026-11-12
  tasks: 2
  files: 5
estimate:
  tokens: 66000
actuals:
  tokens: 20800
  tasks: 2
  commits: 4
plan_head_before: f8ce9459ec65f5fffdcab453202b66412888399b
plan_head_after: c5549948adcfa7004e02c4c6641e53c7ee88b49a
coverage:
  - deliverable: "평일 13시간 하루 10,800회 · 사용량 10초 묶음 · 창 끝 종료 · 밀린 바퀴 몰아 부르기 없음"
    human_judgment: false
    verification:
      - kind: test
        ref: "workers/dart-alert/tests/collector.test.ts#월 07:00 부터 20:00 까지 — DART 호출 정확히 10,800 · usage.add 합 10,800 · flush 10초 간격 · window_end · 해제 1번"
        status: pass
      - kind: test
        ref: "workers/dart-alert/tests/collector.test.ts#바퀴가 늦게 끝나도(DART 지연 12초) 밀린 바퀴를 몰아서 부르지 않는다 — 호출 ≤ 10,800 · 바퀴 시작 간격 ≥ 바퀴 길이"
        status: pass
  - deliverable: "임대 한 실행만 · 30초 연장 · 거절 · 확인 불가 · 55000 · 인계 되돌림 · 긴 바퀴 임대 유지"
    human_judgment: false
    verification:
      - kind: test
        ref: "workers/dart-alert/tests/collector.test.ts#바퀴가 길어도 임대가 만료 전에 연장된다"
        status: pass
      - kind: test
        ref: "workers/dart-alert/tests/collector.test.ts#임대 (SC-2 · 한 실행만) 7 it"
        status: pass
  - deliverable: "늦은 알림 기준점(09:30 첫 실행 · 인계 · 07:30 전날 서류) · 같은 바퀴 안 송신"
    human_judgment: false
    verification:
      - kind: test
        ref: "workers/dart-alert/tests/collector.test.ts#새 건 송신 · 늦은 알림 기준점 5 it"
        status: pass
  - deliverable: "한도 020 중단 · 탐침 · 키 · 버그 · 모르는 코드 연속 · 예산 80% · 소진 · SIGTERM"
    human_judgment: false
    verification:
      - kind: test
        ref: "workers/dart-alert/tests/collector.test.ts#한도 · 치명 오류 · 예산 · SIGTERM 11 it"
        status: pass
  - deliverable: "모드 probe · seed(→ auto 이어 감 · 창 밖 window_end · 실패 seed_failed) · test-send · auto 창 밖"
    human_judgment: false
    verification:
      - kind: test
        ref: "workers/dart-alert/tests/modes.test.ts#seed 뒤 같은 실행이 auto 로 이어 가고 새 건은 늦은 알림이 아니다"
        status: pass
      - kind: test
        ref: "workers/dart-alert/tests/modes.test.ts#창 밖 seed 는 seed 바퀴 한 번 뒤 window_end 로 끝나고 보내지 않는다"
        status: pass
  - deliverable: "Cloud Run Job 진입점 결선 · 설정 오류 env 이름만 · 빌드 dist/index.js"
    human_judgment: false
    verification:
      - kind: test
        ref: "workers/dart-alert/tests/modes.test.ts#진입점 main() · buildDeps() 4 it"
        status: pass
      - kind: command
        ref: "pnpm --filter @gh-radar/dart-alert run build && test -f workers/dart-alert/dist/index.js"
        status: pass
  - deliverable: "실제 Supabase · OpenDART · 텔레그램 대상 동작(운영 결선)"
    human_judgment: true
    rationale: "이 플랜은 가짜 전송 · 가짜 DB 로만 검증했다 — 실제 RPC · 실제 API 경로는 43-07 스모크(probe ok) · 43-08 배포 직후 점검이 확인한다"
---

# Phase 43 Plan 05: 장기 실행 수집기 · 모드 · Job 진입점 Summary

**평일 `07:00` ~ `20:00` 한 실행이 임대(90초 · 30초 연장)를 쥐고 5초 · 10초 시작 대 시작 바퀴로 하루 정확히 10,800회 OpenDART 를 부르며, 처음 본 새 건을 같은 바퀴 안에서 보내고, 늦게 뜬 실행은 그날 건을 「(늦은 알림)」 으로 이어 보내며, `020` 에 그 run 을 멈추는 것을 가짜 시계 13시간 시뮬레이션으로 증명했고 — probe · seed(→ auto 이어 감) · test-send 모드와 `createDartAlertDb` 를 쓰는 Cloud Run Job 진입점을 결선해 `dist/index.js` 까지 빌드했다.**

## 수행 결과

| Task | 이름 | 커밋 | 파일 |
|------|------|------|------|
| 1 (RED) | 수집기 가짜 시계 시나리오 · 가짜 의존성 묶음 | be3c2c82 | tests/helpers/fakes.ts · tests/collector.test.ts |
| 1 (GREEN) | 수집기 루프(auto) | d12864bc | src/collector.ts |
| 2 (RED) | 모드 · 진입점 테스트 | 93030ab7 | tests/modes.test.ts |
| 2 (GREEN) | 모드 · 진입점 결선 | c5549948 | src/collector.ts · src/index.ts |

`src/lap.ts` 는 고치지 않았다 — `WatchResult` 에 이미 `okAt` · `kind` 가 있어(43-01) 필요가 없었다. tracer 테스트 그대로 통과.

### 검증 실제 출력

- Task 1 `<verify>`: `tests/collector.test.ts (26 tests)` · `tests/tracer.test.ts (2 tests)` → 28 passed · `tsc --noEmit` 종료 0
- Task 2 `<verify>`(플랜 명령 그대로 · `--testTimeout=20000` 더함): **Test Files 12 passed (12) · Tests 266 passed (266)**(기존 225 + collector 26 + modes 15) → typecheck 종료 0 → build → `BUILD-OK`
- `node dist/index.js` 를 env 없이(scratchpad cwd · `env -i`) 실행 → `{"level":50,…,"msg1":"missing env: SUPABASE_URL","msg":"dart-alert config error"}` · 종료 1 — CLI 가드 · 설정 오류 경로 확인(네트워크 접촉 0)
- 수용 기준 grep: T1 상수 4 · `possible duplicate after takeover` 2 · 테스트 `10800|10_800` 7 · 이름 붙은 테스트 1 · 종료 이유 5종 8 / T2 `createDartAlertDb` 3 · 주석 밖 `.rpc(` 0 · `probe ok|seed done|test-send ok` 3 · `"seed_failed"` 2 · 이름 붙은 테스트 둘 각 1 · `git check-ignore dist/index.js` 종료 0
- 헛통과 점검(임시 변조 후 원복 · 커밋 안 함): seed 뒤 첫 auto 바퀴를 `startedAt + 120_000` 으로 미루면 W1 이름 붙은 테스트가 `expected 1794805320000 to be 1794805210000` 으로 실패
- 테스트까지 넓힌 임시 tsconfig(scratchpad)로 `tsc` — 새 파일 5개 타입 오류 0(가짜 DB 가 `DartAlertDb` + usage · strikes 를 구현함을 확인). 기존 `tests/dbContract.test.ts`(import.meta · TS1343) · `tests/watches.test.ts`(TS2339 4건)에만 오류 — 이 플랜 범위 밖이라 고치지 않았다
- 모든 vitest 실행은 `perl alarm` 시간 상한 + `--testTimeout` 아래에서 돌렸고, 가짜 시계 sleep 상한(기본 300,000) · DART 호출 상한(50,000)이 있다. 끝난 뒤 `pgrep -fl vitest` 결과 없음

## 13시간 시뮬레이션 호출 수

| 시나리오 | OpenDART list 호출 | 비고 |
|----------|--------------------|------|
| 월 `07:00:00` 시작 → `20:00` | **10,800**(공개매수 5,400) | `plannedDailyCalls(2)` 와 같음 · `usage.add` 합 10,800 · flush 간격 10초(4,000번 넘게) · 해제 1번 |
| 월 `07:00:30` 시작 → `20:00` | 10,788 | `07:00:00` ~ `07:00:25` 의 6바퀴 × 2 만 빠진다 |
| 호출마다 12초 지연 | ≤ 10,800(약 3,900) | 바퀴 시작 간격 최소 24초 — 몰아 부르기 없음 · 임대 잃음 0 |
| 긴 바퀴(DART 10초 × 2 · 송신 5건 × 10초) 30분 | — | 연장 간격 최대 < 90초 · `LeaseLostError` 0 · 송신 80건 넘게 |

## 종료 이유 표

| reason | code | 언제 |
|--------|------|------|
| `outside_window` | 0 | auto 인데 평일 `07:00` ~ `20:00` 밖 · 주말(호출 0 · 임대 0) |
| `lease_held` | 0 | 다른 실행이 임대를 쥠(auto · seed) — 로그 `lease held by another run — exiting` |
| `lease_lost` | 0 | 연장 거절 · 넣기 · 차례 · 기록 RPC 의 `LeaseLostError`(55000) |
| `lease_unconfirmed` | 0 | 연장 DB 오류가 60초 이어짐(남이 넘겨받기 전 · TTL 90 − 연장 30) |
| `budget_at_start` | 0 | 시작 때 오늘 사용량 ≥ 예산(auto · seed · probe) |
| `window_end` | 0 | 루프가 `20:00` 에 닿음 · 창 밖 seed 는 seed 바퀴 1번 뒤 곧바로 |
| `aborted` | 0 | SIGTERM → 다음 걸음 |
| `probe` | 0 | probe 모드 성공(`probe ok`) |
| `test_send` | 0 | test-send 성공(`test-send ok`) |
| `quota` | 1 | `020` — 한도 의심 표시 기록 |
| `dart_key` | 1 | `010` · `011` · `012` · `901` |
| `dart_bug` | 1 | `100` · `101` |
| `unknown_streak` | 1 | 모르는 코드가 감시 대상 상관없이 연속 5번 — 한도 의심 표시 기록 |
| `probe_failed` | 1 | 한도 의심 탐침 실패 · probe 모드 DART 실패(020 이면 표시 기록) |
| `budget_exhausted` | 1 | 실행 중 예산 도달(error) |
| `seed_failed` | 1 | seed 바퀴에서 감시 대상 하나라도 실패 · seed 넣기 오류(넣기 0 · auto 로 안 넘어감) |
| `test_send_failed` | 1 | 시험 글 실패(error kind · code · description) |
| `error` | 1 | 그 밖 예외(error `collector failed` · 안전 필드) |

진입점 `main()` 은 설정 오류면 `dart-alert config error`(env 이름만) · 1, 수집기 밖 예외면 `dart-alert failed` · 1, 그 밖엔 `runCollector` 의 code 를 돌려준다.

## 모드 동작

- **auto** — 창 → 임대 → 예산 → 한도 의심 탐침 → DB `last_ok` 기준점 → 루프.
- **probe** — 임대 없이(남이 쥐고 있어도) 예산 문 → 공개매수 1쪽 1회 → `usage.add(1)` → info `probe ok`(`total` · `calls` · `lease: false`) · 종료 0. 넣기 · 송신 0. 창 · 주말과 무관.
- **seed** — 임대 → 예산 → 탐침 → 기준점 → seed 바퀴(감시 대상마다 1회 · `isLate` 늘 false · 송신 0) → 모두 성공이면 `insert(…, seed=true)` 1번 → 성공 시각을 메모리 기준점과 DB `last_ok`(곧바로 `leaseAcquire(holder, 90, lastOk)`)로 → info `seed done`(`inserted` · `matched`) → **같은 실행이** seed 바퀴 시작 + 간격에 첫 auto 바퀴. 창 밖이면 seed 바퀴 1번 뒤 `window_end`(차례 · 송신 0 — 43-08 배포 직후 실제 DB 경로 점검용).
- **test-send** — OpenDART · 임대 · DB 없이 `telegram.send(testSendText(now))` 1회 → `test-send ok`(`messageId`) · 종료 0 / 그 밖 error `test-send failed`(kind · code · description) · 종료 1.

## 로그 문구 목록

| 문구 | level | 쓰는 곳 |
|------|-------|---------|
| `probe ok` | info | 43-07 스모크가 Cloud Logging 에서 찾는다 |
| `seed done` | info | 43-08 배포 직후 점검 |
| `test-send ok` · `test-send failed` | info · error | D-15 개인 대화 시험 |
| `lease held by another run — exiting` | info | 임대 없음 |
| `possible duplicate after takeover` | warn | 새 임대가 오늘 `sending` 을 되돌림(`reclaimed`) |
| `past-day alerts expired on takeover` | info | 새 임대가 지난 날 건을 닫음(`expired`) |
| `quota probe ok — resuming collection` · `quota probe failed — stopping without retries (next run probes once again)` | info · error | 한도 의심 탐침 |
| `fatal DART status — stopping this run` | error | quota · dart_key · dart_bug · unknown_streak |
| `quota strike recorded — next run probes once before collecting` · `quota strike record failed` | warn · error | 한도 의심 표시 |
| `daily budget 80% reached` · `daily budget exhausted — stopping this run` · `daily budget already reached — not calling OpenDART` | warn · error · warn | 예산 |
| `lease renewal failed — retrying in 5s` · `lease unconfirmed too long — stopping before another run takes over` · `lease renewal rejected — another run owns the lease; stopping quietly` · `lease lost — another run took over; stopping quietly` | warn | 임대 |
| `seed failed — nothing inserted, not continuing to auto` · `seed failed — insert error, not continuing to auto` | error | seed |
| `deliver failed — retrying next lap` · `usage flush failed — will retry` · `lease release failed — it expires in 90s` | warn | 일시 DB 오류 |
| `outside collection window — nothing to do` · `collection window end — stopping` · `SIGTERM — stopping after current step` · `collector start` · `collector stop` | info | 흐름 |
| `collector failed` · `dart-alert config error` · `dart-alert failed` · `dart-alert start` · `signal received — stopping after current step` | error · error · error · info · info | 진입점 |

## 43-06 · 43-07 이 쓸 자리(이음새)

- **치명 종료 직전** — `Collector.stopOnHalt()`(현재: 한도 의심 표시 + error 로그 + `StopRun`). 43-06 이 장애 열기 · 단체방 글을 이 자리에. 예산 소진(`budgetGate`) · 키 오류도 같은 장애 글이면 `budgetGate` 의 `StopRun(1, "budget_exhausted")` 직전에 같은 함수를 부르면 된다.
- **바퀴 끝 장애 판정** — `Collector.lap()` 의 `deliver()` 뒤 · `stopOnHalt` 앞. 감시 대상별 기준점은 `this.lastOk`(Map · ms), 이번 바퀴 결과는 `collectOnce` 의 `r.results`(`ok` · `kind` · `error`).
- **seed 경로 시작 점검** — `main()` 의 `seedLap()` 반환 **뒤**, `loop()` 앞(auto 는 `loadLastOk()` 뒤).
- **송신** — `Collector.deliver()` 가 `deliverPending(this.lapDeps, DELIVER_LIMIT)` 를 부른다. `SendPacer` 를 실행 동안 들고 넘기려면 여기에. `LeaseLostError` 는 위로, 그 밖 오류는 warn 하고 다음 바퀴(43-06 이 `alert claim failed` · `alert mark failed` 로 세분화). migrated → `this.d.telegram.switchChat(to)`.
- **가짜 묶음(`tests/helpers/fakes.ts`)** — `harness({ start, mode, budget, abortAt, db, dart, telegram })` 하나로 시계 · DB · DART · 텔레그램 · 로그 · 시간선이 묶여 나온다. 가짜 DB 는 장애 `outage("open"|"notice"|"close")`(43-02 계약 · `{opened, since}` · `{noticed}` · `{closed, notify, since}`) · 송신 기한 90초 · 같은 보유자 `stale` 재차례를 이미 흉내 낸다. 실패 주입은 `db.before(fn, now)`(던지면 그 RPC 실패) · `db.leaseAcquire(call)` 대본 · `dart.reply(ctx)` · `telegram.reply(ctx)` · `telegram.delayMs(n)`. 「반영 뒤 던짐」(claim 은 됐는데 응답 유실)은 43-06 이 `before` 와 별도 `after` 훅을 더하면 된다.
- **43-07** — `scripts/smoke-dart-alert.sh` 는 `probe ok` 를 찾는다. Dockerfile CMD 는 `node dist/index.js`(CLI 가드가 `index.js` 로 끝나는 argv[1] 을 본다). env 이름은 config.ts 그대로. 종료 코드 0/1 은 위 표.

## RED · GREEN (TDD Gate Compliance)

두 task 모두 RED `test(43-05)` → GREEN `feat(43-05)` 순서. REFACTOR 없음. RED 증거 기록은 `.gsd/red-43-05/`(gitignore) — 저장소에 넣지 않았다.

- **Task 1 RED** — `src/collector.ts` 가 없으면 import 적재 오류라, 타입 · 상수만 내보내고 `runCollector` 가 루프 없이 `{ code: 1, reason: "skeleton" }` 를 돌려주는 임시 골격(커밋 전 삭제)을 두고 JUnit XML 리포터로 실행 → 26 실행 · 0 pass · 26 fail · exit 1. 대상 `하루 호출 수 · 바퀴 간격 (D-10 · D-11 · SC-4) > 월 07:00 부터 20:00 까지 — DART 호출 정확히 10,800 …` 이 `expected { code: 1, reason: 'skeleton' } to deeply equal { code: +0, reason: 'window_end' }`(AssertionError)로 실패. classifier `RED_EVIDENCE_OK / target_test_failed`. semanticAssessment: 26건 모두 골격 종료값에 대한 단언 실패이고 구문 · 적재 · 픽스처 오류 없음 — 골격에 루프가 없어 끝없는 실행 위험도 없었다.
- **Task 2 RED** — T1 수집기(auto 밖 모드는 `{ code: 1, reason: "mode_unsupported" }`) + `buildDeps` · `main` 이름만 내보내는 임시 `src/index.ts` 골격(`main` 은 99 반환 · 커밋 전 삭제)으로 실행 → 15 실행 · 2 pass · 13 fail. 대상 `seed 모드 … > seed 뒤 같은 실행이 auto 로 이어 가고 새 건은 늦은 알림이 아니다` 가 `expected { code: 1, reason: 'mode_unsupported' } to deeply equal { code: +0, reason: 'window_end' }` 로 실패. classifier `RED_EVIDENCE_OK / target_test_failed`. semanticAssessment: 실패 13건은 모드 종료값 · `main` 반환값(99) 단언과 `buildDeps` 빈 객체에 대한 matcher 오류 1건이다. 통과 2건은 「주말 · 20:00 뒤 auto → outside_window」 로 Task 1 이 이미 만든 동작(이 task 의 회귀 지킴)이다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 계획 산수] 「월 07:00:30 시작 → 정확히 10,800」 을 `07:00:00` 시작으로 단언**
- **Found during:** Task 1
- **Issue:** behavior 첫 줄은 `07:00:30` 시작에 10,800 을 적었지만, 플랜이 정한 시작 대 시작 간격(장전 5초)이면 `07:00:30` 시작은 `07:00:00` ~ `07:00:25` 의 6바퀴를 못 돌아 10,788 이다. must_haves 진실 「평일 13시간을 돌리면 정확히 10,800회」 는 `07:00` ~ `20:00` 이다.
- **Fix:** 10,800 단언은 `07:00:00` 시작(13시간 · `plannedDailyCalls(2)` 와 같음)으로 하고, `07:00:30` 시작은 따로 `10,800 − 12` 를 단언하는 테스트를 더했다.
- **Files modified:** workers/dart-alert/tests/collector.test.ts
- **Commit:** be3c2c82

**2. [Rule 2 - 정확성] 치명 신호 뒤 같은 바퀴 남은 조회 생략 · 넣은 건은 보내고 멈춤**
- **Found during:** Task 1
- **Issue:** `collectOnce` 는 감시 대상을 끝까지 돈다 — 공개매수에서 `020` 을 받아도 같은 바퀴에서 주요사항보고서를 한 번 더 부른다(운영 기준 ④ 「재시도로 두드리지 않음」 · behavior 「그 뒤 DART 호출 0」 에 어긋남). 또 플랜 순서대로 치명 처리를 송신 전에 하면 그 바퀴에 넣은 건이 그날 유실된다(다음 실행은 탐침 실패로 차례를 부르지 않고, 다음 날엔 지난 날 건으로 닫힌다).
- **Fix:** 수집기의 `dart.list` 감쌈이 치명 신호를 기억하고 같은 바퀴 남은 조회는 부르지 않고(호출 0 · 사용량 0) 건너뛴다. 바퀴 끝에서 송신 차례를 먼저 돌린 뒤 멈춘다. 예산 문도 송신 직전에는 닫지 않는다.
- **Files modified:** workers/dart-alert/src/collector.ts
- **Commit:** d12864bc

**3. [Rule 2 - 정확성] seed 는 모두 성공했을 때만 넣는다**
- **Found during:** Task 2
- **Issue:** `collectOnce` 는 성공한 감시 대상의 행을 실패와 상관없이 넣는다 — behavior 「B001 이 800 이면 insert 0」 와 다르고, 부분 seed 가 남는다.
- **Fix:** seed 바퀴는 넣기 호출을 모아 두는 대역 db 로 `collectOnce` 를 돌리고, 감시 대상이 모두 성공했을 때만 진짜 `insert(…, true)` 를 1번 부른다. 테스트에 공개매수 행을 두어 「넣기 0」 이 의미 있게 했다.
- **Files modified:** workers/dart-alert/src/collector.ts
- **Commit:** c5549948

**4. [Rule 3 - 막힘] 진입점 테스트 주입점**
- **Found during:** Task 2
- **Issue:** `main()` 이 stdout 로거 · 진짜 `runCollector` 를 고정하면 설정 오류 로그 내용과 「정상 결선이면 code 반환」 을 네트워크 없이 단언할 수 없다.
- **Fix:** `main(opts?: { logDestination, run })` · `buildDeps(cfg, log, signal, transports?: { dartAdapter, telegramAdapter })` 선택 인자를 두었다(운영은 넘기지 않음 — 기본값이 stdout · `runCollector` · 진짜 axios 전송). `main` 은 끝날 때 SIGTERM · SIGINT 처리기를 떼어 테스트에서 새지 않게 했다.
- **Files modified:** workers/dart-alert/src/index.ts · workers/dart-alert/tests/modes.test.ts
- **Commit:** c5549948 · 93030ab7

**Total deviations:** 4 auto-fixed(Rule 1 1 · Rule 2 2 · Rule 3 1). **Impact:** 플랜의 흐름 · 상수 · 종료 이유 · 로그 문구는 그대로이고, 운영 기준 ④ 와 「그날 건 유실 0」 쪽으로 더 엄격해졌다. `files_modified` 밖 파일은 건드리지 않았다(`src/lap.ts` 는 변경 없음).

## 이름 · 표기

- 종료 이유에 플랜에 이름이 없던 `probe`(probe 성공) · `test_send` · `test_send_failed` · `error` 를 두었다(code 는 behavior 대로).
- `DELIVER_LIMIT = 5` 를 상수로 내보냈다(플랜 본문의 `deliverPending(deps, 5)`).
- 로그는 lap.ts 와 같이 오류를 `{ err: safeErrorFields(err) }` 로 싣는다(kis 는 펼쳐 싣는다).

## Known Stubs

없음.

## Threat Flags

없음 — 새 네트워크 끝점 · 인증 경로 없음. 진입점의 비밀은 config → 클라이언트 생성 인자로만 가고 `deps.cfg` 에는 예산 · 모드만 실린다(테스트로 확인). 설정 오류 로그는 env 이름만, 예외는 안전 필드만.

## 남은 것 · 확인 못 한 것

- **실제 서비스 경로는 확인하지 않았다** — 실제 Supabase RPC · OpenDART · 텔레그램은 이 플랜에서 부르지 않았다(지시대로 가짜 전송 · 가짜 DB 만). 43-07 스모크(`probe ok`)와 43-08 배포 직후 점검(창 밖 seed)이 확인한다.
- `workers/dart-alert/tsconfig.json` 의 include 가 `src` 뿐이라 `pnpm run typecheck` 는 테스트 파일(가짜 DB 의 `DartAlertDb` 구현 포함)을 보지 않는다. 이번엔 scratchpad 임시 tsconfig 로 한 번 확인했다(새 파일 오류 0). 기존 `tests/dbContract.test.ts`(TS1343) · `tests/watches.test.ts`(TS2339 4건)의 타입 오류는 범위 밖이라 남겼다 — 테스트 typecheck 를 상시화하려면 그 둘부터 고쳐야 한다.
- 실제 `abortableSleep` 의 SIGTERM 반응은 kis-news-sync 와 같은 코드라 따로 시험하지 않았다(가짜 시계 abort 로만 확인).

## Self-Check: PASSED

- FOUND: workers/dart-alert/src/collector.ts · src/index.ts · tests/helpers/fakes.ts · tests/collector.test.ts · tests/modes.test.ts
- FOUND 커밋: be3c2c82 · d12864bc · 93030ab7 · c5549948 (모두 HEAD 조상)
- 수용 기준 grep 전부 통과 · 플랜 `<verification>`(전체 테스트 · typecheck · build) 통과 · STATE.md · ROADMAP.md 변경 없음
