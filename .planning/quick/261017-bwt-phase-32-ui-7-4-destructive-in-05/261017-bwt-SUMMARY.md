---
phase: quick-261017-bwt
plan: 01
status: complete
subsystem: webapp/trading · /me
tags: [phase-32, ui-review, spacing, destructive, a11y, account-scope]
requires: [quick-261016-udz]
provides:
  - KILL_BUTTON_TONE 공용 끄기 톤(카드 버튼 · 다이얼로그 실행 버튼)
  - 「끄기」 어휘 통일(/me 계좌 끄기 표면)
  - 잠긴 계좌 칩 개별 aria-disabled + 잠금 title
  - VI 트리거 스트립 scopeAccount 게이트(IN-05)
  - 32-UI-REVIEW Pillar 5 간격 7곳 4배수 + 공용 짝
affects: [32-UI-SPEC.md]
tech-stack:
  added: []
  patterns: ["tailwind-merge 로 Button 변형 bg/fg/hover 를 공용 톤 상수로 덮기"]
key-files:
  created: []
  modified:
    - webapp/src/components/trading/strategy-status-card.tsx
    - webapp/src/components/trading/__tests__/strategy-status-card.test.tsx
    - webapp/e2e/specs/me.spec.ts
    - webapp/src/components/me/account-chips.tsx
    - webapp/src/components/me/__tests__/account-chips.test.tsx
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
    - webapp/src/components/trading/workbench/alert-toasts.tsx
    - webapp/src/components/trading/workbench/vi-settings-rows.tsx
    - webapp/src/components/trading/workbench/workbench-status-bar.tsx
    - webapp/src/components/trading/lc/setting-group.tsx
    - webapp/src/components/trading/strategy-badge.tsx
    - webapp/src/components/trading/vi-order-list.tsx
    - webapp/src/components/trading/workbench/vi-trigger-strip.tsx
    - webapp/src/components/trading/workbench/breakout-strip.tsx
    - .planning/phases/32-account-axis/32-UI-SPEC.md
decisions:
  - "「이 계좌 끄기」 카드 버튼 · 다이얼로그 실행 버튼은 한 상수 KILL_BUTTON_TONE(--destructive color-mix 10% · hover 18%) 옅은 면 — 테두리형 · 가격 방향 면 토큰 폐기"
  - "/me 계좌 끄기 표면 어휘는 「끄기」 하나 — 제목 「이 계좌의 전략을 끌까요?」 · 전송 실패 「…이 계좌 끄기 요청을…」"
  - "잠긴 계좌 칩은 그룹뿐 아니라 칩마다 aria-disabled + 잠금 title, disabled 속성은 쓰지 않는다(포커스 · roving 유지)"
  - "VI 트리거 스트립은 카드 격자와 같은 scopeAccount 게이트(D-01 한 식)"
  - "간격 7곳 4배수 — 밀집 작업면은 내림, 확인 다이얼로그는 이웃 값 정렬로 올림 · 공용 짝 동행"
metrics:
  duration: "~6분(실행) · E2E 2묶음 포함"
  completed: 2026-10-17
estimate:
  tokens: 110000
  tasks: 3
actuals:
  tokens: 15695
  tasks: 3
  commits: 5
plan_head_before: 274e0dcc255621d4493d8dfe85c939d7a6dd6266
plan_head_after: bdceac0790bfe206fdbab113588360da07c99b42
---

# Phase quick-261017-bwt Plan 01: Phase 32 UI 리뷰 잔여 A~F Summary

계좌 끄기 버튼 두 개가 이제 한 상수(`KILL_BUTTON_TONE`)의 옅은 `--destructive` 면 톤을 쓰고, 문구는 「끄기」 어휘 하나로 맞췄다. 잠긴 계좌 칩은 칩마다 `aria-disabled`와 잠금 `title`을 갖는다. VI 스트립은 카드 격자와 같은 `scopeAccount` 게이트로 거른다. UI 리뷰가 지목한 4배수가 아닌 간격 7곳(공용 짝 포함)은 모두 4배수로 바꿨다.

## 커밋

