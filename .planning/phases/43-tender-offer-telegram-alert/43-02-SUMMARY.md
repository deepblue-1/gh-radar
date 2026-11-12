---
phase: 43-tender-offer-telegram-alert
plan: 02
subsystem: supabase · workers/dart-alert
status: complete
tags: [supabase-rpc, pgtap, lease, outage, contract-test]
requires:
  - 43-01 (표 dart_alerts · dart_alert_state · RPC 5 · lap.ts 타입 InsertItem · InsertedRow · ClaimedRow · LapDeps)
provides:
  - dart_alert_lease_acquire 인계 동작(reclaimed · expired 채움)
  - dart_alert_claim 송신 기한 90초 · 같은 보유자 재차례(반환 stale)
  - RPC dart_alert_outage(p_holder text, p_action text, p_reason text DEFAULT NULL) RETURNS jsonb
  - RPC dart_alert_ops_stats(p_days integer DEFAULT 1) RETURNS jsonb
  - src/db.ts (LeaseLostError · LeaseResult · DartAlertState · OutageAction · DartAlertDb · createDartAlertDb · LEASE_RESULT_KEYS · INSERTED_ROW_KEYS · CLAIMED_ROW_KEYS · OUTAGE_RESULT_KEYS)
  - tests/dbContract.test.ts (어댑터 ↔ 마이그레이션 자동 대조)
affects: [43-05, 43-06, 43-07, 43-08]
tech-stack:
  added: []
  patterns:
    - "새 임대 보유자가 같은 함수 안에서 오늘 sending 되돌림 · 지난 날 닫기(상태 행 FOR UPDATE)"
    - "sending 동안 next_attempt_at = 송신 기한 — 기한 지난 내 sending 을 pending 과 같은 순서로 다시 준다"
    - "장애 짝 상태는 상태 행 잠금 후 판정하는 open · notice · close 한 RPC"
    - "계약 테스트가 저장소 마이그레이션 파일을 직접 파싱해 rpc 이름 · 인자 키 · 반환 형 · 반환 키 · 상태 칸 대조"
key-files:
  created:
    - workers/dart-alert/src/db.ts
    - workers/dart-alert/tests/dbContract.test.ts
  modified:
    - supabase/migrations/20261113200000_dart_alert.sql
    - supabase/tests/dart_alert.test.sql
decisions:
  - "인계 되돌림은 attempts 를 바꾸지 않는다(흔적 last_error 만) — 다시 차례가 올 때 claim 이 +1 한다"
  - "outage notice 는 열려 있고 pending 일 때 한 번만 적는다(sent 뒤 failed 로 덮어 「다시 동작」 이 사라지는 일 방지) · 반환 {noticed}"
  - "outage open 이 pending 을 다시 열 때 사유는 처음 것을 둔다"
  - "ops_stats 기간은 접수일 rcept_dt(KST) 기준 · by_status 는 다섯 상태를 0 포함 항상 싣는다"
  - "워커가 읽는 반환 키 목록은 src/db.ts 에 두고 lap.ts 타입 키가 빠지면 tsc 가 실패하게 묶었다(tests 는 tsconfig include 밖)"
  - "DB 오류 메시지는 함수 이름 · code · message 200자만 — PostgREST details · hint 는 버린다(행 값이 실릴 수 있음)"
metrics:
  duration: 11m
  completed: 2026-11-12
  tasks: 3
  files: 4
estimate:
  tokens: 60000
actuals:
  tokens: 16264
  tasks: 3
  commits: 6
plan_head_before: 9fc6528abf4304435375d6c5d0a62a52895d0d61
plan_head_after: a0186c47688caf1998d1cd7573ed0137db736373
---

# Phase 43 Plan 02: 공시 알림 DB 받침 완성 Summary

