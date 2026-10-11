---
phase: 17-gh-trade-led
plan: 03
subsystem: api
tags: [flatbuffers, relay, dma, gh-trade, protocol, rate-cross, queued-window, tdd]

# Dependency graph
requires:
  - phase: 17-gh-trade-led
    provides: "17-01 의 생성물 3파일(`rate-cross-alert`·`rate-cross-snapshot`·`queued-window-state`) · `MSG` 76/77/78 상수 · shared 계약 `RelayRateCrossItem`/`RelayRateCrossMsg`/`RelayRateCrossSnapMsg`/`RelayQueuedWindowMsg`"
  - phase: 17-gh-trade-led
    provides: "17-02 의 hub 단위 테스트 관례(프레임을 `pushFrame` 으로 실제로 밀어 넣어 브라우저 계약까지 단언)"
provides:
  - "파서 3종 `parseRateCrossAlert()` · `parseRateCrossSnapshot()` · `parseQueuedWindowState()` + 공용 원소 리더 `readRateCrossItem()`"
  - "hub 세션 캐시 2종 — above 집합(`userId|isin:exchange`) · 예약창 최신 1건(`userId`) + getter `getRateCrossItems()`/`getQueuedWindow()`"
  - "브라우저 프레임 3종 `rate.cross` · `rate.cross.snap` · `queued.window` (webapp 상태 보관까지 결선, UI 없음)"
  - "인증 직후 스냅샷 2프레임 — `rate.cross.snap` 은 비어도 1건, `queued.window` 는 미수신이면 0건"
  - "`SubscriptionHub.unhandledFrameCount()` — 「조용히 떨어지는 프레임 0」(PC-12)을 재는 실행 게이트"
  - "테스트 헬퍼 6종: `buildRateCrossAlertTable/Frame` · `buildRateCrossSnapshotFrame` · `buildQueuedWindowStateFrame` · `sendRateCrossAlert` · `sendRateCrossSnapshot` · `sendQueuedWindowState`"
affects: [17-04, 17-05, 17-06, 17-07, 17-08, 17-09, 17-10, 17-11, 17-12, phase-18]

# Actuals (#2632) — estimateTokens 스케일(chars/4, 실현 diff 기준)
actuals:
  tokens: 16228
  tasks: 3
  commits: 5
plan_head_before: 842c145e222b36792a437e7077d353fcf76b614f

tech-stack:
  added: []
  patterns:
    - "화이트리스트 한 줄과 hub 명시 `case` 는 **언제나 같은 커밋**에서 자란다 — 번호만 먼저 넣으면 그 사이 빌드에서 프레임이 `default:` 로 조용히 떨어진다"
    - "「아무도 안 받은 프레임」을 세려면 **의도적으로 무시하는 번호에도 명시 `case`** 를 준다 — `default:` 에 맡기면 계수기가 의도된 무시를 함께 세어 진짜 위반을 가린다"
    - "드롭 0 은 카운터가 아니라 **사유별 로거 스파이 + 대조군**으로 잰다 — 대조 단언이 없으면 「warn 0」과 「경고 경로가 죽었다」가 구분되지 않는다"
    - "단건 푸시와 스냅샷 원소가 같은 테이블이면 **원소 리더도 빌더도 하나만** 둔다"

key-files:
  created:
    - relay/tests/rate-cross.test.ts
  modified:
    - relay/src/dma/msg-type.ts
    - relay/src/dma/envelope.ts
    - relay/src/hub/subscription-hub.ts
    - relay/src/ws/fanout.ts
    - relay/src/dma/__tests__/codec.test.ts
    - relay/tests/fanout.test.ts
    - relay/tests/helpers/frames.ts
    - relay/tests/helpers/fake-gateway.ts
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/relay-provider.tsx

