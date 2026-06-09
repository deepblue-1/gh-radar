-- ============================================================
-- Phase 10 Plan 02: themes + theme_stocks (시스템/유저 단일 테이블 + RLS + limit trigger)
--   THEME-01(수집) / THEME-03(유저 CRUD) 토대 — RESEARCH §Pattern 1 DDL 을
--   watchlists.sql 톤(BEGIN/COMMIT · owner-only RLS · P0001 limit trigger)으로 최종화.
--
-- 결정 근거:
--   D-01: 시스템(전역 read-only 스크랩) vs 유저(per-user CRUD) 를 **테이블 분리 없이**
--         단일 themes + (is_system 플래그 / owner_id NULL) 로 분기 — "충돌 0" 은 RLS 가 강제.
--         theme_stocks 조인 1개 유지(목록·종목 칩 UNION 회피, fork 가 INSERT-SELECT 로 단순).
--   D-02: 한 종목 = 여러 테마 (M:N). theme_stocks 조인.
--   D-03: 시스템 theme_stocks 는 source/confidence/effective_from/effective_to(편입·제외 이력) 보존.
--   D-04: 유저 테마 owner-only — watchlists 4정책 패턴 복제 + is_system=false 강제.
--
--   RLS 함정(Pitfall 3 / feedback_supabase_rls_authenticated):
--     공개 read 정책(read_system_themes / read_theme_stocks)은 TO anon, authenticated
--     둘 다 명시 — anon 만 쓰면 로그인(authenticated) 사용자가 default-deny 로 빈 응답.
--
--   limit trigger(watchlists enforce_watchlist_limit 복제, T-10-02-04):
--     유저 테마 종목수 50 cap = BEFORE INSERT trigger, P0001 + 커스텀 메시지.
--     RLS subquery 금지(infinite-recursion + 42501 구분 불가) → trigger 로 강제.
--     시스템 테마(워커 service_role)는 무제한.
--
--   threat register:
--     T-10-02-01 (정보노출): read_own_themes USING(owner_id=auth.uid()) — DB 레벨 격리
--     T-10-02-02 (위조):     insert/update/delete WITH CHECK(is_system=false) + 시스템 쓰기 service_role only
--     T-10-02-03 (권한상승): 공개 read 정책 TO anon, authenticated 둘 다 명시
--     T-10-02-04 (DoS):      enforce_user_theme_stock_limit / enforce_user_theme_count_limit (P0001, 50 cap)
-- ============================================================

BEGIN;

-- ---------------------------------------------------------
-- Step 1. themes — 시스템(owner_id NULL) + 유저(owner_id=auth.uid()) 통합 (D-01)
--   FK: owner_id → auth.users(id) ON DELETE CASCADE (watchlists 선례 — 탈퇴 시 본인 테마 정리)
--   CHECK themes_owner_consistency: 시스템이면 owner NULL, 유저면 owner NOT NULL (무결성)
-- ---------------------------------------------------------
CREATE TABLE themes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  is_system   boolean NOT NULL DEFAULT false,
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,  -- 시스템=NULL (owner_id uuid REFERENCES auth.users)
  -- 정규화 병합 키 (시스템 전용, §Pattern 4) — 동일 norm_key 끼리 1개 시스템 테마로 병합
  norm_key    text,
  -- 다중 출처 태그 (시스템): {naver, alphasquare, ai}. 유저 테마는 보통 {user}
  sources     text[] NOT NULL DEFAULT '{}',
  -- 정렬 precompute (§Pattern 5): 소속 종목 등락률 상위 3 평균 + 계산 시각
  top3_avg_change_rate numeric(10,4),
  stats_updated_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT themes_owner_consistency CHECK (
    (is_system AND owner_id IS NULL) OR (NOT is_system AND owner_id IS NOT NULL)
  )
);

-- 시스템 테마 norm_key 유니크 (병합 보장). 유저 테마는 norm_key NULL → partial unique 로 제외.
CREATE UNIQUE INDEX uq_themes_system_norm ON themes (norm_key) WHERE is_system;
CREATE INDEX idx_themes_owner ON themes (owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX idx_themes_system_sort
  ON themes (top3_avg_change_rate DESC NULLS LAST) WHERE is_system;

-- ---------------------------------------------------------
-- Step 2. theme_stocks — M:N + provenance (D-02 / D-03)
--   stock_code → stocks(code) ON DELETE CASCADE (존재 종목만; 상장폐지 시 자동 정리)
--   PK (theme_id, stock_code): 현재 편입 1행. 제외 이력은 effective_to 로 표현.
-- ---------------------------------------------------------
CREATE TABLE theme_stocks (
  theme_id     uuid NOT NULL REFERENCES themes(id)  ON DELETE CASCADE,
  stock_code   text NOT NULL REFERENCES stocks(code) ON DELETE CASCADE,  -- FK references stocks(code): 존재 종목만
  source       text NOT NULL DEFAULT 'naver',     -- naver|alphasquare|ai|user (shared ThemeStockSource)
  confidence   numeric(4,3),                       -- 0~1 (AI/스크랩 신뢰도, nullable)
  reason       text,                               -- 네이버 '편입 사유' info_txt (§Pattern 2)
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to   timestamptz,                      -- NULL=현재 편입중, 값=제외된 시점
  PRIMARY KEY (theme_id, stock_code)
);

CREATE INDEX idx_theme_stocks_code   ON theme_stocks (stock_code);          -- 종목 칩 역조회 (D-16)
CREATE INDEX idx_theme_stocks_active ON theme_stocks (theme_id) WHERE effective_to IS NULL;

-- ---------------------------------------------------------
-- Step 3. RLS — 시스템 read(전역) + 유저 owner-only CRUD (watchlists 선례)
--   ALTER ... ENABLE ROW LEVEL SECURITY 둘 다.
-- ---------------------------------------------------------
ALTER TABLE themes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme_stocks ENABLE ROW LEVEL SECURITY;

-- themes ----------------------------------------------------
-- 시스템 테마: 누구나 읽기 (anon + authenticated 둘 다 — Pitfall 3, T-10-02-03)
CREATE POLICY "read_system_themes"
  ON themes FOR SELECT TO anon, authenticated
  USING (is_system = true);

-- 유저 테마: 본인만 읽기 (T-10-02-01)
CREATE POLICY "read_own_themes"
  ON themes FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

-- 유저 테마: 본인만 생성 (is_system 강제 false — 시스템 위조 차단, T-10-02-02)
CREATE POLICY "insert_own_themes"
  ON themes FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND is_system = false);

