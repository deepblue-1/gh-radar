---
phase: 29-dma-multi-server-admin
plan: 35
subsystem: relay
tags: [relay, hub, dma, g-1, multi-server, ownership-filter, primary, tdd]

requires:
  - phase: 29-42
    provides: "SessionManager (유저, 서버) 키 하나 · acquireFor → acquireOn 위임 · primaryOf = 처음 만든 KB 세션 → 첫 세션"
  - phase: 29-33
    provides: "DmaSession 소유 뷰 allowedAccounts · 원본 declaredAccounts · createOrderServerRouting(serversFor · ownerOf)"
  - phase: 29-20
    provides: "hub 세션 소유 키 ownerKey(userId, serverKey) · 83 progressKey · 64 lcKey 서버 몫 교체 · D-18 병합 규칙표"
provides:
  - "hub — 같은 증권사 다른 서버 세션(KB120 · KB121) 공존(옛 D-10 대체 규칙 삭제)"
  - "hub — 병합 프레임 G-1 소유 필터: 66/67(프레임) · 60/64(항목) · 83(항목 · fail-closed)을 세션 소유 뷰로 거름 — 판정 함수 ownedAccountsOf 하나"
  - "hub — lc.snap 세션 결선 순 합집합 · gh-trade-84 (나) 세 단언(83 item 단위 · 빈 83 · 64 서버별 합침) 테스트 고정"
  - "SubscriptionHubOptions · SessionManagerOptions.preferredPrimaryServerKey — primary = 선호 서버 → 첫 KB → 첫 세션(세 모듈 같은 주입)"
  - "fanout 병합 상태 프레임 — primary = sessions.primaryOf · 선언은 있으나 소유 0 인 세션은 any-ready · accounts 제외"
affects: [29-36, 29-39, 29-41, 29-43, 29-44]

actuals:
  tokens: 17717
  tasks: 2
  commits: 4
plan_head_before: 91486e1884f1a739d991e2eb63200d2499d05a42
plan_head_after: 7cd819222571cc4193913686b44a5c20a0dd8647

tech-stack:
  added: []
  patterns:
    - "소유 필터 판정 원천 하나(ownedAccountsOf) — null(소유 목록 없음)의 뜻은 갈래가 정한다: 83 fail-closed, 66/67 · 60/64 통과"
    - "primary 선호 주입 = 함수 하나를 SessionManager · hub 에 같이 넘기고 fanout 은 sessions.primaryOf 를 읽는다"
    - "hub #lastPrimary — 판정이 주입을 그때그때 묻기 때문에 「옛 primary」 는 계산이 아니라 기록으로 비교한다"

key-files:
  created:
    - .planning/phases/29-dma-multi-server-admin/.red/29-35-task1-red.json
    - .planning/phases/29-dma-multi-server-admin/.red/29-35-task2-red.json
  modified:
    - relay/src/hub/subscription-hub.ts
    - relay/src/dma/session-manager.ts
    - relay/src/ws/fanout.ts
    - relay/src/index.ts
    - relay/src/dma/session.ts
    - relay/tests/hub-multi-session.test.ts
    - relay/tests/fanout-multi-session.test.ts
    - relay/tests/session-manager.test.ts

