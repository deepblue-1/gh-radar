# Phase 9 Plan 01 — Migration Verification

**Status:** Draft (Plan 06 에서 production push 후 실값으로 갱신)
**Migration:** `supabase/migrations/20260512120000_create_stock_daily_ohlcv.sql`
**Method:** `supabase db push` (또는 `psql $SUPABASE_DB_URL -f ...`)

## Schema Verification (Plan 06 채움)

### stock_daily_ohlcv
[psql `\d stock_daily_ohlcv` 결과 paste — Plan 06 Task 1 실행 후]

기대 컬럼:
- `code text NOT NULL`
- `date date NOT NULL`
- `open numeric(20,2) NOT NULL`
- `high numeric(20,2) NOT NULL`
- `low numeric(20,2) NOT NULL`
- `close numeric(20,2) NOT NULL`
- `volume bigint NOT NULL DEFAULT 0`
- `trade_amount bigint NOT NULL DEFAULT 0`
- `change_amount numeric(20,2)` (nullable)
- `change_rate numeric(8,4)` (nullable)
- `inserted_at timestamptz NOT NULL DEFAULT now()`

기대 PK: `PRIMARY KEY (code, date)`
기대 FK: `stock_daily_ohlcv_code_fkey FOREIGN KEY (code) REFERENCES stocks(code) ON DELETE CASCADE NOT VALID`

## FK Constraint (T-09-03 옵션 B)
[`SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='stock_daily_ohlcv'::regclass AND contype='f';` 결과 paste]

기대: `NOT VALID` 키워드 포함 — 신규 row 만 검증, 폐지종목 history 는 candle-sync 가 stocks bootstrap 으로 해소.

## Indexes
[`SELECT indexname, indexdef FROM pg_indexes WHERE tablename='stock_daily_ohlcv';` 결과 paste]

기대:
- `stock_daily_ohlcv_pkey` (PK — code, date)
- `idx_stock_daily_ohlcv_date_desc` (date DESC)

## RLS Policies
[`SELECT tablename, policyname, roles, cmd FROM pg_policies WHERE tablename='stock_daily_ohlcv';` 결과 paste]

기대: `anon_read_stock_daily_ohlcv` (anon, SELECT)

## Sign-off (Plan 06 채움)
- [ ] `supabase db push` exit code 0
- [ ] psql `\d stock_daily_ohlcv` 모든 컬럼 + PK + FK 확인
- [ ] FK NOT VALID 키워드 확인
- [ ] `idx_stock_daily_ohlcv_date_desc` 인덱스 확인
- [ ] `anon_read_stock_daily_ohlcv` 정책 확인
- [ ] Plan 06 Task 1 의 [BLOCKING] task 가 본 검증 paste
