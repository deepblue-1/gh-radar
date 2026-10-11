---
phase: 26-shared-quote-feed
plan: 03
subsystem: relay
tags: [relay, hub, fanout, quote-feed, tracer, websocket, fake-gateway]

requires:
  - phase: 26-02
    provides: "QuoteFeed(role 1) · 스텁 게이트웨이 quote 모드(respondQuoteLogin · waitForQuoteConnection · readSubscribeRequest · quoteLoginRequests)"
provides:
  - "SubscriptionHub 전역 시세 키 marketKey(isin|ex) · 83 전용 progressKey(userId|isin|ex)"
  - "HubQuoteFeed 표면 + attachFeed(feed) — 시세 업스트림 송신자 = quote 연결 하나, feed ready = 합집합 재구독 유일 트리거"
  - "HubMarketEvent { key, msg: RelayQuote | RelayTape, full, price } · hub \"market\" 이벤트"
  - "#onFeedFrame 명시 case 표 (58/59 · 69/71 전역 · 79/76/78/83 무시 · 54/77/80 warn · default PC-12 계수)"
  - "인자 없는 resubscribeAll() · 전역 getSnapshot/getTape/refCount/subscriptionLevel(isin, ex)"
  - "WsFanout #keyConns 키 구독자 색인 + #deliverMarket(소켓 level 필터)"
  - "fanout.test quote 스텁 게이트웨이 하네스(별도 인스턴스 + 실 QuoteFeed) · ⑦ Phase 26 트레이서"
affects: [26-04 boot wiring, 26-05 e2e fixture, 26-06 hub frame boundaries, 26-07 PRICE judge, 26-08 linger, 26-09 limits, 26-10 pacing, 26-11 nudge/QuoteStatus, 26-12 healthz]

actuals:
  tokens: 23429
  tasks: 1
  commits: 1
plan_head_before: e6f11bfa0d4e5d980dab6cbf0c369253be5a418c

tech-stack:
  added: []
  patterns:
    - "공개 시세는 키 단위 이벤트(\"market\") 한 경로 · 사용자 데이터는 userId 단위(\"fanout\") 한 경로 — 페이로드 타입을 좁혀 두 경로를 컴파일 단계에서 가른다"
    - "fanout 키 구독자 색인(#keyConns)은 conn.keys 를 바꾸는 같은 자리(#indexKey/#unindexKey)에서만 갱신"
    - "시세 늦은 프레임(참조계수 없는 키)은 캐시하지 않고 버린다 — 1→0 에서 지운 전역 캐시가 되살아나지 않게"
    - "테스트 하네스는 사용자 게이트웨이와 별도의 quote 스텁 인스턴스를 둔다 — 기존 사용자 게이트웨이 첫 소켓 케이스 무변경"

key-files:
  created: []
  modified:
    - relay/src/hub/subscription-hub.ts
    - relay/src/ws/fanout.ts
    - relay/tests/hub.test.ts
    - relay/tests/fanout.test.ts

key-decisions:
  - "attachFeed 가 이미 Ready 인 feed 를 보유 키가 있는 상태에서 결선하면 그 자리에서 한 번 재구독한다 — 교체 결선 때 지나간 ready 를 기다리면 새 feed 에 구독이 영영 걸리지 않는다"
  - "#onQuote · #onTape 는 참조계수 없는 키의 프레임을 캐시하지 않고 버린다(해제 뒤 in-flight 프레임이 1→0 에서 지운 전역 캐시를 되살리는 것 방지)"
  - "closeAll 은 #feed 를 null 로 내려 옛 feed 의 늦은 frame/ready 를 정본 대조로 침묵시킨다"
  - "fanout.test 의 quote 게이트웨이는 사용자 게이트웨이와 별도 스텁 인스턴스 — 운영은 같은 서버지만 relay 는 연결마다 host/port 를 따로 받는다"

patterns-established:
  - "HubQuoteFeed: 시세 업스트림 송신자 추상화 — isReady · send · on(frame) · on(ready). QuoteFeed 가 구조적으로 만족"
  - "사용자 세션에 온 58/59/69/71 = 명시 case warn 후 무시(구독이 없으니 이상 신호) — default 로 떨어뜨리지 않는다"

requirements-completed: []