key-decisions:
  - "화이트리스트를 **한 번에 22종으로 넓히지 않았다** — 76 은 Task 1 커밋에서, 77/78 은 Task 2 커밋에서 각각 자기 hub `case` 와 함께 들어갔다. 계획서의 「Task 1 에서 22종」을 그대로 따르면 Task 1~Task 2 사이 커밋에서 77/78 이 `default:` 로 떨어져 계획서 자신이 인용한 PC-12 를 깨뜨린다"
  - "`MSG.LoginResp`(50)·`MSG.UpdateAccountNoResp`(55)에 명시 `case` 를 줬다 — 세션이 처리하는 프레임이라 hub 가 아무것도 안 하는 것이 맞지만, 그 사실을 `default:` 에 맡기면 신설 계수기가 의도된 2건을 함께 세어 게이트가 언제나 2로 시작한다"
  - "76 은 **캐시가 먼저, 팬아웃이 나중**이다. Ready 이전 프레임을 버리면 인증 직후 스냅샷이 그 사이에 열린 돌파를 모르고, 팬아웃하면 소유자 판정 전 프레임을 브라우저로 흘린다"
  - "78 원소 하나가 깨지면 프레임 전체를 버린다(`parseTradeTape` 규율) — 일부만 내보내면 above 집합이 조용히 어긋나고 「돌파했는데 목록에 없다」로만 드러난다"
  - "webapp above 집합 upsert 는 **자리 보존이 아니라 정렬**이다. 상따 목록과 달리 순서의 뜻을 서버가 정하므로, 76 upsert 만 자리 보존하면 78 전량 교체와 순서가 갈린다"

patterns-established:
  - "Pattern 1: RED 커밋은 **시그니처만 있는 스켈레톤**을 동반한다 — 임포트가 되어야 단언이 assertion 으로 실패하고, 로드 실패는 RED 증거가 되지 못한다(17-01·17-07 선례 승계)"
  - "Pattern 2: 상태 3종(`undefined` 모름 / `null`·`[]` 확정된 없음 / 값)을 캐시·getter·팬아웃 세 층에서 **같은 모양으로** 유지한다"

requirements-completed: [TRADE-04]

