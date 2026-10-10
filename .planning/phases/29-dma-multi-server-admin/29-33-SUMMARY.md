---
phase: 29-dma-multi-server-admin
plan: 33
subsystem: relay
tags: [relay, dma, session-routing, g-1, account-order-server, fail-closed, tdd]

requires:
  - phase: 29-28
    provides: "TailReload — 주기 공유 · 즉시 꼬리(두 슬롯) 적재 조정기"
  - phase: 29-29
    provides: "RPC dma_account_order_servers() → (dma_user_id, broker, account_no, server_key) 계약 · G-1 운영 규칙 · gh-trade-84 답"
provides:
  - "AccountOrderServers — 계좌별 주문 서버 지정 60초 사본 · 꼬리 reload · 첫 적재 전 fail closed · changed(dmaUserIds) · entries()"
  - "createOrderServerRouting — effectiveOrderServer(지정 enabled · 같은 증권사 ?? 기본) · ownerOf · serversFor(계좌가 실제로 쓰는 서버만)"
  - "SessionManager.acquireOn(userId, target, creds) — (유저, 서버) 키만 · 증권사 색인 미사용 · ownerOf 소유 술어"
  - "DmaSession owns 술어 · allowedAccounts = 소유 뷰 · declaredAccounts = 원본"
  - "WsFanout serversFor 결선 — 인증 · refreshUserSessions 가 대상마다 acquireOn · 미적재 → failed + 1011"
affects: [29-35, 29-36, 29-37, 29-42, 29-43, 29-44]

actuals:
  tokens: 22650
  tasks: 2
  commits: 4
plan_head_before: be3775c819ae35bc3be09a9dee89c405740b2b73
plan_head_after: 8963789c9c2ecbe68d99fb05ac16eab388370394

tech-stack:
  added: []
  patterns:
    - "운영 경로 = (유저, 서버) 키 acquireOn — 옛 acquireFor 증권사 경로는 단위 하네스용으로 남김(29-42 제거)"
    - "세션 소유 뷰 — allowedAccounts 가 호출마다 ownerOf 술어를 다시 묻는다(지정 · 레지스트리 변경을 재로그인 없이 추종)"
    - "라우팅 순수 함수(createOrderServerRouting)를 모듈로 빼 index 결선과 테스트가 같은 코드를 쓴다"

key-files:
  created:
    - relay/src/access/account-order-servers.ts
    - relay/tests/account-order-servers.test.ts
  modified:
    - relay/src/dma/session-manager.ts
    - relay/src/dma/session.ts
    - relay/src/ws/fanout.ts
    - relay/src/index.ts
    - relay/tests/helpers/supabase-stub.ts
    - relay/tests/session-routing.test.ts
    - relay/tests/session.test.ts
    - webapp/e2e/fixtures/relay.ts

key-decisions:
  - "유효 주문 서버 · serversFor 계산을 index.ts 인라인이 아니라 account-order-servers.ts 의 createOrderServerRouting 으로 뺐다 — index 는 top-level await · 부팅 부작용이라 import 불가, 테스트가 운영과 같은 함수를 검증해야 한다(index 는 chosenOf · serversFor 결선만)"
  - "acquireOn 은 옛 acquireFor 재사용 규율을 복제했다(공유 헬퍼로 빼면 acquireFor 본문이 바뀜 — 플랜 금지) · 생성은 #open(대상형)으로 나누고 색인 갱신은 옛 #create 에만"
  - "serversFor 경로에 KB 대상이 없으면(KB 기본 주문 서버 없음) 종전 「KB 주문 서버 없음」 failed + 1011 갈래 — acquireOn 은 null 을 내지 않으므로 계획 단계에서 판정"
  - "FanoutSessions.acquireOn 은 선택 — serversFor 를 줘도 acquireOn 없는 스텁이면 종전 brokersFor 경로(warn 1줄)"
  - "지정 적재 주기는 config.appAccessRefreshMs(접근 맵과 같은 60초 눈금 · e2e 단축 손잡이 공유)"
  - "DmaSession 의 기존 private #declaredAccounts(부트 선언 계좌번호 Set)를 #bootDeclared 로 개명 — 새 공개 게터 declaredAccounts 와 이름 혼동 방지"

