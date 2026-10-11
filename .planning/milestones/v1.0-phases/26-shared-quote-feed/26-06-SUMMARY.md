---
phase: 26-shared-quote-feed
plan: 06
subsystem: relay
tags: [relay, hub, quote-feed, tcp, fake-gateway, pc-12, reconnect, vitest]

requires:
  - phase: 26-02
    provides: "QuoteFeed(role 1) · 스텁 quote 모드(respondQuoteLogin · waitForQuoteConnection · quoteLoginRequests · readSubscribeRequest · hardClose)"
  - phase: 26-03
    provides: "hub attachFeed · #onFeedFrame 명시 case 표 · 사용자 세션 58/59/69/71 명시 warn · 늦은 프레임 미캐시 · FakeFeed/FakeSession"
provides:
  - "hub.test describe 「SubscriptionHub — quote 연결 프레임 경계 (Phase 26)」 7케이스 (①~⑦)"
  - "quote-gateway.test describe 「실 hub 결선 — 재접속 합집합 재구독 · 송신 집합 (Phase 26)」 H1~H3 (실 TCP + 실 QuoteFeed + 실 SubscriptionHub)"
  - "quote 연결 송신 msg_type ⊆ {4, 5, 28, 29, 32} afterEach 단언 (T-26-09)"
affects: [26-07 PRICE judge, 26-08 linger, 26-09 limits, 26-10 pacing, 26-11 nudge/QuoteStatus, 26-12 healthz]

actuals:
  tokens: 5312
  tasks: 2
  commits: 2
plan_head_before: 03c3b07bc2422298bac1434a1ce31b363faa0f4f

tech-stack:
  added: []
  patterns:
    - "특성화(characterization) 테스트가 처음부터 green 이면 뮤테이션으로 공허하지 않음을 증명한다 — 대상 갈래를 하나씩 깨고 그 케이스만 실패하는지 본 뒤 byte-identical 로 원복"
    - "실 TCP 스텁의 onFrame(msgType, payload, sock) 으로 소켓별 요청을 모은다 — 스텁에 새 공개 API 를 더하지 않는다"
    - "「unhandledFrameCount 0」 단언 옆에 같은 계수기가 살아 있음(명시 case 없는 번호 → 1)을 한 번 보인다"

key-files:
  created: []
  modified:
    - relay/tests/hub.test.ts
    - relay/tests/quote-gateway.test.ts

key-decisions:
  - "hub · feed 결함 없음 — relay/src 무수정. 26-03 이 넣은 갈래를 테스트로만 잠갔다"
  - "송신 집합 단언(T-26-09)은 describe afterEach 에 둬 H1~H3 전 케이스에 건다 — 케이스별 누락이 없다"
  - "H2 는 full 키를 feed Ready 이전에(ready 복원 경로) · price 키를 Ready 뒤에(0→1 경로) 잡아 두 송신 경로와 재접속 합집합 재구독을 한 케이스에서 본다"

patterns-established:
  - "quote 연결 경계 테스트 두 층: hub 단위(FakeFeed · FakeSession · logger.warn 스파이 구조화 필드 대조) + 실 TCP(스텁 onFrame 소켓별 기록 · waitFor 폴링, 고정 sleep 은 「두 번 오지 않음」 관찰 여유에만)"

requirements-completed: []

