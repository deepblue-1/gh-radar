---
phase: 44-admin-settlement
plan: 07
subsystem: ui
tags: [webapp, settlement, radix, switch, dialog, vitest, tdd]

requires:
  - phase: 44-02
    provides: shared 예수금 반영 증감(reflectEffect · appliedEffect · effectDiff · addEffects) · isSettlementMarketHours · 억 · 만 포매터 · 날짜 라벨
provides:
  - 「예수금에도 반영」 상자(⑩) — ReflectBox · reflectPreviewLines(1원 미만 경고 포함) · defaultReflectOn · REFLECT_TEXT · ReflectLine
  - 「거래 지우기」 · 「정산 취소」 확인 창(⑨) — SettleConfirm · deleteConfirmText · cancelConfirmText · CONFIRM_TEXT
  - ⑥ · ⑦ · ⑨ 공용 표시 글자 — accLabel · personName · ledgerKindLabel · ledgerFlowParts
affects: [44-09, 44-10, 44-11]

actuals:
  tokens: 7200
  tasks: 2
  commits: 4
plan_head_before: 4ed20388fd3b6f1a6e9fa343148cc364e3bcb06d
plan_head_after: b8cce407f5299667529d88b93549e7b52d5b863a

tech-stack:
  added: []
  patterns:
    - "상태 없는 표시 부품 — 켜짐 · 미리 보기 줄 · 장중 · 비행 중 · 오류를 전부 props 로 받고 호출부(44-10 · 44-11)가 쥔다"
    - "Radix Switch 프리미티브를 GroupSwitch 와 같은 기하(40×24 · thumb 20 · 히트 44)로 직접 그림 — ui/switch · GroupSwitch 미사용"
    - "TDD RED 는 대상 모듈을 `export {}` 자리표시로 커밋 — 파일 수집 실패(INVALID_RED) 없이 대상마다 「… is not a function」 으로 실패"

key-files:
  created:
    - webapp/src/components/settlement/settlement-format.ts
    - webapp/src/components/settlement/reflect-box.tsx
    - webapp/src/components/settlement/settle-confirm.tsx
    - webapp/src/components/settlement/__tests__/reflect-box.test.tsx
    - webapp/src/components/settlement/__tests__/settle-confirm.test.tsx
  modified: []

key-decisions:
  - "켜짐인데 바뀌는 계좌가 없으면 장중 줄도 숨긴다 — UI-SPEC E10 empty 「스위치 줄만」 을 목업(줄이 없어도 장중 줄을 붙임)보다 우선"
  - "ReflectBox 는 장중을 스스로 판정하지 않는다 — 호출부가 shared isSettlementMarketHours() 로 정해 marketHours 로 넘긴다(렌더 중 시계 읽기 · 하이드레이션 차이 회피)"
  - "확인 문단은 DialogDescription asChild 로 감싸 alertdialog 의 aria-describedby 가 문단 상자를 가리키게 했다"

patterns-established:
  - "⑨ 확인 창: 문단 상자 → (반영했던 것이 있을 때만) ⑩ 상자 → role alert 오류 줄 → 하단 닫기 · 확정 반반"

requirements-completed: []

coverage:
  - id: D1
    description: "「예수금에도 반영」 상자 — 미리 보기 줄 문구(옛 값 흐림 · 새 값 600 · 미설정 → …) · 1원 미만 경고 줄 · 장중 줄 · 꺼짐 문구 · 계좌 순서 · 첫 줄 mt-2 / 다음 줄 mt-1 · 스위치 접근 이름 · onToggle · disabled · aria-live"
    verification:
      - kind: unit
        ref: "webapp/src/components/settlement/__tests__/reflect-box.test.tsx (21 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "스위치 기본값 defaultReflectOn(D-11) · 흐름 글자 ledgerFlowParts(출자 · 옮김 · 수익 출금) · accLabel · personName · ledgerKindLabel"
    verification:
      - kind: unit
        ref: "webapp/src/components/settlement/__tests__/reflect-box.test.tsx#defaultReflectOn (D-11) · settlement-format"
        status: pass
    human_judgment: false
  - id: D3
    description: "「거래 지우기」 · 「정산 취소」 확인 창 — 문단 문구 · alertdialog · × 없음 · 닫기 secondary / 확정 destructive · reflect null 이면 상자 없음 · busy 두 버튼 비활성 + aria-busy + Esc 막힘 · role alert 오류 줄 · confirmDisabled"
    verification:
      - kind: unit
        ref: "webapp/src/components/settlement/__tests__/settle-confirm.test.tsx (14 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "(UI E9 long-text · E10 overflow) 정산 취소 문단 · 미리 보기 최악값 줄(「교보 김현중 예수금 10억 6,500만 → 10억 2,450만」)이 sm:max-w-sm · 폰 360 시트(328)에서 줄바꿈만 하고 잘리지 않으며 스위치가 줄 밖으로 밀리지 않는다 · 다크 면에서 문단 상자 · ⑩ 상자가 보인다"
    verification: []
    human_judgment: true
    rationale: "시각 배치 · 줄바꿈 · 다크 면 대비는 jsdom 이 그리지 않는다 — 부품을 끼우는 44-10 · 44-11 이후 UAT 에서 폰 360 · 데스크톱으로 확인"

