---
phase: 26-shared-quote-feed
plan: 11
subsystem: relay
tags: [relay, hub, quote-feed, queue-progress, nudge, healthz, pattern-10, pitfall-6, pitfall-7, tdd]

requires:
  - phase: 26-10
    provides: "SubscribePacer control(unsubscribe · demote) · #pacer 결선 — 넛지 29 를 창 밖 control 경로로 태운다"
  - phase: 26-09
    provides: "#userRefs(사용자당 한도 D-15) · #releaseKey 의 linger 먼저 해제"
  - phase: 26-08
    provides: "linger(#lingering · #resumeFromLinger) — linger 중 새 사용자 복귀가 넛지 자리"
  - phase: 26-02
    provides: "QuoteFeed state · reconnects · lastFrameAtMs · \"state\" 이벤트"
provides:
  - "83 재송신 넛지 — 첫 참조가 이미 업스트림(live · linger)인 키면 같은 실효 level 29(true) 1건, 사용자 세션 Ready 에 그 사용자가 쥔 키마다 1건"
  - "#userRefs 「본 키」 기억(UserKeys { held, active }) — 참조 0 도 남기고 사용자 한도는 active 로 센다"
  - "SubscribePacer control kind \"nudge\" — 대기 중이면 합침, 그 밖은 즉시 · 창 점유 0"
  - "shared RelayQuoteState · RelayQuoteStateMsg { t: \"quote.state\" } · RelayOutbound 합류"
  - "relay/src/quote/status.ts — QuoteStatus · quoteAlerting · QUOTE_DOWN_AFTER_MS(3_000) · QUOTE_ALERT_AFTER_MS(60_000) · QuoteHealth · QuoteStatusDeps"
affects: [26-12 healthz · fanout quote.state 결선, 26-14 webapp 시세 배지]

actuals:
  tokens: 12100
  tasks: 2
  commits: 4
plan_head_before: 71688cf06fa038b900e82ad0ac52ce039e4cf0d9

tech-stack:
  added: []
  patterns:
    - "사용자별 참조 맵이 0 을 보존하면 「이 세션에서 본 키」 가 된다 — 한도는 별도 active 계수로 O(1) 판정"
    - "서버 부수효과(RequestResend)를 되살리는 응답 없는 요청은 페이서 창 밖 control 로 보내고, 대기 중 구독과는 합친다"
    - "상태 원천 객체 하나(QuoteStatus)가 브라우저 프레임과 healthz 본문을 같이 낸다 — JournalStatus 동형 · 생성자 초기 판정은 멱등 재평가"

key-files:
  created:
    - relay/src/quote/status.ts
    - relay/tests/quote-status.test.ts
  modified:
    - relay/src/hub/subscription-hub.ts
    - relay/src/hub/subscribe-pacer.ts
    - relay/tests/hub.test.ts
    - relay/tests/subscribe-pacer.test.ts
    - relay/tests/fanout.test.ts
    - packages/shared/src/relay.ts
    - packages/shared/src/index.ts

key-decisions:
  - "넛지는 같은 호출이 이미 29 를 보내는 승격 · 강등(linger 복귀 포함)에서는 생략한다 — 그 29 가 서버에서 같은 RequestResend 를 부른다"
  - "in-flight(응답 대기) 키에도 넛지 29 는 즉시 나간다 — 계획 규칙(대기 중만 합침) 그대로. 서버 입장에선 level 덮어쓰기 1건 추가일 뿐이다"
  - "#userRefs 를 UserKeys { held, active } 로 바꿔 사용자 한도(D-15)를 참조 > 0 키 수로 O(1) 판정한다 — 본 키를 순회해 세지 않는다"
  - "QuoteStatus 는 생성자에서 한 번 재평가한다 — 이미 ready 인 feed 에 붙으면 live 스냅샷이 바로 서서 인증 직후 frame() 이 null 이 아니다(JournalStatus 는 이 경우 null 로 남는다)"
  - "QuoteStatusDeps 는 계획대로 feed · hubStats 두 칸만 둔다 — 시각은 Date.now(가짜 타이머 Date 로 테스트)"

patterns-established:
  - "넛지 규칙 표(첫 참조 · 세션 Ready · 같은 사용자 복귀 · 본 키 수명)를 hub 헤더 Pattern 10 블록이 정본으로 든다"

requirements-completed: []

