---
phase: 06-stock-search-detail
plan: 01
subsystem: webapp/test-infrastructure
tags: [vitest, playwright, shadcn, cmdk, axe, test-infra]
requires: []
provides:
  - shadcn `Command` / `CommandDialog` 블록 (webapp/src/components/ui/command.tsx)
  - radix Dialog wrapper (webapp/src/components/ui/dialog.tsx)
  - vitest global setup + jest-dom + cmdk 폴리필
  - playwright chromium 프로젝트 + webServer 자동 기동
  - e2e 픽스처 (삼성전자 · null-price · INVALID · MALFORMED)
  - axe-core/playwright 접근성 러너
affects:
  - webapp/package.json (7 deps 추가)
  - webapp/vitest.config.ts (setupFiles 연결)
tech_stack_added:
  - cmdk ^1.1.1
  - "@playwright/test ^1.59.1"
  - "@axe-core/playwright ^4.11.1"
  - "@testing-library/jest-dom ^6.9.1"
  - "@testing-library/user-event ^14.6.1"
patterns:
  - "e2e 픽스처 공용화: webapp/e2e/fixtures/ 에서 unit + e2e 양쪽 재사용 가능하게 배치"
  - "shadcn 블록은 직접 import, 커스텀 래퍼 금지 (UI-SPEC 지침 유지)"
key_files_created:
  - webapp/src/components/ui/command.tsx
  - webapp/src/components/ui/dialog.tsx
  - webapp/src/components/ui/input-group.tsx
  - webapp/src/components/ui/textarea.tsx
  - webapp/tests/setup.ts
  - webapp/e2e/fixtures/stocks.ts
  - webapp/playwright.config.ts
  - webapp/e2e/specs/smoke.spec.ts
  - webapp/e2e/specs/.gitkeep
key_files_modified:
  - webapp/package.json
  - webapp/vitest.config.ts
  - webapp/pnpm-lock.yaml
decisions:
  - "shadcn CLI 가 button.tsx·input.tsx 도 덮어쓰기 시도 → checkout 으로 Phase 3 UI-SPEC 토큰 유지, 대신 dialog.tsx·input-group.tsx 의 신규 API(icon-sm, HTML size prop) 를 기존 Button/Input 시그니처에 맞춰 미세 조정"
  - "playwright 1.59 는 --list 시 0 테스트면 exit 1 → smoke.spec.ts 1건 배치하여 exit 0 보장 (실제 검증 spec 은 06-06 에서 작성)"
metrics:
  duration_minutes: 15
  commits: 3
  tasks_completed: 3
completed_date: 2026-04-15
---

# Phase 06 Plan 01: 테스트 인프라 + shadcn command 블록 Summary

**One-liner:** vitest(jsdom+RTL+cmdk 폴리필) · playwright chromium + axe · shadcn Command/Dialog 블록 · e2e 픽스처를 Wave 0 선행 설치하여 Phase 6 나머지 wave 의 `<automated>` 검증 경로를 개통.

## Context

Phase 06 Wave 0 — 06-VALIDATION.md §"Wave 0 Requirements" 6항목 커버. Phase 5 에서 vitest 는 이미 있었지만 setupFiles 가 비어 있었고, playwright·axe·cmdk 는 전무한 상태. 이번 plan 은 오직 인프라·픽스처만 다루며 production 코드는 추가하지 않음 (`security_enforcement: false`).

## Tasks Executed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | shadcn `command` 블록 + cmdk | `0fbc530` | command/dialog/input-group/textarea.tsx, package.json |
| 2 | vitest setup + e2e 픽스처 + jest-dom/user-event | `619c53a` | tests/setup.ts, vitest.config.ts, e2e/fixtures/stocks.ts |
| 3 | playwright + axe + playwright.config | `db853f3` | playwright.config.ts, e2e/specs/smoke.spec.ts |

## Verification

