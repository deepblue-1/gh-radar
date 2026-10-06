---
phase: 29-dma-multi-server-admin
plan: 23
subsystem: relay
tags: [relay, quote, admin, break-then-make, internal-http, fake-gateway, d-11]
status: complete

requires:
  - phase: 29-11
    provides: "relay /internal/admin/* 라우터 · AdminIntentStore · 감사 로그 · quoteStatus.serverKey() 칩 원천"
  - phase: 29-13
    provides: "Express PUT /api/admin/servers/:key/quote-primary → relay POST 프록시(400/404/409 그대로 · 나머지 502)"
  - phase: 29-22
    provides: "레지스트리 changed 결선 자리(index) · 현재 주문 서버 원천 패턴"
provides:
  - "QuoteSwitch — quote 연결 안정 래퍼(hub · QuoteStatus 재결선 없음) · switchTo(server) break-then-make · 실패 복귀 · 단일 비행 · 무동작"
  - "QuoteSwitch.reconcileWithRegistry(registry, restore) — DB 시세 주 서버가 다른 경로로 바뀌면 같은 전환 · 실패 시 DB 되돌림"
  - "POST /internal/admin/servers/:key/quote-primary — 200 { ok: true } · 404 NO_SUCH_SERVER · 409 SERVER_DISABLED · QUOTE_SWITCH_FAILED · QUOTE_SWITCH_BUSY · 500 QUOTE_PRIMARY_DB_FAILED"
  - "AdminIntentStore.setQuotePrimary(key) — RPC dma_admin_set_quote_primary"
  - "QUOTE_SWITCH_READY_TIMEOUT_MS = 10_000"
affects: [29-24, 29-25]

actuals:
  tokens: 13661
  tasks: 2
  commits: 2
plan_head_before: 072a842495e8e915c0fadabb280c33fdd00c2042
plan_head_after: bb07d07cada9455a9f9f7fef976c3038844ab676

tech-stack:
  added: []
  patterns:
    - "안정 래퍼 + 안쪽 객체 교체 — 소비자(hub · status)는 부팅 때 한 번 결선, 이벤트는 `this.#feed === feed` 세대 가드로만 재방출"
    - "전환 창 상태 덮기 — 새 서버의 rejected · role_mismatch 를 밖에 비추지 않고 래퍼는 connecting(503 즉시 알림 · 거부 로그 알림 방지)"
    - "레지스트리 보정은 「직전에 본 레지스트리 값」 과 비교 — 낡은 재적재가 막 옮긴 연결을 되돌리지 않는다"

key-files:
  created:
    - relay/src/quote/quote-switch.ts
    - relay/tests/quote-switch.test.ts
  modified:
    - relay/src/admin/admin-api.ts
    - relay/src/admin/intent-store.ts
    - relay/src/index.ts
    - relay/tests/admin-api.test.ts
    - relay/tests/helpers/admin-db-fake.ts

key-decisions:
  - "실패 응답은 옛 서버 재연결을 시작한 직후 돌려준다(옛 서버 ready 를 기다리지 않는다) — Express relay 호출 상한 12초 안에 ready 상한 10초 + 복귀가 들어가야 한다. 옛 서버 ready → hub 재구독은 평소 경로로 뒤따른다"
  - "전환 창 동안 래퍼 state=connecting · isReady=false · 안쪽 상태 이벤트 침묵 — 새 서버 거부가 /healthz 즉시 503 · 거부 error 알림으로 새지 않게. 배지는 QuoteStatus 3초 디바운스 그대로"
  - "그 증권사 quote 비밀이 없으면 옛 연결을 끊지 않고 즉시 QUOTE_SWITCH_FAILED — 비밀 없는 feed 는 disabled 로 남아 10초를 헛되이 쓰고 시세가 끊긴다"
  - "전환 성공 뒤 DB 반영(RPC)이 실패하면 연결을 옛 서버로 되돌리고 500 QUOTE_PRIMARY_DB_FAILED(Express 는 502 RELAY_FAILED) — DB 와 연결이 갈라진 채 남지 않게"
  - "같은 서버 요청은 연결 무동작이지만 DB 가 다른 서버를 가리키면 RPC 1회로 맞춘다 — 화면 라디오가 실제 연결과 갈라진 채 남지 않게"
  - "성공 뒤 relay 가 registry.reload() 를 스스로 건다(fire-and-forget) — Express quote-primary 경로는 재적재를 부르지 않는다"
  - "보정은 change.roles 일 때만 · 레지스트리 값이 직전에 본 값과 같으면 무동작 — admin 전환 직후 RPC 커밋 전에 시작된 재적재가 낡은 값을 가져와도 연결을 되돌리지 않는다"
  - "reconnects = 교체된 feed 누적 + 지금 feed 값 · 전환 뒤 첫 ready 도 1 센다(ready 복귀)"

