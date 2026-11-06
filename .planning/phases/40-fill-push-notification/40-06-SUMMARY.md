---
phase: 40-fill-push-notification
plan: 06
subsystem: relay
status: complete
tags: [push, relay, notifier, journal, sc-3, tdd]

requires:
  - "40-02 shared pushMessageOf · pushTapPathOf · pushThreadIdOf · PushFacts"
  - "40-01 dma_push_report RPC · 40-05 dma_push_claim RPC(같은 웨이브 — 계약대로 가짜 supabase 로 테스트)"
provides:
  - "relay/src/push/notifier.ts — PushNotifier(enqueueOrders · enqueueStrategy · close · enabled) · PushSender · PushSendMessage · PushSendResult · PushNotifierDeps · PushPipelineView · isPushCandidate · isAutoSellPushEvent · PUSH_SETTLE_MS(400) · PUSH_DEFER_MS(1500)"
  - "AppAccess.userIdsOf(dmaUserId): string[]"
  - "SubscriptionHub.holdingOf(serverKey, accountNo, isin)"
  - "RelayConfig.pushNotify ← env PUSH_NOTIFY"
  - "index.ts pushSenders 배열(40-09 가 APNs · FCM 송신기를 넣는 자리) · wirePipeline 리스너 2줄 · shutdown pushNotifier.close()"
affects: [40-09, 40-12]

tech-stack:
  added: []
  patterns:
    - "applied 두 번째 리스너 = 동기 enqueue + 자기 try/catch(writer 는 emit 을 한 번만 감싼다 — Pitfall 1)"
    - "판정은 DB, relay 는 큐 · 정착 · 단일 비행 · 분배 · 보고만(「보낸 것」 메모리 없음)"
    - "송신기 예외 문자열에서 토큰을 지우고 로그(T-19-14)"

key-files:
  created:
    - relay/src/push/notifier.ts
    - relay/tests/push-notifier.test.ts
    - relay/tests/config-push.test.ts
    - .planning/phases/40-fill-push-notification/tdd-evidence/40-06-task2-red.json
    - .planning/phases/40-fill-push-notification/tdd-evidence/40-06-task3-red.json
  modified:
    - relay/src/access/app-access.ts
    - relay/tests/app-access.test.ts
    - relay/src/config.ts
    - relay/src/hub/subscription-hub.ts
    - relay/tests/account-state.test.ts
    - relay/src/index.ts

key-decisions:
  - "수신자가 없는 계좌의 주문 · 전략 항목은 p_orders · p_strategy 에서 뺀다 — 전부 비면 RPC 0(DB 도 받을 기기 0 이면 체인 행을 쓰지 않으므로 결과는 같고 왕복만 준다)"
  - "짝 대기 재호출은 정착 큐와 따로 도는 타이머(단일 비행 밖) — 판정 RPC 가 체인 표 단조 upsert 라 겹쳐도 한 단계는 한 번만 나간다"
  - "stopRun 을 돌려준 그 한 건은 실제로 보낸 것이라 report 에 넣고, 그 뒤 같은 플랫폼 기기만 건너뛴다"
  - "holdingOf 는 같은 서버 · 계좌 키 중 가장 최근 수신 세션 상태만 본다 — 그 상태에 종목이 없으면 null(더 오래된 세션 값으로 내려가지 않는다)"
  - "보유 평단이 0 이면 holdingAvgPrice 를 얹지 않는다(문안이 「보유 500주」 로 금액을 뺀다)"
  - "PUSH_NOTIFY 검사는 레지스트리 원천 게이트 앞 — 오타는 NODE_ENV 와 무관하게 기동 거부"

requirements-completed: [SC-1, SC-2, SC-3, SC-4]

