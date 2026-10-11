---
phase: quick-260929-c8e
verified: 2026-09-29T09:35:00Z
status: passed
score: 7/7 must-haves verified (code-level 6 by gsd-verifier 09:35Z; live-rollout truth closed by main session 2026-09-29 01:07Z — see addendum)
covered_files:
  - .planning/quick/260929-c8e-relay-kyobo-observer/260929-c8e-PLAN.md
  - .planning/quick/260929-c8e-relay-kyobo-observer/260929-c8e-SUMMARY.md
  - infra/relay/README.md
  - relay/src/config.ts
  - relay/src/index.ts
  - relay/src/journal/access.ts
  - relay/src/journal/writer.ts
  - relay/src/logger.ts
  - relay/src/order/order-api.ts
  - relay/src/ws/fanout.ts
  - relay/tests/config-upstreams.test.ts
  - relay/tests/journal-boot.test.ts
  - relay/tests/journal-push.test.ts
  - relay/tests/order-api.test.ts
  - scripts/deploy-relay.sh
  - scripts/setup-relay-iam.sh
covered_digest: "v1:sha256:50436b07b83b929366b72e742c2553ca9629be2540c0b65ca29d502d0092f82b"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Task 3 (메인 세션): 비밀 생성(사용자 `!`) → gh-trade kyobo127 observer.toml 배치 → relay 배포 → /healthz jq 검증 → dma_account_access 신원 교차 확인 승인 → smoke-relay.sh"
    expected: "KB · KYOBO 관찰자가 동시에 live. /healthz 200, journal.state live, journalGateways.KYOBO.state live. KYOBO 매핑 신원 교차 확인을 사용자가 승인. KB smoke PASS. SUMMARY.md 「라이브 반영 결과」 절이 채워진다."
    why_human: "Secret Manager 쓰기·gcloud/ssh/docker 실행·실제 배포는 이 검증 범위 밖(main-session 전용 checkpoint:human-action). 코드는 준비돼 있으나 아직 실행되지 않았다 — SUMMARY 의 TASK3_LIVE_RESULT_PLACEHOLDER 가 그대로 남아 있다."
---

# Phase quick-260929-c8e: relay 관찰자 다중 업스트림 (KB + 교보 KYOBO) Verification Report

**Phase Goal:** relay 관찰자를 다중 업스트림으로 만든다 — 교보 kyobo127(10.16.207.127:9100) 관찰자를 KB 120 관찰자와 동시에 붙인다. 게이트웨이 키 KYOBO · 전용 시크릿(DMA_OBSERVER_SECRET_KYOBO) · JournalStatus/healthz 다중화(KB 프레임 불변) · deploy-relay.sh env · README. 사용자 세션(SessionManager)은 KB 단일 유지.
**Verified:** 2026-09-29T09:35Z
**Status:** human_needed
**Re-verification:** No — initial verification

