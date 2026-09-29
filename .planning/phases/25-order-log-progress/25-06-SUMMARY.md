---
phase: 25-order-log-progress
plan: 06
subsystem: relay · webapp
tags: [flatbuffers, relay, hub, websocket, queue-progress, react, tdd]

requires:
  - phase: 25-01 (트레이서)
    provides: 생성물 16 경로(QueueProgress · QueueProgressItem 접근자) · RelayQueueProgressItem · RelayUnfProgressEntry · RelayUnfProgressMsg 프레임 타입
  - phase: gh-trade 25 (G1 · D-18 · D-19)
    provides: 83 QueueProgress — Broadcast · (isin, exchange) 1초 스로틀 · 전량 스냅샷 · 계좌 선언 세션 + 시세 구독 세션 수신
provides:
  - "MSG.QueueProgress 83 · INBOUND_MSG_TYPES 26종 — 화이트리스트 · 파서 · hub 명시 case 한 커밋(PC-12, 92829d1d)"
  - "parseQueueProgress · MAX_QUEUE_PROGRESS_ITEMS 200 · QueueProgressFrame · QueueProgressWireItem"
  - "HubSession.allowedAccounts? · #onQueueProgress(허용 계좌 필터 · dmaUserId 제거 · 전량 교체 · 빈→빈 억제 · Ready 게이트) · getQueueProgressEntries · #clearCaches/closeAll 정리"
  - "인증 직후 {t:\"unf.progress\", snap:true, entries} 1프레임(비어도)"
  - "테스트 헬퍼 FakeQueueProgressInput · buildQueueProgressFrame · e2e LocalRelay.pushQueueProgress"
  - "webapp 스토어 queueProgress(ReadonlyMap · 키 relayQuoteKey) · queue-progress.ts 순수 함수 4종"
affects: [25-09, 25-12]

actuals:
  tokens: 17100
  tasks: 3
  commits: 6
plan_head_before: 44575aa95c6faad193c9501e428fc9184dd29706

tech-stack:
  added: []
  patterns:
    - "Broadcast 사용자 데이터는 hub 가 세션 허용 계좌로 거른 뒤에만 캐시 — 목록이 없으면 fail-closed"
    - "전량 교체 캐시 + 빈→빈 팬아웃 억제 · 비어 있지 않던 키가 비면 1회(삭제 신호)"
    - "파서는 원문 충실 번역(주문자 포함) · 공개 칸 선택은 소유자를 아는 hub 가 한다"

key-files:
  created:
    - webapp/src/lib/queue-progress.ts
    - webapp/src/lib/__tests__/queue-progress.test.ts
  modified:
    - relay/src/dma/msg-type.ts
    - relay/src/dma/envelope.ts
    - relay/src/hub/subscription-hub.ts
    - relay/src/ws/fanout.ts
    - relay/tests/helpers/frames.ts
    - relay/src/dma/__tests__/codec.test.ts
    - relay/src/dma/__tests__/envelope.test.ts
    - relay/tests/hub.test.ts
    - relay/tests/fanout.test.ts
    - webapp/e2e/fixtures/relay.ts
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/relay-provider.tsx
    - webapp/src/lib/__tests__/relay-socket.test.ts

key-decisions:
  - "83 파서는 계좌 형식 이상(빈 값 · 12자 초과) 항목을 건너뛰고 프레임당 경고 1줄(건수 · 마스킹 표본)만 — 진행률은 seq 없는 전량 스냅샷이라 갭 루프가 없고, 계좌 없는 항목은 hub 필터를 어차피 못 지난다"
  - "83 파서는 ISIN 형식 이상도 거래소 이상과 같이 프레임 드롭(bad-isin) — 76/78 파서와 같은 규율"
  - "같은 83 이 두 번 오는 경우(계좌 선언 + 시세 구독 세션)는 중복 제거하지 않는다 — 전량 교체라 결과가 같다(gh-trade 확인)"
  - "진행률 종류명 group 0 → 「매수」(플래너 가정 A-P1) — progressGroupLabel 한 곳(webapp/src/lib/queue-progress.ts)"
  - "조인 실패 dev 로그의 중복 키는 `계좌|주문번호` · 로그에는 계좌 마스킹본만(T-16-18)"