**새 임대 보유자가 끊긴 송신을 이어서 보내고(오늘 sending → pending) · 같은 임대 안에서 결과 기록이 실패한 건도 90초 송신 기한 뒤 다시 차례로 나오며 · 지난 날 미송신은 expired 로 닫히고 · 장애 「멈췄습니다」/「다시 동작」 짝이 DB 한 행으로 정해지며, 워커 DB 어댑터 `src/db.ts` 의 rpc 이름 · 인자 키 · 반환 키가 마이그레이션 파일과 자동 대조로 묶였다.**

## 수행 결과

| Task | 이름 | 커밋 | 파일 |
|------|------|------|------|
| 1 (RED) | pgTAP 절 R — 인계 되돌림 · 지난 날 닫기 · 송신 기한 | 2e156de3 | supabase/tests/dart_alert.test.sql |
| 1 (GREEN) | lease_acquire 인계 · claim 송신 기한 90초 | 9b8ae255 | supabase/migrations/20261113200000_dart_alert.sql |
| 2 (RED) | pgTAP 절 O · ST + S · P 확장 | f1536db8 | supabase/tests/dart_alert.test.sql |
| 2 (GREEN) | dart_alert_outage · dart_alert_ops_stats | 01dd25d4 | supabase/migrations/20261113200000_dart_alert.sql |
| 3 (RED) | 어댑터 ↔ 마이그레이션 계약 테스트 | 3989efe4 | workers/dart-alert/tests/dbContract.test.ts |
| 3 (GREEN) | 워커 DB 어댑터 src/db.ts | a0186c47 | workers/dart-alert/src/db.ts |

### 검증 실제 출력

- Task 1 `<verify>`: pgTAP `1..121` · ok 121 · `# RESULT: PASS`(exit 0)
- Task 2 `<verify>`: pgTAP `1..173` · ok 173 · not ok 0 · `# RESULT: PASS`(exit 0) — 마이그레이션 138개를 일회용 로컬 컨테이너(`public.ecr.aws/supabase/postgres:17.6.1.104`)에 재생, 원격 접촉 0
- Task 3 `<verify>`: `tests/dbContract.test.ts (8 tests)` · `tests/tracer.test.ts (2 tests)` → 10 passed · `tsc --noEmit` 0 오류 · `DB-ADAPTER-OK`
- 수용 기준 grep: migration `reclaimed_after_takeover` 3 · `'expired'` 3 · `reclaimed_stale_claim` 3 · `90 seconds` 1 · `CREATE OR REPLACE FUNCTION public.dart_alert_outage` 1 · `…dart_alert_ops_stats` 1 · `GRANT EXECUTE ON FUNCTION public.dart_alert_` 7 · `opendart_list` 4 / test `reclaimed_after_takeover` 4 · `reclaimed_stale_claim` 3 / db.ts `createDartAlertDb` 1 · `LeaseLostError` 1 · RPC 이름 줄 6 · `"55000"` 1 / dbContract `_dart_alert.sql` 4 · 이름 붙은 테스트 1
- 헛통과 점검(임시 변경 후 원복 · 커밋 안 함): db.ts 의 `p_retry_in_s` 를 `p_retry_s` 로 바꾸면 이름 붙은 테스트 `어댑터의 rpc 이름과 인자 키가 마이그레이션 함수 시그니처와 같다` 만 실패 · `INSERTED_ROW_KEYS` 에서 `late` 를 빼면 `error TS2344: Type '"late"' does not satisfy the constraint 'never'`

## RPC 반환 키(43-05 · 43-06 · 43-07 이 읽는 계약)

| RPC | 반환 | 키 |
|-----|------|----|
| `dart_alert_lease_acquire(p_holder, p_ttl_seconds, p_last_ok DEFAULT NULL)` | jsonb | `held` · `fresh` · `reclaimed`(오늘 sending → pending 수) · `expired`(지난 날 닫은 수) — 연장 · 거절이면 둘 다 0 |
| `dart_alert_claim(p_holder, p_limit)` | jsonb 배열 | 43-01 열 키 + `stale`(기한 지난 내 sending 을 다시 줬으면 true) |
| `dart_alert_outage(p_holder, p_action, p_reason DEFAULT NULL)` | jsonb | open `{opened: true, since}` · `{opened: false}` / notice `{noticed: bool}` / close `{closed: true, notify, since}` · `{closed: false}` |
| `dart_alert_ops_stats(p_days DEFAULT 1)` | jsonb | `calls_today` · `strikes_today` · `by_status`{pending · sending · sent · seeded · expired} · `by_watch` · `late_count` · `latency_p50_s` · `latency_p90_s` · `outage`{since · reason · notice} · `last_ok` · `lease_holder` |

