---
phase: "34"
slug: "accum"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-20"
---

# Phase 34 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | worker vitest(`@gh-radar/limitup-sync`) · server vitest + supertest · relay vitest(`tests/accum-backfill.test.ts`) · webapp vitest(jsdom · RTL) + Playwright 1.59 · pgTAP(일회용 로컬 컨테이너 — `scripts/verify-dma-orders-price-check.sh --test`) |
| **Config file** | `workers/limitup-sync/vitest.config.ts` · `server/vitest.config.ts` · `relay/vitest.config.ts`(maxWorkers 2 · passWithNoTests) · `webapp/vitest.config.ts`(include `src/**/*.test.{ts,tsx}`) · `webapp/playwright.config.ts`(dev 포트 3100) · pgTAP 러너 이미지 `public.ecr.aws/supabase/postgres:17.6.1.104`(로컬 보유 — 리서치 확인) |
| **Quick run command** | 워커 `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/limitup-sync exec vitest run tests/dispatch.test.ts tests/load.test.ts tests/dispatch-dryrun-totals.test.ts --maxWorkers=2` · server `pnpm --filter @gh-radar/server exec vitest run tests/routes/accum-report.test.ts --maxWorkers=2` · relay `pnpm --filter @gh-radar/relay exec vitest run tests/accum-backfill.test.ts --maxWorkers=2` · 웹 `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/accum-report.test.ts src/lib/__tests__/accum-chart.test.ts src/components/analytics/__tests__/accum-report.test.tsx src/components/analytics/__tests__/accum-detail.test.tsx src/hooks/__tests__/use-chart-view.test.tsx --maxWorkers=2` |
| **Full suite command** | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/limitup-sync run typecheck && pnpm --filter @gh-radar/limitup-sync exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay exec vitest run tests/accum-backfill.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/accum-report.spec.ts e2e/specs/sidebar-tree.spec.ts e2e/specs/teamflow-report.spec.ts e2e/specs/limitup-report.spec.ts --workers=1` + pgTAP 4파일(`limitup_load` · `accum_report` · `teamflow_report` · `limitup_report`) — 정본 = 34-10 Task 3 |
| **Estimated runtime** | 단위 ~150초 · E2E ~240초 · pgTAP 파일당 ~60초(전 마이그레이션 재생) |

주의: server · webapp 의 `test` 스크립트는 watch / passWithNoTests 라 쓰지 않는다 — 반드시 `exec vitest run <파일>`. relay 는 passWithNoTests 라 0건도 exit 0 — passed 수를 본다. 동시 세션 메모리 고갈 사고(10-10) — vitest `--maxWorkers=2` · playwright `--workers=1` · 전체 회귀는 34-10 한 곳만. Playwright webServer 타임아웃이면 `rm -rf webapp/.next`. pgTAP 러너 exit 3 = 이미지/도커 없음 = **미실행**(통과 아님 — 34-11 Task 1 이 push 전 사용자 승인).

---

## Sampling Rate

- **After every task commit:** 해당 패키지 quick 명령(위 표 · 각 PLAN `<verify>` 의 파일 단위)
- **After every plan wave:** 그 웨이브가 닿은 패키지의 typecheck + vitest · E2E 가 생긴 웨이브(8 · 9)는 해당 spec · pgTAP 은 SQL 이 바뀐 웨이브(1 → limitup_load 재생 · 4 → accum_report + limitup_load 섹션 K)
- **Before `/gsd-verify-work`:** Full suite green(34-10 Task 3) + pgTAP 4파일 ok 또는 「pgTAP 미실행」 명시 → 배포(34-11) → 라이브 스모크 INV-1~9 · UAT(34-12)
- **Max feedback latency:** 150 seconds(단위) · E2E 는 웨이브 끝

---

## Per-Task Verification Map

보안 검사는 이 프로젝트에서 끔(`security_enforcement: false`) — Threat Ref 는 「—」, Secure Behavior 열에는 접근 경로 관련 동작만 적는다. REQ-ID 가 없는 phase 라(ROADMAP Requirements TBD) Requirement 열은 ROADMAP Success Criteria(SC1~6) · CONTEXT 결정(D-NN)으로 적는다.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 34-01-01 | 34-01 | 1 | SC1 · SC2 · D-01 · D-02 · D-05 · D-06 · D-07 | — | 표 정책 0 · 두 RPC EXECUTE service_role 만 · SECURITY INVOKER | integration(트레이서 전반 — 픽스처 → SQL 재생 → 워커 stage · 층 커밋 2개) | C1 `node -e …(픽스처 6행) && grep …(마이그레이션 핵심 문) && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/limitup_load.test.sql` → C2 `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/limitup-sync run typecheck && pnpm --filter @gh-radar/limitup-sync exec vitest run tests/dispatch.test.ts tests/load.test.ts tests/dispatch-dryrun-totals.test.ts --maxWorkers=2`(정본 = 34-01 Task 1 verify) | ❌ W0(픽스처 · 마이그레이션 신규) | ⬜ pending |
| 34-02-01 | 34-02 | 1 | SC5 · D-23 | — | 읽기 전용(select 만) | unit(TDD · 가짜 Supabase 2페이지) | `pnpm --filter @gh-radar/relay exec vitest run tests/accum-backfill.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests` | ❌ W0 | ⬜ pending |
| 34-02-02 | 34-02 | 1 | SC5 · D-23 | — | 비밀 비출력 · 쓰기 호출 0 | unit + script(--help · bash -n) | 34-02-01 명령 `&& bash -n scripts/export-accum-backfill.sh && test -x scripts/export-accum-backfill.sh && pnpm --filter @gh-radar/relay exec tsx ../scripts/export-accum-backfill.ts --help` | ❌ W0 | ⬜ pending |
| 34-13-01 | 34-13 | 2 | SC2 · SC3 · D-06 · D-07 · D-08 · D-13 · D-19 · D-22 | — | 라우트는 requireAuth · 게이트는 RPC 안 · server 는 RPC 만 부름 · 웹은 표 직접 조회 없음 | integration(트레이서 후반 — shared → server → 웹 RTL · 층 커밋 2개 · C4 = 워커 · server · 웹 전 층 판정) | C3 `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run tests/routes/accum-report.test.ts tests/routes/teamflow-report.test.ts --maxWorkers=2` → C4 전 층(C2 워커 명령 + C3 server 명령 + `pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/components/analytics/__tests__/accum-report.test.tsx src/components/analytics/__tests__/teamflow-report.test.tsx --maxWorkers=2` — 정본 = 34-13 Task 1 verify) | ❌ W0(server 테스트 · RTL · 웹 픽스처 로더 신규) | ⬜ pending |
| 34-03-01 | 34-03 | 3 | SC1 · D-02 · D-04 | — | 수동 UPDATE 없는 재적재 | unit(TDD · 재적재 감지) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/limitup-sync run typecheck && pnpm --filter @gh-radar/limitup-sync exec vitest run tests/dispatch.test.ts tests/load.test.ts tests/dispatch-dryrun-totals.test.ts --maxWorkers=2` | ✅ 수정 | ⬜ pending |
| 34-03-02 | 34-03 | 3 | SC1 · D-02 · D-03 | — | N/A | unit(탐지 0 manifest · 동시 backfill) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/limitup-sync run typecheck && pnpm --filter @gh-radar/limitup-sync exec vitest run --maxWorkers=2` | ✅ 수정 | ⬜ pending |
| 34-04-01 | 34-04 | 4 | SC3 · D-09 | — | N/A | unit + RTL(KPI 골든) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/accum-report.test.ts src/components/analytics/__tests__/accum-report.test.tsx --maxWorkers=2` | ❌ W0 | ⬜ pending |
| 34-04-02 | 34-04 | 4 | SC3 · D-08 · D-10~D-13 | — | N/A | unit + RTL(행 변환 · 상태 조합) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/accum-report.test.ts src/components/analytics/__tests__/accum-report.test.tsx src/components/analytics/__tests__/teamflow-report.test.tsx --maxWorkers=2` | ✅(04-01 생성) | ⬜ pending |
| 34-05-01 | 34-05 | 4 | SC2 · D-03 · D-06 · D-07 | — | anon/authenticated 권한 0 · RLS 정책 0 · SECURITY INVOKER | pgTAP(트레이서) | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/accum_report.test.sql` | ❌ W0 | ⬜ pending |
| 34-05-02 | 34-05 | 4 | SC1 · D-01 | — | 표 잠금 | pgTAP(섹션 K + 회귀) | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/limitup_load.test.sql && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/teamflow_report.test.sql && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/limitup_report.test.sql` | ✅ 수정 | ⬜ pending |
| 34-05-03 | 34-05 | 4 | SC1 · D-02 | — | N/A | script(syntax · grep) | `bash -n scripts/smoke-limitup-sync.sh && grep -q "inv9_accum_flow_rows" scripts/smoke-limitup-sync.sh && grep -q 'manifest_rows "accum_flow.ndjson.gz"' scripts/smoke-limitup-sync.sh && grep -q "INV-9" scripts/smoke-limitup-sync.sh && grep -q "inv8_team_flow_rows" scripts/smoke-limitup-sync.sh` | ✅ 수정 | ⬜ pending |
| 34-06-01 | 34-06 | 5 | SC4 · D-14 · D-17 | — | N/A | unit + RTL(TDD · 가격 판 · 1:1 viewBox) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/accum-chart.test.ts src/components/analytics/__tests__/accum-detail.test.tsx --maxWorkers=2` | ❌ W0 | ⬜ pending |
| 34-06-02 | 34-06 | 5 | SC4 · D-14 · D-15 · D-16 · D-18 | — | N/A | unit + RTL + 토큰 | `… vitest run src/lib/__tests__/accum-chart.test.ts src/components/analytics/__tests__/accum-detail.test.tsx src/styles/__tests__/tds-tokens.test.ts --maxWorkers=2` | ✅(06-01 생성) | ⬜ pending |
| 34-06-03 | 34-06 | 5 | SC4 · D-16 | — | N/A | unit + RTL(세로선 · 라벨 · 눈금) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/accum-chart.test.ts src/components/analytics/__tests__/accum-detail.test.tsx src/components/analytics/__tests__/accum-report.test.tsx --maxWorkers=2` | ✅ | ⬜ pending |
| 34-07-01 | 34-07 | 6 | SC4 · D-14 · D-18 | — | N/A | unit + RTL(프리셋 · 범례 · 캡션) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/accum-chart.test.ts src/components/analytics/__tests__/accum-detail.test.tsx --maxWorkers=2` | ✅ | ⬜ pending |
| 34-07-02 | 34-07 | 6 | SC4 · D-14 | — | N/A | unit(훅 — 휠 · 포인터 · 키보드 · rAF) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/hooks/__tests__/use-chart-view.test.tsx src/lib/__tests__/accum-chart.test.ts src/components/analytics/__tests__/accum-detail.test.tsx --maxWorkers=2` | ❌ W0 | ⬜ pending |
| 34-08-01 | 34-08 | 7 | D-20 | — | N/A | unit + RTL(사이클 표) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/accum-report.test.ts src/components/analytics/__tests__/accum-detail.test.tsx --maxWorkers=2` | ✅ | ⬜ pending |
| 34-08-02 | 34-08 | 7 | D-19 · D-21 · D-22 | — | N/A | unit + RTL(손익 · 판정 기준 · 출처 칩 · 순서) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/accum-report.test.ts src/components/analytics/__tests__/accum-detail.test.tsx src/components/analytics/__tests__/accum-report.test.tsx src/components/analytics/__tests__/teamflow-detail.test.tsx --maxWorkers=2` | ✅ | ⬜ pending |
| 34-09-01 | 34-09 | 8 | SC3 · SC6 · D-06 · D-14 | — | N/A | E2E(트레이서 — 상세 1회 · 프리셋 · 휠 · 캐시) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/accum-report.spec.ts --workers=1` | ❌ W0 | ⬜ pending |
| 34-09-02 | 34-09 | 8 | D-27 | — | 메뉴 숨김 ≠ 권한 — 직접 진입 403 → DmaGate | unit + E2E(사이드바) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/components/layout/__tests__/app-sidebar.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/sidebar-tree.spec.ts --workers=1` | ✅ 수정 | ⬜ pending |
| 34-10-01 | 34-10 | 9 | SC6 · D-08 · D-14 · D-20 | — | N/A | E2E(폰 390 트레이서) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/accum-report.spec.ts --workers=1` | ✅(09-01 생성) | ⬜ pending |
| 34-10-02 | 34-10 | 9 | UI 백스톱 6종 | — | 403 목 → DmaGate | E2E(백스톱 · 빈 상태 · 게이트) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/accum-report.spec.ts --workers=1` | ✅ | ⬜ pending |
| 34-10-03 | 34-10 | 9 | SC6 | — | N/A | 전 워크스페이스 회귀 + pgTAP 4 | Full suite command(위 표) + pgTAP 4파일 | ✅ | ⬜ pending |
| 34-11-01 | 34-11 | 10 | [BLOCKING] SC1 · SC2 · D-25 | — | 원격 스키마 적용 | 메인 세션 체크포인트(`supabase db push --linked --yes` · migration list) | — (메인 세션 · resume-signal) | — | ⬜ pending |
| 34-11-02 | 34-11 | 10 | SC5 · D-23 · D-24 · D-25 | — | 비밀 비출력 · 읽기 전용 소급 | 메인 세션 체크포인트(Job 재배포 · 소급 실행 · 핸드오프) | — (메인 세션) | — | ⬜ pending |
| 34-11-03 | 34-11 | 10 | SC1 · SC5 · D-25 · D-26 | — | 무인증 401 | 메인 세션 체크포인트(운반 · Job 실행 · 스모크 INV-9 · server) | `bash scripts/smoke-limitup-sync.sh --date 20261019` · `--date 20261020`(메인 세션) | ✅ | ⬜ pending |
| 34-12-01 | 34-12 | 11 | SC6 · D-25 · D-26 | — | N/A | 라이브 UAT(메인 세션 · 사용자) | — (manual) | — | ⬜ pending |
| 34-12-02 | 34-12 | 11 | SC6 · D-24 | — | N/A | doc(인박스 닫기) | `f=docs/inbox/from-gh-trade/261020-accum-flow-export.md; grep -qE '^status: done$' "$f" && h=$(sed -n 's/^done_commit: *//p' "$f") && test -n "$h" && git cat-file -e "${h}^{commit}" && grep -q "accum_detail_for_user" "$f" && grep -q "accum_flow_backfill" "$f" && grep -q "5e7aad3b" "$f" && grep -q "CR-02" "$f"` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

프레임워크 설치는 없다(새 패키지 0 · pgTAP 러너 이미지는 로컬 보유). 아래 신규 파일은 각 플랜의 첫 태스크(트레이서 · TDD RED)가 만든다:

- [ ] `workers/limitup-sync/tests/fixtures/accum_flow/20261014/accum_flow.ndjson.gz` + `tests/fixtures/make-accum-fixture.mjs` — 맥 샘플 34행 중 6행(34-01 C1)
- [ ] `supabase/migrations/20261020200000_limitup_accum_flow.sql` · `20261020200100_accum_report_rpc.sql` — 34-01 C1(기존 `limitup_load.test.sql` 로 재생 검증)
- [ ] `server/tests/routes/accum-report.test.ts` — 34-13 C3
- [ ] `webapp/src/test-fixtures/accum-export.ts` · `webapp/src/components/analytics/__tests__/accum-report.test.tsx` — 34-13 C4(합성 행은 34-04 · 34-06 이 더함)
- [ ] `relay/tests/accum-backfill.test.ts` — 34-02 Task 1
- [ ] 탐지 0 manifest 픽스처 — 34-03 Task 2 가 테스트 안에서 임시 디렉터리에 생성(커밋 바이너리 없음)
- [ ] `webapp/src/lib/__tests__/accum-report.test.ts` — 34-04 Task 1
- [ ] `supabase/tests/accum_report.test.sql` — 34-05 Task 1 · `limitup_load.test.sql` 섹션 K — 34-05 Task 2
- [ ] `webapp/src/lib/__tests__/accum-chart.test.ts` · `webapp/src/components/analytics/__tests__/accum-detail.test.tsx` — 34-06 Task 1
- [ ] `webapp/src/hooks/__tests__/use-chart-view.test.tsx` — 34-07 Task 2
- [ ] `webapp/e2e/specs/accum-report.spec.ts` · `webapp/e2e/fixtures/accum-report.ts` — 34-09 Task 1
- [ ] `scripts/smoke-limitup-sync.sh` INV-9 — 34-05 Task 3

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 원격 스키마 적용 · Job/server 재배포 · 소급 실행 · gh-trade 119 배치 · 운반 | SC1 · SC2 · SC5 · D-23 · D-25 | 배포 · 비밀 · 외부 세션 — 서브에이전트 금지(분류기 차단) | 34-11 Task 1~3 instructions(메인 세션) · 스모크 INV-1~9 |
| 10/19 · 10/20 실물 라이브 UAT(차트 체감 · 폰 핀치 · 끊김 없는 확대/이동 — 리서치 A1) | SC6 · D-26 | 실데이터 · 실기기 · 사용자 판단 | 34-12 Task 1 (a)~(d) |
| 폰 툴팁 대체 수용 · 목록 사이클 배지 불일치 수용(UI-SPEC unresolved 2건) | D-11 · D-15 | 사용자 결정 | ① 폰 툴팁 = 34-12 Task 1 질문 ① · ② 사이클 배지 기준 = 34-11 Task 1 단계 0b(db push 전 — 원격 미적용 RPC 라 추가 마이그레이션 없이 바꿀 수 있을 때) |
| 인박스 회신 뒤 gh-trade-f4 통지 | D-24 | SendMessage 는 메인 세션 도구 | 34-12 Task 2 보고의 메인 세션 후속 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 150s(단위)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending — 플랜 체커 · 실행 뒤 validate-phase 가 정한다(status draft 유지)