key-decisions:
  - "29-35: hub attach 의 옛 D-10 「같은 증권사 다른 서버 = 대체」 삭제 — 떼어 낼 세션은 쥔 연결 기준 retainSessions 하나가 고른다"
  - "29-35: 병합 프레임 소유 필터는 그 세션 allowedAccounts(소유 뷰)로 — 66/67 은 프레임 계좌, 60/64 · 83 은 항목 계좌. 소유 목록이 없는 가짜 세션에서 66/67 · 60/64 는 종전 통과, 83 만 fail-closed"
  - "29-35: 51 주문 통보는 와이어(OrderResp)에 계좌 칸이 없어 소유 필터 밖(병합 통과) — 플랜 truth 의 「A 의 51 통보 0」 은 relay 단독으로 불가, 원천 차단은 옛 서버 전략 끄기(29-43 · 29-36 · 29-44)"
  - "29-35: primary = preferredPrimaryServerKey(운영 registry.orderServerOf(KB)?.key) 세션 → 첫 KB → 첫 세션 — SessionManager · hub 는 같은 함수 주입, fanout 은 sessions.primaryOf"
  - "29-35: hub 는 #lastPrimary 로 직전 primary 를 기억해, 기본 서버가 바뀌면 다음 attach · retainSessions 에서 옛 primary 몫 사용자 단위 캐시를 비우고 새 primary 로 21 · 34 · 43 을 요청한다(retainSessions 는 뗀 세션이 없어도 판정)"
  - "29-35: 병합 상태 프레임의 「소유 0」 은 allowedAccounts 0 이면서 declaredAccounts > 0 인 세션 — 지정 없는 사용자(소유 뷰 = 원본)와 로그인 중 세션(선언 0)은 결과가 종전과 같다"
  - "29-35: getLimitChasers(lc.snap)는 세션 결선 순으로 묶는다 — 한 세션 64 전량 교체가 그 세션 몫 자리를 맨 뒤로 밀지 않게"

patterns-established:
  - "G-1 화면 원천 규칙: 그 계좌는 유효 주문 서버 세션 하나에서만 보인다 — hub 가 계좌 프레임을 캐시 전에 소유 뷰로 거른다"

requirements-completed: [ADMIN-06]

coverage:
  - id: D1
    description: "트레이서 — 같은 사용자 KB120 · KB121 세션이 hub 에 공존하고(운영 결선 serversFor · ownerOf), KB120 이 보낸 A 잔고 · A/B 섞인 64 의 A 항목은 브라우저 · 캐시 0, KB121 의 A 만 간다 · B 는 반대 · 새 탭 스냅샷도 소유 서버 몫만"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/fanout-multi-session.test.ts#같은 증권사 두 서버 · A 프레임은 KB121 것만 브라우저로"
        status: pass
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#같은 증권사 두 세션 결선 공존"
        status: pass
    human_judgment: false
  - id: D2
    description: "hub 소유 필터 — 66/67 · 60 · 64 항목은 그 세션 소유 계좌만 캐시 · 팬아웃 · 64 섞임은 소유 항목만 그 세션 몫으로"
    requirement: "ADMIN-06"
    verification:
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#소유 필터 — KB120 이 보낸 A 의 66/67 · 60 · 64 항목은 캐시 0"
        status: pass
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#소유 필터 — 64 가 A · B 항목을 섞어 오면"
        status: pass
    human_judgment: false
  - id: D3
    description: "gh-trade-84 (나) — 83 item 단위 · 빈 83 은 다른 서버 몫 유지 · unf.progress 합집합 · 64 서버별 합침(lc.snap 결선 순 합집합)"
    requirement: "ADMIN-06"
    verification:
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#(나) 83 item 단위"
        status: pass
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#(나) 빈 83"
        status: pass
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#(나) 64 서버별 합침"
        status: pass
    human_judgment: false
  - id: D4
    description: "primary = KB 기본 주문 서버 세션(생성 · 결선 순서 무관) — SessionManager.primaryOf · hub 21/34/43 · VI 61 · fanout 병합 상태 프레임 계좌 순서가 같은 답 · 기본 서버 세션 없으면 첫 KB · 기본 서버 전환 뒤 다음 결선에서 primary 교체"
    requirement: "ADMIN-06"
    verification:
      - kind: unit
        ref: "relay/tests/session-manager.test.ts#primaryOf (29-35)"
        status: pass
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#SubscriptionHub — primary 선호 서버 (29-35)"
        status: pass
      - kind: integration
        ref: "relay/tests/fanout-multi-session.test.ts#생성 순서와 무관하게 primary = KB 기본 주문 서버 세션"
        status: pass
    human_judgment: false
  - id: D5
    description: "소유 0 세션 병합 제외 — KB120 이 ready 여도 계좌가 전부 KB121 이면 병합 상태 프레임 s 는 KB121 상태(reconnecting)"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/fanout-multi-session.test.ts#소유 계좌 0 세션은 병합 상태 프레임의 any-ready · accounts 에 기여하지 않는다"
        status: pass
    human_judgment: false
  - id: D6
    description: "지정 없는 사용자 회귀 무변화 — 기존 hub-multi-session · fanout-multi-session 케이스 이름 · 단언 무수정 green · 전체 relay"
    verification:
      - kind: unit
        ref: "pnpm --filter @gh-radar/relay exec vitest run --maxWorkers=2 (54 files · 1329 tests)"
        status: pass
    human_judgment: false
  - id: D7
    description: "51 주문 통보의 서버별 거름 — 와이어에 계좌 칸이 없어 구현하지 못함(플랜 truth 일부 미충족)"
    requirement: "ADMIN-06"
    verification:
      - kind: unit
        ref: "relay/tests/hub-multi-session.test.ts#51 주문 통보는 와이어에 계좌 칸이 없어 소유 필터 밖"
        status: pass
    human_judgment: true
    rationale: "테스트는 「51 은 통과」 라는 현재 동작을 고정할 뿐 truth 를 증명하지 않는다. 옛 서버 잔여 전략 체결 통보가 화면에 보일 수 있는 공백을 29-43/29-36 전략 끄기로 충분하다고 볼지, gh-trade 에 OrderResp.account_no 추가를 요청할지 사용자가 판단해야 한다"