coverage:
  - id: D1
    description: "76 `RateCrossAlert` 가 화이트리스트 → 파서 → 세션 캐시 → 브라우저 프레임까지 한 경로로 흐르고, 그 경로에서 드롭 경고가 0이다"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "relay/tests/rate-cross.test.ts#①-2 isin 12자·exchange KRX 인 76 프레임은 RelayRateCrossItem 이 된다"
        status: pass
      - kind: unit
        ref: "relay/tests/rate-cross.test.ts#①-3 isin 이 12자가 아니면 null 이다 (기존 bad-isin 가드와 동형)"
        status: pass
      - kind: integration
        ref: "relay/tests/rate-cross.test.ts#②-1 Ready 인 세션에 76 이 오면 {t:'rate.cross'} 1프레임이 나간다"
        status: pass
      - kind: unit
        ref: "relay/tests/rate-cross.test.ts#④ 76 수신에 unknown-msg-type warn 이 0건이다 (Pitfall 1 — 드롭 0 게이트)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Ready 이전 76/77/78 은 캐시에만 들어가고 팬아웃되지 않는다 (T-17-07) — 76 은 로그인 전 연결에도 오는 Broadcast 다"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "relay/tests/rate-cross.test.ts#②-2 Ready 이전 76 은 캐시에만 들어가고 팬아웃되지 않는다 (T-17-07)"
        status: pass
      - kind: unit
        ref: "relay/tests/rate-cross.test.ts#⑥-2 Ready 이전 77/78 도 캐시만 하고 팬아웃하지 않는다 (T-17-07)"
        status: pass
    human_judgment: false
  - id: D3
    description: "above 집합 캐시 교체 규약 — 76 은 `isin:exchange` upsert, 78 은 전량 교체(빈 벡터 포함), 원소 하나가 깨지면 프레임 전체 폐기"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "relay/tests/rate-cross.test.ts#③ 같은 isin+exchange 76 이 두 번 오면 캐시 원소는 1개이고 뒤 값으로 덮인다"
        status: pass
      - kind: unit
        ref: "relay/tests/rate-cross.test.ts#⑤-2 원소 3개인 78 은 above 집합을 통째로 교체한다 (이전 76 upsert 는 남지 않는다)"
        status: pass
      - kind: unit
        ref: "relay/tests/rate-cross.test.ts#⑤-3 빈 벡터 78 은 캐시를 비운다 — 무시하지 않는다(「돌파 없음」의 확정 정보)"
        status: pass
      - kind: unit
        ref: "relay/tests/rate-cross.test.ts#⑤-4 원소 하나가 깨지면 78 프레임 전체를 버린다 (parseTradeTape 와 같은 규율)"
        status: pass
    human_judgment: false
  - id: D4
    description: "77 `QueuedWindowState` 는 최신 1건만 보관하고 여섯 값을 해석 없이 나른다 — 벽시계로 창을 판정하지 않는다"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "relay/tests/rate-cross.test.ts#⑥-1 77 프레임 2건이 연속으로 오면 캐시에는 마지막 1건만 남는다"
        status: pass
      - kind: unit
        ref: "relay/tests/rate-cross.test.ts#⑥-3 파서 단위 — 78 은 원소 배열, 77 은 여섯 값을 그대로 돌려준다"
        status: pass
    human_judgment: false
  - id: D5
    description: "브라우저가 wss 인증만 끝내면 요청 없이 `rate.cross.snap` 1프레임(빈 배열 포함)을 받고, 77 미수신이면 `queued.window` 는 받지 않는다"
    requirement: TRADE-04
    verification:
      - kind: integration
        ref: "relay/tests/fanout.test.ts#⑭-2 인증 직후 rate.cross.snap 은 비어 있어도 1프레임 — queued.window 는 모르면 안 온다 (17-03)"
        status: pass
    human_judgment: false
  - id: D6
    description: "「hub `default:` 로 조용히 떨어지는 프레임 0」이 주석이 아니라 실행되는 게이트가 됐다 (T-17-10)"
    requirement: TRADE-04
    verification:
      - kind: integration
        ref: "relay/tests/fanout.test.ts#⑭-3 드롭 0 게이트 — 76·77·78 왕복에 default 0·warn 0, 미등록 99 는 여전히 warn 1 (T-17-10)"
        status: pass
      - kind: unit
        ref: "relay/src/dma/__tests__/codec.test.ts#INBOUND_MSG_TYPES 는 응답 대역(50~78)만 담는다 (size 22)"
        status: pass
    human_judgment: false
  - id: D7
    description: "webapp 리듀서가 세 프레임을 상태로 보관한다 — `rateCrossItems`(정렬·상한 200) · `queuedWindow`(2상태)"
    requirement: TRADE-04
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/webapp run typecheck && run test (885 passed, 1 skipped) && run build"
        status: pass
    human_judgment: true
    rationale: "리듀서 분기 자체를 단언하는 webapp 테스트는 없다 — 이 plan 은 UI 를 만들지 않아 관측 표면이 없기 때문이다(Phase 18). 계약 일치는 typecheck 가, 와이어 도달은 relay 통합 테스트(D5·D6)가 증명하고, 화면 반영은 Phase 18 이 자기 테스트로 닫는다."
  - id: D8
    description: "실서버 게이트웨이가 실제로 보내는 76/77/78 이 운영에서 드롭 없이 중계되는지"
    verification: []
    human_judgment: true
    rationale: "mock 게이트웨이(gh-trade HEAD)까지는 자동 게이트로 닫았으나, 실서버 장중 관찰은 D-25/D-26 에 따라 배포 후 사용자 확인 몫이다."

# Metrics
duration: 16 min
completed: 2026-09-18
status: complete
---

# Phase 17 Plan 03: 신규 푸시 3종(76·77·78) 중계 Summary

