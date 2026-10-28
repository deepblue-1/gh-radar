---
phase: 36-account-budget
verified: 2026-10-28T02:10:00Z
status: human_needed
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
  - "packages/shared/src/pnl.ts"
  - "relay/src/admin/admin-api.ts"
  - "relay/src/admin/dispatcher.ts"
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
covered_digest: "v3:sha256:88474c03eb6a7f91434785cd5719c67d930cbf4aa62060ed4ee9385c4b0b06f5"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "WR-05 처리 결정 — /me 잔고 탭 계좌 패널에 priceOf 를 주입해 작업대·수동주문과 같은 주문가능 값을 내도록 고칠지"
    expected: "시장가(price 0) 매수 미체결이 있는 계좌에서 /me 요약 줄의 「주문가능」 이 작업대 패널·수동주문 「주문가능」 과 같은 숫자"
    why_human: "코드는 현재 /me 만 시장가 매수 미체결을 0 으로 센다(me-client.tsx 519-527 에 priceOf 없음). 로드맵 계산식 「price 0 이면 현재가」 와 SC5 「같은 숫자」 의 모서리 이탈이라 수정 여부(후속 quick)는 사용자 판단 사항. 라이브 UAT 가 이 모서리(시장가 매수 미체결 + /me)를 밟았는지 기록에 없다."
  - test: "WR-01 · WR-02 · WR-03 · WR-04 (예수금 쓰기 경로 경고 4건) 후속 수정 시점 결정"
    expected: "Enter 만 눌러도 op 6 가 나가는 문제(WR-01), 67 live 우선으로 저장 직후 옛 값이 보일 수 있는 문제(WR-02), 같은 서버 계획의 다른 op 실패 시 op 3 뒤 되싣기가 빠지는 문제(WR-03), 공유 계좌 fan-out 이 그 DMA 유저 등록 서버에만 닿는 문제(WR-04)가 후속 fix 로 닫힌다"
    why_human: "배포·라이브 UAT A~F 통과 뒤 발견된 경고라 목표 실패는 아니지만 WR-01 은 실거래 계좌 예수금을 최대 9,999원 깎을 수 있는 실제 쓰기 결함이다. 처리 우선순위는 사용자가 정한다(36-REVIEW-DISPOSITION.md 에 open)."
---

# Phase 36: 계좌별 주문가능 금액 Verification Report

**Phase Goal:** 어드민이 계좌별 예수금·수수료·매도세를 설정(op 6/7 fan-out · 서버별 칩 · op 3 뒤 되싣기)하고, 웹 주문 화면이 주문가능 금액을 실시간 표시·초과 경고하며, 66/67 예수금을 마지막 값으로 덮고, 저널 손익 4필드를 DB 에 적재해 「일자별 매매손익」(/admin/pnl · /me 손익 탭)을 보여 준다.
**Verified:** 2026-10-28T02:10:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

