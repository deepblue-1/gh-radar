---
phase: 26-shared-quote-feed
plan: 12
subsystem: relay
tags: [relay, healthz, quote-feed, fanout, webapp, reducer, d-01, d-02, d-04, d-16, tdd]

requires:
  - phase: 26-11
    provides: "QuoteStatus(frame · health · on(frame) · close) · quoteAlerting · QuoteHealth 7키 · shared RelayQuoteStateMsg"
  - phase: 26-09
    provides: "shared RelaySubLimitMsg · hub stats().subLimitRejects"
  - phase: 26-08
    provides: "HubStats.lingerCount"
provides:
  - "/healthz quote 503 축 — healthy = linkUp && sessionsOk && journalOk && quoteOk · 본문 quote 7키(24시간)"
  - "OrderApiDeps.quote · HealthPayload.quote"
  - "WsFanoutDeps.quoteState · 인증 직후 quote.state 스냅샷 · deliverQuoteState(#users 전 연결)"
  - "index.ts 결선 — new QuoteStatus({ feed: quoteFeed, hubStats: () => hub.stats() }) · orderApi quote · fanout quoteState · on(frame) → deliverQuoteState · 종료 close()"
  - "webapp RelayConnectionState.quoteState · subLimit(최신 1건 · 초기 null) · applyFrame quote.state/sub.limit · EMPTY_RELAY_VALUE 두 필드"
  - "infra/relay/README.md §quote 연결 축 — 시세 멈춤 판정"
affects: [26-13 배지 목업, 26-14 webapp 시세 배지, relay 배포 · uptime gh-radar-relay-healthz]

actuals:
  tokens: 11800
  tasks: 3
  commits: 6
plan_head_before: ac4ceedd0054ff6e33b06aebf9cad5c32cbba619

tech-stack:
  added: []
  patterns:
    - "상태 원천 객체 하나(QuoteStatus)를 healthz 판정 · 브라우저 프레임 · 인증 스냅샷 세 곳에 같은 참조로 결선 — JournalStatus 결선과 같은 모양"
    - "운영 상태 프레임은 #users 전 연결(인증 · 자격증명 등록)만 — 미등록 연결 0 을 테스트로 잠근다"

key-files:
  created: []
  modified:
    - relay/src/order/order-api.ts
    - relay/src/index.ts
    - relay/src/ws/fanout.ts
    - relay/tests/order-api.test.ts
    - relay/tests/fanout.test.ts
    - relay/tests/journal-boot.test.ts
    - infra/relay/README.md
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/relay-provider.tsx
    - webapp/src/lib/__tests__/relay-socket.test.ts

key-decisions:
  - "quote 는 journalGateways 와 달리 503 축이다 — 폴백이 없어(D-03) 끊기면 전 사용자 시세가 멈추는 단일 장애점이라 기존 uptime 이 정책 변경 없이 울려야 한다(D-02)"
  - "판정식은 order-api 에 복제하지 않고 quote/status.ts 의 quoteAlerting 한 벌만 부른다 — 장중 60초 · 거부/역할 불일치 즉시(D-16)"
  - "fanout 하네스는 index.ts 와 같은 결선을 쓰려고 feed 를 fanout 보다 먼저 만든다(시작 시점은 그대로) — 세 번째 인자 quoteStatus:true 일 때만 QuoteStatus 주입"
  - "webapp 반환 memo 의존성은 data 객체 하나라 필드 추가만으로 갱신된다 — 의존성 목록 자체는 바꿀 것이 없다"

patterns-established:
  - "healthz 축 추가 절차: deps 선택 필드 → 판정 AND 합류 → 본문 조건부 키 → 부팅 결선 → journal-boot 본문 키 목록 갱신"

requirements-completed: []