**gh-trade 가 이미 보내고 있으나 relay 가 `unknown-msg-type` warn 으로 버리던 76 `RateCrossAlert` · 77 `QueuedWindowState` · 78 `RateCrossSnapshot` 을 파서 3종·사용자별 세션 캐시 2종·인증 직후 스냅샷 2프레임으로 결선하고, 「조용히 떨어지는 프레임 0」을 주석에서 `unhandledFrameCount()` 실행 게이트로 바꿨다**

## Performance

- **Duration:** 16 min
- **Started:** 2026-09-18T02:19:15Z
- **Completed:** 2026-09-18T02:35:11Z
- **Tasks:** 3 (tracer+tdd 1 · tdd 1 · auto 1)
- **Files modified:** 11 (신규 1)

## Accomplishments

- **76 이 와이어에서 브라우저까지 한 경로로 흐른다.** `INBOUND_MSG_TYPES` → `parseRateCrossAlert` → `#onRateCrossAlert` → `{t:"rate.cross"}` → webapp `rateCrossItems`. 캐시 키는 `userId|isin:exchange` 라 사용자 간 교차(T-17-08)와 같은 종목의 양쪽 거래소 돌파가 **구조적으로** 갈린다.
- **Ready 게이트가 캐시와 팬아웃을 갈랐다.** 76 은 요청 짝 없는 Broadcast 라 로그인 전 연결에도 온다. 보관은 언제나 하고 전달은 Ready 뒤에만 한다 — 버리면 인증 직후 스냅샷이 그 사이 돌파를 모르고, 흘리면 소유자 판정 전 프레임이 브라우저에 간다(T-17-07).
- **78 의 전량 교체와 「빈 벡터도 권위값」을 테스트로 굳혔다.** 빈 벡터를 무시하면 로그인 전에 76 으로 쌓인 옛 집합이 새 세션까지 따라온다. 원소 하나가 깨지면 프레임 전체를 버린다 — 일부만 내보내면 above 집합이 조용히 어긋난다.
- **인증 직후 두 프레임의 규율이 서로 다르다.** `rate.cross.snap` 은 `lc.snap` 과 같아 **비어도 1건** 나가고, `queued.window` 는 `vi` 와 같아 **모르면 0건**이다. 지어낸 창 상태는 브라우저에 거짓 라벨을 그리고, 그것을 보고 낸 주문은 서버가 거부한다.
- **PC-12 가 실행되는 게이트가 됐다.** `#onFrame` 의 `default:` 도달을 세고 `unhandledFrameCount()`·`stats()` 로 노출한다. 그 값을 의미 있게 만들기 위해 **의도적으로 무시하던 50/55 에도 명시 `case`** 를 줬다 — `default:` 에 맡기면 계수기가 언제나 2 로 시작해 진짜 위반을 가린다.
- **드롭 0 을 대조군과 함께 쟀다.** fake 게이트웨이가 76·77·78 을 각 1건 내보내면 브라우저가 세 프레임을 받고 `default:` 0 · `unknown-msg-type` warn 0 이며, **미등록 번호 99 는 여전히 warn 1** 이다. 이 대조가 없으면 「warn 0」과 「경고 경로가 죽었다」가 구분되지 않는다.

## Task Commits

1. **Task 1 (tracer + TDD): 76 RateCrossAlert 한 경로**
   - RED — `27df63b` (test)
   - GREEN — `8235882` (feat)
   - REFACTOR — 없음 (파서는 기존 `parseQuoteState`/`parseTradeTape` 와 동형이고 hub 핸들러는 4줄이라 정리할 것이 없었다. tdd.md 규약대로 변경이 없으면 커밋하지 않는다)
2. **Task 2 (TDD): 78 전량 교체 · 77 최신 1건 · 인증 직후 스냅샷 2프레임**
   - RED — `a76acdd` (test)
   - GREEN — `9a803b3` (feat)
   - REFACTOR — 없음 (78 원소 읽기를 Task 1 의 `readRateCrossItem` 으로 **처음부터** 공유해 중복이 생기지 않았다)
3. **Task 3: 드롭 0 게이트** — `a66354d` (test)

**Plan metadata:** 이 SUMMARY 커밋.

## Files Created/Modified