patterns-established:
  - "G-1 소유 술어: owns = (acct) => ownerOf(dma, target.broker, acct) === target.serverKey — 세션 서버가 유효 주문 서버인 계좌만"
  - "지정 미반영 fail closed: 지정 서버 매핑에 계좌가 없으면 그 서버 세션을 열지 않고, 다른 서버 세션도 그 계좌를 소유하지 않는다"

requirements-completed: [ADMIN-06]

coverage:
  - id: D1
    description: "계좌별 지정 적재기 — 부팅 즉시 + 60초 + 꼬리 reload · 첫 적재 전 fail closed · 실패 시 직전 유지 · changed 1회 · 행 가드 · 로그는 수만"
    requirement: "ADMIN-06"
    verification:
      - kind: unit
        ref: "relay/tests/account-order-servers.test.ts (11 cases)"
        status: pass
    human_judgment: false
  - id: D2
    description: "DmaSession 소유 뷰 — owns 가 있으면 KB120 allowedAccounts = [B] · declaredAccounts = 원본 · 상태 프레임 · ready 도 소유분 · owns 없으면 종전"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/session.test.ts#⑫ owns 가 있으면 KB120 세션의 allowedAccounts = [B]"
        status: pass
      - kind: integration
        ref: "relay/tests/session.test.ts#⑬ owns 가 없으면 종전과 같다"
        status: pass
    human_judgment: false
  - id: D3
    description: "트레이서 — A→KB121 지정 시 wss 인증이 KB120 · KB121 두 세션(LoginReq 각 1) · A 주문은 KB121 스텁만 · B 는 KB120 스텁만 · 병합 상태 프레임 A · B 각 1"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/session-routing.test.ts#⑥ 트레이서"
        status: pass
    human_judgment: false
  - id: D4
    description: "회귀 · fail closed — 빈 지정 = 종전(KB120 하나) · 적재 전 인증 failed + 1011 · 지정 서버 미반영이면 거부 · 주문 프레임 0 · 87 반영 뒤 refreshUserSessions 가 KB121 을 연다"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/session-routing.test.ts#⑦ ⑧ ⑨"
        status: pass
    human_judgment: false
  - id: D5
    description: "기본 서버 전환(WR-05 운영 경로) — 유예 중 KB120 재사용 없이 새 인증은 KB121 · KB120 유예 만료 소멸 · 같은 (유저, 서버) 재인증은 재사용"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/session-routing.test.ts#⑩ 기본 서버 전환"
        status: pass
    human_judgment: false
  - id: D6
    description: "꺼진 지정 서버 → 기본 서버 소유 · 다시 켜면 지정 복귀 · 다른 증권사 키 지정 무시"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/session-routing.test.ts#⑪ 지정 서버가 꺼지면"
        status: pass
    human_judgment: false
  - id: D7
    description: "옛 acquireFor 경로 무수정 회귀 — session-manager · order-server-notice · ws-order · fanout-access · fanout-multi-session · admin-session-sync · journal-boot · 전체 relay 1308 green"
    verification:
      - kind: unit
        ref: "pnpm --filter @gh-radar/relay exec vitest run --maxWorkers=2 (54 files · 1308 tests)"
        status: pass
    human_judgment: false
  - id: D8
    description: "webapp e2e relay 스텁이 dma_account_order_servers 에 빈 배열을 준다(404 면 relay wss 인증이 전부 1011)"
    verification: []
    human_judgment: true
    rationale: "webapp Playwright e2e 는 이 플랜에서 돌리지 않았다(동시 세션 메모리 규율 · 범위 밖) — 스텁 응답 추가만 했고 실제 e2e 통과는 다음 e2e 회차에서 확인해야 한다"

duration: 10min
completed: 2026-10-10
status: complete
---

# Phase 29 Plan 33: G-1 relay 계좌 기준 라우팅 Summary

**계좌별 주문 서버 지정 적재기(RPC `dma_account_order_servers` 60초 사본 · 꼬리 · fail closed) + (유저, 서버) 키 `acquireOn` + 세션 소유 뷰로, A→KB121 지정 시 relay 가 KB120 · KB121 두 세션을 열고 A 주문은 KB121 스텁에만 보낸다**

