---
phase: 26-shared-quote-feed
plan: 10
subsystem: relay
tags: [relay, hub, quote-feed, pacing, pitfall-3, notice-queue, tdd]

requires:
  - phase: 26-09
    provides: "구독 한도(전역 2000 · 사용자 200) · #releaseKey 의 linger 먼저 해제 · HL1~HL7"
  - phase: 26-08
    provides: "linger(#lingering · #releaseKey(key, reason, sendUnsubscribe)) · resubscribeAll 의 linger 정리"
  - phase: 26-06
    provides: "quote-gateway 「실 hub 결선」 describe(hardClose 재접속 합집합 재구독 · 송신 집합 afterEach)"
provides:
  - "relay/src/hub/subscribe-pacer.ts — SubscribePacer · PACER_WINDOW(32) · PACER_TIMEOUT_MS(3_000) · PacerControlKind"
  - "SubscribePacer API: subscribe(key, isin, ex, level) · control(key, payload, unsubscribe|demote) · onResponse(key, msgType) · trackUntilIdle() · reset() · stats() {queued, inFlight, timeouts}"
  - "hub #pacer — #sendSubscribe · 강등 · 해제 · 58/69 응답 · ready 합집합 재구독 · feed 교체 · closeAll 결선"
  - "hub 로그: 「합집합 재구독 시작」 {keys, lingerReleased} · 「합집합 재구독 완료」 {keys, elapsedMs, timeouts} · 「합집합 재구독 중단」 {keys, elapsedMs, timeouts, queued, inFlight}"
affects: [26-11 nudge (넛지 29 는 창 밖 control 경로로 태울 수 있다), 26-12 healthz (pacer stats 노출 후보)]

actuals:
  tokens: 14600
  tasks: 2
  commits: 4
plan_head_before: 0866b590989e36e823cb92c6a20c7dd97c996417

tech-stack:
  added: []
  patterns:
    - "업스트림 요청 burst 는 in-flight 창 큐로 흘린다 — 응답(Notice)이 오는 요청만 창을 점유하고, 응답 없는 제어 프레임은 창 밖 즉시"
    - "대기 큐는 Map(삽입 순서 = FIFO) — level 갱신은 자리를 유지하고, 미송신 항목의 해제는 프레임 없이 삭제"
    - "타임아웃 타이머는 기다리는 쪽이 있을 때만 1개(가장 이른 기한) — 평시 경로에 키 수만큼 타이머를 쌓지 않고, 기한 지난 항목은 다음 요청이 쓸어낸다"

key-files:
  created:
    - relay/src/hub/subscribe-pacer.ts
    - relay/tests/subscribe-pacer.test.ts
  modified:
    - relay/src/hub/subscription-hub.ts
    - relay/tests/hub.test.ts
    - relay/tests/quote-gateway.test.ts

key-decisions:
  - "창 32 키 · 타임아웃 3초는 RESEARCH A5 가정값이다 — 재구독 시작/완료 로그(키 수 · 소요 ms · 타임아웃 수)로 실측 조정한다"
  - "FULL 키 슬롯은 69(가장 큰 Notice)에만, PRICE 키 슬롯은 58 에만 풀린다. 59 · 71 푸시는 창과 무관하다"
  - "응답 없는 29(해제 false · 강등 level 1)는 창 밖 즉시 송신, in-flight 키 해제면 슬롯도 푼다. 대기 중 키의 해제는 프레임 0, 강등은 대기 항목 level 만 바꾼다 — 서버 FIFO 가정(A10)"
  - "in-flight 키의 PRICE→FULL 승격은 같은 슬롯에서 곧바로 재송신(창 추가 점유 없음)하고 기다리는 응답을 69 로 바꾼다"
  - "페이서 타이머는 대기열에 키가 있거나 trackUntilIdle(합집합 재구독 완료 추적) 중일 때만 1개 — 평시 구독이 타이머를 쌓지 않아 기존 타이머 수 단언이 수정 없이 green"
  - "resubscribeAll 은 reset 뒤 합집합을 넣고 trackUntilIdle 로 완료를 잰다. 끝나기 전 재접속이면 중단 로그 1줄 뒤 처음부터 다시 한다. feed 교체 · closeAll 도 reset 한다"