patterns-established:
  - "relay 내부 경로의 오류 message 는 화면이 그대로 보이는 한국어 문장(29-18) — 「새 서버 로그인 실패 — KB120 으로 되돌림」"

requirements-completed: [ADMIN-07]

coverage:
  - id: D1
    description: "트레이서 — KB120 → KYOBO119 break-then-make · 교보 비밀 role 1 로그인 · 같은 키 두 벌이 새 서버에만(재구독 1회) · 옛 서버 새 요청 0 · 새 스텁 로그인 순간 옛 스텁 살아 있는 소켓 0 · 상태 connecting → ready · QuoteStatus 같은 래퍼"
    requirement: ADMIN-07
    verification:
      - kind: integration
        ref: "relay/tests/quote-switch.test.ts#W1 (스텁 2대 · 실 DmaClient · 실 QuoteFeed · 실 hub · 실 QuoteStatus)"
        status: pass
    human_judgment: false
  - id: D2
    description: "내부 HTTP — POST /internal/admin/servers/KYOBO119/quote-primary → 전환 → RPC dma_admin_set_quote_primary('KYOBO119') 1회 → 200 { ok: true } · 레지스트리 재적재 1회 · 감사 1줄"
    requirement: ADMIN-07
    verification:
      - kind: integration
        ref: "relay/tests/quote-switch.test.ts#W2 (실 http.Server + 실 AdminIntentStore ↔ AdminDbFake)"
        status: pass
    human_judgment: false
  - id: D3
    description: "실패 복귀 — 79 거부 · role 0 · 무응답(상한) → 새 연결 닫고 KB120 재로그인 · 재구독 · QUOTE_SWITCH_FAILED 원문 · rejected 상태 비침 없음 / BUSY · 같은 서버 무동작 · 비밀 없음 즉시 실패"
    requirement: ADMIN-07
    verification:
      - kind: integration
        ref: "relay/tests/quote-switch.test.ts#F1~F6"
        status: pass
    human_judgment: false
  - id: D4
    description: "레지스트리 보정 — DB 가 다른 경로로 바뀜 → 자동 전환 · 실패 → restore(현재 서버) 1회 + error 로그 · 낡은 재적재는 무동작"
    requirement: ADMIN-07
    verification:
      - kind: integration
        ref: "relay/tests/quote-switch.test.ts#R1~R3"
        status: pass
    human_judgment: false
  - id: D5
    description: "라우트 거부 경로 — 409 QUOTE_SWITCH_FAILED/BUSY(RPC 0) · 404 NO_SUCH_SERVER · 409 SERVER_DISABLED · 400 형식 · 무동작 RPC 0 / DB 갈라짐 RPC 1 · DB 반영 실패 → 되돌림 + 500"
    requirement: ADMIN-07
    verification:
      - kind: integration
        ref: "relay/tests/admin-api.test.ts#Q1~Q5"
        status: pass
    human_judgment: false
  - id: D6
    description: "회귀 — relay 전체 단위(51 files · 1249 tests) · e2e P28-1 · P28-1b(env 모드 로컬 relay quote 경로)"
    verification:
      - kind: integration
        ref: "pnpm --filter @gh-radar/relay run test"
        status: pass
      - kind: e2e
        ref: "playwright e2e/specs/trading-workbench.spec.ts -g P28-1"
        status: pass
    human_judgment: false
  - id: D7
    description: "운영 실서버(KB120 ↔ KYOBO119 실 게이트웨이) 전환 · Admin 화면 → Express → relay 실제 왕복"
    verification: []
    human_judgment: true
    rationale: "relay 배포는 29-25 빅뱅 — 이 플랜은 스텁 게이트웨이 2대 · 메모리 RPC 로만 증명했다. 실 게이트웨이의 로그인 지연이 10초 상한 안인지는 배포 뒤 확인"

duration: 8min
completed: 2026-10-07
---

# Phase 29 Plan 23: 시세 주 서버 즉시 전환 (break-then-make · 실패 복귀) Summary

**quote 연결이 이제 안정 래퍼 `QuoteSwitch` 뒤에 있다. Admin 이 시세 주 서버를 바꾸면 relay 는 옛 연결을 닫고 새 서버에 그 증권사 비밀로 role 1 로그인한다. ready 가 되면 hub 가 같은 키를 한 번에 다시 구독하고, DB 는 그 뒤에만 바뀐다. 새 서버가 거부하거나, 역할이 다르거나, 10초 안에 ready 가 없으면 옛 서버로 다시 붙고 409 「새 서버 로그인 실패 — KB120 으로 되돌림」 을 돌려준다.**

