---
phase: quick-261012-oif
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/components/trading/lc/lc-fields.ts
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/lc/setting-group.tsx
  - webapp/src/styles/globals.css
  - webapp/src/components/me/limit-chaser-defaults.tsx
  - webapp/src/components/trading/lc/__tests__/lc-fields.test.ts
  - webapp/src/components/trading/lc/__tests__/setting-group.test.tsx
  - webapp/src/components/trading/lc/__tests__/two-line-row.test.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
  - webapp/e2e/specs/trading-workbench.spec.ts
autonomous: true
requirements: [LC-TWEAK-1-chevron, LC-TWEAK-2-baseline-row, LC-TWEAK-3-cancel-fold, LC-TWEAK-4-burst-cancel]
must_haves:
  truths:
    - "Value-button chevron › shows at every lc width >= X (measured), hidden only below X; >=685 unchanged"
    - "매도주문 card has no 「잔량추적 기준선」 row (baseline already shown in 매수잔량 칸)"
    - "매수취소 card folds like 자동매도: default collapsed, switch in title, summary 매수잔량 · 체결 · 잔량추적"
    - "☐버스트 취소 is the last row of 매수주문 card, dims with buyEnabled; 줄매수 card/summary no longer has it"
  artifacts:
    - path: webapp/src/components/trading/lc/lc-fields.ts
      provides: "LC_BUY_GROUPS/LC_SELL_GROUPS specs, lcSummaryOf cancel case"
  key_links:
    - from: lc-fields.ts cancel spec (collapsible true)
      to: limit-chaser-form.tsx FOLD_SLOTS + expanded state
      via: "isFoldSlot(slot) gate in renderGroup fold prop"
---

<objective>
Four small 상따 설정 form fixes (`/trading/limit-chaser`). Reuse existing fold / check-row / derived-row patterns only — no new components or abstractions. Field names, checkIds, wire, shared/relay/echo logic unchanged.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
</execution_context>

