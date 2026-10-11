---
phase: 29-dma-multi-server-admin
plan: 14
subsystem: relay
tags: [relay, admin, users-toml, snapshot, journal-access, supabase-rpc, retry]

requires:
  - phase: 29-05
    provides: "RPC dma_admin_apply_snapshot(p_server, p_users_rev bigint, p_users jsonb camelCase) — 서버별 반영 상태 원자 교체"
  - phase: 29-08
    provides: "AdminConn 서버당 admin 연결 · 접속마다 op 5 → 87 · snapshot 이벤트"
  - phase: 29-11
    provides: "dispatcher 는 87 을 DB 에 적재하지 않는다 — 적재는 이 플랜의 sink 몫"
provides:
  - "AdminSnapshotSink(onSnapshot · resetGeneration · forget · close · applied 이벤트) · flattenSnapshot"
  - "87 하나 → 그 서버 JournalAccess.replace(푸시 라우팅 · dma_journal_sync_access) + dma_admin_apply_snapshot(Admin 반영 칩 원천)"
  - "AdminSnapshotEvent 에 연결 세대(generation) 동봉"
  - "supabase-stub: dma_admin_apply_snapshot 경로 · seedJournalApplyRows"
affects: [29-15, 29-21, 29-25]

actuals:
  tokens: 13100
  tasks: 2
  commits: 2
plan_head_before: 746d9a500cb0eb86a62d5b231b81434e66948409
plan_head_after: 3efc7dac1f44ebc7c741e3e6433ef256c945f7fb

tech-stack:
  added: []
  patterns:
    - "서버별 최신 1건 대기 + 지수 백오프 재시도(JournalAccess #sync 규율 복제) — sink 안 서버마다 독립 상태"
    - "신선도 = 연결 세대(generation). users_rev 는 저장만 하고 비교하지 않는다"

key-files:
  created:
    - relay/src/admin/snapshot-sink.ts
    - relay/tests/admin-snapshot-sink.test.ts
  modified:
    - relay/src/admin/admin-conn.ts
    - relay/src/index.ts
    - relay/src/journal/access.ts
    - relay/tests/helpers/supabase-stub.ts

key-decisions:
  - "87 신선도는 연결 세대로만 판정 — 옛 세대의 늦은 87 은 버리고, 같은 세대 안은 도착 순(나중 것이 이긴다), rev 감소(재기동)는 버리지 않는다"
  - "파이프라인 재생성 시 resetGeneration — 새 DmaClient 세대가 1 부터 다시 세므로 옛 눈금이 첫 87 을 버리지 않게 한다"
  - "매핑 원천은 둘(79 관찰자 로그인 · 87 admin) · replace 통째 교체라 나중 것이 이긴다 · 유효 행 0 거부는 access 규율 그대로"
  - "유저 0명 87 도 dma_admin_apply_snapshot 은 보낸다(반영 상태 = 비었다) · 매핑 교체는 거부 + sink warn 1"
  - "빈 userId/accountNo 항목은 DB 적재에서 뺀다 — RPC 가 전체를 거부해 영구 재시도에 갇히는 것을 막는다"
  - "DB 재시도 간격 = journalRetryDelayMs(기본 1s → 2s → 4s … 상한 30s) · 재시도 사이 새 87 이면 최신만"

patterns-established:
  - "relay 87 소비는 AdminSnapshotSink 의 applied 이벤트로 — 29-21(열린 세션 반영)이 구독한다"

requirements-completed: [ADMIN-05]

coverage:
  - id: D1
    description: "87 하나가 그 서버 매핑(푸시 라우팅 · REST 가시성)과 반영 상태 RPC 에 함께 들어가고, Admin 이 더한 계좌의 주문 행이 관찰자 재로그인 없이 그 사용자에게만 푸시된다"
    requirement: "ADMIN-05"
    verification:
      - kind: integration
        ref: "relay/tests/admin-snapshot-sink.test.ts#Admin 이 d1 에 A2 를 더하면 87 하나로 매핑 · REST 가시성 · 반영 상태가 갱신되고, A2 행이 관찰자 재로그인 없이 d1 에게만 간다"
        status: pass
    human_judgment: false
  - id: D2
    description: "적재 규율 — 세대 가드 · 최신만 재시도(지수 백오프) · close/forget 타이머 0 · 빈 스냅샷 · rev 1 복귀 수용 · 파이프라인 재생성 · 서버별 독립 · 빈 식별자 제외 · bigint rev 직렬화 · 로그 위생"
    requirement: "ADMIN-05"
    verification:
      - kind: unit
        ref: "relay/tests/admin-snapshot-sink.test.ts#87 적재 규율 (29-14 T2)"
        status: pass
      - kind: unit
        ref: "pnpm --filter @gh-radar/relay run test (45 files · 1174 tests)"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-10-07
