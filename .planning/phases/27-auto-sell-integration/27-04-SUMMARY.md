---
phase: 27-auto-sell-integration
plan: 04
subsystem: webapp (상따 카드 자동매도 그룹)
tags: [react, limit-chaser, container-query, radix-dialog, playwright, tdd]
status: complete

requires:
  - phase: 27-01
    provides: "RelayLimitChaser 자동매도 8필드 · LimitChaserFormValues 요청 4필드 · isDeleteIntent/isActiveStrategy 여섯 항 · relay schema 4 파생"
  - phase: 27-03
    provides: "shared AUTO_SELL_STATE_LABELS · AUTO_SELL_METHOD_LABELS · AUTO_SELL_METHOD_ORDER [3,1,2] · autoSellBasisLabel"
provides:
  - "LC_SELL_GROUPS 세 번째 카드 slot 'auto-sell'(접이식 · 자기 게이트/흐림 게이트 autoSellEnabled · 매도주문과 독립)"
  - "LcRowSpec 'choice' 3택 행 · derived 'autoSellSoldQty' · 'autoSellBasisPrice' · LcGate/LcStatusKey 자동매도"
  - "lcSummaryOf 'auto-sell' · lcRangeIssue 조건 규칙 표(CONDITIONAL_RANGE_GATE — 켠 cfg 만 비율 1~50 · 방법 1~3)"
  - "lcAutoSellMethodText · lcAutoSellSoldText · lcAutoSellBasisText(행 · 요약 공용 판정)"
  - "LC_GATE_FIELDS 에 autoSellEnabled(자동매도만 켠 등록 = 등록 · 끄기 = isDisarm)"
  - "cardGroupStatusOf().autoSell(1~4 낱말 · 0/범위 밖 빈 문자열) · groupStatusClassOf 자동매도 4낱말 색"
  - "ChoiceRow(export — 27-06 /me 재사용) · LcSheetShell(export — 키패드 · 3택 시트 공용 껍데기)"
  - "SettingGroup footer(펼친 본문 끝에만 — 27-05 바로시작/중지 자리) · DerivedRow display · GroupSummary hot"
  - "e2e P27-2 자동매도 카드"
affects: [27-05 바로시작/중지 footer, 27-06 /me 방법 기본값(ChoiceRow), 27-07 84 시딩(touchedRef autoSellMethod)]

actuals:
  tokens: 32000     # chars/4 over git diff f55d0f89..HEAD (128,058 chars)
  tasks: 2
  commits: 2        # MEASURED rev-list f55d0f89..HEAD
plan_head_before: f55d0f897e56c986e28d1d6c6004ce32e6872fb3

tech-stack:
  added: []
  patterns:
    - "폭이 모자라는 인라인 컨트롤은 두 갈래를 모두 마운트하고 기존 경계(992) 컨테이너 쿼리로 하나만 보인다 — 실패 말풍선은 두 갈래를 감싼 상자에 앵커"
    - "조건부 범위는 표 하나(CONDITIONAL_RANGE_GATE: 필드 → 게이트) — 게이트 ON 이면 inputRange, OFF 면 relay UByte"
    - "바텀시트 껍데기 단일화(LcSheetShell) — 키패드 · 3택이 같은 포커스 복귀 · 폭 · 등장 규칙"

key-files:
  created: []
  modified:
    - webapp/src/components/trading/lc/lc-fields.ts
    - webapp/src/components/trading/lc/use-lc-field-commit.ts
    - webapp/src/components/trading/card/card-body.tsx
    - webapp/src/components/trading/lc/setting-group.tsx
    - webapp/src/components/trading/lc/number-pad-sheet.tsx
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/lc/__tests__/lc-fields.test.ts
    - webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
    - webapp/src/components/trading/__tests__/card-body.test.tsx
    - webapp/src/components/trading/lc/__tests__/setting-group.test.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts
    - webapp/e2e/specs/a11y.spec.ts