coverage:
  - id: D1
    description: "두 사용자 × 같은 종목 → quote 연결에만 28 → 29(true · level 0) → 32 한 벌, 사용자 세션 연결 28/29/32 0건, quote 로그인 role 1 · client gh-radar-relay/quote (실 TCP 두 스텁 → 실 wss)"
    verification:
      - kind: integration
        ref: "relay/tests/fanout.test.ts#⑦ Phase 26 트레이서 — 두 사용자 같은 종목: quote 연결 29 한 벌 · 사용자 세션 29 0 · 캐시 공유 · 구독 소켓만 수신 · 미등록 0"
        status: pass
      - kind: unit
        ref: "relay/tests/hub.test.ts#③ 두 사용자 같은 키 = 업스트림 한 벌"
        status: pass
    human_judgment: false
  - id: D2
    description: "캐시 공유 — 캐시가 찬 뒤 같은 키를 새 탭이 구독하면 28 재요청 없이 즉시 q · 그 키를 잡지 않은 소켓과 dma_credentials 미등록 소켓은 0건(D-09)"
    verification:
      - kind: integration
        ref: "relay/tests/fanout.test.ts#⑦ Phase 26 트레이서 (A2 · U 단언)"
        status: pass
      - kind: integration
        ref: "relay/tests/fanout.test.ts#⑪ 같은 키를 다른 소켓이 잡고 있는 동안 새 소켓은 캐시로 즉시 응답하고 28 재송은 0 이다"
        status: pass
      - kind: integration
        ref: "relay/tests/fanout.test.ts#④ dma_credentials 매핑이 없으면 … (전역 참조계수 0 · quote 요청 0)"
        status: pass
    human_judgment: false
  - id: D3
    description: "사용자 세션 ready 는 계좌 25 · 전략 24/21/34 만 · 28/29/32 0건, quote 연결 ready 가 전역 합집합을 실효 level 로 재구독(PRICE 키는 28 · 29(level 1)만), quote 미Ready 구독은 참조계수만"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#⑤ · ⑪ · L6 · L8"
        status: pass
    human_judgment: false
  - id: D4
    description: "시세는 hub \"market\"(userId 없음, full/price 플래그 · tape price false), 51/66 사용자 데이터는 \"fanout\" userId 하나 — fanout 은 키 색인 + 소켓 level 필터(tape full 전용)"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#⑥ · ⑧ · ⑨"
        status: pass
      - kind: integration
        ref: "relay/tests/fanout.test.ts#F1 · F2 (price 소켓 tape 0 · q 통과)"
        status: pass
    human_judgment: false
  - id: D5
    description: "사용자 데이터 격리 · PC-12 · D-09 불변식 회귀 — ㉒ 전략 스냅샷 · P2 83 · 계좌 · ⑭-3 드롭 0 게이트 · 관찰자 전용 프레임 describe 무수정 green"
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/shared build && relay typecheck && relay typecheck:tests && relay test (32 files · 772 tests)"
        status: pass
    human_judgment: false

duration: 11min
completed: 2026-09-30
status: complete
---

# Phase 26 Plan 03: 시세 전용 quote 연결 트레이서 Summary

**SubscriptionHub 시세 키를 전역 `isin|ex` 로 바꾸고 업스트림 송신자를 quote 연결(`HubQuoteFeed` · `attachFeed`) 하나로 교체했다. WsFanout 은 키 구독자 색인(`#keyConns` → `#deliverMarket`)으로 시세를 보낸다. 그 결과 「두 사용자 × 같은 종목 → quote 연결 29 한 벌 · 사용자 세션 29 0 · 캐시 공유 · 구독 소켓만 수신」 을 실 TCP 스텁 두 대 → 실 QuoteFeed → 실 hub · fanout → 실 wss 로 증명했다.**

## Performance

- **Duration:** 약 11분
- **Started:** 2026-09-30T13:17:08Z
- **Completed:** 2026-09-30T13:28:19Z
- **Tasks:** 1 (tracer)
- **Files modified:** 4

## 트레이서 테스트

`relay/tests/fanout.test.ts` — **`⑦ Phase 26 트레이서 — 두 사용자 같은 종목: quote 연결 29 한 벌 · 사용자 세션 29 0 · 캐시 공유 · 구독 소켓만 수신 · 미등록 0`**