coverage:
  - id: D1
    description: "사용자 세션(Ready)으로 온 58/59/69/71 은 명시 case warn 4건 뒤 무시 — market 0 · fanout 0 · 전역 캐시 0 · unhandledFrameCount 0 (PC-12 · D-08)"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#SubscriptionHub — quote 연결 프레임 경계 (Phase 26) ①"
        status: pass
    human_judgment: false
  - id: D2
    description: "quote 연결 78(빈 스냅샷) · 76 무시 — 사용자 돌파 캐시 불변 · fanout 0 · market 0 · unhandledFrameCount 0 (Open Q2 RESOLVED 무시안)"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#quote 연결 프레임 경계 ②"
        status: pass
      - kind: integration
        ref: "relay/tests/quote-gateway.test.ts#실 hub 결선 H1 · H3"
        status: pass
    human_judgment: false
  - id: D3
    description: "quote 연결 83(남의 계좌 포함) 무시 — 사용자 83 캐시(getQueueProgressEntries) 불변 · fanout 0 · 남의 계좌 문자열 0 (T-26-02)"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#quote 연결 프레임 경계 ③"
        status: pass
      - kind: integration
        ref: "relay/tests/quote-gateway.test.ts#실 hub 결선 H3"
        status: pass
    human_judgment: false
  - id: D4
    description: "quote 연결 54/77/80 warn 각 1건 · unhandledFrameCount 0 · 명시 case 없는 번호(51)만 계수 1 · fanout 0"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#quote 연결 프레임 경계 ④"
        status: pass
    human_judgment: false
  - id: D5
    description: "feed 미결선 구독은 참조계수만 → attachFeed + ready 에서 full 28·29(0)·32 · price 28·29(1) 복원 · 사용자 세션 송신 0 / 1→0 뒤 늦은 59·71 미캐시 / attachFeed 같은 객체 no-op · 교체 warn 1 · 옛 feed 58·ready 침묵"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#quote 연결 프레임 경계 ⑤ · ⑥ · ⑦"
        status: pass
    human_judgment: false
  - id: D6
    description: "실 TCP — hardClose → role 1 재로그인 → 보유 키 전량 실효 level 재구독(full 28·29(0)·32 · price 28·29(1)) · reconnects 1 · 참조계수/level 불변 · 사용자 LoginReq 0 (확정-재접속 · D-03)"
    verification:
      - kind: integration
        ref: "relay/tests/quote-gateway.test.ts#실 hub 결선 H2"
        status: pass
    human_judgment: false
  - id: D7
    description: "quote 연결이 게이트웨이로 보낸 msg_type ⊆ {4, 5, 28, 29, 32} — 주문 · 전략 · 계좌 · 저널 · 39 누출 0 (T-26-09)"
    verification:
      - kind: integration
        ref: "relay/tests/quote-gateway.test.ts#실 hub 결선 afterEach (H1~H3 공통)"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-09-30
status: complete
---

# Phase 26 Plan 06: quote 연결 프레임 경계 · 재접속 합집합 재구독 Summary

**quote 연결 경계와 끊김 뒤 복구를 테스트로 잠갔다. hub 단위 7케이스는 사용자 세션 시세 프레임, feed 76/78/83(남의 계좌 포함), 54/77/80, feed 없이 한 구독, 늦은 59, feed 교체를 다룬다. 실 TCP 3케이스(스텁 + DmaClient + QuoteFeed + SubscriptionHub)는 hardClose → role 1 재로그인 → full/price 합집합 재구독과 송신 집합 ⊆ {4,5,28,29,32}를 다룬다. hub/feed 결함은 없었고 relay/src 는 한 줄도 바꾸지 않았다.**

## Performance

- **Duration:** 약 6분
- **Started:** 2026-09-30T13:55:35Z
- **Completed:** 2026-09-30T14:01:13Z
- **Tasks:** 2
- **Files modified:** 2 (테스트만)

## 새 테스트

`relay/tests/hub.test.ts`, describe **「SubscriptionHub — quote 연결 프레임 경계 (Phase 26)」**

| # | 케이스 | 잠그는 것 |
|---|---|---|
| ① | 사용자 세션(Ready)으로 온 58 · 59 · 69 · 71 은 명시 case warn 뒤 무시 | warn 4건(구조화 필드 `{userId, msgType}` 순서 대조) · market 0 · fanout 0 · 키를 잡은 상태에서도 전역 캐시 0 · unhandled 0 · 업스트림 추가 송신 0 (PC-12 · D-08) |
| ② | quote 연결 78(빈) · 76 무시 | 사용자 돌파 캐시(`getRateCrossItems`) 불변 · fanout 0 · market 0 · unhandled 0 |
| ③ | quote 연결 83(남의 계좌 포함) 무시 | 같은 키 · 다른 키 · 빈 스냅샷 3종 모두 `getQueueProgressEntries` 불변 · fanout 0 · 남의 계좌 문자열 0 (T-26-02) |
| ④ | quote 연결 54 · 77 · 80 warn 각 1 | unhandled 0 · 77 이 사용자 예약창 캐시에 닿지 않음. 대조군: 명시 case 없는 51 → unhandled 1(계수기가 살아 있음) · fanout 0 |
| ⑤ | feed 미결선 구독 → attachFeed + ready 복원 | refCount 1 · warn 「quote 연결 없이 구독」 2 · 사용자 세션 송신 0 → full 28·29(true·0)·32 · price 28·29(true·1) |
| ⑥ | 1→0 뒤 늦은 59 · 71 | `getSnapshot`/`getTape` undefined · market 0 |
| ⑦ | attachFeed 같은 객체 no-op / 다른 객체 교체 | warn 0 · 리스너 1벌 → warn 1 · 새 feed 즉시 재구독 · 옛 feed 58 · ready 침묵 · 새 feed 58 → market 1 |

