---
phase: 36-account-budget
verified: 2026-10-28T07:05:00Z
status: passed
score: 6/6 must-haves verified
covered_files:
  - ".planning/phases/36-account-budget/36-01-PLAN.md"
  - ".planning/phases/36-account-budget/36-01-SUMMARY.md"
  - ".planning/phases/36-account-budget/36-02-PLAN.md"
  - ".planning/phases/36-account-budget/36-02-SUMMARY.md"
  - ".planning/phases/36-account-budget/36-03-PLAN.md"
  - ".planning/phases/36-account-budget/36-03-SUMMARY.md"
  - ".planning/phases/36-account-budget/36-04-PLAN.md"
  - ".planning/phases/36-account-budget/36-04-SUMMARY.md"
  - ".planning/phases/36-account-budget/36-05-PLAN.md"
  - ".planning/phases/36-account-budget/36-05-SUMMARY.md"
  - ".planning/phases/36-account-budget/36-06-PLAN.md"
  - ".planning/phases/36-account-budget/36-06-SUMMARY.md"
  - ".planning/phases/36-account-budget/36-07-PLAN.md"
  - ".planning/phases/36-account-budget/36-07-SUMMARY.md"
  - ".planning/phases/36-account-budget/36-08-PLAN.md"
  - ".planning/phases/36-account-budget/36-08-SUMMARY.md"
  - ".planning/phases/36-account-budget/36-09-PLAN.md"
  - ".planning/phases/36-account-budget/36-09-SUMMARY.md"
  - ".planning/phases/36-account-budget/36-10-PLAN.md"
  - ".planning/phases/36-account-budget/36-10-SUMMARY.md"
  - "packages/shared/src/account-budget.ts"
  - "packages/shared/src/admin.ts"
  - "packages/shared/src/pnl.ts"
  - "relay/src/admin/admin-api.ts"
  - "relay/src/admin/admin-conn.ts"
  - "relay/src/admin/dispatcher.ts"
  - "relay/src/admin/types.ts"
  - "relay/src/dma/envelope.ts"
  - "relay/src/hub/subscription-hub.ts"
  - "relay/src/journal/writer.ts"
  - "server/src/routes/admin-pnl.ts"
  - "server/src/routes/admin.ts"
  - "server/src/routes/pnl.ts"
  - "server/src/services/pnl.ts"
  - "supabase/migrations/20261028210000_dma_journal_pnl.sql"
  - "supabase/migrations/20261028210100_dma_pnl_rpcs.sql"
  - "webapp/src/components/admin/account-editor.tsx"
  - "webapp/src/components/orderbook/account-panel.tsx"
  - "webapp/src/components/pnl/pnl-admin-client.tsx"
  - "webapp/src/components/pnl/pnl-report.tsx"
  - "webapp/src/components/trading/card/manual-order-form.tsx"
  - "webapp/src/components/trading/limit-chaser-form.tsx"
  - "webapp/src/components/trading/me-client.tsx"
  - "webapp/src/lib/use-available-krw.ts"
covered_digest: "v3:sha256:c3b39b8f06085f58a09fd2a03c95c938dcc2b1c857873313633bcb6313dc6e9f"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 6/6
  gaps_closed:
    - "WR-05 — /me 잔고 탭 계좌 패널 priceOf 미주입 (22dd07c7, 이후 4bd0464a 로 구독 방식 보강)"
    - "WR-01 — 고치지 않은 예수금 칸 Enter 가 op 6 로 서버 조정 원 값을 만원 내림으로 덮음 (3feb08dc)"
    - "WR-02 — 67 live 를 87 보다 무조건 우선 (e1f352a8, freshLiveBudget 수신 시각 비교)"
    - "WR-03 — op 3 뒤 되싣기가 같은 서버 계획의 다른 op 실패에 묶임 (c3a6bd74)"
    - "R2 CR-01 — 「확인 전」 빈 칸 Enter 가 예수금 · 비용률 해제 (d13d32cb)"
    - "R2 WR-01 — 불일치 상태 안 고친 Enter 가 서버 조정분을 되감음 (7dc67654)"
    - "R2 WR-02 — /me 시세 미구독 · 굳은 옛 시세 (4bd0464a)"
    - "R2 WR-03 — timeout 뒤 되싣기 영구 누락 (6f9cb46a, 87 상태 기준 멱등 조건)"
  gaps_remaining: []
  regressions: []
---

# Phase 36: 계좌별 주문가능 금액 Verification Report

