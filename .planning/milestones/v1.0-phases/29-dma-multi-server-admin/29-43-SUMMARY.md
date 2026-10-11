---
phase: 29-dma-multi-server-admin
plan: 43
subsystem: relay
tags: [relay, dma, g-1, strategy-sweep, healthz, admin, tdd]
requires:
  - phase: 29-33
    provides: "SessionManager.acquireOn(userId, target, creds) · (유저, 서버) 세션 키 · AccountOrderServers"
  - phase: 29-42
    provides: "세션 키는 (유저, 서버) 하나 · 증권사 색인 없음 · order.server 표식 경로 제거"
  - phase: 29-29
    provides: "gh-trade-84 답 ②(가) 확정 — 옛 서버에 남은 그 계좌의 활성 전략을 꺼야 한다(경고로는 부족)"
provides:
  - "StrategySweeper.sweep — 옛 서버 세션에서 대상 계좌의 켜진 상따(14 키별) · VI(거래소별 11 run:false)를 끄고 24 · 21×2 재조회로 0 확인"
  - "isActiveLimitChaser — webapp 5스위치 OR autoSellState !== 0 (서버 LimitChaser::IsActive 동형)"
  - "미확인 다섯 갈래(no-session · not-ready · timeout · send-failed · remaining) · 전체 시한 20초"
  - "StaleStrategyRegister — (유저, 서버, 계좌) 미확인 항목 · attempts · byServer"
  - "healthz 본문 accountOrderServers.<키> = { accounts, alerting, staleAccounts } (본문 전용 · 빈 원천이면 키 생략)"
  - "servers/status 서버별 staleAccounts · shared AdminServerLiveStatus.staleAccounts?"
  - "fake-gateway 옵트인 — 거래소별 61(respondViTriggerFor) · 14 처리(handleDisableStrategies) · silenceQuery · readDisableStrategiesKey"
affects: [29-36, 29-38, 29-41, 29-44]
actuals:
  tokens: 33364
  tasks: 3
  commits: 6
plan_head_before: 46c0ceec36699e390ec4f2cfa919cc6c44a45027
plan_head_after: fa4198c6f281567d6693e1d4bcc6a396d6f60e40
tech-stack:
  added: []
  patterns:
    - "세션 프레임 직접 구독(FrameTap) — 기다림 등록은 송신 전, 단계 시한 · 전체 시한(abort)이 같은 정리 경로를 탄다"
    - "VI 61 짝 맞추기 — 미해결 21 은 늘 하나, 빈 61 = 지금 거래소 미등록, 본문 61 은 cfg.exchange 일치만 답(hub FIFO 불사용)"
    - "끄기 결과는 재조회로만 확인 — 65 · 에코는 진행 신호, ok 는 24 · 21×2 재조회 0 일 때만"
key-files:
  created:
    - relay/src/dma/strategy-sweeper.ts
    - relay/tests/strategy-sweeper.test.ts
  modified:
    - relay/tests/helpers/fake-gateway.ts
    - relay/src/order/order-api.ts
    - relay/tests/order-api.test.ts
    - relay/src/admin/admin-api.ts
    - relay/tests/admin-api.test.ts
    - packages/shared/src/admin.ts
    - relay/src/registry/order-journal.ts
key-decisions:
  - "29-43: 끄기 대상 판정 isActiveLimitChaser = webapp 5스위치 OR autoSellState !== 0 — 서버 LimitChaser::IsActive(IsAutoSellActive = m_asState != Off) 동형. webapp 카드 규칙과 다른 이유는 머리 주석"
  - "29-43: VI 는 21 을 KRX → NXT 한 번에 하나씩 보내 짝을 스스로 맞춘다 — 빈 61 에 거래소가 없고 옛 서버가 primary 가 아니면 hub 캐시에 61 이 없다"
  - "29-43: 조립 예외 · send false 는 send-failed 로 즉시 끝낸다(보내지 못한 요청의 응답을 시한까지 기다리지 않는다) · Ready 대기 실패(종료 상태 · 단계 시한)는 not-ready"
  - "29-43: timeout · send-failed 의 remaining 은 마지막으로 읽은 켜진 수(조회 미완이면 null) — 이미 끈 수는 disabledLimitChasers · viDisabled 에 남는다"
  - "29-43: healthz accountOrderServers 는 지정 1건 이상 또는 끄지 못한 계좌가 있는 서버만 · 끄지 못한 계좌만 있는 서버는 accounts 0 · alerting false · 합집합이 비면 키 생략({} 금지)"
  - "29-43: servers/status staleAccounts 는 꺼진(off) 서버 행에도 싣는다 — 꺼진 옛 서버에도 끄지 못한 전략이 남아 있을 수 있다"
  - "29-43: journal(503 축) · brokers(uptime 고정 경로)는 증권사 기본 KB 주문 서버 저널 그대로 — order-journal · order-api 머리 주석에 재검토 기록"
