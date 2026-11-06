---
phase: 40-fill-push-notification
plan: 01
subsystem: database
status: complete
tags: [supabase, postgres, pgtap, push, rls, rpc]
requires: []
provides:
  - "표 dma_push_devices · dma_push_chains · dma_push_log · dma_push_deliveries"
  - "RPC dma_push_device_upsert · dma_push_devices_for_user · dma_push_device_disable · dma_push_device_delete · dma_push_report"
affects: [40-05, 40-06, 40-07, 40-12]
tech-stack:
  added: []
  patterns:
    - "서비스롤 전용 표 잠금(RLS + 정책 0 + PUBLIC/anon/authenticated REVOKE + service_role GRANT)"
    - "RPC 반환 jsonb 를 shared 타입 camelCase 키로 직접 조립(시각 = UTC ISO `…Z`)"
    - "pgTAP RED 는 --with 시그니처 스텁(커밋 안 함)으로 단언 수준 실패를 얻는다"
key-files:
  created:
    - supabase/migrations/20261107100000_dma_push_tables.sql
    - supabase/tests/dma_push_devices.test.sql
    - .planning/phases/40-fill-push-notification/tdd-evidence/40-01-task2-red.json
  modified: []
decisions:
  - "토큰 인계 DELETE 는 「같은 토큰 ∧ (이 사용자, 이 기기 키) 밖」 전부 — 다른 사용자뿐 아니라 같은 사용자의 옛 기기 키(localStorage 초기화)도 정리된다"
  - "dma_push_report 는 모양이 어긋난 원소(객체 아님 · uuid 아님 · platform/result 값 밖)도 없는 log_id 처럼 건너뛴다 — 한 원소 때문에 묶음 전체가 실패하지 않게"
  - "반환 시각은 to_char(… AT TIME ZONE 'UTC', …\"Z\") 로 세션 TimeZone 과 무관한 JS toISOString 꼴"
  - "deliveries IDENTITY 시퀀스도 PUBLIC/anon/authenticated REVOKE · service_role USAGE (20261028200100 선례)"
metrics:
  duration: "약 25분"
  completed: 2026-11-07
estimate:
  tokens: 70000
  tasks: 2
actuals:
  tokens: 12100
  tasks: 2
  commits: 3
plan_head_before: 617542dbe56857851fce6e94129cbb2ba7c39eab
plan_head_after: 32695c86f225afb216a5a694f09cbae38cd7412e
---

# Phase 40 Plan 01: 푸시 저장소 바닥 Summary

체결 푸시의 DB 바닥 — 기기 토큰(전역 UNIQUE 토큰 인계) · 체인 상태 · 송신 로그 · 전달 결과 표 4개와, server 가 부를 기기 RPC 4개 · relay 가 부를 결과 보고 RPC 1개를 서비스롤 전용으로 한 마이그레이션에 고정하고 pgTAP 48단언으로 잠갔다.

## 최종 마이그레이션 이름

`supabase/migrations/20261107100000_dma_push_tables.sql` — 계획 이름 그대로. 시작 때 워크트리 · master 의 가장 늦은 버전은 `20261106400000_launch_queue_inputs_alive.sql` 이라 바꿀 필요가 없었다. 40-05 는 이보다 큰 버전(계획 `20261107100100`)을 쓴다.

## RPC 시그니처 5개 (전부 SECURITY INVOKER · `SET search_path = public, pg_temp` · EXECUTE (anon, authenticated, service_role) = (f, f, t))

| RPC | 반환 | 동작 |
|---|---|---|
| `dma_push_device_upsert(p_user_id uuid, p_device_key text, p_platform text, p_token text, p_label text)` | jsonb `PushDevice` | 같은 토큰의 다른 행 삭제 → (user_id, device_key) upsert · enabled = true · last_seen_at = now() · label 80자 자름. p_user_id NULL 이면 예외 |
| `dma_push_devices_for_user(p_user_id uuid)` | jsonb `PushDevice[]`(없으면 `[]`) | last_seen_at DESC |
| `dma_push_device_disable(p_user_id uuid, p_device_key text)` | boolean | 그 사용자 · 그 키만 enabled = false(토큰 유지). 남의 · 없는 키 false |
| `dma_push_device_delete(p_user_id uuid, p_device_key text)` | boolean | 그 사용자 · 그 키 행만 삭제. 남의 · 없는 키 false |
| `dma_push_report(p_results jsonb)` | jsonb `{recorded, removed}` | 원소 `{log_id, device_id, platform, token, result, http_status, reason}` 마다 deliveries 1행(reason 200자) · `token_removed` 는 기기 id ∧ 토큰 일치 행만 삭제 · 없는 log_id 와 모양 어긋난 원소는 건너뜀 |

`PushDevice` 원소 키(40-02 shared 와 1:1): `deviceKey` · `platform` · `label` · `enabled` · `lastSeenAt` · `createdAt` — `token` 키 없음(pgTAP 로 키 집합 잠금).

## 표 4개

