---
phase: 31-limitchaser-amount-unit
plan: 02
subsystem: ui
tags: [limit-chaser, webapp, react, two-line-row, numpad, amount-unit, tdd]
status: complete

requires:
  - phase: 31-limitchaser-amount-unit
    provides: "31-UI-SPEC S1~S4 · 상태 줄 우선순위 · 폭 백스톱 L4 · 채택 목업 변형 C · 31-01 PadUnit 「만」"
provides:
  - "setting-group.tsx — LcRowSub 타입 · RowSubLine(lc-row-sub) · ROW_BOX_TALL 56px · LABEL_TEXT_WRAP(L4) · SettingRow/CheckValueRow/DerivedRow 선택 prop sub"
  - "inline-value-editor.tsx — 선택 prop subOf(value) — 버퍼 값으로 아래 줄 실시간 재계산"
  - "number-pad-sheet.tsx — 선택 prop hint(value) — 상태 줄 ⑤ status · armedNotice 면 같은 줄 둘째 줄 「감시 중」"
affects: [31-06, 31-07]

actuals:
  tokens: 11756
  tasks: 2
  commits: 4
plan_head_before: 7c9a41f1967cd39bb16effa187282648d7d7f0ce
plan_head_after: 6cfc02a4b50ecc8727ec9dcdf220a78661525094

tech-stack:
  added: []
  patterns:
    - "두 줄 변형은 선택 prop 하나(sub · subOf · hint) — 넘기지 않으면 지금과 같은 44px 한 줄 · 종전 상태 줄(하위 호환)"
    - "아래 줄 그리기는 RowSubLine 한 곳 — 행 3종과 인라인 편집기가 같이 쓴다(판정은 호출부 lc-fields.ts)"
    - "busy 흐림은 두 줄을 감싼 블록에 한 번 · flash 는 위 줄 값 슬롯만"

key-files:
  created:
    - webapp/src/components/trading/lc/__tests__/two-line-row.test.tsx
  modified:
    - webapp/src/components/trading/lc/setting-group.tsx
    - webapp/src/components/trading/lc/inline-value-editor.tsx
    - webapp/src/components/trading/lc/number-pad-sheet.tsx
    - webapp/src/components/trading/lc/__tests__/inline-value-editor.test.tsx
    - webapp/src/components/trading/lc/__tests__/number-pad-sheet.test.tsx

key-decisions:
  - "아래 줄 슬롯은 RowSubLine 컴포넌트로 export — inline-value-editor 가 setting-group 에서 import(기존 FailureBubble 과 같은 방향이라 순환 없음)"
  - "두 줄 값 묶음은 flex-col items-end — 첫 줄 = 기존 값 슬롯 + 쉐브런(L3 그대로), 둘째 줄 = RowSubLine. 아래 줄은 빈 글자여도 min-h-4(16px) 자리 · 그때 aria-hidden"
  - "NumberPadSheet StatusLine 의 status 에 armedLine 필드를 더해 ⑤ 아래 둘째 줄로 「감시 중」 을 싣는다(기존 armed = 단독 줄 앞 점은 그대로)"
  - "InlineValueEditor 는 subOf 유무와 무관하게 바깥 세로 블록 + 입력 줄 같은 트리 — 둘째 줄만 조건부라 재마운트 없음"
  - "CheckValueRow 라벨에도 L4 변형 클래스를 걸지만 체크 버튼이 flex-none 이고 라벨이 한 낱말이라 실제로 접히지 않는다(주석으로 명시)"

patterns-established:
  - "두 줄 행 = ROW_BOX_TALL(56px) + LABEL_TEXT_WRAP + RowSubLine 세 조각 — 다른 행에 두 줄을 더할 때 같은 조각을 쓴다"

requirements-completed: [AMT-04]

coverage:
  - id: D1
    description: "두 줄 값 행 — SettingRow · CheckValueRow · DerivedRow 가 sub 를 받으면 56px 두 줄(lc-row-value 위 · lc-row-sub 아래 12/400 · 16px), 없으면 44px 한 줄 그대로"
    requirement: "AMT-04"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/two-line-row.test.tsx#P31 두 줄 행 (D-07 · UI-SPEC S1 · S2) (9 passed)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/setting-group.test.tsx (79 passed · 무수정)"
        status: pass
    human_judgment: false
  - id: D2
    description: "상태 · 톤 · 접근성 · L4 — alert 만 data-tone · --destructive, flash 위 줄만, busy 한 번, 편집 중 div 56px, 기본 이름 「{라벨} {위 줄} {아래 줄}」, 두 줄 행 라벨 break-keep · 말줄임 0"
    requirement: "AMT-04"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/two-line-row.test.tsx#flash · busy · 접근성 · editing · L4 케이스"
        status: pass
    human_judgment: false
  - id: D3
    description: "인라인 편집기 subOf — 처음 subOf(initialValue) · 입력마다 버퍼 값으로 갱신 · alert 톤 · subOf 유무로 입력 재마운트 없음"
    requirement: "AMT-04"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/inline-value-editor.test.tsx#P31 두 줄 행 편집 (3 passed)"
        status: pass
    human_judgment: false
  - id: D4
    description: "넘버패드 시트 hint — 상태 줄 ⑤ status(--muted-fg) · 입력 따라 갱신 · armedNotice 면 같은 줄 둘째 줄 「감시 중」(초록 점) · ①~④ 우선 · validate 잠금이면 적용 버튼 비활성 · hint null 이면 종전"
    requirement: "AMT-04"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/number-pad-sheet.test.tsx#P31 환산 안내 상태 줄 (5 passed)"
        status: pass
    human_judgment: false
  - id: D5
    description: "실브라우저 폭 · 높이 — 56px 실측 · 685 경계 최소 여유 · 「잔량추적 기준선」 L4 접힘 · 시트 두 줄 상태 줄에서 키패드 위치 불변"
    requirement: "AMT-04"
    verification: []
    human_judgment: true
    rationale: "jsdom 은 컨테이너 쿼리 · 실제 높이를 평가하지 않는다 — 클래스 존재만 단언했다. 실측 e2e(P20-3 · P24-7 갱신)는 호출부 연결(31-06) 뒤 31-07/31-08 몫"