duration: 5min
completed: 2026-11-20
status: complete
---

# Phase 44 Plan 07: 「예수금에도 반영」 상자 · 지우기 · 정산 취소 확인 창 Summary

**Radix 스위치(40×24 · 히트 44)와 계좌별 「KB 정근형 예수금 8억 4,500만 → 7억 4,500만」 미리 보기 · 1원 미만 경고 · 장중 줄을 가진 ⑩ 상자, 그리고 그 상자를 반영했던 경우에만 품는 alertdialog 확인 창(⑨ — 비행 중 닫힘 막기 · 오류 줄)을 상태 없는 부품으로 세우고 테스트 35건으로 잠갔다.**

## Performance

- **Duration:** 약 5분(작업 기록 기준 · 사전 읽기 제외)
- **Started:** 2026-11-20T01:24:27Z
- **Completed:** 2026-11-20T01:29:29Z
- **Tasks:** 2
- **Files modified:** 5(전부 새 파일)

## Accomplishments

- ⑩ `ReflectBox` — `--muted` r12 상자 · 「예수금에도 반영」(14/600) + Radix 스위치 · 미리 보기(`aria-live="polite"`) · 1원 미만 경고 줄 · 장중 줄 · 꺼짐 문구
- `reflectPreviewLines(effect, accounts)` — 0 이 아닌 계좌만 · SETTLEMENT_ACCOUNTS 순서 · from = 그 계좌 `budgetKrw`(null 유지) · to = (from ?? 0) + 증감 · belowOne = to < 1
- ⑨ `SettleConfirm` — alertdialog · × 없음 · 다크 `--card` 보정 · 문단 상자 → (반영했던 경우만) ⑩ 상자 → 오류 줄 · 「닫기」 · 확정 반반 · 비행 중 닫힘 막기
- 공용 표시 글자 `settlement-format.ts` — 계좌 · 사람 · 종류 이름과 목업 `flowOf` 흐름 규칙

## Task Commits

1. **Task 1: 「예수금에도 반영」 상자(⑩) · 공용 표시 글자** — RED `43847ac9` (test) → GREEN `ca58f7b0` (feat)
2. **Task 2: 확인 창(⑨)** — RED `96abd401` (test) → GREEN `b8cce407` (feat)

REFACTOR 커밋 없음(정리할 것이 없었다).

## 부품 props (44-09 · 44-10 · 44-11 이 연결할 때)

**`ReflectBox({ on, onToggle, lines, marketHours, disabled? })`** — `webapp/src/components/settlement/reflect-box.tsx`

| prop | 뜻 · 만드는 곳 |
|---|---|
| `on` / `onToggle(next)` | 스위치 상태 — 호출부 state. 기본값은 아래 표 |
| `lines` | `reflectPreviewLines(effect, view.accounts)` |
| `marketHours` | 호출부가 `isSettlementMarketHours()`(shared · 평일 KST `08:00` ~ `20:00`)로 정한다. 켜짐 + 바뀌는 계좌가 있을 때만 줄이 보인다 |
| `disabled` | 보내는 중 — 스위치 잠금 |

**증감(`effect`) 계산 위치 — 호출부가 shared 로 만든다:**

| 자리 | effect | 스위치 기본값 |
|---|---|---|
| ⑦ 새 거래(44-10) | `reflectEffect(draft)` | `defaultReflectOn(draft.txDate, 오늘 KST)` · 날짜를 바꿀 때마다 다시 적용 |
| ⑦ 고치기(44-10) | `effectDiff(appliedEffect(old), reflectEffect(draft))` | 옛 줄 `reflect` 가 true 면 켜짐, 아니면 날짜 규칙(D-23) |
| ⑧ 정산(44-11) | `addEffects(plan.outs.map((o) => reflectEffect({ kind: 'withdraw_profit', fromAcc: o.fromAcc, toAcc: null, amountKrw: o.amountKrw })))` | 켜짐(D-15) · 바로 출금을 하나라도 골랐을 때만 상자 |
| ⑨ 지우기(44-10) | `effectDiff(appliedEffect(row), {})` | 켜짐 · `appliedEffect(row)` 가 비면 `reflect={null}`(상자 없음) |
| ⑨ 정산 취소(44-11) | `effectDiff(addEffects(그 정산의 바로 출금 줄들.map(appliedEffect)), {})` | 켜짐 · 합이 비면 `reflect={null}` |