- `pnpm --filter @gh-radar/webapp test -- --run` → **40 passed (5 files)** — Phase 5 회귀 0.
- `pnpm --filter @gh-radar/webapp exec playwright test --list` → **EXIT 0** (1 smoke test).
- `pnpm --filter @gh-radar/webapp exec tsc --noEmit` → **EXIT 0**.
- `webapp/package.json` 에 cmdk · @playwright/test · @axe-core/playwright · @testing-library/jest-dom · @testing-library/user-event 전부 확인.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] shadcn CLI 가 Phase 3 UI-SPEC button.tsx · input.tsx 를 덮어쓰려 함**
- **Found during:** Task 1 (shadcn add command 실행 직후 git diff 확인).
- **Issue:** `shadcn add command --overwrite` 가 button.tsx / input.tsx 를 최신 shadcn 템플릿으로 교체 → `icon-sm` 사이즈 variant 등장, 기존 Phase 3 색 토큰 `--primary`/`--secondary`/`--destructive` 등 전부 제거.
- **Fix:** `git checkout webapp/src/components/ui/button.tsx webapp/src/components/ui/input.tsx` 로 Phase 3 커스터마이징 복원. 이어서 새로 설치된 dialog.tsx / input-group.tsx 가 기존 API 와 호환되도록:
  - dialog.tsx: DialogContent 닫기 버튼 `size="icon-sm"` → `size="sm"` + `size-7 px-0` 클래스로 교체 (32×32 유지).
  - input-group.tsx: `InputGroupInput` 이 HTML `size` (number) 속성을 Input 의 variant `size` prop 에 흘리던 것 차단 — destructuring 에서 `size: _size` 로 제외.
- **Why this was correct:** Phase 3 design system (P03) 은 이미 디자인 카탈로그와 페이지 배포가 끝난 확정된 토큰. shadcn 업스트림 템플릿을 그대로 수용하면 scanner / design 페이지 전체 시각 회귀가 발생 — scope 초과 + 무료 API 예산 외 수작업 수정 비용. 반대로 dialog/input-group 는 신규 파일이라 API 호환 패치가 국소적.
- **Commit:** `0fbc530`.

**2. [Rule 3 - Blocking] playwright 1.59 가 0 spec 에서 --list exit 1**
- **Found during:** Task 3 검증.
- **Issue:** 플랜은 `spec 0건이어도 --list 는 성공` 이라고 명시했으나 실제 playwright 1.59 는 "No tests found" 로 exit 1. 모든 후속 wave 의 `<automated>` 커맨드가 실패.
- **Fix:** `webapp/e2e/specs/smoke.spec.ts` 에 `expect(true).toBe(true)` 만 검증하는 1건 smoke spec 배치. 06-06 에서 실제 spec 로 대체 예정이라는 주석 포함.
- **Commit:** `db853f3`.

### 기타

- shadcn CLI 가 함께 설치한 **textarea.tsx**, **input-group.tsx** 는 플랜에 미명시되나 command.tsx 가 InputGroup 을 import 하므로 trim 불가 → artifact 로 기록.
- 이번 설치로 **msw@2.13.3** 이 transitive dependency 로 포함됨 (shadcn registry 부산물). VALIDATION.md §"Wave 0 Requirements" 가 "MSW 또는 vi.mock 선택" 을 남겨뒀고 Phase 5 패턴이 `vi.mock` 이므로 msw 는 사용하지 않음 — pnpm ignore-build-scripts 경고만 남고 기능 영향 없음.

## 인증 게이트

없음. 전부 로컬 pnpm + shadcn CLI 만 사용.

## Known Stubs

- `webapp/e2e/specs/smoke.spec.ts` — Placeholder. 06-06 에서 `search.spec.ts` / `stock-detail.spec.ts` / `a11y.spec.ts` 작성 시 삭제 예정.

## Threat Flags

없음. 신규 trust boundary 0, 네트워크 경로 추가 0, schema 변경 0.

## Success Criteria 충족

- [x] 06-VALIDATION.md §"Wave 0 Requirements" 6항목 모두 해결:
  - [x] vitest + jsdom + RTL 활성
  - [x] playwright.config baseURL/webServer/chromium 설정
  - [x] tests/setup.ts RTL cleanup + matchMedia + ResizeObserver + scrollIntoView
  - [x] e2e/fixtures/stocks.ts 삼성·null-price·INVALID·MALFORMED
  - [x] `vi.mock('@/lib/stock-api')` 패턴 채택 (Phase 5 일치, MSW 미사용 확정)
  - [x] @axe-core/playwright 설치
- [x] Wave 1+ `<automated>` 명령 실행 가능 (tsc/vitest/playwright 전부 exit 0)
- [x] production 코드 변경 0 (인프라 전용)

## Self-Check: PASSED

- FOUND: webapp/src/components/ui/command.tsx
- FOUND: webapp/src/components/ui/dialog.tsx
- FOUND: webapp/tests/setup.ts
- FOUND: webapp/e2e/fixtures/stocks.ts
- FOUND: webapp/playwright.config.ts
- FOUND: webapp/e2e/specs/smoke.spec.ts
- FOUND: 0fbc530 (Task 1)
- FOUND: 619c53a (Task 2)
- FOUND: db853f3 (Task 3)