**Phase Goal:** gh-trade Phase 41 계약(op 6 SetAccountBudget · op 7 SetAccountFee · 87 `budget_krw`·`fee_ppm`·`sell_tax_ppm` · 66/67 `budget_krw` · 80 저널 손익 4필드)을 받아 ① 어드민이 계좌별 예수금·수수료·매도세를 설정(등록 서버 전부 fan-out · 서버별 칩 · op 3 뒤 되싣기) ② 웹 주문 화면이 「주문가능 금액」 실시간 표시 · 초과 경고(차단 없음) ③ 66/67 예수금을 마지막 값으로 덮기 ④ 저널 손익 4필드를 DB 에 적재해 「일자별 매매손익」(`/admin/pnl` · `/me` 「손익」 탭).
**Verified:** 2026-10-28T07:05:00Z
**Status:** passed
**Re-verification:** Yes — 이전 36-VERIFICATION.md(`human_needed`, 2026-10-28T02:10Z)는 코드 리뷰 수정 2라운드와 `/admin/pnl` 칩 줄 커밋 뒤 소스가 바뀌어 낡았다. 이전 report 의 `gaps:` 는 없었고(`human_needed`), 사람 판단 2건(WR-05 처리 결정 · WR-01~04 시점 결정)이 열려 있었다. 이번에 6개 Success Criteria 를 HEAD(`5cac157b`) 기준으로 다시 전수 확인하고, 고쳤다는 8건이 실제 코드에 있는지 직접 읽어 대조했다.

