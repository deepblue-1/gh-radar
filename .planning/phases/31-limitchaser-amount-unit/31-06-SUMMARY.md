---
phase: 31-limitchaser-amount-unit
plan: 06
subsystem: ui
tags: [limit-chaser, webapp, react, amount-unit, manwon, two-line-row, numpad, arm-block, tdd]
status: complete

requires:
  - phase: 31-limitchaser-amount-unit
    provides: "31-02 표시 부품 — SettingRow/CheckValueRow/DerivedRow `sub`(LcRowSub) · InlineValueEditor `subOf` · NumberPadSheet `hint`"
  - phase: 31-limitchaser-amount-unit
    provides: "31-03 shared 84 `postBuyFloorAmount?`(키 부재 = 구 relay) · seedFromUserSettings 선택 키 폴백"
  - phase: 31-limitchaser-amount-unit
    provides: "31-04 만원 모델 — lcSubmitQtyOf · lcAmountZeroWordOf · 수량 8칸 금액 키 · LC_FIELD_RANGES 금액 범위"
provides:
  - "ARM_BLOCKED_TEXT 7문장(C# 원문) · armBlockOf 판정 순서 1~8 · zeroQtySuffixOf · buyNeedsWatchPrice/sellNeedsWatchPrice(C# 식)"
  - "lc-fields 순수 함수 — lcQtyAmountFieldOf · lcQtyRowSubOf · lcAmountHintOf · lcDerivedRowTextOf · lcRowA11yNameOf(subText)"
  - "폼 연결 — 수량 8행 두 줄 · 파생 2행(발동잔량 · 잔량추적 기준선) 역산 만원 · 인라인 subOf · 시트 hint · amountLockTextOf(시트 · 인라인 잠금 한 곳)"
  - "USER_SETTINGS_SEED_MAP ['postBuyFloorAmount', 'postBuyFloorAmount'] — 새 폼 후매수 최소 = 84 금액"
affects: [31-07, 31-08]

actuals:
  tokens: 20124
  tasks: 3
  commits: 5
plan_head_before: 72ddef47112a7c53e42261f942315685979e5c89
plan_head_after: 5ff8e242cbb7c4e3440dbc14295cce8914069166

tech-stack:
  added: []
  patterns:
    - "등록 차단 문장은 ARM_BLOCKED_TEXT 상수 한 곳 — 패널(buyPriceReasonOf · armBlockedTextOf) · 전송 직전(armBlockOf)이 같은 판정 순서를 읽는다"
    - "두 줄 행 아래 줄 · 시트 안내 줄의 주는 shared qtyForSubmit(에코 메모 포함) — buildCfg 와 같은 값"
    - "수량 칸 잠금(비교가격 필요 · N만 → 0주)은 validateCommit 맨 앞 amountLockTextOf 한 곳 — 시트 validate · 인라인 validate 가 같은 문장"

key-files:
  created: []
  modified:
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/lc/lc-fields.ts
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/src/components/trading/lc/__tests__/lc-fields.test.ts
    - webapp/src/lib/__tests__/limit-chaser.test.ts
    - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
    - webapp/src/components/trading/__tests__/card-body.test.tsx

key-decisions:
  - "buyPriceReasonOf 는 「매수 비교가 0 ∧ 켜진 매수 쪽 칸 금액 > 0」 을 주문가격 0 보다 먼저 본다 — armBlockOf 1 순위와 순서를 맞춰 패널과 전송 직전이 같은 문장을 말한다"
  - "매도 게이트 문장(armBlockedTextOf)도 매도 비교가 0 ∧ 매수잔량 금액 > 0 이면 sellWatchPriceAmount — 패널이 「(1,500만 → 0주)」 같은 틀린 접미를 말하지 않게 한다(전송 직전은 표 2 가 먼저 잡는다)"
  - "취소:잔량 · 취소:체결(표 7 · 8)은 C# 처럼 금액 0 이어도 환산 0주면 막고 접미는 금액 > 0 일 때만 — 판정 주는 lcSubmitQtyOf(추적 ON 은 기준선)"
  - "파생 행 두 줄 배선은 qtyDerivedRowProps 한 함수 — 해제선(muted)은 DerivedRow 를 고치지 않고 mutedValue + unit(만/주)으로 그린다"
  - "잔량추적 기준선 파생 행도 값 0 이면 「—」(sr 「없음」) — UI-SPEC 파생 행 표를 두 행에 같이 적용"