실 `SessionManager`(사용자 스텁 게이트웨이), 실 `QuoteFeed`(별도 quote 스텁 게이트웨이 · role 1 자동 응답), 실 hub · fanout, `connectWs` 를 쓴다. A · A2(A 의 두 번째 탭 · 구독 없음) · B · U(`token-none`)가 인증한 뒤 다음을 단언한다.

- quote 로그인 1건이 `role 1` · `client "gh-radar-relay/quote"` 로 나갔다.
- A · B 가 같은 KRX 키를 sub 하면 quote 게이트웨이에 28 · 32 가 각 1건, 29 가 `[{subscribe:true, level:0}]` 1건 간다. 사용자 게이트웨이로 간 28/29/32 는 0건이다.
- 58(71_500)은 A · B 에 각 1건 가고, A2 · U 에는 0건이다.
- 이어서 A2 가 sub 하면 캐시로 즉시 `q`(71_500 · snap)를 받는다. quote 28 누적은 여전히 1이다.
- 59(71_600)는 A · B · A2 에 각 1건 가고 U 에는 0건이다. `unhandledFrameCount() === 0` 이다.

뮤테이션 확인: `#deliverMarket` 을 키 색인 대신 모든 소켓으로 돌도록 바꾸자 트레이서가 `expected length 0 but got 1` 로 실패했고, 확인 뒤 원복했다.

## 다시 쓴 hub/fanout 케이스 (원래 지키던 것 → 새 단언)

| 케이스 | 원래 지키던 것 | 새 단언 |
|---|---|---|
| hub ① | 같은 사용자 두 번 구독 = 게이트웨이 1건 | 같음 — 대상이 feed 이고, 사용자 세션 시세 요청 0 |
| hub ② | 마지막 해제에서만 29(false) | 같음 — feed 대상 |
| hub ③ | 다른 사용자의 해제가 첫 사용자 구독을 끊지 않음(사용자별 키 D-13) | 두 사용자 같은 키 = 28/29/32 한 벌. A 해제 시 프레임 0 · 캐시 유지, B 해제 시 29(false) 1건 · 그 키 스냅샷/테이프 캐시 정리(참조계수가 격리를 대신한다) |
| hub ④ | 캐시 즉시 반환 + 다른 사용자 캐시는 비어 있음 | 전역 캐시 즉시 반환, 두 번째 사용자 구독도 재요청 0 · 같은 캐시 |
| hub ⑤ | 세션 ready 가 보유 키 재구독 | 사용자 세션 ready 는 25/24/21/34 만 보내고 28/29/32 는 0건. feed ready 가 두 사용자 키 합집합을 재구독(28×2 · 32×2) |
| hub ⑥ ⑦ ⑧ | 테이프 200ms 배치 · 링버퍼 · 시세 무배치(userId 팬아웃) | `"market"` tape 1건(entry 3 · full true · price false), 전역 링버퍼, `"market"` q 2건(full/price true) · `"fanout"` 0 |
| hub ⑨ | 팬아웃 대상은 프레임을 보낸 세션의 userId 하나(T-15-02) | 시세는 `"market"`(userId 없음), 사용자 세션 51/66 은 `"fanout"` userId 하나(T-15-02 를 사용자 데이터 격리로 재정의) |
| hub ⑪ · L8 | 세션 미Ready 구독은 기록만 → ready 복원 | feed 미Ready 구독은 기록만 → feed ready 가 복원(실효 level) |
| hub ⑫ · L1~L7 | level 규칙 · 이중 해제 | 같음 — feed 대상 · `(isin, ex)` 시그니처. L6 트리거는 feed ready |
| fanout ④ | 미등록 sub 은 구독 안 됨 | 전역 참조계수 0 · quote 요청 0(D-09) |
| fanout ⑥ | 같은 사용자 두 탭 = 게이트웨이 29 1건 | quote 게이트웨이 29 1건 · 사용자 게이트웨이 시세 요청 0 |
| fanout ⑦ | 다른 사용자의 시세는 절대 넘어가지 않는다 | **Phase 26 트레이서**로 교체(위) |
| fanout ⑨ | 소켓 닫힘 = 그 소켓 키만 해제, 마지막에 29(false) | 같음 — quote 게이트웨이의 29 되읽기로 확인(subscribe:false) |
| fanout ⑪ | 재접속(참조계수 0 을 지난 뒤) 캐시 즉시 응답 | 같은 키를 다른 소켓이 잡고 있는 동안 새 소켓은 캐시로 즉시 응답 · 28 재송 0(0 을 지난 재접속은 linger 26-08) |
| fanout F1~F6 | level 소켓 필터 · 승격/강등 | 같음 — quote 게이트웨이 계수 · quote 소켓 주입 · 전역 getter. describe afterEach 에서 사용자 게이트웨이 시세 요청 0 단언 |