status: complete
---

# Phase 29 Plan 14: 87 적재 — 서버 매핑 갱신 + DB 반영 상태 Summary

**서버가 보낸 87(users.toml 전체) 하나를 그 서버 `JournalAccess.replace`(푸시 라우팅 · `dma_journal_sync_access`)와 `dma_admin_apply_snapshot`(Admin 반영 칩 원천)에 동시에 넣는 `AdminSnapshotSink` — 연결 세대 가드 · 서버별 최신 1건 지수 백오프 재시도.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-10-06T17:21:13Z
- **Completed:** 2026-10-06T17:28:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- 트레이서(실 `ServerPipelines` · 실 `WsFanout` · 스텁 게이트웨이): Admin 이 op 3 으로 d1 에 A2 를 더하면 87 → 매핑 {A1, A2} 동기 갱신 · `dma_journal_sync_access` +1 · `dma_admin_apply_snapshot` +1(`p_users_rev` 숫자 · `p_users` camelCase) · `applied` 이벤트 → 그 뒤 A2 저널 행이 d1 에게만 1프레임, 관찰자 79 는 처음 1건뿐.
- 적재 규율: 옛 세대의 늦은 87 버림 · 같은 세대는 도착 순 · 재기동(rev 5 → 1)도 통째 교체 · RPC 실패 시 지수 백오프로 **최신만** 재시도 · `close()`/`forget()` 뒤 타이머 0 · 서버별 독립.
- `access.ts` 머리 전제 정정 — 매핑 원천이 둘(79 · 87)이고 나중 것이 이긴다(users.toml 핫리로드).

## Task Commits

1. **Task 1: 트레이서 — 87 → JournalAccess.replace + dma_admin_apply_snapshot → 새 계좌 주문 행 푸시** - `4135de49` (feat)
2. **Task 2: 세대 가드 · DB 재시도(최신만) · 빈 스냅샷 · 재접속 전량 교체 · rev 1 복귀** - `3efc7dac` (feat)

## Files Created/Modified

- `relay/src/admin/snapshot-sink.ts` - `AdminSnapshotSink` · `flattenSnapshot` · 서버별 세대 · 대기 · 재시도 상태
- `relay/src/admin/admin-conn.ts` - snapshot 이벤트 페이로드에 `generation` 추가
- `relay/src/index.ts` - sink 생성(첫 `pipelines.sync` 전) · `wirePipeline` 결선(`resetGeneration` + `onSnapshot`) · `onRemoved` → `forget` · 종료 절차 `close`
- `relay/src/journal/access.ts` - 머리 주석: 원천 둘 · 나중 것이 이긴다 · Phase 29 핫리로드(코드 무변경)
- `relay/tests/admin-snapshot-sink.test.ts` - 트레이서 1 + 규율 11
- `relay/tests/helpers/supabase-stub.ts` - `dma_admin_apply_snapshot` 알려진 경로 · `seedJournalApplyRows`

## 원천 둘 규칙 · 재시도 간격

- 매핑 원천: 79(관찰자 로그인 · 접속 때) · 87(admin 연결 · 변경 때 + admin 재접속 op 5). 둘 다 같은 users.toml 의 평탄화이고 `replace` 통째 교체 → **나중 것이 이긴다**. 유효 행 0 이면 access 가 교체를 거부한다(WR-04 그대로).
- 반영 상태 RPC 재시도: `journalRetryDelayMs(failures, backoffDelayMs(1), RECONNECT_MAX_DELAY_MS)` = 1s → 2s → 4s → … 상한 30s. 서버별로 대기 1건만 들고 있고 재시도 사이 새 87 이 오면 갈아 끼운다.

## TDD Gate Compliance (Task 2)

- **RED:** T2 규율 테스트 11건 추가 뒤 실행 — 8건이 계획한 행동 부재로 실패(세대 가드 · 재시도 · close/forget · 빈 스냅샷 warn · resetGeneration · 서버별 독립 · 빈 식별자), 3건은 Task 1 동작의 회귀 잠금으로 통과(같은 세대 순서 · rev 비교 없음 · bigint 문자열). 대상 `세대 가드` 테스트 단독 실행(`-t "세대 가드"` · tap-flat) → `gsd-tools check tdd-red-evidence` = **RED_EVIDENCE_OK (target_test_failed)**. semanticAssessment: 대상이 실행됐고 계획한 단언(apply RPC 2건 ≠ 1건)에서 세대 가드 부재 때문에 실패했다. pino gcp 진단 stdout 1줄은 리포트와 분리 보존.
- **GREEN:** 서버별 상태 · 세대 가드 · 최신만 재시도 · `resetGeneration`/`forget`/`close` 구현 → 12/12 통과, relay 전체 1174 통과.
- **REFACTOR:** 없음.
- 커밋은 플랜 지시(「커밋 2개 · 전체 green 뒤 한 커밋」)대로 Task 2 를 한 커밋으로 남겼다(test/feat 분리 없음).

