---
phase: 43-tender-offer-telegram-alert
plan: 06
subsystem: workers/dart-alert
status: complete
tags: [outage, telegram, retry, rate-limit, fake-clock, collector]
requires:
  - 43-01 lap.ts(deliverPending 기본 · LapDeps.sleep)
  - 43-02 db.ts(dart_alert_outage open · notice · close · 송신 기한 90초 · stale 재차례 · LeaseLostError)
  - 43-04 telegram/client.ts(SendResult 종류) · safeError.ts(telegramSafeFields)
  - 43-05 collector.ts(루프 · 종료 이유 · stopOnHalt · seedLap) · tests/helpers/fakes.ts
  - 43-09 message.ts(outageText · recoveredText · plainAlertText · kstLabel)
provides:
  - src/collector.ts — OUTAGE_AFTER_MS · 장애 판정(startupCheck · judgeOutage · openOutage · closeOutage · outageOnFatal) · StopRun.detail · 송신 상수 다시 내보내기
  - src/lap.ts — SendPacer · newSendPacer · sendPaced · deliverPending(deps, limit, pacer?) 완성 · SEND_GAP_MS · SEND_WINDOW_MAX · SEND_WINDOW_MS · RETRY_BASE_S · RETRY_MAX_S · UNSENT_ERROR_MS · ClaimedRow.stale · LapDeps.telegram.switchChat?
  - tests/helpers/fakes.ts — 장애 open pending 재오픈 · before 훅 접수번호 · after 훅(반영 뒤 던짐) · telegram.alerts() · telegram.notices()
  - tests/outage.test.ts(17) · tests/delivery.test.ts(14)
affects: [43-07, 43-08]
tech-stack:
  added: []
  patterns:
    - "실행 동안 하나인 SendPacer — 공시 알림 · 장애 글 · 시험 글이 같은 1초 간격 · 60초 18건 · 429 대기를 지난다"
    - "장애 상태 정본은 DB(dart_alert_outage) · 실행 메모리는 「이미 열림」 만 기억해 같은 장애 동안 RPC · 글을 반복하지 않는다"
    - "치명 종료 장애 글은 run() 의 StopRun(code 1) 길 한 곳 — 예산 소진(budgetGate)까지 같은 길"
    - "send → mark 감싸기: mark 예외는 error 뒤 계속, 그 행은 송신 기한 뒤 stale 재차례(최소 1회)"
key-files:
  created:
    - workers/dart-alert/tests/outage.test.ts
    - workers/dart-alert/tests/delivery.test.ts
  modified:
    - workers/dart-alert/src/collector.ts
    - workers/dart-alert/src/lap.ts
    - workers/dart-alert/tests/helpers/fakes.ts
    - workers/dart-alert/tests/collector.test.ts
key-decisions:
  - "장애 글 「HH:MM 부터」 · 「다시 동작」 구간의 시작은 DB since(now) 가 아니라 기준점(마지막 성공 조회 · 없으면 07:02)이다 — behavior 「10:00 부터」 · 「10:00 ~ 10:31」 그대로. 다른 실행이 이어받은 장애 · notice pending 재오픈만 DB since 를 쓴다"
  - "치명 종료 장애 글의 since 는 멈춘 시각(now) · 사유는 종료 이유별 고정 문구 + DART 코드(StopRun.detail)"
  - "SIGTERM 으로 장애 글을 못 보냈으면 notice 를 기록하지 않는다 — DB 에 pending 으로 남아 다음 실행 시작 점검이 다시 연다"
  - "송신 속도 상수는 순환 import 를 피해 lap.ts 에 두고 collector.ts 가 같은 이름으로 다시 내보낸다(플랜 허용 경로)"
  - "parse 오류는 행마다 error 1번(서식 버그 신호) · token · chat 은 실행당 종류별 1번"