patterns-established:
  - "재접속 복구 burst 단언: 실 TCP 스텁이 받은 28 수가 창에서 멈추는지 + 응답 주입 1쌍에 정확히 1키 전진하는지로 창 상한을 본다"

requirements-completed: []

coverage:
  - id: D1
    description: "SubscribePacer 창 32 — 키 100 구독이면 28 은 32 개만, FULL 키는 58 로는 안 풀리고 69 에 풀려 33번째 키 28 · 29 · 32, PRICE 키는 58 에 풀림(28 · 29(1)만)"
    verification:
      - kind: unit
        ref: "relay/tests/subscribe-pacer.test.ts#P1 · P2 · P3"
        status: pass
    human_judgment: false
  - id: D2
    description: "응답 없이 3초 → 슬롯 해제 · 다음 키 · stats().timeouts 증가, 타이머는 기다리는 쪽이 있을 때만 1개, 기한 지난 in-flight 는 다음 subscribe 가 쓸어낸다, trackUntilIdle 이면 idle 을 타임아웃으로 확정"
    verification:
      - kind: unit
        ref: "relay/tests/subscribe-pacer.test.ts#P4 · P4b"
        status: pass
    human_judgment: false
  - id: D3
    description: "대기 중 키: 해제 프레임 0 · 승격 level 만 full · 강등 level 만 price(FIFO 유지). in-flight · 구독된 키의 29(false) · 29(1)는 즉시 · 창 점유 0 · in-flight 해제면 슬롯 반환. in-flight 승격은 같은 슬롯 재송신"
    verification:
      - kind: unit
        ref: "relay/tests/subscribe-pacer.test.ts#P5 · P6 · P7"
        status: pass
    human_judgment: false
  - id: D4
    description: "isReady 거짓이면 펌프 정지 · 항목 유지, reset 은 대기열 · in-flight · 타이머를 비움, onIdle 은 비는 순간 1회"
    verification:
      - kind: unit
        ref: "relay/tests/subscribe-pacer.test.ts#P8 · P9"
        status: pass
    human_judgment: false
  - id: D5
    description: "hub — 키 100 보유 · quote ready → 28 은 32 개만, 69 · 타임아웃에 따라 33 → 65 → 97 → 100, 시작/완료 로그 각 1줄({keys:100, elapsedMs:12000, timeouts:99}) · 키마다 29 정확히 1건"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#합집합 재구독 페이싱 (Pitfall 3) PH1"
        status: pass
    human_judgment: false
  - id: D6
    description: "hub — 평시 0→1 도 같은 창(PRICE 58 · FULL 69), 대기 중 해제 · 강등 프레임 0, in-flight 해제 29(false) 즉시 + 슬롯 반환, 재접속 중단 로그 1 · 처음부터 32 키, closeAll 정리"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#합집합 재구독 페이싱 (Pitfall 3) PH2 · PH3 · PH4 · PH5"
        status: pass
    human_judgment: false
  - id: D7
    description: "26-09 2000 키 한도 테스트가 가짜 시계로 대기열을 비운 뒤에도 같은 결론(거부 키 송신 0 · 29 누적 2000 · linger 먼저 해제 순서)"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#구독 한도 (D-11 · D-15) HL2 · HL3"
        status: pass
    human_judgment: false
  - id: D8
    description: "실 TCP — 키 100 보유 · hardClose → role 1 재로그인 → 게이트웨이가 받은 28 이 32 에서 멈추고, 첫 키 58 만으로는 불변, 58 + 69 로 33(중복 0) · 송신 집합 ⊆ {4,5,28,29,32}"
    verification:
      - kind: integration
        ref: "relay/tests/quote-gateway.test.ts#실 hub 결선 H4"
        status: pass
    human_judgment: false
  - id: D9
    description: "운영 환경에서 창 32 · 타임아웃 3초(A5 가정)가 서버 Notice 큐 한도 안에서 충분히 빨리 복구되는지 — 재구독 완료 로그 실측"
    verification: []
    human_judgment: true
    rationale: "실 게이트웨이의 69 크기 · 응답 지연은 스텁으로 재현할 수 없다. 배포 뒤 「합집합 재구독 완료」 로그의 elapsedMs · timeouts 로 판단해야 한다"

