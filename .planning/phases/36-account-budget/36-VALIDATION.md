---
phase: "36"
slug: "account-budget"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 36-00-01 | 00 | 0 | D-16 | — | N/A | typecheck | `pnpm --filter @gh-radar/relay run typecheck:tests` | ✅ (현재 FAIL) | ⬜ pending |
| 36-xx-xx | — | — | D-11/D-09/D-02 | — | N/A | unit | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/account-budget.test.ts` | ❌ W0 | ⬜ pending |
| 36-xx-xx | — | — | D-06/D-03/D-05 | — | N/A | unit | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/admin.test.ts src/__tests__/admin-overview.test.ts` | ✅ | ⬜ pending |
| 36-xx-xx | — | — | op 6/7 · 87 3필드 | — | N/A | unit | `pnpm --filter @gh-radar/relay exec vitest run src/dma/__tests__/envelope.test.ts tests/admin-conn.test.ts --maxWorkers=2` | ✅ | ⬜ pending |
| 36-xx-xx | — | — | D-14 | — | N/A | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/account-state.test.ts --maxWorkers=2` | ✅ | ⬜ pending |
| 36-xx-xx | — | — | D-15 (relay) | — | N/A | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/journal-codec.test.ts tests/journal-writer.test.ts --maxWorkers=2` | ✅ | ⬜ pending |
| 36-xx-xx | — | — | D-07/D-04/D-05 | — | N/A | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/admin-dispatcher.test.ts tests/admin-api.test.ts --maxWorkers=2` | ✅ | ⬜ pending |
| 36-xx-xx | — | — | server 프록시 · D-17 | — | requireAdmin / requireAuth | route | `pnpm --filter @gh-radar/server exec vitest run tests/routes/admin-dma.test.ts tests/routes/admin.test.ts tests/routes/pnl.test.ts --maxWorkers=2` | ✅ / ❌ W0 (pnl) | ⬜ pending |
| 36-xx-xx | — | — | D-15 DB | — | service_role 전용 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_journal_apply.test.sql` | ✅ | ⬜ pending |
| 36-xx-xx | — | — | D-18/D-19 DB | — | REVOKE anon/authenticated · 가시성 조인 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_pnl_daily.test.sql` | ❌ W0 | ⬜ pending |
| 36-xx-xx | — | — | D-01~D-03/D-06 UI | — | N/A | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/admin/__tests__/account-editor.test.tsx --maxWorkers=2` | ✅ | ⬜ pending |
| 36-xx-xx | — | — | D-08/D-09/D-12/D-13 UI | — | N/A | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/orderbook/__tests__/account-panel.test.tsx src/components/trading/__tests__/manual-order-form.test.tsx src/components/trading/__tests__/limit-chaser-form.test.tsx --maxWorkers=2` | ✅ | ⬜ pending |
| 36-xx-xx | — | — | D-17/D-18 UI | — | N/A | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/__tests__/me-client.test.tsx src/components/pnl/__tests__/pnl-report.test.tsx --maxWorkers=2` | ✅ / ❌ W0 | ⬜ pending |
| 36-xx-xx | — | — | 사이드바 · E2E | — | N/A | e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/sidebar-tree.spec.ts e2e/specs/admin.spec.ts e2e/specs/me.spec.ts --workers=1` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky* — Task ID 는 플래너가 PLAN.md 확정 뒤 채운다.

---

## Wave 0 Requirements

- [ ] `relay/tests/helpers/frames.ts` — `buildAccountStateFrame` 에 `budgetKrw` 8번째 인자 · `buildJournalBatchFrame` 4필드(기본 0) · `FakeAdminAccountInput` 에 `budgetKrw/feePpm/sellTaxPpm`(주어질 때만 add) — `typecheck:tests` 현재 FAIL 복구
- [ ] `packages/shared/src/__tests__/account-budget.test.ts` — 계산 · 포맷 · ppm
- [ ] `supabase/tests/dma_pnl_daily.test.sql` — 일자 집계 RPC
- [ ] `server/tests/routes/pnl.test.ts` — /me 손익 라우트
- [ ] `webapp/src/components/pnl/__tests__/pnl-report.test.tsx` — 행 펼침 · 포맷
- [ ] `supabase/tests/dma_journal_apply.test.sql` · `dma_journal_schema.test.sql` — `plan(N)` 갱신

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 어드민 저장 → 86 code 0 · 87 전 행 값 · 67 한도 전용 수신 · 같은 값 재전송 「변경 없음」 | SC-6 (라이브 UAT) | 실서버(gh-trade Phase 41 배포본) 와 relay 연결 필요 | relay 배포(20:00 KST 뒤) → 어드민 카드에서 예수금 저장 → 칩 ok · 웹 계좌 패널 즉시 갱신 확인 |
| 체결 뒤 저널 4값 적재 · 매매손익 페이지 행 | D-15/D-18 | 실체결 필요 | 장중 체결 1건 뒤 `/admin/pnl` · `/me` 손익 탭에서 당일 행 확인 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
