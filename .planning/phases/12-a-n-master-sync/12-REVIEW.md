---
phase: 12-a-n-master-sync
reviewed: 2026-06-29T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - packages/shared/src/limitUp.ts
  - supabase/migrations/20260628120000_limit_up_tables.sql
  - server/src/schemas/limitUp.ts
  - server/src/mappers/limitUp.ts
  - server/src/routes/limitUp.ts
  - server/src/routes/stocks.ts
  - webapp/src/lib/limit-up-api.ts
  - webapp/src/lib/limit-up-format.ts
  - webapp/src/components/stock/stock-limit-up-section.tsx
  - webapp/src/components/stock/stock-detail-client.tsx
  - workers/limit-up-sync/src/index.ts
  - workers/limit-up-sync/src/rebuild.ts
  - scripts/setup-limit-up-sync-iam.sh
  - scripts/deploy-limit-up-sync.sh
  - scripts/smoke-limit-up-sync.sh
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-06-29T00:00:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Phase 12 (상한가 다음날 이력 통계, LIMIT-01) implements a Supabase migration with a `limit_up_price()` tick-size function and a `rebuild_limit_up()` precompute RPC, an Express read route, a Cloud Run rebuild worker with GCP deploy/IAM/smoke scripts, and a Next.js display component. Overall the code is careful and well-tested: the security posture is sound (SECURITY DEFINER with pinned `search_path`, REVOKE-from-PUBLIC + anon/authenticated, GRANT to service_role only, RLS enabled on all three new tables for both `anon` and `authenticated`), the zod `:code` validation mirrors the established comovement pattern, the tick-size function is judged against the target price (avoiding the Pitfall-1 boundary bug) and is locked by golden-case unit tests, and the webapp data path consistently preserves `null` through `toNumOrNull` and renders em-dashes / hides gated stats.

No critical issues found. Two warnings concern correctness edge cases in the `rebuild_limit_up` SQL: a nullable-column filter that silently drops events, and a possible divide-by-zero. The info items are doc/label precision nits and defensive-hardening suggestions.

## Warnings

### WR-01: `change_rate <= 31` gate silently drops events with NULL change_rate

**File:** `supabase/migrations/20260628120000_limit_up_tables.sql:158`
**Issue:** The events CTE filters with `AND change_rate <= 31`. In `stock_daily_ohlcv`, `change_rate` is **nullable** (`numeric(8,4)` nullable, per `20260512120000_create_stock_daily_ohlcv.sql:29`, "신규 상장일/휴장 직후 등"). In SQL three-valued logic, `NULL <= 31` evaluates to `NULL`, which is treated as not-true, so **every row whose `change_rate` is NULL is excluded** from event detection — even genuine 마감상한가 days. This is a silent data-completeness gap: the gate's stated intent is to exclude 신규상장/증자 artifacts, but it also drops legitimate events whenever the upstream EOD feed left `change_rate` empty.
**Fix:** Make the NULL handling explicit so intent is unambiguous. If NULL rows should be kept (rely on the `close = limit_up_price(prev_close)` price match alone), use:
```sql
AND (change_rate IS NULL OR change_rate <= 31)
```
If NULL rows should be dropped, keep the current behavior but add a comment stating that NULL change_rate is intentionally excluded, so the side effect is not mistaken for a bug later.

### WR-02: Possible division by zero when `close` (limit_up_price) is 0

**File:** `supabase/migrations/20260628120000_limit_up_tables.sql:166-169`
**Issue:** Next-day returns are computed as `(e.next_open - e.close) / e.close * 100` (and the high/low/close variants). `close` equals `limit_up_price(prev_close)`, and `limit_up_price(0) = 0`. `stock_daily_ohlcv.close` is `numeric(20,2) NOT NULL` with no `CHECK (close > 0)` constraint, so a 0 (or near-0 placeholder) close would trigger a `division_by_zero` error that aborts the entire `rebuild_limit_up` transaction (TRUNCATE already ran, so a failed rebuild leaves the tables empty until the next successful run). Real KRX prices are never 0, so this is low-probability, but the RPC is the sole writer and a single bad row would zero out all three tables.
**Fix:** Guard the denominator defensively, e.g. add `AND close > 0` to the `events` CTE filter (alongside the existing predicates), or use `NULLIF(e.close, 0)` in each ratio. The `close > 0` gate is cheapest and also documents the invariant.

