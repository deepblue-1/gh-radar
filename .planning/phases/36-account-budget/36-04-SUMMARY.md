---
phase: 36-account-budget
plan: 04
subsystem: relay+server
tags: [relay, server, admin, account-budget, op5, op6, op7, d-05, d-07, throttle]

requires:
  - phase: 36-02
    provides: "ADMIN_OP.SetAccountBudget/SetAccountFee · AccountCostCommand · #applyCost · 87 AdminAccount budgetKrw/feePpm/sellTaxPpm · 가짜 게이트웨이 op 6/7(state.costs · legacyCostOps)"
  - phase: 36-03
    provides: "어드민 카드 예수금 · 비용률 행(개요 accounts[].costs 를 그린다 — 지금까지 실서버는 「— · 확인 전」)"
  - phase: 36-10
    provides: "AdminAccountCostsRaw · AdminAccountCostRow · deriveAdminUsersOverview(raw, endpoints, costs) · summarizeAccountCosts 출처 규칙"
provides:
  - "SubscriptionHub.liveBudgetOf(serverKey, accountNo) — 67 캐시 마지막 예수금 · 사용자 무관 · 계좌번호 정규화 대조 · 없으면 null"
  - "relay GET /internal/admin/account-costs — 켜진 서버 전부(KB · 교보) 87 계좌마다 { dmaUserId, accountNo, budgetKrw, feePpm, sellTaxPpm, liveBudgetKrw } · IP/MAC 미적재"
  - "AdminApiDeps.liveBudget? · AdminApiDeps.pipelines…admin.command · ACCOUNT_COSTS_REFRESH_MS 15_000 · ACCOUNT_COSTS_WAIT_MS 800"
  - "AdminDispatcherDeps.liveBudget? · #reloadCosts · costCommand(accountNo, cost) 공통 44 빌더"
  - "RelayAdminClient.accountCosts · server fetchAccountCosts · sanitizeAccountCosts · GET /api/admin/users 응답 accounts[].costs"
  - "테스트 픽스처: FakeAdminState.allowSharedAccounts · AdminDbFake.intentOf 의 isOrder · fake-relay-admin account-costs 기본 응답"
affects: [36-05, 36-08, 36-09]

actuals:
  tokens: 18663
  tasks: 3
  commits: 5
plan_head_before: 8f0863e1664285e8420cb4354a9baece92d19c31
plan_head_after: 322b95c75621f9dabedb8acb31aaba70e73e259e

tech-stack:
  added: []
  patterns:
    - "읽기 라우트의 서버 재조회는 라우터 클로저 상태(서버 → lastAt · inflight)로 스로틀 — 동시 요청은 비행 약속을 공유하고 상한 시간만 기다린 뒤 캐시를 읽는다"
    - "op 3 뒤 서버 간 되싣기는 planner 밖 dispatcher #applyServer 꼬리 — 보내기 직전 87(전 유저) 계좌 집합으로 「이 서버에 처음」 을 가른다"
    - "되싣기 · 카드 표시의 출처 서버 규칙은 resolveEffectiveOrderServer 한 벌(지정 → 증권사 기본 → 단일 등록) · 못 고르면 레지스트리 순 첫 서버"

key-files:
  created: []
  modified:
    - relay/src/hub/subscription-hub.ts
    - relay/src/admin/admin-api.ts
    - relay/src/admin/dispatcher.ts
    - relay/src/index.ts
    - relay/tests/account-state.test.ts
    - relay/tests/admin-api.test.ts
    - relay/tests/admin-dispatcher.test.ts
    - relay/tests/helpers/fake-gateway.ts
    - relay/tests/helpers/admin-db-fake.ts
    - server/src/services/relay-admin-client.ts
    - server/src/routes/admin.ts
    - server/tests/routes/admin.test.ts
    - server/tests/fixtures/fake-relay-admin.ts

key-decisions:
  - "op 5 응답 87 은 AdminConn.#onSnapshot 이 currentSnapshot() 캐시를 갈아 끼운다 — 그래서 account-costs 는 응답 snapshot 을 따로 들고 있지 않고, 기다린 뒤 캐시를 다시 읽는다"
  - "op 5 스로틀은 보낸 시각(lastAt)을 보내는 순간 기록 — 실패(timeout · offline · throw)여도 다음 재시도는 15초 뒤(두드리지 않음)"
  - "되싣기 후보는 같은 (증권사, 정규화 계좌)의 다른 active · 켜진 의도 행 서버 — removing 서버(계좌 이동의 옛 서버)는 출처가 아니다"
  - "출처 87 에 그 계좌가 없거나 87 미수신이면 warn 후 생략 · 되싣기 내부 예외도 warn 으로 삼켜 op 3 결과를 바꾸지 않는다(A5)"
  - "liveBudgetOf 는 계좌번호를 normalizeAccountNo 로 대조한다 — 87(정규화값) · 67 표기 차이를 흡수"

