---
phase: quick-261121-gdx
plan: 01
status: complete
subsystem: webapp/admin-settlement
tags: [ui-review, contrast, a11y, touch-target, focus, settlement]
requires:
  - Phase 44 어드민 정산 화면(44-UI-REVIEW 우선 수정 1 ~ 10)
provides:
  - 정산 전용 토큰 --settle-warn-fg · --settle-on-bg(라이트 · 다크)
  - SETTLE_HIT_44 히트 확장 상수(ledger-row.tsx)
  - AdminSheet 선택형 onOpenAutoFocus prop
  - 금액 8자리 상한 안내(LEDGER_SHEET_TEXT.amountMax)
affects:
  - webapp/src/components/settlement/*
  - webapp/src/components/admin/admin-sheet.tsx(선택형 prop만 — 정산 밖 사용처 동작 무변경)
tech-stack:
  added: []
  patterns:
    - "보이는 크기 그대로 · 투명 after: 의사 요소로 누르는 영역만 세로 44"
    - "화면 전용 토큰으로 대비 보정(전역 축 토큰은 그대로)"
key-files:
  created: []
  modified:
    - webapp/src/styles/globals.css
    - webapp/src/styles/__tests__/tds-tokens.test.ts
    - webapp/src/components/admin/admin-sheet.tsx
    - webapp/src/components/admin/__tests__/admin-sheet.test.tsx
    - webapp/src/components/settlement/account-table.tsx
    - webapp/src/components/settlement/open-pools-card.tsx
    - webapp/src/components/settlement/reflect-box.tsx
    - webapp/src/components/settlement/settle-sheet.tsx
    - webapp/src/components/settlement/ledger-row.tsx
    - webapp/src/components/settlement/ledger-sheet.tsx
    - webapp/src/components/settlement/settle-confirm.tsx
    - webapp/src/components/settlement/transfer-card.tsx
    - webapp/src/components/settlement/name-vs-card.tsx
    - webapp/src/components/settlement/__tests__/reflect-box.test.tsx
    - webapp/src/components/settlement/__tests__/activity-card.test.tsx
    - webapp/src/components/settlement/__tests__/settle-confirm.test.tsx
    - webapp/src/components/settlement/__tests__/ledger-sheet.test.tsx
    - webapp/src/components/settlement/__tests__/settle-sheet.test.tsx
    - webapp/e2e/specs/admin-settlement.spec.ts
    - .planning/phases/44-admin-settlement/44-UI-SPEC.md
    - .planning/phases/44-admin-settlement/44-UI-REVIEW.md
decisions:
  - "정산 경고 글자는 정산 전용 --settle-warn-fg(라이트 #9c4f00 · 다크 #ffb13d) — 전역 --led-latent 는 그대로(사용자 결정 2026-11-21 「정산 화면만」)"
  - "「바로 출금」 켜짐 면은 두 테마 모두 진하게 --settle-on-bg(라이트 #1b64da · 다크 #1a71eb) — 다크 --primary 흰 글자도 3.57 : 1 로 미달"
  - "정산 취소 확인 창 하단선은 테마 접두 없이 --border-subtle(라이트도 currentColor #191f28 → #e5e8eb)"
  - "금액 8자리 이상은 앞 7자리로 잘라 넣지 않고 값 그대로 + 칸 오류 줄 상한 안내(원 단위 붙여넣기 시 만 배 오입력 방지)"
  - "② 큰 숫자는 totalKrw 유지 — 코드 무변경, UI-SPEC · e2e 주석만 정정"
  - "리뷰 9(넓은 카드 계좌 표 행 추적)는 미처리 — 계약 설계 유지"
metrics:
  duration: "약 6분"
  completed: 2026-11-21
estimate:
  tokens: 90000
  tasks: 3
actuals:
  tokens: 15000
  tasks: 3
  commits: 3
plan_head_before: 24e98c67cbf7b13dd03c231afda611d31cab458b
plan_head_after: 1891bf5a4fc3ff5aa483f081c2fe50e68b95e426
---

# Quick 261121-gdx: Phase 44 UI 리뷰 처리(정산 화면만) Summary

정산 화면 안에서만 44-UI-REVIEW 우선 수정 1 ~ 10 을 처리했다 — 정산 전용 토큰 2개로 라이트 경고 글자(최저 4.80 : 1)와 「바로 출금」 흰 글자(라이트 5.41 · 다크 4.56 : 1)를 AA 로 올리고, 시트 첫 포커스를 컨테이너로, 작은 버튼 · 알약 · 「이체 내역 보기」 의 누르는 영역을 세로 44 로, 금액 8자리 입력을 조용한 버림 대신 칸 오류 줄 상한 안내로 바꿨다.

## 항목별 처리

| # | 리뷰 항목 | 처리 | 잠금 | 커밋 |
|---|---|---|---|---|
| 1 | ② 큰 숫자 값이 계약과 다름 | 결정됨(totalKrw 유지) — 코드 무변경 · UI-SPEC ② 표 · 시선 앵커 · e2e 주석 정정 · UI-REVIEW 1번 상태 정정 | 문서 grep | 1891bf5a |
| 2 | 라이트 경고 글자 2.05 : 1 | 경고 글자 5곳 + 「현중 → 근형」 꼬리표 글자색 → `--settle-warn-fg` | tds-tokens 대비 · reflect-box · activity-card 단위 | 64358f85 |
| 3 | 「바로 출금」 3.7 : 1 | 켜짐 면 · 테두리 → `--settle-on-bg`(두 테마) | tds-tokens 대비 · settle-sheet 단위 | 64358f85 · f9c91395(단위) |
| 4 | 확인 창 하단선 순백 | `DialogFooter` 에 `border-[var(--border-subtle)]` | settle-confirm 단위 | 64358f85 |
| 5 | 「이체 내역 보기」 18px | `SETTLE_HIT_44` | e2e P44-F4 ±21 | f9c91395 · 1891bf5a |
| 6 | 금액 8자리 조용한 버림 | 값 그대로 + 칸 오류 줄 「금액은 만원 단위로 9,999,999만원까지 적을 수 있어요」 | ledger-sheet 단위 2건 · e2e | f9c91395 · 1891bf5a |
| 7 | 시트 첫 포커스 × 버튼 | AdminSheet 선택형 `onOpenAutoFocus` · 거래 기록 · 정산하기 시트는 컨테이너 preventScroll | admin-sheet · ledger-sheet · settle-sheet 단위 · e2e | f9c91395 · 1891bf5a |
| 8 | 알약 · 작은 버튼 32px | `SETTLE_HIT_44` — `ACTIVITY_SMALL_BUTTON`(고치기 · 지우기 · 정산 취소) · `PillGroup` · `PoolPills` · 「바로 출금」 | e2e P44-F4 ±21 | f9c91395 · 1891bf5a |
| 9 | 넓은 카드 계좌 표 행 추적 | **미처리** — 아래 사유 | — | — |
| 10 | 계약 간격 | `ZeroAmount` `mt-0.5` → `mt-1` · 묶음 이름 · 비율 `gap-1.5` → `gap-2` | (단언 없음) | f9c91395 |

**리뷰 9 미처리 사유:** 넓은 카드 계좌 표 행 추적 — UI-SPEC ③ 계좌 표 `.at` 계약 · 채택 목업에 행 구분선 · hover 가 없는 설계 그대로 둔다. 사용자 결정 2026-11-21 계약 설계 유지 · 원하면 별도 quick.

## 대비 계산표(WCAG 상대 휘도 · tds-tokens.test 가 회귀 게이트)

| 토큰 | 테마 | 값 | 대비 |
|---|---|---|---|
| `--settle-warn-fg` | 라이트 | `#9c4f00` | 흰 카드 5.95 · `--muted` 5.39 · 꼬리표 틴트(#ffeed6) 5.22 · 틴트 on `--muted` 4.80 |
| `--settle-warn-fg` | 다크 | `#ffb13d`(= 다크 `--led-latent` · 무변경) | 다크 카드 10.09 · `--muted` 7.61 · 틴트 6.96 · 5.13 |
| `--settle-on-bg` | 라이트 | `#1b64da` | 흰 글자 5.41 · 면 대 `--muted` 4.91 |
| `--settle-on-bg` | 다크 | `#1a71eb` | 흰 글자 4.56 · 면 대 `--muted` 3.02(비텍스트) |

종전: 라이트 `--led-latent` 흰 위 2.05 · 틴트 위 1.80, `--primary` 흰 글자 라이트 3.71 · 다크 3.57.

## UI-SPEC 계약 갱신(오케스트레이터 지시로 문서도 코드에 맞춤)

계획은 「UI-SPEC 의 다른 줄은 고치지 않는다」 였으나, 오케스트레이터 수정 지시에 따라 다음 계약 줄도 새 코드에 맞게 고쳤다 — 다음 UI 감사가 같은 차이를 다시 잡지 않게 하려는 것이다.

- 색 표 Warn 줄: 글자 = 정산 전용 `--settle-warn-fg`(#9c4f00 / #ffb13d) · 꼬리표 면 = `--led-latent` 18% 틴트. 어드민 계좌 메뉴와 라이트 경고 글자색이 다르다는 점을 함께 적음.
- Accent reserved 2번 「바로 출금」 켜짐 면: `--settle-on-bg`. ⑧ 상호작용 절의 같은 설명(「on = `--primary` 면」)도 맞춤.
- 간격 표 「바로 출금」 알약 줄 · 접근성 「터치 높이」 줄: 알약 보이는 32 · 히트 44, 작은 버튼 · 「이체 내역 보기」 히트 44, 줄바꿈된 알약 줄 사이 4px 히트 겹침.
- Researcher Decisions 5번(「유일한 새 토큰」) · 6번(`--warn` → `--led-latent`)에 quick 261121-gdx 덧붙임 한 줄씩.
- ② 큰 숫자 줄 · 시선 앵커: totalKrw 결정.

## 알아 둘 동작 변화

- **확인 창 하단선:** 라이트도 바뀐다 — 종전 색 없는 `border-t` 가 currentColor(#191f28) 진한 선이었고 이제 `--border-subtle` #e5e8eb hairline(다크 #ffffff → #3d3d3d). `ui/dialog.tsx` 는 그대로라 정산 밖 Dialog 는 종전 그대로다.
- **금액 상한:** 잘라 넣지 않고 값 유지 — 원 단위 금액 59,500,000 을 만원 칸에 붙여넣으면 5,950,000만원(595억)이 조용히 들어가는 오입력을 막는다. 범위 안 입력이 오면 안내는 사라진다.
- **알약 줄 사이 히트 겹침:** 줄바꿈된 알약 줄 사이(틈 8px)에서 위아래 히트가 4px 겹친다(뒤 DOM 알약이 이김 · 보이는 알약 면은 가리지 않음). e2e 는 그래서 첫 알약의 위쪽만 잰다.
- **다크 「바로 출금」 면:** #3485fa → #1a71eb(다크 흰 글자도 3.57 : 1 로 미달이었음).
- **어드민 계좌 메뉴와 불일치:** Phase 36 `WARN_LINE`(계좌 메뉴)은 종전 `--led-latent` 그대로라 라이트 경고 글자색이 정산(#9c4f00)과 계좌 메뉴(#ff9f1a)에서 다르다 — 사용자가 「정산 화면만」 을 골랐다.
- **AdminSheet:** `onOpenAutoFocus` 를 주지 않는 user-sheet · server-sheet · user-create-sheet · account-master-sheet 는 종전 Radix 기본(닫기 × 첫 포커스) 그대로 — admin-sheet 단위 테스트가 두 경우를 모두 잠금.

## Deviations from Plan

### 오케스트레이터 수정 반영

**1. UI-SPEC 계약 줄 추가 갱신(Task 3)** — 계획은 ② 큰 숫자 · 시선 앵커만 고치게 했으나, 오케스트레이터 지시로 Warn 색 줄 · Accent 2번 · 히트 44 줄도 고쳤다. 같은 내용을 반복 설명하는 ⑧ 상호작용 절 한 줄 · Researcher Decisions 5 · 6번에도 한 줄씩 덧붙여 문서 안에서 서로 어긋나지 않게 했다. 커밋 1891bf5a.

### 실행 판단

**2. 「바로 출금」 켜짐 면 단위 단언 추가** — 계획 Task 2 settle-sheet 테스트는 첫 포커스만 요구했으나, Task 1 의 면 교체를 단위로 잠그는 it 하나(`bg-[var(--settle-on-bg)]` 포함 · `bg-[var(--primary)]` 없음)를 같이 넣었다(settle-sheet.test.tsx 가 Task 2 파일 목록이라 f9c91395 에 들어감).

**3. 보호 브랜치 커밋 가드** — `git.base-branch --is-protected master` 가 true 를 돌려줬지만, 이 프로젝트는 `branching_strategy: none` 으로 master 에서 직접 작업하고(사용자 메모리 「작업은 master 에서」) 오케스트레이터가 메인 트리 순차 실행으로 보냈다. 이는 이동이 아니라 설정된 흐름이라 그대로 master 에 커밋했다. push 는 하지 않았다.

그 밖에는 계획대로 실행했다.

## 검증

- `vitest run src/components/settlement src/styles/__tests__/tds-tokens.test.ts src/components/admin/__tests__/admin-sheet.test.tsx --maxWorkers=2` — 통과(정산 12파일 · tds-tokens 106 · admin-sheet 8).
- `pnpm --filter @gh-radar/webapp run typecheck`(e2e tsconfig 포함) — 통과.
- `playwright test e2e/specs/admin-settlement.spec.ts --workers=1` — 10 passed(setup + E1 · E2 × 4 · F1 · F2 · F3 · 새 F4).
- F4 판별력 확인: 같은 버튼에서 ±26 지점은 히트가 **아님**을 임시 단언으로 확인한 뒤 되돌렸다(±22 히트 경계가 실제로 잰 값).
- 게이트: 정산 소스의 옛 경고 글자색 클래스 0줄 · globals.css 새 토큰 정의 4줄 · `SETTLE_HIT_44` 4파일 · e2e 「사용자 결정 2026-11-21」 2회.
- `git diff 24e98c67..HEAD` 에 `ui/dialog.tsx` · `admin/reflect-chip.tsx` · server · shared · supabase · infra · 정산 밖 AdminSheet 사용처 없음 · globals.css `--led-latent` 값 무변경(주석에서 언급만).
- 전체 vitest · 전체 e2e 는 돌리지 않았다(동시 세션 메모리 규칙).

## Known Stubs

없음.

## Self-Check: PASSED

- 파일: 21개 수정 파일 모두 존재 · SUMMARY 존재.
- 커밋: 64358f85 · f9c91395 · 1891bf5a 모두 HEAD 의 조상.