`relay/tests/quote-gateway.test.ts`, describe **「실 hub 결선 — 재접속 합집합 재구독 · 송신 집합 (Phase 26)」** (실 스텁 + 실 `DmaClient` + 실 `QuoteFeed` + 실 `SubscriptionHub.attachFeed`)

| # | 케이스 |
|---|---|
| H1 | role 1 로그인 직후 78 이 hub 에 1회 닿아도 unhandled 0 · fanout 0 · market 0 · 보유 키 0 이라 재구독 0 |
| H2 | full 키(Ready 이전 → ready 복원) · price 키(Ready 뒤 0→1)가 첫 소켓으로 28·29(0)·32 / 28·29(1)를 보낸다. hardClose → role 1 재로그인 → 새 소켓으로 같은 두 벌이 다시 가고 중복은 없다. reconnects 1 · refCount/level 불변 · 재로그인 78 도 무시 |
| H3 | quote 소켓으로 온 76 · 83(남의 계좌 포함) → hub fanout 0 · market 0 · unhandled 0 |
| afterEach | 모든 H 케이스에서 게이트웨이가 받은 msg_type ⊆ {4, 5, 28, 29, 32} (T-26-09) · LoginReq(1) 0 · 저널 관찰자 로그인 0 · 비밀 로그 0 |

## TDD 기록 (RED 대신 뮤테이션)

이 플랜은 26-03 이 이미 구현한 갈래를 잠그는 특성화 테스트다. 그래서 새 케이스 10개는 처음 실행부터 green 이었다(tdd.md 「Unexpected GREEN」). 기능이 이미 있다는 것은 26-03 SUMMARY 로 확인했다. 테스트가 공허하지 않다는 것은 뮤테이션으로 증명했다. hub 에서 대상 갈래를 하나씩 깨고, 그 케이스만 실패하는 것을 확인한 뒤 `cmp` 로 byte-identical 원복을 확인했다.

| 뮤테이션 (subscription-hub.ts) | 실패한 케이스 |
|---|---|
| M1 사용자 세션 58/59/69/71 명시 case 제거(default 로) | ① 만 실패 |
| M2 `#onQuote` 참조계수 가드 제거 | ⑥ 만 실패 |
| M3 `#onFeedFrame` 정본 feed 대조 제거 | ⑦ 만 실패 |
| M4 feed 83 을 사용자 `#onFrame` 으로 재라우팅 | ③ 만 실패 |
| M5 feed 76/78 을 사용자 `#onFrame` 으로 재라우팅 | ② 만 실패 |
| Ma feed ready → resubscribeAll 제거 | H2 실패(재접속 뒤 두 벌 미도착) |
| Mb resubscribeAll 이 level 무시(전부 full) | H2 실패 |
| Mc `#sendSubscribe` 가 quote 연결로 25 도 송신 | H2 afterEach 실패 `expected [ 25 ] to deeply equal []` (T-26-09) |

`check tdd-red-evidence` 는 vitest 출력을 파싱하지 못한다(알려진 도구 한계). 그래서 위 표를 증거로 남긴다.

## hub/feed 결함 · 수정

없음. `relay/src/hub/subscription-hub.ts` · `relay/src/quote/feed.ts` 는 무수정이다(`git diff 03c3b07b..HEAD -- relay/src` 0줄).

## Accomplishments

- D-03 에는 폴백이 없으므로 quote 연결의 끊김 → 재로그인 → 합집합 재구독이 유일한 복구 경로다. 이 경로를 실 TCP 로 잠갔다. 「재접속했는데 시세가 안 온다」 회귀는 H2 가 잡는다.
- 서버 quote 관문 밖 요청 누출(T-26-09)을 모든 실 TCP 케이스의 afterEach 불변식으로 걸었다.
- quote 83 재라우팅 금지(T-26-02 prohibition)를 hub 단위(③)와 실 TCP(H3) 두 층에서 단언한다.

## Task Commits

1. **Task 1: hub 프레임 경계 단위** - `f21e3a20` (test)
2. **Task 2: 실 TCP 재접속 합집합 재구독 · 송신 집합** - `c8bb0c4b` (test)

