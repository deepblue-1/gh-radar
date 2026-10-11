---
phase: 21-gh-trade-mobile-app
plan: 19
subsystem: ui
tags: [react, next-themes, lucide-react, a11y, vitest, playwright]

requires:
  - phase: 21-gh-trade-mobile-app
    provides: "21-09 계정 카드 A(목적지 아이콘 규칙) · 사이드바 ThemeToggle(quick 260911-tuk)"
provides:
  - "theme-toggle.tsx export: THEME_SWITCH_LABEL(키=목적지 테마) · ThemeSwitchIcon · ThemeValue"
  - "사이드바 ThemeToggle · /me AccountCard 가 같은 목적지 아이콘 + 행동 문구(aria-label · title)"
  - "단위 theme-toggle.test.tsx(6) · e2e 데스크톱 1280 /me 사이드바↔카드 동등성"
affects: [21-20, 21-24]

actuals:
  tokens: 5400
  tasks: 2
  commits: 2
plan_head_before: 8a441fa7218eca51f403a0d46b80f5486fa5eb2f

tech-stack:
  added: []
  patterns:
    - "UI 규칙(아이콘+접근 이름)을 컴포넌트 파일에서 상수·소컴포넌트로 export 해 두 표면이 공유 — 단일 정의"

key-files:
  created:
    - webapp/src/components/layout/__tests__/theme-toggle.test.tsx
  modified:
    - webapp/src/components/layout/theme-toggle.tsx
    - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
    - webapp/src/components/me/account-card.tsx
    - webapp/src/components/me/__tests__/account-card.test.tsx
    - webapp/e2e/specs/brand-account.spec.ts

key-decisions:
  - "D-08b 구현: 테마 버튼 아이콘 = 누르면 바뀔 테마(다크→Sun · 라이트→Moon), 접근 이름·title = 행동 문구(「라이트 모드로 전환」/「다크 모드로 전환」) — 정의는 theme-toggle.tsx 한 곳"
  - "ThemeValue 타입도 theme-toggle.tsx 에서 export 해 AccountCard 의 로컬 중복 타입을 제거"

patterns-established:
  - "테마 버튼을 새 표면에 추가할 때는 ThemeSwitchIcon · THEME_SWITCH_LABEL[nextTheme] 을 가져다 쓴다 — 문구·아이콘을 직접 적지 않는다"

requirements-completed: [MOBILE-01]

coverage:
  - id: D1
    description: "사이드바 ThemeToggle 이 목적지 아이콘(다크=Sun · 라이트=Moon)과 행동 문구 aria-label·title 을 보이고, 마운트 전에는 다크로 읽는다"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/components/layout/__tests__/theme-toggle.test.tsx#ThemeToggle — 목적지 아이콘 · 행동 문구 (D-08b)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/layout/__tests__/app-sidebar.test.tsx#⑧ · ⑧-b"
        status: pass
      - kind: unit
        ref: "webapp/src/components/layout/__tests__/app-shell-chrome.test.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "규칙 단일 정의 — THEME_SWITCH_LABEL · ThemeSwitchIcon export, AccountCard 가 import 해 사용(옛 「테마 전환」 문구 제거)"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/components/layout/__tests__/theme-toggle.test.tsx#ThemeSwitchIcon · THEME_SWITCH_LABEL — 공용 규칙 export"
        status: pass
      - kind: unit
        ref: "webapp/src/components/me/__tests__/account-card.test.tsx#AccountCard — 테마 버튼 (D-08b)"
        status: pass
      - kind: other
        ref: "pnpm --filter @gh-radar/webapp run typecheck"
        status: pass
    human_judgment: false
  - id: D3
    description: "데스크톱 1280 /me 에서 사이드바 토글과 계정 카드 버튼의 data-icon·접근 이름이 같고, 사이드바 토글 클릭 시 테마가 뒤집히며 두 버튼이 함께 바뀐다"
    requirement: MOBILE-01
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/brand-account.spec.ts#데스크톱 1280 /me — 사이드바 토글과 계정 카드 테마 버튼이 같은 아이콘·같은 접근 이름(D-08b)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/brand-account.spec.ts#계정 카드 · 이메일 · 테마 전환 토글 · 로그아웃 버튼 존재(클릭 안 함)"
        status: pass
      - kind: e2e
        ref: "webapp/e2e/specs/brand-account.spec.ts#앱 모드 390 — 사이드바 없이 계정 카드가 뷰포트 안에 선다"
        status: pass
    human_judgment: false
  - id: D4
    description: "실기기(데스크톱 브라우저·iOS/Android 앱)에서 두 버튼이 같은 아이콘으로 보이고 툴팁이 행동 문구로 뜨는지 사람 확인"
    verification: []
    human_judgment: true
    rationale: "시각 인지·툴팁 표시·앱 WebView 렌더는 21-24 UAT 항목 3 에서 사람이 확인하기로 계획됨"

duration: 2min
completed: 2026-09-26
status: complete
---

# Phase 21 Plan 19: 테마 아이콘 규칙 통일(G-21-N2 · D-08b) Summary

