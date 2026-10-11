---
phase: 24-limitchaser-buy3
plan: 03
subsystem: relay-webapp-wire
status: complete
tags: [relay, zod, websocket, shared-contract, react, limit-chaser, buy3, legacy-tab-tolerance]

requires:
  - phase: 24-01
    provides: "buy3 와이어(zod 신필드 12 필수 · buy3_schema=1 고정 · buy_watch_side 미전송) · 매수 LED D-12 비클릭"
provides:
  - "relay 구 탭 관용 — 옛 lc.set(신필드 없음) · lc.arm buy 는 거부 프레임 1건 + 소켓 유지, 게이트웨이 0바이트"
  - "RelayInboundWire(relay 내부 인바운드 타입) · buy3CfgOf(부재 판정 단일 자리) · withNeutralBuy3(철거 전용) · LC_LEGACY_SET_REJECT_TEXT · LC_LEGACY_ARM_REJECT_TEXT"
  - "MsgType 38 조립 불가 — relay MSG 에 ArmBuyLatchReq 없음 · ArmLatchMsgType 36|37"
  - "shared RelayLcArmMsg.latch 'sell' | 'cancel' · RelayLimitChaserInput 에서 buyWatchSide 제거"
  - "webapp ArmableLatchKind — onArm/handleArm 이 'buy' 를 받을 수 없다(타입)"
  - "감시대상 토글 제거 — lc-watch-row · WatchTargetRow · LcRowSpec watch · 폼 값/DIRTY/기본값/formFromServer"
affects: [24-04, 24-09]

plan_head_before: 79e5e5b2c94d2ab4f79f4b42f740b6942f12bf9b
actuals:
  tokens: 30000
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "구 계약 프레임은 zod 에서 끊지 않고 relay 내부 넓은 타입(RelayInboundWire)으로 받아 fanout 이 좁힌다 — shared 계약은 좁게 유지"
    - "신필드 목록 정본은 중립값 객체 하나(LC_BUY3_NEUTRAL) — 키 배열은 거기서 파생 · 타입 가드로 좁힘"
    - "소켓 유지 증거 = 거부 뒤 같은 소켓의 다음 프레임이 게이트웨이에 도착하는 통합 테스트"

key-files:
  created: []
  modified:
    - relay/src/dma/msg-type.ts
    - relay/src/dma/envelope.ts
    - relay/src/ws/protocol.ts
    - relay/src/ws/fanout.ts
    - relay/tests/helpers/fake-gateway.ts
    - relay/src/dma/__tests__/codec.test.ts
    - relay/src/dma/__tests__/envelope.test.ts
    - relay/tests/ws-latch.test.ts
    - relay/tests/fanout.test.ts
    - relay/tests/protocol.test.ts
    - packages/shared/src/relay.ts
    - webapp/src/components/trading/latch-led.tsx
    - webapp/src/components/trading/card/card-header.tsx
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/components/trading/lc/lc-fields.ts
    - webapp/src/components/trading/lc/setting-group.tsx
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/lc/__tests__/setting-group.test.tsx
    - webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
    - webapp/src/lib/__tests__/limit-chaser.test.ts
    - webapp/e2e/specs/trading-workbench.spec.ts

key-decisions:
  - "구 탭 판정은 세션 · 계좌 가드 뒤에 둔다 — 허용 목록 밖 계좌의 옛 프레임은 종전 계좌 거부 문구로 끝난다(판정 순서 불변 · T-24-14)"
  - "옛 모양이라도 게이트 4종이 전부 OFF(철거)면 12키를 false/0 으로 채워 buy3_schema=1 로 중계한다 — 켜는 프레임은 절대 채우지 않는다(T-24-42 · T-16-44)"
  - "buy3_schema=0 레거시 중계 분기를 두지 않는다(RESEARCH A1 · T-24-15)"
  - "webapp 에 ArmableLatchKind(Exclude<LatchLedKind,'buy'>) 신설 — LatchLed/CardHeader 의 onArm 까지 좁혀 handleArm 인자 타입에서 'buy' 를 없앤다"
  - "신필드 키 목록 정본은 LC_BUY3_NEUTRAL 객체 하나 — 키 배열은 Object.keys 로 파생(목록 두 벌 금지)"

patterns-established:
  - "relay 한시 관용 스키마(latch enum 'buy' · 신필드 optional)는 shared 가 아니라 relay 내부 타입에만 — gh-trade buy_watch_side 봉인 후속과 함께 걷는다"

