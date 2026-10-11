---
phase: 29-dma-multi-server-admin
plan: 42
subsystem: relay
tags: [relay, dma, session-routing, g-1, admin-session-sync, d-10-removal, tdd]

requires:
  - phase: 29-33
    provides: "AccountOrderServers · createOrderServerRouting(serversFor · ownerOf) · SessionManager.acquireOn · DmaSession owns(소유 뷰 allowedAccounts · 원본 declaredAccounts) · WsFanout serversFor 결선"
  - phase: 29-21
    provides: "AdminSessionSync — 87 applied → 열린 세션 선언 · 제외 · 빠진 세션 열기"
provides:
  - "AdminSessionSync 87 대조 = 세션 원본(declaredAccounts) · 빠진 서버 세션 열기(#openMissingServerSessions — 열기만, 전략 끄기 없음)"
  - "fanout · index 에서 「주문 서버 바뀜」 order.server 송신 경로 전부 제거(인증 직후 · 레지스트리 변경 · refreshUserSessions)"
  - "order-journal-source.test.ts — OrderServerJournal 원천 ⑧ · ⑧-b · ⑧-c 보존 + 표식 프레임 0 케이스"
  - "SessionManager — 사용자 × 증권사 색인 제거 · acquireFor = #target(broker) → acquireOn 위임 · primaryOf = 처음 만든 KB 세션 → 첫 세션"
affects: [29-35, 29-36, 29-39, 29-43, 29-44]

actuals:
  tokens: 22800
  tasks: 3
  commits: 6
plan_head_before: 2a718412a78773494f0b8546da7ff5218260a9a3
plan_head_after: d36ef698af0db6bc19a93842f9d3b87cc2df65cc

tech-stack:
  added: []
  patterns:
    - "세션 키 = (유저, 서버) 하나 — 증권사 경로(acquireFor)도 대상만 골라 acquireOn 에 위임(재사용 규율 사본 없음)"
    - "87 대조는 원본(declaredAccounts), 주문 · 프레임 거름은 소유 뷰(allowedAccounts) — 두 목록의 역할 분리"
    - "폐지된 deps 를 타입 밖 값으로 넣어도 동작 0 임을 테스트로 고정(옛 결선 잔재가 배지를 되살리지 않게)"

key-files:
  created:
    - relay/tests/order-journal-source.test.ts
  modified:
    - relay/src/admin/session-sync.ts
    - relay/src/ws/fanout.ts
    - relay/src/index.ts
    - relay/src/dma/session-manager.ts
    - relay/tests/admin-session-sync.test.ts
    - relay/tests/session-routing.test.ts
    - relay/tests/session-manager.test.ts

key-decisions:
  - "29-42: 87 대조(빠진 계좌 제외)는 세션 원본 declaredAccounts 기준 — 소유 뷰로 고르면 다른 서버에 넘긴 계좌가 users.toml 에서 빠져도 원본에 남는다"
  - "29-42: 87 반영 경로(session-sync)는 빠진 서버 세션을 열기만 하고 전략 끄기(14) · VI(11)를 보내지 않는다 — gh-trade-84 ②(가) 끄기는 지정 변경 시점의 29-36 · 29-44 몫"
  - "29-42: 「주문 서버 바뀜」 order.server 송신을 relay 에서 전부 제거 — 주문 서버 변경은 29-36 즉시 재수립(옛 서버 전략 끄기 → 재수립 → 25→66 재동기). shared 타입 정의는 webapp 소비자와 함께 29-39"
  - "29-42: SessionManager 사용자 × 증권사 색인 제거 — acquireFor 는 #target(broker) → acquireOn 위임, primaryOf = 처음 만든 KB 세션 → 첫 세션(선호 규칙은 29-35)"
  - "29-42: TDD GREEN 커밋은 플랜 예시(fix/refactor)가 아니라 오케스트레이터 규약대로 feat(29-42) 로 남겼다"

patterns-established:
  - "G-1 세션 규칙 하나: 어느 경로로 만들든 (사용자, 서버) 키로만 찾고, 기본 주문 서버가 바뀌면 다음 acquire 는 새 서버"

requirements-completed: [ADMIN-06]

