---
phase: 29-dma-multi-server-admin
plan: 21
subsystem: relay
tags: [relay, admin, session, users-toml, 87, self-declare, kyobo]
status: complete

requires:
  - phase: 29-14
    provides: "AdminSnapshotSink applied 이벤트(매핑 교체 뒤 발화) — index.ts `adminSnapshotSink`"
  - phase: 29-16
    provides: "SessionManager (userId, serverKey) · updatePassword · closeForDmaUser · DmaSession.isDmaUser · terminate('unauthorized')"
  - phase: 29-20
    provides: "fanout brokersFor · 증권사별 acquire · #mergedStateFrame · hub.retainSessions"
provides:
  - "DmaSession.declareAccounts(accounts) — Ready 중 mode 1 자가 선언 · 응답 대조 · `accounts` 이벤트(RESEARCH Pitfall 10 해소)"
  - "DmaSession.removeAllowedAccounts(accountNos) — 87 에서 빠진 계좌 즉시 제외(fail closed)"
  - "AdminSessionSync({ sessions, fanout }).onApplied — 87 → 그 서버 세션 선언 · 축소 · 새 증권사 세션 후보"
  - "WsFanout.connectedUsers() · refreshUserSessions(userId) — 87 로 처음 열린 증권사 세션 acquire · 결선 · 병합 프레임"
  - "SessionManager.sessionsOnServer(serverKey) · closeForDmaUser(…, { serverKey })"
  - "AdminDispatcher deps.sessions — op 2 ok 서버 → closeForDmaUser · changePassword → updatePassword"
affects: [29-22, 29-25]

actuals:
  tokens: 17400
  tasks: 2
  commits: 2
plan_head_before: 69e26b0b5ccf0728c27a93c25dca0f8fa2c0a348
plan_head_after: 7a4770fd1f891cacbe1de169a7fe76e26bd2945c

tech-stack:
  added: []
  patterns:
    - "상태 불변 · 계좌만 바뀜 = 세션 `accounts` 이벤트(페이로드 = 마지막 문구를 실은 지금 상태 프레임) — fanout 은 state 리스너와 같은 핸들로 받는다"
    - "Ready 중 선언 대조 = 대기 집합 + 남은 응답 수(선언 1건당 응답 1건) + 5초 안전 타이머 — 거부는 warn 만, 세션 유지"

key-files:
  created:
    - relay/src/admin/session-sync.ts
    - relay/tests/admin-session-sync.test.ts
  modified:
    - relay/src/dma/session.ts
    - relay/src/dma/session-manager.ts
    - relay/src/admin/dispatcher.ts
    - relay/src/ws/fanout.ts
    - relay/src/index.ts
    - relay/tests/account-declare.test.ts
    - relay/tests/admin-dispatcher.test.ts

key-decisions:
  - "declareAccounts 는 계좌번호가 아니라 RelayAccount(이름 포함)를 받는다 — 87 의 이름이 브라우저 계좌 선택 표시에 그대로 간다(플랜 시그니처 `accountNos: string[]` 에서 바꿈)"
  - "Ready 중 선언 거부 판정: 보낸 선언 수만큼 응답이 왔는데도 목록에 없는 계좌, 또는 5초 무응답 → warn 1(마스킹) · 허용 목록 무변경 · 세션 ready 유지(부트 선언과 달리 실패로 가지 않는다)"
  - "축소는 상태와 무관하게 허용 목록에서 뺀다(fail closed), 선언은 Ready 일 때만 — Ready 가 아니면 다음 로그인의 LoginResp.accounts 가 users.toml 을 반영한다"
  - "87 에 없는 유저의 세션은 sync 가 건드리지 않는다 — DeleteUser 는 dispatcher(op 2 ok → closeForDmaUser(serverKey)) 몫"
  - "closeForDmaUser 는 op 2 가 ok 인 그 서버 세션만 닫는다(선택 인자 serverKey) — 87 전용 계좌로 op 4 만 간 서버는 유저가 남으므로 세션 유지"
  - "terminate('unauthorized') 가 허용 계좌를 비운다 · 병합 상태 프레임은 다른 세션이 남아 있으면 unauthorized 세션을 뺀다(남은 세션 기준) · 전부 끝나면 unauthorized 프레임"
  - "changePassword 는 서버 op 1 이 끝난 뒤 finally 로 updatePassword — 서버 전부 실패여도 부른다(DB 암호문은 이미 새 값). DB setPassword 가 던지면(없는 DMA id) 부르지 않는다"
  - "새 증권사 세션 판정은 fanout(brokersFor)이 한다 — sync 는 「87 에 계좌가 있고 그 서버 세션을 쥐지 않은 연결 중 사용자」 후보만 고른다. 빠진 증권사가 없으면 자격증명 조회도 없다"
  - "AdminSessionSync deps 는 { sessions, fanout } — 플랜 표의 hub · brokersFor 는 fanout.refreshUserSessions 안에서 쓰므로 sync 에 따로 주입하지 않았다"