patterns-established:
  - "수량 칸 대상 판정은 lcQtyAmountFieldOf 하나(금액 3칸 · 그 밖 행은 null) — 행 sub · 인라인 subOf · 시트 hint · 잠금이 같이 쓴다"

requirements-completed: [AMT-02, AMT-03, AMT-04]

coverage:
  - id: D1
    description: "등록 차단 D-03 · D-04 — 비교가 0 금액 환산 불가(매수 접두 · 매도 무접두 · WR-05 후매수 매도) · 매도 매수잔량 0주 + 접미 · 줄매수 최대 · 선매수 체결량 · 매도 체결수량 0주 · 취소 잔량 0 · 취소:체결 0 · 첫 일치 하나 · 철거 면제 · 패널 같은 문장"
    requirement: "AMT-04"
    verification:
      - kind: automated_ui
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#P31 등록 차단 (D-03 · D-04 · UI-SPEC 표 1~8) (12 passed)"
        status: pass
    human_judgment: false
  - id: D2
    description: "두 줄 문자열 순수 함수 — 아래 줄 순위 1~3(비교가격 필요 alert · 의미어 · N주) · 추적 ON 기준선 주 · 시트 환산 안내 · 파생 행 역산 · 999,999,999만 Clamp · 두 줄 접근성 이름"
    requirement: "AMT-04"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/lc-fields.test.ts#P31 두 줄 문자열 (D-05 · D-07 · D-08) (19 passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "화면 연결 — 수량 8행 「1,000만 / 777주」 · 「0만 / 무제한」 · 「1,500만 / 비교가격 필요」 · 금액 3칸 한 줄 · 발동잔량 「32,175만 / 25,000주」 · 기준선 매도 비교가 · 시트 「지금 1,000만」 · 「= 777주 (비교가격 12,870원)」 · 잠금 2종 · 인라인 버퍼 아래 줄 · Enter 잠금 말풍선"
    requirement: "AMT-04"
    verification:
      - kind: automated_ui
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#P31 두 줄 · 시트 · 인라인 (D-05 · D-07 · D-08 · UI-SPEC S1~S4) (10 passed)"
        status: pass
      - kind: automated_ui
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#⑦ 행 높이 — 수량 8칸 · 파생 2행은 56px 두 줄, 나머지는 44px"
        status: pass
    human_judgment: false
  - id: D4
    description: "새 폼 후매수 최소 = 84 postBuyFloorAmount(84 → 84 · 키 부재 → 0 · 범위 밖 → 0) · 미등록 폼(12,870) 「84만 / 65주」 · 첫 등록 cfg 84 · 65"
    requirement: "AMT-03"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/limit-chaser.test.ts#P31 84 후매수 최소 (D-12) (3 passed)"
        status: pass
      - kind: automated_ui
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#P31 D-12 — 84 postBuyFloorAmount 84 · 매수 비교가 12,870 새 폼"
        status: pass
    human_judgment: false
  - id: D5
    description: "webapp 회귀 — 타입체크(e2e tsconfig 포함) · 단위 전체"
    requirement: "AMT-02"
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && vitest --run --maxWorkers=2 (165 files · 3989 passed · 1 skipped)"
        status: pass
    human_judgment: false
  - id: D6
    description: "실브라우저 두 줄 행 폭 · 높이(56/44 실측 · 685 경계 여유 · 「잔량추적 기준선」 L4 접힘) · 시트 상태 줄 시각 · 등록 차단 긴 문장 줄바꿈"
    verification: []
    human_judgment: true
    rationale: "jsdom 은 컨테이너 쿼리 · 실제 높이 · 줄바꿈을 평가하지 않는다 — 클래스와 글자만 잠갔다. 실측 e2e(P20-3 · P24-7 · P31)는 31-07 몫"

duration: 22min
completed: 2026-10-11
---

# Phase 31 Plan 06: 두 줄 행 · 시트 · 등록 차단 · 84 후매수 최소 화면 연결 Summary

**수량 8칸이 위 「1,000만」 · 아래 「777주」(또는 「무제한」 · 빨간 「비교가격 필요」)로, 발동잔량 · 잔량추적 기준선이 「32,175만 / 25,000주」 로 그려지고, 시트 · 인라인이 같은 함수로 「= 777주 (비교가격 12,870원)」 안내와 「비교가격 필요 — …」 · 「12만 → 0주 — 금액을 늘리세요」 잠금을 보인다. 환산할 수 없는 켜진 설정은 C# 원문 7문장으로 UI-SPEC 순서 1~8 에 따라 등록 전에 막히고, 새 폼 후매수 최소는 84 금액으로 시작한다.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-10-11T15:21:47Z
- **Completed:** 2026-10-11T15:43:39Z
- **Tasks:** 3 (Task 1 · 2 TDD RED → GREEN, Task 3 auto)
- **Files modified:** 8 (목록 밖 테스트 2)