coverage:
  - id: D1
    description: "/healthz quote 축 — 장중 60초 유예 · rejected/role_mismatch 즉시 503 · 장 밖 200 · 본문 7키 · 식별자 0 · journal 과 AND"
    verification:
      - kind: integration
        ref: "relay/tests/order-api.test.ts#quote 판정 (Phase 26 D-02 · D-16)"
        status: pass
      - kind: integration
        ref: "relay/tests/journal-boot.test.ts#M1 KYOBO env 없음 → … healthz 키 9종(+ quote — Phase 26)"
        status: pass
    human_judgment: false
  - id: D2
    description: "quote.state 프레임 — 인증 직후 스냅샷 1건(알 때만) · 3초 디바운스 down · 복구 live · 미등록 연결 0 · 미주입 0"
    verification:
      - kind: integration
        ref: "relay/tests/fanout.test.ts#quote.state (Phase 26 D-01)"
        status: pass
    human_judgment: false
  - id: D3
    description: "webapp quoteState · subLimit 최신 1건 보관 · isStale/호가 캐시 불변 · reset null · 모르는 t 무시"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/relay-socket.test.ts#quote.state / sub.limit (Phase 26 D-01 · D-04)"
        status: pass
    human_judgment: false
  - id: D4
    description: "운영 README §quote 연결 축 — 503 조건 표 · .quote 7키 해석 · [QUOTE]/[HUB] 로그 · gh-trade 서버 로그 문구 · 원인별 조치"
    verification: []
    human_judgment: true
    rationale: "운영 절차 문서의 충분성은 배포 뒤 실제 장애 판정에서만 확인된다 — 자동 검증 대상이 아니다(grep 게이트만 통과)"
  - id: D5
    description: "배포 뒤 실측 — 장중 quote 끊김 60초 초과 시 uptime gh-radar-relay-healthz 알림 · 배포 스크립트 curl -sf 기동 확인 통과"
    verification: []
    human_judgment: true
    rationale: "라이브 relay · Cloud Monitoring 경로라 배포 뒤에만 확인 가능(이 플랜은 배포하지 않는다)"

duration: 10min
completed: 2026-10-01
status: complete
---

# Phase 26 Plan 12: quote 상태 3소비처 결선 Summary

**26-11 `QuoteStatus` 한 원천을 `/healthz` 503 축(장중 60초 · 거부 즉시) · 브라우저 `quote.state` 프레임(인증 스냅샷 + 3초 디바운스 전이) · webapp `quoteState`/`subLimit` 스토어에 결선하고, 운영 README 에 quote 연결 판정 절차를 넣었다**

## Performance

- **Duration:** 약 10분
- **Started:** 2026-09-30T15:03:59Z
- **Completed:** 2026-09-30T15:13:27Z
- **Tasks:** 3 (TDD — RED/GREEN 커밋 3쌍)
- **Files modified:** 10

## Accomplishments

- `/healthz` 가 quote 연결을 사용자 세션 stalled 와 같은 등급의 503 축으로 판정한다(D-02 · D-16). 본문 `quote` 는 24시간 실린다.
- 인증된 브라우저 연결은 relay 가 상태를 알 때만 `quote.state` 스냅샷 1건을 받고, 전이마다 같은 프레임을 받는다. 미등록 연결은 0건이다(D-01 · D-09).
- webapp 은 `quoteState` · `subLimit` 을 최신 1건씩 보관하고 `isStale`(호가 · 체결 흐림)은 건드리지 않는다(D-04). 배지 UI 는 26-14 몫이다.
- `infra/relay/README.md` 에 §quote 연결 축 — 시세 멈춤 판정 과 §현재 운영 상태 행 하나를 넣었다.

## healthz 판정식

```ts
const quote = deps.quote?.health(now.getTime());
const quoteOk = quote === undefined || !quoteAlerting(quote, now);
const healthy = linkUp && sessionsOk && journalOk && quoteOk;
```

| quote `state` | 시각 | 결과 |
|---|---|---|
| `rejected` · `role_mismatch` | 무관 | 503 즉시 |
| `connecting` · `logging_in` | 장중 · `disconnectedSec` ≥ 60 | 503 |
| 그 밖 not-live | 장중 60초 미만 · 장 밖 | 200 |
| `ready` · `disabled` | — | 200 |

본문 예시(식별자 · 호스트 · 비밀 없음, smoke `health_probe` 정규식 매치 0):

```json
{"status":"ok","vpn":true,"dma":true,"version":"…","sessionCount":1,"everReadyCount":1,"stalledCount":0,
 "journal":{…},
 "quote":{"state":"ready","keyCount":37,"lingerCount":2,"lastFrameAgeSec":0,"reconnects":1,"subLimitRejects":0,"disconnectedSec":null}}
```

## README 소절 위치

- `infra/relay/README.md` §현재 운영 상태 표 마지막 행: 「relay → KB 게이트웨이 연결: 사용자 세션 N · 저널 관찰자 1 · quote 관찰자 1(시세 전용 · Phase 26)」(Phase 26 relay 배포 뒤부터라고 적었다)
- 새 절 `## quote 연결 축 — 시세 멈춤 판정`: §막힐 때 뒤, `## 터널 정지 판정 절차 — wg-probe` 바로 앞. 하위 절은 503 조건(D-16) · `/healthz` `.quote` 필드 해석 · 로그(relay `[QUOTE]` · `[HUB] … 합집합 재구독` · gh-trade `[Gateway] 관찰자 로그인(quote — 시세 전용) conn=… ip=… client='gh-radar-relay/quote'`) · 503 원인별 조치(rejected → 관찰자 비밀 대조 뒤 relay 재시작 · role_mismatch → gh-trade 가동본 `ed2e0240` 포함 확인 뒤 relay 재시작 · 장중 not-live → wg-probe · 3자 대조)
- gh-trade 서버 로그 문구는 `gh-trade/server/src/net/Gateway.cpp:1507` 실물과 대조했다.

