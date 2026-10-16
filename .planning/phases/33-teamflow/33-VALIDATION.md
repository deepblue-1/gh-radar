---
phase: "33"
slug: "teamflow"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-16"
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. 근거: `33-RESEARCH.md` § Validation Architecture · 플랜 9개(33-01~33-09)의 `<verify>` 가 정본이다 — 아래 표의 명령이 PLAN 과 다르면 PLAN 이 이긴다.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | worker vitest ^3 · server vitest ^4.1.4 + supertest · webapp vitest ^2.1.9(jsdom · RTL) + Playwright ^1.59.1 · pgTAP(일회용 컨테이너 — `scripts/verify-dma-orders-price-check.sh`) |
| **Config file** | `workers/limitup-sync/vitest.config.ts` · `server`(package vitest) · `webapp/vitest.config.ts`(maxWorkers 기본 2 · include `src/**/*.test.{ts,tsx}`) · `webapp/playwright.config.ts`(baseURL 3100) · pgTAP 러너 이미지 `public.ecr.aws/supabase/postgres:17.6.1.104`(로컬에 없음 — 33-01 Task 2 승인 체크포인트) |
| **Quick run command** | 워커 `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/limitup-sync exec vitest run --maxWorkers=2` · server `pnpm --filter @gh-radar/server exec vitest run tests/routes/teamflow-report.test.ts --maxWorkers=2` · 웹 `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/teamflow-report.test.ts src/lib/__tests__/teamflow-chart.test.ts src/components/analytics/__tests__/teamflow-report.test.tsx src/components/analytics/__tests__/teamflow-detail.test.tsx --maxWorkers=2` |
| **Full suite command** | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/limitup-sync run typecheck && pnpm --filter @gh-radar/limitup-sync exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/teamflow-report.spec.ts e2e/specs/sidebar-tree.spec.ts e2e/specs/limitup-report.spec.ts --workers=1` + pgTAP 3파일(`limitup_load` · `teamflow_report` · `limitup_report`) |
| **Estimated runtime** | 단위 ~120초 · E2E ~180초 · pgTAP 파일당 ~60초(전 마이그레이션 재생) |

주의: server · webapp 의 `test` 스크립트는 watch / passWithNoTests 라 쓰지 않는다 — 반드시 `exec vitest run <파일>`. 동시 세션(Phase 32 실행 중)이 있으므로 vitest `--maxWorkers=2` · playwright `--workers=1` · 전체 회귀는 한 세션만(Mac 메모리 고갈 10-10). Playwright webServer 타임아웃이면 `rm -rf webapp/.next`. pgTAP 러너 exit 3 = 이미지 없음 = **미실행**(통과 아님).

---

## Sampling Rate

- **After every task commit:** 해당 패키지 quick 명령(위 표 · 각 PLAN `<verify>` 의 파일 단위)
- **After every plan wave:** 그 웨이브가 닿은 패키지의 typecheck + vitest 전체 · E2E 가 생긴 웨이브(04 · 07)는 해당 spec · pgTAP 은 SQL 이 바뀐 웨이브(01 → 02 · 07)
- **Before `/gsd-verify-work`:** Full suite green(33-07 Task 2) + pgTAP 3파일 ok 또는 「pgTAP 미실행」 명시(미실행이면 33-08 Task 1 에서 push 전 사용자 명시 승인) → 배포(33-08) → 라이브 스모크 INV-1~8 · UAT(33-09)
- **Max feedback latency:** 120 seconds(단위) · E2E 는 웨이브 끝

---

## Per-Task Verification Map

보안 검사는 이 프로젝트에서 끔(`security_enforcement: false`) — Threat Ref 는 「—」, Secure Behavior 열에는 접근 경로 관련 동작만 적는다.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 33-01-01 | 33-01 | 1 | TEAM-01~04 | — | 라우트는 requireAuth · 게이트는 RPC 안 · 표 정책 0 | integration(트레이서 — 픽스처 sha → 워커 stage → server 라우트 → 웹 RTL · 층 커밋 4개) | 층 검증 C1~C3(33-01 Task 1 verify 앞 3개 — C1 픽스처 sha · 마이그레이션 핵심 문 grep / C2 워커 / C3 server · 각 층 커밋 직전) → C4 전 층: `shasum -a 256 workers/limitup-sync/tests/fixtures/team_flow/20261014/team_flow.ndjson.gz` 확인 후 `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/limitup-sync run typecheck && pnpm --filter @gh-radar/limitup-sync exec vitest run tests/dispatch.test.ts tests/load.test.ts tests/dispatch-dryrun-totals.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run tests/routes/teamflow-report.test.ts tests/routes/limitup-report.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/components/analytics/__tests__/teamflow-report.test.tsx src/components/analytics/__tests__/limitup-report.test.tsx --maxWorkers=2`(정본 = 33-01 Task 1 verify) | ✅ | ✅ green |
| 33-01-02 | 33-01 | 1 | (Wave 0) | — | N/A | env 체크포인트(pgTAP 이미지) | `docker image inspect public.ecr.aws/supabase/postgres:17.6.1.104 --format '{{.Id}}'` | — | ✅ green |
| 33-02-01 | 33-02 | 2 | TEAM-01 | — | 수동 UPDATE 없는 재적재 | unit(D-03 감지 6케이스) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/limitup-sync run typecheck && pnpm --filter @gh-radar/limitup-sync exec vitest run --maxWorkers=2` | ✅ 수정 | ✅ green |
| 33-02-02 | 33-02 | 2 | TEAM-01 · TEAM-02 | — | anon/authenticated 권한 0 · RLS 정책 0 · RPC EXECUTE service_role 만 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/limitup_load.test.sql && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/teamflow_report.test.sql && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/limitup_report.test.sql` | ✅ | ✅ green |
| 33-02-03 | 33-02 | 2 | TEAM-01 | — | N/A | script(syntax · grep) | `bash -n scripts/smoke-limitup-sync.sh && grep -q "inv8_team_flow_rows" scripts/smoke-limitup-sync.sh` | ✅ 수정 | ✅ green |
| 33-03-01 | 33-03 | 3 | TEAM-03 | — | N/A | unit + RTL(KPI · 변환 골든) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/teamflow-report.test.ts src/components/analytics/__tests__/teamflow-report.test.tsx --maxWorkers=2` | ✅ | ✅ green |
| 33-03-02 | 33-03 | 3 | TEAM-03 | — | N/A | unit + RTL(9칸 · 행 완성 · 기하) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/teamflow-report.test.ts src/lib/__tests__/teamflow-chart.test.ts src/components/analytics/__tests__/teamflow-report.test.tsx --maxWorkers=2` | ✅ | ✅ green |
| 33-03-03 | 33-03 | 3 | TEAM-03 | — | N/A | unit(토큰) | `pnpm --filter @gh-radar/webapp exec vitest run src/styles/__tests__/tds-tokens.test.ts --maxWorkers=2` | ✅ 수정 | ✅ green |
| 33-04-01 | 33-04 | 4 | TEAM-02 | — | 메뉴 숨김 ≠ 권한 — 직접 진입은 403 → DmaGate | unit + E2E(사이드바) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/components/layout/__tests__/app-sidebar.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/sidebar-tree.spec.ts --workers=1` | ✅ 수정 | ✅ green |
| 33-04-02 | 33-04 | 4 | TEAM-03 | — | 403 목 → DmaGate | E2E(목록 · 백스톱 T1 · T2 · T3) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/teamflow-report.spec.ts --workers=1` | ✅ | ✅ green |
| 33-05-01 | 33-05 | 5 | TEAM-04 | — | N/A | unit + RTL(구간 차트 기하 · 접근 이름) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/teamflow-chart.test.ts src/components/analytics/__tests__/teamflow-detail.test.tsx --maxWorkers=2` | ✅ | ✅ green |
| 33-05-02 | 33-05 | 5 | TEAM-04 | — | N/A | RTL(토글 · 구간표 · 판정 기준) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/components/analytics/__tests__/teamflow-detail.test.tsx src/components/analytics/__tests__/teamflow-report.test.tsx --maxWorkers=2` | ✅(05-01 생성) | ✅ green |
| 33-05-03 | 33-05 | 5 | TEAM-04 | — | N/A | RTL(거래원) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/components/analytics/__tests__/teamflow-detail.test.tsx src/lib/__tests__/teamflow-chart.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 33-06-01 | 33-06 | 6 | TEAM-04 | — | N/A | unit + RTL(39칸 · key 93 합산 · 10분 기하) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/teamflow-report.test.ts src/lib/__tests__/teamflow-chart.test.ts src/components/analytics/__tests__/teamflow-detail.test.tsx --maxWorkers=2` | ✅ | ✅ green |
| 33-06-02 | 33-06 | 6 | TEAM-04 | — | N/A | RTL(10분 표) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/components/analytics/__tests__/teamflow-detail.test.tsx src/components/analytics/__tests__/teamflow-report.test.tsx --maxWorkers=2` | ✅ | ✅ green |
| 33-07-01 | 33-07 | 7 | TEAM-04 | — | N/A | E2E(상세 · 백스톱 T6 · T8) | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/teamflow-report.spec.ts --workers=1` | ✅(04-02 생성) | ✅ green |
| 33-07-02 | 33-07 | 7 | TEAM-01~04 | — | N/A | 전 워크스페이스 회귀 + pgTAP | Full suite command(위 표) + pgTAP 3파일 | ✅ | ✅ green |
| 33-08-01 | 33-08 | 8 | TEAM-01 · TEAM-02 | — | 원격 스키마 = 정책 0 · REVOKE 3줄 | [BLOCKING] 체크포인트(메인 세션 db push · pgTAP 미실행이면 push 전 사용자 명시 승인) | 메인 세션: pgTAP 상태(ok N 또는 미실행 + 사용자 답 「그대로 원격 적용」) → `supabase migration list --linked`(두 버전 Remote) | — | ✅ green (manual) |
| 33-08-02 | 33-08 | 8 | TEAM-01 · TEAM-02 | — | 무인증 401 | 체크포인트(Job 재배포 · radar-gw 낮 운반 1회 · Job 즉시 실행 · 스모크 · server) | 메인 세션: radar-gw `limitup-pull.sh --allow-daytime` 1회(systemd-run transient 유닛 · 유닛 자원 상한) → `gcloud run jobs execute gh-radar-limitup-sync --region=asia-northeast3 --wait` → `bash scripts/smoke-limitup-sync.sh --date 20261014`(INV-1~8 · INV-8 db == manifest ≥ 1) · `curl` 401 | — | ✅ green (manual) |
| 33-09-01 | 33-09 | 9 | TEAM-01~04 | — | N/A | 체크포인트(push · Vercel · 라이브 UAT) | 메인 세션: `vercel inspect https://trade.jx1.io` · UAT ①~⑨ | — | ✅ green (manual) |
| 33-09-02 | 33-09 | 9 | TEAM-01~04 | — | N/A | 문서(인박스 done · 문구 정합 또는 추적 todo) | 33-09 Task 2 verify(`status: done` · `done_commit` 이 커밋 · WORDING_APPLIED = HEAD 의 REQUIREMENTS · ROADMAP 새 문구 / WORDING_DEFERRED = HEAD 의 `.planning/todos/pending/phase-33-team02-wording.md`) | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `public.ecr.aws/supabase/postgres:17.6.1.104` — pgTAP 러너 이미지(`docker pull` · 사용자 승인 — 33-01 Task 2). 거절 시 「pgTAP 미실행」 을 33-01 · 33-02 · 33-07 SUMMARY 에 명시하고 SQL 검증은 33-08 라이브 스모크(INV-8)로만 남는다 — 이 경우 33-08 Task 1 이 `supabase db push` 전에 사용자 명시 승인을 다시 받는다(조용한 원격 적용 없음)
- [x] `workers/limitup-sync/tests/fixtures/team_flow/20261014/team_flow.ndjson.gz` — 맥 샘플 바이트 복사(sha `f6656ae2…d897`) — 33-01
- [x] `webapp/src/test-fixtures/teamflow-export.ts` — 워커 픽스처 gunzip 로더 — 33-01
- [x] `server/tests/routes/teamflow-report.test.ts` — 8케이스 — 33-01
- [x] `webapp/src/components/analytics/__tests__/teamflow-report.test.tsx` — 상태기계 · 아코디언 RTL — 33-01
- [x] `workers/limitup-sync/tests/helpers/fake-supabase.ts` — `LoadRow.rows` — 33-02
- [x] `supabase/tests/teamflow_report.test.sql` — 보고서 RPC pgTAP — 33-02
- [x] `webapp/src/lib/__tests__/teamflow-report.test.ts` · `teamflow-chart.test.ts` — 변환 · 기하 골든 — 33-03
- [x] `webapp/e2e/fixtures/teamflow-report.ts` · `webapp/e2e/specs/teamflow-report.spec.ts` — 33-04
- [x] `webapp/src/components/analytics/__tests__/teamflow-detail.test.tsx` — 상세 RTL — 33-05

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 원격 스키마 적용 | TEAM-01 · TEAM-02 | 배포는 서브에이전트에서 분류기 차단 · 원격 DB | 33-08 Task 1 — (pgTAP 미실행이면 먼저 사용자 명시 승인 · 답 원문 기록) 메인 세션 `supabase db push --linked --yes` → `supabase migration list --linked` |
| 옛 워커 호환 라이브 확인 | TEAM-01(D-03) | 21:20 실제 Job 실행 | db push 와 워커 재배포 사이에 21:20 이 끼었을 때만 그 Job 실행 Completed 확인(33-08 Task 1-5) · 같은 낮에 이어 하면 해당 없음(33-02 pgTAP ⑤) |
| radar-gw 낮 운반 1회(D-18 보정) | TEAM-01(D-15 · D-18) | radar-gw 운영 호스트 · 메인 세션만 | 33-08 Task 2-4 — `limitup-pull.sh --allow-daytime` 을 systemd-run transient 유닛(User limitpull · EnvironmentFile /etc/limitup-pull.env · Nice 19 · IO idle · MemoryMax 300M)으로 1회 · 요약 줄 `rsync=ok upload=ok` · `gs://gh-radar-limitup-export/export/20261014/team_flow.ndjson.gz` 존재 · 20:55~21:25 KST 밖 |
| 실 export 적재 · 자동 재적재 | TEAM-01(D-03 · D-15) | 실 GCS export · Cloud Run Job | 33-08 Task 2-5 · 6 — 운반 직후 `gcloud run jobs execute gh-radar-limitup-sync --wait` · 로그 날짜별 reason(files_sig · new 또는 team_flow_backfill) → `smoke-limitup-sync.sh --date 20261014` INV-8(db == manifest ≥ 1) |
| 라이브 server 라우트 | TEAM-02 | Cloud Run 배포 | 33-08 Task 2 — 무인증 `GET /api/teamflow/report` 401 |
| 프로덕션 화면 · 실측 4종목 | TEAM-03 · TEAM-04 · SC 5 | 실데이터 · 실계정 · 실회선 | 33-09 Task 1 ①~⑦ — 에스엠벡셀 · 한선엔지니어링 · 동양고속 · 천일고속 · 폰 390 · 다크 |
| 첫 로드 시간(응답 ≈ 487KB) | TEAM-02(Pitfall 6) | E2E 는 목이라 못 잰다 | 33-09 Task 1 ⑧ — 초 단위 기록 · **미기록**(사용자 UAT 답 「전부 통과」 에 수치 없음) |
| 「상한가 도달」 의미 확인(Open Q2) | TEAM-03 | 사용자 판단 | 33-09 Task 1 ⑨ — 답 원문 기록(변경은 별도 quick) |
| gh-trade 알림 | SC 5(D-17 보조) | 세션 간 메시지 | 메인 세션 ListAgents → gh-trade-e0 SendMessage(노트 경로 · 차이 5건) |

