---
phase: 24-limitchaser-buy3
plan: 01
subsystem: relay-webapp-wire
status: complete
tags: [flatbuffers, relay, zod, shared-contract, react, playwright, limit-chaser, buy3]

requires:
  - phase: gh-trade Phase 24 (외부 저장소)
    provides: "StockDMA.fbs SetLimitChaser 말미 17필드(buy3_schema vtable 98 ~ post_buy_phase 130) · buy_entry_latched 봉인(deprecated)"
provides:
  - "buy3 와이어 한 경로 — 웹 lc.set → relay(buy3_schema=1 고정 · C→S 12 · buy_watch_side/S→C 4 미전송) → 게이트웨이 10 → 60/64 에코 신필드 17 → lc 프레임 → 매수 LED D-12"
  - "shared RelayLimitChaser 신필드 17 · LIMIT_CHASER_SERVER_RUNTIME_FIELDS(5) · LIMIT_CHASER_SERVER_ONLY_FIELDS = 10"
  - "relay 테스트 헬퍼 readSetLimitChaserRequest(vtable 슬롯 부재 판정) · e2e 픽스처 재export"
  - "webapp 테스트 공용 픽스처 LC_BUY3_ECHO_DEFAULTS · makeLimitChaser"
  - "매수 LED D-12 (OFF / 감시 / 보유중, 전부 클릭 불가) · 로그 매수 래치 전이 제거"
affects: [24-02, 24-03, 24-04, 24-05, 24-06, 24-07, 24-08, 24-09]

plan_head_before: 10fea29b498f4afd3acdf21d6358e4112d703b45
actuals:
  tokens: 42000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "요청 슬롯 부재는 접근자 값이 아니라 vtable(`bb.__offset(bb_pos, vt) !== 0`)로 증명한다"
    - "relay 고정값(LC_FIXED_BUY3_SCHEMA)은 입력 타입에 두지 않고 빌더가 못박는다"
    - "RelayLimitChaser 테스트 픽스처 신필드 기본값은 webapp/src/test-fixtures/limit-chaser.ts 한 곳"

key-files:
  created:
    - webapp/src/test-fixtures/limit-chaser.ts
    - .planning/phases/24-limitchaser-buy3/deferred-items.md
  modified:
    - relay/src/generated/stock-dma/set-limit-chaser.ts
    - relay/src/generated/StockDMA.fbs
    - relay/src/dma/envelope.ts
    - relay/src/ws/protocol.ts
    - relay/tests/helpers/frames.ts
    - relay/tests/helpers/fake-gateway.ts
    - packages/shared/src/relay.ts
    - packages/shared/src/index.ts
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/latch-led.tsx
    - webapp/src/components/trading/strategy-log.tsx
    - webapp/e2e/fixtures/relay.ts
    - webapp/e2e/specs/trading-workbench.spec.ts
    - webapp/src/styles/globals.css

key-decisions:
  - "buy3_schema 는 relay 상수 LC_FIXED_BUY3_SCHEMA=1 로 못박고 입력·zod 에 두지 않는다 (T-24-01)"
  - "매수 LED 는 마스터 우선 — buyEnabled=false 면 postBuyPhase=2 여도 OFF (WinForms 와 다른 점을 테스트 이름에 박제)"
  - "formFromServer 는 추가매수·후매수 금액 0 을 0 그대로 들인다 — buyOrderAmount 의 prev 보존 특례를 따르지 않는다 (D-03, PATTERNS 제안 불채택)"
  - "가짜 게이트웨이 에코는 buyWatchSide 를 명시할 때만 슬롯을 싣는다 — 기본이 새 서버(buy3) 흉내"
  - "RelayLcSetSchema 신필드 12 는 이 플랜에서 필수 — 구 탭 관용(거부 프레임·소켓 유지)은 24-03"

patterns-established:
  - "vtable 부재 단언: 테스트는 presentSlots/serverOnlySlots 로 슬롯 존재를 직접 본다 + 실은 필드 대조군으로 거짓 green 방지"

requirements-completed: []

