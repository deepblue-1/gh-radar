---
phase: 20-toss-order-ticket
verified: 2026-09-25T16:35:00Z
status: gaps_found
score: 12/13 truths verified
covered_files: [".planning/phases/20-toss-order-ticket/20-01-PLAN.md", ".planning/phases/20-toss-order-ticket/20-01-SUMMARY.md", ".planning/phases/20-toss-order-ticket/20-02-PLAN.md", ".planning/phases/20-toss-order-ticket/20-02-SUMMARY.md", ".planning/phases/20-toss-order-ticket/20-03-PLAN.md", ".planning/phases/20-toss-order-ticket/20-03-SUMMARY.md", ".planning/phases/20-toss-order-ticket/20-04-PLAN.md", ".planning/phases/20-toss-order-ticket/20-04-SUMMARY.md", ".planning/phases/20-toss-order-ticket/20-05-PLAN.md", ".planning/phases/20-toss-order-ticket/20-05-SUMMARY.md", ".planning/phases/20-toss-order-ticket/20-06-PLAN.md", ".planning/phases/20-toss-order-ticket/20-06-SUMMARY.md", ".planning/phases/20-toss-order-ticket/20-07-PLAN.md", ".planning/phases/20-toss-order-ticket/20-07-SUMMARY.md", ".planning/phases/20-toss-order-ticket/20-CONTEXT.md", ".planning/phases/20-toss-order-ticket/20-REVIEW-FIX.md", ".planning/phases/20-toss-order-ticket/20-REVIEW.md", ".planning/phases/20-toss-order-ticket/20-UI-SPEC.md", ".planning/phases/20-toss-order-ticket/20-VALIDATION.md", ".planning/phases/20-toss-order-ticket/deferred-items.md", "packages/shared/src/krxTick.ts", "webapp/e2e/specs/a11y.spec.ts", "webapp/e2e/specs/orderbook.spec.ts", "webapp/e2e/specs/sidebar-tree.spec.ts", "webapp/e2e/specs/trading-workbench.spec.ts", "webapp/src/components/trading/card/card-body.tsx", "webapp/src/components/trading/card/manual-order-form.tsx", "webapp/src/components/trading/lc/inline-value-editor.tsx", "webapp/src/components/trading/lc/lc-fields.ts", "webapp/src/components/trading/lc/number-pad-sheet.tsx", "webapp/src/components/trading/lc/setting-group.tsx", "webapp/src/components/trading/lc/use-lc-field-commit.ts", "webapp/src/components/trading/limit-chaser-form.tsx", "webapp/src/lib/numpad.ts", "webapp/src/lib/tick-rule.ts", "webapp/src/lib/use-edit-mode.ts"]
covered_digest: "v1:sha256:db01fcb37e5512e612156a6d5848d88c573171a7553290c656c63fedb63d0fdc"
gaps:
  - truth: "상단 상태줄 1줄 압축 — ROADMAP Phase 20 goal 문구에 명시된 네 번째 산출물(계좌 선택·거래소 세그먼트·LED 3칩·구간 배지·거부·반영 시각을 폰 폭에서 1줄로 압축)"
    status: failed
    reason: "20-01-PLAN.md 자체가 '## Scope exclusion (roadmap goal item deliberately deferred)' 절에서 '이 phase 의 7개 플랜 어디에서도 구현하지 않는다'고 명시하고 '플랜 검사(2026-09-25) WARNING 에 따라 여기 명시 — 사용자 확인 필요'라고 적었다. 그러나 20-02~20-07 SUMMARY, 20-VALIDATION.md, .planning/STATE.md 어디에도 이 제외에 대한 사용자 확인·수락 기록이 없다(D-02a·D-04·D-15a·D-04a 처럼 CONTEXT decisions 절에 등재된 결정이 아니다). 실제 코드도 strategy-card.tsx 의 상태줄이 여전히 여러 줄로 wrap 되는 옛(Phase 18) 구조 그대로다 — trading-workbench.spec.ts 케이스 8 이 '폰 밴드에서 필이 2줄 이상으로 wrap' 을 그대로 단언한다(고침 없음)."
    artifacts:
      - path: webapp/src/components/trading/card/strategy-card.tsx
        issue: "상태줄이 Phase 18 그대로이고 폰 폭 1줄 압축으로 재구성되지 않았다"
    missing:
      - "상단 상태줄 1줄 압축 구현, 또는 이 범위 제외에 대한 사용자의 명시적 수락 기록(override)"
