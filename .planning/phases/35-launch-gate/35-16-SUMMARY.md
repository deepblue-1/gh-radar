---
phase: 35-launch-gate
plan: 16
subsystem: relay
tags: [relay, flatbuffers, admin-conn, gh-trade-43, launch-plan]
status: complete

requires:
  - phase: 35-10
    provides: 정식 인계 노트 경로 확인 · kind 17·18 매핑 완료
provides:
  - "ADMIN_OP.SetLaunchPlan(8) · GetLaunchPlan(9) · AdminCommandInput.launchProfile/launchMarket/launchOffsetsUs"
  - "LaunchPlanSnapshot · LaunchPlanEntry · LaunchProfile · LaunchMarket 타입 (relay/src/admin/types.ts)"
  - "MSG.LaunchPlanSnapshot(94) · INBOUND_MSG_TYPES 31종 · hub 명시 case 2곳"
  - "buildAdminCommandReq op 8 분기 · parseLaunchPlanSnapshot"
  - "AdminConn awaiting \"plan\" · request_id 짝짓기 · AdminCommandOutcome.launchPlan"
  - "frames buildLaunchPlanSnapshotFrame · FakeLaunchPlanSnapshotInput · DEFAULT_FAKE_LAUNCH_PLAN_ENTRIES"
affects: [35-17, 35-18, 35-19, phase-36 병합]

actuals:
  tokens: 12900
  tasks: 3
  commits: 3
plan_head_before: ffcfa2c535522a9f5d594bf416877385abccd713
plan_head_after: a4866ba159b1e9754b43fa02b36dcf0b8a11486c

tech-stack:
  added: []
  patterns:
    - "request_id 에코 응답(94)은 순서가 아니라 request_id 로만 짝짓는다 — 짝 없는 프레임은 debug 로그 후 버림"
    - "users.toml 과 무관한 admin op(8·9)는 op 번호로 users_rev 변경 판정(87 대기 · 보정 op 5)에서 뺀다"

key-files:
  created:
    - .planning/phases/35-launch-gate/35-16-SUMMARY.md
  modified:
    - relay/src/admin/types.ts
    - relay/src/admin/admin-conn.ts
    - relay/src/dma/msg-type.ts
    - relay/src/dma/envelope.ts
    - relay/src/hub/subscription-hub.ts
    - relay/tests/helpers/frames.ts
    - relay/tests/admin-conn.test.ts
    - relay/tests/hub.test.ts
    - relay/src/dma/__tests__/envelope.test.ts
    - relay/src/dma/__tests__/codec.test.ts
    - .planning/phases/35-launch-gate/35-CONTEXT.md

key-decisions:
  - "35-16: ADMIN_OP 에 8·9 만 넣고 6·7 자리는 비운다(phase-36 36-02 몫 · master 미병합) — phase-36 병합 세션이 정리"
  - "35-16: 94 updated_at 은 빈 문자열 · 필드 부재 둘 다 \"\" 로 받는다(손으로 만든 파일 · 초깃값 직후)"
  - "35-16: 94 의 entries 원소 null 은 프레임 전체 파손(null) — 한 칸 빠진 계획을 현재 계획으로 내보내지 않는다"
  - "35-16: op 8 은 86 으로 풀리고 뒤따르는 94 는 짝 없음으로 버린다 — 35-17 은 저장 뒤 화면 갱신이 필요하면 op 9 를 다시 부른다"
  - "35-16: op 9 합성 result 의 usersRev = 이 세대 users_rev 또는 0n(모름) — 계획 rev 는 launchPlan.planRev"

requirements-completed: []

duration: 7min
completed: 2026-10-28
---

# Phase 35 Plan 16: 발사 계획 relay 와이어 Summary

**gh-trade 43 의 44 op 8 SetLaunchPlan · op 9 GetLaunchPlan 과 94 LaunchPlanSnapshot 을 relay admin 연결이 말한다 — op 9 는 같은 request_id 의 94(또는 실패 86)로만 풀리고, op 8 뒤의 94 · 늦은 94 는 순서로 짝짓지 않고 버린다.**

## Performance

- **Duration:** 약 7분 (Task 2 · 3 — Task 1 게이트는 앞 세션)
- **Completed:** 2026-10-28
- **Tasks:** 3/3 (Task 1 게이트 = 메인 세션 커밋 ffcfa2c5)
- **Files modified:** 11