**`SettleConfirm({ open, title, body, confirmLabel, reflect, busy, error, confirmDisabled?, onClose, onConfirm })`** — `webapp/src/components/settlement/settle-confirm.tsx`

- `body` = `deleteConfirmText(row, view.now)` 또는 `cancelConfirmText(settle, outCount, view.now)`
- `title` · `confirmLabel` = `CONFIRM_TEXT.deleteTitle` · `CONFIRM_TEXT.delete` / `CONFIRM_TEXT.cancelTitle` · `CONFIRM_TEXT.cancel`
- `error` = 완성 문장 — `${CONFIRM_TEXT.deleteFailed} · ${message}` / `${CONFIRM_TEXT.cancelFailed} · ${message}`(「플랜 단계 보강」 의 되돌릴 수 없음 · 되돌리기 실패 문장도 이 자리에 그대로 넣는다)
- `confirmDisabled` = 지운 · 취소한 뒤 되돌리기만 실패해 확정을 잠글 때(44-10)
- `onOpenChange` 는 `!busy` 일 때만 `onClose` — 성공 뒤 닫기 · 목록 다시 불러오기는 호출부 몫

## 문구 확인표

| 자리 | 화면 문구 | 테스트 |
|---|---|---|
| ⑩ 스위치 | 「예수금에도 반영」(접근 이름 같음) | reflect-box 「스위치 — 접근 이름 …」 |
| ⑩ 켜짐 줄 | 「KB 정근형 예수금 8억 4,500만 → 7억 4,500만」(새 값 `<b>` 600) | 「켜짐 — 미리 보기 줄 …」 |
| ⑩ 미설정 | 「교보 정근형 예수금 미설정 → 2,000만」 | 「미설정이던 계좌 …」 |
| ⑩ 1원 미만 | 「KB 정근형 예수금 5,000만 → 0 이하라 보내지 않아요」(warn) | 「1원 미만 — 경고 색 …」 |
| ⑩ 꺼짐 | 「예수금은 그대로 둬요」 | 「꺼짐 — …」 |
| ⑩ 장중 | 「체결과 겹치면 어긋날 수 있어요」(warn) | 「켜짐 + 장중 …」 |
| ⑨ 지우기 | 「9/13 · KB 정근형 → 교보 김현중 · 계좌 옮김 **4억**」 / 「이 거래를 지워요. 넣은 돈 · 몫 계산에서 빠져요.」 | settle-confirm deleteConfirmText |
| ⑨ 정산 취소 | 「11/19 현중 · 근형 정산 **+10억 4,900만** 을 취소해요. 이 수익은 「정산 전 수익」 으로 돌아가요. 그날 「바로 출금」 2건도 함께 사라져요.」 | cancelConfirmText |
| ⑨ 버튼 | 「닫기」 · 「지우기」 / 「정산 취소」 | SettleConfirm |
| ⑨ 실패 | 「지우지 못했어요 · <message>」 / 「정산을 취소하지 못했어요 · <message>」 | error · CONFIRM_TEXT |

## Files Created/Modified

- `webapp/src/components/settlement/settlement-format.ts` — accLabel · personName · ledgerKindLabel · ledgerFlowParts
- `webapp/src/components/settlement/reflect-box.tsx` — REFLECT_TEXT · ReflectLine · reflectPreviewLines · defaultReflectOn · ReflectBox
- `webapp/src/components/settlement/settle-confirm.tsx` — CONFIRM_TEXT · deleteConfirmText · cancelConfirmText · SettleConfirm
- `webapp/src/components/settlement/__tests__/reflect-box.test.tsx` — 21건
- `webapp/src/components/settlement/__tests__/settle-confirm.test.tsx` — 14건

## Decisions Made