patterns-established:
  - "HubSession.allowedAccounts?: DmaSession 이 구조적으로 만족 — hub 가 세션 권한으로 Broadcast 를 거르는 첫 사례"
  - "progressView: 서버 값 클램프만(D-12) — 25-09 보조행 · 모바일 r3 가 같은 보기 값을 쓴다"

requirements-completed: []

coverage:
  - id: D1
    description: "83 이 화이트리스트 · 파서 · hub 명시 case 로 한 커밋(92829d1d)에 들어왔다 — MSG == 생성 enum · INBOUND 26 · 대역 50~83 · default 도달 0"
    verification:
      - kind: unit
        ref: "relay/src/dma/__tests__/codec.test.ts#83 QueueProgress 는 생성 enum 과 같고 화이트리스트에 있다"
        status: pass
      - kind: unit
        ref: "relay/src/dma/__tests__/codec.test.ts#INBOUND_MSG_TYPES 는 응답 대역(50~83)만 담는다"
        status: pass
      - kind: other
        ref: "git log -1 --name-only 92829d1d → envelope.ts · msg-type.ts · subscription-hub.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "parseQueueProgress — 값 왕복(dmaUserId 포함) · 빈 벡터 [] · 계좌 빈 항목 스킵 경고 1줄 · 거래소 이상 null · slot-null · 상한 200"
    verification:
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#잔량진행률 83 QueueProgress 파서 (Phase 25-06)"
        status: pass
    human_judgment: false
  - id: D3
    description: "hub — 허용 계좌 필터(남의 계좌 0) · dmaUserId 제거 · fail-closed · Ready 게이트 · 빈→빈 억제 · 삭제 신호 1회 · 키 단위 전량 교체 · 세션 교체 정리"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#SubscriptionHub — 잔량진행률 83 QueueProgress (Phase 25-06)"
        status: pass
    human_judgment: false
  - id: D4
    description: "가짜 게이트웨이 83 → 실 세션 → hub → ws: 인증 직후 snap:true 1프레임(비어도) · 라이브 snap:false 허용 계좌 1건 · 두 번째 탭 스냅"
    verification:
      - kind: integration
        ref: "relay/tests/fanout.test.ts#unf.progress (Phase 25)"
        status: pass
    human_judgment: false
  - id: D5
    description: "webapp 스토어 queueProgress(snap 전량 교체 · 키 교체 · 빈 items 삭제 · reset) · findQueueProgress · progressView · progressGroupLabel · reportUnmatchedProgressOnce"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/relay-socket.test.ts#unf.progress (Phase 25)"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/queue-progress.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "실서버 83 관측(계좌 필터 · 조인 문자열 동일성 A7) — 첫 거래일 UAT"
    verification: []
    human_judgment: true
    rationale: "gh-trade 가 83 을 실제로 내기 시작한 뒤의 실사용 관측이다 — 25-12 첫 거래일 UAT 로 남긴다"

duration: 21min
completed: 2026-09-29
status: complete
---

# Phase 25 Plan 06: 잔량진행률 데이터 경로 Summary

**게이트웨이 83 `QueueProgress` 가 relay 파서 → hub(세션 허용 계좌 필터 · 주문자 제거 · (isin, exchange) 전량 교체 · 빈→빈 억제) → `unf.progress`(라이브 · 인증 직후 스냅) → 웹 `queueProgress` Map → `findQueueProgress` · `progressView`(D-12 클램프만)로 흐른다**

## Performance

- **Duration:** 약 21분
- **Started:** 2026-09-29T10:35Z (19:35 KST)
- **Completed:** 2026-09-29T10:56Z (19:56 KST)
- **Tasks:** 3/3 (전부 TDD RED → GREEN)
- **Files modified:** 15 (신규 2 · 변경 13)