## 정식 노트 · 생성물 · 36-02

- **노트:** `docs/inbox/from-gh-trade/261028-launch-plan-contract.md` (from_commit 2e090eb9 · fbs_sync_marker f156cb6f · status open — 노트의 「gh-radar 가 할 일」 1~4 중 3번(어드민 화면)은 35-17~19 몫이라 이 플랜은 닫지 않는다)
- **생성물 sync:** `ffcfa2c5 chore(35-16): gh-trade Phase 43 생성물 SYNC f156cb6f` — 메인 세션이 relay/src/generated 수정 10 + 새 파일 2(`launch-plan-entry.ts` · `launch-plan-snapshot.ts`) 경로 지정 커밋 + `relay/tests/helpers/frames.ts` budget_krw · 손익 4필드 인자 맞춤. **이 43 sync 는 41 sync(36-01 의 7824e51b 계열 — AdminCommandReq budget_krw · fee_ppm · sell_tax_ppm · AdminAccount 비용 칸 · JournalRecord 손익 4필드)를 포함한다**(phase-36 25cb834c 와 같은 모양). executor 는 생성물을 손으로 고치지 않았다(세 커밋 모두 `git show --stat` 에 relay/src/generated 없음).
- **36-02:** master 미병합(phase-36 브랜치 `gsd/phase-36-account-budget` 에만 있음) · 사용자 「36-02 대기 없이」. ADMIN_OP 6·7 자리는 비우고 주석 한 줄 — phase-36 병합 세션이 6·7 을 넣고 그 줄을 지운다. types.ts ADMIN_OP 줄 · envelope.ts 빌더 분기 · admin-conn.test 꼴은 phase-36 worktree 의 36-02 diff 를 읽고(읽기만) 같은 모양으로 썼다(빌더: op 판정 → 가드 → start 앞 조립 → 뒤에서 add).

## 잠정 → 노트 대응표

| 항목 | 잠정(RESEARCH §7.2) | 노트 값 | 같음/다름 |
|---|---|---|---|
| 저장 op | 8 SetLaunchPlan | 8 SetLaunchPlan | 같음 |
| 조회 op | 9 GetLaunchPlan (request_id 만) | 9 GetLaunchPlan (request_id 만) | 같음 |
| 조회 응답 | MsgType 94 LaunchPlanSnapshot · request_id 에코 | 94 · Notice · admin 연결에만 · Envelope vtable 112 · request_id ulong 에코 | 같음 |
| op 9 응답 프레임 | 94 만 | 94 1프레임만(86 없음) | 같음 |
| op 8 응답 | 86 → 변경이면 94 | 86 → 실제 변경이면 94 1프레임 | 같음 |
| 같은 값 재저장 | code 0 · 94 없음 | code 0 「변경 없음」 · plan_rev 불변 · 94 없음 | 같음 |
| 44 필드 | launch_profile · launch_market · launch_offsets_us | string · string · [int] (vtable 20 · 22 · 24) | 같음 |
| 94 필드 | request_id · plan_rev · updated_at · entries | ulong · ulong · string(빈 값 가능) · [LaunchPlanEntry] 4행 고정 순서 Q16/K · Q16/Q · N/K · N/Q · N 길이 1 | 같음 |
| 거부 code | 1 · 10 · 11 | code 1 고정 문구 7종 · 10 저장 실패/미초기화 · 11 관리자 연결 아님 · 구 서버 8/9 = code 1 「알 수 없는 명령입니다」 | 같음 |
| 86 적용 발사(ⓓ) | — | 전용 칸 없음 · 성공 문구 「저장 — 다음 발사부터 적용」 | 같음 |
| N 실제 송신 적용 | — | gh-trade 43-07 병합 뒤(relay 무관) | **다름 1행** — relay 영향 없음 |

## 짝짓기 규칙 (35-17 이 기대할 계약)

