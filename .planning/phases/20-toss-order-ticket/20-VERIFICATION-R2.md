---
phase: 20-toss-order-ticket
verified: 2026-09-25T08:54:01Z
status: human_needed
score: 13/13 truths verified
covered_files: [".planning/phases/20-toss-order-ticket/20-01-PLAN.md", ".planning/phases/20-toss-order-ticket/20-01-SUMMARY.md", ".planning/phases/20-toss-order-ticket/20-02-PLAN.md", ".planning/phases/20-toss-order-ticket/20-02-SUMMARY.md", ".planning/phases/20-toss-order-ticket/20-03-PLAN.md", ".planning/phases/20-toss-order-ticket/20-03-SUMMARY.md", ".planning/phases/20-toss-order-ticket/20-04-PLAN.md", ".planning/phases/20-toss-order-ticket/20-04-SUMMARY.md", ".planning/phases/20-toss-order-ticket/20-05-PLAN.md", ".planning/phases/20-toss-order-ticket/20-05-SUMMARY.md", ".planning/phases/20-toss-order-ticket/20-06-PLAN.md", ".planning/phases/20-toss-order-ticket/20-06-SUMMARY.md", ".planning/phases/20-toss-order-ticket/20-07-PLAN.md", ".planning/phases/20-toss-order-ticket/20-07-SUMMARY.md", ".planning/phases/20-toss-order-ticket/20-08-PLAN.md", ".planning/phases/20-toss-order-ticket/20-08-SUMMARY.md", ".planning/phases/20-toss-order-ticket/20-CONTEXT.md", ".planning/phases/20-toss-order-ticket/20-REVIEW-FIX.md", ".planning/phases/20-toss-order-ticket/20-REVIEW.md", ".planning/phases/20-toss-order-ticket/20-UI-SPEC.md", ".planning/phases/20-toss-order-ticket/20-VALIDATION.md", ".planning/phases/20-toss-order-ticket/20-VERIFICATION.md", ".planning/phases/20-toss-order-ticket/deferred-items.md", "packages/shared/src/krxTick.ts", "webapp/e2e/overflow.ts", "webapp/e2e/specs/a11y.spec.ts", "webapp/e2e/specs/orderbook.spec.ts", "webapp/e2e/specs/sidebar-tree.spec.ts", "webapp/e2e/specs/trading-workbench.spec.ts", "webapp/src/components/stock/__tests__/orderbook.test.tsx", "webapp/src/components/stock/__tests__/stock-orderbook-section.test.tsx", "webapp/src/components/stock/stock-orderbook-section.tsx", "webapp/src/components/trading/card/card-body.tsx", "webapp/src/components/trading/card/manual-order-form.tsx", "webapp/src/components/trading/lc/inline-value-editor.tsx", "webapp/src/components/trading/lc/lc-fields.ts", "webapp/src/components/trading/lc/number-pad-sheet.tsx", "webapp/src/components/trading/lc/setting-group.tsx", "webapp/src/components/trading/lc/use-lc-field-commit.ts", "webapp/src/components/trading/limit-chaser-form.tsx", "webapp/src/lib/numpad.ts", "webapp/src/lib/tick-rule.ts", "webapp/src/lib/use-edit-mode.ts"]
covered_digest: "v1:sha256:2b20742a88ffb5df4a01b455cca93c20d00fc680dac1b70c6ed869e41f450ec5"
re_verification:
  previous_status: gaps_found
  previous_score: 12/13
  gaps_closed:
    - "상단 상태줄 1줄 압축 — D-24(안 C) 구현 완료. 대상은 D-24 사용자 결정에 따라 strategy-card.tsx 가 아니라 종목상세 호가 탭 OrderbookStatusBar(stock-orderbook-section.tsx) 로 확정됐다."
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "R2-1. 호가 탭 상태줄(D-24 안 C)과 목업 status-strip-variants.html 안 C 를 다크/라이트 · 폰 360/390 · 태블릿 768 · 데스크톱 1280 에서 나란히 놓고 톤(색·둥근면·간격·정렬)을 대조한다"
    expected: "목업과 시각적으로 합치한다"
    why_human: "시각 톤 대조는 스크린샷 자동 비교로 신뢰성 있게 판정할 수 없다 — 20-08 SUMMARY 가 실행자 자체 48장 스크린샷 검토(비커밋)를 이미 했으나 human_judgment: true 로 명시하고 사용자 UAT 를 별도 요청했다"
  - test: "목업 8차(.planning/sketches/002-toss-order-ticket/index.html)와 실제 화면을 다크/라이트 · 폰 390(터치) · 태블릿 768(터치) · 데스크톱 1280(마우스)에서 나란히 놓고 톤(색·둥근면·간격)을 대조한다"
    expected: "목업과 시각적으로 합치한다"
    why_human: "시각 톤 대조는 스크린샷 자동 비교로 신뢰성 있게 판정할 수 없다 — 20-07 SUMMARY 가 end-of-phase UAT 로 명시 요청함 (round 1 인계, 20-08 영향 없음)"
  - test: "실기 하이브리드 기기(터치+트랙패드가 모두 있는 노트북/투인원)에서 행 탭은 시트, 마우스 클릭은 인라인으로 정확히 갈리는지 확인한다"
    expected: "주 포인터가 거친(coarse) 경우 시트, 정밀(fine)한 경우 인라인 — 보조 포인터에 영향받지 않는다"
    why_human: "Playwright 는 (pointer: coarse) 미디어 쿼리를 흉내낼 수 있지만 실제 하이브리드 하드웨어의 브라우저 판정과 100% 동일하다는 보장이 없다(D-12 근거 코드 주석이 이 위험을 직접 언급) (round 1 인계, 20-08 이 use-edit-mode.ts 를 건드리지 않아 영향 없음)"
  - test: "CR-02 수정으로 도입된 LC_ORPHAN_WAIT_MS(7초) 장벽 — 실제 터널 지연 환경에서 그 사이 다른 필드가 「반영 중…」으로 최대 7초 잠기는 체감이 운영상 허용 가능한지 확인한다"
    expected: "7초 값이 실사용 지연 분포에 비해 과도하게 길거나 짧지 않다"
    why_human: "20-REVIEW-FIX.md 가 명시적으로 「7초 값이 운영 감각에 맞는지 확인해 주세요」라고 요청했고, 단위/e2e 테스트는 값의 적정성이 아니라 로직만 검증한다 (round 1 인계, 20-08 이 use-lc-field-commit.ts 를 건드리지 않아 영향 없음)"
  - test: "CR-01(범위 검증 잠금 문구 2종) · WR-05(ETP 경고 문구) · WR-07(주문금액 「—」의 접근성 이름 「주문금액 미입력」) — 새로 도입된 카피 3종의 어조를 확인한다"
    expected: "기존 Copywriting Contract 어조와 어긋나지 않는다"
    why_human: "이 문구들은 UI-SPEC Copywriting 표에 없던 신규 문구이고 20-REVIEW-FIX.md 가 명시적으로 사용자 확인을 요청했다 (round 1 인계, 20-08 영향 없음)"
  - test: "레거시 전략(서버 buyOrderAmount === 0)이 실환경에 있다면 D-04a 경로(금액 먼저 입력 → 정상 합류, 무장된 레거시 전략 끄기 시 수량 불변)를 실제로 관찰한다"
    expected: "레거시 전략 끄기가 수량을 재계산하지 않고, 금액 입력 후 정상 경로로 합류한다"
    why_human: "단위·e2e 테스트로는 검증했으나 20-REVIEW-FIX.md 가 실환경(레거시 전략 존재) 관찰을 별도로 요청했다 — relay 실지연 환경에서의 CR-02/CR-03 거동도 같은 이유로 포함 (round 1 인계, 20-08 영향 없음)"
