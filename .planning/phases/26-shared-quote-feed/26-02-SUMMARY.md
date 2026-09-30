---
phase: 26-shared-quote-feed
plan: 02
subsystem: relay
tags: [relay, dma, observer, quote-feed, fake-gateway, tcp]

requires:
  - phase: 26-01
    provides: "buildObserverLoginReq({ role }) · parseObserverLoginResp(...).role · FakeObserverLoginRespInput.role · readObserverLoginRequest().role"
provides:
  - "relay/src/quote/feed.ts QuoteFeed — 관찰자 로그인 role 1 시세 전용 연결 상태기계(disabled · connecting · logging_in · ready · rejected · role_mismatch)"
  - "HubQuoteFeed 표면을 구조적으로 만족: isReady · send · on('frame') · on('ready') + state 이벤트 · reconnects · lastFrameAtMs"
  - "스텁 게이트웨이 quote 모드: quoteLoginResp 옵션 · respondQuoteLogin · quoteLoginRequests · waitForQuoteConnection · readSubscribeRequest"
  - "저널 쪽 스텁 목록(observerLoginRequests · waitForObserverConnection)은 role 0 만 본다"
affects: [26-03 tracer, 26-04 boot wiring, 26-06, 26-11 QuoteStatus, e2e fixtures relay.ts]

actuals:
  tokens: 12796
  tasks: 2
  commits: 4
plan_head_before: 33aa08eb8d5bb3f3b4eedc2d2b866e90d55449d3

tech-stack:
  added: []
  patterns:
    - "관찰자 상태기계는 역할별 별도 클래스 — 저널 관찰자(journal/observer.ts)에 role 분기를 넣지 않고 뼈대만 축약 복사"
    - "정지 경로(rejected · role_mismatch)는 #halt 한 곳에서 stopReconnect → destroy → setState 순서 고정"
    - "스텁 게이트웨이는 role 로 로그인 목록을 가른다 — role 1 은 quote 목록 · 소켓, role 0 은 종전 관찰자 목록"

key-files:
  created:
    - relay/src/quote/feed.ts
    - relay/tests/quote-feed.test.ts
    - relay/tests/quote-gateway.test.ts
  modified:
    - relay/tests/helpers/fake-gateway.ts

key-decisions:
  - "QuoteFeed 초기 상태는 disabled(= 아직 시작 안 함) — start() 가 connecting 으로 올려 state 이벤트가 connecting → logging_in → ready 순으로 온전히 나간다"
  - "reconnects 는 down 이 아니라 재-ready 시점에 센다(첫 ready 이후 다시 ready 가 된 횟수) — 로그인까지 성공한 재접속만 healthz 에 드러난다"
  - "QuoteFeed 는 79 만 스스로 소비하고 ready 뒤 나머지(78 포함)는 전부 frame 으로 넘긴다 — 78 · 76 · 83 무시 여부는 hub 명시 case 몫(Open Q2 RESOLVED)"
  - "스텁 quote 79 기본은 role 1 · epoch '' · 계좌 빈 벡터, 거부이고 role 미지정이면 role 0 — 성공이면 빈 78 을 이어 쓴다(ed2e0240 서버 규약)"

patterns-established:
  - "QuoteFeed 로그 태그 [QUOTE] · 로그 인자에 비밀 · 게이트웨이 호스트 없음 — 테스트 afterEach 가 네 레벨 직렬화로 매 케이스 단언"
  - "실 TCP 정지 단언: 재접속 백오프(1s · 2s)보다 긴 2.5s 대기 뒤 quoteLoginRequests 1건"

requirements-completed: []

