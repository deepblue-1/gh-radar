---
phase: 43-tender-offer-telegram-alert
plan: 04
subsystem: workers/dart-alert
status: complete
tags: [opendart, telegram, error-classification, pagination, secret-masking, tdd]
requires:
  - 43-01 (dart/client.ts · telegram/client.ts 행복한 길 · safeError.ts · 트레이서 테스트)
provides:
  - src/dart/client.ts (DartStatusClass · classifyDartStatus 전 표 · fetchListPage 일시 장애 분류 · FULL_REREAD_MS · PageTracker · fetchWatchRows)
  - src/telegram/client.ts (classifyTelegramResponse 전 표 · sendMessage 무reject)
  - src/safeError.ts (safeErrorFields axios 분기 OpenDART 꼴 · TelegramSafeFields · telegramSafeFields)
affects: [43-05, 43-06, 43-09]
tech-stack:
  added: []
  patterns:
    - "OpenDART 는 본문 status 로만 가른다 — 000 ok · 013 empty(성공) · 나머지는 DartApiError(kind) · 응답 없음 · HTTP 0/5xx · status 없는 본문은 transient"
    - "쪽 넘김은 정렬 순서에 기대지 않는다 — total_count ≤ 100 이면 1쪽으로 끝, 넘으면 늘었거나 60초 지났을 때만 전 쪽"
    - "PageTracker 는 성공한 전체 읽기 뒤에만 갱신 · 중간 실패 오류에 그때까지 호출 수(calls)를 싣는다"
    - "텔레그램은 throw 대신 분류 결과 — 본문 형태 → ok → parameters(migrate · retry_after) → error_code 순"
key-files:
  created:
    - workers/dart-alert/tests/dartClient.test.ts
    - workers/dart-alert/tests/telegram.test.ts
    - workers/dart-alert/tests/fixtures/dart/list-013.json
    - workers/dart-alert/tests/fixtures/dart/list-020.json
    - workers/dart-alert/tests/fixtures/dart/list-010.json
    - workers/dart-alert/tests/fixtures/dart/list-total-150-p1.json
    - workers/dart-alert/tests/fixtures/dart/list-total-150-p2.json
    - workers/dart-alert/tests/fixtures/telegram/ok.json
    - workers/dart-alert/tests/fixtures/telegram/429.json
    - workers/dart-alert/tests/fixtures/telegram/400-migrate.json
    - workers/dart-alert/tests/fixtures/telegram/400-parse.json
    - workers/dart-alert/tests/fixtures/telegram/400-chat-not-found.json
    - workers/dart-alert/tests/fixtures/telegram/401.json
    - workers/dart-alert/tests/fixtures/telegram/403.json
  modified:
    - workers/dart-alert/src/dart/client.ts
    - workers/dart-alert/src/telegram/client.ts
    - workers/dart-alert/src/safeError.ts
decisions:
  - "classifyDartStatus 는 \"ok\" · \"empty\" · DartErrorKind 를 돌려준다(DartStatusClass). DartApiError 기본 종류는 ok · empty 를 unknown 으로 접는 errorKindOf 로 정한다"
  - "total_count ≤ 100 인 바퀴도 그날 목록 전체를 읽은 것이므로 PageTracker 를 갱신한다. 100 초과에서 1쪽만 읽은 바퀴는 total 이 줄었어도 갱신하지 않는다(60초 그물이 덮음)"
  - "텔레그램 본문이 JSON 객체가 아니면 HTTP 상태와 무관하게 transient — 프록시 HTML 400 을 방 문제(chat)로 오판하지 않는다"
  - "retry_after 는 typeof number 만 받아 Math.ceil · 최소 1, 숫자가 아니거나 null 이어도 키가 있으면 rate 1초"
  - "safeErrorFields 의 axios 분기는 본문 status · message 를 먼저 보고(텔레그램 꼴 error_code · description 은 뒷순위), 본문 status 가 있으면 상태 표로 종류를 정한다"