coverage:
  - id: D1
    description: "스키마 재생성 — gh-trade 팁 flatc 출력과 생성물 일치(바뀐 생성 파일 2개)"
    verification:
      - kind: other
        ref: "RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh --check → 신규/변경 예정 0 개 · .fbs 사본 최신"
        status: pass
    human_judgment: false
  - id: D2
    description: "relay 빌더 buy3_schema=1 · C→S 12 · buy_watch_side/S→C 4 슬롯 부재, 파서 신필드 17 (60·64 · 키 56)"
    verification:
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#③-buy3 · ③-buy3-b · ⑤-buy3 · ① 55필드 왕복"
        status: pass
    human_judgment: false
  - id: D3
    description: "relay zod — 반등률 0~100 + 후매수 ON 이면 1~100 · 최대 횟수 0~255 · 신필드 필수 · S→C 5 떨어뜨림"
    verification:
      - kind: unit
        ref: "relay/tests/protocol.test.ts#①-buy3 · ①"
        status: pass
    human_judgment: false
  - id: D4
    description: "relay 통합 트레이서 — ws lc.set → 게이트웨이 10(buy3) → 60 보유중 에코 → lc 프레임"
    verification:
      - kind: integration
        ref: "relay/tests/fanout.test.ts#⑰-buy3"
        status: pass
    human_judgment: false
  - id: D5
    description: "매수 LED D-12 · 로그 매수 래치 전이 제거 · 런타임 5/그룹 게이트 3 skip · 폼 기본값·금액→수량 3벌 · D-03 금액 0"
    verification:
      - kind: unit
        ref: "webapp latch-led.test · strategy-log.test · limit-chaser.test · limit-chaser-form.test · strategy-card-flow.test ⑲-5 · card-header.test"
        status: pass
    human_judgment: false
  - id: D6
    description: "브라우저 트레이서 P24-1 — 비교가격 확정 → 게이트웨이 10 buy3 디코드 → 보유중 LED(span · 툴팁 원문) → 390 · 1280 헤더 한 줄"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P24-1"
        status: pass
    human_judgment: false

duration: 21min
completed: 2026-09-28
---

# Phase 24 Plan 01: buy3 와이어 트레이서 Summary

**gh-trade 팁 재생성 → relay 가 `buy3_schema=1` 고정 · C→S 12필드로 SetLimitChaser 를 조립하고(`buy_watch_side` · S→C 4 슬롯 없음) 60/64 신필드 17 을 파싱해 `lc` 로 올리며, 웹 매수 LED 가 D-12(OFF/감시/보유중, 클릭 불가)로 그린다 — relay 통합 ⑰-buy3 와 Playwright P24-1 로 끝까지 증명.**

## Performance

- **Duration:** 21 min
- **Started:** 2026-09-27T16:57:44Z
- **Completed:** 2026-09-27T17:18:52Z
- **Tasks:** 2 (tracer 1 + auto/tdd 1)
- **Files modified:** 38 (+1 deferred-items)

## 재생성 기록

- gh-trade 워크트리: `/Users/alex/repos/gh-trade/.claude/worktrees/phase-24-limitchaser-buy3`
- **gh-trade 팁:** `9c35fcbf`
- **`.fbs` 마커 커밋(StockDMA.fbs 마지막 변경):** `1d95f64f`
- 재생성 전 `--check`: 「신규/변경 예정 : 1 개」 · 「.fbs 사본 : 갱신 예정」 → 반영 후 「신규/변경 예정 : 0 개」 · 「.fbs 사본 : 최신 (마커 7줄 제외 본문 동일)」
- 바뀐 생성 파일(정확히 2개): `relay/src/generated/stock-dma/set-limit-chaser.ts` · `relay/src/generated/StockDMA.fbs`

## Accomplishments