판정 요약: 6/6 Success Criteria 가 코드 · 마이그레이션 · 라우트 · 화면 · 테스트로 실재하고 배선돼 있다. 이전 `human_needed` 사유였던 리뷰 경고 WR-01·02·03·05 와 2라운드 CR-01 · WR-01~03(R2)은 SUMMARY 서술이 아니라 현재 소스에서 수정이 확인됐고(아래 "리뷰 수정 대조"), 각 수정의 회귀 테스트가 현재 소스에서 통과한다. 남은 것은 WR-04 한 건뿐이며 사용자가 후속으로 미루기로 결정(36-UAT.md 테스트 4)한 설계 범위 결정 사항이라 이번 목표 달성을 막지 않는다.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 목업 확인(D-00) | ✓ VERIFIED | `.planning/phases/36-account-budget/reference/` 존재 (36-VALIDATION · 36-UI-SPEC 가 채택 목업 ⑤ A 안 참조) |
| 2 | relay: op 6/op 7 송신 · 86 code 해석 · 87 3필드 파싱 · 66/67 `budget_krw` 마지막 값 덮기 · 저널 손익 4필드 파싱 · op 3 뒤 서버 간 되싣기 · op 6/7 은 반영 칩 기록(`dma_admin_results`) 밖 | ✓ VERIFIED | `relay/src/admin/types.ts:39` `SetAccountBudget: 6`; `envelope.ts:3360-3401` op 6 만 `addBudgetKrw`(ulong 가드 3361-3363), op 7 만 `addFeePpm`·`addSellTaxPpm`(uint32 가드); `envelope.ts:3484-3486` 87 `budgetKrw`·`feePpm`·`sellTaxPpm` 파싱; `envelope.ts:2489` 66/67 `budgetKrw`; `subscription-hub.ts:3768` 델타 병합 `budgetKrw: next.budgetKrw`(마지막 값 덮기); `envelope.ts:3589-3592` 저널 4필드 `toNum`; `dispatcher.ts:464-466` 되싣기(`#reloadCosts`). 행동 의존 truth(덮기 · 되싣기)는 단일 파일 테스트로 직접 확인 — relay `admin-dispatcher` · `admin-api` · `account-state` · `journal-codec` 4파일 192 passed(직접 실행). dispatcher ⑥-b/⑥-d/⑥-e/⑥-f 가 되싣기 경계(뒤 op 실패 · 87 0 상태 복구 · timeout 뒤 다음 reconcile 복구 · 미설정 계좌 두드리지 않음)를 행사 |
| 3 | server/shared: 어드민 쓰기 2종(PUT budget · fee · requireAdmin) · 개요에 서버별 예수금·비용률(67 live 우선 · 87 폴백) · 주문가능 계산·표기·% ↔ ppm 은 shared 한 벌 | ✓ VERIFIED | `server/src/routes/admin.ts:610` PUT `…/budget`(`AdminAccountBudgetSchema` 631 fee 동일 구조) → `relay.setAccountBudget/Fee`; `server/src/app.ts` 에서 `/api/pnl` · adminPnlRouter 마운트(112, 129-130); `relay/src/admin/admin-api.ts:930-938` `GET /account-costs` 가 `freshLiveBudget(live, snapshotAtMs)` 로 `liveBudgetKrw` 를 싣고 87 폴백; `packages/shared/src/account-budget.ts:41-56` `availableKrwOf`(예수금 ≤ 0 → null · 보유 `avgPrice×qty` 차감 · 매수 미체결만, `pendingCancelSent` 제외, price 0 이면 `priceOf` 현재가 없으면 0 · 매도 미체결 제외 — 로드맵 계산식과 일치) · `formatManwonFloor`(만원 내림, 음수 0) · `COST_PPM_MAX`. shared `account-budget.test.ts` 57 passed(직접 실행) |
| 4 | DB: `dma_journal_events` bigint 4열(기본 0) · `dma_journal_apply` 재정의 · 일자 집계 RPC(어드민 계정별/계좌별 · /me 가시성 조인) · REVOKE anon/authenticated | ✓ VERIFIED | `20261028210000_dma_journal_pnl.sql:32-36` `ADD COLUMN avg_price/fee_krw/tax_krw/realized_pnl_krw bigint NOT NULL DEFAULT 0`, `dma_journal_apply` 재정의(47) + REVOKE(199-200); `20261028210100_dma_pnl_rpcs.sql` `dma_pnl_daily_build`·`dma_pnl_daily_for_user`·`dma_pnl_daily_for_admin` 3종 각각 REVOKE PUBLIC · anon/authenticated(162-163, 182-183, 203-204); `relay/src/journal/writer.ts:207-212` 이벤트 키 `avg_price`·`fee_krw`·`tax_krw`·`realized_pnl_krw` = DB 열; 마이그레이션 두 개는 시각을 Phase 35 원격 적용분 뒤(`20261028210000/210100`)로 옮긴 최종본이며 원격 적용은 요청 문맥의 확인된 사실(직접 `db` 조회는 하지 않음) |
| 5 | webapp: 어드민 카드 「예수금 · 수수료 · 매도세」 상시 행 · 계좌 패널 요약 줄 · 수동주문 「주문가능」 행 + 초과 검증 줄 · 상따 합산 경고 · `/admin/pnl`(계정별 \| 계좌별) · `/me` 「손익」 탭 | ✓ VERIFIED | `account-editor.tsx` `saveBudget`·`saveFee`(814-882) · `budgetKrwToSave`(583) · `useCostDraft`(`dirty` 692); `account-panel.tsx:1714` `BudgetSummaryLine`(`data-slot="account-budget-summary"`, 645 · 1014 호출); `manual-order-form.tsx:1015` `mo-available` · 1077 `manual-order-budget-over`(`useAvailableKrw` 431); `limit-chaser-form.tsx:2001` `lc-budget-over`(`useAvailableKrw` 829); `webapp/src/app/admin/pnl/page.tsx` + `PnlAdminClient`(`fetchAdminPnl`) ; `me-client.tsx:316` `{ v: "pnl", label: "손익" }` · `fetchMyPnl`; `app-sidebar.tsx:201` `NAV_ADMIN_PNL`. 화면 단위 테스트 4파일(`pnl-admin-client` 9 · `pnl-report` 9 · `account-editor` 121 · `me-client` 34) 173 passed(직접 실행) |
| 6 | 라이브 UAT · 인박스 `261027-account-budget.md` · `261027-account-pnl.md` 를 `status: done` 으로 닫기 | ✓ VERIFIED | 두 노트 frontmatter `status: done` 직접 확인. 36-UAT.md `status: complete` — 8건 중 7 pass · 1 skipped(WR-04 deferred follow-up) · issues 0. 라이브 UAT 는 이 검증에서 재현하지 않고 사용자 기록(「모두 pass」)에 의존 |

**Score:** 6/6 truths verified (0 present, behavior-unverified)

### 리뷰 수정 대조 (SUMMARY 가 아니라 현재 소스를 읽어 확인)