requirements-completed: [SC-5, SC-6]
metrics:
  duration: 50m
  started: 2026-11-12T15:28:34Z
  completed: 2026-11-12
  tasks: 2
  files: 6
estimate:
  tokens: 68000
actuals:
  tokens: 14400
  tasks: 2
  commits: 4
plan_head_before: 06719f1bb7f4b785ca50c93f77dbfb653c499b7a
plan_head_after: ba64a36f77e414ff184f4e54b8bda10c330d32e3
coverage:
  - deliverable: "5분 장애 판정 · 한 번만 · 「멈췄습니다」 · 「다시 동작」 짝 · 실패 시 짝 없음"
    human_judgment: false
    verification:
      - kind: test
        ref: "workers/dart-alert/tests/outage.test.ts#DART 5분 실패 → 장애 열기 · 한 번만 (D-17) 5 it"
        status: pass
  - deliverable: "시작 점검(죽은 수집기 · notice pending · 열린 장애 이어받기) · 첫 배포 seed 경로(W1)"
    human_judgment: false
    verification:
      - kind: test
        ref: "workers/dart-alert/tests/outage.test.ts#첫 배포 seed 경로는 멈췄습니다를 올리지 않는다"
        status: pass
      - kind: test
        ref: "workers/dart-alert/tests/outage.test.ts#시작 점검 — 죽은 수집기 (D-16 · 가정 4) 6 it"
        status: pass
  - deliverable: "치명 종료(020 · 예산 소진 · 010) 전 장애 글 · 기록 실패에도 종료 1"
    human_judgment: false
    verification:
      - kind: test
        ref: "workers/dart-alert/tests/outage.test.ts#치명 종료 전 장애 글 5 it"
        status: pass
  - deliverable: "재시도 · 429 · 방 이동 · 평문 · 토큰/방 · 120초 미송신 · 속도 · 순서 · 늦은 표시"
    human_judgment: false
    verification:
      - kind: test
        ref: "workers/dart-alert/tests/delivery.test.ts#재시도 · 대기 / 방 · 토큰 · 서식 오류 / 송신 속도 · 순서 · 늦은 표시 11 it"
        status: pass
  - deliverable: "mark · claim RPC 실패 길(W2) · LeaseLostError 전달"
    human_judgment: false
    verification:
      - kind: test
        ref: "workers/dart-alert/tests/delivery.test.ts#mark 실패 건은 error 로그 뒤 90초 안에 다시 차례로 나온다"
        status: pass
      - kind: test
        ref: "workers/dart-alert/tests/delivery.test.ts#claim 응답이 끊겨도 90초 뒤 다시 차례로 나온다"
        status: pass
  - deliverable: "실패 로그가 실제 pino level 50 으로 찍힘(43-07 로그 일치 이메일 정책 전제)"
    human_judgment: false
    verification:
      - kind: command
        ref: "scratchpad tsx 스크립트 — 실제 createLogger + 가짜 의존성으로 6개 문구의 jsonPayload.level 확인(저장소 밖 · 커밋 안 함)"
        status: pass
  - deliverable: "실제 텔레그램 · Supabase 에서의 장애 글 · 방 이동 · 이메일 도착"
    human_judgment: true
    rationale: "가짜 전송 · 가짜 DB 로만 검증했다 — 실제 단체방 글 · Cloud Logging 정책 일치 · 메일 도착은 43-08 배포 뒤 확인"
---

# Phase 43 Plan 06: 장애 짝 글 · 송신 견고함 Summary

**DART 가 5분 넘게 실패하거나 수집기가 죽었다 살아나면 단체방에 「⚠ 공시 알림이 멈췄습니다」 가 한 번, 복구 때(그 글이 실제로 나갔을 때만) 「✅ 공시 알림 다시 동작」 이 한 번 가고 운영자에게는 pino level 50 로그로 이메일이 가며, 텔레그램이 흔들려도(일시 장애 · 429 · 방 이동 · 서식 오류 · 기록 RPC 실패) 공시 알림이 pending 으로 남아 1초 간격 · 분당 18건 · 공개매수 먼저로 이어서 나가는 것을 가짜 시계 31개 시나리오로 증명했다.**

