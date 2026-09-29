---
phase: quick-260929-sas
plan: 01
subsystem: dma-visibility (supabase · relay journal push)
status: complete
tags: [supabase, rls, pgtap, relay, journal, kyobo, visibility, security]
requires:
  - Phase 19 journal tables · RPCs (20260924200000 · 20260924200100)
  - Phase 25 strategy read RPCs (20260929180200) — this migration redefines two of them
  - quick-260929-c8e multi-gateway observer (ExtraGatewayRoute replaces its `access?` arg)
provides:
  - dma_credentials.gateway (NOT NULL DEFAULT 'KB')
  - dma_gateway_identities (service_role only)
  - view dma_visibility_identities (security_invoker) — single visibility rule
  - dma_visible_accounts(uuid) — used by all three read RPCs
  - relay GatewayIdentities (identity loader, 60 s refresh, fail closed)
  - 260929-sas-verify-remote.sh/.ts (snapshot · check · selftest)
affects:
  - REST dma_journal_orders_for_user · dma_strategy_events_for_user · dma_order_events_for_user (signature/shape/grants unchanged)
  - relay extra-gateway journal.rows · journal.events push
  - infra/relay/README.md multi-gateway section
tech-stack:
  added: []
  patterns:
    - "rule in one SQL view + one SQL helper; RPCs join the helper"
    - "relay copy of the DB rule, periodic full replace, fail closed"
key-files:
  created:
    - supabase/migrations/20260929190000_dma_gateway_identities.sql
    - supabase/tests/dma_gateway_identities.test.sql
    - relay/src/journal/identities.ts
    - relay/tests/journal-identities.test.ts
    - .planning/quick/260929-sas-gateway-aware-visibility/260929-sas-verify-remote.sh
    - .planning/quick/260929-sas-gateway-aware-visibility/260929-sas-verify-remote.ts
  modified:
    - supabase/tests/dma_strategy_read.test.sql
    - relay/src/journal/types.ts
    - relay/src/ws/fanout.ts
    - relay/src/index.ts
    - relay/tests/journal-push.test.ts
    - relay/tests/journal-boot.test.ts
    - relay/tests/helpers/supabase-stub.ts
    - infra/relay/README.md
decisions:
  - "The visibility rule lives only in the view dma_visibility_identities: credential identities UNION ALL linked identities, where a link counts only if the user has a credential and the link's gateway differs from the credential's gateway"
  - "The seed is data-driven (no real-id literals): each credential whose dma_user_id appears in the KYOBO mapping gets a (user_id, 'KYOBO', dma_user_id) link. Local replay seeds 0 rows"
  - "Relay extra-gateway push routes only through GatewayIdentities.viewOf(gateway), never through the credential string. It is fail closed before the first load. The KB path, /healthz and the 503 formula are unchanged"
  - "The snapshot path is fixed at $HOME/.cache/gh-radar/260929-sas-baseline.json (outside the repo, mode 0600, numbers only). The snapshot reads dma_credentials without the gateway column because that column does not exist before the migration is applied"
metrics:
  duration: "~17 min (2026-09-29 21:13–21:30 KST)"
  completed: 2026-09-29
estimate:
  tokens: 120000
  tasks: 3
actuals:
  tokens: 21900        # chars/4 over the added lines of the 5 sas commits (87,510 chars)
  tasks: 3             # Task 1 · 2 (executor) + Task 3 (main session, 2026-09-29 21:38 KST 완료)
  commits: 5           # MEASURED: git log --oneline --grep='quick-260929-sas' ${plan_head_before}..HEAD | wc -l
  commits_rev_list_all: 13   # git rev-list --count plan_head_before..HEAD — includes 8 concurrent-session commits (25-08 · 25-09 · sar)
plan_head_before: f82971cb2ccaed371838fe371cc53f18eb2af725
---

# Quick 260929-sas Plan 01: Gateway-aware order visibility — Summary

KYOBO accounts now become visible only through explicit identity links. The rule sits in one view, `dma_visibility_identities`. The three REST read RPCs all go through `dma_visible_accounts(p_user_id)`, and the relay's extra-gateway `journal.rows` and `journal.events` pushes follow the same rule through the `GatewayIdentities` loader. A shared `dma_user_id` string no longer leaks KYOBO orders to a KB user who has no link.

