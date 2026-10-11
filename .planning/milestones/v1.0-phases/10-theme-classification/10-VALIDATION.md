---
phase: 10
slug: theme-classification
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-09
source: 10-RESEARCH.md §Validation Architecture (전사) + PLAN 태스크 매핑
---

# Phase 10 — Validation Strategy

> 실행 중 피드백 샘플링을 위한 phase 검증 계약. RESEARCH.md §Validation Architecture 를 plan 태스크에 매핑해 채움.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest `^3.0.0` (theme-sync 워커 / server / webapp 공통) + Playwright (webapp E2E) `[VERIFIED: package.json]` |
| **Config file** | 각 워크스페이스 `vitest.config.ts` (theme-sync 는 master-sync 복사) · `webapp/playwright.config.ts` (기존) |
| **Quick run command** | `pnpm -F @gh-radar/theme-sync test` · `pnpm -F @gh-radar/server test` · `pnpm -F webapp test` |
| **Full suite command** | `pnpm -r test` (전 워크스페이스) + `pnpm -F webapp e2e` (Playwright) |
| **Estimated runtime** | ~30–60초 (unit/integration) + E2E 별도 |

---

## Sampling Rate

- **After every task commit:** 해당 워크스페이스 quick test (`pnpm -F <ws> test`)
- **After every plan wave:** `pnpm -r test` + typecheck + build
- **Before `/gsd-verify-work`:** 전 suite green + Playwright E2E green + production smoke (theme-sync Job 1회 실행 → `themes` count > 0)
- **Max feedback latency:** ~60초 (unit/integration)

---

## Per-Task Verification Map

> RESEARCH §Phase Requirements → Test Map 을 plan/wave 에 매핑. 테스트 파일·fixture·supabase-mock 은 Wave 0 (Plan 10-01) 에서 생성(`❌ W0`).

| # | Plan | Wave | Requirement | Threat Ref | Behavior | Test Type | Automated Command | File Exists | Status |
|---|------|------|-------------|------------|----------|-----------|-------------------|-------------|--------|
| 1 | 10-03 | 2 | THEME-01 | scrape input sanitize | 네이버 EUC-KR 목록 파싱(table.type_1) | unit | `pnpm -F @gh-radar/theme-sync test parseThemeList` | ❌ W0 | ⬜ pending |
| 2 | 10-03 | 2 | THEME-01 | — | 네이버 상세 종목 code 추출(table.type_5) | unit | `... test parseThemeDetail` | ❌ W0 | ⬜ pending |
| 3 | 10-03 | 2 | THEME-01 | — | EUC-KR 디코딩 한글 무손상 | unit | `... test iconv` | ❌ W0 | ⬜ pending |
| 4 | 10-03 | 2 | THEME-01 | scrape input sanitize | 알파스퀘어 JSON → 테마+종목 매핑 | unit | `... test fetchAlphaThemes` | ❌ W0 | ⬜ pending |
| 5 | 10-03 | 2 | THEME-01 | — | norm_key 병합(공백/특수문자/대소문자) | unit | `... test normalizeName` | ❌ W0 | ⬜ pending |
| 6 | 10-03 | 2 | THEME-01 | 5원칙 #4 backoff | 직접 fetch 403 → 프록시 폴백 | unit(mock) | `... test fetchWithFallback` | ❌ W0 | ⬜ pending |
| 7 | 10-03 | 2 | THEME-01 | 5원칙 #4 backoff | 429/403 → 24h backoff 저장 + skip | unit(mock) | `... test scrapeState` | ❌ W0 | ⬜ pending |
| 8 | 10-03 | 2 | THEME-01 | FK 무결성 | theme_stocks FK skip(없는 종목) + upsert | integration(supabase-mock) | `... test upsertThemes` | ❌ W0 | ⬜ pending |
| 9 | 10-03 | 2 | THEME-01 | — | SHA256 해시 동일 시 write skip | unit | `... test contentHash` | ❌ W0 | ⬜ pending |
| 10 | 10-04 | 3 | THEME-02 | — | 상위3평균 계산(rates desc top3) | unit | `pnpm -F @gh-radar/server test computeTop3` | ❌ W0 | ⬜ pending |
| 11 | 10-04 | 3 | THEME-02 | — | /api/themes 정렬 + stock_quotes 청크 IN | integration(supertest) | `pnpm -F @gh-radar/server test themes` | ❌ W0 | ⬜ pending |
| 12 | 10-05 | 4 | THEME-03 | owner-only RLS | 유저 테마 RLS owner-only(타인 row deny) | integration(supabase) | `pnpm -F webapp test theme-api` | ❌ W0 | ⬜ pending |
| 13 | 10-05 | 4 | THEME-03 | owner-only RLS | fork = active 멤버십 스냅샷 복사 | integration | `... test forkSystemTheme` | ❌ W0 | ⬜ pending |
| 14 | 10-06 | 5 | THEME-04 | AI 시스템레이어 격리 | AI 발굴 프롬프트 파싱(JSON→테마후보) | unit(mock SDK) | `pnpm -F @gh-radar/theme-sync test discoverThemes` | ❌ W0 | ⬜ pending |
| 15 | 10-06 | 5 | THEME-04 | AI 시스템레이어 격리 | AI 오분류 교정 soft-제외(effective_to) | unit(mock SDK) | `... test correctMembership` | ❌ W0 | ⬜ pending |
| 16 | 10-07 | 6 | THEME-02 | — | /themes 목록(내 테마 상단+시스템 랭킹) 렌더 | E2E | `pnpm -F webapp e2e themes.spec` | ❌ W0 | ⬜ pending |
| 17 | 10-07 | 6 | THEME-02 | — | /themes/[id] scanner row + 종목→상세 이동 | E2E | `... e2e themes.spec` | ❌ W0 | ⬜ pending |
| 18 | 10-07 | 6 | THEME-02 | — | /stocks/[code] 테마 칩 + 칩→/themes/[id] | E2E | `... e2e theme-chips.spec` | ❌ W0 | ⬜ pending |
| 19 | 10-07 | 6 | THEME-03 | owner-only RLS | 유저 CRUD(생성/편집/삭제/add/remove/fork) | E2E | `... e2e user-themes.spec` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> Plan 10-01 (Wave 0) 에서 생성. RESEARCH §Wave 0 Gaps.