## Accomplishments

- **PC-12 한 커밋 — `92829d1d`**: `MSG.QueueProgress = 83` · `INBOUND_MSG_TYPES` 26종 · `parseQueueProgress` · hub `case MSG.QueueProgress` 가 같은 커밋이다(`git log -1 --name-only` = envelope.ts · msg-type.ts · subscription-hub.ts)
- hub `#onQueueProgress` — `HubSession.allowedAccounts` Set 으로 거르고 공개 9칸만 캐시(T-25-24 · T-25-25) · 목록 없으면 전부 거름(fail-closed) · 빈→빈 억제 · 비어 있지 않던 키가 비면 `items: []` 1회(gh-trade 계좌 분기가 이전 스냅샷 계좌에도 빈 스냅샷을 보내는 것과 맞물림) · Ready 전에는 캐시만 · `#clearCaches` · `closeAll` 정리(Pitfall 6)
- `fanout.ts` 인증 직후 `queued.window` 다음에 `{t:"unf.progress", snap:true, entries}` — 비어도 1프레임(`rate.cross.snap` 규율)
- e2e `LocalRelay.pushQueueProgress(input)` — 사용자 세션 소켓 경로 · 종목 기본값 `E2E_ISIN` · 항목 계좌 기본값 `E2E_ACCOUNT_NO` · 실서버 리터럴 0
- webapp `queueProgress: ReadonlyMap<string, readonly RelayQueueProgressItem[]>`(키 `relayQuoteKey`) · `webapp/src/lib/queue-progress.ts` — `findQueueProgress`(문자열 동등 · 재정규화 없음) · `progressView`(`Intl.NumberFormat("ko-KR")`) · `progressGroupLabel` · `reportUnmatchedProgressOnce`(dev 1회 · 계좌 마스킹 · production 무동작)
- **플래너 가정 A-P1 반영 위치:** `webapp/src/lib/queue-progress.ts` `progressGroupLabel` — `group === 0 → "매수"`(머리 주석 A-P1 문단). 문구를 바꾸려면 이 함수 한 곳만 고친다

## Task Commits

1. **Task 1: 83 파서 + hub 명시 case (PC-12)**
   - RED — `f3600076` (test): 14건 실패(83 화이트리스트 드롭 · MSG 미정의) · RED 증거 `RED_EVIDENCE_OK`
   - GREEN — `92829d1d` (feat): msg-type · envelope · hub **한 커밋**
2. **Task 2: 팬아웃 인증 직후 스냅 · 실 세션 통합 · e2e 주입구**
   - RED — `19ca3a2e` (test): P1 · P3 실패(스냅 프레임 없음) · P2(라이브 경로)는 Task 1 hub 경로로 이미 통과 · RED 증거 `RED_EVIDENCE_OK`
   - GREEN — `71b36520` (feat): fanout.ts · e2e fixture
3. **Task 3: 웹 스토어 + 순수 함수**
   - RED — `d33849af` (test): 스토어 4건 실패(`queueProgress` undefined) + queue-progress 모듈 부재 · RED 증거 `RED_EVIDENCE_OK`(대상 = 스토어 키 교체 테스트)
   - GREEN — `ea29e32e` (feat): use-relay-socket · relay-provider · queue-progress.ts

## 검증 결과

| 명령 | 결과 |
|---|---|
| relay `vitest run envelope.test.ts codec.test.ts hub.test.ts` | 3 files · 189 passed |
| relay `vitest run tests/fanout.test.ts -t "unf.progress"` | 3 passed (61 skipped) |
| relay 전체 `pnpm --filter @gh-radar/relay run test` | 29 files · 711 passed |
| shared build → relay typecheck → relay typecheck:tests → webapp typecheck(+e2e) | pass (error TS 0) |
| webapp `vitest --run queue-progress.test.ts relay-socket.test.ts` | 2 files · 128 passed |
| webapp 전체 `pnpm --filter @gh-radar/webapp run test` | 127 files · 2879 passed · 1 skipped(기존) |
| Task 1~3 acceptance grep 전부 | pass (`toBe(26)` 1 · `#clearCaches` 안 `#queueProgress` 2 · `pushQueueProgress` 2 · 실서버 리터럴 0 · 재정규화 호출 0) |

