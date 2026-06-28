---
phase: 12
slug: a-n-master-sync
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-27
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> 본 phase의 핵심 검증 대상은 **상한가 가격 산출 규칙 + 이벤트 판별 SQL**이다.
> RESEARCH.md "Validation Architecture"의 황금 케이스 fixture(000390 4회, 000440 4회/점상1)를
> 기준으로 RPC 백테스트 결과의 정확성을 증명한다.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest(shared limitUpPrice 미러 + server 라우트 + webapp 순수함수) + SQL fixture/db lint(RPC) + prod curl(server 라우트) + 수동 시각 확인(webapp) |
| **Config file** | `packages/shared/vitest.config.ts`, `server/vitest.config.ts`, `webapp` vitest; RPC는 마이그레이션으로 배포(검증은 `supabase db lint` + 황금 케이스 쿼리) |
| **Quick run command** | `pnpm -F @gh-radar/shared test` (limitUpPrice 황금 케이스) / `psql "$SUPABASE_DB_URL" -f .planning/phases/12-a-n-master-sync/fixtures/limit_up_golden.sql` |
| **Full suite command** | `pnpm -r test` + RPC rebuild 후 황금 케이스 종목(000390/000440) 결과 대조 + prod `curl /api/stocks/000440/limit-up` |
| **Estimated runtime** | 단위 테스트 ~초, RPC rebuild ~수십초(1.4M행), 검증 쿼리 ~초 단위 |

---

## Sampling Rate

- **After every task commit:** 해당 task가 SQL/RPC면 황금 케이스 쿼리(+`db lint`) 재실행, 코드면 변경 워크스페이스 `pnpm -F <pkg> test`, webapp 컴포넌트면 빌드 통과
- **After every plan wave:** 마이그레이션 push 후 `rebuild_limit_up` RPC 실행 → 황금 케이스 대조
- **Before `/gsd-verify-work`:** RPC 결과가 RESEARCH 황금 케이스(000390 4회·000440 4회/점상1·다음날 시초가 수익률)와 일치 + server 라우트 prod curl 200
- **Max feedback latency:** RPC rebuild 포함 ~60초

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-T1 | 01 | 1 | LIMIT-01 | T-12-01-01 | limitUpPrice 호가단위 산출 정확(경계 포함) — TS 미러로 RPC 회귀 대조 | unit | `pnpm -F @gh-radar/shared test` | ✅ 12-01 생성 | ⬜ pending |
| 12-01-T2 | 01 | 1 | LIMIT-01 | T-12-01-01 | limit-up-sync 워커 rebuild_limit_up RPC 1줄 호출 + jsonb 로깅 | unit | `pnpm -F @gh-radar/limit-up-sync test` | ✅ 12-01 생성 | ⬜ pending |
| 12-02-T1 | 02 | 2 | LIMIT-01 | T-12-02-01/02 | RPC SECURITY DEFINER + search_path 격리, REVOKE anon/authenticated; 상한가가격 = floor(전일종가×1.3/tick)×tick, change_rate<=31 게이트 | sql-lint + sql-fixture | `supabase db lint` + `psql -f fixtures/limit_up_golden.sql` | ✅ 12-02 생성 | ⬜ pending |
| 12-02-T3 | 02 | 2 | LIMIT-01 | T-12-02-01 | RPC 실데이터 정확성(000390 4회·000440 4회/점상1) + anon RPC 4xx(REVOKE) | sql-assert (prod) | 황금 케이스 fixture 카운트 대조 + anon REST | ✅ 12-02 생성 | ⬜ pending |
| 12-03-T2 | 03 | 3 | LIMIT-01 | T-12-03-01 | server 라우트 `{...}` 객체 반환, :code regex 검증, 읽기전용(on-demand 재계산 금지) | unit + prod-curl | `pnpm -F @gh-radar/server test` + `curl /api/stocks/:code/limit-up` | ✅ 12-03 생성 | ⬜ pending |
| 12-05-T2 | 05 | 4 | LIMIT-01 | T-12-05-02 | N≥3 게이팅(표본<3이면 큰 % 숨김) + spark 버킷 색 매핑(index 2 = up, off-by-one 회귀) | unit | `pnpm -F @gh-radar/webapp test -- limit-up-format` | ✅ 12-05 생성 | ⬜ pending |
| 12-05-T5 | 05 | 4 | LIMIT-01 | T-12-05-03 | 회전율 listing_shares NULL→"—", ②안 레이아웃 시각 | manual-visual | 종목상세 카드 시각 확인 | ✅ 12-05 마운트 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `packages/shared/src/limitUp.test.ts` (12-01 Task 1) — limitUpPrice 호가단위 경계 + 실측 황금 케이스(95500→124100 … 386000→501000) 단위 테스트
- [x] `fixtures/limit_up_golden.sql` (12-02 Task 2) — RESEARCH 황금 케이스(000390 4회, 000440 4회/점상1) 기대 이벤트·다음날 수익률·stats 일관성 검증 쿼리 + limit_up_price 5 케이스
- [x] `workers/limit-up-sync/tests/{config,rebuild}.test.ts` (12-01 Task 2) — 워커 RPC 호출 단위 테스트(co-movement-sync 복제)
- [x] `webapp/src/lib/limit-up-format.test.ts` (12-05 Task 2) — N≥3 게이팅 + spark 버킷 색 매핑 단위 테스트

*상한가가격 plpgsql 표현식은 12-01 의 TS 미러(limitUpPrice) 단위 테스트 + 12-02 fixture 의 `limit_up_price()` SQL 직접 검증 양쪽으로 커버.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 히어로 KPI 4그리드/분포 spark/OHLC 이벤트 표/테마 풀링 바 시각 표시 | LIMIT-01 | 시각 레이아웃·색상(수익=빨강 --up/손실=파랑 --down)은 자동 검증 불가 | 종목상세 `/stocks/000440` 진입, 목업 ②안(데이터 대시보드)과 대조 |
| N≥3 게이팅·빈 상태(이벤트 0회) 카피 | LIMIT-01 | 표본 분기별 UX는 실데이터 종목으로 시각 확인 (게이팅 로직 자체는 12-05-T2 단위 테스트로 박제) | 표본<3 종목·이벤트 0회 종목(대형주 005930)·N≥3 종목 각각 확인 |

---

## Validation Sign-Off

- [x] 모든 SQL/RPC task가 황금 케이스 fixture(+db lint)로 검증되거나 Wave 0 의존
- [x] Sampling continuity: SQL 검증 없는 task 3연속 금지 (각 plan 단위 테스트/fixture/curl 분산)
- [x] Wave 0이 황금 케이스 fixture + tick 표현식 검증(limitUpPrice TS 미러 + SQL) 커버
- [x] No watch-mode flags (전 verify 가 `test run`/`db lint`/`curl` 단발)
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved (planner self-validation — Wave 0 테스트 자산이 12-01/12-02/12-05 에 실제 task 로 존재)
