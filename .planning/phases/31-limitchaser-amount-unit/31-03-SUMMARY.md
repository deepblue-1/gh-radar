---
phase: 31-limitchaser-amount-unit
plan: 03
subsystem: trading
tags: [user-settings, flatbuffers, zod, relay, webapp, shared, amount-unit, tdd]
status: complete

requires:
  - phase: 31-limitchaser-amount-unit
    provides: "31-01 relay 금액 계약 패턴(zod 선택 · 조립 toWireUint · 파서 부재 = 0) · shared/relay 「새 클라 계약 필수 · relay 구 탭 관용」 규약"
provides:
  - "shared RelayUserSettingsValues.postBuyFloorAmount(만원 · 필수) · RelayUserSettingsMsg.postBuyFloorAmount?(키 부재 = 구 relay) · USER_SETTINGS_RANGES.postBuyFloorAmount 0~999,999,999 · postBuyFloorQty 봉인 JSDoc"
  - "relay 42 조립 12값 — addPostBuyFloorQty(b, 0) 봉인 · addPostBuyFloorAmount(vtable 28) · 84 파서 postBuyFloorAmount(슬롯 부재 = 0)"
  - "relay zod user.settings.set postBuyFloorAmount 선택 · USER_SETTINGS_FLOOR_UNKNOWN_TEXT"
  - "relay fanout — 금액 없는 구 탭 저장은 hub.getUserSettings(userId) 금액 되싣기 · 캐시 없음 = 게이트웨이 0바이트 · 거부 프레임 · 소켓 유지"
  - "webapp /me 「후매수 최소」(만원) 행 · usableUserSettingsOf(금액 키 없는 84 = 불러오는 중) · 42 조립 봉인 0"
affects: [31-04, 31-06, 31-07, 31-08]

actuals:
  tokens: 13496
  tasks: 2
  commits: 4
plan_head_before: 286531431452fea4a26d1dd4c4b73f3c93bedbc9
plan_head_after: 0daf1b0c5460ac8f29add18a1eaf81aaed289b80

tech-stack:
  added: []
  patterns:
    - "봉인 필드는 조립기에서 상수 0 — 입력 타입은 그대로 두고(구 탭 호환) 와이어에서만 고정"
    - "구 탭의 빠진 전체교체 칸은 relay 가 마지막 84 캐시로 메우고, 캐시가 없으면 저장하지 않고 비종료 거부(지어낸 0 금지)"
    - "웹은 금액 키가 없는 84 를 미수신과 같은 상태로 접는다 — 한 번 거른 값(usableUserSettingsOf)을 칩 · 행 · 저장 기계가 같이 본다"

key-files:
  created: []
  modified:
    - packages/shared/src/relay.ts
    - relay/src/ws/protocol.ts
    - relay/src/ws/fanout.ts
    - relay/src/dma/envelope.ts
    - relay/tests/helpers/frames.ts
    - relay/tests/helpers/fake-gateway.ts
    - relay/tests/ws-autosell.test.ts
    - relay/src/dma/__tests__/envelope.test.ts
    - relay/tests/fanout.test.ts
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/components/me/limit-chaser-defaults.tsx
    - webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx

key-decisions:
  - "구 탭 11값 저장의 금액은 relay 가 그 사용자 마지막 84 캐시(TTL 없음)에서 되싣는다 — 캐시가 없으면 USER_SETTINGS_FLOOR_UNKNOWN_TEXT 거부 프레임(소켓 유지)"
  - "fanout 의 금액 판정은 #strategySession 가드 뒤 — 세션 미준비면 기존 상태 거부가 먼저다"
  - "/me 는 usableUserSettingsOf 로 84 를 한 번 걸러 같은 객체 참조를 쓴다 — 84 변화 이펙트(참조 동등)를 그대로 유지"
  - "seedFromUserSettings 는 선택 키 부재(undefined)를 범위 밖과 같게 폴백 — shared 타입 합류로 필요한 최소 한 줄(31-06 방향과 같음)"

patterns-established:
  - "relay 비종료 거부 = rejectFrame(문구, '', '', msg.t) + return — #reject(4400) 금지 · 문구 상수는 protocol.ts"

requirements-completed: [AMT-03]