## 프레임 전달 규칙

- 인증 직후 스냅샷 묶음의 `journal.state` 다음에 `quoteState.frame()` 이 null 이 아닐 때만 1건 보낸다(모르면 보내지 않는다).
- 전이: `quoteStatus.on("frame") → fanout.deliverQuoteState(frame)`. `#users` 전 연결만 돌며, 미인증 · 자격증명 미등록 연결에는 가지 않는다. 프레임에 사용자 데이터가 없어서 전원 브로드캐스트가 맞다(T-15-02 와 무관 · T-26-21).
- 디바운스: `down` 은 ready 이탈 뒤 3초(`QUOTE_DOWN_AFTER_MS`)에 한 번 나가고, 복구하면 `live` 가 한 번 나간다. 테스트에서 2999ms 까지는 0건이고 3000ms 에 1건이다.
- relay 를 먼저 배포해도 옛 webapp 은 모르는 `t` 를 `applyFrame` default 에서 무시한다. relay 를 먼저 배포해도 안전하다.

## Task Commits

1. **Task 1: /healthz quote 축** — RED `16f7de93` (test) · GREEN `d50d5b83` (feat)
2. **Task 2: quote.state 프레임** — RED `ebfe6d51` (test) · GREEN `cf4c6b24` (feat)
3. **Task 3: webapp 스토어** — RED `8cb202de` (test) · GREEN `8c606070` (feat)

REFACTOR 커밋은 없다. 정리할 것이 없었다.

## TDD Gate Compliance

`check tdd-red-evidence` 는 vitest 출력을 파싱하지 못해서(알려진 도구 한계) 실제 RED 출력을 여기에 적는다.

- Task 1 RED — `vitest run tests/order-api.test.ts -t "quote 판정"`: **7 failed | 2 passed**. 실패는 모두 단언이다(`expected 200 to be 503`, `Cannot convert undefined or null to object` — 본문에 `quote` 키가 없음). 통과한 2건은 「quote 소스 없음」 · 「ready → 200」 이다. 둘 다 구현 전에도 참인 회귀 가드다.
- Task 2 RED — `vitest run tests/fanout.test.ts -t "quote.state"`: **2 failed | 1 passed**. QS2 · QS3 은 `조건이 서지 않았습니다: A quote.state 스냅샷` / `A · B 스냅샷` 으로 실패했다(스냅샷 미수신). 하네스 결선에서 `TypeError: fanout.deliverQuoteState is not a function` 도 2건 났다(API 부재). QS1(미주입 → 0건)은 구현 전에도 참인 가드다.
- Task 3 RED — `vitest --run src/lib/__tests__/relay-socket.test.ts -t "quote.state / sub.limit"`: **6 failed** — 모두 `AssertionError: expected undefined to be null / to deeply equal …`(필드 부재).
- GREEN: relay 35 files / 881 tests, webapp 139 files / 3118 tests(1 skipped) 모두 통과. fanout.test.ts 는 5회 반복해 모두 75/75 였다.

## Files Created/Modified

- `relay/src/order/order-api.ts` — `OrderApiDeps.quote` · `HealthPayload.quote` JSDoc · Phase 26 판정 주석 단락 · `quoteOk` AND 합류 · 본문 조건부 키
- `relay/src/index.ts` — `QuoteStatus` 생성(fanout 앞) · orderApi `quote: quoteStatus` · fanout `quoteState: quoteStatus` · `on("frame")` 결선 · 종료 `quoteStatus.close()` · 종료 절차 주석
- `relay/src/ws/fanout.ts` — `WsFanoutDeps.quoteState` · `#quoteState` · 인증 스냅샷 · `deliverQuoteState`
- `relay/tests/order-api.test.ts` — `describe("quote 판정 (Phase 26 D-02 · D-16)")` 9케이스
- `relay/tests/fanout.test.ts` — 하네스 세 번째 인자 `quoteStatus` · `describe("quote.state (Phase 26 D-01)")` QS1~QS3
- `relay/tests/journal-boot.test.ts` — M1 healthz 본문 키 목록에 `quote` 추가
- `infra/relay/README.md` — §현재 운영 상태 행 1줄 · §quote 연결 축 — 시세 멈춤 판정
- `webapp/src/lib/use-relay-socket.ts` — 공개 · 내부 상태 · INITIAL_DATA · applyFrame 2갈래 · 반환 memo
- `webapp/src/lib/relay-provider.tsx` — `EMPTY_RELAY_VALUE` 두 필드 null
- `webapp/src/lib/__tests__/relay-socket.test.ts` — `describe('quote.state / sub.limit (Phase 26 D-01 · D-04)')` 6케이스

