---
phase: "35"
slug: "launch-gate"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-27"
---

# Phase 35 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pgTAP(SQL · 일회용 컨테이너) · vitest 4.1(shared · relay · server) · vitest 2.1(webapp) · Playwright 1.59(e2e) |
| **Config file** | `packages/shared/vitest.config.ts` · relay/server 기존 vitest config · `webapp/playwright.config.ts`(baseURL 3100 · webServer 자동) |
| **Quick run command** | 태스크가 건드린 파일 단위 `pnpm --filter <ws> exec vitest run <file> --maxWorkers=2` / `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_gate.test.sql` |
| **Full suite command** | 35-RESEARCH.md §Validation Architecture 의 Full suite(shared build → shared/relay/server/webapp typecheck+vitest → playwright `admin-launch.spec.ts` `sidebar-tree.spec.ts` `--workers=1`) + pgTAP 4~6파일 |
| **Estimated runtime** | ~600 seconds (pgTAP 포함 · 전체 회귀는 한 세션만) |

---

## Sampling Rate

- **After every task commit:** Run the task's file-level vitest / pgTAP (quick run command)
- **After every plan wave:** Run that wave's workspace typecheck + vitest; migration wave runs pgTAP 4~6 files
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds (file-level) · 600 seconds (full)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 35-01-T1 | 01 | 1 | LAUNCH-01 | — | N/A | smoke(grep) | 초안 다섯 절 · `next_offset_us` · `fire_exchange` · TODO 0 · 상의 노트 `## 회신` grep | 산출물 | ⬜ pending |
| 35-01-T2 | 01 | 1 | LAUNCH-01 | — | N/A | manual(메인 세션) | gh-trade 노트 TODO 0 · `next_offset_us` grep | 저장소 밖 | ⬜ pending |
| 35-02-T1 | 02 | 1 | LAUNCH-02 | — | N/A | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_gate.test.sql` | ❌ 태스크가 만든다 | ⬜ pending |
| 35-02-T2 | 02 | 1 | LAUNCH-02 | — | N/A | pgTAP + grep | 위 + `launch_map_for_admin` · `DISTINCT ON` · `22023` grep | ❌ | ⬜ pending |
| 35-03-T1 | 03 | 1 | LAUNCH-06a · 07 | — | N/A | unit + CLI | `cmp` 픽스처 · shared vitest `src/__tests__/launch.test.ts` · relay vitest `tests/launch-backfill.test.ts` · CLI dry-run 합계 줄 | ❌ | ⬜ pending |
| 35-03-T2 | 03 | 1 | LAUNCH-06a | — | N/A | unit(TDD) | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/launch.test.ts --maxWorkers=2` | ❌ | ⬜ pending |
| 35-03-T3 | 03 | 1 | LAUNCH-07 | — | N/A | unit + CLI | relay vitest · `bash -n scripts/launch-backfill.sh` · `--help` | ❌ | ⬜ pending |
| 35-04-T1 | 04 | 2 | LAUNCH-03 | — | N/A | pgTAP | `launch_gate_apply.test.sql` + `dma_strategy_apply.test.sql` | ❌ / ✅ 회귀 | ⬜ pending |
| 35-04-T2 | 04 | 2 | LAUNCH-03 · 04 | — | N/A | pgTAP 7 + grep | launch_gate · launch_gate_apply · dma_strategy_apply · accum_signal · read · limit_feature · gateway_identities + purge 재정의 없음 grep | ❌ / ✅ | ⬜ pending |
| 35-05-T1 | 05 | 2 | LAUNCH-05 | — | N/A | unit(supertest) | `pnpm --filter @gh-radar/server exec vitest run tests/routes/admin-launch.test.ts tests/routes/admin-servers.test.ts --maxWorkers=2` | ❌ | ⬜ pending |
| 35-05-T2 | 05 | 2 | LAUNCH-05 | — | N/A | unit(supertest) | 위 + `tests/routes/admin.test.ts` | ❌ | ⬜ pending |
| 35-05-T3 | 05 | 2 | LAUNCH-06c | — | N/A | unit + e2e | `app-sidebar.test.tsx` + `e2e/specs/sidebar-tree.spec.ts --workers=1` | ✅ 갱신 | ⬜ pending |
| 35-06-T1 | 06 | 3 | LAUNCH-06e | — | N/A | e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/admin-launch.spec.ts --workers=1` | ❌ | ⬜ pending |
| 35-06-T2 | 06 | 3 | LAUNCH-06b · 06d · 06e | — | N/A | unit + RTL + e2e | `launch-format.test.ts` · `launch-orders-tab.test.tsx` · `tds-tokens.test.ts` + admin-launch e2e | ❌ / ✅ 갱신 | ⬜ pending |
| 35-07-T1 | 07 | 4 | LAUNCH-06b | — | N/A | unit + RTL | `launch-map.test.ts` · `launch-gate-chart.test.tsx` | ❌ | ⬜ pending |
| 35-07-T2 | 07 | 4 | LAUNCH-06b | — | N/A | unit(TDD) + RTL | 위 | ❌ | ⬜ pending |
| 35-08-T1 | 08 | 5 | LAUNCH-06e | — | N/A | e2e | admin-launch e2e(지도 1280) | ❌ | ⬜ pending |
| 35-08-T2 | 08 | 5 | LAUNCH-06e | — | N/A | unit + RTL + e2e | `launch-map.test.ts` · `launch-map-tab.test.tsx` + admin-launch e2e(390 포함) | ❌ | ⬜ pending |
| 35-08-T3 | 08 | 5 | 전체 | — | N/A | full suite | Full suite + pgTAP 7 + CLI dry-run(35-08-PLAN Task 3) | ✅ | ⬜ pending |
| 35-09-T1 | 09 | 6 | LAUNCH-02 · 03 | — | N/A | manual(메인 세션) | `supabase migration list --linked`(Remote 두 줄) | — | ⬜ pending |
| 35-09-T2 | 09 | 6 | LAUNCH-07b | — | N/A | manual(메인 세션) | `bash scripts/launch-backfill.sh --status` | — | ⬜ pending |
| 35-09-T3 | 09 | 6 | LAUNCH-07b | — | N/A | manual + UAT | master = origin/master · 401×2 · 첨부 지도 나란히(사용자 답) | — | ⬜ pending |
| 35-10-T1 | 10 | 7 | LAUNCH-08 | — | N/A | gate | 정식 노트 존재 루프(35-10-PLAN Task 1 verify) | — | ⬜ pending |
| 35-10-T2 | 10 | 7 | LAUNCH-08 | — | N/A | pgTAP(TDD) | `launch_project_mapping.test.sql` + 회귀 5파일 | ❌ | ⬜ pending |
| 35-10-T3 | 10 | 7 | LAUNCH-08 | — | N/A | unit | shared vitest 전체 · relay/server/webapp typecheck · webapp vitest 전체 | ✅ 갱신 | ⬜ pending |
| 35-11-T1 | 11 | 8 | LAUNCH-08 | — | N/A | manual(메인 세션) | `--reproject` → `--apply` → `--status` | — | ⬜ pending |
| 35-11-T2 | 11 | 8 | LAUNCH-08 | — | N/A | manual UAT | 첫 실물 16:00:01 · 09:00:31 · `--status` | — | ⬜ pending |
| 35-11-T3 | 11 | 8 | LAUNCH-08 | — | N/A | smoke(grep) | 상의 노트 `status: done` · `done_commit` grep | 산출물 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `supabase/tests/launch_gate.test.sql` — LAUNCH-02 (표 · 권한 · 조건부 upsert 행렬 · 도착 순서 · 어드민 RPC 2) — 35-02
- [ ] `supabase/tests/launch_gate_apply.test.sql` — LAUNCH-03/04 (apply 재정의 · 포이즌 · 재생 · reproject · 래퍼/타임라인 제외 · purge 고정) — 35-04
- [ ] `packages/shared/src/__fixtures__/launch-pieces-1012-1026.json` + `packages/shared/src/__tests__/launch.test.ts` — LAUNCH-06a · LAUNCH-07 공용 정답(첨부 `group()` 기대값) — 35-03
- [ ] `relay/tests/launch-backfill.test.ts` — LAUNCH-07 — 35-03
- [ ] `server/tests/routes/admin-launch.test.ts` — LAUNCH-05 — 35-05
- [ ] `webapp/src/lib/__tests__/launch-format.test.ts` · `webapp/src/components/admin/__tests__/launch-orders-tab.test.tsx` — LAUNCH-06b — 35-06
- [ ] `webapp/src/lib/__tests__/launch-map.test.ts` · `webapp/src/components/admin/__tests__/launch-gate-chart.test.tsx` — LAUNCH-06b — 35-07
- [ ] `webapp/src/components/admin/__tests__/launch-map-tab.test.tsx` — LAUNCH-06e — 35-08
- [ ] `webapp/e2e/specs/admin-launch.spec.ts` + `webapp/e2e/fixtures/launch.ts` — LAUNCH-06e — 35-06 · 35-08
- [ ] `supabase/tests/launch_project_mapping.test.sql` — LAUNCH-08(Wave B · 정식 노트 뒤) — 35-10
- 프레임워크 설치: 없음(전부 존재)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 백필 적재 뒤 원격 대조 | LAUNCH-07b | 원격 DB 쓰기 · 메인 세션 실행(D-09) | dry-run 출력(날짜 11 · 행 196 · 머리 33) → `--apply` → 어드민 지도 10/12~10/26 을 첨부 `launch-gate-map.html` 과 나란히 비교 |
| 첫 실물 날짜 라이브 UAT | LAUNCH-08 | 프로덕션 수동 주입 없음(D-23) | 16:00:01 · 09:00:31 이후 relay 로그 kind 17·18 적재 건수 · `launch_*` 행 · 어드민 당일 행 · 지도 「전체」 다음 오프셋 선 = kind 18 값 |
| gh-trade 핸드오프 노트 내용 | LAUNCH-01 | 저장소 밖(`../gh-trade`) 파일 · 사용자 검토 | 노트에 TODO 없음 · `next_offset_us` · 발사 기준/side 요구 · 상의 노트 `## 회신` 존재 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 600s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