coverage:
  - id: D1
    description: "relay 42 조립 12값 — post_buy_floor_qty 는 입력 무관 0(봉인) · post_buy_floor_amount(vtable 28)에 요청 값 · 표현 범위 밖 OrderBuildError"
    requirement: "AMT-03"
    verification:
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#P31 UserSettings post_buy_floor_amount (vtable 28)"
        status: pass
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#Phase 27 요청 조립기 41 · 42 · 43 (12값 · 봉인 0 갱신)"
        status: pass
    human_judgment: false
  - id: D2
    description: "84 파서가 postBuyFloorAmount 를 싣고(구 84 슬롯 부재 = 0) user.settings 프레임으로 팬아웃"
    requirement: "AMT-03"
    verification:
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#84 파서 — post_buy_floor_amount 84 / 슬롯 부재 0"
        status: pass
      - kind: integration
        ref: "relay/tests/ws-autosell.test.ts#P31 84 의 후매수 최소 300 은 user.settings 프레임에 그대로 실린다"
        status: pass
    human_judgment: false
  - id: D3
    description: "구 탭 11값 저장 — 84 캐시 금액 되싣기(42 1건 · 소켓 열림) · 캐시 없음이면 42 0건 · 거부 프레임(ERROR · Relay · user.settings.set) · 소켓 유지 · 다음 12값은 42 · 범위 밖은 4400"
    requirement: "AMT-03"
    verification:
      - kind: integration
        ref: "relay/tests/ws-autosell.test.ts#P31 user.settings.set 후매수 최소 (D-13 · D-14 보정) (8 passed)"
        status: pass
    human_judgment: false
  - id: D4
    description: "/me 「후매수 최소」 행 — 묶음 순서 최대 · 최소 · 반등 · 「84만원」 · 「0만원」 · 접근성 이름 · 하한잔량 글자 0 · 11행"
    requirement: "AMT-03"
    verification:
      - kind: automated_ui
        ref: "webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx#P31 후매수 최소 (D-13 · UI-SPEC S5)"
        status: pass
    human_judgment: false
  - id: D5
    description: "/me 저장 = 42 12값(84 의 10값 + 바꾼 칸 + 최소) · 봉인 0 · 금액 키 없는 84(구 relay)는 불러오는 중 · send 0 · 54 원문 그대로 · 범위 문장 0~999,999,999만원"
    requirement: "AMT-03"
    verification:
      - kind: automated_ui
        ref: "webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx#P31 후매수 최소 (7 passed) + Phase 27 42 기대값 갱신"
        status: pass
    human_judgment: false
  - id: D6
    description: "실서버(gh-trade Phase 32 배포 뒤) 42/84 왕복 · C# 「최소 [ ]만」 원값 보존 · /me 실브라우저 표시(999,999,999만원 44px 한 줄)"
    requirement: "AMT-03"
    verification: []
    human_judgment: true
    rationale: "gh-trade 서버 배포 · e2e · 시각 확인은 31-07/31-08 과 메인 세션 몫(이 플랜은 배포 금지 · 단위/통합 테스트까지만)"

duration: 13min
completed: 2026-10-11
---

# Phase 31 Plan 03: /me 「후매수 최소(만원)」 · 42/84 12값 계약 Summary

**shared 사용자 설정 계약에 `postBuyFloorAmount`(만원 · 0~999,999,999)를 더하고, relay 가 42 를 12값 전체 교체로 조립하면서 봉인 `post_buy_floor_qty` 는 늘 0 으로 싣고, 84 파서는 금액을 싣는다. 구 탭 11값 저장은 84 캐시 금액을 되싣거나 소켓을 유지한 채 거부한다. /me 는 「후매수 하한잔량(주)」 행을 「후매수 최소(만원)」 행으로 바꿨고, 금액 키가 없는 84 는 「불러오는 중」 으로 둔다.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-10-11T14:23:34Z
- **Completed:** 2026-10-11T14:36:15Z
- **Tasks:** 2 (둘 다 TDD RED → GREEN)
- **Files modified:** 12

## Accomplishments

- **계약(shared)** — `RelayUserSettingsValues.postBuyFloorAmount`(필수) · `RelayUserSettingsMsg` 는 `Omit<…> & { postBuyFloorAmount?: number }`(키 부재 = 구 relay) · `USER_SETTINGS_RANGES.postBuyFloorAmount` · `postBuyFloorQty` 봉인 JSDoc. relay zod 와 /me 시트가 이 범위 하나를 같이 읽는다.
- **relay 42/84** — `buildSetUserSettingsReq` 가 `addPostBuyFloorQty(b, 0)`(봉인)과 `addPostBuyFloorAmount(vtable 28)` 를 싣는다. `parseUserSettings` 는 `postBuyFloorAmount` 를 늘 싣는다(구 84 = 0).
- **D-14 보정(Pitfall 3)** — zod 는 금액을 선택으로 받고, fanout 은 `msg.s.postBuyFloorAmount ?? hub.getUserSettings(userId)?.postBuyFloorAmount` 로 채운다. 둘 다 없으면 게이트웨이 0바이트 · `rejectFrame(USER_SETTINGS_FLOOR_UNKNOWN_TEXT)` · 소켓 유지(`#reject` 없음).
- **/me** — 11행을 유지하면서 하한잔량 행 자리를 `{ key: "postBuyFloorAmount", label: "후매수 최소", unit: "만원" }` 로 바꿨다. `userSettingsValuesOf` 는 12값을 싣고 봉인 값은 0 이다. `usableUserSettingsOf` 는 금액 키가 없는 84 를 미수신으로 접는다(칩 · 흐림 · 편집 · 저장 기계가 모두 이 값을 본다).

