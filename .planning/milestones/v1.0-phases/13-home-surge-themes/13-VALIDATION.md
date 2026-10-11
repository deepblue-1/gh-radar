---
phase: 13
slug: home-surge-themes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-01
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 13-RESEARCH.md §Validation Architecture (nyquist_validation=true).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x (workers/home-sync + server) · Playwright (webapp E2E) |
| **Config file** | `workers/home-sync/vitest.config.ts` (theme-sync 복제 — Wave 0 신설) · `webapp/playwright.config.ts` (기존) |
| **Quick run command** | `pnpm --filter @gh-radar/home-sync test` |
| **Full suite command** | `pnpm -r test` (워커+서버+webapp) + `pnpm --filter webapp e2e` |
| **Estimated runtime** | ~10s (home-sync unit) · ~60s (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @gh-radar/home-sync test` (< 10s)
- **After every plan wave:** Run `pnpm -r test` (전 워크스페이스)
- **Before `/gsd-verify-work`:** 전 suite green + Playwright home.spec + **Claude POC 게이트**(비용/정확도)
- **Max feedback latency:** 10 seconds (per-task)

---

## Per-Task Verification Map

> Task IDs finalized by planner. Mapped from RESEARCH §Phase Requirements → Test Map.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-02-t2 | 02 | 1 | HOME-01 | — | Claude JSON → payload 파싱 정확 | unit | `pnpm --filter @gh-radar/home-sync test` | ✅ 02(TDD) clusterSurges.test.ts | ⬜ pending |
| 13-02-t2 | 02 | 1 | HOME-01 | — | 정렬 D-05 (종목수 desc, 동수 평균등락 desc) | unit | `pnpm --filter @gh-radar/home-sync test` | ✅ 02(TDD) clusterSurges.test.ts | ⬜ pending |
| 13-02-t2 | 02 | 1 | HOME-01 | — | 개별/테마 판정 D-06 (2+ vs 1) | unit | `pnpm --filter @gh-radar/home-sync test` | ✅ 02(TDD) clusterSurges.test.ts | ⬜ pending |
| 13-02-t2 | 02 | 1 | HOME-01 | T-13-01 (환각 URL) | 뉴스 인덱스→title/url 해석 (환각 방지) | unit | `pnpm --filter @gh-radar/home-sync test` | ✅ 02(TDD) clusterSurges.test.ts | ⬜ pending |
| 13-02-t1/t3 | 02 | 1 | HOME-01 | — | hash-skip 복제 append (is_carried) | unit | `pnpm --filter @gh-radar/home-sync test` | ✅ 02(TDD) contentHash.test.ts + index.test.ts | ⬜ pending |
| 13-01-xx | xx | 1 | HOME-01 | T-13-02 (default-deny) | 스냅샷 INSERT + RLS anon/authenticated read | integration | `pnpm --filter server test` | ❌ W0 | ⬜ pending |
| 13-01-xx | xx | 2 | HOME-01 | T-13-03 (시세 오염) | `/api/home` 객체 계약 `{ snapshot, index }` | integration | `pnpm --filter server test` | ❌ W0 | ⬜ pending |
| 13-01-xx | xx | 3 | HOME-01 | — | `/` 홈 표시 + 날짜/시점 네비 + 빈 상태 | E2E | `pnpm --filter webapp e2e` | ❌ W0 | ⬜ pending |
| 13-01-xx | xx | 4 | HOME-01 (회귀) | — | `/scanner` 직접 접속 여전히 동작 | E2E | `pnpm --filter webapp e2e` | ✅ 기존 | ⬜ pending |
| 13-01-xx | xx | 5 | HOME-01 (POC) | — | Claude 클러스터링 정확도/비용 게이트 | manual POC | 워커 1슬롯 실 실행 | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `workers/home-sync/vitest.config.ts` (theme-sync 복제) — **유일한 진짜 Wave 0 스캐폴드** (Plan 01)
- [x] `workers/home-sync/src/**/*.test.ts` (loadSurges/contentHash/clusterSurges/index.test.ts) — **Plan 02 Wave 1 TDD 에서 작성** (RED→GREEN), Wave 0 아님
- [x] `server/src/routes/home.route.test.ts` — **Plan 03 Wave 2 에서 작성** (`/api/home` 객체계약 + RLS supertest), Wave 0 아님
- [x] `webapp/e2e/specs/home.spec.ts` — **Plan 05 Wave 4 에서 작성** (홈 표시/네비/빈상태 + /scanner 회귀), Wave 0 아님
- [ ] Claude POC 스크립트 — 1슬롯 실 클러스터링 (정확도/비용 게이트, [BLOCKING] task, Plan 06)
- [ ] Framework install: 없음 (theme-sync vitest 복제)

> 정정: 이 phase 의 테스트 파일은 대부분 각 Plan 내부에서 TDD(먼저 RED)로 작성됨. Wave 0 에 강제로 미리 만들어야 하는 것은 `vitest.config.ts` 스캐폴드뿐. 위 표의 `File Exists` 열이 이를 반영함.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Claude 클러스터링 정확도 (테마명/개별판정 의미성) | HOME-01 | LLM 출력 품질은 자동 assert 불가 — bottom-up 급등 클러스터링은 theme-sync POC와 다른 태스크 | home-sync 워커 1슬롯 실 실행 → 출력 테마가 실제 KR 급등 테마와 대응하는지 육안 확인 (theme-sync 10-06 POC 선례) |
| 비용 게이트 (Claude 1회 호출 실측) | HOME-01 | 급등 종목 수/뉴스 밀도 날마다 변동 | POC 슬롯의 input/output 토큰 실측 → 월 비용 추정 (~$1.5-3.1/월 상한 검증) |
| production 홈 표시 (Vercel) | HOME-01 | 실배포 후 육안 | `/` 접속 → 오늘의 급등 테마 카드 + 날짜/시점 네비 렌더 확인 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