## Commits

| # | Hash | Message | Files |
|---|------|---------|-------|
| 1 | `5e5fbdfe` | test(quick-260929-sas): 게이트웨이 인지 가시성 실패 테스트 — pgTAP 신원 매트릭스 · relay 신원 적재기 · 추가 게이트웨이 journal.rows 명시 연결 푸시 | supabase/tests/dma_gateway_identities.test.sql · relay/tests/journal-identities.test.ts · relay/tests/journal-push.test.ts · relay/tests/journal-boot.test.ts · relay/tests/helpers/supabase-stub.ts |
| 2 | `9cfc746f` | feat(quick-260929-sas): 주문 가시성 게이트웨이 인지 — dma_credentials.gateway · 신원 연결 테이블 · 규칙 뷰 · ⑨ 재정의 · relay 추가 게이트웨이 journal.rows 명시 연결 푸시 | supabase/migrations/20260929190000_dma_gateway_identities.sql · relay/src/journal/types.ts · relay/src/journal/identities.ts · relay/src/ws/fanout.ts · relay/src/index.ts |
| 3 | `76764b87` | test(quick-260929-sas): 전략 조회 RPC · journal.events 추가 게이트웨이 신원 규칙 실패 테스트 — Phase 25 픽스처 연결 1줄 | supabase/tests/dma_gateway_identities.test.sql · supabase/tests/dma_strategy_read.test.sql · relay/tests/journal-push.test.ts |
| 4 | `5cfacb83` | feat(quick-260929-sas): Phase 25 전략 조회 RPC 2종 · journal.events 추가 게이트웨이 푸시도 명시 신원 연결 규칙 | supabase/migrations/20260929190000_dma_gateway_identities.sql · relay/src/ws/fanout.ts · relay/src/index.ts |
| 5 | `f3eab932` | docs(quick-260929-sas): README 신원 연결 추가 · 제거 절차 · 원격 검증 스크립트(snapshot · check · selftest) | infra/relay/README.md · 260929-sas-verify-remote.sh · 260929-sas-verify-remote.ts |

None of the commits has a Co-Authored-By line, and nothing was pushed. Each commit staged only its own files, by explicit path. Commits from other sessions landed in between: 25-08 docs, 25-09 ×4, and sar docs. None of them touched the files above.

## RED / GREEN record

- **Task 1 RED (`5e5fbdfe`)** — The pgTAP runner failed replaying the fixture with `relation "public.dma_gateway_identities" does not exist`. In relay, 3 of 16 tests failed: ⑥ and ⑧ with TypeError `accountsOf`, and M2 because no identity request was made. `journal-identities.test.ts` failed on import because the module did not exist yet.
- **Task 1 GREEN (`9cfc746f`)** — pgTAP: gateway_identities 33/33, journal_apply 79/79, journal_schema 93/93, strategy_read 24/24. Relay: the 3 target files ran 24/24. `typecheck` and `typecheck:tests` both exited 0. Structure gates: no old string join, the KB wiring line is unchanged, and there is no `"KYOBO"` literal.
- **Task 2 RED (`76764b87`)** — pgTAP gateway_identities failed 3 of 42 tests: #32 (U2 got extra `(KYOBO,3,…0011)` and `(KYOBO,1,"")`), #34 (U4 was missing `(KYOBO,1,"")`), and #36 (U2 got order events for the KYOBO row). These are exactly the old-rule leaks. Relay ⑨ failed. strategy_read still passed at 24/24 because the old rule allows it.
- **Task 2 GREEN (`5cfacb83`)** — All 7 pgTAP files pass (below). The full relay suite passes, both typechecks exit 0, and the migration's code lines contain `dma_visible_accounts(p_user_id)` 4 times: ⑨ ×1, list ×2, order events ×1.

## Verification output

pgTAP, one throwaway local container per file, 48 migrations replayed, 0 remote contact:

| File | Result |
|------|--------|
| dma_gateway_identities (new) | 1..42 · ok 42 · not ok 0 · PASS |
| dma_strategy_read (+1-line fixture) | 1..24 · ok 24 · PASS |
| dma_strategy_apply | 1..30 · ok 30 · PASS |
| dma_journal_apply | 1..79 · ok 79 · PASS |
| dma_journal_schema | 1..93 · ok 93 · PASS |
| dma_orders_modified | 1..15 · ok 15 · PASS |
| dma_orders_price_check | 1..12 · ok 12 · PASS |