duration: 6min
completed: 2026-10-11
---

# Phase 31 Plan 02: 두 줄 행 · 시트 환산 안내 줄 표시 부품 Summary

**SettingRow · CheckValueRow · DerivedRow 에 선택 prop `sub` 를 더해 56px 두 줄 행(위 「1,000만」 · 아래 「777주」/「무제한」/빨간 「비교가격 필요」)을 만들고, 인라인 편집기 `subOf`(버퍼 값 실시간 아래 줄)와 넘버패드 시트 `hint`(상태 줄 ⑤ 환산 안내 + 「감시 중」 둘째 줄)를 붙였다 — prop 을 넘기지 않으면 지금과 똑같이 그린다.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-11T14:12:16Z
- **Completed:** 2026-10-11T14:18:48Z
- **Tasks:** 2 (둘 다 TDD RED → GREEN)
- **Files modified:** 6 (신규 1)

## Accomplishments

- **두 줄 값 행(D-07 · S1 · S2)** — `LcRowSub` 타입 · `RowSubLine`(`data-slot="lc-row-sub"` 12/400 · `leading-4` · `tabular-nums` · alert 만 `data-tone="alert"` + `--destructive` · 빈 글자도 `min-h-4` 자리) · `ROW_BOX_TALL`(`ROW_BOX` 와 같은 기하 · `min-h-[56px]`). 세 행 컴포넌트가 `sub` 를 받으면 버튼 · 편집 div · 체크 행 · 파생 행 상자가 56px 다.
- **상태 규칙** — flash `--primary` 는 위 줄 값 슬롯만, busy `opacity-60` 은 두 줄을 감싼 블록에 한 번(값 슬롯에 또 걸지 않음), 쉐브런은 위 줄과 같은 줄(L3 `hidden @min-[685px]/lc:inline` 유지), 실패 링 · 흐림은 기존대로 행 상자 · 행에 한 번.
- **접근성** — 기본 이름 「{라벨} {위 줄} {아래 줄}」(빈 아래 줄은 생략) · `ariaName` 우선 · 아래 줄 별도 sr 텍스트 없음.
- **폭 백스톱 L4** — 두 줄 행 라벨만 `whitespace-normal break-keep`(`LABEL_TEXT_WRAP`), 44px 행 라벨은 `whitespace-nowrap` 그대로. 말줄임 유틸 0(`truncate|text-ellipsis` 개수 0 → 0). 머리 주석 「행 높이는 언제나 44px」 를 「44px · 두 줄 변형만 56px」 로 고쳤다.
- **인라인 편집기 `subOf`(S4)** — 바깥 세로 블록 + 입력 줄은 늘 같은 트리, 둘째 줄만 조건부라 `subOf` 를 더하거나 빼도 입력 재마운트 · 포커스 손실이 없다. 아래 줄은 저장될 값(빈 값 = 0)으로 매 입력 다시 계산한다.
- **넘버패드 시트 `hint`(D-08 · S3)** — 상태 줄 사슬 ① 잠금 → ② 반영 실패 → ③ 경고 → ④ 다른 단말 뒤에 ⑤ 환산 안내(`role=status` · `--muted-fg`). ⑤ 가 서고 `armedNotice` 면 같은 상태 줄 요소 안 둘째 줄(`data-slot="numpad-armed"` · 초록 점)에 「감시 중 — 적용하면 바로 반영돼요」. hint 없음/null 이면 종전 armed 단독 줄. 잠금이면 「{제목} 적용」 비활성(기존 `canConfirm`).

## Task Commits

1. **Task 1 (TDD): 두 줄 값 행 변형**
   - RED `78e17eef` (test) — `two-line-row.test.tsx` 9건 중 8건 실패(1건은 44px 회귀 가드라 통과)
   - GREEN `942db1e6` (feat)
2. **Task 2 (TDD): 편집기 아래 줄 · 시트 환산 안내 줄**
   - RED `684c2850` (test) — P31 8건 중 5건 실패(3건은 우선순위 · 재마운트 회귀 가드라 통과)
   - GREEN `6cfc02a4` (feat)