patterns-established:
  - "relay 읽기 엔드포인트가 server 개요에 새 Record 필드를 공급할 때: relay 라우트(감사 없음) → RelayAdminClient(2초 상한) → fetchX(null 폴백 · status 만 로그) + sanitizeX(서버 · 행 단위 버림) → GET /users Promise.all 병렬 → shared 파생 인자"

requirements-completed: []

coverage:
  - id: D1
    description: "hub liveBudgetOf — 66/67 마지막 예수금 · 다른 서버 · 접두 서버 키 · 다른 계좌 null · 67 한도 전용 뒤 새 값 · 0(해제) · 사용자 무관 · 정규화"
    verification:
      - kind: unit
        ref: "relay/tests/account-state.test.ts#Phase 36 D-05 liveBudgetOf (3 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "relay GET /account-costs — KB · 교보 키 · 87 3필드 + live 주입값 · live 0 은 0 · 꺼진 · 87 없는 · 재접속 중 서버 키 없음 · IP/MAC 미적재"
    verification:
      - kind: integration
        ref: "relay/tests/admin-api.test.ts#P36 GET /account-costs (D-05) (C1~C5 · 5 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "op 5 스로틀 — 첫 GET 서버당 1회 · 800ms 안 새 87 · 15초 규칙 · 끝나지 않으면 ~800ms 뒤 캐시(2초 미만) · 동시 GET 비행 공유 · timeout/offline warn 후 캐시"
    verification:
      - kind: integration
        ref: "relay/tests/admin-api.test.ts#P36 account-costs op 5 스로틀 (D-05 · Pitfall 8) (T1~T5 · 5 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Express GET /users costs 병합 — live/snapshot · 500 · throw · 모양 위반 → costs 전부 null · 개요 200 · order-endpoints 와 독립 · Promise.all 병렬 · 행 단위 버림"
    verification:
      - kind: integration
        ref: "server/tests/routes/admin.test.ts#P36 GET /users costs 병합 (D-05) (K1~K6 · 6 tests) · P30 orderEndpoints 병합 E1~E5 회귀 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "op 3 뒤 서버 간 되싣기 — 처음 생긴 계좌만 · 0 생략 · 비용률만 op 7 · 다른 유저 보유 생략 · 지정/기본/레지스트리 순 출처 · 꺼진 출처 제외 · live 우선 · code 1 · offline 비치명 warn 1줄 · op 1 신규 유저 · op 3 failed 0회 · D-04 reconcile 무계획"
    verification:
      - kind: unit
        ref: "relay/tests/admin-dispatcher.test.ts#P36 D-07 op 3 뒤 되싣기 (서버 간 예수금 · 비용률) (13 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "회귀 — relay 전체 · server admin 라우트"
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/relay exec vitest run --maxWorkers=2 → 59 files · 1735 passed · relay typecheck · typecheck:tests · server typecheck exit 0 · server tests/routes/admin*.test.ts 213 passed(admin-dma 1건 흔들림 — 아래 Issues)"
        status: pass
    human_judgment: false
  - id: D7
    description: "실서버 어드민 카드가 실제 예수금(체결 조정 반영) · 비용률을 그린다"
    human_judgment: true
    rationale: "relay · Express 배포(36-09) 뒤 실 gh-trade 87 · 67 로만 확인된다 — 단위 · 통합 테스트는 가짜 게이트웨이까지"

duration: 15min
completed: 2026-10-27
status: complete
---

# Phase 36 Plan 04: 어드민 카드 현재값 공급 + op 3 뒤 서버 간 되싣기 Summary

**relay hub 67 캐시 예수금과 87 비용률이 relay `GET /internal/admin/account-costs` → Express `fetchAccountCosts` → shared `deriveAdminUsersOverview(…, costs)` 로 흘러 개요 `accounts[].costs` 를 채운다(67 live 우선 · 87 폴백). 개요를 열 때마다 서버당 15초에 1번 op 5 로 87 을 다시 받고, 최대 800ms 만 기다린다. 계좌가 새 서버에 처음 생기면 op 3 뒤 다른 서버 값으로 op 6 · op 7 을 이어 보낸다(비치명).**