| 건 | 수정이 현재 코드에 있는가 | 증거 |
|----|--------------------------|------|
| WR-01 (R1) 만원 표기 vs 원 단위 비교 | 예 | `account-editor.tsx:583-591` `budgetKrwToSave` — 칸 글자가 서버 값의 만원 내림 표기와 같으면 서버 원 값 그대로. `saveBudget` 826 에서 사용 |
| WR-02 (R1) 67 live 무조건 우선 | 예 | `relay/src/admin/types.ts:222-226` `freshLiveBudget`(live 가 87 수신보다 늦을 때만 live); `subscription-hub.ts:995` `#accountStateAtMs` · `liveBudgetOf` 가 `{krw, atMs}` 반환(2260); `admin-api.ts:930-938` · `dispatcher.ts:587` 두 곳 적용. 테스트 ⑤-b · C2b |
| WR-03 (R1) 되싣기가 다른 op 실패에 묶임 | 예 | `dispatcher.ts:464` `failure === null \|\| failure.outcome === "failed"`; 테스트 ⑥-b |
| WR-05 (R1) `/me` priceOf 없음 | 예 (R2 로 구독 방식으로 대체·보강) | `me-client.tsx:412-413,537` `priceIsinsOf` + `useSubscribedPriceOf` → `<AccountPanel priceOf={priceOf}>`. 테스트 B4c · B4d |
| CR-01 (R2) 「확인 전」 빈 칸 Enter 로 해제 | 예 | `account-editor.tsx:819-824` 확인 전 빈 예수금 → 요청 없음; 853-870 확인 전 수수료·매도세는 한 칸이라도 비면 보내지 않음. 테스트 `(CR-01)` 접두 |
| WR-01 (R2) 불일치 상태 안 고친 Enter | 예 | `useCostDraft` `dirty: edited \|\| hold`(692); `saveBudget` 814 · `saveFee` 846 이 `!dirty` 면 「변경 없음」·요청 없음 |
| WR-02 (R2) `/me` 시세 미구독 · 굳은 값 | 예 | `use-available-krw.ts:62-76` `priceIsinsOf`, 93-156 `useSubscribedPriceOf` — 구독 뒤 새로 온 시세 객체(`q !== h.base`)만 사용, 키 집합 변경 시 새 키 먼저 잡고 빠진 키만 해제, 언마운트 시 전부 해제 |
| WR-03 (R2) timeout 뒤 되싣기 영구 누락 | 예 | `dispatcher.ts:490-545` `#reloadCosts` 가 ① `firstSeen` ② 87 `costsUnsetIn`(예수금·수수료·매도세 전부 0) 대상 분리, `unset` 은 송신 전 op 5 재조회로 재확인(fail closed), 출처 값 전부 0 이면 보내지 않음(멱등). 테스트 ⑥-d/⑥-e/⑥-f |

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | G: STATE 「켜기 전 결정」 에 예수금 갈림 한 줄 반영 | Phase 35 종료 뒤 | 36-09-SUMMARY — 로드맵 SC 에 들어 있지 않은 문서화 항목이라 gap 아님 |