metrics:
  duration: 약 6분(14:27 ~ 14:33 UTC)
  completed: 2026-11-12
estimate:
  tokens: 45000
actuals:
  tokens: 23800
  tasks: 2
  commits: 4
plan_head_before: 885504fbd947c1ac214c6c9beec10c1b6da0bec0
plan_head_after: 3994bb97eca0cd14457f083e660680b562ecc6fa
---

# Phase 43 Plan 04: OpenDART · 텔레그램 클라이언트 운영 품질 Summary

**한 줄 요약:** OpenDART 응답을 본문 `status` 로 ok · empty(`013`) · quota · key · bug · transient · unknown 으로 나누고 `total_count` 100 초과 날은 `PageTracker` 로 「늘었거나 60초」 마다 전 쪽을 읽게 했으며, 텔레그램 `sendMessage` 는 reject 없이 ok · migrated · rate · token · chat · parse · transient 로 갈라 돌려준다. 키 · 토큰 표지 문자열이 오류 · 결과 · 로그 필드 어디에도 없음을 테스트가 단언한다.

## 분류 표 — OpenDART (`fetchListPage` · `classifyDartStatus`)

| 입력 | 결과 |
|------|------|
| 본문 `status` `000` | 행 반환(`total` · `totalPage` · `rows`) |
| `013` | `{ total: 0, totalPage: 0, rows: [] }` — 오류 아님 |
| `020` | `DartApiError` kind `quota` |
| `010` · `011` · `012` · `901` | `key` |
| `100` · `101` | `bug` |
| `800` · `900` | `transient` |
| 그 밖 코드(예 `999`) | `unknown` |
| HTTP 0 · 5xx | `transient`(httpStatus 그대로) |
| 응답 없음(네트워크 · 타임아웃) | `transient` · httpStatus 0 · 문구는 axios 오류 코드 이름만 |
| HTML · 깨진 JSON · `status` 없는 객체 본문 | `transient` · 문구 `invalid body` |

- axios 원래 오류를 `cause` 로 붙이지 않는다. `DartApiError` 의 message · JSON · stack · `safeErrorFields` 결과에 `TEST-DART-KEY-DO-NOT-LOG` 가 없음을 모든 오류 케이스에서 단언했다.
- `total_count` · `total_page` 가 숫자가 아니면 행 수 · `ceil(total/100)` 으로 메운다.

## 쪽 넘김 규칙 (`fetchWatchRows` · 리서치 확인 5)

1. 매 바퀴 1쪽(100건).
2. `total ≤ 100` 이면 끝 — 트래커를 `(total, now)` 로 갱신.
3. `total > 100` 이면 `total > lastTotal` 또는 `now − lastFullAt ≥ 60초`(`FULL_REREAD_MS`) 일 때만 2쪽 ~ `max(total_page, ceil(total/100))` 를 마저 읽는다. 아니면 1쪽 행만.
4. 성공한 전체 읽기 뒤에만 트래커 갱신. 중간 실패면 그 `DartApiError.calls` 에 실패 호출까지 센 수를 싣는다(2쪽 실패 → 2). `lap.ts` 의 `err.calls ?? 1` 과 그대로 맞물린다.

테스트로 잠근 경우: 40건 → 1쪽 · calls 1 / 150건 첫 바퀴 → 1·2쪽 · calls 2 · 행 150(접수번호 중복 0) / 10초 뒤 → 1쪽 / 60초 뒤 → 전 쪽 / 151 로 늘면 → 전 쪽 / 2쪽 503 → calls 2 · 다음 바퀴(마지막 성공 + 65초) 다시 전 쪽 / 1쪽 실패 → calls 1 / `013` → 행 0 · calls 1.

## 분류 표 — 텔레그램 (`classifyTelegramResponse` · `sendMessage`)