- 흔적 문구: 인계 되돌림 `last_error = 'reclaimed_after_takeover'` · 같은 보유자 재차례 `last_error = 'reclaimed_stale_claim'`
- 오류: outage 보유자 아님(만료 포함) `55000` · 모르는 action · notice 값이 sent/failed 밖 · notice 값 없음 `22023`
- 90초 근거(머리 주석): 한 차례 최대 5건 × (텔레그램 제한 시간 10초 + 간격 1초) + RPC 왕복 < 90초

## `src/db.ts` 메서드 ↔ RPC

| 메서드 | RPC / 표 | 인자 키 | 반환 |
|--------|----------|---------|------|
| `leaseAcquire(holder, ttlS, lastOk?)` | `dart_alert_lease_acquire` | `p_holder` · `p_ttl_seconds` · (`p_last_ok` — lastOk 있을 때만) | `LeaseResult`(네 키 형 확인) |
| `leaseRelease(holder)` | `dart_alert_lease_release` | `p_holder` | boolean(아니면 Error) |
| `readState()` | 표 `dart_alert_state` `id = 1` · `maybeSingle` | 칸 `last_ok, outage_since, outage_notice` | `DartAlertState { lastOk, outage: { since, notice } }` |
| `insert(items, seed)` | `dart_alert_insert` | `p_holder` · `p_items` · `p_seed` | 배열 그대로(`InsertedRow[]`) |
| `claim(limit)` | `dart_alert_claim` | `p_holder` · `p_limit` | 배열 그대로(`ClaimedRow[]` · 실행 시 `stale` 포함) |
| `mark(rceptNo, r)` | `dart_alert_mark` | `p_holder` · `p_rcept_no` · `p_ok` · `p_message_id` · `p_error` · `p_retry_in_s` | boolean(아니면 Error) |
| `outage(action, reason?)` | `dart_alert_outage` | `p_holder` · `p_action` · (`p_reason` — 있을 때만) | jsonb 객체 그대로 |

- `p_holder` 는 leaseAcquire · leaseRelease 는 인자, 나머지는 `createDartAlertDb(supabase, holder)` 의 holder.
- 오류: code `"55000"` → `LeaseLostError`(name 고정 · 메시지에 holder 없음) · 그 밖 → `{함수} 실패 ({code}): {message 200자}`. rpc 가 던지는 오류도 같은 안전 필드로 바꾼다.

## pgTAP 단언 수

`plan(173)` — S 10(+S9 · S10) · L 23 · I 12 · C 10(C4 에 stale 키) · M 16 · P 32(+두 RPC × 세 역할 6 · ops_stats STABLE 1) · R 27 · O 27 · ST 16. 로컬 Docker 로 실제 실행.

## 계약 테스트 단언(dbContract · 8 it)

1. `_dart_alert.sql` 파일 정확히 1개 2. 파서 자기 점검(dart_alert 함수 ≥ 7 · 워커 여섯 + ops_stats 포함 · 상태 칸 ≥ 1 · `p_retry_in_s → p_retry_s` 변조 기록 어긋남 ≥ 1 · 없는 함수 어긋남 1) 3. 이름 붙은 테스트 — rpc 이름 집합 = 여섯 · 모두 마이그레이션에 있음 · `expect(mismatches).toEqual([])` · 선택 인자 키 유무 · p_holder · insert/claim/mark 인자 그대로 4. 반환 형 jsonb/boolean 5. 반환 키가 마지막 정의 본문에 `'키'` 로 있음(빠진 목록 `[]`) · stale 포함 6. readState 표 · `id = 1` · 고른 칸 ⊆ 표 칸 · 대본 행 변환 두 갈래 7. 55000 → LeaseLostError(insert · claim · mark · outage) · 22023 은 일반 Error 이고 holder · 접수번호 · items 내용 없음 8. release · mark 비 boolean → Error · insert · claim 대본 배열 그대로 · 나머지 반환 그대로