coverage:
  - id: D1
    description: "적용 행 → 정착 400ms → dma_push_claim(6 인자 · 공유 DMA id 의 두 사용자) → pushMessageOf 문안 · 탭 경로 · 묶음 키 · collapseId=log_id → 송신기 → dma_push_report 1회"
    requirement: SC-1
    verification:
      - kind: unit
        ref: "relay/tests/push-notifier.test.ts#적용 행 → 정착 400ms → dma_push_claim"
        status: pass
    human_judgment: false
  - id: D2
    description: "받는 사람 = 공유 DMA id 의 admin/trader 전부(viewer · 매핑 밖 제외)"
    requirement: SC-4
    verification:
      - kind: unit
        ref: "relay/tests/app-access.test.ts#userIdsOf(Phase 40 D-06 푸시 받는 사람)"
        status: pass
      - kind: unit
        ref: "relay/tests/push-notifier.test.ts#수신자 — 매핑 밖 계좌는 빠지고"
        status: pass
    human_judgment: false
  - id: D3
    description: "예외 격리 — notifier RPC · 송신기 throw 뒤에도 실제 JournalWriter 가 다음 배치를 적용하고 fanout 이 두 배치를 받는다 · enqueue 예외는 로그만 · wirePipeline 리스너가 fanout 줄 뒤 · order/dma/journal/ws diff 0"
    requirement: SC-3
    verification:
      - kind: unit
        ref: "relay/tests/push-notifier.test.ts#예외 격리(SC-3)"
        status: pass
      - kind: other
        ref: "git diff --stat 743784bb -- relay/src/order relay/src/dma relay/src/journal relay/src/ws = 빈 출력"
        status: pass
    human_judgment: false
  - id: D4
    description: "재기동 재생 — claim sends [] 면 송신 0 · report 0(보낸 것 메모리 없음)"
    requirement: SC-2
    verification:
      - kind: unit
        ref: "relay/tests/push-notifier.test.ts#재기동 재생(SC-2)"
        status: pass
    human_judgment: false
  - id: D5
    description: "자동매도 kind 11 · 13 완료 → p_strategy · 보유 조각(D-25) · 비대상 kind RPC 0 · 짝 대기 1.5초 폴백 1회 · 단일 비행 합치기 · claim 재시도 1회 · 429 stopRun"
    verification:
      - kind: unit
        ref: "relay/tests/push-notifier.test.ts#PushNotifier — 자동매도 · 대기 · 단일 비행 · 격리 · 재생 · 중단(Task 3)"
        status: pass
    human_judgment: false
  - id: D6
    description: "PUSH_NOTIFY on/off/기본(production on)/기동 거부 · 꺼짐이면 RPC 0 · hub.holdingOf"
    verification:
      - kind: unit
        ref: "relay/tests/config-push.test.ts"
        status: pass
      - kind: unit
        ref: "relay/tests/account-state.test.ts#Phase 40 D-25 holdingOf"
        status: pass
      - kind: unit
        ref: "relay/tests/push-notifier.test.ts#꺼짐"
        status: pass
    human_judgment: false
  - id: D7
    description: "[push] 로그에 계좌번호 · 토큰 · 사용자 id · DMA id 없음(송신기 예외 문자열의 토큰도 지움)"
    requirement: SC-4
    verification:
      - kind: unit
        ref: "relay/tests/push-notifier.test.ts#T-19-14"
        status: pass
      - kind: other
        ref: "grep -cE 'logger\\.(info|warn|error)\\(\\{[^}]*(accountNo|token|userId)' relay/src/push/notifier.ts = 0"
        status: pass
    human_judgment: false

metrics:
  duration: "약 12분"
  completed: 2026-11-07
duration: 12min
completed: 2026-11-07

estimate:
  tokens: 100000
  tasks: 3
actuals:
  tokens: 19650
  tasks: 3
  commits: 5
plan_head_before: 43ae0da89cf3a70bdf08391d636febece7346ff2
plan_head_after: 9f7b9f27f220f41f8623b0b670fa55ccdc2955f8
---

# Phase 40 Plan 06: relay PushNotifier Summary

**relay 가 적용 행을 받아 게이트웨이 큐(정착 400ms · 단일 비행)로 모은 뒤 판정 RPC `dma_push_claim` 을 부르고, shared 문안으로 송신기에 나눠 주고, `dma_push_report` 로 결과를 한 번에 돌려준다. 송신기 구현(APNs · FCM)은 40-09 몫이고, 주문 · 판정 · 적용 · 팬아웃 코드는 한 줄도 바뀌지 않았다.**