- 켜짐인데 바뀌는 계좌가 없으면 장중 줄도 숨긴다. 목업 `pvHtml` 은 줄이 없어도 장중 줄을 붙이지만, UI-SPEC E10 empty 가 「미리 보기 줄 없이 스위치 줄만」 이라 그쪽을 따랐다(보낼 것이 없으면 체결과 겹칠 일도 없다). 테스트로 잠갔다.
- 장중 판정은 상자 밖에서 — `marketHours` 를 필수 prop 으로 두고 호출부가 `isSettlementMarketHours()` 로 정한다(렌더 중 시계를 읽지 않는다).
- 확인 문단은 `DialogDescription asChild` 로 감싸 alertdialog 설명(`aria-describedby`)이 문단 상자를 가리킨다 — Radix 의 설명 누락 경고도 없다.
- 하단 버튼은 `DialogFooter className="flex-row"` + 두 버튼 `flex-1 h-11` — 폰에서도 「닫기」 · 확정이 반반으로 나란히 선다(기본 `flex-col-reverse` 덮어씀).

## Deviations from Plan

None - plan executed exactly as written. (위 「장중 줄 숨김」 은 플랜 must_haves 의 E10 empty 행을 문자 그대로 따른 해석이라 이탈로 세지 않았다.)

## TDD Gate Compliance

- Task 1: `test(44-07)` `43847ac9` → `feat(44-07)` `ca58f7b0`. RED 증거 `RED_EVIDENCE_OK`(tap-flat · 21건 모두 실패). 대상 「reflectPreviewLines > 한 계좌 감소 — 옛 값 · 새 값 · belowOne false」 가 `TypeError: reflectPreviewLines is not a function` 으로 실패. 의미 판정: 대상 두 파일을 `export {}` 자리표시로 함께 커밋해 import 는 풀리고, 대상이 실제로 실행되어 계획한 「함수 없음」 으로 떨어졌다 — 수집 · import · 문법 · 픽스처 오류 없음. 첫 실행에서 describe 본문의 픽스처 호출이 파일 수집을 통째로 깨뜨려(1건 · 파일 단위 실패) 픽스처를 테스트 안 함수로 옮긴 뒤 다시 기록했다.
- Task 2: `test(44-07)` `96abd401` → `feat(44-07)` `b8cce407`. RED 증거 `RED_EVIDENCE_OK`(14건 모두 실패). 대상 「cancelConfirmText > 바로 출금 2건 — 세 문장」 이 `cancelConfirmText is not a function` 으로 실패. 나머지는 `deleteConfirmText` 없음 · `CONFIRM_TEXT` undefined. 의미 판정 같음.
- RED 증거 기록은 저장소 밖(무시되는 `node_modules/.gsd-red/`)에 두고 커밋하지 않았다(44-02 와 같음).

## Issues Encountered

- 플랜이 1원 판정을 「server `planReflect` 와 같다」 고 적었지만 server 쪽은 같은 웨이브의 44-05 가 만들어 이 worktree 에 없다 — 이 부품은 shared/CONTEXT 정의(새 예수금 < 1 이면 보내지 않음)대로 `toKrw < 1` 로 했다. 44-13 통합 때 server 판정과 같은지 한 번 대조하면 된다.

## 검증

- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/components/settlement/__tests__/reflect-box.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck` → 21 통과 · typecheck 오류 0 → REFLECT-BOX-OK
- `… vitest run settle-confirm.test.tsx reflect-box.test.tsx --maxWorkers=2 && … typecheck` → 35 통과 → CONFIRM-OK
- settlement 폴더 전체 `vitest run src/components/settlement --maxWorkers=2` → 3 파일 · 41 통과 · 실패 0(기존 settlement-client 6건 포함)
- 수용 기준 grep 전부 통과(문구 3 · marketHours · aria-live · ui/switch 0 · export 4 · alertdialog · dark 보정 · 실패 문구 2)

## UAT 로 넘기는 시각 확인(backstop)

- E9 long-text — 정산 취소 문단 + 미리 보기 두 줄이 `sm:max-w-sm` · 폰 360 에서 줄바꿈만 하고 잘리지 않는지
- E10 overflow — 최악값 「교보 김현중 예수금 10억 6,500만 → 10억 2,450만」 이 폰 바텀시트(328) · 확인 창에서 줄바꿈만 하고 스위치가 밀리지 않는지
- 다크 테마에서 확인 창 면(`--card`) 위 문단 상자 · ⑩ 상자(`--muted`)가 구분되는지 · 터치 기기에서 열 때 포커스 링이 뜨지 않는지

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 44-10(거래 시트 · 지우기) · 44-11(정산 시트 · 취소)이 위 표대로 증감을 만들어 끼우면 된다. `settlement-client.tsx` 는 고치지 않았다(44-06 몫).

---
*Phase: 44-admin-settlement*
*Completed: 2026-11-20*