- relay `buildSetLimitChaserReq`: `LC_FIXED_BUY3_SCHEMA = 1` 신설 · C→S 12필드 이름 있는 `addXxx` 13호출 · `buy_watch_side` 기록과 `toWireWatchSide` 제거 · S→C 4 자리는 결의 주석만
- relay `readLimitChaser`: 매수 진입 래치 읽기 제거 · 신필드 17 파싱(`postBuyEnabled` 는 다시 접지 않음, D-21)
- relay zod: 신필드 12 필수 · `postBuyReboundPct` 0~100 + `superRefine`(후매수 ON 이면 1~100) · `postBuyReentry` UByte · 최소>최대 미차단
- shared: `RelayLimitChaser` 신필드 17 · `LIMIT_CHASER_SERVER_RUNTIME_FIELDS` 신설(index.ts export) · 래치 필드 목록 2개로 축소 · SERVER_ONLY = 10
- 테스트 헬퍼: `readSetLimitChaserRequest` · `SetLimitChaserRequest`(vtable 112/126/128/130 `serverOnlySlots`) · `FakeLimitChaserInput` 신필드 17
- webapp: 폼 값 Omit 에 두 수량 · 기본값(D-04/05/17 폴백) · `formFromServer` 10필드(금액 0 그대로) · DIRTY 31 · `buildCfg` 금액→수량 3벌 · 매수 LED D-12 · sr-only 「매수 상태 {라벨}」(R12) · 로그 매수 래치 전이 제거 · VALUE_COMPARE_SKIP 그룹 게이트 3 · RUNTIME_ONLY_SKIP 런타임 5
- 테스트 공용 픽스처 `LC_BUY3_ECHO_DEFAULTS` · `makeLimitChaser` 와 인라인 팩토리 17곳 기계 치환(18개 파일 참조)
- 트레이서 테스트: relay `⑰-buy3 lc.set 은 buy3_schema=1 · C→S 12 · buy_watch_side 없음 · S→C 슬롯 없음으로 나가고 60 에코(보유중)가 lc 로 온다 (Phase 24 트레이서)` · Playwright `P24-1 buy3 와이어 한 경로 — …`

## Task Commits

1. **Task 1 (tracer): buy3 와이어 한 경로** — `dbfd8e43` (feat)
2. **Task 2: 브라우저 증거 P24-1** — `dcecfb79` (test)

⚡ Tracer verified end-to-end — expanding (Task 1 `<verify>` 전부 재실행 green 뒤 Task 2 진행).

## Verification (실행 명령 · 결과)

- `sync-relay-schema.sh --check` → 신규/변경 0 개 · .fbs 사본 최신 — PASS
- `pnpm --filter @gh-radar/shared build && … relay typecheck && … relay typecheck:tests && … webapp typecheck` → exit 0 — PASS
- `pnpm --filter @gh-radar/relay run test` → 28 files · 635 passed — PASS
- `pnpm --filter @gh-radar/relay exec vitest run tests/fanout.test.ts -t "⑰-buy3"` → 1 passed (50 skipped = 필터 밖) — PASS
- `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading src/components/layout src/lib` → 80 files · 1894 passed · 1 skipped — PASS
- `pnpm --filter @gh-radar/webapp run test`(전체) → 124 files · 2443 passed · 1 skipped — PASS
- `playwright test e2e/specs/trading-workbench.spec.ts -g "P24-1"` → 2 passed(setup + P24-1) — PASS
- `playwright test e2e/specs/trading-workbench.spec.ts`(전체) → **기존 실패 3건**(아래 Deferred) 때문에 serial 중단. 세 건을 `--grep-invert` 로 빼면 50 passed(setup 포함) — 24-01 변경으로 깨진 케이스 0

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] shared `index.ts` 에 `LIMIT_CHASER_SERVER_RUNTIME_FIELDS` export 추가**
- **Found during:** Task 1
- **Issue:** 플랜은 `relay.ts` 에 const 만 적었지만 webapp 은 `@gh-radar/shared` 루트에서 import 한다
- **Fix:** `packages/shared/src/index.ts` 재export 한 줄
- **Commit:** dbfd8e43

**2. [Rule 1 - Test intent] 가짜 게이트웨이 에코의 `buy_watch_side` 슬롯을 명시할 때만 싣게 변경**
- **Found during:** Task 1 (파서 「슬롯 없으면 "0"」 케이스)
- **Issue:** `frames.ts` 기본값이 늘 `"0"` 을 실어 새 서버 에코(슬롯 없음)를 흉내낼 수 없었다
- **Fix:** 기본은 슬롯 미기록, `buyWatchSide` 를 주면 기록(구 서버 흉내). 파싱 결과는 둘 다 `"0"` 이라 기존 테스트 무영향
- **Commit:** dbfd8e43

