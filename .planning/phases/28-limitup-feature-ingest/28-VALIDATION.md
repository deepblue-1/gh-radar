---
phase: "28"
slug: "limitup-feature-ingest"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-05"
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> 근거: `28-RESEARCH.md` 「Validation Architecture」(표면별 quick 명령 · D → 테스트 맵 · Wave 0 갭). 플래너가 Per-Task Verification Map 을 플랜 task 단위로 채운다.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (relay · shared · webapp jsdom · server node · workers) + Playwright 1.59 (webapp e2e — 로컬 relay + 스텁 게이트웨이) + bash `--self-test` (radar-gw 스크립트 순수 함수) |
| **Config file** | `relay/vitest.config.ts` · `webapp/vitest.config.ts` · `server/vitest.config.ts` · `workers/limitup-sync/vitest.config.ts` (Wave 0 — `workers/limit-up-sync` 복제) · `webapp/playwright.config.ts` |
| **Quick run command** | 표면별 — shared: `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/strategy-event-text.test.ts src/__tests__/limit-feature.test.ts src/__tests__/member-codes.test.ts && pnpm --filter @gh-radar/shared build` · relay: `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/relay exec vitest run src/dma/__tests__/codec.test.ts src/dma/__tests__/envelope.test.ts tests/hub.test.ts tests/fanout.test.ts tests/quote-feed.test.ts tests/journal-push.test.ts` · webapp: `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/relay-socket.test.ts src/lib/__tests__/order-log-feed.test.ts src/components/trading/card/__tests__ src/components/trading/order-log/__tests__ src/components/analytics/__tests__` · server: `pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run tests/routes/strategy-events.test.ts tests/routes/limitup-report.test.ts` · worker: `pnpm --filter @gh-radar/limitup-sync run typecheck && pnpm --filter @gh-radar/limitup-sync run test` · radar-gw: `bash infra/relay/limitup-pull/limitup-pull.sh --self-test` |
| **Full suite command** | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run test && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run && pnpm --filter @gh-radar/limitup-sync run typecheck && pnpm --filter @gh-radar/limitup-sync run test` |
| **Estimated runtime** | quick ~30–90초 / full ~5분 (e2e 별도 ~5분, `.next` 캐시 타임아웃이면 `rm -rf webapp/.next`) |

---

## Sampling Rate

- **After every task commit:** Run 해당 표면 quick 명령 (위 표)
- **After every plan wave:** Run full suite command + e2e `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/order-log.spec.ts e2e/specs/sidebar-tree.spec.ts e2e/specs/limitup-report.spec.ts`
- **Before `/gsd-verify-work`:** Full suite + e2e 4 spec + 워커 로컬 실데이터 dry-run(`LIMITUP_EXPORT_DIR=~/ticks/research/export` 4일 행 수 == manifest: entries 99 · locks 39 · jumps 40,626 · member_alloc 253,247 · facts 542 · touches 216) must be green
- **Max feedback latency:** 90 seconds (quick)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 28-01-T1 | 01 | 1 | D-01 · D-05 · D-23 | — | 공개 시세 경로 타입 제약(사용자 데이터 불가) · full 소켓만 | unit · integration | relay typecheck + `vitest run codec · envelope · hub · fanout -t "Phase 28"` + relay 전체 | ✅ (헬퍼 `buildLimitFeatureFrame` W0) | ⬜ pending |
| 28-01-T2 | 01 | 1 | D-02 · D-03 · D-04 · D-05 | — | — | unit(골든) · component | shared `limit-feature.test.ts` + webapp `relay-socket` · `card-tabs` | ❌ W0 `limit-feature.test.ts` | ⬜ pending |
| 28-01-T3 | 01 | 1 | D-01 · D-02 · D-04 | — | — | e2e | `playwright trading-workbench -g "P28-1"` | ✅ (픽스처 `pushLimitFeatureFixture` W0) | ⬜ pending |
| 28-02-T1 | 02 | 1 | D-06 · D-08 · D-18 | — | RPC service_role 전용 · `p_user_id = req.userId` | pgTAP · integration | `verify-dma-orders-price-check.sh --test dma_strategy_limit_feature` · `dma_strategy_read` + server `strategy-events.test.ts` | ❌ W0 pgTAP | ⬜ pending |
| 28-02-T2 | 02 | 1 | D-06 | — | — | unit · integration | shared `strategy-event-text` · `strategy-event-labels` + relay `journal-push.test.ts` | ✅ | ⬜ pending |
| 28-03-T1 | 03 | 1 | D-14 · D-15 · D-17 | — | 표 RLS + 정책 0 · RPC 잠금 | pgTAP · unit · dry-run | `--test limitup_load` + `limitup-sync vitest` + 실 export dry-run(합계 = 인박스) | ❌ W0 워커 전체 · 픽스처 | ⬜ pending |
| 28-04-T1 | 04 | 1 | D-13 · D-16 | — | GCS 삭제 동기화 금지 | bash self-test | `limitup-pull.sh --self-test` + 유닛 줄 grep | ❌ W0 | ⬜ pending |
| 28-04-T2 | 04 | 1 | D-13 · D-21 | — | 호스트키 지문 대조 · 키는 없을 때만 | static | `bash -n install.sh` + grep(`-C radar-gw-pull` · 문서) | ❌ W0 | ⬜ pending |
| 28-05-T1 | 05 | 2 | D-23 | — | price 소켓 85 0 | integration | relay `fanout · hub -t "Phase 28"` + relay 전체 | ✅ | ⬜ pending |
| 28-05-T2 | 05 | 2 | D-05 · D-23 | — | — | unit · e2e | webapp `relay-socket` · `strategy-card` + `playwright -g "P28-1"`(P28-1b) | ✅ | ⬜ pending |
| 28-06-T1 | 06 | 3 | D-17 | — | — | unit(골든) | `limitup-sync vitest derive.test.ts` + 골든 JSON 존재 | ❌ W0 `make-golden.py` | ⬜ pending |
| 28-06-T2 | 06 | 3 | D-08 · D-14 · D-16 · D-19 | — | 버킷 비공개 · 정리 RPC 잠금 | pgTAP · unit · dry-run | `--test limitup_load` + `limitup-sync vitest` + dry-run(grid_summary 99) | ❌ W0 | ⬜ pending |
| 28-07-T1 | 07 | 3 | D-03 | — | — | unit | shared `member-codes.test.ts` + 키 목록 대조 | ❌ W0 | ⬜ pending |
| 28-07-T2 | 07 | 3 | D-03 · D-04 | — | — | unit(골든) | shared `limit-feature.test.ts` · `member-codes.test.ts` | ✅(28-01) | ⬜ pending |
| 28-07-T3 | 07 | 3 | D-02 · D-03 · D-04 · D-05 | — | — | component · e2e | webapp `limit-feature-table` · `card-tabs` · `trading-alerts` + `playwright -g "P28-"` | ❌ W0 `limit-feature-table.test.tsx` | ⬜ pending |
| 28-08-T1 | 08 | 4 | D-14 · D-20 | — | Secret 은 Secret Manager 참조 · 비root 이미지 | static · build | `bash -n` + grep(볼륨 · cron · 이름 함정) + `docker build --platform linux/amd64` | ❌ W0 | ⬜ pending |
| 28-08-T2 | 08 | 4 | D-13 · D-16 | — | 버킷 단위 최소 권한 · 공개 접근 방지 | static | `bash -n` + grep(objectUser · objectViewer · PAP · manifest 대조) | ❌ W0 | ⬜ pending |
| 28-09-T1 | 09 | 4 | D-07 | — | message 파서 total(지어내지 않음) | unit(골든) | shared `limit-feature.test.ts` | ✅ | ⬜ pending |
| 28-09-T2 | 09 | 4 | D-06 · D-07 | — | — | unit · component | shared `strategy-event-text` + webapp `order-log-list` + 전체 | ✅ | ⬜ pending |
| 28-10-T1 | 10 | 4 | D-10 · D-11 · D-17 | — | DMA 게이트 RPC · service_role 전용 | pgTAP | `--test limitup_report` | ❌ W0 | ⬜ pending |
| 28-10-T2 | 10 | 4 | D-10 · D-15 | — | requireAuth · `p_user_id = req.userId` · 403 DMA_UNMAPPED · 서명 URL 600초 | integration | server `limitup-report.test.ts` + server 전체 | ❌ W0 | ⬜ pending |
| 28-11-T1 | 11 | 5 | D-18 | — | — | unit | webapp `relay-socket` · `use-order-log-feed` · `order-log-feed` | ✅ | ⬜ pending |
| 28-11-T2 | 11 | 5 | D-07 | — | — | component | webapp `order-log/__tests__` + 전체 | ✅ | ⬜ pending |
| 28-11-T3 | 11 | 5 | D-07 · D-18 | — | — | e2e | `playwright order-log -g "P28-O1"` + order-log 전체 | ✅ | ⬜ pending |
| 28-12-T1 | 12 | 5 | D-11 | — | — | unit | webapp `limitup-report.test.ts` | ❌ W0 | ⬜ pending |
| 28-12-T2 | 12 | 5 | D-10 · D-11 · D-12 | — | 웹 게이트는 표시 장치(권한은 server) | component | webapp `components/analytics/__tests__` | ❌ W0 | ⬜ pending |
| 28-12-T3 | 12 | 5 | D-09 · D-10 | — | — | component · e2e | webapp `app-sidebar.test.tsx` + `playwright sidebar-tree` | ✅ | ⬜ pending |
| 28-13-T1 | 13 | 6 | D-11 | — | — | unit | webapp `limitup-lanes` · `use-limitup-grid` | ❌ W0 | ⬜ pending |
| 28-13-T2 | 13 | 6 | D-11 · D-12 | — | — | component(색 감사) | webapp `components/analytics/__tests__` + grep(글자 요소 · 차트 라이브러리 0) | ❌ W0 | ⬜ pending |
| 28-13-T3 | 13 | 6 | D-09~D-12 | — | — | e2e | `playwright limitup-report · sidebar-tree` | ❌ W0 `limitup-report.spec.ts` | ⬜ pending |
| 28-14-T1 | 14 | 7 | D-22 | — | — | 전체 게이트 | full suite + pgTAP 4 + e2e 6 spec + dry-run | ✅ | ⬜ pending |
| 28-14-T2 | 14 | 7 | D-06 · D-15 · D-22 | — | anon EXECUTE 거부 smoke | manual [BLOCKING] | `supabase db push` + RPC smoke a~e | — | ⬜ pending |
| 28-14-T3 | 14 | 7 | D-13 · D-14 · D-21 | — | 비밀 비출력 | manual | setup-iam → deploy → seed → `smoke-limitup-sync.sh` → radar-gw install | — | ⬜ pending |
| 28-15-T1 | 15 | 8 | D-21 | — | 공개키만(개인키 호스트 밖 금지) | static | grep 등록 줄 + HEAD 파일 = 노트 1개 | ✅ | ⬜ pending |
| 28-15-T2 | 15 | 8 | D-13 · D-22 | — | — | manual | (119 등록 확인됨이면 timer 먼저 — D-22) → relay → smoke → server → smoke → push → Vercel → (아니면 등록 확인 즉시 timer) | — | ⬜ pending |
| 28-15-T3 | 15 | 8 | D-22 | — | — | static | frontmatter done/open 판정 + 경로 지정 커밋 | ✅ | ⬜ pending |
| 28-16-T1 | 16 | 2 | D-14 · D-20 | — | — | unit | `limitup-sync vitest dispatch · load · manifest` | ❌ W0 `dispatch.test.ts` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/shared/src/__tests__/limit-feature.test.ts` · `member-codes.test.ts` — 9칸 문구 · .NET 동형 숫자 골든
- [ ] `relay/tests/helpers/frames.ts` — `buildLimitFeatureFrame`(32필드 · 벡터) · fake-gateway quote 관찰자 경로 85 송신
- [ ] `webapp/e2e/fixtures/relay.ts` — `pushLimitFeatureFixture`
- [ ] `workers/limitup-sync/` 전체 + `tests/fixtures/` (실 export 1일 축소본: 종목 2~3개 · 잠김 깨짐/유지 각 1)
- [ ] `server/tests/routes/limitup-report.test.ts`
- [ ] `webapp/src/components/analytics/__tests__/` · `webapp/e2e/specs/limitup-report.spec.ts`
- [ ] `infra/relay/limitup-pull/limitup-pull.sh --self-test`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Supabase 마이그레이션 적용 | D-06 · D-08 · D-15 | 원격 DB push 는 사용자 체크포인트([BLOCKING]) | `supabase db push` → `supabase inspect db table-stats --linked` · RPC 1회 호출 smoke |
| GCS 버킷 · IAM · Cloud Run Job · Scheduler | D-13 · D-14 | GCP 리소스 생성은 메인 세션/사용자 | `bash scripts/setup-limitup-sync-iam.sh` → `bash scripts/deploy-limitup-sync.sh` → `bash scripts/smoke-limitup-sync.sh`(행 수 == manifest) |
| radar-gw 키 생성 · 119 등록 · 타이머 활성 | D-13 | 비밀 생성은 사용자 `!` 실행, 119 등록은 gh-trade 사용자 | 공개키 인박스 추기 → `rsync --dry-run` 이 날짜 디렉터리 목록을 보임 → timer enable |
| relay · server 배포 · webapp push | 배포 순서 | 배포는 메인 세션 | `bash scripts/smoke-relay.sh` FAIL 0 · `bash scripts/smoke-server.sh` · push 뒤 Vercel 반영 확인 |
| 장중 85 실수신 · kind 15 적재 | A · B | gh-trade 서버 Phase 27 배포 뒤에만 관측 가능 | FULL 구독 카드 탭 「상한가」 1초 갱신 · `dma_strategy_events` kind 15 분당 행 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags (shared `test` 는 watch — `exec vitest run` 사용)
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