## Decisions Made

- quote 는 503 축이다. 교보 `journalGateways` 는 본문에만 싣는 방식인데, quote 에는 폴백이 없어서 그 방식을 따르지 않는다(주석과 README 에 이유를 적었다).
- 판정식은 `quoteAlerting` 한 벌만 부르고 order-api 에 복제하지 않는다.
- fanout 하네스는 feed 를 fanout 보다 먼저 만든다. `feed.start()` 시점은 그대로라서 기존 72개 케이스의 동작은 바뀌지 않는다.
- webapp 반환 memo 의 의존성은 `data` 하나다. 그래서 필드만 추가하면 되고 의존성 배열은 손대지 않았다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] journal-boot M1 이 healthz 본문 키 8종을 고정 단언하고 있었다**
- **Found during:** Task 1 (relay 전체 테스트)
- **Issue:** 부팅에서 `quote: quoteStatus` 를 결선하면 본문에 `quote` 키가 늘 실린다. 이 변화는 계획 D-02 가 의도한 것인데, 부팅 통합 테스트 M1 이 키 목록 8종을 정확히 단언하고 있어서 실패했다.
- **Fix:** 키 목록에 `quote` 를 넣고 케이스 이름을 「키 9종(+ quote — Phase 26)」으로 바꿨다.
- **Files modified:** relay/tests/journal-boot.test.ts
- **Verification:** relay 35 files / 878 → 881 tests 모두 통과
- **Committed in:** d50d5b83

**2. [Rule 3 - Blocking] order-api 테스트 AND 케이스의 TS narrowing 오류**
- **Found during:** Task 1 (`typecheck:tests`)
- **Issue:** 케이스 안에서 `h = null` 로 대입하자 TS 가 `h` 를 `never` 로 좁혀 `error TS2339` 가 났다.
- **Fix:** quote describe 의 `probe` 가 앞 하네스를 먼저 닫도록 바꾸고, 케이스 안의 수동 close/null 대입은 뺐다.
- **Files modified:** relay/tests/order-api.test.ts
- **Committed in:** d50d5b83

---

**Total deviations:** 2 auto-fixed (Rule 1 1건 · Rule 3 1건)
**Impact on plan:** 둘 다 계획이 의도한 본문 변화를 따라간 테스트 쪽 수정이다. 범위는 늘지 않았다.

## Issues Encountered

없음.

## User Setup Required

없음. 배포는 이 플랜 범위 밖이다. relay 를 먼저 배포하고 검증한 뒤 push 한다.

## Next Phase Readiness

- 26-13 · 26-14 (배지): `useRelayContext().quoteState`(`{s:"live"}` · `{s:"down", since}` · null=배지 없음)와 `subLimit`(`{i, x, scope}`) 을 읽으면 된다. `isStale` 과는 별개 축이다.
- 배포 뒤 확인(D5 · human_judgment): `curl -s https://dma.jx1.io/healthz | jq .quote` 로 7키를 보고, 20:00 이후 배포에서 `deploy-relay.sh` 기동 확인(`curl -sf`)이 통과하는지 확인한다. gh-trade 서버 로그에 `관찰자 로그인(quote — 시세 전용) … client='gh-radar-relay/quote'` 가 있는지도 본다.

---
*Phase: 26-shared-quote-feed*
*Completed: 2026-10-01*

## Self-Check: PASSED

- 파일 존재: relay/src/order/order-api.ts · relay/src/ws/fanout.ts · webapp/src/lib/use-relay-socket.ts · infra/relay/README.md
- 커밋 존재: `16f7de93` · `d50d5b83` · `ebfe6d51` · `cf4c6b24` · `8cb202de` · `8c606070`
- Task 1 acceptance: `quoteAlerting` 5 · `healthy = linkUp && sessionsOk && journalOk && quoteOk` 1 · `quote: quoteStatus` 1 · `quoteStatus.close()` 1 · 「quote 판정」 1 · `gh-radar-relay/quote` 2 · 「관찰자 로그인(quote — 시세 전용)」 1
- Task 2 acceptance: `deliverQuoteState(frame: RelayQuoteStateMsg)` 1 · `this.#quoteState?.frame()` 1 · `fanout.deliverQuoteState(frame)` 1 · `quoteState: quoteStatus` 1 · 「quote.state (Phase 26 D-01)」 1
- Task 3 acceptance: `case "quote.state"` 1 · `case "sub.limit"` 1 · quote.state 갈래 안 isStale 0 · `quoteState: null` 1 · `subLimit: null` 1 · 「quote.state / sub.limit」 2
- 검증: shared build · relay typecheck(src · tests) · webapp typecheck 오류 0 · relay 881 · webapp 3118 green