requirements-completed: []

coverage:
  - id: D1
    description: "MsgType 38 조립 경로 제거 — relay MSG 에 ArmBuyLatchReq 없음 · 생성 enum 에만 38 봉인"
    verification:
      - kind: unit
        ref: "relay/src/dma/__tests__/codec.test.ts#38(구 매수 진입 래치)은 생성 enum 에만 남고 relay MSG 에는 없다"
        status: pass
      - kind: other
        ref: "pnpm --filter @gh-radar/relay run typecheck (ArmLatchMsgType 36|37 · ARM_LATCH_MSG_TYPE Record 컴파일)"
        status: pass
    human_judgment: false
  - id: D2
    description: "구 탭 lc.arm buy → 게이트웨이 0바이트 · 거부 프레임 1건 · 소켓 유지 · 다음 sell 은 36"
    verification:
      - kind: integration
        ref: "relay/tests/ws-latch.test.ts#①-3 · ②-6 · ②-7b"
        status: pass
    human_judgment: false
  - id: D3
    description: "구 탭 lc.set(신필드 없음) → 거부 프레임 · 소켓 유지 · 새 모양 10 도착 / 철거는 중립 buy3_schema=1 / 계좌 가드 우선"
    verification:
      - kind: unit
        ref: "relay/tests/protocol.test.ts#①-legacy · ①-legacy-b · ①-legacy-c · ①-legacy-d"
        status: pass
      - kind: integration
        ref: "relay/tests/fanout.test.ts#⑰-legacy · ⑰-legacy-b · ⑰-legacy-c"
        status: pass
    human_judgment: false
  - id: D4
    description: "shared RelayLcArmMsg.latch 'sell'|'cancel' · webapp handleArm/onArm 'buy' 불가"
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/webapp run typecheck"
        status: pass
      - kind: unit
        ref: "webapp strategy-card-flow.test ⑲-4 · ⑲-5 (매수 LED lc.arm 미전송)"
        status: pass
    human_judgment: false
  - id: D5
    description: "감시대상 토글 제거 — 행 0 · cfg 43키에 buyWatchSide 없음 · zod 미지 키 제거 · 게이트웨이 슬롯 null"
    verification:
      - kind: unit
        ref: "webapp limit-chaser-form.test ⑧ · ⑥ 43키 · lib/limit-chaser.test 기본값/DIRTY/formFromServer · setting-group.test ①"
        status: pass
      - kind: unit
        ref: "relay/tests/protocol.test.ts#①-watch · relay/src/dma/__tests__/envelope.test.ts#③-buy3"
        status: pass
      - kind: integration
        ref: "relay/tests/fanout.test.ts#⑰-buy3 (옛 키 '1' 실어도 buyWatchSide null)"
        status: pass
      - kind: e2e
        ref: "playwright trading-workbench + a11y (기존 실패 3건 grep-invert) 59 passed"
        status: pass
    human_judgment: false

duration: 16min
completed: 2026-09-28
---

# Phase 24 Plan 03: 구 탭 관용 + MsgType 38 제거 + 감시대상 토글 제거 Summary

**relay 가 새로고침 전 옛 탭의 `lc.set`(신필드 없음) · `lc.arm buy` 를 소켓을 끊지 않는 거부 프레임으로 받아 넘기고(철거만 중립값으로 `buy3_schema=1` 중계), 38 을 조립할 수 없게 했으며, 감시대상(`buyWatchSide`) 입력을 shared 입력 계약 · zod · 웹 폼에서 걷었다 — 「relay 먼저 배포」의 전제 조건.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-09-27T17:27:44Z
- **Completed:** 2026-09-27T17:43:47Z
- **Tasks:** 3 (전부 auto · tdd)
- **Files modified:** 24

## Accomplishments

