---
phase: 09-daily-candle-data
plan: 06
type: execute
wave: 3
depends_on:
  - 09-05
files_modified:
  - workers/candle-sync/tests/fixtures/bydd-trd-kospi.json
  - workers/candle-sync/tests/fixtures/bydd-trd-kosdaq.json
  - .planning/phases/09-daily-candle-data/09-API-VERIFICATION.md
  - .planning/phases/09-daily-candle-data/09-01-MIGRATION-VERIFY.md
  - .planning/phases/09-daily-candle-data/09-DEPLOY-LOG.md
  - .planning/ROADMAP.md
autonomous: false
requirements_addressed:
  - DATA-01

must_haves:
  truths:
    - "[BLOCKING] Wave 0 prerequisite — KRX bydd_trd 실측 호출 1회 (production AUTH_KEY) + JSON fixture 캡처 (R1/R2 BLOCKER 검증) — RESEARCH §1.2 §1.4"
    - "[BLOCKING] Supabase 마이그레이션 production push — autonomous:false (사용자 confirm 필요) — DATA-01 SC #1"
    - "[BLOCKING] Cloud Monitoring alert policy 2종 등록 (사용자 이메일 channel 사용) — DATA-01 SC #5"
    - "[BLOCKING] IAM + deploy 스크립트 실행 (setup-candle-sync-iam.sh + deploy-candle-sync.sh) — autonomous:false"
    - "백필 1회 실행 (gcloud run jobs execute backfill --wait BACKFILL_FROM=2020-01-01 BACKFILL_TO=직전영업일) — DATA-01 SC #2"
    - "백필 후 DB 검증 — row count >= 4M, 005930 row >= 1500, 결측 종목 < 5%, 결측 일자 <= 4 (smoke INV-1~6 + --check-backfill + --check-coverage + --check-completeness)"
    - "Scheduler 2종 ENABLED 검증 — DATA-01 SC #3"
    - "ROADMAP SC #1 표현 갱신 — '~2M 행' → '~4.5M 행', '3년치' → '2020-01-01 ~ 현재'"
    - "DEPLOY-LOG.md 작성 — 이미지 SHA + Job/Scheduler/alert policy ID + 백필 실행 결과 + row count + 005930 검증"
  artifacts:
    - path: ".planning/phases/09-daily-candle-data/09-API-VERIFICATION.md"
      provides: "Wave 0 KRX bydd_trd 실측 결과 — R1/R2 검증 + 갱신 시각 + 필드명 확인"
      contains: "TDD_CLSPRC"
    - path: "workers/candle-sync/tests/fixtures/bydd-trd-kospi.json"
      provides: "KRX KOSPI bydd_trd 응답 fixture (실측)"
      contains: "OutBlock_1"
    - path: ".planning/phases/09-daily-candle-data/09-DEPLOY-LOG.md"
      provides: "production 배포 + 백필 실행 + smoke 결과 기록"
      contains: "DATA-01"
    - path: ".planning/ROADMAP.md"
      provides: "SC #1 표현 갱신"
      contains: "2020-01-01"
  key_links:
    - from: "백필 1회 실행"
      to: "smoke --check-backfill"
      via: "row count >= 4M 검증"
      pattern: "4000000\\|4,000,000"
    - from: ".planning/ROADMAP.md SC #1"
      to: "실측 row count"
      via: "DEPLOY-LOG 기록값"
      pattern: "2020-01-01"
---

<objective>
Phase 9 의 production 배포 + 백필 1회 실행 + 전체 검증. 본 plan 은 **모든 BLOCKING checkpoint** 가 포함되어 `autonomous: false` — 사용자 confirm 후 진행.

본 plan 의 task 시퀀스:
1. **Wave 0 prerequisite — KRX 실측 + fixture 캡처** (BLOCKER: R1/R2 검증 — KRX 갱신 시각 + 응답 필드명 확정)
2. **Supabase 마이그레이션 production push** (autonomous:false — production DB 변경)
3. **IAM + deploy + alert policy 실행** (autonomous:false — GCP 리소스 생성)
4. **백필 1회 실행** (~3h, BACKFILL_FROM=2020-01-01) + 백필 후 검증
5. **smoke INV-1~6 + SC #5 검증** (--check-backfill / --check-coverage / --check-completeness / --check-scheduler)
6. **ROADMAP SC #1 갱신 + DEPLOY-LOG 작성**

Purpose:
- DATA-01 5개 SC 모두 production 검증
- ROADMAP SC #1 표현 갱신 (실측 row count 반영)
- Phase 9 완료 sign-off

Output:
- KRX 실측 fixture 2개 (Plan 03 test 가 잠정 → 실측으로 잠금)
- 09-API-VERIFICATION.md — R1/R2 검증 결과
- 09-01-MIGRATION-VERIFY.md 갱신 (Plan 01 템플릿 → 실값)
- 09-DEPLOY-LOG.md — production 배포 기록
- ROADMAP.md SC #1 갱신
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/09-daily-candle-data/09-CONTEXT.md
@.planning/phases/09-daily-candle-data/09-RESEARCH.md
@.planning/phases/09-daily-candle-data/09-VALIDATION.md

# Plan 01~05 산출물
@supabase/migrations/20260512120000_create_stock_daily_ohlcv.sql
@.planning/phases/09-daily-candle-data/09-01-MIGRATION-VERIFY.md
@workers/candle-sync/src/index.ts
@scripts/setup-candle-sync-iam.sh
@scripts/deploy-candle-sync.sh
@scripts/smoke-candle-sync.sh
@ops/alert-candle-sync-daily-failure.yaml
@ops/alert-candle-sync-recover-failure.yaml