deferred: []
human_verification:
  - test: "목업 8차(.planning/sketches/002-toss-order-ticket/index.html)와 실제 화면을 다크/라이트 · 폰 390(터치) · 태블릿 768(터치) · 데스크톱 1280(마우스)에서 나란히 놓고 톤(색·둥근면·간격)을 대조한다"
    expected: "목업과 시각적으로 합치한다"
    why_human: "시각 톤 대조는 스크린샷 자동 비교로 신뢰성 있게 판정할 수 없다 — 20-07 SUMMARY 가 end-of-phase UAT 로 명시 요청함"
  - test: "실기 하이브리드 기기(터치+트랙패드가 모두 있는 노트북/투인원)에서 행 탭은 시트, 마우스 클릭은 인라인으로 정확히 갈리는지 확인한다"
    expected: "주 포인터가 거친(coarse) 경우 시트, 정밀(fine)한 경우 인라인 — 보조 포인터에 영향받지 않는다"
    why_human: "Playwright 는 (pointer: coarse) 미디어 쿼리를 흉내낼 수 있지만 실제 하이브리드 하드웨어의 브라우저 판정과 100% 동일하다는 보장이 없다(D-12 근거 코드 주석이 이 위험을 직접 언급)"
  - test: "CR-02 수정으로 도입된 LC_ORPHAN_WAIT_MS(7초) 장벽 — 실제 터널 지연 환경에서 그 사이 다른 필드가 '반영 중…'으로 최대 7초 잠기는 체감이 운영상 허용 가능한지 확인한다"
    expected: "7초 값이 실사용 지연 분포에 비해 과도하게 길거나 짧지 않다"
    why_human: "20-REVIEW-FIX.md 가 명시적으로 '7초 값이 운영 감각에 맞는지 확인해 주세요'라고 요청했고, 단위/e2e 테스트는 값의 적정성이 아니라 로직만 검증한다"
  - test: "CR-01(범위 검증 잠금 문구 2종) · WR-05(ETP 경고 문구) · WR-07(주문금액 「—」의 접근성 이름 「주문금액 미입력」) — 새로 도입된 카피 3종의 어조를 확인한다"
    expected: "기존 Copywriting Contract 어조와 어긋나지 않는다"
    why_human: "이 문구들은 UI-SPEC Copywriting 표에 없던 신규 문구이고 20-REVIEW-FIX.md 가 명시적으로 사용자 확인을 요청했다"
  - test: "레거시 전략(서버 buyOrderAmount === 0)이 실환경에 있다면 D-04a 경로(금액 먼저 입력 → 정상 합류, 무장된 레거시 전략 끄기 시 수량 불변)를 실제로 관찰한다"
    expected: "레거시 전략 끄기가 수량을 재계산하지 않고, 금액 입력 후 정상 경로로 합류한다"
    why_human: "단위·e2e 테스트로는 검증했으나 20-REVIEW-FIX.md 가 실환경(레거시 전략 존재) 관찰을 별도로 요청했다 — relay 실지연 환경에서의 CR-02/CR-03 거동도 같은 이유로 포함"
---

# Phase 20: 호가주문 토스식 재구성 (실험 브랜치) Verification Report