판정 요약: 목표의 모든 요소가 코드에 실존하고 배선돼 있으며(스텁 없음), 라이브 UAT A~F 통과 기록과 일치한다. must-have 를 FAILED 로 떨어뜨리는 항목은 없다. 다만 코드 리뷰 경고 5건 중 WR-05(/me 만 시장가 매수 미체결을 0 으로 셈)는 로드맵 계산식의 실제 이탈이고 WR-01 은 실쓰기 결함이라, 후속 처리 결정을 사람에게 올린다(아래 Human Verification).

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 목업 확인(D-00) | ✓ VERIFIED | `.planning/phases/36-account-budget/reference/mockup-account-budget.html` 존재 |
| 2 | relay: op 6/op 7 송신 · 87 3필드 파싱 · 66/67 `budget_krw` 마지막 값 덮기 · 저널 손익 4필드 파싱 · op 3 뒤 되싣기 · op 6/7 은 `dma_admin_results` 밖 | ✓ VERIFIED | `relay/src/admin/types.ts:39-40` ADMIN_OP.SetAccountBudget=6 / SetAccountFee=7; `envelope.ts:3360-3398` op 6 만 `addBudgetKrw`(ulong 가드), op 7 fee/tax; `envelope.ts:3484` 87 `budgetKrw` 파싱; `envelope.ts:2489` 66/67 `budgetKrw`; `subscription-hub.ts:3751-3753` 델타 병합이 `budgetKrw: next.budgetKrw` 로 마지막 값 덮기(스냅샷은 `...next`); `envelope.ts:3589-3592` 저널 4필드 `toNum`; `dispatcher.ts:454-456` `#reloadCosts` 되싣기. 단일 파일 테스트 `account-state` · `journal-codec` · `admin-dispatcher` 101/101 통과(직접 실행). 단 되싣기는 WR-03 의 부분 결함 있음 |
| 3 | server/shared: 어드민 쓰기 2종(PUT budget · fee · requireAdmin) · 개요에 서버별 예수금·비용률(67 live 우선 · 87 폴백) · 주문가능 계산·표기·ppm 은 shared 한 벌 | ✓ VERIFIED | `server/src/routes/admin.ts:610-621` PUT `…/budget`(`AdminAccountBudgetSchema`), fee 라우트 동일 구조(67-68 주석 · `relay.setAccountBudget/Fee`); `app.ts:127-131` admin 라우터 군; `relay admin-api` 의 `GET /internal/admin/account-costs` + `hub.liveBudgetOf`(`subscription-hub.ts:2242`) ; `packages/shared/src/account-budget.ts` 의 `availableKrwOf` 식이 로드맵과 일치(budget − Σ평단×수량 − Σ매수 미체결, `pendingCancelSent` 제외, price 0→priceOf, 0 이하 예수금 → null)·`formatManwonFloor`·`ppmToPct`. shared `account-budget` 57/57 통과(직접 실행) |
| 4 | DB: `dma_journal_events` bigint 4열(기본 0) · `dma_journal_apply` 재정의 · 일자 집계 RPC 2종 · REVOKE anon/authenticated · `exec_qty::bigint` | ✓ VERIFIED | `20261028210000_dma_journal_pnl.sql:33-36` 4열 `NOT NULL DEFAULT 0`, `:113-116` `coalesce((ev->>'…')::bigint,0)` 로 적재; `20261028210100_dma_pnl_rpcs.sql` build/for_user/for_admin 3함수, `exec_qty::bigint * exec_price`, `dma_visible_accounts` 가시성 조인(me 모드만), 어드민 p_group 22023 잠금, 3함수 모두 `REVOKE … FROM PUBLIC` + `FROM anon, authenticated`(162-204). pgTAP `supabase/tests/dma_pnl_daily.test.sql` 존재(36-05/07/08 SUMMARY 에 ok 기록, 이번에 재실행하지 않음). 원격 적용은 36-09 에 02:49 KST 기록 |
| 5 | webapp: 어드민 카드 예수금·수수료·매도세 행(즉시 저장 · 서버별 칩) · 계좌 패널 「주문가능 / 예수금」 줄 · 수동주문 「주문가능」 + 초과 줄 · 상따 합산 경고 · `/admin/pnl` · `/me` 「손익」 탭 | ✓ VERIFIED (경고 있음) | `account-editor.tsx:744,754` `setAccountBudget/Fee` 배선(`admin-api.ts:189,206`); `account-panel.tsx:1714-1753` `BudgetSummaryLine`(`data-slot="account-budget-summary"`, 미설정 시 「/ 예수금 미설정」); `manual-order-form.tsx:1015-1077` `mo-available` · `manual-order-budget-over`; `limit-chaser-form.tsx:2001` `lc-budget-over`; `use-available-krw.ts` 가 shared `availableKrwOf` 호출; `webapp/src/app/admin/pnl/page.tsx` + `PnlAdminClient`(→ `fetchAdminPnl`); `me-client.tsx:316` `{ v: "pnl", label: "손익" }`; `app-sidebar.tsx:201` `NAV_ADMIN_PNL`. 경고: WR-05(`/me` AccountPanel 에 `priceOf` 미주입 → 시장가 매수 미체결 0 취급) |
| 6 | 라이브 UAT · 인박스 `261027-account-budget.md` · `261027-account-pnl.md` `status: done` | ✓ VERIFIED | 두 노트 frontmatter `status: done` 직접 확인; 36-09-SUMMARY: relay:711d1a53 smoke 11/11, server 00069-qwg smoke 15/15 + 신규 3경로 무인증 401, 사용자 UAT 「1-6 pass」(A~F). 라이브 UAT 는 이 검증에서 재현하지 않고 사용자 응답 기록에 의존 |

**Score:** 6/6 truths verified (0 present, behavior-unverified)