## Task Commits

1. **Task 1: shared 계약 + relay 42 봉인 · 84 파서 · 구 탭 금액 되싣기**
   - RED `5ae02490` (test)
   - GREEN `df28f152` (feat)
2. **Task 2: /me 행 교체 · 42 조립 봉인 0 · 금액 부재 = 불러오는 중**
   - RED `a2b697d4` (test)
   - GREEN `0daf1b0c` (feat)

## TDD Gate Compliance

- **Task 1 RED:** `cd relay && pnpm exec vitest run src/dma/__tests__/envelope.test.ts -t "84 파서 — post_buy_floor_amount 84 프레임" --reporter=tap-flat` 의 결과는 exit 1 · `expected undefined to be 84` 였다. `gsd-tools check tdd-red-evidence` 판정은 **RED_EVIDENCE_OK**(`target_test_failed`)다. 전체 P31 RED에서는 13건이 실패했다. 모두 계획한 단언에서 실패했고(금액 0 · 봉인 120000 · 84 금액 undefined · 거부 프레임 미도착 · 4400 미발생), 처음 보인 `inbound` 미정의 ReferenceError 는 RED 커밋 전에 고쳤다.
  - semanticAssessment: 대상 테스트가 실행됐고 parseUserSettings 가 vtable 28 을 읽지 않아 undefined 로 실패했다. import · 구문 · 픽스처 오류는 아니다. 리포터 stdout 앞에 붙은 pino GCP 진단 한 줄은 레코드의 `consoleOutput` 으로 따로 보존했다(보고서 본문은 고치지 않았다).
- **Task 1 GREEN:** `df28f152` — P31 18건 통과 · relay 전체 1546건 통과.
- **Task 2 RED:** `cd webapp && pnpm exec vitest run src/components/me/__tests__/limit-chaser-defaults.test.tsx -t "userSettingsValuesIssue — 최소 범위 밖" --reporter=tap-flat` 의 결과는 exit 1 · `expected null to be '0~999,999,999만원 사이여야 해요'` 였고 판정은 **RED_EVIDENCE_OK** 다. 파일 전체에서 12건이 실패했고(P31 7 · 기존 42 기대값 갱신 5), 사유는 행 없음 · 봉인 0 미적용 · 금액 미적재다.
- **Task 2 GREEN:** `0daf1b0c` — /me 37건 · P31 7건 통과.
- **REFACTOR:** 없음.

## Files Created/Modified

- `packages/shared/src/relay.ts` — 12값 계약 · 84 메시지 선택 키 · 범위 · 봉인 JSDoc
- `relay/src/ws/protocol.ts` — zod `postBuyFloorAmount` 선택 · `USER_SETTINGS_FLOOR_UNKNOWN_TEXT`
- `relay/src/dma/envelope.ts` — 42 봉인 0 · `addPostBuyFloorAmount` · 84 파서 금액
- `relay/src/ws/fanout.ts` — 구 탭 금액 되싣기 · 캐시 없음 비종료 거부
- `relay/tests/helpers/{frames,fake-gateway}.ts` — 84 빌더 금액(기본 0) · 42 디코드 금액
- `relay/tests/ws-autosell.test.ts` — SETTINGS 12값 · ③-1 봉인 기대 · P31 describe 8건
- `relay/src/dma/__tests__/envelope.test.ts` — 42/84 기존 단언 12값 갱신 · P31 describe 5건
- `relay/tests/fanout.test.ts` — 인증 직후 84 스냅샷 기대에 `postBuyFloorAmount: 0`(목록 밖)
- `webapp/src/lib/limit-chaser.ts` — `seedFromUserSettings` 가 선택 키 부재를 폴백으로 처리(목록 밖 한 줄)
- `webapp/src/components/me/limit-chaser-defaults.tsx` — 행 교체 · `usableUserSettingsOf` · 12값 조립
- `webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx` — 픽스처 12값 · VALUES_OF 봉인 0 · P31 describe 7건

## Decisions Made