## Performance

- **Duration:** 약 12분 (2026-11-06T23:19:38Z → 2026-11-06T23:31:07Z)
- **Tasks:** 3 (tracer 1 · TDD 2)
- **Files:** 새 파일 3(+ RED 증거 2) · 수정 6

## 결선 위치

`relay/src/index.ts`
- `wirePipeline` — fanout 두 줄 **바로 뒤**:
  ```ts
  p.writer.on("applied", (rows) => pushNotifier.enqueueOrders(p, rows));
  p.strategyWriter.on("applied", (rows) => pushNotifier.enqueueStrategy(p, rows));
  ```
  (함수 안 순서: fanout 2줄 = 2·3행 · 푸시 2줄 = 6·7행)
- `pushNotifier` 생성은 `wirePipeline` 정의 바로 위(첫 `pipelines.sync` 보다 먼저) — `const pushSenders: PushSender[] = []` 를 넘긴다. **40-09 는 이 배열에 config 로 만든 APNs · FCM 송신기를 넣는다.** 지금은 0 개라 운영에서도 `[push] 꺼짐 — 송신기 없음` 1줄 · RPC 0 이다.
- `shutdown` — `pipelines.drainAll` → `pipelines.closeAll()` 바로 뒤 `pushNotifier.close()`.

## 로그 문구(전부 `[push]` 접두 · 키는 gateway · platform · stage · 건수 · 결과 코드만)

| 수준 | 문구 | 때 |
|---|---|---|
| info | `[push] 켜짐 platforms=ios,android` | 생성(켜짐) |
| info | `[push] 꺼짐 — PUSH_NOTIFY off` · `[push] 꺼짐 — 송신기 없음` | 생성(꺼짐) |
| info | `[push] 송신` `{ gateway, sends, devices, ok, failed, removed, deferred, fallback }` | 묶음 끝(sends 또는 deferred 가 있을 때만) |
| warn | `[push] dma_push_claim 실패 — 1회 재시도` | 첫 실패 |
| error | `[push] dma_push_claim 실패 — 이 묶음 건너뜀` | 재시도도 실패 |
| error | `[push] enqueue 예외 — 적용 · 팬아웃 무영향` | 리스너 안 예외 |
| error | `[push] 묶음 예외 — 적용 · 팬아웃 무영향` · `[push] 짝 대기 재호출 예외 — …` | 비동기 경로 예외 |
| error | `[push] 문안 실패 — 이 건 건너뜀` | `pushMessageOf` throw(계약 밖 단계) |
| error | `[push] 송신기 예외 — failed 로 기록` | 송신기 throw(토큰은 `[token]` 으로 지움) |
| warn | `[push] 송신 중단 신호 — 이 묶음의 이 플랫폼 남은 송신 건너뜀` | `stopRun` |
| error | `[push] dma_push_report 실패` | 보고 실패 |
| warn | `[push] 보유 조회 예외 — 보유 조각 없이 보낸다` · `[push] 송신기 close 예외` | 드묾 |

## Accomplishments

- `PushNotifier` — 1차 거름(`isPushCandidate` — M/C 요청 거부 제외 · `isAutoSellPushEvent` — kind 11 · 13 완료) → 게이트웨이 큐 → 수신자(계좌마다 그 서버 매핑의 DMA id → `userIdsOf` 합집합) → 판정 RPC(오류 1회 재시도) → 문안(collapseId = log_id) → 송신(stopRun 처리) → 보고 1회. 짝 대기 1.5초 폴백 1회 · 자동매도 보유 조각(D-25).
- `AppAccess.userIdsOf` — `#byDmaAll` 을 `#replace` 에서 `#byDma` 와 함께 교체(isDmaGranted 행만 · 행 순서 · 사본).
- `SubscriptionHub.holdingOf` — `liveBudgetOf` 와 같은 키 해석 · 최신 수신 세션 · qty > 0.
- `RelayConfig.pushNotify` — `PUSH_NOTIFY` on/off · 없으면 production on · 그 밖 값 기동 거부.