---

# Phase 20: 호가주문 토스식 재구성 (실험 브랜치) Re-Verification Report (Round 2 — Gap Closure)

**Phase Goal:** 종목상세 호가주문 탭 = `/trading` 작업대 카드 본문(CardBody 공용)의 우측 패널을 토스 주문창 구조로 재구성한다 — 상따 설정 「라벨 ─ 값 ›」 리스트 + 그룹 헤더 스위치 · 폰/태블릿 바텀시트 + 자체 숫자 키패드(단위별 단축 칩) · 데스크톱 인라인 편집(Enter·Esc·↑↓ 한 호가) · 수동주문 토스 주문 티켓 스타일 · 상단 상태줄 1줄 압축. 불변: §2.2b 본문폭 밴드 · 라벨 잘림 0 · 주문 경로(wss 단일 주문 경로·결과 모름 잠금·확인 다이얼로그) 동작 불변.

**Verified:** 2026-09-25T08:54:01Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (plan 20-08, commits 080d42f..a020d7a)

## Re-Verification Summary

Round 1 (`20-VERIFICATION.md`) scored 12/13 with one gap: truth 13 「상단 상태줄 1줄 압축」 — the ROADMAP goal's fourth deliverable was deliberately deferred across all 7 original plans, flagged "사용자 확인 필요" but never confirmed. The user then made decision **D-24 (안 C)**, recorded as a LOCKED decision in `20-CONTEXT.md` and `20-UI-SPEC.md` §10, retargeting the deliverable at the stock-detail order-book tab's `OrderbookStatusBar` (`stock-orderbook-section.tsx`) — **not** `strategy-card.tsx`, which the round-1 gap text had (correctly, per the goal text's literal component reference at the time) pointed at. Gap-closure plan 20-08 executed this decision in 3 tasks (tracer ≥700 → <700 compaction + new e2e scenarios → UI-SPEC/VALIDATION contract update), commits `080d42f`..`a020d7a`.

This round re-verifies truth 13 against the actual D-24 contract and independently re-runs the full gate to confirm the 12 previously-verified truths did not regress.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1-12 | (Unchanged from round 1 — field-commit state machine, KRX tick helper, keypad, edit-mode split, toss-style settings list, dirty-bar removal, inline editor, manual-order ticket restyle, order path unchanged, ETP warn-not-lock, e2e migration/build/test gate) | ✓ VERIFIED (regression check) | `git diff --stat cb63322..HEAD -- webapp/src/components/trading/` → **empty** (zero bytes changed in any `lc/`, `card/`, `limit-chaser-form.tsx`, `manual-order-form.tsx`, `card-body.tsx` file since the plan-20-08-head commit). 20-08's `files_modified` is limited to `stock-orderbook-section.tsx` + its 2 test files + `orderbook.spec.ts` + `overflow.ts` + 3 `.planning` docs — none of these are inputs to truths 1-12. Full gate re-run independently by this verifier (see Behavioral Spot-Checks) reproduces round 1's pass counts with the expected +14 e2e / +6 unit tests added by 20-08, zero removed. |
| 13 | 상단 상태줄 1줄 압축 — ROADMAP Phase 20 goal 의 네 번째 명시 산출물, D-24(안 C) 로 재확정: 종목상세 호가 탭 `OrderbookStatusBar` 가 본문 ≥700 「● DMA {상태} · 계좌 select · KRX|NXT · LED 점 3 · 구간 배지 · (다시 연결) · 반영 시각」 1줄, <700 「점+시각 · 계좌 이름 칩 · 거래소 · LED 점 3」 1줄 + 고지 줄(거부·구간·연결 이상)로 압축됐다 | ✓ VERIFIED | Source inspection of `stock-orderbook-section.tsx:367-728` confirms exact D-24 contract: `orderbook-conn`/`orderbook-conn-compact` split on `@min-[700px]/lc:`, `LatchLed variant="dot"` × 3 (`grep -c 'variant="dot"'` → 2), visible 「계좌」/「반영」 text removed (sr-only + title only), server-error `role="alert"` moved to `orderbook-notices` (count `data-slot="orderbook-notices"` == 1, matches Task 1 acceptance `==1`), `orderbook-server-error-src` present, `title="서버 반영 시각"` present, `@min-[700px]/lc:hidden` count = 5 (≥4 required), zero `truncate\|text-ellipsis\|line-clamp`, `flex-wrap` present (3 occurrences), no viewport-breakpoint utility classes outside container queries. Self-run e2e (see below) reproduces `P20-6 ① 거부 · 예약구간`, `P20-6 ② 미반영 · 장전`, `P20-6 ③ 끊김 · 시간외종가` all passing live against a self-launched relay + dev server, matching the exact measured-slack table in 20-08-SUMMARY (①② all-width 1-line, ③ 2-line only at body-width 700). `strategy-card.tsx` case 8 (multi-line wrap) is **unaffected and correctly untouched** — D-24 explicitly redirected the target away from it, and `20-UI-SPEC.md:28` documents the exclusion (「작업대 카드 헤더·작업대 상태줄·latch-led — D-24 의 대상은 호가 탭 상태줄 하나」). |

**Score:** 13/13 truths verified (0 failed)

### Required Artifacts (Round 2 delta)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `webapp/src/components/stock/stock-orderbook-section.tsx` | D-24 안 C `OrderbookStatusBar` + `TabNotices` | ✓ VERIFIED | Read in full (lines 331-728); matches D-24 contract exactly (see Truth 13 evidence). `orderbook-notices` count == 1, no debt markers |
| `webapp/src/components/stock/__tests__/stock-orderbook-section.test.tsx` | Unit coverage for dot LEDs, sr-only/title, rejection placement, account labeling, width classes | ✓ VERIFIED | `it(` count: 13 (round 1) → 19 (round 2), zero deletions, matches SUMMARY claim exactly |
| `webapp/src/components/stock/__tests__/orderbook.test.tsx` | Migrated reconnect-at-two-locations case | ✓ VERIFIED | `it(` count: 13 → 13 (unchanged — case ⑬ migrated in place per plan, not added), matches SUMMARY claim |
| `webapp/e2e/specs/orderbook.spec.ts` | `P20-6 ①②③` worst-case width scenarios | ✓ VERIFIED | `grep -cE "P20-6 (①|②|③)"` == 3; all 3 confirmed passing in this verifier's own Playwright run |
| `webapp/e2e/overflow.ts` | Third clipping judge `selectsClipped` | ✓ VERIFIED | `grep -c "export async function selectsClipped"` == 1; existing `leavesOverflowing`/`scrollOverflowing` bodies untouched (byte-for-byte diff confirms only an addition) |
| `.planning/phases/20-toss-order-ticket/20-UI-SPEC.md` | A7 → D-24 replacement + §10 contract | ✓ VERIFIED | Line 555: A7 struck through, replaced with "D-24(2026-09-25, 검증 갭 → 사용자 결정)로 대체"; §10 section present at line 344 with full width-band/a11y/measured-contract detail |

### Key Link Verification (Round 2 delta)

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `stock-orderbook-section.tsx` | `latch-led.tsx` | `LatchLed variant="dot"` × 3 | ✓ WIRED | Line 514, unchanged `latch-led.tsx` (zero diff vs base a8a48ad) |
| `stock-orderbook-section.tsx` | `strategy-card.tsx` | `card.lastError` → `TabNotices role=alert` | ✓ WIRED | Lines 642-691; `serverMsgBadge` reused, `strategy-card.tsx` itself untouched |
| `orderbook.spec.ts` | `overflow.ts` | `scrollOverflowing`/`leavesOverflowing`/`selectsClipped` | ✓ WIRED | `selectsClipped` imported and used in `expectStripOk` per grep |
| `orderbook.spec.ts` | `use-relay-socket.ts` | `page.routeWebSocket` state-frame injection for P20-6 ③ | ✓ WIRED | `routeWebSocket` present (1 occurrence), test passed live in this verifier's run |

### Behavioral Spot-Checks / Test Evidence (self-run, not trusted from SUMMARY)

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| No listener collision on 3100 before run | `lsof -iTCP:3100 -sTCP:LISTEN` | empty (no other server running) | ✓ PASS |
| shared build | `pnpm --filter @gh-radar/shared build` | DTS build success, no errors | ✓ PASS |
| relay typecheck | `pnpm --filter @gh-radar/relay run typecheck` | exit 0, no `error TS` | ✓ PASS |
| relay typecheck:tests | `pnpm --filter @gh-radar/relay run typecheck:tests` | exit 0, no `error TS` | ✓ PASS |
| webapp typecheck | `pnpm --filter @gh-radar/webapp run typecheck` | exit 0 (`tsc --noEmit && tsc -p tsconfig.e2e.json`) | ✓ PASS |
| relay unit tests | `pnpm --filter @gh-radar/relay run test` | 22 files / 632 tests passed | ✓ PASS |
| webapp unit tests | `pnpm --filter @gh-radar/webapp run test` | 108 files / 2081 tests passed, 1 skipped | ✓ PASS (matches SUMMARY 2075→2081 delta = +6 new stock-orderbook-section tests) |
| e2e (5 specs, self-launched dev server on 3100 via Playwright's own `webServer`) | `pnpm exec playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/orderbook.spec.ts e2e/specs/a11y.spec.ts e2e/specs/sidebar-tree.spec.ts e2e/specs/stock-detail-tabs.spec.ts` | **85 passed (3.0m)**, 0 failed, includes P20-1~P20-6①②③ | ✓ PASS |
| `zz-theme-gallery.spec.ts` / `milestone.lock` untouched | `git status -sb` (before and after) | still `?? webapp/e2e/specs/zz-theme-gallery.spec.ts` and `?? .planning/milestone.lock` | ✓ PASS |
| dev server port 3100 clean after run | `lsof -iTCP:3100 -sTCP:LISTEN` | empty (Playwright's own webServer teardown) | ✓ PASS |
| manual-order send path / relay / protocol unchanged vs base `a8a48ad` | `git diff --stat a8a48ad..HEAD -- relay/ packages/protocol` | empty (zero files changed) | ✓ PASS |
| `strategy-card.tsx` / `workbench-status-bar.tsx` / `latch-led.tsx` unchanged by 20-08 | `git log --oneline a8a48ad..HEAD -- <those 3 files>` | empty (no commits touched them, phase-wide) | ✓ PASS |
| No regression to lc/ or manual-order form since plan-20-08-head | `git diff --stat cb63322..HEAD -- webapp/src/components/trading/` | empty | ✓ PASS |
| No debt markers in 20-08 files | `grep -nE "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` across 5 modified webapp files | 0 hits | ✓ PASS |

### Anti-Patterns Found

None. No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers in any file touched by 20-08. No stub returns, no hardcoded-empty-data patterns, no `truncate`/`text-ellipsis`/`line-clamp` in `stock-orderbook-section.tsx` (explicitly prohibited by both the round-1 pattern and the 20-08 plan's own acceptance criterion — independently confirmed `== 0`). No new viewport-breakpoint utility classes — width branching is exclusively `@min-[700px]/lc:` (grep for other Tailwind breakpoint prefixes outside container-query syntax returned zero matches).

### Advisory (New Scope, Unevidenced)

None. This re-verification found no new-scope Step 7 concerns beyond the deferred items already disclosed and triaged by the executor in `deferred-items.md` §2 (거래소 세그먼트 10px 목업 오차 — documented, does not violate D-24's 1-line/zero-clip contract, measured slack still positive at all widths) and §3 (outline 버튼 muted-fg contrast — pre-existing theme-wide issue, explicitly excluded from the P20-6 axe assertion's blocking filter alongside `aria-required-children`, both disclosed in the test code itself). Both are pre-existing, out-of-scope, and transparently carried rather than hidden.

### Gaps Summary

**No gaps remain.** Round 1's single gap (truth 13, "상단 상태줄 1줄 압축") is closed: D-24(안 C) is implemented in `stock-orderbook-section.tsx`, independently verified against the CONTEXT.md decision record, the UI-SPEC §10 contract, and the plan's own acceptance criteria — all of which this verifier re-derived from source and re-ran rather than trusting the SUMMARY narrative. All three P20-6 e2e scenarios (rejection, unacked/pre-open, disconnection/after-hours) pass live in a self-launched browser session, reproducing the measured 1-line/2-line contract table. Zero regression to any of the 12 previously-verified truths — the entire `webapp/src/components/trading/` tree (all files backing truths 1-12) has a byte-for-byte-empty diff since the plan-20-08-head commit (`cb63322`), and `relay/`, `packages/protocol/` are untouched phase-wide.

**Why status is `human_needed`, not `passed`:** the phase carries a standing set of human-judgment items — visual tone comparisons against mockups (now including the new D-24 status-strip mockup `status-strip-variants.html` 안 C, which the 20-08 executor itself flagged `human_judgment: true` despite its own 48-screenshot self-review), hybrid-device pointer-mode behavior, the CR-02 7-second orphan-wait operational feel, new copy-string tone, and a real-environment D-04a legacy-strategy observation. None of these are new — they were already open after round 1 and are unaffected by 20-08 (which touched only `stock-orderbook-section.tsx` and its tests/e2e/docs) except for the added D-24-specific mockup-comparison item. None block the phase goal's core mechanism; all are explicitly flagged in the source documents (20-07-SUMMARY, 20-REVIEW-FIX.md, 20-08-SUMMARY) as requiring a human, not a code fix.

---

_Verified: 2026-09-25T08:54:01Z_
_Verifier: Claude (gsd-verifier, round 2 — gap closure re-verification)_