- **38 봉인:** relay `MSG` 에서 `ArmBuyLatchReq` 삭제(「38 = 구 ArmBuyLatchReq — 번호 봉인, 재사용 금지」 주석) · `ArmLatchMsgType` 36|37 · `ARM_LATCH_MSG_TYPE` 에서 buy 제거 · 테스트 헬퍼 arm 집합 36/37 · e2e `COMMAND_TYPES` 는 숫자 `38`(미송신 단언 유지)
- **구 탭 `lc.arm buy`:** 세션 · 키 형식 · 계좌 가드 **뒤**에서 `LC_LEGACY_ARM_REJECT_TEXT` 거부 프레임 + `logger.warn` + return(`#reject` 없음)
- **구 탭 `lc.set`:** zod 신필드 12 `.optional()`(반등률 `superRefine` 은 값이 있을 때만) · `buy3CfgOf` 가 부재 판정 · 계좌 가드 직후 — 게이트 켜진 옛 모양은 `LC_LEGACY_SET_REJECT_TEXT`(isin 상관) 거부, 철거는 `withNeutralBuy3` 로 중계
- **타입 경계:** `RelayInboundWire`(relay 내부) · `parseInbound` 반환 타입 교체 · shared `RelayLcArmMsg.latch` `"sell" | "cancel"` · webapp `ArmableLatchKind`
- **감시대상 제거(ROADMAP ⑤):** shared `RelayLimitChaserInput` Omit 에 `"buyWatchSide"`(읽기 전용 `RelayLimitChaser.buyWatchSide` 유지) · zod 줄 삭제 · 폼 기본값/`formFromServer`/`DIRTY_COMPARED_FIELDS`(30종) · `LcRowSpec` watch · `LC_BUY_GROUPS` 행 · `WatchTargetRow` · `renderRow` case 삭제 · cfg 43키

## Task Commits

1. **Task 1: MsgType 38 조립 경로 제거 + 구 탭 lc.arm buy 거부 프레임** — `ab1f3bbd` (feat)
2. **Task 2: 구 탭 lc.set 관용** — `b70d9f55` (test · RED) → `720996da` (feat · GREEN)
3. **Task 3: 감시대상 토글 제거** — `877de685` (test · RED) → `989fb4cd` (feat · GREEN)

## Verification (실행 명령 · 결과)

- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && … relay run typecheck:tests && … webapp run typecheck` → exit 0 — PASS
- `pnpm --filter @gh-radar/relay exec vitest run tests/ws-latch.test.ts src/dma/__tests__/codec.test.ts` → 2 files · 41 passed — PASS (Task 1)
- `pnpm --filter @gh-radar/webapp exec vitest --run strategy-card-flow · strategy-card · latch-led · card-header · lib/limit-chaser` → 5 files · 157 passed — PASS (Task 1)
- Task 2 RED: `vitest run tests/protocol.test.ts tests/fanout.test.ts` → 7 failed(신규 7건) · 87 passed — 의도된 RED
- Task 3 RED: relay protocol 10 failed · webapp form/lib/setting-group 9 failed — 의도된 RED
- `pnpm --filter @gh-radar/relay run test` → 28 files · **644 passed** — PASS
- `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading src/lib` → 76 files · 1829 passed · 1 skipped — PASS
- `pnpm --filter @gh-radar/webapp run test`(전체) → 124 files · 2438 passed · 1 skipped — PASS
- `playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/a11y.spec.ts --grep-invert "5\. 격자|P20-3 최악값|iPhone 가로 폭 844"` → **59 passed** — PASS
- `eslint`(변경 webapp 파일 9개) → 출력 0 — PASS
- Acceptance grep 전부 기대값(T1: 0 · 0 · 1 · 1 · 0 / T2: 1 · 1 · 0 / T3: 0 · 0 · 0 · 1)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `ArmableLatchKind` 신설 — `latch-led.tsx` · `card-header.tsx` 도 좁힘**
- **Found during:** Task 1
- **Issue:** `handleArm` 인자만 `"sell" | "cancel"` 로 좁히면 `CardHeader.onArm`/`LatchLed.onArm`(`(kind: LatchLedKind) => void`)에 넘길 수 없다(함수 인자 반공변)
- **Fix:** `latch-led.tsx` 에 `ArmableLatchKind = Exclude<LatchLedKind, "buy">` 를 두고 `onArm` 두 곳 · `CardHeader.onArm` · `handleArm` 을 그 타입으로. 버튼 onClick 은 `kind !== "buy"` 로 좁힌 뒤 부른다(매수 LED 는 D-12 로 늘 span 이라 런타임 변화 없음)
- **Files modified:** webapp/src/components/trading/latch-led.tsx · card/card-header.tsx · card/strategy-card.tsx
- **Commit:** ab1f3bbd

**2. [Rule 1 - Test intent] `#isTeardown` 인자 타입을 게이트 4종 `Pick` 으로**
- **Found during:** Task 2
- **Issue:** 부재 판정 전(신필드 optional 인 wire cfg)에 철거 여부를 봐야 한다
- **Fix:** 시그니처만 `Pick<RelayLimitChaserInput, 게이트 4종>` — 판정 로직 동일
- **Commit:** 720996da