coverage:
  - id: D1
    description: "트레이서 — KB121 87 이 지정 계좌 A 를 처음 실음 → AdminSessionSync → 빠진 서버 KB121 세션(LoginReq 1) · A 는 KB121 소유 · A 주문은 KB121 스텁에만 · KB120 재로그인 0 · 같은 87 재수신 시 추가 세션 0"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/session-routing.test.ts#⑫ 트레이서 (29-42)"
        status: pass
    human_judgment: false
  - id: D2
    description: "87 대조 = 원본 계좌 — 넘긴 계좌(소유 뷰 밖)도 87 에서 빠지면 원본에서 제외 1회 · 87 그대로면 제외 0 · 선언 0(재선언 없음)"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/admin-session-sync.test.ts#⑥ 넘긴 계좌(A1)도 KB120 87 에서 빠지면 원본에서 제외 1회"
        status: pass
      - kind: integration
        ref: "relay/tests/admin-session-sync.test.ts#⑦ 87 이 그대로([A1, A2])면 제외 0 · 선언 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "「주문 서버 바뀜」 프레임 0 — 주문 서버 KB121 로 바뀐 뒤 새 탭 인증 · 옛 원천을 넣어도 두 탭 order.server 0 · notifyOrderServers 진입점 없음"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/order-journal-source.test.ts#⓪ KB120 세션 탭이 있는 채 KB 주문 서버 → KB121"
        status: pass
    human_judgment: false
  - id: D4
    description: "OrderServerJournal(journal.state 원천 · healthz journal) 단언 ⑧ · ⑧-b · ⑧-c 이름 · 단언 그대로 옮긴 파일에서 green"
    requirement: "ADMIN-06"
    verification:
      - kind: unit
        ref: "relay/tests/order-journal-source.test.ts#⑧ · ⑧-b · ⑧-c"
        status: pass
    human_judgment: false
  - id: D5
    description: "SessionManager D-10 재사용 제거 — 기본 서버 전환 뒤 새 acquireFor 는 유예 중 옛 세션이 있어도 새 서버 세션 · 옛 세션 유예 소멸 · primaryOf 두 KB 세션이면 먼저 만든 KB"
    requirement: "ADMIN-06"
    verification:
      - kind: unit
        ref: "relay/tests/session-manager.test.ts#G-1 — D-10 대체"
        status: pass
      - kind: unit
        ref: "relay/tests/session-manager.test.ts#primaryOf (29-42 G-1)"
        status: pass
    human_judgment: false
  - id: D6
    description: "지정 없는 사용자 결과 무변화 · 전체 relay 회귀"
    verification:
      - kind: unit
        ref: "pnpm --filter @gh-radar/relay exec vitest run --maxWorkers=2 (54 files · 1314 tests)"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-10-10
status: complete
---

# Phase 29 Plan 42: G-1 87 서버 단위 반영 · D-10 잔재 제거 Summary

**session-sync 가 87 을 세션 원본(`declaredAccounts`) 기준으로 대조하고 빠진 서버 세션을 연다. relay 에서 「주문 서버 바뀜」 `order.server` 송신을 전부 걷어냈다. `SessionManager` 의 사용자 × 증권사 색인을 지우고 `acquireFor` 를 `acquireOn` 위임으로 만들어, 세션 키가 (유저, 서버) 하나만 남았다.**

## Performance

- **Duration:** 약 9분
- **Started:** 2026-10-10T14:55:52Z
- **Completed:** 2026-10-10T15:05:01Z
- **Tasks:** 3 (TDD — 커밋 6)
- **Files modified:** 8 (relay 소스 4 · 테스트 4) + RED 증거 3

## Accomplishments

- **87 반영(트레이서):** 지정 서버 KB121 의 87 이 계좌 A 를 처음 실으면, session-sync 가 KB121 키를 쥐지 않은 연결 중 사용자의 `refreshUserSessions` 를 부른다. 그 결과 KB121 세션이 열리고, A 주문은 KB121 스텁에만 간다. KB120 은 재로그인하지 않는다. 87 반영 경로는 세션을 열기만 하고 전략 끄기(14) · VI(11)는 보내지 않는다.
- **87 대조 원천:** 기준을 원본(`declaredAccounts`)으로 바꿨다. 이제 다른 서버에 넘긴 계좌도 이 서버 users.toml 에서 빠지면 원본에서 빠진다. 87 이 그대로면 제외 0, 선언 0 이다.
- **표식 송신 제거:** 다음을 지웠다.
  - fanout: 공개 송신 메서드 · 사용자 기억 맵 · 동기화 메서드 · 세션 서버 조회 헬퍼 · 인증 직후 비교 · `refreshUserSessions` 끝 호출 · deps 원천과 그 타입
  - index: 레지스트리 changed 처리기의 표식 호출 · `orderServerKeyOf`
  - fanout 머리 10번 문단은 G-1 순서로 고쳤다: 옛 서버 전략 끄기(29-43) → 즉시 재수립(29-36) → 25→66 재동기.