coverage:
  - id: D1
    description: "QuoteFeed 가 role 1 · client gh-radar-relay/quote · since 0 · epoch '' 로 로그인하고 79(role 1) 에 ready · ready 뒤 프레임만 frame 으로 넘긴다"
    verification:
      - kind: unit
        ref: "relay/tests/quote-feed.test.ts#L1 · L2 · L3"
        status: pass
      - kind: integration
        ref: "relay/tests/quote-gateway.test.ts#G1 role 1 로그인 → quote 목록에만 기록 · ready · 뒤이어 78 이 frame 으로 정확히 1회"
        status: pass
    human_judgment: false
  - id: D2
    description: "거부(79 success=false) → rejected · 구 서버(79 success ∧ role≠1) → role_mismatch — 둘 다 stopReconnect → destroy 순서 · 이후 재로그인 0"
    verification:
      - kind: unit
        ref: "relay/tests/quote-feed.test.ts#L4 · L5"
        status: pass
      - kind: integration
        ref: "relay/tests/quote-gateway.test.ts#G3 · G4"
        status: pass
    human_judgment: false
  - id: D3
    description: "로그인 무응답 → LOGIN_RESP_TIMEOUT_MS 에 dropTransport 1회 · hardClose 뒤 role 1 재로그인 · reconnects 1 · send 는 ready 일 때만"
    verification:
      - kind: unit
        ref: "relay/tests/quote-feed.test.ts#L6 · L7 · L8"
        status: pass
      - kind: integration
        ref: "relay/tests/quote-gateway.test.ts#G5 · G6"
        status: pass
    human_judgment: false
  - id: D4
    description: "비밀 없음 = disabled · 연결 0 (D-17) · 비밀 · 호스트가 logger 네 레벨 어떤 인자에도 없음 (T-19-03 · T-26-05 · T-26-07)"
    verification:
      - kind: unit
        ref: "relay/tests/quote-feed.test.ts#L9 + afterEach 비밀 · 호스트 직렬화 단언(전 케이스)"
        status: pass
      - kind: integration
        ref: "relay/tests/quote-gateway.test.ts afterEach 비밀 직렬화 단언(전 케이스)"
        status: pass
    human_judgment: false
  - id: D5
    description: "스텁 게이트웨이 quote 모드 — role 1 은 quote 목록에만 · 저널 목록/대기는 role 0 만 · readSubscribeRequest 29 되읽기 · 저널 관찰자 테스트 기대값 무변경 green"
    verification:
      - kind: integration
        ref: "relay/tests/quote-gateway.test.ts#G2 · G7 · relay/tests/journal-gateway.test.ts(8건 무변경 green)"
        status: pass
      - kind: other
        ref: "pnpm --filter @gh-radar/shared build && relay typecheck && relay typecheck:tests && webapp typecheck && relay test (32 files · 772 tests)"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-09-30
status: complete
---

# Phase 26 Plan 02: QuoteFeed — 관찰자 로그인 role 1 시세 전용 연결 Summary

**relay 에 `QuoteFeed`(relay/src/quote/feed.ts)를 새로 두어 게이트웨이에 관찰자 role 1 로 붙고, 거부 · 구 서버(role 에코 불일치) · 무응답 · 끊김에서 올바르게 멈추거나 다시 붙게 했다. 스텁 게이트웨이에는 ed2e0240 규약(79 role 에코 → 78 1회)을 흉내 내는 quote 모드를 더해 실 TCP 로 증명했다.**

## Performance

- **Duration:** 약 8분
- **Started:** 2026-09-30T13:05:59Z
- **Completed:** 2026-09-30T13:14:02Z
- **Tasks:** 2
- **Files modified:** 4 (신규 3 · 수정 1)

## QuoteFeed 상태 전이 표

| 현재 | 사건 | 다음 | 부수 동작 |
|---|---|---|---|
| (생성) | — | `disabled` | 아직 시작 안 함 |
| `disabled` | `start()` · 비밀 없음/빈 문자열 | `disabled` | info 로그 · connect 0 (D-17) |
| `disabled` | `start()` · 비밀 있음 | `connecting` | `DmaClient` 1개(주입 없으면) · `connect()` |
| `connecting` | up(현 세대) | `logging_in` | 로그인 송신(role 1 · `gh-radar-relay/quote` · since 0 · epoch "" · strategySince 0) · 로그인 타이머 |
| `logging_in` | 79 success ∧ role 1 | `ready` | 타이머 해제 · `resetReconnectAttempts` · (이전 ready 있었으면 `reconnects += 1`) · `emit("ready", {})` |
| `logging_in` | 79 success=false | `rejected` ■ | error 로그(게이트웨이 문구) · `stopReconnect` → `destroy` |
| `logging_in` | 79 success ∧ role≠1 | `role_mismatch` ■ | error 로그(받은 role) · `stopReconnect` → `destroy` |
| `logging_in` | `LOGIN_RESP_TIMEOUT_MS` 경과 | `connecting` | `dropTransport("quote 로그인 응답 시간 초과")` 1회 |
| `logging_in` · `ready` | down | `connecting` | 타이머 해제 · DmaClient 가 백오프 재접속 |
| `ready` | 79 외 프레임(현 세대) | `ready` | `lastFrameAtMs` 갱신 · `emit("frame", e)` |
| ready 아님 | 79 외 프레임 | 불변 | debug 로그로 버림 |
| ■ 정지 | up · down · 프레임 | 불변 | 재로그인 없음(재시작 전 복구 없음) |
| 아무 상태 | `stop()` | 불변 | 타이머 · 리스너 해제 · `destroy` |