**Scope note:** Per verification instructions, Task 3 (main-session live checkpoint: secret creation, gh-trade handoff, deploy, live verification) has not run yet and is treated as `human_needed`/pending, not as a gap. Tasks 1–2 (code, tests, ops scripts, docs) are committed (77af8444, 104ab050, eee8032d, 7f08bb36) and are the subject of full code-level verification below.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | KYOBO env 없으면 relay 는 오늘과 같다(KB 1개 관찰자·gateway=eq.KB 커서 조회 1회·healthz 8키+journalGateways 없음·journal.state 프레임 불변·SessionManager KB 단일) | ✓ VERIFIED | Harness R1,R4,R5,R6,R7,R8,R12 all PASS; `relay/tests/journal-boot.test.ts` M1 case (part of 665 green tests); `index.ts:139-144` — `SessionManager` constructed only from `config.dmaHost/dmaPort/dmaBroker` (primary upstream), never from `journalUpstreams` extras; `order-api.ts` `healthy` formula line unchanged vs `fb7c9b0f` (confirmed via `git diff` context line) |
| 2 | DMA_KYOBO_HOST · DMA_OBSERVER_SECRET_KYOBO 있으면 게이트웨이별 독립 파이프라인 2벌(기록기·매핑·관찰자·상태), 각자 자기 비밀로 로그인, 커서/RPC 분리(KB 와 안 섞임) | ✓ VERIFIED | `index.ts:107-135` `createJournalPipeline()` per-upstream, `journalPipelines` array; boot M2 test (gateway=[eq.KB,eq.KYOBO] cursor query, p_gateway={KB,KYOBO}); R1-R3,R9,R13-R16 PASS; config ⑤ throws on gateway key collision (T-c8e-03 mitigation) |
| 3 | KYOBO 거부/연결실패는 KB 관찰자·사용자 세션·/healthz 상태코드를 안 바꾼다. KYOBO 상태는 journalGateways.KYOBO(8키+alerting)로만 노출. 503 판정식 한 글자도 안 바뀜 | ✓ VERIFIED | `order-api.ts:321` `const healthy = linkUp && sessionsOk && journalOk;` — identical line vs `fb7c9b0f` (git diff context match); order-api tests b/c/d/e (KYOBO rejected→200, KB rejected→503 unaffected, OUT_OF_WINDOW alerting false, no identifier keys); boot M3 (KYOBO rejected, KB live, 200) |
| 4 | 브라우저 journal.state 는 KB 하나뿐(결선 1곳). KYOBO 적용 행은 KYOBO 매핑으로만 필터. REST dma_journal_orders_for_user 와 같은 신원 규칙. webapp 소스 무변경, 소비자 3파일 테스트 통과 | ✓ VERIFIED | `index.ts:200-207` — `journalStatus.on("frame", ...)` wired once (primary only); extra gateways wired only via `writer.on("applied", (rows) => fanout.deliverJournalRows(rows, extra.access))`, no frame wiring; push test ⑥ (KYOBO mapping filters correctly, doesn't leak to KB routing); `git diff --stat fb7c9b0f -- webapp/` shows changes but all attributable to unrelated commit `1a2c9944` (other session, documented in SUMMARY deviations) — zero webapp diff from c8e commits; webapp relay-consumer tests 183/183 passed (`relay-socket.test.ts` 104, `relay-provider.test.tsx` 38, `today-orders-card.test.tsx` 41) |
| 5 | deploy-relay.sh: KYOBO 비밀/접근권 없으면 한 줄 남기고 KB 단독 배포. 호스트 우선순위 명시>보존>없음, off=명시 해제. 비밀은 VM tmpfs env-file 로만. 저장소에 교보 실주소 기본값 없음 | ✓ VERIFIED | Harness O5-O13 all PASS (resolve_kyobo_host 6 cases, critical-4 loop unchanged, KYOBO fetch non-fatal `\|\| true`, no real-address literal); code read confirms `resolve_kyobo_host()` priority logic (`scripts/deploy-relay.sh:197-211`), non-fatal KYOBO pre-check block, env-file conditional 3-line block |
| 6 | README 새 절이 구조·격리·healthz·503 제외 이유·신원 규칙·롤아웃 순서·복구·교보 터널 주의·끄기/롤백을 담는다 | ✓ VERIFIED | Harness O14-O17 all PASS (multi-gateway section exists, 10 required keywords present, Secret status table has KYOBO row, existing headings preserved) |
| 7 | [메인 세션] 비밀 생성→gh-trade 배치+재시작→relay 배포 순서. /healthz 200·journal.state live·journalGateways.KYOBO.state live. KYOBO 매핑 동기화, 신원 교차 확인 승인. KB 회귀 없음(smoke PASS) | ⚠️ pending (human_needed) | Task 3 is a `checkpoint:human-action` gate, `executor="main-session"` — explicitly not run by gsd-executor. SUMMARY.md still shows `TASK3_LIVE_RESULT_PLACEHOLDER` and `(미실행 — 메인 세션 대기)`. Per verification scope instructions, treated as pending, not a gap. |

**Score:** 6/6 code-level truths verified. Truth 7 (live rollout, C8E-LIVE) is a main-session-only checkpoint that has not executed — routed to human verification, not scored as failed.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `relay/src/config.ts` | JournalUpstream type · env 표 · journalUpstreams(0번=주 게이트웨이) · 키 충돌 거부 | ✓ VERIFIED | `DMA_OBSERVER_SECRET_KYOBO` present; `JournalUpstream` type, `journalUpstreams: readonly [JournalUpstream, ...]`, primary from 4 existing fields, EXTRA_OBSERVER_ENV-style table for KYOBO row |
| `relay/src/index.ts` | journalUpstreams 순회 파이프라인 · 주 게이트웨이 결선 불변 · 추가 게이트웨이 매핑 푸시 · healthz 추가 상태 · 전 게이트웨이 종료 | ✓ VERIFIED | `journalUpstreams` present; no gateway-key literals in code (R4); primary destructured to legacy names so fanout/orderApi wiring lines unchanged; shutdown loops over `journalPipelines` |
| `relay/src/order/order-api.ts` | HealthPayload.journalGateways(추가 게이트웨이·alerting·503 밖) | ✓ VERIFIED | `journalGateways` present; `healthy` formula line byte-identical to baseline |
| `relay/src/ws/fanout.ts` | deliverJournalRows(rows, access?) 선택 매핑 인자 | ✓ VERIFIED | `deliverJournalRows(` present; optional `access` param, falls back to `#journalAccess` when omitted |
| `relay/tests/config-upstreams.test.ts` | env 표→journalUpstreams 단위 테스트 5케이스 | ✓ VERIFIED | New file exists; `DMA_KYOBO_HOST` referenced; part of 665 passing tests |
| `relay/tests/journal-boot.test.ts` | 실 프로세스 다중 업스트림 M1-M3 | ✓ VERIFIED | `DMA_OBSERVER_SECRET_KYOBO` referenced; M1/M2/M3 cases pass in full suite run |
| `scripts/deploy-relay.sh` | read_live_env 일반화 · resolve_kyobo_host · 비치명 사전점검 · VM fetch · 조건부 env-file 3줄 | ✓ VERIFIED | `resolve_kyobo_host` present and correctly implemented (4-branch priority) |
| `scripts/setup-relay-iam.sh` | Section 4 루프에 KYOBO secret 껍데기 | ✓ VERIFIED | `gh-radar-dma-observer-secret-kyobo` present |
| `infra/relay/README.md` | 다중 게이트웨이 관찰자 절 | ✓ VERIFIED | `### 다중 게이트웨이 관찰자` heading present; 10 required keywords confirmed by harness O15 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| env DMA_KYOBO_HOST/PORT/SECRET | config.journalUpstreams[1] → index.ts pipeline | env 표 순회, 키 리터럴 없음 | ✓ WIRED | `index.ts:132-134` destructures `[primaryUpstream, ...extraUpstreams] = config.journalUpstreams`, maps `createJournalPipeline` over extras — no gateway string literals in index.ts (harness R4) |
| 추가 게이트웨이 writer 'applied' | fanout.deliverJournalRows(rows, 그 게이트웨이 access) | 선택 매핑 인자 | ✓ WIRED | `index.ts:205-207`: `for (const extra of extraJournals) { extra.writer.on("applied", (rows) => fanout.deliverJournalRows(rows, extra.access)); }` |
| 주 게이트웨이 JournalStatus 'frame' | fanout.deliverJournalState | 결선 1곳 | ✓ WIRED | `index.ts:201`: `journalStatus.on("frame", (frame) => fanout.deliverJournalState(frame));` — only wired for primary; no equivalent loop for `extraJournals` status |
| 추가 게이트웨이 JournalStatus.health | /healthz body journalGateways.<키> | createOrderApi deps | ✓ WIRED | `index.ts:227-231` `journalGateways: extraJournals.map((p) => ({ gateway: p.upstream.gateway, health: ... }))` passed to `createOrderApi` |
| deploy-relay.sh resolve_kyobo_host | REMOTE_HEAD → VM fetch_secret → env-file → container env | 비치명 전파 | ✓ WIRED | Confirmed by code read + harness O5-O10 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|--------------|--------|----------|
| C8E-RELAY | Plan 01 | relay 다중 업스트림 코드/테스트 | ✓ SATISFIED | Truths 1-4, all artifacts and key links verified |
| C8E-OPS | Plan 01 | deploy-relay.sh/setup-relay-iam.sh/README | ✓ SATISFIED | Truths 5-6 verified, harness O1-O17 PASS |
| C8E-LIVE | Plan 01 | 라이브 반영(비밀 생성·gh-trade 인계·배포·검증) | ? NEEDS HUMAN | Task 3 not yet executed — main-session-only checkpoint |

No orphaned requirements found in REQUIREMENTS.md cross-reference (this is a `quick` task; `source_audit` in PLAN.md states no CONTEXT/RESEARCH/REQUIREMENTS sources apply).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | none found | — | `grep -n "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` across all 10 modified/created code+script+doc files returned zero real matches (one false-positive hit on `mktemp ... XXXXXXXX` template string in `deploy-relay.sh`, not a debt marker) |

### Regression / Isolation Checks

- `git diff --stat fb7c9b0f -- relay/src/journal/status.ts relay/src/journal/observer.ts relay/src/dma packages/shared webapp/ supabase/ infra/relay/startup.sh infra/relay/Caddyfile` → **zero diff** for all except `webapp/`, which shows diff attributable entirely to the separate, already-documented commit `1a2c9944` (unrelated banner-removal fix by another session) — confirmed by diffing `1a2c9944^..1a2c9944 -- webapp/` and finding an identical file/line set.
- `git show --stat --name-only` on all 4 c8e commits (77af8444, 104ab050, eee8032d, 7f08bb36) → touches exactly the 14 files declared in PLAN frontmatter `files_modified`, nothing else.
- No commits made by this verification session; no gcloud/docker/ssh executed; no repo file edited.

### Behavioral Spot-Checks / Test Execution

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Relay full test suite | `pnpm --filter @gh-radar/relay run test` (run from `relay/`) | 29 files, 665 tests passed (baseline 651 + 14 new: config-upstreams 5, order-api a-e 5, journal-push ⑥ 1, journal-boot M1-M3 3) | ✓ PASS |
| Relay typecheck | `pnpm --filter @gh-radar/relay run typecheck` | exit 0, no errors | ✓ PASS |
| Relay typecheck (tests) | `pnpm --filter @gh-radar/relay run typecheck:tests` | exit 0, no errors | ✓ PASS |
| Shared package build | `pnpm --filter @gh-radar/shared build` | build success | ✓ PASS |
| webapp relay-consumer tests | `pnpm --filter @gh-radar/webapp run test src/lib/__tests__/relay-socket.test.ts src/lib/__tests__/relay-provider.test.tsx src/components/trading/__tests__/today-orders-card.test.tsx` | 3 files, 183 tests passed | ✓ PASS |
| Quick-task structural harness | `bash .planning/quick/260929-c8e-relay-kyobo-observer/260929-c8e-verify.sh all` | 52 PASS / 0 FAIL (R1-R17, O1-O17, C1-C5) | ✓ PASS |

### Probe Execution

Not applicable — no `scripts/*/tests/probe-*.sh` declared or discovered for this quick task; the project-specific `260929-c8e-verify.sh` structural harness (run above) fills this role and passed in full.

## Human Verification Required

### 1. Task 3 — Live Rollout (main-session checkpoint)

**Test:** Execute Task 3 steps (0)→(a)→(b)→(c)→(d)→(e): user runs `260929-c8e-kyobo-secret.sh` via `!`, gh-trade deploys kyobo127 `observer.toml` + restart, main session runs `deploy-relay.sh` with `DMA_KYOBO_HOST=10.16.207.127`, then verifies `/healthz`, container logs, `dma_account_access` mapping rows + identity cross-check, and `smoke-relay.sh`.

**Expected:** `/healthz` returns `status: ok`, `journal.state: live` (KB), `journalGateways.KYOBO.state: live`. Identity cross-check between KYOBO and KB `dma_user_id` approved by user. `smoke-relay.sh` PASS. `SUMMARY.md`'s "라이브 반영 결과" section filled with timestamps, hash match, deploy SHA, log excerpts, mapping row counts, and smoke result — or a documented stop-branch with evidence.

**Why human:** Requires live Secret Manager writes, gcloud/ssh/docker execution, an actual container redeploy, and a human-approved identity cross-check (T-c8e-02) — none of which are permitted or possible in this code-level verification pass. This is explicitly gated as `executor="main-session"` in the PLAN and gsd-executor was instructed not to run it.

## Gaps Summary

No code-level gaps found. Tasks 1 and 2 are fully implemented, wired, tested, and isolated as specified: the KYOBO-absent path is byte-for-byte unchanged from baseline (healthz 8-key body, `healthy` formula, `journal.state` frame shape), the KYOBO-present path stands up an independent per-gateway pipeline that never mixes cursors/epoch/mapping with KB, KYOBO failures are structurally excluded from the 503 decision and from the browser `journal.state` frame, and the deploy/IAM/README operational surface degrades gracefully to KB-only when the KYOBO secret or access is absent. All 665 relay tests, 183 webapp consumer tests, and the 52-check quick-task harness pass. The only outstanding item is Task 3 — the live rollout — which is a main-session-only human checkpoint that has not yet been executed (SUMMARY.md placeholder still unfilled). This is expected per the plan's own task-3 gating and is not treated as a gap per this verification's scope instructions.

---

_Verified: 2026-09-29T09:35Z_
_Verifier: Claude (gsd-verifier)_


## Addendum — Task 3 라이브 체크포인트 종결 (메인 세션 · 2026-09-29 10:07 KST)

위 본문은 gsd-verifier 가 Task 3 실행 전(09:35Z)에 쓴 것이다. 이후 메인 세션이 Task 3 을 끝내 truth 7 / C8E-LIVE 를 닫았다. 증거는 SUMMARY 「라이브 반영 결과」 절.

| 항목 | 결과 |
|------|------|
| 비밀 | `gh-radar-dma-observer-secret-kyobo` v1, sha12 b672eca72f2e — gh-trade 측 kyobo127 observer.toml 해시 일치 |
| 순서 | 비밀 생성 → kyobo127 배치·재시작(10:01:39) → relay 배포(10:04~10:07) |
| 계획 `<verify>` jq | status ok · journal.state live · journalGateways.KYOBO.state live → true |
| KYOBO 로그인 | epoch 20260928-eedf314c… headSeq 0 accounts 3 → live |
| 신원 교차 확인(T-c8e-02) | KYOBO 매핑 3행 = KB 와 동일 ID 집합, 사용자 승인 「같은 사람」 |
| KB 회귀 | smoke-relay.sh PASS 10 / FAIL 0 |

status 를 human_needed → passed 로 갱신했다(사람 확인 항목이 승인으로 닫혔으므로).