duration: 13min
completed: 2026-09-30
status: complete
---

# Phase 26 Plan 10: 재구독 페이싱 (Pitfall 3) Summary

**quote 연결로 나가는 시세 요청(28 · 29 · 32)은 이제 전부 `SubscribePacer` 의 in-flight 창을 거친다. 한 번에 32 키까지만 나가고, 그 키의 응답(FULL 은 69, PRICE 는 58)이 오거나 3초가 지나야 다음 키가 나간다. 그래서 재접속 뒤 최대 2000 키 합집합 재구독이 서버 Notice 큐(1024 프레임 / 4MB)를 넘겨 끊김 → 재접속 → 끊김 루프로 번지지 않는다. 응답이 없는 29(해제 · 강등)는 창을 점유하지 않고 즉시 나가고, 재구독 시작 · 완료는 로그 1줄씩 남는다.**

## Performance

- **Duration:** 약 13분
- **Started:** 2026-09-30T14:34:51Z
- **Completed:** 2026-09-30T14:47:44Z
- **Tasks:** 2 (둘 다 TDD — RED test → GREEN feat)
- **Files modified:** 5 (신규 2 · 수정 3)

## 창 · 타임아웃 값과 가정

| 항목 | 값 | 근거 · 가정 |
|---|---|---|
| `PACER_WINDOW` | 32 키 | RESEARCH A5 (ASSUMED). 창 하나의 응답 ≈ 32 × (58 + 69 ≈ 10KB 대)로 4MB · 1024 프레임보다 훨씬 작다 |
| `PACER_TIMEOUT_MS` | 3_000 | RESEARCH A5 (ASSUMED). 막힘 방지용이고 실패로 보지 않는다(`stats().timeouts` 로 센다) |
| 슬롯 해제 응답 | FULL = 69 · PRICE = 58 | FULL 은 69 가 가장 큰 Notice 라서 58 로는 풀지 않는다. 59 · 71 푸시는 창과 무관하다 |
| 순서 | 서버 FIFO | RESEARCH A10 (ASSUMED — 단일 명령 큐 구조로 추론). 이미 보낸 키의 29 를 즉시 보내도 앞선 28/29/32 뒤에 처리된다고 본다. 대기열도 FIFO 로 꺼낸다 |
| 서버 한도 (VERIFIED) | `kSendQueueMaxFrames = 1024` · `kSendQueueMaxBytes = 4 MiB` (Gateway.h:72-73) · `kMaxPendingCommands = 8192` | 페이서 머리 주석에 원문을 인용했다 |

조정 방법: 배포 뒤 `[HUB] 합집합 재구독 완료` 로그의 `{ keys, elapsedMs, timeouts }` 를 본다. `timeouts` 가 크면 응답이 느린 것이니 창을 줄이거나 타임아웃을 늘린다. `elapsedMs` 가 크고 timeouts 가 0 이면 창을 키울 여지가 있다. `[HUB] 합집합 재구독 중단` 이 반복되면 끊김 루프 신호다.

## 결선 지점 (hub)

