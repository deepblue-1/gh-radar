# Phase 9 DATA-01 — Deploy Log

**Deployed:** 2026-05-12 11:24 KST
**Image:** asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/candle-sync:2393010
**Image latest tag:** asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/candle-sync:latest
**Region:** asia-northeast3 (Seoul)

## Resources

### Service Accounts
| SA | Status | Roles |
|----|--------|-------|
| gh-radar-candle-sync-sa (신규) | created | roles/secretmanager.secretAccessor on `gh-radar-krx-auth-key` + `gh-radar-supabase-service-role` |
| gh-radar-scheduler-sa (재사용) | reused | roles/run.invoker on 3 Jobs |

### Cloud Run Jobs
| Job | Status | task-timeout | memory | MODE default |
|-----|--------|--------------|--------|--------------|
| gh-radar-candle-sync-daily   | deployed | 300s   | 512Mi | daily |
| gh-radar-candle-sync-recover | deployed | 900s   | 512Mi | recover |
| gh-radar-candle-sync-backfill | deployed | 10800s | 1Gi  | backfill |

### Cloud Schedulers
| Scheduler | cron (Asia/Seoul) | target Job | state |
|-----------|-------------------|-----------|-------|
| gh-radar-candle-sync-eod     | 30 17 * * 1-5 | daily   | ENABLED |
| gh-radar-candle-sync-recover | 10 8  * * 1-5 | recover | ENABLED |

### Cloud Monitoring Alert Policies
| Policy | ID | Channel |
|--------|-----|---------|
| gh-radar-candle-sync-daily-failure | projects/gh-radar/alertPolicies/11252887811631324539 | projects/gh-radar/notificationChannels/14409521670382124894 (alex@jx1.io) |
| gh-radar-candle-sync-recover-failure | projects/gh-radar/alertPolicies/14127224745675185916 | (same channel) |

## Backfill Execution

### 1차 백필 (2020-01-01 ~ 2026-05-11)
- **Execution:** `gh-radar-candle-sync-backfill-rkmgk`
- **Command:** `gcloud run jobs execute gh-radar-candle-sync-backfill --wait BACKFILL_FROM=2020-01-01 BACKFILL_TO=2026-05-11`
- **Started:** 2026-05-12 11:27:15 KST
- **Completed:** 2026-05-12 12:18:45 KST
- **Duration:** **51분 30초** (3h 추정 → KOSPI/KOSDAQ Promise.all 병렬화 + per-day 직렬로 1/3 단축)
- **Result log:** `runBackfill complete daysProcessed=1658 totalRows=4000659 daysFailed=1`

### Hotfix — change_rate 컬럼 overflow (numeric(8,4) → numeric(10,4))
- **Discovered:** 1차 백필 중 basDd=20260209 에서 `numeric field overflow` (per-day 격리로 다른 1,657일 정상)
- **원인:** KOSDAQ **052670 제일바이오** FLUC_RT="29948.08" (거래정지/감자 후 재개 추정) — 원 schema numeric(8,4) max ±9999.9999 초과
- **Hotfix migration:** `supabase/migrations/20260512123000_widen_change_rate.sql` — ALTER COLUMN TYPE numeric(10,4) (max ±999,999.9999, 33배 마진)
- **Push:** 2026-05-12 12:23 KST, dry-run 사전 확인 + 사용자 승인 후 적용. Row 재작성 없음 (정밀도 확장만).

### 2차 백필 — 결측 1일 보완 (2026-02-09)
- **Execution:** `gh-radar-candle-sync-backfill-zkpbg`
- **Command:** `BACKFILL_FROM=2026-02-09 BACKFILL_TO=2026-02-09`
- **Result:** 2,773 rows 추가 (KOSPI 952 + KOSDAQ 1,821, 052670 change_rate=29948.0800 정상 저장 확인)