| # | 해시 | 내용 |
|---|---|---|
| 1 | 520553ca | test — 계좌 끄기 표면 「끄기」 어휘 단언 (RED) |
| 2 | 2662a1b8 | fix — 「끄기」 어휘 통일 · KILL_BUTTON_TONE 카드 · 다이얼로그 일치 (B · C) |
| 3 | 35563f1f | test — 잠긴 칩 개별 aria-disabled · VI 스트립 게이트 단언 (RED) |
| 4 | 3a51e363 | fix — 칩마다 aria-disabled · title · scopedViOrders = scopeAccount (D · IN-05) |
| 5 | bdceac07 | style — 간격 7곳 4배수 · 공용 짝 · 32-UI-SPEC 예외 해소 (A) |

## A — 간격 7곳 (모두 4배수)

| # | 위치 | 옛 값 → 새 값 | 함께 바꾼 공용 짝 |
|---|---|---|---|
| 1 | `alert-toasts.tsx` 토스트 카드 루트 | `gap-2.5` · `py-2.5`(10) → `gap-2` · `py-2`(8), `px-3` 유지 | 없음 |
| 2 | `alert-toasts.tsx` 건수 배지 | `px-[5px]` → `px-1`(4) | `strategy-badge.tsx` `StrategyBadge` · `vi-order-list.tsx` · `vi-trigger-strip.tsx` · `breakout-strip.tsx` (admin `PILL_CHIP` 무변경) |
| 3 | `strategy-status-card.tsx` 끄기 다이얼로그 요약 `dl` | `gap-1.5` · `px-3 py-2.5` → `gap-2` · `p-3` | `vi-settings-rows.tsx` `vi-confirm-summary` |
| 4 | 같은 다이얼로그 경고 문단 | `px-2.5` → `px-3`(`py-2` 유지) | `vi-settings-rows.tsx` `vi-confirm-warning` |
| 5 | `workbench-status-bar.tsx` 상단 줄 카드 | `py-2.5` → `py-2`(16/8 · 칩 32 + 8×2 = 48) | 없음 |
| 6 | `workbench-status-bar.tsx` 컬럼 세그먼트 항목 | `px-[9px]` → `px-2` | `lc/setting-group.tsx` `ChoiceRow` 항목 |
| 7 | `workbench-status-bar.tsx` 옮김 안내 닫기 × | `-my-0.5` · `size-5` → `-my-1` · `size-6`(아이콘 `size-3` 유지 · 24px 누름 영역) | 없음 |

32-UI-SPEC Spacing 절도 같이 고쳤다. 상단 줄 카드는 ~~16/10~~ → 16/8이고, 새 치수 5행을 추가했으며, 12px 행의 `ChoiceRow` 구절은 취소선으로 표시했다. 예외 머리 항목은 「→ quick-261017-bwt 로 해소」로 닫았고, 하위 7개 항목은 취소선 + 새 값 · 짝으로 남겼다. 이 절에 quick-261017-bwt 표기는 15건이다.

## B — 끄기 버튼 색 (KILL_BUTTON_TONE)

- 값은 `bg-[color-mix(in_oklab,var(--destructive)_10%,transparent)] text-[var(--destructive)] hover:bg-[color-mix(…_18%…)]`이다. 카드 kill 줄 버튼(기본 변형)과 다이얼로그 실행 버튼(`outline` 변형)이 함께 쓴다. tailwind-merge가 두 변형의 bg · fg · hover를 정확히 걷어 내는지는 vitest로 `cn(buttonVariants(...), TONE)` 결과를 찍어 확인했다.
- 가격 방향 면 토큰은 0, 테두리형 실행 버튼도 0이다. 채움(솔리드) 빨강은 쓰지 않는다(S-6).
- 글자 대비(sRGB 근사):

| 테마 | 옛 면 | 새 면 10% | 참고: 면 없이 카드 위 |
|---|---|---|---|
| 라이트 | 3.31:1 | 3.26:1 | 3.71:1 |
| 다크 | 4.13:1 | 4.44:1 | 4.87:1 |

라이트는 사실상 그대로이고 다크는 오른다. 둘 다 12/600 글자 기준 AA 4.5에는 못 미친다. 원인은 `--destructive` 토큰 자체(흰 바탕에서도 3.71)라 이 quick의 범위 밖이다(새 토큰 0 계약).

## C — 바뀐 문구 2개