patterns-established:
  - "옛 서버 정리 모듈은 와이어를 바꾸지 않는다 — 14 키별 · 11 run:false · 24/21 조회만, 빈 키 14 · 2 DirectOrderReq 금지"
requirements-completed: [ADMIN-06]
coverage:
  - id: D1
    description: "트레이서 — A 의 켜진 상따 2건 14 · VI(KRX) 11 run:false · 24 · 21(KRX · NXT) 재조회 0 → ok 2/1 · B 전략 · 비활성 상따 무영향 · 2 DirectOrderReq 0건"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/strategy-sweeper.test.ts#① 트레이서"
        status: pass
    human_judgment: false
  - id: D2
    description: "VI 거래소별 보증 — NXT 에만 켜진 VI → 11 × 1(NXT) · 두 거래소 → 11 × 2 · B 계좌 VI → 11 0건 · 21 은 한 번에 하나"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/strategy-sweeper.test.ts#② ③ ④ ⑭"
        status: pass
    human_judgment: false
  - id: D3
    description: "활성 판정 · 세션 — autoSellState 3 · 5스위치 false 도 14 대상 · 세션 없던 사용자 LoginReq 1 · sessionCreated true · release 1 · 0건 멱등 · 두 계좌 · 로그 마스킹"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/strategy-sweeper.test.ts#⑤ ⑥ ⑦ ⑧ ⑨ isActiveLimitChaser"
        status: pass
    human_judgment: false
  - id: D4
    description: "미확인 다섯 갈래 · 전체 시한 — no-session · not-ready · timeout(65 미수신 · 21(NXT) 무응답) · remaining · send-failed · 가짜 타이머 20초 · 리스너 해제 · 실패 warn 1줄"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/strategy-sweeper.test.ts#⑩~⑱"
        status: pass
    human_judgment: false
  - id: D5
    description: "StaleStrategyRegister — 같은 키 두 번 attempts 2 · since 유지 · confirm · pendingFor · byServer"
    requirement: "ADMIN-06"
    verification:
      - kind: unit
        ref: "relay/tests/strategy-sweeper.test.ts#StaleStrategyRegister"
        status: pass
    human_judgment: false
  - id: D6
    description: "healthz accountOrderServers(accounts · alerting · staleAccounts) · 거부여도 200 · 파이프라인 없음 = alerting · deps 주입 · 빈 원천 → 키 없음 · 503 불변"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/order-api.test.ts#Phase 29-43 accountOrderServers (4 cases)"
        status: pass
    human_judgment: false
  - id: D7
    description: "servers/status 서버별 staleAccounts(deps 없으면 0 · off 서버 포함) · shared 선택 필드 · webapp typecheck"
    requirement: "ADMIN-06"
    verification:
      - kind: integration
        ref: "relay/tests/admin-api.test.ts#S3 서버 상태 (3 cases)"
        status: pass
      - kind: other
        ref: "pnpm --filter @gh-radar/webapp run typecheck"
        status: pass
    human_judgment: false
  - id: D8
    description: "fake-gateway 옵트인 보강이 종전 동작을 보존 — 전체 relay 회귀"
    verification:
      - kind: unit
        ref: "pnpm --filter @gh-radar/relay exec vitest run --maxWorkers=2 (55 files · 1355 tests)"
        status: pass
    human_judgment: false
duration: 14min
completed: 2026-10-11
status: complete
---

# Phase 29 Plan 43: 옛 서버 전략 끄기 프로토콜 · 미확인 레지스터 · 관측 본문 Summary

**`StrategySweeper` 가 옛 주문 서버 세션에서 대상 계좌의 켜진 상따(14 키별)와 KRX · NXT 거래소별 VI(11 run:false)를 끄고 24 · 21×2 재조회로 0 을 확인하며, 미확인은 다섯 갈래 이름 붙은 실패로 돌아와 `StaleStrategyRegister` → healthz `accountOrderServers.staleAccounts` · `servers/status.staleAccounts` 로 보인다**

## Performance

- **Duration:** 14 min
- **Started:** 2026-10-10T15:27:13Z
- **Completed:** 2026-10-10T15:40:48Z
- **Tasks:** 3 (TDD — 커밋 6)
- **Files modified:** 9 (+ RED 증거 3)

## Accomplishments