## 수행 결과

| Task | 이름 | 커밋 | 파일 |
|------|------|------|------|
| 1 (RED) | 장애 짝 글 시나리오 | 11663e82 | tests/outage.test.ts · tests/helpers/fakes.ts |
| 1 (GREEN) | 장애 판정 · 짝 글 · 치명 종료 전 장애 글 | e8918b39 | src/collector.ts · tests/collector.test.ts |
| 2 (RED) | 송신 견고함 시나리오 | 84d8757d | tests/delivery.test.ts · tests/helpers/fakes.ts |
| 2 (GREEN) | SendPacer · deliverPending 완성 · collector 결선 | ba64a36f | src/lap.ts · src/collector.ts · tests/collector.test.ts |

### 검증 실제 출력

- Task 1 `<verify>`(`vitest run tests/outage.test.ts tests/collector.test.ts` + typecheck): **Test Files 2 passed (2) · Tests 43 passed (43)** · `tsc --noEmit` 종료 0
- Task 2 `<verify>`(플랜 명령 그대로 · `--testTimeout=30000` 더함): **Test Files 15 passed (15) · Tests 306 passed (306)**(기존 275 + outage 17 + delivery 14) · typecheck 종료 0
- 수용 기준 grep: T1 `OUTAGE_AFTER_MS = 300_000` 1 · `"dart outage opened"|"dart outage closed"` 2 · `outage("open"|"close"|"notice"` 3 · outage `it(` 17 · W1 이름 1 / T2 상수 5개(lap.ts 5 · collector.ts 는 다시 내보내기라 0 — 합계 5) · 텔레그램 문구 4 · `newChatIdTail` 2 · mark/claim/stale 문구 3 · W2 이름 둘 각 1 · delivery `it(` 14
- **pino level 50 확인(43-07 정책 전제)**: 실제 `createLogger` 를 가짜 의존성 수집기에 물려 돌린 결과 `dart outage opened` · `telegram chat migrated` · `telegram token invalid` · `telegram chat unavailable` · `alert unsent over 120s` · `alert mark failed` 모두 `level=[50]`(각 1건), 로그 전체에 새 방 id 앞자리(`9876543210`) 없음. `dart outage closed` 는 info(30) — 정책이 잡지 않는 것이 맞다.
- 헛통과 점검(임시 변조 → 원복 · 커밋 안 함): 시작 점검을 seed 바퀴 **앞**으로 옮기면 W1 이름 붙은 테스트가 `expected [ { at: … } ] to have a length of +0 but got 1` 로 실패 / `markSafe` 가 mark 예외를 다시 던지면 W2 `mark 실패 …` 테스트가 `expected +0 to be 1` 로 실패.
- 모든 vitest 는 `perl alarm` 시간 상한 + `--testTimeout` 아래에서 `--maxWorkers=2` 로만 돌렸다. 끝난 뒤 `pgrep -fl vitest` 결과 없음.

## 장애 시나리오 표