## Accomplishments

- **등록 차단(D-03 · D-04 · AMT-04)** — `ARM_BLOCKED_TEXT` 에 C# 원문 7문장을 더했다. `armBlockOf` 판정 순서는 매수 비교가 0 → 매도 비교가 0 → 게이트 사유(매도 매수잔량 0주 + 접미) → 한방 → 줄매수 최대 0주 → 선매수 체결량 0주 → 매도 체결수량 0주 → 취소 잔량 → 취소:체결 이고, 첫 일치 하나만 말한다. 접미 「 (12만 → 0주)」 는 `zeroQtySuffixOf` 한 곳에서 짓는다. 철거(게이트 OFF)는 막지 않는다. 열 아래 패널도 같은 판정(`buyAmountsNeedWatchPrice`)을 읽어 같은 문장을 말한다.
- **두 줄 행(D-07)** — `lcQtyRowSubOf` 의 아래 줄 순위는 1 「비교가격 필요」(alert) · 2 의미어 · 3 「N주」 이고, 주는 `qtyForSubmit`(에코 메모 · 추적 ON 기준선)이다. 수량 8행(값 행 6 · 체크 값 행 2)에 `sub` 를 넘기고, 접근성 이름을 「선매수 매도잔량 1,000만 777주」 로 넓혔다. 금액 3칸은 한 줄 그대로다(D-09).
- **파생 행(D-05)** — `lcDerivedRowTextOf` 는 발동잔량을 매수 비교가로, 기준선을 매도 비교가로 반올림 역산한다. 비교가가 0 이면 위 줄에 주만 · 아래 줄은 비우고, 해제선은 muted, 0 은 「—」 다. 위 줄은 999,999,999만에서 멈춘다.
- **시트 · 인라인(D-08 · S3 · S4)** — 시트에는 `hint` = `lcAmountHintOf` 를 넘긴다(「지금 1,000만」 은 31-04 그대로). 인라인에는 `subOf` 를 넘겨 버퍼 값으로 아래 줄을 실시간 갱신한다. 잠금 문장은 `amountLockTextOf` 한 곳에서 짓고 `validateCommit` 맨 앞에서 부른다. 시트 적용 버튼은 비활성이 되고, 인라인은 말풍선을 띄운 채 편집을 유지한다.
- **84 시딩(D-12 · AMT-03)** — `USER_SETTINGS_SEED_MAP` 에 후매수 최소 한 줄을 더했다. `fitsLcRange` 는 `number | undefined` 를 받는 타입 가드다(키 부재 · 범위 밖 → 폴백 0). 미등록 폼(12,870원)은 「84만 / 65주」 를 보이고, 첫 등록 cfg 에 84 · 65 를 싣는다.

## Task Commits

1. **Task 1: 등록 차단 D-03 · D-04**
   - RED `00ec7d42` (test)
   - GREEN `8d467c99` (feat)
2. **Task 2: 두 줄 행 · 파생 행 · 시트 · 인라인 연결**
   - RED `b64df6a6` (test)
   - GREEN `789dd128` (feat)
3. **Task 3: 84 후매수 최소 시딩 · webapp 전체 회귀** — `5ff8e242` (feat)

## TDD Gate Compliance

- **Task 1 RED:** `pnpm exec vitest run src/components/trading/__tests__/limit-chaser-form.test.tsx -t "8 — 취소:체결 켬" --reporter=tap-flat --maxWorkers=2` → exit 1 · expected 0 · actual 1(cfg 전송). `gsd-tools check tdd-red-evidence` → **RED_EVIDENCE_OK** (`target_test_failed`).
  - semanticAssessment: 대상 테스트가 실행됐고 「전송 0」 단언에서 실패했다. 취소:체결 ∧ 매도 체결 환산 0주 차단이 없어 cfg 가 나간 것이 원인이다. 같은 describe 12건 가운데 11건이 계획한 단언(문장 부재 · 전송 발생 · 패널 문장)에서 실패했고, 회귀 가드 1건(「1 아님」)은 통과했다. 첫 시도에서는 패널 테스트를 대상으로 골랐는데, 다줄 diff YAML 이 Malformed TAP(`invalid_record`)로 분류됐다. 그래서 스칼라 단언 대상으로 다시 돌렸다(31-04 와 같은 우회).