## 테스트 수

- 새 테스트 26건: `push-notifier.test.ts` 18 · `config-push.test.ts` 4 · `account-state.test.ts` +3(holdingOf) · `app-access.test.ts` +1(userIdsOf)
- 플랜 명시 파일 7개 한 번에: `push-notifier · app-access · config-push · account-state · pipelines · journal-writer · fanout` → **7 파일 · 218 통과 · 실패 0**
- 이웃 회귀 `config-quote · config-registry · config-upstreams` → 3 파일 · 22 통과
- `typecheck` · `typecheck:tests` — `error TS` 0

## Task Commits

| Task | 이름 | 커밋 |
|---|---|---|
| 1 (tracer) | 한 길 — enqueueOrders → 정착 → 수신자 → claim → 문안 → 송신기 → report + `userIdsOf` | `3dc776ae` (feat) |
| 2 RED | PUSH_NOTIFY · holdingOf 실패 테스트 | `2a03fabf` (test) |
| 2 GREEN | config · wirePipeline 리스너 · close · holdingOf | `d1da56d2` (feat) |
| 3 RED | 자동매도 · 짝 대기 · 단일 비행 · 격리 · 재생 · 429 테스트 | `b00c049a` (test) |
| 3 GREEN | enqueueStrategy · 보유 조각 · 짝 대기 재호출 | `9f7b9f27` (feat) |

REFACTOR 커밋 없음.

## TDD

- **Task 2 RED** — 대상 `config-push.test.ts > … > 없음 + production → true(운영 기본 켜짐)`: `expected undefined to be true` AssertionError(exit 1) · `gsd-tools check tdd-red-evidence` = `RED_EVIDENCE_OK`(target_test_failed). 의미 판정: 대상이 실제로 실행되어 계획한 단언에서 실패 — `loadConfig` 가 `pushNotify` 를 돌려주지 않는 구현 부재가 원인(로드 · 문법 · 픽스처 오류 아님). 같은 실행에서 holdingOf 3건은 `hub.holdingOf is not a function`(구현 부재).
- **Task 2 GREEN** — 4 + 3 통과.
- **Task 3 RED** — 대상 `push-notifier.test.ts > … > deferred(D-03) …`: `expected [ … ] to have a length of 2 but got 1`(exit 1) · `RED_EVIDENCE_OK`. 의미 판정: 1.5초 뒤 두 번째 claim 이 없어 계획한 단언에서 실패(deferred 무시 — 구현 부재). enqueueStrategy 2건도 단언 실패. claim 재시도 · stopRun · 격리 · 재생 · 로그 케이스는 Task 1 구현(플랜 Task 1 action 이 재시도 · stopRun 을 요구)으로 이미 통과 — 의도된 부분 RED.
- **Task 3 GREEN** — 18/18 통과.
- 증거 파일: `tdd-evidence/40-06-task2-red.json` · `40-06-task3-red.json`(커밋됨). TAP 앞머리 pino 부팅 줄은 `consoleOutput` 칸으로 분리했다.

## Verification

- 수락 기준: `export class PushNotifier` 1 · `userIdsOf(dmaUserId: string): string[]` 1 · 로그 키 계좌/토큰/사용자 grep 0 · wirePipeline 순서(fanout 2·3 < push 6·7) · `pushNotifier.close()` 1 · `holdingOf(serverKey: string, accountNo: string, isin: string)` 1 · `p_allow_fallback: true` 3(≥1 — 머리 주석 · 상수 주석 · 재호출 JSDoc, 코드는 `p_allow_fallback: allowFallback`) · `stopRun` 4 · `new JournalWriter` 1 — 전부 PASS
- SC-3 게이트: `git diff --stat 743784bb -- relay/src/order relay/src/dma relay/src/journal relay/src/ws` 빈 출력
- 플랜 `<verification>` 의 relay **전체** vitest 는 돌리지 않았다 — 이번 실행 지시(동시 executor 3개 · 전체 회귀 금지 · 플랜 명시 파일만)를 따랐다. 플랜이 이름 붙인 7 파일 + 이웃 config 3 파일로 대신했다. 전체 relay 회귀는 웨이브 병합 뒤 한 세션에서 돌릴 몫.