- [ ] `workers/theme-sync/vitest.config.ts` + `tests/helpers/supabase-mock.ts` (discussion-sync 복사)
- [ ] 네이버 EUC-KR fixture — `tests/fixtures/naver-theme-list.html`, `naver-theme-detail.html` (실측 캡처)
- [ ] 알파스퀘어 JSON fixture — `tests/fixtures/alpha-all-themes.json`, `alpha-stocks.json` (실측 캡처)
- [ ] `server` themes 라우트 supertest 스텁
- [ ] `webapp` Playwright `themes.spec.ts` / `user-themes.spec.ts` / `theme-chips.spec.ts` 스텁 + auth storageState 재사용
- [ ] cheerio / iconv-lite 설치 (`pnpm -F @gh-radar/theme-sync add cheerio iconv-lite`)

---

## Manual-Only Verifications

> checkpoint:human-action / blocking 태스크 — 자동화 불가, 실행 시 수동 검증.

| Behavior | Plan/Task | Requirement | Why Manual | Test Instructions |
|----------|-----------|-------------|------------|-------------------|
| production Supabase 마이그레이션 적용 | 10-02 Task 3 | THEME-01,03 | DDL 을 실 DB 에 적용(되돌리기 어려움) | `pnpm supabase db push` → `Finished supabase db push.` + 테이블 생성 확인 |
| AI 보강 POC 게이트 | 10-06 Task 3 | THEME-04 | 발굴 정확도/비용은 샘플 실측 판단 필요 | 작은 샘플 발굴 → 정확도/비용 확인 → 미달 시 `source='ai_candidate'` 비표시 격리 |
| GCP 배포 + production smoke + E2E 실행 | 10-08 Task 3 | THEME-01~04 | Cloud Run Job/Scheduler 실배포 + 실서버 E2E | 배포 → Job 1회 실행 `themes count > 0` → Playwright E2E green |

---

## Validation Sign-Off

- [x] 모든 `auto` 태스크에 `<automated>` verify 또는 Wave 0 의존성 보유
- [x] 샘플링 연속성: automated verify 없는 태스크 3연속 구간 없음 (checkpoint 3개는 manual 표 분리)
- [x] Wave 0 (Plan 10-01) 가 모든 fixture/mock/스텁 MISSING 참조 커버
- [x] watch-mode 플래그 없음
- [x] 피드백 지연 < 60s (unit/integration)
- [x] `nyquist_compliant: true`

**Approval:** approved 2026-06-09 (RESEARCH §Validation Architecture 전사 + plan 매핑)