key-decisions:
  - "choice 행 폰/데스크톱 판정 출처 = lib/use-edit-mode.ts useEditMode()(값 행 시트/인라인과 같은 판정 · 새 미디어 질의 0). 단 마우스 기기도 카드 992 미만이면 「라벨 ─ 값 ›」 행 + 시트 — 「라벨 + 세그먼트」(≈235px)가 685~991 밴드 옵션 열 행(≈185~210px)에 들어가지 않는다(P24-7 685 2열 +20px 넘침 실측 · 992 여유 9.9px)"
  - "자동매도 누적 · 기준 읽기 전용 행은 게이트 OFF 여도 흐리지 않는다(목업 .lrow.ro — 중지 뒤에도 누적은 서버 사실)"
  - "세그먼트 화살표는 포커스만 옮긴다 — 선택이 곧 lc.set 이라 화살표마다 전송이 나가지 않게 Enter/Space(클릭)로만 고른다"
  - "자동매도 스위치 disabled 판정은 매수취소와 같은 규칙(세션 미준비 · 구서버 켜는 방향) — 시세 정적 무장 판정 대상 아님 · 범위는 전송 직전 lcRangeIssue"
  - "시트 「감시 중 — 적용하면 바로 반영돼요」 안내는 자동매도도 게이트 에코(autoSellEnabled) 기준 — 칩 낱말은 「감시 중」 으로 시작하지 않는다"

patterns-established:
  - "3택 행 ChoiceRow: 값 = 서버 값(낙관 없음) · onSelect 는 다른 옵션일 때만 · 폰 시트는 고르면 닫힘 + 연 행 포커스 복귀"

requirements-completed: []

coverage:
  - id: D1
    description: "자동매도 그룹 스펙 — 매도 pane 세 번째 · 행 순서 · choice 옵션 3·1·2 · 시작조건 0 의미어 · 요약 5조각(누적 hot · 「—」 off) · 조건 범위 · 흐림"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/lc-fields.test.ts#Phase 27 자동매도 그룹 — 스펙 · 의미어 · 요약 · 조건 범위"
        status: pass
    human_judgment: false
  - id: D2
    description: "등록 게이트 · 범위 가드 — 미등록 자동매도 스위치 = crud C 등록 · 옛 에코 비율 0 켜기 = 전송 0(invalid) · 끄기는 범위 밖이어도 전송"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx#Phase 27 자동매도 그룹 — 등록 게이트 · 조건 범위"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P27-2 ⑧ 범위 가드"
        status: pass
    human_judgment: false
  - id: D3
    description: "제목줄 상태 칩 — 1 대기 · 2 감시 · 3 매도중 · 4 완료(대기·완료 주황 · 감시·매도중 초록) · 0/범위 밖/킬 스위치 에코 칩 없음"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/card-body.test.tsx#Phase 27 자동매도 그룹 — 제목줄 상태 낱말"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P27-2 ③ ⑤"
        status: pass
    human_judgment: false
  - id: D4
    description: "카드 렌더 — 데스크톱 세그먼트(radiogroup) · 폰 3옵션 시트 · 누적/기준 행 · 접힘 요약 · footer 자리 · 낙관 반영 없음"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/setting-group.test.tsx#Phase 27 자동매도 — ChoiceRow · DerivedRow 표시 · 요약 hot · footer · 칩 색"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#Phase 27 자동매도 카드 — 3택 행 · 누적/기준 · 칩 · 접힘 · 흐림"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P27-2 자동매도 카드"
        status: pass
    human_judgment: false
  - id: D5
    description: "폭 최악값 — 본문 344 · 685 · 830 · 992 에서 자동매도 카드 넘침 · 잘림 · 말줄임 0 · 행 44"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts#P24-7 폭 최악값"
        status: pass
    human_judgment: false
  - id: D6
    description: "다크/라이트에서 세그먼트 · 칩 · 누적 빨강 시각 결(목업 대비)"
    verification: []
    human_judgment: true
    rationale: "색 결 · 목업 동형 여부는 사람 눈 판정 — 실행 중 스크린샷 4장으로 결함 없음을 확인했지만 테스트가 단언하지 않는다"