## Decisions Made

frontmatter `key-decisions` 참고. 핵심: 신선도는 연결 세대뿐(rev 비교 금지 — prohibition 해결, 테스트 「서버 재기동 흉내」 가 잠근다).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `AdminConn` snapshot 이벤트에 세대가 없었다**
- **Found during:** Task 1
- **Issue:** 플랜의 `onSnapshot(serverKey, { generation, snapshot })` 계약에 필요한 `generation` 을 29-08 이벤트가 싣지 않았다.
- **Fix:** `AdminSnapshotEvent` 에 `generation` 추가 · `#onSnapshot` 이 받은 프레임 세대를 실어 emit.
- **Files modified:** relay/src/admin/admin-conn.ts
- **Commit:** 4135de49

**2. [Rule 1 - Bug] 파이프라인 재생성 시 새 연결의 87 이 옛 세대 눈금으로 버려질 수 있었다**
- **Found during:** Task 2
- **Issue:** 같은 키를 재생성하면 새 `DmaClient` 세대가 1 부터 다시 세므로, 옛 벌이 세대 3 까지 갔다면 새 벌의 첫 87 이 「옛 세대」 로 버려진다.
- **Fix:** `resetGeneration(serverKey)` 를 두고 `wirePipeline` 이 결선 전에 부른다. 레지스트리에서 아예 빠진 서버는 `onRemoved` → `forget` 으로 대기 재시도를 버린다(FK 영구 실패 방지). index.ts 는 Task 2 `<files>` 밖이지만 결선이라 같이 고쳤다.
- **Files modified:** relay/src/admin/snapshot-sink.ts, relay/src/index.ts
- **Commit:** 3efc7dac

**3. [Rule 2 - Missing critical] 빈 userId/accountNo 87 항목이 RPC 전체 거부 → 영구 재시도**
- **Found during:** Task 2
- **Issue:** `dma_admin_apply_snapshot` 은 빈 식별자가 하나라도 있으면 교체 전체를 거부한다.
- **Fix:** 그 항목만 빼고 계수만 warn(access.ts 빈 식별자 규율과 같다).
- **Commit:** 3efc7dac

**4. [Rule 3 - Blocking] 테스트 스텁 확장**
- `supabase-stub.ts` 에 `dma_admin_apply_snapshot` 경로(unknownRequests 0 유지)와 `seedJournalApplyRows`(적용 RPC 반환 행 → 푸시 증명)를 더했다. 플랜 files 밖의 테스트 헬퍼다.
- **Commit:** 4135de49

**참고:** 빈 스냅샷의 「warn 1」 은 sink 의 warn 1줄이다. access 의 기존 error 로그(빈 매핑 교체 거부)도 종전대로 함께 남는다.

---

**Total deviations:** 4 auto-fixed (Rule 1 ×1 · Rule 2 ×1 · Rule 3 ×2). **Impact:** 모두 계약 · 정확성에 필요한 것. 범위 확장 없음.

## Issues Encountered

- TDD RED 증거 분류기는 pino 로그가 섞인 stdout 과 vitest TAP 의 여러 줄 diff 를 형식 오류로 봤다 — `LOG_LEVEL=silent` + 대상 단독 실행으로 리포터 출력만 캡처해 통과시켰다.

## Verification

- `pnpm --filter @gh-radar/shared build` · relay `typecheck` · `typecheck:tests` 통과.
- `vitest run tests/admin-snapshot-sink.test.ts tests/journal-push.test.ts` 26/26 · relay 전체 45 파일 1174/1174.
- 스키마 푸시: 해당 없음. spec-less probe fallback: 건너뜀(visible skip — 29-01 과 같다). 보안검사: `security_enforcement: false` — 생략. 배포 · push 없음.

## Next Phase Readiness

- 29-15(화면 칩)는 `dma_server_snapshots` · `dma_server_user_accounts` 가 이 sink 로 채워지는 것을 전제로 읽으면 된다. 29-21 은 `adminSnapshotSink.on("applied", …)` 를 구독한다(index.ts 의 `adminSnapshotSink` 상수).
- Ready for 29-15.

## Self-Check: PASSED
