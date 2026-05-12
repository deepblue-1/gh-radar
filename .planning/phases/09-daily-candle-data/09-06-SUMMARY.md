---
phase: 09-daily-candle-data
plan: 06
subsystem: infra+data
tags: [krx, supabase, cloud-run-jobs, backfill, production, hotfix]

requires:
  - phase: 09-daily-candle-data/01-migration
    provides: supabase/migrations/20260512120000_create_stock_daily_ohlcv.sql (Task 2 production push 대상)
  - phase: 09-daily-candle-data/02..04
    provides: candle-sync 워크스페이스 + KRX 클라이언트 + MODE dispatch (Task 3 backfill 의 빌딩 블록)
  - phase: 09-daily-candle-data/05-iam-deploy-scheduler
    provides: setup-candle-sync-iam.sh + deploy-candle-sync.sh + smoke-candle-sync.sh + alert YAML 2종

provides:
  - .planning/phases/09-daily-candle-data/09-API-VERIFICATION.md (R1/R2 실측 결과)
  - workers/candle-sync/tests/fixtures/bydd-trd-{kospi,kosdaq}.json (실측 fixture)
  - .planning/phases/09-daily-candle-data/09-01-MIGRATION-VERIFY.md (Applied 갱신)
  - .planning/phases/09-daily-candle-data/09-DEPLOY-LOG.md (production 배포 + 백필 결과 + sign-off)
  - supabase/migrations/20260512123000_widen_change_rate.sql (hotfix — numeric(8,4) → numeric(10,4))
  - production live data: stock_daily_ohlcv 4,003,432 rows
  - production live infra: 3 Cloud Run Jobs + 2 Schedulers + 2 Alert policies (asia-northeast3)

key-files:
  created:
    - .planning/phases/09-daily-candle-data/09-API-VERIFICATION.md
    - .planning/phases/09-daily-candle-data/09-DEPLOY-LOG.md
    - supabase/migrations/20260512123000_widen_change_rate.sql
    - workers/candle-sync/tests/fixtures/bydd-trd-kospi.json
    - workers/candle-sync/tests/fixtures/bydd-trd-kosdaq.json
  modified:
    - packages/shared/src/stock.ts (BdydTrdRow ISU_SRT_CD 제거, ISU_CD 6자 잠금)
    - workers/candle-sync/src/pipeline/map.ts (ISU_SRT_CD → ISU_CD)
    - workers/candle-sync/src/modes/bootstrapStocks.ts (ISU_SRT_CD → ISU_CD)
    - workers/candle-sync/tests/{krx-bydd,map,runDaily,runRecover,runBackfill}.test.ts
    - .planning/phases/09-daily-candle-data/09-01-MIGRATION-VERIFY.md (Status: Applied)
    - .planning/ROADMAP.md (Phase 9 Complete + SC 실측 값 + Plans 6개 [x])

commits:
  - 8f8476e feat(09-06): Wave 0 prerequisite — KRX bydd_trd 실측 fixture + 잠정→실측 잠금 (ISU_SRT_CD → ISU_CD 6자)
  - 2393010 feat(09-06): Task 2 — Supabase 마이그레이션 production push 완료 + MIGRATION-VERIFY 실값 갱신
  - b1239a4 feat(09-06): Task 3+4 — IAM/Deploy/Backfill 완료 + change_rate hotfix + DEPLOY-LOG 작성
---

# Plan 06 — Backfill and Verify (Production Sign-off)

## Outcome
Phase 9 (DATA-01) production 배포 완료. 4,003,432 일봉 OHLCV row 가 Supabase 에 적재되었으며 3 Cloud Run Jobs + 2 Schedulers + 2 Alert policies 가 가동 중. DATA-01 의 5개 Success Criteria 모두 실측 검증 PASS.

## Wave 0 Prerequisite — KRX 실측 + 타입 잠금 (Task 1)