## Performance

- **Duration:** ~10 min (기록 시작 14:24:14Z — 그 전 읽기 포함하면 약 15분)
- **Started:** 2026-10-10T14:24:14Z
- **Completed:** 2026-10-10T14:34:00Z
- **Tasks:** 2 (TDD — 커밋 4)
- **Files modified:** 10

## Accomplishments

- `AccountOrderServers` — 부팅 즉시 + 60초 + 꼬리 `reload()`, 첫 적재 전 `loaded=false`(wss 인증 failed + 1011), 실패 시 직전 사본 유지, `changed(dmaUserIds)` 1회, `entries()` 사본, 행 가드(증권사 · `SERVER_KEY_RE` · 빈 값 · 중복). 로그는 수만 싣는다.
- `createOrderServerRouting` — 유효 주문 서버 = 지정(enabled · 같은 증권사) ?? 증권사 기본. `serversFor` 는 계좌가 실제로 쓰는 서버만 연다(지정 서버 매핑에 계좌가 있어야 함). 순서는 KB 먼저, 같은 증권사 안에서는 기본 서버 먼저다. KB 대상이 없으면 KB 기본 서버 1개를 연다. 지정이 0건이면 세션 구성이 종전과 같다.
- `SessionManager.acquireOn` — (유저, 서버) 키로만 찾는다. 증권사 색인은 읽지도 쓰지도 않으므로, 기본 서버가 바뀐 뒤 새 인증은 유예 중인 옛 세션을 재사용하지 않는다(WR-05 운영 경로 해소). `ownerOf` 를 주입하면 세션에 소유 술어가 붙는다.
- `DmaSession` — `allowedAccounts` 는 소유 뷰다(주문 · 83 · 계좌 프레임 · 상태 프레임 · `forAccount` 의 거름 원천 = gh-trade-84 (나)). `declaredAccounts` 는 원본이다. 술어는 호출마다 다시 물어 지정 · 레지스트리 변경을 재로그인 없이 따라간다.
- `WsFanout` — `serversFor` 결선이면 인증과 `refreshUserSessions` 가 대상마다 `acquireOn` 을 부른다. `refreshUserSessions` 는 대상 키에서 이미 쥔 키를 뺀 「빠진 서버 키」 만 연다. 미주입 하네스는 종전 경로 그대로다.

## Task Commits

1. **Task 1 RED: 소유 뷰 · G-1 라우팅 실패 테스트** - `137cdb83` (test)
2. **Task 1 GREEN: 계좌별 주문 서버 라우팅 트레이서** - `7cbe2360` (feat)
3. **Task 2 RED: 지정 적재기 실패 테스트 · 꺼진 지정 서버** - `21f19cf9` (test)
4. **Task 2 GREEN: 변경 이벤트 · 지정 행 사본** - `8963789c` (feat)

**Plan metadata:** (이 SUMMARY 커밋)

## TDD Gate Compliance

- **Task 1 RED** — 목표 `tests/session.test.ts > 소유 뷰 > ⑫` 가 `allowedAccounts` 단언에서 AssertionError 로 실패했다(`[A,B]` ≠ `[B]` — owns 미구현). junit 리포트를 classifier 에 넣어 `RED_EVIDENCE_OK`(target_test_failed)를 받았다. 의미 판정: 계획된 단언 실패이고 로드 · 문법 오류는 없다. 같은 커밋의 session-routing G-1 케이스는 새 모듈 부재로 import 단계에서 실패했다 — 구현 부재가 원인인 예정된 실패라 RED 증거 목표로 쓰지 않았다.
- **Task 1 GREEN** — 검증 묶음 8파일 135 green.
- **Task 2 RED** — 목표 `account-order-servers.test.ts > 재적재 — d1 지정 변경 → changed([d1]) 1회` 가 AssertionError 로 실패했다(이벤트 0건). `RED_EVIDENCE_OK`. 나머지 실패 4건도 `changed` · `entries` 미구현 때문이다. Task 1 이 이미 세운 동작(주기 · 실패 복구 · 꼬리 2종 · close)과 session-routing ⑪(라우팅 판정은 Task 1 결선)은 처음부터 green 이었다.
- **Task 2 GREEN** — 3파일 30 green.
- REFACTOR 커밋은 없다(정리할 것 없음).