- **세션 관리자 정리:** `#byUserBroker` · `userBrokerKey` · `#create` 와 색인 정리 코드를 지웠다.
  - `acquireFor` 는 이제 대상만 골라 `acquireOn` 에 위임한다.
  - `primaryOf` = 처음 만든 KB 세션 → 없으면 첫 세션.

## Task Commits

1. **Task 1 RED:** 87 대조 원본 실패 테스트 · 트레이서 — `54bdec8e` (test)
2. **Task 1 GREEN:** 87 반영 서버 단위 — `4e6f6f92` (feat)
3. **Task 2 RED:** 표식 테스트 이동 · 프레임 0 실패 테스트 — `c4bf2ca2` (test)
4. **Task 2 GREEN:** 「주문 서버 바뀜」 표식 송신 제거 — `245b9ffe` (feat)
5. **Task 3 RED:** D-10 재사용 제거 · primaryOf 실패 테스트 — `f49a28a5` (test)
6. **Task 3 GREEN:** acquireFor → acquireOn 위임 — `d36ef698` (feat)

**Plan metadata:** (이 SUMMARY 커밋)

## TDD Gate Compliance

- **Task 1 RED:** 목표 `admin-session-sync > 87 대조 = 원본 계좌 > ⑥` 이 실패했다.
  - 실패: `removeAllowedAccounts` 호출 `[]` ≠ `[[A1]]` (AssertionError). 소유 뷰로 대조하고 있었기 때문이다.
  - junit 리포트로 `RED_EVIDENCE_OK`(target_test_failed) 를 받았다 — `.red/29-42-task1-red.json`.
  - 의미 판정: 계획된 단언에서 실패했고 로드 오류는 없다.
  - 같은 커밋의 트레이서 ⑫ 와 ⑦ 은 처음부터 green 이었다. 29-33 이 이미 세운 열기 경로를 끝에서 끝으로 증명하는 케이스라서, 재선언 0 은 DmaSession 의 기존 규칙이 지킨다.
- **Task 1 GREEN:** 3파일 33 green. 트레이서 게이트(end-of-phase · automated only)는 verify 를 다시 돌려 통과한 뒤 확장했다.
- **Task 2 RED:** 목표 `order-journal-source > ⓪` 이 실패했다.
  - 실패: 첫 탭에 `order.server` 1건(AssertionError). 옛 원천으로 인증 직후 비교가 동작했기 때문이다.
  - `RED_EVIDENCE_OK` — `.red/29-42-task2-red.json`. 옮긴 ⑧ 3건은 green 이었다.
- **Task 2 GREEN:** 6파일 162 green.
- **Task 3 RED:** 목표 `session-manager > G-1 — D-10 대체` 가 실패했다.
  - 실패: `expect(s2).not.toBe(s1)` (색인 재사용).
  - 같은 원인으로 resolveTarget 전환 케이스와 primaryOf 두 KB 케이스도 단언 실패했다.
  - `RED_EVIDENCE_OK` — `.red/29-42-task3-red.json`.
- **Task 3 GREEN:** 7파일 119 green. 전체 relay 54파일 1314 green(`--maxWorkers=2`).
- REFACTOR 커밋은 없다.

## 지운 ①~⑦ 이 지키던 것 (Task 2 기록)

29-22 표식 테스트 ①~⑦ 은 D-10 「재접속하면 적용」 배지의 송신 규율을 지켰다.

- 레지스트리 주문 서버 변경 시 열린 세션 서버 ≠ 주문 서버인 사용자 연결마다 `{broker, current, next}` 1건을 보낸다.
- 같은 표식은 재적재해도 다시 보내지 않는다.
- 세션 없는 사용자 · 다른 증권사는 0건이다.
- 인증 스냅샷에 1건 들어가고, 이미 알린 탭에는 중복이 없다.
- 유예 만료 뒤 새 서버 세션 · 주문 서버 복귀 시 `next: null` 로 지운다.

G-1 에서 배지 자체를 없앴으므로 지킬 대상이 없다. 대신 ⓪ 이 「어떤 경로로도 0」 을 지킨다.

## Files Created/Modified

- `relay/src/admin/session-sync.ts` — 원본 대조 · `#openMissingServerSessions` · 머리 주석 G-1
- `relay/src/ws/fanout.ts` — 표식 송신 경로 · deps · 타입 · import 제거, 머리 10번 문단 G-1
- `relay/src/index.ts` — 표식 호출 · `orderServerKeyOf` · fanout deps 원천 제거, 주석 갱신
- `relay/src/dma/session-manager.ts` — 색인 제거 · `acquireFor` 위임 · `primaryOf` 규칙 · 머리 주석 G-1
- `relay/tests/order-journal-source.test.ts` — `order-server-notice.test.ts` 에서 git mv 한 파일. ⑧ 3건 보존, ⓪ 추가
- `relay/tests/admin-session-sync.test.ts` — rig `ownerOf` 옵션, ⑥ ⑦ 추가
- `relay/tests/session-routing.test.ts` — ⑫ 트레이서 추가
- `relay/tests/session-manager.test.ts` — G-1 전환 케이스 · primaryOf 두 KB 케이스 추가, resolveTarget 전환 단언 수정, describe 이름 수정