- 구 탭 11값의 금액은 relay 가 그 사용자의 마지막 84 캐시에서 되싣는다(플랜 가정 그대로 · TTL 없음).
- 금액 판정은 `#strategySession` 가드 뒤에 둔다. 세션이 준비되지 않았으면 기존 상태 거부가 먼저다.
- /me 는 `usableUserSettingsOf` 로 같은 객체 참조를 돌려준다. 84 변화 이펙트의 참조 동등 판정을 깨지 않기 위해서다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `seedFromUserSettings` 의 선택 키 typecheck 오류 — 목록 밖 `webapp/src/lib/limit-chaser.ts` 한 줄**
- **Found during:** Task 1 GREEN(shared 타입 합류 직후 webapp typecheck)
- **Issue:** `RelayUserSettingsMsg` 의 `postBuyFloorAmount` 가 선택으로 바뀌었다. 그래서 `keyof RelayUserSettingsValues` 로 인덱싱하면 값이 `number | undefined` 가 되고, `fitsLcRange(field, v)` 가 TS2345 를 냈다.
- **Fix:** `v !== undefined && fitsLcRange(field, v) ? v : fallback[field]` 로 고쳤다. 키 부재는 범위 밖과 같이 폴백한다. 31-06 플랜의 「fitsLcRange undefined 처리」 와 같은 방향이다. 시딩 표(`USER_SETTINGS_SEED_MAP`)는 건드리지 않았다.
- **Verification:** webapp typecheck exit 0 · `src/lib` 테스트 통과
- **Committed in:** `df28f152`

**2. [Rule 1 - Bug] relay `fanout.test.ts` 인증 직후 84 스냅샷 기대값 동기화 — 목록 밖**
- **Found during:** Task 1 GREEN(relay 전체 실행)
- **Issue:** 새 relay 84 는 늘 `postBuyFloorAmount` 를 싣는데(부재 = 0) 기존 `toEqual` 기대값에는 그 키가 없었다.
- **Fix:** 기대값에 `postBuyFloorAmount: 0` 를 넣었다.
- **Committed in:** `df28f152`

**3. [Rule 1 - Bug] envelope Phase 27 블록의 42/84 기존 단언 갱신**
- **Found during:** Task 1 RED
- **Issue:** 「42 11값 그대로」 단언은 `postBuyFloorQty 99_999_999` 를 기대했고, `USER_SETTINGS_RANGES` 키 집합 단언과 `parseUserSettings` 왕복 단언은 11키를 기대했다.
- **Fix:** 12값으로 바꾸고, 42 기대값은 `{ ...SETTINGS, postBuyFloorQty: 0 }` 로 바꿨다(플랜이 지목한 파일 안).
- **Committed in:** `5ae02490`

---

**Total deviations:** 3 auto-fixed (1 blocking · 2 test-sync)
**Impact on plan:** 모두 계약 합류에 따른 동기화이고 범위 확장은 없다. 31-04 · 31-05 소유 영역(`USER_SETTINGS_SEED_MAP` · 상따 모델 · 주문로그)은 건드리지 않았다.

## Issues Encountered

- `protocol.test.ts` 는 수정이 필요 없었다. 범위 순회 테스트가 `postBuyFloorAmount` max+1/min-1 위반까지 자동으로 덮는다.
- RED 증거 수집 때 vitest tap 출력 앞에 pino GCP 진단 한 줄이 붙었다. `consoleOutput` 으로 분리해 해결했다.

## Known Stubs

없음.

## User Setup Required

없음 — 외부 서비스 설정이 필요 없다.

## Next Phase Readiness

- 31-04(상따 모델)와 31-05(주문로그)가 이 계약 위에서 그대로 진행할 수 있다. 31-06 은 `USER_SETTINGS_SEED_MAP` 에 `['postBuyFloorAmount', 'postBuyFloorAmount']` 를 더하면 된다(undefined 폴백은 이미 동작한다).
- 배포 순서는 relay 먼저, 그다음 webapp이다(31-08). relay 선배포 창에서 구 /me 의 저장은 84 캐시 금액을 되싣고 소켓을 닫지 않는다.
- 검증: shared typecheck · build / relay typecheck · typecheck:tests · 1546 tests / webapp typecheck · `src/components/me` + `src/lib` 1262 tests 모두 통과. 배포 · push 는 하지 않았다(지시대로).

---
*Phase: 31-limitchaser-amount-unit*
*Completed: 2026-10-11*

## Self-Check: PASSED

- 파일: 이 SUMMARY · key-files.modified 12개 — FOUND
- 커밋: `5ae02490` · `df28f152` · `a2b697d4` · `0daf1b0c` — HEAD 조상 FOUND
- 수용 기준: Task 1 grep 4종(봉인 0 · amount 조립 · zod 선택 · fanout 문구, 같은 갈래 `#reject` 0) · P31 18 passed · relay typecheck 2종 exit 0 / Task 2 grep(라벨 1 · 하한잔량 0 · `postBuyFloorQty: 0` 1) · P31 7 passed · webapp typecheck exit 0 — 모두 PASS
- 플랜 검증: shared typecheck+build · relay typecheck/typecheck:tests + 1546 · webapp typecheck + `src/components/me` 통과