<context>
@CLAUDE.md
Key lines: `webapp/src/components/trading/lc/lc-fields.ts` (buy spec ~187, extra-buy burst row ~330-334, sell derived row ~474-475, cancel spec ~478-497, `lcDerivedRowTextOf` ~765-788, `lcSummaryOf` ~840-910); `webapp/src/components/trading/limit-chaser-form.tsx` (`FoldSlot`/`FOLD_SLOTS` ~682, `expanded` ~1515, `qtyDerivedRowProps` ~1694, derived branch ~1830-1851); `webapp/src/components/trading/lc/setting-group.tsx` (`ROW_BOX` comment ~67-78, `ROW_BOX_TALL` comment ~82-90, `ValueWithChevron` ~268-295, `DerivedRow` doc ~1013).
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: 기준선 행 삭제 · 매수취소 접이식 · 버스트 취소 이동 (items 2/3/4)</name>
  <files>webapp/src/components/trading/lc/lc-fields.ts, webapp/src/components/trading/limit-chaser-form.tsx, webapp/src/components/trading/lc/setting-group.tsx, webapp/src/components/trading/lc/__tests__/lc-fields.test.ts, webapp/src/components/trading/lc/__tests__/setting-group.test.tsx, webapp/src/components/trading/lc/__tests__/two-line-row.test.tsx, webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx</files>
  <behavior>
    - LC_SELL_GROUPS sell spec has no derived row; form renders no `[data-slot="lc-derived"]` even when `sellEntryLatched`.
    - cancel spec `collapsible: true`; form shows cancel fold button `aria-expanded=false` by default; `lcSummaryOf('cancel', …)` = [매수잔량 amountKv · 체결 켬/꺼짐(off) · 잔량추적 켬/꺼짐(off)].
    - buy spec last row = check `extraBuyBurstRelease` / `lc-extra-buy-burst-release` / label '버스트 취소'; dims when buyEnabled false; not in extra-buy spec; extra-buy summary never contains a 버스트 kv.
  </behavior>
  <action>
    <!-- planner-discipline-allow: 버스트 해제 -->
    Item 2 (baseline row): delete the `{ kind: 'derived', source: 'sellQtyTrackBaseline', … }` row (and its comment) from LC_SELL_GROUPS. Narrow the `derived` row unions in `LcRowSpec` to source `'postBuyTriggerQty' | 'autoSellSoldQty' | 'autoSellBasisPrice'`, label `'발동잔량' | '누적 매도' | '기준'`. Narrow `lcDerivedRowTextOf` and `qtyDerivedRowProps` param to `'postBuyTriggerQty'` and collapse the now-dead source ternaries in `lcDerivedRowTextOf` (price = buyWatchPrice, unlock = postBuyUnlockQty). In `renderRow` drop the `sellEntryLatched` baseline block; the postBuyTriggerQty return becomes the unconditional tail (remove its now-redundant `if`). Reword comments that cite the row minimally (lc-fields ~766, form ~1695, setting-group ROW_BOX/ROW_BOX_TALL/L4/DerivedRow): the baseline shows in 매도 매수잔량 칸 via `echoAmountOf` (same reason as the cancel card), row removed in quick-261012-oif; L4 stays as a safety net. Do NOT touch packages/shared, relay, `formFromServer`/echo logic.
    Item 3 (cancel fold): cancel spec `collapsible: true`; add `'cancel'` to `FoldSlot`, `FOLD_SLOTS`, and the `expanded` initial state (false). Add `case 'cancel'` to `lcSummaryOf` following the pre-buy 체결량 on/off shape. Mirror how auto-sell became collapsible (Phase 27) — nothing else.
    Item 4 (burst): move the check row to the end of the `buy` spec rows with label '버스트 취소'; move its history comment, append a line: quick-261012-oif — moved to 매수주문 and renamed 「버스트 취소」 because cancel scope = all buy unfilled orders (gh-trade inbox 261008-burst-release-all-buy-cancel); dims with 매수주문 gate. Remove the 버스트 kv from the extra-buy summary case and its comment. extra-buy headerCheck hint: 「발주 · 포기 · 버스트 해제」 → 「발주 · 포기 · 버스트 취소」. Keep field name/checkId/wire.
    Tests: update the existing cases (lc-fields.test burst/summary/derived cases ~183-215 and ~588 — delete the sellQtyTrackBaseline case; limit-chaser-form.test ~678, ~3592-3650, ~4603 — delete baseline-row cases, retarget burst cases to the 매수주문 group + new label/a11y name + buyEnabled dim; any fold-count/row-order assertion that now fails). Add one cancel-summary case and one cancel-fold-default case next to the auto-sell equivalents. In component-only tests (setting-group.test ~611-641/~1141, two-line-row.test ~148) swap the DerivedRow label literal to '발동잔량'.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/lc/__tests__ src/components/trading/__tests__/limit-chaser-form.test.tsx src/components/trading/__tests__/card-body.test.tsx --maxWorkers=2</automated>
  </verify>
  <done>Typecheck + listed vitest files green. `grep -rnE "['\"\`]잔량추적 기준선" webapp/src | wc -l` = 0. `grep -rn "버스트 해제" webapp/src --exclude-dir=__tests__ | grep -vE ":[0-9]+:\s*(//|\*|/\*)" | wc -l` = 0. Commit (explicit paths, Korean, no Co-Authored-By, no push).</done>
</task>