| 상황 | 단체방 글 | 로그 | 종료 |
|------|-----------|------|------|
| 10:00 부터 DART 800 계속 | `10:05:10` 바퀴에 「⚠ … 10:00 부터 DART 조회 실패(공개매수 transient 800 · 주요사항보고서 transient 800)」 1건 · 그 뒤 0 | error `dart outage opened`(notice sent) 1번 | 계속 |
| 위에서 10:31 회복 | 「✅ … 10:00 ~ 10:31 사이 공시는 …」 1건 | info `dart outage closed`(notify true) | 계속 |
| 「멈췄습니다」 송신 실패 | 0(회복 때도 0 — 짝 규칙) | error `dart outage opened`(notice failed) · `dart outage closed`(notify false) | 계속 |
| 4분 50초 실패 뒤 회복 | 0 · open 0 | 없음 | 계속 |
| 주요사항보고서만 6분 실패 | 「⚠ …(주요사항보고서 transient 800)」 1건 · 공개매수 성공으로는 닫지 않음 | error 1 | 계속 |
| 죽은 수집기 — lastOk 10:00 · 10:07 인계 | 첫 바퀴 전 「⚠ … 10:00 부터 …(수집기 중단(마지막 조회 10:00))」 → 첫 바퀴 성공에 「✅ … 10:00 ~ 10:07」(두 글 · 합치지 않음) | error 1 · info 1 | 계속 |
| 07:00:30 시작 · lastOk 없음 | 0(기준점 07:02) | 없음 | 계속 |
| 07:08 시작 · lastOk 없음 | 「⚠ … 07:02 부터 …(수집기 중단(오늘 조회 기록 없음))」 → 「✅」 | error 1 | 계속 |
| **첫 배포 seed(월 14:00 · lastOk 없음)** | 0 — 시작 점검이 seed 바퀴 뒤라 기준점이 방금 | open 호출 0 | auto 로 이어 감 |
| DB 장애 열림(notice sent) 채로 시작 | 새 「⚠」 0 · 첫 성공 바퀴 「✅」 1 | info 1 | 계속 |
| DB 장애 notice pending 채로 시작 | 시작 점검 open → opened true → 「⚠ … 09:50 부터」 1 → 「✅」 1 | error 1(reopen true) | 계속 |
| `020` | 「⚠ … 하루 조회 한도 초과(020)」 1 · strike 1 | error `fatal DART status …` · `dart outage opened` | 1 `quota` |
| 실행 중 예산 소진 | 「⚠ … 자체 하루 예산 소진」 1 | error 2 | 1 `budget_exhausted` |
| `010` | 「⚠ … 인증키 오류(010)」 1 | error 2 | 1 `dart_key` |
| 이미 열린 장애 + 020 | 0(한 번만) | error `fatal …` | 1 `quota` |
| 치명 종료 + 장애 RPC 실패 | 0 | error `dart outage open failed` | 1 그대로 |
| 어제 19:50 열림 · 오늘 07:00:40 첫 성공 | 「✅ 공시 알림 다시 동작(11/16 19:50 부터 멈춤) — 오늘 접수된 공시는 …」 | info 1 | 계속 |

`dart_bug` · `unknown_streak` · `probe_failed` 도 같은 치명 종료 길(사유 「요청 오류(100)」 · 「모르는 응답 코드 연속(999)」 · 「한도 의심 재확인 실패(020)」)이다. 장애 판정 · 시작 점검 · 치명 종료 글은 모두 확인 시간대 안 · 임대 보유 중일 때만.

## 송신 결과별 처리 표

| 결과 | DB 기록(mark) | 다음 시도 | 로그 |
|------|---------------|-----------|------|
| ok | sent · message_id | — | — |
| transient(5xx · 네트워크) | 실패 `transient:코드` | min(60, 5 × 2^(시도−1))초 → 5 · 10 · 20 · 40 · 60 | warn `telegram send failed`(종류 · 코드 · 설명 200자) |
| rate(429) | 실패 `rate:N` · 같은 차례 나머지 행도 같은 N 초로(보내지 않음) | retry_after 초 · 그동안 그 방 송신 전체 정지(장애 글 포함) | warn |
| migrated | 새 방 id 로 같은 글 즉시 재송신 결과로 기록 | — | error `telegram chat migrated`(`newChatIdTail` 끝 4자리) |
| parse | 평문(`plainAlertText`) 1회 재송신 결과로 기록 | — | error `telegram parse error — resending as plain text` |
| token(401) | 실패 `token:401` | 60초 | error `telegram token invalid` 실행당 1번 + warn |
| chat(403 · 400 chat not found) | 실패 `chat:코드` | 60초 | error `telegram chat unavailable` 실행당 1번 + warn |
| 처음 본 뒤 120초 넘게 미송신 | — | — | error `alert unsent over 120s`(접수번호 · 시도 수) 접수번호마다 1번 |
| mark RPC 던짐 | 반영 안 됨 → sending 으로 남음 | 송신 기한 90초 뒤 같은 보유자 차례에 stale 로 재송신 | error `alert mark failed`(rceptNo · result · hasMessageId · 안전 필드) → 재차례 때 warn `possible duplicate after stale claim` |
| mark false(내 sending 아님) | — | — | warn `alert mark not applied` |
| claim RPC 던짐(응답 유실 포함) | 반영됐다면 sending | 90초 뒤 stale 재차례 | warn `alert claim failed` · 그 바퀴 송신 건너뜀 |
| `LeaseLostError`(mark · claim) | — | — | 삼키지 않고 위로 → 종료 0 `lease_lost` |