- `relay/src/dma/msg-type.ts` — `INBOUND_MSG_TYPES` 19 → 22종, 상단 「유입 집합」 주석에 3종의 하류 처리 책임 한 문단
- `relay/src/dma/envelope.ts` — `readRateCrossItem`(공용 원소 리더) · `parseRateCrossAlert` · `parseRateCrossSnapshot` · `parseQueuedWindowState` · 상수 `MAX_RATE_CROSS_ITEM_COUNT`
- `relay/src/hub/subscription-hub.ts` — 캐시 2종 + getter 2종 + 명시 `case` 5개(76/77/78 + 50/55) + `#unhandledFrames`/`unhandledFrameCount()` + `HubStats` 2필드 + `#clearCaches`/`closeAll` 배선
- `relay/src/ws/fanout.ts` — 인증 직후 `rate.cross.snap`(항상) · `queued.window`(알 때만)
- `relay/tests/rate-cross.test.ts` — 신규, 13 케이스
- `relay/tests/fanout.test.ts` — ⑭-2(인증 스냅샷 2프레임) · ⑭-3(드롭 0 게이트 + 대조군)
- `relay/tests/helpers/frames.ts` · `fake-gateway.ts` — 빌더 3종 + 발사 헬퍼 3종
- `relay/src/dma/__tests__/codec.test.ts` — 17-01 이 심어 둔 「76/77/78 은 아직 화이트리스트에 없다」 알람을 이 plan 의 사실로 갱신(size 19 → 22, 대역 50~73 → 50~78)
- `webapp/src/lib/use-relay-socket.ts` · `relay-provider.tsx` — `rateCrossItems`(정렬·상한 200) · `queuedWindow`(2상태) 보관. UI 없음

## Decisions Made

1. **화이트리스트를 두 커밋에 나눠 넓혔다.** 아래 「계획서와의 차이」 #1 참조.
2. **50/55 에 명시 `case` 를 줬다.** 아래 「계획서와의 차이」 #2 참조.
3. **원소 판정을 한 함수로 뽑았다.** 76 단건과 78 스냅샷 원소는 **같은 바이트**다. `readRateCrossItem` 하나가 형식 가드·`toNum` 경계·원문 보존을 소유하므로, 78 의 원소 판정이 76 과 갈릴 수 없다. 테스트 빌더도 같은 이유로 `buildRateCrossAlertTable` 하나를 공유한다.
4. **webapp above 집합은 자리 보존이 아니라 정렬이다.** 상따 목록(`upsertLimitChaser`)은 사용자가 만든 순서에 뜻이 있어 자리를 지키지만, above 집합은 **서버가 정한 순서**(`exchangeTime`↑·`isin`↑)에 뜻이 있고 78 전량 교체가 그 순서로 온다. 76 upsert 만 자리 보존을 하면 두 경로의 순서가 갈린다. 상한 `slice` 는 **정렬 뒤**에 건다 — 자르고 정렬하면 남길 원소를 먼저 버린다.
5. **드롭 0 을 사유별 로거 스파이로 쟀다.** `droppedEnvelopeCount()` 는 모든 사유를 한 숫자로 합치므로 「76 때문에 늘었나」를 구분하지 못한다. 그리고 `unhandledFrames` 를 그 카운터와 **나눴다** — 저쪽은 「화이트리스트 밖이라 파서 전에 버렸다」이고 이쪽은 「화이트리스트는 통과했는데 받아 줄 case 가 없다」로, 후자만이 PC-12 위반이다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 계획서 Task 1 의 「화이트리스트 22종」 지시가 같은 Task 가 인용한 PC-12 와 모순이었다**
- **Found during:** Task 1 (action ① 착수)
- **Issue:** Task 1 ① 은 `INBOUND_MSG_TYPES` 에 76·77·78 을 **한 번에** 더해 22종으로 만들라고 하면서, 같은 문단에서 「화이트리스트를 넓히는 것과 hub 명시 `case` 를 더하는 것은 **같은 커밋**이어야 한다 — 따로 두면 그 사이 커밋에서 프레임이 `default:` 로 조용히 떨어져 PC-12 불변식이 깨진다」고 못박는다. 그런데 77/78 의 hub `case` 는 Task 2 소관이므로, 지시대로 하면 Task 1 커밋과 Task 2 커밋 **사이의 빌드에서 77/78 이 정확히 그 조용한 드롭**을 겪는다
- **Fix:** 원칙을 따랐다 — Task 1 커밋은 76 만(20종), Task 2 커밋이 77/78(22종)을 각각 자기 `case` 와 함께 넣는다. **최종 상태는 계획서와 동일한 22종**이고 acceptance 재실행에서도 22 다. `codec.test.ts` 의 대조 단언은 두 커밋에서 각각 갱신했다
- **Files modified:** `relay/src/dma/msg-type.ts`, `relay/src/dma/__tests__/codec.test.ts`
- **Verification:** 각 커밋 시점의 `INBOUND_MSG_TYPES` 원소가 그 커밋의 hub 명시 `case` 집합과 정확히 일치. 최종 22종, relay 436 green
- **Committed in:** `27df63b` · `a76acdd`