- 다이얼로그 제목: ~~「이 계좌의 전략을 비활성화할까요?」~~ → 「이 계좌의 전략을 끌까요?」
- 전송 실패: ~~「연결이 끊겨 비활성화 요청을 보내지 못했어요. …」~~ → 「연결이 끊겨 이 계좌 끄기 요청을 보내지 못했어요. 연결이 복구된 뒤 다시 눌러 주세요.」
- 이제 `strategy-status-card.tsx` 파일 전체(주석 포함)에 「비활성화」가 없다. 32-UI-SPEC의 Copywriting · S5 표 · Color 표 · S5′ · Component Inventory · S5 시각 절을 갱신했다.

## D — 잠긴 칩 피드백

- 잠그면 칩 button마다 `aria-disabled="true"`와 `title`=잠금 문구가 붙고, `disabled` 속성은 없다. roving tabindex와 「화살표는 포커스만」 동작은 그대로다.
- account-chips 테스트는 17 → 20이다(잠금 개별 속성 · 잠금 아님 · 풀림 rerender). 기존 잠금 테스트는 고치지 않고 통과했다.

## E — 선택 칩 번호 대비 (코드 무변경)

`opacity-80`을 유지한다. 라이트는 #191f28×.8 on #fff ≈ **8.67:1**, 다크는 #fff×.8 on #4e4e4e ≈ **6.04:1**로 둘 다 AA 4.5:1을 통과한다.

## F — IN-05

- `scopedViOrders`가 이제 `scopeAccount` 게이트로 거르며, deps는 `[activeViOrders, scopeAccount]`이다.
- 동작이 달라지는 상태는 하나뿐이다. 계좌 목록이 **나중에** 비면(relay `accounts: []`) `pillAccountOf`가 `accountNo`를 남겨 둔다. 그래서 옛 식은 VI 스트립만 옛 계좌로 거르고 카드 격자는 거르지 않았다. 이제는 둘 다 거르지 않는다(③ 테스트: 수정 전 VI 칩 1개였던 것이 수정 후 2개).
- 정상 경로(① A → B 전환 시 칩 1개씩 · ② 처음부터 계좌 []이면 전부)는 수정 전후가 같다. 두 테스트는 RED 커밋에서도 통과했다.

## 검증

- node 검사 3개: 모두 ok
- 단위 테스트 합집합 12파일 553건 통과 (`--maxWorkers=2`, 마지막 태스크 뒤 재실행)
- typecheck(`tsc --noEmit` + e2e tsconfig) 통과
- E2E (`--workers=1`)
  - `me.spec.ts -g "P32-disable"`: 2 passed (setup 포함)
  - `account-axis-backstop.spec.ts -g "backstop S1|backstop S4"`: 4 passed — S1(344 · 685 · 830 · 992, 줄=2, 칩=4), S4(폰 390 · ≥700 계좌 줄 2줄, 힌트 폭 58), S13(제목에 「S1」이 들어 있어 함께 실행, /me 칩 줄 통과)
- `git diff --stat 274e0dcc..HEAD`는 16파일로 frontmatter의 `files_modified` 범위 안이다. relay/ · admin/ · stock-comovement · 32-UI-REVIEW.md · card-body · strategy-card · strategy-log는 diff에 없다.

## Deviations from Plan

계획대로 실행했다. 한 군데만 조정했다. #7 닫기 버튼 주석은 처음에 JSX 속성 사이 `//` 줄로 넣었는데, 계획 문구(「버튼 바로 위에 한 줄 주석」)대로 `<button>` 위의 `{/* */}` 주석으로 옮겼다. 동작은 무변경이다.

## 범위 밖으로 남긴 것

- IN-04(relay 「지움」 프레임 — 프로토콜 · 배포 순서) · IN-01 · IN-03
- `--destructive` 토큰 자체의 글자 대비(AA 미달 — 라이트 3.26 · 다크 4.44): 토큰 값 변경 = 새 토큰 0 계약 밖
- admin `PILL_CHIP`, stock-comovement 9px 칩
- UI 리뷰가 지목하지 않은 간격: kill 줄 `gap-2.5`, 전략 행 `py-2.5`, vi-trigger/breakout 스트립 `px-2.5 py-2.5` 등
- Phase 32 밖 화면(card-body · strategy-card · strategy-log 등)의 「비활성화」 문구 · relay 문구

## Self-Check: PASSED

- 수정 파일 16개 모두 존재, 커밋 5개(520553ca · 2662a1b8 · 35563f1f · 3a51e363 · bdceac07) 모두 HEAD 조상, `git rev-list --count 274e0dcc..HEAD` = 5