# Phase 05.1 DEPLOY-LOG 패턴 (mirror)
@.planning/phases/05.1-ingestion-cloud-run-job-cloud-scheduler-kis
</context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: [BLOCKING] Wave 0 prerequisite — KRX bydd_trd 실측 + JSON fixture 캡처 (R1/R2 검증)</name>
  <files>
    workers/candle-sync/tests/fixtures/bydd-trd-kospi.json,
    workers/candle-sync/tests/fixtures/bydd-trd-kosdaq.json,
    .planning/phases/09-daily-candle-data/09-API-VERIFICATION.md
  </files>

  <read_first>
    - .planning/phases/09-daily-candle-data/09-RESEARCH.md §1.2 (응답 필드 — TDD_OPNPRC 등 잠정 필드명) §1.4 (R1 BLOCKER — KRX 갱신 시각 가설)
    - .planning/phases/09-daily-candle-data/09-VALIDATION.md "Wave 0 Requirements"
    - workers/master-sync/.env (또는 사용자 로컬 .env) — KRX_AUTH_KEY 위치
    - packages/shared/src/stock.ts (BdydTrdRow 타입 — Plan 01 잠정 → 본 task 후 잠금)
  </read_first>

  <what-built>
Plan 03 의 `BdydTrdRow` 타입 + map.ts mapper 는 RESEARCH §1.2 의 잠정 필드명 (TDD_OPNPRC 등) 으로 작성됨. 본 task 는 production KRX_AUTH_KEY 로 실측 1회 호출하여:
- R2 검증: 응답 필드명이 잠정과 일치 → fixture JSON 으로 캡처 → Plan 03 test 가 실측 기반으로 잠금
- R1 검증: KRX 갱신 시각 — 직전 영업일 basDd 호출 시 응답 row count 확인 (D-09 cron `30 17 * * 1-5` vs `10 8 * * 1-5` 적절성)
  </what-built>

  <how-to-verify>
**사용자가 로컬 셸에서 다음을 실행:**

1. 환경 변수 준비:
```bash
# master-sync 가 사용하는 KRX_AUTH_KEY 그대로 — D-02 재사용
test -f workers/master-sync/.env && grep KRX_AUTH_KEY workers/master-sync/.env
# 또는 export KRX_AUTH_KEY=...

# 직전 영업일 계산 (오늘이 평일이면 1일 전, 월요일이면 금요일)
YESTERDAY=$(date -v-1d +%Y%m%d)  # macOS
# linux: YESTERDAY=$(date -d "yesterday" +%Y%m%d)
echo "basDd = $YESTERDAY"
```

2. R2 — KOSPI bydd_trd 실측 호출 + JSON 저장:
```bash
mkdir -p workers/candle-sync/tests/fixtures

curl -fsS "https://data-dbg.krx.co.kr/svc/apis/sto/stk_bydd_trd?basDd=${YESTERDAY}" \
  -H "AUTH_KEY: ${KRX_AUTH_KEY}" \
  -o workers/candle-sync/tests/fixtures/bydd-trd-kospi.json

curl -fsS "https://data-dbg.krx.co.kr/svc/apis/sto/ksq_bydd_trd?basDd=${YESTERDAY}" \
  -H "AUTH_KEY: ${KRX_AUTH_KEY}" \
  -o workers/candle-sync/tests/fixtures/bydd-trd-kosdaq.json

# 응답 검증
jq '.OutBlock_1 | length' workers/candle-sync/tests/fixtures/bydd-trd-kospi.json
jq '.OutBlock_1 | length' workers/candle-sync/tests/fixtures/bydd-trd-kosdaq.json
# 예상: KOSPI ~950, KOSDAQ ~1,700 (평일 정상 응답)

# 필드명 확인 — 005930 (삼성전자) 가 KOSPI 에 있는지
jq '.OutBlock_1[] | select(.ISU_SRT_CD == "005930")' workers/candle-sync/tests/fixtures/bydd-trd-kospi.json
# 출력 필드: BAS_DD, ISU_CD, ISU_SRT_CD, ISU_NM, MKT_NM, SECT_TP_NM, TDD_OPNPRC, TDD_HGPRC, TDD_LWPRC, TDD_CLSPRC,
#           CMPPREVDD_PRC, FLUC_RT, ACC_TRDVOL, ACC_TRDVAL, MKTCAP, LIST_SHRS
```

3. R1 — 갱신 시각 실측 (선택, 시간 여유 시):
```bash
# 만약 EOD 17:30 시점에 본 task 를 실행한다면, 당일 basDd 호출도 시도:
TODAY=$(date +%Y%m%d)
curl -fsS "https://data-dbg.krx.co.kr/svc/apis/sto/stk_bydd_trd?basDd=${TODAY}" \
  -H "AUTH_KEY: ${KRX_AUTH_KEY}" | jq '.OutBlock_1 | length'

# 예상 시나리오 A (당일 발행 확인): 950 이상 → D-09 cron `30 17 * * 1-5` 정상
# 예상 시나리오 B (익영업일 08시만 발행): 0 → daily Scheduler 가 매번 빈 응답 → recover 가 보완
```

4. `.planning/phases/09-daily-candle-data/09-API-VERIFICATION.md` 작성 — 다음 템플릿:
```markdown
# Phase 9 — KRX bydd_trd API Verification

**Verified:** YYYY-MM-DD HH:MM KST
**AUTH_KEY:** master-sync 와 동일 계정 (D-02)
**Endpoint:** `https://data-dbg.krx.co.kr/svc/apis/sto/{stk|ksq}_bydd_trd`

## R2 — 응답 필드명 검증

