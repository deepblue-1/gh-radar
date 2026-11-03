---
phase: "38"
slug: "own-orders-on-ticks"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-03"
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest — shared ^4.1.4 · server ^4.1.4 · webapp ^2.1.9(jsdom) · Playwright ^1.59.1 · pgTAP(러너 `scripts/verify-dma-orders-price-check.sh --test` · 이미지 `public.ecr.aws/supabase/postgres:17.6.1.104`) · 픽스처 생성기 `node scripts/tick-oracle/gen-own-fixtures.mjs --check` |
| **Config file** | `packages/shared/vitest.config.ts`(maxWorkers 2) · `server/vitest.config.ts` · `webapp/vitest.config.ts` · `webapp/playwright.config.ts`(포트 3100) — 37 그대로 · 새 설치 없음 |
| **Quick run command** | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/ticks-own.golden.test.ts src/__tests__/ticks-own.test.ts src/__tests__/ticks-record-index.test.ts --maxWorkers=2` |
| **Full suite command** | 38-10-PLAN.md Task 1 verify(shared 전체 · relay typecheck · server ticks/ticks-live · webapp src/lib/ticks · src/components/ticks · e2e ticks-viewer + pgTAP tick_own · tick_viewer) |
| **Estimated runtime** | 태스크 단위 ~5~60초(shared 오라클 수 초 · NXT 픽스처 해제 포함) · e2e 태스크 ~2~4분 · 전체 회귀 ~8분 |

---

## Sampling Rate

- **After every task commit:** 그 태스크 `<verify><automated>` 명령(아래 표 — 파일 단위 `exec vitest run <파일>` · server · webapp `test` 스크립트는 watch 라 쓰지 않는다)
- **After every plan wave:** 그 웨이브가 건드린 패키지 전체 `exec vitest run --maxWorkers=2`(+ DB 웨이브면 pgTAP) · 전체 회귀는 한 세션만(동시 세션 메모리 규칙)
- **Before `/gsd-verify-work`:** 38-10 Task 1 전체 회귀 green + pgTAP ok(또는 「pgTAP 미실행」 명시 + 사용자 승인) → [BLOCKING] DB push → server → git push → 프로덕션 UAT
- **Max feedback latency:** 60초(vitest · pgTAP 태스크) · e2e 태스크 240초

---

## Per-Task Verification Map

보안 검사 생략(`security_enforcement: false`) — Threat Ref 는 「—」, 권한 동작은 Secure Behavior 칸에 적는다. 요구사항 ID 가 없어(ROADMAP `Requirements: TBD`) Requirement 칸은 성공 기준(SC-n) · CONTEXT 결정(D-nn)이다. 「❌ W0」 = 그 태스크가 시험 파일을 스스로 만든다(트레이서 · TDD — 별도 Wave 0 플랜 없음).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 38-01-01 | 01 | 1 | SC-2 · SC-4 · SC-5 · D-01 · D-03 · D-04 · D-06 · D-14 · D-15 | — | RPC service_role 전용(anon · authenticated EXECUTE 0) · 매핑 없음 `{access:false}` · 가시 계좌만 · 꺼진 서버 제외 · dma_user_id 비반환 | tracer(pgTAP 스모크 + typecheck + 라우트 회귀 + RTL) | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_own.test.sql && pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared run typecheck && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run tests/routes/ticks.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/components/ticks/__tests__/tick-msg-list.test.tsx src/lib/ticks/__tests__/msg-rows.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 38-02-01 | 02 | 2 | SC-3(cum 열) · D-15 · D-16 | — | 픽스처 계좌 익명(`ACC…`) · 원격 접근 0 | tracer(생성기 자기검사 · --check + 골든 회귀) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared run typecheck && node scripts/tick-oracle/gen-own-fixtures.mjs --check && pnpm --filter @gh-radar/shared exec vitest run src/__tests__/ticks-record-index.test.ts src/__tests__/ticks-pnl.golden.test.ts src/__tests__/ticks-orders-krx.golden.test.ts src/__tests__/ticks-orders-nxt.golden.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 38-02-02 | 02 | 2 | SC-2 · D-15 | — | N/A | unit(오라클 401/406 · 추정 108) + 합성 | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared run typecheck && pnpm --filter @gh-radar/shared exec vitest run src/__tests__/ticks-own.golden.test.ts src/__tests__/ticks-own.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 38-03-01 | 03 | 2 | SC-4 · SC-5 · D-01 · D-03 · D-14 | — | 가시 계좌만 · admin 전 계좌 · 매핑 없는 admin 차단 · KB121 꺼짐 0행 → 켜면 포함 · 필터 · dma_user_id 없음 | pgTAP(약 35) | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_own.test.sql && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_viewer.test.sql` | ✅(38-01 생성) | ✅ green |
| 38-03-02 | 03 | 2 | SC-4 · D-01 · D-14 | — | 401 · 400(RPC 0) · 403 DMA_UNMAPPED · 500 원문 비노출 · RPC 1회 · 인자 4개 · 쿼리 계좌/사용자 키 무시 | integration(supertest) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run tests/routes/ticks.test.ts tests/routes/ticks-live.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 38-04-01 | 04 | 2 | SC-2(누락 0) · D-05 · D-12 · D-13 | — | N/A | unit + RTL | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared exec vitest run src/__tests__/strategy-event-text.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/lib/ticks/__tests__/own-model.test.ts src/lib/ticks/__tests__/msg-rows.test.ts src/components/ticks/__tests__/tick-msg-list.test.tsx --maxWorkers=2` | ✅ | ✅ green |
| 38-04-02 | 04 | 2 | D-04 · D-10 · D-02 | — | N/A | unit + RTL | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/lib/ticks/__tests__/msg-rows.test.ts src/components/ticks/__tests__/tick-msg-list.test.tsx src/lib/ticks/__tests__/own-model.test.ts src/lib/ticks/__tests__/use-fixed-window.test.tsx --maxWorkers=2` | ✅ | ✅ green |
| 38-05-01 | 05 | 3 | SC-3(B6 29/29) · D-15 | — | N/A | unit(오라클) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared run typecheck && pnpm --filter @gh-radar/shared exec vitest run src/__tests__/ticks-own.golden.test.ts --maxWorkers=2` | ✅(38-02 생성) | ✅ green |
| 38-05-02 | 05 | 3 | SC-3(단건 2 · 구간 9 · 앵커 100/100) · D-11 · D-13 | — | N/A | unit(오라클) + 합성 | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared run typecheck && pnpm --filter @gh-radar/shared exec vitest run src/__tests__/ticks-own.golden.test.ts src/__tests__/ticks-own.test.ts src/__tests__/ticks-book.test.ts src/__tests__/ticks-record-index.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 38-06-01 | 06 | 4 | SC-3(화면) · D-04 · D-05 · D-07 · D-10 · D-11 | — | N/A | unit + RTL | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/lib/ticks/__tests__/own-model.test.ts src/lib/ticks/__tests__/msg-rows.test.ts src/components/ticks/__tests__/tick-msg-list.test.tsx src/components/ticks/__tests__/tick-order-card.test.tsx --maxWorkers=2` | ✅ | ✅ green |
| 38-06-02 | 06 | 4 | D-07 · D-10 · D-03 · D-16 | — | 계좌 구분은 섹션 · 표에서만(D-02) | RTL + 팀 회귀 | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/components/ticks/__tests__/tick-order-card.test.tsx src/components/ticks/__tests__/tick-msg-list.test.tsx src/lib/ticks/__tests__/msg-rows.test.ts src/components/ticks/__tests__/tick-team-panel.test.tsx src/lib/ticks/__tests__/team-model.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 38-07-01 | 07 | 5 | D-08 · D-10 | — | N/A | unit + RTL | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/lib/ticks/__tests__/tick-chart.test.ts src/components/ticks/__tests__/tick-chart.test.tsx --maxWorkers=2` | ✅ | ✅ green |
| 38-07-02 | 07 | 5 | D-08 · D-02 · D-16 | — | 툴팁 계좌는 끝 4자리만 | unit + RTL | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/lib/ticks/__tests__/tick-chart-tip.test.ts src/lib/ticks/__tests__/tick-chart.test.ts src/components/ticks/__tests__/tick-chart.test.tsx src/lib/ticks/__tests__/team-model.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 38-08-01 | 08 | 6 | D-09 · D-02 | — | N/A | hook + RTL | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/lib/ticks/__tests__/use-own-nav.test.tsx src/lib/ticks/__tests__/use-tick-cursor.test.tsx src/lib/ticks/__tests__/tick-url.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 38-08-02 | 08 | 6 | SC-4(당일 · 버튼 1회 = RPC 1회) | — | 호출량 = 사용자 클릭(CLAUDE.md 공식 API 기준 3) · 자동 타이머 0 | hook + RTL | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/lib/ticks/__tests__/use-tick-own.test.tsx src/components/ticks/__tests__/tick-viewer-live.test.tsx src/lib/ticks/__tests__/use-tick-live.test.tsx --maxWorkers=2` | ✅ | ✅ green |
| 38-09-01 | 09 | 7 | SC-2 · SC-3 · D-04 · D-05 · D-07 · D-09 · D-10 · D-12 | — | 목 계좌 합성값만 | e2e | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp run typecheck:e2e && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/ticks-viewer.spec.ts -g "우리 주문" --workers=1` | ✅(절 추가) | ✅ green |
| 38-09-02 | 09 | 7 | SC-4 · D-04 · D-07 ④ | — | own 실패 시 우리 층만 숨김(오류 원문 화면 노출 0) | e2e(37 전체 회귀 포함) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck:e2e && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/ticks-viewer.spec.ts e2e/specs/sidebar-tree.spec.ts --workers=1` | ✅ | ✅ green |
| 38-10-01 | 10 | 8 | 전체(SC-2~5 · D-01~D-16) | — | 위 전부 | 전체 회귀 | 38-10-PLAN.md Task 1 verify(shared 전체 · relay · server · webapp · e2e · pgTAP 두 파일) | ✅ | ✅ green |
| 38-10-02 | 10 | 8 | SC-4 [BLOCKING] 스키마 push | — | 배포는 메인 세션만 | CLI(원격 상태) | `supabase migration list --linked` · `git fetch origin master --quiet && test "$(git rev-parse master)" = "$(git rev-parse origin/master)"` | ✅ | ✅ green |
| 38-10-03 | 10 | 8 | SC-2~5 · D-01 · D-03 UAT | — | 트레이더는 자기 가시 계좌만 · 어드민 전 계좌(프로덕션) | CLI + 사람 UAT | `supabase migration list --linked` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