coverage:
  - id: D1
    description: "A 가 연 키를 B 가 처음 열면 29(true · 실효 level) 정확히 1건 · 28/32 0 · 두 번째 탭 0 · B 가 전부 닫았다 다시 열어도 0(D-10)"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#잔량진행률 넛지 (Pattern 10) N1 · N2 · N3"
        status: pass
    human_judgment: false
  - id: D2
    description: "linger 중 새 사용자 C 첫 참조 → linger 취소 · 29(level 0) 1건, PRICE 전용 키 넛지는 level 1 · full 섞이면 level 0"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#잔량진행률 넛지 (Pattern 10) N4 · N5"
        status: pass
    human_judgment: false
  - id: D3
    description: "사용자 세션 ready 재발행 → 참조 > 0 키마다 넛지 1건 · 본 키(참조 0)는 0건 · 사용자 세션 시세 요청 0"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#잔량진행률 넛지 (Pattern 10) N6"
        status: pass
    human_judgment: false
  - id: D4
    description: "본 키 수명 — 세션 교체 뒤 · 키 완전 해제(linger 만료) 뒤에는 다시 넛지, quote 미Ready 면 넛지 0"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#잔량진행률 넛지 (Pattern 10) N7 · N10 · N11"
        status: pass
    human_judgment: false
  - id: D5
    description: "페이서 nudge — 대기 중 키는 프레임 0(구독 29 한 벌만), in-flight · 구독된 키는 즉시 29 · 창 불변 · hub 대기열 병합(N8)"
    verification:
      - kind: unit
        ref: "relay/tests/subscribe-pacer.test.ts#P10 · P11"
        status: pass
      - kind: unit
        ref: "relay/tests/hub.test.ts#잔량진행률 넛지 (Pattern 10) N8"
        status: pass
    human_judgment: false
  - id: D6
    description: "사용자당 한도(D-15)는 참조 > 0 키만 센다 — 본 키 200 개가 있어도 새 키 ok"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#잔량진행률 넛지 (Pattern 10) N9 · 구독 한도 HL4 · HL5"
        status: pass
    human_judgment: false
  - id: D7
    description: "실 wss · 실 TCP — 두 번째 사용자 첫 참조에 quote 게이트웨이 29 누적 2 · 28 1 · 32 1 · 같은 사용자 두 번째 탭 0 · 사용자 세션 시세 요청 0"
    verification:
      - kind: integration
        ref: "relay/tests/fanout.test.ts#⑪-b 잔량진행률 넛지 · ⑦ Phase 26 트레이서"
        status: pass
    human_judgment: false
  - id: D8
    description: "QuoteStatus — 3초 디바운스 live/down 프레임 · 깜빡임 흡수 · rejected/role_mismatch down · disabled 무프레임 · 생성 시 ready 면 live 스냅샷 · close 뒤 타이머/리스너 0"
    verification:
      - kind: unit
        ref: "relay/tests/quote-status.test.ts#QuoteStatus — quote.state 디바운스 · healthz 본문"
        status: pass
    human_judgment: false
  - id: D9
    description: "QuoteHealth 7키 고정 · hub stats 전달 · 식별자 정규식 0 (T-26-18)"
    verification:
      - kind: unit
        ref: "relay/tests/quote-status.test.ts#health — 키 집합 7개 고정"
        status: pass
    human_judgment: false
  - id: D10
    description: "quoteAlerting — rejected · role_mismatch 즉시(장 밖 · 토요일 포함) · 장 밖 끊김 거짓 · 장중 59초 거짓 / 60초 참 · ready · disabled 거짓"
    verification:
      - kind: unit
        ref: "relay/tests/quote-status.test.ts#quoteAlerting"
        status: pass
    human_judgment: false
  - id: D11
    description: "실 게이트웨이에서 넛지 29 가 조용한 상한가 종목의 83 을 두 번째 사용자 계좌 세션(②)에 실제로 다시 내는지(A8)"
    verification: []
    human_judgment: true
    rationale: "서버 RequestResend 동작은 원문으로 VERIFIED 지만, 스텁 게이트웨이는 83 재송신을 흉내 내지 않는다. 배포 뒤 체결 없는 상한가 종목을 A 가 보는 중 B 가 열어 진행률 막대가 즉시 서는지 봐야 한다"

duration: 10min
completed: 2026-09-30
status: complete
---