## TDD Gate Compliance

세 task 모두 RED `test(43-02)` → GREEN `feat(43-02)` 순서. REFACTOR 없음. RED 증거 기록은 `.gsd/red-43-02/`(gitignore) — 저장소에 넣지 않았다.

- **Task 1 RED**: 기존 마이그레이션 그대로 실행 → `1..121` 전부 실행 · 107 ok · 14 not ok · exit 1. 대상 `R1 빈 임대에서 A 획득 → 오늘 sending 2 되돌림 · 지난 날 2 닫힘` 실패. classifier `RED_EVIDENCE_OK / target_test_failed`. semanticAssessment: 실패 14개는 모두 새 동작(C4 stale 키 · 되돌림 · 닫기 · 송신 기한 · stale 재차례) 단언이고, 통과한 R 단언은 새 동작에 기대지 않는 것(attempts 그대로 · sent/seeded 그대로 · 연장/거절 무변화)뿐이다.
- **Task 2 RED**: 두 함수가 없으면 psql 이 첫 호출에서 멈추므로(43-01 과 같은 invalid_record 위험), 저장소 밖 뼈대(`{}` 만 돌려주는 동작 없는 함수 2 · 권한 없음)를 러너 `--with` 로 얹었다 → `1..173` 전부 실행 · 130 ok · 43 not ok. 대상 `O1 장애 없음 → open → opened true · since now` 실패. classifier `RED_EVIDENCE_OK / target_test_failed`. semanticAssessment: 실패 43개는 O · ST 동작 · 두 함수 권한 · STABLE 단언이고 구문 · 적재 오류 없음.
- **Task 3 RED**: `src/db.ts` 가 없으면 import 적재 오류라, 동작 없는 임시 뼈대(이름만 내보내고 rpc 를 부르지 않음 · 커밋 전 삭제)를 두고 실행. 첫 기록은 vitest `tap-flat` 리포터가 여러 줄 기대값을 들여쓰기 없이 내보내 classifier 가 `INVALID_RED / invalid_record`(Non-TAP data · Malformed TAP)로 거절 → 같은 테스트를 JUnit XML 리포터로 다시 돌려 report 경로 · 실행 시작 · 수정 시각과 함께 제출 → 8 실행 · 2 pass · 6 fail · `RED_EVIDENCE_OK / target_test_failed`. 대상 `어댑터의 rpc 이름과 인자 키가 마이그레이션 함수 시그니처와 같다` 가 `expected [] to deeply equal [ 'dart_alert_claim', …(5) ]` 로 실패. 통과 2개는 어댑터와 무관한 것(마이그레이션 파일 1개 · 반환 형 파싱)이다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 정확성] 반환 키 목록을 테스트가 아니라 `src/db.ts` 에 두고 타입으로 묶음**
- **Found during:** Task 3
- **Issue:** 플랜은 목록을 테스트 안 상수로 두고 「타입에 있는 키가 빠지면 typecheck 실패」 를 요구했는데, `workers/dart-alert/tsconfig.json` 의 `include` 가 `src` 뿐이라 테스트 파일의 타입 단언은 `pnpm run typecheck` 가 보지 않는다 — 문장대로면 묶음이 실제로는 작동하지 않는다.
- **Fix:** `LEASE_RESULT_KEYS` · `INSERTED_ROW_KEYS` · `CLAIMED_ROW_KEYS`(stale 포함) · `OUTAGE_RESULT_KEYS` 를 `src/db.ts` 에서 내보내고 `AssertNever<Exclude<keyof T, L[number]>>` 로 묶었다. 테스트는 이 목록을 가져와 마이그레이션 본문과 대조한다. `late` 를 빼 보는 임시 변경으로 TS2344 실패를 확인했다.
- **Files modified:** workers/dart-alert/src/db.ts · workers/dart-alert/tests/dbContract.test.ts
- **Commit:** 3989efe4 · a0186c47