별도 Wave 0 플랜 없음 — 시험 · 픽스처는 그것이 필요한 태스크가 스스로 만든다(트레이서 · TDD).

- [x] `supabase/tests/tick_own.test.sql` — 38-01 Task 1(스모크 9) → 38-03 Task 1(전체 행렬)
- [x] `scripts/tick-oracle/gen-own-fixtures.mjs` + `packages/shared/src/__fixtures__/ticks/own1030-*.ticks.zst`(5) · `own1030.journal.json` · README 행 — 38-02 Task 1(입력 `/Users/alex/gh-radar-own-probe-1030/` · 원격 접근 없음)
- [x] `packages/shared/src/__tests__/ticks-own.golden.test.ts` · `ticks-own.test.ts` — 38-02 Task 2(SC-2) · 38-05(SC-3)
- [x] `webapp/src/lib/ticks/__tests__/own-model.test.ts` — 38-04 Task 1
- [x] `webapp/src/lib/ticks/__tests__/use-own-nav.test.tsx` · `use-tick-own.test.tsx` — 38-08
- [x] `webapp/e2e/fixtures/ticks.ts` `/api/ticks/own` 목 · `tickOwnFixture`(컷 13시 에코앤드림 10/16 유도값) — 38-09 Task 1
- 프레임워크 설치: 없음(전부 저장소에 있다)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 원격 스키마 push(20:00 KST 뒤) · server 배포(라이브 env 유지) · git push | SC-4 · [BLOCKING] | 원격 쓰기 · 배포는 메인 세션 · 사용자 허용 규칙 접두사(메모리) | 38-10 Task 2 — ✅ 사용자 지시로 17:08 KST(장중) 스키마 반영 · Local \| Remote · server 00072-44q · own/live 401 · 프로덕션 반영 17:11 · 18:22 |
| 프로덕션 10/30 KR7184230001 「체결 227건」 — RPC 필터(notice_type 'E' ∧ exec_qty > 0) = 실측 406 집합 | SC-2 · RESEARCH A1 | 실데이터 · 실계정 | 38-10 Task 3 A |
| 트레이더 vs 어드민 가시 범위 · 매핑 없는 계정 게이트 | D-01 | 실계정 권한 | 38-10 Task 3 E |
| 당일 「최신 받기」 직후 우리 체결 표시 · 클릭당 own 1회 | SC-4 당일 · RESEARCH A3 | 장중 실시세 · 37-17 상태 | 38-10 Task 3 F(꺼져 있으면 보류 기록) |
| ev_kind 3(체결통보) 근거 잇기 | RESEARCH Open Q3 | 10/30 5종목에 실측 0건 | 38-10 Task 3 C 중 해당 주문이 있으면 확인 · 없으면 「미관측」 기록 |
| 라이트 테마 민트 칩 글자 판독 · 다크 레일 구분 | D-06 · Pitfall 8 | 시각 판단 | 38-10 Task 3 H(사용자 답 원문) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies(20 태스크 전부 `<automated>` + `<fails_when>` · MISSING 0)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify(체크포인트 태스크도 CLI 확인 명령을 가진다)
- [x] Wave 0 covers all MISSING references(MISSING 없음 — 트레이서 · TDD 태스크가 시험을 만든다)
- [x] No watch-mode flags(`exec vitest run <파일>` 만 · server/webapp `test` 스크립트 미사용)
- [x] Feedback latency < 60s(vitest · pgTAP 태스크) · e2e 태스크 < 240s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-11-03 — 20 태스크 자동 검증 전부 green(38-10 Task 1 전체 회귀 + UAT 반영 뒤 재실행: shared 1074 · server 44 · webapp 틱 353 · e2e ticks-viewer 24 · sidebar-tree · pgTAP 52 · 109 · 픽스처 --check). 수동 항목은 38-10 UAT 사용자 「ok」(2026-11-03) — 세부는 38-10-SUMMARY.

## Validation Audit 2026-11-03

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