duration: 30min
completed: 2026-10-05
---

# Phase 27 Plan 04: 상따 카드 자동매도 그룹 Summary

**매도 pane 세 번째 접이식 카드 「자동매도」 — 시작조건(0 = 「이탈 후 다음 체결」) · 비율 · 방법 3택(데스크톱 세그먼트 · 폰/좁은 카드 시트) · 읽기 전용 누적/기준 · 서버 에코 상태 칩(주황/초록), 켜는 확정은 범위 밖이면 relay 에 닿기 전에 막힌다**

## Performance

- **Duration:** 30 min
- **Started:** 2026-10-05T05:56:29Z
- **Completed:** 2026-10-05T06:26:29Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments

- `lc-fields.ts` 자동매도 그룹 스펙 — 새 `LcRowSpec` `'choice'`(옵션 = shared `AUTO_SELL_METHOD_ORDER` × 낱말) · derived 누적/기준 · 요약 · `CONDITIONAL_RANGE_GATE` 조건 범위(Pitfall 5 · 9-2)
- `LC_GATE_FIELDS` 에 `autoSellEnabled` — 미등록 폼에서 자동매도 스위치 = 등록(crud C), 끄기는 무장 해제 경로
- `cardGroupStatusOf().autoSell` + `groupStatusClassOf` 정확 일치 4낱말(D-03 개정 색)
- `ChoiceRow`(export) · `LcSheetShell`(export) · `SettingGroup footer` · `DerivedRow display` · `GroupSummary hot`
- e2e P27-2 — 펼침 · 스위치 등록(schema 4) · 세그먼트 「매수1호가」 → method 2 · 칩 대기→감시 · 기준 「상한가 13,000원」 · 요약 5조각 · 폰 시트 3옵션 · 범위 가드(전송 0 + 「비율 · …」)

## Task Commits

1. **Task 1: 자동매도 그룹 스펙 · choice 행 · derived 2행 · 요약 · 조건 범위 · 등록 게이트 · 상태 낱말** — `3a467ab2` (feat)
2. **Task 2: 자동매도 카드 렌더 — ChoiceRow · 누적/기준 행 · 칩 · footer 자리 · 폼 배선 + e2e P27-2** — `4fdf4a83` (feat)

TDD: 두 태스크 모두 Phase 27 describe 를 먼저 써서 RED(Task 1 20건 실패 확인) → GREEN. 테스트와 구현은 태스크 커밋 하나에 함께 들어갔다(plan 의 커밋 2개 계약).

## Files Created/Modified

- `webapp/src/components/trading/lc/lc-fields.ts` — 자동매도 그룹 · choice 행 · 의미어 · 요약 · 조건 범위 · 판정 헬퍼 3개
- `webapp/src/components/trading/lc/use-lc-field-commit.ts` — `LC_GATE_FIELDS` + `autoSellEnabled`
- `webapp/src/components/trading/card/card-body.tsx` — `CardGroupStatus.autoSell`
- `webapp/src/components/trading/lc/setting-group.tsx` — `ChoiceRow` · footer · hot · display · 칩 색
- `webapp/src/components/trading/lc/number-pad-sheet.tsx` — `LcSheetShell` 추출(동작 불변)
- `webapp/src/components/trading/limit-chaser-form.tsx` — choice/derived 배선 · 자동매도 접기 · gateDisabled · touched 확장 · 시트 감시 안내
- 테스트 5파일 + e2e 2파일(스위치 7종 · 요약 4줄 · P24-7 자동매도 최악값 · a11y 접기 4개)

## Decisions Made