WR-04(공유 계좌 반영 범위)는 후속 phase 가 로드맵에 있지 않아 Step 9b 의 deferred 에 넣지 않았다. 사용자가 36-UAT.md 테스트 4 에서 「4 미룸」 으로 결정한 후속 작업이며 아래 경고에 기록한다.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/shared/src/account-budget.ts` | 주문가능·표기·ppm 한 벌 | ✓ VERIFIED | 실질 구현, relay/webapp 사용, 테스트 57 |
| `packages/shared/src/pnl.ts` | PnlReport 타입·기간 | ✓ VERIFIED | server schemas · webapp(`PnlGroup`·`PNL_RANGES`)에서 사용 |
| `relay/src/admin/dispatcher.ts` | op 6/7 fan-out · 되싣기 | ✓ VERIFIED | `#applyServer` · `#reloadCosts` · `#costSourceOf` · `#sendCosts` 실질 구현 |
| `relay/src/admin/types.ts` · `admin-conn.ts` | `freshLiveBudget` · `snapshotReceivedAtMs` | ✓ VERIFIED | 최근 원천 선택 한 벌 |
| `relay/src/dma/envelope.ts` | 44/86/87/66/67/80 필드 | ✓ VERIFIED | 위 SC2 |
| `relay/src/hub/subscription-hub.ts` | 67 덮기 · `liveBudgetOf` | ✓ VERIFIED | |
| `relay/src/journal/writer.ts` | 이벤트 4키 | ✓ VERIFIED | 키 = DB 열 |
| `supabase/migrations/20261028210000_dma_journal_pnl.sql` · `…210100_dma_pnl_rpcs.sql` | 4열 + apply 재정의 · RPC 3종 | ✓ VERIFIED | REVOKE 명시 |
| `server/src/routes/{admin,pnl,admin-pnl}.ts` | 쓰기 2 + 조회 2 | ✓ VERIFIED | `/api/pnl` requireAuth(p_user_id=req.userId) · `/api/admin/pnl` requireAuth→requireAdmin |
| `webapp/src/components/admin/account-editor.tsx` | 비용 행 | ✓ VERIFIED | 위 리뷰 수정 대조 |
| `webapp/src/components/orderbook/account-panel.tsx` | 요약 줄 | ✓ VERIFIED | |
| `webapp/src/lib/use-available-krw.ts` | 훅 3종 | ✓ VERIFIED | `useAvailableKrw` · `priceIsinsOf` · `useSubscribedPriceOf` |
| `webapp/src/components/pnl/pnl-admin-client.tsx` · `pnl-report.tsx` · `app/admin/pnl/page.tsx` | 손익 화면 + 칩 줄(c1680327) | ✓ VERIFIED | `PnlKeyChips` radiogroup, 「전체」 기본 · `?key=` 가 쿼리 원본 · 묶음 기준 전환 시 키 삭제 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| account-editor | server PUT budget/fee | `webapp/src/lib/admin-api.ts` `setAccountBudget/Fee` | WIRED | `budget.run(parsed.krw)` · `cost.run({feePpm, sellTaxPpm})` |
| server admin.ts | relay | `relay.setAccountBudget/Fee` → relay 내부 PUT | WIRED | |
| relay dispatcher | gh-trade 44 op 6/7 | `costCommand` → `buildAdminCommandReq` | WIRED | `envelope.ts:3398-3401` |
| relay 87 → 개요 | webapp 카드 | `GET /account-costs` + `freshLiveBudget` | WIRED | 이전 경고 WR-02 해소 |
| 66/67 → hub → webapp | 계좌 패널 · 폼 | `budgetKrw` 마지막 값 | WIRED | |
| `/me` 잔고 탭 | 현재가 | `useSubscribedPriceOf` → relay `subscribe(… "price")` → `AccountPanel priceOf` | WIRED | 이전 경고 WR-05 해소 |
| 80 저널 → writer → `dma_journal_apply` | 4열 | 이벤트 JSON 키 = DB 열 | WIRED | |
| `dma_pnl_daily_*` → server → `/admin/pnl` · `/me` 손익 | 화면 | `fetchAdminPnl` · `fetchMyPnl` | WIRED | |
| `PnlAdminClient` 칩 줄 | 화면 필터 | `?key=` → `shown.groups.filter` | WIRED | 이 기간에 없는 키는 화면만 「전체」 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| account-panel 요약 줄 | `account.budgetKrw` | relay 66/67 `AccountState.budget_krw` | 예 (UAT: 한도 델타로 즉시 갱신) | ✓ FLOWING |
| 계좌 카드 비용 행 | `account.costs` | relay `GET /account-costs` (87 + 최신 67 live) | 예 | ✓ FLOWING |
| `/me` 요약 줄 · 잔고 평가 | `priceOf` | relay 시세 구독(구독 뒤 새 값) | 예 (UAT 7 pass) | ✓ FLOWING |
| 손익 화면 | `PnlReport` | `dma_pnl_daily_*` ← `dma_journal_events` 4열 ← 80 저널 | 예 (UAT: 체결 뒤 저널 4값 → 매매손익 행) | ✓ FLOWING |
| `/admin/pnl` 칩 | `report.groups` | 같은 `fetchAdminPnl` | 예 (UAT 8 pass) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 되싣기 · 최근 원천 · 66/67 덮기 · 저널 코덱 | `cd relay && npx vitest run tests/admin-dispatcher.test.ts tests/admin-api.test.ts tests/account-state.test.ts tests/journal-codec.test.ts --maxWorkers=2` | 4 파일 192 passed | ✓ PASS |
| shared 주문가능 · 표기 | `cd packages/shared && npx vitest run src/__tests__/account-budget.test.ts --maxWorkers=2` | 57 passed | ✓ PASS |
| 화면 4파일 (손익 · 어드민 카드 · /me) | `cd webapp && npx vitest run src/components/pnl src/components/admin/__tests__/account-editor.test.tsx src/components/trading/__tests__/me-client.test.tsx --maxWorkers=2` | 4 파일 173 passed | ✓ PASS |
| 전체 스위트 · Playwright | (다른 세션이 테스트를 돌릴 수 있어 재실행 안 함) | 수정 에이전트 기록: relay 1779 · webapp 5011 passed + 1 skip · E2E admin P36 · me 43 passed · admin-pnl 6 passed | ? 인용만 |