- op 9: `awaiting: "plan"` → 같은 request_id 94 = `{ kind: "result", result: { requestId, ok: true, code: 0, message: "", usersRev: 현재 세대 rev ?? 0n }, launchPlan }` · 같은 request_id 86(code 1 · 10 · 11) = `{ kind: "result", result }`(launchPlan 없음 · 즉시) · 5초 무응답 = `timeout` · 끊김 = `offline`.
- op 8: 86 으로 바로 풀린다(`{ kind: "result", result }` · snapshot · launchPlan 없음). 뒤따르는 94 는 짝 없음 → `logger.debug("[admin] 짝 없는 발사 계획 스냅샷 — 버림")`.
- op 8 · 9 는 users_rev 변경 판정 밖 — 87 을 기다리지 않고 보정 op 5 도 보내지 않는다(users_rev null 이어도).
- 서버당 1건 비행(기존 FIFO) 그대로 — 범위 · 조각 수 상한은 서버 설정값(119/120 = Q16 −3000~1000 · 10조각 · N ±2000)이라 relay 는 int32 구조만 보고 그대로 중계.

## Task Commits

1. **Task 1: 게이트** — `ffcfa2c5` (메인 세션 · chore · 생성물 43 sync)
2. **Task 2 (tracer): 조회 op 한 경로** — `70cb71be` (feat)
3. **Task 3: 저장 op 빌더 + 짝짓기 경계 + CONTEXT** — `dcf34d45` (test · RED) → `a4866ba1` (feat · GREEN)

## TDD

- Task 2: RED = admin-conn P35-1 실패(44 op 0 — ADMIN_OP.GetLaunchPlan 없음) → GREEN 동일 커밋(트레이서 1커밋 규칙).
- Task 3: RED 커밋 `dcf34d45` — 실패 4건(envelope op 8 왕복 · RangeError · admin-conn S2 5초 타임아웃 · rev null 보정 op 5) → GREEN `a4866ba1`.

## 테스트

- relay vitest 전체 **59 파일 1684 통과 · 실패 0**(기준선 1670 → +14: admin-conn 5 · envelope 8 · codec 1. hub 2건은 기존 케이스에 94 추가).
- Task 3 verify: envelope · admin-conn · admin-dispatcher · admin-api 4 파일 351 통과 · typecheck · typecheck:tests 통과.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] codec.test INBOUND 크기 단언 30 → 31 · 상한 87 → 94**
- **Found during:** Task 2
- **Issue:** `INBOUND_MSG_TYPES.size === 30` · `≤ 87` 단언이 94 추가로 깨짐(계획 files 목록 밖).
- **Fix:** 31종 · 50~94 로 갱신 + 94 = 생성 enum 단언 1케이스.
- **Files modified:** relay/src/dma/__tests__/codec.test.ts · **Commit:** 70cb71be

**2. [Rule 2 - 검증 보강] hub.test 에 94 를 86/87 케이스에 추가**
- **Found during:** Task 2 (behavior 「hub 두 case 가 94 를 admin 전용으로 버린다」 를 잠글 테스트가 필요)
- **Fix:** 사용자 세션 · quote 연결 두 케이스에 94 프레임 · warn 기대값 추가(unhandledFrameCount 0 유지).
- **Files modified:** relay/tests/hub.test.ts · **Commit:** 70cb71be

**3. [설계 메모] fake-gateway 는 고치지 않았다**
- 94 는 기존 `gateway.sendFrame(sock, buildLaunchPlanSnapshotFrame(...))` 로 주입 — phase-36 이 고친 fake-gateway.ts 와의 병합 충돌을 피한다.

## Known Stubs

None.

## Next Phase Readiness

- 35-17(relay HTTP 라우트 · LaunchPlanService)은 `AdminConn.command({ op: ADMIN_OP.GetLaunchPlan, userId: "" })` · `command({ op: ADMIN_OP.SetLaunchPlan, userId: "", launchProfile, launchMarket, launchOffsetsUs })` 와 `AdminCommandOutcome.launchPlan` 을 쓴다.
- phase-36 병합: types.ts ADMIN_OP 6·7 · envelope.ts buildAdminCommandReq 가드/add 줄이 인접 충돌 — 두 분기를 모두 살리면 된다.
- relay 배포 · push 없음(35-18 메인 세션).

## Self-Check: PASSED

- FOUND: relay/src/admin/types.ts (SetLaunchPlan) · relay/src/dma/envelope.ts (`export function parseLaunchPlanSnapshot(`) · relay/src/admin/admin-conn.ts (`"plan"`) · hub MSG.LaunchPlanSnapshot 2곳
- FOUND commits: 70cb71be · dcf34d45 · a4866ba1 (HEAD 조상) · 70cb71be 에 msg-type.ts · subscription-hub.ts 함께 · relay/src/generated 경로 없음