- **choice 행 폰/데스크톱 판정 출처:** `lib/use-edit-mode.ts` `useEditMode()` — 값 행의 시트/인라인과 같은 판정이다. 추가로, 마우스 기기여도 **카드 992 미만**은 세그먼트 대신 「라벨 ─ 값 ›」 행 + 시트를 쓴다(아래 시각 결함).
- 누적 · 기준 읽기 전용 행은 자동매도 OFF 여도 흐리지 않는다(목업 `.lrow.ro`).
- 세그먼트 화살표 키는 포커스만 옮긴다(선택 = 전송).
- 자동매도 스위치 disabled 는 매수취소와 같은 규칙(시세 무관).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 시각 결함] 세그먼트가 685~991 카드 밴드 옵션 열 행을 넘침**
- **Found during:** Task 2 (P24-7 실측)
- **Issue:** 「방법 + 세그먼트」 ≈235px 가 685 2열 행(≈185px)을 넘어 패널 scrollWidth +20px.
- **Fix:** 세그먼트 행은 `@min-[992px]/lc:flex`, 그 아래는 `SettingRow` 행 + 시트(`@min-[992px]/lc:hidden`). 두 갈래를 모두 마운트하고 기존 경계 992 로 하나만 보인다(새 경계 0). 실패 말풍선은 두 갈래를 감싼 상자에 앵커(숨은 갈래 앵커 = 0,0 말풍선 방지).
- **Verification:** P24-7 344 · 685 · 830 · 992 전부 통과 · 992 자동매도 방법 행 여유 9.9px(그 폭 최소 여유 행).
- **Committed in:** `4fdf4a83`

**2. [Rule 3 - Blocking] `gateDisabled` 타입 오류(자동매도 게이트가 GateKey 밖)**
- **Found during:** Task 1 typecheck
- **Fix:** `limit-chaser-form.tsx` `gateDisabled` 에서 자동매도를 매수취소와 같은 갈래로. Task 1 커밋에 폼 파일 1 hunk 포함(plan Task 1 files 밖).
- **Committed in:** `3a467ab2`

**3. [Rule 1 - 기존 단언 갱신] 세 번째 매도 카드로 깨지는 기존 단언**
- **Found during:** Task 1/2 전체 실행
- **Fix:** 단위(setting-group ① ② · limit-chaser-form ⑦ ⑮) · e2e(작업대 3 스위치 7종 · P24-2 요약 4줄 · P24-7 FOLD_SLOTS/요약 개수/숨은 pane 접기 건너뛰기 · a11y 접기 4개/숨은 접기 건너뛰기).
- **Committed in:** `3a467ab2` · `4fdf4a83`

**4. [Rule 1 - 시각 결함] 확정 강조가 「방법」 라벨을 파랗게 칠함**
- **Found during:** Task 2 스크린샷 확인
- **Fix:** 900ms 강조를 선택된 세그먼트 글자로 옮김(값 행의 값 글자와 같은 자리).
- **Committed in:** `4fdf4a83`

---

**Total deviations:** 4 auto-fixed (시각 결함 2 · 블로킹 1 · 기존 단언 1)
**Impact on plan:** 모두 정확성 · 화면 잘림 방지. 스코프 확장 없음.

## Issues Encountered

- e2e P24-7 의 `summaryLines` 주석이 폰 밴드에서 매도 pane 측정으로 덮였다 — 이어 붙이도록 고침(측정 기록만, 단언 무관).

## Known Stubs

- `SettingGroup footer` 는 자동매도 카드에서 아직 비어 있다 — 바로시작 · 중지 버튼은 27-05 가 채운다(plan 명시 · 화면에 자리표시 글자 없음).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 27-05: `renderGroup` 에서 auto-sell 카드에 `footer` 를 넘기면 펼친 본문 끝에만 선다. 칩 pend 문구(「바로시작 전송…」)는 `groupStatus.autoSell` 덮기로.
- 27-06: `ChoiceRow` 를 `/me` 「방법 기본값」 에 그대로 쓴다(`a11yName` · `sheetTitle` · `description` props).
- 27-07: `touchedRef` 가 `autoSellMethod` 를 담는다 — 84 시딩의 「손대지 않은 칸만」 판정에 쓴다.

## Verification

- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck` — 0
- webapp 단위 전체 — 140 파일 · 3254 통과
- `playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/a11y.spec.ts` — 83 통과(P27-1 · P27-2 포함)

---
*Phase: 27-auto-sell-integration*
*Completed: 2026-10-05*

## Self-Check: PASSED