# Phase 26 Plan 11: 83 재송신 넛지 · QuoteStatus Summary

**이미 누군가 보고 있는 종목을 다른 사용자가 이 세션에서 처음 열면, relay 가 quote 연결로 같은 실효 level 의 29(subscribe=true)를 한 건 보낸다. 서버는 이 29 를 level 덮어쓰기로 받아 `RequestResend` 를 부르고, 그 사용자의 계좌 세션에 83 을 다시 낸다. 그래서 조용한 상한가 종목에서 새로 들어온 사용자의 잔량진행률 막대가 다음 체결까지 비는 d43 증상이 공유 연결 구조에서도 돌아오지 않는다. 같은 사용자의 탭 전환 · 새로고침은 여전히 재요청이 0 이다. 그리고 `QuoteStatus` 가 quote 연결 상태를 브라우저 `{t:"quote.state"}` 프레임(3초 디바운스)과 `/healthz` 7키 본문에 함께 내는 한 원천이 됐다. 알림 판정은 거부 · 역할 불일치면 즉시, 그 밖은 장중 60초 뒤다.**

## Performance

- **Duration:** 약 10분
- **Started:** 2026-09-30T14:50:48Z
- **Completed:** 2026-09-30T15:00:48Z
- **Tasks:** 2 (둘 다 TDD — RED test → GREEN feat)
- **Files modified:** 9 (신규 2 · 수정 7)

## 넛지 규칙 (Pattern 10 · Pitfall 6)

서버는 83 을 「① 그 종목 · 거래소 시세 구독 연결 ∪ ② 항목 계좌를 선언한 세션」 으로 보낸다(MarketPublisher.cpp:771-779). relay 는 quote 연결 83(①)을 무시하고, 사용자 세션 83(②)만 계좌 필터를 거쳐 캐시한다. 이 경로는 바꾸지 않았다(T-25-24). 넛지는 서버가 ②로 **다시 내게** 할 뿐이고, relay 가 83 을 재라우팅하지는 않는다(T-26-02).

| 상황 | 넛지 | 근거 |
|---|---|---|
| 사용자가 이 DMA 세션에서 **처음** 참조하는 키가 이미 업스트림(live) | 실효 level 29(true) 1건 · 28/32 0 | 서버 level 덮어쓰기 → `RequestResend`(:1507) |
| 처음 참조하는 키가 **linger** 중(같은 level 복귀) | linger 취소 + 29 1건 | 위와 같다. 캐시로 그리는 것은 그대로다 |
| 처음 참조인데 같은 호출이 승격(28→29(0)→32) · 강등(29(1))을 보냄 | 0 (그 29 가 대신) | 승격 · 강등 29 도 level 덮어쓰기다 |
| 처음 참조인데 키가 업스트림에 없음(0→1 구독) | 0 (구독 29 가 대신) | 신규 등록 29 → `RequestResend`(:1487) |
| 사용자 세션이 Ready 로 (재)진입 | 그 사용자가 쥔(참조 > 0) 키마다 29 1건 | 계좌 선언 전의 넛지는 ②에 닿지 않을 수 있다 |
| 같은 사용자의 두 번째 탭 · 탭 전환 · 새로고침(본 키로 복귀) | 0 | D-10 — 28 · 29 · 32 재요청 없이 캐시로 그린다 |
| 그 키 구독이 페이서 대기열에 있음 | 합침(대기 항목이 29 를 낸다) | `control(..., "nudge")` 대기 갈래 |
| quote 연결이 Ready 아님 | 0 | ready 의 합집합 재구독 29 가 같은 효과 |

**본 키 수명.** `#userRefs` 는 이제 「이 DMA 세션에서 본 키 → 현재 참조 수」 다. 참조가 0 이 돼도 항목을 남긴다.
- 지우는 때 ① `#releaseKey` — 키가 업스트림에서 완전히 풀림(linger 만료 · lingerMs 0 · 재접속 linger 정리 · D-11 자리 만들기). 모든 사용자 맵에서 지운다.
- 지우는 때 ② `#clearCaches(userId)` — 세션 교체. 그 사용자의 참조 0 항목만 지운다. 참조 > 0 은 탭이 아직 쥐고 있으니 남기고, 새 세션 `ready` 가 넛지한다.
- 사용자 한도(D-15)는 `UserKeys.active`(참조 > 0 키 수)로만 판정한다. 본 키 수는 한도와 무관하다. 본 키 ⊆ 업스트림 키(≤ 2000)라서 맵이 무한히 자라지 않는다.

