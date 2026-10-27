---
phase: "36"
slug: "account-budget"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: true
wave_0_complete: true
# planner revision 2026-10-27: nyquist_compliant · wave_0_complete 는 계획 시점 판정(전 태스크 <automated> + fails_when · MISSING 0 · Wave 0 파일마다 생성 태스크 지정). status 는 lifecycle 대로 validate-phase §6 이 validated 로 올린다(실행 전이라 draft 유지).
created: "2026-10-27"
---

# Phase 36 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (shared · relay · server · webapp) · pgTAP via docker · Playwright (workers 1) |
| **Config file** | `packages/shared/vitest.config.ts` · `relay/vitest.config.ts` · `server/vitest.config.ts` · `webapp/vitest.config.ts` · `webapp/playwright.config.ts` |
| **Quick run command** | `pnpm --filter @gh-radar/<ws> exec vitest run <file> --maxWorkers=2` · pgTAP `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/<file>.test.sql` |
| **Full suite command** | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck` + `pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run test` (+ shared · server vitest · 바뀐 pgTAP · E2E `--workers=1`) |
| **Estimated runtime** | quick ~10–40초 · full ~5–10분 (E2E 포함) |

---

## Sampling Rate

- **After every task commit:** Run that workspace's quick command (shared 변경 시 `pnpm --filter @gh-radar/shared build` 먼저)
- **After every plan wave:** Run build_command 전체 + 바뀐 워크스페이스 vitest 전체 + 바뀐 pgTAP 파일
- **Before `/gsd-verify-work`:** Full suite must be green (전 워크스페이스 vitest + pgTAP dma_journal_apply · dma_journal_schema · dma_pnl_daily · dma_strategy_read + E2E 2~3 spec). 동시 세션 규칙상 전체 회귀는 한 세션만.
- **Max feedback latency:** 60 seconds (quick)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 36-01-01 | 01 | 1 | D-16 · D-14 · D-08 · D-09 · D-11 | — | N/A | typecheck + unit + component | `pnpm --filter @gh-radar/relay run typecheck:tests` · `… shared exec vitest run src/__tests__/account-budget.test.ts` · `… relay exec vitest run tests/account-state.test.ts` · `… webapp exec vitest run src/components/orderbook/__tests__/account-panel.test.tsx` | ✅ / ❌ 36-01-01 생성(account-budget.test.ts) | ⬜ pending |
| 36-10-01 | 10 | 2 | D-06 · D-04 · D-03 · D-05 | — | N/A | unit | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/admin.test.ts src/__tests__/admin-overview.test.ts src/__tests__/order-endpoint.test.ts --maxWorkers=2` | ✅ | ⬜ pending |
| 36-10-02 | 10 | 2 | D-02 · D-18 · D-13 | — | N/A | unit | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/account-budget.test.ts src/__tests__/pnl.test.ts --maxWorkers=2` | ❌ 36-10-02 생성(pnl.test.ts) | ⬜ pending |
| 36-02-01 | 02 | 3 | op 6 · D-01 · D-04 · D-06 · D-07(fan-out) | — | requireAdmin 은 Express · relay 는 X-Relay-Secret | unit | `pnpm --filter @gh-radar/relay exec vitest run src/dma/__tests__/envelope.test.ts tests/admin-dispatcher.test.ts tests/admin-api.test.ts --maxWorkers=2` | ✅ | ⬜ pending |
| 36-02-02 | 02 | 3 | op 7 · 87 3필드 · D-02 · D-05 | — | N/A | unit | `… relay exec vitest run … tests/admin-conn.test.ts tests/admin-planner.test.ts tests/admin-snapshot-sink.test.ts --maxWorkers=2` | ✅ | ⬜ pending |
| 36-03-01 | 03 | 3 | D-01 · D-06 · server 프록시 | — | requireAdmin | route + component | `pnpm --filter @gh-radar/server exec vitest run tests/routes/admin-dma.test.ts --maxWorkers=2` · `… webapp exec vitest run src/components/admin/__tests__/account-editor.test.tsx --maxWorkers=2` | ✅ | ⬜ pending |
| 36-03-02 | 03 | 3 | D-02 · D-03 · D-06 · D-04 | — | requireAdmin | route + component | 같은 두 명령 | ✅ | ⬜ pending |
| 36-03-03 | 03 | 3 | D-01 ~ D-06 E2E | — | N/A | e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/admin.spec.ts --workers=1` | ✅ | ⬜ pending |
| 36-04-01 | 04 | 4 | D-05 | — | N/A | unit + route | `… relay exec vitest run tests/hub.test.ts tests/admin-api.test.ts` · `… server exec vitest run tests/routes/admin.test.ts` | ✅ | ⬜ pending |
| 36-04-02 | 04 | 4 | D-05 op 5 스로틀 | — | N/A | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/admin-api.test.ts --maxWorkers=2` | ✅ | ⬜ pending |
| 36-04-03 | 04 | 4 | D-07 · D-04 | — | N/A | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/admin-dispatcher.test.ts tests/admin-planner.test.ts --maxWorkers=2` | ✅ | ⬜ pending |
| 36-05-01 | 05 | 4 | D-15 (one-way 체크포인트) | — | N/A | decision | — (사용자 승인 원문) | — | ⬜ pending |
| 36-05-02 | 05 | 4 | D-15 | — | service_role 전용(apply) | unit + pgTAP | `… relay exec vitest run tests/journal-codec.test.ts tests/journal-writer.test.ts` · `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_journal_apply.test.sql` · `… --test supabase/tests/dma_journal_schema.test.sql` | ✅ | ⬜ pending |
| 36-06-01 | 06 | 3 | D-11 · D-12 | — | N/A | unit + component | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/use-available-krw.test.ts src/components/trading/__tests__/manual-order-form.test.tsx src/components/trading/__tests__/trading-workbench.test.tsx --maxWorkers=2` | ❌ 36-06-01 생성(use-available-krw.test.ts) | ⬜ pending |
| 36-06-02 | 06 | 3 | D-13 · UI E3 overflow 백스톱 | — | N/A | component + e2e | `… webapp exec vitest run src/components/trading/__tests__/limit-chaser-form.test.tsx` · `… playwright test e2e/specs/trading-workbench.spec.ts --grep "카드 컨테이너\|4c\.\|18\. 폰 밴드" --workers=1` | ✅ | ⬜ pending |
| 36-07-01 | 07 | 5 | D-17 ② · D-18 · D-19 | — | 가시성 조인 · REVOKE anon/authenticated · requireAuth | pgTAP + route | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_pnl_daily.test.sql` · `… server exec vitest run tests/routes/pnl.test.ts tests/routes/orders.test.ts` | ❌ 36-07-01 생성(dma_pnl_daily.test.sql · pnl.test.ts) | ⬜ pending |
| 36-07-02 | 07 | 5 | D-17 ① · D-18 · D-19 | — | requireAdmin · REVOKE anon/authenticated | pgTAP + route | 같은 pgTAP · `… server exec vitest run tests/routes/admin-pnl.test.ts …` | ❌ 36-07-02 생성(admin-pnl.test.ts) | ⬜ pending |
| 36-08-01 | 08 | 6 | D-17 ② · D-18 | — | N/A | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/pnl/__tests__/pnl-report.test.tsx src/components/trading/__tests__/me-client.test.tsx --maxWorkers=2` | ❌ 36-08-01 생성(pnl-report.test.tsx) | ⬜ pending |
| 36-08-02 | 08 | 6 | D-17 ① · 사이드바 | — | N/A | component | `… webapp exec vitest run src/components/pnl/__tests__/pnl-admin-client.test.tsx src/components/layout/__tests__/app-sidebar.test.tsx --maxWorkers=2` | ❌ 36-08-02 생성(pnl-admin-client.test.tsx) | ⬜ pending |
| 36-08-03 | 08 | 6 | E2E · UI E2 백스톱 · 전체 회귀 게이트 | — | N/A | e2e + full suite + pgTAP | `… playwright test e2e/specs/me.spec.ts e2e/specs/admin-pnl.spec.ts e2e/specs/sidebar-tree.spec.ts e2e/specs/admin.spec.ts --workers=1` · 전 워크스페이스 vitest · pgTAP 4파일 | ❌ 36-08-03 생성(admin-pnl.spec.ts) | ⬜ pending |
| 36-09-01 | 09 | 7 | [BLOCKING] schema push · D-16 배포 순서 | — | N/A | manual (메인 세션) | `supabase migration list --linked` | — | ⬜ pending |
| 36-09-02 | 09 | 7 | SC 6 라이브 UAT | — | N/A | manual (UAT) | `supabase migration list --linked` | — | ⬜ pending |
| 36-09-03 | 09 | 7 | D-16 인박스 닫기 | — | N/A | source | 두 노트 `status: done` · `done_commit` · `## 회신` grep | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky* — Task ID 는 플래너가 PLAN.md 확정 뒤 채웠다(2026-10-27 · checker 수정으로 옛 36-01-02/03 → 36-10-01/02 · 웨이브 7개). 「Wave 0」 테스트 파일은 별도 웨이브 없이 각 태스크가 처음 만든다(File Exists 칸의 생성 태스크).