- `dma_push_devices` — `UNIQUE (user_id, device_key)` 제약 이름 `dma_push_devices_user_device_key` · `UNIQUE (token)` 제약 이름 `dma_push_devices_token_key` · `enabled` 기본 false · 부분 색인 `idx_dma_push_devices_enabled_user (user_id) WHERE enabled`(40-05 수신자 조회용).
- `dma_push_chains` — PK (gateway, trade_date, account_no, chain_key) · `sent_rank` 1~3 · `sent_stage` 9값 CHECK.
- `dma_push_log` — id uuid · `dma_push_log_chain_stage_key UNIQUE (gateway, trade_date, account_no, chain_key, stage)` · stage 7값 · outcome `sent|stale|suppressed` · facts jsonb.
- `dma_push_deliveries` — id IDENTITY · log_id FK(ON DELETE CASCADE) · device_id FK 없음 · result `ok|failed|token_removed` · token 칸 없음.

## pgTAP

- `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_push_devices.test.sql` → `1..48` · 48 ok · `# RESULT: PASS` (116 마이그레이션 재생).
- 회귀 `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_journal_apply.test.sql` → `1..96` · 96 ok · `# RESULT: PASS`.

## Tasks

| Task | 이름 | 커밋 | 파일 |
|---|---|---|---|
| 1 (tracer) | 표 4개 + 「이 기기 켜기」 · 목록 RPC + 스모크 13단언 | `147a2e10` | 마이그레이션 · pgTAP |
| 2 RED | 끄기 · 지우기 · 결과 보고 · 토큰 인계 · 권한 단언 35개 추가 | `1f78a896` | pgTAP · RED 증거 |
| 2 GREEN | RPC 3개 구현 | `32695c86` | 마이그레이션 |

Tracer 게이트: 자동 모드 아님 · `end-of-phase` + 자동 verify → 재실행 PASS 확인 후 확장.

## TDD Gate Compliance

- **RED** `1f78a896` — `bash scripts/verify-dma-orders-price-check.sh --with <scratchpad>/red_stubs.sql --test supabase/tests/dma_push_devices.test.sql` · exit 1 · 대상 `(U1, K1…1111 끄기) true` = not ok 24 · 19/48 실패 · 분류기 `RED_EVIDENCE_OK`(`target_test_failed`). 증거 `.planning/phases/40-fill-push-notification/tdd-evidence/40-01-task2-red.json`.
  - semanticAssessment: 대상 단언이 실제로 실행돼 계획한 값(true)에서 NULL 로 실패 — 원인은 구현 부재. 설치 · 구문 · 픽스처 오류 없음. 통과 29개는 Task 1 몫 · 토큰 인계(Task 1 upsert 가 이미 구현) · has_function(스텁 존재).
  - 첫 시도(스텁 없음)는 미구현 함수 호출이 psql 을 중단시켜 TAP 가 불완전 → 분류기 `INVALID_RED (invalid_record)`. Go 의 「컴파일 스텁」 과 같은 취지로 본문 없는 시그니처 스텁 3개를 러너 `--with` 로만 얹어 재실행했다(스텁은 커밋하지 않음). TAP 스트림 밖 줄(러너 배너 · `finish(true)` 의 ERROR)은 기록의 `consoleOther` 에 따로 보존.
- **GREEN** `32695c86` — 48/48 PASS.
- **REFACTOR** — 없음(정리할 것 없음).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 견고성] dma_push_report 가 모양 어긋난 원소를 건너뛴다**
- **Found during:** Task 2
- **Issue:** 계획은 「없는 log_id 원소는 건너뜀」 만 명시. uuid 아닌 log_id/device_id 나 값 밖 platform/result 는 캐스트 · CHECK 예외로 묶음 전체를 실패시킨다.
- **Fix:** 객체 아님 · uuid 아님 · platform/result 값 밖 원소도 건너뜀(recorded 에 안 셈). `p_results` 가 배열이 아니면 `{recorded 0, removed 0}`.
- **Files modified:** supabase/migrations/20261107100000_dma_push_tables.sql
- **Commit:** `32695c86`

**2. [Rule 2 - 권한] deliveries IDENTITY 시퀀스 권한 명시**
- **Found during:** Task 1
- **Fix:** `dma_push_deliveries_id_seq` 를 PUBLIC/anon/authenticated REVOKE · service_role `USAGE, SELECT` (계획은 「시퀀스 USAGE 도 service_role 에」 만 적음 — REVOKE 는 20261028200100 선례).
- **Commit:** `147a2e10`

### 계획보다 넓힌 테스트

- Task 2 behavior 밖 단언 추가: 같은 사용자 새 기기 키 + 같은 토큰 → 옛 키 행 정리 · `col_default_is enabled false` · upsert 반환 키 집합 · reason 200자 자름 · 새 표 RLS 켜짐 · 정책 0. 모두 계획 truths 안의 성질이다.

## Known Stubs

없음.

## Self-Check: PASSED

- FOUND: supabase/migrations/20261107100000_dma_push_tables.sql
- FOUND: supabase/tests/dma_push_devices.test.sql
- FOUND: .planning/phases/40-fill-push-notification/tdd-evidence/40-01-task2-red.json
- FOUND: 147a2e10 · 1f78a896 · 32695c86 (HEAD 조상)