- gh-trade-84 ②(가) 「옛 서버에 남은 그 계좌의 활성 전략을 꺼야 한다」 의 프로토콜 모듈 — 와이어 무변경(14 · 11 · 24 · 21), 빈 키 14 · 미체결 프레임 없음.
- VI 는 거래소별(KRX · NXT) 순차 조회 · 거래소마다 끄기 · 두 거래소 재조회 — 「NXT 에만 켜진 VI」 가 ok 로 접히지 않는다(체커 B1).
- 미확인 다섯 갈래 · 전체 시한 20초 · 끄지 못한 계좌 레지스터. 결선(지정 변경 → 끄기 → 재수립)은 29-36, 재시도 · 백스톱은 29-44.
- healthz 본문 `accountOrderServers` · Admin `servers/status` `staleAccounts` · shared 선택 필드 — 503 축과 uptime 고정 경로는 불변.

## Task Commits

1. **Task 1 RED: StrategySweeper 실패 테스트 · fake-gateway 옵트인 · API 골격** - `c08f78ca` (test)
2. **Task 1 GREEN: StrategySweeper 트레이서(14 키별 · VI 거래소별 11 · 재조회)** - `02cef0ff` (feat)
3. **Task 2 RED: 미확인 갈래 · 전체 시한 · 레지스터 실패 테스트** - `4a035e57` (test)
4. **Task 2 GREEN: not-ready · send-failed · 전체 시한 · StaleStrategyRegister** - `7e27010e` (feat)
5. **Task 3 RED: healthz accountOrderServers · servers/status staleAccounts 실패 테스트** - `0eb4b717` (test)
6. **Task 3 GREEN: healthz · servers/status · shared · order-journal 재검토 기록** - `fa4198c6` (feat)

**Plan metadata:** 이 SUMMARY 커밋 (docs)

## Files Created/Modified

- `relay/src/dma/strategy-sweeper.ts` — StrategySweeper · FrameTap · isActiveLimitChaser · 상수 · StaleStrategyRegister
- `relay/tests/strategy-sweeper.test.ts` — 21 케이스(트레이서 · VI 거래소별 · 활성 판정 · 세션 · 미확인 다섯 갈래 · 전체 시한 · 로그 · 레지스터)
- `relay/tests/helpers/fake-gateway.ts` — 옵트인 거래소별 61 · 11 저장 에코 · 14 처리(apply · respond65) · silenceQuery · readDisableStrategiesKey · limitChaserSeed · viTriggerSlot
- `relay/src/order/order-api.ts` — 선택 deps `accountOrderServers` · `staleStrategies` · 본문 `accountOrderServers` · 머리 G-1 줄 · 판정 근거 ★ 29-43
- `relay/src/admin/admin-api.ts` — `servers/status` 서버별 `staleAccounts` · deps `staleStrategies` · 머리 계약 문단
- `packages/shared/src/admin.ts` — `AdminServerLiveStatus.staleAccounts?: number`
- `relay/src/registry/order-journal.ts` — 머리 주석 G-1 재검토 문단(코드 변경 없음)
- `relay/tests/order-api.test.ts` · `relay/tests/admin-api.test.ts` — 새 케이스 · 기존 S3 단언을 새 계약(`staleAccounts: 0`)으로 갱신

## Decisions Made

- `isActiveLimitChaser` 는 서버 `LimitChaser::IsActive()` 를 비춘다(5스위치 OR `autoSellState !== 0`) — 「서버가 지금 발주할 수 있는가」 가 끄기 판정이라.
- `sessionCreated` 는 acquire 전 `sessionsOf(userId)` 에 그 서버 키 세션이 있었는지로 판정한다(SessionManager 를 고치지 않음).
- `targetOf(serverKey)` 의 증권사가 `target.broker` 와 다르면 `no-session` 으로 fail closed.
- 조립 예외(서버가 준 값이 조립 상한 밖)도 `send-failed` — 끄지 못한 것을 ok 로 접지 않는다.
- healthz: 끄지 못한 계좌만 있는 서버는 `accounts: 0 · alerting: false`(지정이 없어 그 저널을 볼 이유가 없다).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] RED 커밋에 API 골격 모듈 포함**
- **Found during:** Task 1 RED
- **Issue:** 새 모듈을 import 하는 테스트만 커밋하면 RED 가 로드 실패(INVALID_RED `fixture_or_load_failure`)라 GREEN 을 승인받을 수 없다.
- **Fix:** RED 커밋에 타입 · 상수와 「아무것도 보내지 않고 timeout」 을 돌려주는 `sweep` 골격만 넣었다 — 목표 케이스가 결과 단언에서 실패해 `RED_EVIDENCE_OK`.
- **Files modified:** relay/src/dma/strategy-sweeper.ts
- **Committed in:** c08f78ca

