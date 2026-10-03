---
phase: "19"
slug: "account-order-journal"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
# 2026-10-03 validate-phase §6 State A: 읽기전용 감사(HEAD 9dc19d4b) → validated · 갭 0 · superseded 1(19-02-T3 의 orderbook.spec 절반)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-09-24"
validated: "2026-10-03"
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
| 19-02-T1 · T2 | 19-02 | 1 | D-01 | — | order.result rid 경로 불변 · DB 쓰기 0 | integration + grep | `pnpm --filter @gh-radar/relay exec vitest run tests/ws-order.test.ts tests/fanout.test.ts` · grep 게이트 `OrderStore`·`insertRequest`·`dma_orders` (relay/src) | ✅ | ✅ green (2026-10-03 · ws-order 54 · fanout 80 · grep 0건) |
| 19-02-T3 | 19-02 | 1 | D-01 | — | 주문 화면 「DB 기록 0건」 e2e | e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts` (:1392 · :1501 「DB 기록 0건 (D-01)」) | ✅ (trading-workbench) · — (orderbook.spec 삭제) | ✅ green (trading-workbench 단언 존속 · 이번 감사 e2e 미재실행) · orderbook.spec 절반 SUPERSEDED (Phase 21 D-31 삭제, d33572c1) |
| 19-01-T1 · 19-03-T2 | 19-01 · 19-03 | 1 · 2 | D-02 | — | 로컬 거부 reject_seq 행 분리 | pgTAP + unit | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_journal_apply.test.sql` · `pnpm --filter @gh-radar/relay exec vitest run tests/journal-codec.test.ts` | ✅ | ✅ green (pgTAP apply 79/79 · #61–64 · journal-codec 11) |
| 19-05-T1 | 19-05 | 3 | D-03 | T-15-02 | journal.rows 는 매핑 사용자에게만 | integration + unit | `pnpm --filter @gh-radar/relay exec vitest run tests/journal-push.test.ts` · `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/__tests__/today-orders-card.test.tsx src/lib/__tests__/relay-socket.test.ts` | ✅ | ✅ green (journal-push 10 · today-orders-card 51 · relay-socket 126) |
| 19-07-T3 | 19-07 | 4 | D-04 | — | healthz 장중 180s 초과 → 503 | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/order-api.test.ts tests/journal-status.test.ts` | ✅ | ✅ green (order-api 44 · journal-status 35) |
| 19-01-T2 | 19-01 | 1 | D-05 | IDOR | RPC EXECUTE service_role 만 · REVOKE anon/authenticated | pgTAP + integration | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_journal_schema.test.sql` · `pnpm --filter @gh-radar/server exec vitest run tests/routes/orders.test.ts` | ✅ | ✅ green (pgTAP schema 93/93 · server orders 21) |
| 19-01-T1 · 19-04-T1 | 19-01 · 19-04 | 1 · 2 | D-06 | IDOR | 매핑 계좌 전 행 · 미매핑 사용자 0행 | pgTAP + integration | 위 러너(apply #14 · #26 · #28) · `tests/journal-push.test.ts` ②④ | ✅ | ✅ green (두 사용자 동일 행은 19-13 실장 대조로 종결 — `19-RECONCILIATION.md` 203=203) |
| 19-08-T1 · T2 · T3 | 19-08 | 4 | D-07/D-08 | — | 계좌별 묶음 · 칩(origin null 생략) · NXT 태그 · 390px wrap | unit + e2e | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/__tests__/today-orders-card.test.tsx src/components/orderbook/__tests__/account-panel.test.tsx` · `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/me.spec.ts` | ✅ | ✅ green (today-orders-card ⑪-1~⑪-6 · ⑫-1~⑫-6 · account-panel 74 · me.spec 이번 감사 미실행) |
| 19-07-T2 · 19-09-T3 | 19-07 · 19-09 | 4 · 5 | D-09 | — | 관찰자 로그인 거부 → 재시도 0 | integration | `pnpm --filter @gh-radar/relay exec vitest run tests/journal-observer.test.ts tests/journal-gateway.test.ts` | ✅ | ✅ green (journal-observer 32 · ⑤ · journal-gateway 8) |
| 19-07 · 19-10 | 19-07 · 19-10 | 4 · 6 | D-10 | — | 관찰자 비밀 단일 인증 · 운영에서 비밀 없으면 기동 거부 · 배포 스크립트 구문 | unit + 정적 | `pnpm --filter @gh-radar/relay exec vitest run tests/journal-observer.test.ts tests/journal-boot.test.ts` · `bash -n` 배포 스크립트 | ✅ | ✅ green (journal-observer ⑭⑮ loadConfig · journal-boot 10 · `bash -n` OK) |
| 19-01 · 19-05 | 19-01 · 19-05 | 1 · 3 | D-11 | — | 게이트웨이 전 계좌 기록(미매핑 포함) · 표시 범위는 D-06 매핑으로만 | pgTAP + integration | 위 러너(apply #24 · #28) · `tests/journal-push.test.ts` ③ | ✅ | ✅ green |
| 19-05-T2 · 19-03-T1/T3 | 19-05 · 19-03 | 3 · 2 | D-12 | — | since_seq · epoch resync · 재적용 멱등 | integration + pgTAP | `pnpm --filter @gh-radar/relay exec vitest run tests/journal-writer.test.ts tests/journal-observer.test.ts tests/journal-gateway.test.ts` · pgTAP apply | ✅ | ✅ green (journal-writer 17 · journal-observer ⑦⑨ · journal-gateway ② · pgTAP #18–22 · #69–72) |
| 19-07-T2 · 19-10-T1 | 19-07 · 19-10 | 4 · 6 | D-13 | — | 무한 백오프 · 종료 시 커서 미전진 | integration | `pnpm --filter @gh-radar/relay exec vitest run tests/dma-client.test.ts tests/journal-writer.test.ts tests/journal-observer.test.ts tests/journal-boot.test.ts` | ✅ | ✅ green (dma-client 11 · ④⑩⑪ · journal-writer ⑧⑨ · journal-observer ⑪ · journal-boot) |
| 19-11 · 19-12 · 19-13 | 19-11 · 19-12 · 19-13 | 7 | D-14 | — | 배포 순서 · 첫 거래일 실장 대조 | manual | Manual-Only 표 참조 | — | ✅ 종결 (`19-RECONCILIATION.md` · 09-28~10-02 불일치 0 · seq 1~5062 연속) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `supabase/tests/dma_journal_schema.test.sql` — 제약·RLS·REVOKE·EXECUTE 권한 (D-05)
- [x] `supabase/tests/dma_journal_apply.test.sql` — 투영 규칙 + 멱등 + 로컬 거부 분리 + 매핑 조회 (D-02·D-06·D-12)
- [x] `relay/tests/helpers/fake-gateway.ts` 확장 — 관찰자 로그인 응답·JournalBatch·거부
- [x] `relay/tests/journal-observer.test.ts`
- [x] `relay/tests/journal-writer.test.ts`
- [x] `relay/tests/journal-push.test.ts`
- [x] grep 게이트: relay/src 에 `OrderStore`·`insertRequest`·`dma_orders` 쓰기 0, webapp 카드 `label.meta` 렌더 0

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 배포 순서(DB → gh-trade → relay → server → webapp push) | D-14 | 실서버·20:00 이후 창 | RESEARCH §배포 순서 1~7 — ✅ 종결(19-11 · 19-12) |
| 첫 거래일 실장 대조 | D-14 | 브로커 체결내역은 사용자만 조회 가능 | 계좌별 브로커 체결내역 vs 게이트웨이 저널 vs 새 테이블 건수·상태 불일치 0 — ✅ 종결(19-13 · `19-RECONCILIATION.md` · 09-28~10-02 불일치 0 · seq 1~5062 연속) |
| 두 사용자(같은 DMA 계정) 동일 표시 | D-06 | 실사용자 토큰 | `GET /api/orders` 행 수·id 집합 동일 — ✅ 종결(19-13 · 203=203) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-10-03 (validate-phase §6 State A · HEAD 9dc19d4b)

---

## Validation Audit 2026-10-03

> 읽기전용 감사(HEAD 9dc19d4b). 실행 결과: relay 14 파일 466 ✓ · dma-client 11 ✓ · server 21 ✓ · shared journal 7 ✓ · webapp 6 파일 355 ✓ · pgTAP schema 93/93 · apply 79/79 — 실패 0. e2e(`trading-workbench.spec.ts` · `me.spec.ts`)는 이번 감사에서 재실행하지 않았다. D-10 · D-11 행은 이번 감사에서 신설.

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
| Superseded | 1 (19-02-T3 의 orderbook.spec 절반 — Phase 21 D-31 삭제, d33572c1) |
