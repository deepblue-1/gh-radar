---
phase: "19"
slug: "account-order-journal"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-24"
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> 원천: `19-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (relay `vitest run` · server `exec vitest run` — 기본 스크립트는 watch · webapp `vitest --run`) + pgTAP(로컬 Postgres 17 컨테이너) + Playwright(webapp e2e) |
| **Config file** | `relay/vitest.config.ts`, `webapp/vitest.config.ts`, `webapp/playwright.config.ts`, server vitest 기본 |
| **Quick run command** | `pnpm --filter @gh-radar/relay exec vitest run tests/<file>.test.ts` (워크스페이스별 동형) |
| **Full suite command** | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run test && pnpm --filter @gh-radar/server exec vitest run` + pgTAP 2파일 |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** 해당 파일 quick run + 변경 워크스페이스 typecheck
- **After every plan wave:** Full suite command + pgTAP (`bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_journal_*.test.sql`)
- **Before `/gsd-verify-work`:** Full suite green + `sync-relay-schema.sh --check` 차이 0 + Playwright `me.spec.ts` + (배포 후) `smoke-relay.sh` PASS
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (planner fills) | | | D-01 | — | order.result rid 경로 불변 · DB 쓰기 0 | integration | `pnpm --filter @gh-radar/relay exec vitest run tests/ws-order.test.ts` | ✅ | ⬜ pending |
| (planner fills) | | | D-02 | — | 로컬 거부 reject_seq 행 분리 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_journal_apply.test.sql` | ❌ W0 | ⬜ pending |
| (planner fills) | | | D-03 | T-15-02 | journal.rows 는 매핑 사용자에게만 | integration | `pnpm --filter @gh-radar/relay exec vitest run tests/journal-push.test.ts` | ❌ W0 | ⬜ pending |
| (planner fills) | | | D-04 | — | healthz 장중 180s 초과 → 503 | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/order-api.test.ts` | ✅ | ⬜ pending |
| (planner fills) | | | D-05 | IDOR | RPC EXECUTE service_role 만 · REVOKE anon/authenticated | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_journal_schema.test.sql` | ❌ W0 | ⬜ pending |
| (planner fills) | | | D-06 | IDOR | 매핑 계좌 전 행 · 미매핑 사용자 0행 | pgTAP | 위 러너 | ❌ W0 | ⬜ pending |
| (planner fills) | | | D-07/D-08 | — | 계좌별 묶음 · 칩(origin null 생략) · NXT 태그 · 390px wrap | unit + e2e | `pnpm --filter @gh-radar/webapp exec vitest run` · `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/me.spec.ts` | ✅ | ⬜ pending |
| (planner fills) | | | D-09 | — | 관찰자 로그인 거부 → 재시도 0 | integration | `pnpm --filter @gh-radar/relay exec vitest run tests/journal-observer.test.ts` | ❌ W0 | ⬜ pending |
| (planner fills) | | | D-12 | — | since_seq · epoch resync · 재적용 멱등 | integration + pgTAP | `pnpm --filter @gh-radar/relay exec vitest run tests/journal-writer.test.ts` | ❌ W0 | ⬜ pending |
| (planner fills) | | | D-13 | — | 무한 백오프 · 종료 시 커서 미전진 | integration | `pnpm --filter @gh-radar/relay exec vitest run tests/journal-observer.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `supabase/tests/dma_journal_schema.test.sql` — 제약·RLS·REVOKE·EXECUTE 권한 (D-05)
- [ ] `supabase/tests/dma_journal_apply.test.sql` — 투영 규칙 + 멱등 + 로컬 거부 분리 + 매핑 조회 (D-02·D-06·D-12)
- [ ] `relay/tests/helpers/fake-gateway.ts` 확장 — 관찰자 로그인 응답·JournalBatch·거부
- [ ] `relay/tests/journal-observer.test.ts`
- [ ] `relay/tests/journal-writer.test.ts`
- [ ] `relay/tests/journal-push.test.ts`
- [ ] grep 게이트: relay/src 에 `OrderStore`·`insertRequest`·`dma_orders` 쓰기 0, webapp 카드 `label.meta` 렌더 0

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 배포 순서(DB → gh-trade → relay → server → webapp push) | D-14 | 실서버·20:00 이후 창 | RESEARCH §배포 순서 1~7 |
| 첫 거래일 실장 대조 | D-14 | 브로커 체결내역은 사용자만 조회 가능 | 계좌별 브로커 체결내역 vs 게이트웨이 저널 vs 새 테이블 건수·상태 불일치 0 |
| 두 사용자(같은 DMA 계정) 동일 표시 | D-06 | 실사용자 토큰 | `GET /api/orders` 행 수·id 집합 동일 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