## Performance

- **Duration:** 약 8분
- **Started:** 2026-10-06T19:45:02Z
- **Completed:** 2026-10-06T19:53:19Z
- **Tasks:** 2 (트레이서 1 · TDD 1)
- **Files:** 신규 2 · 수정 5

## Accomplishments

- **트레이서(Task 1):** `QuoteSwitch` 는 hub 표면(`isReady` · `send` · frame/ready)과 QuoteStatus 표면(`state` · `reconnects` · `lastFrameAtMs` · state 이벤트)을 같은 객체로 제공하고, 전환 때 안쪽 `QuoteFeed` 만 바꾼다. index 는 `hub.attachFeed(quoteSwitch)` · `new QuoteStatus({ feed: quoteSwitch })` 로 한 번 결선하고, 서버 카드 시세 칩 원천을 `quoteSwitch.currentServerKey` 로 바꿨다. 내부 경로 `POST /internal/admin/servers/:key/quote-primary` 는 레지스트리 확인 → 전환 → 성공 뒤 RPC → 레지스트리 재적재 순서다. 트레이서 `<verify>` 를 다시 돌려 통과를 확인한 뒤 확장했다.
- **실패 · 보정(Task 2):** 거부 · 역할 불일치 · 상한 초과는 새 연결을 닫고 옛 서버로 다시 연결한 뒤 실패를 돌려준다. 전환 중 두 번째 요청은 `QUOTE_SWITCH_BUSY` 다. 같은 서버 요청은 무동작이다. 레지스트리 재적재에서 DB 시세 주 서버가 다른 경로로 바뀐 것이 보이면 같은 방식으로 맞추고, 실패하면 DB 를 지금 연결 서버로 되돌린다.

## 전환 시간 측정 (스텁 · 루프백)

| 경로 | 측정 |
|---|---|
| KB120 → KYOBO119 성공(`switchTo` 호출 → ready) | 1ms (W1 `[measure]` 출력 · 루프백 스텁이라 하한값) |
| 거부 · 역할 불일치 → 실패 응답 | F1 · F2 테스트 전체 24~26ms(복귀 재구독까지 포함) |
| 무응답 → 실패 응답 | 주입 상한 300ms + 수 ms (운영 상한 10초) |

실서버의 로그인 지연은 이 표에 없다. 29-25 배포 뒤 relay 로그 `[QUOTE] 시세 주 서버 전환 완료` 의 `elapsedMs` 로 확인한다.

## Task Commits

1. **Task 1: 트레이서 — QuoteSwitch · break-then-make · 재구독 · DB 반영 · 내부 HTTP** — `b1876360` (feat)
2. **Task 2: 실패 복귀 · 단일 비행 · 레지스트리 보정 · 같은 서버 무동작** — `bb07d07c` (feat)

## Files Created/Modified

- `relay/src/quote/quote-switch.ts` — 신규 · 안정 래퍼 · switchTo · reconcileWithRegistry
- `relay/src/admin/admin-api.ts` — quote-primary 경로 · `quoteSwitch` 의존성 · 감사 `server` 칸
- `relay/src/admin/intent-store.ts` — `setQuotePrimary(key)`
- `relay/src/index.ts` — QuoteFeed 직접 결선 → QuoteSwitch · `changed.roles` 보정 · 종료 절차 `quoteSwitch.stop()`
- `relay/tests/quote-switch.test.ts` — 신규 · W1~W2 · F1~F6 · R1~R3
- `relay/tests/admin-api.test.ts` — Q1~Q5 · 하네스 `quoteSwitch` · `quotePrimary` 옵션
- `relay/tests/helpers/admin-db-fake.ts` — `dma_admin_set_quote_primary`(없는 키 P0002)

## TDD Gate Compliance

- Task 2 RED: R1~R3 이 `s.reconcileWithRegistry is not a function` 으로 실패(typecheck:tests 에서도 TS2339) — 보정 메서드를 Task 1 커밋에서 빼 두었다.
- GREEN: 메서드와 index 결선을 넣은 뒤 quote-switch 11건 · admin-api 전체 green.
- F1~F6 과 Q1~Q5 는 처음부터 green 이었다. 실패 복귀는 Task 1 의 `switchTo` 설계(대기 → 실패면 되돌림) 안에 있어 따로 떼어 낼 수 없었다. 이 테스트들은 회귀 고정이다.
- RED 와 GREEN 은 한 커밋(`bb07d07c`)이다 — 플랜 action ③ 이 「relay 전체 green 뒤 한 커밋」 을 지시했다.

## Decisions Made

