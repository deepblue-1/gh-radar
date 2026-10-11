---
phase: 26-shared-quote-feed
plan: 08
subsystem: relay
tags: [relay, hub, linger, quote-feed, config, e2e, d-10, tdd]

requires:
  - phase: 26-03
    provides: "전역 참조계수(SubRefs) · 0→1/승격/강등/1→0 프레임 · resubscribeAll · stats · closeAll"
  - phase: 26-07
    provides: "#priceGates · #dropPriceGate — 1→0 게이트 정리 자리"
  - phase: 26-06
    provides: "경계 ⑥(1→0 뒤 늦은 59 미캐시) · fanout quote 스텁 하네스"
provides:
  - "LINGER_MS = 15_000 · SubscriptionHub 생성자 lingerMs(0 이하 = 즉시 해제)"
  - "#lingering(timer · since · level) · #releaseKey(key, reason, sendUnsubscribe) · #resumeFromLinger · #clearLinger"
  - "isLingering(isin, ex) · HubStats.lingerCount · subscriptionCount = live 키 수"
  - "RelayConfig.quoteLingerMs ← QUOTE_LINGER_MS (기본 15000 · 음수/비숫자/빈 값 거부)"
  - "e2e relay 픽스처 QUOTE_LINGER_MS '0'"
affects: [26-09 limits (linger 키를 업스트림 키 수에 센다 · since 로 가장 오래된 linger 부터 해제), 26-11 nudge, 26-12 healthz (lingerCount)]

actuals:
  tokens: 12100
  tasks: 2
  commits: 5
plan_head_before: 86c334196fcbff4050dc72e7a7a3810181a32225

tech-stack:
  added: []
  patterns:
    - "소비자 0 키는 참조계수 항목(0/0)을 지우지 않고 표식 + 타이머로 남긴다 — 업스트림 구독 키 집합 = #refs 키 전부(live + linger)"
    - "키 해제는 한 메서드(#releaseKey)로 모은다 — 만료 · linger 0 · 재접속 정리가 캐시 · 게이트 · 타이머 정리를 공유하고, 재접속만 29(false) 를 생략한다"
    - "운영 기본값은 코드 상수, e2e 격리는 env 0 — 배포 env 는 건드리지 않는다"

key-files:
  created: []
  modified:
    - relay/src/hub/subscription-hub.ts
    - relay/src/config.ts
    - relay/src/index.ts
    - relay/tests/hub.test.ts
    - relay/tests/fanout.test.ts
    - relay/tests/config-quote.test.ts
    - webapp/e2e/fixtures/relay.ts

key-decisions:
  - "linger 키는 #refs 에 합계 0 항목으로 남긴다 — #onQuote/#onTape 의 「참조계수 없는 키는 버림」 가드가 그대로 linger 중 캐시 갱신 · 만료 뒤 미캐시를 가른다"
  - "stats.subscriptionCount 는 live 키 수(#refs.size - #lingering.size)로 재정의 — 업스트림 키 수는 subscriptionCount + lingerCount"
  - "linger 중 복귀의 승격 · 강등 판정 기준은 linger 당시 업스트림 실효 level(표식에 저장)이다"
  - "quote 재접속 정리는 29(false) 를 보내지 않는다 — 새 연결에는 그 키 구독이 없다"
  - "QUOTE_LINGER_MS 빈 문자열도 거부한다(Number('') = 0 으로 조용히 즉시 해제가 되는 함정 차단)"

patterns-established:
  - "hub 시간 판정은 setTimeout · Date.now 이고, 단위 테스트는 vi.useFakeTimers(Date 포함)로 LINGER_MS 를 민다"

requirements-completed: []