---

## UI Considerations 추적(33-UI-SPEC.md 83행 — 조용한 누락 없음)

| 표면 | ✅ covered → must_haves.truths | 🧪 backstop → `{ statement, verification: backstop }` | ⛔ dismissed(UI-SPEC 사유 · 플랜 조치 없음) |
|---|---|---|---|
| T1 페이지 셸 | empty · loading · error · partial · zero-one-many · long-text → 33-01 / populated → 33-03 | overflow → 33-04 | — |
| T2 KPI | populated · partial · zero-one-many → 33-03 | overflow → 33-04 | empty · loading · error |
| T3 목록 | populated · partial · overflow · zero-one-many → 33-03 | long-text → 33-04 | empty · loading · error |
| T4 미니막대 | empty · populated · partial · overflow · zero-one-many → 33-03 | — | loading · error · long-text |
| T5 요약 | empty · error · populated · partial · overflow · zero-one-many · long-text → 33-01 | — | loading |
| T6 구간 차트 | empty · loading · populated · partial · zero-one-many · long-text → 33-05 | overflow → 33-07 | error |
| T7 거래원 | empty · populated · partial · overflow · zero-one-many · long-text → 33-05 | — | loading · error |
| T8 10분 차트 | empty · loading · populated · partial · zero-one-many · long-text → 33-06 | overflow → 33-07 | error |
| T9 판정 기준 | populated · overflow · long-text → 33-05 | — | empty · loading · error · partial · zero-one-many |
| T10 사이드바 | overflow · long-text → 33-04 | — | loading · error |
| T11 변환 | loading · error · populated · partial · overflow · zero-one-many · long-text → 33-03 / empty → 33-06 | — | — |