## Files Created/Modified

- `relay/src/access/account-order-servers.ts` — 적재기 + 라우팅 순수 함수(신규)
- `relay/tests/account-order-servers.test.ts` — 적재기 11 케이스(신규)
- `relay/src/dma/session-manager.ts` — `ownerOf` 옵션 · `acquireOn` · `#open`(대상형 생성) · G-1 머리 주석
- `relay/src/dma/session.ts` — `owns` 술어 · 소유 뷰 `allowedAccounts` · 원본 `declaredAccounts`
- `relay/src/ws/fanout.ts` — `serversFor` deps · `FanoutSessions.acquireOn?` · 세션 계획(`#sessionPlan` · `#acquireItem` · `#missingSessions`)
- `relay/src/index.ts` — 적재기 생성 · start(접근 맵 옆) · `ownerOf` · `serversFor` 결선 · 종료 close
- `relay/tests/helpers/supabase-stub.ts` — 지정 RPC 응답 · `seedAccountOrderServers` · KNOWN_PATHS
- `relay/tests/session-routing.test.ts` — G-1 ⑥~⑪
- `relay/tests/session.test.ts` — 소유 뷰 ⑫ ⑬
- `webapp/e2e/fixtures/relay.ts` — 지정 RPC 빈 배열 응답

## Decisions Made

- 라우팅 계산을 `createOrderServerRouting` 으로 모듈화했다. `index.ts` 는 top-level await 와 부팅 부작용이 있어 테스트에서 import 할 수 없다. 이렇게 해야 운영과 테스트가 같은 함수를 쓴다. `index.ts` 는 `chosenOf` · `serversFor` · `effectiveOrderServer` 결선만 한다.
- `acquireOn` 의 재사용 규율은 복제했다. 공유 헬퍼로 빼면 옛 `acquireFor` 본문이 바뀌는데, 이는 플랜 금지 사항이다. 29-42 가 옛 경로를 걷어내면 복제는 사라진다.
- `acquireOn` 은 null 을 내지 않는다. 그래서 KB 기본 주문 서버가 없는 경우(대상에 KB 없음)는 fanout 이 루프 전에 판정해 종전 「KB 주문 서버 없음」 failed + 1011 갈래로 보낸다.
- 지정 적재 주기 손잡이는 `config.appAccessRefreshMs` 를 공유한다(같은 60초 눈금).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] webapp e2e relay 스텁에 `dma_account_order_servers` 응답 추가**
- **Found during:** Task 1 (index 결선)
- **Issue:** `webapp/e2e/fixtures/relay.ts` 는 모르는 RPC 에 404 를 준다. relay 가 부팅 때 지정 RPC 를 부르면 첫 적재가 영원히 실패하고(fail closed), e2e 의 wss 인증이 전부 1011 로 끝난다.
- **Fix:** 빈 배열 200 응답 분기와 머리 주석 1줄을 더했다(지정 없음 = 종전 라우팅).
- **Files modified:** webapp/e2e/fixtures/relay.ts (플랜 files_modified 밖)
- **Verification:** 코드 대조만 했다. webapp e2e 는 돌리지 않았다(D8 — human_judgment).
- **Committed in:** 7cbe2360

**2. [Rule 3 - Blocking] relay 테스트 스텁 KNOWN_PATHS 에 지정 RPC 추가**
- **Found during:** Task 1
- **Issue:** journal-boot 가 `unknownRequests() == []` 를 단언하는데, 부팅이 새 RPC 를 부른다.
- **Fix:** `supabase-stub.ts` 에 경로 · 시드 · KNOWN_PATHS 를 추가했다(플랜 files_modified 안).
- **Verification:** journal-boot 11 green · 전체 relay 1308 green.
- **Committed in:** 7cbe2360