### KOSPI fixture (workers/candle-sync/tests/fixtures/bydd-trd-kospi.json)
- 응답 row count: [N]
- 005930 (삼성전자) sample row:
  ```json
  [paste actual row]
  ```
- 잠정 필드명과 일치 여부: [✅ 일치 / ❌ 차이 — 차이 리스트]

### KOSDAQ fixture
- 응답 row count: [N]
- 필드명 일치: [✅ / ❌]

## R1 — 갱신 시각 검증

| 시점 | basDd | row count | 비고 |
|-----|-------|-----------|------|
| 직전 영업일 호출 | YYYYMMDD | ~2,650 | 정상 응답 |
| 당일 17:30 KST 시점 | YYYYMMDD | [N] | [발행 여부] |
| 당일 19:00 KST 시점 | YYYYMMDD | [N] | (시간 여유 시) |
| 익일 08:00 KST 시점 | YYYYMMDD | [N] | (시간 여유 시) |

## 결정

- [ ] R2: BdydTrdRow 타입 + map.ts 잠정 필드명 검증 완료. [수정 필요 시 추가 task 로 patch]
- [ ] R1: 1차 cron `30 17 * * 1-5` 적절성 검증. [BLOCKER 확정 시 1차 cron 폐기 또는 시각 조정 — Plan 06 Task 3 deploy 직전 결정]
```

5. **Plan 03 test 가 fixture 를 사용하는지 확인** — 미리 작성된 test 가 `bydd-trd-kospi.json` 을 import 한다면 GREEN 유지, 안 한다면 옵션:
   - (A) 그대로 둠 — Plan 03 test 는 인라인 fixture 사용, 본 fixture 는 추후 회귀 테스트용
   - (B) Plan 03 test 가 fixture import 하도록 patch (추가 task)
   - 권장 (A) — 본 plan 은 fixture 캡처만, 활용은 후속.

**Claude 가 사용자 입력 검증:**
```bash
test -f workers/candle-sync/tests/fixtures/bydd-trd-kospi.json
test -f workers/candle-sync/tests/fixtures/bydd-trd-kosdaq.json
jq -e '.OutBlock_1' workers/candle-sync/tests/fixtures/bydd-trd-kospi.json >/dev/null
jq -e '.OutBlock_1' workers/candle-sync/tests/fixtures/bydd-trd-kosdaq.json >/dev/null
test -f .planning/phases/09-daily-candle-data/09-API-VERIFICATION.md
```
모두 exit 0.
  </how-to-verify>

  <verify>
    <automated>test -f workers/candle-sync/tests/fixtures/bydd-trd-kospi.json && test -f workers/candle-sync/tests/fixtures/bydd-trd-kosdaq.json && jq -e '.OutBlock_1' workers/candle-sync/tests/fixtures/bydd-trd-kospi.json && jq -e '.OutBlock_1 | length > 100' workers/candle-sync/tests/fixtures/bydd-trd-kospi.json && test -f .planning/phases/09-daily-candle-data/09-API-VERIFICATION.md</automated>
  </verify>

  <resume-signal>
사용자가 다음 정보 보고:
- "fixture 캡처 완료. KOSPI N row, KOSDAQ N row"
- "R2 결과 — 잠정 필드명 vs 실측 (일치/차이)"
- "R1 결과 — 직전 영업일 row count, 당일 17:30 시점 row count (시간 여유 시)"
- "9-API-VERIFICATION.md 작성 완료"

Claude 가 fixture 존재 + jq parse + verify 후 자동 진행.
  </resume-signal>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: [BLOCKING] Supabase 마이그레이션 production push + 09-01-MIGRATION-VERIFY.md 갱신</name>
  <files>
    .planning/phases/09-daily-candle-data/09-01-MIGRATION-VERIFY.md
  </files>

  <read_first>
    - supabase/migrations/20260512120000_create_stock_daily_ohlcv.sql (Plan 01 산출)
    - .planning/phases/09-daily-candle-data/09-01-MIGRATION-VERIFY.md (Plan 01 템플릿 — 본 task 가 실값으로 갱신)
    - .planning/phases/06.1-stock-master-universe/06.1-02-MIGRATION-VERIFY.md (mirror 패턴)
  </read_first>

  <what-built>
Plan 01 이 작성한 마이그레이션 SQL 을 production Supabase 에 적용. `supabase db push` 또는 `psql $SUPABASE_DB_URL -f ...` 두 방법 모두 가능. 본 task 는 **production DB 변경** 이므로 사용자 confirm 필요.
  </what-built>

  <how-to-verify>
**사용자가 로컬 셸에서 다음을 실행:**

1. 사전 가드:
```bash
# SUPABASE_ACCESS_TOKEN 또는 SUPABASE_DB_URL 중 하나 필요
test -n "${SUPABASE_DB_URL:-}" || test -n "${SUPABASE_ACCESS_TOKEN:-}" || {
  echo "ERROR: SUPABASE_DB_URL or SUPABASE_ACCESS_TOKEN required" >&2; exit 1
}