행동 의존 truth(66/67 마지막 값 덮기 · 델타 병합)는 `relay/tests/account-state.test.ts` 가 직접 행사하고 통과했다.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | G: STATE 「켜기 전 결정」 에 예수금 갈림 한 줄 반영 | Phase 35 종료 뒤 | 36-09-SUMMARY 49행 「STATE 반영 대기」 — Phase 35 가 아직 executing. 로드맵 SC 에 들어 있지 않은 문서화 항목이라 gap 아님 |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/shared/src/account-budget.ts` | 주문가능·표기·ppm 한 벌 | ✓ VERIFIED | 실질 구현 · relay/webapp 에서 import · 테스트 57 통과 |
| `packages/shared/src/pnl.ts` | PnlReport 타입·기간 | ✓ VERIFIED | server schemas · webapp 에서 사용 |
| `relay/src/admin/dispatcher.ts` | op 6/7 fan-out · 되싣기 | ✓ VERIFIED | `setAccountCost` · `#reloadCosts`(WR-03 경고) |
| `relay/src/dma/envelope.ts` | 44/86/87/66/67/80 필드 | ✓ VERIFIED | 위 표 참조 |
| `relay/src/hub/subscription-hub.ts` | 67 덮기 · `liveBudgetOf` | ✓ VERIFIED | |
| `relay/src/journal/writer.ts` | 이벤트 4키 | ✓ VERIFIED | `writer.ts:209-212` snake_case 키 = DB 열 |
| `supabase/migrations/20261028210000_dma_journal_pnl.sql` | 4열 + apply 재정의 | ✓ VERIFIED | 시각 이동본(36-09 사용자 결정) · 원격 적용 기록 |
| `supabase/migrations/20261028210100_dma_pnl_rpcs.sql` | RPC 3종 | ✓ VERIFIED | REVOKE 명시 |
| `server/src/routes/{admin,pnl,admin-pnl}.ts` | 쓰기 2 + 조회 2 | ✓ VERIFIED | `/api/pnl` requireAuth(p_user_id=req.userId) · `/api/admin/pnl` requireAuth→requireAdmin |
| `webapp/src/components/admin/account-editor.tsx` | 비용 행 | ✓ VERIFIED | WR-01 결함 있음 |
| `webapp/src/components/orderbook/account-panel.tsx` | 요약 줄 | ✓ VERIFIED | |
| `webapp/src/lib/use-available-krw.ts` | 훅 | ✓ VERIFIED | |
| `webapp/src/components/pnl/*` · `app/admin/pnl/page.tsx` | 손익 화면 | ✓ VERIFIED | |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| account-editor | server PUT budget/fee | `admin-api.ts` `setAccountBudget/Fee` | WIRED | |
| server admin.ts | relay | `relay.setAccountBudget/Fee` → `PUT /internal/admin/dma-users/…/budget|fee` | WIRED | |
| relay dispatcher | gh-trade 44 op 6/7 | `buildAdminCommandReq` | WIRED | |
| relay 87 → 개요 | webapp 카드 | `account-costs` + `liveBudgetOf` | WIRED | WR-02: live 우선 순서 위험 |
| 66/67 → hub → webapp | 계좌 패널 · 폼 | `budgetKrw` 마지막 값 | WIRED | |
| 80 저널 → writer → `dma_journal_apply` | 4열 | 이벤트 JSON 키 = DB 열 | WIRED | |
| `dma_pnl_daily_*` → server → `/admin/pnl` · `/me` 손익 | 화면 | `fetchAdminPnl` · `fetchMyPnl` | WIRED | |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| account-panel 요약 줄 | `account.budgetKrw` | relay 66/67 `AccountState.budget_krw` | 예 (UAT 에서 한도 델타로 즉시 갱신 확인) | ✓ FLOWING |
| 계좌 카드 비용 행 | `account.costs` | relay `GET /internal/admin/account-costs` (87 + 67 live) | 예 | ✓ FLOWING |
| 손익 화면 | `PnlReport` | `dma_pnl_daily_*` ← `dma_journal_events` 4열 ← 80 `JournalRecord` | 예 (UAT: 체결 뒤 저널 4값 → 매매손익 행) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 66/67 덮기 · 저널 코덱 · 디스패처 | `cd relay && npx vitest run tests/account-state.test.ts tests/journal-codec.test.ts tests/admin-dispatcher.test.ts --maxWorkers=2` | 3 파일 101 passed | ✓ PASS |
| shared 주문가능·표기 | `cd packages/shared && npx vitest run src/__tests__/account-budget.test.ts --maxWorkers=2` | 57 passed | ✓ PASS |
| 전체 스위트 | (요청대로 재실행 안 함) | 오케스트레이터 기록: relay 1771 · webapp 4964 passed + 1 skip · shared 816 · server 667 | ? 인용만 |

### Probe Execution

Step 7c: SKIPPED — 플랜이 선언한 프로브(`probe-*.sh`) 없음.

### Requirements Coverage