속도: 같은 방 송신 간격 ≥ 1초(`SEND_GAP_MS`) · 어느 60초에도 ≤ 18건(`SEND_WINDOW_MAX`) — 창이 차거나 429 대기 중이면 차례를 받지 않는다. 한 차례는 `min(5, 18 − 최근 60초 송신 수)` 건. 순서는 DB 차례 순서(공개매수 먼저 → 처음 본 순). 처음 본 뒤 60초 넘게 지나 나가는 건은 「(늦은 알림)」(행의 late 가 이미 true 여도 한 번만).

## error 로그 문구 목록(43-07 `ops/alert-dart-alert-error-log.yaml` 이 잡는 것 · 모두 pino level 50)

- `dart outage opened` — 사유 · since · notice(sent · failed · not_sent) · reopen · 실패면 telegram 안전 필드
- `dart outage open failed` — 장애 open RPC 실패(일반 바퀴 · 치명 종료 길)
- `dart outage notice record failed` — notice 기록 실패(다음 실행이 pending 으로 다시 연다)
- `telegram chat migrated` · `telegram token invalid` · `telegram chat unavailable` · `telegram parse error — resending as plain text`
- `alert unsent over 120s` · `alert mark failed`
- (43-05 그대로) `fatal DART status — stopping this run` · `daily budget exhausted — stopping this run` · `collector failed` 등

info · warn(정책이 잡지 않음): `dart outage closed` · `dart outage already open — not posting again` · `dart outage close failed — retrying next lap` · `telegram send failed` · `alert claim failed` · `possible duplicate after stale claim` · `alert mark not applied`.

## RED · GREEN (TDD Gate Compliance)

두 task 모두 RED `test(43-06)` → GREEN `feat(43-06)` 순서. REFACTOR 없음. RED 증거는 `.gsd/red-43-06/`(gitignore) — 저장소에 넣지 않았다.