### Probe Execution

Step 7c: SKIPPED — 플랜이 선언한 프로브(`probe-*.sh`) 없음.

### Requirements Coverage

모든 플랜(36-01 ~ 36-10)의 frontmatter 가 `requirements: []` 이고 `.planning/REQUIREMENTS.md` 에는 Phase 36 에 매핑된 ID 가 없다(ROADMAP 도 `Requirements: TBD`). 누락 · 고아 요구사항 없음 — 이 phase 는 로드맵 Success Criteria 를 계약으로 검증했다.

### Anti-Patterns Found

phase 변경 비테스트 소스(`2f26aea4..HEAD`)에서 `TBD|FIXME|XXX` 및 `TODO|HACK|PLACEHOLDER` 마커 0건.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `relay/src/admin/dispatcher.ts` | 319-327, 488-490 (`costTargetRows` ~900) | 대상 서버 = 해당 DMA 유저 등록 서버 (WR-04, 미해결) | ⚠️ Warning (사용자가 후속으로 미룸) | 공유 계좌를 유저 A 는 KB120·KB121, 유저 B 는 KB120 에만 등록했을 때 B 카드 저장이 KB121 에 닿지 않아 갈릴 수 있다. D-07(「fan-out 대상 = DB 등록 서버 전부」) 현행 설계대로 동작하는 것이므로 SC 위반이 아니라 설계 범위 확장 사안 — 새 RPC + D-03/D-07 개정이 필요해 36-UAT.md 「Deferred Follow-Ups」 에 기록됨 |
| `relay/src/admin/dispatcher.ts` | `#reloadCosts` ② 대상 | 87 만으로 「한 번도 설정 안 함」 과 「일부러 셋 다 해제」 를 가리지 못함 | ⚠️ Warning (수정자가 36-REVIEW-FIX-R2 에 명시한 알려진 경계) | 예수금·수수료·매도세를 셋 다 0 으로 해제하고 일부 서버가 실패했다면 다음 「다시 반영」 이 남은 서버 값을 해제된 서버에 되싣는다. 예수금만 해제하는 흔한 경우는 해당 없음. 어드민 카드 불일치 줄이 해제 실패를 이미 보여 줌 |
| `webapp/e2e/specs/admin-pnl.spec.ts` | — | 묶음 칩 줄(c1680327)은 Playwright 스펙이 없고 단위 테스트(`pnl-admin-client` 9건) + UAT 8 pass 로만 덮임 | ℹ️ Info | 목표 달성에 영향 없음. 후속 회귀 보강 후보 |
| 36-REVIEW.md IN-01~06 · 36-REVIEW-R2.md IN-01~03 | — | 계좌별 묶음 키 broker 무시 · 「변경 없음」 칩 · 정정 이중 차감 · 되싣기가 reconcile 10초 마감 안 순차 · 마감 안 실패 가림 · 벽시계 비교 · op 5 87 계약 관측 장치 없음 | ℹ️ Info | 리뷰 정보 등급, 열려 있음. 목표 달성에 영향 없음 |

### Human Verification Required

없음. 이전 report 의 두 항목(WR-05 처리 결정 · WR-01~04 시점 결정)은 코드로 확인했다: WR-01·02·03·05 는 위 "리뷰 수정 대조" 로 실제 수정이 확인됐고, WR-04 는 사용자가 36-UAT.md 에서 후속으로 결정을 마쳐 더는 열린 판단이 아니다. 행동 의존 truth 는 모두 단일 파일 테스트가 행사하고 통과했으므로 `PRESENT_BEHAVIOR_UNVERIFIED` 도 없다. 라이브 확인(UAT 1~8)은 사용자 「모두 pass」 응답으로 종결됐다.

### Gaps Summary

must-have 를 FAILED 로 만드는 gap 이 없다. 6개 Success Criteria 모두 현재 소스에 실재하고 배선돼 있으며 데이터가 실제로 흐른다. 이전 검증 이후의 변경(리뷰 수정 8건 · `/admin/pnl` 칩 줄)에서 회귀는 발견되지 않았고, 이전에 통과했던 truth(66/67 덮기 · 저널 코덱 · shared 환산)는 재실행한 단일 파일 테스트로 다시 통과했다. 열린 경고는 WR-04(사용자 후속 결정)와 알려진 되싣기 경계 1건이며 둘 다 목표 달성을 막지 않는다.

---

_Verified: 2026-10-28T07:05:00Z_
_Verifier: Claude (gsd-verifier)_