## Decisions Made

frontmatter `key-decisions` 참조.

## Deviations from Plan

### 해석 · 보강

**1. [Rule 2 - 보강] 83 파서에 ISIN 형식 가드(bad-isin 드롭)**
- **Found during:** Task 1
- **Issue:** Behavior 는 거래소 이상만 명시했다. ISIN 이 깨진 프레임을 통과시키면 hub 키 · 웹 키가 깨진 문자열로 생긴다.
- **Fix:** `readRateCrossItem` 과 같은 `isValidIsin` → `dropField("bad-isin")`.
- **Commit:** 92829d1d

**2. [해석] 계좌 「빈」 항목 → 계좌 「형식 이상」 항목**
- Behavior 는 「계좌 빈 항목은 건너뛴다」. `isValidAccountNo`(1~12자)로 넓혀 12자 초과도 같이 건너뛴다 — 로그는 건수 · 마스킹 표본 · 길이만.

**3. [해석] RED 증거 기록 형식**
- vitest `tap-flat` 출력에는 node TAP 요약(`# tests/# pass/# fail`)이 없어 `gsd check tdd-red-evidence` 가 `zero_tests_discovered` 로 읽는다. TAP 줄에서 센 요약 3줄을 덧붙여 검증했다(값은 TAP 원문에서 계산 — 3회 모두 `RED_EVIDENCE_OK`).

**4. [해석] Task 2 P2 는 RED 에서 이미 통과**
- 라이브 83 팬아웃은 플랜대로 「hub fanout 이벤트 경로 그대로(새 경로 없음)」라 Task 1 GREEN 으로 이미 성립한다. RED 대상은 P1(인증 직후 스냅)이다.

---

**Total deviations:** 보강 1(Rule 2) · 해석 3. **Impact:** 스코프 변화 없음.

## Known Stubs

| 파일 | 내용 | 해소 |
|---|---|---|
| webapp/src/lib/queue-progress.ts | `findQueueProgress` · `progressView` · `reportUnmatchedProgressOnce` 는 아직 어떤 화면에도 결선되지 않음 — 의도된 데이터 경로 플랜 범위 | 25-09 (B안 보조행) |

## Threat Flags

없음 — 새 표면(83 수신 · `unf.progress` 프레임)은 플랜 threat_model T-25-24~28 이 전부 다룬다(각 mitigate 는 테스트로 잠김).

## Issues Encountered

None.

## User Setup Required

없음. relay 배포는 이 플랜 범위 밖(오케스트레이터 · 25-11 이후).

## Next Phase Readiness

- 25-09 가 `useRelayContext().queueProgress` + `findQueueProgress(map, accountNo, row)` + `progressView(item)` 로 보조행을 그리면 된다 — 보기 값 · 접근성 값 텍스트까지 준비됨. 조인 실패 드러내기는 `reportUnmatchedProgressOnce(queueProgress, accountStates)` 를 effect 로 부르면 된다.
- e2e 는 `relay.pushQueueProgress({ items: [{ orderNo, group, remainingVolume, progressBp }] })` 로 진행률을 주입한다.
- 실서버 83 관측(계좌 필터 · 조인 문자열 동일성)은 25-12 첫 거래일 UAT.

## Self-Check: PASSED

- 파일 10개 FOUND (queue-progress.ts · queue-progress.test.ts 신규 포함)
- 커밋 6개 FOUND: f3600076 · 92829d1d · 19ca3a2e · 71b36520 · d33849af · ea29e32e
- PC-12: 92829d1d 에 msg-type.ts 와 subscription-hub.ts 가 함께 있음