## QuoteStatus (D-02 · D-16)

| 상수 | 값 | 뜻 |
|---|---|---|
| `QUOTE_DOWN_AFTER_MS` | 3_000 | ready 이탈 뒤 브라우저 `down` 프레임까지의 디바운스. 저널(10초)보다 짧다(A6) |
| `QUOTE_ALERT_AFTER_MS` | 60_000 | 장중 not-live 가 이 시간 이상이면 알림. 유예가 없으면 기동 직후 503(Pitfall 7) |

**`quoteAlerting(health, now)` 판정 순서 (계약):**
1. `rejected` · `role_mismatch` → **참** (장중 창과 무관 — 설정 오류라 기다려도 풀리지 않는다)
2. `!inTradingWindow(now)` → 거짓 (장 밖은 본문에만 드러난다)
3. `ready` · `disabled` → 거짓
4. `disconnectedSec × 1000 ≥ 60_000` → 참

**`QuoteHealth` 7키:** `state · keyCount · lingerCount · lastFrameAgeSec · reconnects · subLimitRejects · disconnectedSec`. 계좌 · 사용자 식별자 · 호스트 · 비밀은 없다. 테스트가 키 집합과 식별자 정규식 0 을 단언한다.

**프레임:** `{t:"quote.state", s:"live"}` · `{t:"quote.state", s:"down", since:ISO}`. disabled 면 프레임도 스냅샷(`frame()`)도 없다. 생성 시점에 이미 ready 면 live 스냅샷이 바로 선다.

결선(`/healthz` 필드 · 503 · fanout 인증 직후 스냅샷 · 전이 브로드캐스트)은 26-12 몫이다. 이 플랜은 원천만 만든다.

## TDD 기록

- **Task 1 RED** (`409652fa`): 실패 7건 — N1 · N4 · N5 · N6 · N7 · N10 은 `expected [] to deeply equal [ [ 29, 'KR7005930003', true, 0 ] ]` 류의 단언 실패, P10 은 `expected { queued: +0 … } to match object { queued: 1 … }`(nudge 가 unsubscribe 갈래로 떨어져 대기 항목이 지워짐). fanout ⑦ · ⑪-b 는 `조건이 서지 않았습니다: … 넛지` 로 실패했다. N2 · N3 · N8 · N9 · N11 · P11 은 회귀 방지 단언이라 RED 에서도 통과했다.
- **Task 1 GREEN** (`480a2567`): relay 전체 **34 files · 855 tests** green. fanout + quote-gateway 실 TCP 를 3회 반복해도 83/83 이었다.
- **Task 2 RED** (`be1296cc`): 테스트와 골격(상수 0 · no-op)을 같이 커밋했다. 모듈은 로드됐고 10건이 단언에서 실패했다(`expected +0 to be 3000` · `expected [] to deeply equal [ { t: 'quote.state', s: 'live' } ]` · `expected null to deeply equal …` · `expected false to be true` 등).
- **Task 2 GREEN** (`a7c06e97`): 14/14 통과. relay 전체 **35 files · 869 tests** green. shared build · relay typecheck(src · tests) · webapp typecheck 오류 0.
- `check tdd-red-evidence` 는 vitest 출력을 파싱하지 못한다(알려진 툴링 제약). 그래서 관찰한 실패 출력을 여기에 적었다. REFACTOR 커밋은 없다.

## Task Commits

1. **Task 1 RED: 83 재송신 넛지 실패 테스트** - `409652fa` (test)
2. **Task 1 GREEN: 83 재송신 넛지 — 첫 참조 · 세션 Ready 에 같은 level 29** - `480a2567` (feat)
3. **Task 2 RED: QuoteStatus 실패 테스트** - `be1296cc` (test)
4. **Task 2 GREEN: QuoteStatus — quote.state 프레임 · healthz 원천 · 장중 60초 알림** - `a7c06e97` (feat)

`actuals.commits: 4` 는 `git rev-list --count 71688cf0..HEAD` 로 잰 값이다. `actuals.tokens` 는 같은 범위 diff 48,415자 / 4 이다.

## Files Created/Modified

