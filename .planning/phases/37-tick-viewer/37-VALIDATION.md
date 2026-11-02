---
phase: "37"
slug: "tick-viewer"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: true
wave_0_complete: false
created: "2026-11-02"
---

# Phase 37 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest — shared ^4.1.4 · server ^4.1.4 · workers(tick-convert) · tickgw ^3 · webapp ^2.1.9(jsdom) · Playwright ^1.59.1 · pgTAP(러너 `scripts/verify-dma-orders-price-check.sh --test`) |
| **Config file** | `packages/shared/vitest.config.ts`(maxWorkers 2) · `server/vitest.config.ts` · `workers/tick-convert/vitest.config.ts`(37-06 신규 · passWithNoTests false) · `tickgw/vitest.config.ts`(37-09 신규) · `webapp/vitest.config.ts` · `webapp/playwright.config.ts`(포트 3100) |
| **Quick run command** | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/ticks-decode.golden.test.ts src/__tests__/ticks-orders-krx.golden.test.ts src/__tests__/ticks-pnl.golden.test.ts --maxWorkers=2` |
| **Full suite command** | 37-16-PLAN.md Task 1 verify 두 명령(shared · tick-convert · tickgw · server · webapp vitest + e2e ticks-viewer · sidebar-tree · accum-report · teamflow-report · limitup-report + pgTAP tick_viewer · teamflow_report) |
| **Estimated runtime** | 태스크 단위 ~5~60초(shared 골든 1초대) · e2e 태스크 ~2~4분 · 전체 회귀 ~10분 |

---

## Sampling Rate

- **After every task commit:** 그 태스크 `<verify><automated>` 명령(아래 표 — 파일 단위 `exec vitest run <파일>` · server · webapp `test` 스크립트는 watch/passWithNoTests 라 쓰지 않는다)
- **After every plan wave:** 그 웨이브가 건드린 패키지 전체 `exec vitest run --maxWorkers=2` · 전체 회귀는 한 세션만(동시 세션 메모리 규칙)
- **Before `/gsd-verify-work`:** 37-16 Task 1 전체 회귀 green + pgTAP ok(또는 「pgTAP 미실행」 명시 + 사용자 승인) → 배포(D-22) → 라이브 UAT
- **Max feedback latency:** 60초(vitest 태스크) · e2e 태스크 240초

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 37-01-01 | 01 | 1 | D-01 · D-05 · D-21 · D-22 | — | N/A | doc(grep) | 인계 노트 존재 · 계약 키워드 · 미기입 0(`grep` 체인 — 37-01 Task 1) | ❌ 노트 신규 | ⬜ pending |
| 37-01-02 | 01 | 1 | A1(D-04 저장처) | — | N/A | checkpoint:decision | `test -f .planning/phases/37-tick-viewer/37-01-PLAN.md` + 사용자 답 | ✅ | ⬜ pending |
| 37-01-03 | 01 | 1 | A8 | T-37-SC | 패키지 legitimacy 사람 확인 | checkpoint(blocking-human) | `npm view fzstd@0.1.1 repository.url` | ✅ | ⬜ pending |
| 37-02-01 | 02 | 1 | D-19 | — | N/A | unit(골든 · tracer) | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/ticks-framing.test.ts src/__tests__/ticks-decode.golden.test.ts --maxWorkers=2` | ❌ 태스크가 생성 | ⬜ pending |
| 37-02-02 | 02 | 1 | D-19 | — | N/A | unit(골든) | `… vitest run src/__tests__/ticks-layouts.test.ts src/__tests__/ticks-route.test.ts src/__tests__/ticks-decode.golden.test.ts` | ❌ 태스크가 생성 | ⬜ pending |
| 37-03-01 | 03 | 2 | D-20 | — | N/A | unit(골든 · tracer) | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/ticks-orders-krx.golden.test.ts --maxWorkers=2` | ❌ | ⬜ pending |
| 37-03-02 | 03 | 2 | D-13 · D-20 | — | N/A | unit(골든) | `… vitest run src/__tests__/ticks-orders-nxt.golden.test.ts` | ❌ | ⬜ pending |
| 37-03-03 | 03 | 2 | D-10 · D-12 · D-20 | — | N/A | unit(골든) | `… vitest run src/__tests__/ticks-pnl.golden.test.ts` | ❌ | ⬜ pending |
| 37-04-01 | 04 | 2 | D-08 · D-09 · D-04 | — | RPC 게이트 · 표 정책 0 · EXECUTE service_role 만 | pgTAP(tracer) | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_viewer.test.sql` | ❌ | ⬜ pending |
| 37-04-02 | 04 | 2 | D-02 · D-03 · D-04 · D-15 | — | should_trigger 원자성 · 취소 본인만 | pgTAP | 같은 명령 + REVOKE 정적 grep | ❌ | ⬜ pending |
| 37-05-01 | 05 | 3 | D-00 | — | N/A | unit(tracer) | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/ticks-record-index.test.ts src/__tests__/ticks-book.test.ts --maxWorkers=2` | ❌ | ⬜ pending |
| 37-05-02 | 05 | 3 | D-11 · D-18 · D-00 | — | N/A | unit | `… vitest run src/__tests__/ticks-time.test.ts src/__tests__/ticks-density.test.ts src/__tests__/ticks-members.test.ts` | ❌ | ⬜ pending |
| 37-06-01 | 06 | 3 | D-03 · D-19 | — | N/A | unit(tracer · 합성 아카이브) | `pnpm --filter @gh-radar/tick-convert exec vitest run tests/request.test.ts tests/config.test.ts --maxWorkers=2` | ❌ | ⬜ pending |
| 37-06-02 | 06 | 3 | D-02 · D-04 | — | N/A | unit | `pnpm --filter @gh-radar/tick-convert exec vitest run --maxWorkers=2` | ❌ | ⬜ pending |
| 37-06-03 | 06 | 3 | D-21 ⑤ · D-22 | — | 버킷 단위 IAM · 프로젝트 IAM 무변경 | static(bash -n + grep) | `bash -n scripts/{setup-tick-convert-iam,deploy-tick-convert,smoke-tick-convert}.sh` + grep | ❌ | ⬜ pending |
| 37-07-01 | 07 | 3 | D-08 · D-09 · D-15 | — | requireAuth · 403 DMA_UNMAPPED · object_path 비노출 | integration(supertest · tracer) | `pnpm --filter @gh-radar/server exec vitest run tests/routes/ticks.test.ts --maxWorkers=2` | ❌ | ⬜ pending |
| 37-07-02 | 07 | 3 | D-03 | — | should_trigger 일 때만 Admin API · 토큰 로그 금지 | integration + unit | `… vitest run tests/routes/ticks.test.ts tests/services/tick-convert-trigger.test.ts` + `bash -n scripts/deploy-server.sh` | ❌ | ⬜ pending |
| 37-08-01 | 08 | 4 | D-16 · D-18 · D-08 | — | DmaGate 표시 | RTL(tracer) | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/ticks/__tests__/tick-url.test.ts src/lib/ticks/__tests__/tick-format.test.ts src/components/ticks/__tests__/tick-entry.test.tsx --maxWorkers=2` | ❌ | ⬜ pending |
| 37-08-02 | 08 | 4 | D-03 · D-15 · D-16 | — | N/A | RTL | `… vitest run src/components/ticks/__tests__/tick-stock-picker.test.tsx src/components/ticks/__tests__/tick-state-card.test.tsx` | ❌ | ⬜ pending |
| 37-08-03 | 08 | 4 | D-14 · D-08 | — | N/A | RTL + e2e | `… vitest run src/components/layout/__tests__/app-sidebar.test.tsx` + `… playwright test e2e/specs/ticks-viewer.spec.ts e2e/specs/sidebar-tree.spec.ts --workers=1` | ✅ sidebar · ❌ ticks spec | ⬜ pending |
| 37-09-01 | 09 | 4 | D-05 · D-07 | — | 공유 비밀 timingSafeEqual | unit(tracer · 가짜 119) | `pnpm --filter @gh-radar/tickgw exec vitest run tests/indexer.test.ts tests/server.test.ts --maxWorkers=2` | ❌ | ⬜ pending |
| 37-09-02 | 09 | 4 | D-06 · D-07 | — | N/A | unit(가짜 시계) | `pnpm --filter @gh-radar/tickgw exec vitest run --maxWorkers=2` | ❌ | ⬜ pending |
| 37-09-03 | 09 | 4 | D-22 | — | 공개키 본문 미출력 · tmpfs env-file | static(bash -n + grep) | `bash -n infra/relay/tickpull/install.sh scripts/setup-tickgw-iam.sh scripts/deploy-tickgw.sh` + grep | ❌ | ⬜ pending |
| 37-10-01 | 10 | 5 | D-00 · D-18 | T-37-SC | 정확 버전 고정 설치 | RTL(tracer) | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/ticks/__tests__/tick-session.test.ts src/lib/ticks/__tests__/use-tick-grid.test.tsx --maxWorkers=2` | ❌ | ⬜ pending |
| 37-10-02 | 10 | 5 | D-00 | — | N/A | RTL | `… vitest run src/lib/ticks/__tests__/use-tick-cursor.test.tsx src/components/ticks/__tests__/tick-slider.test.tsx src/components/ticks/__tests__/tick-book.test.tsx` | ❌ | ⬜ pending |
| 37-10-03 | 10 | 5 | D-18 | — | N/A | e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/ticks-viewer.spec.ts --workers=1` | ❌ | ⬜ pending |
| 37-11-01 | 11 | 5 | D-17 | — | RPC REVOKE 재진술 | pgTAP + RTL(tracer) | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/teamflow_report.test.sql` + `… vitest run src/lib/ticks/__tests__/tick-link.test.ts src/components/analytics/__tests__/teamflow-detail.test.tsx` | ✅ pgTAP · ❌ tick-link | ⬜ pending |
| 37-11-02 | 11 | 5 | D-17 | — | N/A | RTL | `… vitest run src/components/analytics/__tests__/accum-detail.test.tsx src/components/analytics/__tests__/limitup-event-card.test.tsx` | ✅ | ⬜ pending |
| 37-12-01 | 12 | 5 | D-07 · D-04 | — | 사설 대역 가드 · 비밀 헤더 | unit(tracer · 가짜 tickgw) | `pnpm --filter @gh-radar/tick-convert exec vitest run tests/promote.test.ts --maxWorkers=2` | ❌ | ⬜ pending |
| 37-12-02 | 12 | 5 | D-22 | — | N/A | static | `bash -n scripts/deploy-tick-convert.sh` + grep | ✅ | ⬜ pending |
| 37-13-01 | 13 | 6 | D-00 · D-20 · D-13 | — | N/A | unit(tracer) | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/ticks/__tests__/msg-rows.test.ts src/lib/ticks/__tests__/use-fixed-window.test.tsx src/lib/ticks/__tests__/tick-session.test.ts --maxWorkers=2` | ❌ | ⬜ pending |
| 37-13-02 | 13 | 6 | D-00 · D-19 | — | N/A | unit + RTL | `… vitest run src/lib/ticks/__tests__/msg-rows.test.ts src/components/ticks/__tests__/tick-msg-list.test.tsx` | ❌ | ⬜ pending |
| 37-13-03 | 13 | 6 | D-00 | — | N/A | RTL + e2e | `… vitest run src/components/ticks/__tests__/tick-order-card.test.tsx src/components/ticks/__tests__/tick-amount-card.test.tsx` + playwright ticks-viewer | ❌ | ⬜ pending |
| 37-14-01 | 14 | 7 | D-00 | — | N/A | unit(tracer) + accum 회귀 | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/accum-chart.test.ts src/hooks/__tests__/use-chart-view.test.tsx src/lib/ticks/__tests__/tick-chart.test.ts --maxWorkers=2` | ✅ accum · ❌ tick-chart | ⬜ pending |
| 37-14-02 | 14 | 7 | D-09 · D-10 · D-13 | — | N/A | unit(골든) + RTL | `… vitest run src/lib/ticks/__tests__/team-model.test.ts src/lib/ticks/__tests__/tick-chart.test.ts src/components/ticks/__tests__/tick-chart.test.tsx` | ❌ | ⬜ pending |
| 37-14-03 | 14 | 7 | D-10 · D-11 · D-12 | — | N/A | RTL + e2e | `… vitest run src/components/ticks/__tests__/tick-team-panel.test.tsx …` + playwright ticks-viewer · accum-report | ❌ | ⬜ pending |
| 37-15-01 | 15 | 8 | D-05 · D-07 · D-08 | — | 게이트 캐시 · 사설 대역 가드 · CORS exposedHeaders | integration(tracer) | `pnpm --filter @gh-radar/server exec vitest run tests/routes/ticks-live.test.ts tests/services/tickgw-client.test.ts tests/services/cors-config.test.ts tests/routes/ticks.test.ts --maxWorkers=2` + webapp use-tick-live | ❌ | ⬜ pending |
| 37-15-02 | 15 | 8 | D-06 | — | N/A | RTL(가짜 시계) | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/ticks/__tests__/use-tick-live.test.tsx src/components/ticks/__tests__/tick-viewer-live.test.tsx --maxWorkers=2` | ❌ | ⬜ pending |
| 37-15-03 | 15 | 8 | D-22 | — | 조건부 비밀 바인딩 | static + e2e | `bash -n scripts/deploy-server.sh` + playwright ticks-viewer | ✅ | ⬜ pending |
| 37-16-01 | 16 | 9 | 전체 | — | N/A | 전체 회귀 + pgTAP | 37-16 Task 1 verify 두 명령 | ✅ | ⬜ pending |
| 37-16-02 | 16 | 9 | D-22 · D-02 · D-03 | — | 배포 순서 · 접두사 규칙 | checkpoint(human-action) + CLI | `supabase migration list --linked` · `git rev-parse master = origin/master` | ✅ | ⬜ pending |
| 37-16-03 | 16 | 9 | SC 1 · 3 · 4 | — | DMA 게이트 실서비스 | checkpoint(UAT) | `supabase migration list --linked` + 사용자 답 | ✅ | ⬜ pending |
| 37-17-01 | 17 | 10 | D-21 · D-22 | — | N/A | checkpoint(blocking-human) | `ls docs/inbox/from-gh-trade/*.md` + 사용자 답 | ✅ | ⬜ pending |
| 37-17-02 | 17 | 10 | D-21 ② | — | N/A | unit | `pnpm --filter @gh-radar/tickgw exec vitest run --maxWorkers=2` | ✅ | ⬜ pending |
| 37-17-03 | 17 | 10 | SC 2 · D-05~D-07 | — | radar-gw 공유 호스트 규칙 · 비밀 사용자 `!` | checkpoint(human-action) | `grep -L "status: open" docs/inbox/from-gh-trade/*.md` + 실측 · UAT 답 | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

