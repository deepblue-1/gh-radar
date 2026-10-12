---
phase: quick-261012-qld
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/lib/limit-chaser.ts
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/strategy-log.tsx
  - webapp/src/components/trading/lc/lc-fields.ts
  - webapp/src/components/trading/lc/setting-group.tsx
  - webapp/src/components/trading/latch-led.tsx
  - webapp/src/lib/__tests__/limit-chaser.test.ts
  - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
  - webapp/src/components/trading/__tests__/strategy-log.test.tsx
  - webapp/src/components/trading/__tests__/latch-led.test.tsx
  - webapp/src/components/trading/lc/__tests__/lc-fields.test.ts
  - webapp/src/components/trading/lc/__tests__/setting-group.test.tsx
  - webapp/src/components/trading/lc/__tests__/inline-navigation.test.tsx
  - webapp/e2e/specs/trading-workbench.spec.ts
  - docs/inbox/from-gh-trade/261012-lc-reentry-unlimited.md
autonomous: true
requirements: [INBOX-261012-1-max-field, INBOX-261012-2-auto-hint, INBOX-261012-3-exhausted-note, INBOX-261012-4-wire-255, INBOX-261012-5-burst-label, INBOX-261012-6-tests, INBOX-261012-7-note-done]

estimate:
  tokens: 110000
  raw_tokens: 110000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "Every lc.set the web sends carries postBuyReentry = 255, whatever the form / echo / 84 seed value is (gateway SetLimitChaserReq bytes show 255)"
    - "A strategy whose echo still carries an old 「최대」 value (e.g. 3, registered before this change) still gets the D-02 auto master-off, and the 3→255 echo transition never writes a 「서버 반영 완료」 log line"
    - "후매수 card rows are 금액 → 최소 잔량 → 반등 → 발동잔량 — no 「최대」 row, no 「최대」 summary kv, no 소진 notice line even for a phase-3 echo"
    - "줄매수 ☐자동 hint ends at 「…서버가 줄매수를 다시 켜요」 — it no longer points at the 후매수 「최대」 칸"
    - "후매수 보유중 buy-LED tooltip no longer mentions a remaining count / 소진"
    - "매수주문 card checkbox label stays 「버스트 취소」 (already shipped by quick-261012-oif — verified, not re-edited)"
    - "docs/inbox/from-gh-trade/261012-lc-reentry-unlimited.md frontmatter is status: done with done_commit left empty for the orchestrator"
  artifacts:
    - path: webapp/src/lib/limit-chaser.ts
      provides: "exported POST_BUY_REENTRY_UNLIMITED = 255; default form value; isMasterOnlyDelta skips postBuyReentry"
    - path: webapp/src/components/trading/limit-chaser-form.tsx
      provides: "buildCfg forces postBuyReentry = POST_BUY_REENTRY_UNLIMITED after the values spread; no 소진 notice branch"
    - path: webapp/src/components/trading/strategy-log.tsx
      provides: "VALUE_COMPARE_SKIP contains postBuyReentry"
    - path: webapp/src/components/trading/lc/lc-fields.ts
      provides: "post-buy spec without the 최대 row / note row; LcRowSpec without note kind; new 줄매수 자동 hint"
  key_links:
    - from: webapp/src/components/trading/limit-chaser-form.tsx buildCfg
      to: relay lc.set → gateway SetLimitChaserReq post_buy_reentry
      via: "postBuyReentry: POST_BUY_REENTRY_UNLIMITED placed AFTER ...values (e2e P24-1 reads the gateway bytes)"
    - from: webapp/src/components/trading/limit-chaser-form.tsx dropMasterAfterServerFold
      to: webapp/src/lib/limit-chaser.ts isMasterOnlyDelta
      via: "postBuyReentry key skipped so a legacy echo (3) vs fixed 255 is still a master-only delta"
    - from: webapp/src/components/trading/strategy-log.tsx limitChaserValuesChanged
      to: VALUE_COMPARE_SKIP
      via: "'postBuyReentry' member — 3→255 echo is not a user value change"
---