- `relay/src/quote/status.ts` (신규) — `QuoteStatus` · `quoteAlerting` · `QUOTE_DOWN_AFTER_MS` · `QUOTE_ALERT_AFTER_MS` · `QuoteHealth` · `QuoteStatusDeps`. `inTradingWindow` 는 `../journal/trading-window.js` 에서 가져온다(새 KST 계산 없음)
- `relay/tests/quote-status.test.ts` (신규) — 디바운스 10건 · 알림 4건
- `relay/src/hub/subscription-hub.ts` — 헤더 Pattern 10 블록 · `UserKeys` · `#nudge` · subscribe 첫 참조 판정 · `#onReady` 넛지 · `#releaseKey` / `#clearCaches` 본 키 정리 · `#releaseUserRef` 0 보존
- `relay/src/hub/subscribe-pacer.ts` — `PacerControlKind` 에 `"nudge"` · 머리 주석
- `relay/tests/hub.test.ts` — `잔량진행률 넛지 (Pattern 10)` N1~N11 · ③ · ④ · ⑤ · LG3 · HL2 보정
- `relay/tests/subscribe-pacer.test.ts` — P10 · P11
- `relay/tests/fanout.test.ts` — ⑪-b 실 TCP 넛지 · ⑦ 보정
- `packages/shared/src/relay.ts` · `packages/shared/src/index.ts` — `RelayQuoteState` · `RelayQuoteStateMsg` · `RelayOutbound` 합류 · 재수출

## Decisions Made

- 승격 · 강등이 같이 일어나는 첫 참조에서는 넛지를 생략한다. 그 29 가 서버에서 같은 `RequestResend` 를 부르므로, 넛지까지 보내면 같은 키의 29 가 중복된다.
- in-flight 키의 넛지는 즉시 보낸다. 계획 규칙(대기 중만 합침)을 그대로 따랐다. in-flight 구독의 29 는 넛지 사용자의 계좌 선언 전에 처리됐을 수 있으므로, 한 건을 더 보내는 편이 안전하다.
- `#userRefs` 는 `Map<userId, Map<key, n>>` 대신 `Map<userId, { held, active }>` 로 바꿨다. 본 키가 남으면 맵 크기는 더 이상 「참조 중인 키 수」 가 아니다. 한도 판정 때마다 순회하지 않으려고 계수를 따로 둔다.
- `QuoteStatus` 의 재평가는 멱등이다. 같은 상태가 다시 통지돼도 아무것도 바꾸지 않는다. 그래서 생성자가 한 번 불러 초기 스냅샷을 세운다. JournalStatus 는 「이전 파생 상태와 같으면 return」 이라, 이미 live 인 원천에 붙으면 스냅샷이 null 로 남는다. 그 차이를 피했다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 기존 테스트 6건이 옛 규칙(다른 사용자의 첫 참조 · 사용자 세션 Ready = 송신 0)을 단언**
- **Found during:** Task 1 (RED 작성 · GREEN 전체 실행)
- **Issue:** hub ③ · ④ · ⑤ · LG3 · HL2 와 fanout ⑦ 이 「두 번째 사용자가 같은 키를 열어도 quote 송신 0」 또는 「사용자 세션 ready 에 quote 송신 0」 을 단언했다. 이 플랜의 must_have(넛지)와 정면으로 어긋난다.
- **Fix:** ③ · ⑦ 은 넛지 29 1건을 기대값에 넣었다. ④ · HL2 는 「28/32 0 · 29 넛지 1」 로 바꿨다. ⑤ 는 사용자 세션 ready 뒤 「그 사용자 키의 29 넛지 1건 · 28/32 0」 을 단언하고 나서 합집합 재구독을 본다. LG3 은 같은 사용자 복귀(넛지 0)로 바꿨고, 다른 사용자 복귀는 N4 가 맡는다. ③ · LG3 · ⑦ 은 RED 커밋에, ④ · ⑤ · HL2 는 GREEN 전체 실행에서 발견해 GREEN 커밋에 넣었다.
- **Files modified:** relay/tests/hub.test.ts, relay/tests/fanout.test.ts
- **Verification:** relay 전체 green. 각 케이스가 지키려던 본래 목적(업스트림 구독 한 벌 · 28/32 재요청 0 · 사용자 세션 시세 요청 0)은 그대로 단언한다.
- **Committed in:** 409652fa · 480a2567