**사이드바 ThemeToggle 과 /me 계정 카드 테마 버튼이 theme-toggle.tsx 한 곳의 `ThemeSwitchIcon` · `THEME_SWITCH_LABEL` 을 공유 — 다크일 때 Sun·「라이트 모드로 전환」, 라이트일 때 Moon·「다크 모드로 전환」**

## Performance

- **Duration:** 약 2분(실행 구간)
- **Started:** 2026-09-26T04:13:28Z
- **Completed:** 2026-09-26T04:15:36Z
- **Tasks:** 2
- **Files modified:** 6 (신규 1 · 수정 5)

## Accomplishments

- 사이드바 토글이 현재 상태 아이콘 + 괄호 안내 문구(「다크 모드 (클릭 시 라이트 모드)」)에서 **목적지 아이콘 + 행동 문구**로 바뀌어 계정 카드와 같은 규칙이 됐다.
- 바뀐 접근 이름: 사이드바 `다크 모드 (클릭 시 라이트 모드)` / `라이트 모드 (클릭 시 다크 모드)` → `라이트 모드로 전환` / `다크 모드로 전환`. 계정 카드 `테마 전환` → 같은 두 문구. 두 버튼 모두 `title` 도 같은 값.
- 공용 export(`webapp/src/components/layout/theme-toggle.tsx`): `THEME_SWITCH_LABEL: Record<ThemeValue, string>`(키 = 목적지 테마) · `ThemeSwitchIcon({ next, className })`(`data-icon="moon"|"sun"`, aria-hidden) · `type ThemeValue`. AccountCard 는 이를 import 만 한다.
- 데스크톱 1280 `/me` e2e 로 두 버튼의 `data-icon`·접근 이름 동등성과 토글 후 동시 변화를 잠갔다.

## Task Commits

1. **Task 1: 트레이서 — 목적지 규칙 정의 + 사이드바 토글 적용 + 단위 테스트** - `d646988` (feat)
2. **Task 2: 계정 카드 공용 규칙 사용 + 단위·e2e 갱신(데스크톱 동등성)** - `4fe71e0` (feat)

## Files Created/Modified

- `webapp/src/components/layout/theme-toggle.tsx` - 규칙 정의(THEME_SWITCH_LABEL · ThemeSwitchIcon · ThemeValue export) · ThemeToggle 목적지 아이콘·행동 문구. mounted 가드·className 계약·suppressHydrationWarning 유지
- `webapp/src/components/layout/__tests__/theme-toggle.test.tsx` - 신규 6케이스(다크/라이트 · 마운트 전 SSR 다크 · className · ThemeSwitchIcon · 문구 키)
- `webapp/src/components/layout/__tests__/app-sidebar.test.tsx` - ⑧ · ⑧-b 토글 탐색 정규식 `/모드로 전환$/`
- `webapp/src/components/me/account-card.tsx` - 공용 규칙 import · aria-label/title 행동 문구 · 로컬 Sun/Moon 분기·타입 제거
- `webapp/src/components/me/__tests__/account-card.test.tsx` - 행동 문구·title 단언 · describe D-08b
- `webapp/e2e/specs/brand-account.spec.ts` - 행동 문구 정규식 탐색 · 클릭 전후 접근 이름 단언 · 데스크톱 1280 동등성 신규 테스트

## Test Results

- vitest: theme-toggle 6 · app-sidebar 36 · app-shell-chrome 4 · account-card 9 — 전부 통과
- Playwright `brand-account.spec.ts`: 5 passed(setup 1 + 4 — 기존 3 + 신규 데스크톱 동등성 1), skipped 0, 로그아웃 클릭 없음
- `pnpm --filter @gh-radar/webapp run typecheck`(tsc 본체 + e2e) 통과
- 트레이서 게이트: Task 1 verify 전부 green 뒤 확장(auto 모드 아님 · end-of-phase · automated-only verify)

## Decisions Made

- `ThemeValue` 타입도 export 해 AccountCard 의 로컬 중복 타입을 없앴다(계획의 「타입도 export」 지시 그대로).
- 마운트 전 규칙은 `renderToString`(useEffect 미실행)으로 단위 검증 — 저장값이 라이트여도 SSR 은 Sun·「라이트 모드로 전환」.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. e2e 는 이미 떠 있던 이 작업 트리의 dev 서버(포트 3100, reuseExistingServer)를 재사용했다 — 신규 테스트가 새 문구를 단언하고 통과했으므로 변경 코드가 반영된 서버임을 확인.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 21-20 Task 3 이 이 규칙을 CONTEXT D-08b 로 기록한다.
- 사람 확인(두 버튼 같은 아이콘 · 툴팁 행동 문구)은 21-24 UAT 항목 3.
- push 하지 않음(21-24 체크포인트에서 결정).

## Self-Check: PASSED

- FOUND: webapp/src/components/layout/__tests__/theme-toggle.test.tsx
- FOUND: d646988, 4fe71e0 (git log)
- 두 태스크 acceptance_criteria 재실행 전부 PASS

---
*Phase: 21-gh-trade-mobile-app*
*Completed: 2026-09-26*
