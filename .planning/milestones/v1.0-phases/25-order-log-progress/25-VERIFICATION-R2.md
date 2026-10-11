---
phase: 25-order-log-progress
verified: 2026-09-30T01:35:00Z
status: passed
human_verification_resolved: "2026-10-03 — 25-UAT.md 7/7 pass (human_needed 항목 전량)"
score: 12/12 plans' must_haves fully verified (round-1 gap R2-G-01 closed by 25-13)
round: 2
supersedes_round: 1
requirements_note: "Phase 25 요구사항 ID 없음 — round 1 과 동일(ROADMAP TBD · REQUIREMENTS.md 매핑 0건). 요구사항 커버리지 섹션은 여전히 생략한다."
covered_files:
  - ".planning/REQUIREMENTS.md"
  - ".planning/phases/25-order-log-progress/25-06-PLAN.md"
  - ".planning/phases/25-order-log-progress/25-06-SUMMARY.md"
  - ".planning/phases/25-order-log-progress/25-12-PLAN.md"
  - ".planning/phases/25-order-log-progress/25-12-SUMMARY.md"
  - ".planning/phases/25-order-log-progress/25-13-PLAN.md"
  - ".planning/phases/25-order-log-progress/25-13-SUMMARY.md"
  - ".planning/phases/25-order-log-progress/25-REVIEW.md"
  - ".planning/phases/25-order-log-progress/25-VERIFICATION.md"
  - "relay/src/hub/subscription-hub.ts"
  - "relay/tests/fanout.test.ts"
  - "relay/tests/hub.test.ts"
  - "webapp/e2e/specs/trading-workbench.spec.ts"
  - "webapp/src/lib/__tests__/relay-socket.test.ts"
covered_digest: "v1:sha256:c7690695d708ccb2ce0b74305c9b6867e38a34175eb0e6c388c78a849342508f"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: "11/12 plans' must_haves fully verified (1 partial — 25-06)"
  gaps_closed:
    - "25-06 must_have: 「세션 교체(#clearCaches) 뒤 옛 진행률이 남지 않는다」 — hub 캐시뿐 아니라 이미 연결된 브라우저 사본까지"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "첫 거래일 UAT (a): 상따 매수 1건 발생 시 주문로그 탭에 BuyOrder 줄(조건 · 근거 · 상한가 매수잔량 · 접수 +ms)이 게이트웨이 로그의 전송 시각 · 조건값과 일치하는지 로그인 세션에서 대조"
    expected: "실이벤트 필드값이 게이트웨이 원본과 일치"
    why_human: "실 시세·주문 이벤트가 필요해 장중 실거래로만 검증 가능 — 25-13 배포(relay:6821181b) 이후에도 여전히 미도래(2026-09-30 새벽 검증 시점 · 장 08:00~20:00 KST 전)"
  - test: "첫 거래일 UAT (b): 그 주문 행을 펼쳐 통보(접수·체결) 조각과 전략 줄이 같은 ms 규칙(통보 먼저)으로 보이는지 확인"
    expected: "타임라인이 gw_time_ms 순 · 동시각은 통보 우선으로 정렬"
    why_human: "실 주문 이벤트 타이밍 필요 — 로컬 e2e 는 고정 픽스처로만 검증"
  - test: "첫 거래일 UAT (c): 공용 패널 배지 · 카드 배지 · 창 분리 「오늘」 이어붙임이 실이벤트 도착 시 실제로 갱신되는지"
    expected: "탭이 안 보이는 동안 배지 카운트 증가, 탭 열면 0"
    why_human: "실시간 푸시 도착 타이밍은 실거래로만 관찰 가능"
  - test: "첫 거래일 UAT (d): 대기 · 첫 체결 · 취소 · 매도 · 상한가 노출/진입 줄(상따 origin 주문)이 실제로 그려지는지"
    expected: "각 kind 별 문장이 D-09/D-10 규칙대로 보임"
    why_human: "골든 픽스처는 로컬에서 검증됐으나 실 gh-trade 서버가 내는 실제 필드값 조합은 실거래에서만 확인 가능"
  - test: "첫 거래일 UAT (e): 83 QueueProgress 로 미체결 진행률 막대가 실제로 갱신되는지(수동·VI 대기 포함, 단일가/VI 구간 정지 포함)"
    expected: "체결예상까지 진행률 막대·퍼센트가 실시간으로 움직이고 단일가/VI 구간에서 멈춤"
    why_human: "실 83 스트림 필요 — 25-13 배포로 relay:6821181b 위에서 돌게 됐으나 여전히 실거래 미도래(headSeq 갱신 확인 안 됨)"
  - test: "첫 거래일 UAT (f)/(g): 수동·VI 주문은 전략 이벤트 0 이 정상인지 · healthz journal.strategy.lastSeq 가 null→값으로 전이하고 lagSeq 가 0 근처를 유지하는지"
    expected: "수동 주문에 상따 줄 없음 · lastSeq 전이 정상 · dbError:false 유지"
    why_human: "실 게이트웨이 트래픽 필요"
  - test: "운영 웹 로그인 세션 육안 확인: 작업대 공용 패널 「주문로그」 탭 · 카드 「주문로그」/「전략로그」 탭 · /trading/order-log 창 · 마이페이지 오늘 주문 행 ▶ 펼침 · DevTools WS 인증 직후 unf.progress snap 1프레임"
    expected: "다섯 표면 모두 정상 렌더 · 새로고침 후 6821181b 번들 반영(25-13 배포로 sha 이동)"
    why_human: "아직 미수행 — 시각적 확인은 로그인 브라우저 세션에서만 가능. 25-13 배포로 프로덕션 sha 가 6289e430→6821181b 로 바뀌었으니 재확인 대상 sha 도 갱신됨"