-- 유저 테마: 본인만 수정 (소유 이전 / 시스템 승격 차단)
CREATE POLICY "update_own_themes"
  ON themes FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() AND is_system = false)
  WITH CHECK (owner_id = auth.uid() AND is_system = false);

-- 유저 테마: 본인만 삭제
CREATE POLICY "delete_own_themes"
  ON themes FOR DELETE TO authenticated
  USING (owner_id = auth.uid() AND is_system = false);

-- theme_stocks ----------------------------------------------
-- 부모 theme 의 가시성/소유를 따라감 (anon + authenticated — Pitfall 3, T-10-02-03)
CREATE POLICY "read_theme_stocks"
  ON theme_stocks FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM themes t
      WHERE t.id = theme_id
        AND (t.is_system OR t.owner_id = auth.uid())
    )
  );

-- 유저 테마 멤버십만 쓰기 가능 (시스템 멤버십 조작 차단, T-10-02-02)
--   주의: 시스템 theme_stocks 쓰기는 service_role(워커)만 — RLS bypass.
CREATE POLICY "write_own_theme_stocks"
  ON theme_stocks FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM themes t
      WHERE t.id = theme_id
        AND t.owner_id = auth.uid()
        AND NOT t.is_system
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM themes t
      WHERE t.id = theme_id
        AND t.owner_id = auth.uid()
        AND NOT t.is_system
    )
  );

-- ---------------------------------------------------------
-- Step 4. 유저 테마 종목수 50-limit BEFORE INSERT trigger (T-10-02-04)
--   watchlists.enforce_watchlist_limit 복제. NEW.theme_id 의 themes.is_system=false
--   일 때만 count >= 50 검사. 시스템 테마(워커 service_role)는 무제한.
--   RAISE EXCEPTION ... USING ERRCODE = 'P0001' → 클라이언트가 error.code 로
--   "한도 초과"(P0001) 와 "타인 row 조작"(42501) 을 구분 처리.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_user_theme_stock_limit()
RETURNS TRIGGER AS $$
DECLARE
  is_sys boolean;
  cnt    int;
BEGIN
  SELECT t.is_system INTO is_sys FROM themes t WHERE t.id = NEW.theme_id;

  -- 시스템 테마(워커) 또는 부모 부재(FK 가 별도 차단)면 limit 미적용
  IF is_sys IS DISTINCT FROM false THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO cnt
  FROM theme_stocks
  WHERE theme_id = NEW.theme_id AND effective_to IS NULL;

  IF cnt >= 50 THEN
    RAISE EXCEPTION 'user_theme_stock_limit_exceeded'
      USING HINT = '하나의 테마에는 최대 50개 종목까지 추가할 수 있습니다.',
            ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_user_theme_stock_limit
  BEFORE INSERT ON theme_stocks
  FOR EACH ROW
  EXECUTE FUNCTION enforce_user_theme_stock_limit();

-- ---------------------------------------------------------
-- Step 5. 유저 테마 개수 50-limit BEFORE INSERT trigger (T-10-02-04)
--   유저 1명당 본인 테마(is_system=false, owner_id=NEW.owner_id) 50개 cap.
--   시스템 테마(owner_id NULL / is_system=true)는 무제한.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_user_theme_count_limit()
RETURNS TRIGGER AS $$
DECLARE
  cnt int;
BEGIN
  -- 시스템 테마 INSERT(워커)는 limit 미적용
  IF NEW.is_system = true OR NEW.owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO cnt
  FROM themes
  WHERE owner_id = NEW.owner_id AND is_system = false;

  IF cnt >= 50 THEN
    RAISE EXCEPTION 'user_theme_count_limit_exceeded'
      USING HINT = '테마는 최대 50개까지 만들 수 있습니다.',
            ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_user_theme_count_limit
  BEFORE INSERT ON themes
  FOR EACH ROW
  EXECUTE FUNCTION enforce_user_theme_count_limit();

COMMIT;