## Performance

- **Duration:** 약 15분
- **Started:** 2026-10-27T15:08:38Z
- **Completed:** 2026-10-27T15:23:00Z
- **Tasks:** 3 (Task 1 tracer · Task 2 TDD RED → GREEN · Task 3 TDD RED → GREEN)
- **Files modified:** 13

## Accomplishments

- **현재값 한 경로(트레이서):** `SubscriptionHub.liveBudgetOf(serverKey, accountNo)` 는 `#accountStates` 키 `${userId}|${serverKey}|${accountNo}` 에서 서버 · 계좌(정규화)가 맞는 첫 항목의 `budgetKrw ?? 0` 을 돌려주고, 없으면 null 이다. relay `GET /account-costs` 는 켜진 서버 전부(교보 포함)의 87 계좌를 내보내고 `liveBudgetKrw` 를 주입 함수로 채운다. Express 는 RPC · order-endpoints · account-costs 세 왕복을 `Promise.all` 로 돌려 파생 세 번째 인자로 넘긴다.
- **op 5 캐시 갱신 경로 — 캐시 쪽:** op 5 응답 87 은 `AdminConn.#onSnapshot`(admin-conn.ts 428)이 `currentSnapshot()` 캐시를 통째로 갈아 끼운다. 그래서 라우트는 응답 snapshot 을 따로 들고 있지 않고, 비행 중 op 5 를 `Promise.race([allSettled, 800ms])` 로 기다린 뒤 Task 1 의 캐시 읽기를 그대로 탄다. 늦게 온 87 도 캐시에 들어가 다음 GET 이 읽는다.
- **스로틀 상태:** 라우터 클로저 `costRefresh: Map<서버, { lastAt, inflight }>`. `now − lastAt ≥ 15_000` 이고 비행 중이 없을 때만 op 5 를 보낸다. `lastAt` 은 보내는 순간 기록되므로 실패해도 15초 동안 다시 두드리지 않는다. 실패(kind ≠ result · throw)는 `{ server, reason }` warn 1줄이다.
- **되싣기 출처 규칙:** 후보 = 같은 (증권사, 정규화 계좌)의 다른 **active** 의도 행 서버 중 켜진 것(레지스트리 순). 출처 = `resolveEffectiveOrderServer({ designated: 후보 중 isOrder 행, defaultKey: 그 증권사 isOrderServer 켜진 서버, registered: 후보 })` → 못 고르면 첫 후보. 36-10 `summarizeAccountCosts` 와 같은 규칙이다. 출처 87 에서 그 계좌(어느 유저든)를 찾고, 예수금 = `liveBudget(출처) ?? 87` · 비용률 = 87. 예수금 > 0 → op 6, (수수료, 매도세) ≠ (0, 0) → op 7.
- **「처음 생긴 계좌」 판정:** `#applyServer` 가 보내기 직전 87(R3-01 fresh 를 받았으면 그것)의 **전 유저** 계좌 집합을 만든다. op 3 · op 1(계좌)이 ok 이고 그 집합에 없던 계좌만 후보이고, 루프 뒤 실패가 없을 때만 되싣는다. 같은 서버 다른 유저가 가진 계좌는 서버가 값을 복사하므로 집합이 걸러 준다.
- **비치명:** 되싣기 실패는 `{ server, op, code | kind, account: 마스킹 }` warn 1줄뿐이다. 서버 결과 · `dma_admin_results` 기록은 op 3 결과 그대로다(① · ⑥ 테스트가 결과 rev = op 3 의 rev 와 기록 내용을 단언). `#applyCost` 와 되싣기는 44 빌더 `costCommand` 한 벌을 쓴다.

## 테스트 수

| 파일 | 이 플랜 추가 · 수정 |
|---|---|
| `relay/tests/account-state.test.ts` | +3 (Phase 36 D-05 liveBudgetOf) |
| `relay/tests/admin-api.test.ts` | +10 (P36 GET /account-costs C1~C5 · op 5 스로틀 T1~T5) · 하네스 `liveBudget` 옵션 |
| `relay/tests/admin-dispatcher.test.ts` | +13 (P36 D-07 ①②③ ④×4 ⑤ ⑥×2 ⑦ ⑧ D-04) · `snapshotOf` 에 costs 칸 · `setup` extra deps |
| `server/tests/routes/admin.test.ts` | +6 (P36 K1~K6) · P30 E1 의 「relay 호출 정확히 1건」 단언을 경로 필터로 좁힘 |
| relay 전체 | 59 파일 · **1735 passed** |
| server admin 라우트 4파일 | 213 passed |

