---
phase: quick-261016-udz
plan: 01
subsystem: webapp/me · 32-UI-SPEC
tags: [a11y, wai-aria, radiogroup, ui-spec, spacing, phase-32]
status: complete
requires: [Phase 32 (32-15 작업대 계좌 칩 · 32-UI-REVIEW)]
provides:
  - 계좌 칩(/me · 작업대 공용 MeAccountChips) 화살표 · Home/End = 포커스 + 선택 (IN-02)
  - 32-UI-SPEC 「2026-10-16 수정 (32-15)」 절 · 옛 셀렉트 기술 무효 표시
  - 32-UI-SPEC Spacing Exceptions — UI 리뷰 지목 간격 7곳 근거 선언
affects: [webapp/src/components/me/account-chips.tsx, workbench-status-bar AccountPill(소비처 · 무변경), me-client(소비처 · 무변경)]
tech-stack:
  added: []
  patterns: [WAI-ARIA radio group roving tabindex — 포커스 이동 = 선택]
key-files:
  created: []
  modified:
    - webapp/src/components/me/account-chips.tsx
    - webapp/src/components/me/__tests__/account-chips.test.tsx
    - webapp/src/components/me/device-settings-card.tsx
    - .planning/phases/32-account-axis/32-UI-SPEC.md
decisions:
  - 계좌 칩 화살표는 선택까지 한다(WAI-ARIA 기본) — 선택이 로컬 상태라 왕복이 없다. ChoiceRow(선택 = relay 전송)는 포커스만으로 남는다
  - 잠금 · 같은 계좌 무시는 기존 pick 가드에 맡기고 키 처리에 별도 분기를 두지 않는다
  - UI 리뷰 간격 9곳 = 수정 1(device 캡션 pt-1) · 예외 선언 7 · 기존 예외 문구 갱신 1(서버키 칩 6px)
metrics:
  duration: ~7min
  completed: 2026-10-16
  tasks: 3
  files: 4
actuals:
  tokens: 17800
  tasks: 3
  commits: 4
plan_head_before: 1fdb78cfd1ff444196422d4f8f947509dbf3a6b5
plan_head_after: 1ad9d4fb82710512d540ee6b21d962a565182811
---

# Quick 261016-udz: Phase 32 UI 리뷰 Top 3 Summary

계좌 칩을 WAI-ARIA radio group 으로 고쳐 화살표 · Home/End 가 포커스와 함께 계좌를 고르게 했다(잠금이면 포커스만 · IN-02). 32-UI-SPEC 에는 작업대 상단 줄 = `MeAccountChips` 래퍼라는 32-15 수정 절을 넣고 옛 셀렉트 기술을 전부 무효로 표시했다. UI 리뷰가 지목한 비-4배수 간격 9곳은 1곳 수정 · 7곳 근거 있는 예외 · 1곳 문구 갱신으로 닫았다.

## 커밋

| Task | 내용 | 커밋 |
|---|---|---|
| 1 RED | 화살표 · Home/End = 포커스 + 선택 테스트(제어 하네스 · 잠금 · 계좌 1개 · Enter/Space) | `5cc49b23` |
| 1 GREEN | `onKeyDown` 이 포커스 이동 뒤 `dataset.accountNo` 로 `pick` 호출 · 머리 주석 ② ③ | `a8f3efe3` |
| 2 | 32-UI-SPEC 「2026-10-16 수정 (32-15)」 절 · 옛 셀렉트 행 무효 · S13 접근성/표/인벤토리 IN-02 · frontmatter amended | `fa32e128` |
| 3 | device 캡션 `pt-0.5` → `pt-1` · Spacing Exceptions 7곳 근거 | `1ad9d4fb` |

## 테스트