# Plan 01 SQL 존재 확인
test -f supabase/migrations/20260512120000_create_stock_daily_ohlcv.sql || {
  echo "ERROR: Plan 01 migration not found"; exit 1
}
```

2. Push (권장 1순위 — psql 직접, 단일 파일 명시 적용):
```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260512120000_create_stock_daily_ohlcv.sql
```
exit 0 + 출력에 `CREATE TABLE` + `CREATE INDEX` + `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` 모두 매치.

또는 권장 2순위 — supabase CLI (미적용 마이그레이션 1개만 있는 경우):
```bash
# 사전 확인 — 미적용 마이그레이션이 본 phase 의 것 1개만 인지 검증
supabase migration list
# 출력에 본 timestamp 1개만 "not applied" 인 것 확인 후:
supabase db push
```

> ⚠️ **위험 경고:** `supabase db push --include-all` 는 다른 미적용 마이그레이션도 동시에 적용 — 본 Phase 9 범위 외 변경이 함께 푸시될 위험. **본 task 에서는 사용 금지.** 1순위 (psql 직접 + 단일 파일) 또는 사전 `supabase migration list` 확인 후 default `supabase db push` 사용.

3. 적용 결과 psql 검증:
```bash
psql "$SUPABASE_DB_URL" <<'SQL'
\echo === stock_daily_ohlcv 스키마 ===
\d stock_daily_ohlcv
\echo === FK 제약 ===
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
  WHERE conrelid = 'stock_daily_ohlcv'::regclass AND contype = 'f';
\echo === 인덱스 ===
SELECT indexname, indexdef FROM pg_indexes WHERE tablename='stock_daily_ohlcv';
\echo === RLS 정책 ===
SELECT tablename, policyname, roles, cmd FROM pg_policies WHERE tablename='stock_daily_ohlcv';
\echo === 초기 row count ===
SELECT 'stock_daily_ohlcv' AS t, count(*) FROM stock_daily_ohlcv;
SQL
```

기대 출력:
- `\d stock_daily_ohlcv` 에 컬럼 11개 (code/date/open/high/low/close/volume/trade_amount/change_amount/change_rate/inserted_at) 모두 존재
- FK 출력: `FOREIGN KEY (code) REFERENCES stocks(code) ON DELETE CASCADE NOT VALID`
- 인덱스: `stock_daily_ohlcv_pkey` (code, date) + `idx_stock_daily_ohlcv_date_desc` (date)
- RLS: `anon_read_stock_daily_ohlcv` (anon, SELECT)
- count: 0 (백필 전)

4. `.planning/phases/09-daily-candle-data/09-01-MIGRATION-VERIFY.md` 의 Status 를 `Status: Applied YYYY-MM-DD HH:MM KST` 로 갱신하고 위 psql 출력 paste. Sign-off 체크리스트 6항목 모두 [x] 처리.

**Claude 가 자동 검증:**
```bash
# Plan 01 VERIFY 가 Applied 로 갱신됨
grep "Status: Applied" .planning/phases/09-daily-candle-data/09-01-MIGRATION-VERIFY.md
# 모든 sign-off 체크
grep -c "\\[x\\]" .planning/phases/09-daily-candle-data/09-01-MIGRATION-VERIFY.md
# 6 이상
```
  </how-to-verify>

  <verify>
    <automated>grep -q "Status: Applied" .planning/phases/09-daily-candle-data/09-01-MIGRATION-VERIFY.md && grep -q "NOT VALID" .planning/phases/09-daily-candle-data/09-01-MIGRATION-VERIFY.md && grep -q "anon_read_stock_daily_ohlcv" .planning/phases/09-daily-candle-data/09-01-MIGRATION-VERIFY.md && grep -q "idx_stock_daily_ohlcv_date_desc" .planning/phases/09-daily-candle-data/09-01-MIGRATION-VERIFY.md</automated>
  </verify>

  <resume-signal>
사용자가 "supabase db push 성공 + psql 검증 paste 완료" 보고.

만약 push 실패 시 STOP — Claude 와 같이 마이그레이션 SQL 수정 + 재시도.
  </resume-signal>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: [BLOCKING] IAM + deploy 실행 + 백필 1회 실행 (~3h)</name>
  <files>
    .planning/phases/09-daily-candle-data/09-DEPLOY-LOG.md
  </files>

  <read_first>
    - scripts/setup-candle-sync-iam.sh (Plan 05)
    - scripts/deploy-candle-sync.sh (Plan 05)
    - scripts/smoke-candle-sync.sh (Plan 05)
    - .planning/phases/05.1-ingestion-cloud-run-job-cloud-scheduler-kis (DEPLOY-LOG mirror 패턴 — 디렉터리 안의 5종 spec 참고)
    - .planning/phases/09-daily-candle-data/09-CONTEXT.md §D-09 (Scheduler 트리거)
    - .planning/phases/09-daily-candle-data/09-RESEARCH.md §5.4 (백필 시 다른 Scheduler pause manual run-book)
  </read_first>

  <what-built>
Plan 05 의 3종 스크립트 실행 — IAM 설정, 3 Jobs + 2 Schedulers 배포, 백필 1회 수동 execute. ~3 시간 소요 (backfill task-timeout 10800s).

**중요 (T-09-06 manual run-book):** 백필 실행 직전에 EOD/recover Scheduler 를 pause 권장 (동시 실행 race 회피). 백필 종료 후 resume.
  </what-built>

  <how-to-verify>
**사용자가 로컬 셸에서 다음을 실행:**

1. 환경 변수:
```bash
export GCP_PROJECT_ID=gh-radar
export SUPABASE_URL="$(cat workers/master-sync/.env | grep SUPABASE_URL | cut -d= -f2-)"