coverage:
  - id: D1
    description: "1→0 은 29(false) 를 미루고 구독 · 캐시를 LINGER_MS(15초) 유지 — 만료에서 29(false) 1건 · 캐시 · PRICE 게이트 삭제 · lingerCount 0"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#linger (D-10) LG1 · LG2 · LG9"
        status: pass
    human_judgment: false
  - id: D2
    description: "linger 중 같은 level 복귀는 28/29/32 0건 · 만료 타이머 취소 / FULL linger + price 복귀 = 29(1) 1건 / PRICE linger + full 복귀 = 28 → 29(0) → 32"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#linger (D-10) LG3 · LG4 · LG5"
        status: pass
    human_judgment: false
  - id: D3
    description: "quote 연결 ready 는 linger 키를 29 없이 정리(캐시 삭제 · 타이머 해제)하고 live 키만 재구독 / linger 중 59 는 캐시 갱신 · 업스트림 송신 0 · price 거짓 / closeAll 이 linger 타이머 전부 해제"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#linger (D-10) LG7 · LG8 · LG10"
        status: pass
    human_judgment: false
  - id: D4
    description: "lingerMs 0 이면 1→0 즉시 29(false) · 캐시 삭제(26-03 동작)"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#linger (D-10) LG6"
        status: pass
    human_judgment: false
  - id: D5
    description: "실 wss — 소켓 close 뒤 5초에 새 소켓 sub 이 캐시 q 를 즉시 받고 28 · 29 · 32 누적 각 1, 두 번째 close 로부터 LINGER_MS 뒤 29(false) 1"
    verification:
      - kind: integration
        ref: "relay/tests/fanout.test.ts#⑪ linger 안 재접속 · ⑨ · F6"
        status: pass
    human_judgment: false
  - id: D6
    description: "QUOTE_LINGER_MS 노브 — 미설정 15000 · 0 · 30000 · 음수/비숫자 기동 거부, 부팅 결선 lingerMs: config.quoteLingerMs, deploy-relay.sh 무변경"
    verification:
      - kind: unit
        ref: "relay/tests/config-quote.test.ts#loadConfig — quoteLingerMs (Phase 26 D-10) LK1~LK3"
        status: pass
      - kind: other
        ref: "git diff --name-only 561556d3..HEAD -- scripts/deploy-relay.sh (0줄)"
        status: pass
    human_judgment: false
  - id: D7
    description: "e2e 가 QUOTE_LINGER_MS=0 으로 테스트 간 전역 캐시 누수 없이 green (작업대 · 종목상세)"
    verification:
      - kind: e2e
        ref: "pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/stock-detail-tabs.spec.ts --grep-invert '5\\. 격자 1/2/3단|P20-3 최악값|16px 다' — 77 passed"
        status: pass
    human_judgment: false

duration: 11min
completed: 2026-09-30
status: complete
---

# Phase 26 Plan 08: 전역 구독 linger 15초 Summary

**relay hub 는 이제 마지막 소비자가 떠난 시세 키를 15초(`LINGER_MS`) 동안 업스트림 구독과 전역 캐시째 붙들어 둔다. 탭 전환 · 새로고침으로 그 안에 돌아오면 28 · 29 · 32 재요청 없이 캐시로 그리고, 만료 · quote 재접속에서는 `#releaseKey` 한 자리가 캐시 · PRICE 게이트 · 타이머를 지운다. 운영 기본값은 15000 이고 e2e 는 `QUOTE_LINGER_MS=0` 으로 테스트 사이 캐시를 격리한다.**

## Performance

- **Duration:** 약 11분
- **Started:** 2026-09-30T14:12:46Z
- **Completed:** 2026-09-30T14:23:30Z
- **Tasks:** 2 (둘 다 TDD — RED test → GREEN feat)
- **Files modified:** 7

## Accomplishments

- `unsubscribe` 합계 1→0 이 linger 표식(당시 업스트림 level · 시각 · 타이머 1개)을 건다. `#refs` 항목(0/0)은 남는다. 그래서 `#onQuote` · `#onTape` 의 「참조계수 없는 키 버림」 가드를 고치지 않아도, linger 중에는 캐시가 갱신되고 만료 뒤에는 늦은 프레임이 버려진다.
- `#releaseKey` 가 26-03 의 1→0 정리 코드를 넘겨받았다. 29(false) · `#refs` · `#lingering` · `#quotes` · `#tapes` · `#pendingTapes` · 26-07 PRICE 게이트를 한 번에 지운다. 부르는 곳은 셋이다: linger 만료, `lingerMs` 0 의 1→0, 재접속 정리(재접속 정리만 29 를 생략).
- `QUOTE_LINGER_MS` 노브를 config 로 열고 부팅에 결선했다. e2e 픽스처는 0 으로 돈다.