| 입력(평가 순서) | 결과 |
|-----------------|------|
| 본문이 JSON 객체가 아님(상태 무관) | `transient` · `code` = HTTP 상태 · `description "non-JSON body"` |
| `ok: true` | `{ kind: "ok", messageId }` |
| `parameters.migrate_to_chat_id` | `{ kind: "migrated", to: "<문자열 id>" }` |
| `parameters.retry_after` 키 있음 | `{ kind: "rate", retryAfterS }` — 정수 올림 · 0 이하 · 숫자 아님 · null → 1 |
| `error_code`(없으면 HTTP) 401 | `token` |
| 403 | `chat` |
| 400 + 「can't parse entities」 | `parse` |
| 400 그 밖(「chat not found」 포함) | `chat` |
| 5xx · 0 · 모르는 코드 | `transient` |
| 응답 없음(네트워크 · 타임아웃 · axios 아닌 오류) | `transient` · code 0 · 문구는 오류 코드 이름만 |

- `sendMessage` 는 어떤 경우에도 reject 하지 않는다. 응답이 붙은 axios 오류는 그 본문으로 분류한다. 문구가 토큰을 되풀이하면 `***` 로 가린다. 문구는 200자에서 자른다.
- `plain: true` 면 `parse_mode` 를 빼고 `link_preview_options` 는 그대로다. 요청 경로 `/bot<토큰>/sendMessage` 는 가짜 전송이 받은 설정으로만 확인했다.
- `telegramSafeFields(result)` → `{ kind, code, description }`: ok → `null, null` · rate → `429, "retry after Ns"` · migrated → `400, "chat migrated to …끝4자리"` · 나머지 → 결과의 code · description.

## 픽스처 목록

손으로 만든 문서 · 공개 사례 꼴이다(실제 응답 표본 아님 · 비밀 문자열 없음).

- `tests/fixtures/dart/`: `list-013.json` · `list-020.json` · `list-010.json` · `list-total-150-p1.json`(100행) · `list-total-150-p2.json`(50행) — 두 쪽은 접수번호 14자리 `20261111100001` ~ `20261111100150` · 날짜 `20261111` · `total_count 150` · `total_page 2`.
- `tests/fixtures/telegram/`: `ok.json`(message_id 101) · `429.json`(retry_after 7) · `400-migrate.json`(-1009876543210) · `400-parse.json` · `400-chat-not-found.json` · `401.json` · `403.json`(bot was kicked).

## 검증

- `pnpm exec vitest run tests/dartClient.test.ts tests/tracer.test.ts --maxWorkers=2` → 2 files · 47 tests 통과.
- `pnpm exec vitest run tests/telegram.test.ts tests/tracer.test.ts --maxWorkers=2` → 2 files · 32 tests 통과.
- dart-alert 전체 `pnpm exec vitest run --maxWorkers=2` → **8 files · 172 tests 통과**(기존 6 files · 97 + dartClient 45 + telegram 30).
- `pnpm run typecheck`(tsc --noEmit) → 종료 0.
- 수락 기준 grep: dart 상태 코드 줄 10 · `export class PageTracker` 1 · `FULL_REREAD_MS = 60_000` 1 · 키 표지 1 / `migrate_to_chat_id` 3 · `retry_after` 4 · `can't parse entities` 2 · 텔레그램 픽스처 7 · 토큰 표지 3.

## TDD Gate Compliance