# gcloud 인증 — gh-radar-deployer SA 사용 (MEMORY 의 reference_gh_radar_deployer_sa.md)
export GOOGLE_APPLICATION_CREDENTIALS=~/.config/gcloud/gh-radar-deployer.json
export CLOUDSDK_CORE_PROJECT=gh-radar
gcloud config configurations activate gh-radar
```

2. **IAM 설정** (Plan 05 Task 1 산출 실행):
```bash
bash scripts/setup-candle-sync-iam.sh
```
exit 0 + 출력에 `✓ SA created: gh-radar-candle-sync-sa` + `✓ secretAccessor bound: gh-radar-krx-auth-key` + `✓ secretAccessor bound: gh-radar-supabase-service-role`.

3. **Deploy** (Plan 05 Task 2 산출 실행):
```bash
bash scripts/deploy-candle-sync.sh
```
exit 0 + 3 Jobs + 2 Schedulers 생성. ~5분 소요 (Docker build amd64 + push + 3 deploy + 2 scheduler).

검증:
```bash
gcloud run jobs list --region=asia-northeast3 --filter="metadata.name~candle-sync"
gcloud scheduler jobs list --location=asia-northeast3 --filter="name~candle-sync"
```
3 Jobs + 2 Schedulers 모두 출력.

4. **Alert policy 등록** (Plan 05 Task 4 YAML 사용):
```bash
# 기존 이메일 channel 재사용 (Phase 05.1 에서 생성한 alex@jx1.io)
EXISTING=$(gcloud beta monitoring channels list \
  --filter="type=email AND labels.email_address=alex@jx1.io" \
  --format='value(name)' | head -n1)

[ -n "$EXISTING" ] || { echo "이메일 channel 없음 — Phase 05.1 setup-ingestion-iam 가 먼저 실행되어야 함"; exit 1; }

# YAML placeholder 치환 + policy update-or-create — daily
# WARNING (production safety): delete-before-create 는 재실행 시 alert 미발화 window 발생 — update-or-create 패턴 채택.
sed "s|\\${NOTIFICATION_CHANNEL_ID}|${EXISTING}|g" \
  ops/alert-candle-sync-daily-failure.yaml > /tmp/policy-daily.yaml

EXISTING_POLICY=$(gcloud alpha monitoring policies list \
  --filter='displayName="gh-radar-candle-sync-daily-failure"' \
  --format='value(name)' | head -n1)
if [ -n "$EXISTING_POLICY" ]; then
  gcloud alpha monitoring policies update "$EXISTING_POLICY" \
    --policy-from-file=/tmp/policy-daily.yaml
else
  gcloud alpha monitoring policies create \
    --policy-from-file=/tmp/policy-daily.yaml
fi
rm -f /tmp/policy-daily.yaml

# recover — 동일 update-or-create 패턴
sed "s|\\${NOTIFICATION_CHANNEL_ID}|${EXISTING}|g" \
  ops/alert-candle-sync-recover-failure.yaml > /tmp/policy-recover.yaml

EXISTING_POLICY=$(gcloud alpha monitoring policies list \
  --filter='displayName="gh-radar-candle-sync-recover-failure"' \
  --format='value(name)' | head -n1)
if [ -n "$EXISTING_POLICY" ]; then
  gcloud alpha monitoring policies update "$EXISTING_POLICY" \
    --policy-from-file=/tmp/policy-recover.yaml
else
  gcloud alpha monitoring policies create \
    --policy-from-file=/tmp/policy-recover.yaml
fi
rm -f /tmp/policy-recover.yaml
```

5. **백필 실행 전 — Scheduler pause** (T-09-06 manual run-book):
```bash
gcloud scheduler jobs pause gh-radar-candle-sync-eod --location=asia-northeast3
gcloud scheduler jobs pause gh-radar-candle-sync-recover --location=asia-northeast3
```

6. **백필 실행** (~3h, BACKFILL_FROM=2020-01-01 ~ 직전영업일):
```bash
# 직전 영업일 계산 (macOS — 주말 보정 포함)
TODAY_DOW=$(date +%u)  # 1=월 ... 7=일
case "$TODAY_DOW" in
  1) PREV_BUSINESS_DAY=$(date -v-3d +%Y-%m-%d) ;;  # 월 → 금
  7) PREV_BUSINESS_DAY=$(date -v-2d +%Y-%m-%d) ;;  # 일 → 금
  *) PREV_BUSINESS_DAY=$(date -v-1d +%Y-%m-%d) ;;  # 화~토 → 전일
esac
# 또는 사용자가 명시: PREV_BUSINESS_DAY=2026-05-09

gcloud run jobs execute gh-radar-candle-sync-backfill \
  --region=asia-northeast3 \
  --wait \
  --update-env-vars="BACKFILL_FROM=2020-01-01,BACKFILL_TO=${PREV_BUSINESS_DAY}"
```
**~3시간 소요** — 실행 중 사용자가 모니터링 (Cloud Logging):
```bash
gcloud logging tail "resource.type=cloud_run_job AND resource.labels.job_name=gh-radar-candle-sync-backfill" --format=json
```

완료 후 exit 0 확인. log 에 `runBackfill complete daysProcessed=1500± totalRows=4M± daysFailed=0` 매치.

7. **백필 후 Scheduler resume**:
```bash
gcloud scheduler jobs resume gh-radar-candle-sync-eod --location=asia-northeast3
gcloud scheduler jobs resume gh-radar-candle-sync-recover --location=asia-northeast3
```

8. **DEPLOY-LOG.md 작성** — `.planning/phases/09-daily-candle-data/09-DEPLOY-LOG.md`:
```markdown
# Phase 9 DATA-01 — Deploy Log

**Deployed:** YYYY-MM-DD HH:MM KST
**Image:** asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/candle-sync:{SHA}
**Image latest tag:** asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/candle-sync:latest

## Resources

### Service Accounts
| SA | Status | Roles |
|----|--------|-------|
| gh-radar-candle-sync-sa (신규) | created | secretAccessor (KRX/Supabase) |
| gh-radar-scheduler-sa (재사용) | reused | run.invoker on 3 Jobs |