| hub 자리 | 전 (26-09) | 후 (26-10) |
|---|---|---|
| `#sendSubscribe` (0→1 · 승격 · 재구독) | 28 → 29 → (full) 32 직접 `feed.send` | `#pacer.subscribe(key, isin, ex, level)`. feed 없음 · 미Ready 기록 갈래는 그대로 |
| `unsubscribe` FULL→PRICE 강등 | 29(1) 직접 | `#pacer.control(key, 29(1), "demote")` |
| `#resumeFromLinger` FULL→PRICE 강등 | 29(1) 직접 | `#pacer.control(key, 29(1), "demote")` |
| `#releaseKey` 해제 | 29(false) 직접 | `#pacer.control(key, 29(false), "unsubscribe")`. 대기 중 키면 프레임 0 |
| `#onFeedFrame` 58 | `#onQuote` | `#onQuote` 뒤 `#pacer.onResponse(key, 58)` (59 는 호출 안 함) |
| `#onFeedFrame` 69 | `#onTape` | `#onTape` 뒤 `#pacer.onResponse(key, 69)` (71 은 호출 안 함) |
| `resubscribeAll` (feed ready) | 합집합 for 루프 즉시 송신 | 진행 중이면 중단 로그 → `#pacer.reset()` → linger 정리 → 시작 로그 → 키마다 `#sendSubscribe` → `trackUntilIdle()`. 완료 로그는 `onIdle` 에서 |
| `attachFeed` 교체 | warn | warn + `#pacer.reset()` |
| `closeAll` | — | `#pacer.reset()` · 진행 기록 null |
| 헤더 「하지 않는 것」 | 「구독 요청을 큐잉하지 않는다」 | 「구독 요청은 in-flight 창 큐를 거친다(Pitfall 3)」 |

사용하지 않게 된 `buildGetQuoteReq` · `buildGetTradeTapeReq` import 와 `levelByte` 헬퍼는 hub 에서 지웠다. level 바이트 규칙(`"price"` 만 PRICE, 그 밖은 FULL)은 페이서 `#dispatch` 로 옮겼다.

## 새 테스트 이름

- `relay/tests/subscribe-pacer.test.ts` — `describe("SubscribePacer — in-flight 창 · 응답/타임아웃 · 대기 병합 (Pitfall 3)")`
  - P1 상수는 A5 가정값이다 — 창 32 키 · 타임아웃 3초
  - P2 창 32 — 키 100 개 구독이면 28 은 32 개만 나가고, FULL 키는 58 로는 슬롯이 안 풀리고 69 에 풀려 33번째 키 28 · 29 · 32 가 나간다
  - P3 PRICE 키는 58 에 슬롯이 풀린다 — 28 · 29(level=1) 만 나가고 32 는 없다
  - P4 응답 없이 3초가 지나면 그 키 슬롯을 풀고 다음 키를 보낸다 — stats().timeouts +1
  - P4b trackUntilIdle — 대기열이 비어도 in-flight 기한을 타이머로 재어 응답이 끝내 없으면 타임아웃으로 idle 을 확정한다
  - P5 대기 중(미송신) 키 — 해제는 송신 0 · 대기열에서 빠진다 / price→full 재요청은 level 만 full / 강등은 level 만 price
  - P6 in-flight · 이미 구독된 키의 해제 29(false) · 강등 29(1)은 즉시 나가고 창을 점유하지 않는다 — in-flight 해제면 슬롯도 풀린다
  - P7 in-flight 키의 PRICE→FULL 승격은 같은 슬롯에서 곧바로 28 · 29(0) · 32 를 다시 보내고 69 를 기다린다
  - P8 isReady 가 거짓이면 펌프가 멈추고 항목은 남는다 · reset() 은 대기열 · in-flight · 타이머를 비운다
  - P9 onIdle — 대기열과 창이 모두 비는 순간(응답 · 타임아웃 · 대기 해제) 1회씩 부른다
- `relay/tests/hub.test.ts` — `describe("합집합 재구독 페이싱 (Pitfall 3)")`
  - PH1 키 100 개 보유 상태에서 quote ready → 28 은 32 개만 · 69 응답 · 타임아웃에 따라 늘고 · 시작/완료 로그 1줄씩
  - PH2 평시 0→1 도 같은 창을 거친다 — PRICE 키는 58 에 · FULL 키는 69 에 다음 키가 나가고, 재구독 로그는 없다
  - PH3 대기 중 키의 해제는 프레임 0 · 대기 중 강등은 level 만 · in-flight 키의 해제는 29(false) 즉시 + 슬롯 반환
  - PH4 재구독 도중 다시 끊겼다 붙으면 옛 창 · 대기열을 버리고 새 연결에 처음부터 32 키씩 — 중단 로그 1 · 완료 로그 1
  - PH5 closeAll 이 페이서를 비운다 — 대기 · in-flight 타이머가 뒤늦게 아무것도 보내지 않는다
  - (보정) 26-09 HL2 · HL3 — `drainPacer()`(가짜 시계를 송신이 멈출 때까지 3초씩)로 대기열을 비운 뒤 같은 결론. HL2 에 「29 누적 2000」 단언을 더했다