## TDD Gate Compliance

- **Task 1 RED:** `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/lc/__tests__/two-line-row.test.tsx -t "data-tone 없음" --reporter=tap-flat` → exit 1 · `expected [ 'flex', 'min-h-[44px]', … ] to include 'min-h-[56px]'`. `gsd-tools check tdd-red-evidence` → **RED_EVIDENCE_OK** (`target_test_failed`).
  - semanticAssessment: 대상 테스트(「sub 「777주」(muted) → 상자 56px …」)가 실행됐고 계획한 단언(56px 상자)에서 실패 — `sub` prop 미구현이 원인. import · 구문 · 픽스처 오류 아님.
- **Task 2 RED:** `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/lc/__tests__/number-pad-sheet.test.tsx -t "P31 hint \+ armedNotice" --reporter=tap-flat` → exit 1 · actual 「감시 중 — 적용하면 바로 반영돼요」 vs expected 「= 1,000주 (비교가격 12,870원)감시 중 — …」. **RED_EVIDENCE_OK** (`target_test_failed`).
  - semanticAssessment: 대상 테스트가 실행됐고 상태 줄 글자 단언에서 실패 — `hint` prop 미구현으로 종전 armed 단독 줄만 그려짐. 편집기 쪽 3건은 `lc-row-sub` 부재(null)로 실패.
- **GREEN:** `942db1e6` — two-line-row 9 · setting-group 79 통과 / `6cfc02a4` — `-t "P31"` 8 passed · 세 파일 85 통과.
- **REFACTOR:** 없음.
- RED 증거 기록 JSON 은 분류기 실행용 임시 파일이라 커밋하지 않았다(31-01 과 같음).

## Files Created/Modified

- `webapp/src/components/trading/lc/setting-group.tsx` — `LcRowSub` · `RowSubLine` · `rowNameOf` · `ROW_BOX_TALL` · `LABEL_TEXT_WRAP` · `ValueWithChevron` 두 줄 · 세 행 `sub` prop · 머리 주석 44/56 · L4 주석
- `webapp/src/components/trading/lc/inline-value-editor.tsx` — `subOf` prop · 같은 트리 세로 블록 · 머리 주석 S4 문단
- `webapp/src/components/trading/lc/number-pad-sheet.tsx` — `hint` prop · `StatusLine.armedLine` · `ArmedDot` · ⑤ 산출
- `webapp/src/components/trading/lc/__tests__/two-line-row.test.tsx` — P31 두 줄 행 9건(신규)
- `webapp/src/components/trading/lc/__tests__/inline-value-editor.test.tsx` — P31 3건
- `webapp/src/components/trading/lc/__tests__/number-pad-sheet.test.tsx` — P31 5건

## Decisions Made

- 아래 줄 그리기를 `RowSubLine` 한 컴포넌트로 export 해 행 · 편집기가 같이 쓴다(타입 · 클래스가 두 곳에 갈라지지 않게).
- 시트 상태 줄은 기존 `armed`(단독 줄 앞 점) 의미를 바꾸지 않고 `armedLine`(⑤ 아래 둘째 줄) 필드를 따로 둔다 — 플랜의 「armed 표시 구조 재사용」 을 점 컴포넌트(`ArmedDot`) 재사용으로 구현.
- CheckValueRow 라벨에 L4 클래스를 걸었지만 `flex-none` 체크 버튼 · 한 낱말 라벨이라 실효가 없다 — 원형 체크 위치 불변을 우선해 `flex-none` 은 그대로 두고 주석으로 남겼다.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- vitest `-t` 는 정규식이라 테스트 이름의 괄호 「(muted)」 가 매칭을 깨 전부 SKIP 됐다 — RED 증거 대상 선택을 괄호 없는 조각(「data-tone 없음」) · 이스케이프(`\+`)로 바꿔 재실행. 코드 변경 없음.

## Verification

- `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/lc/__tests__` — 8 files · 378 passed.
- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck` — 통과(error TS 0).
- 추가 회귀: `vitest run src/components/trading src/app` — 45 files · 1785 passed.
- 수용 기준: `lc-row-sub` 1줄 · `min-h-[56px]` 2줄 · `export type LcRowSub` 1줄 · `truncate|text-ellipsis` 0 → 0 · `subOf` 5줄 · `hint` 4줄.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 31-06 이 `lc-fields.ts` 판정 함수 결과를 `sub` · `subOf` · `hint` 로 넘기기만 하면 된다(이 플랜은 호출부를 건드리지 않았다 — 지금 화면은 불변).
- e2e 높이 단언(P24-7 · P20-3 「행이 전부 44」)은 호출부 연결 뒤 56/44 로 나눠야 한다(UI-SPEC 폭 백스톱).

## Self-Check: PASSED

- FOUND: webapp/src/components/trading/lc/__tests__/two-line-row.test.tsx · setting-group.tsx · inline-value-editor.tsx · number-pad-sheet.tsx
- FOUND commits: 78e17eef · 942db1e6 · 684c2850 · 6cfc02a4 (모두 HEAD 조상)