patterns-established:
  - "87 반영 3갈래 표(아래) — 선언 · 축소 · 새 증권사, dispatcher 2갈래 — 삭제 종료 · 비밀 교체"

requirements-completed: [ADMIN-06]

coverage:
  - id: D1
    description: "트레이서 — op 3 A2 → KB120 87 → Ready 세션 mode 1 A2 1건 → allowedAccounts [A1, A2] → 브라우저 상태 프레임 A2 · LoginReq 인증 1건뿐"
    requirement: ADMIN-06
    verification:
      - kind: integration
        ref: "relay/tests/admin-session-sync.test.ts#① 트레이서"
        status: pass
    human_judgment: false
  - id: D2
    description: "Ready 중 선언 — 새 계좌 · 무변화 0 · 서버 거부 warn 1(마스킹) · 무응답 5초 · 재접속 중 선언 안 함 · 대기 없을 때 55 는 「예상 밖」"
    requirement: ADMIN-06
    verification:
      - kind: unit
        ref: "relay/tests/account-declare.test.ts#Phase 29 Ready 중 선언 (6건)"
        status: pass
    human_judgment: false
  - id: D3
    description: "같은 87(op 5) → 선언 0 · 상태 프레임 재송신 0"
    requirement: ADMIN-06
    verification:
      - kind: integration
        ref: "relay/tests/admin-session-sync.test.ts#② 같은 87"
        status: pass
    human_judgment: false
  - id: D4
    description: "op 4 A2 → allowedAccounts 에서 즉시 제외 · 상태 프레임 갱신 · A2 order.new → 「이 세션에서 사용할 수 없는 계좌입니다.」"
    requirement: ADMIN-06
    verification:
      - kind: integration
        ref: "relay/tests/admin-session-sync.test.ts#③ op 4 A2"
        status: pass
    human_judgment: false
  - id: D5
    description: "교보 주문 서버 87 에 d1 첫 등장 → 교보 세션 acquire(LoginReq 1) · 상태 프레임 [A1, B1] · 같은 87 재수신에도 세션 2 그대로"
    requirement: ADMIN-06
    verification:
      - kind: integration
        ref: "relay/tests/admin-session-sync.test.ts#④ 교보 주문 서버 87"
        status: pass
    human_judgment: false
  - id: D6
    description: "closeForDmaUser(KB120) → KB 만 unauthorized · 계좌 비움 · 재로그인 0 · 화면은 교보 기준 ready → 교보도 닫으면 unauthorized 프레임"
    requirement: ADMIN-06
    verification:
      - kind: integration
        ref: "relay/tests/admin-session-sync.test.ts#⑤ closeForDmaUser"
        status: pass
    human_judgment: false
  - id: D7
    description: "dispatcher — op 2 ok 서버만 closeForDmaUser(serverKey) · op 4 만 간 서버 0 · changePassword → updatePassword 1회(서버 offline 이어도) · NO_DMA_USER 0회"
    requirement: ADMIN-06
    verification:
      - kind: unit
        ref: "relay/tests/admin-dispatcher.test.ts#D8 · D9"
        status: pass
    human_judgment: false
  - id: D8
    description: "기존 동작 무변경 — relay 전체 단위"
    requirement: ADMIN-06
    verification:
      - kind: unit
        ref: "pnpm --filter @gh-radar/relay run test (49 files · 1220)"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-10-07
---

# Phase 29 Plan 21: 87 → 열린 세션 반영 Summary

**Admin 이 서버 users.toml 을 바꾸면(87) 그 서버에 로그인한 사용자 세션이 재로그인 없이 새 계좌를 mode 1 로 자가 선언하고 빠진 계좌는 즉시 막으며, 교보 주문 서버에 처음 실린 사용자에게는 교보 세션을 열고, 유저 삭제는 그 서버 세션을 `unauthorized` 로 끝내고 비밀번호 변경은 열린 세션의 비밀만 갈아 끼운다.**

