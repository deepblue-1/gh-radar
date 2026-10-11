---
phase: 6
slug: stock-search-detail
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-15
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit) · playwright (E2E, Wave 0 설치) |
| **Config file** | `webapp/vitest.config.ts` (예상) · `webapp/playwright.config.ts` (Wave 0 신설) |
| **Quick run command** | `pnpm --filter webapp test -- --run` |
| **Full suite command** | `pnpm --filter webapp test -- --run && pnpm --filter webapp exec playwright test` |
| **Estimated runtime** | ~60 seconds (unit ~10s, e2e ~50s) |

> Phase 6 는 프론트엔드 전용. webapp 패키지에 vitest/playwright 가 아직 설정되지 않았다면 Wave 0 에서 설치·설정을 선행한다.

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter webapp test -- --run`
- **After every plan wave:** Run full suite (vitest + playwright)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 6-01-01 | 01 | 0 | SRCH-01/02/03 | — | N/A | infra | `pnpm --filter webapp test -- --run` (smoke) | ❌ W0 | ⬜ pending |
| 6-01-02 | 01 | 0 | SRCH-01/02/03 | — | N/A | infra | `pnpm --filter webapp exec playwright test --list` | ❌ W0 | ⬜ pending |
| 6-02-01 | 02 | 1 | SRCH-01 | — | code regex `^[A-Za-z0-9]{1,10}$` 서버 검증과 동일 | unit | `pnpm --filter webapp test stock-api` | ❌ W0 | ⬜ pending |
| 6-02-02 | 02 | 1 | SRCH-02 | — | AbortController로 이전 요청 취소 | unit | `pnpm --filter webapp test stock-api` | ❌ W0 | ⬜ pending |
| 6-03-01 | 03 | 1 | SRCH-01/02 | — | debounce 300ms · mod+k trap | unit | `pnpm --filter webapp test global-search` | ❌ W0 | ⬜ pending |
| 6-03-02 | 03 | 1 | SRCH-02 | — | cmdk `shouldFilter={false}` + `value={code}` 강제 | unit | `pnpm --filter webapp test global-search` | ❌ W0 | ⬜ pending |
| 6-04-01 | 04 | 2 | SRCH-03 | — | `value<=0` → em-dash (server mapper 0 강제 대응) | unit | `pnpm --filter webapp test stock-stats-grid` | ❌ W0 | ⬜ pending |
| 6-04-02 | 04 | 2 | SRCH-03 | — | null price → `—` 표기 | unit | `pnpm --filter webapp test stock-hero` | ❌ W0 | ⬜ pending |
| 6-05-01 | 05 | 2 | SRCH-03 | — | not-found / error 라우트 렌더링 | unit | `pnpm --filter webapp test not-found error` | ❌ W0 | ⬜ pending |
| 6-06-01 | 06 | 3 | SRCH-01/02 | — | 검색 → 자동완성 → 선택 → 상세 페이지 이동 E2E | e2e | `playwright test search.spec.ts` | ✅ | ✅ green |
| 6-06-02 | 06 | 3 | SRCH-03 | — | Hero/Stats/Placeholder 렌더·refresh 복구 | e2e | `playwright test stock-detail.spec.ts` | ✅ | ✅ green |
| 6-06-03 | 06 | 3 | SRCH-01/02/03 | — | axe 접근성(Dialog focus trap, Badge contrast) | e2e | `playwright test a11y.spec.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

> 각 Task ID 는 Planner 가 최종 PLAN.md 번호와 일치하도록 재매핑 가능. Requirement 매핑은 고정.

---

## Wave 0 Requirements

- [ ] `webapp/vitest.config.ts` — vitest + jsdom + `@testing-library/react` 설치 (미설정 시)
- [ ] `webapp/playwright.config.ts` — baseURL, webServer (Next dev), project(chromium) 설정
- [ ] `webapp/tests/setup.ts` — RTL cleanup, matchMedia mock, ResizeObserver mock (cmdk Dialog 요구)
- [ ] `webapp/e2e/fixtures/stocks.ts` — 검색/상세 테스트용 픽스처 (삼성전자 005930, 잘못된 코드 INVALID, price=null 케이스)
- [ ] MSW 또는 `vi.mock('@/lib/stock-api')` 선택 — Phase 5 scanner 패턴 일치 확인 후 채택
- [ ] axe-playwright 또는 `@axe-core/playwright` 설치

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 모바일(<768px) Hero 가독성 | SRCH-03 | 시각적 판정, 실제 디바이스 체감 | Chrome DevTools 375px · iPhone 13 · Galaxy S20 프로필에서 /stocks/005930 확인 |
| 검색 모달 모바일 풀스크린 UX | SRCH-01/02 | shadcn CommandDialog 반응형 체감 | 375px 뷰포트에서 ⌘K → 모달 높이/키보드 가림 확인 |
| Lighthouse 성능 점수 | — | 네트워크·캐시 변동성 | /scanner · /stocks/005930 Lighthouse 4.x 이상 권장 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