**3. [Rule 1 - Test intent] cfg 키 수 44 → 43 기대값 갱신(`lc-tracer.test` · 직렬화 ④) · `lib/limit-chaser.test` `serverEcho` 에 읽기 전용 `buyWatchSide: '0'` 명시**
- **Found during:** Task 3 GREEN
- **Issue:** 입력 계약에서 키가 빠지며 폼 값 spread 가 `RelayLimitChaser` 의 필수 필드를 더는 채우지 않음 · cfg 키 수가 43 으로 바뀜
- **Fix:** 기대값 갱신 · 픽스처에 에코 필드 명시
- **Commit:** 989fb4cd

**4. [해석] Task 1 은 RED 커밋을 따로 두지 않았다**
- 구현(`msg-type` · `envelope` · `fanout` · `protocol`)을 먼저 고친 뒤 테스트를 바꿔 한 커밋(`ab1f3bbd`)에 담았다 — Task 2 · 3 은 RED → GREEN 두 커밋. Task 1 의 새 테스트(ws-latch ①-3 · ②-7b · codec 38 봉인)는 구 코드에서 38 이 나가므로 실패했을 동작을 단언한다.

**5. [해석] 폼 주석의 감시대상 언급 정리** — `limit-chaser-form.tsx` 머리 주석의 「감시대상」 언급(토글 · 즉시 전송 · aria-pressed 규율 등 12곳)을 현행에 맞게 지웠다. 동작 변화 없음.

**Total deviations:** 3 auto-fixed(Rule 3 ×1 · Rule 1 ×2) + 해석 2. **Impact:** 아키텍처 변경 없음 · 범위 확장 없음(webapp LED 타입 좁힘은 계획된 「handleArm 에 buy 없음」의 필요 조건).

## 뒤 플랜이 닫아야 할 것

- **24-04:** P20-3 폭 측정에서 `lc-watch-row` 를 뺐다 — 새 매수 행(선매수 · 추가매수 · 후매수)으로 다시 잰다. P20-3 자체는 기존 실패(344 헤더 이름 넘침)로 **첫 단언에서 멈춰** 이 플랜의 행 목록 변경은 실브라우저로 검증되지 않았다. `cardGroupStatusOf` 매수 문구(24-01 이월)도 24-04.
- **24-09(배포):** relay 를 먼저 배포해도 옛 탭은 거부 프레임만 받는다 — 배포 뒤 사용자에게 탭/앱 새로고침 안내. relay 한시 관용(`latch` enum `"buy"` · 신필드 optional)은 gh-trade `buy_watch_side` 봉인 후속과 함께 걷는다.
- `RelayLimitChaser.buyWatchSide`(읽기 전용)는 남는다 — 24-02 추출 도구 · 옛 서버 에코 파서가 쓴다.

## Known Stubs

없음.

## Deferred Issues

`.planning/phases/24-limitchaser-buy3/deferred-items.md` 의 기존 e2e 실패 3건 그대로(24-03 무관): 「5. 격자」 · 「P20-3 최악값」(344 카드 `<b>삼성전자</b>` 넘침 — 이번 실행에서도 같은 메시지 확인) · 「iPhone 가로 폭 844 … 16px」.

## TDD Gate Compliance

- Task 2: `test(24-03)` b70d9f55 (7 failed) → `feat(24-03)` 720996da (644 passed)
- Task 3: `test(24-03)` 877de685 (relay 10 · webapp 9 failed) → `feat(24-03)` 989fb4cd (green)
- Task 1: 단일 `feat` 커밋 — 위 Deviation 4

## Threat Flags

없음 — 새 네트워크 표면 없음. 거부 프레임은 기존 `rejectFrame`(`src:"Relay"`) 슬롯이고 로그에 계좌번호를 싣지 않는다(T-16-45 · 테스트 단언). T-24-11~15 · T-24-42 mitigate 는 위 통합 테스트로 이행.

## Self-Check: PASSED

- FOUND: relay/src/ws/protocol.ts(`RelayInboundWire` · `buy3CfgOf` · `withNeutralBuy3` · 거부 문구 2종) · relay/src/ws/fanout.ts · relay/src/dma/msg-type.ts
- FOUND: ab1f3bbd · b70d9f55 · 720996da · 877de685 · 989fb4cd

## Next

Ready for 24-04 (24-02 는 사람 체크포인트 대기 — 이 플랜과 독립).