## Performance

- **Duration:** 약 8분
- **Started:** 2026-10-06T19:17:39Z
- **Completed:** 2026-10-06T19:25:45Z
- **Tasks:** 2
- **Files modified:** 9 (신규 2)

## 세션 반영 규칙 표

| 신호 | 대상 세션 | 동작 | 브라우저 |
|---|---|---|---|
| 87 에 새 계좌 | 그 서버 · 그 DMA 유저 세션, **Ready 일 때만** | `UpdateAccountNoReq(3)` mode "1" 새 계좌만 → 55 대조 → 허용 목록 추가 | `accounts` 이벤트 → 병합 상태 프레임(문구 보존) |
| 선언 거부 · 무응답 | 〃 | 허용 목록 무변경 · warn 1(마스킹) · 세션 ready 유지 | 무변화 |
| Ready 아님 | 〃 | 선언 안 함 — 다음 로그인 `LoginResp.accounts` 가 반영 | — |
| 87 에서 빠진 계좌 | 그 서버 · 그 DMA 유저 세션(상태 무관) | 허용 목록에서 즉시 제외(fail closed) · 늦은 응답이 되살리지 않게 대기에서도 제거 | 병합 상태 프레임 · 그 계좌 주문 「사용할 수 없는 계좌」 |
| 87 에 계좌 있음 + 그 서버 세션 없음 | 연결 중 사용자 | `fanout.refreshUserSessions` — `brokersFor` 가 새 증권사를 열라면 연결마다 acquire · hub 결선 | 병합 상태 프레임(계좌 합집합) |
| 87 에 그 유저 없음 | — | sync 는 손대지 않음(DeleteUser 경로 몫) | — |
| DeleteUser op 2 ok(0 · 4) | **그 서버** 의 그 DMA 유저 세션만 | `closeForDmaUser(…, { serverKey })` → `unauthorized` · 재접속 없음 · 허용 계좌 비움 | 남은 세션 있으면 그 기준, 전부 닫히면 `unauthorized` |
| 비밀번호 변경 | 그 DMA id 세션 전부 | 서버 op 1 뒤 `updatePassword` — 세션 유지 · 다음 로그인부터 새 비밀 | 무변화 |

## Task Commits

1. **Task 1: 트레이서 — 87 새 계좌 → Ready 세션 mode 1 선언 → allowedAccounts → 브라우저 상태 프레임** - `c595c53d` (feat)
2. **Task 2: 계좌 축소 · 새 증권사 세션 acquire · DeleteUser 세션 종료 · 비밀번호 세션 교체** - `7a4770fd` (feat)

트레이서 피드백 게이트: auto 모드 아님 · `human_verify_mode` end-of-phase · `<verify>` 자동만 → Task 1 verify 재실행 green(2파일 16건 · relay 전체 1214) 후 확장(체크포인트 없음).
Task 2 RED: 신규 5건 실패 확인(D8 · D9 · ③ · ④ · ⑤) → GREEN 22건 → relay 전체 1220.

## Files Created/Modified

- `relay/src/dma/session.ts` — `declareAccounts` · `removeAllowedAccounts` · `accounts` 이벤트 · Ready 중 55 처리(`#onDeclareResp` · `#settleDeclare`) · 마지막 상태 문구 보존 · `terminate` 가 허용 계좌 비움 · 머리 주석 Pitfall 10 단락
- `relay/src/dma/session-manager.ts` — `sessionsOnServer` · `closeForDmaUser` 선택 인자 `serverKey`
- `relay/src/admin/session-sync.ts` — 신규 `AdminSessionSync`
- `relay/src/admin/dispatcher.ts` — `deps.sessions` · op 2 ok → `closeForDmaUser` · `changePassword` finally → `updatePassword`
- `relay/src/ws/fanout.ts` — `accounts` 리스너(`#unlisten`) · `connectedUsers` · `refreshUserSessions` · `#bindSessions`(인증과 공용) · 병합 프레임 unauthorized 제외
- `relay/src/index.ts` — sink `applied` → `adminSessionSync.onApplied` · dispatcher `sessions: sessionManager`
- `relay/tests/account-declare.test.ts` — 「Phase 29 Ready 중 선언」 6건
- `relay/tests/admin-session-sync.test.ts` — 신규 통합 5건(실 AdminConn · sink · SessionManager · WsFanout · 스텁 게이트웨이 2대)
- `relay/tests/admin-dispatcher.test.ts` — D8 · D9 3건