**Blocker 1차 (2026-05-11):** master-sync 가 정상 사용 중인 `KRX_AUTH_KEY` 로 `stk_bydd_trd` 호출 시 HTTP 401. KRX OpenAPI 의 endpoint 별 사용 승인 체계 (T-09-01.1 threat 정확히 일치) — `stk_bydd_trd` + `ksq_bydd_trd` 2종 사용 신청 필요. 사용자가 [openapi.krx.co.kr](https://openapi.krx.co.kr) 에서 신청 → 2026-05-12 승인 완료.

**실측 결과:**
- KOSPI 948 rows, KOSDAQ 1,821 rows
- 응답 필드와 잠정 BdydTrdRow 타입 차이 발견 — `ISU_SRT_CD` 없음, `ISU_CD` 가 6자 단축코드 ("005930") 로 옴
- 일괄 rename 적용: packages/shared 타입 + map.ts/bootstrapStocks.ts + 5 test files
- typecheck + 52 tests 모두 GREEN (rename 후 회귀 없음)

**R1 갱신 시각:** 직전 영업일 (2026-05-11) 데이터는 2026-05-12 10:45 KST 시점에 정상 발행 확인. 당일 데이터는 EOD 발행 (장 마감 후) — D-09 cron `30 17 * * 1-5` 적정성은 첫 실행 로그로 검증 예정.

## Task 2 — Supabase Migration Production Push

`supabase db push` (dry-run → 사용자 승인 → apply). 미적용 마이그레이션 정확히 phase 의 1개만 (`20260512120000_create_stock_daily_ohlcv.sql`). PostgREST REST API + Management API SQL 로 검증:
- 11 컬럼 모두 정상 select
- FK NOT VALID 작동 (존재하지 않는 code → 23503 위반)
- 정상 code (005930) insert + delete OK
- anon SELECT RLS 정책 작동 (HTTP 200)

## Task 3 — IAM + Deploy + Backfill

### IAM (setup-candle-sync-iam.sh)
- 신규 SA `gh-radar-candle-sync-sa` 생성 + 시크릿 2종에 secretAccessor 바인딩
- SA 생성 직후 IAM 바인딩 시 propagation 지연 (eventual consistency) 발견 — 재실행 idempotent 로 해결

### Deploy (deploy-candle-sync.sh)
- Docker multi-stage build (SHA=2393010) + push to Artifact Registry
- 3 Cloud Run Jobs 배포 (daily 300s/512Mi, recover 900s/512Mi, backfill 10800s/1Gi)
- 2 Cloud Schedulers (eod `30 17` + recover `10 8`, ENABLED, Asia/Seoul)
- 2 Cloud Monitoring Alert policies (update-or-create 패턴, alex@jx1.io 채널 재사용)

### Backfill 1차 (2020-01-01 ~ 2026-05-11)
- 백필 직전 Scheduler pause (T-09-06 race 회피)
- Execution `gh-radar-candle-sync-backfill-rkmgk` — **51분 30초** (3h 추정 → KOSPI/KOSDAQ Promise.all + per-day 직렬로 1/3 단축)
- `runBackfill complete daysProcessed=1658 totalRows=4000659 daysFailed=1`

### Hotfix — change_rate numeric overflow
- 발견: basDd=20260209 에서 `numeric field overflow`. KRX 실측 → KOSDAQ **052670 제일바이오** FLUC_RT=29948.08 (거래정지/감자 후 재개 추정) 원 schema numeric(8,4) max ±9999.9999 초과
- 마이그레이션 `20260512123000_widen_change_rate.sql` 작성 → `ALTER COLUMN change_rate TYPE numeric(10,4)` (max ±999,999.9999, 33배 마진)
- 2차 백필 (BACKFILL_FROM=2026-02-09, TO=2026-02-09) 으로 결측 1일 보완 → 2,773 rows 추가, change_rate=29948.0800 정상 저장

### Post-backfill
- Scheduler resume (eod + recover 양쪽 ENABLED 확인)
- Total: **4,003,432 rows**, 005930=1559, 2020-01-02 ~ 2026-05-11

## Task 4 — Smoke 검증

**스크립트 한계 발견:** `scripts/smoke-candle-sync.sh` 의 `check` 함수가 `bash -c "..." >/dev/null 2>&1` 으로 stderr 차단 → inner 실패 원인 디버깅 불가. `--check-coverage` / `--check-completeness` 는 psql 의존 (로컬 미설치).

**대체 검증:** Supabase Management API `POST /v1/projects/{ref}/database/query` 로 동일 SQL 직접 실행.

| 검증 | 임계 | 실측 |
|------|------|------|
| Total row | >= 4M | **4,003,432** ✅ |
| 005930 row | >= 1,500 | **1,559** ✅ |
| 직전 영업일 (2026-05-11) row | >= 2,500 | **2,769** ✅ |
| 결측 종목 (30d) | < 5% | **0.00%** (0/2,771) ✅ |
| 결측 일자 (30d) | <= 4 | **0** (0/19 days) ✅ |
| Scheduler ENABLED + cron | 2종 | 2종 PASS ✅ |

## Task 5 — ROADMAP + REQUIREMENTS 갱신
- ROADMAP.md Phase 9 헤더 `[ ]` → `[x]` + SC #1~5 실측 값으로 표현 갱신 + Plans 섹션 6 plans 모두 [x] + Progress 표 `6/6 | Complete | 2026-05-12`
- REQUIREMENTS.md DATA-01 이미 Complete (Plan 01 시점 mark-complete)

## Self-Check: PASS

- [x] Task 1: KRX 실측 fixture 2개 + API-VERIFICATION + ISU_SRT_CD→ISU_CD rename 통과 (52 tests GREEN)
- [x] Task 2: production push exit 0 + 11 컬럼 + FK NOT VALID + RLS anon 검증
- [x] Task 3: IAM + Deploy + Backfill 51분 + hotfix + 2차 백필
- [x] Task 4: SC #5 5개 임계 모두 PASS (Management API 검증)
- [x] Task 5: ROADMAP + REQUIREMENTS 갱신

## Deviations

1. **smoke 스크립트 한계 우회** — psql 의존 + check 함수 stderr 가림으로 직접 SC 검증 불가. Management API 로 동일 SQL 실행하여 검증. 스크립트는 미래 고도화 대상이지만 현 임계 충족 입증 완료.
2. **change_rate hotfix 추가 migration** — Plan 01 의 numeric(8,4) 가 실 데이터 (제일바이오 29948.08%) 미커버. Plan 06 에서 발견 → hotfix migration 추가. 백필 1일 격리 후 재실행으로 데이터 무결성 회복.
3. **Wave 0 prerequisite 가 wave 3 에 위치한 구조 문제** — KRX endpoint 별 승인 검증을 wave 0 (계획 단계 직후) 에 했어야 1일 승인 대기로 일정 buffer 확보 가능. `tasks/lessons.md` 에 기록.

## Production Live State (2026-05-12 KST)

- `stock_daily_ohlcv`: 4,003,432 rows (2020-01-02 ~ 2026-05-11)
- Cloud Run Jobs: 3 (daily/recover/backfill) — image SHA `2393010`
- Schedulers: eod `30 17 * * 1-5` + recover `10 8 * * 1-5` ENABLED (Asia/Seoul)
- Alert policies: 2 (daily-failure + recover-failure → alex@jx1.io)
- 첫 실 운영 daily Job: 2026-05-12 17:30 KST (자동 실행)
- 첫 실 운영 recover Job: 2026-05-13 08:10 KST (자동 실행)