## Decisions Made

- 87 대조 원천은 원본, 거름 원천은 소유 뷰로 둔다. 두 목록의 역할이 다르다.
- 표식 테스트 ⓪ 은 옛 `orderServerOf` 원천을 타입 밖 값으로 넘긴 채 0 을 단언한다. 옛 결선 잔재가 있어도 배지가 되살아나지 않음을 고정하려는 것이다.
- GREEN 커밋 타입은 오케스트레이터 규약대로 `feat` 를 썼다(플랜 예시는 `fix` · `refactor`).

## Deviations from Plan

### Auto-fixed Issues

**1. [명료성] session-manager 테스트 describe 이름에서 「주문 서버 전환 재사용」 → 「주문 서버 전환 (29-16 · 29-42 G-1)」**
- **Found during:** Task 3 RED
- **Issue:** 재사용 케이스를 G-1 로 바꿔 쓰고 나니 describe 이름이 사실과 반대가 됐다.
- **Fix:** describe 이름만 고쳤다. 다른 케이스 본문은 건드리지 않았다.
- **Committed in:** f49a28a5

**2. [범위 조정] index.ts 의 AdminSessionSync 결선 주석 · 머리 D-10 문장 갱신**
- **Found during:** Task 2
- **Issue:** 주석이 `brokersFor` 와 「order.server 표식만 간다」를 설명하고 있어, 고친 코드와 어긋났다.
- **Fix:** Task 2 파일(index.ts) 안에서 주석만 G-1 로 고쳤다.
- **Committed in:** 245b9ffe

---

**Total deviations:** 2 (모두 주석 · 이름 정합)
**Impact on plan:** 동작과 범위는 바뀌지 않았다.

## Issues Encountered

- `relay/src/dma/session.ts` 의 `broker` 게터 주석에 「사용자 × 증권사당 세션 1개 규칙(D-10)의 축」 문구가 남아 있다. 이 플랜의 files_modified 밖이라 손대지 않았고, 동작 영향은 없다. 다음 세션 정리 플랜(29-35)에서 고치면 된다.
- 테스트 중 `[DMA] 소켓 오류 ECONNREFUSED` warn 로그가 다량 찍혔다. 기존 하네스의 `port: 1` 로그이고 단언 실패는 없다.

## Known Stubs

없음.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 29-35(hub 공존 · 선호 규칙)는 단일 세션 규칙 (유저, 서버) 위에서 `primaryOf` 선호만 바꾸면 된다. 색인이 없으므로 「처음 만든 KB 세션」 이 출발점이다.
- 29-36(즉시 재수립)은 표식 없이 재수립만 하면 된다. 순서는 fanout 머리 10번 문단에 적었다: 옛 서버 전략 끄기 → 재수립 → 25→66 재동기.
- 29-39 는 shared `RelayOrderServerMsg` 정의와 webapp 소비자를 함께 지우면 된다. relay 는 더 이상 이 프레임을 import 하거나 보내지 않는다.
- 인박스 `docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md`(open)는 범위 밖이라 손대지 않았다. `relay/src/generated` 도 수정하지 않았다.

## Self-Check: PASSED

- FOUND: relay/src/admin/session-sync.ts · relay/tests/order-journal-source.test.ts · relay/src/dma/session-manager.ts · relay/src/ws/fanout.ts · relay/src/index.ts
- FOUND commits: 54bdec8e · 4e6f6f92 · c4bf2ca2 · 245b9ffe · f49a28a5 · d36ef698 (HEAD 조상) · evaluation-scope resolved(plan-subjects)
- acceptance 결과:
  - session-sync: `declaredAccounts` 2 · 전략 빌더(주석 제외) 0
  - 표식 파일: 옛 파일 없음 · 새 파일 있음
  - 표식 심볼: `notifyOrderServers|#syncOrderServerNotices|#orderNotices` 합계 0 · `RelayOrderServerMsg` 합계 0 · `⑧` 6
  - session-manager: `#byUserBroker` 0 · `userBrokerKey` 0
  - TDD: test(29-42) 3 · feat(29-42) 3
  - `relay/src/generated` 무수정

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-10*
