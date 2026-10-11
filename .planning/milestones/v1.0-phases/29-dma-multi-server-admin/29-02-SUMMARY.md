---
phase: 29-dma-multi-server-admin
plan: 02
subsystem: relay
status: complete
tags: [relay, flatbuffers, gh-trade-contract, admin, fake-gateway]
requires: []
provides:
  - "relay 생성물 — gh-trade admin 와이어(AdminAccount · AdminCommandReq · AdminCommandResp · AdminUser · AdminUsersSnapshot · MsgType 44/86/87 · Envelope 92/94/96)"
  - "relay/src/admin/types.ts — ADMIN_ROLE · ADMIN_OP · ADMIN_CODE · ADMIN_CODE_NAME · AdminAccount · AdminCommandInput · AdminCommandResult · AdminSnapshotUser · AdminUsersSnapshot"
  - "envelope.ts — buildAdminCommandReq · parseAdminCommandResp · parseAdminUsersSnapshot · buildObserverLoginReq role 0~2"
  - "스텁 게이트웨이 admin 모드 — respondAdminLogin · adminLoginRequests · waitForAdminConnection · adminCommandRequests · onAdminCommand · respondAdminCommand · pushAdminSnapshot · defaultAdminHandler · readAdminCommandRequest"
  - "frames.ts — FakeAdminAccountInput · buildAdminCommandRespFrame · buildAdminUsersSnapshotFrame"
affects: [29-08, 29-11, 29-14]
tech-stack:
  added: []
  patterns:
    - "생성물 + 수기 사본 3곳 + 깨지는 단언 = 한 커밋(PC-12)"
    - "ulong(request_id · users_rev) 은 bigint 그대로 — toNum 미경유"
    - "admin 전용 86/87 은 hub 사용자 세션 · quote 연결 양쪽에 명시 warn case"
key-files:
  created:
    - relay/src/admin/types.ts
    - relay/src/generated/stock-dma/admin-account.ts
    - relay/src/generated/stock-dma/admin-command-req.ts
    - relay/src/generated/stock-dma/admin-command-resp.ts
    - relay/src/generated/stock-dma/admin-user.ts
    - relay/src/generated/stock-dma/admin-users-snapshot.ts
  modified:
    - relay/src/generated/StockDMA.fbs
    - relay/src/generated/stock-dma.ts
    - relay/src/generated/stock-dma/envelope.ts
    - relay/src/generated/stock-dma/msg-type.ts
    - relay/src/dma/msg-type.ts
    - relay/src/dma/envelope.ts
    - relay/src/hub/subscription-hub.ts
    - relay/src/dma/__tests__/codec.test.ts
    - relay/src/dma/__tests__/envelope.test.ts
    - relay/tests/hub.test.ts
    - relay/tests/helpers/frames.ts
    - relay/tests/helpers/fake-gateway.ts
    - relay/tests/fake-gateway.test.ts
    - docs/inbox/from-gh-trade/261006-admin-users-role2-44-86-87.md
decisions:
  - "buildAdminCommandReq 는 password 를 op 1(UpsertUser)일 때만 싣고 그 밖 op 는 빈 문자열 — 호출자 실수로 비밀번호가 와이어에 나가지 않게"
  - "buildAdminCommandReq 는 requestId 가 ulong 범위(0 ≤ id < 2^64) 밖이면 RangeError — 호출자 버그로 본다"
  - "87 파서는 원소 null 을 건너뛰고(인덱스만 warn · 계좌번호 미로깅) 순서를 재정렬하지 않는다(서버 priority 순 보존)"
  - "스텁 defaultAdminHandler op 4 판정 순서는 없는 계좌 8 → 마지막 계좌 12 → BUSY 9"
metrics:
  duration: "약 45분"
  completed: 2026-10-06
estimate:
  tokens: 95000
  tasks: 2
actuals:
  tokens: 27000
  tasks: 2
  commits: 3
commits: 3
plan_head_before: 6f995f1acc36f5931b02863ca249b3cbcce260e7
plan_head_after: b06b894521c01f41672ffa22cbebaf98d8d1879a
---

# Phase 29 Plan 02: gh-trade admin 와이어 받기 Summary