모든 플랜(36-01 ~ 36-10)의 frontmatter 가 `requirements: []` 이고 `.planning/REQUIREMENTS.md` 에는 Phase 36 에 매핑된 ID 가 없다(ROADMAP 도 `Requirements: TBD`). 누락·고아 요구사항 없음 — 이 phase 는 로드맵 Success Criteria 를 계약으로 검증했다.

### Anti-Patterns Found

phase 변경 비테스트 소스 39개(`2f26aea4..711d1a53`)에서 `TBD|FIXME|XXX` 마커 0건. 코드 리뷰(36-REVIEW.md, critical 0 · warning 5 · info 6)를 코드로 대조해 확인한 항목:

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `webapp/src/components/trading/me-client.tsx` | 519-527 | `<AccountPanel>` 에 `priceOf` 없음 (WR-05 확인) | ⚠️ Warning | `/me` 만 시장가 매수 미체결을 0 으로 계산 — 로드맵 계산식 이탈 |
| `relay/src/admin/dispatcher.ts` | 454 | `failure === null` 일 때만 되싣기 (WR-03 확인) | ⚠️ Warning | 같은 서버 계획의 다른 op 실패 시 그 계좌 예수금·비용률 되싣기가 영구히 빠짐 |
| `webapp/src/components/admin/account-editor.tsx` | 784-800, 886 | Enter 저장이 `edited` 미확인 (WR-01) | ⚠️ Warning | 고치지 않은 칸 Enter 로 op 6 가 나가 서버 조정 예수금을 만원 단위로 깎을 수 있음 |
| `relay/src/hub/subscription-hub.ts` / `admin-api.ts` | 2242 / 929 | 67 live 무조건 우선 (WR-02) | ⚠️ Warning | 저장 직후 재조회에 옛 값 · 거짓 불일치 줄 가능 |
| `relay/src/admin/dispatcher.ts` | 319-327, 488-490 | 대상 서버 = 해당 DMA 유저 등록 서버 (WR-04) | ⚠️ Warning | 공유 계좌에서 다른 유저만 등록한 서버가 갈라질 수 있음 |
| IN-01 ~ IN-06 | — | 계좌별 묶음 키 broker 무시 · 「변경 없음」 칩 · 정정 이중 차감 경고 등 | ℹ️ Info | 리뷰대로, 목표 달성에는 영향 없음 (36-REVIEW.md 참조) |

리뷰 경고 중 WR-01 ~ WR-04 는 어드민 쓰기 경로의 경계 조건 결함이고 UAT 의 정상 흐름(설정 → 86 code 0 → 67 델타로 즉시 갱신 → 같은 값 재전송 「변경 없음」)은 통과했다. 따라서 must-have 실패로 올리지 않았다.

### Human Verification Required

#### 1. WR-05 — /me 주문가능 값 일치

**Test:** 시장가(price 0) 매수 미체결이 있는 계좌를 /me 잔고 탭과 작업대 계좌 패널·수동주문 폼에서 비교.
**Expected:** 세 곳의 「주문가능」 이 같은 숫자.
**Why human:** 코드상 /me 는 `priceOf` 없이 0 으로 계산(확인함). 수정 여부와 시점은 사용자 결정 — 제안 수정은 36-REVIEW.md WR-05(`useRelayContext` 의 `quotes` + `holdingQuotePrice` 주입).

#### 2. WR-01 ~ WR-04 후속 fix 시점

**Test:** 36-REVIEW-DISPOSITION.md 의 open 경고 4건을 후속 quick/phase 로 처리할지 결정.
**Expected:** Enter 만으로 op 6 가 나가지 않고, 되싣기가 다른 op 실패에 묶이지 않으며, 저장 직후 옛 값이 보이지 않는다.
**Why human:** 우선순위 판단. 특히 WR-01 은 실거래 계좌 예수금에 쓰기가 나가는 경로다.

### Gaps Summary

must-have 를 FAILED 로 만드는 gap 은 없다. 6개 Success Criteria 모두 코드·마이그레이션·라우트·화면·테스트로 실재하며 배선돼 있고 데이터가 실제로 흐른다. 리뷰 경고 5건은 모두 코드에서 실재함을 확인했으며(특히 WR-03 · WR-05 는 직접 대조), 목표 달성은 막지 않지만 후속 처리 결정이 필요해 status 를 `human_needed` 로 둔다. G(STATE 예수금 갈림 줄)는 Phase 35 종료 뒤로 이월된 문서 항목이다.

---

_Verified: 2026-10-28T02:10:00Z_
_Verifier: Claude (gsd-verifier)_