### Cloud Run Jobs
| Job | Status | task-timeout | memory | URL |
|-----|--------|--------------|--------|-----|
| gh-radar-candle-sync-daily   | deployed | 300s   | 512Mi | (gcloud run jobs describe) |
| gh-radar-candle-sync-recover | deployed | 900s   | 512Mi | |
| gh-radar-candle-sync-backfill | deployed | 10800s | 1Gi  | |

### Cloud Schedulers
| Scheduler | cron | target Job | state |
|-----------|------|-----------|-------|
| gh-radar-candle-sync-eod     | 30 17 * * 1-5 | daily   | ENABLED |
| gh-radar-candle-sync-recover | 10 8  * * 1-5 | recover | ENABLED |

### Cloud Monitoring Alert Policies
| Policy | ID | Channel |
|--------|-----|---------|
| gh-radar-candle-sync-daily-failure | (policy resource name) | (channel resource name) |
| gh-radar-candle-sync-recover-failure | (policy resource name) | (channel resource name) |

## Backfill Execution

- **Command:** `gcloud run jobs execute gh-radar-candle-sync-backfill --wait BACKFILL_FROM=2020-01-01 BACKFILL_TO=YYYY-MM-DD`
- **Started:** YYYY-MM-DD HH:MM KST
- **Completed:** YYYY-MM-DD HH:MM KST
- **Duration:** ~Xh Ym
- **Result log:** `runBackfill complete daysProcessed=N totalRows=M daysFailed=0`

### Row Counts (post-backfill, 사용자 paste)
- `SELECT COUNT(*) FROM stock_daily_ohlcv;` → [N]
- `SELECT COUNT(*) FROM stock_daily_ohlcv WHERE code = '005930';` → [N]
- `SELECT DISTINCT date FROM stock_daily_ohlcv ORDER BY date DESC LIMIT 5;` → [최근 5 영업일]
- `SELECT MIN(date) FROM stock_daily_ohlcv;` → 2020-01-XX
```

**Claude 자동 검증:**
```bash
test -f .planning/phases/09-daily-candle-data/09-DEPLOY-LOG.md
gcloud run jobs list --region=asia-northeast3 --filter="metadata.name~candle-sync" --format='value(metadata.name)' | sort | uniq -c
# 출력: 3 (3 jobs)
gcloud scheduler jobs list --location=asia-northeast3 --filter="name~candle-sync" --format='value(name)' | sort | uniq -c
# 출력: 2 (2 schedulers)
gcloud alpha monitoring policies list --filter='displayName~candle-sync' --format='value(displayName)' | wc -l
# 출력: 2 (2 alert policies)
```
  </how-to-verify>

  <verify>
    <automated>test -f .planning/phases/09-daily-candle-data/09-DEPLOY-LOG.md && grep -q "candle-sync:" .planning/phases/09-daily-candle-data/09-DEPLOY-LOG.md && grep -q "2020-01-01" .planning/phases/09-daily-candle-data/09-DEPLOY-LOG.md && gcloud run jobs list --region=asia-northeast3 --filter="metadata.name~candle-sync" --format='value(metadata.name)' | wc -l | grep -q '^\s*3$'</automated>
  </verify>

  <resume-signal>
사용자가 "IAM + deploy + alert + 백필 + Scheduler resume 모두 완료. DEPLOY-LOG 작성 완료" 보고.

만약 백필이 중간에 실패하면:
- task-timeout 10800s 내 미완료 → BACKFILL_FROM 을 중단 시점으로 좁혀 재실행 (idempotent UPSERT 안전)
- MIN_EXPECTED 위반 (응답 < 1400 row) → 어떤 basDd 에서 발생했는지 로그 확인 후 사용자 판단
- KRX 401 → AUTH_KEY 또는 bydd_trd 서비스 승인 상태 점검 (Phase 05.1 lesson)
  </resume-signal>
</task>

<task type="auto" tdd="false">
  <name>Task 4: smoke INV-1~6 + SC #5 검증 + DEPLOY-LOG 갱신</name>
  <files>.planning/phases/09-daily-candle-data/09-DEPLOY-LOG.md</files>

  <read_first>
    - scripts/smoke-candle-sync.sh (Plan 05)
    - .planning/phases/09-daily-candle-data/09-DEPLOY-LOG.md (Task 3 산출 — 본 task 가 smoke 결과 추가)
    - .planning/phases/09-daily-candle-data/09-RESEARCH.md §6.1 §6.2 (SC #5 SQL 임계)
  </read_first>

  <action>
1. SUPABASE_DB_URL 환경 준비 (사용자 .env 또는 export):
```bash
test -n "$SUPABASE_DB_URL" || { echo "SUPABASE_DB_URL required"; exit 1; }
test -n "$SUPABASE_URL" || { echo "SUPABASE_URL required"; exit 1; }
test -n "$SUPABASE_SERVICE_ROLE_KEY" || { echo "SUPABASE_SERVICE_ROLE_KEY required"; exit 1; }
```

2. INV-1~6 전체 실행:
```bash
bash scripts/smoke-candle-sync.sh
```
exit 0 + 출력에 `PASS: 6  FAIL: 0` 매치. 실패 시 fail invariant 명시.

3. SC #5 검증 — 결측 종목 + 결측 일자:
```bash
bash scripts/smoke-candle-sync.sh --check-coverage      # missing_pct < 5
bash scripts/smoke-candle-sync.sh --check-completeness  # incomplete_count <= 4
```
둘 다 exit 0.

4. 백필 결과 검증:
```bash
bash scripts/smoke-candle-sync.sh --check-backfill      # row count >= 4M, 005930 >= 1500
```
exit 0.

5. Scheduler 검증:
```bash
bash scripts/smoke-candle-sync.sh --check-scheduler     # cron 정확
```
exit 0.

6. DEPLOY-LOG.md 에 smoke 결과 섹션 추가 (Task 3 의 산출물에 append):
```markdown

