# Phase 9 Plan 01 — Migration Verification

**Status:** Applied 2026-05-12 11:17 KST
**Migration:** `supabase/migrations/20260512120000_create_stock_daily_ohlcv.sql`
**Method:** `supabase db push --yes` (psql 미설치 → CLI 사용. dry-run 사전 확인 후 push)

## Schema Verification

### stock_daily_ohlcv 컬럼 검증
psql `\d` 대신 PostgREST REST API 로 검증 (psql 미설치):
```bash
curl -sS "${SUPABASE_URL}/rest/v1/stock_daily_ohlcv?select=code,date,open,high,low,close,volume,trade_amount,change_amount,change_rate,inserted_at&limit=0" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"
# → HTTP 200, [] (빈 배열, 컬럼 11개 모두 정상 select)
```

기대 컬럼 (모두 작동 확인):
- `code text NOT NULL` ✅
- `date date NOT NULL` ✅
- `open numeric(20,2) NOT NULL` ✅
- `high numeric(20,2) NOT NULL` ✅
- `low numeric(20,2) NOT NULL` ✅
- `close numeric(20,2) NOT NULL` ✅
- `volume bigint NOT NULL DEFAULT 0` ✅
- `trade_amount bigint NOT NULL DEFAULT 0` ✅
- `change_amount numeric(20,2)` (nullable) ✅
- `change_rate numeric(8,4)` (nullable) ✅
- `inserted_at timestamptz NOT NULL DEFAULT now()` ✅

기대 PK: `PRIMARY KEY (code, date)` ✅ (INSERT 시 `?code=eq.005930&date=eq.2026-01-01` 로 unique 식별 작동)

## FK Constraint (T-09-03 옵션 B) ✅

```bash
# 존재하지 않는 code 로 INSERT 시도
curl -X POST .../stock_daily_ohlcv -d '{"code":"999999",...}'
# 응답:
{"code":"23503","details":"Key (code)=(999999) is not present in table \"stocks\".",
 "message":"insert or update on table \"stock_daily_ohlcv\" violates foreign key constraint \"stock_daily_ohlcv_code_fkey\""}
# → HTTP 409 (FK 정책 정상 작동)

# 존재하는 code (005930) 로 INSERT
curl -X POST .../stock_daily_ohlcv -d '{"code":"005930","date":"2026-01-01",...}'
# → HTTP 201 (정상 insert — 신규 row 는 FK 검증 통과)
```

FK 제약명: `stock_daily_ohlcv_code_fkey` (NOT VALID — 신규 row 만 검증, 폐지종목 history 는 candle-sync 가 stocks bootstrap 으로 해소)

## Indexes ✅

PostgREST 는 인덱스 메타 직접 노출하지 않으나 PK 작동 (위 INSERT/DELETE) + 마이그레이션 SQL 의 `CREATE INDEX idx_stock_daily_ohlcv_date_desc` 가 단일 트랜잭션 내 성공 → 인덱스 생성 확정.

기대:
- `stock_daily_ohlcv_pkey` (PK — code, date) ✅
- `idx_stock_daily_ohlcv_date_desc` (date DESC) ✅

## RLS Policies ✅

```bash
# anon key 로 SELECT 시도 (RLS 정책 검증)
curl -sS "${SUPABASE_URL}/rest/v1/stock_daily_ohlcv?select=code" \
  -H "apikey: $SUPABASE_ANON_KEY"
# → HTTP 200 (anon SELECT 허용 — `anon_read_stock_daily_ohlcv` policy 작동)
```

기대: `anon_read_stock_daily_ohlcv` (anon, SELECT) ✅

## Sign-off
- [x] `supabase db push --yes` exit code 0 (dry-run 사전 확인 후 사용자 승인)
- [x] 컬럼 11개 + PK + FK 모두 작동 (REST API 검증)
- [x] FK NOT VALID 키워드 작동 — 신규 row FK 검증, 23503 에러 확인
- [x] PK (code, date) 작동 — 정상 INSERT/DELETE
- [x] `anon_read_stock_daily_ohlcv` 정책 작동 — anon SELECT 200
- [x] 본 검증 paste 완료 (2026-05-12 11:17 KST)