duration: 9min
completed: 2026-10-10
status: complete
---

# Phase 29 Plan 35: G-1 hub 다중 서버 공존 · 계좌 소유 필터 · primary 규칙 Summary

**hub 가 같은 사용자의 KB120 · KB121 세션을 함께 결선하고, 계좌 프레임(66/67 · 60/64 · 83)을 그 세션의 소유 뷰로 걸러 각 계좌가 자기 주문 서버 세션에서만 보이게 했다. primary 는 세 모듈이 같은 주입(`preferredPrimaryServerKey` = KB 기본 주문 서버)으로 고른다.**

## Performance

- **Duration:** 약 9분 (기록 시작 15:14:52Z — 그 전 읽기 포함하면 약 20분)
- **Started:** 2026-10-10T15:14:52Z
- **Completed:** 2026-10-10T15:23:41Z
- **Tasks:** 2 (TDD — 커밋 4)
- **Files modified:** 8 (relay 소스 5 · 테스트 3) + RED 증거 2

## Accomplishments

- **같은 증권사 두 서버 공존(트레이서):** `attach` 에서 옛 D-10 「같은 증권사 다른 서버 세션 = 대체」 루프를 지웠다. 떼어 낼 세션은 쥔 연결 기준 `retainSessions` 하나가 고른다.
  - 운영 결선 모양(`serversFor` · `acquireOn` · `ownerOf`) 통합 테스트에서 KB120 · KB121 이 hub 에 함께 남는다.
  - KB120 이 보낸 A 잔고 · A 전략 항목은 브라우저와 캐시에 0 이고, KB121 의 A 만 간다. B 는 반대다.
- **소유 필터:** 병합 프레임의 계좌를 그 세션 `allowedAccounts`(29-33 소유 뷰)로 거른다. 판정 함수는 `ownedAccountsOf` 하나다.
  - 66/67 은 프레임 계좌, 60 은 에코 계좌, 64 와 83 은 항목 계좌로 판정한다.
  - 버리면 debug 1줄을 남기고 계좌는 마스킹한다. `unhandledFrameCount` 는 오르지 않는다.
  - primary 전용 프레임(VI 61/72/73/56 · 84 · 76/78 · 77)과 54 · 공개 시세 경로는 손대지 않았다.
- **gh-trade-84 (나) 고정:** 다음 세 단언을 테스트 이름에 「(나)」 를 넣어 고정했다.
  - 83 은 프레임이 아니라 항목 단위로 거른다.
  - KB120 의 빈 83 은 KB120 몫만 지운다. `unf.progress` 는 남은 KB121 몫 합집합이다.
  - 64 는 서버 몫만 전량 교체한다. `lc.snap` 은 세션 결선 순 합집합이다(KB120 다음 64 = [B1] → `[B1, A1]`).
  - 상태 키의 서버 축(`ownerKey`)은 그대로다(grep 11 → 11).