gh-trade Phase 29 확정 스키마(fbs blob 03fc8cbe · SYNC MARKER 92cdfbff)를 relay 에 동기화하고 44 조립 · 86/87 bigint 무손실 파싱 · role 2 로그인 · hub admin 전용 warn case 를 한 커밋으로 넣었다. 스텁 게이트웨이에는 메모리 users 표로 op 1~5 를 흉내 내는 admin 모드를 더했다.

## 동기화 (Task 1 ①)

- 실행: gh-trade worktree `phase-29-admin-users/server` 에서 `RELAY=<이 worktree>/relay ./scripts/sync-relay-schema.sh` (반영 1회). 오케스트레이터 지시대로 RELAY 는 메인 gh-radar 가 아니라 **이 worktree 의 relay** 절대경로.
- 사전 확인: worktree 경로 존재 · `rev-parse HEAD:server/src/protocol/StockDMA.fbs` = `03fc8cbedcd8542e9febf2416fa8bd595aa5d9fd` · `flatc version 25.12.19` · 노트 `status: open`.
- 반영 전 `--check`: 신규/변경 예정 8 · 삭제 없음 · .fbs 사본 갱신 예정. 반영 후 `--check`: **신규/변경 예정 0 개 · 삭제 없음 · .fbs 사본 최신**.
- **실제 sync 출력 경로 (생성 .ts 8 + .fbs 사본 1, 삭제 0):**
  - 신규: `relay/src/generated/stock-dma/admin-account.ts` · `admin-command-req.ts` · `admin-command-resp.ts` · `admin-user.ts` · `admin-users-snapshot.ts`
  - 변경: `relay/src/generated/stock-dma.ts` · `relay/src/generated/stock-dma/envelope.ts` · `relay/src/generated/stock-dma/msg-type.ts`
  - 사본: `relay/src/generated/StockDMA.fbs`
- **SYNC MARKER:** `server-repo-commit` `ea8d9171` → **`92cdfbff`** (synced-date 2026-10-06 · flatc 25.12.19 · source server/src/protocol/StockDMA.fbs).
- 생성 Envelope 슬롯: `addAdminCommandReq` 필드 44(vtable 92) · `addAdminCommandResp` 45(94) · `addAdminUsersSnapshot` 46(96) — 노트와 일치.

## 화이트리스트

- `INBOUND_MSG_TYPES`: **28종 → 30종** (+86 `AdminCommandResp` · +87 `AdminUsersSnapshot`). 44 는 C→S 라 넣지 않음. `OUT_OF_SCOPE_INBOUND_MSG_TYPES` 는 `68, 70, 74, 75, 81, 82` 그대로.
- 응답 대역 상한 단언 85 → 87. hub `#onFrame` · `#onFeedFrame` 에 86/87 명시 warn case(unhandledFrameCount 불변) — 화이트리스트와 같은 커밋 1f9c0328.

## 커밋

| Task | 커밋 | 내용 |
|------|------|------|
| 1 (트레이서) | 1f9c0328 | `feat(29-02): gh-trade admin 와이어 동기화 — 44/86/87 코덱 · role 2 · 화이트리스트` — 생성물 + msg-type · envelope · hub 사본 + types.ts + frames 헬퍼 + 단언 뒤집기(한 커밋) |
| 1 (인박스) | bfc584dc | `docs(29-02): 인박스 admin 와이어 노트 처리 완료` — 노트 `status: done` · `done_commit: 1f9c0328` (그 파일만) |
| 2 | b06b8945 | `test(29-02): 스텁 게이트웨이 admin 모드 — role 2 · 44/86/87 · 메모리 users 흉내` |

트레이서 게이트: 자동 `<verify>` 재실행(sync --check 0 변경 · typecheck · typecheck:tests · Phase 29 필터 12 통과 · 전체 1022 통과) green 확인 뒤 Task 2 로 확장했다.

## 검증