## Task Commits

1. **Task 1 (tracer):** `a39248ed` feat(36-04): 예수금·비용률 현재값 — 67 live · 87 → account-costs → 개요 costs (트레이서)
2. **Task 2 RED:** `7ae3116d` test(36-04): account-costs op 5 스로틀 RED
3. **Task 2 GREEN:** `cc9a5ace` feat(36-04): account-costs op 5 재조회 스로틀 — 15초 · 800ms · 비행 공유
4. **Task 3 RED:** `3cdc9b5b` test(36-04): op 3 뒤 서버 간 예수금·비용률 되싣기 RED
5. **Task 3 GREEN:** `322b95c7` feat(36-04): op 3 뒤 서버 간 예수금·비용률 되싣기 (D-07)

트레이서 게이트: auto 모드가 아니고, human_verify_mode 는 end-of-phase(기본)이며, `<verify>` 는 자동 검사뿐이다. 그래서 Task 1 verify(relay 3파일 203 · server admin 39 pass)를 다시 확인한 뒤 확장했다.

## TDD Gate Compliance

- **Task 2 RED `7ae3116d`:** T1~T5 5건 모두 계획한 단언에서 실패했다(op 5 횟수 `expected +0 to be 1` · 800ms 대기 `1.67ms ≥ 700` · warn 줄 없음). 대상 T2 를 `LOG_LEVEL=silent … --reporter=tap-flat` 로 다시 돌려 pino 진단 줄을 리포트와 분리했고, `gsd-tools check tdd-red-evidence` 결과는 **RED_EVIDENCE_OK**(target_test_failed)다. 전체 describe 실행의 T5 는 여러 줄 diff 때문에 vitest TAP YAML 이 깨져 대상으로 쓰지 않았다.
- **Task 2 GREEN `cc9a5ace`:** admin-api 76 passed(2회 반복 안정).
- **Task 3 RED `3cdc9b5b`:** ①②④(4건)⑤⑥(2건)⑦ 10건이 계획한 단언(ops `[3]` ≠ `[3, 6, 7]` 등)에서 실패했다. ③ · ⑧ · D-04 는 「되싣기 없음」 을 잠그는 회귀 잠금이라 RED 에서도 통과했다. typecheck:tests 는 `AdminDispatcherDeps.liveBudget` 이 없어 실패했다(계획된 타입 RED). vitest TAP 은 배열 diff 에서 깨지므로 `--reporter=junit --outputFile` 로 다시 돌렸고, 대상 ① 의 판정은 **RED_EVIDENCE_OK**(target_test_failed)다.
- **Task 3 GREEN `322b95c7`:** dispatcher + planner 107 passed · relay 전체 1735 passed.
- REFACTOR 커밋은 없다(`costCommand` 추출은 GREEN 에 포함).

## Decisions Made

frontmatter `key-decisions` 를 참조한다. 핵심은 두 가지다. op 5 응답은 캐시 경로로 받는다. 되싣기 출처에서는 removing 서버를 뺀다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] liveBudgetOf 테스트를 hub.test.ts 대신 account-state.test.ts 에 넣음**
- **Found during:** Task 1
- **Issue:** 66/67 예수금(D-14) 테스트와 그 가짜 세션 · 프레임 헬퍼는 `account-state.test.ts` 에 있다. 플랜도 「hub.test.ts(또는 account-state 계열)」 라고 허용했다.
- **Fix:** `account-state.test.ts` 에 「Phase 36 D-05 liveBudgetOf」 3건을 넣었다. verify 실행에는 `hub.test.ts` 와 함께 이 파일도 포함했다.
- **Commit:** a39248ed

**2. [Rule 3 - Blocking] P30 E1 단언 좁힘 · fake-relay 기본 응답 추가**
- **Found during:** Task 1
- **Issue:** P30 E1 은 `relay.calls` 가 order-endpoints 1건뿐이라고 단언했는데, 이제 account-costs 도 함께 나간다. 가짜 relay 의 기본 응답에는 account-costs 가 없었다(`{ results }` → 모양 위반 warn).
- **Fix:** E1 은 order-endpoints 경로만 필터해 1건을 단언하게 좁혔다(원래 의도 그대로). `fake-relay-admin.ts` 기본 응답에 account-costs → 200 `{ servers: {} }` 를 넣었다.
- **Commit:** a39248ed