<objective>
Reflect gh-trade handoff 261012 (`docs/inbox/from-gh-trade/261012-lc-reentry-unlimited.md`): the server no longer reads `post_buy_reentry` and never fills `post_buy_reentry_left` (always 0); the 「후매수 소진」 / 줄매수 자동 재체크 「재진입 0」 notices are gone. Wire format unchanged.

Purpose: the 상따 화면 must stop showing a 후매수 「최대」 칸, its 「남은 N회」 count and the 소진 notice (all now meaningless), and must always send 255 like the C# client (old-server compat = effectively unlimited).

Output: webapp-only changes (lib + 상따 form/spec + strategy-log skip set + LED tooltip), updated unit/e2e tests, handoff note status done, SUMMARY.md. SCOPE CAP: no relay/, no packages/shared, no DB migration, no fbs resync, no /me page.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@docs/inbox/from-gh-trade/261012-lc-reentry-unlimited.md

HARD EXECUTION CONSTRAINTS (from the user, via orchestrator):
- Do NOT run `git commit`, `git add`, `git stash`, or `git push`. Edit files, run verification, write SUMMARY.md, then stop. The orchestrator shows the commit message to the user and commits.
- Memory pressure (concurrent sessions): vitest always `--maxWorkers=2`; Playwright always `--workers=1` and ONLY the `-g` filtered specs named in this plan — never the full e2e suite.
- If the Playwright webServer times out while `NextFontGoogleFontFileReplacer` repeats in the log, run `rm -rf webapp/.next` and rerun once. If the auth setup project fails for missing env, report it in SUMMARY.md (do not skip silently).
- `pnpm --filter @gh-radar/webapp exec …` runs inside `webapp/`, so test paths after `exec` are webapp-relative (same commands quick-261012-oif used). All other paths are repo-root-relative.

Key locations (line numbers approximate — grep first):
- `webapp/src/lib/limit-chaser.ts`: `defaultLimitChaserForm` doc ~262 and `postBuyReentry: 3` ~320; `USER_SETTINGS_SEED_MAP` ~402-413 (keep); `formFromServer` ~769 (keep); `isMasterOnlyDelta` ~785-819.
- `webapp/src/components/trading/limit-chaser-form.tsx`: `GroupNote` import ~162; `POST_BUY_EXHAUSTED_TEXT` ~688-689; `buildCfg` ~856-887 (클라 고정 3 block); renderRow `case 'note'` ~1848-1856.
- `webapp/src/components/trading/strategy-log.tsx`: `VALUE_COMPARE_SKIP` ~283-305.
- `webapp/src/components/trading/lc/lc-fields.ts`: `LcNumField` ~52; LcUnit doc ~76; label doc ~89; `LcRowSpec` note variant ~136; burst row ~216-222 (already 「버스트 취소」); extra-buy headerCheck ~299-306; post-buy rows ~364-375; `lcNavigableRows` doc ~608; `lcValueTextOf` doc ~634-636 + case ~649-652; `lcSummaryOf` post-buy ~878-889; `lcRowDimOf` case note ~956-957.
- `webapp/src/components/trading/lc/setting-group.tsx`: valueText doc example ~337; `GroupNote` ~671-678.
- `webapp/src/components/trading/latch-led.tsx`: `BUY_HOLDING_TOOLTIP` ~99.
- gh-trade server keeps and echoes `post_buy_reentry` verbatim (Gateway.cpp 4893 「보관·에코만」) — so legacy strategies echo their old value (e.g. 3) until the next submit rewrites it to 255. That is why Task 1 adds the two skip points.
</context>

<tasks>

