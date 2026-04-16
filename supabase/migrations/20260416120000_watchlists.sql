-- ============================================================
-- Phase 06.2 Plan 02: 관심종목 스키마 + RLS + trigger (D-18~D-22, RESEARCH Pattern 3/9)
--   webapp 이 Supabase 를 직접 CRUD 하는 authenticated-role 영역.
--
-- 결정 근거:
--   D-18: watchlists(user_id, stock_code, added_at, position) — PK 복합 (중복 방지)
--   D-19: FK CASCADE — auth.users(id), stocks(code) 모두 ON DELETE CASCADE
--   D-20: 50-limit 은 BEFORE INSERT trigger — RLS subquery 는 infinite-recursion 위험 +
--         42501(타인 row) 와 42501(50 초과) 를 에러 코드로 구분 불가. trigger 는
--         P0001 + 'watchlist_limit_exceeded' 로 명확 분리 (RESEARCH Pattern 3).
--   D-21: position 컬럼은 v1 UI 미사용 (드래그 리오더 후속 phase).
--   D-22: RLS 4정책 (SELECT/INSERT/UPDATE/DELETE) 모두 auth.uid() = user_id.
--   Pitfall 3: stocks / stock_quotes 의 기존 anon SELECT 정책은 authenticated 역할 자동
--              상속 안 됨 → TO anon, authenticated 로 확장 (RESEARCH Pattern 9).
-- ============================================================

BEGIN;

-- ---------------------------------------------------------
-- Step 1. watchlists 테이블 (D-18 / D-19 / D-21)
--   PK (user_id, stock_code) 로 동일 사용자 중복 저장 방지
--   auth.users / stocks CASCADE — 사용자 탈퇴 시 본인 데이터 자동 정리
-- ---------------------------------------------------------
CREATE TABLE watchlists (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stock_code text NOT NULL REFERENCES stocks(code)   ON DELETE CASCADE,
  added_at   timestamptz NOT NULL DEFAULT now(),
  position   int,
  PRIMARY KEY (user_id, stock_code)
);

CREATE INDEX idx_watchlists_user_added_at
  ON watchlists (user_id, added_at DESC);

-- ---------------------------------------------------------
-- Step 2. RLS 활성화 + 4정책 (D-22)
--   WITH CHECK 에 subquery 금지 — 50-limit 은 Step 3 trigger 가 강제.
--   authenticated role 만 대상 — 비로그인(anon) 은 watchlists 접근 자체 불가.
-- ---------------------------------------------------------
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_own_watchlists"
  ON watchlists FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "auth_insert_own_watchlists"
  ON watchlists FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "auth_update_own_watchlists"
  ON watchlists FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "auth_delete_own_watchlists"
  ON watchlists FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------
-- Step 3. 50-limit BEFORE INSERT trigger (D-20, RESEARCH Pattern 3)
--   PostgreSQL MVCC 상 BEFORE INSERT 는 tuple lock 이후 실행 → race window 없음.
--   RAISE EXCEPTION '...' USING ERRCODE = 'P0001' 로 명확한 커스텀 에러.
--   Plan 07 클라이언트 측에서 error.code === 'P0001' + error.message === 'watchlist_limit_exceeded'
--   매칭으로 "한도 초과" 와 "타인 row 조작(42501)" 을 구분 처리.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_watchlist_limit()
RETURNS TRIGGER AS $$
DECLARE
  cnt int;
BEGIN
  SELECT count(*) INTO cnt FROM watchlists WHERE user_id = NEW.user_id;
  IF cnt >= 50 THEN
    RAISE EXCEPTION 'watchlist_limit_exceeded'
      USING HINT = '관심종목은 최대 50개까지 저장할 수 있습니다.',
            ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_watchlist_limit
  BEFORE INSERT ON watchlists
  FOR EACH ROW
  EXECUTE FUNCTION enforce_watchlist_limit();

-- ---------------------------------------------------------
-- Step 4. stocks / stock_quotes 기존 anon 정책을 authenticated 로 확장
--   (RESEARCH Pattern 9, Pitfall 3)
--   기존: CREATE POLICY "anon_read_stocks_master" ... TO anon USING (true);
--         CREATE POLICY "anon_read_stock_quotes"  ... TO anon USING (true);
--   변경: anon_ prefix 제거 + TO anon, authenticated 로 role 확장.
--   근거: authenticated 역할은 anon 정책 자동 상속 안 함 → 로그인 사용자가
--         watchlists JOIN stocks/stock_quotes 쿼리할 때 SELECT 차단당함.
--   주의: top_movers 의 anon_read_top_movers 는 건드리지 않음 — Scanner 는
--         Express /api/* 경유(service_role) 라서 anon 만으로 충분.
-- ---------------------------------------------------------
DROP POLICY "anon_read_stocks_master" ON stocks;
CREATE POLICY "read_stocks_master"
  ON stocks FOR SELECT TO anon, authenticated USING (true);

DROP POLICY "anon_read_stock_quotes" ON stock_quotes;
CREATE POLICY "read_stock_quotes"
  ON stock_quotes FOR SELECT TO anon, authenticated USING (true);

COMMIT;