- **relay:** 711 tests in 29 files before, 721 in 30 files after (+8 journal-identities, +2 journal-push ⑧ ⑨). Assertions were also added to M1 and M2. `typecheck` and `typecheck:tests` both exit 0.
- **Consumer regression, unchanged code:** webapp `today-orders-card` · `relay-socket` · `orders-api` passed 184/184 in 3 files. server `routes/strategy-events` · `routes/orders` passed 27/27 in 2 files.
- **verify-remote:** `bash -n` OK. `selftest` passed all 10 checks, printed `SELFTEST PASS` and exited 0, with no env and no network. `check --baseline <missing path>` printed `FAIL C0 스냅샷 없음 — 먼저 snapshot` and `FAIL 1` and exited 1 before any remote query. `snapshot --out .planning/x.json` was rejected as a path inside the repo. The script never queries the password column.
- **Structure gates:** `scripts/deploy-relay.sh` is unchanged against both HEAD and `a21bc290`, the base at dispatch. The README contains `dma_gateway_identities` and `dma_visibility_identities`, and the old warning `어떤 KB dma_user_id 와도 겹치지 않아야` appears 0 times.

## Remote status

- **1 migration not yet applied remotely: `20260929190000_dma_gateway_identities.sql`.** It must be applied after the three Phase 25 files (`20260929180000` · `180100` · `180200`), because ⑦ redefines the strategy read RPCs. Nothing was pushed to the remote DB in this run.
- The c8e harness `260929-c8e-verify.sh` R9 check (`deliverJournalRows` takes `?: JournalAccessView`) is **intentionally superseded** by this quick: the second argument is now `ExtraGatewayRoute`. Do not run that harness as a gate.
- Relay/shared changes from `4c143596` (deployed) to HEAD include 14 commits outside this quick, so the plan's rule in Task 3 (f) says **do not deploy** now.

## Deviations from Plan

### Auto-fixed Issues

1. **[Rule 1 - Bug] The snapshot selected a column that does not exist before the migration**
   - **Found during:** Task 2 (D2).
   - **Issue:** The plan's credential query `user_id,gateway,dma_user_id` would fail in `snapshot`, because `dma_credentials.gateway` does not exist before the migration.
   - **Fix:** `snapshot` now selects `user_id,dma_user_id` and treats gateway as KB. `check` selects the gateway column as the plan says.
   - **Commit:** f3eab932.
2. **[Rule 1 - Bug] pgTAP `set_eq` rejected the strategy-list queries**
   - **Found during:** Task 2 R1.
   - **Issue:** The unnamed jsonb-extraction columns collided as `?column?` inside `set_eq`.
   - **Fix:** Added aliases (`AS gateway/kind/account_no`) before the RED commit.
3. **[Rule 1 - Robustness] The verify script's type import could not be resolved**
   - **Found during:** Task 2 D2.
   - **Issue:** `.planning/` sits outside the relay workspace, so `import type … from "@supabase/supabase-js"` could not be resolved.
   - **Fix:** `SupabaseClient` is now `ReturnType<typeof createRelaySupabase>`, and `createRelaySupabase` is imported dynamically, only in the remote modes. selftest therefore never loads supabase-js. A standalone `tsc --strict` passes (rc 0).

### Minor implementation choices (meaning unchanged)