무수정 green: hub ⑩ ⑬ ⑭ · 관찰자 전용 프레임 describe · 83 describe 전부, fanout ①~⑤ · ⑧ · ⑩ · ⑫ · ⑬~㉔ · P1~P4 · ⑭-3 드롭 0 게이트. 사용자 데이터 격리 케이스(㉒ 전략 스냅샷 · P2 83 · 계좌)도 여기에 포함된다.

## 해당 없음: 거래원 캐시

해당 없음: 거래원 캐시 — 74/75 는 envelope 단계 드롭(msg-type.ts:270-272) · relay 거래원 캐시 없음. ROADMAP Goal 문구의 「거래원 캐시 유저 간 공유」 는 relay 에 대응물이 없다. 74/75 는 `OUT_OF_SCOPE_INBOUND_MSG_TYPES` 로 hub 에 닿기 전에 버려지므로 공유할 캐시가 없다.

## 이 플랜이 의도적으로 남긴 것 (같은 phase 뒤 플랜이 아키텍처 변경 없이 채운다)

1. 부팅 결선: `index.ts` 가 QuoteFeed 를 만들어 `attachFeed` 하는 일과 D-17 비밀 폴백 — 26-04. 이 커밋 뒤 26-04 전까지 프로덕션 부팅 경로에는 feed 가 붙지 않고 참조계수만 기록된다. 배포는 26-15 한 번이라 이 중간 상태가 프로덕션에 나가지 않는다.
2. e2e 픽스처 — 26-05. 이 플랜 뒤 e2e 는 quote 연결이 없어 시세가 0이다.
3. hub 프레임 경계 전용 단위 테스트(quote 76/78/83 무시 · 사용자 세션 58/59/69/71 warn · 54/77/80 warn)와 실 TCP 재접속 합집합 재구독 — 26-06.
4. PRICE 판정기(D-05) — 26-07. 지금 `price` 플래그는 58 · 59 모두 true 다.
5. 1→0 에서 즉시 29(false)를 보내고 전역 캐시를 정리한다. linger(D-10)는 26-08.
6. 전역 2000(D-11) · 사용자 200(D-15) · `sub.limit` — 26-09.
7. 합집합 재구독 페이싱(Pitfall 3) — 26-10. 지금은 for 루프 1회다.
8. 83 재송신 넛지(Pitfall 6) · `QuoteStatus` — 26-11.
9. `/healthz` quote 축 · `quote.state` 프레임 — 26-12.

## Accomplishments

- per-user 종목 구독 경로를 걷어냈다(D-12 빅뱅). env 플래그나 폴백은 남기지 않았다. 사용자 세션 ready 는 계좌 · 전략 · 83 재동기화 · 종목마스터만 한다.
- 공개 시세 경로 `"market"` 의 페이로드 타입을 `RelayQuote | RelayTape` 로 좁혔다. 그래서 계좌 · 주문 · 전략 · 83 은 컴파일 단계에서 이 경로를 탈 수 없다(T-26-01).
- `#deliver` 에 남아 있던 price 소켓 tape 건너뛰기(죽은 분기)를 지우고 `#deliverMarket` 으로 옮겼다.

## Task Commits

1. **Task 1 (tracer): 두 사용자 × 같은 종목 — hub 전역 키 · quote 송신자 · fanout 키 색인 · 트레이서** - `0d744f84` (feat)

**Plan metadata:** 이 SUMMARY 커밋 (docs(26-03))

`TASK_BASE` = `e6f11bfa0d4e5d980dab6cbf0c369253be5a418c` · `git rev-list --count TASK_BASE..HEAD -- relay` = 1.

## Files Created/Modified