**3. [순서 조정] `changed` 이벤트 · `entries()` 를 Task 1 이 아니라 Task 2 GREEN 에서 구현**
- **Issue:** 플랜 Task 1 ① 은 적재기 전부(`changed` · `entries` 포함)를 Task 1 에 둔다. 그대로 하면 Task 2 의 TDD RED 가 「unexpected GREEN」 이 된다.
- **Fix:** Task 1 에는 라우팅에 필요한 핵심만 넣었다(start · ready · loaded · chosenOf · reload 꼬리 · close · 가드 · 직전 유지). 변경 이벤트와 사본은 Task 2 RED → GREEN 으로 옮겼다. 플랜 범위와 산출물은 같다.
- **Committed in:** 8963789c

**4. [Rule 1 - 명료성] `DmaSession` private `#declaredAccounts` → `#bootDeclared` 개명**
- **Issue:** 새 공개 게터 `declaredAccounts`(RelayAccount[] 원본)와 기존 private Set(부트 선언 계좌번호)의 이름이 같아 읽는 사람이 혼동한다.
- **Fix:** private 필드만 개명했다. 동작은 바뀌지 않았다.
- **Committed in:** 7cbe2360

---

**Total deviations:** 4 (Rule 3 2건 · 순서 조정 1건 · 명료성 1건)
**Impact on plan:** 모두 플랜 산출물 그대로이고 범위는 넓어지지 않았다. e2e 스텁 1건은 플랜 파일 목록 밖이지만, 이 플랜의 fail closed 결선이 직접 만든 필수 수정이다.

## Issues Encountered

- 검증 실행 중 `[DMA] 소켓 오류 ECONNREFUSED` warn 로그가 다량 찍혔다. 기존 하네스의 `port: 1` · 닫힌 스텁 재접속 로그이고 단언 실패는 없다(1308 green).
- 운영 영향 메모(플랜 경계 그대로):
  - 지정 사용자에게 옛 「주문 서버 바뀜」 표식이 나갈 수 있다(첫 KB 세션 ≠ 기본 서버일 때).
  - session-sync 의 87 대조가 소유분만 볼 수 있다.
  - hub 의 같은 증권사 다른 서버 세션 처리가 아직 정리되지 않았다.
  - 위 세 가지는 29-42 · 29-35 몫이다. 지정 화면(29-38)과 배포(29-41) 전이라 지정 0건 = 소유 뷰 = 원본이므로 운영 영향은 없다.

## Known Stubs

없음.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 29-35(hub 같은 증권사 두 세션 공존 · 소유 필터 51/66/67/60/64)는 `DmaSession.allowedAccounts`(소유 뷰)를 거름 원천으로 그대로 읽으면 된다.
- 29-36(즉시 재수립)은 `AccountOrderServers` `changed(dmaUserIds)` · `entries()` 와 레지스트리 `changed` 를 구독하면 된다. 이 플랜은 14 · 11(전략 끄기)을 보내지 않는다 — 끄기는 29-43 · 29-36 몫이다.
- 29-37(Admin 지정 경로)은 지정 커밋 뒤 `accountOrderServers.reload()`(꼬리)를 부르면 된다. 내부 reload 라우트 결선은 그 플랜 몫이다.
- 29-42 는 옛 `acquireFor` · `#byUserBroker` · `primaryOf` KB 색인 · `brokersFor` · 「주문 서버 바뀜」 표식을 걷어낸다. `acquireOn` 의 복제된 재사용 규율이 그때 유일본이 된다.
- 인박스 `docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md`(open)는 이 플랜 범위 밖이라 손대지 않았다.

## Self-Check: PASSED

- FOUND: relay/src/access/account-order-servers.ts · relay/tests/account-order-servers.test.ts · session-manager.ts · session.ts · fanout.ts · index.ts
- FOUND commits: 137cdb83 · 7cbe2360 · 21f19cf9 · 8963789c (HEAD 조상) · evaluation-scope resolved(plan-subjects)
- acceptance: `export class AccountOrderServers` 1 · `acquireOn` 5 · `declaredAccounts` 2 · index `serversFor` 5 · `chosenOf` 1 · 전략 끄기 빌더 0 · session-manager.test.ts / order-server-notice.test.ts 무수정 + green · relay/src/generated 무수정

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-10*
