---
phase: 36-account-budget
plan: 06
subsystem: webapp
tags: [react, trading, manual-order, limit-chaser, account-budget, container-query]

requires:
  - phase: 36-01
    provides: "shared availableKrwOf · formatManwonFloor · RelayAccountState.budgetKrw(66/67 마지막 값)"
  - phase: 36-10
    provides: "shared lcBuyAmountSumKrw(선매수 늘 · 줄매수/후매수 켜짐 = Enabled ∨ Auto)"
provides:
  - "webapp/src/lib/use-available-krw.ts — useAvailableKrw(accountNo): number | null · holdingQuotePrice(KRX → NXT · 작업대에서 옮김, 작업대는 재수출)"
  - "수동주문 폼 「주문가능」 행 data-slot=mo-available(값 mo-available-value) · 초과 검증 줄 data-testid=manual-order-budget-over"
  - "상따 카드 합산 경고 줄 data-slot=lc-budget-over · 선매수 「금액」 값 tone(data-tone=over)"
  - "setting-group SettingRow/ValueWithChevron valueTone?: 'over' prop"
affects: [36-08, 36-09]

actuals:
  tokens: 9944
  tasks: 2
  commits: 3
plan_head_before: 760a665fe0ebfb956e20219ed79346393cac1e13
plan_head_after: f00e8c0ba813a3cf5aae7350eeb8197e073b829c

tech-stack:
  added: []
  patterns:
    - "주문 표면의 주문가능은 useAvailableKrw 한 훅 — relay accountStates · quotes 렌더 계산(1초 타이머 없음)"
    - "시장가 매수 미체결 현재가 규칙(KRX → NXT)은 holdingQuotePrice 한 벌 — 잔고 평가와 주문가능이 공유"
    - "주문가능 경고는 비차단 표시층 — 버튼 disabled · 제출 · canArm · 사유 목록은 읽지 않는다"

key-files:
  created:
    - webapp/src/lib/use-available-krw.ts
    - webapp/src/lib/__tests__/use-available-krw.test.ts
  modified:
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/components/trading/card/manual-order-form.tsx
    - webapp/src/components/trading/__tests__/manual-order-form.test.tsx
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/lc/setting-group.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx

key-decisions:
  - "수동 폼 매도 판정 제외는 선택 차단 행을 거른 selected?.side 로 본다(플랜 표기 selectedUnfilled) — 선택 차단 행은 「선택 없음」 과 같다는 폼 기존 규칙과 같은 축"
  - "상따 합의 선매수 금액은 shownValueOf('buyOrderAmount') — 서버가 선매수 금액을 모르는 레거시 에코(「—」)면 0 으로 센다(화면에 보이는 값 기준 · 클라 기본값 10만으로 경고하지 않음)"
  - "valueTone over 는 flash(확정 강조)보다 우선 — 경고가 900ms 강조에 가리지 않게"

patterns-established:
  - "값 행 톤 prop(valueTone)은 미지정이면 DOM · 클래스 불변 — data-tone 도 undefined 라 속성이 생기지 않는다"

requirements-completed: []