- `pnpm --filter @gh-radar/relay run typecheck` · `typecheck:tests` 통과.
- Task 1 `-t "Phase 29"`: 12 통과(codec 2 · envelope 8 · hub 2). Task 2 `tests/fake-gateway.test.ts`: 27 통과(Phase 29 7건).
- 전체 relay: **36 파일 · 1029 테스트 통과**(Task 1 직후 1022).
- 수용 기준: `AdminCommandReq: 44` · `AdminUsersSnapshot: 87` 각 1 · `toBe(30)` 1 · `export function buildAdminCommandReq` 1 · `export function parseAdminUsersSnapshot` 1 · `role !== 2` 1 · `case MSG.AdminCommandResp` 2 · `export const ADMIN_CODE` 1 · `git log -1 -- relay/src/generated` 과 `-- relay/src/dma/msg-type.ts` 제목 동일 · fake-gateway admin API grep 9 · `export function defaultAdminHandler` 1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] worktree 에 node_modules 없음**
- **Found during:** Task 1 verify
- **Issue:** 새 worktree 라 의존성이 설치돼 있지 않아 shared build · tsc · vitest 실행 불가.
- **Fix:** `pnpm install --frozen-lockfile --offline` — 기존 lockfile 그대로, 새 패키지 추가 0 · 다운로드 0(store 재사용). 추적 파일 변화 없음.

**2. [Rule 1 - Bug] 테스트 클라이언트 `nextFrame` 시간 초과 대기자 누수**
- **Found during:** Task 2 GREEN
- **Issue:** `tests/fake-gateway.test.ts` 의 `connectClient.nextFrame` 이 시간 초과 때 대기자를 배열에 남겨, 다음 프레임(86)을 삼키고 이후 읽기가 한 칸 밀렸다(무응답 단언 뒤 86 → 87 순서 검증 실패).
- **Fix:** 시간 초과 시 대기자를 `waiters` 에서 제거.
- **Files modified:** relay/tests/fake-gateway.test.ts
- **Commit:** b06b8945

**3. [Rule 2 - Critical] 44 조립 requestId 범위 가드**
- **Found during:** Task 1
- **Issue:** ulong 범위 밖 bigint(음수 · 2^64 이상)를 넣으면 FlatBuffers 가 조용히 감싸 엉뚱한 request_id 가 나가 86 짝짓기가 깨진다.
- **Fix:** `buildAdminCommandReq` 가 범위 밖이면 RangeError(비밀 미포함). 테스트 추가.
- **Commit:** 1f9c0328

**4. [계획된 단언 뒤집기] 관찰자 role 거부 테스트** — 기존 `role 0 · 1 밖은 RangeError` 테스트가 2 를 음성 케이스로 쓰고 있어 3 으로 바꿨다(2 는 이제 허용). 플랜 must_haves 의 「3 이상은 여전히 RangeError」 그대로.

### 경로 조정 (오케스트레이터 지시)

- 플랜 본문의 `RELAY=/Users/alex/repos/gh-radar/relay` 와 verify 의 `/Users/alex/repos/gh-radar` 는 이 worktree 경로로 바꿔 실행했다(생성물이 worktree 에 떨어지게). gh-trade worktree `phase-29-admin-users` 가 아직 있고 blob 이 일치해 그 경로에서 돌렸다. gh-trade 저장소는 아무것도 고치지 않았다.

## 인박스

- `docs/inbox/from-gh-trade/261006-admin-users-role2-44-86-87.md` → `status: done` · `done_commit: 1f9c0328`. 본문 무수정.
- gh-trade master 병합 뒤 blob 재대조는 29-25 준비 게이트 소관(예상: 재동기화 불필요 — 오케스트레이터 전달에 따르면 84824b07 이 gh-trade master 에 push 됨; 로컬 gh-trade 메인 체크아웃 HEAD 는 아직 그 전이라 이번에는 worktree 경로 사용).

## Known Stubs

없음. (`defaultAdminHandler` 는 테스트 스텁 게이트웨이의 의도된 흉내이며 운영 코드가 아니다.)

## Self-Check: PASSED

- 파일: relay/src/admin/types.ts · 생성 admin-*.ts 5개 · fake-gateway.ts · 이 SUMMARY — 존재 확인.
- 커밋: 1f9c0328 · bfc584dc · b06b8945 — HEAD 조상 확인.