- `relay/tests/quote-gateway.test.ts` — 「실 hub 결선」 describe
  - H4 키 100 개 보유 · hardClose → role 1 재로그인 → 게이트웨이가 받은 28 은 32 개에서 멈추고, 첫 키에 58 + 69 를 밀면 33 개가 된다 (Pitfall 3)

## TDD 기록

- **Task 1 RED** (`1671c6d9`): 테스트와 빈 골격(상수 0 · no-op 메서드)을 함께 커밋했다. 모듈이 로드되는 상태에서 P1~P9 9건이 모두 단언에서 실패했다. 예: `expected +0 to be 32`, `expected [] to deeply equal [ [ 28, null, null ], [ 29, true, 1 ] ]`, `expected { queued: +0, … } to match object { queued: 3, … }`. 골격 없이 먼저 돌렸을 때는 `Cannot find module` 로 실패했는데, 이것은 INVALID_RED 라서 골격을 두고 다시 확인했다.
- **Task 1 GREEN** (`e9cf577d`): 9/9 통과. typecheck(src · tests) 오류 0.
- **Task 2 RED** (`ab72c00e`): PH1~PH4 가 단언에서 실패했다(`expected […100] to have a length of 32 but got 100` · `got 34` · `expected 102 to be 96` · `got 50`). H4 는 `조건이 서지 않았습니다: 첫 연결 창 32` 로 실패했다(100 키가 한꺼번에 가서 32 에서 멈추는 상태가 오지 않음). PH5 · HL2 · HL3 은 회귀 방지 단언이라 RED 에서도 통과했다.
- **Task 2 GREEN** (`9fd1be7f`): hub 결선 뒤 relay 전체 **34 files · 841 tests** green. quote-gateway · fanout 실 TCP 는 3회 반복해도 82/82 였다.
- `check tdd-red-evidence` 는 vitest 출력을 파싱하지 못한다(알려진 툴링 제약). 그래서 관찰한 실패 출력을 여기에 적었다. REFACTOR 커밋은 없다.

## Task Commits

1. **Task 1 RED: SubscribePacer 실패 테스트** - `1671c6d9` (test)
2. **Task 1 GREEN: SubscribePacer — in-flight 창 · 응답/타임아웃 · 대기 병합** - `e9cf577d` (feat)
3. **Task 2 RED: 재구독 페이싱 hub 결선 실패 테스트 · 실 TCP 창 상한** - `ab72c00e` (test)
4. **Task 2 GREEN: 재구독 in-flight 창 페이싱 결선** - `9fd1be7f` (feat)

`actuals.commits: 4` 는 `git rev-list --count 0866b590..HEAD` 로 잰 값이다.

## Files Created/Modified

- `relay/src/hub/subscribe-pacer.ts` (신규) — `SubscribePacer` · `PACER_WINDOW` · `PACER_TIMEOUT_MS` · `PacerControlKind` · `SubscribePacerDeps` · `SubscribePacerStats`. 머리 주석에 서버 원문 수치 · 창 방식 · 창 밖 29 · A10 · A5 를 적었다
- `relay/tests/subscribe-pacer.test.ts` (신규) — P1~P9 · P4b
- `relay/src/hub/subscription-hub.ts` — `#pacer` · `#resubscribeRun` · `#onPacerIdle` · 위 결선 표 · 헤더 갱신 · 안 쓰는 import · `levelByte` 제거
- `relay/tests/hub.test.ts` — `합집합 재구독 페이싱 (Pitfall 3)` PH1~PH5 · 구독 한도 `drainPacer` 보정
- `relay/tests/quote-gateway.test.ts` — H4 · 헤더 설명 · import(`buildQuoteStateFrame` · `buildTradeTapeFrame` · `PACER_WINDOW`)