## Info

### IN-01: First histogram bucket label `−10~−5` is unbounded below in SQL

**File:** `supabase/migrations/20260628120000_limit_up_tables.sql:88,208` and `packages/shared/src/limitUp.ts:51`
**Issue:** The bucket comment/type labels the first bucket `[−10~−5)`, but the SQL fills it with `next_open_ret < -5` (no lower bound), so a −20% event lands in `bucket_n10_n5`. The webapp label is `−5%↓` (i.e. "≤ −5%"), which correctly reflects the actual unbounded-below semantics. Only the SQL comment and the TS type doc-comment are imprecise. No runtime bug, but the three sources disagree on what the first bucket means.
**Fix:** Align the SQL comment (line 88) and the TS comment (`limitUp.ts:51`) to read `(−∞ ~ −5)` / `−5%↓` to match the actual predicate and the webapp label.

### IN-02: Two different "win" definitions surfaced in the same distribution card

**File:** `webapp/src/components/stock/stock-limit-up-section.tsx:65-66,201`
**Issue:** `DistributionBand` computes `winCount = histogram[2]+[3]+[4]` (the `>= 0` buckets) and labels it "수익 N건". But `bucket_0_p5` is `next_open_ret >= 0`, so it includes breakeven (`0.0%`) events, whereas the KPI `winCount` stat is `next_open_ret > 0` (strictly positive, excludes 보합). The same screen therefore shows two subtly different "수익" counts. Likely immaterial in practice (exact 0.00% next-open is rare) but can confuse a user comparing the KPI tile to the distribution footer.
**Fix:** Either relabel the footer (e.g. "0% 이상") or note that breakeven is grouped with wins; alternatively split out a breakeven count. Low priority.

### IN-03: Smoke INV-4 env guard only present in the first sub-check

**File:** `scripts/smoke-limit-up-sync.sh:85-105`
**Issue:** The `: ${SUPABASE_URL:?...}` / `: ${SUPABASE_SERVICE_ROLE_KEY:?...}` guards live inside the first `bash -c` block (limit_up_events). The second `bash -c` block (limit_up_stock_stats, lines 97-105) is a separate subshell and has no guard, so if the env vars are unset the second check fails with an opaque curl/parse error instead of a clear "VAR required" message. Also `set -e` is intentionally disabled (line 2), so the missing guard does not abort early.
**Fix:** Repeat the `: ${SUPABASE_URL:?}` / `: ${SUPABASE_SERVICE_ROLE_KEY:?}` lines at the top of the second `bash -c` block for a consistent failure message.

### IN-04: Contract/type drift — `next_*_ret` typed nullable but SQL column is NOT NULL

**File:** `packages/shared/src/limitUp.ts:19-26`, `server/src/mappers/limitUp.ts:88-98`
**Issue:** `LimitUpEvent.nextOpenRet/.nextHighRet/.nextLowRet/.nextCloseRet` are typed `number | null` and the mapper uses `toNumOrNull`, but the migration declares all four columns `numeric(8,2) NOT NULL` and the events CTE only inserts rows where `next_open IS NOT NULL`. The nullable typing is intentional defensive slack (documented in the mapper comment), so this is not a bug — but the type contract is looser than the data guarantee, which means downstream consumers must keep handling a `null` that the DB will never produce.
**Fix:** Optional. If the NOT NULL guarantee is meant to hold, tighten the four event-return fields to `number` and use `toNum`; otherwise leave the defensive typing and the comment as-is.

### IN-05: `rebuild_limit_up` lookback uses string-interval composition

**File:** `supabase/migrations/20260628120000_limit_up_tables.sql:136`
**Issue:** `v_since := (current_date - (p_lookback_months || ' months')::interval)::date`. `p_lookback_months` is an `int` parameter (not user-supplied text — the worker passes a numeric env default of 24, and the RPC is service_role-only), so this is not an injection vector. It is, however, a string-concatenation idiom where `make_interval(months => p_lookback_months)` would be type-safe and clearer.
**Fix:** Optional readability improvement: `v_since := (current_date - make_interval(months => p_lookback_months))::date;`.

---

_Reviewed: 2026-06-29T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