- **Task 1 RED** — 구현 없이(collector.ts 그대로) JUnit XML 리포터로 실행 → 17 실행 · 4 pass · 13 fail · exit 1. 대상 `시작 점검 — 죽은 수집기 (D-16 · 가정 4) > DB lastOk 10:00:00 · 10:07:00 에 임대를 잡음 → …` 이 `expected [] to have a length of 1 but got +0`(AssertionError)로 실패. classifier `RED_EVIDENCE_OK / target_test_failed`. semanticAssessment: 13건 모두 장애 RPC · 글 수 단언 실패(`OUTAGE_AFTER_MS` 1건은 아직 없는 상수에 대한 값 단언) — 적재 · 구문 · 픽스처 오류 없음. 통과 4건(4분 50초 · 07:00:30 · seed W1 · 이미 열린 장애 치명 종료)은 「아무 일도 없어야 함」 을 지키는 회귀 지킴 테스트라 구현 전에도 통과하는 것이 맞다 — W1 은 위 변조 점검으로 실제로 깨질 수 있음을 따로 확인했다.
- **Task 2 RED** — T1 GREEN 상태(lap.ts 43-01 그대로)로 실행 → 14 실행 · 1 pass · 13 fail · exit 1. 대상 `기록 · 차례 RPC 실패 길 … > mark 실패 건은 error 로그 뒤 90초 안에 다시 차례로 나온다` 가 `expected +0 to be 1`(mark 예외를 잡지 않아 `alert mark failed` 0)로 실패. classifier `RED_EVIDENCE_OK / target_test_failed`. semanticAssessment: 실패 13건은 재시도 간격 `[5,5,5,0]` · 429 미처리 · 방 이동 미재송신 · 늦은 표시 없음 등 계획한 동작 단언이다. 통과 1건(`LeaseLostError` 는 위로)은 43-05 가 이미 지키던 계약의 회귀 지킴이다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - 막힘] 기존 collector 테스트 8건을 새 동작에 맞게 갱신(`files_modified` 밖 파일)**
- **Found during:** Task 1 GREEN · Task 2 GREEN
- **Issue:** 43-05 `tests/collector.test.ts` 의 여러 픽스처가 「낮(09:30 · 10:00 · 10:06:30 · 07:29:55)에 오늘 `last_ok` 없이 시작」 한다 — 플랜 behavior 대로면 이건 죽은 수집기 인계라 시작 점검이 「멈췄습니다」 · 「다시 동작」 을 올린다. 그 결과 `telegram.sent` 길이 · error 0 단언 7건이 깨졌고(T1), T2 의 1초 간격 규칙으로 한 바퀴 두 송신 시각 단언 1건이 바뀌었다. 플랜은 「tracer · collector · outage 테스트가 계속 통과해야 한다」 고 했으나 이 파일을 `files_modified` 에 넣지 않았다.
- **Fix:** 각 테스트의 의도(공시 알림 송신 · 늦은 표시 · 임대 · 오류 0)는 그대로 두고, 가짜 텔레그램에 `alerts()`(📢 글만)를 더해 6건은 공시 알림만 세게, 「800 · 네트워크 → error 0」 1건은 직전 성공 조회 `last_ok 10:00:00` 을 주어 「1분 실패는 장애 전」 으로, 인계 재송신 1건은 기대 시각을 `10:00:01` · `10:00:02`(시작 점검 글 뒤 1초 간격)로 바꿨다. 단언을 지우거나 느슨하게 한 것은 없다.
- **Files modified:** workers/dart-alert/tests/collector.test.ts
- **Commit:** e8918b39 · ba64a36f

**2. [Rule 1 - 계획 산수] W2 mark 실패 건의 재송신 시각은 `10:01:40` 이 아니라 `10:01:30`**
- **Found during:** Task 2
- **Issue:** behavior 는 「10:01:40 바퀴(기한 90초 지남)」 라 적었지만, 차례가 `10:00:00` 이고 기한이 90초(`claim_until <= now`)라 `10:01:30` 바퀴에서 이미 stale 로 나온다.
- **Fix:** 테스트는 「10:01:00 에는 sending · 송신 0」 과 「두 번째 송신 − 첫 송신 이 90초 이상 100초 이하」(테스트 이름 「90초 안에 다시 차례로」 그대로)를 단언한다. claim 유실 테스트도 같은 꼴.
- **Files modified:** workers/dart-alert/tests/delivery.test.ts
- **Commit:** 84d8757d

