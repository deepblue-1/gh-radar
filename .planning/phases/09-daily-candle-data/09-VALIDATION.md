---
phase: 9
slug: daily-candle-data
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-11
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: `09-RESEARCH.md` §"Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x (workers/candle-sync) + bash smoke (production smoke-candle-sync.sh) |
| **Config file** | `workers/candle-sync/vitest.config.ts` (Wave 0 신설 — master-sync 미러) |
| **Quick run command** | `pnpm --filter @gh-radar/candle-sync test -- --run` |
| **Full suite command** | `pnpm --filter @gh-radar/candle-sync test -- --run && pnpm --filter @gh-radar/candle-sync typecheck && bash scripts/smoke-candle-sync.sh` |
| **Estimated runtime** | unit ~30s · smoke (post-deploy) ~120s · full backfill verify ~10s (DB count only) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @gh-radar/candle-sync test -- --run` (30s 이내, per-task 회귀 감지)
- **After every plan wave:** Run quick + `pnpm -w typecheck` (workspace 전체 typecheck)
- **Before `/gsd-verify-work`:** Full suite + smoke-candle-sync (INV-1~6) green
- **Max feedback latency:** 30 seconds (unit) / 120 seconds (smoke post-deploy)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 9-01-01 | 01 | 0 | DATA-01 SC #1 | — | `stock_daily_ohlcv` 테이블 + PK(code,date) + RLS | migration verify | `node -e "require('fs').readFileSync('supabase/migrations/...','utf8').match(/PRIMARY KEY \(code, date\)/)"` | ❌ W0 | ⬜ pending |
| 9-01-02 | 01 | 0 | DATA-01 SC #1 | T-09-03 | FK 정책 (옵션 A/B/C planner 결정) 정합 | migration verify | grep `REFERENCES stocks(code)` or `NOT VALID` | ❌ W0 | ⬜ pending |
| 9-02-01 | 02 | 0 | DATA-01 (스캐폴드) | — | workers/candle-sync 워크스페이스 등록 | typecheck | `pnpm --filter @gh-radar/candle-sync typecheck` | ❌ W0 | ⬜ pending |
| 9-02-02 | 02 | 0 | DATA-01 (Dockerfile) | — | 멀티스테이지 + GIT_SHA build-arg | docker build | `docker build --build-arg GIT_SHA=test -f workers/candle-sync/Dockerfile .` | ❌ W0 | ⬜ pending |
| 9-03-01 | 03 | 1 | DATA-01 SC #2 | T-09-01 | KRX 401 시 즉시 throw (retry 없음) | unit | `pnpm --filter @gh-radar/candle-sync test krx-401-guard` | ❌ W0 | ⬜ pending |
| 9-03-02 | 03 | 1 | DATA-01 SC #2 | — | KRX `bydd_trd` 응답 OutBlock_1 파싱 + KOSPI/KOSDAQ Promise.all | unit | `pnpm --filter @gh-radar/candle-sync test fetchBydd` | ❌ W0 | ⬜ pending |
| 9-03-03 | 03 | 1 | DATA-01 SC #2 | — | mapper: TDD_OPNPRC/HGPRC/LWPRC/CLSPRC → open/high/low/close 정확 매핑 | unit | `pnpm --filter @gh-radar/candle-sync test map` | ❌ W0 | ⬜ pending |
| 9-03-04 | 03 | 1 | DATA-01 SC #4 | — | chunked UPSERT 1000 row/chunk + onConflict (code,date) | unit | `pnpm --filter @gh-radar/candle-sync test upsert` | ❌ W0 | ⬜ pending |
| 9-04-01 | 04 | 1 | DATA-01 SC #3 | T-09-02 | MIN_EXPECTED 가드 (활성×0.5 미만 throw) | unit | `pnpm --filter @gh-radar/candle-sync test min-expected-guard` | ❌ W0 | ⬜ pending |
| 9-04-02 | 04 | 1 | DATA-01 SC #4 | — | withRetry 3회 exp backoff (200·400ms) — master-sync retry.ts 재사용 | unit | `pnpm --filter @gh-radar/candle-sync test retry` | ✅ pattern | ⬜ pending |
| 9-04-03 | 04 | 1 | DATA-01 SC #3 | — | daily mode: basDd 자동 계산 + idempotent UPSERT | integration | `pnpm --filter @gh-radar/candle-sync test runDaily` | ❌ W0 | ⬜ pending |
| 9-04-04 | 04 | 1 | DATA-01 SC #5 | — | recover mode: 결측 일자 SQL + max 20 calls 상한 | integration | `pnpm --filter @gh-radar/candle-sync test runRecover` | ❌ W0 | ⬜ pending |
| 9-04-05 | 04 | 1 | DATA-01 SC #2 | — | backfill mode: per-day 격리 + 휴장일 자연 skip | integration | `pnpm --filter @gh-radar/candle-sync test runBackfill` | ❌ W0 | ⬜ pending |
| 9-04-06 | 04 | 1 | DATA-01 SC #4 | T-09-03 | FK orphan 처리 (선택 옵션에 따라 stocks bootstrap 또는 NOT VALID) | integration | `pnpm --filter @gh-radar/candle-sync test fk-orphan` | ❌ W0 | ⬜ pending |
| 9-05-01 | 05 | 2 | DATA-01 SC #3 | T-09-04 | setup-candle-sync-iam.sh: runtime SA + secret accessor | smoke | `bash scripts/setup-candle-sync-iam.sh --dry-run` or production execute | ❌ W0 | ⬜ pending |
| 9-05-02 | 05 | 2 | DATA-01 SC #3 | T-09-04 | deploy-candle-sync.sh: 3 Jobs + 2 Schedulers + run.invoker 바인딩 | smoke | `bash scripts/deploy-candle-sync.sh` then `gcloud run jobs list` 검증 | ❌ W0 | ⬜ pending |
| 9-05-03 | 05 | 2 | DATA-01 SC #5 | — | Cloud Monitoring alert policy (Job 실패 1건/5분 → email) | smoke | `gcloud alpha monitoring policies list --filter="displayName~candle-sync"` | ❌ W0 | ⬜ pending |
| 9-06-01 | 06 | 3 | DATA-01 SC #1 | — | `[BLOCKING]` Supabase 마이그레이션 push (수동 또는 supabase CLI) | smoke | `psql -c "SELECT 1 FROM information_schema.tables WHERE table_name='stock_daily_ohlcv'"` | ❌ W0 | ⬜ pending |
| 9-06-02 | 06 | 3 | DATA-01 SC #2 | — | 백필 Job 1회 실행 + row count ≥ 4M | smoke | `bash scripts/smoke-candle-sync.sh --check-backfill` (INV-3) | ❌ W0 | ⬜ pending |
| 9-06-03 | 06 | 3 | DATA-01 SC #5 | — | 결측 종목 < 활성×5%, 결측 일자 ≤ 1/주 (smoke SQL) | smoke | `bash scripts/smoke-candle-sync.sh --check-coverage` (INV-4,5) | ❌ W0 | ⬜ pending |
| 9-06-04 | 06 | 3 | DATA-01 SC #3 | — | Scheduler 2종 ENABLED + cron `30 17 * * 1-5` / `10 8 * * 1-5` | smoke | `gcloud scheduler jobs describe gh-radar-candle-sync-eod` (INV-6) | ❌ W0 | ⬜ pending |
| 9-06-05 | 06 | 3 | DATA-01 SC #1 | — | ROADMAP SC #1 표현 갱신 (~2M → ~4M, 3년치 → 2020-01-01~) | doc | grep `.planning/ROADMAP.md` for `2020-01-01` | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task ID 는 planner 결정에 따라 변동 가능 — task ID 와 plan 번호는 PLAN.md 작성 후 plan-checker 가 정합 검증.*

---

## Wave 0 Requirements

신규 워커이므로 모든 테스트 인프라가 Wave 0 신설 대상이다:

- [ ] `workers/candle-sync/vitest.config.ts` — master-sync 미러 (globals: true)
- [ ] `workers/candle-sync/tests/krx-bydd.test.ts` — axios mock + 401 가드 + OutBlock_1 파싱
- [ ] `workers/candle-sync/tests/map.test.ts` — KRX `bydd_trd` row → `StockDailyOhlcv` 매핑 (fixture JSON 캡처 후)
- [ ] `workers/candle-sync/tests/upsert.test.ts` — chunked UPSERT 1000/chunk + onConflict(code,date)
- [ ] `workers/candle-sync/tests/runBackfill.test.ts` — per-day 격리 + 휴장 skip + 진행 로그
- [ ] `workers/candle-sync/tests/runDaily.test.ts` — basDd 자동 + idempotent + MIN_EXPECTED 가드
- [ ] `workers/candle-sync/tests/runRecover.test.ts` — 결측 감지 SQL + max calls 상한
- [ ] `workers/candle-sync/tests/index.test.ts` — MODE dispatch 통합
- [ ] **Wave 0 prerequisite task: KRX `bydd_trd` 실측 호출** — production AUTH_KEY 로 직전 영업일 basDd 호출, 응답 row 수 + 갱신 시각 (17:00/17:30/19:00/익일 06:00/08:00 중 어느 시점부터 fresh data) 캡처. R1 BLOCKER 검증.
- [ ] **Wave 0 prerequisite task: KRX `bydd_trd` 응답 JSON 캡처** — fixture 로 저장 (`workers/candle-sync/tests/fixtures/bydd-trd-{kospi,kosdaq}.json`) → mapper 테스트의 ground truth.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| KRX `bydd_trd` 서비스 별도 승인 상태 | DATA-01 SC #4 | KRX 포털 (openapi.krx.co.kr) 의 신청 UI 는 자동화 불가 | KRX 포털 로그인 → "신청 내역" → `stk_bydd_trd` + `ksq_bydd_trd` 가 "승인됨" 확인. master-sync 의 `isu_base_info` 와 별도 승인 필요할 수 있음. |
| KRX 갱신 시각 실측 (R1) | DATA-01 SC #3 | 시간대별 응답 변화 캡처는 사람이 1일 모니터 | 직전 영업일 17:00/17:30/18:00/19:00/익일 06:00/08:00 시점에 `bydd_trd` 호출 → row 수 변화 기록 → D-09 의 1차 cron `30 17 * * 1-5` 적절성 확정. RESEARCH §1 R1 참조. |
| Supabase 마이그레이션 production push | DATA-01 SC #1 | `supabase db push` 또는 SQL Editor 수동 실행 — env 별 인증 분리 | `psql $SUPABASE_DB_URL < supabase/migrations/{ts}_stock_daily_ohlcv.sql` 또는 Supabase dashboard SQL Editor. plan 06 의 `[BLOCKING]` task. |
| 백필 1회 실행 (~3h) | DATA-01 SC #2 | Cloud Run Job 장시간 실행 (task-timeout 10800s) | `gcloud run jobs execute gh-radar-candle-sync-backfill --region=asia-northeast3 --wait --update-env-vars="BACKFILL_FROM=2020-01-01,BACKFILL_TO=2026-05-09"` 후 row count 확인. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies — planner 가 각 task 의 acceptance_criteria 에 위 표의 `Automated Command` 인용
- [ ] Sampling continuity: 위 표에서 3 consecutive tasks 가 모두 manual 인 경우 없음 (smoke 가 자동화되어 있음) ✓
- [ ] Wave 0 covers all MISSING references — 위 Wave 0 Requirements 가 plan 02 (worker-scaffold) + plan 03 (krx-pipeline) 에 분배되도록 planner 가 task 정의
- [ ] No watch-mode flags — `--run` 명시 (vitest 기본 watch 차단)
- [ ] Feedback latency < 30s (unit) / < 120s (smoke) ✓
- [ ] `nyquist_compliant: true` 는 Wave 0 완료 후 (실측 KRX 응답 + fixture 캡처 + 1차 test green) 사용자가 수동 표시

**Approval:** pending — Wave 0 완료 후 `nyquist_compliant: true` 로 변경