- Both pgTAP files end with `finish(true)`, following the repo convention (the plan text says `finish()`). A plan-count mismatch now fails the run.
- The new relay cases ⑧ and ⑨ are appended after ⑦. The bodies of ①–⑦ are unchanged. ⑥ only swaps `kyoboAccess` for a route `{ access, identities: B→dma-other }`.
- In `fanout.ts`, the extra-gateway row path and event path share one helper, `#extraGatewayAccounts(userId, extra)`. It only ever reads the identity view and never reads `entry.dmaUserId`.
- In `index.ts`, the extra-gateway wiring loop is wrapped in `if (gatewayIdentities !== null)`. This narrows the type and does not change behaviour: the loader exists exactly when there is an extra gateway.
- `GatewayIdentities` has a read-only `loaded` getter (not required by the plan).
- The wrapper exports `SAS_VERIFY_CWD`, so relative `--out` and `--baseline` paths resolve against the caller's cwd. The wrapper cds to the repo root and runs tsx from the relay workspace.
- `check` C4 is literal: the view's KYOBO rows must equal the KYOBO link count. A link row left behind after its credential was deleted is excluded by the view, so C4 FAILs. That is intended as a cleanup signal, matching the README's revocation rule.
- The README 과도기 (transition) bullet pins `5cfacb83` as the `merge-base --is-ancestor` target. It is the last relay commit for the rule and covers both rows and events.
- `dma_strategy_read.test.sql` has a 4-line diff: one header comment edited (U4 gets 「KYOBO 연결」), plus one comment line and one INSERT line. The assertions and `plan(24)` are unchanged.

## Known Stubs

None.

## Threat Flags

None. Every new surface (table, view, function, RPC redefinitions, relay identity query) is covered by T-sas-01~11. Local pgTAP asserts each one's grants/RLS state.

## Task 3 (main-session) — 완료 (2026-09-29 21:32~21:39 KST)

### 라이브 반영 결과

| 단계 | KST | 결과 |
|------|-----|------|
| (a) dry-run | 21:32 | `supabase db push --dry-run` 목록 4개: Phase 25 의 20260929180000 · 180100 · 180200 + 이 quick 의 20260929190000. 원격 최신은 20260924200100 |
| (b) 적용 전 스냅샷 | 21:32 | `$HOME/.cache/gh-radar/260929-sas-baseline.json`(0600). 사용자 3명(1993ef7e · 95e9fb08 · b1e20b81) 각 옛 규칙 가시 계좌 {KB 1, KYOBO 1}. ⑨ 행: 1993ef7e 131/105, 95e9fb08 318/203, b1e20b81 318/203(2026-09-29/28). 기대 시드 {milles 1, junysim 2} · 연결 3행 |
| (c) 사용자 결정 | 21:3x | 「넷 함께 지금 적용」. 원격 DB 쓰기도 메인 세션이 실행하도록 사용자 명시 승인 |
| (d) 적용 | 21:37:53 | `supabase db push --yes` — 4개 순서대로 적용, `migration list` 에서 넷 다 Local=Remote |
| (e) 적용 후 대조 | 21:38:02 | `verify-remote.sh check` **ALL PASS**: C0 스냅샷 · C1 연결 3행 = 기대 시드 · C2 3명 가시 집합 옛 규칙 = 새 규칙 · C3 ⑨ 행 수 6칸 모두 기준과 동일 · C4 뷰 KYOBO 3행 · C5 전략 조회 RPC 3명 각 1행. C6(anon 거부)은 SKIP — `SUPABASE_ANON_KEY` 가 없고, `.env.local` 읽기는 보안 가드가 차단. anon · authenticated 거부는 로컬 pgTAP(dma_gateway_identities 42/42)이 증명 |
| (f) relay 배포 판정 | 21:38 | 배포본 4c143596..HEAD 에 이 quick 밖 relay/shared 커밋 14건 → 계획 규칙대로 **배포하지 않음**. relay 변경(9cfc746f · 5cfacb83)은 다음 Phase 25 relay 배포에 실린다. 그동안 배포 relay 의 KYOBO 푸시는 옛 문자열 규칙이지만 시드가 오늘 가시성과 같아 실효 차이 없음 — README 과도기 문구대로 kyobo127 에 새 user_id 추가 금지 |
| (g) KB smoke | 21:38:23 | PASS 12 · FAIL 0 · SKIP 1 |

- Phase 25 세션(「phase25: 주문로그」)에 통보: 25-11 의 원격 적용은 「확인만」, U4 픽스처 연결 1줄(76764b87), relay 변경 동반 배포.
- 저장소 변경은 Task 1 · 2 커밋 5건뿐이다. push 는 이 quick 범위 밖이다.

## Self-Check: PASSED

- All 6 files in `key-files.created` exist on disk.
- Commits 5e5fbdfe · 9cfc746f · 76764b87 · 5cfacb83 · f3eab932 are all in `git log`.