- **primary 규칙:** `preferredPrimaryServerKey` 주입을 SessionManager · hub 에 같은 함수로 넣었다(index = `registry.orderServerOf("KB")?.key`). 규칙은 그 키 세션 → 첫 KB 세션 → 첫 세션이다. fanout 병합 상태 프레임은 `sessions.primaryOf` 를 쓴다.
  - KB121 을 먼저 만들어도 세 모듈이 모두 KB120 을 고른다. 21 · 34 · 43 은 KB120 으로만 가고, VI 61 도 KB120 것만 브라우저로 간다.
  - hub 는 직전 primary 를 `#lastPrimary` 로 기억한다. 기본 서버가 바뀌면 다음 `attach` · `retainSessions` 에서 옛 primary 몫을 비우고 새 primary 로 요청한다.
- **소유 0 세션 제외:** 계좌를 선언했지만 소유 0 인 세션(계좌가 전부 다른 서버로 지정됨)은 병합 상태 프레임의 any-ready 와 accounts 에서 빠진다. KB120 이 ready 여도 KB121 이 끊기면 화면은 `reconnecting` 이다.

## Task Commits

1. **Task 1 RED:** 같은 증권사 두 서버 공존 · 소유 필터 실패 테스트 — `375f9552` (test)
2. **Task 1 GREEN:** hub 공존 · 계좌 프레임 소유 필터 — `bd5172fa` (feat)
3. **Task 2 RED:** primary 선호 · 소유 0 병합 제외 실패 테스트 — `9776f037` (test)
4. **Task 2 GREEN:** primary = KB 기본 주문 서버 세션 · 소유 0 제외 — `7cd81922` (feat)

**Plan metadata:** (이 SUMMARY 커밋)

## TDD Gate Compliance

- **Task 1 RED:** 목표 `hub-multi-session > G-1 … > 같은 증권사 두 세션 결선 공존` 이 실패했다.
  - 실패: `sessionCount` 1 ≠ 2 (AssertionError). KB121 결선이 KB120 을 대체했기 때문이다.
  - junit 리포트로 `RED_EVIDENCE_OK`(target_test_failed) 를 받았다 — `.red/29-35-task1-red.json`.
  - 의미 판정: 계획된 단언에서 실패했고 로드 오류는 없다. 같은 원인으로 G-1 케이스 6건과 fanout 트레이서도 실패했다(fanout 은 `expected 1 to be 2`).
- **Task 1 GREEN:** verify 5파일 179 green. 트레이서 게이트(end-of-phase · automated only)는 verify 를 다시 돌려 통과한 뒤 Task 2 로 넘어갔다.
- **Task 2 RED:** 목표 `hub-multi-session > primary 선호 서버 > 생성 순서와 무관하게 …` 가 실패했다.
  - 실패: KB120 송신 `[25, 24]` ≠ `[25, 24, 21, 21, 34, 43]` (AssertionError).
  - `RED_EVIDENCE_OK` — `.red/29-35-task2-red.json`.
  - session-manager(`KB121` ≠ `KB120`) · fanout primary · 소유 0(`ready` ≠ `reconnecting`) · 전환 케이스도 계획된 단언에서 실패했다.
- **Task 2 GREEN:** verify 4파일 69 green. 전체 relay 54파일 1329 green(`--maxWorkers=2`).
- REFACTOR 커밋은 없다.

## Files Created/Modified

- `relay/src/hub/subscription-hub.ts` — D-10 대체 삭제 · `ownedAccountsOf` · 66/67 · 60/64 · 83 소유 필터 · `#logForeign` · `getLimitChasers` 결선 순 · `SubscriptionHubOptions` · `preferredPrimaryServerKey` · `#lastPrimary` · 머리 D-18 규칙표에 G-1 열과 문단
- `relay/src/dma/session-manager.ts` — `preferredPrimaryServerKey` 선택지 · `primaryOf` 선호 규칙 · 머리 D-18 문단
- `relay/src/ws/fanout.ts` — `#mergedStateFrame` primary = `sessions.primaryOf` · 소유 0 제외 · 주석
- `relay/src/index.ts` — `preferredPrimaryServerKey` 정의 · SessionManager · hub 주입 · 옛 D-10 주석 정리
- `relay/src/dma/session.ts` — `broker` 게터의 D-10 잔재 주석 정리(29-42 가 남긴 것)
- `relay/tests/hub-multi-session.test.ts` — G-1 describe 7케이스 · primary 선호 describe 4케이스
- `relay/tests/fanout-multi-session.test.ts` — G-1 describe 3케이스(KB120 · KB121 스텁 · 운영 결선)
- `relay/tests/session-manager.test.ts` — primaryOf (29-35) 1케이스 · `mgr` 선택지 타입