**3. [Rule 2 - 정확성] 장애 글 시작 시각 · notice 기록 · 무로그 실패 보강**
- **Found during:** Task 1 · Task 2
- **Issue:** DB `open` 은 since 를 「연 시각(now)」 으로 적는데 behavior 문구는 「10:00 부터」(기준점)다. 또 SIGTERM 으로 글을 못 보낸 경우 · mark 가 false 를 돌려준 경우의 처리가 플랜에 없었다.
- **Fix:** 글 · 「다시 동작」 구간은 기준점(이어받은 장애 · pending 재오픈은 DB since)을 쓴다. SIGTERM 으로 못 보낸 장애 글은 notice 를 기록하지 않아(pending 유지) 다음 실행 시작 점검이 다시 연다. mark false 는 warn `alert mark not applied`. 장애 open 실패는 error `dart outage open failed`, notice 기록 실패는 error `dart outage notice record failed`, close 실패는 warn 뒤 다음 성공 바퀴에 다시.
- **Files modified:** workers/dart-alert/src/collector.ts · workers/dart-alert/src/lap.ts
- **Commit:** e8918b39 · ba64a36f

**Total deviations:** 3 auto-fixed(Rule 1 1 · Rule 2 1 · Rule 3 1). **Impact:** 플랜의 상수 · 로그 문구 · 판정 규칙은 그대로다. `files_modified` 밖으로 나간 것은 기존 테스트 파일 하나(위 1)뿐이고, 43-07 계약 파일(`ops/alert-dart-alert-error-log.yaml` · `scripts/smoke-dart-alert.sh`) · `db.ts` · `message.ts` · 마이그레이션은 건드리지 않았다.

## 43-07 · 43-08 이 볼 것

- 정책 문서의 6개 문구는 모두 실제로 level 50 으로 찍힌다(위 확인). 정책 문서에 없는 error 문구 셋(`dart outage open failed` · `dart outage notice record failed` · `telegram parse error — resending as plain text`)도 level 50 이라 같은 정책이 잡는다 — 문서에 복구 방법을 더하고 싶으면 43-07 몫.
- `ClaimedRow.stale` 은 선택 필드(`stale?: boolean`)로 더했다 — `db.ts` 의 `CLAIMED_ROW_KEYS` 에 이미 `stale` 이 있어 키 완전성 타입 검사는 그대로 통과한다.
- 방 이동 시 `switchChat` 은 `index.ts` 클로저의 방 id 만 바꾼다(실행 메모리) — 비밀 · DB 는 그대로.

## Known Stubs

없음.

## Threat Flags

없음 — 새 네트워크 끝점 · 인증 경로 없음. 새 로그는 접수번호 · 시도 수 · 결과 종류 · `telegramSafeFields`/`safeErrorFields` · 방 id 끝 4자리만 싣는다(토큰 · 방 id 전체 · URL 없음 — delivery 테스트 · pino 확인으로 검증).

## 남은 것 · 확인 못 한 것

- **실제 서비스 경로는 확인하지 않았다** — 실제 텔레그램 단체방 글 · 실제 `dart_alert_outage` RPC · Cloud Logging 정책 일치 · 운영자 메일 도착은 이 플랜에서 부르지 않았다(지시대로 가짜 전송 · 가짜 DB 만). 43-08 배포 뒤 확인할 일이다.
- `pnpm run typecheck` 는 `src` 만 본다(43-05 와 같은 한계) — 테스트 파일 타입은 vitest(esbuild)가 확인하지 않는다. 이번 변경의 테스트 파일 타입 검사는 따로 돌리지 않았다.
- `dart_bug` · `unknown_streak` · `probe_failed` 치명 종료의 장애 글 문구는 같은 코드 경로라 따로 테스트하지 않았다(020 · 예산 · 010 만 단언).

## Self-Check: PASSED

- FOUND: workers/dart-alert/src/collector.ts · src/lap.ts · tests/helpers/fakes.ts · tests/outage.test.ts · tests/delivery.test.ts · tests/collector.test.ts
- FOUND 커밋: 11663e82 · e8918b39 · 84d8757d · ba64a36f (모두 HEAD 조상)
- 수용 기준 grep 전부 통과 · 플랜 `<verification>`(전체 15 파일 306 테스트 · typecheck) 통과 · STATE.md · ROADMAP.md 변경 없음