coverage:
  - id: D1
    description: "useAvailableKrw — relay 계좌 상태 + 시세로 availableKrwOf · 시장가 매수 미체결 현재가(KRX → NXT · 없으면 0) · 미설정/미수신/계좌 \"\" null · 시세 변경 재계산"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/use-available-krw.test.ts (8 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "수동주문 「주문가능」 행 + 초과 검증 줄 — ①~⑨(정상 · 이하 · 초과 비차단 · 매도 미체결 제외 · 매수 미체결 판정 · 시간외종가 제외 · 미설정 · 음수 0만 · 미수신 · 재판정)"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/manual-order-form.test.tsx#P36 주문가능 (D-12) (10 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "상따 합산 경고 — 선매수 값 빨강 · 안내 줄 · 켜짐 그룹만 합산 · 미설정/0/내려옴 · 사유 패널 앞 · 사유 목록 미포함"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#P36 상따 합산 경고 (D-13) (5 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "§2.2b 밴드 사다리 회귀(E3 overflow 백스톱) — 카드 컨테이너 684/685 · 829/830 · 991/992 · 4c 폴드 · 18 폰 밴드 잘림 0"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/trading-workbench.spec.ts --grep \"카드 컨테이너|4c\\.|18\\. 폰 밴드\" (4 passed incl. setup)"
        status: pass
    human_judgment: false
  - id: D5
    description: "주문가능 행 · 경고 줄의 실제 화면 모양(빨강 600 · 경고색 · 줄바꿈)이 목업 ③ · ④ 와 같은가 · 「123,456,789만」 최악값 폰 390 실측"
    verification: []
    human_judgment: true
    rationale: "E2E 스텁 게이트웨이는 budget_krw 를 싣지 않아 행 값이 「—」 로 선다 — 최악값 · 초과 상태의 실제 렌더는 36-09 UAT 에서 확인"

duration: 8min
completed: 2026-10-27
status: complete
---

# Phase 36 Plan 06: 주문 표면 주문가능 경고 Summary

**relay 계좌 상태 + 시세 → `useAvailableKrw` → shared `availableKrwOf` 한 경로로 수동주문 폼에 「주문가능」 행과 비차단 초과 줄을, 상따 카드에 매수 금액 합산 경고(선매수 값 빨강 + 매수 열 안내 줄)를 붙였다.**

## Performance

- **Duration:** 약 8분
- **Started:** 2026-10-27T14:58:14Z
- **Completed:** 2026-10-27T15:05:34Z
- **Tasks:** 2 (tracer 1 + tdd 1)
- **Files modified:** 8

## Accomplishments

- 훅 위치: `webapp/src/lib/use-available-krw.ts` — `useAvailableKrw(accountNo)` 가 `useRelayContext()` 의 `accountStates` · `quotes` 로 렌더 계산한다. `holdingQuotePrice` 는 JSDoc 째 옮겼고 작업대는 `export { holdingQuotePrice }` 로 재수출(기존 테스트 import 경로 그대로).
- 수동주문 폼: 「주문금액」 행 바로 아래 · 「주문계좌」 위에 같은 클래스의 읽기 전용 「주문가능」 행. 초과면 값 `--destructive` 600 + 버튼 줄 바로 위 「주문가능 초과: 1,500만 > 1,234만」(role=status · aria-live=polite). 버튼 · 제출 · 토스트 무변경.
- 판정 제외 규칙: 선택 미체결이 매도 · 시간외종가 · 주문금액 0. 미설정 · 상태 미수신은 「—」(--faint) · 줄 없음. 음수는 판정과 무관하게 「0만」 빨강.
- 상따 카드: `lcBuyAmountSumKrw` 합 > 주문가능이면 선매수 「금액」 값만 `--destructive`(15/500 유지) + 매수 pane 그룹들 다음 · 「켤 수 없는 이유」 패널 앞 「주문가능 초과: 상따 합 2,000만 > 1,234만 — 등록은 그대로 돼요」(--led-latent · role 없음). `canArm` · 사유 목록 · 등록 경로 무변경.
- E2E 결과: §2.2b 사다리(4 · 4c · 18) 4 passed(setup 포함) — 44px 행 추가가 밴드 경계 · 잘림을 바꾸지 않았다.

## Task Commits

1. **Task 1 (tracer): 수동주문 주문가능 행 · 초과 검증 줄 — useAvailableKrw** - `e658c259` (feat)
2. **Task 2 RED: 상따 합산 경고 테스트** - `9422b5a0` (test)
3. **Task 2 GREEN: 상따 금액 합산 주문가능 경고** - `f00e8c0b` (feat)

## Files Created/Modified

- `webapp/src/lib/use-available-krw.ts` — `useAvailableKrw` · `holdingQuotePrice`(신규 · 옮김)
- `webapp/src/lib/__tests__/use-available-krw.test.ts` — 훅 · 순수 함수 8건(신규)
- `webapp/src/components/trading/workbench/trading-workbench.tsx` — 로컬 정의 제거 · import + 재수출 · 쓰지 않게 된 `RelayQuote` · `relayQuoteKey` import 정리
- `webapp/src/components/trading/card/manual-order-form.tsx` — 판정 · 「주문가능」 행 · 초과 줄
- `webapp/src/components/trading/__tests__/manual-order-form.test.tsx` — 모의 `accountStates` · P36 10건 · M2 위치 단언 갱신
- `webapp/src/components/trading/lc/setting-group.tsx` — `valueTone?: 'over'`(SettingRow → ValueWithChevron → valueTextClass)
- `webapp/src/components/trading/limit-chaser-form.tsx` — 합 · 판정 · 선매수 금액 행 톤 · 경고 줄
- `webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx` — 모의 `accountStates` · P36 5건

## Test Counts

- Task 1 verify: use-available-krw · manual-order-form · trading-workbench 3 파일 267 passed → ⚡ 트레이서 end-to-end 확인 후 확장
- Task 2 verify: limit-chaser-form · manual-order-form · lc/ 10 파일 822 passed
- 회귀: `src/components/trading` · `src/components/orderbook` · `src/lib` 117 파일 3,785 passed · 1 skipped
- typecheck(tsc + e2e tsconfig) exit 0 · shared build exit 0

## Decisions Made

- 매도 판정 제외는 `selected?.side`(선택 차단 행을 거른 값)로 본다 — 플랜 문구는 `selectedUnfilled?.side`. 폼은 선택 차단 행을 「선택 없음」 으로 다루므로(칩 · 정정 · 취소) 같은 축을 맞췄다.
- 상따 합의 선매수 금액은 `shownValueOf('buyOrderAmount') ?? 0` — 레거시 에코(서버가 금액을 모름 · 「—」)에서 클라 기본값으로 경고하지 않는다.
- `valueTone` over 가 flash 보다 우선.

## Deviations from Plan

### 자동 조정

**1. [Rule 1 - 기존 테스트 갱신] 주문계좌 행 M2 위치 단언**
- **Found during:** Task 1
- **Issue:** 기존 M2 가 「주문계좌 행 바로 위 = 주문금액 행」 을 단언 — 플랜이 그 사이에 「주문가능」 행을 넣으므로 계약이 바뀐다.
- **Fix:** M2 를 「버튼 위 = 주문계좌 → 그 위 = mo-available → 그 위 = 주문금액」 으로 갱신.
- **Commit:** `e658c259`

**2. [Rule 2 - 정확성] 상따 합의 레거시 금액**
- 위 결정 2 — 플랜의 `lcBuyAmountSumKrw(values)` 에 화면 표시값(레거시 null → 0) 보정만 더했다.
- **Commit:** `f00e8c0b`

### 실행 맥락 차이(코드 아님)

- 플랜 메모의 「STATE/ROADMAP 건드리지 않음」 대신 orchestrator 지시(phase 전용 worktree 순차 executor)에 따라 executor 가 갱신했다.
- 커밋 메시지에는 사용자 규칙대로 Co-Authored-By 줄을 넣지 않았다.

## Issues Encountered

- RED 1회차의 값 글자 단언이 「2,000만」 이었는데 상따 값 행 표기는 「2,000만원」(`formatSettingValue`) — 테스트 기대값만 고쳐 RED 커밋. 스위치 이름도 「선매수 켜기」 로 맞췄다.
- 시각 결함 없음(이 표면 안에서 줄바꿈 · 잘림 · 겹침을 새로 보지 못했다 — 단 초과 상태 실제 렌더는 E2E 스텁이 예수금을 싣지 않아 36-09 UAT 몫).

## Known Stubs

None.

## User Setup Required

None.

## Next Phase Readiness

- 36-08(손익 표면) · 36-09(배포 · UAT)가 이 훅을 그대로 쓸 수 있다. UAT 에서 실서버 예수금으로 ③ 초과 줄 · ④ 경고 줄 · 「123,456,789만」 폰 390 렌더를 눈으로 확인할 것.

## Self-Check: PASSED

- FOUND webapp/src/lib/use-available-krw.ts · webapp/src/lib/__tests__/use-available-krw.test.ts
- FOUND e658c259 · 9422b5a0 · f00e8c0b (HEAD 조상)
- acceptance grep 전부 통과 · 작업대 `export function holdingQuotePrice` 0개

---
*Phase: 36-account-budget*
*Completed: 2026-10-27*