## Decisions Made

- 소유 필터의 null(소유 목록 없음)은 갈래마다 뜻이 다르다. 83 은 Broadcast 라 fail-closed 를 유지했다. 66/67 · 60/64 는 그 세션 요청의 응답이라 통과로 두었다. 덕분에 `allowedAccounts` 가 없는 기존 단위 가짜 세션 테스트가 무수정 green 이다.
- 병합 상태 프레임의 「소유 0」 은 `allowedAccounts` 0 이면서 `declaredAccounts` 가 있는 세션으로 정의했다. 로그인 중 세션(선언 0)과 지정 없는 사용자는 결과가 종전과 같다.
- primary 판정은 세 모듈 모두 주입을 그때그때 묻는다(사용자 단위 명령이 가는 세션과 원천을 받는 세션이 갈리지 않게). hub 만 캐시 정리를 위해 직전 값을 기록한다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 테스트 고정] hub primary 선호 케이스의 결선 시점 Ready 상태**
- **Found during:** Task 2 GREEN
- **Issue:** `FakeBrokerSession` 은 기본이 `isReady = true` 다. 그래서 KB120 결선이 primary 를 바꾸는 순간 21 · 34 · 43 을 이미 보냈고(올바른 동작), 뒤의 `emitReady` 와 겹쳐 두 벌이 됐다.
- **Fix:** 그 케이스에서만 결선 전에 두 세션을 Ready 전으로 두었다. 기존 「교보만 있던 사용자에게 KB 결선」 케이스와 같은 방식이다.
- **Committed in:** 7cd81922

**2. [Rule 3 - Blocking] session-manager 테스트 `mgr` 선택지 타입**
- **Issue:** `mgr(opts)` 가 `{ now? }` 만 받아 typecheck:tests 가 새 선택지를 거부했다.
- **Fix:** 타입에 `preferredPrimaryServerKey?` 를 추가했다.
- **Committed in:** 7cd81922

**3. [범위 조정] `relay/src/dma/session.ts` broker 게터 주석 · index 의 옛 D-10 주석**
- **Issue:** 29-42 가 남긴 「사용자 × 증권사당 세션 1개 규칙(D-10)」 주석과 index 의 SessionManager 결선 주석이 지운 규칙을 설명하고 있었다.
- **Fix:** 주석만 G-1 로 고쳤다. session.ts 는 플랜 files_modified 밖이지만 오케스트레이터가 이 플랜에 넘긴 정리 항목이다.
- **Committed in:** bd5172fa (session.ts) · 7cd81922 (index.ts)

**4. [Rule 4 성격 — 실행 불가, 진행 후 보고] 51 주문 통보의 소유 필터**
- **Found during:** Task 1
- **Issue:** truth 와 behavior 는 「KB120 스텁이 보낸 A 의 51 통보는 브라우저로 가지 않는다」 를 요구한다. 그런데 `OrderResp`(StockDMA.fbs)와 `ParsedOrderResp` 에는 계좌 칸이 없다. relay 가 51 의 계좌를 알 방법이 없다.
  - orderNo 를 67 미체결과 상관시키는 방법은 접수 51 이 67 보다 먼저 오는 순서에서 새어 확실하지 않아 쓰지 않았다.