- `relay/src/hub/subscription-hub.ts` — 헤더 결정 근거 갱신(D-12 · T-15-02 재정의 · Pitfall 4 재정의 · D-35 전역 타이머 · D-37 1→0 정리 · quote 수신 표). 추가: marketKey/progressKey · HubQuoteFeed · attachFeed · HubMarketEvent · #onFeedFrame · 인자 없는 resubscribeAll · 전역 getter · #splitMarketKey/#splitProgressKey. 제거: #countKeys · 사용자별 테이프 배치/타이머
- `relay/src/ws/fanout.ts` — 헤더 7번 · T-15-02 갱신 · #keyConns · #indexKey/#unindexKey · `hub.on("market")` · #deliverMarket · #deliver 단순화 · getSnapshot/getTape 전역 시그니처
- `relay/tests/hub.test.ts` — FakeFeed(HubQuoteFeed) · FakeSession.quoteReqs · ①~⑫ · L1~L8 재작성
- `relay/tests/fanout.test.ts` — quote 스텁 게이트웨이 하네스(별도 인스턴스 · 실 QuoteFeed · attachFeed · 29 되읽기 누적) · ④ ⑥ ⑦ ⑨ ⑩ ⑪ ⑬ ⑳ · F1~F7 갱신 · ⑦ 트레이서

## Decisions Made

- `attachFeed` 교체 결선 때, feed 가 이미 Ready 이고 보유 키가 있으면 그 자리에서 1회 재구독한다. 운영 부팅(attach → start)에서는 보유 키가 0 이라 이 경로가 실행되지 않는다.
- 참조계수 없는 키의 58/59 · 69/71 은 캐시하지 않고 debug 로그만 남긴다. 해제 뒤 늦게 도착한 프레임이 지운 전역 캐시를 되살리지 못하게 하려는 것이다.
- `closeAll()` 은 `#feed` 를 null 로 만든다. 프로세스 종료 뒤 늦게 오는 frame/ready 는 침묵한다.

## Deviations from Plan

None - plan executed exactly as written. (위 Decisions 3건은 플랜 action 이 정하지 않은 세부를 구현하면서 정한 것이고 범위 밖 변경은 없다.)

## Issues Encountered

- 이 저장소는 사용자 규약상 master 에서 작업하고, orchestrator 가 master main tree 순차 실행을 지정했다. 그래서 #3819 보호 브랜치 판정(`git.base-branch --is-protected master` = true)이 나와도 26-01 · 26-02 와 같은 방식으로 master 에 커밋했다. push 는 하지 않았다.
- 동시 세션의 미커밋 webapp 파일 2개(card-header.tsx · strategy-card.tsx)와 untracked 파일(milestone.lock · shots/ · research/.cache/)은 스테이징하지 않았다. 경로를 하나씩 지정해 add 했고, 커밋 직전 `git status -sb` · `git diff --cached --stat` 으로 확인했다.
- 사용자 전역 규칙(Co-Authored-By 금지)에 따라 커밋 메시지에 Co-Authored-By 를 넣지 않았다. 26-01 · 26-02 커밋과 같은 방식이다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 26-04: `new QuoteFeed({ secret: <D-17>, host, port })` → `hub.attachFeed(feed)` → `feed.start()` · 종료 시 `feed.stop()`. hub 생성자 시그니처는 바뀌지 않았다.
- 26-06: 명시 case 표는 파일 헤더와 `#onFeedFrame` 에 있다. 경계 단위 테스트는 FakeFeed / FakeSession 에 그대로 얹으면 된다.
- 26-07: `#onQuote` 의 `price: true` 자리에 판정기를 붙이면 된다. fanout 은 이미 `e.price` 로 거른다.
- 26-08 · 26-09: `unsubscribe` 1→0 분기와 `subscribe` 의 `prevTotal === 0` 분기가 linger · 가드가 들어갈 자리다.

---
*Phase: 26-shared-quote-feed*
*Completed: 2026-09-30*

## Self-Check: PASSED

- 수정 파일 4개 존재 · 커밋 `0d744f84` 존재 · acceptance 전 항목 PASS(HubMarketEvent 1 · 좁힌 타입 1 · attachFeed 3 · 코드 subKey( 0 · marketKey( 9 · progressKey( 2 · #onReady resubscribeAll 0 · #keyConns 9 · market 결선 1 · #deliver "tape" 0 · 트레이서 2 · FakeFeed 4 · 실 IP 리터럴 0 · 금지 파일 diff 0 · relay 커밋 1) · relay 32 files / 772 tests green · 스텁 패턴(TODO/FIXME/placeholder) 0
