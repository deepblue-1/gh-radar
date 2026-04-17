---
phase: 8
slug: discussion-board
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> 본 문서는 `08-RESEARCH.md` §"Sampling Rate (Validation Architecture)" 를 phase 계약으로 고정한다.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (worker + server) · Playwright (webapp E2E) |
| **Config file** | `workers/discussion-sync/vitest.config.ts` (Wave 0 생성 — Phase 7 복제) · `server/vitest.config.ts` (기존) · `webapp/playwright.config.ts` (기존) |
| **Quick run (worker)** | `pnpm -F @gh-radar/discussion-sync test --run` |
| **Quick run (server)** | `pnpm -F @gh-radar/server test -- discussions.test.ts --run` |
| **Quick run (webapp E2E)** | `pnpm -F webapp e2e --grep discussions` |
| **Full suite** | `pnpm -r test --run && pnpm -F webapp e2e` |
| **Estimated runtime** | ~90 초 (unit+integration) + ~45 초 (E2E) |

---

## Sampling Rate

- **After every task commit:** 해당 workspace quick run
  - worker 파일 수정 → `pnpm -F @gh-radar/discussion-sync test --run`
  - server 파일 수정 → `pnpm -F @gh-radar/server test -- discussions.test.ts --run`
  - webapp 파일 수정 → `pnpm -F webapp test --run` + (UI 영향 시) E2E grep
- **After every plan wave:** 해당 wave 전체 workspace test + 관련 E2E smoke
- **Before `/gsd-verify-work`:** Full suite + 프로덕션 smoke (`scripts/smoke-discussion-sync.sh`) 모두 green
- **Max feedback latency:** 120 초 (full suite)

---

## Per-Task Verification Map

*Wave/Task ID는 planner 확정 후 갱신. 초기 스텁은 Phase 7 복제 매핑 기준.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-00-xx | 00 POC | 0 | DISC-01 | — | 프록시·DOM 실증 리포트 | manual | `scripts/poc-discussion-sync.sh` | ❌ W0 | ⬜ pending |
| 08-01-xx | 01 shared types | 0 | DISC-01 (3) | T-01-XSS | camelCase 타입 계약 + sanitize unit | unit | `pnpm -F @gh-radar/shared test --run` | ❌ W0 | ⬜ pending |
| 08-02-xx | 02 worker | 1 | DISC-01 (3) | T-02-proxy / T-05-budget | UPSERT + 예산 카운터 + per-stock try/catch | unit | `pnpm -F @gh-radar/discussion-sync test --run` | ❌ W0 | ⬜ pending |
| 08-03-xx | 03 server route | 1 | DISC-01 (2) | T-03-rate / T-06-input | 캐시 TTL 10분 + 쿨다운 30초 + Zod clamp | integration | `pnpm -F @gh-radar/server test -- discussions.test.ts --run` | ❌ W0 | ⬜ pending |
| 08-04-xx | 04 webapp UI | 2 | DISC-01 (1) | T-04-tabnabbing | Card 5건 + 에러/로딩 state + line-clamp-2 | unit + E2E | `pnpm -F webapp test --run` + `pnpm -F webapp e2e --grep discussions` | ❌ W0 | ⬜ pending |
| 08-05-xx | 05 full page | 2 | DISC-01 (1) | — | `/stocks/[code]/discussions` 50건 + back-nav | E2E | `pnpm -F webapp e2e --grep "discussions full"` | ❌ W0 | ⬜ pending |
| 08-06-xx | 06 deploy/E2E | 3 | DISC-01 (2,3) | T-07-secret | OAuth invoker + Secret Manager + smoke green | manual + E2E | `scripts/smoke-discussion-sync.sh` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Continuity guarantee:** 모든 wave 에 최소 1개의 automated verify 존재. Wave 0 POC 는 manual 이나, 산출물 자체가 이후 wave 의 fixture/config 이므로 Nyquist 중단 없음.

---

## Wave 0 Requirements

- [ ] `packages/shared/src/discussion.ts` — camelCase `Discussion` 타입
- [ ] `packages/shared/src/discussion-sanitize.ts` — `stripHtmlToPlaintext`, `extractNid`, `parseNaverBoardDate` (+ unit tests)
- [ ] `workers/discussion-sync/` 디렉터리 스캐폴드 (package.json, tsconfig.json, Dockerfile — Phase 7 news-sync 복제 후 rename)
- [ ] `workers/discussion-sync/vitest.config.ts` (Phase 7 복제)
- [ ] `workers/discussion-sync/tests/helpers/naver-board-fixtures.ts` — 실제 네이버 HTML 샘플 (POC 캡처본, EUC-KR/UTF-8 양쪽)
- [ ] `server/tests/routes/discussions.test.ts` — stub (it.todo 8개: 캐시 hit/miss, 쿨다운 429, Zod clamp, 에러 envelope, 빈 상태, retry_after, upsert 결과, 필터)
- [ ] `webapp/e2e/fixtures/discussions.ts` — camelCase sample + `mockDiscussionsApi` (Phase 7 mock-api.ts 복제)
- [ ] `webapp/e2e/specs/discussions.spec.ts` — stub (detail Card + full page + 쿨다운 + back-nav)
- [ ] `scripts/setup-discussion-sync-iam.sh` + `deploy-discussion-sync.sh` + `smoke-discussion-sync.sh` 스캐폴드 (Phase 7 복제)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 프록시 서비스 선정 POC | DISC-01 (2,3) | 실제 네이버 DOM 접근 + 결제 수반 + 제품 품질 판단 | 1) 대표 5 종목(삼성전자/카카오/LG에너지솔루션/에코프로/테슬라 한국) × 1~2주 스크래핑 2) (a) 내용 유용성, (b) 차단률/HTTP 상태 분포, (c) 비용 실측 기록 → `.planning/phases/08-discussion-board/POC-RESULTS.md` |
| Cloud Scheduler OAuth invoker 동작 | DISC-01 (2) | GCP IAM 실제 바인딩 필수 (Phase 05.1 Pitfall 2) | `scripts/deploy-discussion-sync.sh` 실행 후 `gcloud scheduler jobs run gh-radar-discussion-sync-hourly` → Job 로그 Succeeded 확인 |
| 프로덕션 smoke 종합 | DISC-01 전체 | 실제 Supabase + Cloud Run + 프록시 모두 연동 | `scripts/smoke-discussion-sync.sh` → (1) Job 수동 실행 → (2) `/api/stocks/005930/discussions` 응답 확인 → (3) `/stocks/005930` 브라우저 확인 |
| 접근성 검사 (axe-core) | DISC-01 (1) | UI-SPEC §접근성 기준 충족 | `pnpm -F webapp e2e --grep "discussions axe"` — serious/critical 0 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify OR Wave 0 dependency 명시
- [ ] Sampling continuity: 3 연속 task 중 1개 이상 automated verify 보장 (Wave 0 POC 포함 연속 2 task 까지만 manual 허용)
- [ ] Wave 0 covers all MISSING references (위 체크리스트)
- [ ] No watch-mode flags (`--run` 강제)
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` 는 planner 최종 PLAN.md 산출 후 checker 검증 통과 시 갱신

**Approval:** pending