**3. [Rule 1 - 픽스처 결함] AdminDbFake.intentOf 가 isOrder 를 싣지 않음**
- **Found during:** Task 3 GREEN(「지정이 KB122 면 KB122 값」 실패)
- **Issue:** 실 RPC `dma_admin_intent`(20261010200100 ⑥)는 `isOrder` 를 싣는데, 가짜 DB 는 `setAccountOrderServer` 로 `isOrder` 를 저장만 하고 의도 조회에서는 빼고 있었다. 그래서 지정 출처 규칙을 테스트할 수 없었다.
- **Fix:** 지정 행만 `isOrder: true` 키를 두게 했다(기존 toEqual 단언 불변 — relay 전체 1735 pass).
- **Commit:** 322b95c7

**4. [Rule 3 - Blocking] 가짜 게이트웨이 `allowSharedAccounts`**
- **Found during:** Task 3 RED
- **Issue:** `defaultAdminHandler` 는 다른 유저가 가진 계좌의 op 3 을 code 7 로 거절한다(옛 규칙). 그래서 behavior 3 「같은 서버 다른 유저 보유 → 생략(서버가 복사 · gh-trade 41)」 을 재현할 수 없었다.
- **Fix:** `FakeAdminState.allowSharedAccounts`(기본 false = 종전)를 opt-in 으로 넣었다. 켜면 op 1 첫 계좌 · op 3 이 공유를 받는다.
- **Commit:** 3cdc9b5b

**Total deviations:** 4 auto-fixed (Rule 1 ×1 · Rule 3 ×3). **Impact:** 범위 확장은 없다. 프로덕션 코드는 플랜 files 그대로이고, 나머지 변경은 테스트 픽스처 3개(fake-gateway · admin-db-fake · fake-relay-admin)뿐이다.

## Issues Encountered

- `server/tests/routes/admin-dma.test.ts` 「relay 409 ORDER_SERVER_NOT_REGISTERED → 409 그대로」 가 4파일 동시 실행에서 한 번 실패했다. 단독 재실행 2회에서는 108 passed 였다. 36-03 SUMMARY 가 기록한 같은 파일의 흔들림과 같은 종류이고, 이 플랜이 건드리지 않은 PUT order-server 경로다.
- vitest `tap-flat` 리포터는 여러 줄 diff(배열 · 객체 toEqual)를 YAML 블록 들여쓰기 없이 내보낸다. 그래서 RED 증거 분류기가 `Malformed TAP` 으로 거절한다. Task 3 은 junit 리포터 파일로 우회했다.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-internal-endpoint | relay/src/admin/admin-api.ts | `GET /internal/admin/account-costs` — X-Relay-Secret 관문 뒤 · Express(requireAdmin)만 부른다. 계좌번호 · DMA id · 예수금을 싣는다(order-endpoints 와 같은 보호 수준 · IP/MAC 은 미적재). 감사 줄은 없다(읽기). |

## Next Phase Readiness

- 36-09 배포 뒤에야 실서버 어드민 카드에 값이 들어온다. relay 와 Express 를 **함께** 배포해야 한다. Express 만 먼저 나가면 relay 404 → costs 전부 null(개요 200)이라 안전하다.
- 실 gh-trade 가 op 3 「다른 유저 보유 계좌 추가」 를 받는지는 서버 몫이다(현재 가짜 게이트웨이는 opt-in 으로만 흉내 낸다).

## Self-Check: PASSED

- FOUND: relay/src/hub/subscription-hub.ts(`liveBudgetOf(`) · relay/src/admin/admin-api.ts(`router.get("/account-costs"` · `export const ACCOUNT_COSTS_REFRESH_MS = 15_000` · `export const ACCOUNT_COSTS_WAIT_MS = 800`) · relay/src/admin/dispatcher.ts(`#reloadCosts(` · `resolveEffectiveOrderServer`) · relay/src/index.ts(`liveBudget: (k, a) => hub.liveBudgetOf(k, a)` ×2) · server/src/routes/admin.ts(`deriveAdminUsersOverview(data as AdminUsersRaw, endpoints, costs)`)
- FOUND commits: a39248ed · 7ae3116d · cc9a5ace · 3cdc9b5b · 322b95c7