**Plan metadata:** 이 SUMMARY 커밋 (docs(26-06))

## Files Created/Modified

- `relay/tests/hub.test.ts`: frames 빌더 import 3개(`buildQueuedWindowStateFrame` · `buildRateCrossAlertFrame` · `buildRateCrossSnapshotFrame`)를 더하고, 끝에 describe 「quote 연결 프레임 경계 (Phase 26)」 7케이스를 붙였다. 이 describe 는 fake timers 와 logger.warn 스파이를 쓴다.
- `relay/tests/quote-gateway.test.ts`: 헤더에 H1~H3 설명을 넣고 import(`SubscriptionHub` · `readQuoteRequestKey` · `SubscribeRequest` · `SAMPLE_ACCOUNT_NO` · `buildQueueProgressFrame`)를 더했다. describe 「실 hub 결선 — …」 H1~H3 도 추가했다. 기존 G1~G7 은 손대지 않았다.

## Decisions Made

- 송신 집합 단언은 describe afterEach 에 뒀다. 그래서 케이스를 더해도 T-26-09 검사가 저절로 따라간다.
- 스텁에는 새 공개 API 를 더하지 않았다. 기존 `onFrame(msgType, payload, sock)` 으로 소켓별 요청을 모으고, 28/32 는 `readQuoteRequestKey` 로, 29 는 `readSubscribeRequest` 로 되읽었다. payload 는 FrameReader 버퍼의 뷰라서 사본을 떠서 읽는다.
- 고정 sleep 은 「두 번 오지 않음 · 중복 없음」 을 관찰하는 100ms 여유에만 쓴다. 상태 대기는 모두 `waitFor` 폴링이다.

## Deviations from Plan

None - plan executed exactly as written.

(수용 기준 `grep -c "실 hub 결선" == 1` 을 맞추려고 파일 헤더 주석 문구를 「실 SubscriptionHub 를 붙인 경로」 로 적었다. 커밋 전에 조정한 것이라 편차가 아니다.)

## Issues Encountered

- 첫 typecheck:tests 에서 `ReturnType<typeof vi.spyOn>` 타입이 호출 인자를 any 로 잃어 TS7006 이 났다. 스파이 변수 타입을 `{ mock: { calls: unknown[][] } }` 로 좁혀 해결했고, 커밋 전에 고쳤다.
- orchestrator 가 master main tree 순차 실행을 지정했다. 그래서 보호 브랜치 판정이 나와도 26-01~05 와 같은 방식으로 master 에 커밋했다. push 는 하지 않았다. 동시 세션의 미커밋 webapp 파일 2개와 untracked 파일은 스테이징하지 않았다. 커밋 직전 `git status -sb` · `git diff --cached --stat` 으로 확인했다.
- 사용자 전역 규칙(Co-Authored-By 금지)에 따라 커밋 메시지에 Co-Authored-By 를 넣지 않았다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 26-07 (PRICE 판정기): `#onQuote` 의 `price: true` 자리에 판정기를 붙인다. hub ①~⑦ · H1~H3 은 price 플래그에 기대지 않으므로 영향이 없다.
- 26-08 (linger): ⑥ 「1→0 뒤 늦은 59 미캐시」 는 1→0 즉시 정리를 전제로 한다. linger 가 들어오면 「linger 만료 뒤 늦은 59」 로 갱신해야 한다. H2 의 hardClose 는 참조계수 1 이 유지되는 경우라 linger 와 무관하다.
- 26-10 (페이싱): H2 는 소켓별 요청 수(5)와 키별 순서만 본다. 합집합 재구독이 페이싱되어도 `waitFor` 로 기다리므로 그대로 유효하다. 전체 순서 단언은 없다.

---
*Phase: 26-shared-quote-feed*
*Completed: 2026-09-30*

## Self-Check: PASSED

- 수정 파일 2개 존재 · 커밋 `f21e3a20` · `c8bb0c4b` 존재
- Task 1 acceptance: describe 문구 1 · it( 7 · unhandledFrameCount 11 · relay 전체 실패 0
- Task 2 acceptance: 「실 hub 결선」 1 · attachFeed 2 · readSubscribeRequest 8 · hardClose 6 · 실 IP 리터럴 0 · relay 전체 실패 0
- relay typecheck · typecheck:tests 오류 0 · relay 33 files / 789 tests green
- 스텁 패턴(TODO/FIXME/placeholder) 0 · relay/src diff 0