상태가 바뀔 때마다 `"state"` 이벤트(26-11 `QuoteStatus` 구독 대상). getter: `state` · `isReady` · `reconnects` · `lastFrameAtMs`. `send(payload)` 는 ready 일 때만 전송에 넘기고 아니면 false.

## 스텁 게이트웨이 quote 모드 API (`relay/tests/helpers/fake-gateway.ts`)

| API | 뜻 |
|---|---|
| `FakeGatewayOptions.quoteLoginResp?` | role 1 로그인 자동 응답 내용(기본 없음 = 무응답) |
| `respondQuoteLogin(resp \| null)` | 자동 응답 켜기/끄기. 기본 `{ role: 1, accounts: [], epoch: "" }` 위에 얹음 · 거부이고 role 미지정이면 role 0 · 성공이면 빈 78 을 이어 씀 |
| `quoteLoginRequests()` | role 1 `ObserverLoginReq(5)` 전량 |
| `waitForQuoteConnection(timeoutMs = 1000)` | 살아 있는 quote 소켓 또는 다음 role 1 로그인 소켓 (`hardClose` 된 소켓 건너뜀) |
| `readSubscribeRequest(msgType, payload)` (export 함수) | 29 → `{ isin, exchange, subscribe, level }`, 그 밖 null |

role 0 로그인은 종전 `observerLogins` · `observerSockets` · `observerLoginResp` 경로 그대로 — `observerLoginRequests()` · `waitForObserverConnection` 은 저널 연결만 본다.

## 새 테스트

- `relay/tests/quote-feed.test.ts` (FakeTransport 단위 10건): L1 로그인 페이로드 · L2 ready/state 순서/frame · L3 ready 전 프레임·구세대 버림 · L4 거부 정지 순서 · L5 role_mismatch 정지 순서 · L6 로그인 타임아웃 · L7 reconnects · L8 send 게이트 · L9 비밀 없음 disabled · L10 stop/중복 start. afterEach 가 전 케이스 비밀 · 호스트 로그 부재 단언.
- `relay/tests/quote-gateway.test.ts` (실 TCP 7건): G1 role 1 로그인 · 79→78 · 저널 목록 0 · G2 quote/저널 대기 분리 · G3 구 서버 role_mismatch 뒤 2.5초 로그인 1건 · G4 거부 79 role 0 · G5 무응답 logging_in · G6 hardClose 재로그인 reconnects 1 · G7 readSubscribeRequest.

## Accomplishments

- `QuoteFeed` 상태기계 — 저널 관찰자 코드는 한 줄도 바꾸지 않음(`journal/observer.ts` · `session-manager.ts` diff 0)
- 구 서버 role 에코 불일치(Pitfall 2 · T-26-04)를 단위 + 실 TCP 두 층에서 재로그인 0 으로 고정
- 스텁 게이트웨이 quote 모드 — 26-03 트레이서 · 26-06 · e2e 픽스처가 쓸 표면 준비

## Task Commits

1. **Task 1 RED: QuoteFeed 실패 테스트 + 표면 스켈레톤** - `9a6a0b7b` (test)
2. **Task 1 GREEN: QuoteFeed 상태기계** - `adef4358` (feat)
3. **Task 2: 스텁 quote 모드 + 실 TCP 테스트** - `3d8191bf` (test)

**Plan metadata:** 이 SUMMARY 커밋 (docs(26-02))

`commits: 4` 는 `git rev-list --count 33aa08eb..HEAD` 측정값이다 — 그 범위에 동시 세션의 `0b71c4ca fix(theme): 다크 토큰 청색 틴트 제거…` 가 끼어 있어 이 플랜 커밋은 3개다. `tokens` 는 이 플랜 4 파일 diff 만의 chars/4.

## TDD 기록