## Decisions Made

- 대기열은 `Map` 이다. 삽입 순서가 FIFO 이고 level 을 바꿔도 자리가 그대로이며, 해제는 O(1) 로 지운다.
- in-flight 승격은 새 슬롯을 잡지 않고 같은 슬롯에서 재송신한다. 새 슬롯을 기다리게 하면 평시 승격이 3초까지 늦어질 수 있다.
- 준비되지 않은 연결에서 in-flight 키를 다시 요청하면, 그 in-flight 를 버리고 대기열로 옮긴다. 대기열과 in-flight 에 동시에 있는 상태를 만들지 않기 위해서다(끊긴 연결의 서버 구독은 이미 없다).
- 완료 로그는 합집합 재구독에만 남긴다. 평시 구독은 idle 이 돼도 로그하지 않는다(`#resubscribeRun` 이 null).
- `stats().timeouts` 는 누적 값이라 `reset` 으로 지우지 않는다. 재구독 로그는 시작 시점 값과의 차이로 그 회차의 타임아웃 수를 적는다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 페이서 타이머를 키마다 걸면 기존 타이머 수 단언 8건이 깨짐 → 「기다리는 쪽이 있을 때만 타이머 1개」 로 바꿈**
- **Found during:** Task 2 (hub 결선 직후 hub.test 실행)
- **Issue:** Task 1 은 in-flight 키마다 3초 타이머를 걸었다. hub 에 결선하자 평시 FULL 구독 하나마다 타이머가 하나씩 늘었다. 그래서 PRICE 판정 P4 · P6 · P9 · P10 · P11 · P12 · P13 과 linger LG10 의 `vi.getTimerCount()` 단언이 실패했다. 계획은 「창보다 적은 키만 쓰는 기존 테스트는 수정 없이 green」 을 요구한다. 또 운영에서도 평시 구독마다 쓸모없는 타이머가 키 수만큼 쌓인다.
- **Fix:** in-flight 에는 기한(`deadline`)만 기록한다. 대기열에 키가 있거나 `trackUntilIdle()` 로 재구독 완료를 추적할 때만, 가장 이른 기한에 타이머 1개를 건다. 기한이 지난 in-flight 는 다음 `subscribe` 가 먼저 쓸어낸다. 기다리는 쪽이 없을 때는 타임아웃을 앞당겨 처리해도 결과가 같다. hub `resubscribeAll` 은 키를 넣은 뒤 `trackUntilIdle()` 을 부른다.
- **Files modified:** relay/src/hub/subscribe-pacer.ts, relay/src/hub/subscription-hub.ts, relay/tests/subscribe-pacer.test.ts (P4 꼬리를 새 의미로 고치고 P4b 추가)
- **Verification:** 기존 타이머 수 단언 8건은 수정 없이 green 이다. relay 전체 841 green.
- **Committed in:** 9fd1be7f

**2. [Rule 2 - Missing Critical] feed 교체 · 재구독 중 재접속의 페이서 정리 + 중단 로그**
- **Found during:** Task 2
- **Issue:** 계획은 ready 에서의 reset 과 closeAll 만 명시했다. 하지만 `attachFeed` 로 feed 가 교체되면, 옛 연결 in-flight 는 응답이 오지 않는 채 창을 점유한다. 또 재구독이 끝나기 전에 다시 끊겼다 붙으면 첫 회차는 완료 로그 없이 사라진다.
- **Fix:** `attachFeed` 교체 시 `#pacer.reset()`. `resubscribeAll` 진입 시 진행 중 회차가 있으면 `[HUB] 합집합 재구독 중단` 로그 1줄(`keys · elapsedMs · timeouts · queued · inFlight`)을 남긴다.
- **Files modified:** relay/src/hub/subscription-hub.ts
- **Verification:** PH4
- **Committed in:** 9fd1be7f