- **Task 1 GREEN:** `8d467c99` — `-t "P31 등록 차단"` 12 passed · trading 1780 passed.
- **Task 2 RED:** `-t "인라인 — 편집 중 아래 줄이 버퍼로" --reporter=tap-flat` → exit 1 · expected 「777주」 · actual null → **RED_EVIDENCE_OK**.
  - semanticAssessment: 대상 테스트가 실행됐고 아래 줄 글자 단언에서 실패했다. 인라인 편집기에 `subOf` 가 연결되지 않은 것이 원인이다. lc-fields P31 19건은 미구현 export 때문에 `TypeError: not a function` 으로, 폼 P31 9건은 아래 줄 · 역산 · 안내 · 잠금 단언에서 실패했다. 금액 3칸 회귀 가드 1건은 통과했다.
- **Task 2 GREEN:** `789dd128` — `-t "P31"`(두 파일) 56 passed · trading 1809 passed.
- **REFACTOR:** 별도 커밋은 없다. 파생 행 배선을 `qtyDerivedRowProps` 로 묶은 정리는 GREEN 커밋에 포함했다.
- RED 증거 JSON 은 분류기 실행용 임시 파일이라 커밋하지 않았다(31-01~05 와 같다).

## Files Created/Modified

- `webapp/src/components/trading/limit-chaser-form.tsx` — ARM_BLOCKED_TEXT 7문장 · NUM · zeroQtySuffixOf · buy/sellNeedsWatchPrice · buyPriceReasonOf · 매도 게이트 문장 · armBlockOf 순서표 · amountLockTextOf · validateCommit · displayOf sub · inline subOf · 시트 hint · qtyDerivedRowProps
- `webapp/src/components/trading/lc/lc-fields.ts` — lcQtyAmountFieldOf · lcQtyRowSubOf · lcAmountHintOf · LcDerivedRowText · lcDerivedRowTextOf · lcRowA11yNameOf(subText)
- `webapp/src/lib/limit-chaser.ts` — UserSettingsSeed 9칸 · 시딩 표 한 줄 · fitsLcRange 타입 가드 · JSDoc 표
- `webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx` — P31 등록 차단 12 · P31 두 줄 · 시트 · 인라인 10 · 84 D-12 1 · 기존 단언 갱신(56/44 높이 · 기준선 · 발동잔량 역산 · 접근성 이름 · 0만 의미어) · 기본 에코 취소 기준선
- `webapp/src/components/trading/lc/__tests__/lc-fields.test.ts` — P31 두 줄 문자열 19
- `webapp/src/lib/__tests__/limit-chaser.test.ts` — P31 84 후매수 최소 3 · 기존 84 시딩 기대값 9칸
- `webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx` — R3-WR-01 에코 취소 기준선(목록 밖)
- `webapp/src/components/trading/__tests__/card-body.test.tsx` — 두 줄 접근성 이름 한 곳(목록 밖)

## Decisions Made

- 패널과 전송 직전이 같은 문장을 말하도록 `buyPriceReasonOf` 의 비교가 0 금액 판정을 주문가격 0 판정 앞에 뒀다(UI-SPEC 표 1 이 3 보다 먼저다).
- 매도 게이트 문장에 매도 비교가 0 갈래를 더했다(플랜 action 3 의 보완). 이 갈래가 없으면 열 아래 패널이 비교가 0 인 매도에 「매도 매수잔량이 0 이에요 … (1,500만 → 0주)」 라는 틀린 접미를 말한다. 전송 직전은 표 2 가 먼저 잡으므로 바뀌지 않는다.
- 파생 행 해제선은 `DerivedRow` 를 고치지 않고 `mutedValue` + `unit`(만/주)으로 그린다. 31-02 부품 계약은 그대로 두었다.
- 잔량추적 기준선 파생 행의 0 도 「—」(sr 「없음」)로 맞췄다. UI-SPEC 파생 행 표가 두 행 공통이기 때문이다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 테스트 에코의 취소 잔량추적 기준선 0 → 서버 리셋값(cfg 주)**
- **Found during:** Task 1 GREEN(trading 회귀)
- **Issue:** ⑲ · GC-WR-04 · R3-WR-01 의 「6체크 켬」 에코에는 `cancelQtyTrackEnabled: true` 인데 기준선이 0 이었다. 그래서 C# 동형 표 7(취소 잔량 환산 0주 — 추적 ON 은 기준선이 제출 주)이 다음 제출을 막았다. 서버는 Set(재제출) 때 기준선을 cfg 주로 리셋하므로(Q4) 실제로 오지 않는 에코다.
- **Fix:** limit-chaser-form.test 의 기본 에코 `cancelQtyTrackBaseline` 를 `qtyFromAmount(1_000, 130_000)` 으로 바꿨다. strategy-card-flow R3-WR-01 의 `answered` 에코에는 `cancelQtyTrackBaseline: before.cancelWatchQty` 를 넣었다(목록 밖 한 곳).
- **Files modified:** limit-chaser-form.test.tsx · strategy-card-flow.test.tsx
- **Verification:** trading 1780 passed
- **Committed in:** `8d467c99`