**3. [Rule 1 - Test intent] 부재 단언에서 `buyEntryLatched` 리터럴 제거**
- **Found during:** Task 1 acceptance(`grep … buyEntryLatched` == 0)
- **Issue:** `not.toHaveProperty("buyEntryLatched")` 류 단언이 acceptance grep 을 0 이 아니게 만들었다
- **Fix:** 부재는 키 수 단언(56 · 44 · 10)과 타입이 증명한다 — 리터럴 단언 삭제, 주석은 「매수 진입 래치」 한글로
- **Commit:** dbfd8e43

**4. [해석] P24-1 헤더 한 줄 측정 — 390 에서는 칩 3개 한 줄 · ⓘ·✕ 한 줄을 각각 본다**
- **Found during:** Task 2
- **Issue:** `card-header.tsx` 는 카드 폭 760 미만에서 LED 줄(l2)을 **설계상** 둘째 줄로 내린다(quick-260925-ptw). 390(카드 372px)에서 칩과 ⓘ·✕ 의 y 가 같을 수 없다
- **Fix:** 칩 3개 center-y 편차 ≤4 · ⓘ·✕ center-y 편차 ≤4 를 두 뷰포트에서 보고, 카드 폭 ≥760(1280 에서 990px)이면 다섯 개 전부 ≤4 를 본다. 실측: 390 → 칩 234/234/234 · ⓘ·✕ 206/206, 1280 → 다섯 모두 184
- **Commit:** dcecfb79

**5. [해석] `cardGroupStatusOf` 매수 상태 문구 — card-body 테스트 기대값 갱신**
- **Found during:** Task 1
- **Issue:** `cardGroupStatusOf` 가 매수 LED tone 을 읽어 「무장 · 대기」/「감시 중」을 고른다. D-12 로 무장 매수는 늘 armed → 「감시 중」(보유중이면 「무장 · 대기」)
- **Fix:** 코드는 그대로 두고(카드 상태 문구는 24-04 소관) 테스트 기대값만 「감시 중」으로 갱신
- **Commit:** dbfd8e43

**Total deviations:** 3 auto-fixed(Rule 1 ×2 · Rule 3 ×1) + 해석 2. **Impact:** 아키텍처 변경 없음 · 범위 확장 없음.

## 이 트레이서가 의도적으로 남긴 것 (24-03 · 24-04 가 닫는다)

- `RelayLimitChaserInput.buyWatchSide` · zod `buyWatchSide` 는 아직 남는다(빌더가 싣지 않을 뿐) — 24-03
- zod 신필드 12 는 **필수** — 구 탭(신필드 없는 `lc.set`) 관용은 24-03
- `cardGroupStatusOf` 의 매수 「보유중」 → 「무장 · 대기」 매핑 — 24-04 가 상태 문구 표(§11)로 교체
- 둘 다 배포 전(24-09)에 반드시 닫힌다

## Known Stubs

없음. `webapp/src/test-fixtures/limit-chaser.ts` 의 0/false 값은 테스트 전용 중립 기본값이다(제품 코드가 import 하지 않음).

## Deferred Issues

`.planning/phases/24-limitchaser-buy3/deferred-items.md` — `trading-workbench.spec.ts` 기존 실패 3건(Phase 21 기록과 같은 뿌리 · 24-01 무관): 「5. 격자 …」 360 헤더 이름 넘침 · 「P20-3 최악값 …」 344 헤더 이름 넘침 · 「iPhone 가로 폭 844 … 16px」 낡은 기대값.

## TDD 메모

Task 2(`tdd="true"`)는 Task 1 트레이서가 이미 구현한 동작의 브라우저 증거라 RED 단계가 성립하지 않는다(테스트가 처음부터 green). 행동 추가 코드 없음 — 주석 1줄(globals.css) · 재export 1줄만.

## Threat Flags

없음 — 새 네트워크 표면 · 인증 경로 없음. T-24-01~06 mitigate 는 빌더/통합/e2e 단언으로 이행.

## Self-Check: PASSED

- FOUND: webapp/src/test-fixtures/limit-chaser.ts · relay/tests/helpers/fake-gateway.ts · relay/src/generated/stock-dma/set-limit-chaser.ts · webapp/src/components/trading/latch-led.tsx · .planning/phases/24-limitchaser-buy3/deferred-items.md
- FOUND: dbfd8e43 · dcecfb79

## Next

Ready for 24-02.