<task type="auto">
  <name>Task 2: 쉐브런 임계 실측 X · e2e 정합 (item 1)</name>
  <files>webapp/src/components/trading/lc/setting-group.tsx, webapp/src/styles/globals.css, webapp/src/components/me/limit-chaser-defaults.tsx, webapp/src/components/trading/lc/__tests__/setting-group.test.tsx, webapp/src/components/trading/lc/__tests__/two-line-row.test.tsx, webapp/e2e/specs/trading-workbench.spec.ts</files>
  <action>
    <!-- planner-discipline-allow: @min-[685px]/lc:inline -->
    A. e2e alignment first (permanent, `trading-workbench.spec.ts`): `expandLcGroup` slot union += 'cancel'. P20-3: also expand 'cancel' in its expand loop; drop 'lc-derived' from SELL_ROWS and the `lc-derived … toContainText('100,000주')` line; drop the now-meaningless `lc-derived toHaveCount(0)` line. P24-7: FOLD_SLOTS += 'cancel'; checkCollapsed counts 매도 pane 1→2 and 2열 4→5; drop 'lc-derived' from the arrayContaining lists; remove `checkL4Label`, its call, the `l4` length expectation and its annotation (the only L4 row is gone). Grep e2e for clicks on `lc-cancel-trade`/`lc-cancel-qty-track`/`lc-cancel-watch-qty` and confirm they go through `showLc`/`editLc` (generic unfold); fix any that don't.
    B. Measure X (temporary edits, never committed): force the chevron visible (replace the `hidden … @min-[685px]/lc:inline` tokens with `inline`), add a temporary `console.log(label, worst.free, worst.what)` in P20-3 `expectRows`, set P20-3 targets to a descending phone ladder (e.g. 684, 600, 520, 460, 420, 380, 344). Run P20-3 only. Free px grows ~1:1 with width in the single-column phone band, so interpolate X0 = smallest width with worst free ≥ 0 and confirm by running X0 and X0−4. X = X0 + ~8, rounded up to a multiple of 10 (single threshold, no per-row rules). If X0+8 ≥ 685, keep 685 and report.
    C. Apply: chevron class `hidden … @min-[{X}px]/lc:inline` (Tailwind literal). Revert the temporary log/ladder; P20-3 targets become 344, X (only if X > 344), LC_COMPACT_MIN, 830, 992 — X is the new permanent worst-case guard for the chevron. Update unit tests asserting the token (setting-group.test ~666-676 incl. test title; two-line-row.test ~88). Rewrite the L3 comment in `ValueWithChevron`: hidden only below lc X; reason (phone single column is often wider than one 2-column column); measured numbers (X0 free, X free, worst row) and quick-261012-oif; ROW_BOX comment's L3 sentence likewise. globals.css §2.2b: under 「밴드 경계는 셋뿐이다」 add 2-3 lines: `@min-[{X}px]/lc` is the chevron L3 threshold, not a band boundary, measurement lives in setting-group.tsx `ValueWithChevron` (do not duplicate the band table). limit-chaser-defaults.tsx comment ~565: 「폰 밴드(<685)」 → 「lc <{X}」 (comment only).
    Run P20-3, P24-7, P24-8 (P24-8 = phone one-screen ≤ 660; Phase 31 measured 602, burst row adds ~44). If P24-8 exceeds 660, do NOT loosen the budget — stop and report the numbers. If Playwright webServer times out on NextFontGoogleFontFileReplacer, `rm -rf webapp/.next` and retry.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/lc/__tests__/setting-group.test.tsx src/components/trading/lc/__tests__/two-line-row.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g "P20-3|P24-7|P24-8" --workers=1</automated>
  </verify>
  <done>All green; `git diff` shows no leftover temporary ladder/console.log/forced-inline; `grep -c "@min-\[685px\]/lc:inline" webapp/src/components/trading/lc/setting-group.tsx` = 0 (the chevron span was its only use). SUMMARY records ladder widths → worst free px, X0, X, and P24-8 total. Commit (explicit paths, Korean, no Co-Authored-By, no push).</done>
</task>

</tasks>

<verification>
Typecheck, the listed vitest files (`--maxWorkers=2`), and Playwright P20-3/P24-7/P24-8 (`--workers=1`) pass. No full e2e suite.
</verification>

<success_criteria>
All four tweaks visible in the form; the chevron threshold rests on a recorded measurement; commits contain only listed paths.
</success_criteria>

<output>
Create `.planning/quick/261012-oif-lc-card-tweaks/261012-oif-SUMMARY.md` when done
</output>