## linger 규칙 표

| 상황 | 업스트림 프레임 | 캐시 · 게이트 | 비고 |
|---|---|---|---|
| 합계 1→0 (`lingerMs` > 0) | 없음 | 유지 · PRICE 게이트는 삭제(price 참조 0) | 표식 `{ timer, since, level }` · `lingerCount` +1 |
| linger 만료 | 29(false) 1건 (feed Ready 일 때) | 전부 삭제 | `#releaseKey(key, "linger 만료")` |
| 1→0 (`lingerMs` ≤ 0) | 29(false) 1건 즉시 | 전부 삭제 | 26-03 동작 · e2e |
| linger 중 같은 level 복귀 | 없음 | 캐시 그대로 | 타이머 취소 · info 「linger 중 재구독 — 캐시로 그린다」 |
| linger(PRICE) 중 full 복귀 | 28 → 29(level 0) → 32 | 캐시 그대로 → 58 로 갱신 | 승격 규칙 동일 |
| linger(FULL) 중 price 복귀 | 29(level 1) 1건 | 캐시 그대로 | 강등 규칙 동일 |
| linger 중 59 · 71 수신 | 없음 | 캐시 갱신 · market 이벤트(구독 소켓 0) | 서버는 아직 구독 중 |
| linger 만료 뒤 늦은 59 · 71 | 없음 | 미캐시 · market 0 | 26-06 ⑥ 승계 |
| quote 연결 `ready` | linger 키는 0건, live 키는 합집합 재구독 | linger 키 삭제 · 타이머 해제 | `#releaseKey(…, false)` |
| `closeAll` | 없음 | 전부 삭제 | linger 타이머 전부 해제 |

- `stats().subscriptionCount` 는 live 키 수(`#refs.size - #lingering.size`)다. 업스트림 키 수는 `subscriptionCount + lingerCount` 이고, 26-09 의 2000 가드는 이 합을 센다.
- 표식의 `since` 는 26-09 가 「가장 오래 linger 한 키부터 해제」 할 때 쓰도록 남겼다.

## 노브 기본값

| env | 미설정 | 허용 | 거부 |
|---|---|---|---|
| `QUOTE_LINGER_MS` | 15000 (= hub `LINGER_MS`) | 유한 · 0 이상 (0 = 즉시 해제) | 음수 · 비숫자 · 빈 문자열 → `QUOTE_LINGER_MS must be a finite number >= 0 (ms) — got "…"` |

프로덕션 배포 env(`scripts/deploy-relay.sh`)와 Secret Manager 는 바꾸지 않았다. 확인: `git diff --name-only 561556d3..HEAD -- scripts/deploy-relay.sh` 0줄.

## e2e 결과

- `trading-workbench.spec.ts` + `stock-detail-tabs.spec.ts` 를 알려진 deferred 3건만 빼고(`--grep-invert "5\. 격자 1/2/3단|P20-3 최악값|16px 다"`) 돌렸다. 결과는 **77 passed · 0 failed · 0 flaky**(2.8분)다.
- 전체 실행에서는 「5. 격자 1/2/3단」 이 `삼성전자 over 26` 으로 실패했다. serial describe 라 뒤의 58건은 돌지 않았다. 따로 돌린 「P20-3 최악값」 도 `over 24` 로 실패했다. 둘 다 26-05 `deferred-items.md` 에 기록된 카드 헤더 이름 말줄임(제품 코드 · UI 결정 대기) 그대로이고, 수치까지 기록과 같다. 이 플랜은 webapp 제품 코드를 바꾸지 않았다(e2e 픽스처 env 한 줄만 추가).

## TDD 기록