**2. [Rule 2 - Missing critical] `default:` 계수기가 의도된 무시(50/55)를 함께 세어 게이트가 무력했다**
- **Found during:** Task 3 (⑭-3 첫 실행 — `expected 2 to be +0`)
- **Issue:** `MSG.LoginResp`(50)·`MSG.UpdateAccountNoResp`(55)는 화이트리스트에 있고 **세션이 처리하므로 hub 는 아무것도 하지 않는 것이 맞다**. 그러나 그 사실이 `default:` 주석으로만 적혀 있어, 신설 계수기가 정상 로그인마다 2를 센다. 그 상태로 게이트를 「0 이 아니라 2 이하」로 느슨하게 잡으면, 진짜 누락 1건이 생겨도 경계 안에 숨는다
- **Fix:** 50/55 에 **빈 명시 `case`** 를 주고 왜 비어 있는지를 그 자리에 적었다. 이제 `default:` 는 「아무도 받겠다고 하지 않은 번호」만 뜻하고, 계수기 0 이 곧 PC-12 무위반이다
- **Files modified:** `relay/src/hub/subscription-hub.ts`
- **Verification:** ⑭-3 이 `unhandledFrameCount() === 0` 으로 통과. 미등록 99 를 보내도 여전히 0(화이트리스트에서 먼저 걸린다)이고 `unknown-msg-type` warn 만 1 증가
- **Committed in:** `a66354d`

**3. [Rule 3 - Blocking] `getRateCrossItems` 를 계획서보다 한 Task 앞당겼다**
- **Found during:** Task 1 (behavior ⑤ 「캐시 원소는 1개이고 뒤 값으로 덮인다」 단언 작성)
- **Issue:** 계획서는 getter 2종을 Task 2 ② 에 뒀으나, Task 1 의 `<behavior>` 5·6번(캐시 upsert · Ready 이전 캐시 보관)은 **캐시를 읽을 수단 없이는 단언할 수 없다**. 내부 필드를 테스트에서 들여다보는 것은 private 의존이라 규약 위반이다
- **Fix:** `getRateCrossItems()`(정렬 포함)를 Task 1 에 넣었다. `getQueuedWindow()` 는 계획대로 Task 2 다. Task 2 의 acceptance 「두 getter 가 export 된 메서드로 있다」는 그대로 통과한다
- **Files modified:** `relay/src/hub/subscription-hub.ts`
- **Verification:** Task 1·2 acceptance 전량 재실행 통과
- **Committed in:** `8235882`

### 계획서 지시와 다르게 둔 것 (버그 아님)

**`relay/tests/strategy-hub.test.ts` 대신 `relay/tests/rate-cross.test.ts` 신설.** 계획서가 허용한 선택지다(「또는 신규 `relay/tests/rate-cross.test.ts`」). 전략 캐시 파일에 섞으면 그 파일의 관심사(24/21/34 프리페치 회계)가 흐려진다.