- Task 1: RED `106385d0` → GREEN `f32c5c87`.
  - RED 증거: `pnpm exec vitest run tests/dartClient.test.ts --maxWorkers=2 --testTimeout=5000 --reporter=junit` JUnit XML → `gsd_run check tdd-red-evidence` = `RED_EVIDENCE_OK`(reason `target_test_failed` · 45 tests · 35 pass · 10 fail · errors 0).
  - 대상 테스트: 「fetchWatchRows · PageTracker — 100건 넘는 날 > total 150 첫 바퀴 → 1 · 2쪽 · calls 2 · 행 150」 — 임시 골격이 1쪽만 읽어 `expected [ 1 ] to deeply equal [ 1, 2 ]` 단언 실패.
  - semanticAssessment: 대상 테스트가 실제로 실행돼 계획된 단언에서 실패했다. 수집 · import · 문법 오류 0. 나머지 실패 9건도 전부 계획된 단언(000 → ok · 013 → empty · status 없는 본문 → transient · safeErrorFields 본문 message · 60초 상수 · 전 쪽 읽기 · calls)이다. 통과 35건은 43-01 이 이미 채워 둔 분류(020 · 010 등)와 1쪽만으로 맞는 경우다.
- Task 2: RED `96b39e73` → GREEN `3994bb97`.
  - RED 증거: `pnpm exec vitest run tests/telegram.test.ts --maxWorkers=2 --testTimeout=5000 --reporter=junit` → `RED_EVIDENCE_OK`(reason `target_test_failed` · 30 tests · 21 pass · 9 fail · errors 0).
  - 대상 테스트: 「retry_after 바로잡기 > retry_after 0 → 1초」 — 기존 분류가 0 을 무시하고 error_code 로 내려가 `transient` 를 돌려줘 toEqual 단언 실패.
  - semanticAssessment: 계획된 단언 실패. 나머지 실패는 retry_after 바로잡기 4건 · JSON 아닌 400 본문 · telegramSafeFields 3건으로 모두 이 플랜의 새 행동이다.
- 임시 골격(`fetchWatchRows` 1쪽만 · `telegramSafeFields` null 반환)은 RED 커밋에 넣지 않았다 — RED 커밋은 테스트 · 픽스처뿐. 모든 테스트 실행에 `--testTimeout` 과 perl alarm(120 ~ 180초) 상한을 걸었다. RED 증거는 gitignore 된 `.gsd/red-43-04/` 스크래치.

## Deviations from Plan

None - plan executed exactly as written.

(참고: 플랜의 「본문이 JSON 이 아님 → transient」 를 HTTP 상태와 무관하게 적용했다 — 프록시가 400 HTML 을 돌려줄 때 `chat` 으로 오판하지 않기 위해. 플랜 behavior 범위 안의 해석이라 이탈로 보지 않았다.)

## 다음 플랜에 넘길 것

- **43-05(buildDeps):** 감시 대상마다 `new PageTracker()` 하나를 두고 `deps.dart.list` 를 `fetchWatchRows(http, key, { detailTy, day }, tracker, now)` 로 결선한다. 반환 `calls` 를 `api_usage` 에 그대로 더한다. 날이 바뀌면 트래커를 새로 만든다(전날 `lastTotal` 이 남으면 새 날 첫 100 초과 판단이 늦어질 수 있음 — 60초 그물이 덮지만 새로 만드는 쪽이 깔끔).
- **43-06 · 43-09(lap.ts):** `lap.ts` 는 이 플랜에서 건드리지 않았다. `failReason` 이 쓰는 `SendResult` 꼴(`code` · `description` · `retryAfterS` · `to`)은 그대로다. 송신 실패 로그에는 `telegramSafeFields(r)` 를 쓰면 된다. migrated 는 같은 글을 `to` 로 즉시 재송신 + error 로그, parse 는 `plain: true` 로 1회 재송신이 리서치 표의 처리다.
- `classifyDartStatus` 반환 타입이 `DartStatusClass`(ok · empty 포함)로 넓어졌다. 현재 `src/` 에서 이 함수를 직접 쓰는 곳은 `safeError.ts` 뿐이다.

## Known Stubs

없음.

## Self-Check: PASSED

- 파일: dart/client.ts · telegram/client.ts · safeError.ts · tests 2 · 픽스처 12 모두 존재.
- 커밋: `106385d0` · `f32c5c87` · `96b39e73` · `3994bb97` 모두 HEAD 조상(`git rev-list --count 885504fb..HEAD` = 4).