**2. [Rule 1 - Bug] 31-04 과도 상태 단언과 목록 밖 접근성 이름을 두 줄 계약으로 갱신**
- **Found during:** Task 2 GREEN
- **Issue:** 31-04 가 남긴 과도 상태 단언 셋이 이번 계약과 맞지 않게 됐다. 「모든 행 44px」, 「0만」 행 접근성 이름에 의미어 없음, 발동잔량 · 기준선 주 원값 표시다. card-body 의 버튼 이름 「선매수 매도잔량 130,000만」 도 새 아래 줄을 반영하지 않았다.
- **Fix:** 높이는 56(수량 8 · 파생 2)과 44(나머지 22)로 나눴고, 편집 중 수량 행도 56 으로 맞췄다. 접근성 이름에는 아래 줄을, 발동잔량 · 해제선 · 기준선에는 역산 만원 위 줄 + 주 아래 줄을 넣었다. card-body 버튼 이름은 「… 130,000만 10,000주」 로 바꿨다(목록 밖 한 곳).
- **Files modified:** limit-chaser-form.test.tsx · card-body.test.tsx
- **Verification:** trading 1809 passed
- **Committed in:** `789dd128`

---

**Total deviations:** 2 auto-fixed (둘 다 테스트 동기화 · Rule 1)
**Impact on plan:** 제품 코드 범위 확장은 없다. 목록 밖 파일은 테스트 2개(각 한 곳)뿐이다. 31-02 부품(`setting-group.tsx` · `inline-value-editor.tsx` · `number-pad-sheet.tsx`)은 건드리지 않았다.

## Issues Encountered

- RED 분류기가 다줄 YAML diff(배열 toEqual)를 Malformed TAP 로 거부했다. 스칼라 단언 대상으로 다시 돌려 해결했다(31-01 · 31-04 와 같은 우회).
- `src/lib/__tests__/limit-chaser.test.ts:8` 에 `qtyForSubmit` 미사용 import 경고가 있다. 이번 플랜 전부터 있던 것이고 범위 밖이라 고치지 않았다.

## Known Stubs

없음. 31-04 가 남긴 과도 상태 둘(행 아래 줄 의미어 · 84 후매수 최소 시딩)은 이 플랜에서 닫았다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 31-07(E2E)이 실브라우저 높이 단언을 56/44 로 나누고(P20-3 · P24-7), 최악값 「999,999,999만」 · 「2,147,483,647주」 와 시트 상태 줄 · 등록 차단 긴 문장 줄바꿈을 실측하면 된다.
- 단위 테스트에는 C# 원문 7문장 · 판정 순서 · 두 줄 문자열 · 84 시딩이 잠겨 있다. 배포 · push 는 하지 않았다(지시대로).

---
*Phase: 31-limitchaser-amount-unit*
*Completed: 2026-10-11*

## Self-Check: PASSED

- 파일: limit-chaser-form.tsx · lc-fields.ts · limit-chaser.ts · 이 SUMMARY — FOUND
- 커밋: `00ec7d42` · `8d467c99` · `b64df6a6` · `789dd128` · `5ff8e242` — HEAD 조상 FOUND · RED(test) → GREEN(feat) 순서 2쌍
- 수용 기준: 「금액(만원)을 주로 환산할 수 없습니다」 2 · 「0주로 환산됩니다」 3줄 · 「만 → 0주)」 1줄 · export 3함수 각 1줄 · 「비교가격 필요 — 」 2 · 「만 → 0주 — 금액을 늘리세요」 1줄 · `sub={` · `hint={` · `qtyForSubmit(` · 시딩 표 한 줄 — 모두 PASS
- 플랜 검증: shared build · webapp typecheck · webapp 단위 전체(165 files · 3989 passed) 통과
- 요구사항 AMT-02 · AMT-03 · AMT-04 는 31-07 · 31-08 도 선언한다 — REQUIREMENTS.md Complete 표시는 마지막 선언 플랜 몫이라 이번에는 되돌렸다(31-04 와 같은 처리)