- account-chips: 전 13 → 후 17(RED 커밋 시점 4 실패 → GREEN 뒤 17 통과). 옛 「→ 는 포커스만」 · 「Home/End 포커스만」 2개를 「포커스 + 선택」 로 바꾸고, 제어 하네스 순환 · ←/↓/↑ · End/Home · 계좌 1개 · 잠금 시 화살표/End/Home 포커스만 케이스를 더했다. Enter/Space 테스트는 프로그램 포커스 뒤 누르는 형태로 고쳤다.
- 최종 실행(`--maxWorkers=2`): account-chips 17 · device-settings-card 7 · workbench-status-bar 46 · me-client 30 · trading-workbench 151 = **251 통과**. 소비처 3파일은 수정 없이 통과.
- `pnpm --filter @gh-radar/webapp run typecheck` 통과(Task 1 뒤 · Task 3 는 클래스 문자열 1개).
- Task 2 · Task 3 node 문서 검사 모두 「ok」.
- E2E · 전체 회귀는 돌리지 않았다(플랜 지시).

## ③ 간격 판정 결과

| # | 위치 | 판정 | 결과 |
|---|---|---|---|
| 1 | alert-toasts 토스트 카드 `gap-2.5` · `py-2.5` | 예외 | Exceptions 선언(`3efe2d24` · Phase 31 이전 · 토스트 7종 공통) |
| 2 | alert-toasts 건수 배지 `px-[5px]` | 예외 | 선언(공용 마이크로 배지 규격) |
| 3 | strategy-status-card 확인 다이얼로그 `dl` `gap-1.5` · `py-2.5` | 예외 | 선언(`527af76a` 16-15 · `vi-confirm-summary` 와 같은 값) |
| 4 | 같은 다이얼로그 경고 문단 `px-2.5` | 예외 | 선언(`vi-confirm-warning` 과 같은 값) |
| 5 | workbench-status-bar 상단 줄 카드 `py-2.5` | 예외 | 선언(`f8280a45` · 치수 표 「16/10」 과 같은 값) |
| 6 | 컬럼 세그먼트 항목 `px-[9px]` | 예외 | 선언(`e2f33f7c` 18-11 · ChoiceRow 항목 같은 값) |
| 7 | 옮김 안내 닫기 × `-my-0.5` | 예외 | 선언(`b32ef150` 29-39 · 광학 보정) |
| 8 | device-settings-card 「이 기기」 캡션 `pt-0.5` | **수정** | `pt-1`(4px) |
| 9 | account-chips 서버키 칩 `px-1.5` | 기존 예외 유지 | Task 2 에서 근거 문구를 32-15 사실로 갱신 |

출처 커밋은 실행 중 `git blame` 으로 다시 확인했다(alert-toasts 148 · 169 = `3efe2d24`). VI 다이얼로그 값도 일치함을 확인했다(`vi-settings-rows.tsx` 833 · 859).

## 계획과 달라진 점

없음. 플랜대로 실행했다.

메모: `MeAccountChips` 인벤토리 행 import 경로의 `(예)` 표기는 원문 그대로 두었다(범위 밖 손질 최소화).

## 범위 밖으로 남긴 UI-REVIEW 항목

- 색 토큰(`--up-bg` 교체)
- 「끄기/비활성화」 문구 통일
- 잠금 칩 개별 `disabled`/`aria-disabled` 처리
- IN-04 · IN-05
- `ChoiceRow`(setting-group.tsx) 키보드 — 의도적으로 포커스만 유지
- ROADMAP 에 32-15 기록(32-VERIFICATION 지적 · 이 quick 은 ROADMAP 을 건드리지 않음)
- 체커 메모의 「/me 설정 = 서버 세그먼트 선택 항목」 시선 앵커 등 32-15 와 무관한 낡은 구절(이번 판정 규칙 「셀렉트」 · 칩 밖 서버키 칩 대상 밖)

## Known Stubs

없음.

## Self-Check: PASSED

- 파일 4개 존재 · 수정 확인(`git diff --stat 1fdb78cf..HEAD` = 코드 3 + UI-SPEC 1, alert-toasts · strategy-status-card · workbench-status-bar · setting-group · 32-UI-REVIEW 없음)
- 커밋 `5cc49b23` · `a8f3efe3` · `fa32e128` · `1ad9d4fb` 모두 HEAD 조상 · 삭제 파일 없음