- **Task 1 RED:** 표면만 있는 스켈레톤(`feed.ts` 동작 없음) 위에서 `quote-feed.test.ts` 실행 — 9건 AssertionError(`expected +0 to be 1` · `expected 'disabled' to be 'ready'` · `'rejected'` · `'role_mismatch'` · `'connecting'` · `expected false to be true` 등). import 실패나 0건 발견이 아닌 의도된 실패. L9(비밀 없음 → disabled)는 스켈레톤 기본값과 우연히 일치해 통과.
- **Task 1 GREEN:** 구현 뒤 첫 실행에서 L9 1건 실패 — 원인은 테스트 하네스(`rig(secret = SECRET)` 기본 매개변수가 `undefined` 를 삼켜 비밀이 채워짐). 옵션 객체로 고쳐 10/10 통과. 구현 결함 아님.
- **Task 2 RED:** 변경 전(HEAD) 스텁으로 `quote-gateway.test.ts` 실행 — 7건 모두 실패(`gateway.respondQuoteLogin is not a function` · `readSubscribeRequest is not a function`). 이 태스크의 「구현」 이 곧 스텁 API 라 RED 는 API 부재 TypeError 로 나타난다(엄밀한 assertion RED 는 아님 — 기록으로 남김). GREEN 뒤 quote-gateway 7 + journal-gateway 8 = 15/15.
- **REFACTOR:** 없음.
- `check tdd-red-evidence` 는 vitest 출력 형식을 못 읽는 알려진 도구 한계라 실행하지 않고 위 실패 출력으로 대신한다.

## Files Created/Modified

- `relay/src/quote/feed.ts` - QuoteFeed · QUOTE_CLIENT_NAME · QUOTE_ROLE · QuoteFeedState · QuoteFeedDeps · QuoteFeedReadyEvent
- `relay/tests/quote-feed.test.ts` - FakeTransport 단위 10건
- `relay/tests/helpers/fake-gateway.ts` - quote 모드 · readSubscribeRequest · 머리 주석 Phase 26 단락
- `relay/tests/quote-gateway.test.ts` - 실 TCP 7건

## Decisions Made

- 초기 상태 `disabled`(시작 전) — `"state"` 이벤트 순서 connecting → logging_in → ready 를 온전히 내기 위함. 부팅(26-04)은 생성 직후 `start()` 하므로 운영에서 「시작 전 disabled」 는 순간뿐이다.
- `reconnects` 는 재-ready 에서 센다(PATTERNS 초안의 down 시 계수 대신 플랜 문언을 따름).
- 79 파손(`parseObserverLoginResp` null)은 warn 후 무시 — 응답 타임아웃이 연결을 다시 세운다.
- 스텁은 relay 의 `QUOTE_ROLE` 을 import 하지 않고 자체 상수(`QUOTE_OBSERVER_ROLE = 1`)를 둔다 — 서버 규약 쪽 값이라 relay 값이 틀리면 테스트가 잡도록.

## Deviations from Plan

None - plan executed exactly as written. (Task 1 GREEN 중 발견한 것은 테스트 하네스의 기본 매개변수 버그였고 같은 태스크 커밋 `adef4358` 에서 고쳤다. feed.ts 는 Task 2 실 TCP 테스트에서 결함이 드러나지 않아 무수정.)

## Issues Encountered

- 실행 중 동시 세션이 master 에 `0b71c4ca`(theme) 을 커밋했고 webapp 파일 2개(card-header.tsx · strategy-card.tsx)와 `webapp/e2e/specs/zz-tmp-card-focus.spec.ts` 를 미커밋 상태로 두었다. 이 플랜 커밋에는 넣지 않았다(경로별 스테이징). webapp typecheck 는 그 상태에서도 0 오류.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 26-03 트레이서: `HubQuoteFeed` 를 선언하면 `QuoteFeed` 가 구조적으로 만족한다(`isReady` · `send` · `on("frame")` · `on("ready")`). 스텁의 `respondQuoteLogin({ success: true })` · `waitForQuoteConnection` · `readSubscribeRequest` 로 「두 사용자 × 같은 종목 → 29 한 벌」 을 실 TCP 로 잴 수 있다.
- 26-04 부팅 결선: `new QuoteFeed({ secret: <D-17 원천>, host, port })` + `start()` / 종료 시 `stop()`.
- 26-11: `"state"` 이벤트 · `reconnects` · `lastFrameAtMs` 가 healthz / QuoteStatus 원천.

---
*Phase: 26-shared-quote-feed*
*Completed: 2026-09-30*

## Self-Check: PASSED

- 파일 4개 존재 · 커밋 9a6a0b7b · adef4358 · 3d8191bf 존재 · 스텁 패턴(TODO/FIXME/placeholder) 0 · acceptance 전 항목 PASS · relay 32 files / 772 tests green