### Row Counts (post-backfill, Management API SQL)
| 검증 | 결과 |
|------|------|
| `SELECT COUNT(*) FROM stock_daily_ohlcv;` | **4,003,432** |
| `SELECT COUNT(*) WHERE code='005930';` | **1,559** |
| `SELECT COUNT(*) WHERE date='2026-05-11';` (직전 영업일) | **2,769** |
| `SELECT MIN(date)` | **2020-01-02** |
| `SELECT MAX(date)` | **2026-05-11** |
| `SELECT * WHERE code='052670' AND date='2026-02-09'` (overflow 검증) | `change_rate=29948.0800` ✅ |

## Smoke Results

> ⚠️ **Smoke 스크립트 검증 노트:** `scripts/smoke-candle-sync.sh` 의 `check` 함수가 `bash -c "..." >/dev/null 2>&1` 으로 stderr 를 차단하여 inner 실패 원인 디버깅 불가 (`SUPABASE_*` 환경변수가 child shell 에 전파 불안정). 또한 `--check-coverage` / `--check-completeness` 가 `psql` 의존 (로컬 미설치). **결과 검증은 Supabase Management API (`POST /v1/projects/{ref}/database/query`) 로 동일 SQL 직접 실행하여 수행.**

| Invariant | Status | 검증 방법 | 결과 |
|-----------|--------|----------|------|
| INV-1 daily Job execute --wait exit 0 | ✅ | smoke INV-1 | PASS |
| INV-2 logs: runDaily complete or KRX data not yet available | ⚠️ NOTE | KRX 당일 (2026-05-12) 17:30 EOD 발행 전이라 빈 응답 → MIN_EXPECTED 가드로 다른 메시지 출력 가능성. 14:00 시점 daily 실행은 비정상 시간이므로 logical fail. **실 운영 cron `30 17` 으로 검증 예정** | (after 17:30 KST first run) |
| INV-3 logs: no candle-sync failed / 401 | ✅ | smoke INV-3 | PASS |
| INV-4 직전 영업일 row >= 2500 | ✅ | Management API `WHERE date='2026-05-11'` → **2769** | PASS |
| INV-5 005930 (삼성전자) row >= 100 | ✅ | Management API `WHERE code='005930'` → **1559** | PASS |
| INV-6 Schedulers ENABLED + cron | ✅ | smoke `--check-scheduler` (PASS 2/0) | PASS |
| --check-backfill row >= 4M | ✅ | Management API `SELECT COUNT(*)` → **4,003,432** | PASS |
| --check-backfill 005930 >= 1500 | ✅ | Management API → **1559** | PASS |
| --check-coverage missing_pct < 5 | ✅ | Management API → **0.00%** (0 missing / 2771 active) | PASS |
| --check-completeness incomplete_count <= 4 | ✅ | Management API → **0** (0/19 recent days incomplete) | PASS |
| --check-scheduler eod cron 30 17 | ✅ | smoke | PASS |
| --check-scheduler recover cron 10 8 | ✅ | smoke | PASS |

## Manual Run-book (T-09-06)
- **백필 전:** `gcloud scheduler jobs pause gh-radar-candle-sync-eod / -recover` — race 회피 ✅ 실행 시 적용
- **백필 후:** `gcloud scheduler jobs resume gh-radar-candle-sync-eod / -recover` — ✅ 백필 종료 후 즉시 resume, 양쪽 ENABLED 확인

## Sign-off

- [x] DATA-01 SC #1: `stock_daily_ohlcv` 테이블 + PK(code,date) + **4,003,432 row** (2020-01-02 ~ 2026-05-11)
- [x] DATA-01 SC #2: 초기 백필 완료 — 2020-01-01 ~ 2026-05-11, 1,658 days processed, 1 day overflow → hotfix + 재실행 PASS
- [x] DATA-01 SC #3: Cloud Run Job + Scheduler (`30 17 * * 1-5` + `10 8 * * 1-5`) ENABLED
- [x] DATA-01 SC #4: rate-limit/재시도/fail-isolation — 401 가드 + per-day try/catch + withRetry + chunked UPSERT (백필 중 1일 overflow per-day 격리로 입증)
- [x] DATA-01 SC #5: 결측 종목 < 5% (실측 **0.00%**) + 결측 일자 ≤ 4 (실측 **0**)