**Phase Goal:** 종목상세 호가주문 탭 = `/trading` 작업대 카드 본문(CardBody 공용)의 우측 패널을 토스 주문창 구조로 재구성한다 — 상따 설정 「라벨 ─ 값 ›」 리스트 + 그룹 헤더 스위치 · 폰/태블릿 바텀시트 + 자체 숫자 키패드(단위별 단축 칩) · 데스크톱 인라인 편집(Enter·Esc·↑↓ 한 호가) · 수동주문 토스 주문 티켓 스타일 · 상단 상태줄 1줄 압축. 불변: §2.2b 본문폭 밴드 · 라벨 잘림 0 · 주문 경로(wss 단일 주문 경로·결과 모름 잠금·확인 다이얼로그) 동작 불변.

**Verified:** 2026-09-25T16:35:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Derived from ROADMAP Phase 20 goal text (no explicit numbered Success Criteria list — "Requirements: TBD") + the 7 plans' `must_haves` + 20-CONTEXT.md decisions, per Option C fallback. The 7 plans' frontmatter contain ~60 granular sub-truths; they are grouped here by observable macro-behavior, each backed by the granular evidence gathered below.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 「호가변경」 트레이서: 데스크톱 인라인 클릭 → Enter → `lc.set` 1회 → 60 에코 → 행 값 갱신 + 900ms 강조, end-to-end 가 실제로 동작한다 (20-01) | ✓ VERIFIED | `lc-tracer.test.tsx` in webapp test run (2075 tests passed) · Playwright `P20-1` passed (own run: "66 ✓ ... P20-1 인라인 편집 한 행 ... (1.2s)") · `use-lc-field-commit.ts:508` wired into `limit-chaser-form.tsx` |
| 2 | 필드 확정 상태 기계가 성공·거부·타임아웃·끊김·무장 불가·대기열·늦은 에코·토글 되돌림을 모두 다루고 CardBody가 `unacked`·현재가를 내려준다 (20-01) | ✓ VERIFIED | `card-body.tsx:250,252` `unacked={unacked}` · `currentPrice={...}` wired to `LimitChaserForm` · `use-lc-field-commit.test.tsx` (120 `it` cases) in passing suite |
| 3 | KRX 호가 단위 헬퍼가 `krxTick.ts` 한 곳뿐이고 `limitUpPrice`·`order-panel` 폴백이 이를 호출한다(중복 표 0) (20-02) | ✓ VERIFIED | `grep "krxTickSize(tgt)" limitUp.ts` → present · `TICK_TABLE`/`tickFromTable` absent from `order-panel.tsx` · shared build succeeded, `krxTick.test.ts` in shared 131-test pass |
| 4 | 자체 키패드(`numpad.ts`)의 버퍼·단위별 단축 칩·검증 문구·↑↓ 스텝이 순수 함수로 존재하고 shared `krxTick` 을 재사용한다(표 복제 0) (20-02) | ✓ VERIFIED | `numpad.ts` imports `priceIssueLocks`/`tickUp`/`tickDown`/`priceInputIssue` from `@gh-radar/shared` · own webapp test run includes `numpad.test.ts` pass |
| 5 | 편집 방식이 입력 장치(`pointer: coarse`)로만 갈리고 폭과 무관하다 · 터치는 바텀시트(`NumberPadSheet`, body 포털 · 440 가운데) · 마우스는 인라인이다 (20-03, D-12/D-13) | ✓ VERIFIED | `use-edit-mode.ts` implements `COARSE_POINTER_QUERY` matchMedia exactly per D-12 · `NumberPadSheet` wired via `limit-chaser-form.tsx:979` and `manual-order-form.tsx:1070` · Playwright `P20-2` (터치 기기 시트) passed in own run |
| 6 | 상따 설정 필드 전부가 「라벨 ─ 값 ›」 44px 리스트 행 + 그룹 헤더 스위치로 전환됐고, D-19 그룹 순서·D-21 매수취소 스위치·D-22 체크 행·D-02a 감시대상 풀폭 토글이 구현됐다 (20-04) | ✓ VERIFIED | `lc-fields.ts` (`LC_BUY_GROUPS`/`LC_SELL_GROUPS`) wired via `limit-chaser-form.tsx:970-971` · `WatchTargetRow` D-02a comment + `aria-label="감시대상"` confirmed in `setting-group.tsx:531-555` · no viewport breakpoint utilities, no truncate/ellipsis in `lc/` files (grep 0 hits) |
| 7 | 상따 설정에서 더티 누적과 하단 「수정/되돌리기」 액션 바가 제거됐다 — 필드 1개 확정 = 전송 1회다 (20-04, D-04 — supersedes ROADMAP's stale "더티 액션 바 포털" invariant per task-provided override) | ✓ VERIFIED | `grep -rn "DirtyActionBar|dirty-action-bar|LIMIT_CHASER_DIRTY_HINT|cardDirtyHint"` in `limit-chaser-form.tsx`/`card-body.tsx`/`webapp/src/` → 0 hits |
| 8 | 데스크톱 인라인 편집이 완성됐다 — Enter/Tab/blur 저장, Esc 취소, ↑↓ 한 호가/1, Tab 그룹 내 이동, 한 번 클릭 전환(D-14b), 옮긴 뒤 실패 앵커 표시 (20-05) | ✓ VERIFIED | `inline-navigation.test.tsx` (18 `it`) + `inline-value-editor.test.tsx` (32 `it`) in passing webapp suite · commits `fd24592`/`c5d869f` implement Tab/click-transfer/step behavior |
| 9 | 수동주문이 토스 상자(`TicketBox`) 스타일 · 48/38px 버튼으로 재구성되면서 기능(가격·수량·조각 수·매수/매도/정정/취소, ±버튼·%버튼 없음)과 진입 방식(D-19 그대로)이 보존됐고, 옛 셀렉터(`mo-price-{isin}` 등, `data-testid`)가 살아있다 (20-06, D-08/D-09) | ✓ VERIFIED | `TicketBox` component + `h-[48px]`/`h-[38px]` classes present · `mo-price-`/`mo-qty-`/`mo-pieces-` ids and `manual-order-form`/`manual-order-buttons`/`manual-entry-options` testids all present in `manual-order-form.tsx` |
| 10 | 주문은 오직 매수/매도(정정/취소) 버튼 → `order-confirm-dialog` 로만 나간다 — `sendOrder` 호출 지점·결과 모름 잠금 흐름이 한 줄도 바뀌지 않았다 (D-10, TRADE-07 invariant) | ✓ VERIFIED | `git diff --stat a8a48ad -- manual-order-form.tsx` shows 446 insertions/223 deletions but filtered diff for `sendOrder`/`handleConfirmed`/`OrderConfirmDialog`/`orderLocks`/`DirectOrderReq` lines → 0 changed lines (JSX/style-only diff) · Playwright `P20-5` ("수동주문 시트는 값만 채운다 ... DirectOrderReq 0 · 확인 다이얼로그로만") passed in own run |
| 11 | ETP/미분류 종목은 호가 단위 위반을 경고만 하고(D-15a, WR-05 fix), 잠금은 `priceIssueLocks` 한 곳으로 판정되며 CardBody 가 `useTickRule` 한 번으로 두 폼에 같은 값을 넘긴다 | ✓ VERIFIED | `card-body.tsx:66,232,253,277` wires `useTickRule(isin)` → both forms · `priceIssueLocks` single-source function in `krxTick.ts` (shared) consumed by `numpad.ts` · `krxTick.test.ts` D-15a/WR-05 describe block passing |
| 12 | e2e 가 새 셀렉터·즉시 반영 등가물로 이관됐고(더티 바 케이스 삭제 0), P20-3(최악값×4밴드 잘림 0·44px) · a11y(스위치 role=switch·시트 role=dialog) · orderbook 11(시트 vs FAB z순서) 가 실브라우저에서 통과한다 (20-07) | ✓ VERIFIED | Own run: `pnpm exec playwright test trading-workbench.spec.ts orderbook.spec.ts a11y.spec.ts sidebar-tree.spec.ts` → **71 passed (2.7m)**, 0 failed, includes P20-1~P20-5 · zz-theme-gallery.spec.ts untouched (`git status` still shows `??`) |
| 13 | 상단 상태줄 1줄 압축 — ROADMAP goal 의 네 번째 명시 산출물 | ✗ FAILED | See `gaps` — deliberately not implemented by planner across all 7 plans, flagged "사용자 확인 필요" but never confirmed/recorded; `strategy-card.tsx` status strip unchanged from Phase 18, still multi-line wrap |

**Score:** 12/13 truths verified (1 failed — see Gaps Summary)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `webapp/src/components/trading/lc/use-lc-field-commit.ts` | Field-commit state machine | ✓ VERIFIED | 606 lines, exports match interface contract, wired |
| `webapp/src/components/trading/lc/inline-value-editor.tsx` | Inline 44px row editor | ✓ VERIFIED | 242 lines, wired into `limit-chaser-form.tsx` |
| `webapp/src/components/trading/lc/setting-group.tsx` | SettingRow/Group/GroupSwitch/CheckValueRow/WatchTargetRow/DerivedRow/FailureBubble | ✓ VERIFIED | 601 lines, all exports present and wired |
| `webapp/src/components/trading/lc/lc-fields.ts` | Field/group spec single source | ✓ VERIFIED | 293 lines, `LC_BUY_GROUPS`/`LC_SELL_GROUPS` wired |
| `webapp/src/components/trading/lc/number-pad-sheet.tsx` | Bottom-sheet numpad (shared apply/fill) | ✓ VERIFIED | 388 lines, wired into both forms with `purpose="fill"`/`purpose="apply"` |
| `webapp/src/lib/numpad.ts` | Pure keypad rules | ✓ VERIFIED | 247 lines, imports shared krxTick functions |
| `webapp/src/lib/use-edit-mode.ts` | sheet/inline mode hook | ✓ VERIFIED | 49 lines, matches D-12 spec exactly |
| `webapp/src/lib/tick-rule.ts` | ETP/unknown/stock classification hook | ✓ VERIFIED | 104 lines, wired via `useTickRule(isin)` in card-body |
| `packages/shared/src/krxTick.ts` | Single-source KRX tick helper | ✓ VERIFIED | 102 lines, `krxTickSize`/`tickUp`/`tickDown`/`priceInputIssue`/`priceIssueLocks` exported and re-exported from `index.ts` |
| `webapp/src/components/trading/limit-chaser-form.tsx` | Toss-style list assembly | ✓ VERIFIED | 1091 lines, `useLcFieldCommit`/`LC_BUY_GROUPS`/`GroupSwitch`/`NumberPadSheet`/`useEditMode` all present |
| `webapp/src/components/trading/card/manual-order-form.tsx` | Toss ticket box manual order | ✓ VERIFIED | 1487 lines, `TicketBox`/`NumberPadSheet(purpose="fill")`/old selectors preserved |
| `webapp/src/components/trading/card/card-body.tsx` | unacked/currentPrice/tickRule wiring | ✓ VERIFIED | 325 lines, all three props wired to both forms |
| e2e spec files (4) | Migrated test coverage | ✓ VERIFIED | All 4 specs present, 71 tests total passing in own run |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `limit-chaser-form.tsx` | `use-lc-field-commit.ts` | `useLcFieldCommit(` call | ✓ WIRED | Line 508 |
| `card-body.tsx` | `limit-chaser-form.tsx` | `unacked`/`currentPrice` props | ✓ WIRED | Lines 250, 252, 275, 277 |
| `limit-chaser-form.tsx` | `lc-fields.ts` | `LC_BUY_GROUPS`/`LC_SELL_GROUPS` render | ✓ WIRED | Lines 108-109, 970-971 |
| `limit-chaser-form.tsx` | `setting-group.tsx` | `GroupSwitch` import/use | ✓ WIRED | Lines 126, 869 |
| `limit-chaser-form.tsx` | `number-pad-sheet.tsx` | `NumberPadSheet` (sheet apply) | ✓ WIRED | Lines 122, 979 |
| `manual-order-form.tsx` | `number-pad-sheet.tsx` | `NumberPadSheet purpose="fill"` | ✓ WIRED | Lines 120, 1070, 1075 |
| `card-body.tsx` | `tick-rule.ts` | `useTickRule(isin)` → both forms | ✓ WIRED | Lines 66, 232, 253, 277 |
| `numpad.ts` | `krxTick.ts` (shared) | `priceIssueLocks`/`tickUp`/`tickDown`/`priceInputIssue` import | ✓ WIRED | Line 18 import, used at 191/215/235 |
| `limitUp.ts` | `krxTick.ts` | `krxTickSize(tgt)` call | ✓ WIRED | Confirmed via grep |
| `order-panel.tsx` | `krxTick.ts` | `krxTickSize` fallback | ✓ WIRED | `TICK_TABLE`/`tickFromTable` removed, `krxTickSize` present |
| `manual-order-form.tsx` | `order-confirm-dialog.tsx` | `sendOrder` → `OrderConfirmDialog` unchanged | ✓ WIRED | Diff vs a8a48ad shows 0 logic-line changes on this path |

### Behavioral Spot-Checks / Test Evidence (self-run, not trusted from SUMMARY)

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| shared build | `pnpm --filter @gh-radar/shared build` | DTS build success | ✓ PASS |
| relay typecheck | `pnpm --filter @gh-radar/relay run typecheck` | exit 0, no errors | ✓ PASS |
| webapp typecheck | `pnpm --filter @gh-radar/webapp run typecheck` | exit 0 (`tsc --noEmit && tsc -p tsconfig.e2e.json`) | ✓ PASS |
| relay unit tests | `pnpm --filter @gh-radar/relay run test` | 22 files / 632 tests passed | ✓ PASS |
| webapp unit tests | `pnpm --filter @gh-radar/webapp run test` | 108 files / 2075 tests passed, 1 skipped | ✓ PASS |
| e2e (4 specs, self-launched dev server on 3100) | `playwright test trading-workbench.spec.ts orderbook.spec.ts a11y.spec.ts sidebar-tree.spec.ts` | **71 passed (2.7m)**, 0 failed, includes P20-1~P20-5 | ✓ PASS |
| manual-order send path diff vs base `a8a48ad` | `git diff a8a48ad -- manual-order-form.tsx` filtered for `sendOrder`/`handleConfirmed`/`OrderConfirmDialog`/`orderLocks`/`DirectOrderReq` | 0 changed lines on those symbols (JSX/style-only diff) | ✓ PASS |
| `zz-theme-gallery.spec.ts` untouched | `git status -sb` | still `?? webapp/e2e/specs/zz-theme-gallery.spec.ts` | ✓ PASS |
| dev server port 3100 | `lsof -iTCP:3100 -sTCP:LISTEN` before/after | empty before, empty after (Playwright's own webServer teardown) | ✓ PASS |

### Code Review Findings (20-REVIEW.md / 20-REVIEW-FIX.md)

Independent code review found 3 Critical + 7 Warning + 3 Info issues. All 10 Critical+Warning were fixed across 2 rounds with regression tests confirmed to fail-first against pre-fix code (documented per-fix in 20-REVIEW-FIX.md), and the fixes are present and wired in the current tree (verified above: `amountRequired`/`lcAmountBlockOf`, `priceIssueLocks`/`tickRule`, orphan-wait timeout handling in `use-lc-field-commit.ts`). The 3 Info findings (IN-01/02/03) were explicitly left out of scope — minor UX polish items, not functional gaps.

### Requirements Coverage

Phase 20 has no requirement IDs (ROADMAP: "Requirements: TBD"). No REQUIREMENTS.md entries map to Phase 20. Not applicable — traced against CONTEXT.md decisions and must_haves instead, per task instructions.

### Anti-Patterns Found

No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers found in the reviewed lc/, numpad.ts, tick-rule.ts, krxTick.ts, limit-chaser-form.tsx, manual-order-form.tsx, or card-body.tsx files. No stub returns, no hardcoded-empty-data anti-patterns, no ellipsis/truncate on label/value text (explicitly prohibited by plan and confirmed absent). No viewport-breakpoint utility classes introduced in new `lc/` files (grep 0 hits, consistent with §2.2b container-query-only mandate).

### Human Verification Required

See frontmatter `human_verification` list — 5 items: visual tone comparison vs mockup 8th iteration, real hybrid-device pointer-mode switching, CR-02's 7-second orphan-wait operational feel, 3 new copy strings' tone confirmation, and real-environment observation of the D-04a legacy-strategy flow. None of these block the phase goal's core mechanism (all are either aesthetic/tone judgments or "nice to observe in production" requests explicitly flagged by the code-review-fix pass) — but they are open per the source documents and are surfaced here rather than silently dropped.

### Gaps Summary

**One gap blocks full goal achievement:** the ROADMAP Phase 20 goal text explicitly lists four deliverables, the last being "상단 상태줄 1줄 압축" (top status-strip 1-line compression). None of the 7 executed plans implement this — 20-01-PLAN.md contains an explicit `## Scope exclusion (roadmap goal item deliberately deferred)` section stating this was deliberately dropped and flagging "사용자 확인 필요" (user confirmation needed). No subsequent plan, SUMMARY, STATE.md, or VALIDATION.md record shows this confirmation was ever given — unlike the three other roadmap-text deviations in this phase (D-02a, D-04/dirty-bar-removal, D-15a/D-04a), which are all explicitly recorded as accepted decisions in `.planning/STATE.md` and `20-CONTEXT.md`. The code confirms this: `strategy-card.tsx`'s status strip is unchanged from Phase 18 and `trading-workbench.spec.ts` case 8 still asserts multi-line wrap behavior (not 1-line compression).

**This looks intentional and well-reasoned** (UI-SPEC A7 gives a specific, defensible rationale: the status strip carries account selector, exchange segment, 3 LED chips, section badge, rejection text, and reflection timestamp — compressing this to one line on phone width risks violating the "label truncation = 0" invariant that is itself LOCKED for this phase). To accept this deviation, add to VERIFICATION.md frontmatter:

```yaml
overrides:
  - must_have: "상단 상태줄 1줄 압축"
    reason: "UI-SPEC A7: 상태줄 정보 밀도가 높아 폰 폭 1줄 압축이 라벨 잘림(=오발주) 불변식과 충돌할 위험이 있다. 우측 패널 재구성과 독립적이라 별도 quick 태스크로 분리하는 것이 안전하다."
    accepted_by: "<user>"
    accepted_at: "<ISO timestamp>"
```

All other must-haves across the 7 plans — the field-commit state machine, the toss-style settings list, the touch bottom-sheet + numpad, the desktop inline editor, the manual-order ticket restyle, the ETP tick-rule warning-not-lock behavior, and the e2e/build/test gate — are verified present, substantively implemented, wired end-to-end, and independently re-run (not merely trusted from SUMMARY.md) with all builds, typechecks, unit tests (2075 webapp + 632 relay + shared), and e2e (71/71) passing.

---

_Verified: 2026-09-25T16:35:00Z_
_Verifier: Claude (gsd-verifier)_
