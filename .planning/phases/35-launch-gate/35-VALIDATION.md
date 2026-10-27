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
| 35-12-T1 | 12 | 7 | LAUNCH-09 | — | N/A | unit + pgTAP(TDD · 트레이서) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared exec vitest run src/__tests__/launch-plan.test.ts --maxWorkers=2 && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_plan_changes.test.sql` | ❌ 태스크가 만든다 | ⬜ pending |
| 35-12-T2 | 12 | 7 | LAUNCH-09 | — | N/A | pgTAP(TDD) | `launch_plan_changes.test.sql` + 회귀 `launch_gate.test.sql` | ✅(T1) | ⬜ pending |
| 35-12-T3 | 12 | 7 | LAUNCH-10 | — | N/A | unit(TDD) | shared vitest `launch-plan.test.ts` · `launch.test.ts` + shared typecheck | ✅(T1) | ⬜ pending |
| 35-13-T1 | 13 | 8 | LAUNCH-11 | — | N/A | unit(supertest · TDD · 트레이서) | `pnpm --filter @gh-radar/server exec vitest run tests/routes/admin-launch.test.ts tests/routes/admin.test.ts --maxWorkers=2` + server typecheck | ✅ 확장 | ⬜ pending |
| 35-13-T2 | 13 | 8 | LAUNCH-11 | — | N/A | unit(supertest · TDD) | 위 + `tests/routes/admin-servers.test.ts` | ✅ 확장 | ⬜ pending |
| 35-14-T1 | 14 | 9 | LAUNCH-12 | — | N/A | RTL(트레이서) | webapp vitest `launch-map-tab.test.tsx` · `launch-gate-chart.test.tsx` + webapp typecheck | ✅ 확장 | ⬜ pending |
| 35-14-T2 | 14 | 9 | LAUNCH-12 | — | N/A | unit + RTL(TDD) | webapp vitest `launch-plan-view.test.ts` · `launch-map.test.ts` · `launch-plan-bar.test.tsx` · `launch-gate-chart.test.tsx` | ❌ 태스크가 만든다 | ⬜ pending |
| 35-14-T3 | 14 | 9 | LAUNCH-12 | — | N/A | RTL + e2e | `launch-map-tab.test.tsx` + `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/admin-launch.spec.ts --workers=1`(P35-P1 · P2 + M · L 회귀) | ✅ 확장 | ⬜ pending |
| 35-15-T1 | 15 | 10 | LAUNCH-13 | — | N/A | e2e(트레이서) | `playwright test e2e/specs/admin-launch.spec.ts --workers=1 -g "P35-P3"` + webapp typecheck | ✅ 확장 | ⬜ pending |
| 35-15-T2 | 15 | 10 | LAUNCH-13 | — | N/A | unit + RTL(TDD) | webapp vitest `launch-plan-view.test.ts` · `launch-plan-editor.test.tsx` | ❌ 태스크가 만든다 | ⬜ pending |
| 35-15-T3 | 15 | 10 | LAUNCH-13 | — | N/A | 회귀 게이트(webapp 전체 + e2e) | webapp vitest 전체 + `admin-launch.spec.ts` · `sidebar-tree.spec.ts --workers=1` | ✅ | ⬜ pending |
| 35-16-T1 | 16 | 8 | LAUNCH-14 | — | N/A | gate | 정식 노트(발사 계획 op) · 생성물 발사 계획 표 존재 루프(35-16-PLAN Task 1 verify) | — | ⬜ pending |
| 35-16-T2 | 16 | 8 | LAUNCH-14 | — | N/A | unit(TDD · 트레이서) | relay vitest `tests/admin-conn.test.ts` + relay typecheck · typecheck:tests | ✅ 확장 | ⬜ pending |
| 35-16-T3 | 16 | 8 | LAUNCH-14 | — | N/A | unit(TDD) | relay vitest `src/dma/__tests__/envelope.test.ts` · `admin-conn` · `admin-dispatcher` · `admin-api` | ✅ 확장 | ⬜ pending |
| 35-17-T1 | 17 | 11 | LAUNCH-14 | — | N/A | unit(TDD · 트레이서) | relay vitest `tests/admin-launch-plan.test.ts` · `tests/admin-api.test.ts` + typecheck 2 | ❌ 태스크가 만든다 | ⬜ pending |
| 35-17-T2 | 17 | 11 | LAUNCH-14 | — | N/A | unit(TDD) | shared `admin.test.ts` + relay admin 4파일 | ✅ | ⬜ pending |
| 35-19-T1 | 19 | 12 | LAUNCH-15 | — | N/A | unit + RTL(TDD · 트레이서) | webapp vitest `src/lib/__tests__/launch-format.test.ts` · `src/components/admin/__tests__/launch-orders-tab.test.tsx` + webapp typecheck | ✅ 확장 | ⬜ pending |
| 35-19-T2 | 19 | 12 | LAUNCH-10 · 범위 7 전체 | — | N/A | full suite | shared · relay · server · webapp vitest + typecheck · `admin-launch.spec.ts` · pgTAP `launch_plan_changes` | ✅ | ⬜ pending |
| 35-18-T1 | 18 | 13 | LAUNCH-16 | — | N/A | manual(메인 세션) | `supabase migration list --linked`(이력 표 Remote) · master = origin/master | — | ⬜ pending |
| 35-18-T2 | 18 | 13 | LAUNCH-16 | — | N/A | manual UAT | `bash scripts/launch-backfill.sh --status`(D 확인 날짜 q16 journal) | — | ⬜ pending |
| 35-18-T3 | 18 | 13 | LAUNCH-16 | — | N/A | smoke(grep) | `261027-launch-plan-admin.md` `status: done` · `done_commit` grep | 산출물 | ⬜ pending |

범위 7 라벨(ROADMAP SC 7 · REQUIREMENTS 미매핑 — 추적용): LAUNCH-09 이력 표 · 계약(D-29) · LAUNCH-10 검증 · 「쐈다면」 판정(D-26 · D-28 · D-34) · LAUNCH-11 server 계획 라우트(D-25 · D-27 · D-30) · LAUNCH-12 웹 읽기(D-24 · D-25 · D-29) · LAUNCH-13 웹 편집 · 미리보기 · 저장(D-26 · D-27 · D-28 · D-34) · LAUNCH-14 relay op · 스냅샷 · 라우트(D-25 · D-30 · D-31 — 35-16 · 35-17) · LAUNCH-15 머리 카드 16:00 줄(D-32 — 35-19) · LAUNCH-16 배포 · 라이브 UAT(D-30 · D-33 · D-35). D-34 정식 노트 대조 · 범위 7 전체 회귀는 35-19-T2(35-17 Task 3 에서 분리).

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
- [ ] `packages/shared/src/__tests__/launch-plan.test.ts` · `supabase/tests/launch_plan_changes.test.sql` — LAUNCH-09 · 10(범위 7 · 노트 전) — 35-12
- [ ] `webapp/src/lib/__tests__/launch-plan-view.test.ts` · `webapp/src/components/admin/__tests__/launch-plan-bar.test.tsx` + `webapp/e2e/fixtures/launch.ts` `/plan` GET 목 — LAUNCH-12 — 35-14
- [ ] `webapp/src/components/admin/__tests__/launch-plan-editor.test.tsx` + `fixtures/launch.ts` `/plan` PUT 목 — LAUNCH-13 — 35-15
- [ ] `relay/tests/helpers/frames.ts` 발사 계획 스냅샷 빌더(노트 뒤 — 생성물 필요) — LAUNCH-14 — 35-16
- [ ] `relay/tests/admin-launch-plan.test.ts` — LAUNCH-14 — 35-17
- 프레임워크 설치: 없음(전부 존재)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 백필 적재 뒤 원격 대조 | LAUNCH-07b | 원격 DB 쓰기 · 메인 세션 실행(D-09) | dry-run 출력(날짜 11 · 행 196 · 머리 33) → `--apply` → 어드민 지도 10/12~10/26 을 첨부 `launch-gate-map.html` 과 나란히 비교 |
| 첫 실물 날짜 라이브 UAT | LAUNCH-08 | 프로덕션 수동 주입 없음(D-23) | 16:00:01 · 09:00:31 이후 relay 로그 kind 17·18 적재 건수 · `launch_*` 행 · 어드민 당일 행 · 지도 「전체」 다음 오프셋 선 = kind 18 값 |
| gh-trade 핸드오프 노트 내용 | LAUNCH-01 | 저장소 밖(`../gh-trade`) 파일 · 사용자 검토 | 노트에 TODO 없음 · `next_offset_us` · 발사 기준/side 요구 · 상의 노트 `## 회신` 존재 |
| 발사 계획 정식 노트 대조(범위 7) | LAUNCH-14 | 노트 와이어 표를 사람이 대조 · 사용자 「진행」 | 35-16 Task 1 대조표(잠정 · 노트 · 같음/다름) · 생성물 마커 · 36-02 상태 |
| 발사 계획 라이브 UAT(범위 7 · D-33) | LAUNCH-16 | 실서버 설정 변경 · 다음 실물 발사 필요 · 프로덕션 수동 주입 없음 | 35-18 Task 2 A~E — 서버 계획 조회 · KB120 16:00 코스닥 저장 → 86 code 0 · 서버 로그 「발사 계획 변경」 · 이력 행 → 다음 16:00 kind 17 sent_rel_us 새 시각 근처 · 09:00:30 은 gh-trade 43-06 배포 뒤 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 600s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