---

# Phase 25: 주문로그·잔량진행률 Verification Report — Round 2 (25-13 gap closure)

**Phase Goal:** ROADMAP.md 「Phase 25」 절 전문 — gh-trade StrategyEvent 저널을 relay 두 번째 스트림으로 수신해 오늘 주문 카드 행 펼침 · 작업대 「주문로그」 탭 · 미체결 진행률(B안) 3표면으로 노출하고, 별건 3 을 처리한다.
**Verified:** 2026-09-30 (round 2 — 25-13 gap-closure plan against round-1 gap `gaps[0]`)
**Status:** human_needed
**Re-verification:** Yes — round 2, after 25-13 gap-closure plan execution and production deployment (`relay:6821181b`)

## Scope of This Round

Round 1 (`25-VERIFICATION.md`) found `status: gaps_found`, 11/12 plan-groups fully verified, 1 gap (`gaps[0]`, 25-06 must_have) plus 7 carried human_verification items. Plan 25-13 was written specifically to close `gaps[0]` (25-REVIEW WR-02). This round re-verifies only the closed gap, confirms no regression in the surrounding contract (D-13 preservation, scope containment), sanity-checks the one deviation noted in 25-13-SUMMARY, and carries forward the unresolved human_verification items unchanged.

## Gap R2-G (from round 1 `gaps[0]`) — Verification

**Round-1 gap:** `relay/src/hub/subscription-hub.ts` `#clearCaches` cleared the hub's internal `#queueProgress` cache but did not notify already-connected browsers; the empty-to-empty suppression guard in `#onQueueProgress` then swallowed the new session's empty 83, leaving stale progress visible indefinitely to already-open tabs.

**Claimed fix (25-13-SUMMARY):** `#clearCaches` now counts cleared progress keys for the user and, if `>0`, fans out `{t:"unf.progress", snap:true, entries:[]}` to that `userId` in the same call.

### Direct code verification

Read `relay/src/hub/subscription-hub.ts` lines ~1768-1786 directly (not from SUMMARY prose):

```
let clearedProgress = 0;
for (const key of [...this.#queueProgress.keys()]) {
  if (!key.startsWith(prefix)) continue;
  this.#queueProgress.delete(key);
  clearedProgress += 1;
}
if (clearedProgress > 0) this.#fanout(userId, { t: "unf.progress", snap: true, entries: [] });
```

This matches the must_have literally: single conditional fanout, `entries: []` as a literal (not a cache getter, so reordering can't leak stale values), scoped to `this.#fanout(userId, …)` (single-user delivery, no broadcast).

### D-13 preservation — verified independently

Ran the plan's own acceptance-criteria diff check myself against `9a3ab0b6` (the plan's own `PLAN_BASE`, recorded in 25-13-SUMMARY frontmatter):

```
UNCHANGED: onQueueProgress
UNCHANGED: onReady
```

Confirmed byte-for-byte identical to pre-25-13. The suppression guard, allowed-account filter, key-replace, and Ready gate are untouched — the fix is confined to the one method that breaks the "hub cache = browser copy" assumption.

### Behavioral test evidence — read the test bodies, not just names

Read `relay/tests/fanout.test.ts` P4 ("세션 교체 — 이미 연결된 탭이…") and `relay/tests/hub.test.ts`'s 4 WR-02 tests in full (not just grep-matched names). The test bodies genuinely exercise the state transition:

- **fanout P4** (real `WsFanout` + real `SubscriptionHub` + real ws connection, no mocks at the wire level): authenticates, receives a live KRX progress frame, replaces the session via `hub.attach(replacement)`, asserts the connected socket receives a second `snap:true` frame and `getQueueProgressEntries` is now `[]`, then sends an empty KRX 83 (suppressed) followed by a non-empty NXT 83, and asserts the connection receives **exactly 4** `unf.progress` frames in order: [auth snap, KRX live, replacement init snap, NXT live] — with no frame for the suppressed empty KRX resend.
- **hub test (기존 :640 확장)**: last frame after `attach(next)` is exactly `{t:"unf.progress", snap:true, entries:[]}`, fanned out only to `"user-1"`.
- **hub test (가)**: a user with no cached progress produces zero `unf.progress` frames on session replace (noise-free).
- **hub test (나)**: a second user (`user-2`) is unaffected — its progress entries and fanout count are unchanged when only `user-1`'s session replaces.
- **hub test (다)**: after replace, the new session's empty 83 for the same key stays suppressed, its non-empty 83 refills normally, and a late frame from the *old* (superseded) session is ignored via the existing frame provenance check.

I ran these tests myself (not trusting the SUMMARY's reported counts):

```
pnpm --filter @gh-radar/relay exec vitest run tests/fanout.test.ts tests/hub.test.ts
→ Test Files  2 passed (2) · Tests  100 passed (100)

pnpm --filter @gh-radar/relay exec vitest run tests/fanout.test.ts -t "P4 세션 교체"
→ ✓ P4 세션 교체 … (WR-02 · Pitfall 6) 21ms · 1 passed | 67 skipped

grep -c "WR-02" relay/tests/hub.test.ts → 4   (all 4 present, matches plan acceptance criterion ≥4)
grep -c "class ReplacementSession" relay/tests/fanout.test.ts → 1

pnpm --filter @gh-radar/webapp exec vitest --run src/lib/__tests__/relay-socket.test.ts -t "unf.progress"
→ 4 passed | 109 skipped (webapp store handling of snap:true/entries:[] — confirmed unchanged and still green)

pnpm --filter @gh-radar/relay run test   (full suite, run once)
→ Test Files  30 passed (30) · Tests  735 passed (735)   — matches SUMMARY's claimed 731→735 (+4) exactly
```

**Conclusion on the gap:** ✓ VERIFIED. This is a state-transition/cleanup invariant (Step 3 behavior-dependent truth), and it clears the bar because a real-websocket integration test (P4) exercises the exact sequence the must_have describes — not mere symbol presence. Round-1's specific criticism ("hub.test.ts:640 only checks internal hub state, no fanout-level proof") is directly answered by the new P4 test, which asserts on `conn.inbox` (the actual bytes delivered to a real `ws` client).

### Honest reach caveat (self-disclosed, not concealed)

The plan and SUMMARY explicitly document that in production, `SessionManager.acquire` only recreates a session when refCount is 0 (no attached tabs) — so the scenario this fix targets (an already-connected tab witnessing a mid-session replace) is rarely if ever reached today. This is not a hidden precondition: it is stated in the PLAN objective, in `#clearCaches`'s own code comment (point 4, "⚠️ 정직하게 적는다"), and in the SUMMARY's "정직한 도달 범위" section, with an explicit precedent cited (`fanout.ts` `#register`'s analogous branch carries the same caveat and is still tested this way). The tests reach the transition via `hub.attach()` directly rather than through `SessionManager`, which is the correct way to unit/integration-test a defensive contract that doesn't depend on the caller's regeneration policy. I don't treat this as coincidental-reliance (undeclared precondition) — it's a declared, defended design choice, not a hidden test-only shortcut.

## Scope Containment — Regression Check

```
git diff --name-only 9a3ab0b6..6821181b  (PLAN_BASE..deployed sha)
→ relay/src/hub/subscription-hub.ts
→ relay/tests/fanout.test.ts
→ relay/tests/hub.test.ts
→ webapp/e2e/specs/trading-workbench.spec.ts
```

Only 4 files. No webapp product code, no `packages/shared`, no `supabase/migrations`, no `server/`, no relay generated/ws/dma files touched. This makes a regression against the other 11 plan-groups' must_haves structurally impossible from this diff alone — nothing they depend on changed.

### Deviation judged: buy3Schema test-assertion update (webapp/e2e/specs/trading-workbench.spec.ts)

25-13-SUMMARY records that Task 3's deployment gate caught 3 stale `expect(sent.buy3Schema).toBe(1)` assertions in `trading-workbench.spec.ts` (P24-1 and two others) that should be `2`, attributing this to `quick-260929-vzy`'s webapp form now always sending `postBuyAuto` in `lc.set` payloads.

I verified this claim directly rather than accepting it:

- `relay/src/dma/envelope.ts` (line ~1244, ~1376-1397): comments and code confirm `buy3_schema` is derived purely from the *presence* of `post_buy_auto` in the input (`1` = `LC_FIXED_BUY3_SCHEMA` fixed value with no auto field; `2` = `LC_POST_BUY_AUTO_BUY3_SCHEMA` when the field is present, regardless of its boolean value) — this derivation logic predates 25-13 (it's `quick-260929-vzy`'s `fb175921`/`d261c8d0` commits, deployed together but out of 25-13's own scope).
- `webapp/src/lib/limit-chaser.ts` line 587 confirms the webapp always echoes `postBuyAuto: server.postBuyAuto` into its derived state, so a field is always present in outgoing `lc.set` payloads from the new webapp build.
- Given that, `buy3_schema=2` is the objectively correct expected value for the new webapp+relay pair, and the 3 stale `=1` assertions were a genuine test-suite gap in `quick-260929-vzy` (which only updated its own 2 new/touched tests, not the 3 pre-existing ones it silently affected).

**Judgment: sound.** This is a legitimate test-assertion correction to match already-correct, already-verified production behavior (not from 25-13, but from a co-deployed sibling change) — not a masking of a real product regression. No new gap.

## Deployment Verification (independent, not from SUMMARY)

```
curl -s https://dma.jx1.io/healthz
→ {"status":"ok","version":"6821181b","dma":true,"journalState":"live"}
```

Live production `/healthz` confirms the deployed relay version is exactly the sha 25-13-SUMMARY claims (`6821181b`), independently confirming the "메인 세션" deployment record rather than trusting it. `git status --porcelain --untracked-files=no` is clean (no uncommitted changes at verification time); `git log` shows the branch head is `cb6e9f7b`, a docs-only commit (STATE/ROADMAP/SUMMARY, 0 code lines) sitting on top of the deployed `6821181b`.

## Required Artifacts (round 2 delta only)

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `relay/src/hub/subscription-hub.ts` `#clearCaches` | conditional `unf.progress snap:true entries:[]` fanout to the affected userId | ✓ VERIFIED | Read directly, matches must_have literally |
| `relay/tests/fanout.test.ts` `ReplacementSession` + P4 | fanout-level real-ws proof (round-1's stated missing piece) | ✓ VERIFIED | Read test body in full, ran it, passes |
| `relay/tests/hub.test.ts` 4× WR-02 | boundary lock (noise-free, user isolation, refill/ignore-stale) | ✓ VERIFIED | Read all 4 bodies, ran them, passes |
| `#onQueueProgress` / `#onReady` | byte-unchanged (D-13) | ✓ VERIFIED | Diffed against `9a3ab0b6` myself |

## Key Link Verification (round 2 delta)

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `relay/src/hub/subscription-hub.ts` `#clearCaches` | `relay/src/ws/fanout.ts` `#deliver` | `#fanout(userId, {t:"unf.progress", snap:true, entries:[]})` → `hub.on("fanout")` | ✓ WIRED | Proven end-to-end by fanout P4 (real ws receives the frame) |
| `relay/src/ws/fanout.ts` | `webapp/src/lib/use-relay-socket.ts` | `applyFrame case "unf.progress" snap:true` → Map cleared | ✓ WIRED (unchanged) | `relay-socket.test.ts -t unf.progress` re-run, still green, code unchanged |

## Anti-Patterns Found

No debt markers (`TBD`/`FIXME`/`XXX`) or warning markers (`TODO`/`HACK`/`PLACEHOLDER`) in any of the 4 files this round touched (grepped directly, 0 matches).

## Human Verification Required

All 7 items from round 1 are carried forward unchanged — nothing in 25-13's scope (a narrow relay-internal fix + its tests + a deployment) touches any of the UAT surfaces (real order events, real 83 stream, visual login-session confirmation). The 25-13 deployment does shift the production sha these UAT items should be checked against (from `6289e430` to `6821181b`); item 7's expected wording has been updated accordingly. See frontmatter `human_verification`.

## Gaps Summary

**0 new gaps.** The single round-1 gap (`gaps[0]`, 25-06 must_have re: session-replace progress staleness) is closed: verified by direct code reading, an independent re-run of the exact targeted tests (not trusting reported counts), a from-scratch full relay suite run (735/735), a byte-level D-13 diff check I performed myself, and an independent production healthz check confirming the claimed deployment sha is actually live. The one flagged deviation (3 stale e2e assertions corrected 1→2) was independently traced to relay/webapp source and judged a sound correction, not a regression cover-up.

Status is `human_needed` rather than `passed` only because of the 7 carried-forward UAT items requiring live market data — none of which 25-13 could or did address (2026-09-30 trading day was not yet open at verification time).

---

_Verified: 2026-09-30_
_Verifier: Claude (gsd-verifier), round 2_