합계: covered 57(01: 13 · 03: 20 · 04: 2 · 05: 15 · 06: 7) · backstop 5(04: 3 · 07: 2) · dismissed 21 = 83.

## Spec-less 경계 · 금지 추적

- **Edge(fallback · 4행 전부 unclassified → 플래너 가정):** TEAM-01 → 33-02 「Flagged assumptions」 · TEAM-02 → 33-01 · TEAM-03 → 33-03 · TEAM-04 → 33-05(members) + 33-06(window · buckets · 범위 밖 key).
- **Prohibitions(descriptor-less · judgment):** 표 접근 경로 = RPC 뿐(01) · 수동 프로덕션 데이터 조작 금지(02 · 08) · pgTAP 미실행 명시(02) · 최소치 캡션 숨김 금지(03) · 메뉴 숨김 ≠ 권한(04) · 실패 백스톱/회귀 통과 처리 금지(07) · 20:55~21:25 배포 · 운반 · Job 실행 금지 · 낮 운반 1회 · 유닛 자원 상한 · 서브에이전트 배포 · 운반 금지 · pgTAP 미실행 SQL 의 무승인 push 금지(08) · push 순서(09) · 인박스 조기 done 금지(09) · executor push/일괄 add 금지(01~07). 정본 보안 항목(summary_lines HTML → XSS)은 canon 이라 금지로 만들지 않고 33-01 truth(summaryPartsOf 조각 배열 · HTML 주입 경로 없음)로 덮는다.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies(배포 체크포인트 5개는 Manual-Only 표)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags(`exec vitest run` · `--workers=1`)
- [x] Feedback latency < 120s(단위)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-10-16 — 갭 0 · 자동 17 task green(워커 108 · server 29 · webapp 261 재실행 + 33-07 E2E 25 · pgTAP 218/28/54) · 배포/UAT 3 task 는 수동 증거(33-08 INV-8 db=34 manifest=34 · 401 · 33-09 UAT 「전부 통과」) · UAT ⑧ 첫 로드 시간 미기록

## Validation Audit 2026-10-16

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