별도 Wave 0 플랜은 두지 않는다 — 각 트레이서 태스크가 자기 시험 · 픽스처를 먼저 만든다(`MISSING` 센티널 0). 아래는 그 태스크들이 만드는 시험 기반이다.

- [ ] `scripts/tick-oracle/{gen-fixtures.sh,oracle.py}` — 오라클 생성기(맥 전용 · gh-trade venv `-I`) · 37-02 Task 1 · 37-03 · 37-05 가 부명령을 더한다
- [ ] `packages/shared/src/__fixtures__/ticks/` — `layouts.json` · `cut1300-{krx,nxt}.{ticks.zst,decode.json}` · `raw20k-0900.*`(37-02) · `cut1300-krx.orders.json` · `cut1300-runs.json` · `cut1300-nxt.window.json` · `chunil-1014-a3.ticks.zst` · `chunil-1014.pnl.json` · (선택) `bigtech-1022.*`(37-03) — 생성물만 커밋 · 원본 pcap 커밋 금지
- [ ] `packages/shared/src/__tests__/helpers/tick-digest.ts` — 열 digest 정규화(파이썬과 같은 canon 규칙) · 37-02
- [ ] `workers/tick-convert/vitest.config.ts` · `tests/helpers/{synth-archive,fake-supabase,fake-tickgw}.ts` — 37-06 · 37-12
- [ ] `tickgw/vitest.config.ts` · `tests/fixtures/fake-indexer.mjs` — 37-09
- [ ] `supabase/tests/tick_viewer.test.sql` — 37-04(Docker 데몬 필요 · 없으면 「pgTAP 미실행」)
- [ ] `webapp/e2e/fixtures/ticks.ts` · `webapp/e2e/specs/ticks-viewer.spec.ts` — 37-08 이 만들고 37-10 · 37-13 · 37-14 · 37-15 가 절을 더한다
- [ ] 사람 게이트 — 37-01 Task 2(Supabase 플랜 A1) · Task 3(fzstd A8) — 뒤 플랜 precondition

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Supabase 플랜(Pro/Free) → 격자 저장처 | A1 · D-04 | 대시보드 Billing — CLI 토큰 없음 | 37-01 Task 2 결정 체크포인트 |
| fzstd 0.1.1 legitimacy | A8 · T-37-SC | 패키지 이름 출처가 학습 지식 — 사람 확인 규칙 | 37-01 Task 3(npmjs · GitHub 작성자 · postinstall) |
| 10/30 선별 종목 변환 시간 · GCS 읽기 비용 · 대상 집합 | SC 3 · D-02 | 실서비스 Cloud Run · Archive 요금 | 37-16 Task 2 ⑤(smoke-tick-convert · tick_grids 집계 · bytes_read × $0.05) |
| 요청 변환 「약 N분」 · Job 1회 합치기 | SC 3 · D-03 | 실서비스 Admin API · 사용자 둘 | 37-16 Task 2 ⑧ |
| 당일 밤 자동 · 90일 purge 로그 | SC 3 · D-04 | Scheduler 실시각 | 37-16 Task 3 H(다음 날 tick_convert_runs) |
| 프로덕션 천일 10/14 팀 KPI = export | SC 4 · D-20 | 실데이터 요청 변환 + 화면 | 37-16 Task 3 C |
| 폰 390 3판 차트 과함 · B6 행 잘림 | SC 1(미결) | 실기기 시각 판단 | 37-16 Task 3 G(사용자 답 원문) |
| gh-trade 회신 · 119 인덱서 배포 | D-21 · D-22 | 외부 저장소 · 외부 배포 | 37-17 Task 1 |
| radar-gw 하루치 조회 실측(크기 · 지연 · 이어받기) | SC 2 · D-05 | 119 · radar-gw 실호스트(20:00 뒤) | 37-17 Task 3 ⑤ |
| 당일 UAT(증분 · 새 틱 배지 · 끝으로 · 호출 키당 1 · 승격) | SC 4 · D-06 · D-07 | 장중 실시세 | 37-17 Task 3 ⑧ |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies(45 태스크 전부 `<automated>` + `<fails_when>` · MISSING 0)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify(체크포인트 태스크도 CLI 확인 명령을 가진다)
- [x] Wave 0 covers all MISSING references(MISSING 없음 — 트레이서가 시험을 만든다)
- [x] No watch-mode flags(`exec vitest run <파일>` 만 · server/webapp `test` 스크립트 미사용)
- [x] Feedback latency < 60s(vitest 태스크) · e2e 태스크 < 240s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending(플랜 체커 · 실행 뒤 `/gsd-validate-phase 37` 이 validated 로 올린다)