- **Fix:** 플랜 action ② 의 「계좌가 없는 항목은 손대지 않는다」 를 따라 51 은 종전 「병합(통과)」 그대로 두었다. 이 사실을 머리 규칙표와 테스트(「51 주문 통보는 와이어에 계좌 칸이 없어 소유 필터 밖」)에 명시했다.
- **남는 위험:** 비소유 서버 세션에서 오는 51 은 그 서버에 남은 그 계좌 전략(옛 서버 상따 · VI · 자동매도)이 낸 주문의 통보뿐이다(gh-trade-84 ② — A 서버 주문 통보는 B 로 가지 않는다). 그래서 29-43 · 29-36 · 29-44 의 옛 서버 전략 끄기가 원천을 막는다. 계좌 단위로 확실히 거르려면 gh-trade 에 `OrderResp.account_no` 추가를 요청해야 한다(와이어 변경 — gh-trade-84 ④ 「불필요」 답과 충돌하므로 사용자 결정).
- **Committed in:** bd5172fa

---

**Total deviations:** 4 (테스트 고정 1 · blocking 1 · 주석 정합 1 · 실행 불가 보고 1)
**Impact on plan:** 66/67 · 60/64 · 83 · primary · 소유 0 은 플랜대로 끝났다. 51 만 와이어 한계로 truth 의 한 줄이 미충족이다(coverage D7 · human_judgment).

## Issues Encountered

- 기존 hub-multi-session · fanout-multi-session 케이스는 이름과 단언을 하나도 고치지 않았고 그대로 green 이다.
- `getLimitChasers` 를 세션 결선 순으로 묶었다. 지정 없는 KB + 교보 사용자는 `lc.snap` 항목 순서가 「삽입 순」 에서 「세션별 묶음」 으로 바뀔 수 있다(프레임 수 · 프레임 순서는 같다). 기존 단언은 정렬 비교라 영향이 없다.
- 전체 회귀 중 `[order-api] 처리되지 않은 오류`(journal status) ERROR 로그와 `ECONNREFUSED` warn 로그가 찍혔다. 둘 다 기존 하네스 로그이고 단언 실패는 없다.
- 결함 장부(`gsd-tools windows append`)는 기존 `.planning/WINDOWS.md` 의 frontmatter 집계 불일치(4/0/13/17 vs 3/0/14/17) 때문에 거부됐다. best-effort 라 건너뛰었다. 51 공백은 이 SUMMARY 의 D7 과 Deviation 4 에만 기록돼 있다.

## Known Stubs

없음.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 29-36(즉시 재수립)은 다음 두 가지를 그대로 쓰면 된다.
  - hub 는 기본 서버가 바뀐 뒤 첫 `attach` · `retainSessions` 에서 primary 를 옮기고 정리한다.
  - 세션이 닫히고 다시 열려도 소유 필터는 세션 소유 뷰를 호출마다 다시 묻는다.
- 29-43 · 29-44(옛 서버 전략 끄기)가 51 공백의 원천 차단이다. 끄기 전 구간에는 옛 서버 체결 통보 토스트가 보일 수 있다.
- 29-41 go/no-go 에서 51 공백(D7)을 허용할지, gh-trade 에 `OrderResp.account_no` 를 요청할지 사용자 결정이 필요하다.
- 인박스 `docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md`(open)는 범위 밖이라 손대지 않았다. `relay/src/generated` 도 수정하지 않았다.

## Self-Check: PASSED

- FOUND: relay/src/hub/subscription-hub.ts · relay/src/dma/session-manager.ts · relay/src/ws/fanout.ts · relay/src/index.ts · relay/src/dma/session.ts · .red/29-35-task1-red.json · .red/29-35-task2-red.json
- FOUND commits: 375f9552 · bd5172fa · 9776f037 · 7cd81922 (HEAD 조상 · `git rev-list --count 91486e18..HEAD` = 4)
- acceptance 결과:
  - Task 1: fanout 「같은 증권사 두 서버 · A 프레임은 KB121 것만」 · hub 「같은 증권사 두 세션 결선 공존」 green · 「(나)」 케이스 3 green · `ownerKey` 11 → 11 · `allowed.has(it.accountNo)` 1 · `ownedAccountsOf` 8 · 대체 로그 문구 0
  - Task 2: index `preferredPrimaryServerKey` 3(정의 · SessionManager · hub) · hub 6 · 「생성 순서와 무관하게 primary = KB 기본 주문 서버 세션」 세 테스트 파일 각 1
  - TDD: test(29-35) 2 · feat(29-35) 2 · 삭제 파일 0 · `relay/src/generated` 무수정

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-10*