**2. [Rule 3 - Blocking] Task 1 / Task 2 경계 — 미확인 갈래 일부를 Task 2 로**
- **Found during:** Task 1 GREEN
- **Issue:** Task 1 에 모든 실패 갈래를 넣으면 Task 2 RED 가 unexpected GREEN 이 된다.
- **Fix:** Task 1 은 no-session · 단계 시한 timeout · remaining(트레이서 정합)까지, not-ready · send-failed · 전체 시한 · 레지스터는 Task 2 RED → GREEN. 산출물 범위는 같다.
- **Committed in:** 02cef0ff · 7e27010e

**3. [Rule 1 - 계약 갱신] admin-api 기존 S3 두 단언에 `staleAccounts: 0` 추가**
- **Found during:** Task 3 RED
- **Issue:** 플랜 계약 「deps 없으면 0」 이 서버 항목 모양을 넓혀, 기존 `toEqual` 두 건이 새 계약과 맞지 않는다.
- **Fix:** 기존 단언을 새 모양으로 갱신(의미 변경 없음).
- **Committed in:** 0eb4b717

---

**Total deviations:** 3 auto-fixed (2 blocking · 1 계약 갱신)
**Impact on plan:** TDD 게이트를 통과시키기 위한 순서 조정과 계약 반영뿐 — 범위 확장 없음.

## TDD Gate Compliance

- **Task 1 RED** — 목표 `strategy-sweeper.test.ts > ① 트레이서` 가 결과 단언(`toEqual ok 2/1`)에서 AssertionError(골격이 timeout 반환). junit 리포트 → classifier `RED_EVIDENCE_OK`(target_test_failed). 의미 판정: 계획된 단언 실패 · 로드 · 문법 오류 없음(10 케이스 수집).
- **Task 2 RED** — 목표 `⑪ not-ready` 가 reason 단언에서 실패(Task 1 은 Ready 실패를 timeout 으로 접음). `RED_EVIDENCE_OK`. send-failed · 전체 시한은 테스트 시한 초과, 레지스터 2건은 미구현(not a constructor)으로 실패. 나머지 Task 2 케이스는 Task 1 동작이라 처음부터 green.
- **Task 3 RED** — 목표 `order-api > accountOrderServers.<키> = …` 가 본문 단언에서 실패(키 undefined). `RED_EVIDENCE_OK`. 「deps 주입 · 빈 원천 → 키 없음」 은 종전 본문과 같아 처음부터 green(회귀 고정).
- 증거: `.planning/phases/29-dma-multi-server-admin/.red/29-43-task{1,2,3}-red.json`. REFACTOR 커밋 없음(정리할 것 없음).

## Issues Encountered

- 플랜 read_first 의 gh-trade `LimitChaser.h` 행 번호(985-993 · 1099-1127)는 지금 1035 · 1149 행이다 — 머리 주석은 행 번호 대신 함수 이름으로 적었다.
- 플랜 verify 의 타이머 규율(가짜 타이머 20초)은 ⑰ 한 케이스에만 썼고, 나머지 시한 케이스는 `stepTimeoutMs` 주입(200ms · 실 타이머)으로 짧게 돌렸다.

## Known Stubs

없음. `accountOrderServers` · `staleStrategies` deps 의 index 결선은 플랜대로 29-36 몫이다(선택 deps — 주지 않으면 종전 본문).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 29-36 이 `StrategySweeper` 로 「지정 변경 → 옛 서버 끄기 → 재수립 → 25→66 재동기」 를 결선하고, 실패를 `StaleStrategyRegister.set` 에, 성공을 `confirm` 에 넣은 뒤 index 에서 `order-api` · `admin-api` deps 를 주입하면 healthz · Admin 카드가 같은 수를 본다.
- 29-44: 연결 없는 사용자 · 백스톱 · 재시도는 레지스터 `pendingFor` · `attempts` 위에서.
- ADMIN-06 플래그 가정(G-1 대체)은 29-40 REQUIREMENTS 등록 때 문구 정정 — 그대로 유효.
- `docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md`(open)는 이 플랜 범위 밖이라 손대지 않았다.

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-11*

## Self-Check: PASSED

- 파일: strategy-sweeper.ts · strategy-sweeper.test.ts 존재
- 커밋 6개(c08f78ca · 02cef0ff · 4a035e57 · 7e27010e · 0eb4b717 · fa4198c6) HEAD 조상 · evaluation-scope resolved
- 태스크 acceptance grep 전부 통과 · 플랜 verification(6 테스트 파일 · webapp typecheck) · 전체 relay 1355 green