## Decisions Made

frontmatter `key-decisions` 6건 그대로.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 견고성] 송신기 예외 문자열의 토큰 제거**
- **Found during:** Task 1
- **Issue:** 플랜은 송신기 throw 를 failed 로 바꾸라고만 했는데, 그 예외를 로그로 남길 때 송신기 구현(40-09)이 메시지에 토큰을 넣으면 T-19-14 가 깨진다.
- **Fix:** 로그 전에 `String(err).split(token).join("[token]")`. T-19-14 테스트가 토큰이 든 예외로 잠근다.
- **Files modified:** relay/src/push/notifier.ts · relay/tests/push-notifier.test.ts
- **Commit:** `3dc776ae` · `b00c049a`

**2. [Rule 2 - 견고성] 판정 RPC 반환 형식 가드**
- **Found during:** Task 1
- **Issue:** `sends` 가 배열이 아니거나 원소 모양이 어긋나면 송신 루프가 throw 한다.
- **Fix:** `parseClaim` — 배열 아님은 오류로 보고 재시도 경로, 어긋난 send · 기기 원소는 건너뜀(한 원소 때문에 묶음 전체를 버리지 않음 — 40-01 report RPC 와 같은 태도).
- **Files modified:** relay/src/push/notifier.ts
- **Commit:** `3dc776ae`

**3. [Rule 3 - 수락 기준] index.ts 머리 주석 문구**
- **Found during:** Task 2
- **Issue:** 종료 절차 머리 주석에 `pushNotifier.close()` 를 그대로 적어 수락 기준 grep 이 2 가 됐다.
- **Fix:** 주석을 「체결 앱 푸시 닫기(`pushNotifier` · Phase 40)」 로 바꿔 실제 호출 1줄만 남김.
- **Commit:** `d1da56d2`

---

**Total deviations:** 3 auto-fixed (Rule 2 2건 · Rule 3 1건)
**Impact on plan:** 계약 · 이름 · 결선 위치는 플랜 그대로.

## Issues Encountered

- worktree 에 node_modules 가 없어 `pnpm install --frozen-lockfile --prefer-offline`(새 패키지 0) 뒤 `pnpm --filter @gh-radar/shared build`.
- 40-05(판정 RPC)는 같은 웨이브라 실제 DB 와는 붙여 보지 않았다 — RPC 계약 문구(40-05-PLAN <context>) 그대로 가짜 supabase 로 잠갔다. 실 DB 통합은 40-12.

## Known Stubs

- `relay/src/index.ts` `const pushSenders: PushSender[] = []` — 의도된 빈 배열. 40-09 Task 1 · 2 가 APNs · FCM 송신기를 넣는다. 그 전까지 운영 relay 는 `[push] 꺼짐 — 송신기 없음` 1줄 · RPC 0(플랜이 명시한 상태).

## Next Phase Readiness

- 40-09: `PushSender` 인터페이스(`platform` · `send(token, msg)` · `close?()`) 를 구현해 `pushSenders` 에 넣는다. 429 등 한도 신호는 `stopRun: true`, 토큰 무효는 `result: 'token_removed'`. 예외 메시지에 토큰을 넣지 말 것(넣어도 notifier 가 지우지만 2차 방어일 뿐).
- 40-12: 운영 켜기 전 `PUSH_NOTIFY` 를 넣지 않으면 production 기본 on — 비상 끄기는 `PUSH_NOTIFY=off`.

## Self-Check: PASSED

- FOUND: relay/src/push/notifier.ts · relay/tests/push-notifier.test.ts · relay/tests/config-push.test.ts · tdd-evidence/40-06-task2-red.json · tdd-evidence/40-06-task3-red.json
- FOUND commits: 3dc776ae · 2a03fabf · d1da56d2 · b00c049a · 9f7b9f27