---

**Total deviations:** 3 auto-fixed (1 bug, 1 missing-critical, 1 blocking)
**Impact on plan:** 셋 다 계획서의 **원칙**을 지키기 위한 것이고 범위를 넓히지 않았다. #1·#3 은 커밋 경계만 옮겼고 최종 상태는 계획서와 같다. #2 는 Task 3 이 만들려던 게이트를 실제로 작동하게 만든 것이다.

## TDD Gate Compliance

| Plan | RED | GREEN | REFACTOR | Status |
|------|-----|-------|----------|--------|
| 17-03 Task 1 | ✓ `27df63b` | ✓ `8235882` | — (변경 없음) | Pass |
| 17-03 Task 2 | ✓ `a76acdd` | ✓ `9a803b3` | — (변경 없음) | Pass |

**RED 증거 (#3770 실질 요건 충족):**

| 항목 | Task 1 | Task 2 |
|---|---|---|
| command | `pnpm --filter @gh-radar/relay test` (cwd repo root) | 같음 |
| exit code | `1` | `1` |
| target test | `①-2 isin 12자·exchange KRX 인 76 프레임은 RelayRateCrossItem 이 된다` | `⑭-2 인증 직후 rate.cross.snap 은 비어 있어도 1프레임 — queued.window 는 모르면 안 온다` |
| 실패 형태 | **단언 실패** — `expected null to deeply equal { isin: 'KR7005930003', …(7) }` | **단언 실패** — `expected undefined to deeply equal { t: 'rate.cross.snap', items: [] }` |
| 집계 | 426건 중 **5 실패 / 421 통과** | 435건 중 **7 실패 / 428 통과** |

두 RED 모두 로드 실패·0건 발견·unexpected green 어느 쪽도 아니다. 실패한 테스트는 전부 계획된 `<behavior>` 에 대한 단언이고, 같은 파일의 나머지(화이트리스트 등록·드롭 경고 0)는 **통과한 채로** 남아 「픽스처가 깨진 게 아니다」를 증명한다. RED 커밋의 소스 변경은 **시그니처만 있는 스켈레톤**(17-01 `strategy-display.ts`·17-07 `latch-led.tsx` 선례)이다 — 임포트가 되어야 단언이 assertion 으로 실패하기 때문이다.

**⚠ `gsd_run check tdd-red-evidence` 는 이 저장소에서 구조적으로 쓸 수 없다 (도구 갭 — 17-01·17-02·17-07 과 같은 보고).**
`bin/lib/tdd-red-evidence.cjs` 의 `parseNodeTestSummary` 는 `node --test` 의 `# tests N` / `# pass N` / `# fail N` **푸터 3줄**로만 집계를 읽는데, 이 저장소는 vitest 를 쓰고 vitest 의 `tap`·`tap-flat` 리포터는 그 푸터를 출력하지 않는다 — 어떤 입력을 줘도 `INVALID_RED (zero_tests_discovered)` 가 된다. 푸터를 손으로 지어내 붙이면 체커는 통과하겠지만 그것은 게이트가 검사하려던 증거를 위조하는 일이라 하지 않았다. 대신 위 표로 실질 증거를 남긴다.

## Issues Encountered

- **`master` 직접 커밋.** 17-01·17-02 와 같은 상황이다 — `git.branching_strategy: "none"` 이고 Phase 1~16 의 모든 커밋이 `master` 에 있으며, 오케스트레이터도 「master 직접 커밋이 옳다, 보호 브랜치 체크로 멈추지 말라」고 명시 지시했다. **후속 런의 반복 판단을 없애려면 `.planning/config.json` 에 `git.allow_default_branch_commits: true` 를 넣는 것이 정식 해법이다** — 사용자 확인이 필요해 이번에도 손대지 않았다.
- 그 밖의 문제 없음. baseline(relay 419 → 436, webapp 885, shared 108) 대비 회귀 0.

## Known Stubs

없음.

`webapp` 의 `rateCrossItems`/`queuedWindow` 는 보관만 하고 그리는 화면이 없지만 이것은 스텁이 아니다 — **플레이스홀더를 렌더하는 표면이 0개**이고(빈 값이 UI 로 흘러 「데이터 없음」을 지어내는 경로가 없다), 계획서와 17-CONTEXT 가 「웹 UI 는 만들지 않는다(Phase 18)」를 이 plan 의 명시 범위로 못박았다. 상태를 먼저 놓는 이유도 그 문서에 있다 — Phase 18 의 돌파감지 UI 가 **첫 프레임부터** 그리려면 relay 가 above 집합을 이미 들고 있어야 한다. `.planning/WINDOWS.md` 에 등록하지 않았다.

## User Setup Required

없음 — 신규 의존성 0건, 외부 서비스 설정 변경 없음, 환경변수 변경 없음.

## Next Phase Readiness

**바로 시작 가능:**
- **17-04**(`lc.arm` 결선) — 이 plan 은 `ws/protocol.ts` 를 손대지 않았고 17-02 가 심은 Q-ID 회귀 단언도 그대로 통과한다. `fanout.ts` 의 인증 스냅샷 블록에 두 줄이 늘었을 뿐이라 `lc.arm` 라우팅 분기와 충돌하지 않는다.
- **17-05**(VI 거래소 축) — `#onFrame` 에 명시 `case` 를 더할 때 **`unhandledFrameCount()` 게이트가 이미 살아 있다**. 화이트리스트만 넓히고 case 를 빠뜨리면 `fanout.test.ts` ⑭-3 이 즉시 깨진다.
- **Phase 18**(돌파감지 UI · 예약 발주 UI) — `useRelay().rateCrossItems` 와 `.queuedWindow` 를 바로 읽으면 된다. **하루 1회 알림 규칙과 임계−2%p 이탈 삭제는 이 목록에 반영돼 있지 않다**(relay 는 서버 집합을 가공하지 않는다 — D-03). `queuedWindow === undefined` 는 「모름」이지 「닫힘」이 아니다.

**주의:**
- `#onFrame` 에 새 `case` 를 더할 때 화이트리스트 한 줄과 **같은 커밋**에 둔다. 이 plan 이 그 규율 때문에 커밋 경계를 옮겼다(편차 #1).
- 배포는 D-26 대로 장 마감(20:00 KST) 이후, 사용자 확인 뒤에 한다. 이 plan 은 배포 대상 코드(relay 파서·hub·fanout, webapp 리듀서)를 바꿨지만 **배포하지 않았다**. 실서버 드롭 0 확인은 D-25 대로 배포 후 사용자 장중 관찰이다.

## Self-Check: PASSED

- 생성 파일 1건 디스크 존재 확인: `relay/tests/rate-cross.test.ts`
- 커밋 5건 전부 `git log` 에서 확인: `27df63b` · `8235882` · `a76acdd` · `9a803b3` · `a66354d`
- `commits: 5` 는 `git rev-list --count 842c145..HEAD` 로 **측정**한 값이다(서술이 아니다). `actuals.tokens: 16228` 도 같은 범위 diff 의 chars/4 실측이다
- 모든 태스크 `<acceptance_criteria>` 재실행 통과 (Task 1: 7/7 — 화이트리스트 22종은 Task 2 커밋에서 완성, 편차 #1 · Task 2: 6/6 · Task 3: 6/6)
- plan `<verification>` 재실행 통과: relay 436 green · `typecheck` · `typecheck:tests` · 루트 `pnpm typecheck` (`error TS` 0건) · mock 게이트웨이 76/77/78 왕복에서 `default:` 계수기 0 · `unknown-msg-type` warn 0 (대조군 99 는 warn 1)
- 전 워크스페이스: relay 436 · webapp 885(+1 skipped) · shared 108 green, `webapp build` 컴파일 성공

---
*Phase: 17-gh-trade-led*
*Completed: 2026-09-18*