## Smoke Results

| Invariant | Status | Notes |
|-----------|--------|-------|
| INV-1 daily Job execute --wait exit 0 | ✅ | |
| INV-2 logs runDaily complete | ✅ | |
| INV-3 no 401 / failed | ✅ | |
| INV-4 직전영업일 row >= 2500 | ✅ | [실값] |
| INV-5 005930 row >= 100 | ✅ | [실값] |
| INV-6 Schedulers ENABLED | ✅ | |
| --check-backfill row >= 4M | ✅ | [실값] |
| --check-backfill 005930 >= 1500 | ✅ | [실값] |
| --check-coverage missing_pct < 5 | ✅ | [실값]% |
| --check-completeness incomplete_count <= 4 | ✅ | [실값] |
| --check-scheduler eod cron 30 17 | ✅ | |
| --check-scheduler recover cron 10 8 | ✅ | |

## Sign-off

- [x] DATA-01 SC #1: stock_daily_ohlcv 테이블 + PK(code,date) + ~4M row
- [x] DATA-01 SC #2: 초기 백필 완료 — 2020-01-01 ~ {직전영업일}
- [x] DATA-01 SC #3: Cloud Run Job + Scheduler (`30 17` + `10 8`) ENABLED
- [x] DATA-01 SC #4: rate-limit/재시도/fail-isolation — 401 가드 + per-day try/catch + withRetry
- [x] DATA-01 SC #5: 결측 종목 < 5% + 결측 일자 ≤ 4 (smoke green)
```
  </action>

  <verify>
    <automated>grep -q "## Smoke Results" .planning/phases/09-daily-candle-data/09-DEPLOY-LOG.md && grep -q "INV-1.*✅" .planning/phases/09-daily-candle-data/09-DEPLOY-LOG.md && grep -q "INV-6.*✅" .planning/phases/09-daily-candle-data/09-DEPLOY-LOG.md && grep -q "check-coverage.*✅" .planning/phases/09-daily-candle-data/09-DEPLOY-LOG.md && grep -q "check-completeness.*✅" .planning/phases/09-daily-candle-data/09-DEPLOY-LOG.md && grep -cE "DATA-01 SC #[1-5]:.*\\[x\\]" .planning/phases/09-daily-candle-data/09-DEPLOY-LOG.md | grep -q '5'</automated>
  </verify>

  <acceptance_criteria>
    - `bash scripts/smoke-candle-sync.sh` exit 0 + `PASS: 6` 매치
    - `bash scripts/smoke-candle-sync.sh --check-backfill` exit 0
    - `bash scripts/smoke-candle-sync.sh --check-coverage` exit 0
    - `bash scripts/smoke-candle-sync.sh --check-completeness` exit 0
    - `bash scripts/smoke-candle-sync.sh --check-scheduler` exit 0
    - DEPLOY-LOG 에 `## Smoke Results` 섹션 + INV-1~6 + 4 check-* 모두 ✅
    - DATA-01 SC #1~5 모두 [x] 처리 (5개)
    - row count 실값 paste (>= 4,000,000)
    - 005930 row 실값 paste (>= 1,500)
  </acceptance_criteria>

  <done>Phase 9 모든 invariant + SC #5 임계 검증 완료. DEPLOY-LOG sign-off.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 5: ROADMAP SC #1 표현 갱신 (~2M → 실측, 3년치 → 2020-01-01~)</name>
  <files>.planning/ROADMAP.md</files>

  <read_first>
    - .planning/ROADMAP.md § "Phase 9: Daily Candle Data Collection" (현재 SC #1 = "약 ~2M 행")
    - .planning/phases/09-daily-candle-data/09-DEPLOY-LOG.md (Task 3/4 의 실측 row count)
    - .planning/phases/09-daily-candle-data/09-CONTEXT.md §D-06 (예상 ~4M 행)
  </read_first>

  <action>
1. `.planning/ROADMAP.md` 의 Phase 9 섹션을 read 하여 현재 SC #1 텍스트 확인:
```
1. 일봉 OHLCV 테이블(예: `stock_daily_ohlcv`)이 Supabase에 존재하고 PK=(code, date), 컬럼은 open/high/low/close/volume/trade_amount 포함, 약 ~2M 행을 보유한다
```

2. 다음으로 갱신 (실측 row count 와 정확한 백필 범위 반영):
```
1. 일봉 OHLCV 테이블 `stock_daily_ohlcv` 이 Supabase에 존재하고 PK=(code, date), 컬럼은 open/high/low/close/volume/trade_amount 포함, **~{실측값}M 행** (백필 범위 **2020-01-01 ~ {직전영업일}**) 을 보유한다
```

3. 또한 Phase 9 의 `**Plans**: TBD` 도 `**Plans:** 6 plans` 로 갱신 + plan 리스트 추가:
```
**Plans:** 6 plans
- [x] 09-01-PLAN.md — Wave 0 마이그레이션 SQL + StockDailyOhlcv 타입
- [x] 09-02-PLAN.md — Wave 0 candle-sync 워크스페이스 스캐폴드
- [x] 09-03-PLAN.md — Wave 1 KRX 클라이언트 + 파이프라인 + 4종 unit test
- [x] 09-04-PLAN.md — Wave 1 MODE dispatch (backfill/daily/recover) + bootstrapStocks + 4종 integration test
- [x] 09-05-PLAN.md — Wave 2 IAM + deploy 스크립트 + smoke + alert YAML
- [x] 09-06-PLAN.md — Wave 3 Wave 0 prerequisite + production push + 백필 + smoke + DEPLOY-LOG
```

4. Phase 9 의 상태 마커 `[ ]` → `[x]` (완료):
```
- [x] **Phase 9: Daily Candle Data** - KRX 전 종목 (2020-01-01~) 일봉 OHLCV 수집 + 영업일 증분 갱신
```

5. ROADMAP 의 Progress 표에서 `9. Daily Candle Data | 6/6 | Complete | YYYY-MM-DD` 로 갱신.

6. Traceability 표 (`.planning/REQUIREMENTS.md`) 의 `DATA-01 | Phase 9 | Pending` → `Complete` 로 갱신.
  </action>

  <verify>
    <automated>grep -E "2020-01-01" .planning/ROADMAP.md && grep -E "09-06-PLAN.md" .planning/ROADMAP.md && grep -E "^\- \[x\] \*\*Phase 9: Daily Candle Data" .planning/ROADMAP.md</automated>
  </verify>

  <acceptance_criteria>
    - ROADMAP.md Phase 9 SC #1 에 "2020-01-01" 매치 (3년치 표현 제거)
    - Phase 9 의 Plans 섹션이 6 plans 모두 나열 + 모두 [x]
    - Phase 9 phase header 가 `- [x]` (완료 마커)
    - Progress 표에 `9. Daily Candle Data | 6/6 | Complete` 매치
    - REQUIREMENTS.md Traceability 의 `DATA-01 | Phase 9 | Complete` 매치
  </acceptance_criteria>

  <done>ROADMAP + REQUIREMENTS 갱신 완료. Phase 9 공식 완료.</done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| KRX production AUTH_KEY → curl 실측 | 401/승인 미완 시 실측 실패 (Task 1) |
| Supabase production DB → 마이그레이션 push | 실패 시 부분 적용 위험 (Task 2) |
| Cloud Run / Scheduler / IAM → 사용자 권한 | gh-radar-deployer SA + IAM 권한 부족 시 deploy 실패 |
| 백필 4M row × 3시간 → KRX rate limit | 10,000 calls/day 한도 내 3,200 calls — 안전 |
| Backfill + daily Scheduler 동시 실행 | manual run-book (Scheduler pause) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-09-06 | DENIAL OF SERVICE | 백필 + daily Scheduler 동시 실행 race | mitigate | Task 3 의 manual run-book — 백필 시작 전 `gcloud scheduler jobs pause` 양 Scheduler, 백필 종료 후 resume. Job 3개 분리 + idempotent UPSERT + parallelism=1 이므로 실수로 resume 안 해도 데이터 손실 없음 (KRX rate limit 만 영향). |
| T-09-01.1 | DENIAL OF SERVICE | KRX bydd_trd 서비스 별도 승인 미완 (R0) | mitigate | Task 1 의 실측 호출 — 401 응답이면 사용자가 openapi.krx.co.kr 에서 `stk_bydd_trd` + `ksq_bydd_trd` 서비스 신청 (master-sync `isu_base_info` 와 별도 신청 필요 가능). 승인 1일 소요 — 백필 일정에 반영. |
| T-09-MIG-PUSH-01 | TAMPERING (마이그레이션 실패) | Task 2 production push | mitigate | 단일 BEGIN/COMMIT 트랜잭션 — 실패 시 자동 ROLLBACK. push 실패 시 STOP + 사용자 보고. autonomous:false. |
| T-09-BACKFILL-01 | DENIAL OF SERVICE | 백필 3h+ 소요 — task-timeout 10800s | mitigate | 만약 8h+ 소요로 timeout 시 BACKFILL_FROM 을 중단 시점으로 좁혀 재실행 (idempotent UPSERT 안전 — 중복 없음). Cloud Run Job task-timeout=10800s (3h) 가 RESEARCH §2.4 의 직렬 4.4h 추정과 충돌하지만 KOSPI/KOSDAQ Promise.all 병렬화로 ~3h 단축 가능. timeout 시 사용자 분할 실행. |

</threat_model>

<verification>
- Wave 0 prerequisite — fixture 2개 + 09-API-VERIFICATION.md 생성됨
- Supabase 마이그레이션 production push — `\d stock_daily_ohlcv` psql 출력 paste
- 3 Cloud Run Jobs + 2 Schedulers + 2 alert policies 생성됨 (gcloud 검증)
- 백필 완료 — row count >= 4M, 005930 >= 1500
- smoke INV-1~6 + 4개 --check-* 플래그 모두 PASS
- ROADMAP SC #1 표현 갱신 (2020-01-01 + 실측 row count)
- REQUIREMENTS.md DATA-01 status = Complete
- DEPLOY-LOG.md sign-off 완료 (5개 SC 모두 [x])
</verification>

<success_criteria>
- DATA-01 SC #1: stock_daily_ohlcv 테이블 production live + 4M+ row
- DATA-01 SC #2: 백필 1회 실행 + row >= 4M + 005930 >= 1500
- DATA-01 SC #3: Scheduler 2종 ENABLED + cron 정확
- DATA-01 SC #4: 401 가드 + MIN_EXPECTED + per-day 격리 + chunked UPSERT 모두 production 동작
- DATA-01 SC #5: 결측 종목 < 5% + 결측 일자 ≤ 4
- ROADMAP + REQUIREMENTS Phase 9 완료 마킹
</success_criteria>

<output>
After completion, create `.planning/phases/09-daily-candle-data/09-06-SUMMARY.md`
</output>
</content>
</invoke>