## Decisions Made

frontmatter `key-decisions` 참조.

## 가정 · 알려진 한계

- **declaring 중 87 경합**: 로그인 직후 계좌 선언(5초 이내) 중에 온 87 의 새 계좌는 선언하지 않는다(Ready 아님). 그 로그인이 87 이전 users.toml 을 받았다면 새 계좌는 다음 재로그인까지 화면에 없다. 창이 짧아 이번엔 플랜대로 두었다.
- **KB 세션만 DeleteUser 로 끝났을 때 hub primary**: 병합 상태 프레임 · 계좌 · 주문은 남은 교보 세션 기준이지만, hub primary 판정(29-20 `#primaryOwner`)은 여전히 KB 세션이라 primary 전용 원천(VI · 84 · 76/78 · 77)은 비게 된다. 29-20 SUMMARY 의 「교보 전용 사용자」 한계와 같은 갈래 — primary 판정에 「종료 세션 제외」 를 넣는 후속이 필요하면 그때 함께 다룬다.
- **새 증권사 세션을 닫는 반대 방향**(87 에서 그 유저 계좌가 전부 빠져 증권사 매핑에서 사라짐)은 세션을 즉시 닫지 않는다 — 다음 인증의 `retainSessions` 가 병합 뷰에서 뗀다. 남은 세션 허용 계좌는 축소 규칙으로 이미 비거나 줄어든다.
- 운영 relay 는 재배포하지 않았다(29-25 빅뱅 배포까지 보류 · 기존 KB 세션 동작 무변경 — 단일 세션 사용자는 87 신호가 없으면 경로가 열리지 않는다).

## Deviations from Plan

### 계획 대비 배치 · 시그니처 차이

- `removeAllowedAccounts` 는 Task 2 몫이지만 `session.ts` 를 Task 1 에서 한 번에 편집해 Task 1 커밋에 들어갔다(결선 · 호출은 Task 2 커밋). Task 2 RED 는 sync 축소 · fanout 갱신 · dispatcher 훅 부재로 5건 실패를 확인했다.
- `declareAccounts(accounts: RelayAccount[])` — 플랜 표의 `accountNos: string[]` 대신 이름을 함께 받는다(브라우저 계좌 선택 표시 원천).
- `AdminSessionSync` deps 는 `{ sessions, fanout }` — hub · brokersFor 는 `fanout.refreshUserSessions` 안에서 쓴다.
- `session-manager.ts` 는 플랜 `files_modified` 밖이지만 `sessionsOnServer`(서버 키 세션 순회 — 플랜 「sessionsOf 전체 순회 중 serverKey 일치」 의 진입점)와 `closeForDmaUser` 선택 인자(플랜이 지시)로 편집했다.

### Auto-fixed Issues

**1. [Rule 2 - Fail closed] terminate 가 허용 계좌를 비운다**
- **Found during:** Task 2
- **Issue:** `unauthorized` 로 끝난 세션의 `allowedAccounts` 가 남아 `forAccount` 라우팅 · 병합 프레임 계좌 합집합에 지워진 유저 계좌가 보였다
- **Fix:** `terminate` 에서 `#accounts = []` · 병합 프레임은 남은 세션이 있으면 unauthorized 세션 제외
- **Files modified:** relay/src/dma/session.ts, relay/src/ws/fanout.ts
- **Commit:** 7a4770fd

**Total deviations:** 1 auto-fixed(Rule 2) · 배치 · 시그니처 차이 4. **Impact:** 범위 밖 변경 없음 · 기존 테스트 무수정.

## Issues Encountered

None.

## Next Phase Readiness

- 29-22(주문 서버 배지)는 `session.serverKey` 와 병합 상태 프레임을 그대로 쓴다. 29-25 빅뱅 배포 때 이 경로(87 → 세션)가 함께 나간다.

## Self-Check: PASSED

- FOUND: relay/src/admin/session-sync.ts · relay/tests/admin-session-sync.test.ts
- FOUND: c595c53d · 7a4770fd (HEAD 조상)