<task type="tracer">
  <name>Task 1: 와이어 트레이서 — lc.set postBuyReentry 255 고정 (폼 → relay → 게이트웨이 바이트) + 옛 에코 무해화 (item 4)</name>
  <files>webapp/src/lib/limit-chaser.ts, webapp/src/components/trading/limit-chaser-form.tsx, webapp/src/components/trading/strategy-log.tsx, webapp/src/lib/__tests__/limit-chaser.test.ts, webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx, webapp/src/components/trading/__tests__/strategy-log.test.tsx, webapp/e2e/specs/trading-workbench.spec.ts</files>
  <behavior>
    - buildCfg output has postBuyReentry === 255 even when the echo says 3 and the 84 seed says 4.
    - isMasterOnlyDelta(webCfg with 255, echo with postBuyReentry 3) === true; all existing it.each cases keep their expected values.
    - limitChaserValuesChanged(a, {...a, postBuyReentry: 255}) === false and strategyLogLine for that pair does not contain 「서버 반영 완료」.
    - defaultLimitChaserForm().postBuyReentry === 255.
    - e2e P24-1: the gateway's last SetLimitChaserReq has postBuyReentry 255 (seed echo carries 3).
  </behavior>
  <action>
    1. `webapp/src/lib/limit-chaser.ts`: add an exported constant `POST_BUY_REENTRY_UNLIMITED = 255` (place it just above `defaultLimitChaserForm`) with a short Korean doc: gh-trade 261012(quick-261012-ow7) — 서버는 이 칸을 읽지 않는다(후매수 · 줄매수 자동 무제한); C# 클라처럼 늘 255 를 싣는다 — 구 서버에서도 사실상 무제한. Use it as the `postBuyReentry` default in `defaultLimitChaserForm` (replace the `3 // DEFAULT_POST_BUY_REENTRY` line) and reword the function doc's 「최대 3회」 mention to 「후매수 재진입 255 고정」. Keep `UserSettingsSeed`, `USER_SETTINGS_SEED_MAP` (84 postBuyMaxCount → form value) and `formFromServer` unchanged per the user's "minimal data-model change" instruction; add one comment line at the seed-map entry saying the seeded value is inert because buildCfg forces 255.
    2. Same file, `isMasterOnlyDelta`: skip the `postBuyReentry` key exactly like `buyEnabled` (one condition on the existing `continue`). Add to the doc comment, next to the 「고정 필드를 비교에서 빼지 않는다」 rule, the stated exception: the server ignores this field (gh-trade 261012), so a legacy echo value vs the fixed 255 is not "a value another client set"; without the skip the D-02 auto master-off would be suppressed forever for strategies registered before this change.
    3. `webapp/src/components/trading/limit-chaser-form.tsx` `buildCfg`: inside the 「클라 고정」 block (after `...qtys`, i.e. AFTER the `...values` spread so it wins), add `postBuyReentry: POST_BUY_REENTRY_UNLIMITED` imported from `@/lib/limit-chaser` (follow the file's existing import of that module). Update the block comment from 「클라 고정 3」 to 4 with a one-line reason (gh-trade 261012 · 서버가 읽지 않는 칸 · C# 동형 255). This is the ONLY lc.set assembly point (use-lc-field-commit calls it) — do not add the override anywhere else.
    4. `webapp/src/components/trading/strategy-log.tsx` `VALUE_COMPARE_SKIP`: add `'postBuyReentry'` with a comment: 서버가 읽지 않는 칸(gh-trade 261012) — 옛 등록 에코 값 → 웹 · C# 255 고정 전이를 「서버 반영 완료」로 말하지 않는다. Do not touch `ECHO_ANSWER_SKIP` / `RUNTIME_ONLY_SKIP`.
    5. Tests — `webapp/src/lib/__tests__/limit-chaser.test.ts`: default test (~1283-1290) expects `POST_BUY_REENTRY_UNLIMITED` (import it) and its title drops 「최대 3회」; seeding 'present false' test (~1673-1685) expects `postBuyReentry: 3` (84 built-in postBuyMaxCount still seeds the inert form value) with a comment, title adjusted (8값은 D-04 상수 · 재진입은 84 값); `isMasterOnlyDelta` describe (~1337): make `webCfgOf` mirror buildCfg by adding `postBuyReentry: POST_BUY_REENTRY_UNLIMITED` after its `...values` spread, and add an it.each case 「옛 등록 에코 postBuyReentry 3 — 서버가 읽지 않는 칸은 비교하지 않는다(gh-trade 261012)」 with `{ postBuyReentry: 3 }` → true.
    6. Tests — `webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx`: change every assertion on a SENT cfg (`lastConfig()` / `sentConfigs()` / `cfg.` toMatchObject/toBe) that expects postBuyReentry 3 or 4 to 255 — known sites: D-11 test ~2294-2316 (title: cfg postBuyReentry = 255 고정 · 에코 설정값 3 · 잔여 1 무관), ~3141, and the 84-seed test ~3991 (comment: 84 postBuyMaxCount 4 는 폼 값에만 시딩, 전송은 255). Echo fixtures (`echo({ … postBuyReentry: 3 … })`) stay unchanged. Leave UI assertions about the 「최대」 row for Task 2.
    7. Tests — `webapp/src/components/trading/__tests__/strategy-log.test.tsx`: in the describe 「S→C 전용 필드 · 값 변경 판정 · 런타임 전용 에코」 (~213) add a case: an echo differing only by postBuyReentry 3 → 255 is not a value change and its log line has no 「서버 반영 완료」.
    8. e2e — `webapp/e2e/specs/trading-workbench.spec.ts` P24-1 (~2602): `expect(last.postBuyReentry).toBe(255)` with a short comment (시드 에코 3 이어도 웹은 255 고정 · gh-trade 261012). Leave the tooltip assertion (~2620) for Task 2.
    Do NOT touch relay/, packages/shared, lc-ranges.ts, or the /me page.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/limit-chaser.test.ts src/components/trading/__tests__/limit-chaser-form.test.tsx src/components/trading/__tests__/strategy-log.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g "P24-1 buy3" --workers=1</automated>
  </verify>
  <done>Typecheck passes; the three vitest files pass; P24-1 passes reading 255 from the gateway bytes; `grep -n "postBuyReentry: POST_BUY_REENTRY_UNLIMITED" webapp/src/components/trading/limit-chaser-form.tsx webapp/src/lib/limit-chaser.ts` shows the buildCfg line and the default line; `grep -n "'postBuyReentry'" webapp/src/components/trading/strategy-log.tsx webapp/src/lib/limit-chaser.ts` shows the skip-set member and the isMasterOnlyDelta skip.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 후매수 「최대」 칸 · 소진 안내 · 줄매수 자동 힌트 · 보유중 툴팁 정리 (items 1, 2, 3, 5)</name>
  <files>webapp/src/components/trading/lc/lc-fields.ts, webapp/src/components/trading/limit-chaser-form.tsx, webapp/src/components/trading/lc/setting-group.tsx, webapp/src/components/trading/latch-led.tsx, webapp/src/components/trading/lc/__tests__/lc-fields.test.ts, webapp/src/components/trading/lc/__tests__/setting-group.test.tsx, webapp/src/components/trading/lc/__tests__/inline-navigation.test.tsx, webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx, webapp/src/components/trading/__tests__/latch-led.test.tsx, webapp/e2e/specs/trading-workbench.spec.ts</files>
  <behavior>
    - post-buy spec row kinds = value, value, value, derived; ids = 금액 / 최소 잔량 / 반등 ids, then the derived 발동잔량.
    - lcNavigableRows('post-buy') = amount → floor → rebound; Tab from 금액 goes 금액 → 최소 잔량 → 반등 → end, even with a phase-3 echo.
    - lcSummaryOf('post-buy', …) = [금액, 최소, 반등, 발동잔량] — no 「최대」 kv, no 「남은」 text.
    - A phase-3 echo still shows status 「소진」 (old gh-trade state files can restore it) but the expanded card has no 최대 row and no notice line.
    - extra-buy headerCheck hint === '줄매수가 풀린 뒤(발주 · 포기 · 버스트 취소) 상한가를 벗어나고 잔고가 0 이면 서버가 줄매수를 다시 켜요'.
    - BUY_HOLDING_TOOLTIP === '후매수 보유중 — 산 물량이 전부 정리되면 다시 감시'.
    - Buy card burst checkbox label remains '버스트 취소'.
  </behavior>
  <action>
    <!-- planner-discipline-allow: lc-post-buy-reentry -->
    <!-- planner-discipline-allow: lc-post-buy-exhausted -->
    <!-- planner-discipline-allow: POST_BUY_EXHAUSTED_TEXT -->
    <!-- planner-discipline-allow: GroupNote -->
    <!-- planner-discipline-allow: postBuyExhausted -->
    New or reworded comments must name the removed pieces by concept only (「후매수 최대 칸」, 「소진 안내 줄」, 「정적 안내 줄 컴포넌트」) — never by their old identifiers, slot ids or constant names; Task 3 greps the source files for them.
    1. `webapp/src/components/trading/lc/lc-fields.ts` (per handoff + items 1/2/5):
       a. Remove the `postBuyReentry` member from the `LcNumField` union.
       b. LcUnit doc (~76): drop the 후매수 「최대」/「회」 reason (unit type stays `PadUnit`). LcValueSpec.label doc (~89): example list becomes 「금액」「최소 잔량」「반등」.
       c. Remove the note variant from `LcRowSpec` and the `case 'note'` branch in `lcRowDimOf`.
       d. extra-buy headerCheck: in the preceding comment replace the sentence about sharing the 후매수 「최대」 칸 with 「재체크 횟수 제한 없음 — gh-trade 261012」; set `hint` to exactly '줄매수가 풀린 뒤(발주 · 포기 · 버스트 취소) 상한가를 벗어나고 잔고가 0 이면 서버가 줄매수를 다시 켜요'.
       e. post-buy rows: delete the 「최대」 value row (id lc-post-buy-reentry) and the note row plus its comment. Optionally leave one line: 후매수 최대 칸 폐지(gh-trade 261012 · 서버가 칸을 읽지 않는다) — 전송은 buildCfg 가 255 고정. Resulting order 금액 → 최소 잔량 → 반등 → 발동잔량.
       f. `lcNavigableRows` doc: drop 「· 소진 안내」. `lcValueTextOf`: delete the 후매수 재진입 doc bullets (D-11 / quick-261011-0yb lines) and the `case 'postBuyReentry'` block.
       g. `lcSummaryOf` post-buy: delete the 「최대」 item (keep the `text` helper — auto-sell uses it).
       h. Item 5 is already done (burst row label is '버스트 취소' since quick-261012-oif): do not edit that row; just confirm with grep.
    2. `webapp/src/components/trading/limit-chaser-form.tsx` (item 3): delete `POST_BUY_EXHAUSTED_TEXT` and its doc comment, the renderRow `case 'note'` branch, and the `GroupNote` name from the `./lc/setting-group` import list. Keep the 「소진」 group-status mapping (phase 3 can still be restored from old gh-trade state files).
    3. `webapp/src/components/trading/lc/setting-group.tsx`: delete the now-dead `GroupNote` component and its doc comment (no other user). Update the valueText doc example (~337) that quotes 「3회 · 남은 2회」 to a still-valid one (e.g. 「이탈 후 다음 체결」).
    4. `webapp/src/components/trading/latch-led.tsx`: `BUY_HOLDING_TOOLTIP` becomes exactly "후매수 보유중 — 산 물량이 전부 정리되면 다시 감시" (the remaining-count/소진 parenthetical is false now — no limit). Do not change `card-body.tsx`.
    5. Unit tests:
       - `lc-fields.test.ts`: delete the two lcValueTextOf 재진입 tests (~118-141); post-buy summary test (~230): drop the 「최대」 item and shift every later index (e.g. `hot[2]` → `hot[1]`) — read the whole test; delete the reentry rows in the a11y it.each (~336) and label/sheet-title it.each (~359); lcRangeIssue (~380-388): drop the `postBuyReentry: 256` expectation and its title fragment, delete the 「재진입 0 은 유효하다」 test. Keep the `values()` fixture field (form type still has it).
       - `setting-group.test.tsx`: post-buy kinds/ids (~84-92) per behavior; field→id map (~144) delete the entry; desc/unit (~182-185) delete the 최대 desc assertion and assert only the rebound unit '%'; lcNavigableRows post-buy (~241) delete the id; delete the GroupNote test (~930-936) and its import (~47); retitle the describe (~880) without the GroupNote / 소진 안내 part; ADD an assertion that the extra-buy headerCheck hint equals the new exact string and does not contain '최대'.
       - `inline-navigation.test.tsx` R4 (~224-242): start editing at the 금액 row (lc-post-buy-amount) → Tab → 최소 잔량 → Tab → 반등 → Tab = end; keep the phase-3 echo and assert the notice slot is absent (`toBeNull`); retitle.
       - `limit-chaser-form.test.tsx`: delete the `EXHAUSTED` const (~1437); summary kvs post-buy (~1508) → ['금액4,000만원', '최소84만', '반등30%', '발동잔량—']; rewrite the 소진 test (~1535-1547): switch OFF + status 「소진」 kept, after expanding `row('lc-post-buy-reentry')` is null and the notice slot is null; drop the reentry assertions/title fragments in the 단계 0 (~1549) and 보유중 (~1559) tests; remove the reentry entry from the sheet-title it.each (~1697); drop the reentry half of the 「지금 ○○」 test (~1708-1720) and of the 「재진입은 0 을 받는다」 test (~1722, keep the 반등 half, retitle); delete the 「후매수 「최대」 행 — 단계 0 · 에코 ☐줄매수 자동」 test (~3455-3463); drop 「최대 3회」 from the E1 title (~3064).
       - `latch-led.test.tsx` (~83): `TIP_BUY_HOLDING` = the new tooltip string.
    6. e2e `webapp/e2e/specs/trading-workbench.spec.ts`: P24-1 tooltip expectation (~2620) → new string; P24-6 (~3713): retitle the phase-3 part (소진 상태 유지 · 최대 칸 · 안내 없음) and replace the phase-3 assertions (~3783-3806) with: status 「소진」 and the log assertions kept, post-buy summary `not.toContainText('남은')`, then `expandLcGroup(card, 'post-buy')`, notice slot `toHaveCount(0)`, `lcRow(page, 'lc-post-buy-reentry')` `toHaveCount(0)`; P24-7 (~3887) delete the reentry value line; P20-3: comment (~4666) drop 「255회 · 남은 255회」, delete the value line (~4724), remove the id from the row list (~4866). Seed objects keep their postBuyReentry fields.
    Layout note: rows render as a vertical list (`spec.rows.map`) and the summary kv line wraps; dropping one row/kv does not touch the §2.2b band container queries in `webapp/src/styles/globals.css` — no CSS change.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/lc/__tests__ src/components/trading/__tests__/limit-chaser-form.test.tsx src/components/trading/__tests__/latch-led.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g "P24-1 buy3|P24-6 |P24-7 |P20-3 " --workers=1</automated>
  </verify>
  <done>Typecheck, the lc unit dir, the form and latch-led tests pass; e2e P24-1 · P24-6 · P24-7 · P20-3 pass with --workers=1; `grep -n "label: '버스트 취소'" webapp/src/components/trading/lc/lc-fields.ts` still matches once.</done>
</task>

<task type="auto">
  <name>Task 3: 인박스 노트 done · 넓은 회귀 · 린트 · 잔재 grep 게이트 · SUMMARY (items 6, 7)</name>
  <files>docs/inbox/from-gh-trade/261012-lc-reentry-unlimited.md</files>
  <action>
    1. `docs/inbox/from-gh-trade/261012-lc-reentry-unlimited.md`: in the frontmatter change `status: open` to `status: done`; leave `done_commit:` EMPTY (the orchestrator fills the hash after its commit — inbox README rule). Do not edit the body.
    2. Broader regression (catches indirect consumers such as card-body summary or strategy-card log flows): run the vitest directory command in verify. Fix any failure that is a direct consequence of this plan (removed row/kv, 255 on the wire, new skip-set member) in the failing test with a one-line reason; anything unrelated → report in SUMMARY, do not fix.
    3. Lint the six touched source files with eslint (command in verify) and fix findings in lines this plan touched.
    4. Residue gate (command in verify): the removed identifiers / slot ids / note kind / old hint and tooltip clauses must not appear in the four UI source files. If it hits a comment you wrote, reword it by concept.
    5. Write `.planning/quick/261012-qld-gh-trade-261012/261012-qld-SUMMARY.md` per the summary template: what changed per item 1-7; item 5 = no-op (already 「버스트 취소」 since quick-261012-oif); deliberate keeps (form type field, 84 seed map, lc-ranges range, 「소진」 status mapping, relay/shared untouched); verification results (typecheck, vitest counts, the four e2e titles); a proposed Korean commit message for the orchestrator with NO Co-Authored-By line (e.g. 「fix(quick-261012-qld): gh-trade 261012 반영 — 상따 후매수 「최대」 칸 · 소진 안내 삭제 · 줄매수 자동 힌트 정리 · lc.set 재진입 255 고정」); the note that `done_commit` must be filled by the orchestrator after committing; and the out-of-scope follow-up: the /me 기본값 page (`webapp/src/components/me/limit-chaser-defaults.tsx`) still shows 「후매수 최대」 (84 postBuyMaxCount) while the C# defaults dialog removed it — candidate for a separate quick.
    6. STOP. Do not commit, add, stash or push.
  </action>
  <verify>
    <automated>grep -n "^status: done$" docs/inbox/from-gh-trade/261012-lc-reentry-unlimited.md && grep -nE "^done_commit:[[:space:]]*$" docs/inbox/from-gh-trade/261012-lc-reentry-unlimited.md && ! grep -nE "lc-post-buy-reentry|lc-post-buy-exhausted|POST_BUY_EXHAUSTED|GroupNote|postBuyExhausted|kind: 'note'|case 'note'|횟수는 후매수|남은 횟수" webapp/src/components/trading/lc/lc-fields.ts webapp/src/components/trading/limit-chaser-form.tsx webapp/src/components/trading/lc/setting-group.tsx webapp/src/components/trading/latch-led.tsx && pnpm --filter @gh-radar/webapp exec eslint src/lib/limit-chaser.ts src/components/trading/limit-chaser-form.tsx src/components/trading/strategy-log.tsx src/components/trading/lc/lc-fields.ts src/components/trading/lc/setting-group.tsx src/components/trading/latch-led.tsx && pnpm --filter @gh-radar/webapp exec vitest run src/components/trading src/lib/__tests__/limit-chaser.test.ts --maxWorkers=2</automated>
  </verify>
  <done>Handoff note shows status done with an empty done_commit; residue grep finds nothing; eslint clean on the six files; the trading component dir + lib limit-chaser vitest run passes; SUMMARY.md exists with the proposed commit message and the /me follow-up; no git commit was made (`git log -1` unchanged from start).</done>
</task>

</tasks>

<verification>
- `pnpm --filter @gh-radar/webapp run typecheck` (includes the e2e tsconfig).
- Vitest (--maxWorkers=2): `src/lib/__tests__/limit-chaser.test.ts`, `src/components/trading` (dir), which covers lc/__tests__, limit-chaser-form, strategy-log, latch-led.
- Playwright (--workers=1, filtered only): trading-workbench P24-1 (gateway bytes postBuyReentry 255 + new tooltip), P24-6 (phase-3 echo: no 최대 row / notice), P24-7, P20-3 (width guards with the row removed).
- Residue grep gate over the four UI source files (Task 3).
- No changes under relay/, packages/, supabase/; `git status` shows only the files in `files_modified` (plus SUMMARY.md and the already-untracked handoff note).
</verification>

<success_criteria>
- 후매수 card: 금액 · 최소 잔량 · 반등 · 발동잔량 only; summary has no 「최대」; no 소진 notice in any phase.
- 줄매수 ☐자동 hint and 보유중 LED tooltip carry no count/limit wording.
- Every web lc.set sends postBuyReentry 255; legacy echoes (old value) neither block D-02 auto master-off nor emit 「서버 반영 완료」.
- 「버스트 취소」 label confirmed unchanged.
- Handoff note status done (done_commit pending orchestrator); SUMMARY.md written; nothing committed.
</success_criteria>

<output>
Create `.planning/quick/261012-qld-gh-trade-261012/261012-qld-SUMMARY.md` when done (no commit — the orchestrator commits after the user confirms the message).
</output>