frontmatter `key-decisions` 참조. 핵심은 두 가지다. 실패 응답은 옛 서버 재연결을 시작한 직후 돌려준다(Express 12초 상한). 레지스트리 보정은 「직전에 본 레지스트리 값」 과 비교한다(낡은 재적재가 연결을 되돌리지 않게).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 정합성] 전환 성공 뒤 DB 반영 실패 시 연결 되돌림**
- **Found during:** Task 1
- **Issue:** 플랜은 성공 뒤 RPC 만 적었다. RPC 가 실패하면 연결은 새 서버인데 DB 는 옛 서버로 남는다. 그러면 화면과 다음 보정이 갈라진다.
- **Fix:** RPC 실패면 `switchTo(옛 서버)` 로 되돌리고 500 `QUOTE_PRIMARY_DB_FAILED`(Express 는 502). 테스트 Q5.
- **Files modified:** relay/src/admin/admin-api.ts
- **Commit:** b1876360

**2. [Rule 2 - 정합성] 비밀 없는 증권사로의 전환을 끊기 전에 거절**
- **Found during:** Task 1
- **Issue:** 그 증권사 quote 비밀이 없으면 새 feed 가 disabled 로 남는다. 그대로 두면 옛 연결을 끊은 채 10초를 기다리다 되돌린다.
- **Fix:** 끊기 전에 비밀을 확인하고 바로 `QUOTE_SWITCH_FAILED`. 테스트 F6.
- **Files modified:** relay/src/quote/quote-switch.ts
- **Commit:** b1876360

**3. [Rule 1 - 버그 예방] 전환 성공 뒤 레지스트리 즉시 재적재 · 보정 기준을 「직전에 본 값」 으로**
- **Found during:** Task 1 · 2
- **Issue:** Express quote-primary 경로는 재적재를 부르지 않는다(29-13). 플랜 문장 「DB ≠ 현재 연결이면 전환」 을 그대로 쓰면, RPC 커밋 전에 시작된 재적재가 역할 변경과 겹칠 때 막 옮긴 연결을 옛 서버로 되돌린다.
- **Fix:** relay 가 성공 뒤 `registry.reload()` 를 건다. 보정은 레지스트리 값이 직전에 본 값과 다를 때만 동작한다. 테스트 W2(재적재 1회) · R3.
- **Files modified:** relay/src/admin/admin-api.ts · relay/src/quote/quote-switch.ts
- **Commits:** b1876360 · bb07d07c

**4. [플랜 문장 조정] 실패 응답은 옛 서버 ready 를 기다리지 않는다**
- **Issue:** 플랜 behavior 순서는 「옛 서버 ready → 재구독 → 실패 응답」 이다. 그러나 무응답 경로는 10초 + 복귀 시간이 걸려 Express 상한 12초를 넘길 수 있다.
- **Fix:** 실패 응답은 복귀 연결을 시작한 직후에 돌려준다. 옛 서버 ready → 재구독은 평소 경로로 뒤따른다. 테스트(F1~F3 · R2)는 응답 뒤 KB120 ready · 재구독 · 로그인 2건을 기다려 단언한다.
- **Files modified:** relay/src/quote/quote-switch.ts
- **Commit:** b1876360

**5. [Rule 3 - 차단] admin-api.test.ts 하네스에 `quoteSwitch` 대역 추가(Task 1)**
- **Issue:** `AdminApiDeps.quoteSwitch` 가 필수가 되면서 기존 하네스의 typecheck:tests 가 깨졌다.
- **Fix:** 무동작 성공 대역을 기본값으로 넣었다(Task 1 files 목록 밖이지만 Task 2 대상 파일이다).
- **Commit:** b1876360

## Issues Encountered

없음.

## Known Stubs

없음.

## Next Phase Readiness

- **29-24 · 29-25:** relay 내부 계약 표(29-11)의 마지막 칸이 채워졌다. `POST /internal/admin/servers/:key/quote-primary` 의 응답은 200 `{ ok: true }` · 404 `NO_SUCH_SERVER` · 409 `SERVER_DISABLED` · `QUOTE_SWITCH_FAILED` · `QUOTE_SWITCH_BUSY` · 500 `QUOTE_PRIMARY_DB_FAILED` 다. Express(29-13)의 `toProxyResult([400, 404, 409])` 와 맞는다.
- 운영 relay 는 29-25 빅뱅 전까지 재배포하지 않았다. 배포 뒤 Admin 화면에서 시세 라디오를 한 번 옮겨 `elapsedMs` 와 배지 적색 → 녹색 복귀를 확인한다.

## Self-Check: PASSED

- FOUND: relay/src/quote/quote-switch.ts · relay/tests/quote-switch.test.ts
- FOUND: b1876360 · bb07d07c (HEAD 조상)