**2. [Rule 1 - Bug] quote-status 테스트 픽스처의 두 번째 기동 `since` 기대값**
- **Found during:** Task 2 GREEN
- **Issue:** 「rejected · role_mismatch 도 3초 뒤 down」 의 두 번째 `boot()` 는 첫 기동보다 3초 뒤에 일어난다. 그런데 기대값을 첫 기동 시각(BOOT)으로 적었다.
- **Fix:** 재기동 시각을 캡처해 기대값으로 썼다. 구현은 바꾸지 않았다.
- **Files modified:** relay/tests/quote-status.test.ts
- **Committed in:** a7c06e97

---

**Total deviations:** 2 auto-fixed (둘 다 Rule 1 — 테스트 기대값)
**Impact on plan:** 범위 확장은 없다. 1 은 넛지 규칙이 필연적으로 바꾸는 기존 단언을 새 규칙에 맞춘 것이다. 2 는 픽스처 오타다.

## Issues Encountered

- orchestrator 가 master main tree 순차 실행을 지정했다. 그래서 master 에 커밋했고 push 와 배포는 하지 않았다. 커밋 직전마다 `git status -sb` · `git diff --cached --stat` 로 내 파일만 스테이징됐는지 확인했다. untracked(`milestone.lock` · `shots/` · `research/.cache/`)는 건드리지 않았다. 사용자 전역 규칙에 따라 Co-Authored-By 는 넣지 않았다.

## Known Stubs

없음. `QuoteStatus` 는 아직 부팅(`index.ts`) · healthz · fanout 에 결선되지 않았다. 이것은 계획된 범위 분할이다(26-12 가 결선한다). 스텁이 아니다.

## Threat Flags

없음. 새 네트워크 표면이나 인증 경로를 만들지 않았다. T-26-02(① 무시 유지 · 넛지는 서버가 ②로 다시 내게 할 뿐), T-26-18(7키 · 식별자 정규식 0), T-26-19(장중 60초 · 장 밖 본문만 · 거부/불일치만 즉시), T-26-20(첫 참조 · 세션 Ready 에만 · 같은 사용자 복귀 0 · 대기 병합)을 적용했다.

## User Setup Required

없음. 외부 서비스 설정이 필요 없다.

## Next Phase Readiness

- 26-12 (healthz · fanout 결선): `new QuoteStatus({ feed, hubStats: () => hub.stats() })` 한 줄로 만든다. `/healthz` 의 `quote` 필드는 `status.health(Date.now())`, 503 은 `quoteAlerting(health, new Date())` 로 판정한다. 인증 직후 스냅샷은 `status.frame()`(null 이면 보내지 않음)이고, 전이는 `status.on("frame")` 을 전 인증 연결에 보낸다. 프레임에 사용자 데이터가 없으므로 전원 브로드캐스트가 맞다.
- 26-14 (webapp 배지): `RelayQuoteStateMsg` 가 `RelayOutbound` 에 합류했다. 옛 리듀서는 모르는 `t` 를 무시한다.
- 배포 후 확인(D11 · human_judgment): 체결 없는 상한가 종목을 A 가 보는 중에 B 가 처음 열어 대기 주문 진행률 막대가 곧바로 서는지 본다. debug 로그 `[HUB] 83 재송신 넛지` 로 넛지 송신을 확인할 수 있다.

---
*Phase: 26-shared-quote-feed*
*Completed: 2026-09-30*

## Self-Check: PASSED

- 파일 존재: relay/src/quote/status.ts · relay/tests/quote-status.test.ts · subscription-hub.ts · subscribe-pacer.ts
- 커밋 존재: `409652fa` · `480a2567` · `be1296cc` · `a7c06e97`
- Task 1 acceptance: `#nudge(` 4 · pacer `"nudge"` 3 · `RequestResend` 3 · `MarketPublisher.cpp:771` 1 · `#onReady` 안 `#nudge(` 1 · 「잔량진행률 넛지」 hub 2 · fanout 1 · relay 실패 0
- Task 2 acceptance: `t: "quote.state"` 1 · index `RelayQuoteStateMsg` 1 · `QUOTE_DOWN_AFTER_MS = 3_000` 1 · `QUOTE_ALERT_AFTER_MS = 60_000` 1 · 거부 검사 줄이 창 판정 줄보다 앞 1 · trading-window import 1 · `it(` 15
- 검증: shared build · relay typecheck(src · tests) · webapp typecheck 오류 0 · relay 35 files / 869 tests green