- **Task 1 RED** (`561556d3`): hub `describe("linger (D-10)")` LG1~LG10 을 추가하고 기존 ② · ③ · L4 · 경계 ⑥ · P11 을 「linger 만료 뒤」 단언으로 고쳤다. fanout 은 ⑨ · F6 에 `LINGER_MS` 경과를 넣고 ⑪ 을 「linger 안 재접속」 으로 다시 썼다. 136건 중 14건이 실패했다.
  - 동작 단언 실패: ② `expected [ { msgType: 29, …(5) } ] to have a length of +0 but got 1`(즉시 29(false)) · ③ `to have a length of 3 but got 4` · L4 `length of 4 but got 5` · LG2 즉시 해제 · LG3 `length of 4 but got 7`(재요청 28 · 29 · 32) · LG4 `expected [ 28, 29 ] to deeply equal [ 29 ]` · LG7 `lingerCount` 없음 · LG8 `expected undefined to be 71600`(캐시 삭제됨) · LG10 `expected undefined to be 2`.
  - export · 메서드 부재: LG1 `expected undefined to be 15000` · LG6 · P11 · fanout ⑨ · ⑪ `isLingering is not a function`.
  - LG5(PRICE 뒤 full 0→1 도 28 · 29(0) · 32)와 LG9(만료 뒤 미캐시)는 옛 즉시 해제에서도 참이라 통과했다. 회귀 가드다.
- **Task 1 GREEN** (`f9878348`): 136/136 통과. relay 전체는 33 files · 813 tests green 이었다.
- **Task 2 RED** (`4a24be3b`): config-quote LK1~LK3 3건이 실패했다(`expected undefined to be 15000` · `expected undefined to be +0` · `expected [Function] to throw an error`).
- **Task 2 GREEN** (`62634b1a`): 8/8 통과. relay 전체는 33 files · 816 tests green 이다.
- `check tdd-red-evidence` 는 vitest 출력을 파싱하지 못한다(알려진 툴링 제약). 그래서 관찰한 실패 출력을 여기에 기록했다. REFACTOR 커밋은 없다.

## Task Commits

1. **Task 1 RED: linger 실패 테스트** - `561556d3` (test)
2. **Task 1 GREEN: 전역 구독 linger 15초** - `f9878348` (feat)
3. **Task 2 RED: QUOTE_LINGER_MS 실패 테스트** - `4a24be3b` (test)
4. **Task 2 GREEN: QUOTE_LINGER_MS 노브 · 부팅 결선 · e2e 0** - `62634b1a` (feat)

`actuals.commits: 5` 는 `git rev-list --count 86c33419..HEAD` 로 잰 값이다. 이 중 `ca499109 fix(theme): 다크 면 사다리 …` 는 같은 트리에서 동시에 작업하던 다른 세션의 커밋이다(webapp 테마). 이 플랜이 만든 커밋은 위 4건이다.

## Files Created/Modified

- `relay/src/hub/subscription-hub.ts` — `LINGER_MS` · `Linger` 타입 · `#lingering` · `#lingerMs` · `#resumeFromLinger` · `#releaseKey` · `#clearLinger` · `isLingering` · `HubStats.lingerCount` · `resubscribeAll` linger 정리 · `closeAll` 타이머 정리 · 헤더 D-37/D-10 갱신
- `relay/src/config.ts` — `RelayConfig.quoteLingerMs` · `QUOTE_LINGER_MS` 검증
- `relay/src/index.ts` — `lingerMs: config.quoteLingerMs` 결선
- `relay/tests/hub.test.ts` — `linger (D-10)` LG1~LG10 · 기존 ② ③ L4 ⑥ P11 갱신
- `relay/tests/fanout.test.ts` — ⑨ · F6 linger 만료 · ⑪ linger 안 재접속
- `relay/tests/config-quote.test.ts` — `quoteLingerMs` LK1~LK3
- `webapp/e2e/fixtures/relay.ts` — spawn env `QUOTE_LINGER_MS: '0'`

## Decisions Made