**2. [Rule 2 - 정확성] outage notice 를 한 번만 적음**
- **Found during:** Task 2
- **Issue:** 플랜은 「열려 있을 때만 기록」 이라 했는데, 그대로면 `sent` 뒤 늦은 `failed` 가 덮어 「다시 동작」(notify)이 사라질 수 있다.
- **Fix:** 열려 있고 `pending` 일 때만 적고 `{noticed: bool}` 을 돌려준다(O8 · O12 로 잠금).
- **Commit:** f1536db8 · 01dd25d4

**3. [Rule 3 - 막힘] Task 3 RED 증거 리포터 교체**
- 위 TDD Gate Compliance 참고 — vitest TAP 리포터 출력이 classifier 형식에 맞지 않아 JUnit XML 로 다시 돌렸다. 커밋된 파일에는 영향 없음.

### 이름 · 표기

- 운영 수치 pgTAP 절 이름을 플랜의 「S」 대신 **ST** 로 적었다 — 43-01 의 모양 절이 이미 S(S1 ~ S8)를 쓰고 있어 섞이지 않게. 모양 절에는 두 함수 존재(S9 · S10)를 더했다.
- outage 의 notice 반환 키 `noticed` 는 플랜 behavior 에 없던 키다(open · close 의 키는 플랜 그대로). 워커가 읽는 키 목록(`OUTAGE_RESULT_KEYS`)에는 넣지 않았다 — 43-05 가 읽게 되면 목록에 더하면 계약 테스트가 함께 대조한다.

## Known Stubs

없음. (43-01 이 남긴 `dart_alert_lease_acquire` 의 `reclaimed` · `expired` 항상 0 은 이 플랜에서 채웠다.)

`ClaimedRow` 타입에는 아직 `stale` 이 없다 — lap.ts 는 43-09 와 같은 웨이브라 이 플랜이 고치지 않는다(frontmatter prohibitions). 실행 시 어댑터는 `stale` 을 그대로 넘기고, 43-06 이 타입에 더한다(`CLAIMED_ROW_KEYS` 에는 이미 있다).

## Threat Flags

없음 — 새 RPC 두 개도 서비스롤 전용(PUBLIC · anon · authenticated REVOKE + service_role GRANT · pgTAP P 로 잠금). 워커 어댑터는 아직 진입점에 결선되지 않았다(43-05).

## 남은 것 · 확인 못 한 것

- 원격 Supabase · 진짜 PostgREST 에는 적용 · 호출하지 않았다(`db push` · 배포는 43-08 메인 세션). 계약 테스트는 가짜 클라이언트 + 마이그레이션 파일 파싱이라, PostgREST 의 실제 함수 해석(이름 붙은 인자 매칭)은 43-08 의 첫 원격 호출에서 처음 확인된다.
- 두 실행이 동시에 outage 를 판정하는 경합은 pgTAP 로 재현하지 않았다(한 트랜잭션 테스트). 보장 근거는 임대 보유자 확인 + 상태 행 `FOR UPDATE` 다.
- 테스트 파일은 tsc typecheck 대상이 아니다(43-01 과 같음) — vitest 실행으로만 검증.
- vitest 는 `workers/dart-alert` 만 돌렸다(전체 저장소 · Playwright 미실행 — 동시 세션 메모리 규칙).

## Self-Check: PASSED

- 파일 4개 존재 · 커밋 2e156de3 · 9b8ae255 · f1536db8 · 01dd25d4 · 3989efe4 · a0186c47 이 HEAD 조상 · STATE.md · ROADMAP.md · lap.ts 변경 없음