---

## Wave 0 Requirements

- [x] `relay/tests/helpers/frames.ts` — `buildAccountStateFrame` 에 `budgetKrw` 8번째 인자 · `buildJournalBatchFrame` 4필드(기본 0) · `FakeAdminAccountInput` 에 `budgetKrw/feePpm/sellTaxPpm`(주어질 때만 add) — `typecheck:tests` 현재 FAIL 복구 → 생성 태스크 36-01-01(8인자 · 0n×4) · 36-02-02(87 입력) · 36-05-02(저널 4필드 입력)
- [x] `packages/shared/src/__tests__/account-budget.test.ts` — 계산 · 포맷 · ppm → 36-01-01(계산 · formatManwonFloor) · 36-10-02(ppm · 손익 포맷 · 파서 · 상따 합)
- [x] `supabase/tests/dma_pnl_daily.test.sql` — 일자 집계 RPC → 36-07-01
- [x] `server/tests/routes/pnl.test.ts` — /me 손익 라우트 → 36-07-01
- [x] `webapp/src/components/pnl/__tests__/pnl-report.test.tsx` — 행 펼침 · 포맷 → 36-08-01
- [x] `supabase/tests/dma_journal_apply.test.sql` · `dma_journal_schema.test.sql` — `plan(N)` 갱신 → 36-05-02

체크 = 생성 태스크가 정해져 있고 그 태스크의 `<automated>` 가 그 파일을 돌린다(계획 시점 판정 · `<automated>MISSING` 0건). 파일 실재는 실행 뒤 validate-phase 가 본다.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 어드민 저장 → 86 code 0 · 87 전 행 값 · 67 한도 전용 수신 · 같은 값 재전송 「변경 없음」 | SC-6 (라이브 UAT) | 실서버(gh-trade Phase 41 배포본) 와 relay 연결 필요 | relay 배포(20:00 KST 뒤) → 어드민 카드에서 예수금 저장 → 칩 ok · 웹 계좌 패널 즉시 갱신 확인 |
| 체결 뒤 저널 4값 적재 · 매매손익 페이지 행 | D-15/D-18 | 실체결 필요 | 장중 체결 1건 뒤 `/admin/pnl` · `/me` 손익 탭에서 당일 행 확인 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s — quick 명령 기준(E2E 태스크 36-03-03 · 36-06-02 · 36-08-03 과 36-08-03 회귀 게이트는 예외 · Check 8b WARNING 수준)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planner 계획 시점 확인 2026-10-27(체커 수정 라운드) — 실행 뒤 validate-phase §6 이 `status: validated` 로 올린다