- linger 키는 `#refs` 에 합계 0 항목으로 남긴다. 업스트림 구독 키 집합이 곧 `#refs` 의 키 전부라서, 26-09 가드가 그대로 셀 수 있다.
- `subscriptionCount` 를 live 키 수로 재정의하고, JSDoc 에 「업스트림 = subscriptionCount + lingerCount」 를 적었다.
- 재접속 정리는 29(false) 를 생략한다. 새 연결에는 그 키 구독이 없다.
- `QUOTE_LINGER_MS` 빈 문자열도 거부한다. `Number("")` 가 0 이라, 그대로 두면 조용히 즉시 해제가 된다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 1→0 즉시 해제를 전제한 기존 테스트 갱신**
- **Found during:** Task 1 (RED 작성)
- **Issue:** hub ② · ③ · L4 · 경계 ⑥ · P11(`getTimerCount` 0 → linger 타이머 1)과 fanout F6 은 1→0 즉시 29(false) 를 단언했다. 계획이 적은 것은 ⑥ · ⑨ · ⑪ 뿐이었다.
- **Fix:** 각 케이스에 `vi.advanceTimersByTime(LINGER_MS)` 를 넣고 「만료 전 0 · 만료 뒤 1」 로 고쳤다. P11 은 「남은 타이머 = linger 1개, 만료 뒤 0 · 지연 방출 0」 으로 고쳤다.
- **Files modified:** relay/tests/hub.test.ts, relay/tests/fanout.test.ts
- **Verification:** relay 전체 813 → 816 green
- **Committed in:** 561556d3

**2. [Rule 2 - Missing Critical] `QUOTE_LINGER_MS` 빈 문자열 거부**
- **Found during:** Task 2
- **Issue:** 계획은 음수 · 비숫자만 거부하라고 했다. 그런데 빈 문자열은 `Number("") === 0` 이라 검증을 통과해 운영에서 즉시 해제가 된다(T-26-13 과 같은 부류).
- **Fix:** 빈 문자열(trim 뒤)은 NaN 으로 보고 거부한다.
- **Files modified:** relay/src/config.ts
- **Committed in:** 62634b1a

**3. 커밋 트레일러 — 사용자 전역 규칙**
- 첫 RED 커밋에 붙은 `Co-Authored-By` 트레일러를 사용자 CLAUDE.md 「Co-Authored-By 절대 넣지 않기」 에 따라 push 전 amend 로 지웠다(`475b7c08` → `561556d3`, 이 플랜 커밋만 · 내용 동일).

---

**Total deviations:** 2 auto-fixed (1 bug · 1 missing critical) + 1 커밋 규칙 준수
**Impact on plan:** 범위 확장 없음. 둘 다 계획한 동작(linger · 거부 규칙)의 정합성 보강이다.

## Issues Encountered

- e2e 전체 실행에서 26-05 deferred 2건(카드 헤더 이름 말줄임 · `over 26` / `over 24`)이 그대로 재현됐다. serial describe 라 뒤 케이스가 돌지 않아, 알려진 3건을 뺀 실행으로 나머지 77건을 확인했다. 새로 생긴 실패는 없다.

## Known Stubs

없음.

## Threat Flags

없음. 새 네트워크 표면이나 인증 경로를 만들지 않았다. T-26-12(키당 타이머 1개 · 만료 · 재접속 정리 · 캐시 ≤ 업스트림 키)와 T-26-13(잘못된 값이면 기동 거부)을 적용했다.

## User Setup Required

없음. 외부 서비스 설정이 필요 없다.

## Next Phase Readiness

- 26-09(2000 · 200 가드): 업스트림 키 수 = `#refs.size`(live + linger)다. 자리를 만들 때는 `#lingering` 중 `since` 가 가장 작은 키를 `#releaseKey(key, "…", true)` 로 풀면 된다(29(false) 뒤 29(true) 순서 · FIFO).
- 26-11(83 넛지): linger 중 복귀도 사용자별 0→1 이 될 수 있다. 넛지 판정은 `#resumeFromLinger` 자리에서 「전역 키는 이미 구독 중」 인 경우로 다루면 된다.
- 26-12(healthz): `HubStats.lingerCount` 가 준비됐다.

---
*Phase: 26-shared-quote-feed*
*Completed: 2026-09-30*

## Self-Check: PASSED