**3. [Rule 3 - Blocking] 페이서 deps 에 `tapeCount` · `onIdle` 추가**
- **Found during:** Task 1
- **Issue:** 계획의 deps 는 `{ isReady, send, window?, timeoutMs? }` 다. 그런데 32 요청 건수(`TAPE_REQUEST_COUNT`)는 hub 에 있어서, 페이서가 hub 를 import 하면 순환 import 가 된다. 완료 로그를 낼 idle 신호도 없었다.
- **Fix:** `tapeCount?`(기본 = 파서 상한 `MAX_TAPE_ENTRY_COUNT` · hub 는 `TAPE_REQUEST_COUNT` 전달 · 둘은 같은 200)와 `onIdle?` 을 더했다.
- **Committed in:** e9cf577d

---

**Total deviations:** 3 auto-fixed (1 bug · 1 missing critical · 1 blocking)
**Impact on plan:** 범위 확장은 없다. 1 은 계획의 「기존 테스트 수정 없이 green」 을 지키면서 운영 타이머 누적도 없앴다. 2 · 3 은 계획한 로그와 결선을 완결하려는 보강이다.

## Issues Encountered

- 골격 없는 첫 RED 는 `Cannot find module` 이었다(INVALID_RED). 상수 0 · no-op 메서드 골격을 같은 test 커밋에 넣고 다시 돌려 단언 실패를 확인했다.
- orchestrator 가 master main tree 순차 실행을 지정했다. 그래서 26-01~09 와 같이 master 에 커밋했고 push 는 하지 않았다. 커밋 직전마다 `git status -sb` · `git diff --cached --stat` 으로 내 파일만 스테이징됐는지 확인했다. untracked(`milestone.lock` · `shots/` · `research/.cache/`)는 건드리지 않았다. 사용자 전역 규칙에 따라 Co-Authored-By 는 넣지 않았다.

## Known Stubs

없음.

## Threat Flags

없음. 새 네트워크 표면이나 인증 경로를 만들지 않았다. T-26-16(창 32 · 응답/3초 · 실 TCP H4 가 창 상한을 단언)과 T-26-17(재구독 시작 · 완료 · 중단 로그)을 적용했다.

## User Setup Required

없음. 외부 서비스 설정이 필요 없다.

## Next Phase Readiness

- 26-11 (83 넛지): 넛지 29(subscribe=true · 같은 실효 level)는 응답이 없으므로 창을 점유하지 않아야 한다(RESEARCH 넛지 권고). `#pacer.control(key, payload, "demote")` 는 대기 중 키의 level 을 price 로 바꾸는 의미라서 넛지에 그대로 쓰면 안 된다. 넛지용 kind(예: `"nudge"` — 대기 중이면 no-op, 그 밖은 즉시 송신)를 추가하는 것이 맞다.
- 26-12 (healthz): 필요하면 `#pacer.stats()`(queued · inFlight · timeouts)를 `HubStats` 에 노출하면 된다. 이 플랜에서는 `HubStats` 모양을 바꾸지 않았다.
- 배포 후 확인: 장중 quote 재접속 때 `[HUB] 합집합 재구독 완료` 로그의 `elapsedMs · timeouts` 로 A5 값을 점검한다(D9 · human_judgment).

---
*Phase: 26-shared-quote-feed*
*Completed: 2026-09-30*

## Self-Check: PASSED

- 파일 5개 존재 · 커밋 `1671c6d9` · `e9cf577d` · `ab72c00e` · `9fd1be7f` 존재
- Task 1 acceptance: `PACER_WINDOW = 32` 1 · `PACER_TIMEOUT_MS = 3_000` 1 · it( 10
- Task 2 acceptance: `#pacer` 16 · `onResponse(` 2 · `#sendSubscribe` 안 `buildGetQuoteReq` 0 · 「합집합 재구독 페이싱 (Pitfall 3)」 1 · relay 34 files / 841 tests 실패 0
- relay typecheck · typecheck:tests 오류 0
